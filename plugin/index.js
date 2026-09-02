import crypto from 'node:crypto';

const PLUGIN = 'tale-fairy';
const VERSION = '0.11.149';
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

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isReasoningBlock(value) {
    const type = String(value?.type || '').toLowerCase();
    return type.includes('reasoning') || type.includes('thinking');
}

function finalBlockText(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(finalBlockText).filter(Boolean).join('');
    if (!isRecord(value) || isReasoningBlock(value)) return '';
    if (typeof value.text === 'string') return value.text;
    if (typeof value.text?.value === 'string') return value.text.value;
    if (typeof value.output_text === 'string') return value.output_text;
    if ([2, 3].includes(value.contract_version) || value.scene) return JSON.stringify(value);
    if (value.content !== undefined) return finalBlockText(value.content);
    return '';
}

function addCandidate(candidates, value) {
    const text = finalBlockText(value);
    if (text.trim()) candidates.push(text);
}

function completionText(payload) {
    if (typeof payload === 'string') return payload;
    const roots = [];
    const seen = new Set();
    const queue = [payload];
    while (queue.length && roots.length < 8) {
        const root = queue.shift();
        if (!isRecord(root) || seen.has(root)) continue;
        seen.add(root);
        roots.push(root);
        for (const key of ['data', 'response', 'result']) {
            if (isRecord(root[key])) queue.push(root[key]);
        }
    }

    const candidates = [];
    for (const root of roots) {
        for (const choice of Array.isArray(root.choices) ? root.choices : []) {
            const message = choice?.message;
            addCandidate(candidates, message?.content);
            for (const call of Array.isArray(message?.tool_calls) ? message.tool_calls : []) {
                addCandidate(candidates, call?.function?.arguments);
            }
            addCandidate(candidates, message?.function_call?.arguments);
            addCandidate(candidates, choice?.text);
        }
        for (const candidate of Array.isArray(root.candidates) ? root.candidates : []) {
            const parts = candidate?.content?.parts;
            if (Array.isArray(parts)) addCandidate(candidates, parts.filter(part => !part?.thought));
        }
        addCandidate(candidates, root.output_text);
        for (const item of Array.isArray(root.output) ? root.output : []) {
            if (isReasoningBlock(item)) continue;
            addCandidate(candidates, item?.content);
            addCandidate(candidates, item?.text);
        }
        addCandidate(candidates, root.message?.content);
        addCandidate(candidates, root.content);
        addCandidate(candidates, root.text);
        for (const result of Array.isArray(root.results) ? root.results : []) addCandidate(candidates, result?.text);
        if ([2, 3].includes(root.contract_version) || root.scene) addCandidate(candidates, root);
    }
    return candidates[0]?.trim() || '';
}

function streamCompletionText(payload) {
    const choice = payload?.choices?.[0];
    const choiceText = finalBlockText(choice?.delta?.content)
        || finalBlockText(choice?.message?.content)
        || finalBlockText(choice?.text);
    if (choiceText) return choiceText;
    if (payload?.type === 'response.output_text.delta' && typeof payload.delta === 'string') return payload.delta;
    const parts = payload?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) return parts.filter(part => !part?.thought).map(part => part?.text || '').join('');
    return '';
}

function jsonCompletionResponse(text) {
    return Buffer.from(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    }));
}

async function readEventStream(upstream, job, touchTimeout) {
    const decoder = new TextDecoder();
    let pending = '';
    let output = '';
    let fallbackRaw = '';
    let sawEventData = false;
    let sawReasoning = false;
    let exhaustedOutputBudget = false;
    let totalBytes = 0;

    const consume = (event) => {
        const dataLines = event.split(/\r?\n/).filter(line => line.startsWith('data:'));
        if (!dataLines.length) return;
        sawEventData = true;
        const data = dataLines
            .map(line => line.slice(5).trimStart())
            .join('\n')
            .trim();
        if (!data || data === '[DONE]') return;
        let payload;
        try { payload = JSON.parse(data); }
        catch { return; }
        if (payload?.error) throw new Error(payload.error?.message || String(payload.error));
        const choice = payload?.choices?.[0];
        const finishReason = String(choice?.finish_reason || payload?.finish_reason || '').toLowerCase();
        const incompleteReason = String(payload?.incomplete_details?.reason || payload?.response?.incomplete_details?.reason || '').toLowerCase();
        sawReasoning ||= Boolean(choice?.delta?.reasoning_content || choice?.delta?.reasoning)
            || isReasoningBlock(payload)
            || (Array.isArray(payload?.response?.output) && payload.response.output.some(isReasoningBlock));
        exhaustedOutputBudget ||= ['length', 'max_tokens', 'max_output_tokens'].includes(finishReason)
            || /(?:max.*(?:token|output)|token.*limit)/u.test(incompleteReason);
        const fragment = streamCompletionText(payload);
        if (fragment) output += fragment;
        else if (!output && /(?:completed|done)$/iu.test(String(payload?.type || ''))) output = completionText(payload);
    };

    for await (const chunk of upstream.body) {
        const bytes = Buffer.from(chunk);
        totalBytes += bytes.byteLength;
        if (totalBytes > MAX_RESPONSE_BYTES) throw new Error('Tale Fairy planner response exceeded the 32 MB safety limit.');
        job.receivedBytes = totalBytes;
        job.lastActivityAt = new Date().toISOString();
        touchTimeout();
        const decoded = decoder.decode(bytes, { stream: true });
        if (!sawEventData) fallbackRaw += decoded;
        pending += decoded;
        const events = pending.split(/\r?\n\r?\n/);
        pending = events.pop() || '';
        for (const event of events) consume(event);
        if (sawEventData) fallbackRaw = '';
    }
    const finalDecoded = decoder.decode();
    if (!sawEventData) fallbackRaw += finalDecoded;
    pending += finalDecoded;
    if (pending.trim()) consume(pending);
    return { text: output.trim(), fallbackRaw: sawEventData ? '' : fallbackRaw, sawReasoning, exhaustedOutputBudget };
}

