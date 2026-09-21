import test from 'node:test';
import assert from 'node:assert/strict';
import { storyInput, storyPass, STORY_SCHEMA, STORY_SYSTEM } from '../extension/story-selection.js';
import { ownedInput, ownedPass } from '../extension/event-planning.js';
import { emptyCampaign, campaignPayload, validCampaignState } from '../extension/campaign-planner.js';
import { storyInputTokens } from '../extension/story-budget.js';

const messages = [{ index: 0, role: 'user', content: 'We arrived in Mere. The performance is finished.' }];
const source = { chatId: 'story', referenceHash: 'premise', messageCount: 1, fingerprint: 'accepted' };
const subject = (id, owner = 'The ensemble') => ({ id,
    initiative: { owner, control: 'npc', aim: 'PRIVATE enduring musical exchange.' },
    development: 'PRIVATE shared practice can grow into an exchange between communities.',
    stakes: 'PRIVATE lasting relationships and new creative possibilities.', participation: 'Participation remains optional.' });
const selected = (subjectIds = ['music', 'travel']) => ({ subjectIds,
    available: 'The ensemble is in Mere, with complementary repertoires available for shared practice.',
    developing: 'Different musical traditions offer contrasting ways to arrange familiar pieces. Independent encounters along the route can broaden the ensemble\'s life.',
    lasting: 'Shared work could support exchange with other communities, while revisited places can become familiar homes.' });
const background = (subjectId, route = 'direct') => ({ subjectId,
    unfolding: 'PRIVATE preparation for musical exchange continues within the ensemble.',
    basis: 'PRIVATE established shared interests; no further time has passed.',
    access: { route, basis: route === 'none' ? 'PRIVATE currently beyond contact.' : 'PRIVATE the ensemble is present in Mere.' } });
const body = (developments = [], selected_material = [], realization = [], backgrounds = ['music', 'travel'].map(id => background(id))) => ({
    rp_brief: 'PRIVATE an ensemble explores music and life between engagements. No established franchise.',
    campaign: 'PRIVATE a season of creative exchange.',
    episode: { subject: 'Performance', status: 'finished', boundary: 'The performance is finished.' },
    selected_material, developments: backgrounds.map(({ subjectId, ...record }) => ({
        ...(developments.find(item => item.id === subjectId) || subject(subjectId)), background: record,
    })), realization,
});
const packet = state => JSON.parse(campaignPayload(state).replace(/<\/?tale-fairy-context>/g, '').trim());
async function plan(state, value, evidence = messages, options = {}) {
    const before = structuredClone(state);
    let calls = 0;
    const result = await storyPass({ state, source: { ...source, messageCount: evidence.length },
        input: storyInput({ state, reference: {}, messages: evidence }),
        generate: async (prompt, system, schema) => {
            calls++;
            assert.equal(system, STORY_SYSTEM);
            assert.equal(schema, STORY_SCHEMA);
            assert.ok(JSON.parse(prompt).accepted_messages);
            return { text: JSON.stringify(value), finishReason: 'stop', ...options };
        } });
    assert.equal(calls, 1, 'one actual provider request, no critic or model repair');
    assert.deepEqual(state, before, 'success and failure both leave the source snapshot untouched');
    return result;
}
async function initial() {
    const result = await plan(emptyCampaign(), body([subject('music'), subject('travel')], [selected()]));
    assert.equal(result.accepted, true, result.error);
    return result.state;
}

test('extra episode metadata does not discard a valid single-call plan or enter stored context', async () => {
    for (const state of [emptyCampaign(), await initial()]) {
        const value = body([], [selected()]);
        const canonicalEpisode = structuredClone(value.episode);
        value.episode.boundary_extra = 'EXTRA COMMENTARY must not become plot material.';
        value.episode.extra_notes = { status: 'invented', retire: ['music'] };
        const result = await plan(state, value);
        assert.equal(result.accepted, true, result.error);
        assert.deepEqual(result.state.episode, canonicalEpisode);
        assert.deepEqual(result.ignoredEpisodeFields, ['boundary_extra', 'extra_notes']);
        assert.equal(result.state.developments.length, 2);
        assert.ok(validCampaignState(result.state));
        assert.doesNotMatch(JSON.stringify(result.state), /boundary_extra|EXTRA COMMENTARY|extra_notes/);
        assert.equal(result.result.text, JSON.stringify(value), 'raw response remains available for diagnostics');
    }
});

test('extra episode fields cannot replace missing or invalid required values', async () => {
    const state = await initial();
    for (const episode of [
        { subject: 'Show', status: 'finished', boundary_extra: 'Not a substitute for boundary.' },
        { subject: 'Show', status: 'finished', boundary: '', boundary_extra: 'Nonblank extra.' },
        { subject: 'Show', status: 'invalid', boundary: 'Finished.', boundary_extra: 'Extra.' },
        { subject: 'Show', status: 'finished', boundary: { text: 'Wrong type' }, boundary_extra: 'Extra.' },
        null, [], 'Finished',
    ]) {
        const result = await plan(state, { ...body(), episode });
        assert.equal(result.accepted, false);
        assert.equal(result.state, state);
        assert.match(result.error, /\$\.episode/);
    }
});

test('response tolerance preserves player-control validation', async () => {
    const state = await initial();
    for (const mutate of [
        value => { value.developments[0].initiative.control = 'player'; },
    ]) {
        const value = body([], [selected()]);
        value.episode.boundary_extra = 'Discardable commentary.';
        mutate(value);
        const result = await plan(state, value);
        assert.equal(result.accepted, false);
        assert.equal(result.state, state);
    }
});

