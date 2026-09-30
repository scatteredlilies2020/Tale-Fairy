import test from 'node:test';
import assert from 'node:assert/strict';
import { storyInput, storyPassWithRecovery } from '../extension/bounded-story.js';
import { emptyCampaign, validCampaignState } from '../extension/campaign-planner.js';
import { storyInputTokens } from '../extension/story-budget.js';
import { originalUnderstanding } from './helpers/rp-fixtures.js';

const source = { chatId: 'story', referenceHash: 'reference', fingerprint: 'accepted', messageCount: 1 };
const draft = () => ({ plan: { rpUnderstanding: originalUnderstanding(), direction: 'Travel between villages.', threads: 'Find a place to belong.', consequences: [],
    goal: [{ subjectId: 'r1-bridge', aim: 'Reopen the village crossing.', reachedWhen: 'Workers finish the crossing or abandon repairs.' }],
    developments: [{ id: 'r1-bridge', kind: 'arc', owner: 'Council', control: 'npc', question: 'Repair the crossing?',
        initiative: 'Workers fit new planks.', resolution: 'The bridge reopens or repairs cease.', beyond: 'Trade can resume.',
        access: { route: 'local', basis: 'The workers are here.' } }] }, exits: [], observations: [],
    selected_material: [{ subjectIds: ['r1-bridge'], available: 'Workers bring planks to the crossing.' }] });
const input = () => storyInput({ state: emptyCampaign(), reference: { rule: 'The player chooses participation.' },
    messages: [{ index: 0, role: 'user', name: 'Ren', content: 'I watch from the bank.' }], playerNames: ['Ren'] });
const response = value => ({ text: JSON.stringify(value), finishReason: 'stop' });

for (const [name, invalid] of [
    ['oversized plan', () => { const value = draft(); value.plan.developments[0].initiative = '音'.repeat(400); return response(value); }],
    ['oversized selection', () => { const value = draft(); value.selected_material[0].available = '音'.repeat(500); return response(value); }],
    ['malformed JSON', () => ({ text: '{"plan":', finishReason: 'stop' })],
    ['empty response', () => null],
    ['truncated JSON', () => ({ ...response(draft()), finishReason: 'length' })],
    ['schema failure', () => { const value = draft(); delete value.plan.direction; return response(value); }],
    ['missing RP analysis', () => { const value = draft(); delete value.plan.rpUnderstanding; return response(value); }],
    ['missing story goal', () => { const value = draft(); delete value.plan.goal; return response(value); }],
    ['goal handoff mismatch', () => { const value = draft(); value.selected_material = []; return response(value); }],
    ['oversized RP analysis', () => { const value = draft(); value.plan.rpUnderstanding.anchors = '界'.repeat(200); return response(value); }],
    ['player ownership', () => { const value = draft(); value.plan.developments[0].owner = 'Ren'; return response(value); }],
    ['unwitnessed outcome', () => { const value = draft(); value.plan.consequences = [{ id: 'done', text: 'The bridge reopened.' }]; return response(value); }],
]) test(`${name} receives one validated correction within the same input limit`, async () => {
    const state = emptyCampaign(), original = structuredClone(state), prepared = input();
    let calls = 0;
    const result = await storyPassWithRecovery({ state, input: prepared, source, generate: async (prompt, system, schema, correction) => {
        calls++;
        assert.ok(storyInputTokens(prompt, system, schema) <= prepared.inputLimit);
        if (calls === 1) return invalid();
        assert.ok(correction.recoveryReason);
        const payload = JSON.parse(prompt);
        assert.match(system, /corrected complete JSON/);
        assert.ok(schema.value.properties.plan.required.includes('rpUnderstanding'));
        assert.equal(schema.value.properties.plan.properties.rpUnderstanding.properties.departures.maxLength, 70);
        assert.equal(schema.value.properties.plan.properties.rpUnderstanding.properties.storyScope.maxLength, 70);
        assert.equal(schema.value.properties.plan.properties.rpUnderstanding.properties.independentSource.maxLength, 70);
        assert.ok(payload.response_correction.error);
        assert.deepEqual(payload.source_reference, JSON.parse(prepared.prompt).source_reference);
        assert.deepEqual(payload.accepted_messages, JSON.parse(prepared.prompt).accepted_messages);
        return response(draft());
    } });
    assert.equal(calls, 2);
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.recovery.status, name.startsWith('oversized') ? 'shortened' : 'complete');
    assert.equal(validCampaignState(result.state), true);
    assert.ok(result.budget.plan <= 1200 && result.budget.selected <= 600);
    assert.deepEqual(state, original);
});

