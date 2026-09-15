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
    contract_version: 14,
    memory: 'Mira is in the library beside a sealed chest.',
    context: [{ subject: 'The chest', condition: 'remains sealed beside Mira', knowledge: 'Its contents are unknown.' }],
    prepared: { approach: 'Let scholarship uncover conflicting interpretations and relationships over time, without forcing discoveries or player choices.', overview: '', updates: [], focus: [] },
};

function harness(state = createSafetyFallbackState(defaultState(), { messages, chatId: 'story' })) {
    const h = generationHarness(structuredClone(messages), state);
    const requests = [], prompts = [], errors = [], sourceRequests = [];
    Object.assign(h.settings, { fullReviewInterval: 12, maxPromptTokens: 16000, recentContextTokens: 6000, summaryContextTokens: 4000,
        analysisSource: 'direct', analysisProvider: 'custom', analysisModel: 'deepseek-v4-pro', analysisReasoningMode: 'low' });
    Object.assign(h.scope, analysis, lifecycle, {
        AbortController, queueMicrotask, plannerBudgets,
        normalizeUserNote: value => value, noteInstruction: value => value || '', resolveUserNote: () => null,
        randomVariationNonce: () => 1, showAnalysisPhase() {}, elapsedLabel: value => `${value}ms`,
        optionalContinuityContext: () => null, optionalContinuityContextWhenReady: async () => null,
        collectSummarySources: async (...args) => { sourceRequests.push(args.at(-1)); return []; }, relevantActors: () => [],
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
    return { ...h, requests, prompts, errors, sourceRequests, settle: () => new Promise(resolve => setImmediate(resolve)) };
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
    assert.equal(request.spec.reasoningMode, 'off', 'replacement runs without optional reasoning');
    assert.equal(request.spec.schema, analysis.WORLD_PLANNER_SCHEMA);
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
    assert.deepEqual(h.state().causalContext.conditions, []);
    assert.equal(h.state().preparedWorld.approach, result.prepared.approach);
    await h.scope.analyzeNow();
    await h.settle();
    assert.equal(h.requests.length, 1, 'a completed preparation-only plan is not an empty-state retry loop');
});

test('pre-reply repair and its recovered correction cannot promote empty state to full initialization', async () => {
    for (const recovery of [null, { fullContextPass: true, instruction: 'Correct the retained fields.' }]) {
        const h = harness();
        const pending = h.scope.analyzeNow({ force: true, allowOneAssistantAppend: true, recovery });
        await h.settle();
        assert.equal(h.requests.length, 1);
        assert.equal(h.requests[0].meta.bootstrapScan, false);
        assert.equal(h.requests[0].spec.responseTokens, 4096);
        assert.equal(h.requests[0].spec.reasoningMode, 'off', 'repairs run without optional reasoning');
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
    const selected = h.prepare('regenerate');
    assert.equal(selected.preparedUsable, true);
    assert.equal(selected.usable, false, 'no duplicated scene recap is needed to cache preparation');
    assert.equal(h.requests.length, 1);
});

test('full rebuild retains its explicit larger budget with planner reasoning off', async () => {
    const h = harness();
    const pending = h.scope.analyzeNow({ force: true, rebuild: true });
    await h.settle();
    assert.equal(h.requests[0].meta.bootstrapScan, true);
    assert.equal(h.requests[0].spec.responseTokens, 8192);
    assert.equal(h.requests[0].spec.reasoningMode, 'off');
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

test('failed live refresh preserves a successful same-source same-input plan', async () => {
    const h = harness();
    const initial = h.scope.reevaluateGuideState();
    await h.settle();
    h.requests[0].finish();
    await initial;
    const conditions = structuredClone(h.state().causalContext);
    const refreshed = h.scope.reevaluateGuideState();
    await h.settle();
    assert.equal(h.requests.length, 2);
    h.requests[1].fail(new analysis.AnalysisValidationError('Unusable refresh'));
    await refreshed;
    assert.deepEqual(h.state().causalContext, conditions);
    assert.match(h.statuses.at(-1), /Current good plan retained/);
    assert.equal(h.state().plannerSchedule.manualRequested, true, 'failed manual refresh is not a successful completion');
});

test('manual completion is honored through the state layer used by live and recovered results', () => {
    const state = defaultState();
    state.plannerSchedule = { ...state.plannerSchedule, manualRequested: true, turnsSinceFullReview: 8 };
    const completed = applyPlannerAuthorLayer(state, { manualCompleted: true });
    assert.equal(completed.plannerSchedule.manualRequested, false);
    assert.equal(completed.plannerSchedule.turnsSinceFullReview, 8);
});

for (const rebuild of [false, true]) test(`actual ${rebuild ? 'rebuild' : 'first empty-state analysis'} gathers whole-story and enabled selected-book references`, async () => {
    const h = harness(defaultState());
    h.context.card = { scenario: 'Explore independent towns during a long journey.' };
    h.context.chatMetadata.world_info = 'Atlas';
    h.context.worlds = { Atlas: { entries: {
        harbor: { uid: 1, content: 'Distant harbor artists prepare a festival.', disable: false },
        disabled: { uid: 2, content: 'Disabled lore must remain excluded.', disable: true },
    } } };
    const pending = h.scope.analyzeNow({ force: true, rebuild });
    await h.settle();
    assert.deepEqual(h.errors, []);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].meta.bootstrapScan, true);
    assert.equal(h.sourceRequests[0].broad, true);
    assert.match(h.sourceRequests[0].query, /independent towns/);
    assert.match(JSON.stringify(h.sourceRequests[0].referenceSources), /harbor artists/);
    assert.doesNotMatch(JSON.stringify(h.sourceRequests[0].referenceSources), /Disabled lore/);
    assert.equal(h.prompts[0].storyEvidence.messageCount, messages.length);
    h.requests[0].finish();
    await pending;
    assert.deepEqual(h.errors, []);
});


test('the story Stop button preserves and completes the automatic fallback planner', async () => {
    const h = harness();
    h.context.chat.push({ is_user: false, mes: 'Discarded future.' });
    await h.emit('GENERATION_STARTED', 'regenerate');
    await h.flush();
    await h.settle();
    assert.equal(h.requests.length, 1);
    const request = h.requests[0];
    assert.equal(request.meta.allowOneAssistantAppend, true);
    assert.equal(request.meta.messageCount, messages.length);
    for (let i = 0; i < 3; i++) {
        await h.emit('GENERATION_STOPPED');
        await h.emit('GENERATION_ENDED');
        await h.flush();
        await h.settle();
    }
    assert.equal(h.requests.length, 1);
    assert.equal(request.signal.aborted, false);
    const pending = h.scope.analysisPromise;
    request.finish();
    await pending;
    assert.deepEqual(h.errors, []);
    assert.equal(h.prepare('regenerate').preparedUsable, true);
});
