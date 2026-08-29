import test from 'node:test';
import assert from 'node:assert/strict';
import { ANALYSIS_SCHEMA, ANALYSIS_SCHEMA_VALUE, AnalysisValidationError, MODE_INSTRUCTIONS, applyAnalysis, buildAnalysisPrompt, extractJson, requireValidAnalysisResult, SYSTEM, validateAnalysisResult } from '../extension/analysis.js';
import { defaultState } from '../extension/state.js';

const pathways = [{ id: 'tea-talk', direction: 'Let the tea conversation reveal a useful tension.', when: 'The user continues the conversation or asks Mara directly.', response_bias: 'Have Mara answer plainly and expose one concrete concern.', horizon: 'next few turns', status: 'foreground', conditions: [], change: 'replace', reason: 'The current exchange supports this route.' }];
const nextGuides = [
    { id: 'plain-concern', direction: 'Let Mara answer plainly while one concrete concern changes the exchange.', use_when: 'The user continues the conversation or addresses Mara.', drop_when: 'The user leaves, changes subject, or explicitly rejects the conversation.', causal_role: 'Advance the trust thread through a concrete disclosure.', world_delta: 'Mara discloses a concern that changes what both characters understand.', origin: 'inferred', basis: 'Mara is present, engaged, and the current exchange supports a direct concern.', strength: 'strong', source_pathways: ['tea-talk'], causal_event_ids: [], disclosure: 'none', reason: 'The direct exchange makes this the strongest continuation.' },
    { id: 'revealing-deflection', direction: 'Let Mara deflect in a way that reveals a different pressure through behavior.', use_when: 'The user remains present and Mara has reason not to answer plainly.', drop_when: 'The user establishes that Mara answers directly or the pressure is absent.', causal_role: 'Advance the social-pressure thread through an indirect consequence.', world_delta: 'Mara exposes a different pressure through behavior, changing the social stakes.', origin: 'original', basis: 'Her established hesitation can plausibly surface indirectly in this exchange.', strength: 'moderate', source_pathways: ['tea-talk'], causal_event_ids: [], disclosure: 'none', reason: 'This contrasts with a plain answer while preserving the same continuity.' },
    { id: 'outside-pressure', direction: 'Let a concrete household consequence intrude on the conversation without ending it.', use_when: 'The conversation continues in the active home setting.', drop_when: 'The user establishes privacy or leaves the setting.', causal_role: 'Seed a practical household pressure that can affect later choices.', world_delta: 'A household demand creates a new practical choice while the concern remains live.', origin: 'original', basis: 'The active home setting can plausibly exert a small but consequential pressure.', strength: 'light', source_pathways: ['tea-talk'], causal_event_ids: [], disclosure: 'none', reason: 'This adds a world-driven option distinct from disclosure or deflection.' },
];
const planHorizons = {
    items: [
        { id: 'reply', direction: 'Answer the immediate question.', timeframe: 'this reply', stability: 'fluid', conditions: [], change: 'replace', reason: 'Immediate user action.' },
        { id: 'turns', direction: 'Let the concern affect the conversation.', timeframe: 'next 2–4 turns', stability: 'adaptive', conditions: ['The conversation continues.'], change: 'replace', reason: 'Natural follow-through.' },
        { id: 'scene', direction: 'End the tea scene with a changed understanding.', timeframe: 'current scene', stability: 'adaptive', conditions: [], change: 'replace', reason: 'Scene direction.' },
        { id: 'arc', direction: 'Revisit the underlying obligation later.', timeframe: 'current arc', stability: 'stable', conditions: ['The obligation remains unresolved.'], change: 'replace', reason: 'Longer consequence.' },
        { id: 'later-arcs', direction: 'Let changing loyalties reshape how the obligation matters.', timeframe: 'later or multiple arcs', stability: 'stable', conditions: ['The relationship continues.'], change: 'replace', reason: 'Distant relationship direction.' },
        { id: 'distant-arc', direction: 'Keep the obligation available as one evolving long-term pressure.', timeframe: 'later arcs / open-ended', stability: 'slow', conditions: ['It has not become irrelevant.'], change: 'replace', reason: 'Provisional distant trajectory.' },
    ],
    deviation: { level: 'none', reason: 'Initial plan.' },
};
const directorScore = { story_identity: 'A Star Wars survival and institutional-conflict arc about trust under Jedi obligations.', scene_function: 'Let a quiet exchange alter trust.', setting_identity: 'Star Wars lived through its institutions, droids, technology, and social scale', setting_forces: ['A serving droid witnesses and mediates domestic routine.', 'Jedi obligations constrain available time and candor.'], causal_tempo: 'seed', arc_direction: 'Let ordinary interaction expose how affection and institutional duty compete across the next few turns.', future_setup: { id: 'duty-conflict', development: 'Mara must eventually choose between the relationship and a Jedi obligation.', current_step: 'Establish the obligation as a concrete constraint.', conditions: ['The duty becomes due.'], earliest_window: 'later in the current arc', disclosure: 'hidden' }, meaningful_aim: 'Change what Mara and the user understand about the limits of their trust.', change: 'adjust', basis: 'The active conversation is intimate, while established Star Wars institutions shape Mara’s choices.' };
const requiredPlanning = { story_frame: { frame: 'grounded', confidence: 'high', basis: 'ordinary scene' }, director_score: directorScore, pathways, next_guides: nextGuides, plan_horizons: planHorizons, canon_constraints: [], note_resolution: null, ledger: 'Tea conversation is active.', narrative_events: [], cue_audit: { offered_ids: [], manifested_ids: [], unused_ids: [], contradicted_ids: [], pacing: 'respected', reason: 'No prior cues were offered.' } };

