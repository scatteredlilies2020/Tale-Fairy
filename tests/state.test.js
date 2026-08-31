import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPlannerAuthorLayer, buildPromptPayload, clearState, defaultState, fingerprintMessages, generationRetrySource, guidesForDiscardedAssistant, hasExplicitProgressDirective, horizonInfluence, isAnalysisSourceCurrent, isGuidanceUsable, isStateAligned, loadState, normalizeState, returnedReplyMatchesVerification, saveState, STATE_KEY, STATE_VERSION, stateForPrompt } from '../extension/state.js';

const stateNextGuides = [
    { id: 'direct-answer', direction: 'Let Mara answer plainly and reveal one concrete concern.', useWhen: 'The user continues or asks Mara.', dropWhen: 'The user leaves or changes subject.', causalRole: 'Advance the live trust thread through a concrete disclosure.', worldDelta: 'Mara reveals a concern that changes the shared understanding.', origin: 'inferred', basis: 'Mara is present and engaged in the live conversation.', strength: 'strong', sourcePathways: ['answer'], reason: 'Direct continuation.' },
    { id: 'telling-deflection', direction: 'Let Mara reveal a different pressure through a meaningful deflection.', useWhen: 'The user remains with Mara and she has reason to hesitate.', dropWhen: 'The user establishes a direct answer or ends the exchange.', causalRole: 'Advance the social-pressure thread through an indirect consequence.', worldDelta: 'Mara exposes a different pressure and changes the social stakes.', origin: 'original', basis: 'Her hesitation supports an indirect but consequential response.', strength: 'moderate', sourcePathways: ['answer'], reason: 'Contrasting continuity-safe alternative.' },
];
const currentPlan = {
    directorScore: { storyIdentity: 'A Star Wars survival and institutional-conflict arc about trust under Jedi obligations.', sceneFunction: 'Let a quiet slice-of-life exchange alter trust.', settingIdentity: 'Star Wars as a lived institutional and technological world', settingForces: ['Jedi obligations constrain time and candor.', 'Droids participate in domestic routine.'], causalTempo: 'seed', arcDirection: 'Let ordinary interaction expose how affection and duty compete.', futureSetup: { id: 'duty-conflict', development: 'Mara must choose between the relationship and a Jedi obligation.', currentStep: 'Establish the obligation as a real constraint.', conditions: ['The duty becomes due.'], earliestWindow: 'later in the current arc', disclosure: 'hidden' }, meaningfulAim: 'Change the shared understanding of trust and obligation.', change: 'adjust', basis: 'The active exchange and setting support this pressure.' },
    narrativeLayers: { immediateAction: 'Continue the tea conversation.', localActivity: 'A quiet tea conversation with Mara.', situation: 'An intimate home exchange constrained by Jedi obligations.', widerWorld: 'Star Wars institutions, droids, duties, and ongoing life beyond this room.', durableTrajectory: 'An open-ended survival and institutional-conflict story about trust under Jedi obligations.', activityRole: 'developmental', temporalScope: 'action' },
    continuityThreads: [{ id: 'chancellor-petition', thread: 'Letter to the Chancellor', state: 'The filed petition awaits an official response.', status: 'dormant', basis: 'The intake clerk filed it.' }],
    selfChallenge: { weakness: 'The preferred route may be too local.', counterRoute: 'Advance the Chancellor petition independently.', decision: 'Keep the local route for this action while retaining the petition.' },
    pathways: [{ id: 'answer', direction: 'Continue the active exchange.', when: 'The user continues or asks Mara.', responseBias: 'Have Mara answer.', horizon: 'near', status: 'foreground', mechanismStatus: 'evidenced', mechanismBasis: 'The depicted exchange establishes that answering can change shared understanding.', conditions: [], change: 'keep', reason: 'The exchange is current.' }],
    nextGuides: stateNextGuides,
    planHorizons: { items: Array.from({ length: 6 }, (_, index) => ({ id: `h${index}`, direction: `Direction ${index}`, timeframe: index === 5 ? 'later arcs / open-ended' : `range ${index}`, stability: index < 2 ? 'adaptive' : index === 5 ? 'slow' : 'stable', conditions: [], change: 'keep', reason: 'Still relevant.' })), deviation: { level: 'none', reason: 'Aligned.' } },
};

