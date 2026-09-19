import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CampaignRuntime } from '../extension/campaign-runtime.js';
import { campaignUsable, emptyCampaign } from '../extension/campaign-planner.js';

const fingerprint = JSON.stringify;
const output = { campaign: 'Open travel', episode: { subject: 'Errand', status: 'finished', boundary: 'A finished errand can stay finished' }, developments: [], retire: [] };
function fixture({ prepare, generate, commit } = {}) {
    let current = { chatId: 'a', referenceHash: 'ref', messages: ['opening'], state: emptyCampaign() }, calls = 0;
    const runtime = new CampaignRuntime({ fingerprint, read: () => current,
        prepare: prepare || (() => ({ prompt: '{}', indices: [0] })),
        generate: async (...args) => { calls++; return generate ? generate(...args) : { text: JSON.stringify(output), finishReason: 'stop' }; },
        commit: commit || ((state, guard) => {
            if (fingerprint(current.state) !== guard.stateFingerprint
                || !campaignUsable(state, { ...current, fingerprint })) return false;
            current = { ...current, state }; return true;
        }),
    });
    return { runtime, read: () => current, change: fn => { current = fn(current); }, calls: () => calls };
}
function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

test('duplicate triggers share one in-flight pass; multiple appended turns remain usable', async () => {
    const gate = deferred(), f = fixture({ generate: () => gate.promise });
    const a = f.runtime.request(), b = f.runtime.request();
    assert.equal(a, b); await Promise.resolve(); assert.equal(f.calls(), 1);
    f.change(c => ({ ...c, messages: [...c.messages, 'user', 'assistant', 'another user'] }));
    assert.equal(f.runtime.request(), a);
    gate.resolve({ text: JSON.stringify(output), finishReason: 'stop' });
    assert.equal((await a).accepted, true); assert.equal(f.calls(), 1);
    assert.equal(f.read().state.source.messageCount, 1);
    assert.equal(campaignUsable(f.read().state, { ...f.read(), fingerprint }), true);
    assert.equal(f.runtime.payload(), '', 'a valid empty selection adds no instruction-only packet');
});

test('edits, reference changes and chat switches cannot install or inject stale preparation', async () => {
    for (const patch of [{ messages: ['edited'] }, { referenceHash: 'new' }, { chatId: 'b' }]) {
        const gate = deferred(), f = fixture({ generate: () => gate.promise });
        const running = f.runtime.request(); await Promise.resolve();
        f.change(c => ({ ...c, ...patch })); gate.resolve({ text: JSON.stringify(output), finishReason: 'stop' });
        assert.equal((await running).accepted, false); assert.equal(f.calls(), 1);
        assert.equal(f.read().state.revision, 0); assert.equal(f.runtime.payload(), '');
    }
});

test('immutable state replacement at the same revision is protected, including after provider failure', async () => {
    for (const text of [JSON.stringify(output), '{']) {
        const gate = deferred(), f = fixture({ generate: () => gate.promise });
        const running = f.runtime.request(); await Promise.resolve();
        f.change(c => ({ ...c, state: { ...c.state, campaign: 'A newer manual design' } }));
        const replacement = f.read().state;
        gate.resolve({ text, finishReason: 'stop' });
        const result = await running;
        assert.equal(result.accepted, false); assert.equal(result.state, replacement);
        assert.equal(f.read().state, replacement);
    }
});

test('failure does not automatically retry unchanged input; explicit manual and changed-source passes are distinct', async () => {
    const f = fixture({ generate: () => { throw Error('transport'); } });
    assert.equal((await f.runtime.request()).accepted, false);
    assert.equal((await f.runtime.request()).skipped, 'already-attempted'); assert.equal(f.calls(), 1);
    await f.runtime.request({ manual: true }); assert.equal(f.calls(), 2);
    f.change(c => ({ ...c, messages: [...c.messages, 'new accepted turn'] }));
    await f.runtime.request(); assert.equal(f.calls(), 3);
    await f.runtime.request(); assert.equal(f.calls(), 3);
});

test('an already-reviewed unchanged source is not called again after its state revision increases', async () => {
    const f = fixture(); assert.equal((await f.runtime.request()).accepted, true);
    assert.equal((await f.runtime.request()).skipped, 'already-attempted'); assert.equal(f.calls(), 1);
    f.change(c => ({ ...c, referenceHash: 'changed' })); assert.equal(f.runtime.payload(), '');
});

test('source changes during input preparation spend no model call; commit conflicts do not report success', async () => {
    const gate = deferred(), f = fixture({ prepare: () => gate.promise });
    const running = f.runtime.request();
    f.change(c => ({ ...c, messages: ['swiped'] })); gate.resolve({ prompt: '{}', indices: [0] });
    assert.equal((await running).skipped, 'source-changed-before-request'); assert.equal(f.calls(), 0);
    const conflict = fixture({ commit: () => false });
    assert.equal((await conflict.runtime.request()).skipped, 'commit-conflict');
    assert.equal(conflict.calls(), 1); assert.equal(conflict.read().state.revision, 0);
});
