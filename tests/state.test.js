import test from 'node:test';
import assert from 'node:assert/strict';
import {
    STATE_KEY, STATE_VERSION, buildPromptPayload, clearState, defaultState, fingerprintMessages,
    generationRetrySource, isDirectionCurrent, isGuidanceUsable, isReplacementVerificationCurrent,
    loadState, normalizeState, reconcileContinuityThreads, returnedReplyMatchesVerification, saveState,
    stateForPrompt,
} from '../extension/state.js';
import {
    CAUSAL_KINDS, formatCausalContext, hasUsableCausalContext, normalizeCausalContext, providerCausalConditions,
} from '../extension/causal-context.js';

const conditions = [
    { id: 'mira', kind: 'actor', subject: 'Mira', condition: 'suspects the report is false', disclosure: 'private', confidence: 'strong', relevance: 'She is present.' },
    { id: 'grain', kind: 'system', subject: 'Grain reserves', condition: 'are falling faster than reported', disclosure: 'limited', confidence: 'established', relevance: 'Policy depends on them.' },
    { id: 'rumor', kind: 'group', subject: 'Merchants', condition: 'may be testing the cabinet', disclosure: 'private', confidence: 'tentative', relevance: 'They handle shipments.' },
];
function analyzed(messages = [{ is_user: false, mes: 'The figures conflict.' }]) {
    const state = defaultState();
    state.scene.status = 'The cabinet reviews the report.';
    state.sceneProfile.promise = 'An open cabinet discussion.';
    state.causalContext = normalizeCausalContext({ conditions, inject: true, injectReason: 'Current causes.', basis: 'Records.' });
    state.lastInject = true;
    state.lastAnalysisFingerprint = fingerprintMessages(messages);
    state.sourceMessageCount = messages.length;
    state.sourceChatId = 'chat';
    return state;
}

test('default state uses the v58 deferred-world contract', () => {
    const state = defaultState();
    assert.equal(state.version, STATE_VERSION);
    assert.equal(STATE_VERSION, 58);
    assert.deepEqual(state.causalContext.conditions, []);
    assert.equal(state.causalContext.inject, false);
    assert.deepEqual(state.offscreenWorld, { subjects: [], archive: [], elapsed: '', settledThrough: 0, audit: '' });
});

test('normalization bounds clean causal records and rejects incomplete ones', () => {
    const many = [...conditions, ...Array.from({ length: 8 }, (_, i) => ({ ...conditions[0], id: `x${i}`, subject: `Actor ${i}` }))];
    const value = normalizeCausalContext({ conditions: [...many, { id: '', subject: 'Bad', condition: 'exists', relevance: 'now' }], inject: true });
    assert.equal(value.conditions.length, 6);
    assert.equal(value.conditions[0].kind, 'actor');
});

test('causal context represents towns, places, resources, and situations without generic coercion', () => {
    for (const kind of ['community', 'place', 'resource', 'situation']) assert.ok(CAUSAL_KINDS.includes(kind));
    const value = normalizeCausalContext({
        conditions: ['community', 'place', 'resource', 'situation'].map((kind, index) => ({
            ...conditions[0], id: `adaptive-${index}`, kind, subject: `${kind} subject`,
        })),
        inject: true,
    });
    assert.deepEqual(value.conditions.map(item => item.kind), ['community', 'place', 'resource', 'situation']);
});

test('tentative conditions remain private while strong and established ones inject', () => {
    assert.equal(providerCausalConditions({ conditions }).length, 2);
    assert.equal(hasUsableCausalContext({ conditions, inject: true }), true);
    assert.equal(hasUsableCausalContext({ conditions: [conditions[2]], inject: true }), false);
});

test('knowledge routes survive storage without promoting beliefs or leaking private hypotheses', () => {
    const state = analyzed();
    state.causalContext.conditions[0] = { ...state.causalContext.conditions[0], knownBy: ['Mira'], learnedFrom: 'Her own comparison of two ledgers' };
    const restored = loadState(JSON.parse(JSON.stringify(saveState({}, state))));
    assert.deepEqual(restored.causalContext.conditions[0].knownBy, ['Mira']);
    const output = formatCausalContext(restored.causalContext);
    assert.match(output, /Mira suspects the report is false/);
    assert.match(output, /Known to: Mira; others need an in-world learning route/);
    assert.match(output, /Her own comparison of two ledgers/);
    assert.match(output, /belief, not objective truth/);
    assert.doesNotMatch(output, /Merchants/);
    assert.deepEqual(normalizeCausalContext({ conditions }).conditions[0].knownBy, []);
});

