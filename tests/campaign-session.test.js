import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignSession } from '../extension/campaign-session.js';
import { emptyCampaign, mergeCampaign } from '../extension/campaign-planner.js';

const output = { campaign: 'Travel and shared work.', episode: { subject: 'Errand', status: 'finished', boundary: 'The errand is done.' }, developments: [] };
const reply = { text: JSON.stringify(output), finishReason: 'stop' };
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(generate = async () => reply) {
    const current = { enabled: true, chatId: 'story', referenceHash: 'reference', state: emptyCampaign(),
        messages: [{ is_user: false, mes: 'Opening.' }], attempt: null };
    let calls = 0, commits = 0;
    const options = { read: () => current, fingerprint: JSON.stringify, interval: () => 3,
        prepare: () => ({ prompt: '{}', indices: [0] }),
        saveAttempt: async value => { current.attempt = value; },
        generate: (...args) => { calls++; return generate(...args); },
        commit: state => { commits++; current.state = state; return true; } };
    return { current, options, session: new CampaignSession(options), calls: () => calls, commits: () => commits };
}

function twoStageFixture(onSend = () => {}, stages = ['horizon', 'scene']) {
    const f = fixture(async () => { onSend(f); return reply; });
    f.current.evidenceKey = 'original';
    f.options.prepare = () => ({ prompt: '{}', indices: [0], evidence: { status: 'included' } });
    f.session = new CampaignSession({ ...f.options, evidenceRestart: true,
        runPass: async ({ state, source, generate }) => {
            for (const stage of stages) await generate('{}', 'system', {}, { stage });
            return { accepted: true, state: mergeCampaign(state, output, { source, basisRevision: state.revision, evidenceIndices: [0] }) };
        } });
    return f;
}

for (const changedAt of ['prepare', 'before-send', 'response']) test(`creative planning completes once when memory changes at ${changedAt}`, async () => {
    const f = fixture(async () => {
        if (changedAt === 'response') f.current.evidenceKey = 'new-memory';
        return reply;
    });
    f.current.evidenceKey = 'original-memory';
    f.options.prepare = () => {
        if (changedAt === 'prepare') f.current.evidenceKey = 'new-memory';
        return { prompt: '{}', indices: [0], evidence: { status: 'included' } };
    };
    f.options.saveAttempt = async value => {
        f.current.attempt = value;
        if (changedAt === 'before-send' && value.requestCount === 1) f.current.evidenceKey = 'new-memory';
    };
    f.session = new CampaignSession({ ...f.options, guardEvidence: false });
    const key = f.session.runtime.key(f.current);
    const result = await f.session.request();
    assert.equal(result.accepted, true, result.error);
    assert.equal(f.calls(), 1);
    assert.equal(f.commits(), 1);
    assert.equal(f.current.attempt.status, 'complete');
    assert.equal(f.current.attempt.evidenceRestarts, undefined);
    assert.equal(f.session.runtime.key(f.current), key);
    assert.equal((await f.session.request()).skipped, 'not-due');
});

test('creative planning still rejects a response for an edited RP', async () => {
    const f = fixture(async () => {
        f.current.evidenceKey = 'new-memory';
        f.current.messages[0].mes = 'A different branch of the RP.';
        return reply;
    });
    f.options.prepare = () => ({ prompt: '{}', indices: [0], evidence: { status: 'included' } });
    f.session = new CampaignSession({ ...f.options, guardEvidence: false });
    assert.equal((await f.session.request()).accepted, false);
    assert.equal(f.calls(), 1);
    assert.equal(f.commits(), 0);
});

