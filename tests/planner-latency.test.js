import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { generationHarness } from './helpers/generation-harness.js';
import * as analysis from '../extension/analysis.js';
import * as lifecycle from '../extension/planner-lifecycle.js';
import { plannerBudgets } from '../extension/planner-budgets.js';
import { defaultState, applyPlannerAuthorLayer } from '../extension/state.js';
import { createSafetyFallbackState } from '../extension/fallback-direction.js';

const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
const messages = [{ is_user: false, mes: 'Mira waits beside the sealed chest in the library.' }, { is_user: true, mes: 'I ask about the chest.' }];
const result = {
    contract_version: 13,
    current: { frame: 'grounded', frame_basis: 'The latest exchange concerns the chest.', status: 'The chest is still sealed.',
        immediate_action: 'A question about the chest.', activity: 'Library discussion', situation: 'Mira is present beside a sealed chest.',
        location: 'library', time: '', loop: false, scene_promise: 'An open discussion about the sealed chest.', phase: 'developing',
        emotional_direction: 'preserve', pressure: 'ambient', intrusion: 'closed', novelty_ceiling: 'context-native' },
    context: { conditions: [{ id: 'sealed-chest', kind: 'situation', subject: 'The chest', condition: 'remains sealed beside Mira',
        disclosure: 'open', confidence: 'established', relevance: 'The user just asked about it.' }], inject: true, inject_reason: 'Current question.', basis: 'Latest exchange.' },
    thread_updates: [], actor_updates: [], ledger: 'Mira is in the library beside a sealed chest.', audit: 'Updated the current scene.',
};

