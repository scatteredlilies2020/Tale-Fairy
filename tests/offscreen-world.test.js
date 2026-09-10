import test from 'node:test';
import assert from 'node:assert/strict';
import {
    formatDriftRequest, mergeOffscreenWorld, normalizeOffscreenWorld, offscreenWorldForPrompt, OFFSCREEN_KINDS, subjectsOwingDrift,
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

test('deferred simulation supports social, settlement, and material causal units directly', () => {
    assert.ok(OFFSCREEN_KINDS.includes('relationship'));
    assert.ok(OFFSCREEN_KINDS.includes('community'));
    assert.ok(OFFSCREEN_KINDS.includes('resource'));
    const value = normalizeOffscreenWorld({ subjects: [
        subject({ id: 'ward', kind: 'community', subject: 'Riverside ward' }),
        subject({ id: 'water', kind: 'resource', subject: 'Reservoir capacity' }),
        subject({ id: 'trust', kind: 'relationship', subject: 'Council–market trust' }),
    ] });
    assert.deepEqual(value.subjects.map(item => item.kind), ['community', 'resource', 'relationship']);
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

test('a full active board admits relevant arrivals without erasing dormant debt', () => {
    const previous = { subjects: Array.from({ length: 12 }, (_, i) => subject({ id: `s${i}`, subject: `Subject ${i}`, settled: `Fact ${i}.` })) };
    const snapshot = JSON.stringify(previous);
    const next = mergeOffscreenWorld(previous, { subjects: [subject({ id: 'new', subject: 'Newly relevant matter', settled: 'A current observation.' })] }, { currentTurn: 2 });
    assert.equal(next.subjects.length, 12);
    assert.equal(next.subjects[0].id, 'new');
    assert.equal(next.archive.length, 1);
    assert.equal(next.archive[0].settled, 'Fact 11.');
    assert.equal(JSON.stringify(previous), snapshot);
    const returned = mergeOffscreenWorld(JSON.parse(JSON.stringify(next)), { subjects: [subject({ id: 's11', subject: 'Subject 11', settled: 'A later observation.', lastSeenTurn: 3 })] }, { currentTurn: 3 });
    assert.match(returned.subjects[0].settled, /Fact 11\.[\s\S]*A later observation/);
    assert.equal(returned.subjects[0].lastSeenTurn, 3);
});

test('new settlement survives the 400-character compact cap and old facts stay recoverable', () => {
    const old = 'The beacon remained broken. '.repeat(14).trim();
    const previous = { subjects: [subject({ settled: old })] };
    const next = mergeOffscreenWorld(previous, { subjects: [subject({ settled: 'The beacon was repaired this morning.' })] }, { currentTurn: 2 });
    const item = next.subjects[0];
    assert.equal(item.settled, 'The beacon was repaired this morning.');
    assert.ok(item.history.includes(old));
    const prompt = offscreenWorldForPrompt(next, 'Why was the beacon broken?');
    assert.ok(prompt.subjects[0].settledWitnesses.includes(old));
    assert.equal(prompt.subjects[0].history, undefined);
});

test('static archives are selectively retrieved with bounded historical witnesses', () => {
    const previous = { subjects: [subject({ motion: 'static', owed: '', history: Array.from({ length: 100 }, (_, i) => `Old observation ${i}.`) })] };
    const next = mergeOffscreenWorld(previous, { subjects: [] }, { currentTurn: 4 });
    assert.equal(next.subjects.length, 0);
    assert.equal(next.archive.length, 1);
    assert.equal(offscreenWorldForPrompt(next, 'A quiet afternoon with tea').archive.length, 0);
    const recalled = offscreenWorldForPrompt(next, 'Harbor traffic');
    assert.equal(recalled.archive[0].id, 'harbor');
    assert.ok(recalled.archive[0].settledWitnesses.length <= 2);
    assert.equal(next.archive[0].history.length, 100);
});
