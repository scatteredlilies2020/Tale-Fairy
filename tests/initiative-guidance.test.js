import test from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTOR_SYSTEM, directorInput, directorPass } from '../extension/story-director.js';
import { emptyCampaign, campaignPayload, preWeightedCampaignPayload, preInitiativeCampaignPayload, preCausalEffectPayload } from '../extension/campaign-planner.js';
import { generationContextEntries } from '../extension/generation-context.js';
import { storyContextPayload, storyContextJson, STORY_INITIATIVE_BASIS, ACTIVITY_INITIATIVE_BASIS } from '../extension/story-budget.js';
import { ensemblePressureCases, fixtureDirectorReply } from '../scripts/ensemble-pressure-cases.mjs';

const decode = packet => JSON.parse(packet.replace(/<\/?tale-fairy-context>/g, ''));

test('director encourages broad initiative without prescribing events or changing the frame boundary', () => {
    assert.match(DIRECTOR_SYSTEM, /Encourage initiative and fresh developments, not repeated tension/);
    assert.match(DIRECTOR_SYSTEM, /Keep guidance broad; the writer chooses manifestations from current play/);
    assert.match(DIRECTOR_SYSTEM, /These are planner rules, not reminder content/);
    for (const pattern of [/without waiting for the player/, /fresh developments and meaningful consequences/,
        /not merely repeated reminders/, /expression can vary/, /Not every reply needs an event/,
        /Preserve quiet interaction, varied intensity and player choice/, /need not mean danger or escalation/]) {
        assert.match(STORY_INITIATIVE_BASIS, pattern);
    }
});

test('world frame alone and current cards both receive initiative guidance, but empty and legacy contexts do not', () => {
    const frame = 'A community sustained by work, friendships and shared occasions.';
    const options = { storyStructure: true, orientation: frame };
    const packet = decode(storyContextPayload([], [], options));
    assert.equal(packet.rp_orientation, frame);
    assert.equal(packet.initiative_basis, ACTIVITY_INITIATIVE_BASIS);
    assert.equal(packet.story_context, undefined);
    const card = { title: 'Shared ambitions', status: 'active', effects: [{ label: 'Commitments', pressure: 'Promises draw people into contact.' }] };
    assert.equal(decode(storyContextPayload([card], [], { storyStructure: true })).initiative_basis, ACTIVITY_INITIATIVE_BASIS);
    assert.equal(storyContextPayload([], [], { storyStructure: true }), '');
    assert.equal(decode(storyContextPayload([], ['Author instruction'], { storyStructure: true })).initiative_basis, undefined);
    assert.equal(decode(storyContextPayload([card], [], { ...options, currentPlayBasis: false })).initiative_basis, undefined);
    assert.equal(decode(storyContextPayload([card], [], { ...options, initiativeBasis: false })).initiative_basis, undefined);
});

test('old saved packets authenticate unchanged while new packets add initiative without changing the saved plan', async () => {
    const example = ensemblePressureCases[0];
    const state = emptyCampaign();
    const input = directorInput({ state, reference: { premise: example.premise }, messages: [], playerNames: example.playerNames });
    const raw = fixtureDirectorReply(example, { prefix: input.newIdPrefix });
    const result = await directorPass({ state, input,
        source: { chatId: 'initiative', referenceHash: 'premise', fingerprint: 'accepted', messageCount: 0 },
        generate: async () => ({ text: JSON.stringify(raw), finishReason: 'stop' }) });
    assert.equal(result.accepted, true, result.error);
    const saved = JSON.stringify(result.state);
    const current = campaignPayload(result.state);
    const historical = preInitiativeCampaignPayload(result.state);
    const oldData = decode(preWeightedCampaignPayload(result.state));
    delete oldData.initiative_basis;
    assert.equal(historical, `<tale-fairy-context>\n${storyContextJson(oldData)}\n</tale-fairy-context>`);
    assert.equal(decode(current).initiative_basis, ACTIVITY_INITIATIVE_BASIS);
    for (const payload of [historical, preCausalEffectPayload(result.state)]) {
        assert.equal(decode(payload).initiative_basis, undefined);
        const packet = { version: 1, selection: { preparedUsable: true }, payload,
            plannerState: { plannerContract: 15, campaignPreparation: result.state } };
        assert.equal(generationContextEntries({ entries: [packet] }).length, 1);
        assert.equal(packet.payload, payload);
        assert.equal(generationContextEntries({ entries: [{ ...packet, payload: payload + 'tampered' }] }).length, 0);
    }
    assert.equal(JSON.stringify(result.state), saved);
    assert.equal(campaignPayload(result.state, [], { horizonsOnly: true }), '');
});
