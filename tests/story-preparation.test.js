import test from 'node:test';
import assert from 'node:assert/strict';
import { preparationInput, preparationPass, HORIZON_SCHEMA, SCENE_SCHEMA, HORIZON_SYSTEM, SCENE_SYSTEM,
    HORIZON_TARGET, SCENE_TARGET } from '../extension/story-preparation.js';
import { storyInput, storyPass } from '../extension/bounded-story.js';
import { emptyCampaign, campaignPayload, campaignPayloadBudget, validCampaignState } from '../extension/campaign-planner.js';
import { defaultPlannerState, saveState, loadPlannerState } from '../extension/state.js';
import { storyInputTokens } from '../extension/story-budget.js';
import { originalUnderstanding } from './helpers/rp-fixtures.js';
import { workingPlanProjection } from '../extension/working-plan.js';

const messages = [{ index: 0, role: 'assistant', content: 'The council is repairing the village bridge.' },
    { index: 1, role: 'user', name: 'Ren', content: 'I stay for tea.' }];
const reference = { premise: 'A wandering life across distinct communities, discovering local customs and small magic.' };
const source = { chatId: 'story', referenceHash: 'reference', fingerprint: 'accepted', messageCount: 2 };
const understanding = () => originalUnderstanding({ storyScope: 'Journey across different communities.', experiences: 'Local customs, useful spells and shared meals.' });
const storyLife = () => ({ scope: 'open', premise: 'A wandering life.', currentEpisode: 'A bridge repair.',
    continuingLife: 'Travel, companionship, different customs and useful small magic.', horizonIds: [] });
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
const horizon = () => ({ rpUnderstanding: understanding(), storyLife: storyLife(), throughline: [], progression: { upsert: [structuredClone(opportunity)], retire: [{ id: 'r1-repair', reason: 'Local repair remains local work.' }] } });
const clearOutlook = () => ({ action: 'clear', reason: 'No future selected for this bounded test.', material: [] });
const scene = () => ({ plan: { ...local(), openings: [] }, exits: [], observations: [], selected_material: [], outlook: clearOutlook() });
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
    assert.ok(storyInputTokens('', HORIZON_SYSTEM, HORIZON_SCHEMA) < 2800);
    assert.ok(storyInputTokens('', SCENE_SYSTEM, SCENE_SCHEMA) < 3200);
});

test('two stages replace narrow future while preserving unfinished local work and quiet selection', async () => {
    const state = await stuck(), before = structuredClone(state), result = await run(state);
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(result.calls.map(c => c.schema.name), [HORIZON_SCHEMA.name, SCENE_SCHEMA.name]);
    assert.deepEqual(result.calls[1].prompt.prepared_horizon.trajectories, [opportunity]);
    assert.deepEqual(result.calls[1].prompt.horizon_changes, { upserted: [opportunity.id], retired: ['r1-repair'], retained: [opportunity.id] });
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
    const state = await stuck(); state.workingPlan.storyLife = storyLife();
    const input = inputFor(state, { messages: history, reviewedMessageCount: 9 });
    assert.deepEqual(JSON.parse(input.horizonInput.prompt).accepted_messages.map(m => m.index), [9, 10, 11]);
    assert.equal(JSON.parse(input.horizonInput.prompt).coverage.wider_lens_omitted_reviewed_messages, 9);
    assert.deepEqual(JSON.parse(input.prompt).accepted_messages.map(m => m.index), history.map(m => m.index));
    assert.deepEqual(input.horizonInput.evidenceMessages.map(m => m.index), [9, 10, 11]);
});

test('wider lens keeps the latest exchange on a manual review and all play without coverage', async () => {
    const state = await stuck();
    state.workingPlan.storyLife = storyLife();
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
    const next = await run(state, [{ rpUnderstanding: understanding(), storyLife: storyLife(), throughline: [], progression: { upsert: [], retire: [] } }, scene()]);
    assert.equal(next.accepted, true, next.error);
    assert.deepEqual(next.state.workingPlan.trajectories, [opportunity]);
});

