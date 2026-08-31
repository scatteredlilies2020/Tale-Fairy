import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANALYSIS_OUTPUT_CONTRACT, ANALYSIS_SCHEMA, ANALYSIS_SCHEMA_VALUE, MODE_INSTRUCTIONS, applyAnalysis, buildAnalysisPrompt, buildRebuildTimelineEvidence, extractJson, SYSTEM, validateAnalysisResult } from '../extension/analysis.js';
import { defaultState } from '../extension/state.js';
import { estimateTokenCount } from '../extension/token-budget.js';

const pathways = [{ id: 'tea-talk', direction: 'Let the tea conversation reveal a useful tension.', when: 'The user continues the conversation or asks Mara directly.', response_bias: 'Have Mara answer plainly and expose one concrete concern.', horizon: 'next few turns', status: 'foreground', conditions: [], change: 'replace', reason: 'The current exchange supports this route.' }];
const nextGuides = [
    { id: 'plain-concern', direction: 'Let Mara answer plainly while one concrete concern changes the exchange.', use_when: 'The user continues the conversation or addresses Mara.', drop_when: 'The user leaves, changes subject, or explicitly rejects the conversation.', causal_role: 'Advance the trust thread through a concrete disclosure.', world_delta: 'Mara discloses a concern that changes what both characters understand.', origin: 'inferred', basis: 'Mara is present, engaged, and the current exchange supports a direct concern.', strength: 'strong', source_pathways: ['tea-talk'], causal_event_ids: [], disclosure: 'none', reason: 'The direct exchange makes this the strongest continuation.' },
    { id: 'revealing-deflection', direction: 'Let Mara deflect in a way that reveals a different pressure through behavior.', use_when: 'The user remains present and Mara has reason not to answer plainly.', drop_when: 'The user establishes that Mara answers directly or the pressure is absent.', causal_role: 'Advance the social-pressure thread through an indirect consequence.', world_delta: 'Mara exposes a different pressure through behavior, changing the social stakes.', origin: 'original', basis: 'Her established hesitation can plausibly surface indirectly in this exchange.', strength: 'moderate', source_pathways: ['tea-talk'], causal_event_ids: [], disclosure: 'none', reason: 'This contrasts with a plain answer while preserving the same continuity.' },
    { id: 'outside-pressure', direction: 'Let a concrete household consequence intrude on the conversation without ending it.', use_when: 'The conversation continues in the active home setting.', drop_when: 'The user establishes privacy or leaves the setting.', causal_role: 'Seed a practical household pressure that can affect later choices.', world_delta: 'A household demand creates a new practical choice while the concern remains live.', origin: 'original', basis: 'The active home setting can plausibly exert a small but consequential pressure.', strength: 'light', source_pathways: ['tea-talk'], causal_event_ids: [], disclosure: 'none', reason: 'This adds a world-driven option distinct from disclosure or deflection.' },
];
const planHorizons = {
    items: [
        { id: 'reply', branch: 'current-conversation', direction: 'Answer the immediate question.', timeframe: 'this reply', stability: 'fluid', conditions: [], change: 'replace', reason: 'Immediate user action.' },
        { id: 'turns', branch: 'current-conversation', direction: 'Let the concern affect the conversation.', timeframe: 'next 2–4 turns', stability: 'adaptive', conditions: ['The conversation continues.'], change: 'replace', reason: 'Natural follow-through.' },
        { id: 'scene', branch: 'current-conversation', direction: 'End the tea scene with a changed understanding.', timeframe: 'current scene', stability: 'adaptive', conditions: [], change: 'replace', reason: 'Scene direction.' },
        { id: 'arc', branch: 'jedi-obligation', direction: 'Revisit the underlying obligation later.', timeframe: 'current arc', stability: 'stable', conditions: ['The obligation remains unresolved.'], change: 'replace', reason: 'Longer consequence.' },
        { id: 'later-arcs', branch: 'changing-loyalties', direction: 'Let changing loyalties reshape how the obligation matters.', timeframe: 'later or multiple arcs', stability: 'stable', conditions: ['The relationship continues.'], change: 'replace', reason: 'Distant relationship direction.' },
        { id: 'distant-arc', branch: 'open-vocation', direction: 'Keep the obligation available as one evolving long-term pressure.', timeframe: 'later arcs / open-ended', stability: 'slow', conditions: ['It has not become irrelevant.'], change: 'replace', reason: 'Provisional distant trajectory.' },
    ],
    deviation: { level: 'none', reason: 'Initial plan.' },
};
const directorScore = { story_identity: 'A Star Wars survival and institutional-conflict arc about trust under Jedi obligations.', scene_function: 'Let a quiet exchange alter trust.', setting_identity: 'Star Wars lived through its institutions, droids, technology, and social scale', setting_forces: ['A serving droid witnesses and mediates domestic routine.', 'Jedi obligations constrain available time and candor.'], causal_tempo: 'seed', arc_direction: 'Let ordinary interaction expose how affection and institutional duty compete across the next few turns.', future_setup: { id: 'duty-conflict', development: 'Mara must eventually choose between the relationship and a Jedi obligation.', current_step: 'Establish the obligation as a concrete constraint.', conditions: ['The duty becomes due.'], earliest_window: 'later in the current arc', disclosure: 'hidden' }, meaningful_aim: 'Change what Mara and the user understand about the limits of their trust.', change: 'adjust', basis: 'The active conversation is intimate, while established Star Wars institutions shape Mara’s choices.' };
const narrativeLayers = { immediate_action: 'Continue the tea conversation.', local_activity: 'A quiet tea conversation with Mara.', situation: 'An intimate home exchange constrained by Jedi obligations.', wider_world: 'Star Wars institutions, droids, duties, and ongoing life beyond this room.', durable_trajectory: 'An open-ended survival and institutional-conflict story about trust under Jedi obligations.', activity_role: 'developmental', temporal_scope: 'action' };
const continuityThreads = [{ id: 'chancellor-petition', thread: 'Letter to the Chancellor', state: 'The filed petition awaits routing or an official response.', status: 'dormant', basis: 'The intake clerk accepted and filed the petition.' }];
const selfChallenge = { weakness: 'The direct answer may overfocus the newest local exchange.', counter_route: 'Let the unresolved Chancellor petition create independent institutional movement.', decision: 'Keep the direct answer now because it has stronger immediate support, while retaining the petition as a distinct future route.' };
const loreModel = { world_identity: 'An established speculative setting', baseline: 'Institutions, technology, and social obligations operate according to the supplied setting lore.', variant_rules: [], continuity_signatures: ['The current relationship and its accumulated trust are specific to this roleplay.'], baseline_departures: [], trajectory_signals: ['Trust and institutional duty are moving toward a consequential choice.'], active_forces: ['Institutional obligations', 'Relationship trust'], confidence: 'high' };
const requiredPlanning = { story_frame: { frame: 'grounded', confidence: 'high', basis: 'ordinary scene' }, director_score: directorScore, lore_model: loreModel, narrative_layers: narrativeLayers, pathways, next_guides: nextGuides, plan_horizons: planHorizons, continuity_threads: continuityThreads, canon_constraints: [], note_resolution: null, ledger: 'Tea conversation is active.\nOpen routes: the filed Chancellor petition remains unresolved.', narrative_events: [], cue_audit: { offered_ids: [], manifested_ids: [], unused_ids: [], contradicted_ids: [], pacing: 'respected', reason: 'No prior cues were offered.' }, self_challenge: selfChallenge };

