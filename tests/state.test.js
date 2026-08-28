import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPromptPayload, clearState, defaultState, fingerprintMessages, guidesForDiscardedAssistant, hasExplicitProgressDirective, horizonInfluence, isAnalysisSourceCurrent, isGuidanceUsable, isStateAligned, loadState, normalizeState, returnedReplyMatchesVerification, saveState, STATE_KEY } from '../extension/state.js';

const stateNextGuides = [
    { id: 'direct-answer', direction: 'Let Mara answer plainly and reveal one concrete concern.', useWhen: 'The user continues or asks Mara.', dropWhen: 'The user leaves or changes subject.', responseBias: 'Answer directly and show its immediate effect.', worldDelta: 'Mara reveals a concern that changes the shared understanding.', origin: 'inferred', basis: 'Mara is present and engaged in the live conversation.', strength: 'strong', sourcePathways: ['answer'], reason: 'Direct continuation.' },
    { id: 'telling-deflection', direction: 'Let Mara reveal a different pressure through a meaningful deflection.', useWhen: 'The user remains with Mara and she has reason to hesitate.', dropWhen: 'The user establishes a direct answer or ends the exchange.', responseBias: 'Make the deflection consequential.', worldDelta: 'Mara exposes a different pressure and changes the social stakes.', origin: 'original', basis: 'Her hesitation supports an indirect but consequential response.', strength: 'moderate', sourcePathways: ['answer'], reason: 'Contrasting continuity-safe alternative.' },
];
const currentPlan = {
    pathways: [{ id: 'answer', direction: 'Continue the active exchange.', when: 'The user continues or asks Mara.', responseBias: 'Have Mara answer.', horizon: 'near', status: 'foreground', conditions: [], change: 'keep', reason: 'The exchange is current.' }],
    nextGuides: stateNextGuides,
    planHorizons: { items: Array.from({ length: 6 }, (_, index) => ({ id: `h${index}`, direction: `Direction ${index}`, timeframe: index === 5 ? 'later arcs / open-ended' : `range ${index}`, stability: index < 2 ? 'adaptive' : index === 5 ? 'slow' : 'stable', conditions: [], change: 'keep', reason: 'Still relevant.' })), deviation: { level: 'none', reason: 'Aligned.' } },
};

test('state normalizes caps and invalid mode', () => {
    const guides = Array.from({ length: 4 }, (_, index) => ({ ...stateNextGuides[0], id: `guide-${index}`, direction: `Direction ${index}` }));
    guides[0].responseBias = 'finished '.repeat(40);
    const state = normalizeState({ mode: 'hard', objectives: Array.from({ length: 9 }, (_, i) => ({ title: String(i) })), nextGuides: guides, enabled: false });
    assert.equal(state.mode, 'balanced');
    assert.equal(state.enabled, false);
    assert.equal(state.objectives.length, 9);
    assert.deepEqual(state.nextGuides.map(item => item.id), ['guide-0', 'guide-1', 'guide-2']);
    assert.ok(state.nextGuides[0].responseBias.length <= 130);
    assert.match(state.nextGuides[0].responseBias, /finished…$/);
    assert.equal(state.version, 15);
});

test('state round trips through portable metadata', () => {
    const metadata = saveState({ title: 'chat' }, { ...defaultState(), guidance: 'take a breath', sourceChatId: 'chat-1', sourceMessageCount: 1, lastAnalysisFingerprint: fingerprintMessages([{ mes: 'hello', is_user: true }]), scene: { status: 'active' }, lastRequestVerification: { status: 'confirmed', guidanceBlock: '<living-world-guide>take a breath</living-world-guide>', requestedAt: 10, confirmedAt: 20, sourceMessageCount: 1, responseMessageCount: 2, chatId: 'chat-1', provider: 'custom', model: 'model', position: 'at-depth', role: 'user', depth: 3, guideCandidates: stateNextGuides, selectedGuideIndex: 1 } });
    assert.equal(metadata.title, 'chat');
    assert.equal(loadState(metadata).guidance, 'take a breath');
    assert.equal(loadState(metadata).lastRequestVerification.guidanceBlock, '<living-world-guide>take a breath</living-world-guide>');
    assert.equal(loadState(metadata).lastRequestVerification.responseMessageCount, 2);
    assert.equal(loadState(metadata).lastRequestVerification.guideCandidates.length, 2);
    assert.equal(loadState(metadata).lastRequestVerification.selectedGuideIndex, 1);
    assert.equal(clearState(metadata)[STATE_KEY], undefined);
});