test('explicit refusal can retire an opportunity without declaring it happened', async () => {
    const state = (await run(await stuck())).state;
    const next = await run(state, [{ rpUnderstanding: understanding(), storyLife: storyLife(), throughline: [], progression: { upsert: [], retire: [{ id: opportunity.id, reason: 'The player declined this route.' }] } }, scene()],
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
    const result = await run(await stuck(), [{ rpUnderstanding: understanding(), storyLife: storyLife(), throughline: [], progression: { upsert: [], retire: [{ id: oldTrajectory.id, reason: 'The bounded story has ended.' }] } }, scene()]);
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

function openedScene() {
    const value = scene();
    value.plan.openings = [{ trajectoryId: opportunity.id,
        circumstance: 'At tea, a visiting orchard cook offers warm smoked pears and describes Cinderwick’s communal oven.',
        access: { route: 'contact', basis: 'A proposed traveler sharing the village tea table; a visit north remains optional.' } }];
    value.plan.goal.push({ subjectId: opportunity.id, scope: 'near-term', aim: 'Share the orchard kitchen’s preservation craft.',
        reachedWhen: 'Visitors have compared preserves and tried the pebble charm, or left it aside.' });
    value.selected_material = [];
    value.outlook = { action: 'replace', reason: 'An optional route to a substantive future.', material: [{ trajectoryId: opportunity.id,
        developing: 'If the travelers visit Cinderwick, cooks can compare smoked-pear recipes around the communal oven and share a heat-storing pebble spell.',
        lasting: 'If they take the charm north, upland winter kitchens can adapt the recipe to their local fruit.' }] };
    return value;
}

test('two openings fit beside four unfinished local slots and reach the writer without exposing the private horizon', async () => {
    const state = await stuck();
    for (let n = 2; n <= 4; n++) state.workingPlan.developments.push({ ...structuredClone(local().developments[0]), id: `r1-task${n}` });
    Object.assign(state, workingPlanProjection(state.workingPlan));
    assert.equal(validCampaignState(state), true);
    const value = openedScene(); value.plan.developments = structuredClone(state.workingPlan.developments);
    const wider = horizon();
    wider.progression.upsert.push({ ...structuredClone(opportunity), id: 'r2-upland', focus: 'Upland winter kitchens' });
    value.plan.openings.push({ trajectoryId: 'r2-upland', circumstance: 'The orchard cook describes a later road toward the upland kitchens.',
        access: { route: 'information', basis: 'He has traveled that road; reaching the kitchens would take another journey.' } });
    const result = await run(state, [wider, value]);
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.state.workingPlan.developments.length, 4);
    assert.equal(result.state.developments.length, 6);
    assert.equal(validCampaignState(result.state), true);
    assert.match(campaignPayload(result.state), /smoked pears|communal oven/);
    assert.match(campaignPayload(result.state), /upland winter kitchens/);
    assert.doesNotMatch(campaignPayload(result.state), /r2-orchard|trajectoryId|drive|goal|orchard cook offers.*instructions/);
    const restored = loadPlannerState(JSON.parse(JSON.stringify(saveState({}, { ...defaultPlannerState(), campaignPreparation: result.state }))));
    assert.deepEqual(restored.campaignPreparation.workingPlan.openings, value.plan.openings);
});

for (const mutation of ['unknown', 'duplicate', 'private', 'bare-horizon']) test(`opening validation rejects ${mutation} selection`, async () => {
    const value = openedScene();
    if (mutation === 'unknown') value.plan.openings[0].trajectoryId = 'missing';
    if (mutation === 'duplicate') value.plan.openings.push(structuredClone(value.plan.openings[0]));
    if (mutation === 'private') value.plan.openings[0].access.route = 'none';
    if (mutation === 'bare-horizon') value.plan.openings = [];
    const result = await run(await stuck(), [horizon(), value, value]);
    assert.equal(result.accepted, false);
    assert.equal(result.calls.length, 3);
});

test('quiet play can withdraw an opening without closing anything or erasing its future', async () => {
    const first = await run(await stuck(), [horizon(), openedScene()]);
    assert.equal(first.accepted, true, first.error);
    const next = await run(first.state, [{ rpUnderstanding: understanding(), storyLife: storyLife(), throughline: [], progression: { upsert: [], retire: [] } }, scene()]);
    assert.equal(next.accepted, true, next.error);
    assert.deepEqual(next.state.workingPlan.openings, []);
    assert.deepEqual(next.state.workingPlan.trajectories, [opportunity]);
    assert.deepEqual(next.state.selectedMaterial, []);
    assert.deepEqual(next.state.archive.at(-1).transitions, []);
});

const unchangedHorizon = () => ({ rpUnderstanding: understanding(), storyLife: storyLife(), throughline: [], progression: { upsert: [], retire: [] } });
const keepScene = () => {
    const value = openedScene();
    value.outlook = { action: 'keep', reason: 'Only the immediate routine changed; the optional journey remains unplayed.', material: [] };
    value.selected_material = [];
    return value;
};

test('five routine reviews update the present without shrinking, rerolling or enacting the selected future', async () => {
    let state = (await run(await stuck(), [horizon(), openedScene()])).state;
    const future = structuredClone(state.workingPlan.outlook);
    for (let n = 0; n < 5; n++) {
        const value = keepScene(); value.plan.developments[0].initiative = `The cook sets out cup ${n + 1}.`;
        value.plan.openings[0].circumstance = `If the travelers later visit the northbound tea stall, the orchard cook has smoked pears and a map to Cinderwick. Visit ${n + 1} remains only a possibility.`;
        const result = await run(state, [unchangedHorizon(), value]);
        assert.equal(result.accepted, true, result.error);
        assert.equal(result.calls.length, 2);
        assert.deepEqual(result.calls[1].prompt.previous_outlook, future);
        assert.equal(result.calls[1].prompt.previous_plan.outlook, undefined);
        assert.equal(result.calls[0].prompt.previous_outlook, undefined);
        assert.deepEqual(result.state.workingPlan.outlook, future);
        assert.equal(result.state.selectedMaterial[0].developing, future[0].developing);
        assert.equal(result.state.selectedMaterial[0].lasting, future[0].lasting);
        assert.match(result.state.selectedMaterial[0].available, new RegExp(`Visit ${n + 1}`));
        assert.doesNotMatch(campaignPayload(result.state), /sets out cup/);
        assert.deepEqual(result.state.workingPlan.consequences, []);
        assert.equal(validCampaignState(result.state), true);
        assert.doesNotMatch(campaignPayload(result.state), /Only the immediate|action|trajectoryId|r2-orchard/);
        state = loadPlannerState(JSON.parse(JSON.stringify(saveState({}, { ...defaultPlannerState(), campaignPreparation: result.state })))).campaignPreparation;
    }
});

for (const invalid of ['missing-route', 'private-route', 'retired', 'revised', 'missing-prior', 'keep-with-material']) {
    test(`outlook cannot carry blindly through ${invalid}`, async () => {
        let state = (await run(await stuck(), [horizon(), openedScene()])).state;
        const wider = unchangedHorizon(), value = keepScene();
        if (invalid === 'missing-route') { value.plan.openings = []; value.plan.goal.pop(); }
        if (invalid === 'private-route') value.plan.openings[0].access.route = 'none';
        if (invalid === 'retired') wider.progression.retire = [{ id: opportunity.id, reason: 'The player declined the trip.' }];
        if (invalid === 'revised') wider.progression.upsert = [{ ...opportunity, experience: 'A newly changed premise.' }];
        if (invalid === 'missing-prior') { delete state.workingPlan.outlook; }
        if (invalid === 'keep-with-material') value.outlook.material = openedScene().outlook.material;
        const result = await run(state, [wider, value, value]);
        assert.equal(result.accepted, false);
        assert.equal(result.state, state);
        assert.equal(result.calls.length, 3);
    });
}

test('outlook follows a renewed local undertaking after entry, without treating a proposal as history', async () => {
    const state = (await run(await stuck(), [horizon(), openedScene()])).state;
    const value = keepScene();
    value.plan.developments[0].trajectoryIds = [opportunity.id];
    value.plan.developments[0].initiative = 'If the travelers take the northern road, the orchard cooks have their communal oven ready.';
    value.plan.openings[0].circumstance = value.plan.developments[0].initiative;
    const result = await run(state, [unchangedHorizon(), value]);
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(result.state.selectedMaterial[0].subjectIds, [opportunity.id]);
    assert.equal(validCampaignState(result.state), true);
});

test('accepted participation can explicitly advance the future; refusal can withdraw it without manufacturing closure', async () => {
    const first = (await run(await stuck(), [horizon(), openedScene()])).state;
    const revised = openedScene();
    revised.outlook.reason = 'Accepted travel brings the kitchen experience into reach.';
    revised.outlook.material[0].developing = 'If the party shares its smoked-pear recipe north, the winter cooks can test a new oat-and-pear preserve.';
    revised.outlook.material[0].lasting = 'If the oat preserve keeps through winter, two villages can exchange their seasonal recipe notebooks.';
    const next = await run(first, [unchangedHorizon(), revised]);
    assert.equal(next.accepted, true, next.error);
    assert.notEqual(next.state.selectedMaterial[0].developing, first.selectedMaterial[0].developing);
    const cleared = scene();
    cleared.outlook.reason = 'The traveler explicitly declined that trip.';
    const last = await run(next.state, [unchangedHorizon(), cleared]);
    assert.equal(last.accepted, true, last.error);
    assert.deepEqual(last.state.workingPlan.outlook, []);
    assert.deepEqual(last.state.selectedMaterial, []);
    assert.deepEqual(last.state.workingPlan.trajectories, [opportunity]);
    assert.deepEqual(last.state.archive.at(-1).transitions, []);
});

test('active current-only selection cannot label the next chore as a long-term horizon', async () => {
    const value = scene();
    value.selected_material = [{ subjectIds: ['r1-bridge'], available: 'Tea is ready.', developing: 'Wash the cups.', lasting: 'Have supper.' }];
    const result = await run(await stuck(), [horizon(), value, value]);
    assert.equal(result.accepted, false);
    assert.match(result.error, /Unknown|unexpected|not allowed|array/i);
});

test('saved state cannot substitute local horizons for its durable outlook', async () => {
    const state = (await run(await stuck(), [horizon(), openedScene()])).state;
    state.selectedMaterial[0].lasting = 'Have supper.';
    assert.equal(validCampaignState(state), false);
});

test('outlook composition exposes authored entry conditions, never private access explanations or motives', async () => {
    const value = openedScene();
    value.plan.openings[0].access.basis = 'PRIVATE-MOTIVE: a secret patron finances this visit; only the cook and the kitchen are observable.';
    const result = await run(await stuck(), [horizon(), value]);
    assert.equal(result.accepted, true, result.error);
    assert.match(campaignPayload(result.state), /visiting orchard cook/);
    assert.doesNotMatch(campaignPayload(result.state), /PRIVATE-MOTIVE|secret patron|reason|trajectoryId/);
});

test('local outlook access cannot silently copy an unselected private initiative into writer context', async () => {
    const state = (await run(await stuck(), [horizon(), openedScene()])).state;
    const value = keepScene();
    value.plan.openings = []; value.plan.goal.pop();
    value.plan.developments[0].trajectoryIds = [opportunity.id];
    value.selected_material = [];
    const result = await run(state, [unchangedHorizon(), value, value]);
    assert.equal(result.accepted, false);
    assert.match(result.error, /entry and prerequisites/);
});

test('untrusted and rebuilt context never inherits a previous selected future', async () => {
    const state = (await run(await stuck(), [horizon(), openedScene()])).state;
    for (const extra of [{ previousUsable: false }, { resetPlan: true }]) {
        const input = inputFor(state, extra);
        assert.deepEqual(JSON.parse(input.prompt).previous_outlook, []);
    }
    const value = keepScene();
    const rejected = await run(state, [unchangedHorizon(), value, value], { previousUsable: false });
    assert.equal(rejected.accepted, false);
    assert.match(rejected.error, /No previous outlook/);
});

const throughline = () => [{ focus: 'Discover different communities through their seasonal crafts.',
    basis: 'The journey premise and the traveler remaining open to local customs.', trajectoryIds: [opportunity.id] }];

test('story direction survives routine reviews and reload while staying private and read-only to the scene', async () => {
    const wider = horizon(); wider.throughline = throughline();
    const first = await run(await stuck(), [wider, openedScene()]);
    assert.equal(first.accepted, true, first.error);
    const saved = loadPlannerState(JSON.parse(JSON.stringify(saveState({}, { ...defaultPlannerState(), campaignPreparation: first.state }))));
    assert.deepEqual(saved.campaignPreparation.workingPlan.throughline, throughline());
    const unchanged = unchangedHorizon(); unchanged.throughline = throughline();
    const next = await run(saved.campaignPreparation, [unchanged, keepScene()]);
    assert.equal(next.accepted, true, next.error);
    assert.deepEqual(next.calls[0].prompt.previous_horizon.throughline, throughline());
    assert.deepEqual(next.calls[1].prompt.prepared_horizon.throughline, throughline());
    assert.equal(next.calls[1].prompt.previous_plan.throughline, undefined);
    assert.deepEqual(next.state.workingPlan.outlook, first.state.workingPlan.outlook);
    assert.doesNotMatch(campaignPayload(next.state), /throughline|seasonal crafts|traveler remaining open/);
    const tampered = keepScene(); tampered.plan.throughline = [];
    const rejected = await run(next.state, [unchanged, tampered, tampered]);
    assert.equal(rejected.accepted, false);
});

for (const ids of [['missing'], [opportunity.id, opportunity.id], ['r1-repair']]) {
    test(`throughline links require distinct retained substantive trajectories: ${ids}`, async () => {
        const wider = horizon(); wider.throughline = throughline(); wider.throughline[0].trajectoryIds = ids;
        const result = await run(await stuck(), [wider, wider]);
        assert.equal(result.accepted, false);
        assert.equal(result.calls.length, 2, 'invalid horizon never reaches scene selection');
        assert.match(result.error, /throughline/);
    });
}

for (const mainAccess of ['local', 'none']) test(`independent future selection respects ${mainAccess} story access`, async () => {
    const wider = horizon(); wider.throughline = throughline();
    wider.progression.upsert.push({ ...structuredClone(opportunity), id: 'r2-supper', focus: 'A separate neighborhood supper' });
    const side = openedScene();
    side.plan.openings[0].access.route = mainAccess;
    side.plan.openings.push({ trajectoryId: 'r2-supper', circumstance: 'The neighboring inn is sharing supper recipes.',
        access: { route: 'local', basis: 'An independent evening offer.' } });
    side.plan.goal.push({ subjectId: 'r2-supper', scope: 'side-thread', aim: 'Compare recipes.', reachedWhen: 'The supper finishes.' });
    side.outlook.material[0].trajectoryId = 'r2-supper';
    const result = await run(await stuck(), [wider, side, side]);
    assert.equal(result.accepted, true, result.error);
});

test('a deliberate pause can clear the selected future without erasing the story direction', async () => {
    const wider = horizon(); wider.throughline = throughline();
    const value = openedScene(); value.outlook = clearOutlook();
    const result = await run(await stuck(), [wider, value]);
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(result.state.workingPlan.throughline, throughline());
    assert.deepEqual(result.state.workingPlan.outlook, []);
});

function twoFutures() {
    const wider = horizon(), value = openedScene();
    wider.storyLife.horizonIds = [opportunity.id, 'r2-music'];
    wider.throughline = throughline();
    wider.progression.upsert.push({ ...structuredClone(opportunity), id: 'r2-music', focus: 'A traveling songbook',
        experience: 'Two inn musicians collect different verses along the road.' });
    value.plan.openings.push({ trajectoryId: 'r2-music', circumstance: 'At the next inn, two musicians are trading verses from their travels.',
        access: { route: 'contact', basis: 'A possible later stop, not travel already taken.' } });
    value.outlook.material.push({ trajectoryId: 'r2-music', developing: 'If they share songs at the inn, different regional verses can become a shared songbook.',
        lasting: 'If the collection travels, the musicians can discover the same song transformed by communities along the road.' });
    return { wider, value };
}

test('story life stays private, persists independently and cannot be overwritten by local selection', async () => {
    const { wider, value } = twoFutures();
    const first = await run(await stuck(), [wider, value]);
    assert.equal(first.accepted, true, first.error);
    assert.deepEqual(first.state.workingPlan.storyLife, wider.storyLife);
    assert.deepEqual(first.calls[1].prompt.prepared_horizon.storyLife, wider.storyLife);
    assert.doesNotMatch(campaignPayload(first.state), /storyLife|continuingLife|A bridge repair/);
    const unchanged = unchangedHorizon(); unchanged.storyLife = wider.storyLife;
    value.outlook = { action: 'keep', reason: 'Both undertakings remain possible.', material: [] };
    const invalid = structuredClone(value); invalid.plan.storyLife = storyLife();
    const next = await run(first.state, [unchanged, invalid, value]);
    assert.equal(next.accepted, true, next.error);
    assert.equal(next.recovery.status, 'complete');
    assert.equal(next.calls[1].prompt.previous_plan.storyLife, undefined);
    assert.deepEqual(next.calls[0].prompt.previous_horizon.storyLife, wider.storyLife);
    assert.deepEqual(next.state.workingPlan.storyLife, wider.storyLife);
});

test('initial wider orientation cannot mistake an old scene checkpoint for a reviewed premise', async () => {
    const state = await stuck();
    const history = Array.from({ length: 8 }, (_, index) => ({ index, role: index % 2 ? 'user' : 'assistant', content: `Accepted text ${index}.` }));
    const input = inputFor(state, { messages: history, reviewedMessageCount: 6 });
    const broad = JSON.parse(input.horizonInput.prompt);
    assert.equal(broad.horizon_review, 'orient');
    assert.deepEqual(broad.accepted_messages.map(m => m.index), [0, 1, 3, 5, 6, 7]);
    assert.deepEqual(broad.coverage.protected_message_indices, [0, 1]);
    assert.deepEqual(broad.previous_horizon.trajectories, [oldTrajectory]);
    const tiny = inputFor(state, { messages: history, reviewedMessageCount: 6 });
    // Real envelope fitting must not sacrifice the opening to repeated staging.
    const { fitStoryInputBudget } = await import('../extension/story-budget.js');
    const fitted = await fitStoryInputBudget(tiny.horizonInput.prompt, HORIZON_SYSTEM, HORIZON_SCHEMA, 1, undefined, { softTarget: true });
    assert.deepEqual(JSON.parse(fitted.prompt).accepted_messages.map(m => m.index), [0, 1, 6, 7]);
    state.workingPlan.storyLife = storyLife();
    const routine = JSON.parse(inputFor(state, { messages: history, reviewedMessageCount: 6 }).horizonInput.prompt);
    assert.equal(routine.horizon_review, 'maintain');
    assert.deepEqual(routine.accepted_messages.map(m => m.index), [6, 7]);
});

for (const ids of [['missing'], [opportunity.id, opportunity.id]]) test(`story life validates links: ${ids}`, async () => {
    const wider = horizon(); wider.storyLife.horizonIds = ids;
    const result = await run(await stuck(), [wider, wider]);
    assert.equal(result.accepted, false);
    assert.match(result.error, /Story life/);
    assert.equal(result.calls.length, 2);
});

test('two complementary futures reach normal and horizon-only writer packets without an incident priority gate', async () => {
    const { wider, value } = twoFutures();
    const result = await run(await stuck(), [wider, value]);
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.state.workingPlan.outlook.length, 2);
    const selected = result.state.selectedMaterial[0];
    assert.equal(selected.developing, value.outlook.material.map(row => row.developing).join('\n\n'));
    assert.equal(selected.lasting, value.outlook.material.map(row => row.lasting).join('\n\n'));
    for (const horizonsOnly of [false, true]) {
        const packet = campaignPayloadBudget(result.state, [], { horizonsOnly });
        assert.equal(packet.omitted, 0);
        assert.match(packet.payload, /smoked-pear|upland/);
        assert.match(packet.payload, /regional verses/);
        assert.match(packet.payload, /song transformed/);
        if (horizonsOnly) assert.doesNotMatch(packet.payload, /available_circumstances|At the next inn/);
    }
    const saved = loadPlannerState(JSON.parse(JSON.stringify(saveState({}, { ...defaultPlannerState(), campaignPreparation: result.state }))));
    assert.deepEqual(saved.campaignPreparation.workingPlan, result.state.workingPlan);
    for (const damage of ['route', 'horizon']) {
        const copy = structuredClone(result.state);
        if (damage === 'route') copy.selectedMaterial[0].subjectIds.pop();
        else copy.selectedMaterial[0].lasting = value.outlook.material[0].lasting;
        assert.equal(validCampaignState(copy), false, damage);
    }
});

for (const failure of ['duplicate', 'third', 'hidden-second', 'changed-second']) test(`every selected future is checked: ${failure}`, async () => {
    const { wider, value } = twoFutures();
    let state = await stuck(), response = wider;
    if (failure === 'duplicate') value.outlook.material[1].trajectoryId = opportunity.id;
    if (failure === 'third') value.outlook.material.push(structuredClone(value.outlook.material[0]));
    if (failure === 'hidden-second') value.plan.openings[1].access.route = 'none';
    if (failure === 'changed-second') {
        state = (await run(state, [wider, value])).state;
        response = unchangedHorizon();
        response.progression.upsert = [{ ...wider.progression.upsert[1], drive: 'A changed undertaking.' }];
        value.outlook = { action: 'keep', reason: 'Attempt to keep a changed second future.', material: [] };
    }
    const result = await run(state, [response, value, value]);
    assert.equal(result.accepted, false);
    assert.equal(result.calls.length, 3);
    assert.deepEqual(result.state, state);
});

test('oversized combined packet receives one bounded repair rather than silently disappearing from writer context', async () => {
    const { wider, value } = twoFutures(), oversized = structuredClone(value);
    for (const row of oversized.outlook.material) {
        row.developing = 'word '.repeat(170).trim();
        row.lasting = 'later '.repeat(140).trim();
    }
    const state = await stuck(), before = structuredClone(state);
    const repaired = await run(state, [wider, oversized, value]);
    assert.equal(repaired.accepted, true, repaired.error);
    assert.equal(repaired.recovery.status, 'complete');
    assert.match(repaired.calls[2].prompt.response_correction.error, /writer envelope/);
    assert.equal(JSON.stringify(state), JSON.stringify(before));
    const rejected = await run(state, [wider, oversized, oversized]);
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.calls.length, 3);
    assert.equal(JSON.stringify(rejected.state), JSON.stringify(before));
});

