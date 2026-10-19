import assert from 'node:assert/strict';
import test from 'node:test';
import { CampaignSession } from '../extension/campaign-session.js';
import { futureDue } from '../extension/future-planner.js';

function fixture({ fail = false, early = false, interval = 12 } = {}) {
    let calls = 0;
    const current = { enabled: true, chatId: 'chat', referenceHash: 'reference', requestSignature: 'settings',
        state: { revision: 0, archive: [], workingPlan: { storyStructure: { reviewAfter: 1 } } },
        messages: [{ is_user: true, mes: 'I enter.' }], attempt: null };
    const options = { read: () => current, fingerprint: JSON.stringify, interval: () => interval,
        earlyReviews: () => early, saveAttempt: async a => { current.attempt = a; },
        prepare: () => ({ prompt: '{}' }), generate: async () => { calls++; if (fail) throw Error('Provider unavailable'); return {}; },
        runPass: async ({ state, source, generate }) => { await generate('{}'); return { accepted: true,
            state: { ...state, revision: state.revision + 1, source } }; },
        commit: state => { current.state = state; return true; } };
    let session = new CampaignSession(options);
    return { current, calls: () => calls, request: options => session.request(options),
        reload: () => { session = new CampaignSession(options); },
        turn(index) { current.messages.push({ is_user: false, mes: `Accepted ${index}\n***\n<!--tf-review-->` }); } };
}

for (const fail of [false, true]) test(`40 replies with repeated notifications follow the configured interval (failure=${fail})`, async () => {
    const f = fixture({ fail });
    await f.request();
    for (let i = 1; i <= 40; i++) {
        f.turn(i);
        f.current.referenceHash = `variable-${i}`;
        await Promise.all([f.request(), f.request(), f.request()]);
        f.reload();
        await f.request();
        assert.equal(f.calls(), 1 + Math.floor(i / 12), `calls after reply ${i}`);
    }
});

test('opted-in early signals still require a minimum gap, and Guide remains immediate', async () => {
    const f = fixture({ early: true, interval: 40 });
    await f.request();
    for (let i = 1; i < 4; i++) { f.turn(i); await f.request(); assert.equal(f.calls(), 1); }
    f.turn(4); await f.request(); assert.equal(f.calls(), 2);
    await f.request({ manual: true }); assert.equal(f.calls(), 3);
});

test('future failures and changing references cannot create per-reply retries', () => {
    const messages = [{ is_user: true, mes: 'I enter.' }];
    const snapshot = { chatId: 'chat', messages, referenceHash: 'new', requestSignature: 'new',
        attempt: { chatId: 'chat', status: 'failed', referenceHash: 'old', requestSignature: 'old',
            fingerprint: 'old', messageCount: 1, assistantCount: 0 } };
    for (let i = 1; i < 40; i++) { messages.push({ is_user: false, mes: 'Accepted play.' }); assert.equal(futureDue(snapshot, JSON.stringify, 40), false); }
    messages.push({ is_user: false, mes: 'Accepted play.' });
    assert.equal(futureDue(snapshot, JSON.stringify, 40), true);
});
