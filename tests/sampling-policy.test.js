import assert from 'node:assert/strict';
import test from 'node:test';

import { effectivePlannerTemperature, isGlmPlannerTarget, normalizePlannerTemperature } from '../extension/sampling-policy.js';

test('saved planner temperature remains portable across providers', () => {
    assert.equal(normalizePlannerTemperature(1.8), 1.8);
    assert.equal(effectivePlannerTemperature(1.8, { model: 'gemini-3-flash' }), 1.8);
    assert.equal(effectivePlannerTemperature(7, { model: 'other' }), 2);
});

test('GLM requests obey the provider maximum of one', () => {
    assert.equal(effectivePlannerTemperature(1.8, { model: 'glm-5.3-flash' }), 1);
    assert.equal(effectivePlannerTemperature(1.4, { source: 'zai' }), 1);
    assert.equal(effectivePlannerTemperature(0.65, { url: 'http://127.0.0.1/cute/glm' }), 0.65);
});

test('GLM detection does not misclassify unrelated models', () => {
    assert.equal(isGlmPlannerTarget({ model: 'gemini-2.5-flash', url: 'https://generativelanguage.googleapis.com' }), false);
    assert.equal(isGlmPlannerTarget({ model: 'openai/gpt-5.6' }), false);
});