test('active planner cannot inject a next-beat recap alongside its future openings', async () => {
    const value = openedScene();
    value.selected_material = [{ subjectIds: [opportunity.id], available: value.plan.openings[0].circumstance }];
    const result = await run(await stuck(), [horizon(), value, value]);
    assert.equal(result.accepted, false);
    assert.match(result.error, /array/i);
});

test('changed-reference ideas go only to the workshop, without restoring local facts, outlook or trusted preparation', async () => {
    const old = (await run(await stuck(), [horizon(), openedScene()])).state;
    const planning = { ...emptyCampaign(), revision: old.revision, archive: old.archive };
    const input = inputFor(planning, { previousUsable: false, reconsiderHorizon: old.workingPlan });
    const broad = JSON.parse(input.horizonInput.prompt), narrow = JSON.parse(input.prompt);
    assert.deepEqual(broad.reconsider_horizon.trajectories, [opportunity]);
    assert.deepEqual(Object.keys(broad.reconsider_horizon).sort(), ['rpUnderstanding', 'storyLife', 'throughline', 'trajectories']);
    assert.deepEqual(broad.previous_horizon.trajectories, []);
    assert.deepEqual(narrow.previous_plan.developments, []);
    assert.deepEqual(narrow.previous_outlook, []);
    assert.equal(narrow.reconsider_horizon, undefined);
    for (const extra of [{ resetPlan: true }, { previousUsable: true }]) {
        const excluded = inputFor(old, { previousUsable: false, reconsiderHorizon: old.workingPlan, ...extra });
        assert.equal(JSON.parse(excluded.horizonInput.prompt).reconsider_horizon, undefined);
    }
});
