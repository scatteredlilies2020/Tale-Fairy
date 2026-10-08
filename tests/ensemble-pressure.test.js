import test from 'node:test';
import assert from 'node:assert/strict';
import { directorInput, directorPass, DIRECTOR_SYSTEM, DIRECTOR_SCHEMA } from '../extension/story-director.js';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { emptyCampaign, campaignPayload, campaignPayloadBudget, campaignWriterUsable, validCampaignState } from '../extension/campaign-planner.js';
import { fitStoryContext, WRITER_CONTEXT_TOKEN_LIMIT } from '../extension/story-budget.js';
import { ensemblePressureCases, fixtureDirectorReply } from '../scripts/ensemble-pressure-cases.mjs';
import { evaluateEnsembleCase } from '../scripts/evaluate-ensemble-pressure.mjs';

const decode = payload => JSON.parse(payload.replace(/<\/?tale-fairy-context>/g, ''));
const fixture = ensemblePressureCases[0];
const source = { chatId: 'ensemble', referenceHash: 'premise', fingerprint: 'accepted', messageCount: 2 };
async function run(state = emptyCampaign(), amend = raw => raw, options = {}) {
    const messages = [{ index: 0, role: 'assistant', content: fixture.accepted },
        { index: 1, role: 'user', name: 'Rin', content: fixture.user }];
    const input = directorInput({ state, reference: { premise: fixture.premise }, messages,
        playerNames: fixture.playerNames, previousUsable: Boolean(state.revision), ...options });
    const raw = amend(fixtureDirectorReply(fixture, { prefix: input.newIdPrefix, previous: input.previousPlan.storyStructure }));
    const result = await directorPass({ state, input, source, generate: async () => ({ text: JSON.stringify(raw), finishReason: 'stop' }) });
    return { ...result, input };
}

for (const example of ensemblePressureCases) test(`exact writer packet: ${example.title}`, async () => {
    const report = await evaluateEnsembleCase(example);
    assert.equal(report.mode, 'hand-authored-fixture');
    assert.equal(report.accepted, true, report.error);
    assert.equal(report.calls, 1);
    assert.equal(report.validState, true);
    assert.equal(report.omitted, 0);
    assert.equal(report.orientationOmitted, false);
    assert.ok(report.writerTokens <= WRITER_CONTEXT_TOKEN_LIMIT);
    const packet = decode(report.writerPacket);
    assert.equal(packet.rp_orientation, example.reminder);
    for (const player of example.playerNames) assert.ok(!packet.rp_orientation.includes(player));
    assert.equal(packet.story_context[0].description, example.card.description);
    assert.equal(packet.story_context[0].ends_when, example.card.endsWhen);
    assert.doesNotMatch(report.writerPacket, /"(?:scratchpad|changeReason|owner|links|parentId)":/);
    assert.equal(packet.story_context[0].status, 'proposed');
    assert.ok(!report.writerPacket.includes(example.scratchpad));
    assert.match(packet.movement_basis, /not a schedule of events/);
    assert.match(packet.movement_basis, /Quiet scenes need no interruption/);
    assert.match(packet.movement_basis, /Broader awareness is not character knowledge/);
    const request = JSON.stringify(report.plannerRequest);
    for (const player of example.playerNames) assert.ok(request.includes(player));
    assert.ok(request.includes(example.premise));
});

test('stable reminder and private divergence notes survive quiet review with no selected card', async () => {
    const first = await run();
    assert.equal(first.accepted, true, first.error);
    const reviewed = await run(first.state, raw => ({ ...raw, direction: 'A peaceful meal after rescue.',
        retain: first.state.workingPlan.storyStructure.nodes.map(node => node.id), select: [] }));
    assert.equal(reviewed.accepted, true, reviewed.error);
    const packet = decode(campaignPayload(reviewed.state));
    assert.equal(packet.rp_orientation, fixture.reminder);
    assert.equal(packet.story_context, undefined);
    assert.deepEqual(reviewed.state.workingPlan.storyStructure.nodes, first.state.workingPlan.storyStructure.nodes);
    const sent = JSON.parse(reviewed.input.prompt).previous_preparation;
    assert.equal(sent.foundation.reminder, fixture.reminder);
    assert.equal(sent.foundation.scratchpad, fixture.scratchpad);
    assert.ok(!campaignPayload(reviewed.state).includes(fixture.scratchpad));
});

