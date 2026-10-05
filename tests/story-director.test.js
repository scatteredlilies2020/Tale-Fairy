import test from 'node:test';
import assert from 'node:assert/strict';
import { directorInput, directorPass, DIRECTOR_SYSTEM, DIRECTOR_SCHEMA, parseDirectorResponse } from '../extension/story-director.js';
import { emptyCampaign, validCampaignState, campaignPayload } from '../extension/campaign-planner.js';
import { storyInputTokens } from '../extension/story-budget.js';

const reference = { premise: 'An open RP about village life, friendships and discovering nearby communities.' };
const messages = [{ index: 0, role: 'assistant', name: 'Jo', content: 'Jo closes the rehearsal room after the show.' },
    { index: 1, role: 'user', name: 'Ren', content: 'I help pack and ask about the neighborhood.' }];
const source = { chatId: 'story', referenceHash: 'reference', fingerprint: 'accepted', messageCount: 2 };
const proposal = (id = 'r1-kitchen') => ({ id, title: 'A neighborhood supper book', owner: 'Community cooks',
    idea: 'Cooks swap recipes and try out a shared supper menu.', next: 'The cooks compare family recipes at an open supper.',
    later: 'An illustrated recipe book could connect different households.' });
const selected = (id = 'r1-kitchen') => ({ id, route: 'local', when: '',
    action: 'At the neighborhood kitchen, the cooks invite neighbors to try their supper recipes.',
    next: 'Shared meals could bring unfamiliar households together.', later: 'Neighbors could contribute to a communal recipe book.' });
const response = () => ({ direction: 'Explore village friendships, shared interests and nearby communities.',
    upsert: [proposal()], retire: [], select: [selected()] });
async function run(state = emptyCampaign(), raw = response(), extra = {}) {
    const input = directorInput({ reference, state, messages, playerNames: ['Ren'], previousUsable: state.revision > 0, ...extra });
    let requests = 0;
    const result = await directorPass({ state, input, source, generate: async (_prompt, system, schema, meta) => {
        requests++;
        assert.equal(system, DIRECTOR_SYSTEM); assert.equal(schema, DIRECTOR_SCHEMA); assert.equal(meta.stage, 'director');
        return typeof raw === 'string' ? { text: raw } : { text: JSON.stringify(raw), finishReason: 'stop' };
    } });
    assert.equal(requests, 1);
    return { ...result, input };
}

test('one request produces useful writer material and compatible persistence without a summary or audit', async () => {
    const result = await run();
    assert.equal(result.accepted, true, result.error);
    assert.equal(validCampaignState(result.state), true);
    assert.equal(result.state.revision, 1);
    assert.deepEqual(result.state.workingPlan.consequences, []);
    assert.deepEqual(result.state.planEvidence, {});
    const payload = campaignPayload(result.state);
    assert.match(payload, /invite neighbors/); assert.match(payload, /recipe book/);
    assert.doesNotMatch(payload, /Creative proposal|r1-kitchen|private|rpUnderstanding|outlook|upsert/);
    for (const key of ['rpUnderstanding', 'storyLife', 'throughline', 'initiativeReceipt', 'goal']) {
        assert.equal(Object.hasOwn(result.state.workingPlan, key), false);
    }
    assert.ok(storyInputTokens('', DIRECTOR_SYSTEM, DIRECTOR_SCHEMA) < 1600, 'contract remains compact');
});

test('ordinary reviews retain unused possibilities, send only compact preparation and clear old selection', async () => {
    const first = await run();
    const raw = { direction: response().direction, upsert: [], retire: [], select: [] };
    const result = await run(first.state, raw);
    assert.equal(result.accepted, true, result.error);
    assert.equal(validCampaignState(result.state), true);
    assert.deepEqual(result.state.workingPlan.trajectories, first.state.workingPlan.trajectories);
    assert.deepEqual(result.state.selectedMaterial, []);
    const prompt = JSON.parse(result.input.prompt);
    assert.equal(prompt.previous_preparation.possibilities[0].id, 'r1-kitchen');
    assert.equal(prompt.previous_plan, undefined);
    assert.doesNotMatch(result.input.prompt, /planEvidence|selectedMaterial|outlook|rpUnderstanding|initiative_review|observations/);
});

test('updating a selected possibility replaces its public outlook without a separate keep/replace review', async () => {
    const first = await run();
    const raw = response(); raw.upsert[0].idea = 'The cooks test seasonal recipes with nearby farms.';
    raw.select[0].action = 'The cooks invite a local farmer to bring seasonal ingredients to the next supper.';
    const result = await run(first.state, raw);
    assert.equal(result.accepted, true, result.error);
    assert.match(campaignPayload(result.state), /local farmer/);
    assert.deepEqual(result.plannerNotices, []);
});

