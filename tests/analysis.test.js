import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    ANALYSIS_OUTPUT_CONTRACT, ANALYSIS_SCHEMA, ANALYSIS_SCHEMA_VALUE, MODE_INSTRUCTIONS,
    applyAnalysis, buildAnalysisPrompt, extractJson, SYSTEM, validateAnalysisResult,
} from '../extension/analysis.js';
import { buildPromptPayload, defaultState, stateForPrompt } from '../extension/state.js';
import { estimateTokenCount } from '../extension/token-budget.js';

function result(overrides = {}) {
    const value = {
        contract_version: 7,
        current: {
            frame: 'grounded', frame_basis: 'A quiet work session is physically and socially ordinary.',
            status: 'The user is working alone on an assignment.', immediate_action: 'Continue the current attempt.',
            activity: 'Completing an assignment at a desk.', situation: 'The task is calm but has a plausible practical difficulty.',
            activity_role: 'developmental', temporal_scope: 'action', location: 'bedroom', time: 'evening', loop: false,
            scene_promise: 'Focused, low-key progress with no unrelated intrusion.', phase: 'developing', emotional_direction: 'preserve',
            pressure: 'latent', intrusion: 'closed', novelty_ceiling: 'context-native',
        },
        beat: {
            inject: true, inject_reason: 'The scene benefits from a light directional nudge without prescribing its realization.',
            operation: 'complicate', primary_when: 'The user continues or engages with the assignment.', target: 'the current assignment attempt',
            required_effect: 'Expose one manageable, task-native difficulty that makes progress require a concrete adjustment.',
            alternatives: [
                { when: 'The user pauses, resists, or leaves the task.', operation: 'let the pause reveal a grounded consequence of disengaging', required_effect: 'Make the changed relationship to the unfinished task perceptible without forcing a return.', content_class: 'consequence', scope: 'personal', intensity: 'low', quantity: 'singular', relative_power: 'none', plot_weight: 'incidental', duration: 'beat' },
                { when: 'The user redirects attention to another present concern.', operation: 'carry the unfinished pressure into the newly chosen focus', required_effect: 'Let the new focus proceed while preserving one observable connection to the unfinished work.', content_class: 'reaction', scope: 'personal', intensity: 'low', quantity: 'singular', relative_power: 'none', plot_weight: 'connective', duration: 'beat' },
            ],
            content_class: 'obstacle', scope: 'personal', intensity: 'low', quantity: 'singular', relative_power: 'inferior',
            plot_weight: 'incidental', duration: 'beat',
            preserve: ['the solitary work scene', 'the user controls how to respond'],
            forbid: ['unrelated attackers', 'a forced player decision'], basis: 'The assignment supports a small practical obstacle, not a new plot.',
        },
        response_audit: {
            applicable: true, movement_fit: 'clear', repetition: 'none', unjustified_escalation: false,
            player_control: false, continuity_drift: false, patterns: ['task-native obstacle after quiet setup'],
            summary: 'The prior response moved the current activity without taking control from the player.',
        },
        horizon: {
            status: 'latent',
            seeds: [
                { id: 'education-path', kind: 'detected', trajectory: 'Repeated academic choices could reshape the user character’s longer educational direction.', engine: 'accumulated academic commitments', scale: 'arc', condition: 'Several meaningful choices continue to accumulate.', basis: 'The ongoing assignment establishes education as a recurring causal domain.', present_relation: 'echo', change: 'keep' },
                { id: 'unexpected-mentor', kind: 'original', trajectory: 'A presently peripheral relationship could mature into an unexpected source of guidance or opposition.', engine: 'changing relationship expectations', scale: 'months-years', condition: 'A compatible recurring person gains independent reasons to remain involved.', basis: 'This is a compatible private possibility, not an established fact.', present_relation: 'none', change: 'replace' },
            ],
            audit: 'Both seeds can survive beyond the assignment scene and use independent causal engines.',
        },
        hidden_motives: { status: 'none', items: [], audit: 'No notable unexplained motive is required by this quiet scene.' },
        world: {
            identity: 'A contemporary life simulation', baseline: 'Ordinary school and home constraints apply.',
            variant_rules: [], rp_changes: [], signatures: ['The user prefers grounded task detail.'], forces: ['time and incomplete materials'], confidence: 'high',
        },
        thread_updates: [], actor_updates: [], canon_updates: [],
        ledger: 'The user is working alone on an unfinished assignment at home.', note_resolution: null,
        audit: 'A low task-native complication creates effect without violating the closed quiet beat; escalation was rejected.',
    };
    return { ...value, ...overrides };
}

