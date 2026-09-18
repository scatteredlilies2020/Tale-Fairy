import test from 'node:test';
import assert from 'node:assert/strict';
import { readCampaignContinuity, fitCampaignContinuity } from '../extension/campaign-continuity.js';
import { ownedInput, OWNED_SYSTEM, OWNED_SCHEMA } from '../extension/event-planning.js';
import { emptyCampaign } from '../extension/campaign-planner.js';
import { estimateTokenCount } from '../extension/token-budget.js';

const context = { getCurrentChatId: () => 'story', chat: [{ mes: 'Opening' }, { mes: 'Latest' }] };
const record = { id: 'thread-1', text: 'Jo might perform the duet only if Neri accepts.', category: 'threads',
    canonicalStatus: 'pending', cmRevision: 7, importance: 4, participants: ['Jo'],
    sourceRange: { chatKey: 'character:1:chat:story', from: 0, to: 0 }, temporalAnchor: 'day-one', retrievalReason: 'current canonical record' };
const snapshot = () => ({ chatId: 'story', status: 'current', revision: 8,
    prompt: 'The old booking ended. Neri declined a new booking.',
    coverage: { throughMessageIndex: 0, signature: 'abc123' }, planningEvidence: [structuredClone(record)] });
const bridge = value => ({ version: 2, getContextSnapshot: () => value });
const read = (value = snapshot(), options = {}) => readCampaignContinuity(context, bridge(value), options);

test('CM v2 retains full recall, provenance, status and coverage without mutating the publisher', () => {
    const original = snapshot(), before = structuredClone(original);
    const memory = read(original);
    assert.equal(memory.status, 'current');
    assert.equal(memory.summary, original.prompt);
    assert.deepEqual(memory.records[0], record);
    memory.records[0].participants.push('Someone else');
    assert.deepEqual(original, before);
    assert.equal(memory.coverage.throughMessageIndex, 0, 'current retrieval may legitimately lag the newest accepted turns');
});

test('disabled and replacement paths do not even read the bridge', () => {
    const bad = { version: 2, getContextSnapshot() { throw Error('must not read'); } };
    assert.equal(readCampaignContinuity(context, bad, { enabled: false }).status, 'off');
    assert.equal(readCampaignContinuity(context, bad, { replacement: true }).status, 'replacement');
});

test('absent, throwing, unsupported, stale, unknown-chat and cross-chat snapshots fail closed', () => {
    for (const bad of [null, { version: 3 }, { version: 2, getContextSnapshot() { throw Error('offline'); } }]) {
        assert.equal(readCampaignContinuity(context, bad).status, 'unavailable');
    }
    for (const patch of [{ status: 'stale' }, { chatId: 'other' }, { chatId: '' }, { status: 'unavailable' }]) {
        assert.notEqual(read({ ...snapshot(), ...patch }).status, 'current');
    }
    for (const coverage of [undefined, { throughMessageIndex: 99, signature: 'x' },
        { throughMessageIndex: null, signature: 'x' }, { throughMessageIndex: 0, signature: '' }]) {
        assert.equal(read({ ...snapshot(), coverage }).status, 'unavailable');
    }
});

test('legacy v1 is readable only with explicit current same-chat identity', () => {
    const legacy = { version: 1, getContextSnapshot: () => ({ chatId: 'story', status: 'current', prompt: 'Earlier events.' }) };
    assert.equal(readCampaignContinuity(context, legacy).summary, 'Earlier events.');
});

test('observed current recall survives only verified appends, never an unseen stale snapshot or changed prefix', () => {
    const chat = { ...context, chat: structuredClone(context.chat) };
    const published = snapshot(), api = bridge(published);
    readCampaignContinuity(chat, api);
    chat.chat.push({ mes: 'New reply' });
    published.status = 'stale';
    const appended = readCampaignContinuity(chat, api);
    assert.equal(appended.status, 'current');
    assert.equal(appended.freshness, 'verified-accepted-prefix');
    assert.equal(appended.summary, published.prompt);
    assert.equal(readCampaignContinuity(chat, bridge(published)).status, 'stale', 'a new session has no source proof');
    chat.chat[0].mes = 'Edited earlier reply';
    assert.equal(readCampaignContinuity(chat, api).status, 'stale');
    published.status = 'current';
    assert.equal(readCampaignContinuity(chat, api).status, 'stale', 'CM tail signature cannot legitimize an observed older edit');
    published.status = 'stale';
    chat.chat[0].mes = context.chat[0].mes;
    chat.characterId = 'other-character';
    assert.equal(readCampaignContinuity(chat, api).status, 'stale');
    delete chat.characterId;
    published.revision++;
    assert.equal(readCampaignContinuity(chat, api).status, 'stale', 'unobserved new publication has no proof');
    published.revision--;
    chat.chat.pop();
    assert.equal(readCampaignContinuity(chat, api).status, 'stale', 'a stale snapshot with no append has an unexplained mismatch');
});

test('bounded recall drops oversized items whole and discloses omissions', () => {
    const memory = read();
    memory.summary = 'Long chronicle. '.repeat(2000);
    memory.records.unshift({ id: 'oversized', text: 'Long record. '.repeat(1000) });
    const packed = fitCampaignContinuity(memory, 400, () => true);
    assert.equal(packed.summary, '');
    assert.equal(packed.omittedSummary, true);
    assert.equal(packed.omittedRecords, 1);
    assert.deepEqual(packed.records, [record]);
    assert.ok(estimateTokenCount(JSON.stringify(packed)) <= 400);
    assert.equal(fitCampaignContinuity(memory, 0, () => true), null);
    assert.equal(fitCampaignContinuity(memory, 400, () => false), null);
});

test('whole Chronicle is preserved when it fits and records retain their full conditions', () => {
    const memory = read();
    const packed = fitCampaignContinuity(memory, 4000, () => true);
    assert.equal(packed.summary, memory.summary);
    assert.deepEqual(packed.records, [record]);
    assert.equal(packed.omittedRecords, 0);
    assert.equal(packed.omittedSummary, false);
});

test('owned input includes private recall within both budgets without sacrificing source', () => {
    const args = { state: emptyCampaign(), reference: { authorInstructions: 'Do not revive the old booking.' },
        messages: [{ index: 0, role: 'user', content: 'We are no longer booking shows.' }] };
    const original = ownedInput(args);
    const withMemory = ownedInput({ ...args, continuity: read() }, original.inputTokens + 1000);
    const input = JSON.parse(withMemory.prompt);
    assert.equal(withMemory.continuity.status, 'included');
    assert.equal(input.continuity_memory.records[0].id, record.id);
    assert.deepEqual(input.accepted_messages, JSON.parse(original.prompt).accepted_messages);
    assert.deepEqual(input.source_reference, args.reference);
    assert.equal(withMemory.inputTokens, estimateTokenCount(OWNED_SYSTEM + JSON.stringify(OWNED_SCHEMA) + withMemory.prompt));
    assert.ok(withMemory.inputTokens <= original.inputTokens + 1000);
    const tight = ownedInput({ ...args, continuity: read() }, original.inputTokens);
    assert.equal(tight.prompt, original.prompt);
    assert.equal(tight.continuity.status, 'omitted-budget-or-empty');
    assert.throws(() => ownedInput({ ...args, continuity: read() }, original.inputTokens - 1), /exceeds/);
});
