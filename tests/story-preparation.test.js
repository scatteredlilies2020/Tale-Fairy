import test from 'node:test';
import assert from 'node:assert/strict';
import { preparationInput, preparationPass, HORIZON_SCHEMA, SCENE_SCHEMA, HORIZON_SYSTEM, SCENE_SYSTEM,
    HORIZON_TARGET, SCENE_TARGET } from '../extension/story-preparation.js';
import { storyInput, storyPass } from '../extension/bounded-story.js';
import { emptyCampaign, campaignPayload, validCampaignState } from '../extension/campaign-planner.js';
import { defaultPlannerState, saveState, loadPlannerState } from '../extension/state.js';
import { storyInputTokens } from '../extension/story-budget.js';
import { originalUnderstanding } from './helpers/rp-fixtures.js';

const messages = [{ index: 0, role: 'assistant', content: 'The council is repairing the village bridge.' },
    { index: 1, role: 'user', name: 'Ren', content: 'I stay for tea.' }];
const reference = { premise: 'A wandering life across distinct communities, discovering local customs and small magic.' };
const source = { chatId: 'story', referenceHash: 'reference', fingerprint: 'accepted', messageCount: 2 };
const understanding = () => originalUnderstanding({ storyScope: 'Journey across different communities.', experiences: 'Local customs, useful spells and shared meals.' });
const oldTrajectory = { id: 'r1-repair', focus: 'Repair the bridge', owner: 'Council', basis: 'A broken crossing.', drive: 'Restore traffic.',
    next: { when: 'Repairs end', change: 'Test the crossing.' }, later: { when: 'The test passes', change: 'Use the bridge.' } };
const opportunity = { id: 'r2-orchard', focus: 'Cinderwick harvest kitchen', owner: 'Orchard cooks', basis: 'Proposed stop along the northern route.', drive: 'Share ways of preserving fruit.',
    experience: 'At Cinderwick, cooks trade smoked-pear recipes around a communal oven; a heat-storing pebble spell keeps the pots warm.',
    next: { when: 'Visitors join a cooking afternoon', change: 'A shared recipe and pebble charm can travel with them.' },
    later: { when: 'They reach the colder upland villages', change: 'The charm and recipes can find different uses in winter kitchens.' } };
const local = () => ({ direction: 'Wandering life.', threads: 'Different communities.', consequences: [],
    developments: [{ id: 'r1-bridge', kind: 'arc', owner: 'Council', control: 'npc', trajectoryIds: [],
        question: 'Restore the crossing?', initiative: 'Workers fit new planks.', resolution: 'The crossing reopens.', beyond: 'River traffic resumes.',
        access: { route: 'local', basis: 'Workers are in the village.' } }],
    goal: [{ subjectId: 'r1-bridge', scope: 'near-term', aim: 'Restore the crossing.', reachedWhen: 'The crossing reopens.' }] });
const wire = value => ({ text: JSON.stringify(value), finishReason: 'stop' });
async function stuck() {
    const state = emptyCampaign();
    const result = await storyPass({ state, source, input: storyInput({ reference, state, messages }), generate: async () => wire({
        plan: { ...local(), rpUnderstanding: understanding() }, progression: { upsert: [oldTrajectory], retire: [] },
        exits: [], observations: [], selected_material: [],
    }) });
    assert.equal(result.accepted, true, result.error); return result.state;
}
const horizon = () => ({ rpUnderstanding: understanding(), progression: { upsert: [structuredClone(opportunity)], retire: [{ id: 'r1-repair', reason: 'Local repair remains local work.' }] } });
const scene = () => ({ plan: local(), exits: [], observations: [], selected_material: [] });
const inputFor = (state, extra = {}) => preparationInput({ reference, state, messages, playerNames: ['Ren'], previousUsable: true, ...extra });
async function run(state, responses = [horizon(), scene()], extra = {}) {
    const calls = [], input = inputFor(state, extra);
    const result = await preparationPass({ state, input, source, generate: async (prompt, system, schema, metadata) => {
        calls.push({ prompt: JSON.parse(prompt), system, schema, metadata });
        const value = responses[calls.length - 1];
        if (value instanceof Error) throw value;
        return typeof value === 'string' ? { text: value } : wire(value);
    } });
    return { ...result, calls, input };
}