const messages = [
    { is_user: false, name: 'Narrator', mes: 'The room is quiet and the assignment lies open.' },
    { is_user: true, name: 'Ari', mes: 'I keep working on the next question.' },
];

test('extractJson accepts fenced, wrapped, and locally repairable JSON', () => {
    assert.deepEqual(extractJson('```json\n{"contract_version":4}\n```'), { contract_version: 4 });
    assert.deepEqual(extractJson('prefix {"ok":true} suffix'), { ok: true });
    assert.deepEqual(extractJson('{"current":{"activity":"reading"\n"phase":"developing"},}'), { current: { activity: 'reading', phase: 'developing' } });
});

test('structured output contract combines external reaction with a private v7 horizon radar', () => {
    assert.equal(ANALYSIS_SCHEMA_VALUE.properties.contract_version.const, 7);
    assert.deepEqual(ANALYSIS_SCHEMA_VALUE.required, ['contract_version', 'current', 'beat', 'response_audit', 'horizon', 'hidden_motives', 'world', 'thread_updates', 'actor_updates', 'canon_updates', 'ledger', 'note_resolution', 'audit']);
    assert.equal(ANALYSIS_SCHEMA.strict, true);
    assert.equal(ANALYSIS_SCHEMA_VALUE.properties.beat.properties.alternatives.minItems, 2);
    assert.equal(ANALYSIS_SCHEMA_VALUE.properties.beat.properties.alternatives.maxItems, 2);
    assert.equal(ANALYSIS_SCHEMA_VALUE.properties.beat.properties.inject.const, true);
    assert.match(ANALYSIS_OUTPUT_CONTRACT, /No other keys/);
    assert.doesNotMatch(JSON.stringify(ANALYSIS_SCHEMA_VALUE), /routes|guides|milestones|future_setup/i);
});

test('horizon radar accepts only independent genuinely long-range private seeds', () => {
    assert.equal(validateAnalysisResult(result()).valid, true);
    const near = result({ horizon: { ...result().horizon, seeds: [{ ...result().horizon.seeds[0], scale: 'scene' }] } });
    assert.ok(validateAnalysisResult(near).errors.some(error => /genuinely long-range/i.test(error)));
    const duplicateEngine = result({ horizon: { ...result().horizon, seeds: result().horizon.seeds.map(seed => ({ ...seed, engine: 'same engine' })) } });
    assert.ok(validateAnalysisResult(duplicateEngine).errors.some(error => /distinct causal engines/i.test(error)));
    const inconsistent = result({ horizon: { ...result().horizon, status: 'none' } });
    assert.ok(validateAnalysisResult(inconsistent).errors.some(error => /cannot be none/i.test(error)));
});

test('legacy v6 beat results remain valid during in-flight upgrade', () => {
    const legacy = { ...result(), contract_version: 6 };
    delete legacy.horizon;
    assert.deepEqual(validateAnalysisResult(legacy), { valid: true, errors: [] });
});

test('valid current-beat result passes validation', () => {
    assert.deepEqual(validateAnalysisResult(result()), { valid: true, errors: [] });
});

test('fresh planner results must always contribute a direction', () => {
    const check = validateAnalysisResult(result({ beat: { ...result().beat, inject: false } }));
    assert.equal(check.valid, false);
    assert.ok(check.errors.includes('beat.inject must be true'));
});

