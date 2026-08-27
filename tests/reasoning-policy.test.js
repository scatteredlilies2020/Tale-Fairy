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

test('mandatory reasoning fallback enables a provider-safe minimum', () => {
    const result = reasoningFallbackPayload(new Error('Reasoning is mandatory and cannot be disabled.'), { include_reasoning: false, reasoning_effort: 'none' });
    assert.deepEqual(result, { include_reasoning: true, reasoning_effort: 'low' });
});