test('request verification accepts an in-place swipe replacement', () => {
    const messages = [{ mes: 'question', is_user: true }, { mes: 'new swipe', is_user: false }];
    const base = { chatId: 'chat-1', sourceMessageCount: 2 };
    assert.equal(returnedReplyMatchesVerification({ ...base, replacementGeneration: true }, messages, 'chat-1'), true);
    assert.equal(returnedReplyMatchesVerification({ ...base, replacementGeneration: false }, messages, 'chat-1'), false);
    assert.equal(returnedReplyMatchesVerification({ ...base, replacementGeneration: true }, messages, 'other-chat'), false);
});

test('state retains a bounded horizon ladder with increasing planning detail', () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
        id: `h${index}`,
        direction: `Direction ${index}`,
        timeframe: `range ${index}`,
        stability: index < 2 ? 'fluid' : index < 5 ? 'adaptive' : 'stable',
        conditions: ['still relevant'],
        change: 'keep',
        reason: 'test',
    }));
    const state = normalizeState({ planHorizons: { items, deviation: { level: 'minor', reason: 'A side turn.' } } });
    assert.equal(state.planHorizons.items.length, 10);
    assert.equal(state.planHorizons.items[0].id, 'h0');
    assert.equal(state.planHorizons.items.at(-1).id, 'h9');
    assert.equal(state.planHorizons.deviation.level, 'minor');
});

test('horizon influence decreases but never disappears with distance', () => {
    assert.deepEqual(Array.from({ length: 6 }, (_, index) => horizonInfluence(index, 6)), ['strong', 'moderate', 'light', 'light', 'background', 'background']);
});

test('alignment rejects changed or transferred chats', () => {
    const messages = [{ mes: 'hello', is_user: true }];
    const state = { ...defaultState(), scene: { status: 'active' }, sourceChatId: 'a', sourceMessageCount: 1, lastAnalysisFingerprint: fingerprintMessages(messages) };
    assert.equal(isStateAligned(state, messages, 'a'), true);
    assert.equal(isStateAligned(state, [{ mes: 'changed', is_user: true }], 'a'), false);
    assert.equal(isStateAligned(state, messages, 'b'), false);
});

test('completed-turn guidance can route exactly one new user action', () => {
    const analyzed = [{ mes: 'The room settles.', is_user: false }];
    const state = { ...defaultState(), ...currentPlan, scene: { status: 'active' }, guidance: 'Keep the pace quiet.', lastInject: true, sourceChatId: 'a', sourceMessageCount: 1, lastAnalysisFingerprint: fingerprintMessages(analyzed) };
    assert.equal(isGuidanceUsable(state, analyzed, 'a'), true);
    assert.equal(isGuidanceUsable(state, [...analyzed, { mes: 'I look around.', is_user: true }], 'a'), true);
    assert.equal(isGuidanceUsable(state, [...analyzed, { mes: 'Changed assistant text.', is_user: false }], 'a'), false);
    assert.equal(isGuidanceUsable(state, [...analyzed, { mes: 'I look.', is_user: true }, { mes: 'Reply', is_user: false }], 'a'), false);
    assert.equal(isGuidanceUsable(state, [...analyzed, { mes: 'I look around.', is_user: true }], 'b'), false);
});

test('a discarded assistant attempt can supply non-established retry routes', () => {
    const messages = [{ mes: 'Try that again.', is_user: true }];
    const state = { ...defaultState(), ...currentPlan, sourceChatId: 'a', sourceMessageCount: 2 };
    assert.deepEqual(guidesForDiscardedAssistant(state, messages, 'a').map(item => item.id), ['direct-answer', 'telling-deflection']);
    assert.deepEqual(guidesForDiscardedAssistant(state, messages, 'b'), []);
    assert.deepEqual(guidesForDiscardedAssistant({ ...state, sourceMessageCount: 3 }, messages, 'a'), []);
    assert.deepEqual(guidesForDiscardedAssistant({ ...state, nextGuides: stateNextGuides.map(item => ({ ...item, origin: 'established' })) }, messages, 'a'), []);
});