test('validation rejects missing semantic effect and invalid scale values without restricting movement words', () => {
    const missing = result({ beat: { ...result().beat, required_effect: '' } });
    assert.equal(validateAnalysisResult(missing).valid, false);
    const invalid = result({ beat: { ...result().beat, operation: 'summon-dragon', scope: 'scene' } });
    const check = validateAnalysisResult(invalid);
    assert.equal(check.valid, false);
    assert.ok(!check.errors.includes('beat.operation is invalid'));
    assert.ok(check.errors.includes('beat.scope is invalid'));
    assert.equal(validateAnalysisResult(result({ beat: { ...result().beat, alternatives: result().beat.alternatives.slice(0, 1) } })).valid, false);
});

test('freeform movement phrases and every simulation scope validate', () => {
    for (const operation of ['let the silence acquire meaning', 'reframe through an unintended kindness', 'fracture the apparent consensus', 'summon-dragon']) {
        assert.equal(validateAnalysisResult(result({ beat: { ...result().beat, operation } })).valid, true, operation);
    }
    for (const scope of ['personal', 'social', 'institutional', 'societal', 'world']) {
        assert.equal(validateAnalysisResult(result({ beat: { ...result().beat, scope } })).valid, true, scope);
    }
});

test('provider-visible branches reject canon-specific names instead of injecting a miniature scene', () => {
    const leaky = result({
        actor_updates: [{ name: 'Lucia' }, { name: 'Commander Vekk' }],
        beat: {
            ...result().beat,
            operation: 'Let Vekk offer a small personal reflection',
            required_effect: 'Lucia feels more known through a connection to Jabiim or the Force.',
        },
    });
    const check = validateAnalysisResult(leaky);
    assert.equal(check.valid, false);
    assert.ok(check.errors.some(error => /beat\.operation.*Vekk/i.test(error)));
    assert.ok(check.errors.some(error => /beat\.required_effect.*Lucia/i.test(error)));
});

test('provider-visible branches accept arbitrary abstract sentence openings without a word allowlist', () => {
    for (const required_effect of [
        'Rest remains available without erasing one observable consequence of the current activity.',
        'Pause long enough for the established pressure to become perceptible.',
        'Relief changes the texture of the current interaction without deciding the player response.',
        'Silence acquires a small amount of meaning through an observable contextual change.',
    ]) {
        const abstract = result({
            beat: {
                ...result().beat,
                alternatives: [
                    result().beat.alternatives[0],
                    { ...result().beat.alternatives[1], required_effect },
                ],
            },
        });
        assert.equal(validateAnalysisResult(abstract).valid, true, required_effect);
    }
});

test('provider-visible canon terms are rejected even when the model lowercases them', () => {
    const leaky = result({
        actor_updates: [{ name: 'Commander Vekk' }],
        beat: { ...result().beat, operation: 'let vekk redirect the current interaction' },
    });
    assert.ok(validateAnalysisResult(leaky).errors.some(error => /beat\.operation.*vekk/i.test(error)));
});

test('multiword setting names do not reserve each ordinary component word', () => {
    const abstract = result({
        world: { ...result().world, identity: 'Star Wars' },
        beat: { ...result().beat, operation: 'let one distant star alter the current environment' },
    });
    assert.equal(validateAnalysisResult(abstract).valid, true);
});