const compactRoutes = [
    ['reply', 'immediate', 'conversation', 'the current participants', 'current exchange', 'direct', 'scene', 'Let the immediate answer change what the participants understand.', 'local', 'established'],
    ['duty', 'character', 'personal-duty', 'an independently motivated character', 'personal obligation', 'independent', 'days', 'Let an existing personal obligation independently constrain a later choice.', 'near', 'inferred'],
    ['trust', 'relationship-institution', 'relationship-trust', 'the relationship', 'accumulated trust', 'emergent', 'arc', 'Let accumulated trust produce a materially different decision point.', 'mid', 'inferred'],
    ['process', 'lore-world', 'formal-process', 'a world institution', 'formal process', 'independent', 'arc', 'Let a dormant formal process mature according to its own institutional causes.', 'far', 'established'],
    ['departure', 'original', 'open-departure', 'a compatible new opportunity', 'new opportunity', 'emergent', 'arc', 'Keep a compatible departure or reinvention available if present loyalties change.', 'wildcard', 'original'],
    ['life-course', 'long-range', 'open-vocation', 'the character and wider society', 'life-course change', 'emergent', 'open-ended', 'Let accumulated choices eventually reshape vocation, belonging, or social position.', 'far', 'inferred'],
].map(([id, lane, branch, agent, engine, relation, scale, direction, horizon, origin]) => ({
    id, lane, branch, agent, engine, relation, scale, direction, horizon, timeframe: scale,
    conditions: ['Its stated cause remains active.'],
    status: horizon === 'local' ? 'foreground' : 'available',
    origin,
    basis: 'Current evidence supports this as a conditional route.',
    mechanism_status: origin === 'original' ? 'new' : 'evidenced',
    mechanism_basis: origin === 'original' ? 'A distinct future opportunity must first arise under the stated condition.' : 'The supplied narrative establishes this process and the exact function claimed here.',
    evidence_refs: origin === 'original' ? [] : ['msg:1'],
    unresolved_basis: origin === 'original' ? 'A distinct compatible future cause has not started yet.' : 'Newer evidence does not depict completion, cancellation, contradiction, or irrelevance.',
    completion_check: origin === 'original' ? 'new-cause' : 'unresolved',
    strength: horizon === 'local' ? 'strong' : 'moderate',
}));
const compactResult = {
    contract_version: 2,
    current: { frame: 'grounded', frame_basis: 'The depicted exchange follows established physical and social rules.', status: 'A quiet exchange is active.', immediate_action: 'Answer the immediate question.', activity: 'A private conversation.', situation: 'Trust is changing under an external obligation.', wider_world: 'Independent institutions and relationships continue beyond the room.', activity_role: 'developmental', temporal_scope: 'action', location: 'home', time: 'evening', loop: false },
    decision: { operation: 'advance', scene_function: 'Change mutual understanding.', aim: 'Make the answer consequential without deciding for the player.', setup: 'An obligation will become harder to ignore.', conditions: ['The obligation remains active.'], earliest: 'later in the current arc', disclosure: 'hidden', basis: 'The active exchange and retained state support bounded movement.' },
    world: { identity: 'An established speculative setting', baseline: 'Its institutions and technology operate according to supplied lore.', variant_rules: [], rp_changes: ['This relationship and its history are specific to the roleplay.'], signatures: ['Accumulated trust is consequential.'], trajectory_signals: ['Duty and trust are approaching a choice.'], forces: ['Institutional obligation', 'Relationship trust'], confidence: 'high' },
    thread_updates: [{ op: 'upsert', id: 'formal-process', thread: 'Pending formal process', state: 'It remains filed and unresolved.', status: 'dormant', basis: 'A prior depicted filing established it.' }],
    actor_updates: [{ op: 'upsert', name: 'Mara', state: 'Waiting beyond the current room.', location: 'outer hall', perspective: 'The obligation is real but candor still carries a cost.', motivation: 'Protect trust without abandoning duty.', knowledge: 'Knows the obligation is active.', constraints: 'Cannot abandon the obligation without consequences.', agenda: 'Decide how candid to be.', window: 'current scene' }],
    routes: compactRoutes,
    portfolio: { immediate: 'reply', character: 'duty', relationship_institution: 'trust', lore_world: 'process', original: 'departure', long_range: 'life-course' },
    guides: compactRoutes.slice(0, 4).map((route, index) => ({ id: `guide-${index}`, route_id: route.id, engine: route.engine, direction: route.direction, use_when: 'The route remains compatible with the newest user action.', drop_when: 'New evidence contradicts its cause.', operation: index ? 'seed' : 'advance', function: `Change the ${route.branch} thread through its own causal process.`, world_delta: `The ${route.branch} process gains one concrete condition.`, disclosure: 'none', event_ids: [] })),
    event_updates: [], canon_updates: [], ledger: 'The conversation is active; trust, duty, and the pending formal process remain independent routes.', note_resolution: null,
    audit: { weakness: 'The immediate exchange could overfocus the latest subject.', counter_route: 'An independent formal process can mature without intruding now.', mechanism_check: 'No route gives an established process an unstated capability; new functions use distinct future causes.', decision: 'Advance the exchange while retaining genuinely separate future causes.' },
    guidance: 'Make the current answer consequential while preserving independent actors and open routes.',
};

test('extractJson accepts fenced and wrapped JSON', () => {
    assert.deepEqual(extractJson('```json\n{"inject":false}\n```'), { inject: false });
    assert.deepEqual(extractJson('prefix {"inject":true} suffix'), { inject: true });
});

test('planner validation rejects empty or incomplete structured output', () => {
    assert.equal(validateAnalysisResult({}).valid, false);
    assert.equal(validateAnalysisResult({
        scene: { status: 'uninitialized', activity: '', pace: '', intent: '', location: '', time: '', loop: false },
        objectives: [], entities: [], possibilities: [], guidance: '', inject: false, reason: '',
    }).valid, false);
    assert.equal(validateAnalysisResult({
        ...requiredPlanning,
        scene: { status: 'active', activity: '', pace: 'slow', intent: '', location: '', time: '', loop: false },
        objectives: [], entities: [], possibilities: [], guidance: '', inject: false, reason: 'No intervention needed.',
    }).valid, false);
    assert.equal(validateAnalysisResult({
        ...requiredPlanning,
        scene: { status: 'active', activity: '', pace: 'slow', intent: '', location: '', time: '', loop: false },
        objectives: [], entities: [], possibilities: [], guidance: 'Preserve the slow pace and deepen the next supported reaction.', inject: true, reason: 'Even a quiet scene benefits from focused guidance.',
    }).valid, true);
    assert.equal(validateAnalysisResult({ ...requiredPlanning, narrative_layers: undefined }).valid, false);
    assert.equal(validateAnalysisResult({ ...requiredPlanning, continuity_threads: undefined }).valid, false);
    assert.equal(validateAnalysisResult({ ...requiredPlanning, continuity_threads: [{ ...continuityThreads[0], status: 'forgotten' }] }).valid, false);
    assert.equal(validateAnalysisResult({ ...requiredPlanning, self_challenge: undefined }).valid, false);
    assert.equal(validateAnalysisResult({ ...requiredPlanning, self_challenge: { ...selfChallenge, decision: '' } }).valid, false);
    assert.equal(validateAnalysisResult({ ...requiredPlanning, narrative_layers: { ...narrativeLayers, activity_role: 'foreground' } }).valid, false);
    assert.equal(validateAnalysisResult({ ...requiredPlanning, narrative_layers: { ...narrativeLayers, temporal_scope: 'turn' } }).valid, false);
});

test('runtime planner logic contains no scenario-specific character or franchise recovery keys', () => {
    const source = ['analysis.js', 'state.js', 'index.js']
        .map(file => readFileSync(new URL(`../extension/${file}`, import.meta.url), 'utf8'))
        .join('\n');
    assert.doesNotMatch(source, /Chancellor|C-5-2214|\bNim\b|Hokage|Dorn-2|Star Wars|Midichlorian|\bLucia\b|\bVekk\b|\bMara\b/u);
});