test('workshop input excludes entrenched local work, goals, writer selection and archives', async () => {
    const state = await stuck();
    state.workingPlan.direction = 'LOCAL-ONLY DIRECTION';
    state.archive.push({ secret: 'ARCHIVE-ONLY' });
    const input = inputFor(state), broad = JSON.parse(input.horizonInput.prompt), narrow = JSON.parse(input.prompt);
    assert.equal(broad.previous_plan, undefined);
    assert.doesNotMatch(input.horizonInput.prompt, /r1-bridge|LOCAL-ONLY|ARCHIVE-ONLY|selected_material|goal/);
    assert.deepEqual(broad.previous_horizon.trajectories, [oldTrajectory]);
    assert.deepEqual(broad.source_reference, reference);
    assert.equal(broad.accepted_messages.at(-1).index, 1);
    assert.equal(narrow.previous_plan.trajectories, undefined);
    assert.equal(narrow.previous_plan.rpUnderstanding, undefined);
    assert.equal(narrow.previous_plan.developments[0].id, 'r1-bridge');
    assert.ok(HORIZON_TARGET > SCENE_TARGET);
    assert.ok(storyInputTokens('', HORIZON_SYSTEM, HORIZON_SCHEMA) < 2400);
    assert.ok(storyInputTokens('', SCENE_SYSTEM, SCENE_SCHEMA) < 2700);
});

test('two stages replace narrow future while preserving unfinished local work and quiet selection', async () => {
    const state = await stuck(), before = structuredClone(state), result = await run(state);
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(result.calls.map(c => c.schema.name), [HORIZON_SCHEMA.name, SCENE_SCHEMA.name]);
    assert.deepEqual(result.calls[1].prompt.prepared_horizon.trajectories, [opportunity]);
    assert.deepEqual(result.state.workingPlan.trajectories, [opportunity]);
    assert.deepEqual(result.state.workingPlan.developments, state.workingPlan.developments);
    assert.deepEqual(result.state.selectedMaterial, []);
    assert.equal(campaignPayload(result.state), '');
    assert.equal(validCampaignState(result.state), true);
    assert.equal(result.state.revision, 2);
    assert.equal(result.state.archive.at(-1).progressionChanges.retire[0].id, 'r1-repair');
    assert.equal(JSON.stringify(state), JSON.stringify(before));
    const restored = loadPlannerState(JSON.parse(JSON.stringify(saveState({}, { ...defaultPlannerState(), campaignPreparation: result.state })))).campaignPreparation;
    assert.deepEqual(restored.workingPlan.trajectories, [opportunity]);
});

test('wider context uses verified changes instead of the rolling scene tail', async () => {
    const history = Array.from({ length: 12 }, (_, index) => ({ index, role: index % 2 ? 'user' : 'assistant', content: `Accepted text ${index}.` }));
    const input = inputFor(await stuck(), { messages: history, reviewedMessageCount: 9 });
    assert.deepEqual(JSON.parse(input.horizonInput.prompt).accepted_messages.map(m => m.index), [9, 10, 11]);
    assert.equal(JSON.parse(input.horizonInput.prompt).coverage.wider_lens_omitted_reviewed_messages, 9);
    assert.deepEqual(JSON.parse(input.prompt).accepted_messages.map(m => m.index), history.map(m => m.index));
    assert.deepEqual(input.horizonInput.evidenceMessages.map(m => m.index), [9, 10, 11]);
});

test('wider lens keeps the latest exchange on a manual review and all play without coverage', async () => {
    const state = await stuck();
    const history = Array.from({ length: 6 }, (_, index) => ({ index, role: index % 2 ? 'user' : 'assistant', content: `Accepted text ${index}.` }));
    for (const [reviewedMessageCount, expected] of [[6, [4, 5]], [0, [0, 1, 2, 3, 4, 5]]]) {
        const input = inputFor(state, { messages: history, reviewedMessageCount });
        assert.deepEqual(JSON.parse(input.horizonInput.prompt).accepted_messages.map(m => m.index), expected);
    }
});

test('scene cannot overwrite the separately prepared horizon or inject it wholesale', async () => {
    const invalid = scene(); invalid.plan.rpUnderstanding = understanding(); invalid.progression = { upsert: [], retire: [] };
    const result = await run(await stuck(), [horizon(), invalid, scene()]);
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.calls.length, 3);
    assert.equal(result.recovery.status, 'complete');
    assert.match(result.calls[2].prompt.response_correction.error, /unknown|Unexpected|not allowed/i);
    assert.deepEqual(result.state.workingPlan.trajectories, [opportunity]);
    assert.deepEqual(result.calls[2].prompt.prepared_horizon, result.calls[1].prompt.prepared_horizon);
});

test('unchanged wider possibilities persist through an unrelated local review', async () => {
    const state = (await run(await stuck())).state;
    const next = await run(state, [{ rpUnderstanding: understanding(), progression: { upsert: [], retire: [] } }, scene()]);
    assert.equal(next.accepted, true, next.error);
    assert.deepEqual(next.state.workingPlan.trajectories, [opportunity]);
});

