import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignSession } from '../extension/campaign-session.js';
import { emptyCampaign } from '../extension/campaign-planner.js';

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

test('persisted cadence survives reload and does not plan every reply or replacement', async () => {
    const f = fixture();
    assert.equal((await f.session.request()).accepted, true);
    assert.equal(f.current.attempt.status, 'complete');
    f.session = new CampaignSession(f.options);
    assert.equal((await f.session.request()).skipped, 'not-due');
    for (let i = 0; i < 2; i++) {
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
