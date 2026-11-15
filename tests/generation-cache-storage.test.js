import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCampaign, mergeCampaign, campaignPayload, campaignAuthorInstructions } from '../extension/campaign-planner.js';
import { defaultState } from '../extension/state.js';
import { compactGenerationPacket, compactGenerationContextCache, generationContextEntries,
    cachedGenerationContext, rememberGenerationContext, migrateCampaignBudgetKeys,
    legacyPlotInputKey, plotInputKey, GENERATION_CONTEXT_KEY, GENERATION_CACHE_LIMIT } from '../extension/generation-context.js';

function packet(inputKey = 'turn-1') {
    const preparation = mergeCampaign(emptyCampaign(), {
        campaign: 'A company explores new music and venues.',
        episode: { subject: 'Public engagement', status: 'open', boundary: 'Until the company moves on.' },
        developments: [{ id: 'music', premise: 'Jo has an original musical sketch.',
            progression: 'New rhythms change what the piece expresses. '.repeat(10),
            outcomes: 'An original work can be heard or revised.', access: 'An ordinary shared off-night.' }],
    }, { basisRevision: 0, source: { chatId: 'story', messageCount: 2, fingerprint: 'source', referenceHash: 'reference' }, evidenceIndices: [0, 1] });
    // Storage must preserve arbitrary JSON content too, not just known fields.
    preparation.storageFixture = { prose: '完整\r\n  spaces — 🎶 <literal> & text'.repeat(100),
        weights: Array.from({ length: 21 }, (_, index) => index - 10),
        nested: { $taleFairyPlan: 999 }, empty: '', nil: null };
    const state = { ...defaultState(), plannerContract: 15, campaignPreparation: preparation };
    return { version: 1, chatId: 'story', inputKey,
        payload: campaignPayload(preparation, campaignAuthorInstructions(state)),
        selection: { inputKey, preparedUsable: true, campaignPreparation: preparation }, plannerState: state };
}

function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
}

test('shared plans preserve every retry and JSON value exactly after archive compaction', () => {
    const originalPacket = packet();
    originalPacket.plannerState.campaignPreparation.archive = [{ old: 'A complete historical checkpoint' }];
    const original = { version: 1, custom: { untouched: true }, entries: Array.from({ length: 12 }, (_, index) => ({
        ...originalPacket, inputKey: `turn-${index}` })) };
    const before = JSON.stringify(original);
    const expected = original.entries.map(compactGenerationPacket);
    freeze(original);
    const packed = compactGenerationContextCache(original);
    assert.equal(packed.encoding, 'shared-plans-v1');
    assert.equal(packed.plans.length, 1);
    assert.ok(JSON.stringify(packed).length < JSON.stringify({ ...original, entries: expected }).length * 0.65);
    assert.equal(JSON.stringify(generationContextEntries(JSON.parse(JSON.stringify(packed)))), JSON.stringify(expected));
    assert.equal(JSON.stringify(original), before);
    assert.deepEqual(packed.custom, original.custom);
    assert.equal(compactGenerationContextCache(packed), packed, 'opening again is a no-op');
    assert.equal(cachedGenerationContext(packed, 'turn-5', 'story').payload, originalPacket.payload);
    assert.equal(cachedGenerationContext(packed, 'turn-5', 'other'), null);
});

test('decoded plans are independent across slots, retries, reads and the stored table', () => {
    const source = packet();
    const packed = compactGenerationContextCache({ version: 1, entries: [source, { ...source, inputKey: 'turn-2' }] });
    const before = JSON.stringify(packed);
    freeze(packed);
    const decoded = generationContextEntries(packed);
    decoded[0].plannerState.campaignPreparation.episode.subject = 'Only this recovered copy';
    assert.equal(decoded[0].selection.campaignPreparation.episode.subject, 'Public engagement');
    assert.equal(decoded[1].plannerState.campaignPreparation.episode.subject, 'Public engagement');
    decoded[0].selection.inputKey = 'changed';
    assert.equal(generationContextEntries(packed)[0].selection.inputKey, source.inputKey);
    assert.equal(JSON.stringify(packed), before);
});

test('remembering packed retries enforces the existing limit, replaces matching inputs and removes unused plans', () => {
    let cache;
    for (let index = 0; index < 15; index++) {
        const next = packet(`turn-${index}`);
        next.plannerState.campaignPreparation.storageFixture.unique = index;
        cache = rememberGenerationContext(JSON.parse(JSON.stringify(cache ?? null)), next);
    }
    assert.equal(cache.encoding, 'shared-plans-v1');
    assert.equal(cache.plans.length, GENERATION_CACHE_LIMIT);
    assert.deepEqual(generationContextEntries(cache).map(item => item.inputKey), Array.from({ length: 12 }, (_, index) => `turn-${index + 3}`));
    cache = rememberGenerationContext(cache, packet('turn-14'));
    assert.equal(cache.plans.length, GENERATION_CACHE_LIMIT);
    assert.equal(generationContextEntries(cache).at(-1).plannerState.campaignPreparation.storageFixture.unique, undefined);
    assert.equal(generationContextEntries(cache).length, GENERATION_CACHE_LIMIT);
});

