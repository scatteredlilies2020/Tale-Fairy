import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyPlannerAuthorLayer, buildPromptPayload, clearState, defaultState, fingerprintMessages,
    generationRetrySource, isAnalysisSourceCurrent, isGuidanceUsable, isStateAligned,
    loadState, normalizeState, returnedReplyMatchesVerification, saveState, STATE_KEY, STATE_VERSION, stateForPrompt,
} from '../extension/state.js';
import { formatBeatContract, formatFreshBeatFallback, normalizeBeatDirective, normalizeSceneProfile } from '../extension/beat-director.js';

const messages = [
    { is_user: false, mes: 'The canteen is busy but orderly.' },
    { is_user: true, mes: 'I take my tray to the counter.' },
];

function analyzedState(extra = {}) {
    const beat = {
        ...defaultState(),
        scene: { ...defaultState().scene, status: 'At the canteen counter.', activity: 'Ordering lunch.' },
        sceneProfile: { promise: 'A grounded canteen interaction.', phase: 'developing', emotionalDirection: 'preserve', pressure: 'none', intrusion: 'socially-open', noveltyCeiling: 'context-native', basis: 'The user approached a staffed counter.' },
        beatDirective: { operation: 'introduce', target: 'the service interaction', requiredEffect: 'Let one context-native person respond as part of ordinary service.', contentClass: 'character', scope: 'social', intensity: 'low', quantity: 'singular', relativePower: 'none', plotWeight: 'incidental', duration: 'beat', resolutionCeiling: 'local', preserve: ['ordinary canteen tone'], forbid: ['unrelated danger'], basis: 'A service interaction naturally involves staff.' },
        lastInject: true,
        lastAnalysisFingerprint: fingerprintMessages(messages), sourceMessageCount: messages.length, sourceChatId: 'chat-a',
    };
    return normalizeState({ ...beat, ...extra });
}

test('default and normalized state use the v46 current-beat contract', () => {
    const state = normalizeState({ mode: 'invalid' });
    assert.equal(STATE_VERSION, 46);
    assert.equal(state.version, 46);
    assert.equal(state.mode, 'balanced');
    assert.equal(state.sceneProfile.phase, 'developing');
    assert.equal(state.beatDirective.operation, 'retain');
});

test('scene and beat normalization constrain impact without choosing exact fiction', () => {
    const scene = normalizeSceneProfile({ phase: 'wrong', intrusion: 'dramatically-open', novelty_ceiling: 'major' });
    const beat = normalizeBeatDirective({ operation: 'introduce', content_class: 'opposition', scope: 'world', quantity: 'numerous', relative_power: 'fodder', plot_weight: 'incidental' });
    assert.equal(scene.phase, 'developing');
    assert.equal(scene.intrusion, 'dramatically-open');
    assert.equal(beat.quantity, 'numerous');
    assert.equal(beat.relativePower, 'fodder');
    assert.equal(beat.scope, 'world');
    assert.equal(beat.target, 'current activity');
});

test('v45 migration clears future routes, debt, conductor, and author board', () => {
    const state = normalizeState({
        version: 45, scene: { status: 'active' }, lastInject: true, guidance: 'Force this route.',
        objectives: [{ title: 'Future objective' }], possibilities: [{ description: 'Future idea' }], pathways: [{ id: 'p', direction: 'Future', when: 'Later' }],
        nextGuides: [{ id: 'g', direction: 'Future', useWhen: 'Later', dropWhen: 'Never', causalRole: 'Force', worldDelta: 'Change', basis: 'Old' }],
        narrativeEvents: [{ id: 'e', title: 'Queued', summary: 'Queued', engine: 'clock' }], planHorizons: { items: [{ id: 'h', direction: 'Later' }] },
        authorBoard: { story: { identity: 'Predicted plot' }, revision: 8 }, conductor: { status: 'active', requiredDevelopment: 'Force payoff.' },
    });
    assert.deepEqual(state.objectives, []);
    assert.deepEqual(state.possibilities, []);
    assert.deepEqual(state.pathways, []);
    assert.deepEqual(state.nextGuides, []);
    assert.deepEqual(state.narrativeEvents, []);
    assert.deepEqual(state.planHorizons.items, []);
    assert.equal(state.guidance, '');
    assert.equal(state.lastInject, false);
    assert.equal(state.authorBoard.story.identity, '');
    assert.equal(state.conductor.status, 'uninitialized');
});

