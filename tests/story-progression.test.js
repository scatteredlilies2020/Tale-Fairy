import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { storyInput, storyPass, storyPassWithRecovery } from '../extension/bounded-story.js';
import { emptyCampaign, validCampaignState, campaignPayload, check } from '../extension/campaign-planner.js';
import { defaultPlannerState, saveState, loadPlannerState } from '../extension/state.js';
import { mergeProgression } from '../extension/story-progression.js';
import { originalUnderstanding } from './helpers/rp-fixtures.js';

// Handwritten model responses test lifecycle and disclosure, not model creativity.
const trajectory = (id = 'r1-repertoire') => ({ id, focus: 'A repertoire with distinct musical voices', owner: 'Ensemble',
    basis: 'The ensemble is writing its own music.', drive: 'Develop a recognizable shared sound.',
    next: { when: 'Members contribute and compare arrangements.', change: 'A rehearsal set mixes different members\' styles.' },
    later: { when: 'A coherent set is ready and a venue offers a suitable date.', change: 'A self-produced concert introduces the ensemble\'s original sound.' } });
const source = { chatId: 'music', referenceHash: 'premise', fingerprint: 'accepted', messageCount: 2 };
const messages = [{ index: 0, role: 'assistant', content: 'Jo puts away her score and makes tea.' },
    { index: 1, role: 'user', name: 'Ren', content: 'I sit by the window with my tea.' }];
const draft = () => ({ plan: { rpUnderstanding: originalUnderstanding({ setting: 'An original music-club RP',
    storyScope: 'Making music together and building an independent ensemble.' }),
    direction: 'Music, shared authorship and club life.', threads: 'Different musical voices.', consequences: [],
    developments: [{ id: 'r1-tea', kind: 'side', owner: 'Jo', control: 'npc', trajectoryIds: [],
        question: 'A quiet break?', initiative: 'Jo brings tea to the window.', resolution: 'The tea break ends.',
        beyond: 'Seasonal baking.', access: { route: 'local', basis: 'Jo and the tea are here.' } }],
    goal: [{ subjectId: 'r1-tea', scope: 'side-thread', aim: 'Share tea.', reachedWhen: 'Tea is shared or declined.' }] },
    progression: { upsert: [trajectory()], retire: [] }, exits: [], observations: [],
    selected_material: [{ subjectIds: ['r1-tea'], available: 'Jo brings tea.',
        developing: 'Jo experiments with seasonal blends.', lasting: 'The club could develop its own tea blend.' }] });
const build = (state = emptyCampaign(), extra = {}) => storyInput({ state,
    reference: { premise: 'Members develop an independent music ensemble and enjoy life together.' },
    messages, playerNames: ['Ren'], previousUsable: Boolean(state.revision), ...extra });
async function pass(raw = draft(), state = emptyCampaign(), extra = {}) {
    return storyPass({ state, source, input: build(state, extra), generate: async () => ({ text: JSON.stringify(raw) }) });
}
const saved = state => loadPlannerState(JSON.parse(JSON.stringify(saveState({}, {
    ...defaultPlannerState(), campaignPreparation: state,
})))).campaignPreparation;

test('progression persists through quiet local replacements, reloads and tight context fitting', async () => {
    let result = await pass();
    assert.equal(result.accepted, true, result.error);
    const original = structuredClone(result.state.workingPlan.trajectories);
    assert.ok(result.budget.plan < 1200);
    for (let i = 0; i < 4; i++) {
        const state = saved(result.state), raw = draft();
        raw.progression.upsert = [];
        const oldId = state.workingPlan.developments[0].id, id = `r${state.revision + 1}-break`;
        raw.plan.developments[0].id = id;
        raw.plan.goal[0].subjectId = id;
        raw.selected_material[0].subjectIds = [id];
        raw.exits = [{ id: oldId, disposition: 'paused', reason: 'Preparation focus changes.', evidence: [] }];
        result = await pass(raw, state);
        assert.equal(result.accepted, true, result.error);
        assert.deepEqual(result.state.workingPlan.trajectories, original);
        assert.deepEqual(result.state.archive.at(-1).progressionChanges, { upsert: [], retire: [] });
        assert.equal(validCampaignState(result.state), true);
        assert.doesNotMatch(campaignPayload(result.state), /repertoire|self-produced|trajectory|Depends on|do not force/i);
    }
    const fitted = build(result.state); // Protected plan survives even an impossibly low soft target.
    const tight = storyInput({ state: result.state, reference: {}, messages, previousUsable: true }, 1);
    assert.deepEqual(JSON.parse(tight.prompt).previous_plan.trajectories, original);
    assert.deepEqual(JSON.parse(fitted.prompt).previous_plan.trajectories, original);
});