test('packing remains optional and keeps legacy, singleton, unknown and small caches compatible', () => {
    const legacy = { version: 1, inputKey: 'legacy', selection: {}, payload: '<plot-anchor>Legacy</plot-anchor>',
        plannerState: { plannerContract: 14, campaignPreparation: { archive: [{ retained: true }] } } };
    const cache = { version: 1, entries: [legacy] };
    assert.equal(compactGenerationContextCache(cache), cache);
    assert.equal(compactGenerationContextCache(legacy), legacy);
    assert.deepEqual(generationContextEntries(legacy), [legacy]);
    assert.deepEqual(generationContextEntries(rememberGenerationContext(cache, packet())).map(item => item.inputKey), ['legacy', 'turn-1']);
    const tiny = { version: 1, entries: [{ version: 1, selection: {}, payload: '',
        plannerState: { plannerContract: 15, campaignPreparation: { tiny: true } } }] };
    assert.equal(compactGenerationContextCache(tiny), tiny, 'do not grow small caches');
    const inline = packet();
    inline.plannerState.campaignPreparation.storageFixture = { $taleFairyPlan: 0 };
    assert.deepEqual(generationContextEntries({ entries: [inline] }), [inline], 'no decoding without the envelope');
    for (const invalid of [[], 'not a plan', 0]) {
        const malformed = { version: 1, entries: [packet()] };
        malformed.entries[0].selection.campaignPreparation = invalid;
        assert.equal(compactGenerationContextCache(malformed), malformed, 'keep malformed inline plans inspectable');
    }
    assert.deepEqual(generationContextEntries(null), []);
});

test('unknown formats and damaged references are withheld and never silently rewritten', () => {
    const packed = compactGenerationContextCache({ version: 1, entries: [packet(), packet('turn-2')] });
    for (const damage of [
        value => { value.encoding = 'shared-plans-v99'; },
        value => { value.version = 99; },
        value => { delete value.plans; },
        value => { value.entries[0].plannerState.campaignPreparation.$taleFairyPlan = -1; },
        value => { value.entries[0].plannerState.campaignPreparation.$taleFairyPlan = 0.5; },
        value => { value.entries[0].plannerState.campaignPreparation.$taleFairyPlan = 100; },
        value => { value.entries[0].selection.campaignPreparation.extra = true; },
        value => { value.entries[0].selection.campaignPreparation = []; },
        value => { value.entries[0].selection.campaignPreparation = 'not a reference'; },
        value => { value.entries[0].plannerState.campaignPreparation = 0; },
        value => { value.plans[0] = null; },
    ]) {
        const damaged = structuredClone(packed);
        damage(damaged);
        const before = JSON.stringify(damaged);
        assert.ok(generationContextEntries(damaged).length < 2);
        assert.equal(compactGenerationContextCache(damaged), damaged);
        assert.throws(() => rememberGenerationContext(damaged, packet('new')), /saved retries were not overwritten/);
        assert.equal(JSON.stringify(damaged), before);
    }
    const tampered = structuredClone(packed);
    tampered.plans[0].developments[0].progression = 'Invented replacement';
    assert.equal(generationContextEntries(tampered).length, 0, 'table decoding cannot bypass payload authentication');
    const changedPayload = structuredClone(packed);
    changedPayload.entries[0].payload += 'Invented guidance';
    assert.equal(generationContextEntries(changedPayload).length, 1);
});

test('budget-key migration updates shared plans without changing archived payload bytes or unrelated retries', () => {
    const messages = [{ is_user: true, mes: 'Continue' }];
    const inputs = { worldSettings: { world_info_budget: 20, world_info_budget_cap: 0, world_info_depth: 2 }, author: 'Follow the music.' };
    const next = packet(legacyPlotInputKey('story', messages, inputs));
    next.selection.inputKey = next.inputKey;
    next.plannerState.campaignPreparation.source.referenceHash = legacyPlotInputKey('story', [], inputs);
    const other = packet('older-source');
    const cache = compactGenerationContextCache({ version: 1, entries: [next, other] });
    const metadata = { livingWorldGuide: next.plannerState, [GENERATION_CONTEXT_KEY]: cache, unrelated: { retained: true } };
    const before = JSON.stringify(metadata);
    freeze(metadata);
    const migrated = migrateCampaignBudgetKeys(metadata, { chatId: 'story', messages, inputs });
    const entries = generationContextEntries(migrated[GENERATION_CONTEXT_KEY]);
    assert.equal(entries[0].inputKey, plotInputKey('story', messages, inputs));
    assert.equal(entries[0].selection.inputKey, entries[0].inputKey);
    assert.equal(entries[0].plannerState.campaignPreparation.source.referenceHash, plotInputKey('story', [], inputs));
    assert.equal(entries[0].selection.campaignPreparation.source.referenceHash, plotInputKey('story', [], inputs));
    assert.equal(entries[0].payload, next.payload);
    assert.deepEqual(entries[1], other);
    assert.equal(migrated[GENERATION_CONTEXT_KEY].encoding, 'shared-plans-v1');
    assert.equal(JSON.stringify(metadata), before);
    assert.equal(migrateCampaignBudgetKeys(migrated, { chatId: 'story', messages, inputs }), migrated);
});
