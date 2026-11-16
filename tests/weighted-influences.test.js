import test from 'node:test';
import assert from 'node:assert/strict';
import { directorInput, directorPass, DIRECTOR_SCHEMA } from '../extension/story-director.js';
import { campaignPayload, preActivityCampaignPayload, preWeightedCampaignPayload, emptyCampaign, validCampaignState } from '../extension/campaign-planner.js';
import { generationContextEntries } from '../extension/generation-context.js';
import { storyCardsHtml } from '../extension/story-cards.js';

const influence = (label, weight = 3, scope = 'Relevant activities within this RP') => ({
    label, weight, pressure: 'The established situation supports this influence; current play can change its basis.', scope,
});
const card = (effects = []) => ({ id: 'r1-domain', kind: 'saga', parentId: '', status: 'active',
    title: 'Life under the new governor', owner: 'The household and domain', description: 'The household adapts to the authority already granted.',
    effects, endsWhen: '', links: [] });
const selection = () => ({ id: 'r1-domain', title: 'Life under the new governor', context: [],
    description: 'The new arrangement leaves room for relationships, ordinary work and independent interests.', endsWhen: '', development: '' });
const foundation = effects => ({ reminder: 'A fantasy sandbox with household life and competing ambitions.', effects, changeReason: '', scratchpad: '' });
const response = (effects = []) => ({ reviewAfter: 12, foundation: foundation([influence('Independent shared pursuits', 2)]), upsert: [card(effects)],
    retain: [], retire: [], select: [selection()], effectUpdates: [], bridges: [] });
const future = { id: 'f1-selection', title: 'The candidates meet', category: 'Canon',
    premise: 'PRIVATE_FUTURE_OUTCOME must stay out of the writer packet.' };
async function pass(raw, state = emptyCampaign(), futureCards = [], flags = {}) {
    const messages = [{ index: 0, role: 'user', content: 'The decree has been rendered and signed. I am governor now.' },
        { index: 1, role: 'assistant', content: 'The household acknowledges the appointment.' }];
    const input = directorInput({ state, reference: { premise: 'An open-ended fantasy RP.' }, messages,
        previousUsable: state.revision > 0, futureCards, ...flags });
    let calls = 0;
    const result = await directorPass({ state, input, source: { chatId: 'example', messageCount: 2, referenceHash: 'r', fingerprint: 'f' },
        generate: async () => { calls++; return { text: JSON.stringify(raw), finishReason: 'stop' }; } });
    assert.equal(calls, 1);
    return result;
}
const decode = state => JSON.parse(campaignPayload(state).replace(/<\/?tale-fairy-context>/g, ''));

async function legacyState(effects) {
    const result = await pass(response());
    assert.equal(result.accepted, true, result.error);
    result.state.workingPlan.storyStructure.nodes[0].effects = structuredClone(effects);
    assert.equal(validCampaignState(result.state), true, 'historical prose remains readable');
    return result;
}

test('World Frame activities may change with an unchanged reminder and support every integer -10 through +10', async () => {
    const first = await pass(response());
    const before = structuredClone(first.state);
    assert.equal(DIRECTOR_SCHEMA.value.properties.foundation.properties.effects.minItems, 1);
    for (let weight = -10; weight <= 10; weight++) {
        const effects = [influence('Revised shared pursuits', weight, 'Newly relevant shared interests')];
        const raw = { ...response(), foundation: foundation(effects), upsert: [], select: [] };
        const result = await pass(raw, first.state);
        assert.equal(result.accepted, true, result.error);
        assert.equal(result.state.workingPlan.storyStructure.foundation.reminder, before.workingPlan.storyStructure.foundation.reminder);
        assert.deepEqual(decode(result.state).world_effects, effects);
        assert.ok(storyCardsHtml(result.state.workingPlan).includes(`>${weight > 0 ? '+' : ''}${weight}</span>`));
        assert.deepEqual(result.state.archive.at(-1).workingPlan, before.workingPlan);
    }
    assert.deepEqual(first.state, before);
});

