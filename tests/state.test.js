import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPromptPayload, clearState, defaultState, fingerprintMessages, hasExplicitProgressDirective, isGuidanceUsable, isStateAligned, loadState, normalizeState, saveState, STATE_KEY } from '../extension/state.js';

test('state normalizes caps and invalid mode', () => {
    const state = normalizeState({ mode: 'hard', objectives: Array.from({ length: 9 }, (_, i) => ({ title: String(i) })), enabled: false });
    assert.equal(state.mode, 'balanced');
    assert.equal(state.enabled, false);
    assert.equal(state.objectives.length, 3);
    assert.equal(state.version, 6);
});

test('state round trips through portable metadata', () => {
    const metadata = saveState({ title: 'chat' }, { ...defaultState(), guidance: 'take a breath', sourceChatId: 'chat-1', sourceMessageCount: 1, lastAnalysisFingerprint: fingerprintMessages([{ mes: 'hello', is_user: true }]), scene: { status: 'active' }, lastRequestVerification: { status: 'confirmed', guidanceBlock: '<living-world-guide>take a breath</living-world-guide>', requestedAt: 10, confirmedAt: 20, sourceMessageCount: 1, responseMessageCount: 2, chatId: 'chat-1', provider: 'custom', model: 'model', position: 'at-depth', role: 'user', depth: 3 } });
    assert.equal(metadata.title, 'chat');
    assert.equal(loadState(metadata).guidance, 'take a breath');
    assert.equal(loadState(metadata).lastRequestVerification.guidanceBlock, '<living-world-guide>take a breath</living-world-guide>');
    assert.equal(loadState(metadata).lastRequestVerification.responseMessageCount, 2);
    assert.equal(clearState(metadata)[STATE_KEY], undefined);
});

test('alignment rejects changed or transferred chats', () => {
    const messages = [{ mes: 'hello', is_user: true }];
    const state = { ...defaultState(), scene: { status: 'active' }, sourceChatId: 'a', sourceMessageCount: 1, lastAnalysisFingerprint: fingerprintMessages(messages) };
    assert.equal(isStateAligned(state, messages, 'a'), true);
    assert.equal(isStateAligned(state, [{ mes: 'changed', is_user: true }], 'a'), false);
    assert.equal(isStateAligned(state, messages, 'b'), false);
});

test('guidance remains usable for exactly the next user message', () => {
    const analyzed = [{ mes: 'The room settles.', is_user: false }];
    const state = { ...defaultState(), scene: { status: 'active' }, guidance: 'Keep the pace quiet.', lastInject: true, sourceChatId: 'a', sourceMessageCount: 1, lastAnalysisFingerprint: fingerprintMessages(analyzed) };
    assert.equal(isGuidanceUsable(state, analyzed, 'a'), true);
    assert.equal(isGuidanceUsable(state, [...analyzed, { mes: 'I look around.', is_user: true }], 'a'), true);
    assert.equal(isGuidanceUsable(state, [...analyzed, { mes: 'Changed assistant text.', is_user: false }], 'a'), false);
    assert.equal(isGuidanceUsable(state, [...analyzed, { mes: 'I look.', is_user: true }, { mes: 'Reply', is_user: false }], 'a'), false);
    assert.equal(isGuidanceUsable(state, [...analyzed, { mes: 'I look around.', is_user: true }], 'b'), false);
});

test('an aligned legacy state with no injected guidance forces fresh analysis', () => {
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
    assert.equal(isGuidanceUsable({ ...aligned, guidance: 'Preserve the lunch rhythm.', lastInject: true }, messages, 'a'), true);
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
        userNotes: [
            { kind: 'suggest', text: 'A quiet meal could happen.', at: 1 },
            { kind: 'forbid', text: 'No time travel.', at: 2 },
        ],
    };
    const stale = buildPromptPayload(state, { enabled: true, guidanceUsable: false });
    assert.match(stale, /OPTIONAL SUGGESTION: A quiet meal could happen/);
    assert.match(stale, /HARD EXCLUSION: No time travel/);
    assert.doesNotMatch(stale, /Keep the scene grounded/);
    assert.match(stale, /Within the provider's permitted content, follow the user's requested fictional direction/);
    assert.match(stale, /Do not replace it with an unrelated safer alternative/);
    assert.match(stale, /give the user's persona automatic plot armor/);
    assert.match(stale, /Do not force sympathy, vulnerability, redemption, reconciliation, banter, avoidance, or silent treatment/);
    const current = buildPromptPayload(state, { enabled: true, guidanceUsable: true });
    assert.match(current, /Keep the scene grounded/);
    assert.match(current, /Apply it at the user's demonstrated pace/);
    assert.match(current, /do not speed up, slow down, time-skip, montage, compress, prolong, or resolve/);
    assert.match(current, /mode controls narrative pressure and boldness, not narrative speed/);
    assert.match(current, /without sanitizing supported conflict, danger, flaws, rejection, loss, stakes, or consequences/);
    assert.match(current, /Do not substitute safer alternatives, plot armor, forced sympathy/);
    assert.equal(buildPromptPayload(state, { enabled: false, guidanceUsable: true }), '');
});

test('latest explicit progress overrides a preplanned Tale Fairy stall', () => {
    const state = {
        ...defaultState(),
        guidance: 'Do NOT deliver the actual results this turn; end with Lucia about to enter.',
        lastInject: true,
    };
    assert.equal(hasExplicitProgressDirective('Advance to my turn. I proceed.'), true);
    assert.equal(hasExplicitProgressDirective('I continue until he is done.'), true);
    assert.equal(hasExplicitProgressDirective('I want the results right now, before doing anything else.'), true);
    assert.equal(hasExplicitProgressDirective('Do not proceed yet.'), false);
    assert.equal(hasExplicitProgressDirective('I watch quietly.'), false);
    const payload = buildPromptPayload(state, {
        enabled: true,
        guidanceUsable: true,
        latestUserMessage: 'I want the results now. Advance to my turn. I proceed.',
    });
    assert.match(payload, /latest turn also explicitly commands forward progress/);
    assert.match(payload, /Complete its requested transition or reach its stated milestone in this reply/);
    assert.match(payload, /Any earlier Tale Fairy sentence that says not this turn[\s\S]*is void/);
    assert.doesNotMatch(payload, /Do NOT deliver the actual results/);
    assert.match(payload, /supersedes any preplanned stopping point/);
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

test('an ordinary declared action proceeds without forcing the most obvious outcome', () => {
    const state = {
        ...defaultState(),
        guidance: 'Add another waiting-room beat and end before the consultation begins.',
        lastInject: true,
    };
    const payload = buildPromptPayload(state, {
        enabled: true,
        guidanceUsable: true,
        latestUserMessage: 'I open the consultation door and walk inside to receive my results.',
    });
    assert.equal(hasExplicitProgressDirective('I open the consultation door and walk inside to receive my results.'), false);
    assert.match(payload, /binding authorization to carry out its routine mechanics/);
    assert.match(payload, /no words such as "advance" or "proceed" are required/);
    assert.match(payload, /does not require the most obvious outcome and does not guarantee success/);
    assert.match(payload, /Infer routine implied steps instead of making the user micromanage/);
    assert.match(payload, /receiving an available result/);
    assert.match(payload, /may create a surprising, difficult, funny, dramatic, or otherwise fresh consequence/);
    assert.match(payload, /If any earlier Tale Fairy sentence conflicts with the latest user action or pacing, ignore that sentence/);
});
