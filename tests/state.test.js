import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyPlannerAuthorLayer, buildPromptPayload, clearState, defaultState, fingerprintMessages,
    generationRetrySource, isAnalysisSourceCurrent, isDirectionCurrent, isGuidanceUsable, isReplacementVerificationCurrent, isStateAligned,
    loadState, normalizeState, returnedReplyMatchesVerification, saveState, STATE_KEY, STATE_VERSION, stateForPrompt,
} from '../extension/state.js';
import { formatBeatContract, normalizeBeatDirective, normalizeSceneProfile, selectBeatBranchIndex } from '../extension/beat-director.js';

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
                { when: 'The user leaves or declines the interaction.', operation: 'let the departure produce a grounded consequence', requiredEffect: 'Acknowledge the changed course without forcing the interaction to continue.', contentClass: 'consequence', scope: 'personal', intensity: 'low', quantity: 'singular', relativePower: 'none', plotWeight: 'incidental', duration: 'beat' },
                { when: 'The user redirects to someone or something else nearby.', operation: 'shift the social focus with the user', requiredEffect: 'Let the newly selected focus gain one meaningful response.', contentClass: 'reaction', scope: 'social', intensity: 'low', quantity: 'singular', relativePower: 'none', plotWeight: 'incidental', duration: 'beat' },
            ],
            contentClass: 'character', scope: 'social', intensity: 'low', quantity: 'singular', relativePower: 'none', plotWeight: 'incidental', duration: 'beat', preserve: ['ordinary canteen tone'], forbid: ['unrelated danger'], basis: 'A service interaction naturally involves staff.',
        },
        lastInject: true,
        lastAnalysisFingerprint: fingerprintMessages(messages), sourceMessageCount: messages.length, sourceChatId: 'chat-a',
    };
    return normalizeState({ ...beat, ...extra });
}

test('default and normalized state use the v56 horizon-aware external-reaction contract', () => {
    const state = normalizeState({ mode: 'invalid' });
    assert.equal(STATE_VERSION, 56);
    assert.equal(state.version, 56);
    assert.equal(state.mode, 'balanced');
    assert.equal(state.sceneProfile.phase, 'developing');
    assert.equal(state.beatDirective.operation, '');
    assert.deepEqual(state.horizonRadar, { status: 'none', seeds: [], audit: '' });
    assert.deepEqual(state.hiddenMotives, { status: 'none', items: [], audit: '' });
});

test('hidden motives remain open, ranked, and private across normalization and prompt payloads', () => {
    const state = normalizeState({ hidden_motives: {
        status: 'open',
        audit: 'The strongest causal explanation is listed first.',
        items: [
            { id: 'trait-recognition', actor: 'Supreme Chancellor', explanation: 'The office recognized an exceptional latent trait and expedited access before rivals could react.', likelihood: 'most-likely', evidence: ['The meeting was expedited.', 'The subject has an unusually high established trait.'], counterevidence: ['No direct confirmation yet.'], mechanism: 'The office can reorder its schedule and prioritize strategically valuable subjects.', current_relevance: 'drives-beat', disclosure: 'hidden', change: 'keep' },
            { id: 'novelty-only', actor: 'An unknown outside force', explanation: 'A dramatic but unsupported coincidence caused the appointment.', likelihood: 'wild-card', evidence: [], counterevidence: ['No scene clue points to this cause.'], mechanism: 'An unobserved intervention changes the schedule without visible preparation.', current_relevance: 'none', disclosure: 'hidden', change: 'keep' },
        ],
    } });
    assert.equal(state.hiddenMotives.status, 'open');
    assert.equal(state.hiddenMotives.items[0].likelihood, 'most-likely');
    assert.equal(state.hiddenMotives.items[1].likelihood, 'wild-card');
    const plannerState = stateForPrompt(state);
    assert.equal(plannerState.hiddenMotives.items[0].actor, 'Supreme Chancellor');
    const payload = buildPromptPayload({ ...state, lastInject: true }, { guidanceUsable: true });
    assert.doesNotMatch(payload, /Supreme Chancellor|trait-recognition|outside force|wild-card/i);
});