test('causal revision changes a trajectory without treating preparation as a witnessed outcome', async () => {
    const first = await pass(), raw = draft();
    raw.progression.upsert[0].next = { when: 'Members agree on a recording session.', change: 'A home-recorded set can reach listeners without a concert.' };
    raw.progression.upsert[0].later = { when: 'Other musicians hear the set and respond.', change: 'A collaboration can introduce different musical traditions.' };
    const result = await pass(raw, first.state, { messages: [...messages,
        { index: 2, role: 'user', name: 'Ren', content: 'I do not want a public concert. What about recording at home?' }] });
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.state.workingPlan.trajectories[0].id, trajectory().id);
    assert.match(result.state.workingPlan.trajectories[0].later.change, /collaboration/);
    assert.deepEqual(result.state.workingPlan.consequences, []);
    assert.deepEqual(result.state.planEvidence, Object.create(null));
    assert.deepEqual(first.state.workingPlan.trajectories, [trajectory()]);
});

test('local access and selection remain independent of private progression links', async () => {
    const raw = draft();
    raw.plan.developments[0].trajectoryIds = [trajectory().id];
    raw.plan.developments[0].access.route = 'none';
    const rejected = await pass(raw);
    assert.equal(rejected.accepted, false);
    raw.selected_material = [];
    const result = await pass(raw);
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(result.state.workingPlan.developments[0].trajectoryIds, [trajectory().id]);
    assert.doesNotMatch(campaignPayload(result.state), /repertoire|self-produced/);
});

test('explicit retirement removes only that preparation and is archived with its reason', async () => {
    const first = await pass(), raw = draft();
    raw.progression = { upsert: [], retire: [{ id: trajectory().id, reason: 'The premise is now a single evening together.' }] };
    const result = await pass(raw, first.state);
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(result.state.workingPlan.trajectories, []);
    assert.deepEqual(result.state.archive.at(-1).workingPlan.trajectories, [trajectory()]);
    assert.deepEqual(result.state.archive.at(-1).progressionChanges, raw.progression);
    assert.deepEqual(result.state.workingPlan.consequences, []);
});

test('bounded vignette may have no trajectory; older saved plans upgrade without reset', async () => {
    const raw = draft(); raw.progression.upsert = [];
    const first = await pass(raw);
    assert.equal(first.accepted, true, first.error);
    const old = structuredClone(first.state);
    delete old.workingPlan.trajectories;
    delete old.workingPlan.developments[0].trajectoryIds;
    assert.equal(validCampaignState(old), true);
    assert.equal(build(old).rebuild, false);
    raw.progression.upsert = [trajectory('r2-repertoire')];
    const next = await pass(raw, old);
    assert.equal(next.accepted, true, next.error);
    assert.equal(next.state.workingPlan.trajectories[0].id, 'r2-repertoire');
    const reset = await pass(draft(), first.state, { resetPlan: true });
    assert.equal(reset.accepted, false, 'A reset still uses the monotonic new-id prefix.');
});

