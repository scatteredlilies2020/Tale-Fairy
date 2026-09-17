import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN_SYSTEM, CAMPAIGN_MARKER, CAMPAIGN_SCHEMA, campaignPass, campaignInput, campaignPayload, campaignUsable, emptyCampaign, mergeCampaign } from '../extension/campaign-planner.js';
import { requestContainsMarker } from '../extension/request-injection.js';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import fs from 'node:fs';

const d = id => ({ id, premise: 'An ongoing subject', progression: 'Distinct experiences and changes', outcomes: 'Reachable ending or transformation', access: 'Compatible participation' });
const response = (developments = [d('music')], retire = []) => ({ campaign: 'An open tour', episode: { subject: 'Delivery', status: 'open', boundary: 'Delivery can finish' }, developments, retire });
const source = { chatId: 'test', referenceHash: 'ref', messageCount: 1, fingerprint: 'first' };
const context = { basisRevision: 0, source, evidenceIndices: [0, 1] };

test('campaign requests carry the existing host marker through the real message builder', () => {
    const host = fs.readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
    const marker = host.match(/const INTERNAL_PLANNER_MARKER = '([^']+)'/)[1];
    assert.equal(CAMPAIGN_MARKER, marker);
    const request = { messages: plannerMessages(CAMPAIGN_SYSTEM, '{}', CAMPAIGN_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY) };
    assert.equal(requestContainsMarker(request, marker), true);
});

test('one request on malformed output, truncation and transport failure; previous preparation survives', async () => {
    const state = mergeCampaign(emptyCampaign(), response(), context);
    for (const failure of ['malformed', 'shape', 'truncated', 'transport']) {
        let calls = 0;
        const result = await campaignPass({ state, input: { prompt: '{}', indices: [0] }, source,
            generate: async () => { calls++; if (failure === 'transport') throw Error('transport');
                return { text: failure === 'malformed' ? '{' : failure === 'shape' ? '{}' : JSON.stringify(response()), finishReason: failure === 'truncated' ? 'length' : 'stop' }; } });
        assert.equal(calls, 1); assert.equal(result.accepted, false); assert.equal(result.state, state);
    }
});

test('a pass cannot commit over a revision changed while the request is in flight', async () => {
    const state = emptyCampaign();
    const result = await campaignPass({ state, input: { prompt: '{}', indices: [0] }, source,
        generate: async () => { state.revision++; return { text: JSON.stringify(response()), finishReason: 'stop' }; } });
    assert.equal(result.accepted, false); assert.match(result.error, /changed during planning/);
    assert.deepEqual(result.state.developments, []);
});

test('a complete-looking response with an extra episode field preserves the entire previous preparation', async () => {
    const state = mergeCampaign(emptyCampaign(), response(), context);
    const before = structuredClone(state), raw = response([d('replacement')]);
    raw.episode.boundary_2 = '';
    let calls = 0;
    const result = await campaignPass({ state, input: { prompt: '{}', indices: [0] }, source,
        generate: async () => { calls++; return { text: JSON.stringify(raw), finishReason: 'stop' }; } });
    assert.equal(calls, 1);
    assert.equal(result.accepted, false);
    assert.match(result.error, /unexpected boundary_2/);
    assert.equal(result.state, state);
    assert.deepEqual(state, before, 'no selective field deletion, partial merge, retirement or archive change');
});

test('omitted retire means no retirement without another call; malformed operations still reject', async () => {
    const state = mergeCampaign(emptyCampaign(), response(), context);
    const raw = response([]); delete raw.retire;
    let calls = 0;
    const result = await campaignPass({ state, input: { prompt: '{}', indices: [0] }, source,
        generate: async () => { calls++; return { text: JSON.stringify(raw), finishReason: 'stop' }; } });
    assert.equal(calls, 1); assert.equal(result.accepted, true);
    assert.deepEqual(result.state.developments, state.developments);
    for (const malformed of [{ ...raw, retire: null }, { ...raw, retire: {} }, { campaign: raw.campaign, episode: raw.episode }]) {
        assert.throws(() => mergeCampaign(state, malformed, { ...context, basisRevision: 1 }));
    }
});

