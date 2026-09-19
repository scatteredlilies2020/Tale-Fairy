import test from 'node:test';
import assert from 'node:assert/strict';
import { OWNED_SCHEMA, OWNED_SYSTEM, ownedInput, ownedPass, decodeOwnedResult } from '../extension/owned-development.js';
import { CAMPAIGN_MARKER, CAMPAIGN_SCHEMA, PLOT_POINTS_FORMAT, campaignPass, campaignPayload, emptyCampaign, mergeCampaign, validCampaignState } from '../extension/campaign-planner.js';
import { CampaignRuntime } from '../extension/campaign-runtime.js';
import { defaultState } from '../extension/state.js';
import { generationHarness } from './helpers/generation-harness.js';

const item = id => ({ id, initiative: { control: 'npc', owner: 'Jo', aim: 'Finish and share her original work.' },
    plot_points: 'A visiting musician offers a contrasting second voice for a shared performance.', development: 'Trying the two voices together creates opportunities for collaboration and disagreement.',
    stakes: 'Each musician cares about keeping their contribution recognizable.',
    participation: 'The player chooses whether and how to take part; Jo can compose and offer her own work.' });
const raw = (developments = [item('music')]) => ({ campaign: 'A touring company changes its repertoire.',
    episode: { subject: 'The first show', status: 'finished', boundary: 'No further obligation remains.' }, developments });
const source = { chatId: 'story', referenceHash: 'reference', messageCount: 1, fingerprint: 'source' };
const input = { prompt: '{}', indices: [0], playerNames: ['Neri'] };
const reply = value => ({ text: JSON.stringify(value), finishReason: 'stop' });
const legacy = id => { const { initiative, ...rest } = decodeOwnedResult(raw([item(id)])).developments[0]; return rest; };

test('plot guidance targets substantive variety without forced novelty or immediate uptake', async () => {
    // Contract regression only: live RP checks, not phrase checks, judge quality.
    assert.match(OWNED_SYSTEM, /changing available options, relationships, resources or knowledge with practical use/);
    assert.match(OWNED_SYSTEM, /not just arrangements to reach it/);
    assert.match(OWNED_SYSTEM, /Do not connect every opportunity to one hidden cause/);
    assert.match(OWNED_SYSTEM, /substantive rewrite under its existing id/);
    assert.match(OWNED_SYSTEM, /do not churn good material merely to sound new/);
    assert.match(OWNED_SYSTEM, /Write concise planning notes, not RP prose/);
    assert.match(OWNED_SCHEMA.value.properties.developments.items.properties.plot_points.description, /prospective situations/);
    assert.equal(OWNED_SCHEMA.value.properties.developments.items.properties.plot_points.maxLength, 1600);
    const result = await ownedPass({ state: emptyCampaign(), input, source, generate: async () => reply(raw()) });
    const payload = campaignPayload(result.state);
    assert.doesNotMatch(payload, /let it produce fresh situations|linger when the player shows interest|Do not force immediate uptake/);
    assert.match(payload, /Trying the two voices together/);
});

test('owned wire requires named ownership and losslessly maps complete content to compatible storage', () => {
    assert.ok(OWNED_SYSTEM.startsWith(CAMPAIGN_MARKER));
    assert.deepEqual(OWNED_SCHEMA.value.properties.developments.items.required,
        ['id', 'initiative', 'plot_points', 'development', 'stakes', 'participation']);
    assert.deepEqual(Object.keys(OWNED_SCHEMA.value.properties.developments.items.properties),
        OWNED_SCHEMA.value.properties.developments.items.required);
    const value = raw(), before = structuredClone(value), result = decodeOwnedResult(value);
    assert.deepEqual(value, before);
    assert.deepEqual(result.developments[0], { id: 'music', initiative: item('music').initiative,
        premise: item('music').plot_points, progression: item('music').development,
        outcomes: item('music').stakes, access: item('music').participation });
});

test('invalid ownership, direct player ownership, old field names and extra fields reject', () => {
    const missing = item('music'); delete missing.initiative;
    for (const value of [raw([missing]), raw([{ ...item('music'), extra: 'no' }]),
        raw([{ ...item('music'), initiative: { control: 'player', owner: 'Neri', aim: 'Choose for the player.' } }]),
        raw([{ ...item('music'), initiative: { control: 'npc', owner: ' neri ', aim: 'Choose for the player.' } }]),
        raw([{ ...item('music'), initiative: { control: 'world', owner: 'Neri', aim: 'Change the player.' } }]),
        raw([legacy('music')]), { ...raw(), constructor: 1 }, JSON.parse('{"__proto__":1}')]) {
        assert.throws(() => decodeOwnedResult(value, ['Neri']));
    }
});