test('quiet-scene guidance values meaningful progress without forcing conflict or player emotions', () => {
    const output = formatCausalContext({ conditions: [{ ...conditions[0], subject: 'Lucia', condition: 'is finishing the shared tea ritual', disclosure: 'open' }], inject: true }, { sceneProfile: { phase: 'landing', intrusion: 'closed', noveltyCeiling: 'none' } });
    assert.match(output, /Rest, silence, routine, and a scene landing are valid/);
    assert.match(output, /decorative motion alone are not progress/);
    assert.match(output, /do not manufacture a disruption or assign the player a new feeling/);
    assert.match(output, /latest explicit user\/OOC request to stay, skip, or advance outranks/);
});

test('formatter exposes natural-language causes without internal metadata', () => {
    const output = formatCausalContext({ conditions, inject: true }, { mode: 'balanced' });
    assert.match(output, /Mira suspects the report is false\./);
    assert.match(output, /Grain reserves are falling faster than reported\./);
    assert.doesNotMatch(output, /Merchants|confidence|relevance|"id"|mira/);
    assert.match(output, /writing model chooses every concrete action/i);
    assert.match(output, /self-propelling movement/i);
    assert.match(output, /every reply changes the current situation/i);
    assert.match(output, /remaining in the same scene or activity/i);
    assert.match(output, /Dialogue contributes when it changes what is known, decided, possible, or underway/i);
    assert.doesNotMatch(output, /question|interrogat/i);
});

test('private disclosure shapes behavior without requiring revelation', () => {
    const output = formatCausalContext({ conditions: [conditions[0]], inject: true });
    assert.match(output, /Private conditions/);
    assert.match(output, /unless disclosure becomes natural in-world/i);
});

test('v56 migration clears prescribed beats rather than treating them as causes', () => {
    const state = normalizeState({ version: 56, beatDirective: { inject: true, requiredEffect: 'Make Mira accuse the minister.' }, lastInject: true });
    assert.equal(state.causalContext.conditions.length, 0);
    assert.equal(state.lastInject, false);
    assert.equal(state.beatDirective, undefined);
});

test('v57 migration preserves its causal slice and initializes deferred world state', () => {
    const state = normalizeState({ ...analyzed(), version: 57 });
    assert.equal(state.causalContext.conditions[0].subject, 'Mira');
    assert.equal(state.causalContext.inject, true);
    assert.deepEqual(state.offscreenWorld.subjects, []);
});

test('v58 state normalizes and retains private offscreen debt', () => {
    const state = normalizeState({ ...analyzed(), offscreenWorld: {
        subjects: [{ id: 'harbor', kind: 'situation', subject: 'Harbor traffic', reach: 'remote', motion: 'building', trajectory: 'Ships are arriving late.', settled: 'One convoy was delayed.', confidence: 'strong', lastSeenTurn: 2, owed: 'Prices may rise.', carriedBy: 'merchant reports' }],
        elapsed: 'Sixteen days', settledThrough: 2, audit: 'Private simulation only.',
    } });
    assert.equal(state.offscreenWorld.subjects[0].subject, 'Harbor traffic');
    assert.equal(stateForPrompt(state).offscreenWorld.subjects[0].settled, 'One convoy was delayed.');
});

test('provider payload includes only clean causal context', () => {
    const state = analyzed();
    state.offscreenWorld.subjects = [{ id: 'harbor', kind: 'situation', subject: 'Secret harbor debt', reach: 'remote', motion: 'building', trajectory: 'Ships are late.', settled: 'A convoy vanished.', confidence: 'strong', lastSeenTurn: 0, owed: 'A messenger may arrive.', carriedBy: 'private ledger' }];
    const payload = buildPromptPayload(state, { enabled: true, guidanceUsable: true });
    assert.match(payload, /<tale-fairy-context>/);
    assert.match(payload, /Mira suspects/);
    assert.doesNotMatch(payload, /Records|Current causes|Merchants|relevance/i);
    assert.doesNotMatch(payload, /Secret harbor debt|convoy vanished|private ledger/i);
});

test('scene profile bounds outside pressure and preserves explicit OOC authority', () => {
    const state = analyzed();
    state.sceneProfile.intrusion = 'closed';
    state.sceneProfile.noveltyCeiling = 'none';
    const payload = buildPromptPayload(state, { enabled: true, guidanceUsable: true });
    assert.match(payload, /Keep outside pressure silent or subtextual/i);
    assert.match(payload, /Keep movement within the established activity and causes/i);
    assert.match(payload, /Quiet activity may continue without interruption while still gaining progress/i);
    assert.match(payload, /user\/OOC request to stay, skip, or advance outranks/i);
    assert.match(payload, /under-specified world as an empty one/i);
    assert.match(payload, /opposition may be personal or systemic/i);
});

