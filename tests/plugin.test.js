import assert from 'node:assert/strict';
import test from 'node:test';

import { init } from '../plugin/index.js';

function routerMock() {
    const routes = new Map();
    return {
        routes,
        get(path, handler) { routes.set(`GET ${path}`, handler); },
        post(path, handler) { routes.set(`POST ${path}`, handler); },
        delete(path, handler) { routes.set(`DELETE ${path}`, handler); },
    };
}

function responseMock({ destroyed = false } = {}) {
    return {
        destroyed,
        writableEnded: false,
        headersSent: false,
        statusCode: 200,
        headers: {},
        status(value) { this.statusCode = value; return this; },
        setHeader(name, value) { this.headers[name] = value; },
        end(value) { this.value = value; this.writableEnded = true; return this; },
        json(value) { this.payload = value; this.headersSent = true; this.end(JSON.stringify(value)); return this; },
    };
}

function request(body = {}, extras = {}) {
    return {
        body,
        params: extras.params || {},
        query: extras.query || {},
        headers: { cookie: 'session=test', 'x-csrf-token': 'csrf' },
        socket: { localPort: 8000 },
        user: { directories: { root: '/test-user' } },
    };
}

function plannerBody(runKey = 'run-1') {
    return {
        request: { stream: false, model: 'gemini-test', _taleFairyPlanner: { secret: 'remove-me' } },
        meta: {
            chatId: 'chat-1',
            runKey,
            fingerprint: 'abc',
            messageCount: 3,
            allowOneUserAppend: true,
            allowOneAssistantAppend: true,
            plannerSeed: 42,
            transcriptHead: { authoritative_assistant_status: 'Time = 01:10 PM' },
            analysisSelection: { source: 'profile', model: 'gemini-test' },
        },
    };
}

function campaignBody(runKey) {
    const body = plannerBody(runKey);
    body.meta.chatId = 'campaign-chat';
    body.meta.campaign = { version: 1, input: { prompt: 'Synthetic RP' },
        source: { chatId: 'campaign-chat', referenceHash: 'ref', messageCount: 3, fingerprint: 'abc' },
        stateFingerprint: 'state', requestSignature: 'settings' };
    return body;
}

function inspectJob(router, id) {
    const res = responseMock();
    router.routes.get('GET /planner-jobs/:id')(request({}, { params: { id } }), res);
    return res.payload.job;
}

