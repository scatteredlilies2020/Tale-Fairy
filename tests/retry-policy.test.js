import test from 'node:test';
import assert from 'node:assert/strict';
import { plannerRetryDelay, shouldRetryPlannerError } from '../extension/retry-policy.js';

test('planner retry delay backs off and remains capped', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(attempt => plannerRetryDelay(attempt)), [2000, 4000, 8000, 16000, 32000, 60000, 60000]);
});

test('network and provider failures retry unless the request was locally stopped', () => {
    assert.equal(shouldRetryPlannerError(new TypeError('Failed to fetch')), true);
    assert.equal(shouldRetryPlannerError(new DOMException('Timed out', 'AbortError')), true);
    assert.equal(shouldRetryPlannerError(new Error('Analysis request failed (503).')), true);
    assert.equal(shouldRetryPlannerError(new Error('Analysis request failed (429).')), true);
    assert.equal(shouldRetryPlannerError(new Error('Failed to fetch'), true), false);
});

test('permanent setup, authentication, and validation errors do not loop', () => {
    assert.equal(shouldRetryPlannerError(new Error('Tale Fairy connection profile is not selected.')), false);
    assert.equal(shouldRetryPlannerError(new Error('Analysis request failed (401).')), false);
    assert.equal(shouldRetryPlannerError(Object.assign(new Error('Invalid planner JSON'), { name: 'AnalysisValidationError' })), false);
});