test('planner chooses scene-warranted movement before applying randomness', () => {
    assert.match(SYSTEM, /First determine what movement the scene actually warrants/i);
    assert.match(SYSTEM, /never selects the movement and never creates a need for an incident/i);
    assert.match(SYSTEM, /Quietness is not stagnation/i);
    assert.match(SYSTEM, /playable movement through an NPC reaction, world reaction/i);
    assert.match(SYSTEM, /Active danger, competition, demanding tasks, and instability may exert credible pressure/i);
    assert.match(SYSTEM, /new cause used by a current branch needs conversational or explicit-canon support/i);
    assert.match(SYSTEM, /not compulsory disruption/i);
    assert.match(SYSTEM, /cannot justify manufacturing difficulty/i);
    assert.match(SYSTEM, /Scene changes, pressure shifts, reversals, discoveries/i);
    assert.match(SYSTEM, /There is no fixed taxonomy, approved vocabulary, nearest label, or fallback bucket/i);
    assert.match(SYSTEM, /Never invent player dialogue, thoughts, feelings, consent, decisions/i);
    assert.match(SYSTEM, /conditional movement set/i);
    assert.match(SYSTEM, /exactly two materially distinct redirect-safe branches/i);
    assert.match(SYSTEM, /conditions distinguish external response routes/i);
    assert.match(SYSTEM, /ignore all branches if they cross into defining or modifying the user action/i);
    assert.match(SYSTEM, /Quiet listening, assignments, rest, travel/i);
    assert.match(SYSTEM, /Never manufacture conflict, interruption, pressure, urgency, or restriction/i);
});

test('planner permits freeform AI invention and scale-native simulation', () => {
    assert.match(SYSTEM, /not an event taxonomy/i);
    assert.match(SYSTEM, /new cause used by a current branch needs conversational or explicit-canon support/i);
    assert.match(SYSTEM, /PRIVATE HORIZON RADAR/i);
    assert.match(SYSTEM, /near-term matter with a distant label/i);
    assert.match(SYSTEM, /kind=original is a compatible invention and remains speculation/i);
    assert.match(SYSTEM, /life simulation/i);
    assert.match(SYSTEM, /countries, societies, and worlds/i);
    assert.match(SYSTEM, /policy effect, public response, trend, or system pressure/i);
    assert.match(SYSTEM, /every scale classification in private fields/i);
    assert.match(SYSTEM, /governs only NPC or world follow-through, never the user action/i);
    assert.match(SYSTEM, /portable to any scene with the same dramatic shape/i);
    assert.match(SYSTEM, /Never name or repeat a character, location, faction, lore concept/i);
    assert.match(SYSTEM, /Introduce a quiet, favorable discovery/i);
    assert.match(SYSTEM, /Keep scene specifics.*private fields/i);
    assert.doesNotMatch(SYSTEM, /generate six to eight.*routes|schedule future milestones|maintain event queues/i);
    assert.ok(estimateTokenCount(`${SYSTEM}\n${ANALYSIS_OUTPUT_CONTRACT}`) < 3900);
});

test('all modes alter only external follow-through without touching the user action', () => {
    for (const mode of Object.values(MODE_INSTRUCTIONS)) assert.match(mode, /NPC or world|NPC or world follow-through/i);
    assert.match(MODE_INSTRUCTIONS.light, /follow-through, expressed subtly but perceptibly/i);
    assert.match(MODE_INSTRUCTIONS.balanced, /clear, meaningful next step/i);
    assert.match(MODE_INSTRUCTIONS.fun, /prominent, lively expression/i);
    assert.match(MODE_INSTRUCTIONS.fun, /Randomness never touches the user action/i);
    for (const mode of Object.values(MODE_INSTRUCTIONS)) assert.doesNotMatch(mode, /control the player|force the player/i);
});

