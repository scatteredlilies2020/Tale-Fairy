import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeModelListResponse } from '../extension/models.js';

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