test('explicit refusal can retire an opportunity without declaring it happened', async () => {
    const state = (await run(await stuck())).state;
    const next = await run(state, [{ rpUnderstanding: understanding(), progression: { upsert: [], retire: [{ id: opportunity.id, reason: 'The player declined this route.' }] } }, scene()],
        { messages: [...messages, { index: 2, role: 'user', name: 'Ren', content: 'I do not want to visit orchards.' }] });
    assert.equal(next.accepted, true, next.error);
    assert.deepEqual(next.state.workingPlan.trajectories, []);
    assert.deepEqual(next.state.workingPlan.consequences, []);
});

for (const [label, responses, count] of [
    ['horizon correction', ['bad JSON', horizon(), scene()], 3],
    ['scene correction', [horizon(), 'bad JSON', scene()], 3],
]) test(`${label} spends the one shared repair credit`, async () => {
    const result = await run(await stuck(), responses);
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.calls.length, count);
    assert.equal(result.recovery.status, 'complete');
    assert.ok(result.calls.filter(c => c.metadata.recoveryReason).length === 1);
});

for (const [label, responses, count] of [
    ['both stages invalid', ['bad', horizon(), 'bad'], 3],
    ['horizon twice invalid', ['bad', 'bad'], 2],
    ['scene twice invalid', [horizon(), 'bad', 'bad'], 3],
    ['horizon transport failure', [new Error('offline')], 1],
    ['scene transport failure', [horizon(), new Error('offline')], 2],
]) test(`${label} keeps the entire original state, with no partial wider save`, async () => {
    const state = await stuck(), before = structuredClone(state), result = await run(state, responses);
    assert.equal(result.accepted, false);
    assert.equal(result.calls.length, count);
    assert.equal(result.state, state);
    assert.equal(JSON.stringify(state), JSON.stringify(before));
});

test('a new trajectory needs substantive experience and cannot assign the player ownership', async () => {
    for (const mutate of [value => delete value.progression.upsert[0].experience, value => value.progression.upsert[0].owner = 'Ren']) {
        const invalid = horizon(); mutate(invalid);
        const result = await run(await stuck(), [invalid, invalid]);
        assert.equal(result.accepted, false);
        assert.equal(result.calls.length, 2);
    }
});

test('scene witnesses are checked against the actual sent request, not wider context', async () => {
    const invalid = scene(); invalid.plan.consequences = [{ id: 'built', text: 'The bridge reopened.' }];
    invalid.observations = [{ id: 'built', evidence: [{ index: 99, span: 0 }] }];
    const result = await run(await stuck(), [horizon(), invalid, invalid]);
    assert.equal(result.accepted, false);
    assert.match(result.error, /supplied/);
});

test('valid substantial local preparation survives without a shortening request', async () => {
    const value = scene();
    value.plan.developments[0].access.basis = 'Village workers beside the crossing can describe their work and show the planks still waiting to be fitted.';
    value.plan.developments[0].beyond = 'The reopened crossing lets river traders return to the square, where they can share news of their different home communities.';
    const result = await run(await stuck(), [horizon(), value]);
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.calls.length, 2);
    assert.equal(result.state.workingPlan.developments[0].beyond, value.plan.developments[0].beyond);
});

test('complete wider experiences use safety ceilings rather than tiny drafting limits', async () => {
    const value = horizon();
    const row = value.progression.upsert[0];
    row.experience = 'At the communal oven, families each contribute a different variety of stored fruit. The cook has kept handwritten records of past seasons, with grease-stained recipes beside sketches of the orchards. Visitors can compare how the same preservation spell changes with different soils, and make a small jar for the road.';
    row.next.change = 'The cooks compare two batches in a shared tasting, discovering that smoke from the upland apple wood changes how long the pear preserves keep; the old recipe book gains a second method rather than a single winning recipe.';
    const result = await run(await stuck(), [value, scene()]);
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.calls.length, 2);
    assert.deepEqual(result.state.workingPlan.trajectories, [row]);
    assert.equal(validCampaignState(result.state), true);
});

test('a deliberately closed story permits an empty horizon', async () => {
    const result = await run(await stuck(), [{ rpUnderstanding: understanding(), progression: { upsert: [], retire: [{ id: oldTrajectory.id, reason: 'The bounded story has ended.' }] } }, scene()]);
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(result.state.workingPlan.trajectories, []);
});

test('per-stage fitting preserves fresh player choices and the complete source reference', async () => {
    const text = 'A changed player premise. '.repeat(800);
    const input = inputFor(await stuck(), { messages: [...messages, { index: 2, role: 'user', name: 'Ren', content: text }], reviewedMessageCount: 2 });
    for (const stage of [input, input.horizonInput]) {
        const payload = JSON.parse(stage.prompt);
        assert.deepEqual(payload.source_reference, reference);
        const latest = payload.accepted_messages.at(-1);
        assert.equal(latest.index, 2);
        assert.equal(latest.spans.map(s => Array.isArray(s) ? s[1] : s.text).join(''), text);
    }
});
