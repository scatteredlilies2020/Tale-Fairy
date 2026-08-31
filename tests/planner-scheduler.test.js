import assert from 'node:assert/strict';
import test from 'node:test';
import { markAssistantTurn, markPlannerCompleted, plannerRefreshDecision } from '../extension/planner-scheduler.js';

function state(schedule = {}) {
    return {
        plannerSchedule: schedule,
        pacing: { inferred: 'natural' },
        sceneProfile: { promise: 'Continue the current scene.' },
        beatDirective: { operation: 'deepen' },
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