test('state normalizes caps and invalid mode', () => {
    const guides = Array.from({ length: 4 }, (_, index) => ({ ...stateNextGuides[0], id: `guide-${index}`, direction: `Direction ${index}` }));
    guides[0].causalRole = 'advance '.repeat(40);
    const possibilities = Array.from({ length: 24 }, (_, index) => ({ description: `Idea ${index} ${'x'.repeat(160)}`, conditions: ['one condition', 'discarded condition'], force: 'moderate' }));
    const continuityThreads = Array.from({ length: 12 }, (_, index) => ({ id: `route-${index}`, thread: `Route ${index}`, state: 'Awaiting a supported development.', status: index ? 'dormant' : 'invalid', basis: 'Established in chat.' }));
    const state = normalizeState({ mode: 'hard', objectives: Array.from({ length: 9 }, (_, i) => ({ title: String(i) })), continuityThreads, possibilities, nextGuides: guides, enabled: false });
    assert.equal(state.mode, 'balanced');
    assert.equal(state.enabled, false);
    assert.equal(state.objectives.length, 9);
    assert.equal(state.continuityThreads.length, 10);
    assert.equal(state.continuityThreads[0].status, 'dormant');
    assert.deepEqual(state.nextGuides.map(item => item.id), ['guide-0', 'guide-1', 'guide-2', 'guide-3']);
    assert.ok(state.nextGuides[0].causalRole.length <= 130);
    assert.match(state.nextGuides[0].causalRole, /advance…$/);
    assert.equal(state.possibilities.length, 18);
    assert.ok(state.possibilities.every(item => item.description.length <= 120 && item.conditions.length <= 1));
    assert.ok(state.possibilities.every(item => item.description.endsWith('…')), 'long ideas should end cleanly instead of mid-word');
    assert.ok(state.possibilities.every(item => item.horizon === ''));
    const repairedLegacyIdea = normalizeState({ possibilities: [{ description: 'x'.repeat(120) }] }).possibilities[0].description;
    assert.match(repairedLegacyIdea, /…$/, 'legacy cards saved at the old hard limit should be marked as truncated');
    assert.ok(repairedLegacyIdea.length <= 120);
    const promptIdeas = stateForPrompt(state).possibilities;
    assert.equal(promptIdeas.length, 18);
    assert.ok(promptIdeas.every(item => typeof item === 'string' && item.length <= 180));
    assert.ok(JSON.stringify(promptIdeas).length < 3400, 'the complete idea bank should remain token-cheap');
    const mechanismRoute = normalizeState({ pathways: [{ id: 'route', direction: 'A distinct process produces a result.', when: 'The process begins.', mechanism_status: 'new', mechanism_basis: 'A separate future process must be initiated first.' }] }).pathways[0];
    assert.equal(mechanismRoute.mechanismStatus, 'new');
    assert.equal(stateForPrompt(normalizeState({ pathways: [mechanismRoute] })).pathways[0].mechanismBasis, 'A separate future process must be initiated first.');
    assert.equal(state.version, STATE_VERSION);
});

test('state retains compact summary-evidence audit data across reloads', () => {
    const state = normalizeState({
        summaryEvidence: {
            count: 3,
            includedTokens: 2400,
            originalTokens: 5700,
            labels: ['Continuity Memory', 'World state summary', ...Array.from({ length: 20 }, (_, index) => `Summary ${index}`)],
            scannedAt: 123456,
        },
    });
    assert.deepEqual(state.summaryEvidence, {
        count: 3,
        includedTokens: 2400,
        originalTokens: 5700,
        labels: ['Continuity Memory', 'World state summary', ...Array.from({ length: 10 }, (_, index) => `Summary ${index}`)],
        scannedAt: 123456,
    });
});

