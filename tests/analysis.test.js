import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    ANALYSIS_OUTPUT_CONTRACT, ANALYSIS_SCHEMA, ANALYSIS_SCHEMA_VALUE, MODE_INSTRUCTIONS,
    applyAnalysis, buildAnalysisPrompt, extractJson, SYSTEM, validateAnalysisResult,
} from '../extension/analysis.js';
import { defaultState } from '../extension/state.js';
import { estimateTokenCount } from '../extension/token-budget.js';

function result(overrides = {}) {
    const value = {
        contract_version: 3,
        current: {
            frame: 'grounded', frame_basis: 'A quiet work session is physically and socially ordinary.',
            status: 'The user is working alone on an assignment.', immediate_action: 'Continue the current attempt.',
            activity: 'Completing an assignment at a desk.', situation: 'The task is calm but has a plausible practical difficulty.',
            activity_role: 'developmental', temporal_scope: 'action', location: 'bedroom', time: 'evening', loop: false,
            scene_promise: 'Focused, low-key progress with no unrelated intrusion.', phase: 'developing', emotional_direction: 'preserve',
            pressure: 'latent', intrusion: 'closed', novelty_ceiling: 'context-native',
        },
        beat: {
            operation: 'complicate', target: 'the current assignment attempt',
            required_effect: 'Expose one manageable, task-native difficulty that makes progress require a concrete adjustment.',
            content_class: 'obstacle', scope: 'personal', intensity: 'low', quantity: 'singular', relative_power: 'inferior',
            plot_weight: 'incidental', duration: 'beat', resolution_ceiling: 'local',
            preserve: ['the solitary work scene', 'the user controls how to respond'],
            forbid: ['unrelated attackers', 'a forced player decision'], basis: 'The assignment supports a small practical obstacle, not a new plot.',
        },
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
    assert.deepEqual(extractJson('```json\n{"contract_version":3}\n```'), { contract_version: 3 });
    assert.deepEqual(extractJson('prefix {"ok":true} suffix'), { ok: true });
    assert.deepEqual(extractJson('{"current":{"activity":"reading"\n"phase":"developing"},}'), { current: { activity: 'reading', phase: 'developing' } });
});

test('structured output contract is the compact current-beat v3 shape', () => {
    assert.equal(ANALYSIS_SCHEMA_VALUE.properties.contract_version.const, 3);
    assert.deepEqual(ANALYSIS_SCHEMA_VALUE.required, ['contract_version', 'current', 'beat', 'world', 'thread_updates', 'actor_updates', 'canon_updates', 'ledger', 'note_resolution', 'audit']);
    assert.equal(ANALYSIS_SCHEMA.strict, true);
    assert.match(ANALYSIS_OUTPUT_CONTRACT, /No other keys/);
    assert.doesNotMatch(JSON.stringify(ANALYSIS_SCHEMA_VALUE), /routes|guides|horizons|milestones|future_setup/i);
});

test('valid current-beat result passes validation', () => {
    assert.deepEqual(validateAnalysisResult(result()), { valid: true, errors: [] });
});

test('validation rejects missing semantic effect and invalid scale values', () => {
    const missing = result({ beat: { ...result().beat, required_effect: '' } });
    assert.equal(validateAnalysisResult(missing).valid, false);
    const invalid = result({ beat: { ...result().beat, operation: 'summon-dragon', scope: 'scene' } });
    const check = validateAnalysisResult(invalid);
    assert.equal(check.valid, false);
    assert.ok(check.errors.includes('beat.operation is invalid'));
    assert.ok(check.errors.includes('beat.scope is invalid'));
});

test('every supported operation and simulation scope validates', () => {
    for (const operation of ['retain', 'deepen', 'introduce', 'complicate', 'escalate', 'deescalate', 'resolve', 'transition', 'withdraw', 'stalemate', 'disrupt', 'other']) {
        assert.equal(validateAnalysisResult(result({ beat: { ...result().beat, operation } })).valid, true, operation);
    }
    for (const scope of ['personal', 'social', 'institutional', 'societal', 'world']) {
        assert.equal(validateAnalysisResult(result({ beat: { ...result().beat, scope } })).valid, true, scope);
    }
});