test('fresh setup, automatic/manual review and full rebuild cannot remove all World Frame activities', async () => {
    const initial = await pass(response());
    for (const [state, flags] of [[emptyCampaign(), {}], [initial.state, {}], [initial.state, { resetPlan: true }]]) {
        const before = structuredClone(state);
        const rejected = await pass({ ...response(), foundation: foundation([]) }, state, [], flags);
        assert.equal(rejected.accepted, false);
        assert.match(rejected.error, /World Frame needs at least one weighted activity/);
        assert.equal(rejected.state, state);
        assert.deepEqual(state, before);
    }
    const omitted = response();
    delete omitted.foundation;
    assert.equal((await pass(omitted)).accepted, false, 'fresh setup must create a World Frame');
    const retained = await pass(omitted, initial.state);
    assert.equal(retained.accepted, true, retained.error);
    assert.deepEqual(retained.state.workingPlan.storyStructure.foundation, initial.state.workingPlan.storyStructure.foundation);
});

test('a saved empty World Frame is readable and authentic but the next Guide must populate it', async () => {
    const initial = await pass(response());
    initial.state.workingPlan.storyStructure.foundation.effects = [];
    const before = structuredClone(initial.state);
    assert.equal(validCampaignState(initial.state), true, 'historical readers stay compatible');
    const packet = { version: 1, selection: { preparedUsable: true }, payload: campaignPayload(initial.state),
        plannerState: { plannerContract: 15, campaignPreparation: initial.state } };
    assert.equal(generationContextEntries({ entries: [packet] }).length, 1);
    const input = directorInput({ state: initial.state, reference: {}, messages: [], previousUsable: true });
    assert.equal(JSON.parse(input.prompt).previous_preparation.required_effect_migration.foundation, true);
    const result = await pass(response(), initial.state);
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.state.workingPlan.storyStructure.foundation.effects.length, 1);
    assert.deepEqual(result.state.archive.at(-1).workingPlan, before.workingPlan);
    assert.deepEqual(initial.state, before);
    assert.equal(generationContextEntries({ entries: [packet] }).length, 1);
});

test('signed weights and generated scopes survive planning, storage, writer transport and display', async () => {
    const effects = [influence('Shared musical exploration', 1), influence('Local cooperation', 10),
        influence('Outside interference', -10), influence('A neutral condition', 0), influence('Strong opportunities', 8)];
    const result = await pass(response(effects));
    assert.equal(result.accepted, true, result.error);
    assert.equal(validCampaignState(result.state), true);
    assert.deepEqual(decode(result.state).story_context[0].effects, effects);
    const html = storyCardsHtml(result.state.workingPlan);
    for (const value of ['+1', '+8', '+10', '-10', 'Scope:', 'Shared musical exploration']) assert.ok(html.includes(value));
    assert.match(decode(result.state).effect_basis, /not calibrated probabilities or per-reply quotas/);
    assert.match(decode(result.state).effect_basis, /Past reactions are not fresh evidence/);
    assert.ok(DIRECTOR_SCHEMA.value.properties.upsert.items.properties.effects.items.required.includes('weight'));
});

test('invalid or incomplete numeric effects cannot replace a good saved card', async () => {
    const first = await pass(response([influence('Established cooperation')]));
    for (const invalid of [influence('Bad', 11), influence('Bad', -11), influence('Bad', 1.5), influence('Bad', '3'),
        { label: 'Bad', pressure: 'A cause', weight: 2 }, { label: 'Bad', pressure: 'A cause', scope: 'Here' }]) {
        const result = await pass(response([invalid]), first.state);
        assert.equal(result.accepted, true, result.error);
        assert.ok(result.withheldMaterial);
        assert.deepEqual(result.state.workingPlan.storyStructure.nodes, first.state.workingPlan.storyStructure.nodes);
        assert.equal(result.state.workingPlan.storyStructure.selection.length, 0);
    }
});

