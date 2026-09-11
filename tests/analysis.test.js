import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    ANALYSIS_OUTPUT_CONTRACT, ANALYSIS_SCHEMA, ANALYSIS_SCHEMA_VALUE, INCREMENTAL_ANALYSIS_SCHEMA, INCREMENTAL_ANALYSIS_SCHEMA_VALUE, INCREMENTAL_ANALYSIS_OUTPUT_CONTRACT,
    INCREMENTAL_SYSTEM, MODE_INSTRUCTIONS, SYSTEM, applyAnalysis, buildAnalysisPrompt,
    alignRetainedStateToTranscript, extractJson, normalizeAnalysisDiagnostics, transcriptHeadAlignmentErrors, validateAnalysisResult,
} from '../extension/analysis.js';
import { applyPlannerAuthorLayer, buildPromptPayload, defaultState, fingerprintMessages, isGuidanceUsable, loadState, saveState, stateForPrompt } from '../extension/state.js';
import { estimateTokenCount } from '../extension/token-budget.js';
import { fitPromptToBudget } from '../extension/prompt-budget.js';
import { markAssistantTurn, plannerPassDecision } from '../extension/planner-scheduler.js';
import { createSafetyFallbackState } from '../extension/fallback-direction.js';

const current = {
    frame: 'grounded', frame_basis: 'The cabinet is reviewing a reserve report.', status: 'Mira is questioning the figures.',
    immediate_action: 'The report is under discussion.', activity: 'Cabinet review', situation: 'Reported reserves conflict with recent shipments.',
    activity_role: 'central', temporal_scope: 'scene', location: 'cabinet chamber', time: 'morning', loop: false,
    scene_promise: 'A consequential but open policy discussion.', phase: 'developing', emotional_direction: 'intensify',
    pressure: 'active', intrusion: 'closed', novelty_ceiling: 'meaningful',
};
const conditions = [
    { id: 'mira-doubt', kind: 'actor', subject: 'Mira', condition: 'suspects the reserve report is falsified', disclosure: 'private', confidence: 'strong', relevance: 'She is present in the cabinet meeting.' },
    { id: 'grain-pressure', kind: 'system', subject: 'Grain reserves', condition: 'are falling faster than the official report indicates', disclosure: 'limited', confidence: 'established', relevance: 'The meeting is deciding ration policy.' },
    { id: 'merchant-rumor', kind: 'group', subject: 'Harbor merchants', condition: 'may be coordinating shortages for leverage', disclosure: 'private', confidence: 'tentative', relevance: 'Their shipments explain one possible discrepancy.' },
];
const offscreen = {
    subjects: [{
        id: 'harbor-shortage', kind: 'situation', subject: 'Harbor shortages', reach: 'distant', motion: 'building',
        trajectory: 'Shipments continue falling behind demand.', settled: '', confidence: 'strong', last_seen_turn: 0,
        owed: 'The shortage may reach cabinet decisions through reports and prices.', carried_by: 'shipping ledgers and merchant testimony',
    }],
    elapsed: 'No material time skip is established.', settled_through: 0,
    audit: 'Preserved offscreen pressure without scheduling its arrival.',
};
function full(overrides = {}) {
    return {
        contract_version: 9, current, context: { conditions, inject: true, inject_reason: 'These are the smallest relevant causal slice.', basis: 'Transcript and retained shipment records.' }, offscreen,
        response_audit: { applicable: true, movement_fit: 'clear', repetition: 'none', unjustified_escalation: false, player_control: false, continuity_drift: false, patterns: [], summary: 'The discussion advanced.' },
        horizon: { status: 'latent', seeds: [{ id: 'food-legitimacy', kind: 'detected', trajectory: 'Food policy may affect institutional legitimacy.', engine: 'scarcity and public trust', scale: 'arc', condition: 'Shortages persist.', basis: 'The cabinet is deciding ration policy.', present_relation: 'echo', change: 'keep' }], audit: 'A supported long-range pressure remains optional.' },
        hidden_motives: { status: 'focused', items: [{ id: 'mira-protect', actor: 'Mira', explanation: 'Mira wants to expose manipulation without alerting its source.', likelihood: 'most-likely', evidence: ['She questions inconsistent totals.'], counterevidence: [], mechanism: 'Quiet scrutiny protects the inquiry.', current_relevance: 'drives-beat', disclosure: 'hidden', change: 'adjust' }], audit: 'This remains a hypothesis.' },
        world: { identity: 'A political life simulation', baseline: 'Institutions and material constraints react causally.', variant_rules: [], rp_changes: [], signatures: [], forces: ['scarcity'], confidence: 'high' },
        thread_updates: [], actor_updates: [], canon_updates: [], ledger: 'The cabinet is reviewing disputed reserve figures.', note_resolution: null, audit: 'Selected present causes rather than an outcome.',
        ...overrides,
    };
}
function incremental(overrides = {}) {
    const { activity_role, temporal_scope, ...compactCurrent } = current;
    return { contract_version: 11, current: compactCurrent, context: full().context, offscreen, thread_updates: [], hidden_motives: full().hidden_motives, actor_updates: [], ledger: 'Current cabinet review.', note_resolution: null, audit: 'Fresh causal slice.', ...overrides };
}
function modern(incrementalPass = false, overrides = {}) {
    return {
        ...(incrementalPass ? incremental() : full()), contract_version: incrementalPass ? 13 : 12,
        context: { ...full().context, conditions: conditions.map(item => ({ ...item, known_by: item.subject === 'Mira' ? ['Mira'] : [], learned_from: item.subject === 'Mira' ? 'Her comparison of the shipment figures.' : '' })) },
        response_audit: { ...full().response_audit, state_change: 'Mira located a discrepancy; its cause remains unresolved.' },
        ...overrides,
    };
}
const messages = [{ is_user: false, name: 'Narrator', mes: 'The reserve totals do not match the latest shipments.' }, { is_user: true, name: 'Ari', mes: 'I ask Mira what she thinks.' }];