test('v46 state preserves a normalized analyzed beat', () => {
    const state = analyzedState();
    assert.equal(state.sceneProfile.promise, 'A grounded canteen interaction.');
    assert.equal(state.beatDirective.requiredEffect, 'Let one context-native person respond as part of ordinary service.');
    assert.equal(state.beatDirective.contentClass, 'character');
});

test('planner prompt state excludes obsolete future machinery', () => {
    const compact = stateForPrompt(analyzedState({ objectives: [{ title: 'Old' }], pathways: [{ id: 'old' }], narrativeEvents: [{ id: 'old' }] }));
    assert.equal(compact.sceneProfile.promise, 'A grounded canteen interaction.');
    assert.equal(compact.beatDirective.operation, 'introduce');
    for (const key of ['objectives', 'possibilities', 'pathways', 'nextGuides', 'planHorizons', 'narrativeEvents', 'authorBoard', 'conductor']) assert.equal(Object.hasOwn(compact, key), false, key);
});

test('alignment and analyzed guidance require an exact current snapshot', () => {
    const state = analyzedState();
    assert.equal(isStateAligned(state, messages, 'chat-a'), true);
    assert.equal(isGuidanceUsable(state, messages, 'chat-a'), true);
    assert.equal(isGuidanceUsable(state, [...messages, { is_user: true, mes: 'Actually, I leave.' }], 'chat-a'), false);
    assert.equal(isGuidanceUsable(state, messages, 'chat-b'), false);
    assert.equal(isGuidanceUsable({ ...state, lastInject: false }, messages, 'chat-a'), false);
});

test('stale analysis fails closed while one explicitly allowed append remains detectable for persistence', () => {
    const fingerprint = fingerprintMessages(messages);
    assert.equal(isAnalysisSourceCurrent(fingerprint, messages.length, messages), true);
    const appended = [...messages, { is_user: true, mes: 'Continue.' }];
    assert.equal(isAnalysisSourceCurrent(fingerprint, messages.length, appended), false);
    assert.equal(isAnalysisSourceCurrent(fingerprint, messages.length, appended, { allowOneUserAppend: true }), true);
});

test('analyzed beat injection is semantic, effective, and leaves concrete realization free', () => {
    const payload = buildPromptPayload(analyzedState(), { guidanceUsable: true });
    assert.match(payload, /BEAT MOVE: INTRODUCE — the service interaction/);
    assert.match(payload, /REQUIRED EFFECT: Let one context-native person respond/);
    assert.match(payload, /CONTENT ENVELOPE: character; social scope; low intensity; singular/);
    assert.match(payload, /Freely invent a compatible context-native realization/i);
    assert.doesNotMatch(payload, /cashier|server|waitress|named/iu);
    assert.doesNotMatch(payload, /SUGGESTED ROUTE|future horizon|delivery debt/i);
});

test('quiet scenes are explicitly allowed to remain quiet even in action genres', () => {
    const payload = formatFreshBeatFallback();
    assert.match(payload, /Do not manufacture conflict, newcomers, urgency, or ominous setup in a closed quiet beat/);
    assert.match(payload, /least forceful fitting move/);
    assert.match(payload, /retain, deepen/);
});

test('fallback keeps AI invention open and supports life and country simulations', () => {
    const payload = formatFreshBeatFallback();
    assert.match(payload, /custom idea/);
    assert.match(payload, /life, organization, country, or world simulation/);
    assert.match(payload, /causal unit natural to that scale/);
});

