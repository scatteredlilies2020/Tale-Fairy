import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignPayload, emptyCampaign } from '../extension/campaign-planner.js';
import { OWNED_SYSTEM, OWNED_SCHEMA, ownedInput, ownedPass } from '../extension/event-planning.js';
import { storyMaterial } from '../extension/undertaking-lifecycle.js';

const source = { chatId: 'story', referenceHash: 'premise', messageCount: 1, fingerprint: 'accepted' };
const messages = [{ index: 0, role: 'assistant', content: 'The opening phase has ended.' }];
const material = (direction, middle, future) => ({ episodeId: 'opening', when: 'If the relevant circumstances arise.', direction, middle, future });
const subject = (id, owner = 'Surrounding conditions') => ({ id,
    initiative: { owner, control: 'world', aim: 'PRIVATE enduring change, not a player assignment.' },
    development: 'PRIVATE mid-term possibilities remain available across later developments.',
    stakes: 'PRIVATE contingent long-term branches.', participation: 'Participation remains optional.' });
const body = (developments, realization) => ({ campaign: 'PRIVATE wider horizon.',
    episode: { subject: 'Opening phase', status: 'finished', boundary: 'PRIVATE closed business.' }, developments, realization });
async function plan(state, value, evidence = messages) {
    let calls = 0;
    const result = await ownedPass({ state, source,
        input: ownedInput({ state, reference: {}, messages: evidence }),
        generate: async () => { calls++; return { text: JSON.stringify(value), finishReason: 'stop' }; } });
    assert.equal(calls, 1);
    return result;
}
const parse = state => JSON.parse(campaignPayload(state).replace(/<\/?tale-fairy-context>/g, '').trim());

test('finished orders cannot survive an omitted selection review; later normal review can resume wider material', async () => {
    const orders = material('Outstanding orders are available for collection.',
        'Local demand could support recurring trade.', 'Regular customers could sustain a broader trading network.');
    const first = await plan(emptyCampaign(), body([subject('trade')], [{ id: 'trade', playable: [orders] }]));
    assert.equal(first.accepted, true, first.error);
    const evidence = [{ index: 0, role: 'user', content: 'All orders are collected. We leave the shop and continue our journey.' }];
    const next = await plan(first.state, { ...body([], []),
        episode: { subject: 'Order collection', status: 'finished', boundary: 'All orders collected; the party has left.' } }, evidence);
    assert.equal(next.accepted, true, next.error);
    assert.equal(next.state.episode.status, 'finished');
    assert.equal(campaignPayload(next.state), '');
    assert.deepEqual(next.state.developments, first.state.developments);
    assert.deepEqual(next.state.realization.trade.episodes, {}, 'withholding is not evidence of completed progress');
    assert.equal(next.state.realization.trade.needsPlayableReview, true);
    assert.deepEqual(next.state.archive.findLast(a => a.realization).realization, first.state.realization);
    const input = JSON.parse(ownedInput({ state: next.state, reference: {}, messages: evidence }).prompt);
    assert.deepEqual(input.previous_preparation.playable_review_required_ids, ['trade']);
    const quiet = await plan(next.state, body([], []), evidence);
    assert.equal(quiet.accepted, true, quiet.error);
    assert.equal(quiet.state.archive.filter(a => a.realization).length, next.state.archive.filter(a => a.realization).length);
    const wider = material('An accessible settlement has complementary trade needs.',
        'Different local resources make exchange useful.', 'Sustained exchange could support a regional network.');
    const later = await plan(quiet.state, body([], [{ id: 'trade', playable: [wider] }]), evidence);
    assert.equal(later.accepted, true, later.error);
    assert.match(campaignPayload(later.state), /accessible settlement/);
    assert.doesNotMatch(campaignPayload(later.state), /Outstanding orders/);
    assert.equal(later.state.realization.trade.needsPlayableReview, undefined);
});