test('whole-story selection groups independent private aims into one writer circumstance', async () => {
    const state = await initial();
    assert.equal(validCampaignState(state), true);
    assert.equal(state.developments.length, 2);
    assert.equal(packet(state).possible_developments.length, 1);
    assert.equal(packet(state).possible_developments[0].source, undefined, 'private ownership must not leak');
    assert.deepEqual(Object.keys(packet(state).possible_developments[0]), ['available_circumstances', 'mid_term_possibilities', 'long_term_possibilities']);
    assert.doesNotMatch(campaignPayload(state), /PRIVATE|subjectIds|shared-practice|episodeId|evidence/);
    assert.deepEqual(state.realization.music, { episodes: {}, playable: [] });
    assert.deepEqual(state.realization.travel, { episodes: {}, playable: [] });
    const instructions = 'Keep <author-text> exactly as supplied.';
    const withInstructions = JSON.parse(campaignPayload(state, [instructions]).replace(/<\/?tale-fairy-context>/g, '').trim());
    assert.deepEqual(withInstructions.author_instructions, [instructions]);
    assert.doesNotMatch(campaignPayload(state, [instructions]), /<author-text>/);
});

test('a missing initiative in the second update retains its saved owner and saves fresh writer material', async () => {
    const state = await initial();
    const value = body([], [{ ...selected(), available: 'A new arrangement is available to try.' }]);
    delete value.developments[1].initiative;
    const result = await plan(state, value);
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(result.state.developments[1].initiative, state.developments[1].initiative);
    assert.match(campaignPayload(result.state), /new arrangement/);
    assert.ok(result.responseAdjustments.includes('$.developments[1].initiative'));
    assert.equal(result.state.revision, state.revision + 1);
    assert.ok(validCampaignState(result.state));
    assert.equal(result.result.text, JSON.stringify(value), 'raw provider output stays intact');
});

test('background-only updates and partial initiatives retain durable fields without inventing content', async () => {
    const state = await initial();
    for (const initiative of [undefined, { aim: 'An explicitly revised musical aim.' }, { owner: subject('music').initiative.owner }]) {
        const value = body([], [selected()]);
        value.developments = value.developments.map(({ id, background }) => ({ id, background,
            ...(initiative ? { initiative: structuredClone(initiative) } : {}) }));
        const result = await plan(state, value);
        assert.equal(result.accepted, true, result.error);
        assert.ok(validCampaignState(result.state));
        for (const item of result.state.developments) {
            const prior = state.developments.find(old => old.id === item.id);
            assert.deepEqual(item.initiative, { ...prior.initiative, ...initiative });
            assert.equal(item.progression, prior.progression);
            assert.equal(item.outcomes, prior.outcomes);
            assert.equal(item.access, prior.access);
        }
        assert.match(campaignPayload(result.state), /complementary repertoires/);
    }
});

test('an incomplete new subject does not discard an unrelated valid selection', async () => {
    const value = body([], [selected(['music'])]);
    delete value.developments[1].initiative;
    value.realization = [{ id: 'travel', changes: [] }];
    const result = await plan(emptyCampaign(), value);
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(result.state.developments.map(item => item.id), ['music']);
    assert.deepEqual(result.deferredDevelopments, [{ id: 'travel', missingFields: ['initiative'] }]);
    assert.equal(result.withheldMaterial, 0);
    assert.equal(result.state.realization.travel, undefined);
    assert.match(campaignPayload(result.state), /complementary repertoires/);
    assert.ok(validCampaignState(result.state));
});

test('shared prose depending on an incomplete subject is withheld whole while valid preparation saves', async () => {
    const value = body([], [selected()]);
    delete value.developments[1].initiative;
    const result = await plan(emptyCampaign(), value);
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(result.state.developments.map(item => item.id), ['music']);
    assert.equal(result.withheldMaterial, 1);
    assert.deepEqual(result.state.selectedMaterial, []);
    assert.equal(campaignPayload(result.state), '');
    assert.ok(validCampaignState(result.state));
});

test('new owners and missing fresh access defer a draft while retaining the existing subject and witnessed progress', async () => {
    const state = await initial();
    for (const mutate of [
        item => { item.initiative = { owner: 'A different ensemble' }; },
        item => { item.initiative = { control: 'world' }; },
        item => { delete item.background.access; },
        item => { delete item.background; },
    ]) {
        const value = body([], [selected(['music'])], [{ id: 'travel', changes: [{ episodeId: 'show', status: 'completed',
            evidence: [{ index: 0, span: 0 }] }] }]);
        mutate(value.developments[1]);
        const result = await plan(state, value);
        assert.equal(result.accepted, true, result.error);
        assert.deepEqual(result.state.developments[1], state.developments[1]);
        assert.equal(result.deferredDevelopments[0].id, 'travel');
        assert.equal(result.state.realization.travel.episodes.show.status, 'completed');
        assert.ok(validCampaignState(result.state));
        assert.match(campaignPayload(result.state), /complementary repertoires/);
    }
});

test('partial updates do not conceal invalid ownership, values or conflicting ids', async () => {
    const state = await initial();
    for (const mutate of [
        value => { value.developments[1].initiative = { control: 'player' }; },
        value => { value.developments[1].initiative = null; },
        value => { value.developments[1].stakes = 4; },
        value => { value.developments[1].initiative = {}; value.developments[1].background.access.route = 'telepathy'; },
        value => { value.developments.push({ id: 'music' }); },
    ]) {
        const value = body([], [selected(['music'])]);
        delete value.developments[1].development;
        mutate(value);
        const result = await plan(state, value);
        assert.equal(result.accepted, false);
        assert.equal(result.state, state);
    }
});

test('scope resets do not restore omitted fields from archived proposals', async () => {
    const state = await initial();
    state.planningScope = 'obsolete-scope';
    const value = body([], [selected(['music'])]);
    delete value.developments[1].initiative;
    const result = await plan(state, value);
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(result.state.developments.map(item => item.id), ['music']);
    assert.equal(result.deferredDevelopments[0].id, 'travel');
    assert.ok(result.state.archive.some(entry => entry.scopeReframe && entry.development.id === 'travel'));
    assert.ok(validCampaignState(result.state));
});