test('analysis prompt carries current context, identity, variation, bootstrap, and summaries', () => {
    const prompt = JSON.parse(buildAnalysisPrompt(messages, { ...defaultState(), mode: 'fun' }, '', { scenario: 'A grounded school life simulation.' }, {
        variationNonce: 731, summarySources: [{ label: 'Continuity Memory', kind: 'summary', text: 'The assignment is due tomorrow.' }],
    }));
    assert.equal(prompt.task, 'prepare_conditional_direction_set');
    assert.equal(prompt.player_character, 'Ari');
    assert.equal(prompt.variation_nonce, 731);
    assert.equal(prompt.bootstrap.scenario, 'A grounded school life simulation.');
    assert.equal(prompt.summary_sources[0].label, 'Continuity Memory');
    assert.match(prompt.invention, /strong, scene-supported inference about an incentive, capability, relationship, or hidden motive/i);
    assert.match(prompt.invention, /weak guess as fact/i);
    assert.match(prompt.horizon_rule, /bounded radar of zero to four optional trajectories/i);
    assert.match(prompt.horizon_rule, /near-term matter merely renamed as distant/i);
    assert.match(prompt.horizon_rule, /genuinely original seed/i);
    assert.match(prompt.invention, /provider-visible when, operation, and required_effect text must contain only portable abstractions/i);
    assert.match(prompt.invention, /Never copy names or concrete nouns from the scene/i);
    assert.match(prompt.invention, /current activity, current interaction, current environment/i);
    assert.match(prompt.instruction, /governing only NPC or world follow-through/i);
    assert.match(prompt.instruction, /main roleplay instructions resolve the user action/i);
    assert.match(prompt.contribution_rule, /Always set beat\.inject=true/i);
    assert.match(prompt.contribution_rule, /Quiet listening, assignments, rest, travel/i);
    assert.match(prompt.movement, /broadly compatible external-response condition/i);
    assert.match(prompt.response_audit_rule, /never injected/i);
    assert.match(prompt.simulation, /country simulation/i);
    assert.match(prompt.direction_policy, /choose one coherent primary NPC-or-world follow-through before applying random appetite/i);
    assert.match(prompt.direction_policy, /two distinct redirect-safe alternatives/i);
    assert.match(prompt.direction_policy, /breathing room.*as legitimate as complication/i);
    assert.match(prompt.direction_policy, /Quiet or routine situations still gain a perceptible external response/i);
    assert.match(prompt.direction_policy, /NPC reaction, world reaction, consequence, opportunity, or natural next causal step/i);
    assert.match(prompt.direction_policy, /Provider-visible text states only abstract external function and effect/i);
    assert.equal(Object.hasOwn(prompt, 'director_policy'), false);
    assert.match(prompt.director_sample, /WEIGHTED DIRECTOR SAMPLE/);
    assert.match(prompt.director_sample, /Choose movement from scene need before applying these signals/i);
    assert.match(prompt.mode_instruction, /strongly implied motives and capabilities may shape/i);
    assert.equal(Object.hasOwn(prompt, 'pacing'), false);
});

test('analysis prompt treats OOC and scenario authority as binding, not future suggestions', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([
        ...messages,
        { is_user: true, name: 'Ari', mes: 'OOC: I kill the dragon here. Do not advance beyond the immediate aftermath.' },
    ], defaultState()));
    assert.match(prompt.authority, /OOC outcome commands bind the stated outcome/i);
    assert.match(prompt.authority, /user action is outside Tale Fairy’s authority/i);
    assert.match(prompt.authority, /Never use planning to deny, delay, weaken, cap, or modify the user action/i);
    assert.match(prompt.contribution_rule, /Every branch must be self-propelling/i);
    assert.match(prompt.contribution_rule, /exists independently of any player reply/i);
    assert.match(prompt.contribution_rule, /dialogue-centered scenes/i);
    assert.doesNotMatch(prompt.contribution_rule, /interrogat/i);
    assert.match(prompt.evidence_rule, /Never predict or force a known canon event/i);
    assert.match(prompt.messages.at(-1).content, /I kill the dragon here/);
});

test('analysis prompt keeps newest explicit extreme canon intact', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([
        { is_user: true, name: 'Ari', mes: 'OOC: My power is explicitly off the charts and unmatched in this era.' },
    ], defaultState()));
    assert.ok(prompt.explicit_ooc_canon.some(item => /off the charts and unmatched/i.test(item)));
    assert.match(prompt.evidence_rule, /Newer explicit user\/OOC facts supersede inference/);
});