test('theme influences work without any selected arc or a mandatory event', async () => {
    const thematic = influence('Club camaraderie', 4, 'Shared club activities');
    const raw = { ...response(), foundation: foundation([thematic]), upsert: [], select: [] };
    const result = await pass(raw);
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(decode(result.state).world_effects, [thematic]);
    assert.equal(decode(result.state).story_context, undefined);
    assert.match(storyCardsHtml(result.state.workingPlan), /Activity foundations/);
    assert.match(decode(result.state).movement_basis, /One incident does not redefine the RP/);
});

test('effects change independently of a continuing card and never mutate the previous snapshot', async () => {
    const initial = await legacyState([{ label: 'Authority unsettled', pressure: 'A decision has not yet arrived.' }]);
    const before = JSON.stringify(initial.state);
    const updated = await pass({ ...response(), upsert: [], effectUpdates: [{ id: 'r1-domain', effects: [influence('Settled authority', 4)] }] }, initial.state);
    assert.equal(updated.accepted, true, updated.error);
    assert.equal(updated.state.workingPlan.storyStructure.nodes[0].status, 'active');
    assert.match(campaignPayload(updated.state), /Settled authority/);
    assert.doesNotMatch(campaignPayload(updated.state), /Authority unsettled|decision has not yet arrived/);
    assert.equal(JSON.stringify(initial.state), before);
    const cleared = await pass({ ...response(), upsert: [], effectUpdates: [{ id: 'r1-domain', effects: [] }] }, updated.state);
    assert.equal(cleared.accepted, true, cleared.error);
    assert.equal(decode(cleared.state).story_context[0].effects, undefined);
});

test('selected cards send every saved effect without a separate review decision, even above target', async () => {
    const effects = Array.from({ length: 8 }, (_, i) => ({ ...influence(`Retained activity ${i}`),
        pressure: `Activity ${i}: ${'Shared village activities provide varied opportunities. '.repeat(30)}` }));
    const initial = await pass(response(effects));
    assert.equal(initial.accepted, true, initial.error);
    const before = structuredClone(initial.state);
    for (const effectUpdates of [[], undefined]) {
        const updated = await pass({ ...response(), upsert: [], effectUpdates }, initial.state);
        assert.equal(updated.accepted, true, updated.error);
        assert.equal(updated.state.workingPlan.storyStructure.nodes[0].status, 'active');
        assert.deepEqual(decode(updated.state).story_context[0].effects, effects);
        assert.deepEqual(updated.state.workingPlan.storyStructure.nodes[0].effects, effects);
        assert.ok(updated.budgetNotices.some(notice => notice.includes('above soft target')));
        assert.deepEqual(updated.plannerNotices, []);
        assert.deepEqual(initial.state, before);
    }
});

test('ordinary automatic/manual reviews require complete migration, including offscreen cards and foundation', async () => {
    const legacy = [{ label: 'Old condition', pressure: 'A former descriptive concern.' }];
    const initial = await legacyState(legacy), state = initial.state;
    state.workingPlan.storyStructure.foundation.effects = structuredClone(legacy);
    state.workingPlan.storyStructure.nodes.push({ ...structuredClone(state.workingPlan.storyStructure.nodes[0]), id: 'r1-offscreen', kind: 'arc',
        parentId: 'r1-domain', status: 'dormant' });
    assert.equal(validCampaignState(state), true);
    const before = structuredClone(state);
    const input = directorInput({ state, reference: {}, messages: [], previousUsable: true });
    assert.deepEqual(JSON.parse(input.prompt).previous_preparation.required_effect_migration,
        { foundation: true, node_ids: ['r1-domain', 'r1-offscreen'] });

    const raw = { ...response(), upsert: [], select: [], foundation: foundation([influence('Shared opportunities', 8)]),
        effectUpdates: [{ id: 'r1-domain', effects: [influence('Household exchanges', 3)] }] };
    const incomplete = await pass(raw, state);
    assert.equal(incomplete.accepted, false);
    assert.match(incomplete.error, /conversion incomplete for r1-offscreen/);
    assert.deepEqual(incomplete.state, before);
    assert.deepEqual(state, before);

    const converted = await pass({ ...raw, effectUpdates: [...raw.effectUpdates,
        { id: 'r1-offscreen', effects: [influence('Independent village pursuits', 2)] }] }, state);
    assert.equal(converted.accepted, true, converted.error);
    for (const node of converted.state.workingPlan.storyStructure.nodes) {
        assert.equal(typeof node.effects[0].weight, 'number');
        assert.ok(node.effects[0].scope);
    }
    assert.equal(converted.state.workingPlan.storyStructure.foundation.effects[0].weight, 8);
    assert.deepEqual(state, before);
});