test('extractJson accepts fenced and wrapped JSON', () => {
    assert.deepEqual(extractJson('```json\n{"inject":false}\n```'), { inject: false });
    assert.deepEqual(extractJson('prefix {"inject":true} suffix'), { inject: true });
});

test('planner validation rejects empty or incomplete structured output', () => {
    assert.equal(validateAnalysisResult({}).valid, false);
    assert.throws(() => requireValidAnalysisResult({}), AnalysisValidationError);
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
});

test('planner keeps a causal possibility pool and adaptive multi-horizon plan', () => {
    assert.match(SYSTEM, /one unified possibility pool rather than categories/);
    assert.match(SYSTEM, /source, route into the scene, timing, and reason/);
    assert.match(SYSTEM, /iconic franchise elements, stale historical mentions, and unsupported speculation are not scheduled events/);
    assert.match(SYSTEM, /classify it in this call as suggest, correct, establish, or forbid/);
    assert.match(SYSTEM, /return null only when genuinely ambiguous/);
    assert.match(SYSTEM, /never rewrite the user's text/);
    assert.match(SYSTEM, /Lore is an active causal system/);
    assert.match(SYSTEM, /Use narrative_events as the compact working causal state, not as a recap or transcript/);
    assert.match(SYSTEM, /Preserve concrete timing in timing and update due_state/);
    assert.match(SYSTEM, /simulated is one causally supported offscreen occurrence selected by Tale Fairy/);
    assert.match(SYSTEM, /A visible consequence can make an offscreen event narratively real without narrating/);
    assert.match(SYSTEM, /Preserve competing explanations when evidence does not justify selecting one/);
    assert.match(SYSTEM, /Player silence is not a veto/);
    assert.match(SYSTEM, /Every next guide must be executable through NPC or world action without requiring a new player action/);
    assert.match(SYSTEM, /keep the player at the current location and bring the visible change into that scene/);
    assert.match(SYSTEM, /A routine transition may be the entire temporal scope/);
    assert.match(SYSTEM, /Never finish a subsequent activity or jump to a later task/);
    assert.match(SYSTEM, /“we head to breakfast,” “I go to the meeting,” or “we walk home”/);
    assert.match(SYSTEM, /ends at travel or arrival/);
    assert.match(SYSTEM, /Give each next guide one coherent causal movement and one meaningful possible aftereffect/);
    assert.match(SYSTEM, /Keep every referent unambiguous inside each guide/);
    assert.match(SYSTEM, /Dorn-2 medical unit on Level 10/);
    assert.match(SYSTEM, /Never reinterpret an established code or proper noun as a different kind of entity/);
    assert.match(SYSTEM, /all remain optional, and the roleplay model may use zero or one/);
    assert.match(SYSTEM, /promised, agreed, deferred, owed, revealed, decided, or established only when raw conversation/);
    assert.match(SYSTEM, /Planner-created ideas may shape the future but must never be backfilled/);
    assert.match(SYSTEM, /previous planner hypotheses, not evidence/);
    assert.match(SYSTEM, /A prior planner's assertion cannot verify itself/);
    assert.match(SYSTEM, /A situational limitation does not create a future commitment/);
    assert.match(SYSTEM, /Keep thread referents exact/);
    assert.match(SYSTEM, /never transfer “after breakfast,” “tomorrow,” “in private,” or another condition/);
    assert.match(SYSTEM, /Do not mark an older setup unresolved merely because a selected excerpt ends before its payoff/);
    assert.match(SYSTEM, /A world_delta is the desired narrative aftereffect, not a demanded plot event/);
    assert.match(SYSTEM, /not low-stakes procedural noise used to avoid a stronger supported thread/);
    assert.match(SYSTEM, /Do not pay off a delayed or repeatedly raised development with another promise/);
    assert.match(SYSTEM, /requestConfirmed proves only that the cue set was present/);
    assert.match(SYSTEM, /An unused cue creates no failure, repair debt, repetition pressure/);
    assert.match(SYSTEM, /deliver concrete substance now/);
    assert.match(SYSTEM, /six to ten concise plan_horizons\.items ordered from the next few turns to a distant story horizon/);
    assert.match(SYSTEM, /some later arc or meaningful future time/);
    assert.match(SYSTEM, /Everything in the plan remains changeable/);
    assert.match(SYSTEM, /Every horizon also retains some effect with a strict distance gradient/);
    assert.match(SYSTEM, /distant directions provide only a subtle background pull/);
    assert.match(SYSTEM, /stable and slow directions resist cosmetic churn but must adjust or be replaced/);
    assert.match(SYSTEM, /not a story ending, final resolution, or predetermined outcome/);
    assert.match(SYSTEM, /Build fresh, specific future directions by extrapolating from the current roleplay trajectory/);
    assert.match(SYSTEM, /Do not use horizons as a backlog of memorable past scenes/);
    assert.match(SYSTEM, /only support is distant history/);
    assert.match(SYSTEM, /currently active actor, process, obligation, new evidence, elapsed-time consequence/);
    assert.match(SYSTEM, /current\.canonConstraints as candidates to audit, not an immortal event log/);
    assert.match(SYSTEM, /Message kind anchor is older orientation only/);
    assert.match(SYSTEM, /cannot by itself justify reviving/);
    assert.match(SYSTEM, /Do not replace a supported development with a safer, softer/);
    assert.match(SYSTEM, /Give no automatic plot armor/);
    assert.match(SYSTEM, /Do not force sympathy, vulnerability, redemption, reconciliation, banter, avoidance, or silent treatment/);
    assert.match(SYSTEM, /do not add cruelty, darkness, punishment, or conflict merely to appear bold/);
    assert.match(SYSTEM, /one to five compact conditional pathways/);
    assert.match(SYSTEM, /response_bias is private and may describe only causal handling or readiness/);
    assert.match(SYSTEM, /causal_role states whether and how the movement holds, seeds, advances, converges, pays off, redirects, or recovers/);
    assert.match(SYSTEM, /Re-evaluate the set after every completed assistant response/);
    assert.match(SYSTEM, /three or four ranked next_guides as compact conditional causal movements/);
    assert.match(SYSTEM, /Tale Fairy must function independently/);
    assert.match(SYSTEM, /in-text recaps, chat summaries, injected summaries/);
    assert.match(SYSTEM, /No named memory extension is privileged or required/);
    assert.match(SYSTEM, /If the referent remains unavailable, do not invent its name, identity, rules, prior result, or history/);
    assert.match(SYSTEM, /story_identity is the durable overall story or arc identity/);
    assert.match(SYSTEM, /Never let a quiet meal, game, assignment, training exercise, domestic pause, romance beat, or other slice-of-life scene redefine the whole story/);
    assert.match(SYSTEM, /even one hundred turns spent on an assignment remain a lull/);
    assert.match(SYSTEM, /Middle and distant rungs must reconnect to the broader character trajectory/);
    assert.match(SYSTEM, /open-ended roleplay, not a quest with a terminal win condition/);
    assert.match(SYSTEM, /Plan toward, through, and beyond a milestone without inventing a fixed ending/);
    assert.match(SYSTEM, /distant horizon should preserve room for continued life and new arcs/);
    assert.match(SYSTEM, /provisional upstream\/downstream hierarchy, not a rigid sequence/);
    assert.match(SYSTEM, /Every level is editable/);
    assert.match(SYSTEM, /Downstream levels must change fastest/);
    assert.match(SYSTEM, /When an upstream direction genuinely changes or becomes unsupported, rebuild any dependent middle and near directions/);
    assert.match(SYSTEM, /accumulated downstream outcomes may eventually supply enough evidence to adjust or replace an upstream direction/);
    assert.match(SYSTEM, /newest user turn as authoritative for immediate direction and the temporal scope of the next response, not as automatic evidence of the durable story identity/);
    assert.match(SYSTEM, /Pacing is selected anew by the user on every turn and is independent of the durable plan/);
    assert.match(SYSTEM, /Do not inherit slow pacing from prior turns after the user accelerates/);
    assert.match(SYSTEM, /Changing temporal speed changes how much of the plan may unfold now, not what the long-term plan fundamentally is/);
    assert.match(SYSTEM, /causal_tempo controls only the rate of story-state change/);
    assert.match(SYSTEM, /It never controls prose speed, dialogue cadence, mood, sentence rhythm, verbosity, descriptive density, or response length/);
    assert.match(SYSTEM, /future_setup is private planning state/);
    assert.match(SYSTEM, /does not make that movement a foreground requirement/);
    assert.match(SYSTEM, /Hidden setup stays out of roleplay guidance/);
    assert.match(SYSTEM, /must never mention mood, emotional tone, prose tempo, dialogue delivery/);
    assert.match(SYSTEM, /Only the non-secret story identity, current scene function, setting forces, causal tempo/);
    assert.match(SYSTEM, /Use consequence-only when the scene should show an effect but keep its cause wholly offscreen/);
    assert.match(SYSTEM, /This controls narrative information, not prose style/);
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
    assert.equal(validateAnalysisResult({ ...result, next_guides: [nextGuides[0]] }).valid, true);
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
    const repaired = requireValidAnalysisResult(fixedLike);
    assert.equal(repaired.plan_horizons.items.at(-1).stability, 'slow');
    assert.equal(validateAnalysisResult(repaired).valid, true);
});

test('planner salvages incomplete structured output before using fallback', () => {
    const partial = {
        scene: { status: 'active', activity: 'talking' },
        next_guides: [
            { ...nextGuides[0], use_when: 'Use for the preferred next response.', origin: 'uncertain', strength: 'high' },
            { ...nextGuides[1], direction: 'Mara promises to explain tomorrow.', world_delta: 'Mara schedules the explanation for later.' },
        ],
        plan_horizons: { items: [{ id: 'near', direction: 'Let the answer change the exchange.', timeframe: 'now', stability: 'fluid' }] },
    };
    const repaired = requireValidAnalysisResult(partial);
    assert.equal(repaired.next_guides.length, 1, 'one safe movement is retained instead of losing the whole plan');
    assert.doesNotMatch(repaired.next_guides[0].use_when, /preferred|next response/i);
    assert.equal(repaired.next_guides[0].origin, 'inferred');
    assert.equal(repaired.next_guides[0].strength, 'moderate');
    assert.equal(repaired.pathways.length, 1, 'a missing route is recovered from the usable movement');
    assert.equal(repaired.plan_horizons.items.length, 6);
    assert.equal(repaired.plan_horizons.items.at(-1).stability, 'slow');
    assert.equal(repaired.inject, true);
    assert.equal(validateAnalysisResult(repaired).valid, true);
});

test('planner still falls back when no usable narrative movement survives', () => {
    assert.throws(() => requireValidAnalysisResult({ scene: {}, next_guides: [] }), AnalysisValidationError);
    assert.throws(() => requireValidAnalysisResult({
        scene: {},
        next_guides: [{ ...nextGuides[0], direction: 'Mara promises to explain tomorrow.', world_delta: 'Mara schedules the explanation for later.' }],
    }), AnalysisValidationError);
});

test('planner schema uses SillyTavern structured-output packaging', () => {
    assert.equal(ANALYSIS_SCHEMA.name, 'tale_fairy_analysis');
    assert.equal(ANALYSIS_SCHEMA.value, ANALYSIS_SCHEMA_VALUE);
    assert.equal(ANALYSIS_SCHEMA.value.type, 'object');
    assert.equal(ANALYSIS_SCHEMA.value.properties.inject.const, true);
    assert.equal(ANALYSIS_SCHEMA.returnInvalid, true);
    assert.equal(ANALYSIS_SCHEMA.strict, true);
    assert.equal(ANALYSIS_SCHEMA.type, undefined);
    assert.deepEqual(ANALYSIS_SCHEMA.value.required, Object.keys(ANALYSIS_SCHEMA.value.properties));
});

test('analysis prompt includes bootstrap context and current state', () => {
    const prompt = buildAnalysisPrompt([{ mes: 'I make tea', is_user: true }], defaultState(), '', { scenario: 'A quiet apartment' });
    assert.match(prompt, /A quiet apartment/);
    assert.match(prompt, /update_narrative_context/);
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
    assert.match(prompt.extreme_canon_instruction, /facts remain authoritative even when extreme, unique, unprecedented/);
    assert.match(prompt.extreme_canon_instruction, /averages are context, not ceilings/);
    assert.match(prompt.extreme_canon_instruction, /Unspecified details remain creative space/);
    assert.match(prompt.extreme_canon_instruction, /complete current durable user-established constraints until explicitly corrected/);
    assert.match(prompt.extreme_canon_instruction, /Ordinary event history, status reports, old observations, and planner inferences are not canon constraints/);
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
    assert.match(SYSTEM, /Avoid recency loops and arbitrary escalation/);
    assert.match(SYSTEM, /never invent the player's choices/);
});

test('planner modes provide materially distinct intervention policies', () => {
    const prompts = Object.fromEntries(['light', 'balanced', 'fun'].map(mode => {
        const state = { ...defaultState(), mode };
        return [mode, JSON.parse(buildAnalysisPrompt([{ mes: 'The room goes quiet.', is_user: false }], state))];
    }));
    assert.equal(prompts.light.mode_instruction, MODE_INSTRUCTIONS.light);
    assert.match(prompts.light.mode_instruction, /at most one active possibility/);
    assert.match(prompts.light.mode_instruction, /rather than redirect it/);
    assert.match(prompts.balanced.mode_instruction, /one to three distinct supported possibilities/);
    assert.match(prompts.balanced.mode_instruction, /moderate intervention/);
    assert.match(prompts.fun.mode_instruction, /Search boldly across distinct actors and live threads/);
    assert.match(prompts.fun.mode_instruction, /Rank the strongest causally ready development first/);
    assert.match(prompts.fun.mode_instruction, /optional background cue/);
    assert.match(prompts.fun.mode_instruction, /never makes a cue mandatory/);
    assert.notEqual(prompts.light.mode_instruction, prompts.balanced.mode_instruction);
    assert.notEqual(prompts.balanced.mode_instruction, prompts.fun.mode_instruction);
});

test('every planner mode leaves narrative pacing under user control', () => {
    for (const mode of ['light', 'balanced', 'fun']) {
        const prompt = JSON.parse(buildAnalysisPrompt([{ mes: 'I keep watching for a while.', is_user: true }], { ...defaultState(), mode }));
        assert.match(prompt.pacing_instruction, /Match the user’s demonstrated speed and granularity/);
        assert.match(prompt.pacing_instruction, /maximum authorized player-action progress/);
        assert.match(prompt.pacing_instruction, /travel and arrival only/);
        assert.match(prompt.pacing_instruction, /not doing or finishing the activity there/);
        assert.match(prompt.pacing_instruction, /mode changes narrative pressure, not speed/);
        assert.match(prompt.pacing_instruction, /Only explicit requests to advance, skip, continue until, or reach a milestone authorize broader progress/);
        assert.match(prompt.pacing_instruction, /without inventing the player’s choices/);
        assert.match(prompt.pacing_instruction, /complete latest user turn/);
    }
    assert.match(MODE_INSTRUCTIONS.light, /must not artificially prolong a beat or slow a user/);
    assert.match(MODE_INSTRUCTIONS.balanced, /does not change the user's narrative speed/);
    assert.match(MODE_INSTRUCTIONS.fun, /never makes a cue mandatory, rushes the user's timeline/);
});

test('analysis prompt maintains a lightweight world model', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: 'We are inside the Jedi Temple.', is_user: true }], defaultState()));
    assert.match(SYSTEM, /Maintain a compact causal world model from established evidence/);
    assert.match(SYSTEM, /relevant people, factions, locations, knowledge, motives/);
    assert.equal('world_model_instruction' in prompt, false);
});