test('planner system calibrates bold direction to context while protecting player agency', () => {
    assert.match(SYSTEM, /Do not confuse context awareness with timidity/i);
    assert.match(SYSTEM, /quiet academic, domestic, professional, or social scene/i);
    assert.match(SYSTEM, /dangerous or fantastical scene can support severe or fatal stakes/i);
    assert.match(SYSTEM, /Scene changes, pressure shifts, reversals, discoveries/i);
    assert.match(SYSTEM, /OTHER when none fits/i);
    assert.match(SYSTEM, /Never invent player dialogue, thoughts, feelings, consent, decisions/i);
});

test('planner permits freeform AI invention and scale-native simulation', () => {
    assert.match(SYSTEM, /not an event taxonomy/i);
    assert.match(SYSTEM, /entirely new causal element/i);
    assert.match(SYSTEM, /life simulation/i);
    assert.match(SYSTEM, /countries, societies, and worlds/i);
    assert.match(SYSTEM, /policy effect, public response, trend, or system pressure/i);
    assert.doesNotMatch(SYSTEM, /generate six to eight.*routes|schedule future milestones|maintain event queues/i);
    assert.ok(estimateTokenCount(`${SYSTEM}\n${ANALYSIS_OUTPUT_CONTRACT}`) < 1800);
});

test('all modes alter sampled appetite without weakening authority', () => {
    assert.match(MODE_INSTRUCTIONS.light, /subtle or grounded movement/i);
    assert.match(MODE_INSTRUCTIONS.balanced, /meaningful movement dominate/i);
    assert.match(MODE_INSTRUCTIONS.fun, /story-altering developments are welcome/i);
    for (const mode of Object.values(MODE_INSTRUCTIONS)) assert.doesNotMatch(mode, /control the player|force the player/i);
});

test('analysis prompt carries current context, identity, variation, bootstrap, and summaries', () => {
    const prompt = JSON.parse(buildAnalysisPrompt(messages, { ...defaultState(), mode: 'fun' }, '', { scenario: 'A grounded school life simulation.' }, {
        variationNonce: 731, summarySources: [{ label: 'Continuity Memory', kind: 'summary', text: 'The assignment is due tomorrow.' }],
    }));
    assert.equal(prompt.task, 'direct_current_beat');
    assert.equal(prompt.player_character, 'Ari');
    assert.equal(prompt.variation_nonce, 731);
    assert.equal(prompt.bootstrap.scenario, 'A grounded school life simulation.');
    assert.equal(prompt.summary_sources[0].label, 'Continuity Memory');
    assert.match(prompt.invention, /Any context-compatible narrative development/i);
    assert.match(prompt.simulation, /country simulation/i);
    assert.match(prompt.direction_policy, /choose one coherent authorial direction/i);
    assert.match(prompt.direction_policy, /transition the scene/i);
    assert.match(prompt.director_sample, /WEIGHTED DIRECTOR SAMPLE/);
    assert.match(prompt.director_sample, /creative appetite, not a menu/i);
    assert.equal(Object.hasOwn(prompt, 'pacing'), false);
});

test('analysis prompt treats OOC and scenario authority as binding, not future suggestions', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([
        ...messages,
        { is_user: true, name: 'Ari', mes: 'OOC: I kill the dragon here. Do not advance beyond the immediate aftermath.' },
    ], defaultState()));
    assert.match(prompt.authority, /outcome commands bind the stated outcome/i);
    assert.match(prompt.authority, /advance-time commands widen scope only as stated/i);
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

test('applying analysis saves the beat and clears retired future machinery', () => {
    const prior = { ...defaultState(), objectives: [{ title: 'Future' }], possibilities: [{ description: 'Future' }], pathways: [{ id: 'route' }], nextGuides: [{ id: 'guide' }], narrativeEvents: [{ id: 'event' }] };
    const next = applyAnalysis(prior, result(), messages);
    assert.equal(next.sceneProfile.promise, result().current.scene_promise);
    assert.equal(next.beatDirective.operation, 'complicate');
    assert.equal(next.beatDirective.contentClass, 'obstacle');
    assert.equal(next.lastInject, true);
    assert.deepEqual(next.objectives, []);
    assert.deepEqual(next.possibilities, []);
    assert.deepEqual(next.pathways, []);
    assert.deepEqual(next.nextGuides, []);
    assert.deepEqual(next.narrativeEvents, []);
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
