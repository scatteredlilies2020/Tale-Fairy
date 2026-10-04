import test from 'node:test';
import assert from 'node:assert/strict';
import { storyInput, storyPass, STORY_SYSTEM, STORY_SCHEMA } from '../extension/bounded-story.js';
import { emptyCampaign, validCampaignState, campaignPayload, check } from '../extension/campaign-planner.js';
import { planTokens, validateWorkingPlan, plannerInputLimit } from '../extension/working-plan.js';
import { defaultPlannerState, saveState, loadPlannerState } from '../extension/state.js';
import { storyInputTokens } from '../extension/story-budget.js';
import { originalUnderstanding } from './helpers/rp-fixtures.js';

const messages = [{ index: 0, role: 'assistant', content: 'The bridge is repaired. The village celebrates.' },
    { index: 1, role: 'user', name: 'Ren', content: 'I stay for dinner.' }];
const source = { chatId: 'story', referenceHash: 'reference', fingerprint: 'accepted', messageCount: 2 };
const development = (id = 'r1-bridge') => ({ id, kind: 'arc', owner: 'Village council', control: 'npc', trajectoryIds: [],
    question: 'Can the damaged bridge reopen?', initiative: 'The council organizes the repairs.',
    resolution: 'The crossing is usable or the repair attempt is abandoned.', beyond: 'A working crossing restores trade.',
    access: { route: 'local', basis: 'The village is here; repairs are visible.' } });
const response = () => ({ plan: { rpUnderstanding: originalUnderstanding(), direction: 'A wandering life across distinct communities.', threads: 'Ren hopes to become a trusted guide.',
    goal: [{ subjectId: 'r1-bridge', scope: 'near-term', aim: 'Bring the village together over its reopened crossing.', reachedWhen: 'The council holds the first shared crossing.' }],
    consequences: [], developments: [development()] }, progression: { upsert: [], retire: [] }, exits: [], observations: [],
    selected_material: [{ subjectIds: ['r1-bridge'], available: 'The council brings repaired planks to the crossing.',
        developing: 'Workers can reopen the crossing and traders can test a restored route between the banks.',
        lasting: 'Regular river exchanges could reconnect the two communities and change village life.' }] });

test('legacy bounded contract remains compatible with private causal progression', () => {
    assert.match(STORY_SYSTEM, /Begin with the wider story territory/);
    assert.match(STORY_SYSTEM, /Omitted trajectories remain saved unchanged/);
    assert.match(STORY_SYSTEM, /each when is a causal dependency/);
    assert.match(STORY_SYSTEM, /Local scene focus and passage of message turns are not progression events/);
    assert.match(STORY_SYSTEM, /All three fields are story material/);
    assert.doesNotMatch(STORY_SYSTEM, /do not force|no forced|Never force|No turn timers/i);
    assert.ok(STORY_SCHEMA.value.required.includes('progression'));
    assert.ok(STORY_SCHEMA.value.properties.plan.properties.developments.items.required.includes('trajectoryIds'));
    assert.ok(storyInputTokens('', STORY_SYSTEM, STORY_SCHEMA) <= 3750,
        'The fixed contract must leave most of the 10k target for source and state.');
    assert.deepEqual(Object.keys(STORY_SCHEMA.value.properties.plan.properties),
        ['rpUnderstanding', 'direction', 'threads', 'consequences', 'developments', 'goal']);
});
function input(state = emptyCampaign(), extra = {}) {
    return storyInput({ reference: { premise: 'Travel with freely chosen stops.' }, state, messages, playerNames: ['Ren'],
        previousUsable: Boolean(state.revision), verifiedPlanEvidence: state.planEvidence || {}, ...extra });
}

test('internal contract turns RP identity into fresh characteristic activities', () => {
    assert.match(STORY_SYSTEM, /experiences names its characteristic recurring activities and interests/);
    assert.match(STORY_SYSTEM, /Turn that understanding into fresh playable substance/);
    assert.match(STORY_SYSTEM, /even before they are mentioned in play/);
    assert.match(STORY_SYSTEM, /worthwhile to experience in its own right/);
    assert.match(STORY_SYSTEM, /Use this understanding to shape developments and progression; access determines which material is available now/);
    assert.doesNotMatch(STORY_SYSTEM, /Frieren|K-on|Equalists|Korra/i);
});

test('RP activity analysis remains internal rather than becoming writer instructions', async () => {
    const raw = response();
    raw.plan.rpUnderstanding.experiences = 'Different settlements, shared meals, learning regional crafts.';
    const result = await pass(raw);
    assert.equal(result.accepted, true, result.error);
    const restored = loadPlannerState(JSON.parse(JSON.stringify(saveState({}, {
        ...defaultPlannerState(), campaignPreparation: result.state,
    })))).campaignPreparation;
    assert.equal(restored.workingPlan.rpUnderstanding.experiences, raw.plan.rpUnderstanding.experiences);
    assert.deepEqual(restored.selectedMaterial, raw.selected_material);
    assert.doesNotMatch(campaignPayload(restored), /regional crafts|rpUnderstanding|recurring activities|Turn that understanding/);
});