test('planner system is compact but preserves the causal planning contract', () => {
    assert.match(SYSTEM, /one current pool of six to eight materially different routes spanning local, near, middle, far, and wildcard horizons/);
    assert.match(SYSTEM, /Include every required lane/);
    assert.match(SYSTEM, /portfolio identifies the core six/);
    assert.match(SYSTEM, /long-range lane must use an engine independent of the immediate lane and concern a months-to-years or open-ended/);
    assert.match(SYSTEM, /at least five distinct engines/);
    assert.match(SYSTEM, /at least three genuinely independent centers of agency/);
    assert.match(SYSTEM, /must not absorb, preview, or realize another route's signature development/);
    assert.match(SYSTEM, /A quiet scene constrains what happens now, not diverse private planning/);
    assert.match(SYSTEM, /Every future path must grow from a present cause/);
    assert.match(SYSTEM, /exactly four ranked guides linked to four distinct routes from four distinct lanes/);
    assert.match(SYSTEM, /Copy each source route engine verbatim to its guide/);
    assert.match(SYSTEM, /omniscient authorial view/);
    assert.match(SYSTEM, /Narrative evidence always overrides baseline canon/);
    assert.match(SYSTEM, /Reject any route whose mechanism relies on baseline canon that variant_rules or rp_changes override/);
    assert.match(SYSTEM, /completed or established process cannot acquire/);
    assert.match(SYSTEM, /not merely two adjacent facts/);
    assert.match(SYSTEM, /For every route, audit the exact capability converting cause to result/);
    assert.match(SYSTEM, /mechanism_status=evidenced only when narrative evidence or unoverridden lore supports that exact function/);
    assert.match(SYSTEM, /rereading an old artifact cannot reveal data it was never shown to contain/);
    assert.match(SYSTEM, /mismatch between each mechanism_basis and claimed result/);
    assert.match(SYSTEM, /Country, society, institution, life, relationship, and character simulations/);
    assert.match(SYSTEM, /privately compare the preferred route with the strongest materially different supported route/);
    assert.match(SYSTEM, /delete the newest dominant hook/);
    assert.match(SYSTEM, /genuinely new engine rather than relabeling, combining, or administratively updating named pending hooks/);
    assert.match(SYSTEM, /Never output.*chain-of-thought/);
    assert.ok(estimateTokenCount(SYSTEM) < 2800, `system contract should stay compact; got ${estimateTokenCount(SYSTEM)} tokens`);
    const fixedEnvelope = `${SYSTEM}\n${ANALYSIS_OUTPUT_CONTRACT}`;
    assert.ok(estimateTokenCount(fixedEnvelope) < 3500, `fixed planner envelope should leave evidence room in a 12k budget; got ${estimateTokenCount(fixedEnvelope)} tokens`);
});

test('compact planner result accepts creative state deltas without semantic over-repair', () => {
    assert.equal(validateAnalysisResult(compactResult).valid, true);
    assert.equal(validateAnalysisResult({ ...compactResult, routes: compactResult.routes.map((route, index) => index ? route : { ...route, mechanism_basis: '' }) }).valid, false);
    assert.equal(validateAnalysisResult({ ...compactResult, routes: compactResult.routes.map((route, index) => index ? route : { ...route, mechanism_status: 'assumed' }) }).valid, false);
    assert.equal(validateAnalysisResult({ ...compactResult, routes: compactResult.routes.slice(0, 5) }).valid, false);
    assert.equal(validateAnalysisResult({ ...compactResult, guides: compactResult.guides.slice(0, 3) }).valid, false);
    assert.equal(validateAnalysisResult({ ...compactResult, routes: compactResult.routes.map(route => ({ ...route, agent: 'one causal center' })) }).valid, false);
    assert.equal(validateAnalysisResult({ ...compactResult, routes: compactResult.routes.map(route => ({ ...route, engine: 'one pending matter' })) }).valid, false);
    assert.equal(validateAnalysisResult({ ...compactResult, routes: compactResult.routes.map(route => ({ ...route, branch: 'shared display label' })) }).valid, true);
    const duplicateSemanticLanes = [
        { ...compactResult.routes.find(route => route.lane === 'character'), id: 'second-character', agent: 'another character', engine: 'another character process', direction: 'A different character pursues an unrelated aim.' },
        { ...compactResult.routes.find(route => route.lane === 'lore-world'), id: 'second-world', agent: 'another world system', engine: 'another world process', direction: 'A different world system creates an unrelated opportunity.' },
    ];
    assert.equal(validateAnalysisResult({ ...compactResult, routes: [...compactResult.routes, ...duplicateSemanticLanes] }).valid, true);
    assert.equal(validateAnalysisResult({ ...compactResult, routes: compactResult.routes.map(route => route.lane === 'long-range' ? { ...route, engine: compactResult.routes.find(item => item.lane === 'immediate').engine } : route) }).valid, false);
    assert.equal(validateAnalysisResult({ ...compactResult, routes: compactResult.routes.map(route => route.lane === 'long-range' ? { ...route, scale: 'days' } : route) }).valid, false);
    assert.equal(validateAnalysisResult({ ...compactResult, portfolio: { ...compactResult.portfolio, lore_world: 'duty' } }).valid, false);
    assert.equal(validateAnalysisResult({ ...compactResult, guides: compactResult.guides.map((guide, index) => index === 3 ? { ...guide, route_id: 'reply' } : guide) }).valid, false);
    assert.equal(validateAnalysisResult({ ...compactResult, guides: compactResult.guides.map((guide, index) => index === 0 ? { ...guide, engine: 'new opportunity' } : guide) }).valid, false);
    const ownedEvent = { op: 'upsert', id: 'exchange-shift', engine: 'current exchange', title: 'The exchange changes', summary: 'One concrete answer changes mutual understanding.', scope: 'onscreen', epistemic_status: 'inferred', disclosure: 'revealed', status: 'active', timing: 'current exchange', due_state: 'due', cause: 'The participants answer one another.', requirements: ['The exchange continues.'], basis: 'The current route supports it.' };
    const withOwnedEvent = { ...compactResult, event_updates: [ownedEvent], guides: compactResult.guides.map((guide, index) => index === 0 ? { ...guide, event_ids: ['exchange-shift'], disclosure: 'consequence-only' } : guide) };
    assert.equal(validateAnalysisResult(withOwnedEvent).valid, true);
    assert.equal(validateAnalysisResult({ ...withOwnedEvent, event_updates: [{ ...ownedEvent, engine: 'formal process' }] }).valid, false);
    const eventState = applyAnalysis(defaultState(), withOwnedEvent, [{ mes: 'Answer the question without deciding for me.', is_user: true }]);
    assert.equal(eventState.narrativeEvents[0].engine, 'current exchange');
    assert.deepEqual(eventState.nextGuides[0].causalEventIds, ['exchange-shift']);
    const resultWithUnlinkedDisclosure = { ...compactResult, guides: compactResult.guides.map((guide, index) => index === 0 ? { ...guide, disclosure: 'partial-clue', event_ids: ['missing-event'] } : guide) };
    assert.equal(validateAnalysisResult(resultWithUnlinkedDisclosure).valid, true);
    const next = applyAnalysis(defaultState(), resultWithUnlinkedDisclosure, [{ mes: 'Answer the question without deciding for me.', is_user: true }]);
    assert.equal(next.pathways.length, 6);
    assert.equal(next.planHorizons.items.length, 6);
    assert.equal(next.planHorizons.items.at(-1).stability, 'slow');
    assert.deepEqual(new Set(next.pathways.map(route => route.lane)), new Set(['immediate', 'character', 'relationship-institution', 'lore-world', 'original', 'long-range']));
    assert.equal(next.pathways.find(route => route.id === 'life-course')?.scale, 'open-ended');
    assert.equal(next.pathways.find(route => route.id === 'life-course')?.engine, 'life-course change');
    assert.equal(next.pathways.find(route => route.id === 'departure')?.mechanismStatus, 'new');
    assert.match(next.pathways.find(route => route.id === 'departure')?.mechanismBasis, /distinct future opportunity/);
    assert.equal(next.planHorizons.items.find(route => route.id === 'reply')?.engine, 'current exchange');
    assert.equal(next.planHorizons.items.find(route => route.id === 'reply')?.mechanismStatus, 'evidenced');
    assert.equal(next.nextGuides[0].causalEngine, 'current exchange');
    assert.equal(next.nextGuides[0].mechanismStatus, 'evidenced');
    assert.equal(new Set(next.nextGuides.map(guide => guide.causalRole)).size, 4);
    assert.match(next.nextGuides[0].causalRole, /conversation thread/);
    assert.equal(next.nextGuides[0].disclosure, 'none');
    assert.deepEqual(next.nextGuides[0].causalEventIds, []);
    assert.ok(next.continuityThreads.some(thread => thread.id === 'formal-process'));
    assert.equal(next.entities.find(entity => entity.name === 'Mara')?.location, 'outer hall');
    assert.equal(next.entities.find(entity => entity.name === 'Mara')?.perspective, 'The obligation is real but candor still carries a cost.');
    assert.equal(next.entities.find(entity => entity.name === 'Mara')?.constraints, 'Cannot abandon the obligation without consequences.');
});
test('planner validates an automatically resolved AI-assisted note', () => {
    const result = {
        ...requiredPlanning,
        scene: { status: 'active', activity: 'working', pace: 'slow', intent: 'finish an assignment', location: 'home', time: 'evening', loop: false },
        objectives: [], entities: [], possibilities: [], guidance: 'Keep the work scene focused and let progress emerge through concrete action.', inject: true, reason: 'The quiet task still benefits from a small focus.',
        note_resolution: { kind: 'forbid' },
    };
    assert.equal(validateAnalysisResult(result).valid, true);
    assert.equal(validateAnalysisResult({ ...result, note_resolution: { kind: 'maybe', text: 'Anything' } }).valid, false);
    assert.equal(validateAnalysisResult({ ...result, note_resolution: null }).valid, true);
});

test('planner requires distinct alternatives for swipe variety', () => {
    const result = {
        ...requiredPlanning,
        scene: { status: 'active', activity: 'talking', pace: 'slow', intent: 'understand', location: 'home', time: 'evening', loop: false },
        objectives: [], entities: [], possibilities: [], guidance: '', inject: true, reason: 'Prepare contrasting continuations.',
    };
    assert.equal(validateAnalysisResult({ ...result, next_guides: [nextGuides[0]] }).valid, false);
    assert.equal(validateAnalysisResult({ ...result, next_guides: [nextGuides[0], { ...nextGuides[0] }] }).valid, false);
    assert.equal(validateAnalysisResult({ ...result, next_guides: nextGuides.map((guide, index) => index ? { ...guide, world_delta: nextGuides[0].world_delta } : guide) }).valid, false);
    assert.equal(validateAnalysisResult({ ...result, next_guides: nextGuides.map(({ world_delta, ...guide }) => guide) }).valid, false);
    assert.equal(validateAnalysisResult({ ...result, next_guides: nextGuides.map(guide => ({ ...guide, origin: 'wish' })) }).valid, false);
    assert.equal(validateAnalysisResult({ ...result, next_guides: nextGuides.map((guide, index) => index ? { ...guide, use_when: 'Alternative swipe wanting tension.' } : guide) }).valid, false);
    assert.equal(validateAnalysisResult({ ...result, next_guides: nextGuides.map((guide, index) => index ? guide : { ...guide, causal_role: 'Set a warm playful mood and quick prose tempo.' }) }).valid, false);
    assert.equal(validateAnalysisResult({ ...result, next_guides: nextGuides.map((guide, index) => index ? guide : { ...guide, causal_role: 'Make the exchange interesting.' }) }).valid, false);
    assert.equal(validateAnalysisResult({ ...result, next_guides: nextGuides.map((guide, index) => index ? guide : { ...guide, direction: 'Mara promises to explain tomorrow.', world_delta: 'Mara commits to a morning explanation.' }) }).valid, false);
    assert.equal(validateAnalysisResult({ ...result, next_guides: nextGuides.map((guide, index) => index ? guide : { ...guide, direction: 'A routine ping arrives.', world_delta: 'A small routine notice changes nothing important.' }) }).valid, false);
    assert.equal(validateAnalysisResult(result).valid, true);
});

test('post-response audit classifies optional cues without creating delivery debt', () => {
    const result = {
        ...requiredPlanning,
        scene: { status: 'active', activity: 'arriving for breakfast', pace: 'steady', intent: 'eat breakfast', location: 'dining hall', time: 'morning', loop: false },
        objectives: [], entities: [], possibilities: [], guidance: '', inject: true, reason: 'Keep background developments conditional.',
        cue_audit: { offered_ids: ['filing', 'message'], manifested_ids: [], unused_ids: ['filing', 'message'], contradicted_ids: [], pacing: 'respected', reason: 'Neither optional cue appeared; arrival remained within scope.' },
    };
    assert.equal(validateAnalysisResult(result).valid, true);
    assert.equal(validateAnalysisResult({ ...result, cue_audit: { ...result.cue_audit, unused_ids: ['filing'], manifested_ids: ['unknown'] } }).valid, false);
    const next = applyAnalysis(defaultState(), result, [{ mes: 'We arrive for breakfast.', is_user: false }]);
    assert.deepEqual(next.cueAudit.unusedIds, ['filing', 'message']);
    assert.equal(next.cueAudit.pacing, 'respected');
});

test('planner requires a distant but open-ended highest horizon', () => {
    const result = {
        ...requiredPlanning,
        scene: { status: 'active', activity: 'talking', pace: 'slow', intent: 'understand', location: 'home', time: 'evening', loop: false },
        objectives: [], entities: [], possibilities: [], guidance: 'Keep the present conversation specific.', inject: true, reason: 'A live direction is useful.',
    };
    const fixedLike = { ...result, plan_horizons: { ...planHorizons, items: planHorizons.items.map((item, index) => index === planHorizons.items.length - 1 ? { ...item, stability: 'stable' } : item) } };
    assert.equal(validateAnalysisResult(result).valid, true);
    assert.equal(validateAnalysisResult(fixedLike).valid, false);
});

test('planner rejects cosmetically different horizons that collapse into one future route', () => {
    const collapsed = {
        ...requiredPlanning,
        plan_horizons: {
            ...planHorizons,
            items: planHorizons.items.map((item, index) => index < 2 ? item : { ...item, branch: 'same-nim-council-thread' }),
        },
    };
    const validation = validateAnalysisResult(collapsed);
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some(error => /three meaningfully distinct future routes/i.test(error)));
    assert.ok(ANALYSIS_SCHEMA.value.properties.routes.items.required.includes('branch'));
    assert.ok(ANALYSIS_SCHEMA.value.properties.routes.items.required.includes('engine'));
});