test('completed-turn analysis may save across one new user action but not later changes', () => {
    const analyzed = [{ mes: 'The room settles.', is_user: false }];
    const fingerprint = fingerprintMessages(analyzed);
    assert.equal(isAnalysisSourceCurrent(fingerprint, 1, analyzed), true);
    assert.equal(isAnalysisSourceCurrent(fingerprint, 1, [...analyzed, { mes: 'I look around.', is_user: true }]), false);
    assert.equal(isAnalysisSourceCurrent(fingerprint, 1, [...analyzed, { mes: 'I look around.', is_user: true }], { allowOneUserAppend: true }), true);
    assert.equal(isAnalysisSourceCurrent(fingerprint, 1, [...analyzed, { mes: 'Another reply.', is_user: false }], { allowOneUserAppend: true }), false);
    assert.equal(isAnalysisSourceCurrent(fingerprint, 1, [...analyzed, { mes: 'I look.', is_user: true }, { mes: 'Reply.', is_user: false }], { allowOneUserAppend: true }), false);
});

test('aligned legacy or incomplete planning state forces fresh analysis', () => {
    const messages = [{ mes: 'Lunch continues.', is_user: false }];
    const aligned = {
        ...defaultState(),
        scene: { status: 'ongoing' },
        sourceChatId: 'a',
        sourceMessageCount: messages.length,
        lastAnalysisFingerprint: fingerprintMessages(messages),
        guidance: '',
        lastInject: false,
    };
    assert.equal(isGuidanceUsable(aligned, messages, 'a'), false);
    assert.equal(isGuidanceUsable({ ...aligned, guidance: 'Preserve the lunch rhythm.', lastInject: true }, messages, 'a'), false);
    assert.equal(isGuidanceUsable({ ...aligned, ...currentPlan, guidance: 'Preserve the lunch rhythm.', lastInject: true }, messages, 'a'), true);
});

test('legacy tagged notes migrate to explicit note kinds', () => {
    const state = normalizeState({ userNotes: [{ text: '[FORBID] No time travel', at: 5 }] });
    assert.deepEqual(state.userNotes, [{ kind: 'forbid', text: 'No time travel', at: 5 }]);
});

test('pre-canon-ledger state requests one bounded bootstrap rescan', () => {
    const migrated = normalizeState({ version: 5, scene: { status: 'active' }, contextLedger: 'Old ledger.' });
    assert.equal(migrated.canonBootstrapPending, true);
    assert.equal(normalizeState(migrated).canonBootstrapPending, true);
    assert.equal(defaultState().canonBootstrapPending, false);
});

test('pre-momentum guides and request verification cannot remain injectable after an upgrade', () => {
    const migrated = normalizeState({ version: 14, ...currentPlan, nextGuides: stateNextGuides, lastInject: true, lastRequestVerification: { status: 'confirmed', guidanceBlock: 'old', guideCandidates: stateNextGuides } });
    assert.equal(migrated.version, 15);
    assert.equal(migrated.canonBootstrapPending, true);
    assert.deepEqual(migrated.nextGuides, []);
    assert.equal(migrated.lastRequestVerification, null);
    assert.equal(isGuidanceUsable(migrated, [], ''), false);
});

