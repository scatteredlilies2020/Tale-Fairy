import test from 'node:test';
import assert from 'node:assert/strict';
import { ownedInput, ownedPass, decodeOwnedResult, OWNED_SCHEMA } from '../extension/event-planning.js';
import { emptyCampaign, mergeCampaign, validCampaignState, campaignPayload, eventPointWire, EVENT_POINTS_FORMAT } from '../extension/campaign-planner.js';

const point = { event: 'A competing musician offers a joint performance of two incompatible arrangements.', opens: 'Rehearsal could create a shared version or a public musical rivalry.' };
const item = { id: 'music', initiative: { control: 'npc', owner: 'Jo', aim: 'Develop music worth sharing.' },
    plot_points: [point], development: 'Different audiences and collaborators can change which arrangements she keeps.',
    stakes: 'Both performers value recognizable contributions.', participation: 'Neri chooses whether and how to join.' };
const raw = { campaign: 'A touring company develops its repertoire.', episode: { subject: 'An engagement', status: 'finished', boundary: 'The show ended.' }, developments: [item] };
const source = { chatId: 'story', referenceHash: 'reference', messageCount: 1, fingerprint: 'source' };
const input = { prompt: '{}', indices: [0], playerNames: ['Neri'] };
const generate = async () => ({ text: JSON.stringify(raw), finishReason: 'stop' });

test('event opportunities are preserved structurally through canonical storage and injection', async () => {
    const before = structuredClone(raw);
    let calls = 0;
    const result = await ownedPass({ state: emptyCampaign(), input, source, generate: async () => { calls++; return generate(); } });
    assert.equal(result.accepted, true); assert.equal(calls, 1);
    assert.equal(result.state.preparationFormat, EVENT_POINTS_FORMAT);
    assert.equal(validCampaignState(result.state), true);
    assert.deepEqual(eventPointWire(result.state.developments[0]), item);
    const payload = JSON.parse(campaignPayload(result.state).replace(/<\/?tale-fairy-context>/g, '').trim());
    assert.deepEqual(payload.plot_points_and_objectives[0].plot_points, [point]);
    assert.equal(payload.campaign, undefined);
    assert.equal(payload.current_episode, undefined);
    assert.equal(payload.plot_points_and_objectives[0].development, undefined);
    assert.equal(payload.plot_points_and_objectives[0].participation, undefined);
    assert.equal(result.state.developments[0].progression, item.development);
    assert.equal(result.state.developments[0].access, item.participation);
    assert.equal(payload.finished_business, 'An engagement');
    assert.match(payload.application, /within their established authority/);
    assert.match(payload.application, /without their choice/);
    assert.match(payload.application, /NPC’s own decision is not a player-agency stop/);
    assert.match(OWNED_SCHEMA.value.properties.developments.items.properties.plot_points.items.properties.event.description, /externally observable/);
    assert.deepEqual(raw, before);
});

test('typed event points reject essays, missing opportunities, oversized text and player ownership', () => {
    for (const plot_points of ['An essay', [], [{ event: 'Something' }], [{ ...point, extra: 'x' }], [{ ...point, event: 'x'.repeat(801) }],
        [point, point, point]]) {
        assert.throws(() => decodeOwnedResult({ ...raw, developments: [{ ...item, plot_points }] }));
    }
    assert.throws(() => decodeOwnedResult({ ...raw, developments: [{ ...item, initiative: { ...item.initiative, owner: 'Neri' } }] }, ['Neri']));
});

test('empty undeclared annotations carry no material; required fields and nonempty extras remain strict', () => {
    const expected = decodeOwnedResult(raw);
    for (const id_note of ['', null]) {
        const annotated = { ...raw, developments: [{ ...item, id_note }] };
        const before = structuredClone(annotated);
        assert.deepEqual(decodeOwnedResult(annotated), expected);
        assert.deepEqual(annotated, before);
    }
    for (const id_note of ['Change this objective', false, 0, [], {}]) {
        assert.throws(() => decodeOwnedResult({ ...raw, developments: [{ ...item, id_note }] }));
    }
    for (const field of ['initiative', 'plot_points', 'development', 'stakes', 'participation']) {
        const missing = { ...item }; delete missing[field];
        assert.throws(() => decodeOwnedResult({ ...raw, developments: [missing] }));
        assert.throws(() => decodeOwnedResult({ ...raw, developments: [{ ...item, [field]: null }] }));
    }
});