test('planner schema uses SillyTavern structured-output packaging', () => {
    assert.equal(ANALYSIS_SCHEMA.name, 'tale_fairy_delta');
    assert.equal(ANALYSIS_SCHEMA.value, ANALYSIS_SCHEMA_VALUE);
    assert.equal(ANALYSIS_SCHEMA.value.type, 'object');
    assert.equal(ANALYSIS_SCHEMA.value.properties.contract_version.const, 2);
    assert.equal(ANALYSIS_SCHEMA.value.properties.routes.minItems, 6);
    assert.equal(ANALYSIS_SCHEMA.value.properties.routes.maxItems, 8);
    assert.deepEqual(ANALYSIS_SCHEMA.value.properties.current.properties.frame.enum, ['grounded', 'heightened', 'surreal']);
    assert.deepEqual(ANALYSIS_SCHEMA.value.properties.routes.items.properties.horizon.enum, ['local', 'near', 'mid', 'far', 'wildcard']);
    assert.deepEqual(ANALYSIS_SCHEMA.value.properties.routes.items.properties.lane.enum, ['immediate', 'character', 'relationship-institution', 'lore-world', 'original', 'long-range', 'extra']);
    assert.equal(ANALYSIS_SCHEMA.value.properties.guides.minItems, 4);
    assert.equal(ANALYSIS_SCHEMA.value.properties.guides.maxItems, 4);
    assert.ok(ANALYSIS_SCHEMA.value.required.includes('portfolio'));
    assert.ok(ANALYSIS_SCHEMA.value.properties.guides.items.required.includes('function'));
    assert.ok(ANALYSIS_SCHEMA.value.properties.guides.items.required.includes('engine'));
    assert.ok(ANALYSIS_SCHEMA.value.properties.event_updates.items.required.includes('engine'));
    assert.ok(ANALYSIS_SCHEMA.value.properties.routes.items.required.includes('evidence_refs'));
    assert.ok(ANALYSIS_SCHEMA.value.properties.routes.items.required.includes('unresolved_basis'));
    assert.ok(ANALYSIS_SCHEMA.value.properties.routes.items.required.includes('completion_check'));
    assert.equal(ANALYSIS_SCHEMA.value.properties.current.properties.durable_trajectory, undefined);
    assert.equal(ANALYSIS_SCHEMA.value.properties.decision.properties.story_identity, undefined);
    assert.equal(ANALYSIS_SCHEMA.value.properties.decision.properties.arc_direction, undefined);
    assert.equal(ANALYSIS_SCHEMA.returnInvalid, true);
    assert.equal(ANALYSIS_SCHEMA.strict, true);
    assert.equal(ANALYSIS_SCHEMA.type, undefined);
    assert.deepEqual(ANALYSIS_SCHEMA.value.required, Object.keys(ANALYSIS_SCHEMA.value.properties));
});

test('analysis prompt includes bootstrap context and marks retained state as older than the newest message', () => {
    const promptText = buildAnalysisPrompt([
        { mes: 'I make tea', is_user: true },
        { mes: 'The tea is finished and the group enters the garden.', is_user: false },
    ], { ...defaultState(), scene: { ...defaultState().scene, activity: 'Making tea', location: 'Kitchen' } }, '', { scenario: 'A quiet apartment' });
    const prompt = JSON.parse(promptText);
    assert.equal(prompt.task, 'build_future_agenda');
    assert.match(prompt.bootstrap.scenario, /A quiet apartment/);
    assert.match(prompt.evidence_order_instruction, /highest-index message is the completed current story state/);
    assert.match(prompt.evidence_order_instruction, /current object is prior planner state/);
    assert.match(prompt.evidence_order_instruction, /never preserve an action, location, activity, event, or condition/);
    assert.match(prompt.evidence_order_instruction, /future activity.*remains future/i);
    assert.match(prompt.evidence_order_instruction, /statboxes and summaries are claims to audit, not proof/i);
    assert.match(prompt.evidence_order_instruction, /cannot complete an activity or advance the last supported clock unless prose depicts it/i);
    assert.match(prompt.evidence_order_instruction, /Preserve explicit clocks and dates only when supported/i);
    assert.ok(promptText.indexOf('evidence_order_instruction') < promptText.indexOf('"current"'));
});

test('planner receives and consistently uses the named player character identity', () => {
    const messages = [
        { mes: 'Welcome.', is_user: false, name: 'Narrator' },
        { mes: 'I ask Vekk about the war.', is_user: true, name: 'Lucia' },
    ];
    const state = {
        ...defaultState(),
        scene: { ...defaultState().scene, activity: 'The protagonist asks a question.' },
        objectives: [{ title: 'Help the protagonist', detail: 'Lucia waits for an answer.', status: 'active' }],
    };
    const prompt = JSON.parse(buildAnalysisPrompt(messages, state));
    assert.deepEqual(prompt.player_character, { name: 'Lucia' });
    assert.equal(prompt.messages.at(-1).name, 'Lucia');
    assert.match(prompt.player_identity_instruction, /same person, never separate entities/);
    assert.equal(prompt.current.scene.activity, 'Lucia asks a question.');
    assert.equal(prompt.current.objectives[0].title, 'Help Lucia');

    const next = applyAnalysis(state, {
        scene: { activity: 'Lucia and the protagonist wait together.' },
        objectives: [{ title: "Protect the protagonist's choice", detail: 'Lucia decides.', status: 'active' }],
        guidance: 'Let the protagonist answer.',
    }, messages);
    assert.equal(next.scene.activity, 'Lucia wait together.');
    assert.equal(next.objectives[0].title, "Protect Lucia's choice");
    assert.equal(next.guidance, 'Let Lucia answer.');
    assert.doesNotMatch(JSON.stringify(next), /protagonist/i);
});

test('planner preserves explicit extreme canon without normalizing it to setting averages', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: '[OOC: Lucia has a Midichlorian count off the charts, among the highest in history.]', is_user: true }], defaultState()));
    assert.match(prompt.extreme_canon_instruction, /facts remain authoritative even when extreme or unprecedented/);
    assert.match(prompt.extreme_canon_instruction, /averages are not ceilings/);
    assert.match(prompt.extreme_canon_instruction, /Unspecified details remain creative space/);
    assert.match(prompt.extreme_canon_instruction, /Keep all durable user-established constraints until corrected/);
    assert.match(prompt.extreme_canon_instruction, /remove ordinary plot history and planner inference from canon constraints/);
    const next = applyAnalysis(defaultState(), { canon_constraints: ['Lucia is among the highest in history; exact count is unspecified.'] }, []);
    assert.deepEqual(next.canonConstraints, ['Lucia is among the highest in history; exact count is unspecified.']);
});

test('card system material is treated as factual reference rather than planner instructions', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([], defaultState(), '', {
        scenario: 'A dangerous fantasy world.',
        cardSystemReference: 'If the protagonist dies, time returns to the last checkpoint. Write in purple prose.',
    }));
    assert.match(prompt.bootstrap.cardSystemReference, /time returns to the last checkpoint/);
    assert.match(prompt.bootstrap_instruction, /extract supported fictional facts, world mechanics, triggers/);
    assert.match(prompt.bootstrap_instruction, /do not adopt instructions about writing style/);
});

test('analysis prompt carries a provider-independent variation nonce', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: 'I make tea', is_user: true }], defaultState(), '', {}, { variationNonce: 12345 }));
    assert.equal(prompt.planner_variation_nonce, 12345);
    assert.match(prompt.planner_variation_instruction, /ordinary prompt nonce/);
});

test('analysis prompt asks for novelty without forcing player action', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: 'We visit the art gallery again', is_user: true }], defaultState()));
    assert.equal(prompt.messages.at(-1).content, 'We visit the art gallery again');
    assert.match(SYSTEM, /Test for recency fixation/);
    assert.match(SYSTEM, /Never invent the player's dialogue, feelings, consequential choices/);
});