test('two invalid responses stop recovery and leave saved state untouched', async () => {
    const state = emptyCampaign(), before = structuredClone(state);
    let calls = 0;
    const result = await storyPassWithRecovery({ state, input: input(), source, generate: async () => {
        calls++; return { text: 'not JSON', finishReason: 'stop' };
    } });
    assert.equal(calls, 2);
    assert.equal(result.accepted, false);
    assert.equal(result.recovery.status, 'failed');
    assert.deepEqual(state, before);
    assert.equal(result.state, state);
});

test('valid response sends once; provider errors, timeout and cancellation are not corrected', async () => {
    for (const failure of [null, Error('HTTP 401'), Error('HTTP 429'), new DOMException('Stopped', 'AbortError'), new DOMException('Timed out', 'TimeoutError')]) {
        let calls = 0;
        const result = await storyPassWithRecovery({ state: emptyCampaign(), input: input(), source, generate: async () => {
            calls++; if (failure) throw failure; return response(draft());
        } });
        assert.equal(calls, 1);
        assert.equal(result.accepted, !failure);
        assert.equal(result.recovery, undefined);
    }
});

test('host-classified truncated output can be replaced without trusting its partial content', async () => {
    let calls = 0;
    const result = await storyPassWithRecovery({ state: emptyCampaign(), input: input(), source, generate: async () => {
        if (++calls === 1) throw Object.assign(Error('Truncated campaign response.'), { code: 'TF_INVALID_PLANNER_RESPONSE' });
        return response(draft());
    } });
    assert.equal(calls, 2);
    assert.equal(result.accepted, true);
});

test('correction preserves protected input above a soft target instead of blocking the second request', async () => {
    const prepared = input();
    prepared.inputLimit = 1;
    let calls = 0;
    const result = await storyPassWithRecovery({ state: emptyCampaign(), input: prepared, source, generate: async () => {
        return ++calls === 1 ? { text: 'not JSON', finishReason: 'stop' } : response(draft());
    } });
    assert.equal(calls, 2);
    assert.equal(result.accepted, true);
    assert.equal(result.recovery.status, 'complete');
    assert.ok(result.budgetNotices.some(notice => notice.startsWith('input ')));
});


test('correction feedback fits when the original request reaches its configured limit', async () => {
    const prepared = input();
    prepared.inputLimit = prepared.inputTokens;
    let calls = 0;
    const result = await storyPassWithRecovery({ state: emptyCampaign(), input: prepared, source, generate: async (prompt, system, schema) => {
        calls++;
        assert.ok(storyInputTokens(prompt, system, schema) <= prepared.inputLimit);
        assert.deepEqual(JSON.parse(prompt).accepted_messages, JSON.parse(prepared.prompt).accepted_messages);
        return calls === 1 ? { text: 'invalid JSON', finishReason: 'stop' } : response(draft());
    } });
    assert.equal(calls, 2);
    assert.equal(result.accepted, true);
});

for (const failure of ['invalid', 'larger', 'provider']) test(`valid above-target output survives a ${failure} shortening result`, async () => {
    const first = draft();
    first.selected_material[0].available = '音'.repeat(500);
    const prepared = input(), state = emptyCampaign(), before = structuredClone(state);
    let calls = 0;
    const result = await storyPassWithRecovery({ state, input: prepared, source, generate: async () => {
        if (++calls === 1) return response(first);
        if (failure === 'provider') throw Error('Provider offline');
        if (failure === 'invalid') return { text: 'invalid JSON' };
        const larger = draft(); larger.selected_material[0].available = '音'.repeat(900);
        return response(larger);
    } });
    assert.equal(calls, 2);
    assert.equal(result.accepted, true);
    assert.equal(result.recovery.status, 'target-retained');
    assert.deepEqual(result.state.selectedMaterial, first.selected_material);
    assert.equal(validCampaignState(result.state), true);
    assert.deepEqual(state, before);
});