test('empty undeclared annotations are harmless, but no missing or nonempty data is repaired', () => {
    const original = raw([{ ...item('music'), old_field_removed: '' }]);
    const before = structuredClone(original);
    assert.deepEqual(decodeOwnedResult(original), decodeOwnedResult(raw()));
    assert.deepEqual(original, before);
    for (const extra of [null, false, 0, 'a required event', {}]) {
        assert.throws(() => decodeOwnedResult(raw([{ ...item('music'), extra }])));
    }
    const missing = { ...item('music'), old_field_removed: '' }; delete missing.stakes;
    assert.throws(() => decodeOwnedResult(raw([missing])));
    assert.throws(() => decodeOwnedResult(raw([{ ...item('music'), stakes: '' }])));
});

test('normal planner wire stays unchanged even though storage can hold an owned record', async () => {
    assert.equal(Object.hasOwn(CAMPAIGN_SCHEMA.value.properties.developments.items.properties, 'initiative'), false);
    const stored = decodeOwnedResult(raw());
    let calls = 0;
    const result = await campaignPass({ state: emptyCampaign(), input, source,
        generate: async () => { calls++; return reply(stored); } });
    assert.equal(calls, 1); assert.equal(result.accepted, false);
    assert.match(result.error, /unexpected initiative/);
});

test('first owned review converts all legacy subjects once and preserves their previous complete records', async () => {
    const state = mergeCampaign(emptyCampaign(), { ...raw([]), developments: [legacy('music'), legacy('craft')] },
        { basisRevision: 0, source, evidenceIndices: [0] });
    let calls = 0;
    const result = await ownedPass({ state, input, source, generate: async (_prompt, system, schema) => {
        calls++; assert.equal(system, OWNED_SYSTEM); assert.equal(schema, OWNED_SCHEMA);
        return reply(raw([item('music'), item('craft')]));
    } });
    assert.equal(calls, 1); assert.equal(result.accepted, true); assert.equal(result.state.revision, 2);
    assert.equal(validCampaignState(result.state), true);
    assert.deepEqual(result.state.archive.map(entry => entry.development), state.developments);
    assert.ok(result.state.developments.every(record => record.initiative));
    assert.match(campaignPayload(result.state), /Trying the two voices together/);
});

test('failed conversion, malformed JSON, truncation and transport failure never retry or partially change state', async () => {
    const state = mergeCampaign(emptyCampaign(), { ...raw([]), developments: [legacy('music'), legacy('craft')] },
        { basisRevision: 0, source, evidenceIndices: [0] });
    const before = structuredClone(state);
    for (const mode of ['partial', 'json', 'truncation', 'transport', 'player']) {
        let calls = 0;
        const result = await ownedPass({ state, input, source, generate: async () => {
            calls++;
            if (mode === 'transport') throw Error('failure');
            if (mode === 'json') return { text: '{', finishReason: 'stop' };
            if (mode === 'truncation') return { ...reply(raw()), finishReason: 'max_tokens' };
            if (mode === 'player') return reply(raw([{ ...item('music'), initiative: { control: 'npc', owner: 'Neri', aim: 'A player choice.' } }]));
            return reply(raw());
        } });
        assert.equal(calls, 1); assert.equal(result.accepted, false); assert.equal(result.state, state);
        assert.deepEqual(state, before);
    }
});

test('omitted owned subjects remain intact and ungrounded retirement is rejected', async () => {
    const state = mergeCampaign(emptyCampaign(), decodeOwnedResult(raw()), { basisRevision: 0, source, evidenceIndices: [0] });
    state.preparationFormat = PLOT_POINTS_FORMAT;
    const unchanged = await ownedPass({ state, input, source, generate: async () => reply(raw([])) });
    assert.equal(unchanged.accepted, true); assert.deepEqual(unchanged.state.developments, state.developments);
    const rejected = await ownedPass({ state, input, source, generate: async () => reply({ ...raw([]), retire: [{ id: 'music', reason: 'Done', evidence: [3] }] }) });
    assert.equal(rejected.accepted, false); assert.equal(rejected.state, state);
});