test('legacy conversion cannot assign default scores; cards may clear but World Frames need replacements', async () => {
    const initial = await legacyState([{ label: 'Legacy condition', pressure: 'Old facts.' }]);
    initial.state.workingPlan.storyStructure.foundation.effects = [{ label: 'Old frame', pressure: 'Old premise facts.' }];
    const raw = { ...response(), upsert: [], foundation: { reminder: '', changeReason: '', scratchpad: '' } };
    const omitted = await pass(raw, initial.state);
    assert.equal(omitted.accepted, false);
    assert.match(omitted.error, /conversion incomplete for foundation/);
    assert.deepEqual(omitted.state, initial.state);
    const cleared = await pass({ ...raw, foundation: foundation([]),
        effectUpdates: [{ id: 'r1-domain', effects: [] }] }, initial.state);
    assert.equal(cleared.accepted, false);
    assert.match(cleared.error, /World Frame needs at least one weighted activity/);
    assert.deepEqual(cleared.state, initial.state);
    const replaced = await pass({ ...raw, foundation: foundation([influence('Independent pursuits', 2)]),
        effectUpdates: [{ id: 'r1-domain', effects: [] }] }, initial.state);
    assert.equal(replaced.accepted, true, replaced.error);
    assert.deepEqual(replaced.state.workingPlan.storyStructure.nodes[0].effects, []);
    assert.equal(replaced.state.workingPlan.storyStructure.foundation.effects.length, 1);
});

test('fresh setup and full rebuild reject newly generated prose-only effects', async () => {
    const legacy = [{ label: 'Unscored concern', pressure: 'A description without an activity weight.' }];
    const initial = await legacyState(legacy);
    for (const [state, flags] of [[emptyCampaign(), {}], [initial.state, { resetPlan: true }]]) {
        const before = structuredClone(state);
        const freshResponse = effects => {
            const raw = response(effects), id = `r${state.revision + 1}-domain`;
            raw.upsert[0].id = raw.select[0].id = id;
            return raw;
        };
        for (const raw of [freshResponse(legacy), { ...freshResponse(), foundation: foundation(legacy) }]) {
            const result = await pass(raw, state, [], flags);
            assert.equal(result.accepted, false);
            assert.match(result.error, /Weighted activity conversion incomplete/);
            assert.deepEqual(result.state, before);
        }
        const result = await pass(freshResponse([influence('Fresh activity', 8)]), state, [], flags);
        assert.equal(result.accepted, true, result.error);
        assert.equal(result.state.workingPlan.storyStructure.nodes[0].effects[0].weight, 8);
    }
});

