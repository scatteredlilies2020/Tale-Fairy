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

test('analyzed guidance remains usable for the immediately appended user action', () => {
    const state = analyzedState();
    assert.equal(isStateAligned(state, messages, 'chat-a'), true);
    assert.equal(isGuidanceUsable(state, messages, 'chat-a'), true);
    assert.equal(isGuidanceUsable(state, [...messages, { is_user: true, mes: 'Actually, I leave.' }], 'chat-a'), true);
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
    assert.match(payload, /TALE FAIRY — ADAPTIVE DIRECTOR/);
    assert.match(payload, /WEIGHTED DIRECTOR SAMPLE/);
    assert.match(payload, /PLANNER LEAN: INTRODUCE — the service interaction/);
    assert.match(payload, /PLANNER DIRECTION: Let one context-native person respond/);
    assert.match(payload, /CONTENT ENVELOPE: character; social scope; low intensity; singular/);
    assert.match(payload, /exact event, actor, challenge, opportunity, consequence, or other realization/i);
    assert.doesNotMatch(payload, /cashier|server|waitress|named/iu);
    assert.doesNotMatch(payload, /SUGGESTED ROUTE|future horizon|delivery debt/i);
});

test('quiet scenes receive scale-native movement instead of mandatory conflict or stagnation', () => {
    const payload = formatFreshBeatFallback({ directorSample: { mode: 'fun', intervention: 'major', novelty: 'surprising', fortune: 'mixed' } });
    assert.match(payload, /story-altering development/i);
    assert.match(payload, /Calibrate the contribution to the setting and current stakes/i);
    assert.match(payload, /Do not stagnate merely because no retained thread demands movement/i);
});

test('fallback keeps AI invention open across context-native scene scales', () => {
    const payload = formatFreshBeatFallback();
    assert.match(payload, /take another fitting approach/i);
    assert.match(payload, /personal life, relationships, school, work, institutions, politics/i);
    assert.match(payload, /new compatible cause/i);
});

test('director may move the scene while OOC authority and player decisions remain protected', () => {
    const payload = formatBeatContract(analyzedState().sceneProfile, analyzedState().beatDirective);
    assert.match(payload, /Explicit user\/OOC instructions remain binding/);
    assert.match(payload, /Never invent the player character's dialogue, thoughts, feelings, decisions, consent, compliance, or reaction/);
    assert.match(payload, /Scene progression and transitions are allowed/i);
    assert.match(payload, /player decisions remain the player's alone/i);
    assert.doesNotMatch(payload, /USER-CONTROLLED PACING|ceiling, not a quota/i);
});

test('regeneration reuses semantic function but demands a different realization', () => {
    const payload = buildPromptPayload(analyzedState(), { guidanceUsable: true, regeneration: true });
    assert.match(payload, /reuse this weighted sample and directorial purpose/i);
    assert.match(payload, /realize it differently from the discarded response/i);
    assert.doesNotMatch(payload, /Alternative 2|rotate|next route/i);
});

test('missing or stale planner state injects a lightweight live policy instead of blocking generation', () => {
    const payload = buildPromptPayload(defaultState(), { guidanceUsable: false });
    assert.match(payload, /TALE FAIRY — LIVE ADAPTIVE DIRECTOR/);
    assert.match(payload, /WEIGHTED DIRECTOR SAMPLE/);
    assert.ok(payload.length < 3500, payload.length);
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

test('request verification preserves a weighted director sample without fabricating one for legacy records', () => {
    const legacy = normalizeState({ lastRequestVerification: { status: 'confirmed', guidanceBlock: '<living-world-guide>old</living-world-guide>' } });
    assert.equal(legacy.lastRequestVerification.directorSample, null);
    assert.equal(legacy.lastRequestVerification.directorSeed, null);
    const current = normalizeState({ lastRequestVerification: {
        status: 'confirmed', guidanceBlock: '<living-world-guide>current</living-world-guide>', directorSeed: 0,
        directorSample: { mode: 'fun', intervention: 'major', novelty: 'surprising', fortune: 'mixed' },
    } });
    assert.deepEqual(current.lastRequestVerification.directorSample, { mode: 'fun', intervention: 'major', novelty: 'surprising', fortune: 'mixed' });
    assert.equal(current.lastRequestVerification.directorSeed, 0);
});

test('planner completion resets only the lightweight refresh schedule', () => {
    const state = applyPlannerAuthorLayer(analyzedState({ plannerSchedule: { turnsSincePlanner: 6 } }), { turnCount: 10, fingerprint: 'abc' });
    assert.equal(state.plannerSchedule.turnsSincePlanner, 0);
    assert.equal(state.plannerSchedule.lastPlannerTurn, 10);
    assert.equal(state.plannerSchedule.lastPlannerFingerprint, 'abc');
    assert.equal(state.beatDirective.operation, 'introduce');
});