test('OOC outcome, continue, and advance-time authority override any beat', () => {
    const payload = formatBeatContract(analyzedState().sceneProfile, analyzedState().beatDirective);
    assert.match(payload, /Latest user\/OOC authority wins/);
    assert.match(payload, /Never invent player dialogue, thoughts, consent, decisions, compliance, retreat, or extra actions/);
    assert.match(payload, /preserve canon and broad trajectory without forecasting canon events/i);
});

test('regeneration reuses semantic function but demands a different realization', () => {
    const payload = buildPromptPayload(analyzedState(), { guidanceUsable: true, regeneration: true });
    assert.match(payload, /keep the semantic beat if still valid/i);
    assert.match(payload, /realize it differently from the discarded response/i);
    assert.doesNotMatch(payload, /Alternative 2|rotate|next route/i);
});

test('missing or stale planner state injects a lightweight live policy instead of blocking generation', () => {
    const payload = buildPromptPayload(defaultState(), { guidanceUsable: false });
    assert.match(payload, /TALE FAIRY — LIVE BEAT POLICY/);
    assert.ok(payload.length < 1400, payload.length);
});

test('disabled injection is empty', () => {
    assert.equal(buildPromptPayload(defaultState(), { enabled: false }), '');
});

test('canon and user notes remain binding without prescribing a plot', () => {
    const state = analyzedState({
        canonConstraints: ['The main antagonist cannot be decisively defeated in this scene.'],
        userNotes: [{ kind: 'forbid', text: 'Do not introduce an attack during the concert-eve bedroom scene.' }],
    });
    const payload = buildPromptPayload(state, { guidanceUsable: true });
    assert.match(payload, /main antagonist cannot be decisively defeated/);
    assert.match(payload, /HARD EXCLUSION/);
    assert.match(payload, /Do not introduce an attack/);
});

test('large canon and note collections are bounded', () => {
    const state = analyzedState({
        canonConstraints: Array.from({ length: 100 }, (_, index) => `${index} ${'canon '.repeat(100)}`),
        userNotes: Array.from({ length: 100 }, (_, index) => ({ kind: 'suggest', text: `${index} ${'note '.repeat(100)}` })),
    });
    assert.ok(buildPromptPayload(state, { guidanceUsable: true }).length < 7000);
});

test('save, load, and clear preserve unrelated metadata', () => {
    const metadata = { unrelated: { keep: true } };
    const saved = saveState(metadata, analyzedState());
    assert.equal(saved.unrelated.keep, true);
    assert.equal(loadState(saved).beatDirective.operation, 'introduce');
    const cleared = clearState(saved);
    assert.equal(cleared.unrelated.keep, true);
    assert.equal(Object.hasOwn(cleared, STATE_KEY), false);
});

test('replacement generation strips only the discarded assistant reply', () => {
    const conversation = [...messages, { is_user: false, mes: 'Discard this.' }];
    assert.deepEqual(generationRetrySource(conversation, true), messages);
    assert.deepEqual(generationRetrySource(messages, false), messages);
});

test('request verification confirms only the matching chat and returned assistant response', () => {
    const pending = { chatId: 'chat-a', sourceMessageCount: 2, replacementGeneration: false };
    assert.equal(returnedReplyMatchesVerification(pending, [...messages, { is_user: false, mes: 'Reply' }], 'chat-a'), true);
    assert.equal(returnedReplyMatchesVerification(pending, [...messages, { is_user: true, mes: 'More' }], 'chat-a'), false);
    assert.equal(returnedReplyMatchesVerification(pending, [...messages, { is_user: false, mes: 'Reply' }], 'chat-b'), false);
});

test('planner completion resets only the lightweight refresh schedule', () => {
    const state = applyPlannerAuthorLayer(analyzedState({ plannerSchedule: { turnsSincePlanner: 6 } }), { turnCount: 10, fingerprint: 'abc' });
    assert.equal(state.plannerSchedule.turnsSincePlanner, 0);
    assert.equal(state.plannerSchedule.lastPlannerTurn, 10);
    assert.equal(state.plannerSchedule.lastPlannerFingerprint, 'abc');
    assert.equal(state.beatDirective.operation, 'introduce');
});