test('automatic selection decisions are private: keep, revise and withdraw preserve long-term preparation', async () => {
    const selected = material('Available shared resources.', 'Complementary skills.', 'Further cooperation could become possible.');
    const first = await plan(emptyCampaign(), body([subject('subject')], [{ id: 'subject', playable: [selected] }]));
    const preparation = JSON.parse(ownedInput({ state: first.state, reference: {}, messages }).prompt).previous_preparation;
    assert.deepEqual(preparation.selection_review_required_ids, ['subject']);
    const keep = await plan(first.state, body([], [{ id: 'subject', selection: 'keep' }]));
    assert.equal(keep.accepted, true, keep.error);
    assert.deepEqual(keep.state.realization, first.state.realization);
    assert.equal(keep.state.archive.filter(a => a.realization).length, first.state.archive.filter(a => a.realization).length);
    assert.equal(campaignPayload(keep.state), campaignPayload(first.state));
    assert.doesNotMatch(campaignPayload(keep.state), /selection|keep|PRIVATE/);
    const revised = { ...selected, direction: 'A different shared resource is accessible.' };
    const revise = await plan(keep.state, body([], [{ id: 'subject', playable: [revised] }]));
    assert.equal(revise.accepted, true, revise.error);
    assert.match(campaignPayload(revise.state), /different shared resource/);
    assert.doesNotMatch(campaignPayload(revise.state), /Available shared resources/);
    const withdraw = await plan(revise.state, body([], [{ id: 'subject', playable: [] }]));
    assert.equal(withdraw.accepted, true, withdraw.error);
    assert.equal(campaignPayload(withdraw.state), '');
    assert.deepEqual(withdraw.state.developments, first.state.developments);
    assert.deepEqual(withdraw.state.realization.subject.episodes, {});
    assert.equal(withdraw.state.realization.subject.needsPlayableReview, undefined);
});

test('omission withholds only unreviewed active material, not another kept selection or dormant subject', async () => {
    const selected = material('Shared resource.', 'Overlapping interests.', 'Future cooperation.');
    const first = await plan(emptyCampaign(), body(['kept', 'omitted', 'dormant'].map(id => subject(id)),
        ['kept', 'omitted', 'dormant'].map(id => ({ id, playable: id === 'dormant' ? [] : [selected] }))));
    const next = await plan(first.state, body([], [{ id: 'kept', selection: 'keep' }]));
    assert.equal(next.accepted, true, next.error);
    assert.deepEqual(next.state.realization.kept, first.state.realization.kept);
    assert.deepEqual(next.state.realization.dormant, first.state.realization.dormant);
    assert.deepEqual(next.state.realization.omitted.playable, []);
    assert.equal(next.state.realization.omitted.needsPlayableReview, true);
    assert.equal(parse(next.state).possible_developments.length, 1);
    assert.deepEqual(next.state.developments, first.state.developments);
});

test('invalid keep decisions cannot bypass new, legacy, pending or witnessed-progress validation', async () => {
    const selected = material('Available resource.', 'Developing conditions.', 'Possible consequences.');
    const first = await plan(emptyCampaign(), body([subject('subject')], [{ id: 'subject', playable: [selected] }]));
    const dormant = structuredClone(first.state); dormant.realization.subject.playable = [];
    const legacy = structuredClone(first.state); delete legacy.storyMaterialVersion;
    const pending = structuredClone(first.state); pending.realization.subject.needsPlayableReview = true;
    const cases = [
        [emptyCampaign(), body([subject('subject')], [{ id: 'subject', selection: 'keep' }])],
        ...[dormant, legacy, pending].map(state => [state, body([], [{ id: 'subject', selection: 'keep' }])]),
        [first.state, body([], [{ id: 'subject', selection: 'keep', playable: [] }])],
        [first.state, body([], [{ id: 'subject', selection: 'invalid' }])],
        ...['partial', 'completed'].map(status => [first.state, body([], [{ id: 'subject', selection: 'keep',
            changes: [{ episodeId: 'opening', status, evidence: [{ index: 0, quote: messages[0].content }] }] }])]),
    ];
    for (const [state, value] of cases) {
        const before = structuredClone(state);
        const result = await plan(state, value);
        assert.equal(result.accepted, false);
        assert.equal(result.state, state);
        assert.deepEqual(state, before);
    }
});