test('owned input preserves complete source, legacy content and player labels or fails its budget', () => {
    const state = { ...emptyCampaign(), developments: [legacy('music')] }, reference = { persona: 'Full source '.repeat(300) + 'FINAL RULE' };
    const options = { state, reference, messages: [{ index: 2, role: 'user', content: 'I listen.' }], playerNames: ['Neri'] };
    const built = ownedInput(options), payload = JSON.parse(built.prompt);
    assert.deepEqual(payload.source_reference, reference);
    assert.deepEqual(payload.previous_preparation.retained_subject_ids, ['music']);
    assert.equal(payload.previous_preparation.available_new_subject_slots, 3);
    assert.equal(payload.previous_preparation.developments[0].premise, state.developments[0].premise);
    assert.equal(payload.previous_preparation.developments[0].initiative, undefined, 'do not invent ownership for a legacy record');
    assert.deepEqual(payload.player_control.names, ['Neri']); assert.deepEqual(built.indices, [2]);
    assert.deepEqual(Object.keys(payload.previous_preparation.developments[0]),
        ['id', 'premise', 'progression', 'outcomes', 'access']);
    assert.throws(() => ownedInput(options, 100), /exceeds/);
});

test('plot format keeps stakes separate from mandated outcomes through storage and writer injection', async () => {
    const result = await ownedPass({ state: emptyCampaign(), input, source, generate: async () => reply(raw()) });
    assert.equal(result.accepted, true);
    assert.equal(result.state.preparationFormat, PLOT_POINTS_FORMAT);
    const prompt = JSON.parse(ownedInput({ state: result.state, reference: {}, messages: [], playerNames: ['Neri'] }).prompt);
    assert.equal(prompt.previous_preparation.format, PLOT_POINTS_FORMAT);
    assert.equal(prompt.previous_preparation.developments[0].stakes, item('music').stakes);
    const payload = JSON.parse(campaignPayload(result.state).replace(/<\/?tale-fairy-context>/g, '').trim());
    assert.equal(payload.possible_developments[0].possible_consequences, item('music').stakes);
    assert.equal(payload.possible_developments[0].resolution, undefined);
    assert.equal(payload.possible_developments[0].outcomes, undefined);
    assert.equal(payload.application, undefined);
    const legacyOwned = { ...result.state }; delete legacyOwned.preparationFormat;
    const unchangedLegacy = await ownedPass({ state: legacyOwned, input, source, generate: async () => reply(raw([])) });
    assert.equal(unchangedLegacy.accepted, false, 'old owned records must also be reframed, not relabeled');
    assert.equal(unchangedLegacy.state, legacyOwned);
});

test('owned pass uses existing runtime guards and retains validity across accepted appends', async () => {
    let release, calls = 0;
    const current = { chatId: 'story', referenceHash: 'reference', messages: [{ mes: 'Source' }], state: emptyCampaign() };
    const runtime = new CampaignRuntime({ read: () => current, prepare: () => input, fingerprint: JSON.stringify,
        runPass: ownedPass, generate: () => { calls++; return new Promise(resolve => { release = resolve; }); },
        commit: state => { current.state = state; return true; } });
    const pending = runtime.request();
    await new Promise(resolve => setImmediate(resolve));
    current.messages.push({ mes: 'Later accepted play.' }); release(reply(raw()));
    assert.equal((await pending).accepted, true); assert.equal(calls, 1);
    assert.equal(current.state.source.messageCount, 1); assert.match(runtime.payload(), /Trying the two voices together/);
});

test('owned records round-trip through actual host metadata and complete outgoing payload', () => {
    const h = generationHarness([{ is_user: false, mes: 'A show ended.' }, { is_user: true, name: 'Neri', mes: 'I listen.' }],
        { ...defaultState(), plannerContract: 15 });
    // The general harness exposes host fingerprinting/reference construction,
    // but not the optional owned planning entry; install source-compatible data.
    const context = h.context;
    const messages = h.scope.messagesFromChat(context.chat);
    const proof = { chatId: String(context.getCurrentChatId()), messageCount: messages.length,
        fingerprint: h.scope.campaignFingerprint(messages),
        referenceHash: h.scope.plotInputKey(String(context.getCurrentChatId()), [], h.scope.generationInputs(context, h.state())) };
    const state = mergeCampaign(emptyCampaign(), decodeOwnedResult(raw()), { basisRevision: 0, source: proof, evidenceIndices: [0] });
    assert.equal(h.scope.commitCampaignPreparation(state, { stateFingerprint: h.scope.campaignFingerprint(emptyCampaign()) }), true);
    assert.deepEqual(h.state().campaignPreparation.developments[0].initiative, item('music').initiative);
    assert.match(h.prepare().payload, /Trying the two voices together/);
});
