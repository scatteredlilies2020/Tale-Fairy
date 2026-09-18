import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, defaultPlannerState, loadState, loadPlannerState, saveState, clearState, STATE_KEY } from '../extension/state.js';

test('new and reset chats default to single-pass planning without storage side effects', () => {
    const metadata = { unrelated: { value: 1 } };
    const before = structuredClone(metadata);
    assert.equal(loadPlannerState(metadata).plannerContract, 15);
    assert.equal(defaultPlannerState().plannerContract, 15);
    assert.equal(loadPlannerState(metadata).legacyPreparedWorld, null);
    assert.deepEqual(metadata, before);
    const reset = clearState(saveState(metadata, defaultPlannerState()));
    assert.equal(loadPlannerState(reset).plannerContract, 15);
    assert.deepEqual(reset, metadata);
});

test('automatic planner migration preserves normalized notebook, notes and legacy memory across saves', () => {
    for (const plannerContract of [0, 14]) {
        const legacy = { ...defaultState(), plannerContract, canonBootstrapPending: true,
            contextLedger: 'Accepted historical context.',
            userNotes: [{ kind: 'forbid', text: 'No forced public solo.', at: 1 }] };
        legacy.preparedWorld.approach = 'Old creative notebook.';
        const metadata = saveState({ unrelated: 'keep' }, legacy);
        const before = structuredClone(metadata), stored = loadState(metadata);
        const migrated = loadPlannerState(metadata);
        assert.equal(migrated.plannerContract, 15);
        assert.equal(migrated.canonBootstrapPending, false);
        assert.deepEqual(migrated.legacyPreparedWorld, stored.preparedWorld);
        assert.deepEqual(migrated.preparedWorld, stored.preparedWorld);
        assert.deepEqual(migrated.userNotes, stored.userNotes);
        assert.equal(migrated.contextLedger, stored.contextLedger);
        assert.equal(migrated.campaignPreparation, null, 'legacy proposals are not relabeled as event plans');
        assert.deepEqual(metadata, before, 'reading alone never writes metadata');
        const saved = saveState(metadata, migrated);
        assert.equal(saved.unrelated, 'keep');
        assert.deepEqual(loadPlannerState(JSON.parse(JSON.stringify(saved))), migrated, 'migration is idempotent after reload');
    }
});

test('existing event plans and earlier notebook backups are never overwritten by migration', () => {
    const legacy = defaultState();
    legacy.legacyPreparedWorld = { ...legacy.preparedWorld, approach: 'Earlier backup.' };
    legacy.preparedWorld.approach = 'Latest legacy notebook.';
    const migrated = loadPlannerState(saveState({}, legacy));
    assert.equal(migrated.legacyPreparedWorld.approach, 'Earlier backup.');
    assert.equal(migrated.preparedWorld.approach, 'Latest legacy notebook.');
    migrated.campaignPreparation = { malformed: 'Preserve for inspection, never reset on load.' };
    const metadata = saveState({}, migrated);
    assert.deepEqual(loadPlannerState(metadata), loadState(metadata));
    assert.equal(metadata[STATE_KEY].plannerContract, 15);
});
