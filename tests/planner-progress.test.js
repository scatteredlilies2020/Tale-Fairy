import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { campaignAttemptSummary } from '../extension/planner-progress.js';

const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
function install(scope, names) {
    for (const name of names) vm.runInContext(source.match(new RegExp(`function ${name}\\([^]*?^}`, 'm'))[0], scope);
}

test('campaign timer ticks, keeps total elapsed across stages and stops on completion or invalidation', () => {
    let now = 1000, tick;
    const status = {};
    const buttons = new Map();
    const root = { querySelector: selector => selector.includes('analysis-status') ? status
        : { toggleAttribute: (_name, disabled) => buttons.set(selector, disabled) } };
    const scope = vm.createContext({ Date: { now: () => now }, EXTENSION_ID: 'test',
        document: { querySelector: () => root }, analysisPhaseTimer: null, analysisRunId: 1, analysisStopSequence: 0,
        campaignHostWork: { chatId: 'chat', stopSequence: 0, runId: 1, startedAt: now },
        currentContext: () => ({ getCurrentChatId: () => 'chat' }),
        setInterval: callback => { tick = callback; return 1; }, clearInterval: () => { tick = null; } });
    install(scope, ['elapsedLabel', 'clearAnalysisPhase', 'renderAnalysisActivity', 'showAnalysisPhase', 'showCampaignPhase']);
    scope.showCampaignPhase('Building planner context');
    now += 65000;
    tick();
    assert.match(status.textContent, /1m 05s$/);
    scope.showCampaignPhase('Waiting for planner response');
    assert.match(status.textContent, /Waiting for planner response · 1m 05s$/);
    assert.equal(buttons.get('[data-action="stop"]'), false);
    scope.renderAnalysisActivity('Saved', false);
    assert.equal(tick, null);
    assert.equal(buttons.get('[data-action="stop"]'), true);
    scope.showCampaignPhase('Waiting');
    scope.analysisRunId++;
    tick();
    assert.equal(tick, null);
    scope.analysisStopSequence++;
    scope.showCampaignPhase('Old work');
    assert.doesNotMatch(status.textContent, /Old work/);
});

test('tracker distinguishes unknown legacy completion from confirmed success and failure', () => {
    assert.match(campaignAttemptSummary({ status: 'started' }), /no completion record/);
    assert.doesNotMatch(campaignAttemptSummary({ status: 'started' }), /in progress/);
    assert.match(campaignAttemptSummary({ status: 'started' }, true), /in progress/);
    assert.match(campaignAttemptSummary({ status: 'complete', durationMs: 65000 }), /preparation saved · 1m 05s/);
    assert.match(campaignAttemptSummary({ status: 'failed', error: 'connection closed' }), /failed · connection closed/);
    assert.doesNotMatch(campaignAttemptSummary({ status: 'failed' }), /0s|undefined/);
});

test('current planner hides inactive budgets and displays its effective review interval while preserving legacy choices', () => {
    const settings = { fullReviewInterval: 12, recentContextTokens: 12000, routineInputTokens: 6000,
        reviewInputTokens: 14000, maxPromptTokens: 16000 };
    const elements = new Map();
    const root = { querySelector: selector => {
        if (!elements.has(selector)) {
            const label = {};
            elements.set(selector, { closest: () => label });
        }
        return elements.get(selector);
    } };
    const scope = vm.createContext({ getSettings: () => settings, campaignMode: () => true,
        currentContext: () => ({}), loadState: () => ({ pacing: { mode: 'auto' } }),
        analysisConnectionChoice: () => 'direct', secret_state: {}, renderDirectModelOptions() {} });
    install(scope, ['refreshControls']);
    scope.refreshControls(root);
    for (const key of ['recent-budget', 'routine-budget', 'review-budget']) {
        assert.equal(root.querySelector(`[data-setting="${key}"]`).disabled, true);
        assert.equal(root.querySelector(`[data-setting="${key}"]`).closest('label').hidden, true);
    }
    assert.equal(root.querySelector('[data-setting="full-review-interval"]').value, 4);
    assert.equal(root.querySelector('[data-setting="full-review-interval"]').max, '4');
    assert.equal(settings.fullReviewInterval, 12);
    assert.equal(settings.recentContextTokens, 12000);
    scope.campaignMode = () => false;
    scope.refreshControls(root);
    assert.equal(root.querySelector('[data-setting="recent-budget"]').disabled, false);
    assert.equal(root.querySelector('[data-setting="recent-budget"]').closest('label').hidden, false);
    assert.equal(root.querySelector('[data-setting="full-review-interval"]').value, 12);
});