for (const [name, mutate, pattern] of [
    ['missing patch', raw => delete raw.progression, /missing progression/],
    ['duplicate update', raw => raw.progression.upsert.push(trajectory()), /Duplicate progression id/],
    ['unknown link', raw => raw.plan.developments[0].trajectoryIds.push('missing'), /retained trajectories/],
    ['duplicate link', raw => raw.plan.developments[0].trajectoryIds.push(trajectory().id, trajectory().id), /distinct retained/],
    ['missing links', raw => delete raw.plan.developments[0].trajectoryIds, /missing trajectoryIds/],
    ['player ownership', raw => raw.progression.upsert[0].owner = ' Ren ', /Player cannot own/],
    ['invalid new id', raw => raw.progression.upsert[0].id = 'old', /supplied id prefix/],
    ['identical horizons', raw => raw.progression.upsert[0].later.change = raw.progression.upsert[0].next.change, /distinct intermediate/],
    ['unknown retirement', raw => raw.progression.retire.push({ id: 'unknown', reason: 'Finished.' }), /previous trajectory/],
]) test(`invalid progression (${name}) is transactional and can recover once`, async () => {
    const state = emptyCampaign(), before = structuredClone(state), raw = draft(); mutate(raw);
    const rejected = await pass(raw, state);
    assert.equal(rejected.accepted, false);
    assert.match(rejected.error, pattern);
    assert.equal(rejected.state, state);
    assert.deepEqual(state, before);
    let calls = 0;
    const result = await storyPassWithRecovery({ state, source, input: build(state), generate: async () => ({
        text: JSON.stringify(++calls === 1 ? raw : draft()),
    }) });
    assert.equal(calls, 2);
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(state, before);
});

test('retire/update collisions, duplicate retirements and merged capacity are rejected', () => {
    const prior = [trajectory(), trajectory('r1-b'), trajectory('r1-c')], before = structuredClone(prior);
    assert.throws(() => mergeProgression(prior, { upsert: [trajectory()], retire: [{ id: trajectory().id, reason: 'Changed.' }] }, 'r2-', check), /updated and retired/);
    assert.throws(() => mergeProgression(prior, { upsert: [], retire: Array(2).fill({ id: trajectory().id, reason: 'Changed.' }) }, 'r2-', check), /Duplicate progression retirement/);
    assert.throws(() => mergeProgression(prior, { upsert: [trajectory('r2-d')], retire: [] }, 'r2-', check), /array bounds/);
    const merged = mergeProgression(prior, { upsert: [trajectory('r2-d')], retire: [{ id: 'r1-b', reason: 'Premise changed.' }] }, 'r2-', check);
    assert.deepEqual(merged.map(row => row.id), ['r1-repertoire', 'r1-c', 'r2-d']);
    assert.deepEqual(prior, before);
});

test('notebook shows private progression and causal conditions separately from guidance', async () => {
    const scope = vm.createContext({});
    const code = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
    vm.runInContext(code.match(/function workingPlanSummary\([^]*?^}/m)[0], scope);
    const state = (await pass()).state;
    const summary = scope.workingPlanSummary(state);
    assert.match(summary, /PRIVATE PROGRESSION \(not sent to the writer\)/);
    assert.ok(summary.includes(trajectory().next.when));
    assert.ok(summary.includes(trajectory().later.change));
    assert.doesNotMatch(campaignPayload(state), /self-produced concert|Members contribute/);
});

test('retirement can clear an old owner that is now a player character', () => {
    const old = trajectory(); old.owner = 'Ren';
    assert.deepEqual(mergeProgression([old], { upsert: [], retire: [{ id: old.id, reason: 'Ownership changed.' }] }, 'r2-', check, ['Ren']), []);
    assert.throws(() => mergeProgression([old], { upsert: [], retire: [] }, 'r2-', check, ['Ren']), /Player cannot own/);
});

test('an explicit rebuild archives progression instead of carrying it into the new preparation', async () => {
    const first = await pass(), raw = draft();
    raw.progression.upsert = [];
    raw.plan.developments[0].id = 'r2-evening';
    raw.plan.goal[0].subjectId = 'r2-evening';
    raw.selected_material[0].subjectIds = ['r2-evening'];
    const result = await pass(raw, first.state, { resetPlan: true });
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.state.revision, 2);
    assert.deepEqual(result.state.workingPlan.trajectories, []);
    assert.deepEqual(result.state.archive.at(-1).preparation.workingPlan.trajectories, [trajectory()]);
    assert.equal(validCampaignState(result.state), true);
});