test('a retired or unknown optional selection is withheld while usable preparation saves without correction calls', async () => {
    const first = await run();
    const raw = { direction: response().direction, upsert: [proposal('r2-travel')], retire: ['r1-kitchen'],
        select: [selected('r1-kitchen'), selected('r2-travel')] };
    const result = await run(first.state, raw);
    assert.equal(result.accepted, true, result.error);
    assert.equal(validCampaignState(result.state), true);
    assert.deepEqual(result.state.workingPlan.trajectories.map(row => row.id), ['r2-travel']);
    assert.deepEqual(result.state.selectedMaterial[0].subjectIds, ['r2-travel']);
    assert.match(result.plannerNotices[0], /Selection withheld/);
});

test('player ownership and invented identity are rejected per possibility without losing independent valid work', async () => {
    const raw = response();
    raw.upsert.unshift({ ...proposal('r1-player'), owner: 'Ren' }, proposal('unreserved-id'));
    raw.select.unshift(selected('r1-player'), selected('unreserved-id'));
    const result = await run(emptyCampaign(), raw);
    assert.equal(result.accepted, true, result.error);
    assert.equal(validCampaignState(result.state), true);
    assert.deepEqual(result.state.workingPlan.trajectories.map(row => row.id), ['r1-kitchen']);
    assert.deepEqual(result.state.selectedMaterial[0].subjectIds, ['r1-kitchen']);
    assert.equal(result.plannerNotices.length, 4);
});

test('rejected updates retain old private preparation but cannot publish their dependent new selection', async () => {
    const first = await run();
    const raw = response(); raw.upsert[0].owner = 'Ren';
    raw.select[0].action = 'An action authored for the rejected player-owned update.';
    const result = await run(first.state, raw);
    assert.equal(result.accepted, true, result.error);
    assert.equal(validCampaignState(result.state), true);
    assert.deepEqual(result.state.workingPlan.trajectories, first.state.workingPlan.trajectories);
    assert.deepEqual(result.state.selectedMaterial, []);
    assert.match(result.plannerNotices[1], /rejected possibility/);
});

test('inaccessible selections, duplicated ids and public overflows cannot leak into the writer packet', async () => {
    const raw = response(); raw.select[0].route = 'none';
    const quiet = await run(emptyCampaign(), raw);
    assert.equal(quiet.accepted, true, quiet.error); assert.deepEqual(quiet.state.selectedMaterial, []);
    raw.select = [selected(), selected()];
    const duplicate = await run(emptyCampaign(), raw);
    assert.equal(duplicate.accepted, true, duplicate.error); assert.equal(duplicate.state.workingPlan.openings.length, 1);
    assert.match(duplicate.plannerNotices[0], /Duplicate/);
    const big = response();
    big.select[0].action = '菜'.repeat(650); big.select[0].next = '旅'.repeat(850); big.select[0].later = '友'.repeat(850);
    const oversized = await run(emptyCampaign(), big);
    assert.equal(oversized.accepted, true, oversized.error);
    assert.deepEqual(oversized.state.selectedMaterial, []);
    assert.equal(oversized.state.workingPlan.trajectories.length, 1);
    assert.match(oversized.plannerNotices[0], /budget/);
});

test('complete punctuation mistakes are repaired locally; cutoff responses preserve the previous state with no retry', async () => {
    const raw = JSON.stringify(response()).replace('"upsert":', '"upsert":').replace(',"retire"', ' "retire"');
    const repaired = await run(emptyCampaign(), raw);
    assert.equal(repaired.accepted, true, repaired.error);
    assert.deepEqual(parseDirectorResponse('```json\n{"ok":true,}\n```'), { ok: true });
    const failed = await run(repaired.state, JSON.stringify(response()).slice(0, -8));
    assert.equal(failed.accepted, false);
    assert.equal(failed.state, repaired.state);
    assert.match(failed.error, /Incomplete/);
});

test('rebuilds discard old proposals while reserving ids and archived preparation', async () => {
    const first = await run();
    const raw = { direction: response().direction, upsert: [proposal('r2-fresh')], retire: [], select: [selected('r2-fresh')] };
    const result = await run(first.state, raw, { resetPlan: true });
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(result.state.workingPlan.trajectories.map(row => row.id), ['r2-fresh']);
    assert.equal(result.state.archive[0].rebuild, true);
    assert.equal(result.state.archive[0].preparation.revision, 1);
    assert.equal(JSON.parse(result.input.prompt).previous_preparation.possibilities.length, 0);
});