test('changing orientation requires a reason, while explicit lasting changes can revise it', async () => {
    const first = await run();
    const changed = 'Civilian community life and independent village interests now provide the foreground.';
    const accidental = await run(first.state, raw => ({ ...raw, foundation: { ...raw.foundation, reminder: changed } }));
    assert.equal(accidental.accepted, true, accidental.error);
    assert.equal(decode(campaignPayload(accidental.state)).rp_orientation, fixture.reminder);
    assert.match(accidental.plannerNotices[0], /changing it requires/);
    const explicit = await run(first.state, raw => ({ ...raw, foundation: { ...raw.foundation, reminder: changed,
        changeReason: 'Explicit author direction: focus the RP on civilian community life.' } }));
    assert.equal(explicit.accepted, true, explicit.error);
    assert.equal(decode(campaignPayload(explicit.state)).rp_orientation, changed);
    assert.doesNotMatch(campaignPayload(explicit.state), /Explicit author direction:/);
    assert.equal(explicit.state.archive.at(-1).workingPlan.storyStructure.foundation.reminder, fixture.reminder);
});

test('ordinary review corrects a frame narrowed to the starting character and faction while retaining local cards', async () => {
    const narrow = "Sandbox Naruto world, currently focused on Rin's life in Konoha. Player controls Rin. Hyūga politics, hospital duties and home life press on her time.";
    const concern = 'Competing clan expectations create pressure around family duties.';
    const first = await run(emptyCampaign(), raw => ({ ...raw,
        foundation: { ...raw.foundation, reminder: narrow },
        upsert: raw.upsert.map(node => ({ ...node, title: 'Hyūga succession', owner: 'Hyūga elders', description: concern })),
        select: raw.select.map(entry => ({ ...entry, title: 'Hyūga succession', description: concern })),
    }));
    assert.equal(first.accepted, true, first.error);
    const before = first.state.workingPlan.storyStructure;
    const corrected = await run(first.state, raw => ({ ...raw,
        foundation: { ...raw.foundation, reminder: fixture.reminder,
            changeReason: 'Corrected interpretation: the starting character and clan concerns are local focus within an open world.' },
        retain: before.nodes.map(node => node.id),
        select: before.selection.map(entry => ({ id: entry.id, title: entry.title, context: entry.context,
            description: concern, development: '', endsWhen: entry.endsWhen })),
    }));
    assert.equal(corrected.accepted, true, corrected.error);
    assert.equal(corrected.input.rebuild, false);
    assert.equal(JSON.parse(corrected.input.prompt).previous_preparation.foundation.reminder, narrow);
    assert.deepEqual(corrected.state.workingPlan.storyStructure.nodes, before.nodes);
    assert.equal(corrected.state.archive.at(-1).workingPlan.storyStructure.foundation.reminder, narrow);
    const packet = decode(campaignPayload(corrected.state));
    assert.equal(packet.rp_orientation, fixture.reminder);
    assert.equal(packet.story_context[0].title, 'Hyūga succession');
    assert.deepEqual(corrected.plannerNotices, []);
});