async function untilJob(router, id, predicate) {
    for (let n = 0; n < 100; n++) {
        const job = inspectJob(router, id);
        if (predicate(job)) return job;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.fail('Server job did not reach expected state.');
}

test('campaign submission is acknowledged immediately; reconnect deduplicates and idle polling never generates', async () => {
    let release, calls = 0;
    const router = routerMock();
    await init(router, { fetchImpl: () => { calls++; return new Promise(resolve => { release = resolve; }); } });
    const first = responseMock();
    await router.routes.get('POST /planner-jobs/generate')(request(campaignBody('campaign-dedup')), first);
    assert.equal(first.statusCode, 202);
    assert.equal(first.payload.job.status, 'processing');
    const id = first.payload.job.id;
    const second = responseMock();
    await router.routes.get('POST /planner-jobs/generate')(request(campaignBody('campaign-dedup')), second);
    assert.equal(second.payload.job.id, id);
    assert.equal(calls, 1);
    release(new Response(JSON.stringify({ choices: [{ message: { content: 'Synthetic completed plan' } }] })));
    const result = await untilJob(router, id, job => job.status === 'complete');
    assert.equal(result.text, 'Synthetic completed plan');
    assert.deepEqual(result.meta.campaign, campaignBody('x').meta.campaign);
    for (let i = 0; i < 5; i++) inspectJob(router, id);
    assert.equal(calls, 1);
    assert.equal(result.request, undefined);
    assert.equal(result.backendHeaders, undefined);
});

test('server advertises future jobs and preserves their separate owner through recovery', async () => {
    const router = routerMock();
    await init(router, { fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"upsert":[],"retain":[],"retire":[]}' } }] })) });
    const health = responseMock();
    router.routes.get('GET /health')(request(), health);
    assert.equal(health.payload.futureJobs, 1);
    const body = campaignBody('future-owner-roundtrip'); body.meta.campaign.kind = 'future';
    const res = responseMock();
    await router.routes.get('POST /planner-jobs/generate')(request(body), res);
    assert.equal(res.statusCode, 202);
    const result = await untilJob(router, res.payload.job.id, job => job.status === 'complete');
    assert.equal(result.meta.campaign.kind, 'future');
    assert.equal(result.meta.campaign.stateFingerprint, 'state');
    body.meta.runKey = 'invalid-owner'; body.meta.campaign.kind = 'unrelated';
    const invalid = responseMock();
    await router.routes.get('POST /planner-jobs/generate')(request(body), invalid);
    assert.equal(invalid.statusCode, 400);
});

test('a pending campaign recovers after a long outage and completed submissions never generate twice', async () => {
    const router = routerMock();
    let calls = 0;
    await init(router, { retryDelays: [1, 1], fetchImpl: async () => {
        calls++;
        return calls <= 7 ? calls % 2 ? new Response('offline', { status: 503 }) : new Response('{"error":true}')
            : new Response(JSON.stringify({ choices: [{ message: { content: 'saved plan' }, finish_reason: 'stop' }] }));
    } });
    const body = campaignBody('outage-then-reuse'), first = responseMock();
    await router.routes.get('POST /planner-jobs/generate')(request(body), first);
    const job = await untilJob(router, first.payload.job.id, job => job.status === 'complete');
    assert.equal(calls, 8);
    assert.equal(job.maxAttempts, null);
    for (let n = 0; n < 4; n++) {
        const again = responseMock();
        await router.routes.get('POST /planner-jobs/generate')(request(campaignBody('outage-then-reuse')), again);
        assert.equal(again.payload.job.id, job.id);
        assert.equal(again.payload.job.text, 'saved plan');
    }
    assert.equal(calls, 8);
});

test('server retries pending campaign after temporary failures without any browser; bounded at three requests', async () => {
    for (const succeeds of [true, false]) {
        let calls = 0;
        const router = routerMock();
        await init(router, { maxNetworkAttempts: 3, retryDelays: [1, 1], fetchImpl: async () => {
            calls++;
            return succeeds && calls === 3
                ? new Response(JSON.stringify({ choices: [{ message: { content: 'done' } }] }))
                : new Response('temporarily unavailable', { status: 503 });
        } });
        const res = responseMock();
        await router.routes.get('POST /planner-jobs/generate')(request(campaignBody(`campaign-retry-${succeeds}`)), res);
        const job = await untilJob(router, res.payload.job.id, job => ['complete', 'error'].includes(job.status));
        assert.equal(calls, 3);
        assert.equal(job.attempts, 3);
        assert.equal(job.status, succeeds ? 'complete' : 'error');
        assert.equal(job.retryAt, null);
        await new Promise(resolve => setTimeout(resolve, 15));
        assert.equal(calls, 3, 'terminal failure is not an idle review loop');
    }
});

test('explicit server stop cancels a retry wait, including a repeated submission', async () => {
    let calls = 0;
    const router = routerMock();
    await init(router, { maxNetworkAttempts: 3, retryDelays: [100, 100], fetchImpl: async () => { calls++; return new Response('', { status: 429 }); } });
    const res = responseMock(), body = campaignBody('campaign-stop');
    await router.routes.get('POST /planner-jobs/generate')(request(body), res);
    const id = res.payload.job.id;
    await untilJob(router, id, job => job.status === 'retry_wait');
    router.routes.get('DELETE /planner-jobs/:id')(request({}, { params: { id } }), responseMock());
    const repeated = responseMock();
    await router.routes.get('POST /planner-jobs/generate')(request(body), repeated);
    assert.equal(repeated.payload.job.status, 'cancelled');
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.equal(calls, 1);
});

test('server timeout can retry before output; auth, invalid output and partial streams cannot', async () => {
    const router = routerMock();
    let calls = 0;
    await init(router, { maxNetworkAttempts: 3, retryDelays: [1, 1], requestTimeoutMs: 2, fetchImpl: async (_url, { signal }) => {
        if (++calls === 1) return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
        return new Response(JSON.stringify({ choices: [{ message: { content: 'done' } }] }));
    } });
    const res = responseMock();
    await router.routes.get('POST /planner-jobs/generate')(request(campaignBody('campaign-timeout')), res);
    await untilJob(router, res.payload.job.id, job => job.status === 'complete');
    assert.equal(calls, 2);

    for (const [name, response] of [
        ['auth', () => new Response('unauthorized', { status: 401 })],
        ['settings', () => new Response('invalid model', { status: 400 })],
        ['invalid', () => new Response('not JSON')],
        ['truncated', () => new Response(JSON.stringify({ choices: [{ message: { content: '{}' }, finish_reason: 'length' }] }))],
        ['partial', () => new Response(new ReadableStream({ start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'));
            setTimeout(() => controller.error(new TypeError('terminated')), 2);
        } }), { headers: { 'Content-Type': 'text/event-stream' } })],
    ]) {
        let count = 0;
        const local = routerMock();
        await init(local, { maxNetworkAttempts: 3, retryDelays: [1, 1], fetchImpl: async () => { count++; return response(); } });
        const result = responseMock();
        await local.routes.get('POST /planner-jobs/generate')(request(campaignBody(`campaign-no-retry-${name}`)), result);
        const job = await untilJob(local, result.payload.job.id, job => job.status === 'error');
        assert.equal(job.attempts, name === 'partial' ? 3 : 1, name);
        assert.equal(count, name === 'partial' ? 3 : 1, name);
    }
});

test('timeout retries an adapter that ignores abort, and its late response cannot replace the new attempt', async () => {
    const router = routerMock(), releases = [], signals = [];
    await init(router, { maxNetworkAttempts: 3, retryDelays: [1, 1], requestTimeoutMs: 80, fetchImpl: (_url, { signal }) => {
        signals.push(signal);
        return new Promise(resolve => releases.push(resolve));
    } });
    const res = responseMock();
    await router.routes.get('POST /planner-jobs/generate')(request(campaignBody('ignores-abort')), res);
    const id = res.payload.job.id;
    await untilJob(router, id, job => job.status === 'processing' && job.attempts === 2);
    assert.equal(signals[0].reason.name, 'TimeoutError');
    releases[0](new Response('{"choices":[{"message":{"content":"obsolete draft"}}]}'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(inspectJob(router, id).status, 'processing');
    assert.equal(inspectJob(router, id).text, '');
    releases[1](new Response('{"choices":[{"message":{"content":"fresh draft"}}]}'));
    const job = await untilJob(router, id, job => job.status === 'complete');
    assert.equal(job.text, 'fresh draft');
    assert.equal(job.attempts, 2);
    assert.equal(job.maxAttempts, 3);
    assert.equal(job.attemptDeadlineAt, undefined, 'active responses have no total-duration cutoff');
    assert.equal(job.inactivityTimeoutMs, 80);
});

for (const kind of ['partial-stream', 'partial-json', 'heartbeat']) {
    test(`a stalled ${kind} is discarded and retried after inactivity`, async t => {
        const router = routerMock();
        let calls = 0, body, heartbeat;
        t.after(() => {
            clearInterval(heartbeat);
            try { body?.close(); } catch { /* Aborted iterators may already have cancelled the body. */ }
        });
        await init(router, { maxNetworkAttempts: 3, retryDelays: [1, 1], requestTimeoutMs: 20, fetchImpl: async (_url, { signal }) => {
                if (++calls > 1) return new Response('{"choices":[{"message":{"content":"complete replacement"}}]}');
                return new Response(new ReadableStream({ start(controller) {
                    body = controller;
                    const fragment = kind === 'partial-json' ? '{"choices":['
                        : kind === 'partial-stream' ? 'data: {"choices":[{"delta":{"content":"discard me"}}]}\n\n' : ': keepalive\n\n';
                    controller.enqueue(new TextEncoder().encode(fragment));
                    if (kind === 'heartbeat') heartbeat = setInterval(() => {
                        if (signal.aborted) clearInterval(heartbeat);
                        else controller.enqueue(new TextEncoder().encode(': ping\n\n'));
                    }, 5);
                } }), { headers: { 'Content-Type': kind === 'partial-json' ? 'application/json' : 'text/event-stream' } });
            } });
        const payload = campaignBody(`stalled-${kind}`);
        if (kind === 'partial-json') payload.backendPath = '/api/backends/text-completions/generate';
        const res = responseMock();
        await router.routes.get('POST /planner-jobs/generate')(request(payload), res);
        const job = await untilJob(router, res.payload.job.id, job => job.status === 'complete');
        assert.equal(job.attempts, 2);
        assert.equal(calls, 2);
        assert.equal(job.text, 'complete replacement');
    });
}

test('unresponsive attempts exhaust three tries and a deduplicated submission cannot start more', async () => {
    const router = routerMock();
    let calls = 0;
    await init(router, { maxNetworkAttempts: 3, retryDelays: [1, 1], requestTimeoutMs: 10, fetchImpl: () => { calls++; return new Promise(() => {}); } });
    const body = campaignBody('hung-exhausted'), res = responseMock();
    await router.routes.get('POST /planner-jobs/generate')(request(body), res);
    const job = await untilJob(router, res.payload.job.id, job => job.status === 'error');
    assert.equal(job.attempts, 3);
    assert.equal(calls, 3);
    assert.match(job.error, /timed out/);
    const repeated = responseMock();
    await router.routes.get('POST /planner-jobs/generate')(request(body), repeated);
    assert.equal(repeated.payload.job.id, job.id);
    assert.equal(repeated.payload.job.status, 'error');
    assert.equal(calls, 3);
});

test('ongoing content can take longer than the inactivity timeout without being cut off or retried', async t => {
    const router = routerMock();
    let calls = 0, interval;
    t.after(() => clearInterval(interval));
    await init(router, { requestTimeoutMs: 60, retryDelays: [1, 1], fetchImpl: async () => {
        calls++;
        return new Response(new ReadableStream({ start(controller) {
            let fragments = 0;
            interval = setInterval(() => {
                controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"part "}}]}\n\n'));
                if (++fragments === 6) { clearInterval(interval); controller.close(); }
            }, 20);
        } }), { headers: { 'Content-Type': 'text/event-stream' } });
    } });
    const res = responseMock();
    await router.routes.get('POST /planner-jobs/generate')(request(campaignBody('healthy-long-stream')), res);
    const job = await untilJob(router, res.payload.job.id, job => job.status === 'complete');
    assert.equal(calls, 1);
    assert.equal(job.attempts, 1);
    assert.equal(job.text, 'part '.repeat(6).trim());
    assert.equal(job.attemptDeadlineAt, undefined);
});

