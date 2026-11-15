import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as problems from '../extension/problem-log.js';

test('problem history is bounded, deduplicated, redacted and clear does not resurrect old attempts', () => {
    const attempt = { status: 'failed', error: 'Weighted conversion incomplete', runKey: 'one', at: 10, finishedAt: 20 };
    const problem = problems.attemptProblem('Current guide', attempt);
    let history = problems.appendProblem(null, problem);
    history = problems.appendProblem(history, problem);
    assert.equal(history.entries.length, 1);
    history = problems.clearProblems(history, 30);
    assert.equal(problems.appendProblem(history, problem).entries.length, 0);
    assert.equal(problems.attemptProblemDismissed(history, 'Current guide', attempt), true);
    assert.equal(problems.attemptProblemDismissed(history, 'Future outlook', attempt), false);
    const next = problems.attemptProblem('Current guide', { ...attempt, runKey: 'two', finishedAt: 40 });
    assert.equal(problems.appendProblem(history, next).entries.length, 1);
    assert.equal(problems.attemptProblemDismissed(history, 'Current guide', { ...attempt, runKey: 'two', finishedAt: 40 }), false);
    assert.equal(attempt.status, 'failed', 'display dismissal never changes request deduplication');
    assert.ok(problems.attemptProblem('Future outlook', { ...attempt, status: 'stopped' }), 'stopping must not hide an earlier error from the log');
    for (let i = 0; i < 130; i++) history = problems.appendProblem(history, { id: `${i}`, source: 'test', message: 'problem' });
    assert.equal(history.entries.length, 20);
    assert.equal(history.seen.length, 100);
    const redacted = problems.problemMessage('Bearer private-value api_key=private-key access_token=private-token');
    assert.doesNotMatch(redacted, /private-/);
});

const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
test('clearing a chat problem log preserves preparation, failed reservations and live work', () => {
    const scope = { ...problems, EXTENSION_ID: 'test', CAMPAIGN_ATTEMPT_KEY: 'current', FUTURE_ATTEMPT_KEY: 'future',
        campaignHostWork: {}, analysisPromise: null, futureHost: { pending: {} },
        scheduleVerificationPersistence() {}, renderAnalysisActivity() { assert.fail('Do not overwrite live progress'); },
        renderCampaignAttempt() {}, renderFutureBoard() {}, document: { querySelector: () => null } };
    let metadata = { preparation: { revision: 68 }, current: { status: 'failed', runKey: 'paid', at: 1, error: 'timeout' } };
    scope.currentContext = () => ({ chatMetadata: metadata, getCurrentChatId: () => 'chat',
        updateChatMetadata: value => { metadata = value; } });
    vm.createContext(scope);
    for (const name of ['savePlannerProblems', 'renderPlannerProblems', 'clearPlannerProblems']) {
        vm.runInContext(source.match(new RegExp(`function ${name}\\([^]*?^}`, 'm'))[0], scope);
    }
    scope.renderPlannerProblems();
    const original = structuredClone(metadata);
    scope.clearPlannerProblems();
    scope.renderPlannerProblems();
    assert.equal(metadata[problems.PROBLEM_LOG_KEY].entries.length, 0);
    assert.deepEqual(metadata.preparation, original.preparation);
    assert.deepEqual(metadata.current, original.current);
    assert.ok(scope.futureHost.pending);
    assert.ok(scope.campaignHostWork);
});
