import assert from 'node:assert/strict';
import test from 'node:test';

import { exceedsAppendAllowance, mergePlannerIntents } from '../extension/planner-coalescer.js';

test('latest planner intent coalesces without losing rebuild or note semantics', () => {
    const merged = mergePlannerIntents(
        { chatId: 'chat-a', note: 'Keep this correction.', rebuild: true, waitForContinuity: true },
        { chatId: 'chat-a', allowStaleContinuity: true },
    );
    assert.deepEqual(merged, {
        chatId: 'chat-a',
        note: 'Keep this correction.',
        rebuild: true,
        waitForContinuity: true,
        allowStaleContinuity: true,
    });
});

test('newest chat and explicit note replace older scalar intent values', () => {
    const merged = mergePlannerIntents(
        { chatId: 'chat-a', note: 'Old note.', rebuild: true, waitForContinuity: true },
        { chatId: 'chat-b', note: 'Newest note.' },
    );
    assert.equal(merged.chatId, 'chat-b');
    assert.equal(merged.note, 'Newest note.');
    assert.equal(merged.rebuild, false);
    assert.equal(merged.waitForContinuity, false);
});

test('one appended user message is allowed but additional rapid messages queue catch-up', () => {
    assert.equal(exceedsAppendAllowance(10, 10), false);
    assert.equal(exceedsAppendAllowance(10, 11), false);
    assert.equal(exceedsAppendAllowance(10, 12), true);
});
