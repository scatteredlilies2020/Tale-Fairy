import test from 'node:test';
import assert from 'node:assert/strict';
import { writerFailureDetails } from '../scripts/isolated-writer-provider.mjs';

test('writer diagnostics classify provider failures without exposing echoed credentials', () => {
    const body = JSON.stringify({ error: { type: 'invalid_request_error', param: 'messages',
        message: 'Missing reasoning_content in assistant message. Authorization: Bearer PRIVATE_SECRET; private player text' } });
    const diagnostic = writerFailureDetails(body);
    assert.equal(diagnostic.category, 'reasoning-format');
    assert.equal(diagnostic.parameter, 'messages');
    assert.equal(diagnostic.errorType, 'invalid_request_error');
    assert.doesNotMatch(JSON.stringify(diagnostic), /PRIVATE_SECRET/);
    assert.deepEqual(writerFailureDetails(JSON.stringify({ error: { type: 'SECRET', param: 'SECRET', message: 'SECRET' } })).category, 'unclassified');
    assert.doesNotMatch(JSON.stringify(writerFailureDetails('<html>SECRET</html>', ['SECRET'])), /SECRET/);
    const echoed = writerFailureDetails(JSON.stringify({ authorization: 'upstream unknown', nested: { token: 'hidden' },
        detail: 'token=unknown https://gateway.example/key active-key' }), ['active-key']);
    assert.doesNotMatch(echoed.localExcerpt, /upstream unknown|hidden|gateway.example|active-key|token=unknown/);
});

test('writer diagnostics distinguish context, model, arguments and unclassified rejections', () => {
    for (const [message, category] of [['Maximum context length exceeded', 'context-limit'],
        ['Model "kimi/kimi-k3" is not enabled for any configured DashScope key.', 'model-unavailable'],
        ['Model not found', 'model-unavailable'], ['Unsupported parameter: top_p', 'unsupported-parameter'],
        ['Messages must alternate user and assistant', 'message-format'], ['Upstream failed', 'upstream-failure'],
        ['Invalid API key', 'authentication'], ['Too many requests', 'rate-limit'], ['Bad request', 'unclassified']]) {
        assert.equal(writerFailureDetails(JSON.stringify({ error: { message } })).category, category);
    }
});