test('Stop releases an unresponsive active request without retrying', async () => {
    const router = routerMock();
    let calls = 0;
    await init(router, { maxNetworkAttempts: 3, retryDelays: [1, 1], requestTimeoutMs: 10, fetchImpl: () => { calls++; return new Promise(() => {}); } });
    const res = responseMock();
    await router.routes.get('POST /planner-jobs/generate')(request(campaignBody('hung-stop')), res);
    const id = res.payload.job.id;
    router.routes.get('DELETE /planner-jobs/:id')(request({}, { params: { id } }), responseMock());
    const job = await untilJob(router, id, job => job.status === 'cancelled' && job.completedAt);
    assert.equal(job.attempts, 1);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(calls, 1);
});

test('interrupted partial non-stream responses retry without treating the draft as complete', async () => {
    const router = routerMock();
    let calls = 0;
    await init(router, { maxNetworkAttempts: 3, retryDelays: [1, 1], fetchImpl: async () => {
        calls++;
        return new Response(new ReadableStream({ start(controller) {
            controller.enqueue(new TextEncoder().encode('{"choices":['));
            setTimeout(() => controller.error(new TypeError('terminated')), 2);
        } }));
    } });
    const body = campaignBody('nonstream-partial');
    body.backendPath = '/api/backends/text-completions/generate';
    const res = responseMock();
    await router.routes.get('POST /planner-jobs/generate')(request(body), res);
    await untilJob(router, res.payload.job.id, job => job.status === 'error');
    assert.equal(calls, 3);
});