test('a canon bridge sends only its grounded opening and does not adopt a future by itself', async () => {
    const bridge = { futureId: future.id, basis: 'The appointment changes who can approach the household.',
        opening: 'Existing political contacts can open exchanges about the candidates, leaving participation open.',
        effects: [influence('Candidate diplomacy', 2, 'Contacts with the Royal Selection camps')] };
    const result = await pass({ ...response(), bridges: [bridge] }, emptyCampaign(), [future]);
    assert.equal(result.accepted, true, result.error);
    assert.equal(validCampaignState(result.state), true);
    assert.deepEqual(result.futureDecisions, []);
    assert.equal(decode(result.state).story_bridges[0].toward, future.title);
    assert.deepEqual(decode(result.state).story_bridges[0].effects, bridge.effects);
    assert.doesNotMatch(campaignPayload(result.state), /PRIVATE_FUTURE_OUTCOME|futureId|f1-selection/);
    assert.match(storyCardsHtml(result.state.workingPlan), /Possible story connections/);
    const next = await pass({ ...response(), upsert: [] }, result.state, [future]);
    assert.equal(next.accepted, true, next.error);
    assert.equal(decode(next.state).story_bridges, undefined, 'bridges are renewed, not persistent invitations');
});

test('unknown, duplicate or consumed future bridges are withheld', async () => {
    const bridge = { futureId: future.id, basis: 'Present support.', opening: 'A possible connection.', effects: [] };
    const unknown = await pass({ ...response(), bridges: [{ ...bridge, futureId: 'missing' }] }, emptyCampaign(), [future]);
    assert.equal(unknown.accepted, true, unknown.error);
    assert.equal(decode(unknown.state).story_bridges, undefined);
    const duplicates = await pass({ ...response(), bridges: [bridge, bridge] }, emptyCampaign(), [future]);
    assert.equal(decode(duplicates.state).story_bridges.length, 1);
    const adopted = await pass({ ...response(), bridges: [bridge], futureDecisions: [{ id: future.id, action: 'adopt',
        chapterId: 'r1-domain', reason: 'Accepted play has brought this prospect into the current situation.' }] }, emptyCampaign(), [future]);
    assert.equal(adopted.accepted, true, adopted.error);
    assert.equal(adopted.futureDecisions.length, 1);
    assert.equal(decode(adopted.state).story_bridges, undefined);
});

test('pre-weighted saved packets authenticate unchanged and rebuild with current interpretation rules', async () => {
    const first = await legacyState([{ label: 'Legacy influence', pressure: 'An older cause description.' }]);
    const historical = preWeightedCampaignPayload(first.state);
    assert.match(historical, /Apply ongoing pressure through causes and stakes/);
    const packet = { version: 1, selection: { preparedUsable: true }, payload: historical,
        plannerState: { plannerContract: 15, campaignPreparation: first.state } };
    assert.equal(generationContextEntries({ entries: [packet] }).length, 1);
    assert.match(campaignPayload(first.state), /Legacy prose has no assigned numeric strength/);
    assert.equal(packet.payload, historical);
});

test('generated scope, effect labels and bridge openings are escaped in the board', async () => {
    const raw = response([influence('<script>alert(1)</script>', -2, '<img src=x onerror=alert(1)>')]);
    const result = await pass(raw);
    assert.equal(result.accepted, true, result.error);
    const html = storyCardsHtml(result.state.workingPlan);
    assert.doesNotMatch(html, /<script>|<img src=/);
    assert.match(html, /&lt;script&gt;|&lt;img/);
});


test('old weighted-condition packets authenticate without mutating or replaying their old policy', async () => {
    const result = await pass(response([influence('Shared activities', 3)]));
    const historical = preActivityCampaignPayload(result.state);
    const packet = { version: 1, selection: { preparedUsable: true }, payload: historical,
        plannerState: { plannerContract: 15, campaignPreparation: result.state } };
    assert.equal(generationContextEntries({ entries: [packet] }).length, 1);
    assert.doesNotMatch(historical, /opportunities for the named kind of play/);
    assert.match(campaignPayload(result.state), /opportunities for the named kind of play/);
    assert.match(campaignPayload(result.state), /Static facts and character attitudes are context/);
    assert.match(storyCardsHtml(result.state.workingPlan), /Activity biases/);
    assert.equal(packet.payload, historical);
});