test('missing, tentative-only, and stale state retain only GM rules; disabled state injects nothing', () => {
    const rulesOnly = buildPromptPayload(defaultState(), { enabled: true, guidanceUsable: true });
    assert.match(rulesOnly, /GAME MASTER RESPONSIBILITY/);
    assert.equal(buildPromptPayload(analyzed(), { enabled: false, guidanceUsable: true }), '');
    const uncertain = analyzed(); uncertain.causalContext = normalizeCausalContext({ conditions: [conditions[2]], inject: true });
    assert.equal(buildPromptPayload(uncertain, { enabled: true, guidanceUsable: true }), rulesOnly);
    assert.equal(buildPromptPayload(analyzed(), { guidanceUsable: false }), rulesOnly);
    assert.doesNotMatch(rulesOnly, /Mira|Merchants|Grain reserves|RELEVANT UNDERLYING CONDITIONS/);
});

test('guidance remains usable for one appended user action only', () => {
    const base = [{ is_user: false, mes: 'The figures conflict.' }];
    const state = analyzed(base);
    assert.equal(isGuidanceUsable(state, base, 'chat'), true);
    assert.equal(isGuidanceUsable(state, [...base, { is_user: true, mes: 'I ask Mira.' }], 'chat'), true);
    assert.equal(isGuidanceUsable(state, [...base, { is_user: true, mes: 'I ask Mira.' }, { is_user: false, mes: 'She answers.' }], 'chat'), false);
    assert.equal(isDirectionCurrent(state, base, 'chat'), true);
});

test('stateForPrompt retains private confidence and relevance for future selection', () => {
    const value = stateForPrompt(analyzed());
    assert.equal(value.causalContext.conditions[2].confidence, 'tentative');
    assert.equal(value.causalContext.conditions[0].relevance, 'She is present.');
});

test('continuity records reconcile corrections and resolution without deleting history blindly', () => {
    const previous = [{ id: 'food', thread: 'Reserve report', state: 'Pending', status: 'active', basis: 'Old', cmRecordId: 'r1', cmRevision: 1 }];
    const next = reconcileContinuityThreads(previous, [{ id: 'r1', canonicalStatus: 'resolved', cmRevision: 2 }]);
    assert.equal(next.threads[0].state, 'Pending');
    assert.equal(next.threads[0].status, 'dormant');
    assert.equal(next.threads[0].cmRevision, 2);
    assert.equal(next.changed, true);
});

test('save, load, and clear preserve unrelated metadata', () => {
    const metadata = { unrelated: 4 };
    const saved = saveState(metadata, analyzed());
    assert.equal(saved.unrelated, 4);
    assert.equal(loadState(saved).causalContext.conditions[0].subject, 'Mira');
    const cleared = clearState(saved);
    assert.equal(cleared.unrelated, 4);
    assert.equal(cleared[STATE_KEY], undefined);
});

test('replacement generation strips only the discarded assistant reply', () => {
    const messages = [{ is_user: true, mes: 'Question' }, { is_user: false, mes: 'Discard me' }];
    assert.deepEqual(generationRetrySource(messages, true), messages.slice(0, 1));
    assert.deepEqual(generationRetrySource(messages, false), messages);
});

test('request verification keeps the exact archived causal slice', () => {
    const state = analyzed();
    const verification = { status: 'confirmed', injectionDecision: 'inject', runtimeVersion: '0.13.9', verificationId: 'v', guidanceBlock: 'x', requestedAt: 1, confirmedAt: 2, sourceMessageCount: 1, sourceFingerprint: fingerprintMessages([{ is_user: true, mes: 'Question' }]), responseMessageCount: 2, chatId: 'chat', replacementGeneration: false, sceneProfile: state.sceneProfile, causalContext: state.causalContext };
    const normalized = normalizeState({ ...state, lastRequestVerification: verification }).lastRequestVerification;
    assert.equal(normalized.causalContext.conditions[0].subject, 'Mira');
    assert.equal(returnedReplyMatchesVerification(normalized, [{ is_user: true, mes: 'Question' }, { is_user: false, mes: 'Reply' }], 'chat'), true);
    assert.equal(isReplacementVerificationCurrent(normalized, [{ is_user: true, mes: 'Question' }, { is_user: false, mes: 'Reply' }], 'chat'), true);
});