test('a late response cannot resurrect explicitly cancelled server work', async () => {
    const router = routerMock();
    let release;
    await init(router, { fetchImpl: () => new Promise(resolve => { release = resolve; }) });
    const res = responseMock();
    await router.routes.get('POST /planner-jobs/generate')(request(campaignBody('late-after-stop')), res);
    const id = res.payload.job.id;
    router.routes.get('DELETE /planner-jobs/:id')(request({}, { params: { id } }), responseMock());
    release(new Response('{"choices":[{"message":{"content":"late"}}]}'));
    await new Promise(resolve => setImmediate(resolve));
    const job = await untilJob(router, id, job => job.status === 'cancelled');
    assert.equal(job.text, '');
    assert.equal(job.attempts, 1);
});

test('planner finishes on the server and remains recoverable after the browser disappears', async () => {
    let forwarded;
    const payload = { candidates: [{ content: { parts: [{ text: '{"contract_version":2}' }] } }] };
    const router = routerMock();
    await init(router, {
        fetchImpl: async (_url, options) => {
            forwarded = JSON.parse(options.body);
            return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
        },
    });
    const downstream = responseMock({ destroyed: true });
    await router.routes.get('POST /planner-jobs/generate')(request(plannerBody()), downstream);

    assert.equal(forwarded._taleFairyPlanner, undefined);
    assert.equal(forwarded.stream, true);
    const listed = responseMock();
    router.routes.get('GET /planner-jobs')(request({}, { query: { chatId: 'chat-1' } }), listed);
    assert.equal(listed.payload.jobs.length, 1);
    assert.equal(listed.payload.jobs[0].status, 'complete');
    assert.equal(listed.payload.jobs[0].text, '{"contract_version":2}');
    assert.equal(listed.payload.jobs[0].meta.allowOneAssistantAppend, true);
    assert.equal(listed.payload.jobs[0].meta.transcriptHead.authoritative_assistant_status, 'Time = 01:10 PM');
});