test('analysis prompt limits sent messages and accepts optional continuity context', () => {
    const messages = Array.from({ length: 5 }, (_, i) => ({ mes: `message-${i}`, is_user: i % 2 === 0 }));
    const prompt = JSON.parse(buildAnalysisPrompt(messages, defaultState(), '', {}, { messageWindow: 2, messageCharLimit: 20, continuityContext: 'older context' }));
    assert.equal(prompt.messages.length, 2);
    assert.equal(prompt.optional_continuity_context, 'older context');
    assert.match(prompt.continuity_instruction, /not a privileged memory authority or dependency/);
});

test('analysis prompt retrieves a few relevant older turns without continuity memory', () => {
    const messages = Array.from({ length: 70 }, (_, index) => ({ mes: `Unrelated turn ${index} about corridor lighting.`, is_user: index % 2 === 0 }));
    messages[44] = { mes: 'I want the message to discuss the war and my homeworld.', is_user: true };
    messages[46] = { mes: 'I wish for the war to stop and help the affected families. That is what I truly want.', is_user: true };
    messages[68] = { mes: 'What should the Chancellor message say?', is_user: false };
    messages[69] = { mes: 'I already told you exactly what my message is.', is_user: true };
    const state = {
        ...defaultState(),
        pathways: [{ ...pathways[0], direction: 'Resolve the Chancellor petition about peace and aid for affected families.' }],
        contextLedger: 'The current thread concerns Lucia’s message to the Chancellor about the war.',
    };
    const prompt = JSON.parse(buildAnalysisPrompt(messages, state, '', {}, { messageWindow: 6, maxPromptChars: 12000 }));
    assert.ok(prompt.retrieved_historical_evidence.length <= 4);
    assert.ok(prompt.retrieved_historical_evidence.some(item => item.index === 46 && /affected families/.test(item.content)));
    assert.match(prompt.retrieval_instruction, /older turns from the active chat/);
    assert.equal('optional_continuity_context' in prompt, false);
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
    const prompt = JSON.parse(buildAnalysisPrompt(messages, state, '', {}, { messageWindow: 6, maxPromptChars: 12000 }));
    assert.ok(prompt.retrieved_historical_evidence.some(item => item.role === 'user' && /disclos|vision/iu.test(item.content)));
    assert.ok(prompt.retrieved_historical_evidence.some(item => item.role === 'assistant' && /records|addendum|accepts/iu.test(item.content)));
    assert.ok(prompt.retrieved_historical_evidence.some(item => item.index === 23 && item.purpose === 'audit-current-claim'));
    assert.match(prompt.retrieval_instruction, /distinguish a setup from its later payoff/);
    assert.match(prompt.retrieval_instruction, /Never keep or reopen a setup/);
});

