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
const response = (effects = []) => ({ reviewAfter: 12, foundation: foundation([]), upsert: [card(effects)],
    retain: [], retire: [], select: [selection()], effectUpdates: [], bridges: [] });
const future = { id: 'f1-selection', title: 'The candidates meet', category: 'Canon',
    premise: 'PRIVATE_FUTURE_OUTCOME must stay out of the writer packet.' };
async function pass(raw, state = emptyCampaign(), futureCards = []) {
    const messages = [{ index: 0, role: 'user', content: 'The decree has been rendered and signed. I am governor now.' },
        { index: 1, role: 'assistant', content: 'The household acknowledges the appointment.' }];
    const input = directorInput({ state, reference: { premise: 'An open-ended fantasy RP.' }, messages,
        previousUsable: state.revision > 0, futureCards });
    let calls = 0;
    const result = await directorPass({ state, input, source: { chatId: 'example', messageCount: 2, referenceHash: 'r', fingerprint: 'f' },
        generate: async () => { calls++; return { text: JSON.stringify(raw), finishReason: 'stop' }; } });
    assert.equal(calls, 1);
    return result;
}
const decode = state => JSON.parse(campaignPayload(state).replace(/<\/?tale-fairy-context>/g, ''));

test('signed weights and generated scopes survive planning, storage, writer transport and display', async () => {
    const effects = [influence('Shared musical exploration', 1), influence('Local cooperation', 10),
        influence('Outside interference', -3), influence('A neutral condition', 0)];
    const result = await pass(response(effects));
    assert.equal(result.accepted, true, result.error);
    assert.equal(validCampaignState(result.state), true);
    assert.deepEqual(decode(result.state).story_context[0].effects, effects);
    const html = storyCardsHtml(result.state.workingPlan);
    for (const value of ['+1', '+10', '-3', 'Scope:', 'Shared musical exploration']) assert.ok(html.includes(value));
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
    const initial = await pass(response([{ label: 'Authority unsettled', pressure: 'A decision has not yet arrived.' }]));
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

test('a new-format review cannot silently carry unreviewed selected effects forward', async () => {
    const initial = await pass(response([influence('A temporary influence')]));
    const updated = await pass({ ...response(), upsert: [] }, initial.state);
    assert.equal(updated.accepted, true, updated.error);
    assert.equal(updated.state.workingPlan.storyStructure.nodes[0].status, 'active');
    assert.equal(decode(updated.state).story_context[0].effects, undefined);
    assert.match(updated.plannerNotices.join(' '), /Unreviewed selected effects withheld/);
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
    const first = await pass(response([{ label: 'Legacy influence', pressure: 'An older cause description.' }]));
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