test('event storage matches the declared structured limits without a hidden legacy text cap', async () => {
    const points = [{ event: 'e'.repeat(800), opens: 'o'.repeat(800) }, { event: 'e'.repeat(800), opens: 'o'.repeat(800) }];
    const value = { ...raw, developments: [{ ...item, plot_points: points, initiative: { ...item.initiative, owner: 'n'.repeat(320) } }] };
    const result = await ownedPass({ state: emptyCampaign(), input, source, generate: async () => ({ text: JSON.stringify(value) }) });
    assert.equal(result.accepted, true);
    assert.equal(validCampaignState(result.state), true);
    assert.deepEqual(result.state.developments[0].premise, points);
    assert.deepEqual(eventPointWire(result.state.developments[0]).plot_points, points);
    const encoded = structuredClone(result.state); encoded.developments[0].premise = JSON.stringify(points);
    assert.equal(validCampaignState(encoded), true, 'early event-prototype encoding remains readable');
    const wrongFormat = { ...result.state, preparationFormat: 'plot-points-v1' };
    assert.equal(validCampaignState(wrongFormat), false, 'legacy storage is not silently reinterpreted');
    assert.throws(() => decodeOwnedResult({ ...value, developments: [{ ...value.developments[0], initiative: { ...item.initiative, owner: 'n'.repeat(321) } }] }));
});

test('one-time reframe supplies objectives instead of old essay templates, archives originals and requires full conversion', async () => {
    const old = { id: 'music', initiative: item.initiative, premise: 'OLD ESSAY', progression: 'OLD SETUP', outcomes: 'OLD PAYOFF', access: 'Old invitation' };
    const state = { ...mergeCampaign(emptyCampaign(), { ...raw, developments: [old] }, { basisRevision: 0, source, evidenceIndices: [0] }), preparationFormat: 'plot-points-v1' };
    const before = structuredClone(state);
    const built = ownedInput({ state, reference: { rules: 'Intact' }, messages: [], playerNames: ['Neri'] });
    const payload = JSON.parse(built.prompt);
    assert.equal(payload.previous_preparation.reframe_required, true);
    assert.deepEqual(payload.previous_preparation.developments, [{ id: 'music', previous_objective: item.initiative }]);
    assert.equal(built.prompt.includes('OLD ESSAY'), false);
    const rejected = await ownedPass({ state, input, source, generate: async () => ({ text: JSON.stringify({ ...raw, developments: [] }) }) });
    assert.equal(rejected.accepted, false); assert.deepEqual(state, before);
    const converted = await ownedPass({ state, input, source, generate });
    assert.equal(converted.accepted, true);
    assert.deepEqual(converted.state.archive.find(entry => entry.development)?.development, old);
    const nextInput = JSON.parse(ownedInput({ state: converted.state, reference: {}, messages: [] }).prompt);
    assert.equal(nextInput.previous_preparation.reframe_required, false);
    assert.deepEqual(nextInput.previous_preparation.developments[0].plot_points, [point]);
});

test('later reviews retain unplayed opportunities and failed responses never retry or mutate state', async () => {
    const { state } = await ownedPass({ state: emptyCampaign(), input, source, generate });
    const retained = await ownedPass({ state, input, source, generate: async () => ({ text: JSON.stringify({ ...raw, developments: [] }) }) });
    assert.equal(retained.accepted, true); assert.deepEqual(retained.state.developments, state.developments);
    for (const mode of ['json', 'truncation', 'transport']) {
        let calls = 0;
        const failure = await ownedPass({ state, input, source, generate: async () => {
            calls++; if (mode === 'transport') throw Error('transport');
            return { text: mode === 'json' ? '{' : JSON.stringify(raw), finishReason: 'length' };
        } });
        assert.equal(calls, 1); assert.equal(failure.accepted, false); assert.equal(failure.state, state);
    }
    const invalid = structuredClone(state); invalid.developments[0].premise = 'Not event JSON';
    assert.equal(validCampaignState(invalid), false);
});

test('review input identifies new evidence without pruning retained opportunities or older source', async () => {
    const { state } = await ownedPass({ state: emptyCampaign(), input, source, generate });
    const messages = [{ index: 0, role: 'assistant', content: 'Earlier.' }, { index: 1, role: 'user', content: 'I leave the room.' }];
    const before = structuredClone(state);
    const payload = JSON.parse(ownedInput({ state, reference: {}, messages, reviewedMessageCount: 1 }).prompt);
    assert.equal(payload.previous_preparation.review_scope.accepted_before, 1);
    assert.deepEqual(payload.previous_preparation.review_scope.newly_reviewed_indices, [1]);
    assert.equal(payload.accepted_messages.length, 2);
    assert.deepEqual(payload.previous_preparation.developments[0].plot_points, [point]);
    const reconciled = JSON.parse(ownedInput({ state, reference: {}, messages, reviewedMessageCount: 0 }).prompt);
    assert.deepEqual(reconciled.previous_preparation.review_scope.newly_reviewed_indices, [0, 1]);
    assert.deepEqual(state, before);
});