test('analysis prompt accepts supporting host context without declaring it canon', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: 'Tea', is_user: true }], defaultState(), '', {}, { hostContext: '[Chat summary] Yesterday was quiet.' }));
    assert.equal(prompt.optional_host_context, '[Chat summary] Yesterday was quiet.');
    assert.match(prompt.host_context_instruction, /supporting context only/);
    assert.match(prompt.host_context_instruction, /do not treat every line as an established event/);
});

test('bootstrap prompt samples older messages instead of only the recent tail', () => {
    const messages = Array.from({ length: 40 }, (_, i) => ({ mes: `message-${i}`, is_user: i % 2 === 0 }));
    const prompt = JSON.parse(buildAnalysisPrompt(messages, defaultState(), '', {}, { messageWindow: 4, bootstrapScan: true }));
    assert.ok(prompt.messages.some(item => item.index === 0));
    assert.ok(prompt.messages.some(item => item.index < 36));
    assert.ok(prompt.messages.some(item => item.kind === 'anchor'));
    assert.ok(prompt.messages.every(item => item.kind === 'recent' || item.kind === 'anchor'));
});

test('canon bootstrap retains labeled OOC turns outside ordinary sampling points', () => {
    const messages = Array.from({ length: 60 }, (_, i) => ({ mes: `message-${i}`, is_user: i % 2 === 0 }));
    messages[22] = { mes: 'OOC: Lucia is off the charts and among the highest in history.', is_user: true };
    const prompt = JSON.parse(buildAnalysisPrompt(messages, defaultState(), '', {}, { messageWindow: 4, bootstrapScan: true }));
    assert.ok(prompt.messages.some(item => item.index === 22 && item.kind === 'directive' && /off the charts/.test(item.content)));
});