test('new local goals require explicit references and scopes', () => {
    assert.ok(STORY_SCHEMA.value.properties.plan.required.includes('goal'));
    assert.equal(STORY_SCHEMA.value.properties.plan.properties.goal.maxItems, 4);
    assert.ok(STORY_SCHEMA.value.properties.plan.properties.goal.items.required.includes('scope'));
});

test('goal stays private while its selected story horizons reach the writer', async () => {
    const first = await pass();
    assert.equal(first.accepted, true, first.error);
    const saved = loadPlannerState(JSON.parse(JSON.stringify(saveState({}, {
        ...defaultPlannerState(), campaignPreparation: first.state,
    })))).campaignPreparation;
    assert.deepEqual(JSON.parse(input(saved).prompt).previous_plan.goal, response().plan.goal);
    const wire = JSON.parse(campaignPayload(saved).replace(/<\/?tale-fairy-context>/g, ''));
    assert.deepEqual(wire, { possible_developments: [{
        available_circumstances: response().selected_material[0].available,
        mid_term_possibilities: response().selected_material[0].developing,
        long_term_possibilities: response().selected_material[0].lasting,
    }] });
    assert.doesNotMatch(campaignPayload(saved), /story_goal|development_contract|r1-bridge|rpUnderstanding|trusted guide|control|subjectId/);
    const next = await pass(response(), saved);
    assert.equal(next.accepted, true, next.error);
    assert.deepEqual(next.state.workingPlan.goal, saved.workingPlan.goal);
    assert.deepEqual(next.state.archive.at(-1).workingPlan.goal, saved.workingPlan.goal);
});

test('new selections require all three horizons, while older saved packets remain readable', async () => {
    assert.deepEqual(STORY_SCHEMA.value.properties.selected_material.items.required,
        ['subjectIds', 'available', 'developing', 'lasting']);
    for (const horizon of ['developing', 'lasting']) {
        const raw = response(); delete raw.selected_material[0][horizon];
        const rejected = await pass(raw);
        assert.equal(rejected.accepted, false);
        assert.match(rejected.error, new RegExp(`missing ${horizon}`));
    }
    const saved = structuredClone((await pass()).state);
    delete saved.selectedMaterial[0].developing;
    delete saved.selectedMaterial[0].lasting;
    assert.equal(validCampaignState(saved), true);
    assert.deepEqual(JSON.parse(campaignPayload(saved).replace(/<\/?tale-fairy-context>/g, '')),
        { possible_developments: [{ available_circumstances: response().selected_material[0].available }] });
});

test('older goal-less preparation stays usable until the next normal pass chooses a goal', async () => {
    const old = structuredClone((await pass()).state);
    delete old.workingPlan.goal;
    assert.equal(validCampaignState(old), true);
    assert.doesNotMatch(campaignPayload(old), /story_goal/);
    assert.equal(input(old).rebuild, false);
    const missing = response(); delete missing.plan.goal;
    const rejected = await pass(missing, old);
    assert.equal(rejected.accepted, false);
    assert.match(rejected.error, /missing goal/);
    assert.equal(rejected.state, old);
    const next = await pass(response(), old);
    assert.equal(next.accepted, true, next.error);
    assert.equal(next.state.revision, old.revision + 1);
    assert.deepEqual(next.state.workingPlan.developments, old.workingPlan.developments);
});

function multiResponse() {
    const raw = response();
    raw.plan.goal.push(
        { subjectId: 'r1-bridge', scope: 'long-term', aim: 'Reconnect the riverside communities.', reachedWhen: 'Regular exchanges link both banks.' },
        { subjectId: 'r1-tea', scope: 'side-thread', aim: 'Share the gardener\'s new tea.', reachedWhen: 'The tasting ends or is declined.' },
        { subjectId: 'r1-festival', scope: 'long-term', aim: 'Experience the distant lantern festival.', reachedWhen: 'The lantern festivities conclude.' },
    );
    raw.plan.developments.push(
        { ...development('r1-tea'), kind: 'side', owner: 'Gardener', question: 'Which tea tastes best?',
            initiative: 'The gardener sets out teas in the village.', resolution: 'The tasting ends.', beyond: 'Garden friendships.',
            access: { route: 'local', basis: 'The garden is beside the crossing.' } },
        { ...development('r1-festival'), kind: 'emerging', owner: 'Distant town', question: 'How will the town celebrate?',
            initiative: 'Artisans prepare lanterns.', resolution: 'The festival ends.', beyond: 'Other town traditions.',
            access: { route: 'none', basis: 'No current contact or route to that town.' } },
    );
    return raw;
}