test('accepted disengagement and personality boundaries survive full/routine updates, blanks, and reload', () => {
    const departure = {
        op: 'upsert', name: 'Mira', state: 'Left the conversation to make her promised delivery.',
        location: 'Market road', perspective: 'Friendly but protective of her time.',
        motivation: 'Keep her promise to a customer.', knowledge: 'Knows the delivery address.',
        constraints: 'Declines personal questions during work.', agenda: 'Complete the promised delivery.', window: 'This afternoon',
    };
    const transcript = [{ is_user: true, name: 'Ari', mes: 'I observe.' }, { is_user: false, name: 'Narrator', mes: 'Mira politely ends the conversation and leaves for her promised delivery.' }];
    let state = applyAnalysis(defaultState(), modern(false, { actor_updates: [departure] }), transcript);
    const reload = value => loadState(JSON.parse(JSON.stringify(saveState({}, value))));
    state = reload(state);
    const savedActor = state.entities[0];
    assert.equal(savedActor.state, departure.state);
    assert.equal(savedActor.constraints, departure.constraints);
    // Omitted actors stay retained; unknown empty fields are not a new canon
    // claim that the NPC has reappeared, lost a boundary, or abandoned a duty.
    for (const incrementalPass of [true, false]) {
        state = reload(applyAnalysis(state, modern(incrementalPass, { actor_updates: [] }), transcript));
        assert.deepEqual(state.entities[0], savedActor);
        const blank = Object.fromEntries(Object.keys(departure).map(key => [key, '']));
        Object.assign(blank, { op: 'upsert', name: 'Mira', motivation: departure.motivation, agenda: departure.agenda });
        const update = modern(incrementalPass, { actor_updates: [blank] });
        assert.equal(validateAnalysisResult(update).valid, true);
        state = reload(applyAnalysis(state, update, transcript));
        assert.deepEqual(state.entities[0], savedActor);
        const retained = stateForPrompt(state).entities[0];
        assert.match(retained.state, /Left the conversation/);
        assert.equal(retained.constraints, departure.constraints);
        assert.equal(retained.agenda, departure.agenda);
    }
    // Explicit evidence can change availability; preservation must not freeze
    // personality, commitments, or departure state forever.
    const returnTranscript = [...transcript, { is_user: true, mes: 'Later that afternoon, I look toward the road.' }, { is_user: false, mes: 'Mira returns after completing the delivery. She now has time to talk.' }];
    const returned = { ...departure, state: 'Returned after completing the delivery; willing to talk.', location: 'Shop', constraints: 'Work no longer prevents a brief conversation.', agenda: 'Rest after the completed delivery.' };
    state = reload(applyAnalysis(state, modern(true, { actor_updates: [returned] }), returnTranscript));
    assert.equal(state.entities[0].state, returned.state);
    assert.equal(state.entities[0].constraints, returned.constraints);
    assert.equal(state.entities[0].perspective, departure.perspective);
});