test('analysis prompt remains inside its configured budget with long rapid-fire history', () => {
    const history = Array.from({ length: 180 }, (_, index) => ({ is_user: index % 2 === 0, name: index % 2 ? 'Narrator' : 'Ari', mes: `${index}: ${'context '.repeat(500)}` }));
    const prompt = buildAnalysisPrompt(history, defaultState(), '', {}, { maxPromptTokens: 3200, effectivePromptTokens: 2400, recentContextTokens: 1600, messageTokenLimit: 220 });
    assert.ok(estimateTokenCount(prompt) <= 2400, estimateTokenCount(prompt));
    assert.match(JSON.parse(prompt).messages.at(-1).content, /^179:/);
});

test('advertised high-budget settings can use more than the former internal clamps', () => {
    const history = Array.from({ length: 20 }, (_, index) => ({
        is_user: index % 2 === 0, name: index % 2 ? 'Narrator' : 'Ari', mes: `${index}: ${'scene detail '.repeat(900)}`,
    }));
    const parsed = JSON.parse(buildAnalysisPrompt(history, defaultState(), '', {}, {
        maxPromptTokens: 30000, effectivePromptTokens: 25000, recentContextTokens: 10000, messageTokenLimit: 1800,
        summarySources: [{ label: 'Long memory', kind: 'summary', text: 'continuity detail '.repeat(3000) }],
    }));
    const messageTokens = parsed.messages.reduce((total, message) => total + estimateTokenCount(message.content), 0);
    const summaryTokens = parsed.summary_sources.reduce((total, summary) => total + estimateTokenCount(summary.text), 0);
    assert.ok(messageTokens > 7000, messageTokens);
    assert.ok(summaryTokens > 3000, summaryTokens);
});

test('applying analysis saves the beat and private horizon radar while clearing retired route machinery', () => {
    const prior = { ...defaultState(), objectives: [{ title: 'Future' }], possibilities: [{ description: 'Future' }], pathways: [{ id: 'route' }], nextGuides: [{ id: 'guide' }], narrativeEvents: [{ id: 'event' }] };
    const next = applyAnalysis(prior, result(), messages);
    assert.equal(next.sceneProfile.promise, result().current.scene_promise);
    assert.equal(next.beatDirective.operation, 'complicate');
    assert.equal(next.beatDirective.contentClass, 'obstacle');
    assert.equal(next.lastInject, true);
    assert.equal(next.responseAudit.movementFit, 'clear');
    assert.deepEqual(next.responsePatternMemory, ['task-native obstacle after quiet setup']);
    assert.equal(next.horizonRadar.status, 'latent');
    assert.deepEqual(next.horizonRadar.seeds.map(seed => seed.id), ['education-path', 'unexpected-mentor']);
    assert.equal(next.narrativeLayers.durableTrajectory, result().horizon.seeds[0].trajectory);
    assert.deepEqual(next.objectives, []);
    assert.deepEqual(next.possibilities, []);
    assert.deepEqual(next.pathways, []);
    assert.deepEqual(next.nextGuides, []);
    assert.deepEqual(next.narrativeEvents, []);
});

test('applying analysis retains ranked hidden motives for the Scratchpad only', () => {
    const analyzed = result({ hidden_motives: {
        status: 'focused', audit: 'The first explanation best fits the observed timing.',
        items: [{ id: 'trait-recognition', actor: 'Supreme Chancellor', explanation: 'The office recognized an unusually important latent trait and expedited the meeting before rivals could react.', likelihood: 'most-likely', evidence: ['The meeting was expedited.', 'The subject has an unusually high established trait.'], counterevidence: ['The office has not stated its reason.'], mechanism: 'The Chancellor can reorder appointments and prioritize strategically valuable subjects.', current_relevance: 'drives-beat', disclosure: 'hidden', change: 'keep' }],
    } });
    const next = applyAnalysis(defaultState(), analyzed, messages);
    assert.equal(next.hiddenMotives.items[0].likelihood, 'most-likely');
    assert.equal(stateForPrompt(next).hiddenMotives.items[0].actor, 'Supreme Chancellor');
    assert.doesNotMatch(buildPromptPayload(next, { guidanceUsable: true }), /Supreme Chancellor|latent trait|expedited the meeting/i);
});