test('coexisting goals persist privately while only selected accessible horizons reach the writer', async () => {
    const raw = multiResponse(), result = await pass(raw);
    assert.equal(result.accepted, true, result.error);
    const saved = loadPlannerState(JSON.parse(JSON.stringify(saveState({}, {
        ...defaultPlannerState(), campaignPreparation: result.state,
    })))).campaignPreparation;
    assert.equal(validCampaignState(saved), true);
    assert.deepEqual(JSON.parse(input(saved).prompt).previous_plan.goal, raw.plan.goal);
    const wire = JSON.parse(campaignPayload(saved).replace(/<\/?tale-fairy-context>/g, ''));
    assert.deepEqual(Object.keys(wire.possible_developments[0]),
        ['available_circumstances', 'mid_term_possibilities', 'long_term_possibilities']);
    assert.doesNotMatch(campaignPayload(saved), /gardener|lantern|r1-bridge|subjectId|rpUnderstanding/);
    assert.equal(result.budget.selected, planTokens(raw.selected_material),
        'Private goals do not consume the writer selection target.');
    assert.ok(result.budget.plan < 1200, 'Several goals still fit the unchanged plan target.');

    raw.selected_material = [{ subjectIds: ['r1-tea'], available: 'In the village garden, the gardener pours two new teas.',
        developing: 'The gardener experiments with blends based on what the village grows each season.',
        lasting: 'The garden could become a regular meeting place for exchanging plants and stories.' }];
    const side = await pass(raw, saved);
    assert.equal(side.accepted, true, side.error);
    assert.deepEqual(side.state.workingPlan.goal, saved.workingPlan.goal, 'Changing focus is not dropping other goals.');
    assert.deepEqual(side.state.archive.at(-1).workingPlan.goal, saved.workingPlan.goal);
    assert.match(campaignPayload(side.state), /gardener experiments/);
    assert.doesNotMatch(campaignPayload(side.state), /Reconnect|crossing|lantern/);
});

test('a completed near goal can leave its wider direction and independent goals intact', async () => {
    const raw = multiResponse(), first = await pass(raw);
    raw.plan.goal = raw.plan.goal.filter(goal => goal.scope !== 'near-term');
    raw.plan.consequences = [{ id: 'crossing', text: 'The bridge is repaired.' }];
    raw.observations = [{ id: 'crossing', evidence: [{ index: 0, span: 0 }] }];
    raw.selected_material = [{ subjectIds: ['r1-bridge'], available: 'The council posts river trading days at the repaired crossing.',
        developing: 'Merchants can test a dependable route and residents can renew exchange across the banks.',
        lasting: 'Regular trade could reconnect the riverside communities beyond the bridge repair.' }];
    const next = await pass(raw, first.state);
    assert.equal(next.accepted, true, next.error);
    assert.equal(next.state.workingPlan.goal.length, 3);
    assert.deepEqual(next.state.workingPlan.goal, first.state.workingPlan.goal.slice(1));
    assert.equal(next.state.workingPlan.developments.length, 3, 'Finishing a step does not retire the wider undertaking.');
    const wire = JSON.parse(campaignPayload(next.state).replace(/<\/?tale-fairy-context>/g, ''));
    assert.match(wire.possible_developments[0].long_term_possibilities, /riverside communities/);
    assert.equal(wire.possible_developments[0].story_goals, undefined);
    assert.equal(next.state.planEvidence.crossing.witnesses[0].quote, messages[0].content);
});

test('multiple private goals need no writer packet and cannot bypass discovery access', async () => {
    const raw = multiResponse();
    for (const d of raw.plan.developments) d.access.route = 'none';
    raw.selected_material = [];
    const first = await pass(raw);
    assert.equal(first.accepted, true, first.error);
    assert.equal(campaignPayload(first.state), '');
    raw.selected_material = [{ subjectIds: ['r1-festival'], available: 'The distant festival suddenly intrudes.',
        developing: 'Artisans continue preparing lanterns for visitors from neighboring towns.',
        lasting: 'The festival could open an exchange between towns.' }];
    const rejected = await pass(raw, first.state);
    assert.equal(rejected.accepted, false);
    assert.match(rejected.error, /discovery route/);
    assert.equal(rejected.state, first.state);
});

test('each goal scope can stand alone without filling other scope slots', async () => {
    for (const scope of ['long-term', 'near-term', 'side-thread']) {
        const raw = response(); raw.plan.goal[0].scope = scope;
        const result = await pass(raw);
        assert.equal(result.accepted, true, result.error);
        assert.deepEqual(result.state.workingPlan.goal, raw.plan.goal);
    }
});

test('deliberate rest can withhold all goals without deleting otherwise accessible unfinished work', async () => {
    const raw = multiResponse(), first = await pass(raw);
    raw.selected_material = [];
    const quiet = await pass(raw, first.state);
    assert.equal(quiet.accepted, true, quiet.error);
    assert.equal(validCampaignState(quiet.state), true);
    assert.equal(campaignPayload(quiet.state), '');
    assert.deepEqual(quiet.state.workingPlan.goal, first.state.workingPlan.goal);
    assert.deepEqual(JSON.parse(input(quiet.state).prompt).previous_plan.goal, raw.plan.goal);
    const resumed = await pass(multiResponse(), quiet.state);
    assert.equal(resumed.accepted, true, resumed.error);
    assert.match(campaignPayload(resumed.state), /reconnect the two communities/);
    assert.deepEqual(resumed.state.workingPlan.goal, raw.plan.goal);
});