test('agency audit findings persist for next selection without forcing outcomes', () => {
    const patterns = ['[world-stall] The guards waited for a spectator to command pursuit.', '[availability-reset] Mira reappeared without a return after leaving.'];
    const result = modern(true, { response_audit: {
        ...modern(true).response_audit, movement_fit: 'missed', continuity_drift: true,
        patterns, state_change: 'No supported development; the prior departure was contradicted.',
    } });
    assert.equal(validateAnalysisResult(result).valid, true);
    const next = loadState(JSON.parse(JSON.stringify(saveState({}, applyAnalysis(defaultState(), result, messages)))));
    assert.deepEqual(next.responseAudit.patterns, patterns);
    assert.deepEqual(next.responsePatternMemory, patterns);
    assert.equal(next.responseAudit.continuityDrift, true);
    assert.doesNotMatch(buildPromptPayload(next, { guidanceUsable: true }), /world-stall|availability-reset|guards waited/);
});

test('modern multi-turn lifecycle preserves memory, reviews on schedule, and fails closed for stale guidance', () => {
    const chat = [...messages, { is_user: false, name: 'Mira', mes: 'Mira marks the conflicting totals without claiming to know their cause.' }];
    let state = defaultState();
    assert.equal(plannerPassDecision({ state, messages: chat }).bootstrapScan, true);
    const finish = (result, fullReview) => {
        assert.equal(validateAnalysisResult(result).valid, true);
        state = applyPlannerAuthorLayer(applyAnalysis(state, result, chat), {
            turnCount: chat.filter(message => !message.is_user).length,
            fingerprint: fingerprintMessages(chat), messages: chat, fullReview,
        });
        state.sourceChatId = 'story';
        state = loadState(JSON.parse(JSON.stringify(saveState({}, state))));
    };
    finish(modern(), true);
    const initialWorld = state.offscreenWorld.subjects;
    const initialMotives = state.hiddenMotives;
    for (let turn = 1; turn <= 12; turn++) {
        chat.push({ is_user: true, name: 'Ari', mes: `I compare ledger entry ${turn}.` });
        assert.equal(isGuidanceUsable(state, chat, 'story'), true);
        chat.push({ is_user: false, name: 'Mira', mes: `Mira checks entry ${turn} against the shipping receipt.` });
        assert.equal(isGuidanceUsable(state, chat, 'story'), false);
        state.plannerSchedule = markAssistantTurn(state.plannerSchedule, `reply-${turn}`);
        const tier = plannerPassDecision({ state, messages: chat });
        assert.equal(tier.bootstrapScan, false);
        assert.equal(tier.fullContextPass, turn === 12);
        if (turn === 12) {
            const fallback = createSafetyFallbackState(state, {
                messages: chat, chatId: 'story', fingerprint: fingerprintMessages(chat),
                turnCount: chat.filter(message => !message.is_user).length,
                reason: 'Simulated provider failure',
            });
            assert.equal(fallback.plannerSchedule.turnsSinceFullReview, 12);
            assert.equal(plannerPassDecision({ state: fallback, messages: chat }).fullContextPass, true);
            const fallbackPrompt = buildPromptPayload(fallback, { guidanceUsable: isGuidanceUsable(fallback, chat, 'story') });
            assert.match(fallbackPrompt, /ongoing roleplay situation/);
            assert.doesNotMatch(fallbackPrompt, /suspects the reserve report|falsified/);
            finish(modern(), true);
        } else {
            finish(modern(true, {
                offscreen: { subjects: [], elapsed: '', settled_through: 0, audit: '' },
                hidden_motives: { status: 'none', items: [], audit: '' },
                response_audit: { ...modern(true).response_audit, state_change: `Entry ${turn} was checked.`, patterns: ['Repeated ledger-check framing'] },
            }), false);
            assert.equal(state.plannerSchedule.turnsSinceFullReview, turn);
            assert.deepEqual(state.offscreenWorld.subjects, initialWorld);
            assert.deepEqual(state.hiddenMotives, initialMotives);
            assert.deepEqual(state.responsePatternMemory, ['Repeated ledger-check framing']);
            assert.equal(state.responseAudit.stateChange, `Entry ${turn} was checked.`);
        }
    }
    assert.equal(state.plannerSchedule.turnsSinceFullReview, 0);
    assert.equal(isGuidanceUsable(state, chat, 'story'), true);
    assert.equal(isGuidanceUsable(state, chat, 'different-chat'), false);
    const edited = chat.map((message, index) => index === chat.length - 1 ? { ...message, mes: 'The user replaced this reply.' } : message);
    assert.equal(isGuidanceUsable(state, edited, 'story'), false);
});

