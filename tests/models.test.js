import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverDirectModels, normalizeModelListResponse } from '../extension/models.js';

test('normalizes OpenAI and OpenRouter model-list responses', () => {
    assert.deepEqual(normalizeModelListResponse({ data: [
        { id: 'z-model', name: 'Zed' },
        { id: 'a-model' },
        { id: 'a-model', name: 'duplicate' },
    ] }), [
        { id: 'a-model', name: 'a-model' },
        { id: 'z-model', name: 'Zed' },
    ]);
});

test('accepts nested, models, and string response shapes', () => {
    assert.deepEqual(normalizeModelListResponse({ data: { data: ['b', 'a'] } }).map(model => model.id), ['a', 'b']);
    assert.deepEqual(normalizeModelListResponse({ models: [{ name: 'named-model' }] }), [{ id: 'named-model', name: 'named-model' }]);
    assert.deepEqual(normalizeModelListResponse({ error: true }), []);
});

const response = (payload, status = 200) => new Response(JSON.stringify(payload), { status });
const openRouter = { source: 'openrouter', url: 'https://openrouter.ai/api/v1', secretId: 'planner-key', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'local-only' } };

test('regular ST and SDK fork use the native status contract and saved planner key', async () => {
    for (const payload of [{ data: [{ id: 'model' }] }, { models: ['model'] }]) {
        const models = await discoverDirectModels({ ...openRouter, fetchImpl: async (url, options) => {
            assert.equal(url, '/api/backends/chat-completions/status');
            assert.equal(options.method, 'POST');
            assert.deepEqual(JSON.parse(options.body), { chat_completion_source: 'openrouter', secret_id: 'planner-key', api_url: openRouter.url });
            assert.ok(options.signal instanceof AbortSignal);
            return response(payload);
        } });
        assert.equal(models[0].id, 'model');
    }
});

test('missing fork route and regular ST key errors fall back to public catalog without credentials', async () => {
    for (const failure of [() => response({}, 404), () => response({ error: true }), () => response({ data: [] })]) {
        let calls = 0;
        const models = await discoverDirectModels({ ...openRouter, fetchImpl: async (url, options) => {
            if (++calls === 1) return failure();
            assert.equal(url, 'https://openrouter.ai/api/v1/models');
            assert.equal(options.method, 'GET');
            assert.equal(options.credentials, 'omit');
            assert.deepEqual(options.headers, { Accept: 'application/json' });
            assert.equal(options.body, undefined);
            return response({ data: ['public-model'] });
        } });
        assert.equal(calls, 2);
        assert.equal(models[0].id, 'public-model');
    }
});

test('custom endpoints retain their own catalog and useful errors, never report OK as an error', async () => {
    for (const settings of [{ source: 'direct' }, { source: 'openrouter' }]) {
        let calls = 0;
        await assert.rejects(discoverDirectModels({ ...settings, url: 'https://proxy.example/v1', fetchImpl: async (_url, options) => {
            calls++;
            assert.equal(JSON.parse(options.body).chat_completion_source, 'custom');
            assert.equal(JSON.parse(options.body).custom_url, 'https://proxy.example/v1');
            return response({ error: true });
        } }), /server could not list models/);
        assert.equal(calls, 1);
    }
});

test('preserves API errors and explains invalid JSON and failed public fallback', async () => {
    await assert.rejects(discoverDirectModels({ source: 'direct', url: 'https://proxy.example', fetchImpl: async () => response({ error: { message: 'Key expired' } }) }), /Key expired/);
    await assert.rejects(discoverDirectModels({ source: 'direct', url: 'https://proxy.example', fetchImpl: async () => new Response('<html>') }), /invalid JSON/);
    await assert.rejects(discoverDirectModels({ ...openRouter, fetchImpl: async () => response({}, 404) }), /HTTP 404.*Public OpenRouter catalog: HTTP 404/);
});