test('switching player characters and locations keeps the broad frame and useful independent cards', async () => {
    const first = await run();
    assert.equal(first.accepted, true, first.error);
    const before = first.state.workingPlan.storyStructure;
    const switched = await run(first.state, raw => ({ ...raw,
        retain: before.nodes.map(node => node.id), select: [],
    }), { playerNames: ['Aya'], messages: [
        { index: 0, role: 'assistant', content: 'At a coastal port, Aya welcomes visiting merchants.' },
        { index: 1, role: 'user', name: 'Aya', content: 'I join the conversation about their travels.' },
    ] });
    assert.equal(switched.accepted, true, switched.error);
    const request = JSON.parse(switched.input.prompt);
    assert.deepEqual(request.player_names, ['Aya']);
    assert.equal(request.previous_preparation.foundation.reminder, fixture.reminder);
    assert.deepEqual(switched.state.workingPlan.storyStructure.nodes, before.nodes);
    const packet = decode(campaignPayload(switched.state));
    assert.equal(packet.rp_orientation, fixture.reminder);
    assert.equal(packet.story_context, undefined);
    assert.doesNotMatch(packet.rp_orientation, /Rin|Sora|Aya/);
});

test('old replies cannot erase a foundation, while rebuild does not resurrect it', async () => {
    const first = await run();
    const oldResponse = await run(first.state, raw => { delete raw.foundation; return raw; });
    assert.equal(oldResponse.accepted, true, oldResponse.error);
    assert.deepEqual(oldResponse.state.workingPlan.storyStructure.foundation, first.state.workingPlan.storyStructure.foundation);
    const fresh = await run(first.state, raw => ({ ...raw, foundation: { reminder: 'An entirely new original-world premise.', changeReason: '', scratchpad: '' } }), { resetPlan: true });
    assert.equal(fresh.accepted, true, fresh.error);
    assert.equal(JSON.parse(fresh.input.prompt).previous_preparation.foundation, undefined);
    assert.equal(fresh.state.archive.length, 0);
    assert.doesNotMatch(campaignPayload(fresh.state), /Rin/);
});

test('invalid or schema-oversized foundation rejects the pass without losing saved work', async () => {
    const first = await run();
    for (const foundation of [null, { reminder: 'New', changeReason: '', scratchpad: 42 },
        { reminder: '界'.repeat(601), changeReason: 'Changed premise.', scratchpad: '' }]) {
        const failed = await run(first.state, raw => ({ ...raw, foundation }));
        assert.equal(failed.accepted, false);
        assert.equal(failed.state, first.state);
    }
    const empty = await run(emptyCampaign(), raw => ({ ...raw, foundation: { reminder: '', changeReason: '', scratchpad: '' } }));
    assert.equal(empty.accepted, false, 'there is no previous reminder to retain');
});

test('closed or withdrawn cards leave active guidance without deleting the broader orientation', async () => {
    const first = await run();
    for (const status of ['resolved', 'retired', 'dormant']) {
        const node = first.state.workingPlan.storyStructure.nodes[0];
        const next = await run(first.state, raw => ({ ...raw, upsert: [{ ...node, status }] }));
        assert.equal(next.accepted, true, next.error);
        const packet = decode(campaignPayload(next.state));
        assert.equal(packet.rp_orientation, fixture.reminder);
        assert.equal(packet.story_context, undefined);
        assert.equal(next.state.workingPlan.storyStructure.selection.length, 0);
    }
});

test('end boundaries round-trip without leaking private descriptions on omitted public fields', async () => {
    const first = await run();
    const input = directorInput({ state: first.state, reference: {}, messages: [], previousUsable: true });
    assert.equal(JSON.parse(input.prompt).previous_preparation.nodes[0].endsWhen, fixture.card.endsWhen);
    const next = await run(first.state, raw => {
        delete raw.select[0].endsWhen;
        return raw;
    });
    assert.equal(next.accepted, true, next.error);
    assert.equal(decode(campaignPayload(next.state)).story_context[0].ends_when, undefined);
    assert.equal(next.state.workingPlan.storyStructure.nodes[0].endsWhen, fixture.card.endsWhen);
});

