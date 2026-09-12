import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { claimPlannerRecoveryRepair } from '../extension/planner-lifecycle.js';

const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
const recovery = source.slice(source.indexOf('async function recoverDetachedPlannerJobs('), source.indexOf('async function negotiatePlannerOutput('));
const meta = { fingerprint: 'snapshot', messageCount: 1, fullContextPass: true };
const invalidJob = { id: 'invalid', runKey: 'old-run', status: 'complete', text: 'invalid', meta };
function harness(jobs, overrides = {}) {
    const calls = [], acknowledged = [], saved = [], values = new Map();
    const chat = [{ mes: 'Current scene.' }];
    const context = { chat, chatMetadata: {}, getCurrentChatId: () => 'chat' };
    const scope = {
        detachedPlannerRecovering: false, analysisPromise: null, analysisStopSequence: 0,
        getSettings: () => ({ enabled: true }), currentContext: () => context,
        messagesFromChat: value => value, detachedPlannerJobs: async () => jobs,
        isAnalysisSourceCurrent: fingerprint => fingerprint === 'snapshot',
        acknowledgeDetachedPlannerJob: async id => acknowledged.push(id),
        acknowledgeDetachedPlannerRun: async id => acknowledged.push(id),
        parseAnalysisResponse: text => { if (text === 'invalid') throw new Error('invalid actor'); return {}; },
        alignmentPromptFromMeta: () => '', console: { warn() {} }, EXTENSION_ID: 'test',
        loadState: () => ({ userNotes: [] }), rebuildState: () => ({ userNotes: [] }),
        applyAnalysis: state => state, applyPlannerAuthorLayer: state => state,
        assistantTurnNumber: () => 1, fingerprintMessages: () => 'snapshot',
        reconcileStateWithContinuity: state => ({ state }), optionalContinuityContext: () => null,
        normalizeUserNote: () => null, resolveUserNote: () => null,
        persist: async state => saved.push(state), clearPlannerPending() {}, clearPlannerFailed() {},
        plannerStorage: () => ({ getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }),
        claimPlannerRecoveryRepair, lastAnalysisError: '', renderBoard() {}, renderAnalysisActivity() {},
        plannerValidationRepairInstruction: () => 'Correct the fields.',
        analyzeNow: async options => { calls.push(options); return { repaired: true }; },
        createSafetyFallbackState: () => ({ fallback: true }), randomVariationNonce: () => 1,
        analysisErrorMessage: error => error.message,
        ...overrides,
    };
    vm.createContext(scope);
    vm.runInContext(recovery, scope);
    return { scope, context, calls, acknowledged, saved, run: () => scope.recoverDetachedPlannerJobs() };
}

test('invalid recovered response cannot replace another valid attempt', async () => {
    const h = harness([invalidJob, { ...invalidJob, id: 'valid', text: 'valid' }]);
    const result = await h.run();
    assert.equal(result.recovered, true);
    assert.equal(result.fallback, undefined);
    assert.equal(h.calls.length, 0);
    assert.equal(h.saved.length, 1);
    assert.equal(h.acknowledged.includes('invalid'), true);
});

test('a still-running attempt takes precedence over retained invalid output', async () => {
    const h = harness([invalidJob, { ...invalidJob, id: 'running', status: 'processing' }]);
    assert.equal((await h.run()).active, true);
    assert.equal(h.calls.length, 0);
    assert.equal(h.saved.length, 0);
});

test('recovery requests at most one correction per snapshot, then uses safe fallback', async () => {
    const h = harness([invalidJob]);
    assert.equal((await h.run()).state.repaired, true);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].recovery.instruction, 'Correct the fields.');
    assert.equal(h.calls[0].recovery.fullContextPass, true);
    assert.equal((await h.run()).fallback, true);
    assert.equal(h.calls.length, 1);
    assert.equal(h.scope.detachedPlannerRecovering, false);
});

test('stopping or switching chats while acknowledging recovery never starts a new request', async () => {
    for (const change of [h => { h.scope.analysisStopSequence++; }, h => { h.context.getCurrentChatId = () => 'other'; }]) {
        const h = harness([invalidJob]);
        h.scope.acknowledgeDetachedPlannerRun = async () => change(h);
        assert.equal((await h.run()).recovered, false);
        assert.equal(h.calls.length, 0);
        assert.equal(h.saved.length, 0);
    }
});

test('runtime uses one content correction, not a second chain of output-mode retries', () => {
    assert.match(source, /retryInvalidOutput = false/);
    assert.match(source, /repairInstruction: recovery.instruction, allowValidationRepair: false/);
    const failure = source.slice(source.indexOf('const willRetry ='), source.indexOf('const willRetry =') + 3000);
    assert.match(failure, /!recovery/);
    assert.ok(failure.indexOf('acknowledgeDetachedPlannerRun(') < failure.indexOf('createSafetyFallbackState('));
});
