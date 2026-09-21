import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { readEvidenceProviders, fitEvidenceProviders, registerEvidenceProvider, evidencePrefix } from '../extension/evidence-providers.js';
import { ownedInput } from '../extension/event-planning.js';
import { emptyCampaign } from '../extension/campaign-planner.js';
const context = () => ({ getCurrentChatId: () => 'test', characterId: 3, chat: [{ mes: 'The booking was declined.', is_user: true }] });
const snapshot = c => ({ chatId: 'test', owner: 'character:3', status: 'current', revision: 1,
    provenance: 'Explicit test summary source', summary: 'The booking ended.',
    coverage: { messageCount: c.chat.length, sourcePrefix: evidencePrefix(c.chat) },
    records: [{ id: 'booking', text: 'The booking was declined.', sourceRange: { from: 0, to: 0 }, canonicalStatus: 'closed' }] });
const read = (c, value) => readEvidenceProviders(c, { continuityEnabled: false, adapters: [{ id: 'fixture-summary', version: 1, read: () => value }] });

test('browser reader uses the same registry as the documented public registration URL', async () => {
    const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
    const path = source.match(/import \{ readEvidenceProviders, evidenceRevisionKey \} from '([^']+)'/)[1];
    const browserApi = await import(new URL(path, new URL('../extension/index.js', import.meta.url)));
    const c = context();
    const unregister = registerEvidenceProvider({ id: 'public-registration', version: 1, read: () => snapshot(c) });
    try {
        assert.ok(browserApi.readEvidenceProviders(c, { continuityEnabled: false }).some(item => item.provider === 'public-registration'));
    } finally { unregister(); }
});

test('standalone TF is usable with no memory extension, and disabled or replacement paths never read providers', () => {
    assert.equal(readEvidenceProviders(context())[0].status, 'unavailable');
    const state = emptyCampaign();
    assert.ok(ownedInput({ reference: {}, state, messages: [], evidence: [] }).prompt);
    const bad = { version: 1, id: 'bad', read() { assert.fail('must not read'); } };
    assert.deepEqual(readEvidenceProviders(context(), { enabled: false, adapters: [bad] }), []);
    assert.deepEqual(readEvidenceProviders(context(), { replacement: true, adapters: [bad] }), []);
});

test('registered provider is read by the production boundary, keeps identity/provenance and cannot receive mutable ST settings', () => {
    const c = context(), raw = snapshot(c), before = structuredClone(raw);
    const unregister = registerEvidenceProvider({ id: 'fixture-summary', version: 1, read(identity) {
        assert.equal(Object.isFrozen(identity), true);
        assert.deepEqual(Object.keys(identity).sort(), ['chatId', 'owner']);
        return raw;
    } });
    try {
        const got = readEvidenceProviders(c, { continuityEnabled: false });
        assert.equal(got[0].confidence, 'source-verified');
        assert.equal(got[0].provider, 'fixture-summary');
        got[0].records[0].text = 'mutated';
        assert.deepEqual(raw, before);
    } finally { unregister(); }
    assert.deepEqual(readEvidenceProviders(c, { continuityEnabled: false }), []);
});

test('generic coverage accepts appends but rejects edits, swipes, deletion, chat switches and character switches', () => {
    const c = context(), raw = snapshot(c);
    c.chat.push({ mes: 'A new exchange.' });
    assert.equal(read(c, raw)[0].status, 'current');
    c.chat[0].mes = 'Different swipe or edit.';
    assert.equal(read(c, raw)[0].status, 'stale');
    c.chat = [];
    assert.notEqual(read(c, raw)[0].status, 'current');
    c.getCurrentChatId = () => 'other';
    assert.equal(read(c, raw)[0].status, 'stale');
    const other = context(); other.characterId = 4;
    assert.equal(read(other, raw)[0].status, 'stale');
});

test('older summaries lacking strong coverage are explicitly lower confidence, never verified current state', () => {
    const c = context(), raw = snapshot(c); delete raw.coverage;
    const got = read(c, raw);
    assert.equal(got[0].status, 'context');
    assert.equal(got[0].confidence, 'lower-confidence-context');
    const packed = fitEvidenceProviders(got, 1000, () => true);
    assert.equal(packed[0].freshness, 'unknown');
    assert.equal(packed[0].confidence, 'lower-confidence-context');
});

test('conflicting sources remain separately attributed; oversize records drop whole under one shared budget', () => {
    const c = context();
    const a = read(c, snapshot(c))[0];
    const b = { ...a, provider: 'another-source', summary: 'The booking is still open.', records: [{ id: 'huge', text: 'Long memory. '.repeat(6000) }] };
    const before = structuredClone([a, b]);
    const packed = fitEvidenceProviders([a, b], 1200, () => true);
    assert.equal(packed.length, 2);
    assert.equal(packed[1].summary, b.summary);
    assert.equal(packed[1].omittedRecords, 1);
    assert.deepEqual([a, b], before);
    const input = JSON.parse(ownedInput({ state: emptyCampaign(), reference: {}, messages: [], evidence: [a, b], continuityTokens: 1200 }).prompt);
    assert.equal(input.external_evidence.length, 2);
    assert.ok(!input.continuity_memory, 'no duplicate CM-specific block');
});

test('throwing, asynchronous and stale adapters remain optional without retries or writes', () => {
    let calls = 0;
    const bad = { id: 'bad', version: 1, read() { calls++; throw Error('offline'); }, write() { assert.fail('no writes'); } };
    assert.equal(readEvidenceProviders(context(), { continuityEnabled: false, adapters: [bad] })[0].status, 'unavailable');
    assert.equal(calls, 1);
    const c = context(), raw = snapshot(c); raw.status = 'stale';
    assert.equal(read(c, raw)[0].status, 'stale');
    assert.equal(readEvidenceProviders(c, { continuityEnabled: false, adapters: [{ ...bad, read: async () => raw }] })[0].status, 'unavailable');
});