test('memory rebase preserves one run key, aggregate request count and the newest snapshot', async () => {
    const keys = [], snapshots = [];
    const f = twoStageFixture(f => {
        keys.push(f.current.attempt.runKey);
        if (f.calls() === 1) f.current.evidenceKey = 'corrected';
    });
    // Capture the provider's source snapshot through the runtime prepare boundary.
    const prepare = f.session.runtime.prepare;
    f.session.runtime.prepare = snapshot => { snapshots.push(snapshot.evidenceKey); return prepare(snapshot); };
    const result = await f.session.request();
    assert.equal(result.accepted, true);
    assert.equal(result.evidenceRestart, true);
    assert.equal(f.calls(), 3);
    assert.equal(f.commits(), 1);
    assert.deepEqual(snapshots, ['original', 'corrected']);
    assert.equal(f.current.attempt.requestCount, 3);
    assert.equal(f.current.attempt.evidenceRestarts, 1);
    assert.equal(keys.length, 3);
    assert.equal(new Set(keys).size, 1);
});

test('continuing memory churn is bounded to one rebase and never commits either stale draft', async () => {
    const f = twoStageFixture(f => { f.current.evidenceKey = `changed-${f.calls()}`; });
    assert.equal((await f.session.request()).accepted, false);
    assert.equal(f.calls(), 2);
    assert.equal(f.commits(), 0);
    assert.equal(f.current.attempt.status, 'failed');
    assert.equal(f.current.attempt.evidenceRestarts, 1);
    assert.equal((await f.session.request()).skipped, 'not-due');
});

for (const stages of [['horizon', 'scene'], ['horizon', 'horizon', 'scene']]) {
    test(`memory changes after two paid requests rebuild and finish ${stages.join('/')}`, async () => {
        const f = twoStageFixture(f => { if (f.calls() === 2) f.current.evidenceKey = 'late-correction'; }, stages);
        const result = await f.session.request();
        assert.equal(result.accepted, true, result.error);
        assert.equal(f.calls(), 2 + stages.length);
        assert.equal(f.commits(), 1);
        assert.equal(f.current.attempt.evidenceRestarts, 1);
        assert.equal(f.current.attempt.requestCount, f.calls());
    });
}

for (const reason of ['transcript', 'references', 'settings', 'chat', 'disabled', 'newer-run', 'saved-plan', 'stop']) {
    test(`memory rebase cannot bypass ${reason} safeguards`, async () => {
        const f = twoStageFixture(f => {
            f.current.evidenceKey = 'corrected';
            if (reason === 'transcript') f.current.messages[0].mes = 'Edited source';
            if (reason === 'references') f.current.referenceHash = 'different';
            if (reason === 'settings') f.current.requestSignature = 'different';
            if (reason === 'chat') f.current.chatId = 'different';
            if (reason === 'disabled') f.current.enabled = false;
            if (reason === 'newer-run') f.current.attempt = { ...f.current.attempt, runKey: 'newer' };
            if (reason === 'saved-plan') f.current.state.revision++;
            if (reason === 'stop') f.session.stop();
        });
        assert.equal((await f.session.request()).accepted, false);
        assert.equal(f.calls(), 1);
        assert.equal(f.commits(), 0);
        assert.equal(f.current.attempt.evidenceRestarts, undefined);
    });
}

test('stage corrections finish without an aggregate request ceiling', async () => {
    const f = fixture();
    const session = new CampaignSession({ ...f.options, runPass: async ({ state, source, generate }) => {
        for (const stage of ['horizon', 'horizon', 'scene', 'scene']) await generate('{}', 'system', {}, { stage });
        return { accepted: true, state: mergeCampaign(state, output, { source, basisRevision: state.revision, evidenceIndices: [0] }) };
    } });
    const result = await session.request();
    assert.equal(result.accepted, true, result.error);
    assert.equal(f.calls(), 4);
    assert.equal(f.commits(), 1);
    assert.equal(f.current.attempt.status, 'complete');
    assert.deepEqual(f.current.attempt.stages, ['horizon', 'horizon', 'scene', 'scene']);
});

