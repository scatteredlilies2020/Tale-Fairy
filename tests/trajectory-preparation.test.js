import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptTrajectory } from '../scripts/trajectory-preparation-prototype.mjs';

const phase = n => ({ when: `Accepted condition ${n}`, experience: `Distinct play ${n}`, after: `Conditional difference ${n}` });
const sample = () => ({ development: { id: 'test', later: phase(3), middle: phase(2), beginning: phase(1),
    subject: 'A concrete subject', working: 'A definite working and limitation', independence: 'Its own driver', encounter: 'Optional access' } });

test('trajectory adaptation preserves distinct horizons without rewriting source scope', () => {
    const raw = sample(), before = structuredClone(raw), result = acceptTrajectory(raw);
    assert.deepEqual(result.developments[0].changes, [raw.development.beginning, raw.development.middle, raw.development.later]);
    assert.match(result.developments[0].substance, /definite working/);
    assert.match(result.scope, /original source/);
    assert.deepEqual(raw, before);
    assert.deepEqual(acceptTrajectory({ development: null }).developments, []);
});

test('trajectory schema failures cannot be repaired by silently dropping fields or cutting prose', () => {
    for (const mutate of [r => r.development.working = 'x'.repeat(1401), r => r.development.later.when = '',
        r => r.development.scope = 'new genre', r => r.extra = true]) {
        const raw = sample(); mutate(raw);
        assert.throws(() => acceptTrajectory(raw));
    }
});