test('successful live response is unchanged and can be acknowledged after metadata is saved', async () => {
    const payload = { choices: [{ message: { content: '{"contract_version":2}' } }] };
    const router = routerMock();
    await init(router, { fetchImpl: async () => new Response(JSON.stringify(payload), { status: 200 }) });
    const downstream = responseMock();
    await router.routes.get('POST /planner-jobs/generate')(request(plannerBody('run-2')), downstream);

    assert.deepEqual(JSON.parse(Buffer.from(downstream.value).toString('utf8')), payload);
    const id = downstream.headers['X-Tale-Fairy-Job-Id'];
    assert.ok(id);
    const acknowledged = responseMock();
    router.routes.get('POST /planner-jobs/:id/ack')(request({}, { params: { id } }), acknowledged);
    assert.equal(acknowledged.payload.job.acknowledged, true);
});

test('complete-looking JSON cannot lose its truncation signal through detached streaming or recovery', async () => {
    const text = '{"campaign":"Looks complete","developments":[]}';
    const forms = [
        { stream: true, body: `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n` },
        { stream: true, body: JSON.stringify({ choices: [{ message: { content: text }, finish_reason: 'length' }] }) },
        { stream: false, body: JSON.stringify({ response: { status: 'incomplete', output_text: text } }) },
    ];
    for (let i = 0; i < forms.length; i++) {
        const form = forms[i], router = routerMock();
        let calls = 0;
        await init(router, { fetchImpl: async () => { calls++; return new Response(form.body, { status: 200 }); } });
        const body = plannerBody(`truncated-nonempty-${i}`);
        if (!form.stream) body.backendPath = '/api/backends/text-completions/generate';
        const downstream = responseMock();
        await router.routes.get('POST /planner-jobs/generate')(request(body), downstream);
        assert.equal(calls, 1);
        assert.equal(downstream.statusCode, 500);
        const listed = responseMock();
        router.routes.get('GET /planner-jobs')(request({}, { query: { chatId: 'chat-1' } }), listed);
        const job = listed.payload.jobs.find(job => job.runKey === body.meta.runKey);
        assert.equal(job.status, 'error');
        assert.equal(job.text, '', 'never expose rejected output through the recoverable result field');
        assert.equal(job.rejectedText, text, 'retain rejected final text separately for inspection');
        assert.match(job.error, /truncated/);
    }
});

