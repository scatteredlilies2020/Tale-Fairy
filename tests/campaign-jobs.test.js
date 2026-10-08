import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignJobMeta, campaignJobMatches, recoverCampaignJob } from '../extension/campaign-jobs.js';
import { emptyCampaign, campaignUsable } from '../extension/campaign-planner.js';
import { directorInput, directorPass } from '../extension/story-director.js';

const fingerprint = JSON.stringify;
function fixture() {
    const current = { enabled: true, chatId: 'chat', referenceHash: 'ref', requestSignature: 'settings',
        state: emptyCampaign(), messages: [{ is_user: false, mes: 'The club is starting a new school year.' }],
        attempt: { runKey: 'run', status: 'pending' } };
    const input = directorInput({ reference: { premise: 'A light school music club RP.' }, state: current.state,
        messages: [{ index: 0, role: 'assistant', content: current.messages[0].mes }], playerNames: [], requireSagaHierarchy: true });
    const meta = campaignJobMeta(current, current.attempt, input, fingerprint);
    const job = { chatId: 'chat', runKey: 'run', status: 'complete', meta, text: JSON.stringify({ reviewAfter: 12,
        foundation: { reminder: 'A light school music club RP.', changeReason: '', scratchpad: '' },
        upsert: [{ id: 'r1-year', kind: 'saga', parentId: '', title: 'Our year in the music club', status: 'active',
            owner: 'The club', description: 'Making music and sharing the school year together.', endsWhen: '', links: [], effects: [] }],
        retain: [], retire: [], select: [] }) };
    let commits = 0;
    const options = { read: () => current, fingerprint, runPass: directorPass, commit: (state, guard) => {
        if (guard.stateFingerprint !== fingerprint(current.state) || !campaignUsable(state, { ...current, fingerprint })) return false;
        current.state = state; commits++; return true;
    } };
    return { current, job, options, commits: () => commits };
}

test('reopened browser validates and installs the original director result once, allowing accepted appends', async () => {
    const f = fixture();
    f.current.messages.push({ is_user: true, mes: 'I sit with my friends.' }, { is_user: false, mes: 'They pour tea.' });
    const result = await recoverCampaignJob(f.job, f.options);
    assert.equal(result.accepted, true, result.error);
    assert.equal(f.commits(), 1);
    assert.equal(f.current.state.source.messageCount, 1);
    assert.equal((await recoverCampaignJob(f.job, f.options)).accepted, false);
    assert.equal(f.commits(), 1);
});

for (const reason of ['chat', 'transcript', 'shortened', 'reference', 'settings', 'state', 'newer-run', 'stopped', 'disabled']) {
    test(`detached result cannot bypass ${reason} guard`, async () => {
        const f = fixture();
        if (reason === 'chat') f.current.chatId = 'other';
        if (reason === 'transcript') f.current.messages[0].mes = 'An edited scene.';
        if (reason === 'shortened') f.current.messages = [];
        if (reason === 'reference') f.current.referenceHash = 'new';
        if (reason === 'settings') f.current.requestSignature = 'new';
        if (reason === 'state') f.current.state.revision++;
        if (reason === 'newer-run') f.current.attempt.runKey = 'new';
        if (reason === 'stopped') f.current.attempt.status = 'stopped';
        if (reason === 'disabled') f.current.enabled = false;
        assert.equal(campaignJobMatches(f.job, f.current, fingerprint), false);
        assert.equal((await recoverCampaignJob(f.job, f.options)).accepted, false);
        assert.equal(f.commits(), 0);
    });
}

test('recovery checks its guards again after validation and never repairs invalid output with a model call', async () => {
    const f = fixture();
    f.options.runPass = async args => { const result = await directorPass(args); f.current.attempt.status = 'stopped'; return result; };
    assert.equal((await recoverCampaignJob(f.job, f.options)).accepted, false);
    assert.equal(f.commits(), 0);
    const invalid = fixture();
    invalid.job.text = 'invalid JSON';
    assert.equal((await recoverCampaignJob(invalid.job, invalid.options)).accepted, false);
    assert.equal(invalid.commits(), 0);
});
