import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { claimPlannerRecoveryRepair } from '../extension/planner-lifecycle.js';
import { applyPlannerAuthorLayer, defaultState } from '../extension/state.js';
import { canRetainSuccessfulPlan } from '../extension/fallback-direction.js';

const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
const recovery = source.slice(source.indexOf('async function recoverDetachedPlannerJobs('), source.indexOf('async function negotiatePlannerOutput('));
const meta = { fingerprint: 'snapshot', messageCount: 1, fullContextPass: true };
const invalidJob = { id: 'invalid', runKey: 'old-run', status: 'complete', text: 'invalid', meta };
function harness(jobs, overrides = {}) {
    const calls = [], acknowledged = [], saved = [], values = new Map();
    const chat = [{ mes: 'Current scene.' }];
    const context = { chat, chatMetadata: {}, getCurrentChatId: () => 'chat' };
    const scope = {
        canRetainSuccessfulPlan,
        detachedPlannerRecovering: false, analysisPromise: null, analysisStopSequence: 0,
        replacementPlanningDeferred: () => false,
        retryPlannerSourceMatches: (_context, meta) => meta.allowOneAssistantAppend === true,
        getSettings: () => ({ enabled: true }), currentContext: () => context,
        messagesFromChat: value => value, detachedPlannerJobs: async () => jobs,
        isAnalysisSourceCurrent: fingerprint => fingerprint === 'snapshot',
        acknowledgeDetachedPlannerJob: async id => acknowledged.push(id),
        acknowledgeDetachedPlannerRun: async id => acknowledged.push(id),
        parseAnalysisResponse: text => { if (text === 'invalid') throw new Error('invalid actor'); return {}; },
        alignmentPromptFromMeta: () => '', console: { warn() {} }, EXTENSION_ID: 'test',
        loadState: () => ({ userNotes: [] }), rebuildState: () => ({ userNotes: [] }),
        generationInputs: () => ({}), plotInputKey: () => 'pre-reply-input-proof',
        unchangedSourcePrefix: () => false, preparedReady: () => false, defaultPreparedWorld: () => ({ items: [], focus: [] }),
        alignRetainedStateToTranscript: state => state,
        applyAnalysis: state => state, applyPlannerAuthorLayer: state => state,
        assistantTurnNumber: () => 1, fingerprintMessages: () => 'snapshot',
        reconcileStateWithContinuity: state => ({ state }), optionalContinuityContext: () => null,
        normalizeUserNote: () => null, resolveUserNote: () => null,
        persist: async state => { saved.push(state); return state; }, clearPlannerPending() {}, clearPlannerFailed() {},
        plannerStorage: () => ({ getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }),
        claimPlannerRecoveryRepair, lastAnalysisError: '', renderBoard() {}, renderAnalysisActivity() {},
        plannerValidationRepairInstruction: () => 'Correct the fields.',
        analyzeNow: async options => { calls.push(options); return { repaired: true }; },
        createSafetyFallbackState: () => ({ fallback: true }), randomVariationNonce: () => 1,
        analysisErrorMessage: error => error.message,
        ...overrides,
    };
    vm.createContext(scope);
    vm.runInContext(source.match(/function campaignMode\([^]*?^}/m)[0], scope);
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

test('campaign mode never sends legacy detached results into its new state', async () => {
    const h = harness([invalidJob], { loadState: () => ({ plannerContract: 15 }), campaignSession: null });
    const result = await h.run();
    assert.equal(result.recovered, false);
    assert.equal(result.active, false);
    assert.equal(h.saved.length, 0);
    assert.equal(h.calls.length, 0);
});

test('a still-running attempt takes precedence over retained invalid output', async () => {
    const h = harness([invalidJob, { ...invalidJob, id: 'running', status: 'processing' }]);
    assert.equal((await h.run()).active, true);
    assert.equal(h.calls.length, 0);
    assert.equal(h.saved.length, 0);
});

test('invalid detached recovery uses safe fallback without a second generation', async () => {
    const h = harness([invalidJob]);
    assert.equal((await h.run()).fallback, true);
    assert.equal(h.calls.length, 0);
    assert.equal((await h.run()).fallback, true);
    assert.equal(h.calls.length, 0);
    assert.equal(h.scope.detachedPlannerRecovering, false);
});

test('invalid recovered refresh cannot replace a proven current plan with fallback', async () => {
    const state = { ...defaultState(), sourceChatId: 'chat', lastAnalysisFingerprint: 'snapshot',
        sourceMessageCount: 1, lastAnalyzedAt: 100, analysisModel: { plotInputsKey: 'pre-reply-input-proof' },
        causalContext: { conditions: [{ id: 'departed', confidence: 'established', subject: 'Courier', condition: 'already departed' }] } };
    const h = harness([invalidJob], { loadState: () => state });
    const result = await h.run();
    assert.equal(result.retained, true);
    assert.equal(result.state, state);
    assert.equal(h.saved.length, 0);
    assert.equal(h.calls.length, 0);
    assert.equal(h.scope.lastAnalysisError, 'invalid actor');
    const changed = harness([invalidJob], { loadState: () => state, plotInputKey: () => 'changed-card' });
    assert.equal((await changed.run()).fallback, true);
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

test('replacement deferral blocks retained jobs, including jobs returned after cancellation', async () => {
    const h = harness([invalidJob], { replacementPlanningDeferred: () => true });
    await h.run();
    assert.equal(h.calls.length, 0);
    assert.equal(h.saved.length, 0);
    const late = harness([]);
    late.scope.detachedPlannerJobs = async () => {
        late.scope.analysisStopSequence++;
        return [{ ...invalidJob, text: 'valid' }];
    };
    await late.run();
    assert.equal(late.calls.length, 0);
    assert.equal(late.saved.length, 0);
});

test('deferred retries recover only a pre-reply repair and do not import discarded Continuity facts', async () => {
    let continuityReads = 0;
    const retryMeta = { ...meta, allowOneAssistantAppend: true, analysisSelection: { plotInputsKey: 'pre-reply-input-proof' } };
    const h = harness([
        { ...invalidJob, id: 'future', text: 'valid' },
        { ...invalidJob, id: 'pre-reply', text: 'valid', meta: retryMeta },
    ], {
        replacementPlanningDeferred: () => true,
        optionalContinuityContext: () => { continuityReads++; return { discarded: true }; },
    });
    h.context.chat.push({ mes: 'Discarded reply.' });
    assert.equal((await h.run()).recovered, true);
    assert.equal(h.saved.length, 1);
    assert.equal(h.calls.length, 0);
    assert.equal(continuityReads, 0);
    assert.equal(h.saved[0].analysisModel.plotInputsKey, 'pre-reply-input-proof');
});

test('repairing an invalid detached retry never evaluates or falls back to its discarded reply', async () => {
    const retryMeta = { ...meta, allowOneAssistantAppend: true };
    const sources = [];
    const h = harness([{ ...invalidJob, meta: retryMeta }], {
        replacementPlanningDeferred: () => true,
        createSafetyFallbackState: (_state, options) => { sources.push(options.messages); return { fallback: true }; },
    });
    h.context.chat.push({ mes: 'Discarded reply.' });
    await h.run();
    assert.equal(h.calls.length, 0);
    assert.equal(sources.length, 1);
    assert.equal(sources[0].length, 1);
});

test('runtime disables content correction and output-mode validation retries', () => {
    assert.match(source, /retryInvalidOutput = false/);
    assert.doesNotMatch(source, /repairInstruction: recovery.instruction|withValidationRepair/);
    const failure = source.slice(source.indexOf('const willRetry ='), source.indexOf('const willRetry =') + 3000);
    assert.match(failure, /!recovery/);
    assert.ok(failure.indexOf('acknowledgeDetachedPlannerRun(') < failure.indexOf('createSafetyFallbackState('));
});

test('successful detached quick reevaluation clears manual demand but preserves the broad review clock', async () => {
    const state = defaultState();
    state.plannerSchedule = { ...state.plannerSchedule, manualRequested: true, turnsSinceFullReview: 7 };
    const h = harness([{ ...invalidJob, text: 'valid', meta: { ...meta, fullContextPass: false } }], {
        loadState: () => state, applyPlannerAuthorLayer,
        parseAnalysisResponse: () => ({ contract_version: 13 }),
    });
    await h.run();
    assert.equal(h.saved.length, 1);
    assert.equal(h.saved[0].plannerSchedule.manualRequested, false);
    assert.equal(h.saved[0].plannerSchedule.turnsSinceFullReview, 7);
});