for (const [name, mutate, error] of [
    ['dangling goal', r => { r.plan.goal[0].subjectId = 'unknown'; }, /retained development/],
    ['duplicate goals', r => { r.plan.goal.push(structuredClone(r.plan.goal[0])); }, /Duplicate story goal/],
    ['missing goal scope', r => { delete r.plan.goal[0].scope; }, /missing scope/],
    ['invalid goal scope', r => { r.plan.goal[0].scope = 'mandatory'; }, /invalid enum/],
    ['missing completion point', r => { delete r.plan.goal[0].reachedWhen; }, /missing reachedWhen/],
    ['material without a goal', r => { r.plan.goal = []; }, /chosen story goal/],
    ['unrelated handoff', r => {
        r.plan.developments.push(development('r2-other'));
        r.selected_material[0].subjectIds = ['r2-other'];
    }, /chosen story goal/],
]) test(`${name} cannot replace valid preparation`, async () => {
    const state = (await pass()).state, before = structuredClone(state), raw = response();
    mutate(raw);
    const result = await pass(raw, state);
    assert.equal(result.accepted, false);
    assert.match(result.error, error);
    assert.equal(result.state, state);
    assert.deepEqual(structuredClone(state), before);
});

test('unreachable goal stays private until a plausible route exists; deliberate rest needs no successor', async () => {
    const raw = response(); raw.plan.developments[0].access.route = 'none'; raw.selected_material = [];
    const waiting = await pass(raw);
    assert.equal(waiting.accepted, true, waiting.error);
    assert.equal(validCampaignState(waiting.state), true);
    assert.equal(campaignPayload(waiting.state), '');
    assert.deepEqual(JSON.parse(input(waiting.state).prompt).previous_plan.goal, raw.plan.goal);
    const reachable = await pass(response(), waiting.state);
    assert.equal(reachable.accepted, true, reachable.error);
    assert.match(campaignPayload(reachable.state), /mid_term_possibilities/);
    assert.doesNotMatch(campaignPayload(reachable.state), /story_goal/);
    raw.plan.goal = [];
    const resting = await pass(raw, reachable.state);
    assert.equal(resting.accepted, true, resting.error);
    assert.equal(validCampaignState(resting.state), true);
    assert.equal(campaignPayload(resting.state), '');
});
async function pass(raw = response(), state = emptyCampaign(), extra = {}) {
    let calls = 0;
    const result = await storyPass({ state, source, input: input(state, extra), generate: async () => {
        calls++; return { text: JSON.stringify(raw), finishReason: 'stop' };
    } });
    assert.equal(calls, 1);
    return result;
}

