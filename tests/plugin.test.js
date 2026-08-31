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
            plannerSeed: 42,
            analysisSelection: { source: 'profile', model: 'gemini-test' },
        },
    };
}

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
    assert.equal(forwarded.stream, false);
    const listed = responseMock();
    router.routes.get('GET /planner-jobs')(request({}, { query: { chatId: 'chat-1' } }), listed);
    assert.equal(listed.payload.jobs.length, 1);
    assert.equal(listed.payload.jobs[0].status, 'complete');
    assert.equal(listed.payload.jobs[0].text, '{"contract_version":2}');
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
