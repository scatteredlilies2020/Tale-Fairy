import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSagaHierarchy, directorInput, directorPass, DIRECTOR_SYSTEM } from '../extension/story-director.js';
import { emptyCampaign } from '../extension/campaign-planner.js';

const card = (id, kind, parentId = '') => ({ id, kind, parentId, status: 'active', title: id,
    owner: 'The club', description: 'Music and friendship develop through shared club activities.', endsWhen: '', links: [], effects: [] });
const saga = card('r1-year', 'saga'), arc = card('r1-festival', 'arc', saga.id), thread = card('r1-song', 'thread', arc.id);

test('one active Saga supports connected arcs/optional threads or a quiet interval on its own', () => {
    for (const nodes of [[saga], [saga, arc], [saga, arc, thread], [saga, arc, card('r1-friends', 'arc', saga.id)]]) {
        assert.doesNotThrow(() => validateSagaHierarchy(nodes));
    }
    assert.match(DIRECTOR_SYSTEM, /connected stories need not converge/);
    assert.match(DIRECTOR_SYSTEM, /never invent filler to populate the hierarchy/);
});

for (const [name, nodes] of [
    ['missing saga', [arc]], ['two sagas', [saga, card('r1-other', 'saga')]],
    ['dormant saga', [{ ...saga, status: 'dormant' }]], ['nested saga', [{ ...saga, parentId: arc.id }, arc]],
    ['orphan arc', [saga, { ...arc, parentId: '' }]], ['orphan thread', [saga, arc, { ...thread, parentId: '' }]],
    ['thread directly under saga', [saga, { ...thread, parentId: saga.id }]],
    ['nested arc', [saga, arc, card('r1-nested', 'arc', arc.id)]],
]) test(`current host hierarchy rejects ${name} without inventing content or connections`, () => {
    assert.throws(() => validateSagaHierarchy(nodes), /Saga|Connect/);
});

test('strict director pass preserves the saved plan on missing Saga and accepts a connected replacement in one call', async () => {
    const state = emptyCampaign(), snapshot = structuredClone(state);
    const input = directorInput({ state, reference: { premise: 'Light music club RP' }, messages: [],
        playerNames: [], requireSagaHierarchy: true });
    let calls = 0;
    const run = nodes => directorPass({ state, input, source: { chatId: 'synthetic', referenceHash: 'ref', fingerprint: 'fp', messageCount: 1 },
        generate: async () => { calls++; return { finishReason: 'stop', text: JSON.stringify({ reviewAfter: 12,
            foundation: { reminder: 'A light music club RP.', changeReason: '', scratchpad: '' },
            upsert: nodes, retain: [], retire: [], select: [] }) }; } });
    const rejected = await run([{ ...arc, parentId: '' }]);
    assert.equal(rejected.accepted, false);
    assert.match(rejected.error, /one active root Saga/);
    assert.deepEqual(state, snapshot);
    assert.equal(calls, 1, 'invalid output causes no paid repair loop');
    const accepted = await run([saga, arc, thread]);
    assert.equal(accepted.accepted, true, accepted.error);
    assert.equal(calls, 2);
    assert.equal(accepted.state.workingPlan.storyStructure.nodes.length, 3);
});