test('an explicit quiet snapshot withdraws material without erasing durable aims or inventing progress', async () => {
    const state = await initial();
    const next = await plan(state, body());
    assert.equal(next.accepted, true, next.error);
    assert.equal(campaignPayload(next.state), '');
    assert.deepEqual(next.state.developments, state.developments);
    assert.deepEqual(next.state.realization, state.realization);
    assert.deepEqual(next.state.archive.findLast(a => a.selectedMaterial).selectedMaterial, state.selectedMaterial);
    const quiet = await plan(next.state, body());
    assert.equal(quiet.accepted, true, quiet.error);
    assert.equal(quiet.state.archive.length, next.state.archive.length, 'unchanged snapshot does not grow the archive');
});

test('missing, conflicting or malformed selection and unknown references fail atomically', async () => {
    const state = await initial();
    const omitted = body(); delete omitted.selected_material;
    const cases = [omitted, { ...body(), selected_material: null },
        body([], [selected(), { ...selected(), available: 'A different competing packet.' }]), body([], [selected(['unknown'])]),
        body([], [], [{ id: 'unknown' }]),
    ];
    for (const value of cases) {
        const rejected = await plan(state, value);
        assert.equal(rejected.accepted, false, JSON.stringify(value));
        assert.equal(rejected.state, state);
    }
    const truncated = await plan(state, body(), messages, { finishReason: 'length' });
    assert.equal(truncated.accepted, false);
    assert.equal(truncated.state, state);
});

test('harmless response variations and obsolete metadata preserve usable planning without entering saved state', async () => {
    const value = body([], [selected(['music', 'music', 'travel']), selected(['music', 'travel'])]);
    value.episode.status = ' Finished ';
    value.unknown_operation = 'retire';
    value.developments[0].unknown_operation = 'retire';
    value.developments[0].initiative.control = ' NPC ';
    value.developments.push(structuredClone(value.developments[0]));
    value.retire = null;
    value.realization = [{ id: 'music', selection: 'keep' }, { id: 'music', playable: [] }];
    const result = await plan(emptyCampaign(), value);
    assert.equal(result.accepted, true, result.error);
    assert.ok(result.responseAdjustments.length);
    assert.equal(result.state.developments.length, 2);
    assert.equal(result.state.selectedMaterial.length, 1);
    assert.deepEqual(result.state.selectedMaterial[0].subjectIds, ['music', 'travel']);
    assert.equal(result.state.episode.status, 'finished');
    assert.doesNotMatch(JSON.stringify(result.state), /unknown_operation|selection.*keep/);
    assert.ok(validCampaignState(result.state));
    assert.equal(result.result.text, JSON.stringify(value), 'original response is retained');
});

test('split realization rows and repeated episode stages save a valid first plan in one call', async () => {
    const evidence = [
        { index: 0, role: 'assistant', content: 'The ensemble began practicing.' },
        { index: 1, role: 'assistant', content: 'The ensemble completed the performance.' },
    ];
    const value = body([], [selected()], [
        { id: 'music', changes: [{ episodeId: 'show', status: ' Completed ', evidence: [{ index: '1', span: '0' }] }] },
        { id: 'music', changes: [{ episodeId: 'show', status: 'participating', evidence: [{ index: 0, span: 0 }] }] },
    ]);
    const result = await plan(emptyCampaign(), value, evidence);
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.state.realization.music.episodes.show.status, 'completed');
    assert.deepEqual(result.state.realization.music.episodes.show.witnesses.map(w => w.index), [1]);
    assert.ok(validCampaignState(result.state));
    assert.ok(result.responseAdjustments.length);
});

test('missing or null optional progress makes no new claims and preserves existing witnessed history', async () => {
    const progress = [{ id: 'music', changes: [{ episodeId: 'show', status: 'completed', evidence: [{ index: 0, span: 0 }] }] }];
    const first = await plan(emptyCampaign(), body([], [selected()], progress));
    assert.equal(first.accepted, true, first.error);
    for (const omitted of [true, false]) {
        const value = body([], [selected()]);
        if (omitted) delete value.realization; else value.realization = null;
        const next = await plan(first.state, value);
        assert.equal(next.accepted, true, next.error);
        assert.deepEqual(next.state.realization, first.state.realization);
        assert.ok(validCampaignState(next.state));
    }
});

test('unsupported progress leaves witnessed history intact while fresh selection saves', async () => {
    const state = await initial();
    const progress = [{ id: 'music', changes: [{ episodeId: 'performance', status: 'completed',
        evidence: [{ index: 0, span: 0 }] }] }];
    const value = body([], [{ ...selected(), available: 'New contrasting arrangements are available.' }], progress);
    const accepted = await plan(state, value);
    assert.equal(accepted.accepted, true, accepted.error);
    assert.equal(accepted.state.realization.music.episodes.performance.status, 'completed');
    assert.match(campaignPayload(accepted.state), /New contrasting arrangements/);
    const invalid = structuredClone(value);
    invalid.realization[0].changes[0].evidence[0].span = 999;
    const partial = await plan(accepted.state, invalid);
    assert.equal(partial.accepted, true, partial.error);
    assert.deepEqual(partial.state.realization, accepted.state.realization);
    assert.equal(partial.skippedProgress, 1);
    assert.equal(partial.warnings.length, 1);
    assert.match(campaignPayload(partial.state), /New contrasting arrangements/);
    assert.deepEqual(partial.result.text, JSON.stringify(invalid), 'diagnostics retain the actual provider output');
});

test('invalid citation addresses are skipped without inventing progress or blocking a first plan', async () => {
    for (const evidence of [[{ index: 99, span: 0 }], [{ index: 0, span: 999 }],
        [{ index: 0, span: -1 }], [{ index: 0 }], [{ index: 0, span: 'invented' }],
        [null], [], null, undefined]) {
        const value = body([], [selected()], [{ id: 'music', changes: [{ episodeId: 'performance', status: 'completed', evidence }] }]);
        const result = await plan(emptyCampaign(), value);
        assert.equal(result.accepted, true, result.error);
        assert.equal(result.skippedProgress, 1);
        assert.deepEqual(result.state.realization.music.episodes, {});
        assert.match(campaignPayload(result.state), /complementary repertoires/);
        assert.ok(validCampaignState(result.state));
    }
});

