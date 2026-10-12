import test from 'node:test';
import assert from 'node:assert/strict';
import { plannerContextLimit, plannerInputCapacity, plannerOutputCapacity } from '../extension/planner-capacity.js';

test('unknown connections use a bounded context default and known smaller limits win', () => {
    assert.equal(plannerContextLimit(undefined), 32768);
    assert.equal(plannerContextLimit(65536, 8192), 8192);
    assert.equal(plannerContextLimit(32768, 128000), 32768);
    assert.equal(plannerContextLimit(32768, NaN), 32768);
});

test('input capacity reserves visible output and request framing', () => {
    assert.equal(plannerInputCapacity(10000, 3000, 8192), 4680);
    assert.throws(() => plannerInputCapacity(10000, 8192, 4096), /no provider request sent/);
});

test('reasoning allowance stays inside the combined context capacity', () => {
    assert.equal(plannerOutputCapacity(68536, 10000, 3000, 32768), 22256);
    assert.equal(plannerOutputCapacity(19384, 8000, 3000, 32768), 19384);
    assert.throws(() => plannerOutputCapacity(3000, 12000, 3000, 14000), /no provider request sent/);
});