test('RP analysis distinguishes canon intent from causal divergence and stays provisional', () => {
    assert.match(STORY_SYSTEM, /canonIntent reflects the user's stated preference/);
    assert.match(STORY_SYSTEM, /divergence describes established causal impact/);
    assert.match(STORY_SYSTEM, /Franchise knowledge and prior_story_map are provisional/);
    assert.ok(STORY_SCHEMA.value.properties.plan.required.includes('rpUnderstanding'));
    assert.ok(STORY_SCHEMA.value.properties.plan.properties.rpUnderstanding.required.includes('storyScope'));
    assert.ok(STORY_SCHEMA.value.properties.plan.properties.rpUnderstanding.required.includes('independentSource'));
});

test('old bounded metadata upgrades without resetting revision, ids, review coverage or archives', async () => {
    const first = await pass();
    const old = structuredClone(first.state); delete old.workingPlan.rpUnderstanding;
    const untouched = structuredClone(old);
    assert.equal(validCampaignState(old), true);
    assert.ok(campaignPayload(old));
    const prepared = input(old);
    assert.equal(prepared.rebuild, false);
    assert.equal(prepared.nextRevision, old.revision + 1);
    assert.equal(JSON.parse(prepared.prompt).previous_plan.rpUnderstanding, undefined);
    const next = await pass(response(), old);
    assert.equal(next.accepted, true, next.error);
    assert.equal(next.state.revision, old.revision + 1);
    assert.deepEqual(next.state.workingPlan.developments, old.workingPlan.developments);
    assert.deepEqual(next.state.archive.at(-1).workingPlan, old.workingPlan);
    assert.deepEqual(old, untouched);
    assert.deepEqual(JSON.parse(input(next.state).prompt).previous_plan.rpUnderstanding, originalUnderstanding());
});

test('older RP analyses without a story map stay valid, but new output needs both fields', async () => {
    const first = await pass();
    const old = structuredClone(first.state);
    delete old.workingPlan.rpUnderstanding.storyScope;
    delete old.workingPlan.rpUnderstanding.independentSource;
    assert.equal(validCampaignState(old), true);
    assert.deepEqual(JSON.parse(input(old).prompt).previous_plan.rpUnderstanding, old.workingPlan.rpUnderstanding);
    for (const key of ['storyScope', 'independentSource']) {
        const raw = response(); delete raw.plan.rpUnderstanding[key];
        const result = await pass(raw, old);
        assert.equal(result.accepted, false);
        assert.match(result.error, new RegExp(`missing ${key}`));
        assert.equal(result.state, old);
    }
});

test('rebuild keeps only a provisional story map, not old plans or outcomes', async () => {
    const prior = (await pass()).state;
    const prepared = input(prior, { resetPlan: true });
    const sent = JSON.parse(prepared.prompt);
    assert.deepEqual(sent.previous_plan.developments, []);
    assert.deepEqual(sent.prior_story_map, Object.fromEntries(Object.entries(prior.workingPlan.rpUnderstanding)
        .filter(([key]) => key !== 'uncertainty')));
    assert.doesNotMatch(JSON.stringify(sent.prior_story_map), /bridge|Ren hopes/i);
});

test('missing analysis fails transactionally instead of inferring a default franchise', async () => {
    const { state } = await pass();
    const untouched = structuredClone(state), raw = response(); delete raw.plan.rpUnderstanding;
    const failed = await pass(raw, state);
    assert.equal(failed.accepted, false);
    assert.match(failed.error, /missing rpUnderstanding/);
    assert.equal(failed.state, state);
    assert.deepEqual(structuredClone(state), untouched);
});

test('RP analysis validates structure, original-world semantics and its own bounded allowance', async () => {
    const { state } = await pass();
    for (const [mutate, error] of [
        [rp => { rp.canonIntent = 'follow'; }, /Original RP/],
        [rp => { rp.divergence = 'major'; }, /Original RP/],
        [rp => { rp.basis = 'franchise'; }, /Non-original/],
        [rp => { rp.basis = 'anime'; }, /invalid enum/],
        [rp => { delete rp.uncertainty; }, /missing uncertainty/],
    ]) {
        const raw = response(); mutate(raw.plan.rpUnderstanding);
        const failed = await pass(raw, state);
        assert.equal(failed.state, state);
        assert.match(failed.error, error);
        const damaged = structuredClone(state); damaged.workingPlan.rpUnderstanding = raw.plan.rpUnderstanding;
        assert.equal(validCampaignState(damaged), false);
    }
});

test('unclear and mixed RPs need no invented franchise identity or canon preference', async () => {
    for (const basis of ['unclear', 'mixed']) {
        const raw = response();
        raw.plan.rpUnderstanding = { ...originalUnderstanding(), basis, setting: 'Setting not yet established',
            canonIntent: 'unspecified', divergence: 'unclear', anchors: 'Only the supplied village and people are known.',
            departures: 'No reliable external baseline.', uncertainty: 'Franchise identity and chronology are uncertain.' };
        const result = await pass(raw);
        assert.equal(result.accepted, true, result.error);
        assert.deepEqual(JSON.parse(input(result.state).prompt).previous_plan.rpUnderstanding, raw.plan.rpUnderstanding);
        assert.deepEqual(result.state.workingPlan.consequences, []);
    }
});

test('new play can revise divergence while preserving canon preference and archiving the previous interpretation', async () => {
    const raw = response(); raw.plan.rpUnderstanding = { ...originalUnderstanding(), basis: 'franchise',
        setting: 'A supplied franchise village', canonIntent: 'follow', divergence: 'none-established',
        anchors: 'The village trades across the crossing.', departures: 'None established.', uncertainty: 'Later canon is not assumed.' };
    const first = await pass(raw);
    raw.plan.rpUnderstanding.divergence = 'major';
    raw.plan.rpUnderstanding.departures = 'The player-established alliance replaces the old trade blockade.';
    raw.plan.rpUnderstanding.experiences = 'Joint expeditions and trade with allied villages.';
    const second = await pass(raw, first.state, {
        reference: { premise: 'Follow canon unless play changes it.', authorInstructions: ['Our alliance has permanently ended the blockade.'] },
        messages: [...messages, { index: 2, role: 'assistant', content: 'The villages ratified the alliance and ended the blockade.' }],
    });
    assert.equal(second.accepted, true, second.error);
    assert.equal(second.state.workingPlan.rpUnderstanding.canonIntent, 'follow');
    assert.equal(second.state.workingPlan.rpUnderstanding.divergence, 'major');
    assert.equal(second.state.archive.at(-1).workingPlan.rpUnderstanding.divergence, 'none-established');
    assert.deepEqual(second.state.workingPlan.consequences, [], 'Interpretation is not automatically witnessed history.');
});

test('one bounded pass commits and round-trips through real saved metadata', async () => {
    const result = await pass();
    assert.equal(result.accepted, true, result.error);
    assert.equal(validCampaignState(result.state), true);
    const saved = { ...defaultPlannerState(), campaignPreparation: result.state };
    assert.deepEqual(loadPlannerState(JSON.parse(JSON.stringify(saveState({}, saved)))).campaignPreparation,
        JSON.parse(JSON.stringify(result.state)));
    assert.match(campaignPayload(result.state), /brings repaired planks/);
    assert.doesNotMatch(campaignPayload(result.state), /question|consequences|trusted guide/);
    assert.ok(result.budget.input < 8000 && result.budget.plan <= 1200 && result.budget.selected <= 600);
});

test('routine prompt is independent of archive size and never replays the evidence ledger', async () => {
    const { state } = await pass();
    const before = input(state);
    state.archive = Array.from({ length: 10000 }, (_, revision) => ({ revision, privateHistory: 'OLD HISTORY '.repeat(30) }));
    state.realization = { hugeLegacyLedger: 'HISTORICAL EVIDENCE '.repeat(10000) };
    const after = input(state);
    assert.equal(after.prompt, before.prompt);
    assert.equal(after.inputTokens, before.inputTokens);
    assert.doesNotMatch(after.prompt, /OLD HISTORY|HISTORICAL EVIDENCE|accepted_progress|closed_subject_ids/);
});

test('recovery of an old failed rebuild reserves archived revision ids without reviving the plan', async () => {
    const prior = (await pass()).state;
    prior.revision = 50;
    const state = { ...emptyCampaign(), archive: [{ preparation: prior, rebuild: true }] };
    const built = input(state);
    assert.equal(built.newIdPrefix, 'r51-');
    assert.deepEqual(built.previousPlan.developments, []);
    assert.deepEqual(JSON.parse(input(state, { resetPlan: true }).prompt).prior_story_map.storyScope,
        prior.workingPlan.rpUnderstanding.storyScope);
    const raw = response();
    raw.plan.developments[0].id = 'r51-new';
    raw.plan.goal[0].subjectId = 'r51-new';
    raw.selected_material[0].subjectIds = ['r51-new'];
    const result = await pass(raw, state);
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.state.revision, 51);
    assert.equal(validCampaignState(result.state), true);
    assert.deepEqual(result.state.archive, structuredClone(state.archive));
});