test('extractJson accepts fenced, wrapped, and repairable JSON', () => {
    assert.deepEqual(extractJson('```json\n{"contract_version":8}\n```'), { contract_version: 8 });
    assert.deepEqual(extractJson('prefix {"ok":true} suffix'), { ok: true });
});

test('schemas expose audited causal contracts v12 and v13', () => {
    assert.equal(ANALYSIS_SCHEMA_VALUE.properties.contract_version.const, 12);
    assert.equal(INCREMENTAL_ANALYSIS_SCHEMA_VALUE.properties.contract_version.const, 13);
    assert.ok(ANALYSIS_SCHEMA_VALUE.required.includes('context'));
    assert.ok(ANALYSIS_SCHEMA_VALUE.required.includes('offscreen'));
    assert.ok(INCREMENTAL_ANALYSIS_SCHEMA_VALUE.required.includes('offscreen'));
    assert.ok(ANALYSIS_SCHEMA_VALUE.properties.offscreen.required.includes('settled_through'));
    assert.equal(ANALYSIS_SCHEMA_VALUE.properties.context.properties.conditions.maxItems, 6);
    assert.match(ANALYSIS_OUTPUT_CONTRACT, /current causes only/i);
});

test('valid full and incremental causal results pass', () => {
    assert.deepEqual(validateAnalysisResult(full()), { valid: true, errors: [] });
    assert.deepEqual(validateAnalysisResult(incremental()), { valid: true, errors: [] });
});

test('new contracts require bounded knowledge and an audit in the same result', () => {
    for (const incrementalPass of [false, true]) {
        const value = modern(incrementalPass);
        assert.deepEqual(validateAnalysisResult(value), { valid: true, errors: [] });
        delete value.context.conditions[0].known_by;
        assert.match(validateAnalysisResult(value).errors.join('\n'), /known_by/);
        const missingAudit = modern(incrementalPass);
        delete missingAudit.response_audit;
        assert.match(validateAnalysisResult(missingAudit).errors.join('\n'), /response_audit/);
        const invalidAudit = modern(incrementalPass);
        invalidAudit.response_audit.state_change = 'x'.repeat(241);
        assert.match(validateAnalysisResult(invalidAudit).errors.join('\n'), /state_change/);
    }
});

test('verbose private audits are bounded without losing a full rebuild or incremental world state', () => {
    for (const incrementalPass of [false, true]) {
        const raw = modern(incrementalPass);
        raw.response_audit.summary = 'The latest reply made progress. '.repeat(30);
        raw.response_audit.state_change = 'The discrepancy is unresolved. '.repeat(20);
        raw.response_audit.patterns = ['Repeated ledger-check framing. '.repeat(12)];
        const original = structuredClone(raw);
        assert.equal(validateAnalysisResult(raw).valid, false);
        const result = normalizeAnalysisDiagnostics(raw);
        assert.deepEqual(raw, original, 'Do not mutate the provider response');
        assert.deepEqual(validateAnalysisResult(result), { valid: true, errors: [] });
        assert.equal(result.response_audit.summary.length, 400);
        assert.ok(result.response_audit.state_change.length <= 240);
        assert.ok(result.response_audit.patterns[0].length <= 140);
        assert.ok(result.response_audit.summary.endsWith('…'));
        for (const key of Object.keys(raw).filter(key => key !== 'response_audit')) {
            assert.deepEqual(result[key], raw[key], `${key} must not be altered`);
        }
        const pending = incrementalPass ? applyAnalysis(defaultState(), modern(), messages) : defaultState();
        pending.canonBootstrapPending = true;
        const saved = loadState(saveState({}, applyAnalysis(pending, result, messages)));
        assert.equal(saved.canonBootstrapPending, false);
        assert.equal(saved.storyFrame.frame, current.frame);
        assert.equal(saved.loreModel.worldIdentity, full().world.identity);
        assert.equal(saved.loreModel.baseline, full().world.baseline);
        assert.equal(saved.responseAudit.summary, result.response_audit.summary);
    }
});

