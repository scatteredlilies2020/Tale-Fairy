import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReasoningRequest, profileReasoningEffort, reasoningFallbackPayload, resolveReasoningMode } from '../extension/reasoning-policy.js';

test('Auto inherits a profile or preset effort before the active setting', () => {
    const presets = [{}, { reasoning_effort: 'high' }];
    const names = { Planner: 1 };
    assert.equal(profileReasoningEffort({ preset: 'Planner' }, names, presets), 'high');
    assert.equal(profileReasoningEffort({ reasoning_effort: 'low', preset: 'Planner' }, names, presets), 'low');
    assert.equal(resolveReasoningMode('auto', { preset: 'Planner' }, names, presets, 'low'), 'high');
    assert.equal(resolveReasoningMode('auto', {}, names, presets, 'medium'), 'medium');
});

test('an explicit Tale Fairy effort overrides profile inheritance', () => {
    for (const mode of ['off', 'minimum', 'low', 'medium', 'high', 'max']) {
        assert.equal(resolveReasoningMode(mode, { reasoning_effort: 'high' }, {}, [], 'high'), mode);
    }
});

test('reasoning choices translate for native and custom providers', () => {
    assert.deepEqual(buildReasoningRequest({ mode: 'high', source: 'openai', model: 'gpt-5.5' }).payload, { include_reasoning: true, reasoning_effort: 'high' });
    const openrouter = buildReasoningRequest({ mode: 'medium', source: 'custom', url: 'https://openrouter.ai/api/v1', model: 'model' });
    assert.deepEqual(JSON.parse(openrouter.payload.custom_include_body), { reasoning: { effort: 'medium', exclude: true } });
    assert.equal(buildReasoningRequest({ mode: 'minimum', source: 'openai', model: 'gpt-5.6' }).payload.reasoning_effort, 'low');
});

test('custom DeepSeek forwards its documented effort without sending thinking enabled', () => {
    const expectedEffort = { low: 'low', medium: 'high', high: 'high', max: 'max' };
    for (const [mode, effort] of Object.entries(expectedEffort)) {
        const result = buildReasoningRequest({ mode, source: 'custom', model: 'deepseek-v4-pro' });
        assert.equal(result.payload.reasoning_effort, effort);
        assert.deepEqual(JSON.parse(result.payload.custom_include_body), {
            reasoning_effort: effort,
        });
        assert.equal(result.payload.custom_include_body.includes('enabled'), false);
    }
    assert.deepEqual(
        JSON.parse(buildReasoningRequest({ mode: 'minimum', source: 'custom', model: 'deepseek-v4-pro' }).payload.custom_include_body),
        { reasoning_effort: 'low' },
    );
    assert.deepEqual(
        JSON.parse(buildReasoningRequest({ mode: 'off', source: 'custom', model: 'deepseek-v4-pro' }).payload.custom_include_body),
        { thinking: { type: 'disabled' } },
    );
});

test('Google and Gemini variants receive model-compatible thinking levels', () => {
    assert.deepEqual(
        buildReasoningRequest({ mode: 'off', source: 'google', model: 'gemini-3.1-pro-preview' }).payload,
        { include_reasoning: false, reasoning_effort: 'low' },
    );
    assert.deepEqual(
        buildReasoningRequest({ mode: 'off', source: 'google', model: 'gemini-3.5-flash' }).payload,
        { include_reasoning: false, reasoning_effort: 'min' },
    );
    assert.deepEqual(
        buildReasoningRequest({ mode: 'off', source: 'google', model: 'gemini-2.5-flash' }).payload,
        { include_reasoning: false, reasoning_effort: 'none' },
    );
    assert.deepEqual(buildReasoningRequest({ mode: 'high', source: 'google', model: 'gemini-1.5-pro' }).payload, {});
    const compatible = buildReasoningRequest({
        mode: 'minimum',
        source: 'custom',
        model: 'gemini-3.1-pro-preview',
        url: 'https://generativelanguage.googleapis.com/v1beta/openai',
    });
    assert.equal(compatible.payload.reasoning_effort, 'low');
    assert.deepEqual(JSON.parse(compatible.payload.custom_include_body), { reasoning_effort: 'low' });
});

test('GLM and other native SillyTavern sources use normalized reasoning controls', () => {
    assert.deepEqual(
        buildReasoningRequest({ mode: 'low', source: 'zai', model: 'glm-5.3' }).payload,
        { include_reasoning: true, reasoning_effort: 'low' },
    );
    assert.deepEqual(
        buildReasoningRequest({ mode: 'off', source: 'deepseek', model: 'deepseek-v4-pro' }).payload,
        { include_reasoning: false, reasoning_effort: 'none' },
    );
    assert.deepEqual(
        JSON.parse(buildReasoningRequest({ mode: 'off', source: 'custom', model: 'qwen3.5-plus' }).payload.custom_include_body),
        { enable_thinking: false },
    );
    assert.deepEqual(
        buildReasoningRequest({ mode: 'default', source: 'openrouter', model: 'stealth/ox-alpha' }).payload,
        { include_reasoning: true },
    );
});

test('an explicit Kimi model is not mistaken for Qwen by a proxy route name', () => {
    const result = buildReasoningRequest({
        mode: 'low',
        source: 'custom',
        model: 'kimi-k3',
        url: 'http://127.0.0.1:17777/cute/qwen',
    });
    assert.equal(result.adapter, 'openai-compatible');
    assert.deepEqual(JSON.parse(result.payload.custom_include_body), { reasoning_effort: 'low' });
});

test('mandatory reasoning fallback enables a provider-safe minimum', () => {
    const result = reasoningFallbackPayload(new Error('Reasoning is mandatory and cannot be disabled.'), { include_reasoning: false, reasoning_effort: 'none' });
    assert.deepEqual(result, { include_reasoning: true, reasoning_effort: 'low' });
});

test('mandatory DeepSeek fallback relies on provider default instead of sending thinking enabled', () => {
    const result = reasoningFallbackPayload(new Error('Thinking is mandatory and cannot be disabled.'), {
        include_reasoning: false,
        reasoning_effort: 'none',
        custom_include_body: JSON.stringify({ thinking: { type: 'disabled' } }),
    });
    assert.equal(result.reasoning_effort, 'low');
    assert.deepEqual(JSON.parse(result.custom_include_body), {});
    assert.equal(result.custom_include_body.includes('enabled'), false);
});