function trimJobs() {
    const finished = [...jobs.values()]
        .filter(job => ['complete', 'error', 'cancelled'].includes(job.status))
        .sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));
    for (const job of finished.slice(MAX_FINISHED_JOBS)) jobs.delete(job.id);
}

async function run(job, res) {
    job.status = 'processing';
    let timer;
    const touchTimeout = () => {
        clearTimeout(timer);
        timer = setTimeout(() => job.controller.abort(new Error('Tale Fairy planner request timed out after ten minutes without data.')), REQUEST_TIMEOUT_MS);
    };
    touchTimeout();
    try {
        const upstream = await job.fetchImpl(job.backendUrl, {
            method: 'POST',
            headers: job.backendHeaders,
            body: JSON.stringify(job.request),
            signal: job.controller.signal,
        });
        const contentType = upstream.headers.get('content-type') || 'application/json';
        if (!upstream.ok) {
            const bytes = Buffer.from(await upstream.arrayBuffer());
            const raw = bytes.toString('utf8');
            throw Object.assign(new Error(`Planner backend returned HTTP ${upstream.status}: ${raw.slice(0, 500)}`), { status: upstream.status });
        }

        if (job.request.stream || /text\/event-stream/i.test(contentType)) {
            const streamed = await readEventStream(upstream, job, touchTimeout);
            job.text = streamed.text;
            let responseBytes;
            if (!job.text && streamed.fallbackRaw.trim()) {
                let payload;
                try { payload = JSON.parse(streamed.fallbackRaw); }
                catch { throw new Error('Planner backend returned neither an event stream nor JSON.'); }
                if (payload?.error) throw new Error(payload.error?.message || payload.error);
                job.text = completionText(payload);
                responseBytes = Buffer.from(streamed.fallbackRaw);
            }
            if (!job.text && streamed.exhaustedOutputBudget) throw new Error('Planner exhausted its output budget before producing final content.');
            if (!job.text && streamed.sawReasoning) throw new Error('Planner stream produced reasoning but completed without final content.');
            if (!job.text) throw new Error('Planner stream completed without final content.');
            job.status = 'complete';
            const bytes = responseBytes || jsonCompletionResponse(job.text);
            if (!res.destroyed && !res.headersSent) {
                res.status(upstream.status);
                res.setHeader('Content-Type', responseBytes ? contentType : 'application/json; charset=utf-8');
                res.setHeader('Cache-Control', 'no-store');
                res.setHeader('X-Tale-Fairy-Job-Id', job.id);
                res.setHeader('Access-Control-Expose-Headers', 'X-Tale-Fairy-Job-Id');
            }
            if (!res.destroyed && !res.writableEnded) res.end(bytes);
            return;
        }

        const bytes = Buffer.from(await upstream.arrayBuffer());
        if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error('Tale Fairy planner response exceeded the 32 MB safety limit.');
        const raw = bytes.toString('utf8');
        let payload;
        try { payload = raw ? JSON.parse(raw) : {}; }
        catch { throw new Error('Planner backend returned a non-JSON response.'); }
        if (payload?.error) throw new Error(payload.error?.message || payload.error);
        job.text = completionText(payload);
        if (!job.text) throw new Error('Planner completed without final content.');
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
            const backendPath = String(req.body?.backendPath || '/api/backends/chat-completions/generate');
            request.stream = backendPath === '/api/backends/chat-completions/generate';
            const backend = internalBackend(req, backendPath);
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
                receivedBytes: 0,
                lastActivityAt: null,
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