test('diagnostic bounding does not conceal malformed audits or invalid causal facts', () => {
    for (const incrementalPass of [false, true]) {
        for (const mutate of [
            result => { delete result.response_audit; },
            result => { delete result.response_audit.summary; },
            result => { result.response_audit.summary = 123; },
            result => { result.response_audit.state_change = null; },
            result => { result.response_audit.applicable = 'true'; },
            result => { result.response_audit.movement_fit = 'bogus'; },
            result => { result.response_audit.patterns = ['']; },
            result => { result.response_audit.patterns = [123]; },
            result => { result.response_audit.patterns = Array(6).fill('Repeated'); },
            result => { result.context.conditions[0].known_by = ['x'.repeat(81)]; },
            result => { result.context.conditions[0].confidence = 'invented'; },
            result => { result.context.inject = false; },
        ]) {
            const result = modern(incrementalPass);
            mutate(result);
            assert.equal(validateAnalysisResult(normalizeAnalysisDiagnostics(result)).valid, false);
        }
    }
});

test('diagnostic bounding preserves valid output and does not split Unicode surrogate pairs', () => {
    assert.deepEqual(normalizeAnalysisDiagnostics(modern()), modern());
    for (const result of [null, undefined, {}, { response_audit: [] }]) {
        assert.equal(normalizeAnalysisDiagnostics(result), result);
    }
    const result = modern();
    result.response_audit.summary = `${'x'.repeat(398)}😀 more`;
    assert.equal(normalizeAnalysisDiagnostics(result).response_audit.summary, `${'x'.repeat(398)}…`);
});

test('routine deltas preserve omitted hypotheses and retire only the named one', () => {
    const prior = applyAnalysis(defaultState(), modern(), messages);
    const empty = modern(true, { hidden_motives: { status: 'none', items: [], audit: '' }, offscreen: { subjects: [], elapsed: '', settled_through: 0, audit: '' } });
    assert.equal(validateAnalysisResult(empty).valid, true);
    const next = applyAnalysis(prior, empty, messages);
    assert.deepEqual(next.hiddenMotives, prior.hiddenMotives);
    assert.deepEqual(next.offscreenWorld.subjects, prior.offscreenWorld.subjects);
    assert.equal(next.responseAudit.stateChange, empty.response_audit.state_change);
    const retired = modern(true, { hidden_motives: { status: 'none', items: [{ ...full().hidden_motives.items[0], change: 'retire' }], audit: 'Explicitly disproven.' } });
    assert.equal(validateAnalysisResult(retired).valid, true);
    assert.deepEqual(applyAnalysis(next, retired, messages).hiddenMotives.items, []);
});

test('attribution never globally renames different or shared relatives and proposals', () => {
    const state = defaultState();
    state.contextLedger = "Mira's father is a doctor. Lena's father is a sailor. Mira and Bea share their father. Mira proposed a walk; Ari proposed tea.";
    state.canonConstraints = ["Mira's father is a doctor."];
    const history = [{ is_user: true, name: 'Ari', mes: "I suggest visiting Lena's father." }, { is_user: false, mes: "Lena's father agrees. Mira's father is still at the clinic." }];
    const aligned = alignRetainedStateToTranscript(state, history);
    assert.equal(aligned.contextLedger, state.contextLedger);
    assert.deepEqual(aligned.canonConstraints, state.canonConstraints);
    const prompt = JSON.parse(buildAnalysisPrompt(history, state, '', {}, { summarySources: [{ label: 'Family', kind: 'summary', text: state.contextLedger }] }));
    assert.equal(prompt.current.contextLedger, state.contextLedger);
    assert.match(prompt.summary_sources[0].text, /Mira proposed a walk; Ari proposed tea/);
    assert.deepEqual(transcriptHeadAlignmentErrors(modern(), prompt), []);
});