test('mixed witnesses retain exactly supported progress and do not advance an unsupported later stage', async () => {
    const evidence = [{ index: 7, role: 'assistant', content: 'The ensemble started rehearsing.\nThe audience arrived.' }];
    const value = body([], [selected()], [{ id: 'music', changes: [
        { episodeId: 'performance', status: 'participating', evidence: [{ index: 7, span: 0 }, { index: 7, span: 999 }] },
        { episodeId: 'performance', status: 'completed', evidence: [{ index: 8, span: 0 }] },
    ] }]);
    const result = await plan(emptyCampaign(), value, evidence);
    assert.equal(result.accepted, true, result.error);
    const episode = result.state.realization.music.episodes.performance;
    assert.equal(episode.status, 'participating');
    assert.deepEqual(episode.witnesses.map(w => [w.index, w.quote]), [[7, 'The ensemble started rehearsing.']]);
    assert.equal(result.warnings.length, 2);
    assert.equal(result.skippedProgress, 1);
    assert.ok(validCampaignState(result.state));
});

test('retirement uses only exact witnesses agreeing with declared indices and otherwise retains the subject', async () => {
    const state = await initial();
    const retirement = { id: 'music', reason: 'Finished.', scope: 'whole-subject',
        evidence: [0, 999], witnesses: [{ index: 0, span: 0 }, { index: 999, span: 0 }] };
    const accepted = await plan(state, { ...body([], [selected(['travel'])]), retire: [retirement] });
    assert.equal(accepted.accepted, true, accepted.error);
    assert.deepEqual(accepted.state.archive.find(entry => entry.retirement).retirement.evidence, [0]);
    assert.equal(accepted.skippedRetirements, 0);
    for (const mutate of [
        entry => { entry.evidence = [999]; },
        entry => { entry.witnesses = []; },
        entry => { delete entry.witnesses; },
    ]) {
        const invalid = structuredClone(retirement);
        mutate(invalid);
        const result = await plan(state, { ...body([], [selected()]), retire: [invalid] });
        assert.equal(result.accepted, true, result.error);
        assert.equal(result.skippedRetirements, 1);
        assert.deepEqual(result.state.developments, state.developments);
        assert.equal(result.state.archive.some(entry => entry.retirement), false);
        assert.ok(validCampaignState(result.state));
    }
});

test('formatted source witnesses and continuing participation cannot block a fresh scene selection', async () => {
    const evidence = [{ index: 0, role: 'assistant', content: '| **Private duet** | Partially rehearsed |\nJo and Sef keep the revised rhythm.' }];
    const begun = await plan(emptyCampaign(), body([], [selected()], [{ id: 'music', changes: [
        { episodeId: 'duet', status: 'partial', evidence: [{ index: 0, span: 0 }] },
    ] }]), evidence);
    assert.equal(begun.accepted, true, begun.error);
    assert.equal(begun.state.realization.music.episodes.duet.witnesses[0].quote, '| **Private duet** | Partially rehearsed |');
    const later = [...evidence, { index: 1, role: 'assistant', content: 'They agree to try it again privately when willing.\nDownstairs, the oven breaks.' }];
    const value = body([], [{ ...selected(), available: 'The revised private duet remains an optional shared activity.' }], [{ id: 'music', changes: [
        { episodeId: 'duet', status: 'participating', evidence: [{ index: 1, span: 0 }] },
    ] }]);
    const next = await plan(begun.state, value, later);
    assert.equal(next.accepted, true, next.error);
    assert.equal(next.state.realization.music.episodes.duet.status, 'partial');
    assert.deepEqual(next.state.realization.music.episodes.duet.witnesses.map(w => w.index), [0, 1]);
    assert.match(campaignPayload(next.state), /revised private duet/);
    assert.doesNotMatch(campaignPayload(next.state), /Partially rehearsed|span|witness|oven/);
    assert.equal(validCampaignState(JSON.parse(JSON.stringify(next.state))), true);
    const invalid = structuredClone(value); invalid.realization[0].changes[0].evidence[0] = { index: 1, quote: 'invented' };
    const skipped = await plan(begun.state, invalid, later);
    assert.equal(skipped.accepted, true, skipped.error);
    assert.equal(skipped.skippedProgress, 1, 'generated quote text never substitutes for an exact address');
    assert.deepEqual(skipped.state.realization, begun.state.realization);
});

test('legacy per-subject selections migrate without deleting witnessed progress or durable preparation', async () => {
    const legacyValue = body([subject('music')], [], [{ id: 'music',
        changes: [{ episodeId: 'performance', status: 'completed', evidence: [{ index: 0, quote: 'The performance is finished.' }] }],
        playable: [{ episodeId: 'later-work', when: 'On the road toward Mere.', direction: 'OLD scripted material.', middle: 'OLD dilemma.', future: 'OLD ending.' }] }], [background('music')]);
    delete legacyValue.selected_material;
    delete legacyValue.rp_brief;
    legacyValue.developments.forEach(subject => delete subject.background);
    const legacy = await ownedPass({ state: emptyCampaign(), source,
        input: ownedInput({ state: emptyCampaign(), reference: {}, messages }),
        generate: async () => ({ text: JSON.stringify(legacyValue) }) });
    assert.equal(legacy.accepted, true, legacy.error);
    legacy.state.storyMaterialVersion = 1;
    const input = storyInput({ state: legacy.state, reference: {}, messages });
    assert.doesNotMatch(input.prompt, /OLD scripted|OLD dilemma|OLD ending|selection_review_required_ids|playable_review_required_ids/);
    assert.match(input.prompt, /PRIVATE shared practice/);
    assert.equal(JSON.parse(input.prompt).accepted_progress.music.episodes.performance.status, 'completed');
    const next = await plan(legacy.state, body([], [selected(['music'])], [], [background('music')]));
    assert.equal(next.accepted, true, next.error);
    assert.deepEqual(next.state.developments, legacy.state.developments);
    assert.deepEqual(next.state.realization.music.episodes, legacy.state.realization.music.episodes);
    assert.deepEqual(next.state.realization.music.playable, []);
    assert.deepEqual(next.state.archive.findLast(a => a.realization).realization, legacy.state.realization);
    assert.doesNotMatch(campaignPayload(next.state), /OLD|On the road/);
});