test('finite arc ends with evidence while a long thread survives and an independent arc begins', async () => {
    const first = await pass();
    const raw = response();
    raw.plan.developments = [{ ...development('r2-festival'), question: 'Which work will the troupe share?', initiative: 'The troupe rehearses its new comedy.',
        resolution: 'The troupe presents or shelves this production.', beyond: 'Other communities develop their own art.' }];
    raw.plan.goal = [{ subjectId: 'r2-festival', scope: 'side-thread', aim: 'Share the troupe\'s new comedy.', reachedWhen: 'The comedy is performed or shelved.' }];
    raw.exits = [{ id: 'r1-bridge', disposition: 'closed', reason: 'The crossing is repaired.', evidence: [{ index: 0, span: 0 }] }];
    raw.plan.consequences = [{ id: 'crossing', text: 'The bridge is repaired.' }];
    raw.observations = [{ id: 'crossing', evidence: [{ index: 0, span: 0 }] }];
    raw.selected_material = [{ subjectIds: ['r2-festival'], available: 'The troupe rehearses its comedy in the square.',
        developing: 'The troupe can invite local performers to join later rehearsals.',
        lasting: 'A traveling collaboration could connect the town with other stages.' }];
    const next = await pass(raw, first.state);
    assert.equal(next.accepted, true, next.error);
    assert.equal(next.state.workingPlan.threads, first.state.workingPlan.threads);
    assert.equal(next.state.archive[0].transitions[0].disposition, 'closed');
    assert.equal(next.state.planEvidence.crossing.witnesses[0].quote, messages[0].content);
    assert.equal(validCampaignState(next.state), true);
    assert.doesNotMatch(campaignPayload(next.state), /planks|bridge|crossing/);
    // Carry a verified consequence without re-sending its old witness ledger.
    raw.exits = []; raw.observations = [];
    const carry = await pass(raw, next.state);
    assert.equal(carry.accepted, true, carry.error);
    assert.deepEqual(carry.state.planEvidence, next.state.planEvidence);
});

test('unfinished initiatives persist verbatim across an unchanged full snapshot', async () => {
    const first = await pass();
    const next = await pass(response(), first.state);
    assert.equal(next.accepted, true, next.error);
    assert.deepEqual(next.state.workingPlan, first.state.workingPlan);
});

for (const disposition of ['paused', 'dropped', 'closed', 'changed']) test(`${disposition} distinguishes withdrawn drafts from witnessed endings`, async () => {
    const { state } = await pass();
    const raw = response(); raw.plan.developments = []; raw.plan.goal = []; raw.selected_material = [];
    raw.exits = [{ id: 'r1-bridge', disposition, reason: 'Set aside.', evidence: [] }];
    const result = await pass(raw, state);
    assert.equal(result.accepted, ['paused', 'dropped'].includes(disposition), result.error);
    if (!result.accepted) assert.equal(result.state, state);
});

test('omission cannot silently erase an active initiative; no automatic retry', async () => {
    const { state } = await pass();
    const raw = response(); raw.plan.developments = []; raw.plan.goal = []; raw.selected_material = [];
    const rejected = await pass(raw, state);
    assert.equal(rejected.state, state);
    assert.match(rejected.error, /explicit exit/);
});

for (const [name, change, error] of [
    ['duplicate ids', r => r.plan.developments.push(structuredClone(r.plan.developments[0])), /Duplicate/],
    ['unprefixed new id', r => { r.plan.developments[0].id = 'old'; r.plan.goal[0].subjectId = 'old'; }, /id prefix/],
    ['player owner', r => r.plan.developments[0].owner = ' Ren ', /Player/],
    ['inaccessible writer material', r => r.plan.developments[0].access.route = 'none', /discovery route/],
    ['unknown selection id', r => r.selected_material[0].subjectIds = ['unknown'], /unknown/],
    ['unwitnessed fact', r => r.plan.consequences.push({ id: 'success', text: 'Ren won.' }), /witnesses/],
    ['invalid span', r => { r.plan.consequences.push({ id: 'success', text: 'Ren won.' }); r.observations.push({ id: 'success', evidence: [{ index: 0, span: 99 }] }); }, /span/i],
    ['invalid packet field', r => { r.selected_material[0].available = '音'.repeat(901); }, /900 characters/],
]) test(`rejects ${name} without mutating saved preparation`, async () => {
    const raw = response(); change(raw);
    const state = emptyCampaign(), before = structuredClone(state);
    const result = await pass(raw, state);
    assert.equal(result.accepted, false);
    assert.match(result.error, error);
    assert.equal(result.state, state);
    assert.deepEqual(state, before);
});