test('story prompt fits the complete routine and review envelopes with durable history', async () => {
    const state = applyAnalysis(defaultState(), modern(), messages);
    state.offscreenWorld.subjects = Array.from({ length: 12 }, (_, i) => ({
        ...state.offscreenWorld.subjects[0], id: `harbor-${i}`, subject: `Harbor district ${i}`,
        settled: `District ${i} received a late shipment.`,
        history: Array.from({ length: 300 }, (_, j) => `Unrelated old district ${i} observation ${j}.`),
    }));
    state.offscreenWorld.archive = Array.from({ length: 30 }, (_, i) => ({ ...state.offscreenWorld.subjects[0], id: `archive-${i}`, subject: `Distant province ${i}` }));
    for (const incrementalPass of [true, false]) {
        const runtime = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
        const plannerMarker = runtime.match(/const INTERNAL_PLANNER_MARKER = '([^']+)'/)[1];
        const fixedEnvelope = incrementalPass
            ? `${plannerMarker}\n${INCREMENTAL_SYSTEM}\n${INCREMENTAL_ANALYSIS_OUTPUT_CONTRACT}\n${JSON.stringify(INCREMENTAL_ANALYSIS_SCHEMA)}`
            : `${plannerMarker}\n${SYSTEM}\n${ANALYSIS_OUTPUT_CONTRACT}\n${JSON.stringify(ANALYSIS_SCHEMA)}`;
        const tokenBudget = incrementalPass ? 6000 : 9000;
        const prompt = await fitPromptToBudget({ fixedEnvelope, tokenBudget,
            buildPrompt: effectivePromptTokens => buildAnalysisPrompt(messages, state, '', {}, { incremental: incrementalPass, maxPromptTokens: tokenBudget, effectivePromptTokens }),
        });
        assert.ok(estimateTokenCount(`${fixedEnvelope}\n${prompt}`) <= tokenBudget);
        const payload = JSON.parse(prompt);
        assert.equal(payload.messages.at(-1).content, messages.at(-1).mes);
        assert.ok(payload.messages.some(item => item.content === messages[0].mes));
        assert.doesNotMatch(prompt, /observation 100/);
        assert.ok(JSON.stringify(state).includes('observation 100'), 'retrieval must not delete local history');
    }
});

test('previous v8 and v10 results remain valid in flight without a new offscreen board', () => {
    const { offscreen: _fullOffscreen, ...oldFull } = full({ contract_version: 8 });
    const { offscreen: _incrementalOffscreen, ...oldIncremental } = incremental({ contract_version: 10 });
    assert.deepEqual(validateAnalysisResult(oldFull), { valid: true, errors: [] });
    assert.deepEqual(validateAnalysisResult(oldIncremental), { valid: true, errors: [] });
});

test('validation requires an injectable non-tentative causal condition', () => {
    const noInject = full({ context: { ...full().context, inject: false } });
    assert.ok(validateAnalysisResult(noInject).errors.includes('context.inject must be true'));
    const uncertain = full({ context: { ...full().context, conditions: [conditions[2]] } });
    assert.ok(validateAnalysisResult(uncertain).errors.some(error => /non-tentative/i.test(error)));
});

test('condition validation enforces complete bounded records', () => {
    const broken = full({ context: { ...full().context, conditions: [{ ...conditions[0], subject: '', confidence: 'certain' }] } });
    const errors = validateAnalysisResult(broken).errors.join('\n');
    assert.match(errors, /subject/);
    assert.match(errors, /confidence/);
});

test('offscreen validation enforces complete distinct bounded records', () => {
    const duplicate = { ...offscreen.subjects[0] };
    const result = full({ offscreen: { ...offscreen, subjects: [offscreen.subjects[0], duplicate] } });
    assert.match(validateAnalysisResult(result).errors.join('\n'), /distinct ids/i);
    const invalid = full({ offscreen: { ...offscreen, subjects: [{ ...offscreen.subjects[0], reach: 'omniscient', last_seen_turn: -1 }] } });
    assert.match(validateAnalysisResult(invalid).errors.join('\n'), /reach is invalid[\s\S]*non-negative integer/i);
});

test('planner prompt defines private active simulation rather than future branches', () => {
    assert.match(SYSTEM, /private active-world simulator/i);
    assert.match(SYSTEM, /Never prescribe a future action/i);
    assert.match(SYSTEM, /expressed means resolved/i);
    assert.match(SYSTEM, /Every provider response is self-propelling/i);
    assert.match(SYSTEM, /while remaining in the same scene or activity/i);
    assert.match(INCREMENTAL_SYSTEM, /observable self-propelling change/i);
    assert.match(MODE_INSTRUCTIONS.light, /self-propelling change within the present activity/i);
    assert.doesNotMatch(`${SYSTEM}\n${INCREMENTAL_SYSTEM}\n${Object.values(MODE_INSTRUCTIONS).join('\n')}`, /question|interrogat/i);
    assert.doesNotMatch(SYSTEM, /exactly two conditional/i);
    assert.match(INCREMENTAL_SYSTEM, /tentative stays private/i);
    assert.match(SYSTEM, /conversation, household, slice of life, business, town, country, ecosystem/i);
    assert.match(SYSTEM, /under-specified setting is open simulation space/i);
    assert.match(SYSTEM, /Enemies and threats are optional, never defaults/i);
    assert.match(INCREMENTAL_SYSTEM, /Adapt scale naturally among people, households, institutions, towns, countries, ecosystems/i);
});

