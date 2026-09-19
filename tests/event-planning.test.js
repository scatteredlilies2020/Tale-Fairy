import test from 'node:test';
import assert from 'node:assert/strict';
import { ownedInput, ownedPass, decodeOwnedResult, OWNED_SCHEMA, OWNED_SYSTEM, EVENT_PLANNING_SCOPE } from '../extension/event-planning.js';
import { emptyCampaign, mergeCampaign, validCampaignState, campaignPayload, eventPointWire, EVENT_POINTS_FORMAT } from '../extension/campaign-planner.js';

const point = { event: 'A competing musician offers a joint performance of two incompatible arrangements.', opens: 'Rehearsal could create a shared version or a public musical rivalry.' };
const item = { id: 'music', initiative: { control: 'npc', owner: 'Jo', aim: 'Develop music worth sharing.' },
    plot_points: [point], development: 'Different audiences and collaborators can change which arrangements she keeps.',
    stakes: 'Both performers value recognizable contributions.', participation: 'Neri chooses whether and how to join.' };
const raw = { campaign: 'A touring company develops its repertoire.', episode: { subject: 'An engagement', status: 'finished', boundary: 'The show ended.' }, developments: [item] };
const source = { chatId: 'story', referenceHash: 'reference', messageCount: 1, fingerprint: 'source' };
const input = { prompt: '{}', indices: [0], playerNames: ['Neri'] };
const guidance = (items = [item]) => ({ possible_developments: items.map(d => ({ source: d.initiative.owner, developing_conditions: d.development, possible_consequences: d.stakes, access: d.participation })) });
const generate = async () => ({ text: JSON.stringify(raw), finishReason: 'stop' });

