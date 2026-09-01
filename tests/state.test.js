import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyPlannerAuthorLayer, buildPromptPayload, clearState, defaultState, fingerprintMessages,
    generationRetrySource, isAnalysisSourceCurrent, isGuidanceUsable, isStateAligned,
    loadState, normalizeState, returnedReplyMatchesVerification, saveState, STATE_KEY, STATE_VERSION, stateForPrompt,
} from '../extension/state.js';
import { formatBeatContract, normalizeBeatDirective, normalizeSceneProfile } from '../extension/beat-director.js';

const messages = [
    { is_user: false, mes: 'The canteen is busy but orderly.' },
    { is_user: true, mes: 'I take my tray to the counter.' },
];

function analyzedState(extra = {}) {
    const beat = {
        ...defaultState(),
        scene: { ...defaultState().scene, status: 'At the canteen counter.', activity: 'Ordering lunch.' },
        sceneProfile: { promise: 'A grounded canteen interaction.', phase: 'developing', emotionalDirection: 'preserve', pressure: 'none', intrusion: 'socially-open', noveltyCeiling: 'context-native', basis: 'The user approached a staffed counter.' },
        beatDirective: { operation: 'introduce', target: 'the service interaction', requiredEffect: 'Let the routine interaction produce a small but observable development that opens a fresh possibility.', contentClass: 'character', scope: 'social', intensity: 'low', quantity: 'singular', relativePower: 'none', plotWeight: 'incidental', duration: 'beat', resolutionCeiling: 'local', preserve: ['ordinary canteen tone'], forbid: ['unrelated danger'], basis: 'A service interaction naturally involves staff.' },
        lastInject: true,
        lastAnalysisFingerprint: fingerprintMessages(messages), sourceMessageCount: messages.length, sourceChatId: 'chat-a',
    };
    return normalizeState({ ...beat, ...extra });
}