test('offscreen causes persist privately while injection exposes only their consequence', () => {
    const causalEvent = {
        id: 'school-conflict',
        engine: 'peer-conflict-escalation',
        title: 'Conflict at school',
        summary: 'A classmate struck Eli during an offscreen dispute.',
        scope: 'offscreen',
        epistemicStatus: 'simulated',
        disclosure: 'hidden',
        status: 'active',
        confidence: 'moderate',
        timing: 'during the school day',
        dueState: 'due',
        cause: 'A simmering peer conflict escalated while Eli was at school.',
        consequences: ['Eli returns with a black eye.', 'Eli may avoid discussing school.'],
        basis: 'Eli attended school and the peer conflict was already active.',
        requirements: [],
    };
    const guide = {
        ...stateNextGuides[0],
        id: 'eli-returns-marked',
        causalEngine: 'peer-conflict-escalation',
        direction: 'Eli returns from school with a black eye and does not volunteer an explanation.',
        worldDelta: 'Eli arrives home with a visible black eye.',
        causalEventIds: ['school-conflict'],
        disclosure: 'consequence-only',
    };
    const state = normalizeState({ ...defaultState(), narrativeEvents: [causalEvent], nextGuides: [guide, stateNextGuides[1]] });
    const restored = loadState(saveState({}, state));
    const plannerState = stateForPrompt(restored);
    assert.equal(plannerState.narrativeEvents[0].scope, 'offscreen');
    assert.equal(plannerState.narrativeEvents[0].epistemicStatus, 'simulated');
    assert.equal(plannerState.narrativeEvents[0].cause, causalEvent.cause.slice(0, 140));
    const payload = buildPromptPayload(restored, { guidanceUsable: true });
    assert.match(payload, /Eli arrives home with a visible black eye/);
    assert.match(payload, /Show only the perceivable consequence/);
    assert.doesNotMatch(payload, /classmate struck|peer conflict escalated|school-conflict/iu);
});

test('legacy causal events without an owning engine are discarded', () => {
    const state = normalizeState({
        ...defaultState(),
        narrativeEvents: [{
            id: 'legacy-unowned',
            title: 'Legacy event',
            summary: 'An old event carried a consequence without causal ownership.',
            consequences: ['An unrelated route was attached to it.'],
        }],
    });
    assert.deepEqual(state.narrativeEvents, []);
});

test('state round trips through portable metadata', () => {
    const metadata = saveState({ title: 'chat' }, { ...defaultState(), continuityThreads: currentPlan.continuityThreads, selfChallenge: currentPlan.selfChallenge, guidance: 'take a breath', sourceChatId: 'chat-1', sourceMessageCount: 1, lastAnalysisFingerprint: fingerprintMessages([{ mes: 'hello', is_user: true }]), scene: { status: 'active' }, lastRequestVerification: { status: 'confirmed', guidanceBlock: '<living-world-guide>take a breath</living-world-guide>', requestedAt: 10, confirmedAt: 20, sourceMessageCount: 1, responseMessageCount: 2, chatId: 'chat-1', provider: 'custom', model: 'model', position: 'at-depth', role: 'user', depth: 3, guideCandidates: stateNextGuides, canonConstraints: ['Fact before the response.'], selectedGuideIndex: 1 } });
    assert.equal(metadata.title, 'chat');
    assert.equal(loadState(metadata).guidance, 'take a breath');
    assert.equal(loadState(metadata).lastRequestVerification.guidanceBlock, '<living-world-guide>take a breath</living-world-guide>');
    assert.equal(loadState(metadata).lastRequestVerification.responseMessageCount, 2);
    assert.equal(loadState(metadata).lastRequestVerification.guideCandidates.length, 2);
    assert.equal(loadState(metadata).lastRequestVerification.selectedGuideIndex, 1);
    assert.equal(loadState(metadata).continuityThreads[0].id, 'chancellor-petition');
    assert.match(loadState(metadata).selfChallenge.counterRoute, /Chancellor petition/);
    assert.deepEqual(loadState(metadata).lastRequestVerification.canonConstraints, ['Fact before the response.']);
    assert.equal(clearState(metadata)[STATE_KEY], undefined);
});

test('request verification accepts an in-place swipe replacement', () => {
    const messages = [{ mes: 'question', is_user: true }, { mes: 'new swipe', is_user: false }];
    const base = { chatId: 'chat-1', sourceMessageCount: 2 };
    assert.equal(returnedReplyMatchesVerification({ ...base, replacementGeneration: true }, messages, 'chat-1'), true);
    assert.equal(returnedReplyMatchesVerification({ ...base, replacementGeneration: false }, messages, 'chat-1'), false);
    assert.equal(returnedReplyMatchesVerification({ ...base, replacementGeneration: true }, messages, 'other-chat'), false);
});

