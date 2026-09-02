import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyPlannerAuthorLayer, buildPromptPayload, clearState, defaultState, fingerprintMessages,
    generationRetrySource, isAnalysisSourceCurrent, isDirectionCurrent, isGuidanceUsable, isReplacementVerificationCurrent, isStateAligned,
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
        beatDirective: {
            operation: 'introduce', primaryWhen: 'The user continues the service interaction.', target: 'the service interaction', requiredEffect: 'Let the routine interaction produce a small but observable development that opens a fresh possibility.',
            alternatives: [
                { when: 'The user leaves or declines the interaction.', operation: 'let the departure produce a grounded consequence', requiredEffect: 'Acknowledge the changed course without forcing the interaction to continue.', contentClass: 'consequence', scope: 'personal', intensity: 'low', quantity: 'singular', relativePower: 'none', plotWeight: 'incidental', duration: 'beat', resolutionCeiling: 'local' },
                { when: 'The user redirects to someone or something else nearby.', operation: 'shift the social focus with the user', requiredEffect: 'Let the newly selected focus gain one meaningful response.', contentClass: 'reaction', scope: 'social', intensity: 'low', quantity: 'singular', relativePower: 'none', plotWeight: 'incidental', duration: 'beat', resolutionCeiling: 'open' },
            ],
            contentClass: 'character', scope: 'social', intensity: 'low', quantity: 'singular', relativePower: 'none', plotWeight: 'incidental', duration: 'beat', resolutionCeiling: 'local', preserve: ['ordinary canteen tone'], forbid: ['unrelated danger'], basis: 'A service interaction naturally involves staff.',
        },
        lastInject: true,
        lastAnalysisFingerprint: fingerprintMessages(messages), sourceMessageCount: messages.length, sourceChatId: 'chat-a',
    };
    return normalizeState({ ...beat, ...extra });
}

test('default and normalized state use the v51 conditional-set planner contract', () => {
    const state = normalizeState({ mode: 'invalid' });
    assert.equal(STATE_VERSION, 51);
    assert.equal(state.version, 51);
    assert.equal(state.mode, 'balanced');
    assert.equal(state.sceneProfile.phase, 'developing');
    assert.equal(state.beatDirective.operation, '');
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
    assert.equal(normalizeBeatDirective({ operation: 'let the shared joke turn unexpectedly tender' }).operation, 'let the shared joke turn unexpectedly tender');
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
    assert.equal(state.beatDirective.alternatives.length, 2);
});

test('v50 single-beat state is invalidated instead of reused as conditional guidance', () => {
    const old = analyzedState();
    const state = normalizeState({ ...old, version: 50, beatDirective: { ...old.beatDirective, alternatives: [] } });
    assert.equal(state.lastInject, false);
    assert.equal(state.beatDirective.operation, '');
    assert.equal(state.lastRequestVerification, null);
});

test('pre-v50 migration discards private-style required effects but preserves continuity evidence', () => {
    const state = normalizeState({
        ...analyzedState(), version: 49, lastInject: true,
        canonConstraints: ['A private established fact remains available to the planner.'],
        beatDirective: { ...analyzedState().beatDirective, requiredEffect: 'Old provider-visible direction.' },
        lastRequestVerification: { status: 'confirmed', guidanceBlock: '<tale-fairy-context>old leak</tale-fairy-context>' },
    });
    assert.equal(state.lastInject, false);
    assert.equal(state.beatDirective.requiredEffect, '');
    assert.equal(state.lastRequestVerification, null);
    assert.equal(state.sceneProfile.promise, 'A grounded canteen interaction.');
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
    const assistantAppended = [...messages, { is_user: false, mes: 'A discarded answer.' }];
    assert.equal(isAnalysisSourceCurrent(fingerprint, messages.length, assistantAppended), false);
    assert.equal(isAnalysisSourceCurrent(fingerprint, messages.length, assistantAppended, { allowOneAssistantAppend: true }), true);
});

test('necessity gate keeps a current private direction while injecting nothing', () => {
    const state = analyzedState({
        lastInject: false,
        beatDirective: { ...analyzedState().beatDirective, inject: false, injectReason: 'The user action already determines the immediate response.' },
    });
    assert.equal(isDirectionCurrent(state, messages, 'chat-a'), true);
    assert.equal(isGuidanceUsable(state, messages, 'chat-a'), false);
    assert.equal(buildPromptPayload(state, { guidanceUsable: true }), '');
});