test('retirement requires exact whole-subject witnesses and cannot leave dangling selected references', async () => {
    const state = await initial();
    const evidence = [{ index: 0, role: 'user', content: 'We permanently abandon the musical undertaking.' }];
    const retire = [{ id: 'music', reason: 'Whole undertaking rejected.', scope: 'whole-subject',
        evidence: [0], witnesses: [{ index: 0, span: 0 }] }];
    const rejected = await plan(state, { ...body([], [selected()]), retire }, evidence);
    assert.equal(rejected.accepted, false);
    const accepted = await plan(state, { ...body([], [selected(['travel'])], [], [background('travel')]), retire }, evidence);
    assert.equal(accepted.accepted, true, accepted.error);
    assert.equal(validCampaignState(accepted.state), true);
    assert.deepEqual(accepted.state.developments.map(s => s.id), ['travel']);
    const falseWitness = structuredClone(retire); falseWitness[0].witnesses[0].span = 999;
    const retained = await plan(state, { ...body([], [selected()]), retire: falseWitness }, evidence);
    assert.equal(retained.accepted, true, retained.error);
    assert.equal(retained.skippedRetirements, 1);
    assert.deepEqual(retained.state.developments, state.developments);
    assert.equal(retained.state.archive.some(entry => entry.retirement), false);
    assert.match(campaignPayload(retained.state), /complementary repertoires/);
});

test('updated applicability replaces and archives the previous snapshot without forced novelty', async () => {
    const state = await initial();
    const current = { ...selected(), available: 'The ensemble has left Mere for the seasonal circuit.' };
    const next = await plan(state, body([], [current]));
    assert.equal(next.accepted, true, next.error);
    assert.equal(packet(next.state).possible_developments[0].available_circumstances, current.available);
    assert.deepEqual(next.state.archive.findLast(a => a.selectedMaterial).selectedMaterial, state.selectedMaterial);
    const unchanged = await plan(next.state, body([], [current]));
    assert.equal(unchanged.accepted, true, unchanged.error);
    assert.equal(unchanged.state.archive.length, next.state.archive.length);
    assert.equal(campaignPayload(unchanged.state), campaignPayload(next.state));
    // Text semantics remain the planner's job; this proves atomic replacement, not a semantic oracle.
});

test('stored snapshots validate references and round-trip without exposing private plans', async () => {
    const state = await initial();
    const restored = JSON.parse(JSON.stringify(state));
    assert.equal(validCampaignState(restored), true);
    assert.equal(campaignPayload(restored), campaignPayload(state));
    for (const invalid of [null, [selected(['unknown'])], [selected(), selected()]]) {
        assert.equal(validCampaignState({ ...restored, selectedMaterial: invalid }), false);
    }
});

test('a scope reset withholds old selected drafts and archives them only on a successful new snapshot', async () => {
    const old = await initial();
    old.planningScope = 'independent-developments-v1';
    const input = JSON.parse(storyInput({ state: old, reference: {}, messages }).prompt);
    assert.equal(input.previous_preparation.scope_reset, true);
    assert.equal(input.previous_preparation.selected_material, undefined);
    assert.deepEqual(input.previous_preparation.developments, []);
    const rejected = await plan(old, { ...body(), selected_material: null });
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.state, old);
    const next = await plan(old, body([subject('new')], [selected(['new'])], [], [background('new')]));
    assert.equal(next.accepted, true, next.error);
    assert.equal(validCampaignState(next.state), true);
    assert.deepEqual(next.state.developments.map(d => d.id), ['new']);
    assert.equal(next.state.archive.filter(a => a.scopeReframe).length, 2);
    assert.deepEqual(next.state.archive.findLast(a => a.selectedMaterial).selectedMaterial, old.selectedMaterial);
});

test('the actual contract and private background are budgeted without old injection or scene prose', async () => {
    const state = await initial();
    const input = storyInput({ state, reference: {}, messages });
    const prior = JSON.parse(input.prompt).previous_preparation;
    assert.equal(prior.selected_material, undefined);
    assert.equal(prior.episode, undefined);
    assert.ok(state.selectedMaterial.every(entry => !input.prompt.includes(entry.available)));
    assert.equal(Object.keys(JSON.parse(input.prompt))[0], 'source_reference');
    assert.equal(Object.keys(JSON.parse(input.prompt)).at(-1), 'accepted_messages');
    assert.deepEqual(prior.developments.map(({ id, background }) => ({ subjectId: id, ...background })), state.background);
    assert.doesNotMatch(JSON.stringify(prior), /"playable"|selection_review_required/);
    assert.equal(input.inputTokens, storyInputTokens(input.prompt, STORY_SYSTEM, STORY_SCHEMA));
    assert.ok(STORY_SCHEMA.value.required.includes('selected_material'));
    assert.ok(STORY_SCHEMA.value.properties.developments.items.required.includes('background'));
    const fields = Object.keys(STORY_SCHEMA.value.properties);
    assert.ok(fields.indexOf('developments') < fields.indexOf('selected_material'), 'assess discoverability before writing the handoff');
    assert.equal(STORY_SCHEMA.value.properties.realization.items.properties.playable, undefined);
    assert.equal(STORY_SCHEMA.value.properties.realization.items.properties.selection, undefined);
    assert.match(STORY_SYSTEM, /Rebuild it from current play, not previous selected prose/);
    assert.match(STORY_SYSTEM, /Several subjects may inform one circumstance/);
    assert.match(STORY_SYSTEM, /developing and lasting are optional/);
    assert.match(STORY_SYSTEM, /Competence permits participation, not agreement or accomplishment/);
    assert.match(STORY_SYSTEM, /Contact does not reveal private motives or knowledge/);
    assert.ok(STORY_SYSTEM.split(/\s+/).length < 800, 'Keep one concise contract instead of accumulating overlapping prompts');
    assert.match(STORY_SCHEMA.value.properties.selected_material.items.properties.lasting.description, /No guaranteed ending/);
    assert.doesNotMatch(STORY_SYSTEM, /Connect an available premise to developing conditions and conditional consequences/);
});