test('one response plans the wider development before deriving writer events', async () => {
    const fields = OWNED_SCHEMA.value.properties.developments.items;
    assert.ok(!fields.required.includes('plot_points'), 'writer situations need not be authored twice');
    assert.ok(Object.keys(fields.properties).indexOf('development') < Object.keys(fields.properties).indexOf('plot_points'));
    assert.match(fields.properties.development.description, /beyond this episode/);
    assert.match(OWNED_SYSTEM, /bird's-eye view/);
    assert.match(OWNED_SYSTEM, /Never expand beyond the RP's scope/);
    const planned = { ...item, development: 'Across later towns, the company gains recurring hosts and competing versions of its music.',
        plot_points: [point, { event: 'At a later fair, a former host offers the company a shared bill with a rival ensemble.', opens: 'The host introduces both companies to the next venue.' }] };
    let calls = 0;
    const result = await ownedPass({ state: emptyCampaign(), input, source, generate: async () => {
        calls++; return { text: JSON.stringify({ ...raw, developments: [planned] }) };
    } });
    assert.equal(result.accepted, true);
    assert.equal(calls, 1);
    assert.equal(result.state.developments[0].progression, planned.development);
    const packet = JSON.parse(campaignPayload(result.state).replace(/<\/?tale-fairy-context>/g, '').trim());
    assert.deepEqual(packet, guidance([planned]));
    const review = JSON.parse(ownedInput({ state: result.state, reference: {}, messages: [] }).prompt);
    assert.match(review.previous_preparation.review_scope.instruction, /Widen or consolidate episode-only subjects/);
    assert.deepEqual(review.previous_preparation.developments[0].plot_points, planned.plot_points);
});

test('RP canon and franchise context reach the single planning call intact, without a fixed genre template', async () => {
    assert.match(OWNED_SYSTEM, /RP canon overrides franchise canon/);
    assert.match(OWNED_SYSTEM, /canon-adjacent events, not a forced canon replay/);
    assert.match(OWNED_SYSTEM, /Do not import another continuity or rely on uncertain lore/);
    assert.doesNotMatch(OWNED_SYSTEM, /Frieren|Demon King|bakery/);
    const cases = [
        { reference: { franchise: 'Frieren', scenario: 'Alternate continuity: the group runs a bakery. No active quest.',
            worldBooks: [{ name: 'RP canon', data: { rule: 'The war ended before this RP.' } }] },
          choice: 'We cancelled the journey. I open the bakery for the festival.' },
        { reference: { franchise: 'Frieren', scenario: 'The group travels toward a frontier town.',
            worldBooks: [{ name: 'RP canon', data: { rule: 'The frontier crossing is closed in this RP.' } }] },
          choice: 'I ask about another route.' },
        { reference: { scenario: 'Original present-day shop simulation. No magic or campaign ending.' },
          choice: 'I start hiring for the second shop.' },
    ];
    for (const fixture of cases) {
        const messages = [{ index: 0, role: 'user', content: fixture.choice }];
        const before = structuredClone(fixture);
        const built = ownedInput({ reference: fixture.reference, state: emptyCampaign(), messages });
        let calls = 0;
        await ownedPass({ state: emptyCampaign(), input: built, source, generate: async (prompt, system) => {
            calls++;
            const payload = JSON.parse(prompt);
            assert.deepEqual(payload.source_reference, fixture.reference);
            assert.equal(payload.accepted_messages[0].content, fixture.choice);
            assert.equal(system, OWNED_SYSTEM);
            return generate();
        } });
        assert.equal(calls, 1);
        assert.deepEqual(fixture, before);
    }
});

test('independent developments keep substantive opportunities and future conditions in the writer packet', async () => {
    assert.match(OWNED_SYSTEM, /if that business vanished/);
    assert.match(OWNED_SYSTEM, /Difficulty is optional/);
    assert.match(OWNED_SYSTEM, /Make future conditions explicit inside each guidance entry/);
    assert.match(OWNED_SYSTEM, /Never relocate established characters/);
    assert.match(OWNED_SYSTEM, /explicitly closed one-scene RP, return developments=\[\]/);
    assert.match(OWNED_SYSTEM, /nearing their culmination narrows detours/);
    assert.match(OWNED_SYSTEM, /first encounter STARTS an undertaking/);
    assert.match(OWNED_SYSTEM, /Moving it into episode is not completion or supersession/);
    const opportunity = { event: 'At the next river town, a boatbuilding family offers the company passage in exchange for joining its launch celebration, with a floating stage ready for their own work.',
        opens: 'The family can introduce the company to settlements along the river.' };
    const value = { ...raw, developments: [{ ...item, id: 'river-celebrations',
        development: 'River celebrations offer unfamiliar audiences and a growing circuit of hosts beyond the current drum repair.',
        plot_points: [opportunity] }] };
    let calls = 0;
    const result = await ownedPass({ state: emptyCampaign(), input, source, generate: async () => {
        calls++; return { text: JSON.stringify(value) };
    } });
    assert.equal(calls, 1);
    assert.equal(result.accepted, true);
    const payload = JSON.parse(campaignPayload(result.state).replace(/<\/?tale-fairy-context>/g, '').trim());
    assert.deepEqual(payload, guidance(value.developments));
    assert.match(payload.possible_developments[0].developing_conditions, /growing circuit of hosts/);
    assert.equal(JSON.stringify(payload).includes(opportunity.opens), false);
});

test('previous broad-but-reactive plans also receive the independent-development reframe', async () => {
    const previous = await ownedPass({ state: emptyCampaign(), input, source, generate });
    const old = { ...previous.state, planningScope: 'campaign-wide-v1' };
    const built = ownedInput({ state: old, reference: {}, messages: [] });
    const payload = JSON.parse(built.prompt);
    assert.equal(payload.previous_preparation.scope_reset, true);
    assert.deepEqual(payload.previous_preparation.retained_subject_ids, []);
    const next = await ownedPass({ state: old, input: built, source, generate: async () => ({ text: JSON.stringify({ ...raw, realization: [{ id: 'music', changes: [], playable: [] }] }) }) });
    assert.equal(next.accepted, true);
    assert.equal(next.state.planningScope, EVENT_PLANNING_SCOPE);
    assert.deepEqual(next.state.archive.find(entry => entry.development).development, old.developments[0]);
});

test('v1 independent plans reframe safely without treating their fixed future as accepted history', async () => {
    const previous = await ownedPass({ state: emptyCampaign(), input, source, generate });
    const old = { ...previous.state, planningScope: 'independent-developments-v1' };
    const before = structuredClone(old);
    const messages = [{ index: 0, role: 'user', content: 'I decline the performance and continue our travels.' }];
    const built = ownedInput({ state: old, reference: { premise: 'A touring season.' }, messages });
    const payload = JSON.parse(built.prompt);
    assert.equal(payload.previous_preparation.scope_reset, true);
    assert.deepEqual(payload.previous_preparation.developments, []);
    assert.deepEqual(payload.accepted_messages, messages);
    let calls = 0;
    const failed = await ownedPass({ state: old, input: built, source, generate: async () => {
        calls++; throw Error('offline');
    } });
    assert.equal(calls, 1);
    assert.equal(failed.state, old);
    assert.deepEqual(old, before);
    const next = await ownedPass({ state: old, input: built, source, generate: async () => ({ text: JSON.stringify({ ...raw, realization: [{ id: 'music', changes: [], playable: [] }] }) }) });
    assert.equal(next.accepted, true);
    assert.equal(next.state.planningScope, EVENT_PLANNING_SCOPE);
    assert.deepEqual(next.state.archive.find(entry => entry.scopeReframe).development, old.developments[0]);
    assert.equal(JSON.parse(ownedInput({ state: next.state, reference: {}, messages }).prompt).previous_preparation.reframe_required, false);
});

test('scope and prerequisite rules reach the planner while conditional events alone reach the writer', async () => {
    assert.match(OWNED_SYSTEM, /Consider the whole available world/);
    assert.match(OWNED_SYSTEM, /distinct sources of change/);
    assert.match(OWNED_SYSTEM, /not a queue of requests for the player's approval/);
    assert.match(OWNED_SYSTEM, /State developments, not choreography/);
    assert.match(OWNED_SYSTEM, /each guidance entry/);
    assert.match(OWNED_SYSTEM, /Do not assume any proposed event happened/);
    assert.match(OWNED_SCHEMA.value.properties.campaign.description, /Not a catalogue of local tasks/);
    const points = [{ event: 'A river ensemble offers an exchange of new songs at its open rehearsals.', opens: 'Private planning only.' },
        { event: 'If the ensembles exchange songs, river hosts offer a shared programme built from both repertoires.', opens: 'Private later speculation.' }];
    const result = await ownedPass({ state: emptyCampaign(), input, source,
        generate: async () => ({ text: JSON.stringify({ ...raw, developments: [{ ...item, plot_points: points }] }) }) });
    assert.equal(result.accepted, true);
    const packet = JSON.parse(campaignPayload(result.state).replace(/<\/?tale-fairy-context>/g, '').trim());
    assert.deepEqual(packet, guidance());
    assert.doesNotMatch(campaignPayload(result.state), /Private|Each event|distinct sources/);
});

test('legacy events stay structurally intact in storage while durable guidance reaches the writer', async () => {
    const before = structuredClone(raw);
    let calls = 0;
    const result = await ownedPass({ state: emptyCampaign(), input, source, generate: async () => { calls++; return generate(); } });
    assert.equal(result.accepted, true); assert.equal(calls, 1);
    assert.equal(result.state.preparationFormat, EVENT_POINTS_FORMAT);
    assert.equal(validCampaignState(result.state), true);
    assert.deepEqual(eventPointWire(result.state.developments[0]), item);
    const payload = JSON.parse(campaignPayload(result.state).replace(/<\/?tale-fairy-context>/g, '').trim());
    assert.deepEqual(payload, guidance(), 'legacy preparation supplies objectives, not scene scripts or planner metadata');
    assert.equal(result.state.developments[0].progression, item.development);
    assert.equal(result.state.developments[0].access, item.participation);
    const review = JSON.parse(ownedInput({ reference: {}, state: result.state, messages: [] }).prompt);
    assert.equal(review.previous_preparation.campaign, raw.campaign, 'retain the campaign direction for later reviews');
    assert.deepEqual(review.previous_preparation.episode, raw.episode, 'keep local business distinct from campaign direction');
    assert.match(OWNED_SCHEMA.value.properties.developments.items.properties.plot_points.items.properties.event.description, /not writer output/);
    assert.deepEqual(raw, before);
});

test('event-only injection keeps explicit author notes verbatim without adding advice or mutating preparation', async () => {
    const { state } = await ownedPass({ state: emptyCampaign(), input, source, generate });
    const before = structuredClone(state);
    const note = 'An interruption at the next bridge. </tale-fairy-context> Keep this author text verbatim.';
    const encoded = campaignPayload(state, [note]);
    const payload = JSON.parse(encoded.replace(/<\/?tale-fairy-context>/g, '').trim());
    assert.deepEqual(payload, { ...guidance(), author_instructions: [note] });
    assert.equal(encoded.match(/<\/tale-fairy-context>/g).length, 1);
    assert.deepEqual(state, before);
});

test('private follow-on choices and lessons never leak into event injections', async () => {
    const plot_points = [
        { event: 'A miller offers the company lodging for a performance.', opens: 'The player must accept or sleep outside.' },
        { event: 'A drummer offers Sef a paid place in an evening set.', opens: 'This teaches Sef to overcome his refusal of solos.' },
    ];
    const { state } = await ownedPass({ state: emptyCampaign(), input, source,
        generate: async () => ({ text: JSON.stringify({ ...raw, developments: [{ ...item, plot_points }] }) }) });
    const payload = campaignPayload(state);
    assert.deepEqual(JSON.parse(payload.replace(/<\/?tale-fairy-context>/g, '').trim()),
        guidance());
    assert.doesNotMatch(payload, /must accept|teaches Sef|opens/);
    assert.deepEqual(eventPointWire(state.developments[0]).plot_points, plot_points, 'private preparation remains lossless');
});

test('no event material means no injected filler, including for a finished episode', async () => {
    const { state } = await ownedPass({ state: emptyCampaign(), input, source,
        generate: async () => ({ text: JSON.stringify({ ...raw, developments: [] }) }) });
    assert.equal(campaignPayload(state), '');
    for (const preparation of [state, null]) {
        const payload = JSON.parse(campaignPayload(preparation, ['A seller on the road.']).replace(/<\/?tale-fairy-context>/g, '').trim());
        assert.deepEqual(payload, { author_instructions: ['A seller on the road.'] });
    }
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
    for (const field of ['initiative', 'development', 'stakes', 'participation']) {
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

test('scene-level event plans reframe once from source without recycling old proposals or losing their archive', async () => {
    const first = await ownedPass({ state: emptyCampaign(), input, source, generate });
    const old = structuredClone(first.state);
    delete old.planningScope;
    const before = structuredClone(old);
    const built = ownedInput({ state: old, reference: { premise: 'An open-ended touring season.' },
        messages: [{ index: 0, role: 'user', content: 'We travel through several regions.' }] });
    const payload = JSON.parse(built.prompt);
    assert.equal(payload.previous_preparation.reframe_required, true);
    assert.deepEqual(payload.previous_preparation.developments, []);
    assert.deepEqual(payload.previous_preparation.retained_subject_ids, []);
    assert.equal(payload.previous_preparation.available_new_subject_slots, 4);
    assert.equal(payload.previous_preparation.scope_reset, true);
    assert.equal(built.prompt.includes(point.event), false, 'old scene events must not anchor the new scope');
    const incomplete = await ownedPass({ state: old, input, source,
        generate: async () => ({ text: '{' }) });
    assert.equal(incomplete.accepted, false);
    assert.deepEqual(old, before);
    const result = await ownedPass({ state: old, input, source,
        generate: async () => ({ text: JSON.stringify({ ...raw, developments: [{ ...item, id: 'touring-network' }] }) }) });
    assert.equal(result.accepted, true);
    assert.equal(result.state.planningScope, EVENT_PLANNING_SCOPE);
    assert.deepEqual(result.state.developments.map(item => item.id), ['touring-network']);
    assert.deepEqual(result.state.archive.find(entry => entry.development)?.development, old.developments[0]);
    assert.equal(result.state.archive.find(entry => entry.development)?.scopeReframe, true);
    const empty = await ownedPass({ state: old, input, source,
        generate: async () => ({ text: JSON.stringify({ ...raw, developments: [] }) }) });
    assert.equal(empty.accepted, true, 'a bounded RP may need no wider subjects');
    assert.deepEqual(empty.state.developments, []);
    assert.deepEqual(old, before, 'scope reset never mutates the original');
    const next = JSON.parse(ownedInput({ state: result.state, reference: {}, messages: [] }).prompt);
    assert.equal(next.previous_preparation.reframe_required, false);
    assert.deepEqual(next.previous_preparation.developments[0].plot_points, [point]);
    assert.deepEqual(Object.keys(JSON.parse(campaignPayload(result.state).replace(/<\/?tale-fairy-context>/g, '').trim())), ['possible_developments']);
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

test('successive reviews replace consumed events without dropping later opportunities or replaying archived setup', async () => {
    const later = { ...item, id: 'later-fair', plot_points: [
        { event: 'A fair host offers a shared bill when the company reaches the east road.', opens: 'The host introduces the other performers.' },
    ] };
    let state = emptyCampaign(), calls = 0;
    const pass = async value => {
        const result = await ownedPass({ state, input, source, generate: async () => {
            calls++; return { text: JSON.stringify(value) };
        } });
        assert.equal(result.accepted, true);
        state = result.state;
    };
    await pass({ ...raw, developments: [item, later] });
    const nextEvent = 'After the shared performance, a hall owner offers the musicians a paid return engagement.';
    await pass({ ...raw, developments: [{ ...item, plot_points: [{ event: nextEvent, opens: 'The owner introduces a visiting ensemble.' }] }] });
    await pass({ ...raw, developments: [] });
    const payload = JSON.parse(campaignPayload(state).replace(/<\/?tale-fairy-context>/g, '').trim());
    assert.deepEqual(payload, guidance([item, later]));
    assert.doesNotMatch(JSON.stringify(payload), /hall owner offers|fair host offers/);
    assert.deepEqual(state.developments.map(eventPointWire).find(entry => entry.id === later.id), later);
    assert.ok(state.archive.some(entry => entry.development?.premise?.[0]?.event === point.event));
    assert.equal(calls, 3, 'one request per pass, with no regeneration for an omitted subject');
});