test('analysis application keeps guidance bounded and records its injection decision', () => {
    const messages = [{ mes: 'I make tea', is_user: true }];
    const next = applyAnalysis(defaultState(), { director_score: directorScore, scene: { status: 'active', activity: 'tea', pace: 'slow', intent: 'rest', location: 'kitchen', time: 'evening', loop: false }, objectives: [], entities: [], possibilities: [], pathways, next_guides: nextGuides, guidance: 'x'.repeat(2000), inject: true, reason: 'A gentle reminder will preserve the established pace.' }, messages);
    assert.equal(next.guidance.length, 700);
    assert.equal(next.sourceMessageCount, 1);
    assert.equal(next.scene.activity, 'tea');
    assert.equal(next.lastInject, true);
    assert.equal(next.directorScore.settingIdentity.startsWith('Star Wars'), true);
    assert.match(next.directorScore.storyIdentity, /survival and institutional-conflict/);
    assert.equal(next.directorScore.causalTempo, 'seed');
    assert.equal(next.directorScore.futureSetup.disclosure, 'hidden');
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
    const prompt = buildAnalysisPrompt(messages, { ...defaultState(), contextLedger: 'y'.repeat(4000) }, 'z'.repeat(2000), { description: 'd'.repeat(3500) }, { messageWindow: 24, maxPromptChars: 10000, continuityContext: 'c'.repeat(6000), hostContext: 'h'.repeat(8000), bootstrapScan: true });
    const parsed = JSON.parse(prompt);
    assert.ok(prompt.length <= 10000);
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
    const prompt = buildAnalysisPrompt(messages, state, '', {}, { messageWindow: 12, messageCharLimit: 700, maxPromptChars: 12000, bootstrapScan: true });
    const parsed = JSON.parse(prompt);
    assert.ok(prompt.length <= 12000);
    assert.equal(parsed.messages.at(-1).content, latest.trim());
});

