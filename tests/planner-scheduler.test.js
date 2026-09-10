import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_REFRESH_INTERVAL, markAssistantTurn, markPlannerCompleted, normalizePlannerSchedule, plannerPassDecision, plannerRefreshDecision } from '../extension/planner-scheduler.js';

function state(schedule = {}) {
    return {
        plannerSchedule: schedule,
        pacing: { inferred: 'natural' },
        sceneProfile: { promise: 'Continue the current scene.' },
        causalContext: { conditions: [{ id: 'x', subject: 'Mira', condition: 'is cautious', relevance: 'present', confidence: 'strong' }] },
        authorBoard: { story: { identity: 'Story' }, scene: { purpose: 'Scene', requiredDevelopments: [] }, revision: 1 },
        conductor: { status: 'active', requiredDevelopment: 'Develop the scene.', boardRevision: 1, pacing: 'natural' },
    };
}

test('assistant turns are counted idempotently and planner completion resets the interval', () => {
    const once = markAssistantTurn({}, 'reply-1');
    assert.equal(markAssistantTurn(once, 'reply-1').turnsSincePlanner, 1);
    assert.equal(markAssistantTurn(once, 'reply-2').turnsSincePlanner, 2);
    assert.equal(markPlannerCompleted(once, { turnCount: 9 }).turnsSincePlanner, 0);
});

test('periodic refresh happens only at the configured interval', () => {
    assert.equal(plannerRefreshDecision({ state: state({ turnsSincePlanner: 5, refreshInterval: 6 }) }).shouldRun, false);
    assert.equal(plannerRefreshDecision({ state: state({ turnsSincePlanner: 6, refreshInterval: 6 }) }).code, 'periodic');
});

test('corrections are detected from the user turn even after an assistant reply', () => {
    const messages = [{ is_user: true, mes: 'OOC: correction - Lucia never left the library.' }, { is_user: false, mes: 'Understood.' }];
    assert.equal(plannerRefreshDecision({ state: state(), messages }).code, 'contradiction');
});

test('ordinary arrivals and departures do not cause extra planner calls', () => {
    const messages = [{ is_user: true, mes: 'I leave the cup beside the book.' }, { is_user: false, mes: 'A droid arrives with tea.' }];
    assert.equal(plannerRefreshDecision({ state: state(), messages }).shouldRun, false);
});

test('replacement responses never retrigger a planner pivot or initialization', () => {
    const messages = [{ is_user: true, mes: 'OOC: correction - remain in the library.' }, { is_user: false, mes: 'A replacement reply.' }];
    assert.equal(plannerRefreshDecision({ state: state(), messages, event: 'replacement', swipe: true }).shouldRun, false);
    const uninitialized = state();
    uninitialized.sceneProfile.promise = '';
    assert.equal(plannerRefreshDecision({ state: uninitialized, messages, event: 'replacement', swipe: true }).shouldRun, false);
});

test('successful routine passes do not postpone the independent broad-review clock', () => {
    assert.equal(DEFAULT_REFRESH_INTERVAL, 12);
    let schedule = markPlannerCompleted({}, { fullReview: true });
    for (let turn = 1; turn <= 12; turn++) {
        schedule = markAssistantTurn(schedule, `reply-${turn}`);
        schedule = markAssistantTurn(schedule, `reply-${turn}`);
        assert.equal(plannerRefreshDecision({ state: state(schedule) }).shouldRun, turn === 12);
        schedule = markPlannerCompleted(schedule, { turnCount: turn });
        assert.equal(schedule.turnsSinceFullReview, turn);
    }
    schedule = markPlannerCompleted(schedule, { turnCount: 12, fullReview: true });
    assert.equal(schedule.turnsSinceFullReview, 0);
    assert.equal(schedule.lastFullReviewTurn, 12);
    assert.equal(plannerRefreshDecision({ state: state(schedule) }).shouldRun, false);
});

test('a reviewed correction does not repeat a costly review, but an edit does', () => {
    const messages = [{ is_user: true, mes: 'OOC: correction - remain in the library.' }, { is_user: false, mes: 'Lucia puts the book away.' }];
    const reviewed = markPlannerCompleted({}, { fullReview: true, messages });
    assert.equal(plannerRefreshDecision({ state: state(reviewed), messages }).shouldRun, false);
    const edited = [{ ...messages[0], mes: 'OOC: correction - remain in the courtyard.' }, messages[1]];
    assert.equal(plannerRefreshDecision({ state: state(reviewed), messages: edited }).code, 'contradiction');
    const fallback = markPlannerCompleted({ ...reviewed, turnsSinceFullReview: 12, manualRequested: true });
    assert.equal(fallback.turnsSinceFullReview, 12);
    assert.equal(fallback.manualRequested, true);
});

test('broad reviews are not bootstrap rebuilds and configured intervals are bounded', () => {
    const ready = { ...state({ turnsSinceFullReview: 12 }), scene: { status: 'At tea' }, contextLedger: 'Lucia and Ari are having tea.' };
    assert.deepEqual({ ...plannerPassDecision({ state: ready }), reason: '' }, { fullContextPass: true, bootstrapScan: false, reason: '' });
    assert.equal(plannerPassDecision({ state: ready, rebuild: true }).bootstrapScan, true);
    assert.equal(plannerPassDecision({ state: { ...ready, contextLedger: '' } }).bootstrapScan, true);
    assert.equal(normalizePlannerSchedule({ refreshInterval: 100 }).refreshInterval, 20);
    assert.equal(normalizePlannerSchedule({ refreshInterval: 2 }).refreshInterval, 3);
    assert.equal(normalizePlannerSchedule({ refreshInterval: 7.9 }).refreshInterval, 7);
});