test('planner modes provide materially distinct intervention policies', () => {
    const prompts = Object.fromEntries(['light', 'balanced', 'fun'].map(mode => {
        const state = { ...defaultState(), mode };
        return [mode, JSON.parse(buildAnalysisPrompt([{ mes: 'The room goes quiet.', is_user: false }], state))];
    }));
    assert.equal(prompts.light.mode_instruction, MODE_INSTRUCTIONS.light);
    assert.match(prompts.light.mode_instruction, /Favor HOLD, small continuity effects, or already-imminent consequences/);
    assert.match(prompts.light.mode_instruction, /rather than redirecting it/);
    assert.match(prompts.light.mode_instruction, /do not create a new wider plot thread solely to manufacture movement/);
    assert.match(prompts.light.mode_instruction, /keep invention to local connective details/);
    assert.match(prompts.balanced.mode_instruction, /Maintain distinct supported possibilities/);
    assert.match(prompts.balanced.mode_instruction, /Moderate intervention/);
    assert.match(prompts.balanced.mode_instruction, /active co-author, not a continuity clerk/);
    assert.match(prompts.balanced.mode_instruction, /selected horizon, or a due event/);
    assert.match(prompts.balanced.mode_instruction, /deepen the authorized activity and advance one compatible condition privately/);
    assert.match(prompts.fun.mode_instruction, /Search boldly across distinct actors and live threads/);
    assert.match(prompts.fun.mode_instruction, /Prefer the strongest causally ready function/);
    assert.match(prompts.fun.mode_instruction, /never pacing or control of the player/);
    assert.match(prompts.fun.mode_instruction, /may invent compatible routes, actors, pressures, opportunities, or consequences in private causal state/);
    assert.match(prompts.fun.mode_instruction, /may introduce one onstage only when/);
    assert.match(prompts.fun.mode_instruction, /without manufacturing an intrusion/);
    assert.notEqual(prompts.light.mode_instruction, prompts.balanced.mode_instruction);
    assert.notEqual(prompts.balanced.mode_instruction, prompts.fun.mode_instruction);
});

test('every planner mode leaves narrative pacing under user control', () => {
    for (const mode of ['light', 'balanced', 'fun']) {
        const prompt = JSON.parse(buildAnalysisPrompt([{ mes: 'I keep watching for a while.', is_user: true }], { ...defaultState(), mode }));
        assert.match(prompt.pacing_instruction, /latest user turn’s maximum scope/);
        assert.match(prompt.pacing_instruction, /ceiling, not a quota/);
        assert.match(prompt.pacing_instruction, /Travel permits arrival only, not activity there/);
        assert.match(prompt.pacing_instruction, /broad bounded activity permits representative progression/i);
        assert.match(prompt.pacing_instruction, /named action permits exactly one instance/);
        assert.match(prompt.pacing_instruction, /not repetition, onward movement, an NPC’s next task, or unstated player reaction/);
        assert.match(prompt.pacing_instruction, /NPC requests, orders, and invitations are events, never player authorization/);
        assert.match(prompt.pacing_instruction, /must not select a player-facing assignment as planned movement/);
        assert.match(prompt.pacing_instruction, /agency and causality boundary, not a dialogue or prose policy/);
        assert.match(prompt.pacing_instruction, /Primary user and roleplay instructions control voice, wording, format, length, and response shape/);
        assert.doesNotMatch(prompt.pacing_instruction, /I play the game/);
        assert.match(prompt.pacing_instruction, /not dialogue, feelings, consequential decisions/);
        assert.match(prompt.pacing_instruction, /Mode changes pressure and breadth, not speed or player control/);
        assert.match(prompt.pacing_instruction, /Allocate attention by user engagement and narrative yield/);
        assert.doesNotMatch(prompt.pacing_instruction, /Do not create questions|Do not routinely end|saying “your call”/);
    }
    assert.match(MODE_INSTRUCTIONS.light, /must not artificially prolong a beat or slow a user/);
    assert.match(MODE_INSTRUCTIONS.balanced, /does not change the user's narrative speed/);
    assert.match(MODE_INSTRUCTIONS.fun, /Boldness widens opportunity and impact, never pacing or control of the player/);
});

test('analysis prompt maintains a lightweight world model', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: 'We are inside the Jedi Temple.', is_user: true }], defaultState()));
    assert.match(SYSTEM, /Model the two to five actors, groups, institutions, places, or processes most capable of affecting what follows/);
    assert.match(SYSTEM, /perspective, motivation, knowledge boundary, constraints, independent agenda/);
    assert.match(SYSTEM, /independent world processes continue privately/);
    assert.match(SYSTEM, /extraordinary established capabilities and limitations proportionately/);
    assert.match(SYSTEM, /do not normalize them toward setting averages or negate them to manufacture tension/);
    assert.equal('world_model_instruction' in prompt, false);
});

test('analysis prompt expands its recent tail by tokens and assimilates optional continuity context', () => {
    const messages = Array.from({ length: 5 }, (_, i) => ({ mes: `message-${i}`, is_user: i % 2 === 0 }));
    const prompt = JSON.parse(buildAnalysisPrompt(messages, defaultState(), '', {}, { recentContextTokens: 1000, messageTokenLimit: 200, continuityContext: 'older context' }));
    assert.equal(prompt.messages.length, 5, 'short turns should not be cut off by an arbitrary message count');
    assert.equal(prompt.summary_sources[0].text, 'older context');
    assert.equal(prompt.summary_sources[0].kind, 'continuity-memory');
    assert.match(prompt.summary_sources_instruction, /no provider is required or automatically authoritative/);
});

test('recent raw context is bounded by tokens while the latest completed turn survives', () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({ mes: `${i} ${'long turn '.repeat(180)}`, is_user: i % 2 === 0 }));
    const prompt = JSON.parse(buildAnalysisPrompt(messages, defaultState(), '', {}, { recentContextTokens: 1000, messageTokenLimit: 700 }));
    const recent = prompt.messages.filter(item => item.kind === 'recent');
    assert.ok(recent.length < messages.length);
    assert.equal(recent.at(-1).index, 19);
    assert.ok(recent.reduce((sum, item) => sum + estimateTokenCount(item.content) + 24, 0) <= 1008);
});

test('analysis prompt retrieves a few relevant older turns without continuity memory', () => {
    const messages = Array.from({ length: 70 }, (_, index) => ({ mes: `Unrelated turn ${index} about corridor lighting. `.repeat(2), is_user: index % 2 === 0 }));
    messages[44] = { mes: 'I want the message to discuss the war and my homeworld.', is_user: true };
    messages[46] = { mes: 'I wish for the war to stop and help the affected families. That is what I truly want.', is_user: true };
    messages[68] = { mes: 'What should the Chancellor message say?', is_user: false };
    messages[69] = { mes: 'I already told you exactly what my message is.', is_user: true };
    const state = {
        ...defaultState(),
        pathways: [{ ...pathways[0], direction: 'Resolve the Chancellor petition about peace and aid for affected families.' }],
        contextLedger: 'The current thread concerns Lucia’s message to the Chancellor about the war.',
    };
    const prompt = JSON.parse(buildAnalysisPrompt(messages, state, '', {}, { recentContextTokens: 1000, maxPromptTokens: 12000 }));
    assert.ok(prompt.retrieved_historical_evidence.length <= 4);
    assert.ok(prompt.retrieved_historical_evidence.some(item => item.index === 46 && /affected families/.test(item.content)));
    assert.match(prompt.retrieval_instruction, /older turns from the active chat/);
    assert.equal('summary_sources' in prompt, false);
});

test('standalone retrieval includes an old assistant payoff instead of preserving only its setup', () => {
    const messages = Array.from({ length: 80 }, (_, index) => ({ mes: `Unrelated corridor routine ${index}.`, is_user: index % 2 === 0 }));
    messages[20] = { mes: 'I tell Vekk I have something private to disclose about my vision later.', is_user: true };
    messages[22] = { mes: 'I tell Vekk the vision showed clone troopers deliberately shooting him and another Jedi.', is_user: true };
    messages[23] = { mes: 'Vekk accepts Lucia’s private disclosure of the clone vision and records her warning.', is_user: false };
    messages[30] = { mes: 'I disclose the clone vision to the Council and explain the deliberate switch.', is_user: true };
    messages[31] = { mes: 'The Council records Lucia’s disclosed vision in a sealed restricted addendum.', is_user: false };
    messages[78] = { mes: 'The evening remains quiet in Lucia’s room.', is_user: false };
    messages[79] = { mes: 'I continue reading.', is_user: true };
    const state = {
        ...defaultState(),
        objectives: [{ title: 'Lucia private disclosure', detail: 'Disclose the clone vision to Vekk and the Council.', status: 'latent', source: 'User msg 20' }],
        pathways: [{ ...pathways[0], id: 'private-vision', direction: 'Lucia discloses the private clone vision.', when: 'Lucia chooses to tell Vekk.' }],
        contextLedger: 'Lucia still has a private clone vision to disclose.',
    };
    const prompt = JSON.parse(buildAnalysisPrompt(messages, state, '', {}, { recentContextTokens: 1000, maxPromptTokens: 12000 }));
    assert.ok(prompt.retrieved_historical_evidence.some(item => item.role === 'user' && /disclos|vision/iu.test(item.content)));
    assert.ok(prompt.retrieved_historical_evidence.some(item => item.role === 'assistant' && /records|addendum|accepts/iu.test(item.content)));
    assert.ok(prompt.retrieved_historical_evidence.some(item => item.index === 23 && item.purpose === 'audit-current-claim'));
    assert.match(prompt.retrieval_instruction, /distinguish a setup from its later payoff/);
    assert.match(prompt.retrieval_instruction, /Never keep or reopen a setup/);
});