test('source-invalidated consequences cannot carry as facts', async () => {
    const raw = response(); raw.plan.consequences = [{ id: 'crossing', text: 'The bridge is repaired.' }];
    raw.observations = [{ id: 'crossing', evidence: [{ index: 0, span: 0 }] }];
    const first = await pass(raw); raw.observations = [];
    const built = input(first.state, { previousUsable: false });
    assert.deepEqual(JSON.parse(built.prompt).previous_plan.consequences, []);
    const rejected = await pass(raw, first.state, { previousUsable: false });
    assert.equal(rejected.accepted, false);
    assert.match(rejected.error, /witnesses/);
});

test('structural plan bounds remain mandatory but token estimates are soft targets', () => {
    const raw = response();
    raw.plan.developments = Array.from({ length: 5 }, (_, i) => development(`r1-${i}`));
    assert.throws(() => validateWorkingPlan(raw.plan, check), /array bounds/);
    raw.plan.developments.pop();
    raw.plan.goal[0].subjectId = raw.plan.developments[0].id;
    for (const d of raw.plan.developments) d.initiative = '音'.repeat(400);
    assert.ok(planTokens(raw.plan) > 1200);
    assert.doesNotThrow(() => validateWorkingPlan(raw.plan, check));
});

test('complete request target includes schema and instructions without rejecting protected input', () => {
    assert.equal(plannerInputLimit(), 10000);
    assert.equal(plannerInputLimit(100000), 10000);
    assert.equal(plannerInputLimit(5000), 5000);
    assert.throws(() => plannerInputLimit(Infinity), /finite/);
    const reference = { rules: 'Required rule. '.repeat(6000) };
    const large = storyInput({ reference, state: emptyCampaign(), messages }, 100000);
    assert.ok(large.inputOverTarget > 0);
    assert.equal(large.inputLimit, 10000);
    assert.deepEqual(JSON.parse(large.prompt).source_reference, reference);
    assert.ok(storyInput({ reference: {}, state: emptyCampaign(), messages }, 1).inputOverTarget > 0);
    assert.equal(STORY_SCHEMA.name, 'tale_fairy_story_progression_v6');
});

test('legacy migration archives whole preparation and fails transactionally', async () => {
    const legacy = { revision: 4, source, archive: [{ important: 'old archive' }], rpBrief: 'Old broad direction.',
        campaign: 'Legacy', episode: 'Legacy', developments: Array.from({ length: 4 }, (_, i) => ({ id: `old-${i}`,
            progression: 'long old prose '.repeat(800), outcomes: 'Future', access: 'Here' })),
        realization: { old: { evidence: 'Do not lose this.' } } };
    const before = structuredClone(legacy), built = input(legacy);
    assert.equal(built.migration.omittedDrafts, 4);
    assert.doesNotMatch(built.prompt, /Do not lose this/);
    const failed = await pass({}, legacy);
    assert.equal(failed.state, legacy);
    assert.deepEqual(legacy, before);
    const raw = response(); raw.plan.developments[0].id = 'r5-new'; raw.selected_material[0].subjectIds = ['r5-new'];
    raw.plan.goal[0].subjectId = 'r5-new';
    const migrated = await pass(raw, legacy);
    assert.equal(migrated.accepted, true, migrated.error);
    const { archive, ...old } = before;
    assert.deepEqual(migrated.state.archive[1].legacyPreparation, old);
    assert.deepEqual(migrated.state.archive[0], archive[0]);
});

test('truncation and concurrent revision changes preserve the original object', async () => {
    for (const finishReason of ['length', 'max_tokens', 'max_output_tokens']) {
        const state = emptyCampaign();
        const result = await storyPass({ state, source, input: input(state), generate: async () => ({ text: JSON.stringify(response()), finishReason }) });
        assert.equal(result.accepted, false); assert.equal(result.state, state);
    }
    const state = emptyCampaign();
    const result = await storyPass({ state, source, input: input(state), generate: async () => {
        state.revision++; return { text: JSON.stringify(response()) };
    } });
    assert.match(result.error, /changed during/);
});

test('metadata rejects tampered mirrors, evidence and bounds', async () => {
    const { state } = await pass();
    const bad = structuredClone(state); bad.developments[0].progression = 'Reopen the bridge.';
    assert.equal(validCampaignState(bad), false);
    const unknown = structuredClone(state); unknown.workingPlanVersion = 2;
    assert.equal(validCampaignState(unknown), false);
    const oversize = structuredClone(state); oversize.selectedMaterial[0].available = '音'.repeat(1801);
    assert.equal(validCampaignState(oversize), false);
    const raw = response(); raw.plan.consequences = [{ id: 'crossing', text: 'The bridge is repaired.' }];
    raw.observations = [{ id: 'crossing', evidence: [{ index: 0, span: 0 }] }];
    const witnessed = (await pass(raw)).state;
    assert.equal(validCampaignState(witnessed), true);
    for (const change of [s => delete s.planEvidence.crossing, s => s.planEvidence.crossing.witnesses = [],
        s => s.planEvidence.crossing.text = 'Ren agreed.', s => s.planEvidence.crossing.source.fingerprint = '']) {
        const tampered = structuredClone(witnessed); change(tampered);
        assert.equal(validCampaignState(tampered), false);
    }
});

