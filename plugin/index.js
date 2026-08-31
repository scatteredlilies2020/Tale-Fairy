import crypto from 'node:crypto';

const PLUGIN = 'tale-fairy';
const VERSION = '0.11.99';
const jobs = new Map();
const MAX_FINISHED_JOBS = 40;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const ALLOWED_BACKENDS = new Set([
    '/api/backends/chat-completions/generate',
    '/api/backends/text-completions/generate',
    '/api/backends/kobold/generate',
    '/api/backends/koboldhorde/generate',
]);

export const info = {
    id: PLUGIN,
    name: 'Tale Fairy',
    description: 'Browser-independent Tale Fairy planner jobs.',
};

function belongsTo(req, job) {
    return Boolean(job && job.userRoot === req.user.directories.root);
}

function publicJob(job) {
    return {
        id: job.id,
        chatId: job.chatId,
        runKey: job.runKey,
        status: job.status,
        meta: job.meta,
        text: job.status === 'complete' ? job.text : '',
        error: job.error || '',
        acknowledged: Boolean(job.acknowledged),
        createdAt: job.createdAt,
        completedAt: job.completedAt || null,
    };
}

function internalBackend(req, requestedPath) {
    const port = Number(req.socket?.localPort);
    if (!Number.isInteger(port) || port <= 0) {
        throw Object.assign(new Error('Could not resolve the SillyTavern server port.'), { status: 500 });
    }
    const headers = { 'Content-Type': 'application/json' };
    for (const name of ['cookie', 'x-csrf-token', 'authorization']) {
        if (req.headers[name]) headers[name] = req.headers[name];
    }
    const backendPath = String(requestedPath || '/api/backends/chat-completions/generate');
    if (!ALLOWED_BACKENDS.has(backendPath)) {
        throw Object.assign(new Error('Unsupported SillyTavern planner backend.'), { status: 400 });
    }
    return { url: `http://127.0.0.1:${port}${backendPath}`, headers };
}

function contentText(value) {
    if (typeof value === 'string') return value;
    if (!Array.isArray(value)) return '';
    return value.map(item => typeof item === 'string' ? item : item?.text || item?.content || '').join('');
}

function completionText(payload) {
    const choice = payload?.choices?.[0];
    const direct = contentText(choice?.message?.content) || contentText(choice?.text);
    if (direct) return direct.trim();
    const parts = payload?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
        const text = parts.filter(part => !part?.thought).map(part => part?.text || '').join('');
        if (text.trim()) return text.trim();
    }
    const resultText = payload?.results?.[0]?.text ?? payload?.data?.[0]?.text;
    if (typeof resultText === 'string' && resultText.trim()) return resultText.trim();
    if (typeof payload?.text === 'string' && payload.text.trim()) return payload.text.trim();
    return '';
}

function trimJobs() {
    const finished = [...jobs.values()]
        .filter(job => ['complete', 'error', 'cancelled'].includes(job.status))
        .sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));
    for (const job of finished.slice(MAX_FINISHED_JOBS)) jobs.delete(job.id);
}

async function run(job, res) {
    job.status = 'processing';
    const timer = setTimeout(() => job.controller.abort(new Error('Tale Fairy planner request timed out.')), REQUEST_TIMEOUT_MS);
    try {
        const upstream = await job.fetchImpl(job.backendUrl, {
            method: 'POST',
            headers: job.backendHeaders,
            body: JSON.stringify(job.request),
            signal: job.controller.signal,
        });
        const bytes = Buffer.from(await upstream.arrayBuffer());
        if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error('Tale Fairy planner response exceeded the 32 MB safety limit.');
        const contentType = upstream.headers.get('content-type') || 'application/json';
        const raw = bytes.toString('utf8');
        if (!upstream.ok) throw Object.assign(new Error(`Planner backend returned HTTP ${upstream.status}: ${raw.slice(0, 500)}`), { status: upstream.status });
        let payload;
        try { payload = raw ? JSON.parse(raw) : {}; }
        catch { throw new Error('Planner backend returned a non-JSON response.'); }
        if (payload?.error) throw new Error(payload.error?.message || payload.error);
        job.text = completionText(payload);
        if (!job.text) throw new Error('Planner completed without a recoverable response.');
        job.status = 'complete';
        if (!res.destroyed && !res.headersSent) {
            res.status(upstream.status);
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('X-Tale-Fairy-Job-Id', job.id);
            res.setHeader('Access-Control-Expose-Headers', 'X-Tale-Fairy-Job-Id');
        }
        if (!res.destroyed && !res.writableEnded) res.end(bytes);
    } catch (error) {
        job.status = job.cancelled || error?.name === 'AbortError' ? 'cancelled' : 'error';
        job.error = job.status === 'cancelled' ? 'Planner job cancelled.' : error.message || String(error);
        if (!res.destroyed && !res.headersSent) res.status(Number(error.status) || 500).json({ error: job.error });
        else if (!res.destroyed && !res.writableEnded) res.end();
    } finally {
        clearTimeout(timer);
        job.completedAt = new Date().toISOString();
        job.request = null;
        job.backendHeaders = null;
        trimJobs();
    }
}