test('default and normalized state use the v48 scene-first planner contract', () => {
    const state = normalizeState({ mode: 'invalid' });
    assert.equal(STATE_VERSION, 48);
    assert.equal(state.version, 48);
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

test('current state preserves a normalized analyzed beat', () => {
    const state = analyzedState();
    assert.equal(state.sceneProfile.promise, 'A grounded canteen interaction.');
    assert.equal(state.beatDirective.requiredEffect, 'Let the routine interaction produce a small but observable development that opens a fresh possibility.');
    assert.equal(state.beatDirective.contentClass, 'character');
});

test('pre-v48 migration discards the old planner decision but preserves private continuity evidence', () => {
    const state = normalizeState({
        ...analyzedState(), version: 47, lastInject: true,
        canonConstraints: ['A private established fact remains available to the planner.'],
        beatDirective: { ...analyzedState().beatDirective, requiredEffect: 'Old provider-visible direction.' },
        lastRequestVerification: { status: 'confirmed', guidanceBlock: '<tale-fairy-context>old leak</tale-fairy-context>' },
    });
    assert.equal(state.lastInject, false);
    assert.equal(state.beatDirective.requiredEffect, '');
    assert.equal(state.lastRequestVerification, null);
    assert.deepEqual(state.canonConstraints, ['A private established fact remains available to the planner.']);
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
    const payload = buildPromptPayload(analyzedState(), {
        guidanceUsable: true,
        directorSample: { mode: 'fun', intervention: 'major', novelty: 'surprising', fortune: 'favorable' },
    });
    assert.match(payload, /Allow a fitting new element to enter and open fresh possibilities/);
    assert.match(payload, /Express that movement boldly or consequentially/i);
    assert.match(payload, /unexpected but compatible realization without changing the kind of movement/i);
    assert.match(payload, /Within that movement, lean toward opportunity, relief, advantage/i);
    assert.match(payload, /choose every concrete actor, event, object, action, and outcome yourself/i);
    assert.doesNotMatch(payload, /routine interaction|fresh possibility|cashier|server|waitress|PLANNER|INTRODUCE|CONTENT ENVELOPE|the service interaction/iu);
    assert.doesNotMatch(payload, /SUGGESTED ROUTE|future horizon|delivery debt/i);
});

test('provider compiler cannot leak concrete prose even when private planner direction contains it', () => {
    const state = analyzedState();
    state.beatDirective = normalizeBeatDirective({
        ...state.beatDirective,
        operation: 'complicate',
        target: 'the unhurried garden visit',
        requiredEffect: 'Disrupt the calm outing with an adverse institutional development that raises stakes around Lucia\'s presence and unresolved future.',
    });
    const payload = buildPromptPayload(state, {
        guidanceUsable: true,
        directorSample: { mode: 'balanced', intervention: 'major', novelty: 'grounded', fortune: 'adverse' },
    });
    assert.match(payload, /Introduce a fitting complication that materially changes the immediate possibilities/);
    assert.doesNotMatch(payload, /Lucia|garden|outing|institutional|unresolved future/i);
});

test('analyzed quiet beats receive scale-native movement instead of mandatory conflict or stagnation', () => {
    const payload = formatBeatContract({}, { operation: 'deepen', requiredEffect: 'Privately deepen this quiet interaction.' }, { directorSample: { mode: 'fun', intervention: 'major', novelty: 'surprising', fortune: 'mixed' } });
    assert.match(payload, /Express that movement boldly or consequentially/i);
    assert.match(payload, /unexpected but compatible realization/i);
    assert.match(payload, /Deepen what is already happening/i);
});

test('major adverse sampling cannot replace a scene-selected breather with complication', () => {
    const payload = formatBeatContract({}, { operation: 'deepen', requiredEffect: 'Private concrete planner prose.' }, {
        directorSample: { mode: 'fun', intervention: 'major', novelty: 'surprising', fortune: 'adverse' },
    });
    assert.match(payload, /Deepen what is already happening/);
    assert.match(payload, /do not change its kind merely to increase impact/i);
    assert.match(payload, /do not manufacture adversity solely/i);
    assert.doesNotMatch(payload, /Introduce a fitting complication|Increase the active pressure/i);
});

test('analyzed beat keeps AI invention open across context-native scene scales', () => {
    const payload = formatBeatContract({}, { operation: 'introduce', requiredEffect: 'Privately introduce a compatible development.' });
    assert.match(payload, /established cause or a new compatible cause/i);
    assert.match(payload, /choose every concrete actor, event, object, action, and outcome yourself/i);
});

test('director may move the scene while OOC authority and player decisions remain protected', () => {
    const payload = formatBeatContract(analyzedState().sceneProfile, analyzedState().beatDirective);
    assert.match(payload, /explicit user\/OOC instructions and established canon.*binding/i);
    assert.match(payload, /Never invent the player character's dialogue, thoughts, feelings, decisions, consent, compliance, or reaction/);
    assert.match(payload, /Use the complete current context to choose every concrete actor/i);
    assert.doesNotMatch(payload, /USER-CONTROLLED PACING|ceiling, not a quota/i);
});

test('regeneration reuses semantic function but demands a different realization', () => {
    const payload = buildPromptPayload(analyzedState(), { guidanceUsable: true, regeneration: true });
    assert.match(payload, /preserve the same broad intent while producing a genuinely different realization/i);
    assert.doesNotMatch(payload, /Alternative 2|rotate|next route/i);
});

test('missing or stale planner state injects nothing and does not block generation', () => {
    const payload = buildPromptPayload(defaultState(), { guidanceUsable: false });
    assert.equal(payload, '');
});

test('an allegedly usable default beat still injects nothing without analyzed intent', () => {
    assert.equal(buildPromptPayload(defaultState(), { guidanceUsable: true }), '');
});

test('disabled injection is empty', () => {
    assert.equal(buildPromptPayload(defaultState(), { enabled: false }), '');
});

test('canon and user notes remain private planner evidence instead of leaking into roleplay injection', () => {
    const state = analyzedState({
        canonConstraints: ['My Midichlorian count is explicitly off the charts.'],
        userNotes: [{ kind: 'forbid', text: 'Do not introduce an attack during the concert-eve bedroom scene.' }],
    });
    const payload = buildPromptPayload(state, { guidanceUsable: true });
    assert.equal(state.canonConstraints[0], 'My Midichlorian count is explicitly off the charts.');
    assert.equal(state.userNotes[0].text, 'Do not introduce an attack during the concert-eve bedroom scene.');
    assert.doesNotMatch(payload, /Midichlorian|off the charts|HARD EXCLUSION|concert-eve|Do not introduce an attack/i);
    assert.doesNotMatch(payload, /user-established-canon|tale-fairy-user-notes/i);
});

test('large private canon and note collections do not enlarge roleplay injection', () => {
    const state = analyzedState({
        canonConstraints: Array.from({ length: 100 }, (_, index) => `${index} ${'canon '.repeat(100)}`),
        userNotes: Array.from({ length: 100 }, (_, index) => ({ kind: 'suggest', text: `${index} ${'note '.repeat(100)}` })),
    });
    const payload = buildPromptPayload(state, { guidanceUsable: true });
    assert.ok(payload.length < 2500, payload.length);
    assert.doesNotMatch(payload, /canon canon|note note/i);
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
    assert.equal(legacy.lastRequestVerification.runtimeVersion, '');
    assert.equal(legacy.lastRequestVerification.directorSample, null);
    assert.equal(legacy.lastRequestVerification.directorSeed, null);
    const current = normalizeState({ lastRequestVerification: {
        status: 'confirmed', runtimeVersion: '0.11.137', guidanceBlock: '<living-world-guide>current</living-world-guide>', directorSeed: 0,
        directorSample: { mode: 'fun', intervention: 'major', novelty: 'surprising', fortune: 'mixed' },
    } });
    assert.deepEqual(current.lastRequestVerification.directorSample, { mode: 'fun', intervention: 'major', novelty: 'surprising', fortune: 'mixed' });
    assert.equal(current.lastRequestVerification.runtimeVersion, '0.11.137');
    assert.equal(current.lastRequestVerification.directorSeed, 0);
});

test('request verification preserves the complete exact injected context beyond the old inner-guide limit', () => {
    const exact = `<tale-fairy-context>${'x'.repeat(7000)}</tale-fairy-context>`;
    const state = normalizeState({ lastRequestVerification: { status: 'confirmed', guidanceBlock: exact } });
    assert.equal(state.lastRequestVerification.guidanceBlock, exact);
});

test('provider-bound inclusion proof survives normalization before a reply returns', () => {
    const state = normalizeState({ lastRequestVerification: {
        status: 'included', verificationId: 'tf-1234-deadbeef', guidanceBlock: '<tale-fairy-context>exact</tale-fairy-context>',
        requestedAt: 100, chatId: 'chat-a', provider: 'deepseek', model: 'kimi-k3', depth: 1, conductorContract: null,
    } });
    assert.equal(state.lastRequestVerification.status, 'included');
    assert.equal(state.lastRequestVerification.verificationId, 'tf-1234-deadbeef');
    assert.equal(state.lastRequestVerification.depth, 1);
});

test('planner completion resets only the lightweight refresh schedule', () => {
    const state = applyPlannerAuthorLayer(analyzedState({ plannerSchedule: { turnsSincePlanner: 6 } }), { turnCount: 10, fingerprint: 'abc' });
    assert.equal(state.plannerSchedule.turnsSincePlanner, 0);
    assert.equal(state.plannerSchedule.lastPlannerTurn, 10);
    assert.equal(state.plannerSchedule.lastPlannerFingerprint, 'abc');
    assert.equal(state.beatDirective.operation, 'introduce');
});