test('analyzed injection makes its general effect binding with the selected mode', () => {
    const payload = buildPromptPayload(analyzedState(), {
        guidanceUsable: true,
        directorSample: { mode: 'fun', intervention: 'major', novelty: 'surprising', fortune: 'favorable' },
    });
    assert.match(payload, /CONDITIONAL TALE FAIRY DIRECTION SET/i);
    assert.match(payload, /PRIMARY WHEN: The user continues the service interaction\./i);
    assert.match(payload, /PRIMARY DIRECTION: Introduce, keeping the development character-focused, social in scope, low in intensity/i);
    assert.match(payload, /PRIMARY REQUIRED EFFECT: Let the routine interaction produce a small but observable development that opens a fresh possibility\./i);
    assert.match(payload, /ALTERNATIVE 1 WHEN: The user leaves or declines the interaction\./i);
    assert.match(payload, /If no WHEN condition fits, use none/i);
    assert.match(payload, /FUN TREATMENT:.*prominent, lively expression.*bold or surprising realization/i);
    assert.doesNotMatch(payload, /movement=|content=|scope=|intensity=|plot weight=/i);
    assert.doesNotMatch(payload, /PRESERVE:|DO NOT:/);
    assert.doesNotMatch(payload, /A grounded canteen interaction/);
    assert.doesNotMatch(payload, /Infer every concrete action|Treat explicit user\/OOC|Do not expose/i);
    assert.doesNotMatch(payload, /SUGGESTED ROUTE|future horizon|delivery debt/i);
    assert.equal(payload.match(/PRIMARY DIRECTION:/g)?.length, 1);
    assert.equal(payload.match(/ALTERNATIVE \d DIRECTION:/g)?.length, 2);
    assert.match(payload, /treat only its direction and required effect as binding/i);
});

test('sparse compiler omits default scale fields but retains a balanced required effect', () => {
    const payload = formatBeatContract({}, {
        inject: true, operation: 'let the ordinary answer open an unforeseen possibility', primaryWhen: 'The user remains with the current exchange.', requiredEffect: 'Make a compatible change observable without prescribing how.',
        alternatives: analyzedState().beatDirective.alternatives,
        contentClass: 'none', scope: 'personal', intensity: 'none', quantity: 'none', relativePower: 'none', plotWeight: 'none', duration: 'beat', resolutionCeiling: 'open',
    });
    assert.match(payload, /PRIMARY DIRECTION: Let the ordinary answer open an unforeseen possibility\./);
    assert.match(payload, /PRIMARY REQUIRED EFFECT: Make a compatible change observable without prescribing how\./);
    assert.match(payload, /BALANCED TREATMENT: Make the required effect clear and meaningful/);
    assert.match(payload, /freely choosing their context-compatible concrete realization/);
});

test('scene-aware movement becomes general natural direction rather than field syntax', () => {
    const payload = formatBeatContract({}, {
        ...analyzedState().beatDirective,
        operation: 'deepen through personal cost',
        requiredEffect: 'Make a personal cost alter the immediate emotional stakes.',
        contentClass: 'character',
        intensity: 'moderate',
        plotWeight: 'connective',
    });
    assert.match(payload, /PRIMARY DIRECTION: Deepen through personal cost, keeping the development character-focused.*moderate in intensity.*connective to the ongoing story/i);
    assert.match(payload, /PRIMARY REQUIRED EFFECT: Make a personal cost alter the immediate emotional stakes\./);
    assert.doesNotMatch(payload, /movement=|content=|intensity=|plot weight=/i);
});

test('provider compiler exposes a general observable effect but keeps its target private', () => {
    const state = analyzedState();
    state.beatDirective = normalizeBeatDirective({
        ...state.beatDirective,
        operation: 'complicate',
        target: 'Lucia during the unhurried garden visit',
        requiredEffect: 'Create a credible complication that changes how the calm outing can proceed.',
    });
    const payload = buildPromptPayload(state, {
        guidanceUsable: true,
        directorSample: { mode: 'balanced', intervention: 'major', novelty: 'grounded', fortune: 'adverse' },
    });
    assert.match(payload, /PRIMARY DIRECTION: Complicate, keeping the development character-focused, social in scope, low in intensity/i);
    assert.match(payload, /PRIMARY REQUIRED EFFECT: Create a credible complication that changes how the calm outing can proceed\./i);
    assert.doesNotMatch(payload, /Lucia|the unhurried garden visit/);
});

test('analyzed quiet beats reach the provider without a generic sampled overlay', () => {
    const payload = formatBeatContract({}, { ...analyzedState().beatDirective, operation: 'deepen', requiredEffect: 'Let the quiet interaction settle into comfortable companionship without a new incident.' }, { directorSample: { mode: 'fun', intervention: 'major', novelty: 'surprising', fortune: 'mixed' } });
    assert.match(payload, /PRIMARY DIRECTION: Deepen,/);
    assert.match(payload, /PRIMARY REQUIRED EFFECT: Let the quiet interaction settle into comfortable companionship without a new incident\./i);
    assert.match(payload, /FUN TREATMENT:/);
    assert.doesNotMatch(payload, /fresh possibilities|difficulty|danger/i);
});