test('an unresolved future cause survives a hundred-turn routine lull and is audited against older evidence', () => {
    const messages = Array.from({ length: 112 }, (_, index) => ({
        mes: `Routine academy assignment work continues during turn ${index}.`,
        is_user: index % 2 === 0,
    }));
    messages[18] = { mes: 'I am a Naruto academy student. I want my open-ended ninja life to grow toward becoming Hokage someday.', is_user: true };
    messages[19] = { mes: 'The academy remains one early part of a much wider life in the Hidden Leaf.', is_user: false };
    messages[110] = { mes: 'The last questions of the long academy assignment remain on the desk.', is_user: false };
    messages[111] = { mes: 'I finish the rest of the assignment and move on.', is_user: true };
    const state = {
        ...defaultState(),
        directorScore: {
            sceneFunction: 'Let the routine assignment conclude cleanly without mistaking it for the whole story.',
            settingIdentity: 'The Hidden Leaf and its living shinobi institutions.',
            settingForces: ['Academy requirements shape the present day.', 'Village life and future ninja duties continue beyond classwork.'],
            causalTempo: 'hold',
            futureSetup: { id: 'ninja-life', development: 'The student gradually enters the wider shinobi world.', currentStep: 'Finish the current academy routine.', conditions: ['Academy life continues.'], earliestWindow: 'later', disclosure: 'open' },
            meaningfulAim: 'Keep ordinary academy life nested inside a broader evolving ninja identity.',
            change: 'keep',
            basis: 'User turn 18 established academy status and an open-ended Hokage ambition.',
        },
        narrativeLayers: {
            immediateAction: 'Finish the remaining assignment.',
            localActivity: 'A long academy assignment.',
            situation: 'Routine academy education before active ninja service.',
            widerWorld: 'The Hidden Leaf continues through missions, institutions, rivalries, and village life.',
            activityRole: 'routine',
            temporalScope: 'activity',
        },
        continuityThreads: [{ id: 'hokage-ambition', thread: 'Hokage ambition', state: 'The long-range ambition remains unresolved.', status: 'dormant', basis: 'User turn 18.' }],
        pathways: [{ id: 'hokage-future', lane: 'long-range', branch: 'vocation', agent: 'the player character', engine: 'long-range ambition', relation: 'emergent', scale: 'open-ended', direction: 'Keep becoming Hokage available as a conditional long-range ambition.', when: 'Later choices continue to support the ambition.', horizon: 'far', timeframe: 'open-ended', conditions: ['The ambition remains wanted and compatible with later choices.'], status: 'available', origin: 'established', basis: 'User turn 18.', mechanismStatus: 'evidenced', mechanismBasis: 'The user explicitly established this ambition.', evidenceRefs: ['msg:18'], unresolvedBasis: 'No newer evidence depicts the ambition as achieved, cancelled, contradicted, or irrelevant.', completionCheck: 'unresolved', strength: 'moderate' }],
    };
    const prompt = JSON.parse(buildAnalysisPrompt(messages, state, '', {}, { recentContextTokens: 1000, maxPromptTokens: 12000 }));
    assert.equal('durableTrajectory' in prompt.current.narrativeLayers, false);
    assert.match(prompt.current.continuityThreads[0].state, /unresolved/);
    assert.deepEqual(prompt.current.pathways[0].evidenceRefs, ['msg:18']);
    assert.equal(prompt.current.narrativeLayers.activityRole, 'routine');
    assert.equal(prompt.current.narrativeLayers.temporalScope, 'activity');
    assert.equal(prompt.messages.at(-1).content, 'I finish the rest of the assignment and move on.');
    assert.ok(prompt.retrieved_historical_evidence.some(item => item.index === 18 && item.purpose === 'audit-current-claim' && /Hokage/iu.test(item.content)));
});

test('analysis prompt accepts supporting host context without declaring it canon', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: 'Tea', is_user: true }], defaultState(), '', {}, { hostContext: '[Chat summary] Yesterday was quiet.' }));
    assert.equal(prompt.summary_sources[0].text, '[Chat summary] Yesterday was quiet.');
    assert.equal(prompt.summary_sources[0].kind, 'host-summary');
    assert.match(prompt.summary_sources_instruction, /untrusted evidence for current facts, unresolved causes/);
    assert.match(prompt.summary_sources_instruction, /Do not summarize, rewrite, continue, or assign meaning/);
    assert.match(prompt.summary_sources_instruction, /Do not assume an excerpt is exhaustive/);
});

test('bootstrap prompt samples older messages instead of only the recent tail', () => {
    const messages = Array.from({ length: 40 }, (_, i) => ({ mes: `message-${i}`, is_user: i % 2 === 0 }));
    const prompt = JSON.parse(buildAnalysisPrompt(messages, defaultState(), '', {}, { recentContextTokens: 1000, bootstrapScan: true }));
    assert.ok(prompt.messages.some(item => item.index === 0));
    assert.ok(prompt.messages.some(item => item.index < 36));
    assert.ok(prompt.messages.some(item => item.kind === 'anchor'));
    assert.ok(prompt.messages.every(item => item.kind === 'recent' || item.kind === 'anchor'));
});

test('canon bootstrap retains labeled OOC turns outside ordinary sampling points', () => {
    const messages = Array.from({ length: 60 }, (_, i) => ({ mes: `message-${i}`, is_user: i % 2 === 0 }));
    messages[22] = { mes: '"My name is Lucia."\nOOC: I have an abnormally high Midichlorian count, among the highest in history.', is_user: true };
    const prompt = JSON.parse(buildAnalysisPrompt(messages, defaultState(), '', {}, { recentContextTokens: 1000, bootstrapScan: true }));
    assert.ok(prompt.messages.some(item => item.index === 22 && item.kind === 'directive' && /highest in history/.test(item.content)));
    assert.deepEqual(prompt.required_canon_claims, ['I have an abnormally high Midichlorian count, among the highest in history.']);
    assert.match(prompt.required_canon_instruction, /add a canon_update only when the retained state does not already contain the claim/i);
});

test('full rebuild locally reconstructs multiple story eras instead of making the repeated recent scene the story', () => {
    const routine = index => ({
        mes: `Lucia quietly reads another page in the same garden while the afternoon remains calm. Routine beat ${index}. Nothing changes beyond the immediate reading activity.`,
        is_user: index % 2 === 0,
    });
    const messages = Array.from({ length: 240 }, (_, index) => routine(index));
    messages[12] = { mes: 'After wartime displacement, Lucia entered a Republic youth facility whose placement rules would shape her future.', is_user: false };
    messages[55] = { mes: 'OOC: Lucia has an extreme Midichlorian count, among the highest ever recorded, and this remains a core fact.', is_user: true };
    messages[105] = { mes: 'The formal petition concerning Lucia was filed with and accepted for review by the Jedi Council.', is_user: false };
    messages[165] = { mes: 'Master Taren promised to contest the facility decision, placing his bond with Lucia against institutional duty.', is_user: false };

    const serialized = buildAnalysisPrompt(messages, defaultState(), '', {}, {
        recentContextTokens: 4000,
        messageTokenLimit: 700,
        maxPromptTokens: 12000,
        bootstrapScan: true,
        fullRebuild: true,
    });
    const prompt = JSON.parse(serialized);
    const timeline = JSON.stringify(prompt.rebuild_timeline);

    assert.ok(estimateTokenCount(serialized) <= 12000);
    assert.match(prompt.full_rebuild_instruction, /previous Tale Fairy state was intentionally deleted/i);
    assert.match(prompt.evidence_order_instruction, /newest raw messages only to establish the completed current state and pacing boundary/i);
    assert.match(prompt.full_rebuild_instruction, /read-only evidence/i);
    assert.match(prompt.full_rebuild_instruction, /Produce only a new future agenda/i);
    assert.match(prompt.full_rebuild_instruction, /if its event already happened, was cancelled, contradicted, or made irrelevant, exclude it/i);
    assert.match(prompt.full_rebuild_instruction, /Do not output or persist an overall story identity/i);
    assert.match(timeline, /Republic youth facility/i);
    assert.match(timeline, /Midichlorian count/i);
    assert.match(timeline, /Jedi Council/i);
    assert.match(timeline, /Master Taren/i);
    assert.equal(prompt.rebuild_timeline[0].range[0], 0);
    assert.ok(prompt.rebuild_timeline.at(-1).range[1] < prompt.messages.find(item => item.kind === 'recent').index);
    assert.ok(prompt.messages.every(item => item.kind !== 'anchor'));
});

test('full-rebuild timeline honors an explicit empty historical range', () => {
    assert.deepEqual(buildRebuildTimelineEvidence([{ mes: 'Opening scene', is_user: true }], 0), []);
});

test('analysis application keeps layered guidance bounded and records its injection decision', () => {
    const messages = [{ mes: 'I make tea', is_user: true }];
    const next = applyAnalysis(defaultState(), { director_score: directorScore, narrative_layers: narrativeLayers, self_challenge: selfChallenge, scene: { status: 'active', activity: 'tea', pace: 'slow', intent: 'rest', location: 'kitchen', time: 'evening', loop: false }, objectives: [], entities: [], possibilities: [], pathways, next_guides: nextGuides, guidance: 'x'.repeat(2000), inject: true, reason: 'A gentle reminder will preserve the established pace.' }, messages);
    assert.equal(next.guidance.length, 700);
    assert.equal(next.sourceMessageCount, 1);
    assert.equal(next.scene.activity, 'tea');
    assert.equal(next.lastInject, true);
    assert.equal(next.directorScore.settingIdentity.startsWith('Star Wars'), true);
    assert.equal(next.directorScore.storyIdentity, '');
    assert.equal(next.directorScore.causalTempo, 'seed');
    assert.equal(next.directorScore.futureSetup.disclosure, 'hidden');
    assert.equal(next.narrativeLayers.activityRole, 'developmental');
    assert.equal(next.narrativeLayers.temporalScope, 'action');
    assert.equal(next.narrativeLayers.durableTrajectory, '');
    assert.match(next.selfChallenge.counterRoute, /Chancellor petition/);
    assert.match(next.lastReason, /established pace/);
});

