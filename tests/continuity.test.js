import assert from 'node:assert/strict';
import test from 'node:test';
import { compactContinuityPrompt, readContinuityBridge } from '../extension/continuity.js';

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

test('Continuity compaction preserves retrieved records and the trailing Chronicle', () => {
    const prompt = `<continuity>\nCheckpoint:\n${'present fact '.repeat(220)}\nFacts:\n${'retrieved fact '.repeat(220)}\nRecursive Chronicle layers (complete active frontier):\n${'chronicle fact '.repeat(260)}\n</continuity>`;
    const compacted = compactContinuityPrompt(prompt, 1800);
    assert.ok(compacted.length <= 1800);
    assert.match(compacted, /Checkpoint:/);
    assert.match(compacted, /chronicle fact/);
    assert.match(compacted, /continuity context compacted/);
    assert.doesNotMatch(compacted, /<\/?continuity>/);
});
