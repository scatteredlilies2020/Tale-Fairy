import test from 'node:test';
import assert from 'node:assert/strict';
import { createContinuityAvailabilityMonitor } from '../extension/continuity-availability.js';

test('late bridge loading and cached publications repaint without model work', () => {
    let changes = 0;
    const state = { chatId: 'a', enabled: true };
    const refresh = createContinuityAvailabilityMonitor({ read: () => state, onChange: () => changes++ });
    refresh(); refresh();
    assert.equal(changes, 1);
    const snapshot = { chatId: 'a', status: 'stale', revision: 1 };
    state.bridge = { version: 2, getContextSnapshot: () => snapshot };
    refresh();
    snapshot.status = 'current'; snapshot.revision++;
    refresh(); refresh();
    assert.equal(changes, 3, 'ready memory must replace the startup stale display');
    snapshot.status = 'unavailable'; refresh();
    state.chatId = 'b'; refresh();
    state.enabled = false; refresh();
    assert.equal(changes, 6);
});

test('bridge read failures do not stop polling and can recover', () => {
    let broken = true, changes = 0;
    const refresh = createContinuityAvailabilityMonitor({ read: () => {
        if (broken) throw Error('not ready');
        return { chatId: 'a', enabled: true, bridge: { version: 2,
            getContextSnapshot: () => ({ chatId: 'a', status: 'current', revision: 1 }) } };
    }, onChange: () => changes++ });
    refresh(); refresh(); broken = false; refresh();
    assert.equal(changes, 2);
});