test('persisted cadence survives reload and does not plan every reply or replacement', async () => {
    const f = fixture();
    assert.equal((await f.session.request()).accepted, true);
    assert.equal(f.current.attempt.status, 'complete');
    f.session = new CampaignSession(f.options);
    assert.equal((await f.session.request()).skipped, 'not-due');
    for (let i = 0; i < 1; i++) {
        f.current.messages.push({ is_user: true, mes: 'I listen.' }, { is_user: false, mes: 'Work continues.' });
        assert.equal((await f.session.request()).skipped, 'not-due');
    }
    f.current.messages.push({ is_user: false, mes: 'A later result.' });
    f.current.replacement = true;
    assert.equal((await f.session.request()).skipped, 'inactive-or-replacement');
    f.current.replacement = false;
    assert.equal((await f.session.request()).accepted, true);
    assert.equal(f.calls(), 2);
});

test('failed source is not rerun after reload; explicit manual review is a distinct pass', async () => {
    const f = fixture(async () => { throw Error('provider failure'); });
    assert.equal((await f.session.request()).accepted, false);
    assert.equal(f.current.attempt.status, 'failed');
    f.session = new CampaignSession(f.options);
    assert.equal((await f.session.request()).skipped, 'not-due');
    assert.equal(f.calls(), 1);
    await f.session.request({ manual: true });
    assert.equal(f.calls(), 2);
    assert.equal(f.commits(), 0);
});

test('preflight failure replaces an old success record without sending and is deduplicated across reload', async () => {
    const f = fixture();
    await f.session.request();
    const before = structuredClone(f.current.state);
    f.options.prepare = () => { throw Error('Planner input cannot fit whole'); };
    f.session = new CampaignSession(f.options);
    const result = await f.session.request({ manual: true });
    assert.equal(result.accepted, false);
    assert.equal(f.current.attempt.status, 'failed');
    assert.equal(f.current.attempt.requestCount, 0);
    assert.match(f.current.attempt.error, /cannot fit/);
    assert.deepEqual(f.current.state, before);
    assert.equal(f.calls(), 1);
    assert.equal((await new CampaignSession(f.options).request()).skipped, 'not-due');
});

test('failure recovers on new accepted assistant play, not user-only appends or reloads', async () => {
    let fail = true;
    const f = fixture(async () => { if (fail) throw Error('provider failure'); return reply; });
    f.options.interval = () => 12;
    f.session = new CampaignSession(f.options);
    await f.session.request();
    f.current.messages.push({ is_user: true, mes: 'I try another approach.' });
    f.session = new CampaignSession(f.options);
    assert.equal((await f.session.request()).skipped, 'not-due');
    assert.equal(f.calls(), 1);
    f.current.messages.push({ is_user: false, mes: 'A new accepted result.' });
    fail = false;
    assert.equal((await f.session.request()).accepted, true);
    assert.equal(f.calls(), 2);
    assert.equal((await f.session.request()).skipped, 'not-due');
});

test('successful reviews start one reply before scene expiry even with a long saved interval', async () => {
    const f = fixture();
    f.options.interval = () => 12;
    f.session = new CampaignSession(f.options);
    await f.session.request();
    for (let i = 1; i <= 4; i++) {
        f.current.messages.push({ is_user: false, mes: `Accepted reply ${i}` });
        const result = await f.session.request();
        assert.equal(result.accepted, i === 3);
    }
    assert.equal(f.calls(), 2);
});

