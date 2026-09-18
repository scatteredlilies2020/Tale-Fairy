import test from 'node:test';
import assert from 'node:assert/strict';
import { writerFailureDetails, savedWriterBody } from '../scripts/isolated-writer-provider.mjs';

test('isolated saved OpenAI writer preserves the selected model and host token/reasoning mapping', () => {
    const preset = { source: 'openai', model: 'gpt-5.6-sol', temperature: 0.9, reasoning: 'low', maxOutput: 6000 };
    const oai = { chat_completion_source: 'openai', openai_model: preset.model, deepseek_model: 'inactive',
        temp_openai: 0.9, reasoning_effort: 'low', verbosity: 'auto', seed: -1, proxy_password: 'SECRET' };
    const messages = [{ role: 'user', content: 'Continue.' }], before = structuredClone({ oai, messages });
    const body = savedWriterBody(oai, preset, messages);
    assert.deepEqual(body, { messages, model: 'gpt-5.6-sol', max_completion_tokens: 6000, stream: false, reasoning_effort: 'low' });
    assert.deepEqual({ oai, messages }, before);
    assert.doesNotMatch(JSON.stringify(body), /SECRET|inactive|temperature|thinking/);
    for (const change of [{ openai_model: 'other' }, { chat_completion_source: 'custom' }, { temp_openai: 0.2 }, { reasoning_effort: 'high' }]) {
        assert.throws(() => savedWriterBody({ ...oai, ...change }, preset, messages), /configuration changed/);
    }
    assert.throws(() => savedWriterBody({ ...oai, openai_model: 'other' }, { ...preset, model: 'other' }, messages), /Unsupported saved OpenAI/);
});

test('isolated DeepSeek writer retains its existing body and refuses a mismatched frozen source', () => {
    const preset = { source: 'deepseek', model: 'deepseek-chat', temperature: 0.9, reasoning: 'low', maxOutput: 1000 };
    const oai = { chat_completion_source: 'deepseek', deepseek_model: preset.model, temp_openai: 0.9,
        reasoning_effort: 'low', show_thoughts: true, top_p_openai: 1, freq_pen_openai: 0, pres_pen_openai: 0 };
    assert.deepEqual(savedWriterBody(oai, preset, []), { messages: [], model: preset.model, temperature: 0.9,
        max_tokens: 1000, stream: false, top_p: 1, frequency_penalty: 0, presence_penalty: 0,
        thinking: { type: 'enabled' }, reasoning_effort: 'low' });
    assert.throws(() => savedWriterBody(oai, { ...preset, source: 'openai' }, []), /configuration changed/);
});

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
        ['Invalid API key', 'authentication'], ['Too many requests', 'rate-limit'], ['Bad request', 'unclassified'],
        ['InternalError.Algo.DataInspectionFailed: Input text data may contain inappropriate content.', 'content-rejection']]) {
        assert.equal(writerFailureDetails(JSON.stringify({ error: { message } })).category, category);
    }
});