test('major adverse sampling cannot replace a scene-selected breather with complication', () => {
    const payload = formatBeatContract({}, { ...analyzedState().beatDirective, operation: 'deepen', requiredEffect: 'Settle into a peaceful garden reading spot without a new incident.' }, {
        directorSample: { mode: 'fun', intervention: 'major', novelty: 'surprising', fortune: 'adverse' },
    });
    assert.match(payload, /PRIMARY DIRECTION: Deepen,/);
    assert.match(payload, /PRIMARY REQUIRED EFFECT: Settle into a peaceful garden reading spot without a new incident\./i);
    assert.doesNotMatch(payload, /adversity|difficulty|danger|Increase the active pressure/i);
});

test('analyzed beat keeps AI invention open across context-native scene scales', () => {
    const payload = formatBeatContract({}, { ...analyzedState().beatDirective, operation: 'introduce', requiredEffect: 'Introduce a compatible development grounded in the present setting.' });
    assert.match(payload, /PRIMARY DIRECTION: Introduce,/);
    assert.match(payload, /PRIMARY REQUIRED EFFECT: Introduce a compatible development grounded in the present setting\./i);
    assert.equal(payload.split('\n').length, 12);
});

test('provider contract protects player agency without exposing planner evidence', () => {
    const payload = formatBeatContract(analyzedState().sceneProfile, analyzedState().beatDirective);
    assert.match(payload, /Do not decide the player character's dialogue, thoughts, feelings, consent, choices, or reactions/i);
    assert.doesNotMatch(payload, /explicit user\/OOC|Use the analyzed beat|Do not expose/i);
});

test('regeneration reuses the same conditional set without rotating branches', () => {
    const payload = buildPromptPayload(analyzedState(), { guidanceUsable: true, regeneration: true });
    assert.doesNotMatch(payload, /For this regeneration|different realization|context-compatible development/i);
    assert.match(payload, /PRIMARY REQUIRED EFFECT: Let the routine interaction produce/i);
    assert.match(payload, /ALTERNATIVE 2 WHEN:/i);
    assert.doesNotMatch(payload, /rotate|next route/i);
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

test('replacement verification is usable only for the exact discarded response', () => {
    const messages = [{ is_user: true, mes: 'Prompt' }, { is_user: false, mes: 'Reply' }];
    const verification = { status: 'confirmed', chatId: 'chat-a', responseMessageCount: 2 };
    assert.equal(isReplacementVerificationCurrent(verification, messages, 'chat-a'), true);
    assert.equal(isReplacementVerificationCurrent(verification, messages.slice(0, -1), 'chat-a'), true);
    assert.equal(isReplacementVerificationCurrent(verification, [...messages, { is_user: true, mes: 'Later' }], 'chat-a'), false);
    assert.equal(isReplacementVerificationCurrent({ ...verification, status: 'included' }, messages, 'chat-a'), false);
    assert.equal(isReplacementVerificationCurrent(verification, messages, 'chat-b'), false);
});

test('request verification preserves a weighted director sample without fabricating one for legacy records', () => {
    const legacy = normalizeState({ lastRequestVerification: { status: 'confirmed', guidanceBlock: '<living-world-guide>old</living-world-guide>' } });
    assert.equal(legacy.lastRequestVerification.runtimeVersion, '');
    assert.equal(legacy.lastRequestVerification.directorSample, null);
    assert.equal(legacy.lastRequestVerification.directorSeed, null);
    const current = normalizeState({ lastRequestVerification: {
        status: 'confirmed', runtimeVersion: '0.12.0', guidanceBlock: '<living-world-guide>current</living-world-guide>', directorSeed: 0,
        directorSample: { mode: 'fun', intervention: 'major', novelty: 'surprising', fortune: 'mixed' },
    } });
    assert.deepEqual(current.lastRequestVerification.directorSample, { mode: 'fun', intervention: 'major', novelty: 'surprising', fortune: 'mixed' });
    assert.equal(current.lastRequestVerification.runtimeVersion, '0.12.0');
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

test('provider-bound no-injection decision survives normalization without a fabricated block', () => {
    const state = normalizeState({ lastRequestVerification: {
        status: 'included', injectionDecision: 'skip', verificationId: 'tf-skip', guidanceBlock: '', chatId: 'chat-a',
    } });
    assert.equal(state.lastRequestVerification.injectionDecision, 'skip');
    assert.equal(state.lastRequestVerification.guidanceBlock, '');
});

test('planner completion resets only the lightweight refresh schedule', () => {
    const state = applyPlannerAuthorLayer(analyzedState({ plannerSchedule: { turnsSincePlanner: 6 } }), { turnCount: 10, fingerprint: 'abc' });
    assert.equal(state.plannerSchedule.turnsSincePlanner, 0);
    assert.equal(state.plannerSchedule.lastPlannerTurn, 10);
    assert.equal(state.plannerSchedule.lastPlannerFingerprint, 'abc');
    assert.equal(state.beatDirective.operation, 'introduce');
});
