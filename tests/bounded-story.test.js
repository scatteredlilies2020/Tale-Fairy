import test from 'node:test';
import assert from 'node:assert/strict';
import { storyInput, storyPass, STORY_SYSTEM, STORY_SCHEMA } from '../extension/bounded-story.js';
import { emptyCampaign, validCampaignState, campaignPayload, check } from '../extension/campaign-planner.js';
import { planTokens, validateWorkingPlan, plannerInputLimit } from '../extension/working-plan.js';
import { defaultPlannerState, saveState, loadPlannerState } from '../extension/state.js';

const messages = [{ index: 0, role: 'assistant', content: 'The bridge is repaired. The village celebrates.' },
    { index: 1, role: 'user', name: 'Ren', content: 'I stay for dinner.' }];
const source = { chatId: 'story', referenceHash: 'reference', fingerprint: 'accepted', messageCount: 2 };
const development = (id = 'r1-bridge') => ({ id, kind: 'arc', owner: 'Village council', control: 'npc',
    question: 'Can the damaged bridge reopen?', initiative: 'The council organizes the repairs.',
    resolution: 'The crossing is usable or the repair attempt is abandoned.', beyond: 'A working crossing restores trade.',
    access: { route: 'local', basis: 'The village is here; repairs are visible.' } });
const response = () => ({ plan: { direction: 'A wandering life across distinct communities.', threads: 'Ren hopes to become a trusted guide.',
    consequences: [], developments: [development()] }, exits: [], observations: [],
    selected_material: [{ subjectIds: ['r1-bridge'], available: 'The council brings repaired planks to the crossing.' }] });
function input(state = emptyCampaign(), extra = {}) {
    return storyInput({ reference: { premise: 'Travel with freely chosen stops.' }, state, messages, playerNames: ['Ren'],
        previousUsable: Boolean(state.revision), verifiedPlanEvidence: state.planEvidence || {}, ...extra });
}
async function pass(raw = response(), state = emptyCampaign(), extra = {}) {
    let calls = 0;
    const result = await storyPass({ state, source, input: input(state, extra), generate: async () => {
        calls++; return { text: JSON.stringify(raw), finishReason: 'stop' };
    } });
    assert.equal(calls, 1);
    return result;
}

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

test('finite arc ends with evidence while a long thread survives and an independent arc begins', async () => {
    const first = await pass();
    const raw = response();
    raw.plan.developments = [{ ...development('r2-festival'), question: 'Which work will the troupe share?', initiative: 'The troupe rehearses its new comedy.',
        resolution: 'The troupe presents or shelves this production.', beyond: 'Other communities develop their own art.' }];
    raw.exits = [{ id: 'r1-bridge', disposition: 'closed', reason: 'The crossing is repaired.', evidence: [{ index: 0, span: 0 }] }];
    raw.plan.consequences = [{ id: 'crossing', text: 'The bridge is repaired.' }];
    raw.observations = [{ id: 'crossing', evidence: [{ index: 0, span: 0 }] }];
    raw.selected_material = [{ subjectIds: ['r2-festival'], available: 'The troupe rehearses its comedy in the square.' }];
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
    const raw = response(); raw.plan.developments = []; raw.selected_material = [];
    raw.exits = [{ id: 'r1-bridge', disposition, reason: 'Set aside.', evidence: [] }];
    const result = await pass(raw, state);
    assert.equal(result.accepted, ['paused', 'dropped'].includes(disposition), result.error);
    if (!result.accepted) assert.equal(result.state, state);
});

test('omission cannot silently erase an active initiative; no automatic retry', async () => {
    const { state } = await pass();
    const raw = response(); raw.plan.developments = []; raw.selected_material = [];
    const rejected = await pass(raw, state);
    assert.equal(rejected.state, state);
    assert.match(rejected.error, /explicit exit/);
});

for (const [name, change, error] of [
    ['duplicate ids', r => r.plan.developments.push(structuredClone(r.plan.developments[0])), /Duplicate/],
    ['unprefixed new id', r => r.plan.developments[0].id = 'old', /id prefix/],
    ['player owner', r => r.plan.developments[0].owner = ' Ren ', /Player/],
    ['inaccessible writer material', r => r.plan.developments[0].access.route = 'none', /discovery route/],
    ['unknown selection id', r => r.selected_material[0].subjectIds = ['unknown'], /unknown/],
    ['unwitnessed fact', r => r.plan.consequences.push({ id: 'success', text: 'Ren won.' }), /witnesses/],
    ['invalid span', r => { r.plan.consequences.push({ id: 'success', text: 'Ren won.' }); r.observations.push({ id: 'success', evidence: [{ index: 0, span: 99 }] }); }, /span/i],
    ['oversized Unicode packet', r => { r.selected_material[0].available = '音'.repeat(900); }, /600 tokens/],
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

test('working plan count and tokens are independent hard limits', () => {
    const raw = response();
    raw.plan.developments = Array.from({ length: 5 }, (_, i) => development(`r1-${i}`));
    assert.throws(() => validateWorkingPlan(raw.plan, check), /array bounds/);
    raw.plan.developments.pop();
    for (const d of raw.plan.developments) d.initiative = '音'.repeat(400);
    assert.ok(planTokens(raw.plan) > 1200);
    assert.throws(() => validateWorkingPlan(raw.plan, check), /1200 tokens/);
});

test('complete request ceiling includes schema and instructions and cannot be raised', () => {
    assert.equal(plannerInputLimit(100000), 8000);
    assert.equal(plannerInputLimit(5000), 5000);
    assert.throws(() => plannerInputLimit(Infinity), /finite/);
    assert.throws(() => storyInput({ reference: { rules: 'Required rule. '.repeat(6000) }, state: emptyCampaign(), messages }, 100000), /exceeds 8000/);
    assert.throws(() => storyInput({ reference: {}, state: emptyCampaign(), messages }, 1), /including instructions\/schema/);
    assert.ok(STORY_SYSTEM.includes('No turn timers'));
    assert.equal(STORY_SCHEMA.name, 'tale_fairy_working_plan_v1');
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
    const oversize = structuredClone(state); oversize.selectedMaterial[0].available = '音'.repeat(900);
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
    assert.match(sent.system, /800 tokens for the ENTIRE serialized plan/);
    assert.match(sent.system, /1200 characters of prose across the whole plan/);
    assert.match(sent.system, /300 tokens including JSON/);
    assert.equal(sent.schema.value.properties.plan.properties.developments.maxItems, 4);
    assert.ok(result.budget.plan <= 1200);
});

test('four compact developments and witnessed consequences fit together without dropping ongoing work', async () => {
    const raw = response();
    raw.plan.developments = Array.from({ length: 4 }, (_, i) => development(`r1-task${i}`));
    raw.plan.consequences = [{ id: 'repaired', text: 'The bridge is repaired.' }];
    raw.observations = [{ id: 'repaired', evidence: [{ index: 0, span: 0 }] }];
    raw.selected_material[0].subjectIds = raw.plan.developments.map(d => d.id);
    const result = await pass(raw);
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(result.state.workingPlan, raw.plan);
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