function harness(state = createSafetyFallbackState(defaultState(), { messages, chatId: 'story' })) {
    const h = generationHarness(structuredClone(messages), state);
    const requests = [], prompts = [], errors = [];
    Object.assign(h.settings, { fullReviewInterval: 12, maxPromptTokens: 16000, recentContextTokens: 6000, summaryContextTokens: 4000,
        analysisSource: 'direct', analysisProvider: 'custom', analysisModel: 'deepseek-v4-pro', analysisReasoningMode: 'low' });
    Object.assign(h.scope, analysis, lifecycle, {
        AbortController, queueMicrotask, plannerBudgets,
        normalizeUserNote: value => value, noteInstruction: value => value || '', resolveUserNote: () => null,
        randomVariationNonce: () => 1, showAnalysisPhase() {}, elapsedLabel: value => `${value}ms`,
        optionalContinuityContext: () => null, optionalContinuityContextWhenReady: async () => null,
        collectSummarySources: async () => [], relevantActors: () => [],
        buildTokenBudgetedAnalysisPrompt: async (...args) => { prompts.push(args.at(-1)); return 'scene evidence'; },
        transcriptHeadFromPrompt: () => null, plannerEvidenceAudit: (_prompt, _sources, options) => options,
        acknowledgeDetachedPlannerRun: async () => {}, reconcileStateWithContinuity: state => ({ state }),
        withPlannerTabLock: (_chatId, run) => run(),
        rebuildState: state => ({ ...(state || defaultState()), canonBootstrapPending: true }),
        requestAnalysisOnce: (_prompt, signal, meta, spec) => new Promise((resolve, reject) => {
            requests.push({ signal, meta, spec, finish: () => resolve(structuredClone(result)), fail: reject });
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
        analysisErrorMessage: error => error.message, shouldRetryPlannerError: () => false, isPlannerTimeoutError: () => false,
        console: { warn: (...args) => errors.push(args) }, EXTENSION_ID: 'test',
        analysisBudgetEnvelope: () => 'small', PLANNER_BUDGET_ENVELOPE: 'full', INCREMENTAL_BUDGET_ENVELOPE: 'small', INCREMENTAL_SYSTEM_PROMPT: 'small',
    });
    for (const name of ['INCREMENTAL_RESPONSE_TOKENS', 'REBUILD_RESPONSE_TOKENS', 'REVIEW_RESPONSE_TOKENS', 'PLANNER_MAX_AUTO_RETRIES']) {
        h.scope[name] = Number(source.match(new RegExp(`const ${name} = (\\d+)`))[1]);
    }
    for (const name of ['requestAnalysis', 'analyzeNow']) {
        vm.runInContext(source.match(new RegExp(`(?:export )?async function ${name}\\([^]*?^}`, 'm'))[0].replace(/^export /u, ''), h.scope);
    }
    return { ...h, requests, prompts, errors, settle: () => new Promise(resolve => setImmediate(resolve)) };
}

test('actual Re-evaluate uses one lightweight request from an empty fallback and repeated clicks do not restart it', async () => {
    const h = harness();
    assert.equal(h.state().contextLedger, '');
    const first = h.scope.reevaluateGuideState();
    await h.settle();
    assert.deepEqual(h.errors, []);
    assert.equal(h.requests.length, 1);
    const request = h.requests[0];
    assert.equal(request.meta.bootstrapScan, false);
    assert.equal(request.meta.fullContextPass, false);
    assert.equal(request.spec.responseTokens, 4096);
    assert.equal(request.spec.reasoningMode, 'off', 'routine deltas disable optional thinking');
    assert.equal(request.spec.schema, analysis.INCREMENTAL_ANALYSIS_SCHEMA);
    assert.equal(h.prompts[0].maxPromptTokens, 6000);
    assert.equal(h.prompts[0].recentContextTokens, 3000);
    assert.equal(h.prompts[0].summaryContextTokens, 1200);
    const clicks = Array.from({ length: 20 }, () => h.scope.reevaluateGuideState());
    await h.settle();
    assert.equal(h.requests.length, 1);
    assert.equal(request.signal.aborted, false);
    request.finish();
    await Promise.all([first, ...clicks]);
    assert.deepEqual(h.errors, []);
    assert.equal(h.state().plannerSchedule.manualRequested, false);
    assert.equal(h.state().causalContext.conditions[0].subject, 'The chest');
    assert.equal(h.state().contextLedger, result.ledger);
});

test('pre-reply repair and its recovered correction cannot promote empty state to full initialization', async () => {
    for (const recovery of [null, { fullContextPass: true, instruction: 'Correct the retained fields.' }]) {
        const h = harness();
        const pending = h.scope.analyzeNow({ force: true, allowOneAssistantAppend: true, recovery });
        await h.settle();
        assert.equal(h.requests.length, 1);
        assert.equal(h.requests[0].meta.bootstrapScan, false);
        assert.equal(h.requests[0].spec.responseTokens, 4096);
        assert.equal(h.requests[0].spec.reasoningMode, 'off', 'routine repairs disable optional thinking');
        if (recovery) assert.equal(h.requests[0].spec.allowValidationRepair, false);
        h.requests[0].finish();
        await pending;
        assert.deepEqual(h.errors, []);
    }
});

test('real changed inputs or model selection replace a running reevaluation, not stale-cache reuse', async () => {
    for (const change of [h => { h.context.card = { scenario: 'The chest is now open.' }; }, h => { h.settings.analysisModel = 'different-model'; },
        h => { h.settings.analysisReasoningMode = 'high'; }, h => { h.settings.routineInputTokens = 12000; },
        h => { h.context.chat[1].mes = 'I ask Mira about the window instead.'; }]) {
        const h = harness();
        const first = h.scope.reevaluateGuideState();
        await h.settle();
        change(h);
        const second = h.scope.reevaluateGuideState();
        await h.settle();
        assert.equal(h.requests[0].signal.aborted, true);
        assert.equal(h.requests.length, 2);
        h.requests[1].finish();
        await Promise.all([first, second]);
        assert.deepEqual(h.errors, []);
    }
});

test('rapid Regenerate/swipe and manual clicks preserve a single pre-reply repair until its plan is cached', async () => {
    const h = harness();
    h.context.chat.push({ is_user: false, mes: 'Discarded future.' });
    await h.emit('GENERATION_STARTED', 'regenerate');
    const first = h.scope.reevaluateGuideState();
    await h.settle();
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].meta.messageCount, messages.length);
    assert.equal(h.requests[0].spec.responseTokens, 4096);
    const clicks = [];
    for (let i = 0; i < 20; i++) {
        h.context.chat.at(-1).mes = `Discarded replacement ${i}.`;
        await h.emit('GENERATION_STARTED', i % 2 ? 'swipe' : 'regenerate');
        h.settings.showDirectorNotes = i % 2 === 0;
        clicks.push(h.scope.reevaluateGuideState());
    }
    await h.settle();
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].signal.aborted, false);
    h.requests[0].finish();
    await Promise.all([first, ...clicks]);
    assert.deepEqual(h.errors, []);
    assert.equal(h.state().plannerSchedule.manualRequested, false);
    assert.equal(h.state().sourceMessageCount, messages.length);
    assert.equal(h.prepare('regenerate').usable, true);
    assert.equal(h.requests.length, 1);
});

test('full rebuild retains its explicit larger budget and configured reasoning', async () => {
    const h = harness();
    const pending = h.scope.analyzeNow({ force: true, rebuild: true });
    await h.settle();
    assert.equal(h.requests[0].meta.bootstrapScan, true);
    assert.equal(h.requests[0].spec.responseTokens, 8192);
    assert.equal(h.requests[0].spec.reasoningMode, undefined);
    assert.equal(h.prompts[0].maxPromptTokens, 16000);
    h.requests[0].finish();
    await pending;
    assert.deepEqual(h.errors, []);
});

test('unsuccessful reevaluation retains the pending manual request without pretending it completed', async () => {
    const h = harness();
    const pending = h.scope.reevaluateGuideState();
    await h.settle();
    h.requests[0].fail(new analysis.AnalysisValidationError('Unusable provider output'));
    await pending;
    assert.equal(h.state().plannerSchedule.manualRequested, true);
    assert.equal(h.requests.length, 1);
    assert.match(h.statuses.at(-1), /Safety fallback ready/);
});

test('manual completion is honored through the state layer used by live and recovered results', () => {
    const state = defaultState();
    state.plannerSchedule = { ...state.plannerSchedule, manualRequested: true, turnsSinceFullReview: 8 };
    const completed = applyPlannerAuthorLayer(state, { manualCompleted: true });
    assert.equal(completed.plannerSchedule.manualRequested, false);
    assert.equal(completed.plannerSchedule.turnsSinceFullReview, 8);
});
