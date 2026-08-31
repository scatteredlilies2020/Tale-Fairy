import assert from 'node:assert/strict';
import test from 'node:test';
import { clearPlannerPending, markPlannerPending, plannerWasInterrupted, waitForPlannerHandoff } from '../extension/planner-lifecycle.js';

test('a replacement waits until the cancelled local planner has settled', async () => {
    let settlePrevious;
    const previous = new Promise(resolve => { settlePrevious = resolve; });
    let handedOff = false;
    const handoff = waitForPlannerHandoff(previous).then(() => { handedOff = true; });
    await Promise.resolve();
    assert.equal(handedOff, false);
    settlePrevious();
    await handoff;
    assert.equal(handedOff, true);
});

test('a failed prior planner still releases the local handoff', async () => {
    await assert.doesNotReject(waitForPlannerHandoff(Promise.reject(new Error('cancelled'))));
});

test('a replacement stopped during handoff never starts afterward', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('page shutting down', 'AbortError'));
    await assert.rejects(waitForPlannerHandoff(Promise.resolve(), controller.signal), { name: 'AbortError' });
});

test('an interrupted page records no chat content and resumes the matching analysis', () => {
    const values = new Map();
    const storage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key),
    };
    markPlannerPending(storage, 'chat one', 'fingerprint-1');
    assert.equal(values.size, 1);
    assert.doesNotMatch([...values.values()][0], /message text|secret/i);
    assert.equal(plannerWasInterrupted(storage, 'chat one', 'fingerprint-1'), true);
    clearPlannerPending(storage, 'chat one');
    assert.equal(plannerWasInterrupted(storage, 'chat one', 'fingerprint-1'), false);
});

test('a marker for an older chat snapshot is discarded rather than resumed', () => {
    const values = new Map();
    const storage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key),
    };
    markPlannerPending(storage, 'chat', 'old-fingerprint');
    assert.equal(plannerWasInterrupted(storage, 'chat', 'new-fingerprint'), false);
    assert.equal(values.size, 0);
});