test('planner audits only the movement actually sent while alternatives remain archived', () => {
    const state = {
        ...defaultState(),
        lastRequestVerification: {
            status: 'confirmed', guidanceBlock: 'guide', chatId: 'chat-1',
            guideCandidates: stateNextGuides, selectedGuideIndex: 1,
        },
    };
    const promptState = stateForPrompt(state);
    assert.deepEqual(promptState.lastOfferedCues.map(item => item.id), ['telling-deflection']);
    assert.equal(promptState.lastOfferedCues[0].worldDelta, stateNextGuides[1].worldDelta);
    assert.equal(promptState.lastOfferedCues[0].requestConfirmed, true);
    assert.equal(Object.hasOwn(promptState, 'lastDelivery'), false);
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

test('state replaces repeated generic horizon labels with a readable distance ladder', () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
        id: `h${index}`,
        direction: `Direction ${index}`,
        timeframe: 'open-ended future',
        stability: index < 2 ? 'fluid' : index < 4 ? 'adaptive' : index < 6 ? 'stable' : 'slow',
        conditions: [],
        change: 'adjust',
        reason: 'Provider omitted a useful label.',
    }));
    const state = normalizeState({
        objectives: items.slice(0, 4).map(() => ({ title: 'Open direction · open-ended future' })),
        planHorizons: { items, deviation: { level: 'minor', reason: 'Normalized.' } },
    });
    assert.deepEqual(state.planHorizons.items.map(item => item.timeframe), [
        'next response', 'next few turns', 'current scene', 'next scene',
        'several scenes', 'current arc', 'later arcs', 'distant / open-ended',
    ]);
    assert.deepEqual(state.objectives.map(item => item.title), [
        'Open direction · next response', 'Open direction · next few turns',
        'Open direction · current scene', 'Open direction · next scene',
    ]);
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

test('replacement generation evaluates routes without the discarded assistant turn', () => {
    const messages = [{ mes: 'question', is_user: true }, { mes: 'discard me', is_user: false }];
    assert.deepEqual(generationRetrySource(messages, true), messages.slice(0, -1));
    assert.equal(generationRetrySource(messages, false), messages);
    assert.deepEqual(generationRetrySource(messages.slice(0, -1), true), messages.slice(0, -1));
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
    const migrated = normalizeState({ version: 16, ...currentPlan, nextGuides: stateNextGuides, canonConstraints: ['Fact from a discarded response.'], lastInject: true, lastRequestVerification: { status: 'confirmed', guidanceBlock: 'old', guideCandidates: stateNextGuides } });
    assert.equal(migrated.version, STATE_VERSION);
    assert.equal(migrated.canonBootstrapPending, true);
    assert.deepEqual(migrated.nextGuides, []);
    assert.deepEqual(migrated.canonConstraints, []);
    assert.equal(migrated.lastRequestVerification, null);
    assert.equal(isGuidanceUsable(migrated, [], ''), false);
});

test('pre-v24 candidates are rebuilt with layered authorial control while established canon survives', () => {
    const verification = { status: 'confirmed', guidanceBlock: 'old', guideCandidates: stateNextGuides };
    const migrated = normalizeState({ version: 22, ...currentPlan, nextGuides: stateNextGuides, canonConstraints: ['Established fact.'], lastRequestVerification: verification });
    assert.equal(migrated.version, STATE_VERSION);
    assert.equal(migrated.canonBootstrapPending, true);
    assert.deepEqual(migrated.nextGuides, []);
    assert.deepEqual(migrated.canonConstraints, ['Established fact.']);
    assert.equal(migrated.lastRequestVerification, null);
});

test('v25 plans rebuild once after duplicate-horizon recovery changes while canon survives', () => {
    const repeatedHorizons = {
        items: Array.from({ length: 6 }, (_, index) => ({ id: `old-${index}`, direction: 'Complete the current departure.', timeframe: `old-${index}`, stability: index === 5 ? 'slow' : 'adaptive', conditions: [], change: 'adjust', reason: 'Old recovery.' })),
        deviation: { level: 'none', reason: 'Old recovery.' },
    };
    const migrated = normalizeState({ version: 25, ...currentPlan, planHorizons: repeatedHorizons, objectives: [{ title: 'Old cloned objective.' }], narrativeEvents: [{ title: 'Current situation develops', summary: 'Complete the current departure.' }], nextGuides: stateNextGuides, guidance: 'Old recovered guidance.', lastInject: true, canonConstraints: ['Established fact.'], lastRequestVerification: { status: 'confirmed', guidanceBlock: 'old', guideCandidates: stateNextGuides } });
    assert.equal(migrated.version, STATE_VERSION);
    assert.equal(migrated.canonBootstrapPending, true);
    assert.deepEqual(migrated.nextGuides, []);
    assert.deepEqual(migrated.planHorizons.items, []);
    assert.deepEqual(migrated.objectives, []);
    assert.deepEqual(migrated.narrativeEvents, []);
    assert.equal(migrated.guidance, '');
    assert.equal(migrated.lastInject, false);
    assert.deepEqual(migrated.canonConstraints, ['Established fact.']);
    assert.equal(migrated.lastRequestVerification, null);
});

