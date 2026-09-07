import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    ANALYSIS_OUTPUT_CONTRACT, ANALYSIS_SCHEMA_VALUE, INCREMENTAL_ANALYSIS_SCHEMA_VALUE,
    INCREMENTAL_SYSTEM, MODE_INSTRUCTIONS, SYSTEM, applyAnalysis, buildAnalysisPrompt,
    extractJson, transcriptHeadAlignmentErrors, validateAnalysisResult,
} from '../extension/analysis.js';
import { buildPromptPayload, defaultState, stateForPrompt } from '../extension/state.js';
import { estimateTokenCount } from '../extension/token-budget.js';

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
function full(overrides = {}) {
    return {
        contract_version: 8, current, context: { conditions, inject: true, inject_reason: 'These are the smallest relevant causal slice.', basis: 'Transcript and retained shipment records.' },
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
    return { contract_version: 10, current: compactCurrent, context: full().context, thread_updates: [], hidden_motives: full().hidden_motives, actor_updates: [], ledger: 'Current cabinet review.', note_resolution: null, audit: 'Fresh causal slice.', ...overrides };
}
const messages = [{ is_user: false, name: 'Narrator', mes: 'The reserve totals do not match the latest shipments.' }, { is_user: true, name: 'Ari', mes: 'I ask Mira what she thinks.' }];

test('extractJson accepts fenced, wrapped, and repairable JSON', () => {
    assert.deepEqual(extractJson('```json\n{"contract_version":8}\n```'), { contract_version: 8 });
    assert.deepEqual(extractJson('prefix {"ok":true} suffix'), { ok: true });
});

test('schemas expose causal-context contracts v8 and v10', () => {
    assert.equal(ANALYSIS_SCHEMA_VALUE.properties.contract_version.const, 8);
    assert.equal(INCREMENTAL_ANALYSIS_SCHEMA_VALUE.properties.contract_version.const, 10);
    assert.ok(ANALYSIS_SCHEMA_VALUE.required.includes('context'));
    assert.equal(ANALYSIS_SCHEMA_VALUE.properties.context.properties.conditions.maxItems, 6);
    assert.match(ANALYSIS_OUTPUT_CONTRACT, /current causes only/i);
});

test('valid full and incremental causal results pass', () => {
    assert.deepEqual(validateAnalysisResult(full()), { valid: true, errors: [] });
    assert.deepEqual(validateAnalysisResult(incremental()), { valid: true, errors: [] });
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

test('planner prompt defines private active simulation rather than future branches', () => {
    assert.match(SYSTEM, /private active-world simulator/i);
    assert.match(SYSTEM, /Never prescribe a future action/i);
    assert.match(SYSTEM, /expressed means resolved/i);
    assert.doesNotMatch(SYSTEM, /exactly two conditional/i);
    assert.match(INCREMENTAL_SYSTEM, /tentative stays private/i);
});

test('analysis prompt carries broad state but asks for only a relevant slice', () => {
    const state = defaultState();
    state.mode = 'fun'; state.contextLedger = 'Several ministries and families remain dormant.';
    const prompt = JSON.parse(buildAnalysisPrompt(messages, state, '', { scenario: 'Country simulation' }, { variationNonce: 7 }));
    assert.equal(prompt.task, 'refresh_active_world_simulation');
    assert.match(prompt.condition_rule, /durable present-state cause/i);
    assert.match(prompt.relevance_rule, /real causal state change/i);
    assert.match(prompt.mode_instruction, /bolder strongly supported pressure/i);
});

test('incremental prompt remains compact and omits horizon regeneration', () => {
    const prompt = JSON.parse(buildAnalysisPrompt(messages, defaultState(), '', {}, { incremental: true }));
    assert.equal(prompt.horizon_rule, undefined);
    assert.match(prompt.fast_rules, /Tentative conditions stay private/i);
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
    assert.equal(next.lastInject, true);
    assert.equal(next.objectives.length, 0);
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
    assert.doesNotMatch(payload, /confidence|relevance|mira-doubt/i);
    assert.match(payload, /writing model chooses every concrete action/i);
});

test('stateForPrompt retains private condition metadata for future planning', () => {
    const promptState = stateForPrompt(applyAnalysis(defaultState(), full(), messages));
    assert.equal(promptState.causalContext.conditions[2].confidence, 'tentative');
    assert.equal(promptState.causalContext.conditions[0].relevance, conditions[0].relevance);
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