test('analysis prompt carries broad state but asks for only a relevant slice', () => {
    const state = defaultState();
    state.mode = 'fun'; state.contextLedger = 'Several ministries and families remain dormant.';
    const prompt = JSON.parse(buildAnalysisPrompt(messages, state, '', { scenario: 'Country simulation' }, { variationNonce: 7 }));
    assert.equal(prompt.task, 'refresh_active_world_simulation');
    assert.match(prompt.condition_rule, /durable present-state cause/i);
    assert.match(prompt.relevance_rule, /real causal state change/i);
    assert.match(prompt.mode_instruction, /bolder strongly supported pressure/i);
    assert.equal(prompt.planner_clock.output_turn, 1);
    assert.match(prompt.distance_rule, /fourteen days/i);
    assert.match(prompt.scene_scale_rule, /user\/OOC request/i);
    assert.match(prompt.adaptation_rule, /town through residents, services, supply, governance, infrastructure/i);
    assert.match(prompt.world_generation_rule, /Generate compatible new information/i);
    assert.match(prompt.opposition_rule, /New adversaries or threats need a setting-native motive, capability, constraint, and causal route/i);
});

test('planner schemas and validation accept settlement-scale causal units', () => {
    for (const kind of ['community', 'place', 'resource', 'situation']) {
        assert.ok(ANALYSIS_SCHEMA_VALUE.properties.context.properties.conditions.items.properties.kind.enum.includes(kind));
    }
    for (const kind of ['relationship', 'community', 'resource']) {
        assert.ok(ANALYSIS_SCHEMA_VALUE.properties.offscreen.properties.subjects.items.properties.kind.enum.includes(kind));
    }
    const result = full({
        context: { ...full().context, conditions: [{ ...conditions[0], kind: 'community', subject: 'Riverside ward' }] },
        offscreen: { ...offscreen, subjects: [{ ...offscreen.subjects[0], kind: 'resource', subject: 'Reservoir capacity' }] },
    });
    assert.deepEqual(validateAnalysisResult(result), { valid: true, errors: [] });
});

test('planner receives deferred debt as candidates, never a scheduled arrival', () => {
    const state = defaultState();
    state.turnCount = 3;
    state.offscreenWorld = {
        subjects: [{ id: 'harbor-shortage', kind: 'situation', subject: 'Harbor shortages', reach: 'remote', motion: 'building', trajectory: 'Shipments are falling behind demand.', settled: 'One convoy departed late.', confidence: 'strong', lastSeenTurn: 0, owed: 'Prices may carry the pressure inland.', carriedBy: 'merchant reports' }],
        elapsed: 'Sixteen days', settledThrough: 0, audit: '',
    };
    const prompt = JSON.parse(buildAnalysisPrompt(messages, state));
    assert.match(prompt.offscreen_debt, /settle only a subject made relevant/i);
    assert.match(prompt.offscreen_debt, /fourteen days/i);
    assert.match(prompt.offscreen_debt, /never turn owed pressure into a scheduled arrival/i);
    assert.equal(prompt.planner_clock.previous_turn, 3);
    assert.equal(prompt.planner_clock.output_turn, 4);
});

test('incremental prompt remains compact and omits horizon regeneration', () => {
    const prompt = JSON.parse(buildAnalysisPrompt(messages, defaultState(), '', {}, { incremental: true }));
    assert.equal(prompt.horizon_rule, undefined);
    assert.equal(prompt.simulation, undefined);
    assert.equal(prompt.authority, undefined);
    assert.match(prompt.fast_rules, /only changed offscreen subjects/i);
    assert.match(prompt.fast_rules, /Audit the newest reply in the same call/i);
});