test('creative direction stays open without requiring a detailed scene plan', async () => {
    assert.match(STORY_SYSTEM, /Ordinary activities and quiet enjoyment are valid/);
    assert.match(STORY_SYSTEM, /No forced conflict, interruption, escalation, reconciliation or novelty quota/);
    assert.match(STORY_SYSTEM, /writer handles execution and incidental detail/);
    assert.doesNotMatch(STORY_SYSTEM, /Give an activity actual subject matter|Specific proposed content is welcome/);
    const developing = STORY_SCHEMA.value.properties.selected_material.items.properties.developing.description;
    assert.match(developing, /changes beyond this scene/);
    assert.match(developing, /not staged scenes or writing directions/);
    const direction = {
        subjectIds: ['music'],
        available: 'The ensemble is together after a shared performance, with room to pursue its common interest.',
        developing: 'Contrasting approaches to music could become complementary strengths, making artistic disagreement a source of mutual reliance without requiring personal agreement.',
        lasting: 'That creative reliance could give the ensemble an identity of its own while leaving closeness, ambition and continued collaboration open.',
    };
    const result = await plan(emptyCampaign(), body([subject('music')], [direction], [], [background('music')]));
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(packet(result.state).possible_developments, [{
        available_circumstances: direction.available,
        mid_term_possibilities: direction.developing,
        long_term_possibilities: direction.lasting,
    }], 'a directional possibility reaches the writer without added scenes, details or mandated outcomes');
});

test('inaccessible background survives quiet reviews and later surfaces without becoming accepted history', async () => {
    const state = await initial();
    const hidden = [background('music', 'none'), background('travel', 'none')];
    const quiet = await plan(state, body([], [], [], hidden));
    assert.equal(quiet.accepted, true, quiet.error);
    assert.equal(campaignPayload(quiet.state), '');
    assert.deepEqual(quiet.state.developments, state.developments);
    assert.deepEqual(quiet.state.realization, state.realization);
    assert.deepEqual(quiet.state.background, hidden);
    assert.equal(quiet.state.archive.filter(entry => entry.development).length,
        state.archive.filter(entry => entry.development).length, 'full snapshot does not archive unchanged durable aims again');
    const prior = JSON.parse(storyInput({ state: quiet.state, reference: {}, messages }).prompt);
    assert.deepEqual(prior.previous_preparation.developments.map(({ id, background }) => ({ subjectId: id, ...background })), hidden);
    assert.deepEqual(prior.accepted_progress, {}, 'private progress is never remembered as witnessed');
    const same = await plan(quiet.state, body([], [], [], hidden));
    assert.equal(same.accepted, true, same.error);
    assert.equal(same.state.archive.length, quiet.state.archive.length, 'unchanged background does not grow the archive');
    const current = [background('music', 'contact'), background('travel', 'none')];
    current[0].access.basis = 'PRIVATE Jo is now available at the guesthouse.';
    const surfaced = await plan(same.state, body([], [selected(['music'])], [], current));
    assert.equal(surfaced.accepted, true, surfaced.error);
    assert.equal(validCampaignState(surfaced.state), true);
    assert.deepEqual(surfaced.state.realization, state.realization);
    assert.deepEqual(surfaced.state.archive.findLast(entry => entry.background).background, hidden);
    assert.doesNotMatch(campaignPayload(surfaced.state), /PRIVATE|Jo|contact|guesthouse/);
});

test('conflicting, unreviewed or inaccessible background rejects the whole update', async () => {
    const state = await initial();
    const cases = [body([], [selected()], [], []),
        body([], [], [], [background('music'), background('music', 'none')]),
        body([], [selected()], [], [background('music'), background('travel', 'none')]),
        body([], [], [], [{ ...background('music'), access: { route: 'teleport', basis: 'Invented.' } }, background('travel')]),
    ];
    for (const value of cases) {
        const result = await plan(state, value);
        assert.equal(result.accepted, false, JSON.stringify(value));
        assert.equal(result.state, state);
    }
    for (const backgrounds of [[], [background('music'), background('music')], [background('music'), background('travel', 'none')]]) {
        assert.equal(validCampaignState({ ...state, background: backgrounds }), false);
    }
    const inconsistent = { ...state, background: [background('music'), background('travel', 'none')] };
    assert.equal(campaignPayload(inconsistent), '', 'serialization also fails closed for an inaccessible contributor');
});

test('legacy horizons are withheld as a selection template while private aims and witnesses survive migration', async () => {
    const legacy = await initial();
    delete legacy.background;
    assert.equal(validCampaignState(legacy), true);
    const input = JSON.parse(storyInput({ state: legacy, reference: {}, messages }).prompt);
    assert.equal(input.previous_preparation.selected_material, undefined);
    assert.ok(input.previous_preparation.developments.every(subject => subject.background === undefined));
    assert.equal(input.previous_preparation.developments.length, 2);
    const next = await plan(legacy, body());
    assert.equal(next.accepted, true, next.error);
    assert.deepEqual(next.state.developments, legacy.developments);
    assert.deepEqual(next.state.realization, legacy.realization);
});

test('private updates retain omitted aims without carrying over selected prose', async () => {
    const state = await initial();
    const changed = { ...subject('music'), development: 'PRIVATE a revised musical possibility, not witnessed progress.' };
    const result = await plan(state, body([changed]));
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.state.developments[0].progression, changed.development);
    assert.deepEqual(result.state.developments[1], state.developments[1]);
    assert.equal(result.state.archive.filter(entry => entry.development).length, 1);
    assert.deepEqual(result.state.realization, state.realization);
    const omitted = body([], [], [], [background('music')]);
    const retained = await plan(state, omitted);
    assert.equal(retained.accepted, true, retained.error);
    assert.deepEqual(retained.state.developments, state.developments);
    assert.deepEqual(retained.state.background, state.background);
    assert.equal(campaignPayload(retained.state), '', 'omission is private retention, never stale writer selection');
});