test('related original horizon seeds remain speculation instead of becoming durable trajectory', () => {
    const speculative = result({
        horizon: {
            ...result().horizon,
            seeds: [
                { ...result().horizon.seeds[0], kind: 'original', present_relation: 'advance' },
            ],
        },
    });
    const next = applyAnalysis(defaultState(), speculative, messages);
    assert.equal(next.horizonRadar.seeds[0].kind, 'original');
    assert.equal(next.narrativeLayers.durableTrajectory, '');
});

test('private response audit informs later planning but never enters roleplay injection', () => {
    const next = applyAnalysis(defaultState(), result(), messages);
    const plannerState = JSON.stringify(next.responseAudit) + JSON.stringify(next.responsePatternMemory);
    const providerPayload = buildAnalysisPrompt(messages, next);
    const roleplayPayload = buildPromptPayload(next, { guidanceUsable: true });
    assert.match(providerPayload, /task-native obstacle after quiet setup/);
    assert.doesNotMatch(roleplayPayload, /movementFit|task-native obstacle|prior response/i);
    assert.doesNotMatch(roleplayPayload, /education-path|unexpected-mentor|educational direction/i);
    assert.ok(plannerState.includes('task-native obstacle'));
});

test('applying factual deltas updates and retires actors and unresolved processes', () => {
    const prior = {
        ...defaultState(),
        continuityThreads: [{ id: 'permit', thread: 'Permit review', state: 'Pending.', status: 'dormant', basis: 'Filed.' }],
        entities: [{ name: 'Clerk', state: 'At the counter.', relevance: 'current', agenda: 'Process forms.' }],
        canonConstraints: ['The permit was filed.'],
    };
    const update = result({
        thread_updates: [{ op: 'upsert', id: 'budget', thread: 'National budget', state: 'Debate is active.', status: 'active', basis: 'Parliament convened.' }, { op: 'retire', id: 'permit', thread: '', state: '', status: 'dormant', basis: '' }],
        actor_updates: [{ op: 'retire', name: 'Clerk', state: '', location: '', perspective: '', motivation: '', knowledge: '', constraints: '', agenda: '', window: '' }, { op: 'upsert', name: 'Treasury', state: 'Drafting allocations.', location: 'capital', perspective: 'Revenue is tight.', motivation: 'Pass a viable budget.', knowledge: 'Current forecasts.', constraints: 'Legislative votes.', agenda: 'Revise the bill.', window: 'current session' }],
        canon_updates: [{ op: 'remove', fact: 'The permit was filed.' }, { op: 'add', fact: 'Parliament is in session.' }],
    });
    const next = applyAnalysis(prior, update, messages);
    assert.deepEqual(next.continuityThreads.map(item => item.id), ['budget']);
    assert.deepEqual(next.entities.map(item => item.name), ['Treasury']);
    assert.deepEqual(next.canonConstraints, ['Parliament is in session.']);
});

test('AI-assisted note resolution accepts only supported authority kinds', () => {
    assert.equal(validateAnalysisResult(result({ note_resolution: { kind: 'forbid' } })).valid, true);
    assert.equal(validateAnalysisResult(result({ note_resolution: { kind: 'maybe' } })).valid, false);
});

test('runtime planner source has no scenario-specific recovery keys', () => {
    const source = ['analysis.js', 'state.js', 'beat-director.js', 'index.js'].map(file => readFileSync(new URL(`../extension/${file}`, import.meta.url), 'utf8')).join('\n');
    assert.doesNotMatch(source, /Chancellor|C-5-2214|Hokage|Midichlorian|Dorn-2/u);
});