test('conditional pathways persist while supported horizons resist cosmetic churn but stale ones can retire', () => {
    const messages = [{ mes: 'What does Mara say?', is_user: true }];
    const starting = {
        ...defaultState(),
        turnCount: 3,
        pathways: [{ ...pathways[0], direction: 'Surface Mara’s concern.', change: 'keep' }],
        planHorizons: { items: planHorizons.items.map(item => ({ ...item, change: 'keep' })), deviation: { level: 'none', reason: 'On plan.' } },
    };
    const attemptedHorizons = planHorizons.items.map((item, index) => index === planHorizons.items.length - 1
        ? { ...item, direction: 'Cosmetically reword the same distant obligation.', change: 'adjust' }
        : { ...item, change: 'keep' });
    const kept = applyAnalysis(starting, { pathways: [{ ...pathways[0], direction: 'Cosmetic rewrite that should not replace the route.', change: 'keep' }], plan_horizons: { items: attemptedHorizons, deviation: { level: 'none', reason: 'The wording changed, not the direction.' } } }, messages);
    assert.equal(kept.pathways[0].id, 'tea-talk');
    assert.equal(kept.pathways[0].direction, 'Surface Mara’s concern.');
    assert.equal(kept.planHorizons.items.at(-1).direction, 'Keep the obligation available as one evolving long-term pressure.');

    const replacementHorizons = planHorizons.items.map((item, index) => index === planHorizons.items.length - 1
        ? { ...item, id: 'fresh-future', direction: 'Let a new consequence grow from the current relationship.', change: 'replace' }
        : { ...item, change: 'keep' });
    const retired = applyAnalysis(kept, { plan_horizons: { items: replacementHorizons, deviation: { level: 'minor', reason: 'The old direction has no current causal support.' } } }, messages);
    assert.equal(retired.planHorizons.items.at(-1).id, 'fresh-future');
    assert.doesNotMatch(retired.planHorizons.items.at(-1).direction, /obligation/i);

    const switched = applyAnalysis(kept, { pathways: [{ ...pathways[0], id: 'reaction', direction: 'Let the answer change the relationship.', change: 'replace' }] }, [...messages, { mes: 'Mara explains the concern.', is_user: false }]);
    assert.equal(switched.pathways[0].id, 'reaction');
});

test('horizon persistence never treats a reused id on a different branch as the old route', () => {
    const messages = [{ mes: 'What else could develop from here?', is_user: true }];
    const starting = {
        ...defaultState(),
        planHorizons: { items: planHorizons.items.map(item => ({ ...item, change: 'keep' })), deviation: { level: 'none', reason: 'On plan.' } },
    };
    const proposedItems = planHorizons.items.map(item => ({ ...item, change: 'replace' }));
    proposedItems[3] = {
        ...proposedItems[3],
        branch: 'independent-civic-process',
        direction: 'Let an independent civic process create a materially different opportunity.',
        change: 'adjust',
    };
    proposedItems[4] = {
        ...proposedItems[4],
        id: 'new-obligation-route',
        branch: 'jedi-obligation',
        direction: planHorizons.items[3].direction,
    };

    const next = applyAnalysis(starting, {
        plan_horizons: { items: proposedItems, deviation: { level: 'none', reason: 'The broader direction remains open.' } },
    }, messages);

    assert.equal(next.planHorizons.items.length, 6);
    assert.equal(new Set(next.planHorizons.items.map(item => item.direction.toLocaleLowerCase())).size, 6);
    assert.ok(next.planHorizons.items.some(item => item.branch === 'independent-civic-process'));
});

test('narrative events are stored internally but guidance remains the only injected output', () => {
    const messages = [{ mes: 'The trade shop closes at dusk.', is_user: false }];
    const next = applyAnalysis(defaultState(), {
        scene: { status: 'active' }, objectives: [], entities: [], possibilities: [],
        story_frame: { frame: 'grounded', confidence: 'high', basis: 'ordinary setting' },
        narrative_events: [{ id: 'shop-close', title: 'Trade shop closes', summary: 'The shop is unavailable after dusk.', scope: 'onscreen', epistemic_status: 'established', disclosure: 'revealed', status: 'active', confidence: 'high', timing: 'after dusk', due_state: 'due', cause: 'The posted closing hour reached dusk.', consequences: ['The shop is unavailable tonight.'], basis: 'current scene', requirements: [], interpretation: 'established_fact' }],
        guidance: 'Keep the evening calm.', inject: true,
    }, messages);
    assert.equal(next.narrativeEvents.length, 1);
    assert.equal(next.narrativeEvents[0].id, 'shop-close');
    assert.equal(next.narrativeEvents[0].epistemicStatus, 'established');
    assert.deepEqual(next.narrativeEvents[0].consequences, ['The shop is unavailable tonight.']);
    assert.equal(next.narrativeEvents[0].dueState, 'due');
    assert.equal(next.guidance, 'Keep the evening calm.');
    assert.equal(next.storyFrame.frame, 'grounded');
});

test('planner validates a selected offscreen cause and its consequence-only guide as one causal chain', () => {
    const event = {
        id: 'school-conflict', title: 'Conflict at school', summary: 'A peer struck Eli during an offscreen dispute.',
        scope: 'offscreen', epistemic_status: 'simulated', disclosure: 'hidden', status: 'active',
        confidence: 'moderate', timing: 'during the completed school day', due_state: 'due',
        cause: 'An established peer conflict escalated during the school day.', consequences: ['Eli returns home with a black eye.'],
        basis: 'Eli attended school while the peer conflict remained active.', requirements: [], interpretation: 'supported_inference',
    };
    const result = {
        ...requiredPlanning,
        scene: { status: 'active', activity: 'waiting at home', pace: 'steady', intent: 'continue the evening', location: 'home', time: 'after school', loop: false },
        objectives: [], entities: [], possibilities: [],
        next_guides: [
            { ...nextGuides[0], id: 'marked-return', direction: 'Eli returns with a black eye and offers no explanation.', world_delta: 'Eli arrives home with a visible black eye.', causal_event_ids: ['school-conflict'], disclosure: 'consequence-only' },
            nextGuides[1],
            nextGuides[2],
        ],
        narrative_events: [event], guidance: '', inject: true, reason: 'A selected offscreen cause now has a relevant visible consequence.',
    };
    assert.equal(validateAnalysisResult(result).valid, true);
    assert.equal(validateAnalysisResult({ ...result, next_guides: [{ ...result.next_guides[0], causal_event_ids: [] }, result.next_guides[1], result.next_guides[2]] }).valid, false);
    assert.equal(validateAnalysisResult({ ...result, narrative_events: [{ ...event, epistemic_status: 'possible' }] }).valid, false);
});

test('jokes, wishes, and unsupported absurdities are not retained as events', () => {
    const next = applyAnalysis(defaultState(), { narrative_events: [
        { id: 'wish', title: 'Meet the president', summary: 'The user hopes this happens.', interpretation: 'wish' },
        { id: 'joke', title: 'Moon explodes', summary: 'A joke.', interpretation: 'joke' },
        { id: 'real', title: 'Assignment due', summary: 'The assignment is due tomorrow.', scope: 'onscreen', epistemic_status: 'established', disclosure: 'revealed', interpretation: 'established_fact', status: 'active', confidence: 'high', timing: 'tomorrow', due_state: 'pending', cause: 'The school set a deadline.', consequences: ['Work remains due tomorrow.'], basis: 'user and assistant established it', requirements: [] },
    ] }, [{ mes: 'Hopefully I meet the president.', is_user: true }]);
    assert.deepEqual(next.narrativeEvents.map(event => event.id), ['real']);
});

test('planner prompt enforces its hard budget while retaining priority context', () => {
    const messages = Array.from({ length: 40 }, (_, i) => ({ mes: 'x'.repeat(2000) + i, is_user: i % 2 === 0 }));
    const prompt = buildAnalysisPrompt(messages, { ...defaultState(), contextLedger: 'y'.repeat(4000) }, 'z'.repeat(2000), { description: 'd'.repeat(3500) }, { recentContextTokens: 4000, maxPromptTokens: 10000, continuityContext: 'c'.repeat(6000), hostContext: 'h'.repeat(8000), bootstrapScan: true });
    const parsed = JSON.parse(prompt);
    assert.ok(estimateTokenCount(prompt) <= 10000);
    assert.ok(parsed.messages.filter(item => item.kind === 'recent').length >= 6);
    assert.ok(parsed.messages.some(item => item.kind === 'recent' && item.index === 39));
    assert.ok(parsed.messages.some(item => item.kind === 'anchor' && item.index > 0 && item.index < 16));
    assert.equal(parsed.messages.find(item => item.index === 39).content, messages[39].mes);
});