test('configured prompt budget remains bounded with long history', () => {
    const history = Array.from({ length: 80 }, (_, i) => ({ is_user: i % 2 === 0, name: i % 2 ? 'NPC' : 'Ari', mes: `Turn ${i} ${'detail '.repeat(400)}` }));
    const prompt = buildAnalysisPrompt(history, defaultState(), '', {}, { maxPromptTokens: 4000, recentContextTokens: 2600, messageTokenLimit: 220 });
    assert.ok(estimateTokenCount(prompt) <= 4200);
});

test('applying full analysis stores causal context and private simulation boards', () => {
    const next = applyAnalysis(defaultState(), full(), messages);
    assert.equal(next.causalContext.conditions[0].subject, 'Mira');
    assert.equal(next.horizonRadar.seeds.length, 1);
    assert.equal(next.hiddenMotives.items[0].actor, 'Mira');
    assert.equal(next.offscreenWorld.subjects[0].subject, 'Harbor shortages');
    assert.equal(next.lastInject, true);
    assert.equal(next.objectives.length, 0);
});

test('offscreen settlement is append-only and observation clocks cannot jump ahead', () => {
    const prior = applyAnalysis(defaultState(), full({ offscreen: { ...offscreen, subjects: [{ ...offscreen.subjects[0], settled: 'One convoy departed late.', last_seen_turn: 1 }], settled_through: 1 } }), messages);
    const proposal = { ...offscreen, subjects: [{ ...offscreen.subjects[0], settled: 'A storm delayed it.', last_seen_turn: 999 }], settled_through: 999 };
    const next = applyAnalysis(prior, incremental({ offscreen: proposal }), [...messages, { is_user: false, mes: 'Mira checks the source ledger.' }]);
    assert.match(next.offscreenWorld.subjects[0].settled, /One convoy departed late\.[\s\S]*A storm delayed it\./);
    assert.equal(next.offscreenWorld.subjects[0].lastSeenTurn, 2);
    assert.equal(next.offscreenWorld.settledThrough, 2);
});

test('incremental application refreshes causal context while retaining horizon', () => {
    const prior = applyAnalysis(defaultState(), full(), messages);
    const revised = incremental({ context: { ...full().context, conditions: [{ ...conditions[0], condition: 'now trusts the report totals' }] } });
    const next = applyAnalysis(prior, revised, [...messages, { is_user: false, mes: 'Mira checks the source ledger.' }]);
    assert.equal(next.causalContext.conditions[0].condition, 'now trusts the report totals');
    assert.equal(next.horizonRadar.seeds.length, 1);
});

test('provider payload exposes clean conditions and withholds tentative metadata', () => {
    const state = applyAnalysis(defaultState(), full(), messages);
    state.lastAnalysisFingerprint = 'x'; state.sourceMessageCount = messages.length; state.sourceChatId = 'chat';
    const payload = buildPromptPayload(state, { enabled: true, guidanceUsable: true });
    assert.match(payload, /Mira suspects the reserve report is falsified/);
    assert.match(payload, /Grain reserves are falling faster/);
    assert.doesNotMatch(payload, /Harbor merchants/);
    assert.doesNotMatch(payload, /Harbor shortages|shipping ledgers|scheduled arrival/i);
    assert.doesNotMatch(payload, /confidence|relevance|mira-doubt/i);
    assert.match(payload, /writing model chooses every concrete action/i);
});

test('stateForPrompt retains private condition metadata for future planning', () => {
    const promptState = stateForPrompt(applyAnalysis(defaultState(), full(), messages));
    assert.equal(promptState.causalContext.conditions[2].confidence, 'tentative');
    assert.equal(promptState.causalContext.conditions[0].relevance, conditions[0].relevance);
    assert.equal(promptState.offscreenWorld.subjects[0].confidence, 'strong');
    assert.equal(promptState.turnCount, 1);
});

test('transcript clock alignment still rejects stale planner state', () => {
    const status = 'TIME = 09:30 PM\nLOCATION = North Hall\nCURRENT BEAT = Cabinet adjourned';
    const errors = transcriptHeadAlignmentErrors(full(), { transcript_head: { authoritative_assistant_status: status, authoritative_assistant_excerpt: status } });
    assert.ok(errors.some(error => /time/i.test(error)));
});

test('runtime planner source contains no scenario-specific recovery keys', () => {
    const source = readFileSync(new URL('../extension/analysis.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /hogwarts|naruto|star wars/i);
    assert.deepEqual(Object.keys(MODE_INSTRUCTIONS), ['light', 'balanced', 'fun']);
});
