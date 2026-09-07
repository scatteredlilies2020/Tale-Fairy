import assert from 'node:assert/strict';
import test from 'node:test';
import { compactContinuityPrompt, formatPlanningEvidence, readContinuityBridge, waitForContinuityBridge } from '../extension/continuity.js';
import { estimateTokenCount } from '../extension/token-budget.js';

function bridge(snapshot) {
    return { version: 1, getContextSnapshot: () => snapshot };
}

test('Continuity bridge accepts current snapshots and explicitly allowed same-chat stale snapshots', () => {
    const context = { chatId: 'chat-1' };
    assert.deepEqual(readContinuityBridge(context, bridge({ chatId: 'chat-1', status: 'current', prompt: 'current memory' })), {
        text: 'current memory', status: 'current',
    });
    assert.deepEqual(readContinuityBridge(context, bridge({ chatId: 'chat-1', status: 'stale', prompt: 'prior-turn memory' })), {
        text: '', status: 'stale',
    });
    assert.deepEqual(readContinuityBridge(context, bridge({ chatId: 'chat-1', status: 'stale', prompt: 'prior-turn memory' }), { allowStale: true }), {
        text: 'prior-turn memory', status: 'stale',
    });
});

test('Continuity bridge never consumes a snapshot from another chat', () => {
    assert.deepEqual(readContinuityBridge({ chatId: 'chat-2' }, bridge({
        chatId: 'chat-1', status: 'current', prompt: 'wrong chat',
    })), { text: '', status: 'stale' });
});

test('v2 structured evidence is preferred while the v1 prompt remains a fallback', () => {
    const v2 = {
        version: 2,
        getContextSnapshot: () => ({
            version: 2, chatId: 'chat-1', revision: 9, status: 'current', prompt: 'legacy prompt must not win',
            coverage: { throughMessageIndex: 14, signature: 'sig-14' },
            planningEvidence: [{
                id: 'thread-1', cmRevision: 9, category: 'threads', canonicalStatus: 'open', importance: 5,
                text: 'La carta sigue sin respuesta.', participants: ['Mara'], sourceRange: { from: 4, to: 8 },
                retrievalReason: 'important open canonical thread',
            }],
        }),
    };
    const result = readContinuityBridge({ chatId: 'chat-1' }, v2);
    assert.match(result.text, /La carta sigue sin respuesta/);
    assert.doesNotMatch(result.text, /legacy prompt must not win/);
    assert.equal(result.version, 2);
    assert.equal(result.revision, 9);
    assert.equal(result.messageSignature, 'sig-14');
    assert.equal(result.coverageThrough, 14);
    assert.equal(result.planningEvidence[0].id, 'thread-1');
});

test('semantic evidence budgeting retains multilingual unresolved threads under severe compaction', () => {
    const items = [{
        id: 'zh-thread', cmRevision: 7, category: 'threads', canonicalStatus: 'open', importance: 5,
        text: '尚未兑现的承诺：黎明前归还钥匙。', sourceRange: { from: 2, to: 3 }, retrievalReason: 'important open canonical thread',
    }, ...Array.from({ length: 80 }, (_, index) => ({
        id: `background-${index}`, cmRevision: 7, category: 'backgrounds', canonicalStatus: 'current', importance: 1,
        text: `背景资料 ${index} ${'细节'.repeat(50)}`, sourceRange: { from: index, to: index }, retrievalReason: 'current canonical record',
    }))];
    const compacted = formatPlanningEvidence(items, 500);
    assert.ok(estimateTokenCount(compacted) <= 500);
    assert.match(compacted, /尚未兑现的承诺/);
    assert.match(compacted, /IMPORTANT\/DUE OPEN THREADS/);
});

test('Continuity absence fails open and reading never invokes mutation or retrieval APIs', () => {
    assert.equal(readContinuityBridge({ chatId: 'chat-1' }, undefined), null);
    let writes = 0;
    const safeBridge = {
        version: 2,
        getContextSnapshot: () => ({ version: 2, chatId: 'chat-1', status: 'current', prompt: 'snapshot', planningEvidence: [] }),
        publish: () => { writes++; },
        retrieve: () => { writes++; },
        mutate: () => { writes++; },
    };
    assert.equal(readContinuityBridge({ chatId: 'chat-1' }, safeBridge).text, 'snapshot');
    assert.equal(writes, 0);
});

test('Continuity startup wait observes a bridge published after Tale Fairy loads', async () => {
    let reads = 0;
    let clock = 0;
    const result = await waitForContinuityBridge({ chatId: 'chat-1' }, () => {
        reads++;
        return reads < 3 ? undefined : bridge({ chatId: 'chat-1', status: 'current', prompt: 'late memory' });
    }, {
        timeoutMs: 100,
        intervalMs: 10,
        sleep: async ms => { clock += ms; },
        now: () => clock,
    });
    assert.deepEqual(result, { text: 'late memory', status: 'current' });
    assert.equal(reads, 3);
});

test('Continuity startup wait times out without consuming another chat', async () => {
    let clock = 0;
    const result = await waitForContinuityBridge({ chatId: 'chat-2' }, () => bridge({
        chatId: 'chat-1', status: 'current', prompt: 'wrong chat',
    }), {
        timeoutMs: 25,
        intervalMs: 10,
        sleep: async ms => { clock += ms; },
        now: () => clock,
    });
    assert.deepEqual(result, { text: '', status: 'stale' });
});

test('Continuity compaction preserves retrieved records and the trailing Chronicle', () => {
    const prompt = `<continuity>\nCheckpoint:\n${'present fact '.repeat(220)}\nFacts:\n${'retrieved fact '.repeat(220)}\nRecursive Chronicle layers (complete active frontier):\n${'chronicle fact '.repeat(260)}\n</continuity>`;
    const compacted = compactContinuityPrompt(prompt, 800);
    assert.ok(estimateTokenCount(compacted) <= 800);
    assert.match(compacted, /Checkpoint:/);
    assert.match(compacted, /chronicle fact/);
    assert.match(compacted, /continuity context compacted/);
    assert.doesNotMatch(compacted, /<\/?continuity>/);
});

test('Continuity compaction preserves unresolved route records from the omitted middle', () => {
    const prompt = `Checkpoint:\n${'current scene '.repeat(180)}\nFacts:\n${'older detail '.repeat(100)}\nThe filed letter to the Chancellor remains pending with the aide office and has not received an answer.\n${'other record '.repeat(170)}\nRecursive Chronicle:\n${'chronicle '.repeat(220)}`;
    const compacted = compactContinuityPrompt(prompt, 700);
    assert.ok(estimateTokenCount(compacted) <= 700);
    assert.match(compacted, /letter to the Chancellor remains pending/);
    assert.match(compacted, /Open-route records retained from omitted middle/);
    assert.match(compacted, /Recursive Chronicle/);
});