test('omission retains unused subjects; replacement archives complete previous design', () => {
    const prior = mergeCampaign(emptyCampaign(), response([d('music'), d('masks')]), context);
    const before = structuredClone(prior);
    const next = mergeCampaign(prior, response([{ ...d('music'), progression: 'Changed duet and further possibilities' }]), { ...context, basisRevision: 1 });
    assert.deepEqual(prior, before); assert.equal(next.developments.length, 2);
    assert.deepEqual(next.developments[1], d('masks')); assert.deepEqual(next.archive[0].development, d('music'));
});

test('retirement rejects invented evidence, unknown subjects and conflicting operations atomically', () => {
    const prior = mergeCampaign(emptyCampaign(), response(), context), before = structuredClone(prior);
    for (const raw of [response([], [{ id: 'music', reason: 'done', evidence: [8] }]), response([], [{ id: 'unknown', reason: 'done', evidence: [0] }]), response([d('music')], [{ id: 'music', reason: 'done', evidence: [0] }])]) {
        assert.throws(() => mergeCampaign(prior, raw, { ...context, basisRevision: 1 })); assert.deepEqual(prior, before);
    }
    const done = mergeCampaign(prior, response([], [{ id: 'music', reason: 'The whole undertaking ended', evidence: [1] }]), { ...context, basisRevision: 1 });
    assert.equal(done.developments.length, 0); assert.equal(done.archive.length, 1);
});

test('append lag is usable, but edits, swipes, source changes, wrong chats and stale revisions are rejected', () => {
    const state = mergeCampaign(emptyCampaign(), response(), context);
    const options = { chatId: 'test', referenceHash: 'ref', messages: ['first', 'new user'], fingerprint: m => m.join(',') };
    assert.equal(campaignUsable(state, options), true);
    for (const change of [{ chatId: 'other' }, { referenceHash: 'changed' }, { messages: [] }, { messages: ['swiped'] }]) assert.equal(campaignUsable(state, { ...options, ...change }), false);
    assert.throws(() => mergeCampaign(state, response(), context), /changed during planning/);
});

test('whole source and unused middles survive serialization; impossible budget fails explicitly', () => {
    const state = mergeCampaign(emptyCampaign(), response(), context), reference = { description: 'opening '.repeat(600) + 'FINAL SOURCE RULE' };
    const input = campaignInput({ reference, state, messages: [{ index: 0, role: 'user', content: 'hello' }] });
    assert.deepEqual(JSON.parse(input.prompt).source_reference, reference);
    assert.deepEqual(JSON.parse(input.prompt).previous_preparation.developments, state.developments);
    assert.throws(() => campaignInput({ reference, state, messages: [] }, 300), /exceeds/);
});

test('completed episode details stay archived but do not remain active hooks in writer guidance', () => {
    const raw = response(); raw.episode = { subject: 'Delivery', status: 'finished', boundary: 'OLD-LEAD-CATALOGUE' };
    const state = mergeCampaign(emptyCampaign(), raw, context);
    const payload = campaignPayload(state);
    assert.ok(payload.includes('finished')); assert.ok(!payload.includes('OLD-LEAD-CATALOGUE'));
    assert.ok(payload.includes(state.developments[0].progression));
    assert.equal(state.episode.boundary, 'OLD-LEAD-CATALOGUE');
    assert.ok(campaignInput({ reference: {}, state, messages: [] }).prompt.includes('OLD-LEAD-CATALOGUE'));
    const next = mergeCampaign(state, { ...response([]), episode: { subject: 'New venue', status: 'open', boundary: 'A new performance' } }, { ...context, basisRevision: 1 });
    assert.deepEqual(next.archive[0].episode, state.episode);
    assert.equal(next.developments[0].progression, state.developments[0].progression);
    const legacy = { ...state, episode: 'Legacy boundary remains verbatim until reviewed' };
    assert.ok(campaignPayload(legacy).includes(legacy.episode));
    assert.throws(() => mergeCampaign(emptyCampaign(), { ...raw, episode: { ...raw.episode, status: 'maybe' } }, context), /enum/);
});
