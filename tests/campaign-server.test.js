import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { campaignJobMeta, campaignJobMatches, recoverCampaignJob } from '../extension/campaign-jobs.js';
import { emptyCampaign } from '../extension/campaign-planner.js';
import { directorInput, directorPass } from '../extension/story-director.js';

const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
function install(scope, ...names) {
    vm.createContext(scope);
    for (const name of names) vm.runInContext(source.match(new RegExp(`(?:async )?function ${name}\\([^]*?^}`, 'm'))[0], scope);
}
function recovery(status = 'complete') {
    const current = { enabled: true, chatId: 'chat', referenceHash: 'ref', requestSignature: 'settings',
        state: emptyCampaign(), messages: [{ is_user: false, mes: 'A new year at the music club.' }],
        attempt: { runKey: 'run', status: 'pending', at: Date.now() } };
    const input = directorInput({ state: current.state, reference: { premise: 'Light music club RP.' }, messages: [], requireSagaHierarchy: true });
    const job = { id: 'job', chatId: 'chat', runKey: 'run', status, attempts: 2,
        meta: campaignJobMeta(current, current.attempt, input, JSON.stringify),
        text: JSON.stringify({ reviewAfter: 12, foundation: { reminder: 'Light music club RP.', changeReason: '', scratchpad: '' },
            upsert: [{ id: 'r1-year', kind: 'saga', parentId: '', status: 'active', title: 'A year together',
                owner: 'The club', description: 'Making music and sharing club life.', endsWhen: '', links: [], effects: [] }],
            retain: [], retire: [], select: [] }) };
    const acknowledgements = [], requests = [], commits = [];
    const scope = {
        detachedPlannerRecovering: false, campaignSession: null, campaignHostWork: null,
        detachedPlannerReady: Promise.resolve(true), detachedCampaignEnabled: true, analysisStopSequence: 0,
        getSettings: () => ({ enabled: current.enabled }), currentContext: () => ({ getCurrentChatId: () => current.chatId }),
        detachedPlannerJobs: async () => acknowledgements.includes(job.id) ? [] : [job],
        readCampaignSnapshot: () => current, campaignFingerprint: JSON.stringify, campaignJobMatches, recoverCampaignJob,
        ownedPass: directorPass, commitCampaignPreparation: state => { current.state = state; commits.push(state); return true; },
        saveCampaignAttempt: async attempt => { current.attempt = attempt; },
        acknowledgeDetachedPlannerJob: async id => acknowledgements.push(id),
        plannerServerApi: async (path, options) => requests.push({ path, ...options }),
        renderAnalysisActivity() {}, loadState: () => current.state,
    };
    install(scope, 'recoverDetachedCampaignJobs');
    return { current, job, scope, requests, commits, acknowledgements, run: () => scope.recoverDetachedCampaignJobs() };
}

test('host reopening validates and commits server work once without any new generation', async () => {
    const h = recovery();
    h.current.messages.push({ is_user: true, mes: 'I join my friends for tea.' });
    assert.equal((await h.run()).recovered, true);
    assert.equal(h.commits.length, 1);
    assert.equal(h.current.attempt.status, 'complete');
    assert.equal(h.current.attempt.serverAttempts, 2);
    assert.equal((await h.run()).recovered, false);
    assert.equal(h.commits.length, 1);
    assert.deepEqual(h.requests, []);
});

for (const status of ['queued', 'processing', 'retry_wait']) test(`host only polls ${status} work`, async () => {
    const h = recovery(status);
    assert.equal((await h.run()).active, true);
    assert.equal(h.commits.length, 0);
    assert.deepEqual(h.requests, []);
    assert.deepEqual(h.acknowledgements, []);
});

test('host cancels obsolete source work, but never installs it', async () => {
    const h = recovery('retry_wait');
    h.current.messages[0].mes = 'Edited scene.';
    assert.equal((await h.run()).active, false);
    assert.equal(h.commits.length, 0);
    assert.equal(h.requests[0].method, 'DELETE');
    assert.deepEqual(h.acknowledgements, ['job']);
});

test('host status failure blocks duplicate generation and allows later collection', async () => {
    const h = recovery(), list = h.scope.detachedPlannerJobs;
    h.scope.detachedPlannerJobs = async () => { throw Error('temporarily unavailable'); };
    assert.equal((await h.run()).active, true);
    assert.equal(h.scope.detachedPlannerRecovering, false);
    assert.equal(h.commits.length, 0);
    h.scope.detachedPlannerJobs = list;
    assert.equal((await h.run()).recovered, true);
});

test('host checks stop after listing and serializes concurrent recovery after readiness', async () => {
    const stopped = recovery();
    stopped.scope.detachedPlannerJobs = async () => { stopped.scope.analysisStopSequence++; return [stopped.job]; };
    assert.equal((await stopped.run()).recovered, false);
    assert.equal(stopped.commits.length, 0);
    const h = recovery();
    let ready;
    h.scope.detachedPlannerReady = new Promise(resolve => { ready = resolve; });
    const a = h.run(), b = h.run();
    ready(true);
    await Promise.all([a, b]);
    assert.equal(h.commits.length, 1);
});

function transport() {
    const requests = [], waits = [], attempt = { runKey: 'run', status: 'started' };
    const job = { id: 'job', runKey: 'run', status: 'processing', attempts: 1 };
    const scope = { URL, Response, DOMException,
        PLANNER_BACKEND_PATHS: new Set(['/api/backends/chat-completions/generate']), PLANNER_SERVER_BASE: '/server',
        detachedPlannerEnabled: true,
        plannerNativeFetch: async (path, options) => { requests.push({ path, ...options }); return new Response(JSON.stringify({ job }), { status: 202 }); },
        rememberDetachedPlannerJob() {}, setTimeout: callback => waits.push(callback),
        plannerServerApi: async path => { requests.push({ path, method: 'GET' }); return { job: { ...job, status: 'complete', text: 'original result', attempts: 2 } }; },
        readCampaignSnapshot: () => ({ attempt }), saveCampaignAttempt: async value => Object.assign(attempt, value),
    };
    install(scope, 'waitForAbortable', 'installDetachedPlannerTransport');
    scope.installDetachedPlannerTransport();
    const controller = new AbortController();
    return { scope, requests, waits, attempt, controller, run: () => scope.fetch('/api/backends/chat-completions/generate', {
        headers: {}, signal: controller.signal, body: JSON.stringify({ model: 'test', _taleFairyPlanner: { runKey: 'run', campaign: { version: 1 } } }),
    }) };
}

test('browser transport submits once, polls and returns only the original completion', async () => {
    const h = transport(), pending = h.run();
    await new Promise(resolve => setImmediate(resolve));
    h.waits.shift()();
    const response = await pending;
    assert.equal((await response.json()).choices[0].message.content, 'original result');
    assert.equal(h.requests.filter(request => request.method === 'POST').length, 1);
    assert.equal(h.requests.filter(request => request.method === 'GET').length, 1);
    assert.equal(h.attempt.serverAttempts, 2);
});

test('browser abort releases its wait without deleting server work', async () => {
    const h = transport(), pending = h.run();
    await new Promise(resolve => setImmediate(resolve));
    h.controller.abort(new DOMException('Page closed', 'AbortError'));
    await assert.rejects(pending, /Page closed/);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].method, 'POST');
});