function sendError(res, error) {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error(`[${PLUGIN}]`, error);
    res.status(status).json({ ok: false, error: error.message || String(error) });
}

export async function init(router, { fetchImpl = fetch } = {}) {
    router.get('/health', (_req, res) => {
        res.json({ ok: true, plugin: PLUGIN, version: VERSION, detachedPlanner: true });
    });

    router.post('/planner-jobs/generate', async (req, res) => {
        try {
            const request = req.body?.request;
            const suppliedMeta = req.body?.meta;
            if (!request || typeof request !== 'object' || Array.isArray(request)
                || !suppliedMeta || typeof suppliedMeta !== 'object'
                || !String(suppliedMeta.chatId || '') || !String(suppliedMeta.runKey || '')) {
                throw Object.assign(new Error('Detached planning requires a request, chat id, and run key.'), { status: 400 });
            }
            delete request._taleFairyPlanner;
            request.stream = false;
            const backend = internalBackend(req, req.body?.backendPath);
            const meta = {
                chatId: String(suppliedMeta.chatId),
                runKey: String(suppliedMeta.runKey),
                fingerprint: String(suppliedMeta.fingerprint || ''),
                messageCount: Math.max(0, Number(suppliedMeta.messageCount) || 0),
                allowOneUserAppend: Boolean(suppliedMeta.allowOneUserAppend),
                rebuild: Boolean(suppliedMeta.rebuild),
                mode: String(suppliedMeta.mode || 'balanced'),
                plannerSeed: Math.max(0, Number(suppliedMeta.plannerSeed) || 0),
                analysisSelection: suppliedMeta.analysisSelection && typeof suppliedMeta.analysisSelection === 'object' ? suppliedMeta.analysisSelection : {},
                userNote: suppliedMeta.userNote && typeof suppliedMeta.userNote === 'object' ? suppliedMeta.userNote : null,
                summaryEvidence: suppliedMeta.summaryEvidence && typeof suppliedMeta.summaryEvidence === 'object' ? suppliedMeta.summaryEvidence : {},
            };
            const job = {
                id: crypto.randomUUID(),
                userRoot: req.user.directories.root,
                chatId: meta.chatId,
                runKey: meta.runKey,
                meta,
                request,
                backendUrl: backend.url,
                backendHeaders: backend.headers,
                fetchImpl,
                controller: new AbortController(),
                status: 'queued',
                text: '',
                error: '',
                acknowledged: false,
                cancelled: false,
                createdAt: new Date().toISOString(),
                completedAt: null,
            };
            jobs.set(job.id, job);
            await run(job, res);
        } catch (error) {
            sendError(res, error);
        }
    });

    router.get('/planner-jobs', (req, res) => {
        const chatId = String(req.query.chatId || '');
        const result = [...jobs.values()]
            .filter(job => belongsTo(req, job) && !job.acknowledged && (!chatId || job.chatId === chatId))
            .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
            .map(publicJob);
        res.json({ ok: true, jobs: result });
    });

    router.get('/planner-jobs/:id', (req, res) => {
        const job = jobs.get(String(req.params.id || ''));
        if (!belongsTo(req, job)) return res.status(404).json({ ok: false, error: 'Detached planner job not found.' });
        res.json({ ok: true, job: publicJob(job) });
    });

    router.post('/planner-jobs/:id/ack', (req, res) => {
        const job = jobs.get(String(req.params.id || ''));
        if (!belongsTo(req, job)) return res.status(404).json({ ok: false, error: 'Detached planner job not found.' });
        job.acknowledged = true;
        res.json({ ok: true, job: publicJob(job) });
    });

    router.delete('/planner-jobs/:id', (req, res) => {
        const job = jobs.get(String(req.params.id || ''));
        if (!belongsTo(req, job)) return res.status(404).json({ ok: false, error: 'Detached planner job not found.' });
        job.cancelled = true;
        job.controller.abort();
        res.json({ ok: true, job: publicJob(job) });
    });

    console.log(`[${PLUGIN}] v${VERSION} initialized`);
}

export async function exit() {
    for (const job of jobs.values()) job.controller.abort();
    console.log(`[${PLUGIN}] stopped`);
}