test('Stop aborts the one send, preserves preparation and suppresses unchanged reload retries', async () => {
    const f = fixture((_p, _s, _schema, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const pending = f.session.request();
    assert.equal(f.session.request(), pending);
    await settle();
    assert.equal(f.calls(), 1);
    f.session.stop();
    assert.equal((await pending).accepted, false);
    assert.equal(f.current.attempt.status, 'stopped');
    assert.equal(f.commits(), 0);
    assert.equal((await new CampaignSession(f.options).request()).skipped, 'not-due');
    f.current.messages.push({ is_user: false, mes: 'A new reply after Stop.' });
    assert.equal((await new CampaignSession(f.options).request()).skipped, 'not-due');
    assert.equal(f.calls(), 1, 'Stop is not treated as a provider failure');
});

test('attempt reservation precedes the call; changes during its disk save spend no AI request', async () => {
    const f = fixture();
    let release;
    f.options.saveAttempt = async value => {
        f.current.attempt = value;
        if (value.status === 'started') await new Promise(resolve => { release = resolve; });
    };
    f.session = new CampaignSession(f.options);
    const pending = f.session.request();
    await settle();
    assert.equal(f.calls(), 0);
    f.current.messages[0].mes = 'Edited before the call.';
    release();
    const result = await pending;
    assert.equal(result.skipped, 'source-changed-before-request');
    assert.equal(f.calls(), 0);
});

test('a newer run for identical input cannot be overwritten by the older run or its terminal status', async () => {
    let release;
    const f = fixture(() => new Promise(resolve => { release = resolve; }));
    const pending = f.session.request();
    await settle();
    const originalKey = f.current.attempt.key;
    f.current.attempt = { ...f.current.attempt, runKey: 'newer-explicit-request', status: 'started' };
    release(reply);
    assert.equal((await pending).accepted, false);
    assert.equal(f.current.attempt.key, originalKey, 'the two requests can share exactly the same source');
    assert.equal(f.current.attempt.runKey, 'newer-explicit-request');
    assert.equal(f.current.attempt.status, 'started');
    assert.equal(f.commits(), 0);
    assert.equal(f.calls(), 1);
});

test('tracker records ordered stages, completion time and provider failure reason', async () => {
    const f = fixture();
    const stages = [];
    f.session = new CampaignSession({ ...f.options, onProgress: stage => stages.push(stage) });
    assert.equal((await f.session.request()).accepted, true);
    assert.deepEqual(stages, ['Recording planner attempt', 'Building planner context',
        'Preparing planner request', 'Validating planner response', 'Saving planner preparation']);
    assert.ok(f.current.attempt.finishedAt >= f.current.attempt.at);
    assert.ok(f.current.attempt.durationMs >= 0);
    const failed = fixture(async () => { throw Error('upstream disconnected'); });
    await failed.session.request();
    assert.equal(failed.current.attempt.error, 'upstream disconnected');
    assert.equal(failed.current.attempt.status, 'failed');
});

test('timeout releases a hung adapter, aborts its signal and rejects late output without a retry', async () => {
    let release, signal;
    const f = fixture((_p, _s, _schema, options) => {
        signal = options.signal;
        return new Promise(resolve => { release = resolve; });
    });
    f.session = new CampaignSession({ ...f.options, timeoutMs: 20 });
    const result = await f.session.request();
    assert.match(result.error, /timed out/);
    assert.equal(signal.aborted, true);
    assert.equal(signal.reason.name, 'TimeoutError');
    assert.equal(f.session.pending, null);
    assert.equal(f.current.attempt.status, 'failed');
    assert.match(f.current.attempt.error, /timed out/);
    release(reply);
    await settle();
    assert.equal(f.commits(), 0);
    assert.equal((await f.session.request()).skipped, 'not-due');
    assert.equal(f.calls(), 1);
    f.session = new CampaignSession({ ...f.options, generate: async () => reply });
    assert.equal((await f.session.request({ manual: true })).accepted, true);
});

test('Stop releases an adapter which ignores abort and cannot commit its late response', async () => {
    let release;
    const f = fixture(() => new Promise(resolve => { release = resolve; }));
    const pending = f.session.request();
    await settle();
    f.session.stop();
    await pending;
    assert.equal(f.session.pending, null);
    assert.equal(f.current.attempt.status, 'stopped');
    release(reply);
    await settle();
    assert.equal(f.commits(), 0);
});