test('bootstrap compaction keeps a recent trajectory anchor instead of reviving the opening scene', () => {
    const messages = Array.from({ length: 520 }, (_, index) => ({ mes: `${index}: ${'current trajectory '.repeat(60)}`, is_user: index % 2 === 0 }));
    messages[0] = { mes: `Old opening armored walker attack. ${'past '.repeat(300)}`, is_user: false };
    const prompt = JSON.parse(buildAnalysisPrompt(messages, defaultState(), '', {}, { messageWindow: 12, messageCharLimit: 700, maxPromptChars: 12000, bootstrapScan: true }));
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
    const prompt = buildAnalysisPrompt(messages, state, long, { scenario: long }, { messageWindow: 80, messageCharLimit: 4000, maxPromptChars: 8000, continuityContext: long.repeat(6), hostContext: long.repeat(8), bootstrapScan: true });
    assert.ok(prompt.length <= 8000);
    const parsed = JSON.parse(prompt);
    assert.equal(parsed.messages.at(-1).index, 79);
    assert.equal(parsed.current.lastOfferedCues[0].id, sentCue.id);
    assert.equal(parsed.current.lastOfferedCues[0].requestConfirmed, true);
});

test('planner excerpts remove generated scaffolding and preserve both ends of long prose', () => {
    const long = `<stat>\`\`\`private tracker\`\`\`</stat>${'A'.repeat(900)} crucial middle evidence ${'B'.repeat(900)} crucial ending`;
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: long, is_user: false }], defaultState(), '', {}, { messageCharLimit: 300 }));
    assert.doesNotMatch(prompt.messages[0].content, /private tracker|<stat>/);
    assert.match(prompt.messages[0].content, /^A+/);
    assert.match(prompt.messages[0].content, /crucial middle evidence/);
    assert.match(prompt.messages[0].content, /crucial ending$/);
});

test('empty optional context is omitted from the planner payload', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: 'Tea', is_user: true }], defaultState()));
    assert.equal('user_instruction' in prompt, false);
    assert.equal('bootstrap' in prompt, false);
    assert.equal('optional_continuity_context' in prompt, false);
    assert.equal('optional_host_context' in prompt, false);
});
