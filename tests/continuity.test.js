import assert from 'node:assert/strict';
import test from 'node:test';
import { compactContinuityPrompt, readContinuityBridge, waitForContinuityBridge } from '../extension/continuity.js';

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
    const compacted = compactContinuityPrompt(prompt, 1800);
    assert.ok(compacted.length <= 1800);
    assert.match(compacted, /Checkpoint:/);
    assert.match(compacted, /chronicle fact/);
    assert.match(compacted, /continuity context compacted/);
    assert.doesNotMatch(compacted, /<\/?continuity>/);
});

test('Continuity compaction preserves unresolved route records from the omitted middle', () => {
    const prompt = `Checkpoint:\n${'current scene '.repeat(180)}\nFacts:\n${'older detail '.repeat(100)}\nThe filed letter to the Chancellor remains pending with the aide office and has not received an answer.\n${'other record '.repeat(170)}\nRecursive Chronicle:\n${'chronicle '.repeat(220)}`;
    const compacted = compactContinuityPrompt(prompt, 1800);
    assert.ok(compacted.length <= 1800);
    assert.match(compacted, /letter to the Chancellor remains pending/);
    assert.match(compacted, /Open-route records retained from omitted middle/);
    assert.match(compacted, /Recursive Chronicle/);
});