test('hidden motive normalization enforces likelihood rank while preserving order within a tier', () => {
    const motive = (id, likelihood) => ({
        id, actor: `Actor ${id}`, explanation: `Explanation ${id}.`, likelihood,
        evidence: [], counterevidence: [], mechanism: `Mechanism ${id}.`,
        current_relevance: 'background', disclosure: 'hidden', change: 'keep',
    });
    const state = normalizeState({ hiddenMotives: {
        status: 'open',
        items: [
            motive('possible-first', 'possible'),
            motive('likely-first', 'likely'),
            motive('established', 'established'),
            motive('wild-card', 'wild-card'),
            motive('likely-second', 'likely'),
            motive('contradicted', 'contradicted'),
        ],
    } });
    assert.deepEqual(state.hiddenMotives.items.map(item => item.id), [
        'established', 'likely-first', 'likely-second', 'possible-first', 'wild-card', 'contradicted',
    ]);
});

test('horizon radar normalizes bounded optional long-range hypotheses', () => {
    const state = normalizeState({ horizonRadar: {
        status: 'developing', audit: 'Independent long-range paths remain open.',
        seeds: [
            { id: 'career', kind: 'detected', trajectory: 'Present work could reshape a future vocation.', engine: 'accumulated professional commitments', scale: 'months-years', condition: 'The work continues to matter.', basis: 'Repeated work decisions are established.', present_relation: 'advance', change: 'keep' },
            { id: 'community', kind: 'original', trajectory: 'A wider community role could emerge.', engine: 'institutional recognition', scale: 'open-ended', condition: 'Compatible public involvement develops.', basis: 'Private compatible speculation.', present_relation: 'none', change: 'replace' },
        ],
    } });
    assert.equal(state.horizonRadar.status, 'developing');
    assert.deepEqual(state.horizonRadar.seeds.map(seed => seed.scale), ['months-years', 'open-ended']);
    assert.deepEqual(state.horizonRadar.seeds.map(seed => seed.presentRelation), ['advance', 'none']);
    assert.equal(normalizeState({ horizonRadar: { status: 'developing', seeds: [] } }).horizonRadar.status, 'none');
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

test('v51 use-none direction is invalidated before the always-contributing contract runs', () => {
    const old = analyzedState();
    const state = normalizeState({ ...old, version: 51 });
    assert.equal(state.lastInject, false);
    assert.equal(state.beatDirective.operation, '');
    assert.equal(state.lastRequestVerification, null);
});

test('v52 outcome-capping direction is invalidated before external-reaction guidance runs', () => {
    const old = analyzedState();
    const state = normalizeState({
        ...old,
        version: 52,
        beatDirective: {
            ...old.beatDirective,
            requiredEffect: 'Make a limited change without granting unrestricted access.',
        },
        lastRequestVerification: { status: 'confirmed', guidanceBlock: '<tale-fairy-context>old capped guidance</tale-fairy-context>' },
    });
    assert.equal(state.lastInject, false);
    assert.equal(state.beatDirective.operation, '');
    assert.equal(state.lastRequestVerification, null);
});

test('v53 user-action inference is invalidated before external-reaction guidance runs', () => {
    const old = analyzedState();
    const state = normalizeState({
        ...old,
        version: 53,
        lastRequestVerification: { status: 'confirmed', guidanceBlock: '<tale-fairy-context>old target-inference guidance</tale-fairy-context>' },
    });
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
    const compact = stateForPrompt(analyzedState({
        objectives: [{ title: 'Old' }], pathways: [{ id: 'old' }], narrativeEvents: [{ id: 'old' }],
        horizonRadar: { status: 'latent', audit: 'A genuine horizon remains optional.', seeds: [{ id: 'future', kind: 'original', trajectory: 'A distant institutional role remains possible.', engine: 'institutional invitation', scale: 'months-years', condition: 'A compatible invitation develops.', basis: 'Private speculation.', presentRelation: 'none', change: 'keep' }] },
    }));
    assert.equal(compact.sceneProfile.promise, 'A grounded canteen interaction.');
    assert.equal(compact.beatDirective.operation, 'introduce');
    for (const key of ['objectives', 'possibilities', 'pathways', 'nextGuides', 'planHorizons', 'narrativeEvents', 'authorBoard', 'conductor']) assert.equal(Object.hasOwn(compact, key), false, key);
    assert.equal(compact.horizonRadar.seeds[0].id, 'future');
});

test('analyzed guidance remains ready for one user action and expires afterward', () => {
    const state = analyzedState();
    assert.equal(isStateAligned(state, messages, 'chat-a'), true);
    assert.equal(isGuidanceUsable(state, messages, 'chat-a'), true);
    const oneUserAction = [...messages, { is_user: true, mes: 'Actually, I leave.' }];
    assert.equal(isStateAligned(state, oneUserAction, 'chat-a'), false);
    assert.equal(isDirectionCurrent(state, oneUserAction, 'chat-a'), true);
    assert.equal(isGuidanceUsable(state, oneUserAction, 'chat-a'), true);
    assert.equal(isGuidanceUsable(state, [...oneUserAction, { is_user: false, mes: 'The room responds.' }], 'chat-a'), false);
    assert.equal(isGuidanceUsable(state, [...oneUserAction, { is_user: true, mes: 'A second unmatched action.' }], 'chat-a'), false);
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

test('legacy non-injection state is never exposed as usable guidance', () => {
    const state = analyzedState({
        lastInject: false,
        beatDirective: { ...analyzedState().beatDirective, inject: false, injectReason: 'Legacy planner output.' },
    });
    assert.equal(isDirectionCurrent(state, messages, 'chat-a'), true);
    assert.equal(isGuidanceUsable(state, messages, 'chat-a'), false);
    assert.equal(buildPromptPayload(state, { guidanceUsable: true }), '');
});

test('analyzed injection governs only NPC and world follow-through', () => {
    const payload = buildPromptPayload(analyzedState(), {
        guidanceUsable: true,
        directorSample: { mode: 'fun', intervention: 'major', novelty: 'surprising', fortune: 'favorable' },
    });
    assert.match(payload, /TALE FAIRY EXTERNAL-REACTION GUIDE/i);
    assert.match(payload, /user action is outside Tale Fairy’s authority/i);
    assert.match(payload, /Do not use this guide to infer, reinterpret, expand, narrow, relocate, complete, substitute, or judge the user action/i);
    assert.match(payload, /Tale Fairy begins only with what NPCs or the surrounding world do in response/i);
    assert.match(payload, /SELF-PROPELLING MOVEMENT/i);
    assert.match(payload, /exists independently of any player reply/i);
    assert.match(payload, /dialogue-centered scenes/i);
    assert.doesNotMatch(payload, /interrogat/i);
    assert.match(payload, /PRIMARY WHEN: The user continues the service interaction\./i);
    assert.match(payload, /PRIMARY NEXT-STEP DIRECTION: Introduce\./i);
    assert.match(payload, /PRIMARY NEXT-STEP EFFECT: Let the routine interaction produce a small but observable development that opens a fresh possibility\./i);
    assert.match(payload, /select exactly one closest-fitting branch for external forward motion/i);
    assert.doesNotMatch(payload, /ALTERNATIVE 1 WHEN:|ALTERNATIVE 2 WHEN:/i);
    assert.match(payload, /ignore them and let the main roleplay instructions govern the response/i);
    assert.match(payload, /FUN TREATMENT:.*prominent, lively expression.*without touching the user action/i);
    assert.doesNotMatch(payload, /movement=|content=|scope=|intensity=|plot weight=/i);
    assert.doesNotMatch(payload, /PRESERVE:|DO NOT:/);
    assert.doesNotMatch(payload, /A grounded canteen interaction/);
    assert.doesNotMatch(payload, /Infer every concrete action|Treat explicit user\/OOC|Do not expose/i);
    assert.doesNotMatch(payload, /SUGGESTED ROUTE|future horizon|delivery debt/i);
    assert.equal(payload.match(/(?:PRIMARY|ALTERNATIVE \d) NEXT-STEP DIRECTION:/g)?.length, 1);
    assert.match(payload, /govern only NPC or world follow-through/i);
    assert.doesNotMatch(payload, /infer the natural target|minimal implied positioning/i);
    assert.doesNotMatch(payload, /only partially resolvable|resolution ceiling|institutional in scope|low in intensity/i);
});

test('compiler neutralizes planner-authored outcome caps before provider injection', () => {
    const capped = analyzedState().beatDirective;
    const payload = formatBeatContract({}, {
        ...capped,
        operation: 'honor the contact with a restrained acknowledgement',
        requiredEffect: 'Make a limited change in availability without granting unrestricted access.',
        alternatives: [
            { ...capped.alternatives[0], operation: 'let the established boundary answer firmly but leave one narrower way', requiredEffect: 'Delay a full response while keeping access restricted.' },
            capped.alternatives[1],
        ],
    });
    assert.doesNotMatch(payload, /limited change|unrestricted access|boundary answer|narrower way|keeping access restricted/i);
    assert.match(payload, /let an NPC or the world respond directly and create the natural next step/i);
    assert.match(payload, /external response observable and open a meaningful next change/i);
});

test('terse-action contract leaves every part of the user action to the main roleplay prompt', () => {
    const payload = formatBeatContract({}, analyzedState().beatDirective);
    assert.match(payload, /user action is outside Tale Fairy’s authority/i);
    assert.match(payload, /Do not use this guide to infer, reinterpret, expand, narrow, relocate, complete, substitute, or judge/i);
    assert.match(payload, /begins only with what NPCs or the surrounding world do in response/i);
    assert.match(payload, /If every branch would affect the user action.*ignore them/is);
    assert.doesNotMatch(payload, /infer the natural target|minimal implied positioning/i);
});

test('sparse compiler omits default scale fields but retains a balanced required effect', () => {
    const payload = formatBeatContract({}, {
        inject: true, operation: 'let the ordinary answer open an unforeseen possibility', primaryWhen: 'The user remains with the current exchange.', requiredEffect: 'Make a compatible change observable without prescribing how.',
        alternatives: analyzedState().beatDirective.alternatives,
        contentClass: 'none', scope: 'personal', intensity: 'none', quantity: 'none', relativePower: 'none', plotWeight: 'none', duration: 'beat',
    });
    assert.match(payload, /PRIMARY NEXT-STEP DIRECTION: Let the ordinary answer open an unforeseen possibility\./);
    assert.match(payload, /PRIMARY NEXT-STEP EFFECT: Make a compatible change observable without prescribing how\./);
    assert.match(payload, /BALANCED TREATMENT: Give the NPC or world follow-through a clear, meaningful effect/);
    assert.match(payload, /govern only NPC or world follow-through/);
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
    assert.match(payload, /PRIMARY NEXT-STEP DIRECTION: Deepen through personal cost\./i);
    assert.match(payload, /PRIMARY NEXT-STEP EFFECT: Make a personal cost alter the immediate emotional stakes\./);
    assert.doesNotMatch(payload, /character-focused|moderate in intensity|connective to the ongoing story/i);
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
    assert.match(payload, /PRIMARY NEXT-STEP DIRECTION: Complicate\./i);
    assert.match(payload, /PRIMARY NEXT-STEP EFFECT: Create a credible complication that changes how the calm outing can proceed\./i);
    assert.doesNotMatch(payload, /Lucia|the unhurried garden visit/);
});

test('analyzed quiet beats reach the provider without a generic sampled overlay', () => {
    const payload = formatBeatContract({}, { ...analyzedState().beatDirective, operation: 'deepen', requiredEffect: 'Let the quiet interaction settle into comfortable companionship without a new incident.' }, { directorSample: { mode: 'fun', intervention: 'major', novelty: 'surprising', fortune: 'mixed' } });
    assert.match(payload, /PRIMARY NEXT-STEP DIRECTION: Deepen\./);
    assert.match(payload, /PRIMARY NEXT-STEP EFFECT: Let the quiet interaction settle into comfortable companionship without a new incident\./i);
    assert.match(payload, /FUN TREATMENT:/);
    assert.doesNotMatch(payload, /fresh possibilities|difficulty|danger/i);
});

test('major adverse sampling cannot replace a scene-selected breather with complication', () => {
    const payload = formatBeatContract({}, { ...analyzedState().beatDirective, operation: 'deepen', requiredEffect: 'Settle into a peaceful garden reading spot without a new incident.' }, {
        directorSample: { mode: 'fun', intervention: 'major', novelty: 'surprising', fortune: 'adverse' },
    });
    assert.match(payload, /PRIMARY NEXT-STEP DIRECTION: Deepen\./);
    assert.match(payload, /PRIMARY NEXT-STEP EFFECT: Settle into a peaceful garden reading spot without a new incident\./i);
    assert.doesNotMatch(payload, /adversity|difficulty|danger|Increase the active pressure/i);
});

test('analyzed beat keeps AI invention open across context-native scene scales', () => {
    const payload = formatBeatContract({}, { ...analyzedState().beatDirective, operation: 'introduce', requiredEffect: 'Introduce a compatible development grounded in the present setting.' });
    assert.match(payload, /PRIMARY NEXT-STEP DIRECTION: Introduce\./);
    assert.match(payload, /PRIMARY NEXT-STEP EFFECT: Introduce a compatible development grounded in the present setting\./i);
    assert.equal(payload.split('\n').length, 9);
});

test('provider contract protects player agency without exposing planner evidence', () => {
    const payload = formatBeatContract(analyzedState().sceneProfile, analyzedState().beatDirective);
    assert.match(payload, /never control the player character/i);
    assert.doesNotMatch(payload, /explicit user\/OOC|Use the analyzed beat|Do not expose/i);
});

test('regeneration reuses the same conditional set without rotating branches', () => {
    const payload = buildPromptPayload(analyzedState(), { guidanceUsable: true, regeneration: true });
    assert.doesNotMatch(payload, /For this regeneration|different realization|context-compatible development/i);
    assert.match(payload, /PRIMARY NEXT-STEP EFFECT: Let the routine interaction produce/i);
    assert.doesNotMatch(payload, /ALTERNATIVE 1 WHEN:|ALTERNATIVE 2 WHEN:/i);
    assert.doesNotMatch(payload, /rotate|next route/i);
});

test('provider injection selects one deterministic weighted branch while alternatives remain available to callers', () => {
    const beat = analyzedState().beatDirective;
    const first = selectBeatBranchIndex(beat, 11, 'balanced');
    assert.equal(first, selectBeatBranchIndex(beat, 11, 'balanced'));
    assert.ok(first >= 0 && first <= 2);
    const counts = [0, 0, 0];
    for (let seed = 0; seed < 1000; seed += 1) counts[selectBeatBranchIndex(beat, seed, 'balanced')] += 1;
    assert.ok(counts[0] > counts[1] && counts[0] > counts[2], counts);
    const payload = formatBeatContract({}, beat, { branchIndex: 2 });
    assert.match(payload, /ALTERNATIVE 2 NEXT-STEP DIRECTION:/i);
    assert.match(payload, /ALTERNATIVE 2 NEXT-STEP EFFECT:/i);
    assert.doesNotMatch(payload, /PRIMARY NEXT-STEP DIRECTION:|ALTERNATIVE 1 NEXT-STEP DIRECTION:/i);
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

test('replacement verification rejects an edited transcript with the same message count', () => {
    const base = [{ is_user: true, mes: 'Stay in the library.' }];
    const original = [...base, { is_user: false, mes: 'Original reply.' }];
    const edited = [{ is_user: true, mes: 'Leave the library.' }, original[1]];
    const verification = {
        status: 'confirmed', chatId: 'chat-a', responseMessageCount: original.length,
        replacementGeneration: true, sourceFingerprint: fingerprintMessages(base),
    };
    assert.equal(isReplacementVerificationCurrent(verification, original, 'chat-a'), true);
    assert.equal(isReplacementVerificationCurrent(verification, base, 'chat-a'), true);
    assert.equal(isReplacementVerificationCurrent(verification, edited, 'chat-a'), false);
});

test('normal response archives remain valid for replacement generation', () => {
    const base = [{ is_user: true, mes: 'Continue.' }];
    const response = [...base, { is_user: false, mes: 'Original reply.' }];
    const verification = {
        status: 'confirmed', chatId: 'chat-a', responseMessageCount: response.length,
        replacementGeneration: false, sourceFingerprint: fingerprintMessages(base),
    };
    assert.equal(isReplacementVerificationCurrent(verification, response, 'chat-a'), true);
});

test('request verification preserves a weighted director sample without fabricating one for legacy records', () => {
    const legacy = normalizeState({ lastRequestVerification: { status: 'confirmed', guidanceBlock: '<living-world-guide>old</living-world-guide>' } });
    assert.equal(legacy.lastRequestVerification.runtimeVersion, '');
    assert.equal(legacy.lastRequestVerification.directorSample, null);
    assert.equal(legacy.lastRequestVerification.directorSeed, null);
    const current = normalizeState({ lastRequestVerification: {
        status: 'confirmed', runtimeVersion: '0.12.1', guidanceBlock: '<living-world-guide>current</living-world-guide>', directorSeed: 0,
        directorSample: { mode: 'fun', intervention: 'major', novelty: 'surprising', fortune: 'mixed' },
    } });
    assert.deepEqual(current.lastRequestVerification.directorSample, { mode: 'fun', intervention: 'major', novelty: 'surprising', fortune: 'mixed' });
    assert.equal(current.lastRequestVerification.runtimeVersion, '0.12.1');
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
