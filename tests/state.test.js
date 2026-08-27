import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPromptPayload, clearState, defaultState, fingerprintMessages, hasExplicitProgressDirective, horizonInfluence, isGuidanceUsable, isStateAligned, loadState, normalizeState, saveState, STATE_KEY } from '../extension/state.js';

const currentPlan = {
    activeBeat: { id: 'beat', objective: 'Continue the active exchange.', nextAction: 'Have Mara answer.', completion: 'Mara has answered.', lifecycle: 'keep', reason: 'The question is current.' },
    planHorizons: { items: Array.from({ length: 6 }, (_, index) => ({ id: `h${index}`, direction: `Direction ${index}`, timeframe: index === 5 ? 'later arcs / open-ended' : `range ${index}`, stability: index < 2 ? 'adaptive' : index === 5 ? 'slow' : 'stable', conditions: [], change: 'keep', reason: 'Still relevant.' })), deviation: { level: 'none', reason: 'Aligned.' } },
};

test('state normalizes caps and invalid mode', () => {
    const state = normalizeState({ mode: 'hard', objectives: Array.from({ length: 9 }, (_, i) => ({ title: String(i) })), enabled: false });
    assert.equal(state.mode, 'balanced');
    assert.equal(state.enabled, false);
    assert.equal(state.objectives.length, 9);
    assert.equal(state.version, 8);
});

test('state round trips through portable metadata', () => {
    const metadata = saveState({ title: 'chat' }, { ...defaultState(), guidance: 'take a breath', sourceChatId: 'chat-1', sourceMessageCount: 1, lastAnalysisFingerprint: fingerprintMessages([{ mes: 'hello', is_user: true }]), scene: { status: 'active' }, lastRequestVerification: { status: 'confirmed', guidanceBlock: '<living-world-guide>take a breath</living-world-guide>', requestedAt: 10, confirmedAt: 20, sourceMessageCount: 1, responseMessageCount: 2, chatId: 'chat-1', provider: 'custom', model: 'model', position: 'at-depth', role: 'user', depth: 3 } });
    assert.equal(metadata.title, 'chat');
    assert.equal(loadState(metadata).guidance, 'take a breath');
    assert.equal(loadState(metadata).lastRequestVerification.guidanceBlock, '<living-world-guide>take a breath</living-world-guide>');
    assert.equal(loadState(metadata).lastRequestVerification.responseMessageCount, 2);
    assert.equal(clearState(metadata)[STATE_KEY], undefined);
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

test('guidance is usable only for the exact turn it analyzed', () => {
    const analyzed = [{ mes: 'The room settles.', is_user: false }];
    const state = { ...defaultState(), ...currentPlan, scene: { status: 'active' }, guidance: 'Keep the pace quiet.', lastInject: true, sourceChatId: 'a', sourceMessageCount: 1, lastAnalysisFingerprint: fingerprintMessages(analyzed) };
    assert.equal(isGuidanceUsable(state, analyzed, 'a'), true);
    assert.equal(isGuidanceUsable(state, [...analyzed, { mes: 'I look around.', is_user: true }], 'a'), false);
    assert.equal(isGuidanceUsable(state, [...analyzed, { mes: 'Changed assistant text.', is_user: false }], 'a'), false);
    assert.equal(isGuidanceUsable(state, [...analyzed, { mes: 'I look.', is_user: true }, { mes: 'Reply', is_user: false }], 'a'), false);
    assert.equal(isGuidanceUsable(state, [...analyzed, { mes: 'I look around.', is_user: true }], 'b'), false);
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

test('prompt payload keeps user directives active and only includes usable guidance', () => {
    const state = {
        ...defaultState(),
        guidance: 'Keep the scene grounded.',
        activeBeat: { id: 'answer', objective: 'Resolve the immediate question.', nextAction: 'Have Mara answer with the established facts.', completion: 'Mara has answered.', lifecycle: 'replace', reason: 'The user asked her directly.' },
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
    const current = buildPromptPayload(state, { enabled: true, guidanceUsable: true });
    assert.match(current, /Keep the scene grounded/);
    assert.match(current, /ACTIVE DIRECTION: Resolve the immediate question/);
    assert.match(current, /NEXT BEAT — DO THIS IN THE CURRENT REPLY: Have Mara answer/);
    assert.match(current, /COMPLETE OR REASSESS THIS BEAT WHEN: Mara has answered/);
    assert.match(current, /next 2–4 turns \[adaptive; moderate influence\]: Explore the reaction/);
    assert.match(current, /current arc \[stable; background influence\]: Revisit the obligation/);
    assert.match(current, /later arcs \/ open-ended \[slow; background influence\]: Let the obligation remain an evolving possibility/);
    assert.match(current, /background should remain a subtle nonzero pull/);
    assert.equal(buildPromptPayload(state, { enabled: false, guidanceUsable: true }), '');
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
    assert.match(payload, /Carry declared actions, questions, and choices through their immediate meaningful consequence/);
    assert.match(payload, /without inventing the player's next voluntary action/);
    assert.match(payload, /The latest user action wins any conflict/);
});