test('RP-specific lore signatures and baseline departures survive storage and planner projection', () => {
    const loreModel = {
        worldIdentity: 'A recognizable maritime republic whose present continuity has diverged.',
        baseline: 'The historical council appoints harbor officials by closed vote.',
        variantRules: ['In this continuity, public testimony can compel a recorded council hearing.'],
        continuitySignatures: [
            'The player personally holds the only surviving tide-ledger.',
            'The dockworkers and archivists formed an alliance during play.',
        ],
        baselineDepartures: ['The council now answers petitions in public instead of by closed review.'],
        trajectorySignals: ['The alliance is gathering testimony rather than preparing a revolt.'],
        activeForces: ['The council protects legitimacy while the harbor alliance seeks disclosure.'],
        confidence: 'high',
    };
    const restored = loadState(saveState({ title: 'chat' }, { ...defaultState(), loreModel }));

    assert.deepEqual(restored.loreModel, loreModel);
    assert.deepEqual(stateForPrompt(restored).loreModel, loreModel);
});

test('v30 migration clears excluded-block local chronology and retrospective trajectory while preserving future routes', () => {
    const migrated = normalizeState({
        version: 30,
        scene: { status: 'active', activity: 'after dinner', time: '6:42 PM' },
        narrativeLayers: { immediateAction: 'Walking after dinner', localActivity: 'Return after meal', situation: 'At home', widerWorld: 'A council review is pending.', durableTrajectory: 'Training remains open.' },
        pathways: [{ id: 'stale', direction: 'Finish the post-dinner return.', when: 'now' }],
        contextLedger: 'The meal has ended.',
        narrativeEvents: [{ id: 'stale-event', title: 'Dinner completed', summary: 'Dinner is over.' }],
        planHorizons: { items: [{ id: 'upstream', direction: 'Training remains open.', timeframe: 'later arcs', stability: 'slow', change: 'keep' }] },
    });
    assert.equal(migrated.scene.activity, '');
    assert.equal(migrated.scene.time, '');
    assert.equal(migrated.narrativeLayers.localActivity, '');
    assert.equal(migrated.narrativeLayers.widerWorld, 'A council review is pending.');
    assert.equal(migrated.narrativeLayers.durableTrajectory, '');
    assert.deepEqual(migrated.pathways, []);
    assert.equal(migrated.contextLedger, '');
    assert.deepEqual(migrated.narrativeEvents, []);
    assert.equal(migrated.planHorizons.items[0].direction, 'Training remains open.');
});

test('v43 migration deletes retrospective interpretation while preserving audited future lifecycle', () => {
    const migrated = normalizeState({
        version: 43,
        contextLedger: 'This is the definitive meaning and shape of the story so far.',
        directorScore: {
            storyIdentity: 'A retrospective master identity.',
            arcDirection: 'A model-authored interpretation of the past.',
            sceneFunction: 'Let the user linger over the document.',
            meaningfulAim: 'Keep future pressure dormant until the reading changes something.',
        },
        narrativeLayers: {
            localActivity: 'Reading the document slowly.',
            durableTrajectory: 'The model-defined whole-story trajectory.',
        },
        pathways: [{
            id: 'petition',
            direction: 'Allow the filed petition to receive an official result.',
            when: 'After the review process acts.',
            evidenceRefs: ['msg:42'],
            unresolvedBasis: 'No later evidence resolves, cancels, or contradicts the pending review.',
            completionCheck: 'unresolved',
        }],
        authorBoard: {
            scene: {
                requiredDevelopments: [{
                    id: 'petition-result',
                    instruction: 'The petition receives a formal result.',
                    status: 'delivered',
                    deliveredAtTurn: 9,
                }],
            },
        },
    });

    assert.equal(migrated.version, STATE_VERSION);
    assert.equal(migrated.contextLedger, '');
    assert.equal(migrated.directorScore.storyIdentity, '');
    assert.equal(migrated.directorScore.arcDirection, '');
    assert.equal(migrated.narrativeLayers.durableTrajectory, '');
    assert.deepEqual(migrated.pathways[0].evidenceRefs, ['msg:42']);
    assert.equal(migrated.pathways[0].unresolvedBasis, 'No later evidence resolves, cancels, or contradicts the pending review.');
    assert.equal(migrated.pathways[0].completionCheck, 'unresolved');
    assert.equal(migrated.authorBoard.scene.requiredDevelopments[0].status, 'delivered');
});

