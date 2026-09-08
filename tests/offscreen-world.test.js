import test from 'node:test';
import assert from 'node:assert/strict';
import {
    formatDriftRequest, mergeOffscreenWorld, normalizeOffscreenWorld, subjectsOwingDrift,
} from '../extension/offscreen-world.js';

function subject(overrides = {}) {
    return {
        id: 'harbor', kind: 'situation', subject: 'Harbor traffic', reach: 'distant', motion: 'building',
        trajectory: 'Ships are arriving late.', settled: '', confidence: 'strong', lastSeenTurn: 0,
        owed: 'Prices may rise inland.', carriedBy: 'merchant reports', ...overrides,
    };
}

test('normalization bounds the private board and accepts snake-case planner fields', () => {
    const value = normalizeOffscreenWorld({
        subjects: Array.from({ length: 14 }, (_, i) => {
            const { lastSeenTurn: _unused, ...item } = subject({ id: `s${i}`, subject: `Subject ${i}` });
            return { ...item, last_seen_turn: i };
        }),
        settled_through: 4,
    });
    assert.equal(value.subjects.length, 12);
    assert.equal(value.subjects[4].lastSeenTurn, 4);
    assert.equal(value.settledThrough, 4);

    const deduplicated = normalizeOffscreenWorld({ subjects: [
        {},
        subject({ id: 'Stable-ID' }),
        subject({ id: 'stable-id', subject: 'Conflicting duplicate' }),
    ] });
    assert.equal(deduplicated.subjects.length, 1);
    assert.equal(deduplicated.subjects[0].subject, 'Harbor traffic');
});

test('drift candidates exclude current and static subjects and sort oldest first', () => {
    const value = { subjects: [subject({ id: 'new', lastSeenTurn: 4 }), subject({ id: 'old', lastSeenTurn: 1 }), subject({ id: 'static', motion: 'static', lastSeenTurn: 0 })] };
    assert.deepEqual(subjectsOwingDrift(value, 4).map(item => item.id), ['old']);
});

test('drift request is conditional, distance-scaled, and never schedules pressure', () => {
    const output = formatDriftRequest({ subjects: [subject({ reach: 'remote', settled: 'One convoy departed late.' })], elapsed: 'Sixteen days' }, { currentTurn: 3 });
    assert.match(output, /Settle only a subject made relevant/i);
    assert.match(output, /at most 1 sentence/i);
    assert.match(output, /fourteen days/i);
    assert.match(output, /never turn owed pressure into a scheduled arrival/i);
    assert.match(output, /Nothing much changed/i);
});

test('merge preserves settled facts, clocks, and unresolved omissions', () => {
    const previous = { subjects: [subject({ settled: 'One convoy departed late.', lastSeenTurn: 2 }), subject({ id: 'unseen', subject: 'Unseen group' }), subject({ id: 'done', subject: 'Finished matter', motion: 'static', owed: '' })], settledThrough: 2 };
    const proposed = { subjects: [subject({ settled: 'A storm delayed it.', lastSeenTurn: 99 })], settled_through: 99 };
    const value = mergeOffscreenWorld(previous, proposed, { currentTurn: 3 });
    assert.match(value.subjects.find(item => item.id === 'harbor').settled, /One convoy departed late\.[\s\S]*A storm delayed it\./);
    assert.equal(value.subjects.find(item => item.id === 'harbor').lastSeenTurn, 3);
    assert.ok(value.subjects.some(item => item.id === 'unseen'));
    assert.ok(!value.subjects.some(item => item.id === 'done'));
    assert.equal(value.settledThrough, 3);
});