test('planner contract selects substance rather than presentation and has no genre quota', () => {
    // Prompt/schema checks are not a claim of live model quality.
    assert.match(OWNED_SYSTEM, /No default adventure, conflict, travel, human protagonist or dramatic arc/);
    assert.match(OWNED_SYSTEM, /Never author instructions about writing style/);
    assert.match(OWNED_SYSTEM, /Encounters and events ARE valid material/);
    assert.match(OWNED_SYSTEM, /Alternatives are alternatives, not successive required encounters/);
    assert.match(OWNED_SYSTEM, /Review frequency is not story time/);
    assert.match(OWNED_SYSTEM, /On EVERY review, reassess the wider horizon/);
    assert.match(OWNED_SYSTEM, /Check existing selections too/);
    assert.match(OWNED_SYSTEM, /do not force departure, declare a scene finished, rotate subjects by quota/);
    assert.equal(OWNED_SCHEMA.name, 'tale_fairy_story_material_v1');
});

for (const [domain, owner, selected] of [
    ['travel', 'Route traffic', material('A traveling peddler has supplies and knowledge of nearby settlements.',
        'Trade routes connect settlements with different needs.', 'If trade or information is exchanged, further routes could become accessible.')],
    ['relationship', 'Shared household', material('Two housemates value different uses of their shared space.',
        'Their overlapping routines create opportunities for cooperation as well as disagreement.', 'If they reach an arrangement, later shared responsibilities could become possible.')],
    ['shop simulation', 'Local trade', material('Seasonal demand favors goods the shop can already produce.',
        'Production capacity and repeat demand affect which orders are feasible.', 'If demand persists, a recurring supply arrangement could be viable.')],
    ['ecosystem simulation', 'Wetland hydrology', material('Seasonal water flow connects previously isolated pools.',
        'Dispersal changes available habitats and resource competition.', 'If connections persist, species distributions could change across the wetland.')],
]) {
    test(`${domain}: useful unnamed material survives the full pass without injected objective commands`, async () => {
        const result = await plan(emptyCampaign(), body([subject('subject', owner)], [{ id: 'subject', changes: [], playable: [selected] }]));
        assert.equal(result.accepted, true, result.error);
        assert.deepEqual(parse(result.state), { possible_developments: [{ source: owner, ...storyMaterial(selected) }] });
        assert.doesNotMatch(campaignPayload(result.state), /PRIVATE|objective|application|provenance|episodeId/);
        assert.deepEqual(result.state.realization.subject.episodes, {}, 'a proposal does not establish progress');
        assert.equal(result.state.storyMaterialVersion, 1);
    });
}

test('dormant mid/long-term preparation stays private until selected, without inventing progress', async () => {
    const first = await plan(emptyCampaign(), body([subject('dormant')], [{ id: 'dormant', changes: [], playable: [] }]));
    assert.equal(first.accepted, true, first.error);
    assert.equal(campaignPayload(first.state), '');
    const stored = JSON.parse(JSON.stringify(first.state));
    const unchanged = await plan(stored, body([], []));
    assert.equal(unchanged.accepted, true, unchanged.error);
    assert.deepEqual(unchanged.state.realization, stored.realization);
    assert.deepEqual(unchanged.state.developments, stored.developments);
    const selected = material('A settlement is accessible along the established route.',
        'Its services and trade could support further exploration.', 'If contact develops, recurring trade could become possible.');
    const later = await plan(unchanged.state, body([], [{ id: 'dormant', changes: [], playable: [selected] }]),
        [{ index: 0, role: 'user', content: 'We take the established route toward the settled region.' }]);
    assert.equal(later.accepted, true, later.error);
    assert.deepEqual(later.state.developments, stored.developments);
    assert.deepEqual(later.state.realization.dormant.episodes, {});
    assert.match(campaignPayload(later.state), /A settlement is accessible/);
    assert.doesNotMatch(campaignPayload(later.state), /PRIVATE/);
});