test('prompt payload keeps user directives active and only includes usable guidance', () => {
    const state = {
        ...defaultState(),
        guidance: 'Keep the scene grounded.',
        pathways: [{ id: 'answer', direction: 'Resolve the immediate question.', when: 'The user asks Mara or continues the exchange.', responseBias: 'Have Mara answer with the established facts.', horizon: 'this reply', status: 'foreground', conditions: [], change: 'replace', reason: 'The user may address her directly.' }],
        nextGuides: stateNextGuides,
        planHorizons: { items: [
            { id: 'now', direction: 'Answer Mara.', timeframe: 'this reply', stability: 'fluid', conditions: [], change: 'replace', reason: 'Direct question.' },
            { id: 'soon', direction: 'Explore the reaction.', timeframe: 'next 2–4 turns', stability: 'adaptive', conditions: [], change: 'replace', reason: 'Follow-through.' },
            { id: 'scene', direction: 'Change their understanding.', timeframe: 'current scene', stability: 'stable', conditions: [], change: 'replace', reason: 'Scene shape.' },
            { id: 'next-scene', direction: 'Carry the changed understanding into a new situation.', timeframe: 'next scene', stability: 'adaptive', conditions: [], change: 'replace', reason: 'Scene follow-through.' },
            { id: 'arc', direction: 'Revisit the obligation.', timeframe: 'current arc', stability: 'stable', conditions: [], change: 'replace', reason: 'Long direction.' },
            { id: 'far', direction: 'Let the obligation remain an evolving possibility.', timeframe: 'later arcs / open-ended', stability: 'slow', conditions: [], change: 'replace', reason: 'Distant direction.' },
        ], deviation: { level: 'none', reason: 'Aligned.' } },
        userNotes: [
            { kind: 'suggest', text: 'A quiet meal could happen.', at: 1 },
            { kind: 'forbid', text: 'No time travel.', at: 2 },
        ],
    };
    const stale = buildPromptPayload(state, { enabled: true, guidanceUsable: false });
    assert.match(stale, /OPTIONAL SUGGESTION: A quiet meal could happen/);
    assert.match(stale, /HARD EXCLUSION: No time travel/);
    assert.doesNotMatch(stale, /Keep the scene grounded/);
    assert.match(stale, /The latest user turn is authoritative/);
    assert.match(stale, /without inventing the player's next voluntary action/);
    assert.match(stale, /No aligned route is available/);
    assert.doesNotMatch(stale, /Let Mara answer plainly|meaningful deflection/);
    const current = buildPromptPayload(state, { enabled: true, guidanceUsable: true });
    assert.match(current, /^<tale-fairy-context>/);
    assert.match(current, /<\/tale-fairy-context>$/);
    assert.doesNotMatch(current, /Keep the scene grounded/);
    assert.match(current, /SELECTED IMMEDIATE ROUTE 1 \[strong · inferred\]/);
    assert.doesNotMatch(current, /ALTERNATIVE ROUTE 2|Wait for pressure/);
    assert.match(current, /Let Mara answer plainly/);
    assert.match(current, /VISIBLE CHANGE: Mara reveals a concern/);
    assert.match(current, /GROUNDING: Mara is present/);
    assert.match(current, /USE IF: The user continues or asks Mara/);
    assert.match(current, /DROP IF: The user leaves or changes subject/);
    assert.doesNotMatch(current, /telling-deflection|meaningful deflection/);
    assert.doesNotMatch(current, /PATHWAYS|TIME HORIZONS|Revisit the obligation/);

    const swipe = buildPromptPayload(state, { enabled: true, guidanceUsable: true, guideCandidates: stateNextGuides, guideIndex: 1, regeneration: true });
    assert.doesNotMatch(swipe, /ALTERNATIVE ROUTE 1|Let Mara answer plainly/);
    assert.match(swipe, /SELECTED IMMEDIATE ROUTE 2 \[moderate · original\]/);
    assert.match(swipe, /selected specifically to make this regeneration develop differently/);
    assert.match(swipe, /discard it and create an equally concrete/);
    assert.match(swipe, /meaningful deflection/);

    const regenerationFallback = buildPromptPayload(state, { enabled: true, guidanceUsable: false, guideCandidates: [], regeneration: true, variationCue: 8472 });
    assert.match(regenerationFallback, /Variation cue 8472/);
    assert.match(regenerationFallback, /actual development different from the prior attempt, not merely its wording/);
    assert.match(regenerationFallback, /must initiate one new, causally supported beat/);
    assert.doesNotMatch(regenerationFallback, /Let Mara answer plainly|meaningful deflection/);
    assert.equal(buildPromptPayload(state, { enabled: false, guidanceUsable: true }), '');
});

test('roleplay injection stays bounded with maximum notes, canon, and route fields', () => {
    const long = 'constraint '.repeat(100);
    const route = { id: 'route', direction: long, use_when: long, drop_when: long, response_bias: long, world_delta: long, origin: 'original', basis: long, strength: 'moderate', source_pathways: ['path'] };
    const state = {
        ...defaultState(),
        canonConstraints: Array.from({ length: 12 }, (_, index) => `canon-${index} ${long}`),
        userNotes: Array.from({ length: 12 }, (_, index) => ({ kind: index % 2 ? 'forbid' : 'establish', text: `note-${index} ${long}`, at: index })),
        nextGuides: Array.from({ length: 3 }, (_, index) => ({ ...route, id: `route-${index}` })),
    };
    const payload = buildPromptPayload(state, { guidanceUsable: true });
    assert.ok(payload.length < 10500, `expected bounded injection, got ${payload.length} characters`);
    for (let index = 0; index < 12; index++) {
        assert.match(payload, new RegExp(`canon-${index}`));
        assert.match(payload, new RegExp(`note-${index}`));
    }
});

test('private planning state cannot bias the response without a selected next guide', () => {
    const state = {
        ...defaultState(),
        pathways: [{ id: 'closed-route', direction: 'Use the sealed passage.', when: 'The user approaches it.', responseBias: 'Open it.', horizon: 'near', status: 'blocked', conditions: ['The seal must first be removed.'], change: 'keep', reason: 'It is sealed.' }],
        guidance: 'Do not force the passage.',
        lastInject: true,
    };
    const payload = buildPromptPayload(state, { enabled: true, guidanceUsable: true });
    assert.doesNotMatch(payload, /closed-route|Use the sealed passage/);
    assert.match(payload, /<living-world-guide>[\s\S]*No aligned route is available/);
});

test('explicit progress detection distinguishes commands from negation', () => {
    assert.equal(hasExplicitProgressDirective('Advance to my turn. I proceed.'), true);
    assert.equal(hasExplicitProgressDirective('I continue until he is done.'), true);
    assert.equal(hasExplicitProgressDirective('I want the results right now, before doing anything else.'), true);
    assert.equal(hasExplicitProgressDirective('Do not proceed yet.'), false);
    assert.equal(hasExplicitProgressDirective('I watch quietly.'), false);
});

test('user-established extremes remain persistent canon rather than lore-capped suggestions', () => {
    const state = {
        ...defaultState(),
        canonConstraints: ['Lucia has a Midichlorian count off the charts and among the highest in history; no exact count is established.'],
        guidance: 'Reveal the completed blood-test result.',
        lastInject: true,
    };
    const payload = buildPromptPayload(state, { enabled: true, guidanceUsable: true });
    assert.match(payload, /<user-established-canon>/);
    assert.match(payload, /off the charts and among the highest in history/);
    assert.match(payload, /averages and prior records are comparison points, not ceilings/);
    assert.match(payload, /Never regress it toward the mean, cap it at a familiar lore value, weaken it to merely high/);
    assert.match(payload, /Everything the user did not establish remains open creative space/);
    assert.match(payload, /Freely invent an exact number or any other unstated detail when it fits the narrative/);
    assert.match(payload, /Do not refuse, hedge, delay, or demand verification merely because a detail was unspecified/);
    assert.doesNotMatch(payload, /fabricating false precision|invent a conservative exact number/);
});

test('the compact policy advances declared actions while preserving player agency', () => {
    const state = {
        ...defaultState(),
        guidance: 'Add another waiting-room beat and end before the consultation begins.',
        lastInject: true,
    };
    const payload = buildPromptPayload(state, { enabled: true, guidanceUsable: true });
    assert.equal(hasExplicitProgressDirective('I open the consultation door and walk inside to receive my results.'), false);
    assert.match(payload, /Carry its declared actions and questions through their meaningful consequence/);
    assert.match(payload, /without inventing the player's next voluntary action/);
    assert.match(payload, /The latest user turn is authoritative/);
});