test('changing a consequence under its existing id still requires new evidence', async () => {
    const raw = response(); raw.plan.consequences = [{ id: 'crossing', text: 'The bridge is repaired.' }];
    raw.observations = [{ id: 'crossing', evidence: [{ index: 0, span: 0 }] }];
    const first = await pass(raw);
    raw.plan.consequences[0].text = 'Ren agreed to stay in the village.'; raw.observations = [];
    const rejected = await pass(raw, first.state);
    assert.equal(rejected.state, first.state);
    assert.match(rejected.error, /requires accepted-message witnesses/);
});

test('token targets do not invalidate structurally valid multilingual output or saved state', async () => {
    const raw = response();
    raw.plan.rpUnderstanding.anchors = '界'.repeat(200);
    raw.plan.developments[0].initiative = '音'.repeat(400);
    raw.selected_material[0].available = '音'.repeat(900);
    const result = await pass(raw);
    assert.equal(result.accepted, true, result.error);
    assert.equal(validCampaignState(result.state), true);
    assert.deepEqual(result.state.workingPlan, { ...raw.plan, trajectories: [] });
    assert.deepEqual(result.state.selectedMaterial, raw.selected_material);
    assert.ok(result.budget.plan > 1200 && result.budget.selected > 600 && result.budget.understanding > 300);
    assert.equal(result.budgetNotices.length, 3);
});

test('consequences cannot cite reviewed spans removed by final transport fitting', async () => {
    const built = input(), payload = JSON.parse(built.prompt);
    payload.accepted_messages = payload.accepted_messages.filter(m => m.index !== 0);
    const raw = response();
    raw.plan.consequences = [{ id: 'crossing', text: 'The bridge is repaired.' }];
    raw.observations = [{ id: 'crossing', evidence: [{ index: 0, span: 0 }] }];
    const state = emptyCampaign();
    const result = await storyPass({ state, source, input: built, generate: async () => ({
        text: JSON.stringify(raw), plannerPrompt: JSON.stringify(payload), plannerInputTokens: 4999,
    }) });
    assert.equal(result.accepted, false);
    assert.equal(result.state, state);
    assert.match(result.error, /exact supplied/);
});

test('generation asks for compact fields while admission preserves valid existing wording', async () => {
    const raw = response();
    raw.plan.developments[0].initiative = 'The council organizes repairs, retaining the east-bank access condition and the unfinished task of fitting the remaining support beams before reopening.';
    assert.ok(raw.plan.developments[0].initiative.length > STORY_SCHEMA.value.properties.plan.properties.developments.items.properties.initiative.maxLength);
    let sent;
    const result = await storyPass({ state: emptyCampaign(), input: input(), source, generate: async (_prompt, system, schema) => {
        sent = { system, schema };
        return { text: JSON.stringify(raw), finishReason: 'stop' };
    } });
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.state.workingPlan.developments[0].initiative, raw.plan.developments[0].initiative);
    assert.match(sent.system, /merged plan including retained trajectories below 1200 tokens/);
    assert.match(sent.system, /aiming for 900/);
    assert.match(sent.system, /aim for 300/);
    assert.equal(sent.schema.value.properties.plan.properties.developments.maxItems, 4);
    assert.ok(result.budget.plan <= 1200);
});

test('four compact developments and witnessed consequences fit together without dropping ongoing work', async () => {
    const raw = response();
    raw.plan.developments = Array.from({ length: 4 }, (_, i) => development(`r1-task${i}`));
    raw.plan.goal[0].subjectId = raw.plan.developments[0].id;
    raw.plan.consequences = [{ id: 'repaired', text: 'The bridge is repaired.' }];
    raw.observations = [{ id: 'repaired', evidence: [{ index: 0, span: 0 }] }];
    raw.selected_material[0].subjectIds = raw.plan.developments.map(d => d.id);
    const result = await pass(raw);
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(result.state.workingPlan, { ...raw.plan, trajectories: [] });
    assert.ok(result.budget.plan <= 1200);
    assert.ok(result.budget.selected <= 600);
    const next = await pass(raw, result.state);
    assert.equal(next.accepted, true, next.error);
    assert.equal(next.state.workingPlan.developments.length, 4);
});

test('bounded input fits repeated span labels before rejecting while preserving every witness', () => {
    const args = { state: emptyCampaign(), reference: {}, messages: Array.from({ length: 12 }, (_, index) => ({
        index, role: index % 2 ? 'user' : 'assistant', content: 'First condition holds. Second condition remains. Third condition is unresolved. Fourth action is optional.',
    })) };
    const full = storyInput(args);
    const limit = full.inputTokens - 50;
    const fitted = storyInput(args, limit);
    assert.ok(fitted.inputTokens <= limit);
    const decoded = JSON.parse(fitted.prompt);
    assert.match(decoded.accepted_message_encoding, /exact text/);
    delete decoded.accepted_message_encoding;
    for (const message of decoded.accepted_messages) message.spans = message.spans.map(([span, text]) => ({ span, text }));
    assert.deepEqual(decoded, JSON.parse(full.prompt));
    assert.deepEqual(fitted.evidenceMessages, args.messages);
});