test('same-pass final progress and retirement accept overlapping private snapshots without stale selection', async () => {
    const state = await initial();
    const evidence = [{ index: 0, role: 'user', content: 'The final performance is finished. We permanently abandon the musical undertaking.' }];
    const retire = [{ id: 'music', reason: 'Whole undertaking rejected.', scope: 'whole-subject',
        evidence: [0], witnesses: [{ index: 0, span: 0 }] }];
    const progress = [{ id: 'music', changes: [{ episodeId: 'final-performance', status: 'completed',
        evidence: [{ index: 0, span: 0 }] }] }];
    for (const backgrounds of [[background('music'), background('travel')], [background('travel')]]) {
        for (const realization of [[], progress]) {
            const next = await plan(state, { ...body([], [selected(['travel'])], realization, backgrounds), retire }, evidence);
            assert.equal(next.accepted, true, next.error);
            assert.equal(validCampaignState(next.state), true);
            assert.deepEqual(next.state.developments.map(item => item.id), ['travel']);
            assert.deepEqual(next.state.background.map(item => item.subjectId), ['travel']);
            assert.deepEqual(next.state.realization.music.playable, []);
            if (realization.length) assert.equal(next.state.realization.music.episodes['final-performance'].status, 'completed');
            assert.match(campaignPayload(next.state), /contrasting ways/);
            assert.equal(next.state.archive.filter(entry => entry.retirement).length, 1);
        }
    }
    const bad = structuredClone(progress); bad[0].changes[0].evidence[0].span = 999;
    const partial = await plan(state, { ...body([], [selected(['travel'])], bad), retire }, evidence);
    assert.equal(partial.accepted, true, partial.error);
    assert.equal(partial.skippedProgress, 1);
    assert.equal(partial.state.realization.music.episodes['final-performance'], undefined);
    assert.equal(partial.state.archive.filter(entry => entry.retirement).length, 1, 'independently verified retirement still applies');
});

test('private omission during migration retains aims but requires fresh access before selection', async () => {
    const state = await initial(); delete state.background;
    const next = await plan(state, body([], [], [], []));
    assert.equal(next.accepted, true, next.error);
    assert.equal(validCampaignState(next.state), true);
    assert.deepEqual(next.state.developments, state.developments);
    assert.ok(next.state.background.every(entry => entry.access.route === 'none'));
    assert.equal(campaignPayload(next.state), '');
    const stale = await plan(next.state, body([], [selected()], [], []));
    assert.equal(stale.accepted, false);
    const fresh = await plan(next.state, body([], [selected()]));
    assert.equal(fresh.accepted, true, fresh.error);
});

test('four active subjects can replace four retiring subjects without dropping final evidence', async () => {
    const oldIds = ['old-a', 'old-b', 'old-c', 'old-d'];
    const newIds = ['new-a', 'new-b', 'new-c', 'new-d'];
    const started = await plan(emptyCampaign(), body([], [], [], oldIds.map(id => background(id))));
    assert.equal(started.accepted, true, started.error);
    const evidence = [{ index: 0, role: 'user', content: 'All four old undertakings are finished and permanently closed.' }];
    const retire = oldIds.map(id => ({ id, reason: 'Whole undertaking closed.', scope: 'whole-subject',
        evidence: [0], witnesses: [{ index: 0, span: 0 }] }));
    const progress = oldIds.map(id => ({ id, changes: [{ episodeId: 'final', status: 'completed',
        evidence: [{ index: 0, span: 0 }] }] }));
    const replacement = { ...body([], [selected(newIds)], progress, newIds.map(id => background(id))), retire };
    const next = await plan(started.state, replacement, evidence);
    assert.equal(next.accepted, true, next.error);
    assert.equal(validCampaignState(next.state), true);
    assert.deepEqual(next.state.developments.map(entry => entry.id), newIds);
    assert.ok(oldIds.every(id => next.state.realization[id].episodes.final.status === 'completed'));
    const overflow = await plan(started.state, body([], [], [], [background('fifth')]));
    assert.equal(overflow.accepted, false, 'upserts cannot silently evict a private aim at capacity');
    assert.equal(overflow.state, started.state);
    const restart = await plan(next.state, body([], [], [], [background('old-a')]));
    assert.equal(restart.accepted, false, 'a closed id cannot restart');
});

test('retirement without an existing subject and conflicting retirement operations are rejected', async () => {
    const state = await initial();
    const retire = { id: 'unknown', reason: 'Closed.', scope: 'whole-subject', evidence: [0],
        witnesses: [{ index: 0, span: 0 }] };
    for (const entries of [[retire], [{ ...retire, id: 'music' }, { ...retire, id: 'music', reason: 'A different explanation.' }]]) {
        const next = await plan(state, { ...body(), retire: entries });
        assert.equal(next.accepted, false);
        assert.equal(next.state, state);
    }
});

test('a new review remembers aims and witnesses but never reuses old scene or injection as a template', async () => {
    const state = await initial();
    state.episode = { subject: 'STALE SCENE', status: 'open', boundary: 'STALE BOUNDARY' };
    state.selectedMaterial[0] = { subjectIds: ['music'], available: 'STALE AVAILABLE',
        developing: 'STALE MIDDLE', lasting: 'STALE FUTURE' };
    const evidence = [...messages, { index: 1, role: 'user', content: 'We are now trying a new arrangement in Mere.' }];
    const input = storyInput({ state, reference: { scenario: 'The original performance is ahead.' }, messages: evidence });
    assert.doesNotMatch(input.prompt, /STALE/);
    const prompt = JSON.parse(input.prompt);
    assert.deepEqual(prompt.accepted_messages.at(-1).spans, [{ span: 0, text: evidence.at(-1).content }]);
    assert.equal(prompt.previous_preparation.developments.length, 2);
    assert.deepEqual(state.selectedMaterial[0].available, 'STALE AVAILABLE', 'input projection does not erase stored fallback');
    assert.equal(state.episode.subject, 'STALE SCENE');
});