test('modern structured results and review tiers survive detached recovery', async () => {
    for (const contractVersion of [12, 13, 14]) {
        const payload = { contract_version: contractVersion, audit: 'Mock structured planner result.' };
        const router = routerMock();
        await init(router, { fetchImpl: async () => new Response(JSON.stringify(payload), { status: 200 }) });
        const body = plannerBody(`modern-${contractVersion}`);
        body.meta.fullContextPass = contractVersion === 12;
        body.meta.bootstrapScan = false;
        const downstream = responseMock({ destroyed: true });
        await router.routes.get('POST /planner-jobs/generate')(request(body), downstream);
        const listed = responseMock();
        router.routes.get('GET /planner-jobs')(request({}, { query: { chatId: 'chat-1' } }), listed);
        const job = listed.payload.jobs.find(item => item.runKey === body.meta.runKey);
        assert.equal(job.status, 'complete');
        assert.deepEqual(JSON.parse(job.text), payload);
        assert.equal(job.meta.fullContextPass, contractVersion === 12);
        assert.equal(job.meta.bootstrapScan, false);
    }
});

test('streaming planner keeps the request alive and returns only final content, not reasoning', async () => {
    let forwarded;
    const encoder = new TextEncoder();
    const chunks = [
        'data: {"choices":[{"delta":{"reasoning_content":"hidden thought"}}]}\n\n' +
            'data: {"choices":[{"delta":{"content":"{\\"contract_"}}]}\n',
        '\ndata: {"choices":[{"delta":{"content":"version\\":2}"}}]}\n\n' +
            'data: [DONE]\n\n',
    ];
    const stream = new ReadableStream({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
        },
    });
    const router = routerMock();
    await init(router, {
        fetchImpl: async (_url, options) => {
            forwarded = JSON.parse(options.body);
            // SillyTavern's stream forwarder does not preserve the upstream content type.
            return new Response(stream, { status: 200 });
        },
    });
    const downstream = responseMock();
    await router.routes.get('POST /planner-jobs/generate')(request(plannerBody('streamed')), downstream);

    assert.equal(forwarded.stream, true);
    const payload = JSON.parse(Buffer.from(downstream.value).toString('utf8'));
    assert.equal(payload.choices[0].message.content, '{"contract_version":2}');
    assert.equal(Buffer.from(downstream.value).includes(Buffer.from('hidden thought')), false);
    assert.match(downstream.headers['Content-Type'], /^application\/json/);
});

test('streaming planner recovers final content from a Responses API completion wrapper', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode('data: {"type":"response.completed","response":{"status":"completed","output":[{"type":"reasoning","summary":[{"text":"hidden thought"}]},{"type":"message","content":[{"type":"output_text","text":"{\\"contract_version\\":2}"}]}]}}\n\n'));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
        },
    });
    const router = routerMock();
    await init(router, { fetchImpl: async () => new Response(stream, { status: 200 }) });
    const downstream = responseMock();
    await router.routes.get('POST /planner-jobs/generate')(request(plannerBody('responses-wrapper')), downstream);

    assert.equal(downstream.statusCode, 200);
    const payload = JSON.parse(Buffer.from(downstream.value).toString('utf8'));
    assert.equal(payload.choices[0].message.content, '{"contract_version":2}');
    assert.equal(Buffer.from(downstream.value).includes(Buffer.from('hidden thought')), false);
});

test('reasoning-only planner stream fails once without leaking hidden reasoning', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"private chain"}}]}\n\n'));
            controller.enqueue(encoder.encode('data: {"choices":[{"finish_reason":"length"}]}\n\n'));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
        },
    });
    const router = routerMock();
    await init(router, { fetchImpl: async () => new Response(stream, { status: 200 }) });
    const downstream = responseMock();
    await router.routes.get('POST /planner-jobs/generate')(request(plannerBody('reasoning-only')), downstream);

    assert.equal(downstream.statusCode, 500);
    assert.equal(downstream.payload.error, 'Planner exhausted its output budget before producing final content.');
    assert.equal(JSON.stringify(downstream.payload).includes('private chain'), false);
});

test('jobs are private to the current SillyTavern user', async () => {
    const router = routerMock();
    await init(router, { fetchImpl: async () => new Response('{"choices":[{"message":{"content":"ok"}}]}') });
    await router.routes.get('POST /planner-jobs/generate')(request(plannerBody('private')), responseMock({ destroyed: true }));
    const foreign = request({}, { query: { chatId: 'chat-1' } });
    foreign.user.directories.root = '/other-user';
    const listed = responseMock();
    router.routes.get('GET /planner-jobs')(foreign, listed);
    assert.deepEqual(listed.payload.jobs, []);
});