test('pre-upgrade selected advice requires an atomic review, preserving IDs, progress and archives', async () => {
    const first = await plan(emptyCampaign(), body([subject('subject')], [{ id: 'subject',
        changes: [{ episodeId: 'old-phase', status: 'completed', evidence: [{ index: 0, quote: messages[0].content }] }],
        playable: [material('Develop trust slowly.', 'Linger on small moments.', 'Build toward reconciliation.')] }]));
    assert.equal(first.accepted, true, first.error);
    const old = structuredClone(first.state); delete old.storyMaterialVersion;
    const before = structuredClone(old);
    const input = ownedInput({ state: old, reference: {}, messages });
    const review = JSON.parse(input.prompt).previous_preparation;
    assert.equal(review.material_review_required, true);
    assert.deepEqual(review.playable_review_required_ids, ['subject']);
    for (const value of [body([], []), body([], [{ id: 'subject', changes: [] }])]) {
        const rejected = await plan(old, value);
        assert.equal(rejected.accepted, false);
        assert.equal(rejected.state, old);
        assert.deepEqual(old, before);
    }
    const failed = await ownedPass({ state: old, input, source, generate: async () => { throw Error('offline'); } });
    assert.equal(failed.accepted, false);
    assert.equal(failed.state, old);
    for (const playable of [[], [material('Shared responsibilities create an unresolved difference of interests.',
        'Both parties have something to offer but different expectations.', 'If an arrangement holds, further cooperation could become possible.')]]) {
        const updated = await plan(old, body([], [{ id: 'subject', changes: [], playable }]));
        assert.equal(updated.accepted, true, updated.error);
        assert.equal(updated.state.storyMaterialVersion, 1);
        assert.deepEqual(updated.state.developments, old.developments);
        assert.deepEqual(updated.state.realization.subject.episodes, old.realization.subject.episodes);
        assert.deepEqual(updated.state.archive.slice(0, old.archive.length), old.archive);
        assert.doesNotMatch(campaignPayload(updated.state), /Develop trust slowly|Linger|Build toward/);
        const next = await plan(updated.state, body([], playable.length ? [{ id: 'subject', selection: 'keep' }] : []));
        assert.equal(next.accepted, true, next.error);
        assert.deepEqual(next.state.realization, updated.state.realization);
    }
    assert.deepEqual(old, before);
});

test('selected material cannot add separate pacing, tone or writing-style fields', async () => {
    for (const key of ['pacing', 'tone', 'writing_style']) {
        const state = emptyCampaign();
        const result = await plan(state, body([subject('subject')], [{ id: 'subject', changes: [],
            playable: [{ ...material('Available circumstance.', 'Developing conditions.', 'Conditional consequences.'), [key]: 'Be dramatic.' }] }]));
        assert.equal(result.accepted, false);
        assert.equal(result.state, state);
        assert.match(result.error, /unexpected/);
    }
});

test('a long local scene does not erase the wider horizon, and spent selections can yield without closing their subjects', async () => {
    const local = material('A workshop offers a shared workbench.', 'Tools and experience can be pooled.',
        'If shared work continues, later joint projects could become possible.');
    const first = await plan(emptyCampaign(), body([subject('craft'), subject('regional-trade')], [
        { id: 'craft', changes: [], playable: [local] },
        { id: 'regional-trade', changes: [], playable: [] },
    ]));
    assert.equal(first.accepted, true, first.error);
    const recent = Array.from({ length: 40 }, (_, index) => ({ index, role: 'assistant',
        content: 'The workshop conversation continues about the same workbench.' }));
    const input = ownedInput({ state: first.state, reference: { premise: 'Craft and exchange across several communities.' }, messages: recent });
    const preparation = JSON.parse(input.prompt).previous_preparation;
    assert.equal(preparation.campaign, first.state.campaign);
    assert.deepEqual(preparation.retained_subject_ids, ['craft', 'regional-trade']);
    assert.equal(preparation.developments[1].development, first.state.developments[1].progression);
    assert.match(preparation.review_scope.instruction, /wider horizon and all current selections/);
    assert.match(preparation.review_scope.instruction, /even when absent from recent messages/);
    const wider = material('An established neighboring community has complementary craft needs.',
        'Different local specializations make exchange useful to both communities.',
        'If exchange becomes regular, shared production could become feasible.');
    const next = await plan(first.state, body([], [
        { id: 'craft', changes: [], playable: [] },
        { id: 'regional-trade', changes: [], playable: [wider] },
    ]), recent);
    assert.equal(next.accepted, true, next.error);
    assert.deepEqual(next.state.developments, first.state.developments);
    assert.deepEqual(next.state.realization.craft.episodes, {}, 'withdrawing material does not declare the scene completed');
    assert.doesNotMatch(campaignPayload(next.state), /workbench|PRIVATE/);
    assert.match(campaignPayload(next.state), /neighboring community/);
});