test('an explicitly empty closed-scope snapshot is valid without inventing a subject or injection', async () => {
    const result = await plan(emptyCampaign(), body([], [], [], []));
    assert.equal(result.accepted, true, result.error);
    assert.equal(validCampaignState(result.state), true);
    assert.deepEqual(result.state.developments, []);
    assert.deepEqual(result.state.background, []);
    assert.equal(campaignPayload(result.state), '');
});

test('an accessible conditional opportunity does not expose its unknown private completion', async () => {
    const state = await initial();
    const records = [background('music', 'information'), background('travel', 'none')];
    records[0].unfolding = 'PRIVATE work can proceed independently; completion is unknown.';
    records[0].access.basis = 'PRIVATE a posted notice makes possible collaboration known, not its outcome.';
    const result = await plan(state, body([], [selected(['music'])], [], records));
    assert.equal(result.accepted, true, result.error);
    assert.doesNotMatch(campaignPayload(result.state), /PRIVATE|completion|outcome|posted notice/);
    assert.deepEqual(result.state.realization, state.realization);
});

test('progress ids are checked before adapter placeholders can obscure the actual model error', async () => {
    const state = await initial();
    const result = await plan(state, body([], [], [{ id: 'performance-episode' }]));
    assert.equal(result.accepted, false);
    assert.match(result.error, /unique retained subject ids, not episode ids/);
    assert.equal(result.state, state);
});

test('RP brief is bounded private context, revised in the existing pass and never injected', async () => {
    const state = await initial();
    assert.equal(state.rpBrief, body().rp_brief);
    assert.equal(JSON.parse(storyInput({ state, reference: {}, messages }).prompt).previous_preparation.rp_brief, state.rpBrief);
    assert.doesNotMatch(campaignPayload(state), /PRIVATE|rp_brief|rpBrief/);
    const revised = { ...body([], [selected()]), rp_brief: 'PRIVATE travel now matters more than performance.' };
    const result = await plan(state, revised);
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.state.rpBrief, revised.rp_brief);
    assert.equal(validCampaignState(JSON.parse(JSON.stringify(result.state))), true);
    for (const rp_brief of ['', 'x'.repeat(901), null, { canon: 'Not a tracker' }]) {
        assert.equal((await plan(state, { ...revised, rp_brief })).accepted, false);
    }
    const missing = { ...revised }; delete missing.rp_brief;
    assert.equal((await plan(state, missing)).accepted, false);
    const legacy = structuredClone(state); delete legacy.rpBrief;
    assert.equal(validCampaignState(legacy), true, 'old preparation remains readable');
});

test('brief contract recognizes source canon without enforcing its route or inventing missing history', () => {
    for (const rule of [/established fictional setting/, /timeline and alternate premises/,
        /Accepted play and explicit user premises override incompatible canon/,
        /never force a return to canonical events/, /unknowns stay unknown/,
        /Begin in medias res/, /No franchise template, activity rotation, style rules or fixed destination/]) {
        assert.match(STORY_SYSTEM, rule);
    }
});

test('rest, disengagement and separate activities need no new progress status or forced future', async () => {
    let state = await initial();
    const ledger = structuredClone(state.realization);
    for (const available of [
        'The inn has rooms for the night; the unfinished arrangement can wait.',
        'The investigation remains unresolved; the open road offers a way onward.',
        'The performance is over. The town market is open independently of the ensemble.',
        'A quiet shared meal is available without another engagement.',
    ]) {
        const result = await plan(state, body([], [{ subjectIds: ['music'], available }]));
        assert.equal(result.accepted, true, result.error);
        assert.deepEqual(packet(result.state).possible_developments, [{ available_circumstances: available }]);
        assert.deepEqual(result.state.realization, ledger, 'no new activity or pause tracking');
        state = result.state;
    }
    const quiet = await plan(state, body());
    assert.equal(quiet.accepted, true, quiet.error);
    assert.equal(campaignPayload(quiet.state), '');
    assert.deepEqual(quiet.state.developments, state.developments);
});

test('optional horizons may be absent or empty while oversized content still respects storage bounds', async () => {
    const state = await initial();
    const entry = { subjectIds: ['music'], available: 'The evening is free.' };
    const later = await plan(state, body([], [{ ...entry, lasting: 'A recurring shared interest could endure.' }]));
    assert.equal(later.accepted, true, later.error);
    assert.equal(packet(later.state).possible_developments[0].mid_term_possibilities, undefined);
    for (const developing of ['', null, '   ']) {
        const result = await plan(state, body([], [{ ...entry, developing }]));
        assert.equal(result.accepted, true, result.error);
        assert.equal(result.state.selectedMaterial[0].developing, undefined);
    }
    assert.equal((await plan(state, body([], [{ ...entry, developing: 'x'.repeat(901) }]))).accepted, false);
});

test('planner contract excludes preset directions from all fields; effects come from story substance', async () => {
    assert.match(STORY_SYSTEM, /Mood, tone, pacing and prose belong to the writing preset, not any output field/);
    assert.match(STORY_SYSTEM, /concrete circumstances, events, choices or consequences, never emotional labels or delivery instructions/);
    assert.match(STORY_SCHEMA.value.properties.rp_brief.description, /no mood, tone, pacing, prose rules/);
    assert.match(STORY_SCHEMA.value.properties.selected_material.description, /no mood, tone, pacing or prose directives/);
    const available = 'The inn has a spare room and hot supper. Tomorrow’s coach leaves at dawn; the unfinished inquiry can wait.';
    const result = await plan(await initial(), body([], [{ subjectIds: ['music'], available }]));
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(packet(result.state), { possible_developments: [{ available_circumstances: available }] });
    assert.doesNotMatch(campaignPayload(result.state), /tone|mood|pacing|style|PRIVATE/);
});
