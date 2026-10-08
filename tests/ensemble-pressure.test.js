import test from 'node:test';
import assert from 'node:assert/strict';
import { directorInput, directorPass, DIRECTOR_SYSTEM } from '../extension/story-director.js';
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
    const reviewed = await run(first.state, raw => ({ ...raw, direction: 'A peaceful meal after rescue.', select: [] }));
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
        changeReason: 'Explicit author direction: foreground civilian life after the lasting role change.' } }));
    assert.equal(explicit.accepted, true, explicit.error);
    assert.equal(decode(campaignPayload(explicit.state)).rp_orientation, changed);
    assert.doesNotMatch(campaignPayload(explicit.state), /Explicit author direction:/);
    assert.equal(explicit.state.archive.at(-1).workingPlan.storyStructure.foundation.reminder, fixture.reminder);
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

test('invalid or token-oversized foundation rejects the pass without losing saved work', async () => {
    const first = await run();
    for (const foundation of [null, { reminder: 'New', changeReason: '', scratchpad: 42 },
        { reminder: '界'.repeat(600), changeReason: 'Changed premise.', scratchpad: '' }]) {
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
    const report = fitStoryContext(Array.from({ length: 10 }, () => ({ description: 'A useful independent concern. '.repeat(10) })), [],
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
    for (const requirement of [/AI-Dungeon-like/, /one-on-one/, /ALL their characters/, /Original worlds support invention/,
        /canon is only a fallible reference/i, /most plausible meaningful progression/, /do not force their events back/,
        /Quiet scenes can stay quiet/, /endsWhen/, /Keep the reminder verbatim/, /no mandatory levels/]) {
        assert.match(DIRECTOR_SYSTEM, requirement);
    }
});