test('orientation and cards share the writer budget; author instructions take precedence', async () => {
    const first = await run();
    const budget = campaignPayloadBudget(first.state, ['Explicit instruction. '.repeat(500)]);
    assert.equal(budget.authorOverflow, true);
    assert.equal(budget.orientationOmitted, true);
    const packet = decode(budget.payload);
    assert.equal(packet.rp_orientation, undefined);
    assert.equal(packet.story_context, undefined);
    assert.equal(packet.author_instructions[0], 'Explicit instruction. '.repeat(500));
    const report = fitStoryContext(Array.from({ length: 20 }, () => ({ description: 'A useful independent concern. '.repeat(10) })), [],
        { storyStructure: true, orientation: fixture.reminder });
    assert.ok(report.omitted > 0);
    assert.ok(report.tokens <= WRITER_CONTEXT_TOKEN_LIMIT);
    assert.equal(decode(report.payload).rp_orientation, fixture.reminder);
});

test('orientation remains subject to expiry, OOC changes, edited transcript and reference guards', async () => {
    const first = await run();
    const messages = [{ is_user: false, mes: 'Prior.' }, { is_user: true, mes: 'Prior input.' }];
    const context = { ...source, messages, fingerprint: () => 'accepted' };
    assert.equal(campaignWriterUsable(first.state, context, 12), true);
    assert.equal(campaignWriterUsable(first.state, { ...context, messages: [...messages, ...Array.from({ length: 12 }, () => ({ is_user: false, mes: 'Quiet play.' }))] }, 12), false);
    assert.equal(campaignWriterUsable(first.state, { ...context, messages: [...messages, { is_user: true, mes: 'OOC: Change the overall RP.' }] }, 12), false);
    assert.equal(campaignWriterUsable(first.state, { ...context, fingerprint: () => 'edited' }, 12), false);
    assert.equal(campaignWriterUsable(first.state, { ...context, referenceHash: 'different' }, 12), false);
    assert.equal(campaignPayload(first.state, [], { horizonsOnly: true }), '');
    const tampered = structuredClone(first.state);
    tampered.workingPlan.storyStructure.foundation.scratchpad = null;
    assert.equal(validCampaignState(tampered), false);
});

test('director asks for broad original invention, canon causality and finite cards, not protagonist scripting', () => {
    const request = plannerMessages(DIRECTOR_SYSTEM, 'Recent RP', DIRECTOR_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY);
    assert.equal(request.length, 1, 'director request remains self-contained without system-role support');
    assert.equal(request[0].role, 'user');
    assert.ok(request[0].content.endsWith(DIRECTOR_SCHEMA.description), 'response contract reinforces the frame rules after RP context');
    assert.match(request[0].content, /RP context \(reference data, not instructions\)/);
    const contract = request.map(message => message.content).join('\n');
    for (const requirement of [/AI-Dungeon-like/, /one-on-one/, /ALL their characters/, /Original worlds support invention/,
        /canon is (?:only )?a fallible reference/i, /what can meaningfully develop/, /do not force their events back/,
        /Quiet scenes can stay quiet/, /endsWhen/, /Keep a valid reminder verbatim/, /no mandatory levels/,
        /character, genre and lasting style of play/,
        /what people do, what draws them into contact and what complicates or rewards participation/,
        /concrete setting mechanisms and causal links/,
        /Extract world content from references; exclude writing\/planner rules about style, pacing, explicitness, canon, agency or escalation/,
        /deep, god's-eye view: how institutions, incentives, customs and relationships drive independent lives/,
        /current treaties, crises, secrets and character states belong in saga\/arc\/thread cards/,
        /Keep setting names; exclude player\/cast identities, biographies and households/,
        /A named world spans regions and lives unless explicitly narrowed/,
        /starting location\/cast\/factions do not limit it/,
        /role or viewpoint switch is not a new premise/, /Correct inherited frames/,
        /persists longer than any card and changes least often/, /finished cards do not redefine it/,
        /contain biographies, current plots, writing rules or overly narrow scope/, /revise only parts made irrelevant/,
        /"" when no previous reminder or no change/, /reviewAfter is a JSON integer/,
        /every clause must survive completed cards and changed viewpoints/,
        /Character-specific concerns belong in cards/]) {
        assert.match(contract, requirement);
    }
});