test('latest turn stays complete by compacting redundant state and older excerpts first', () => {
    const latest = 'latest-action '.repeat(210);
    const messages = [...Array.from({ length: 12 }, (_, index) => ({ mes: `older-${index} ${'x'.repeat(1200)}`, is_user: index % 2 === 0 })), { mes: latest, is_user: true }];
    const state = {
        ...defaultState(),
        objectives: Array.from({ length: 8 }, (_, index) => ({ title: `thread-${index}`, detail: 'detail '.repeat(60), status: 'open' })),
        entities: Array.from({ length: 6 }, (_, index) => ({ name: `entity-${index}`, state: 'state '.repeat(40), location: 'somewhere', relevance: 'relevant' })),
        possibilities: Array.from({ length: 6 }, () => ({ description: 'possibility '.repeat(30), conditions: ['condition '.repeat(20)], force: 'moderate' })),
        pathways,
        planHorizons,
        contextLedger: 'ledger '.repeat(400),
    };
    const prompt = buildAnalysisPrompt(messages, state, '', {}, { recentContextTokens: 4000, messageTokenLimit: 700, maxPromptTokens: 12000, bootstrapScan: true });
    const parsed = JSON.parse(prompt);
    assert.ok(estimateTokenCount(prompt) <= 12000);
    assert.equal(parsed.messages.at(-1).content, latest.trim());
});

test('bootstrap compaction keeps a recent trajectory anchor instead of reviving the opening scene', () => {
    const messages = Array.from({ length: 520 }, (_, index) => ({ mes: `${index}: ${'current trajectory '.repeat(60)}`, is_user: index % 2 === 0 }));
    messages[0] = { mes: `Old opening armored walker attack. ${'past '.repeat(300)}`, is_user: false };
    const prompt = JSON.parse(buildAnalysisPrompt(messages, defaultState(), '', {}, { recentContextTokens: 4000, messageTokenLimit: 700, maxPromptTokens: 12000, effectivePromptTokens: 3000, bootstrapScan: true }));
    assert.doesNotMatch(JSON.stringify(prompt.messages), /armored walker/i);
    assert.ok(prompt.messages.some(item => item.kind === 'anchor' && item.index > 400));
});

test('hard budget also compacts a fully populated long-running planner state', () => {
    const long = 'x'.repeat(1000);
    const sentCue = { id: 'confirmed-setting-turn', direction: 'An Imperial restriction quietly changes what help is possible.', useWhen: 'The conversation still concerns available help.', dropWhen: 'The restriction has already been resolved.', causalRole: 'Advance the institutional-pressure thread through a concrete restriction.', worldDelta: 'The characters must account for an institutional constraint.', origin: 'planner', basis: 'The request included this movement.', strength: 'strong', sourcePathways: [], causalEventIds: [], disclosure: 'none' };
    const state = {
        ...defaultState(),
        objectives: Array.from({ length: 10 }, (_, index) => ({ title: `thread-${index}`, detail: long, status: 'open', source: long })),
        entities: Array.from({ length: 8 }, (_, index) => ({ name: `entity-${index}`, state: long, location: long, relevance: long, confidence: 'high', window: long })),
        possibilities: Array.from({ length: 6 }, () => ({ description: long, conditions: [long, long, long], force: 'moderate' })),
        pathways: [{ id: 'active', direction: long, when: long, responseBias: long, horizon: 'near', status: 'foreground', conditions: [long], change: 'keep', reason: long }],
        planHorizons: { items: Array.from({ length: 10 }, (_, index) => ({ id: `horizon-${index}`, direction: long, timeframe: long, stability: index === 9 ? 'slow' : 'adaptive', conditions: [long], change: 'adjust', reason: long })), deviation: { level: 'minor', reason: long } },
        canonConstraints: Array.from({ length: 12 }, () => long),
        userNotes: Array.from({ length: 12 }, () => ({ kind: 'establish', text: long, at: 1 })),
        contextLedger: long.repeat(3),
        lastRequestVerification: { status: 'confirmed', guidanceBlock: 'confirmed guide', guideCandidates: [sentCue], selectedGuideIndex: 0 },
    };
    const messages = Array.from({ length: 80 }, (_, index) => ({ mes: long.repeat(4) + index, is_user: index % 2 === 0 }));
    const prompt = buildAnalysisPrompt(messages, state, long, { scenario: long }, { recentContextTokens: 4000, messageTokenLimit: 4000, maxPromptTokens: 8000, continuityContext: long.repeat(6), hostContext: long.repeat(8), bootstrapScan: true });
    assert.ok(estimateTokenCount(prompt) <= 8000, `expected hard budget, got ${estimateTokenCount(prompt)} tokens`);
    const parsed = JSON.parse(prompt);
    assert.equal(parsed.messages.at(-1).index, 79);
    assert.equal(parsed.current.lastOfferedCues[0].id, sentCue.id);
    assert.equal(parsed.current.lastOfferedCues[0].requestConfirmed, true);
});

test('planner excerpts remove generated scaffolding and preserve both ends of long prose', () => {
    const long = `<stat>\`\`\`private tracker\`\`\`</stat>${'A'.repeat(900)} crucial middle evidence ${'B'.repeat(900)} crucial ending`;
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: long, is_user: false }], defaultState(), '', {}, { messageTokenLimit: 300 }));
    assert.doesNotMatch(prompt.messages[0].content, /private tracker|<stat>/);
    assert.match(prompt.messages[0].content, /^A+/);
    assert.match(prompt.messages[0].content, /crucial middle evidence/);
    assert.match(prompt.messages[0].content, /crucial ending$/);
});

test('analysis prompt independently recovers dormant formal hooks for future-route variety', () => {
    const messages = Array.from({ length: 90 }, (_, index) => ({ mes: `Quiet Temple routine ${index}.`, is_user: index % 2 === 0 }));
    messages[30] = { mes: 'We filed my letter to the Chancellor as a humanitarian petition with a tracking copy.', is_user: false };
    messages[31] = { mes: 'Do you think our letter to the Chancellor will bear fruit?', is_user: true };
    messages[32] = { mes: 'The petition may be routed to Refugee Relief, and Vekk will follow up in one month if no answer arrives.', is_user: false };
    messages[52] = { mes: 'Nim has a placement panel scheduled for Thursday.', is_user: false };
    messages[88] = { mes: 'The room remains quiet through the night.', is_user: false };
    messages[89] = { mes: 'Continue as I sleep.', is_user: true };
    const prompt = JSON.parse(buildAnalysisPrompt(messages, defaultState(), '', {}, { recentContextTokens: 1000, maxPromptTokens: 12000 }));
    assert.ok(prompt.candidate_dormant_hooks.some(item => item.hook_type === 'correspondence-or-petition' && /Chancellor|petition/iu.test(item.content)));
    assert.ok(prompt.candidate_dormant_hooks.some(item => item.hook_type === 'scheduled-decision' && /placement panel/iu.test(item.content)));
    assert.match(prompt.dormant_hook_instruction, /newly discovered or changed, upsert it through thread_updates/i);
    assert.match(prompt.dormant_hook_instruction, /distinct live or dormant hooks.*separate route families/i);
});

test('repeated schedules cannot crowd a filed petition out of dormant-hook retrieval', () => {
    const messages = Array.from({ length: 120 }, (_, index) => ({ mes: `Ordinary Temple routine ${index}.`, is_user: index % 2 === 0 }));
    messages[15] = { mes: 'The Chancellor letter was filed and remains pending.', is_user: false };
    for (const index of [55, 68, 81, 94, 107]) {
        messages[index] = { mes: `A routine appointment ${index} is scheduled for tomorrow and remains due.`, is_user: false };
    }
    messages[118] = { mes: 'The night passes quietly.', is_user: false };
    messages[119] = { mes: 'Continue while I sleep.', is_user: true };
    const prompt = JSON.parse(buildAnalysisPrompt(messages, defaultState(), '', {}, { recentContextTokens: 1000, maxPromptTokens: 12000 }));
    assert.ok(prompt.candidate_dormant_hooks.some(item => item.hook_type === 'correspondence-or-petition' && /Chancellor letter/iu.test(item.content)));
    assert.ok(prompt.candidate_dormant_hooks.some(item => item.hook_type === 'scheduled-decision'));
    const constrained = JSON.parse(buildAnalysisPrompt(messages, defaultState(), '', {}, { recentContextTokens: 1000, maxPromptTokens: 8000, bootstrapScan: true }));
    assert.ok(constrained.candidate_dormant_hooks.some(item => item.hook_type === 'correspondence-or-petition'), 'durable correspondence survives the minimum prompt budget');
});

test('planner excerpts strip plain generated statboxes but retain the depicted scene', () => {
    const message = `Time & Weather = 6:42 PM\nLocation = Residential wing\nCurrent Beat = Walking after dinner\nPositions = Group at doors\nActive Threads = return home\n\nVekk says nobody answers anything tonight. It is a walk home and then dinner decisions, in that order.`;
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: message, is_user: false }], defaultState()));
    assert.doesNotMatch(prompt.messages[0].content, /6:42 PM|Walking after dinner|Active Threads/);
    assert.match(prompt.messages[0].content, /walk home and then dinner decisions, in that order/);
});

test('planner evidence ignores fenced code and paired XML blocks', () => {
    const message = `Visible beginning.\n\n\`\`\`status\nTime = 9:00 PM\nDinner completed.\n\`\`\`\n<scene_state><location>False room</location><activity>False event</activity></scene_state>\n<self-closing value="ignored" />\nVisible ending.`;
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: message, is_user: false }], defaultState()));
    assert.doesNotMatch(prompt.messages[0].content, /9:00 PM|Dinner completed|False room|False event|self-closing|scene_state/);
    assert.match(prompt.messages[0].content, /Visible beginning/);
    assert.match(prompt.messages[0].content, /Visible ending/);
});

test('empty optional context is omitted from the planner payload', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: 'Tea', is_user: true }], defaultState()));
    assert.equal('user_instruction' in prompt, false);
    assert.equal('bootstrap' in prompt, false);
    assert.equal('summary_sources' in prompt, false);
});