test('prompt payload keeps user directives active and only includes usable guidance', () => {
    const state = {
        ...defaultState(),
        directorScore: currentPlan.directorScore,
        narrativeLayers: currentPlan.narrativeLayers,
        continuityThreads: currentPlan.continuityThreads,
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
    assert.match(stale, /No current route is safe to reuse/);
    assert.match(stale, /BEAT REALIZATION/);
    assert.match(stale, /Introduce an event, actor, object, or world change only when/);
    assert.match(stale, /calm may remain calm/);
    assert.match(stale, /Never invent intrusion or player tasks to prove movement/);
    assert.match(stale, /leave choices open/);
    assert.match(stale, /Do not repeat completed events/);
    assert.match(stale, /User and roleplay instructions control expression/);
    assert.match(stale, /Tale Fairy supplies only movement/);
    assert.match(stale, /Never invent player dialogue, thoughts, feelings, choices, compliance, reactions, or extra activities/);
    assert.match(stale, /NPC requests are events, not authorization/);
    assert.doesNotMatch(stale, /Do not routinely end|issuing a command|waiting expectantly/);
    assert.doesNotMatch(stale, /Let Mara answer plainly|meaningful deflection/);
    const current = buildPromptPayload(state, {
        enabled: true,
        guidanceUsable: true,
        latestUserAction: 'I ask Mara what comes next.',
    });
    assert.match(current, /^<tale-fairy-context>/);
    assert.match(current, /<\/tale-fairy-context>$/);
    assert.doesNotMatch(current, /Keep the scene grounded/);
    assert.match(current, /Conditional authorial direction/);
    assert.match(current, /TALE FAIRY AUTHORIAL FRAME/);
    assert.match(current, /SELECTED FUTURE CAUSE: Establish the obligation as a real constraint/);
    assert.doesNotMatch(current, /DURABLE CONTEXT/);
    assert.match(current, /CURRENT SITUATION: An intimate home exchange constrained by Jedi obligations/);
    assert.match(current, /LOCAL ACTIVITY: A quiet tea conversation with Mara\. \[DEVELOPMENTAL\]/);
    assert.match(current, /LATEST USER ACTION: I ask Mara what comes next/);
    assert.match(current, /AUTHORIZED SCOPE: ACTION \(a ceiling, not a quota\)/);
    assert.match(current, /WIDER WORLD: Star Wars institutions, droids, duties/);
    assert.match(current, /ESTABLISHED OPEN THREADS \(continuity only; do not force onscreen\): dormant: Letter to the Chancellor/);
    assert.match(current, /filed petition awaits an official response/);
    assert.match(current, /ACTIVE CAUSAL FORCES: Jedi obligations constrain time and candor; Droids participate in domestic routine/);
    assert.match(current, /STORY OPERATION: SEED/);
    assert.match(current, /Tale Fairy controls future narrative function, pressure, and scale/);
    assert.match(current, /realize exact events, NPC actions, dialogue, outcomes, and prose/);
    assert.match(current, /AUTHORIAL INTENT: Let Mara answer plainly/);
    assert.match(current, /BEAT REALIZATION/);
    assert.match(current, /If invalid, do not force it; choose another supported beat function from current context/);
    assert.doesNotMatch(current, /\[EMPHASIS\]/);
    assert.match(current, /APPLY WHEN: The user continues or asks Mara/);
    assert.match(current, /DO NOT APPLY WHEN: The user leaves or changes subject/);
    assert.match(current, /STORY FUNCTION: Advance the live trust thread through a concrete disclosure/);
    assert.match(current, /IMPACT ENVELOPE: Mara reveals a concern/);
    assert.match(current, /direction or active horizon supports it/);
    assert.match(current, /binding at narrative-purpose level, not a prescribed incident/);
    assert.match(current, /Keep private future developments offscreen/);
    assert.match(current, /travel stops at arrival/);
    assert.match(current, /preserves the established clock/i);
    assert.match(current, /never treat a future activity as completed/i);
    assert.match(current, /broad activity may progress/);
    assert.doesNotMatch(current, /I play the game/);
    assert.match(current, /named action permits one instance and immediate result/);
    assert.match(current, /not repetition, onward movement, obeying a request, or unstated reaction/);
    assert.match(current, /NPC requests\/orders are world actions, not player authorization/);
    assert.match(current, /Tale Fairy movement comes from independent character\/world change, not assigning the player a task/);
    assert.match(current, /Only simulate low-stakes procedure implicit in broad scope/);
    assert.match(current, /Apply established strengths\/limits proportionately/);
    assert.match(current, /never cancel exceptional advantages/);
    assert.match(current, /Keep unresolved choices open/);
    assert.match(current, /Primary user and roleplay instructions control voice, dialogue, prose, format, length, and response shape/);
    assert.match(current, /Tale Fairy changes none of them/);
    assert.doesNotMatch(current, /Do not routinely end|Ask only when|saying “your call”|waiting expectantly/);
    assert.match(current, /preserve established meanings and player agency/);
    assert.doesNotMatch(current, /discarded reply/);
    assert.doesNotMatch(current, /Mara must choose between the relationship and a Jedi obligation/);
    assert.doesNotMatch(current, /future_setup|FUTURE SETUP|later in the current arc/);
    assert.doesNotMatch(current, /GROUNDING:|EXECUTION:|response is incomplete|failure/);
    assert.doesNotMatch(current, /Mara is present/);
    assert.doesNotMatch(current, /telling-deflection|meaningful deflection/);
    assert.doesNotMatch(current, /PATHWAYS|TIME HORIZONS|Revisit the obligation/);

    const swipe = buildPromptPayload(state, { enabled: true, guidanceUsable: true, guideCandidates: stateNextGuides, guideIndex: 1, regeneration: true });
    assert.match(swipe, /Conditional authorial direction for a different regeneration/);
    assert.match(swipe, /AUTHORIAL INTENT: Let Mara reveal a different pressure/);
    assert.match(swipe, /meaningful deflection/);
    assert.doesNotMatch(swipe, /Let Mara answer plainly/);
    assert.match(swipe, /Do not reuse the discarded reply's concrete realization/);
    assert.match(swipe, /When APPLY holds and its exclusion does not/);
    assert.doesNotMatch(swipe, /moderate|original|GROUNDING:|EXECUTION:/);

    const longMovement = { ...stateNextGuides[0], direction: `${'measured '.repeat(22)}extraordinary consequence` };
    const clipped = buildPromptPayload(state, { enabled: true, guidanceUsable: true, guideCandidates: [longMovement] });
    const movementLine = clipped.match(/^AUTHORIAL INTENT: (.+)$/m)?.[1] || '';
    assert.match(movementLine, /…$/);
    assert.doesNotMatch(movementLine, /\bextra?$/);

    const regenerationFallback = buildPromptPayload(state, { enabled: true, guidanceUsable: false, guideCandidates: [], regeneration: true, variationCue: 8472 });
    assert.match(regenerationFallback, /Background variation 8472/);
    assert.match(regenerationFallback, /realize a different supported beat function/);
    assert.match(regenerationFallback, /BEAT REALIZATION/);
    assert.match(regenerationFallback, /do not repeat the discarded event/);
    assert.match(regenerationFallback, /alter established meanings/);
    const regenerationGuide = regenerationFallback.match(/<living-world-guide>([\s\S]*?)<\/living-world-guide>/)?.[1] || '';
    assert.ok(regenerationGuide.length < 800);
    assert.doesNotMatch(regenerationFallback, /Let Mara answer plainly|meaningful deflection/);
    assert.equal(buildPromptPayload(state, { enabled: false, guidanceUsable: true }), '');
});

test('replacement payload uses pre-response canon instead of facts inferred from the discarded reply', () => {
    const state = { ...defaultState(), canonConstraints: ['Vekk promised something only in the discarded response.'], nextGuides: stateNextGuides };
    const payload = buildPromptPayload(state, { guidanceUsable: true, regeneration: true, canonConstraints: ['Lucia remains at the tray station.'] });
    assert.match(payload, /Lucia remains at the tray station/);
    assert.doesNotMatch(payload, /Vekk promised something only in the discarded response/);
});

test('roleplay injection stays bounded with maximum notes, canon, and route fields', () => {
    const long = 'constraint '.repeat(100);
    const route = { id: 'route', direction: long, use_when: long, drop_when: long, causal_role: `Advance ${long}`, world_delta: long, origin: 'original', basis: long, strength: 'moderate', source_pathways: ['path'] };
    const state = {
        ...defaultState(),
        canonConstraints: Array.from({ length: 12 }, (_, index) => `canon-${index} ${long}`),
        userNotes: Array.from({ length: 12 }, (_, index) => ({ kind: index % 2 ? 'forbid' : 'establish', text: `note-${index} ${long}`, at: index })),
        nextGuides: Array.from({ length: 3 }, (_, index) => ({ ...route, id: `route-${index}` })),
    };
    const payload = buildPromptPayload(state, { guidanceUsable: true });
    assert.ok(payload.length < 7000, `expected bounded injection, got ${payload.length} characters`);
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
    assert.match(payload, /<living-world-guide>[\s\S]*No current route is safe to reuse/);
    assert.match(payload, /BEAT REALIZATION/);
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
    assert.match(payload, /preserve their stated magnitude, scope, and qualifiers/);
    assert.match(payload, /Unstated details remain creative space/);
    assert.doesNotMatch(payload, /fabricating false precision|invent a conservative exact number/);
});

test('the lean guide preserves player agency without a general narrative-policy lecture', () => {
    const state = {
        ...defaultState(),
        guidance: 'Add another waiting-room beat and end before the consultation begins.',
        lastInject: true,
    };
    const payload = buildPromptPayload(state, { enabled: true, guidanceUsable: true });
    assert.equal(hasExplicitProgressDirective('I open the consultation door and walk inside to receive my results.'), false);
    assert.match(payload, /Never invent player dialogue, thoughts, feelings, choices, compliance, reactions, or extra activities/);
    assert.doesNotMatch(payload, /<tale-fairy-narrative-policy>|Carry its declared actions|Before ending|Routine logistics/);
});

test('v42 planning migrates only future work into the author board without retaining a model-authored story identity', () => {
    const migrated = normalizeState({ version: 42, ...currentPlan, canonBootstrapPending: false });
    assert.equal(migrated.version, 44);
    assert.equal(migrated.canonBootstrapPending, false);
    assert.equal(migrated.authorBoard.story.identity, '');
    assert.equal(migrated.authorBoard.activeArc.id, '');
    assert.equal(migrated.authorBoard.scene.purpose, currentPlan.directorScore.sceneFunction);
    assert.ok(migrated.authorBoard.scene.requiredDevelopments.length > 0);
});

test('planner completion refreshes the persistent author board and resets maintenance', () => {
    const planned = applyPlannerAuthorLayer({
        ...defaultState(),
        ...currentPlan,
        plannerSchedule: { turnsSincePlanner: 6, refreshInterval: 6 },
    }, { turnCount: 8, fingerprint: 'current-chat' });
    assert.equal(planned.plannerSchedule.turnsSincePlanner, 0);
    assert.equal(planned.plannerSchedule.lastPlannerTurn, 8);
    assert.equal(planned.plannerSchedule.lastPlannerFingerprint, 'current-chat');
    assert.equal(planned.conductor.status, 'invalid');
    assert.ok(planned.authorBoard.scene.requiredDevelopments.some(item => item.status === 'queued'));
});

test('an active response contract is injected even between AI planner refreshes', () => {
    const state = normalizeState({
        ...defaultState(),
        conductor: {
            status: 'active',
            pacing: 'linger',
            scenePurpose: 'Let studying change what is understood without ending the session.',
            requiredDevelopment: 'Reveal one useful fact from the current page.',
            allowedMovement: 'Deepen the reading activity.',
            forbiddenMovement: 'Do not finish the book or move the player.',
            backgroundTick: 'Advance hidden processes silently.',
            exitGate: 'Only when the user stops reading or advances.',
        },
    });
    const payload = buildPromptPayload(state, { enabled: true, guidanceUsable: false });
    assert.match(payload, /TALE FAIRY — NEXT RESPONSE CONTRACT/);
    assert.match(payload, /PACE: LINGER/);
    assert.match(payload, /REQUIRED DEVELOPMENT: Reveal one useful fact/);
    assert.match(payload, /Do not finish the book/);
});
