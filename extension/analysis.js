import { fingerprintMessages, normalizeState, stateForPrompt } from './state.js?v=0.14.15';
import { leadingGeneratedStatusSummary, sceneStatus } from './transcript-status.js?v=0.14.5';
import { plotExcerpt } from './generation-context.js?v=0.14.5';
import { estimateTokenCount, truncateToTokenBudget } from './token-budget.js?v=0.11.96';
import { compactSummarySources } from './summary-context.js?v=0.14.15';
import { relevantExcerpt } from './evidence-selection.js?v=0.13.9';
import { formatDriftRequest, mergeOffscreenWorld, OFFSCREEN_KINDS } from './offscreen-world.js?v=0.13.9';
import { CAUSAL_KINDS, normalizeCausalContext } from './causal-context.js?v=0.14.15';
import { mergeSituationUpdates, retireManifestedSituations } from './situations.js?v=0.13.9';
import { PLANNER_AGENCY_RULE, ACTOR_AGENCY_RULE, AGENCY_AUDIT_RULE } from './game-master.js?v=0.14.15';
import { jsonrepair } from './vendor/jsonrepair/regular/jsonrepair.js?v=3.15.0';
import { preparedWorldForPrompt, compactPreparedForPrompt, PREPARED_SCHEMA, PREPARED_RULE, validatePrepared, mergePreparedWorld } from './prepared-world.js?v=0.14.15';
import { normalizeWorldPlan, preparedRecordForPlanner, validateWorldPlan, mergeWorldPlan } from './world-planner.js?v=0.14.15';
export { WORLD_PLANNER_SCHEMA, WORLD_PLANNER_SYSTEM } from './world-planner.js?v=0.14.15';

export const DEFAULT_PROMPT_TOKEN_BUDGET = 16000;

export class AnalysisValidationError extends Error {
    constructor(message, validationErrors = []) {
        super(message);
        this.name = 'AnalysisValidationError';
        this.validationErrors = Array.isArray(validationErrors) ? validationErrors : [];
    }
}

const asString = (value, fallback = '') => typeof value === 'string' ? value : fallback;
const asArray = value => Array.isArray(value) ? value : [];
const EMPTY_PLANNING_LANGUAGE = /(?:^\s*(?:unknown|uncertain|unresolved|tbd|to be determined)\s*[.!]?\s*$|planner classification was incomplete|overall story identity remains unresolved|current local activity established by the conversation|active social and practical situation surrounding the local activity|established wider world and its ongoing processes|broad open-ended trajectory remains provisional|use the established setting identity rather than generic genre decoration)/iu;
const META_DIRECTIVE_PATTERN = /(?:^|[\r\n])\s*(?:[\[(<{]\s*)?(?:ooc|out[ -]?of[ -]?character|meta|canon|author|gm|narrator)(?:\s*(?:note))?\s*(?:[:\-\])}>]|$)\s*([\s\S]*)/iu;
const HORIZON_ROUTE_STOPWORDS = new Set([
    'about', 'across', 'after', 'allow', 'allows', 'another', 'before', 'continue', 'continues', 'current', 'develop', 'develops',
    'development', 'direction', 'during', 'eventual', 'future', 'into', 'keep', 'keeps', 'later', 'let', 'lets', 'move', 'moves',
    'next', 'only', 'open', 'path', 'possible', 'possibility', 'preserve', 'preserves', 'route', 'several', 'through', 'toward',
    'while', 'without', 'with', 'from', 'that', 'this', 'the', 'and', 'for', 'its', 'one',
]);

const text = maxLength => ({ type: 'string', maxLength });
const strings = (maxItems, maxLength) => ({ type: 'array', maxItems, items: text(maxLength) });
const ACTOR_DESCRIPTION_FIELDS = ['state', 'location', 'perspective', 'motivation', 'knowledge', 'constraints', 'agenda', 'window'];
const ACTOR_UPDATE_RULES = 'Actor updates are partial factual changes, not complete biographies. Each actor update needs op (upsert or retire) and name. Use strings for state, location, perspective, motivation, knowledge, constraints, agenda, and window; use "" for unknown or unchanged fields, including motivation and agenda. Blank fields preserve saved facts; never invent motives, knowledge, or plans to fill them. Retire needs only identity; leave descriptive fields blank. Empty actor_updates means no actor changes. For every enum in the schema, copy one allowed label exactly; never substitute a synonym or descriptive phrase. In full reviews, current.activity_role is incidental, routine, developmental, central, or transition; current.temporal_scope is moment, action, activity, scene, or extended.';

// Missing descriptions mean no new evidence. Normalize only lossless text
// representations, never identities, operations, objects, or causal claims.
export function normalizeAnalysisActorUpdates(result) {
    if (![8, 9, 10, 11, 12, 13].includes(result?.contract_version) || !Array.isArray(result?.actor_updates)) return result;
    return { ...result, actor_updates: result.actor_updates.map(actor => {
        if (!actor || typeof actor !== 'object' || Array.isArray(actor)) return actor;
        const normalized = { ...actor };
        for (const key of ACTOR_DESCRIPTION_FIELDS) {
            const value = actor[key];
            if (value == null) normalized[key] = '';
            else if (Array.isArray(value) && value.every(item => typeof item === 'string')) normalized[key] = value.join('\n');
        }
        if (actor.clear_fields === undefined) normalized.clear_fields = [];
        return normalized;
    }) };
}

function validateActorUpdates(actors, errors) {
    if (!Array.isArray(actors)) { errors.push('actor_updates must be an array'); return; }
    for (const [index, actor] of actors.entries()) {
        if (!actor || typeof actor !== 'object' || Array.isArray(actor)) {
            errors.push(`actor_updates[${index}] must be an object`);
            continue;
        }
        for (const key of ['op', 'name', ...ACTOR_DESCRIPTION_FIELDS]) {
            if (typeof actor[key] !== 'string') errors.push(`actor_updates[${index}].${key} must be a string`);
        }
        if (!['upsert', 'retire'].includes(actor.op)) errors.push(`actor_updates[${index}].op is invalid`);
        if (typeof actor.name !== 'string' || !actor.name.trim()) errors.push(`actor_updates[${index}].name must be non-empty`);
        if (actor.clear_fields !== undefined && (!Array.isArray(actor.clear_fields)
            || actor.clear_fields.length > ACTOR_DESCRIPTION_FIELDS.length
            || actor.clear_fields.some(key => !ACTOR_DESCRIPTION_FIELDS.includes(key)))) errors.push(`actor_updates[${index}].clear_fields must name only actor description fields`);
    }
}
const ROUTE_LANES = ['immediate', 'character', 'relationship-institution', 'lore-world', 'original', 'long-range', 'extra'];
const REQUIRED_ROUTE_LANES = ROUTE_LANES.slice(0, 6);
const ROUTE_SCALES = ['scene', 'days', 'arc', 'months-years', 'open-ended'];
const ROUTE_RELATIONS = ['direct', 'independent', 'emergent'];
const PORTFOLIO_LANES = Object.freeze({ immediate: 'immediate', character: 'character', relationship_institution: 'relationship-institution', lore_world: 'lore-world', original: 'original', long_range: 'long-range' });
const AUTHOR_ARC_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: text(80), title: text(120), phase: text(60), purpose: text(260), pressure: text(220) }, required: ['id', 'title', 'phase', 'purpose', 'pressure'] };
const AUTHOR_SETUP_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: text(80), kind: { type: 'string', enum: ['setup', 'promise', 'payoff'] }, description: text(260), status: { type: 'string', enum: ['open', 'ready', 'resolved', 'retired'] }, payoff: text(240), conditions: strings(4, 140) }, required: ['id', 'kind', 'description', 'status', 'payoff', 'conditions'] };
const AUTHOR_MILESTONE_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: text(80), development: text(280), horizon: text(80), conditions: strings(4, 140), status: { type: 'string', enum: ['queued', 'available', 'active', 'resolved', 'retired'] } }, required: ['id', 'development', 'horizon', 'conditions', 'status'] };
const CAUSAL_CONDITION_SCHEMA = { type: 'object', additionalProperties: false, properties: {
    id: text(80),
    kind: { type: 'string', enum: [...CAUSAL_KINDS] },
    subject: text(120), condition: text(280),
    disclosure: { type: 'string', enum: ['open', 'limited', 'private'] },
    confidence: { type: 'string', enum: ['established', 'strong', 'tentative'] },
    relevance: text(180), known_by: strings(24, 80), learned_from: text(180),
}, required: ['id', 'kind', 'subject', 'condition', 'disclosure', 'confidence', 'relevance', 'known_by', 'learned_from'] };
const SITUATION_SCHEMA = { type: 'object', additionalProperties: false, properties: {
    op: { type: 'string', enum: ['upsert', 'retire'] }, id: text(80),
    type: { type: 'string', enum: ['challenge', 'opportunity', 'discovery', 'encounter', 'quest-hook'] },
    premise: text(260), cause: text(220), entry: text(220),
    scope: { type: 'string', enum: ['scene', 'days', 'arc'] },
    persistence: { type: 'string', enum: ['transient', 'local', 'ongoing'] },
    status: { type: 'string', enum: ['available', 'engaged', 'retired'] },
    origin: { type: 'string', enum: ['established', 'inferred', 'original'] },
}, required: ['op', 'id', 'type', 'premise', 'cause', 'entry', 'scope', 'persistence', 'status', 'origin'] };
const SITUATION_SCHEMA_COMPACT = { type: 'object', additionalProperties: false, properties: {
    op: { type: 'string', enum: ['upsert', 'retire'] }, id: { type: 'string' },
    type: { type: 'string', enum: ['challenge', 'opportunity', 'discovery', 'encounter', 'quest-hook'] },
    premise: { type: 'string' }, cause: { type: 'string' }, entry: { type: 'string' },
    scope: { type: 'string', enum: ['scene', 'days', 'arc'] }, persistence: { type: 'string', enum: ['transient', 'local', 'ongoing'] },
    status: { type: 'string', enum: ['available', 'engaged', 'retired'] }, origin: { type: 'string', enum: ['established', 'inferred', 'original'] },
}, required: ['op', 'id', 'type', 'premise', 'cause', 'entry', 'scope', 'persistence', 'status', 'origin'] };
const SITUATION_SCHEMA_WIRE = { type: 'object' };
const RESPONSE_AUDIT_SCHEMA = { type: 'object', additionalProperties: false, properties: {
    applicable: { type: 'boolean' },
    movement_fit: { type: 'string', enum: ['not-applicable', 'missed', 'partial', 'clear'] },
    repetition: { type: 'string', enum: ['none', 'possible', 'clear'] },
    unjustified_escalation: { type: 'boolean' },
    player_control: { type: 'boolean', description: 'Failure flag: true only when the assistant overrode the player by inventing their choices, speech, consent, feelings or contested outcomes; false when player agency was preserved.' },
    continuity_drift: { type: 'boolean' },
    patterns: strings(5, 140), summary: text(400), state_change: text(240),
}, required: ['applicable', 'movement_fit', 'repetition', 'unjustified_escalation', 'player_control', 'continuity_drift', 'patterns', 'summary', 'state_change'] };

// These are private diagnostic prose limits, not factual validity gates. Some
// providers do not enforce schema maxLength. Bound strings before validation so
// a verbose audit cannot discard an otherwise usable world rebuild. Never fill
// missing fields, coerce types, drop array items, or repair factual/causal data.
export function normalizeAnalysisDiagnostics(result) {
    if (result?.contract_version === 14) return normalizeWorldPlan(result);
    const audit = result?.response_audit;
    if (!audit || typeof audit !== 'object' || Array.isArray(audit)) return result;
    const bounded = (value, limit) => {
        if (typeof value !== 'string' || value.length <= limit) return value;
        // Avoid splitting a UTF-16 surrogate pair at the display boundary.
        let prefix = value.slice(0, limit - 1);
        if (/[\uD800-\uDBFF]$/u.test(prefix)) prefix = prefix.slice(0, -1);
        return `${prefix.trimEnd()}…`;
    };
    const properties = RESPONSE_AUDIT_SCHEMA.properties;
    const normalized = { ...audit };
    for (const key of ['summary', 'state_change']) {
        if (Object.hasOwn(audit, key)) normalized[key] = bounded(audit[key], properties[key].maxLength);
    }
    if (Array.isArray(audit.patterns)) {
        normalized.patterns = audit.patterns.map(item => bounded(item, properties.patterns.items.maxLength));
    }
    return { ...result, response_audit: normalized };
}
const HORIZON_SEED_SCHEMA = { type: 'object', additionalProperties: false, properties: {
    id: text(80), kind: { type: 'string', enum: ['detected', 'original'] }, trajectory: text(260), engine: text(140),
    scale: { type: 'string', enum: ['arc', 'months-years', 'open-ended'] }, condition: text(160), basis: text(220),
    present_relation: { type: 'string', enum: ['none', 'echo', 'seed', 'advance', 'converge'] },
    change: { type: 'string', enum: ['keep', 'adjust', 'replace', 'retire'] },
}, required: ['id', 'kind', 'trajectory', 'engine', 'scale', 'condition', 'basis', 'present_relation', 'change'] };
const HIDDEN_MOTIVE_SCHEMA = { type: 'object', additionalProperties: false, properties: {
    id: text(80), actor: text(120), explanation: text(300),
    likelihood: { type: 'string', enum: ['established', 'most-likely', 'likely', 'possible', 'wild-card', 'contradicted'] },
    evidence: strings(4, 180), counterevidence: strings(3, 180), mechanism: text(220),
    current_relevance: { type: 'string', enum: ['none', 'background', 'supports-beat', 'drives-beat'] },
    disclosure: { type: 'string', enum: ['hidden', 'signaled', 'revealed'] },
    change: { type: 'string', enum: ['keep', 'adjust', 'replace', 'retire'] },
}, required: ['id', 'actor', 'explanation', 'likelihood', 'evidence', 'counterevidence', 'mechanism', 'current_relevance', 'disclosure', 'change'] };

// The model returns observations plus deltas, not a duplicate of Tale Fairy's
// entire persistent state. applyAnalysis expands this compact wire contract into
// the rich internal state used by the UI and prompt injector.
// Tracked subjects carry the turn we last looked at them. Nothing runs in the
// background; the growing gap is a debt paid only when the subject matters again.
const OFFSCREEN_SUBJECT_SCHEMA = { type: 'object', additionalProperties: false, properties: {
    id: text(80),
    kind: { type: 'string', enum: [...OFFSCREEN_KINDS] },
    subject: text(120),
    reach: { type: 'string', enum: ['present', 'near', 'distant', 'remote'] },
    motion: { type: 'string', enum: ['static', 'drifting', 'building', 'accelerating', 'resolving'] },
    trajectory: text(240), settled: text(400),
    confidence: { type: 'string', enum: ['established', 'strong', 'tentative'] },
    last_seen_turn: { type: 'integer', minimum: 0 },
    owed: text(240), carried_by: text(160),
}, required: ['id', 'kind', 'subject', 'reach', 'motion', 'trajectory', 'settled', 'confidence', 'last_seen_turn', 'owed', 'carried_by'] };
const OFFSCREEN_SCHEMA = { type: 'object', additionalProperties: false, properties: {
    subjects: { type: 'array', maxItems: 12, items: OFFSCREEN_SUBJECT_SCHEMA },
    elapsed: text(120), settled_through: { type: 'integer', minimum: 0 }, audit: text(300),
}, required: ['subjects', 'elapsed', 'settled_through', 'audit'] };

export const ANALYSIS_SCHEMA_VALUE = {
    type: 'object', additionalProperties: false,
    properties: {
        contract_version: { type: 'integer', const: 12 },
        current: { type: 'object', additionalProperties: false, properties: {
            frame: { type: 'string', enum: ['grounded', 'heightened', 'surreal'] }, frame_basis: text(180),
            status: text(180), immediate_action: text(140), activity: text(180), situation: text(220),
            activity_role: { type: 'string', enum: ['incidental', 'routine', 'developmental', 'central', 'transition'] },
            temporal_scope: { type: 'string', enum: ['moment', 'action', 'activity', 'scene', 'extended'] },
            location: text(140), time: text(100), loop: { type: 'boolean' },
            scene_promise: text(220), phase: { type: 'string', enum: ['establishing', 'developing', 'turning', 'landing', 'aftermath', 'transition'] },
            emotional_direction: { type: 'string', enum: ['preserve', 'brighten', 'darken', 'release', 'intensify'] },
            pressure: { type: 'string', enum: ['none', 'latent', 'active', 'high', 'saturated'] },
            intrusion: { type: 'string', enum: ['closed', 'incidental', 'socially-open', 'dramatically-open', 'primed'] },
            novelty_ceiling: { type: 'string', enum: ['none', 'incidental', 'context-native', 'meaningful', 'major'] },
        }, required: ['frame', 'frame_basis', 'status', 'immediate_action', 'activity', 'situation', 'activity_role', 'temporal_scope', 'location', 'time', 'loop', 'scene_promise', 'phase', 'emotional_direction', 'pressure', 'intrusion', 'novelty_ceiling'] },
        context: { type: 'object', additionalProperties: false, properties: {
            conditions: { type: 'array', minItems: 1, maxItems: 6, items: CAUSAL_CONDITION_SCHEMA },
            inject: { type: 'boolean', const: true }, inject_reason: text(220), basis: text(240),
        }, required: ['conditions', 'inject', 'inject_reason', 'basis'] },
        situations: { type: 'array', maxItems: 6, items: SITUATION_SCHEMA_COMPACT },
        offscreen: OFFSCREEN_SCHEMA,
        prepared: PREPARED_SCHEMA,
        response_audit: RESPONSE_AUDIT_SCHEMA,
        horizon: { type: 'object', additionalProperties: false, properties: {
            status: { type: 'string', enum: ['none', 'latent', 'developing', 'converging'] },
            seeds: { type: 'array', maxItems: 4, items: HORIZON_SEED_SCHEMA }, audit: text(360),
        }, required: ['status', 'seeds', 'audit'] },
        hidden_motives: { type: 'object', additionalProperties: false, properties: {
            status: { type: 'string', enum: ['none', 'open', 'focused'] },
            items: { type: 'array', maxItems: 6, items: HIDDEN_MOTIVE_SCHEMA },
            audit: text(360),
        }, required: ['status', 'items', 'audit'] },
        world: { type: 'object', additionalProperties: false, properties: {
            identity: text(140), baseline: text(300), variant_rules: strings(4, 220), rp_changes: strings(5, 240),
            signatures: strings(6, 220), forces: strings(4, 180), confidence: { type: 'string', enum: ['low', 'moderate', 'high'] },
        }, required: ['identity', 'baseline', 'variant_rules', 'rp_changes', 'signatures', 'forces', 'confidence'] },
        thread_updates: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, properties: { op: { type: 'string', enum: ['upsert', 'retire'] }, id: text(100), thread: text(180), state: text(240), status: { type: 'string', enum: ['active', 'dormant', 'due', 'blocked'] }, basis: text(160), cmRecordId: text(160), cmRevision: { type: 'integer', minimum: 0 }, canonicalStatus: text(40), directorialReadiness: text(40) }, required: ['op', 'id', 'thread', 'state', 'status', 'basis'] } },
        actor_updates: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, properties: { op: { type: 'string', enum: ['upsert', 'retire'] }, name: text(100), state: text(220), location: text(140), perspective: text(180), motivation: text(180), knowledge: text(180), constraints: text(160), agenda: text(180), window: text(100), clear_fields: { type: 'array', maxItems: 8, items: { type: 'string', enum: ACTOR_DESCRIPTION_FIELDS } } }, required: ['op', 'name', 'state', 'location', 'perspective', 'motivation', 'knowledge', 'constraints', 'agenda', 'window'] } },
        canon_updates: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, properties: { op: { type: 'string', enum: ['add', 'remove'] }, fact: text(500) }, required: ['op', 'fact'] } },
        ledger: text(1800),
        note_resolution: { anyOf: [{ type: 'object', additionalProperties: false, properties: { kind: { type: 'string', enum: ['suggest', 'correct', 'establish', 'forbid'] } }, required: ['kind'] }, { type: 'null' }] },
        audit: text(500),
    },
    required: ['prepared', 'contract_version', 'current', 'context', 'offscreen', 'response_audit', 'horizon', 'hidden_motives', 'world', 'thread_updates', 'actor_updates', 'canon_updates', 'ledger', 'note_resolution', 'audit'],
};
export const ANALYSIS_SCHEMA = Object.freeze({
    name: 'tale_fairy_causal_context_v12',
    description: 'Compact Tale Fairy observations and state deltas.',
    strict: true,
    returnInvalid: true,
    value: ANALYSIS_SCHEMA_VALUE,
});

export const INCREMENTAL_ANALYSIS_SCHEMA_VALUE = {
    type: 'object', additionalProperties: false,
    properties: {
        contract_version: { type: 'integer', const: 13 },
        audit: text(800),
        current: { type: 'object', additionalProperties: false, properties: {
            frame: { type: 'string', enum: ['grounded', 'heightened', 'surreal'] }, frame_basis: text(160),
            status: text(180), immediate_action: text(140), activity: text(180), situation: text(220),
            location: text(140), time: text(100), loop: { type: 'boolean' }, scene_promise: text(200),
            phase: { type: 'string', enum: ['establishing', 'developing', 'turning', 'landing', 'aftermath', 'transition'] },
            emotional_direction: { type: 'string', enum: ['preserve', 'brighten', 'darken', 'release', 'intensify'] },
            pressure: { type: 'string', enum: ['none', 'latent', 'active', 'high', 'saturated'] },
            intrusion: { type: 'string', enum: ['closed', 'incidental', 'socially-open', 'dramatically-open', 'primed'] },
            novelty_ceiling: { type: 'string', enum: ['none', 'incidental', 'context-native', 'meaningful', 'major'] },
        }, required: ['frame', 'frame_basis', 'status', 'immediate_action', 'activity', 'situation', 'location', 'time', 'loop', 'scene_promise', 'phase', 'emotional_direction', 'pressure', 'intrusion', 'novelty_ceiling'] },
        context: { type: 'object', additionalProperties: false, properties: {
            conditions: { type: 'array', minItems: 1, maxItems: 6, items: CAUSAL_CONDITION_SCHEMA },
            inject: { type: 'boolean', const: true }, inject_reason: text(200), basis: text(220),
        }, required: ['conditions', 'inject', 'inject_reason', 'basis'] },
        situations: { type: 'array', maxItems: 6, items: SITUATION_SCHEMA_WIRE },
        offscreen: OFFSCREEN_SCHEMA,
        prepared: { ...PREPARED_SCHEMA, properties: {
            ...PREPARED_SCHEMA.properties, overview: text(320),
            updates: { ...PREPARED_SCHEMA.properties.updates, items: {
                ...PREPARED_SCHEMA.properties.updates.items,
                properties: Object.fromEntries(Object.entries(PREPARED_SCHEMA.properties.updates.items.properties)
                    .map(([key, field]) => [key, field.maxLength && key !== 'id' ? { ...field, maxLength: Math.min(field.maxLength, key === 'middle' ? 260 : 180) } : field])),
            } },
        } },
        thread_updates: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, properties: {
            op: { type: 'string', enum: ['upsert', 'retire'] }, id: text(100), thread: text(180), state: text(220),
            status: { type: 'string', enum: ['active', 'dormant', 'due', 'blocked'] }, basis: text(150),
        }, required: ['op', 'id', 'thread', 'state', 'status', 'basis'] } },
        hidden_motives: { type: 'object', additionalProperties: false, properties: {
            status: { type: 'string', enum: ['none', 'open', 'focused'] },
            items: { type: 'array', maxItems: 6, items: HIDDEN_MOTIVE_SCHEMA },
            audit: text(300),
        }, required: ['status', 'items', 'audit'] },
        actor_updates: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, properties: {
            op: { type: 'string', enum: ['upsert', 'retire'] }, name: text(100), state: text(180), location: text(120),
            clear_fields: { type: 'array', maxItems: 8, items: { type: 'string', enum: ACTOR_DESCRIPTION_FIELDS } },
            perspective: text(150), motivation: text(160), knowledge: text(150), constraints: text(140), agenda: text(160), window: text(90),
        }, required: ['op', 'name', 'state', 'location', 'perspective', 'motivation', 'knowledge', 'constraints', 'agenda', 'window'] } },
        response_audit: RESPONSE_AUDIT_SCHEMA,
        ledger: text(1200),
        note_resolution: { anyOf: [{ type: 'object', additionalProperties: false, properties: { kind: { type: 'string', enum: ['suggest', 'correct', 'establish', 'forbid'] } }, required: ['kind'] }, { type: 'null' }] },
    },
    required: ['prepared', 'contract_version', 'current', 'context', 'response_audit', 'thread_updates', 'hidden_motives', 'actor_updates', 'ledger', 'note_resolution', 'audit'],
};
export const INCREMENTAL_ANALYSIS_SCHEMA = Object.freeze({
    name: 'tale_fairy_causal_context_v13_incremental',
    description: 'Compact complete Tale Fairy scene, motive, actor, causal-context, and continuity pass.',
    strict: true,
    returnInvalid: true,
    value: INCREMENTAL_ANALYSIS_SCHEMA_VALUE,
});

export const MODE_INSTRUCTIONS = Object.freeze({
    light: 'LIGHT — Select only the few strongest conditions that can support subtle self-propelling change within the present activity. Favor quiet motives, relationships, and ordinary constraints.',
    balanced: 'BALANCED — Select a compact mix of actors and wider-world causes that gives the writing model useful leverage for self-propelling scene movement.',
    fun: 'FUN — Include a bolder strongly supported pressure or capability when relevant, giving the writing model lively self-propelling movement while keeping proposals clearly separate from established facts.',
});

export const DIRECTOR_POLICY = 'Prepare a creative, world-aware middle and future alongside a concise factual scene read. Concrete conditional NPC/world developments belong in prepared; context.conditions describes present causes only, never planned actions disguised as facts. The writing model chooses realization, rhythm and prose while preserving player agency. Explicit user/OOC constraints and manifested consequences outrank proposals. Broad preparation may remain dormant through many long scenes.';

export const EXTREME_CANON_INSTRUCTION = 'Explicit user/OOC canon remains authoritative even when extreme or unprecedented. Preserve its magnitude and apply relevant strengths and limits causally; averages are not ceilings. Unspecified compatible details remain creative space.';


function extractJson(raw) {
    const source = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    const candidates = [source];
    if (start >= 0 && end > start && (start !== 0 || end !== source.length - 1)) candidates.push(source.slice(start, end + 1));
    let parseError = null;
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch (error) {
            parseError ||= error;
        }
    }
    // A cutoff in optional notes must not discard already complete guidance.
    // Track exact top-level boundaries; never repair an unfinished field into
    // a fact or invent the missing end of a proposed development.
    if (start >= 0) {
        let depth = 0;
        let quoted = false;
        let escaped = false;
        let complete = false;
        const boundaries = [];
        for (let index = start; index < source.length; index++) {
            const char = source[index];
            if (quoted) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') {
                    quoted = false;
                    if (depth === 1) boundaries.push(index + 1);
                }
                continue;
            }
            if (char === '"') quoted = true;
            else if (char === '{' || char === '[') depth++;
            else if (char === '}' || char === ']') {
                depth--;
                if (depth === 0) { complete = true; break; }
                if (depth === 1) boundaries.push(index + 1);
            } else if (char === ',' && depth === 1) boundaries.push(index);
        }
        if (!complete) {
            for (const boundary of boundaries.reverse()) {
                let finished;
                try { finished = JSON.parse(`${source.slice(start, boundary)}}`); }
                catch { continue; }
                // Routine updates merge into retained state. Missing ancillary
                // deltas are no-ops, not empty replacements for saved facts.
                // A rebuild cannot use this path to claim it rebuilt the world.
                if (finished.contract_version === 14 && finished.prepared
                    && typeof finished.prepared.approach === 'string' && Array.isArray(finished.prepared.updates)) {
                    return { ...finished, _taleFairyRecovery: { omitted: ['unfinished trailing fields'] } };
                }
                if (finished.contract_version !== 13 || !finished.prepared || !finished.current || !finished.context) break;
                const optional = {
                    situations: [],
                    offscreen: { subjects: [], elapsed: '', settled_through: 0, audit: '' },
                    response_audit: { applicable: false, movement_fit: 'not-applicable', repetition: 'none',
                        unjustified_escalation: false, player_control: false, continuity_drift: false,
                        patterns: [], summary: '', state_change: '' },
                    thread_updates: [], hidden_motives: { status: 'none', items: [], audit: '' },
                    actor_updates: [], ledger: '', note_resolution: null,
                };
                const omitted = Object.keys(optional).filter(key => !Object.hasOwn(finished, key));
                return { ...optional, ...finished,
                    audit: 'Recovered complete guidance from a cut-off response; unfinished notes were omitted and prior records retained.',
                    _taleFairyRecovery: { omitted },
                };
            }
            throw new AnalysisValidationError('The planner response was cut off before usable guidance was complete. It may have reached the output limit or the connection may have ended early.');
        }
    }
    // Prompt-only providers occasionally return a complete object with one
    // missing comma, a dangling comma, or an unescaped quote. Repair syntax
    // locally so a multi-minute planner run is not thrown away or repeated.
    // The strict Tale Fairy contract is still validated after this parse.
    for (const candidate of candidates) {
        try {
            return JSON.parse(jsonrepair(candidate));
        } catch {
            // Try every plausible object envelope before surfacing the
            // original parse error, which points at the provider's output.
        }
    }
    if (parseError) throw parseError;
    throw new Error('Analysis model did not return JSON.');
}

function startsSentence(value, index) {
    const before = String(value || '').slice(0, index).trimEnd();
    return !before || /(?:[.!?;:]|[\r\n]|[([{<]|[-–—])$/u.test(before);
}

function capitalizedWords(value) {
    return typeof value === 'string'
        ? [...value.matchAll(/\b[\p{Lu}][\p{L}'’-]*\b/gu)]
        : [];
}

function words(value) {
    return typeof value === 'string'
        ? [...value.matchAll(/\b[\p{L}][\p{L}'’-]*\b/gu)]
        : [];
}

function normalizedPhrase(value) {
    return words(String(value || ''))
        .map(match => match[0].toLocaleLowerCase())
        .join(' ');
}

function canonSpecificTerms(result) {
    const terms = new Set();
    const addActorName = value => {
        const name = normalizedPhrase(value);
        if (!name) return;
        terms.add(name);
        const parts = name.split(' ');
        // Titles are often ordinary role nouns. The final component is the
        // distinguishing name and must remain private even if lowercased.
        terms.add(parts.at(-1));
    };
    const addNamedPlace = value => {
        const source = String(value || '');
        const phrases = source.match(/\b[\p{Lu}][\p{L}'’-]*(?:\s+[\p{Lu}][\p{L}'’-]*)*\b/gu) || [];
        for (const phrase of phrases) {
            if (/^(?:a|an|the)$/iu.test(phrase)) continue;
            terms.add(normalizedPhrase(phrase));
        }
    };
    const addEmbeddedNames = value => {
        if (typeof value === 'string') {
            for (const match of capitalizedWords(value)) {
                if (!startsSentence(value, match.index)) terms.add(normalizedPhrase(match[0]));
            }
            return;
        }
        if (Array.isArray(value)) {
            for (const item of value) addEmbeddedNames(item);
            return;
        }
        if (!value || typeof value !== 'object') return;
        for (const item of Object.values(value)) addEmbeddedNames(item);
    };

    for (const actor of asArray(result?.actor_updates)) addActorName(actor?.name);
    addNamedPlace(result?.current?.location);
    addNamedPlace(result?.world?.identity);
    addEmbeddedNames(result?.current);
    addEmbeddedNames(result?.world);
    addEmbeddedNames(result?.thread_updates);
    addEmbeddedNames(result?.actor_updates);
    addEmbeddedNames(result?.canon_updates);
    addEmbeddedNames(result?.hidden_motives);
    addEmbeddedNames(result?.beat?.target);
    addEmbeddedNames(result?.beat?.inject_reason);
    addEmbeddedNames(result?.beat?.preserve);
    addEmbeddedNames(result?.beat?.forbid);
    addEmbeddedNames(result?.beat?.basis);
    addEmbeddedNames(result?.ledger);
    for (const term of [...terms]) {
        const owner = term.replace(/(?:'s|’s)$/iu, '');
        if (owner !== term && owner) terms.add(owner);
    }
    return terms;
}

function escapedPattern(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function replacePrivateTerm(value, term, replacement) {
    if (typeof value !== 'string' || !term) return value;
    const pieces = words(term).map(match => escapedPattern(match[0]));
    if (!pieces.length) return value;
    const pattern = pieces.join('[\\s\\p{Pd}]+');
    return value.replace(new RegExp(`(?<!\\p{L})${pattern}(?!\\p{L})`, 'giu'), replacement);
}

/** Causal conditions intentionally retain their real subjects. The formatter
 * exposes only subject + durable condition and keeps confidence, relevance,
 * provenance, and tentative reconstructions private. */
export function abstractIncrementalVisibleBranches(result) {
    return result;
}

function validateCausalContext(value, errors, label = 'context', requireKnowledge = false) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${label} must be an object`);
        return;
    }
    if (value.inject !== true) errors.push(`${label}.inject must be true`);
    for (const key of ['inject_reason', 'basis']) if (typeof value[key] !== 'string' || !value[key].trim()) errors.push(`${label}.${key} must be a non-empty string`);
    const conditions = Array.isArray(value.conditions) ? value.conditions : [];
    if (!Array.isArray(value.conditions) || conditions.length < 1 || conditions.length > 6) errors.push(`${label}.conditions must contain 1 to 6 conditions`);
    const ids = [];
    let providerEligible = 0;
    for (const [index, condition] of conditions.entries()) {
        const path = `${label}.conditions[${index}]`;
        for (const key of ['id', 'kind', 'subject', 'condition', 'disclosure', 'confidence', 'relevance']) {
            if (typeof condition?.[key] !== 'string' || !condition[key].trim()) errors.push(`${path}.${key} must be a non-empty string`);
        }
        if (!CAUSAL_KINDS.includes(condition?.kind)) errors.push(`${path}.kind is invalid`);
        if (!['open', 'limited', 'private'].includes(condition?.disclosure)) errors.push(`${path}.disclosure is invalid`);
        if (!['established', 'strong', 'tentative'].includes(condition?.confidence)) errors.push(`${path}.confidence is invalid`);
        if (requireKnowledge) {
            if (!Array.isArray(condition?.known_by) || condition.known_by.length > 24
                || condition.known_by.some(name => typeof name !== 'string' || !name.trim() || name.length > 80)) errors.push(`${path}.known_by must contain at most 24 non-empty names`);
            if (typeof condition?.learned_from !== 'string' || condition.learned_from.length > 180) errors.push(`${path}.learned_from must be a string of at most 180 characters`);
        }
        if (condition?.confidence !== 'tentative') providerEligible += 1;
        if (condition?.id) ids.push(String(condition.id).trim().toLocaleLowerCase());
    }
    if (new Set(ids).size !== ids.length) errors.push(`${label}.conditions must use distinct ids`);
    if (!providerEligible) errors.push(`${label}.conditions must include at least one non-tentative (established or strongly supported) condition`);
}

function validateOffscreenWorld(value, errors, label = 'offscreen') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${label} must be an object`);
        return;
    }
    if (!Array.isArray(value.subjects)) errors.push(`${label}.subjects must be an array`);
    const subjects = asArray(value.subjects);
    if (subjects.length > 12) errors.push(`${label}.subjects must contain at most 12 tracked subjects`);
    const ids = [];
    for (const [index, subject] of subjects.entries()) {
        const path = `${label}.subjects[${index}]`;
        for (const key of ['id', 'kind', 'subject', 'reach', 'motion', 'trajectory', 'confidence']) {
            if (typeof subject?.[key] !== 'string' || !subject[key].trim()) errors.push(`${path}.${key} must be a non-empty string`);
        }
        for (const key of ['settled', 'owed', 'carried_by']) if (typeof subject?.[key] !== 'string') errors.push(`${path}.${key} must be a string`);
        if (!OFFSCREEN_KINDS.includes(subject?.kind)) errors.push(`${path}.kind is invalid`);
        if (!['present', 'near', 'distant', 'remote'].includes(subject?.reach)) errors.push(`${path}.reach is invalid`);
        if (!['static', 'drifting', 'building', 'accelerating', 'resolving'].includes(subject?.motion)) errors.push(`${path}.motion is invalid`);
        if (!['established', 'strong', 'tentative'].includes(subject?.confidence)) errors.push(`${path}.confidence is invalid`);
        if (!Number.isInteger(subject?.last_seen_turn) || subject.last_seen_turn < 0) errors.push(`${path}.last_seen_turn must be a non-negative integer`);
        if (subject?.id) ids.push(String(subject.id).trim().toLocaleLowerCase());
    }
    if (new Set(ids).size !== ids.length) errors.push(`${label}.subjects must use distinct ids`);
    if (typeof value.elapsed !== 'string') errors.push(`${label}.elapsed must be a string`);
    if (!Number.isInteger(value.settled_through) || value.settled_through < 0) errors.push(`${label}.settled_through must be a non-negative integer`);
    if (typeof value.audit !== 'string') errors.push(`${label}.audit must be a string`);
}

function validateResponseAudit(value, errors) {
    for (const key of ['applicable', 'unjustified_escalation', 'player_control', 'continuity_drift']) {
        if (typeof value?.[key] !== 'boolean') errors.push(`response_audit.${key} must be a boolean`);
    }
    if (!['not-applicable', 'missed', 'partial', 'clear'].includes(value?.movement_fit)) errors.push('response_audit.movement_fit is invalid');
    if (!['none', 'possible', 'clear'].includes(value?.repetition)) errors.push('response_audit.repetition is invalid');
    for (const [key, limit] of [['summary', 400], ['state_change', 240]]) {
        if (typeof value?.[key] !== 'string' || value[key].length > limit) errors.push(`response_audit.${key} must be a string of at most ${limit} characters`);
    }
    if (!Array.isArray(value?.patterns) || value.patterns.length > 5
        || value.patterns.some(item => typeof item !== 'string' || !item.trim() || item.length > 140)) errors.push('response_audit.patterns must contain at most 5 non-empty strings');
}

function validateBeatAnalysisResult(result, { requireHorizon = true, requireOffscreen = true } = {}) {
    const errors = [];
    const requiredStrings = (value, keys, label) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            errors.push(`${label} must be an object`);
            return;
        }
        for (const key of keys) if (typeof value[key] !== 'string' || !value[key].trim()) errors.push(`${label}.${key} must be a non-empty string`);
    };
    if (requireHorizon && ![8, 9, 12].includes(result?.contract_version)) errors.push('contract_version must be 8, 9 or 12');
    if (!requireHorizon && result?.contract_version !== 6) errors.push('contract_version must be 6');
    requiredStrings(result?.current, ['frame', 'frame_basis', 'status', 'immediate_action', 'activity', 'situation', 'activity_role', 'temporal_scope', 'scene_promise', 'phase', 'emotional_direction', 'pressure', 'intrusion', 'novelty_ceiling'], 'current');
    validateCausalContext(result?.context, errors, 'context', result?.contract_version === 12);
    if (result?.contract_version === 12) validateResponseAudit(result?.response_audit, errors);
    if (requireOffscreen) validateOffscreenWorld(result?.offscreen, errors);
    requiredStrings(result?.response_audit, ['movement_fit', 'repetition', 'summary'], 'response_audit');
    if (requireHorizon) {
        requiredStrings(result?.horizon, ['status', 'audit'], 'horizon');
        if (!Array.isArray(result?.horizon?.seeds)) errors.push('horizon.seeds must be an array');
        const seeds = Array.isArray(result?.horizon?.seeds) ? result.horizon.seeds : [];
        if (seeds.length > 4) errors.push('horizon.seeds must contain at most 4 long-range seeds');
        for (const [index, seed] of seeds.entries()) {
            requiredStrings(seed, ['id', 'kind', 'trajectory', 'engine', 'scale', 'condition', 'basis', 'present_relation', 'change'], `horizon.seeds[${index}]`);
            if (!['detected', 'original'].includes(seed?.kind)) errors.push(`horizon.seeds[${index}].kind is invalid`);
            if (!['arc', 'months-years', 'open-ended'].includes(seed?.scale)) errors.push(`horizon.seeds[${index}].scale must be genuinely long-range`);
            if (!['none', 'echo', 'seed', 'advance', 'converge'].includes(seed?.present_relation)) errors.push(`horizon.seeds[${index}].present_relation is invalid`);
            if (!['keep', 'adjust', 'replace', 'retire'].includes(seed?.change)) errors.push(`horizon.seeds[${index}].change is invalid`);
        }
        const liveSeeds = seeds.filter(seed => seed?.change !== 'retire');
        const ids = liveSeeds.map(seed => String(seed?.id || '').trim().toLocaleLowerCase()).filter(Boolean);
        const engines = liveSeeds.map(seed => String(seed?.engine || '').trim().toLocaleLowerCase()).filter(Boolean);
        if (new Set(ids).size !== ids.length) errors.push('horizon seeds must use distinct ids');
        if (new Set(engines).size !== engines.length) errors.push('horizon seeds must use distinct causal engines');
        if (!['none', 'latent', 'developing', 'converging'].includes(result?.horizon?.status)) errors.push('horizon.status is invalid');
        if (result?.horizon?.status === 'none' && liveSeeds.length) errors.push('horizon.status cannot be none while seeds remain');
        if (result?.horizon?.status !== 'none' && !liveSeeds.length) errors.push('horizon.status must be none when no seeds remain');
        requiredStrings(result?.hidden_motives, ['status', 'audit'], 'hidden_motives');
        if (!Array.isArray(result?.hidden_motives?.items)) errors.push('hidden_motives.items must be an array');
        const motives = Array.isArray(result?.hidden_motives?.items) ? result.hidden_motives.items : [];
        if (motives.length > 6) errors.push('hidden_motives.items must contain at most 6 hypotheses');
        for (const [index, motive] of motives.entries()) {
            requiredStrings(motive, ['id', 'actor', 'explanation', 'likelihood', 'mechanism', 'current_relevance', 'disclosure', 'change'], `hidden_motives.items[${index}]`);
            for (const key of ['evidence', 'counterevidence']) if (!Array.isArray(motive?.[key])) errors.push(`hidden_motives.items[${index}].${key} must be an array`);
            if (!['established', 'most-likely', 'likely', 'possible', 'wild-card', 'contradicted'].includes(motive?.likelihood)) errors.push(`hidden_motives.items[${index}].likelihood is invalid`);
            if (!['none', 'background', 'supports-beat', 'drives-beat'].includes(motive?.current_relevance)) errors.push(`hidden_motives.items[${index}].current_relevance is invalid`);
            if (!['hidden', 'signaled', 'revealed'].includes(motive?.disclosure)) errors.push(`hidden_motives.items[${index}].disclosure is invalid`);
            if (!['keep', 'adjust', 'replace', 'retire'].includes(motive?.change)) errors.push(`hidden_motives.items[${index}].change is invalid`);
        }
        const motiveIds = motives.filter(motive => motive?.change !== 'retire').map(motive => String(motive?.id || '').trim().toLocaleLowerCase()).filter(Boolean);
        if (new Set(motiveIds).size !== motiveIds.length) errors.push('hidden motives must use distinct ids');
        const liveMotives = motives.filter(motive => motive?.change !== 'retire');
        if (result?.hidden_motives?.status === 'none' && liveMotives.length) errors.push('hidden_motives.status cannot be none while hypotheses remain');
        if (result?.hidden_motives?.status !== 'none' && !liveMotives.length) errors.push('hidden_motives.status must be none when no hypotheses remain');
    }
    requiredStrings(result?.world, ['identity', 'baseline', 'confidence'], 'world');
    for (const key of ['thread_updates', 'canon_updates']) if (!Array.isArray(result?.[key])) errors.push(`${key} must be an array`);
    validateActorUpdates(result?.actor_updates, errors);
    for (const key of ['applicable', 'unjustified_escalation', 'player_control', 'continuity_drift']) if (typeof result?.response_audit?.[key] !== 'boolean') errors.push(`response_audit.${key} must be a boolean`);
    if (!Array.isArray(result?.response_audit?.patterns)) errors.push('response_audit.patterns must be an array');
    if (typeof result?.current?.loop !== 'boolean') errors.push('current.loop must be a boolean');
    for (const key of ['location', 'time']) if (typeof result?.current?.[key] !== 'string') errors.push(`current.${key} must be a string`);
    const allowed = {
        'current.frame': ['grounded', 'heightened', 'surreal'], 'current.activity_role': ['incidental', 'routine', 'developmental', 'central', 'transition'],
        'current.temporal_scope': ['moment', 'action', 'activity', 'scene', 'extended'], 'current.phase': ['establishing', 'developing', 'turning', 'landing', 'aftermath', 'transition'],
        'current.emotional_direction': ['preserve', 'brighten', 'darken', 'release', 'intensify'], 'current.pressure': ['none', 'latent', 'active', 'high', 'saturated'],
        'current.intrusion': ['closed', 'incidental', 'socially-open', 'dramatically-open', 'primed'], 'current.novelty_ceiling': ['none', 'incidental', 'context-native', 'meaningful', 'major'],
        'world.confidence': ['low', 'moderate', 'high'],
        'response_audit.movement_fit': ['not-applicable', 'missed', 'partial', 'clear'], 'response_audit.repetition': ['none', 'possible', 'clear'],
    };
    for (const [path, values] of Object.entries(allowed)) {
        const [group, key] = path.split('.');
        if (!values.includes(result?.[group]?.[key])) errors.push(`${path} is invalid; use exactly one of: ${values.join(', ')}`);
    }
    for (const key of ['variant_rules', 'rp_changes', 'signatures', 'forces']) if (!Array.isArray(result?.world?.[key])) errors.push(`world.${key} must be an array`);
    if (typeof result?.ledger !== 'string') errors.push('ledger must be a string');
    if (typeof result?.audit !== 'string') errors.push('audit must be a string');
    if (!Object.hasOwn(result || {}, 'note_resolution')) errors.push('note_resolution must be present');
    else if (result.note_resolution !== null && !['suggest', 'correct', 'establish', 'forbid'].includes(result.note_resolution?.kind)) errors.push('note_resolution.kind is invalid');
    return { valid: errors.length === 0, errors };
}

function validateIncrementalAnalysisResult(result, { requireOffscreen = true } = {}) {
    const errors = [];
    const requiredStrings = (value, keys, label) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            errors.push(`${label} must be an object`);
            return;
        }
        for (const key of keys) if (typeof value[key] !== 'string' || !value[key].trim()) errors.push(`${label}.${key} must be a non-empty string`);
    };
    if (![10, 11, 13].includes(result?.contract_version)) errors.push('contract_version must be 10, 11 or 13');
    requiredStrings(result?.current, ['frame', 'frame_basis', 'status', 'immediate_action', 'activity', 'situation', 'scene_promise', 'phase', 'emotional_direction', 'pressure', 'intrusion', 'novelty_ceiling'], 'current');
    validateCausalContext(result?.context, errors, 'context', result?.contract_version === 13);
    if (result?.contract_version === 13) validateResponseAudit(result?.response_audit, errors);
    if (requireOffscreen) validateOffscreenWorld(result?.offscreen, errors);
    if (typeof result?.current?.location !== 'string') errors.push('current.location must be a string');
    if (typeof result?.current?.time !== 'string') errors.push('current.time must be a string');
    if (typeof result?.current?.loop !== 'boolean') errors.push('current.loop must be a boolean');
    if (!Array.isArray(result?.thread_updates)) errors.push('thread_updates must be an array');
    for (const [index, update] of asArray(result?.thread_updates).entries()) {
        requiredStrings(update, ['op', 'id', 'thread', 'state', 'status', 'basis'], `thread_updates[${index}]`);
        if (!['upsert', 'retire'].includes(update?.op)) errors.push(`thread_updates[${index}].op is invalid`);
        if (!['active', 'dormant', 'due', 'blocked'].includes(update?.status)) errors.push(`thread_updates[${index}].status is invalid`);
    }
    requiredStrings(result?.hidden_motives, result?.contract_version === 13 ? ['status'] : ['status', 'audit'], 'hidden_motives');
    if (typeof result?.hidden_motives?.audit !== 'string') errors.push('hidden_motives.audit must be a string');
    if (!['none', 'open', 'focused'].includes(result?.hidden_motives?.status)) errors.push('hidden_motives.status is invalid');
    if (!Array.isArray(result?.hidden_motives?.items)) errors.push('hidden_motives.items must be an array');
    const motives = asArray(result?.hidden_motives?.items);
    if (motives.length > 6) errors.push('hidden_motives.items must contain at most 6 hypotheses');
    for (const [index, motive] of motives.entries()) {
        requiredStrings(motive, ['id', 'actor', 'explanation', 'likelihood', 'mechanism', 'current_relevance', 'disclosure', 'change'], `hidden_motives.items[${index}]`);
        for (const key of ['evidence', 'counterevidence']) if (!Array.isArray(motive?.[key])) errors.push(`hidden_motives.items[${index}].${key} must be an array`);
        if (!['established', 'most-likely', 'likely', 'possible', 'wild-card', 'contradicted'].includes(motive?.likelihood)) errors.push(`hidden_motives.items[${index}].likelihood is invalid`);
        if (!['none', 'background', 'supports-beat', 'drives-beat'].includes(motive?.current_relevance)) errors.push(`hidden_motives.items[${index}].current_relevance is invalid`);
        if (!['hidden', 'signaled', 'revealed'].includes(motive?.disclosure)) errors.push(`hidden_motives.items[${index}].disclosure is invalid`);
        if (!['keep', 'adjust', 'replace', 'retire'].includes(motive?.change)) errors.push(`hidden_motives.items[${index}].change is invalid`);
    }
    const liveMotives = motives.filter(motive => motive?.change !== 'retire');
    const motiveIds = liveMotives.map(motive => String(motive?.id || '').trim().toLocaleLowerCase()).filter(Boolean);
    if (new Set(motiveIds).size !== motiveIds.length) errors.push('hidden motives must use distinct ids');
    if (result?.hidden_motives?.status === 'none' && liveMotives.length) errors.push('hidden_motives.status cannot be none while hypotheses remain');
    if (result?.contract_version !== 13 && result?.hidden_motives?.status !== 'none' && !liveMotives.length) errors.push('hidden_motives.status must be none when no hypotheses remain');
    validateActorUpdates(result?.actor_updates, errors);
    const allowed = {
        frame: ['grounded', 'heightened', 'surreal'], phase: ['establishing', 'developing', 'turning', 'landing', 'aftermath', 'transition'],
        emotional_direction: ['preserve', 'brighten', 'darken', 'release', 'intensify'], pressure: ['none', 'latent', 'active', 'high', 'saturated'],
        intrusion: ['closed', 'incidental', 'socially-open', 'dramatically-open', 'primed'], novelty_ceiling: ['none', 'incidental', 'context-native', 'meaningful', 'major'],
    };
    for (const [key, values] of Object.entries(allowed)) if (!values.includes(result?.current?.[key])) errors.push(`current.${key} is invalid; use exactly one of: ${values.join(', ')}`);
    if (typeof result?.ledger !== 'string') errors.push('ledger must be a string');
    if (typeof result?.audit !== 'string') errors.push('audit must be a string');
    if (!Object.hasOwn(result || {}, 'note_resolution')) errors.push('note_resolution must be present');
    else if (result.note_resolution !== null && !['suggest', 'correct', 'establish', 'forbid'].includes(result.note_resolution?.kind)) errors.push('note_resolution.kind is invalid');
    return { valid: errors.length === 0, errors };
}

function validateCompactAnalysisResult(result) {
    const errors = [];
    const object = (value, name) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            errors.push(`${name} must be an object`);
            return false;
        }
        return true;
    };
    const stringsPresent = (value, keys, name) => {
        if (!object(value, name)) return;
        for (const key of keys) {
            if (typeof value[key] !== 'string' || !value[key].trim()) errors.push(`${name}.${key} must be a non-empty string`);
        }
    };

    if (result.contract_version !== 2) errors.push('contract_version must be 2');
    stringsPresent(result.current, ['frame', 'frame_basis', 'status', 'immediate_action', 'activity', 'situation', 'wider_world'], 'current');
    stringsPresent(result.decision, ['operation', 'scene_function', 'aim', 'basis'], 'decision');
    stringsPresent(result.world, ['identity', 'baseline'], 'world');
    stringsPresent(result.author, ['story_identity'], 'author');
    stringsPresent(result.author?.active_arc, ['id', 'title', 'phase', 'purpose', 'pressure'], 'author.active_arc');
    stringsPresent(result.audit, ['weakness', 'counter_route', 'mechanism_check', 'decision'], 'audit');
    stringsPresent(result.portfolio, Object.keys(PORTFOLIO_LANES), 'portfolio');

    if (!Array.isArray(result.author?.themes) || result.author.themes.filter(item => typeof item === 'string' && item.trim()).length < 2) errors.push('author.themes must contain at least 2 themes');
    for (const key of ['character_arcs', 'relationship_arcs']) {
        if (!Array.isArray(result.author?.[key]) || result.author[key].length < 1) errors.push(`author.${key} must contain at least 1 arc`);
        for (const [index, arc] of asArray(result.author?.[key]).entries()) stringsPresent(arc, ['id', 'title', 'phase', 'purpose', 'pressure'], `author.${key}[${index}]`);
    }
    if (!Array.isArray(result.author?.setups) || result.author.setups.length < 2) errors.push('author.setups must contain at least 2 durable setups');
    for (const [index, setup] of asArray(result.author?.setups).entries()) {
        stringsPresent(setup, ['id', 'kind', 'description', 'status', 'payoff'], `author.setups[${index}]`);
        if (!Array.isArray(setup?.conditions)) errors.push(`author.setups[${index}].conditions must be an array`);
    }
    if (!Array.isArray(result.author?.milestones) || result.author.milestones.length < 2) errors.push('author.milestones must contain at least 2 future milestones');
    for (const [index, milestone] of asArray(result.author?.milestones).entries()) {
        stringsPresent(milestone, ['id', 'development', 'horizon', 'status'], `author.milestones[${index}]`);
        if (!Array.isArray(milestone?.conditions)) errors.push(`author.milestones[${index}].conditions must be an array`);
    }

    for (const key of ['thread_updates', 'actor_updates', 'routes', 'guides', 'event_updates', 'canon_updates']) {
        if (!Array.isArray(result[key])) errors.push(`${key} must be an array`);
    }
    for (const [index, event] of (Array.isArray(result.event_updates) ? result.event_updates : []).entries()) {
        if (typeof event?.engine !== 'string' || !event.engine.trim()) errors.push(`event_updates[${index}].engine must be a non-empty string`);
    }
    if (Array.isArray(result.routes) && (result.routes.length < 6 || result.routes.length > 8)) errors.push('routes must contain 6 to 8 varied directions');
    for (const [index, route] of (Array.isArray(result.routes) ? result.routes : []).entries()) {
        for (const key of ['id', 'lane', 'branch', 'agent', 'engine', 'relation', 'scale', 'direction', 'timeframe', 'unresolved_basis', 'basis', 'mechanism_basis']) {
            if (typeof route?.[key] !== 'string' || !route[key].trim()) errors.push(`routes[${index}].${key} must be a non-empty string`);
        }
        if (!Array.isArray(route?.evidence_refs) || (!route.evidence_refs.length && route?.completion_check !== 'new-cause')) errors.push(`routes[${index}].evidence_refs must cite supporting evidence unless this is a new cause`);
        if (!['unresolved', 'new-cause'].includes(route?.completion_check)) errors.push(`routes[${index}].completion_check must be unresolved or new-cause`);
        if (route?.origin === 'original' && route?.completion_check !== 'new-cause') errors.push(`routes[${index}] original routes must use completion_check=new-cause`);
        if (route?.origin !== 'original' && route?.completion_check !== 'unresolved') errors.push(`routes[${index}] evidence-based routes must use completion_check=unresolved`);
        if (!['evidenced', 'new'].includes(route?.mechanism_status)) errors.push(`routes[${index}].mechanism_status must be evidenced or new`);
        if (!Array.isArray(route?.conditions)) errors.push(`routes[${index}].conditions must be an array`);
    }
    const routes = Array.isArray(result.routes) ? result.routes : [];
    const routeIds = routes.map(route => String(route?.id || '').trim().toLocaleLowerCase());
    if (new Set(routeIds).size !== routeIds.length) errors.push('routes must use distinct ids');
    for (const lane of REQUIRED_ROUTE_LANES) {
        if (!routes.some(route => route?.lane === lane)) errors.push(`routes must include the ${lane} lane`);
    }
    const routeEngines = routes.map(route => String(route?.engine || '').trim().toLocaleLowerCase()).filter(Boolean);
    if (new Set(routeEngines).size < Math.min(5, routes.length)) errors.push('routes must use at least five distinct causal engines');
    const immediateEngine = String(routes.find(route => route?.lane === 'immediate')?.engine || '').trim().toLocaleLowerCase();
    const longRangeEngine = String(routes.find(route => route?.lane === 'long-range')?.engine || '').trim().toLocaleLowerCase();
    if (immediateEngine && longRangeEngine && immediateEngine === longRangeEngine) errors.push('the long-range route must not be a delayed version of the immediate causal engine');
    if (!routes.some(route => route?.lane === 'original' && route?.origin === 'original')) errors.push('the original lane must identify a compatible new cause as original');
    if (!routes.some(route => route?.lane === 'long-range' && ['months-years', 'open-ended'].includes(route?.scale))) errors.push('the long-range lane must reach months-years or open-ended scale');
    if (new Set(routes.map(route => String(route?.agent || '').trim().toLocaleLowerCase()).filter(Boolean)).size < 3) errors.push('routes must use at least three independent causal agents or centers');
    for (const [key, lane] of Object.entries(PORTFOLIO_LANES)) {
        const id = String(result.portfolio?.[key] || '').trim().toLocaleLowerCase();
        if (!routes.some(route => String(route?.id || '').trim().toLocaleLowerCase() === id && route?.lane === lane)) errors.push(`portfolio.${key} must reference its matching route lane`);
    }
    if (Array.isArray(result.guides) && result.guides.length !== 4) errors.push('guides must contain exactly 4 ranked directions');
    for (const [index, guide] of (Array.isArray(result.guides) ? result.guides : []).entries()) {
        for (const key of ['id', 'route_id', 'engine', 'direction', 'use_when', 'drop_when', 'operation', 'function', 'world_delta']) {
            if (typeof guide?.[key] !== 'string' || !guide[key].trim()) errors.push(`guides[${index}].${key} must be a non-empty string`);
        }
        if (!Array.isArray(guide?.event_ids)) errors.push(`guides[${index}].event_ids must be an array`);
    }
    const guideRouteIds = (Array.isArray(result.guides) ? result.guides : []).map(guide => String(guide?.route_id || '').trim().toLocaleLowerCase());
    if (new Set(guideRouteIds).size !== guideRouteIds.length) errors.push('guides must reference four distinct routes');
    if (guideRouteIds.some(id => !routeIds.includes(id))) errors.push('every guide must reference a returned route');
    for (const [index, guide] of (Array.isArray(result.guides) ? result.guides : []).entries()) {
        const route = routes.find(item => String(item?.id || '').trim().toLocaleLowerCase() === guideRouteIds[index]);
        if (route && String(guide?.engine || '').trim().toLocaleLowerCase() !== String(route.engine || '').trim().toLocaleLowerCase()) {
            errors.push(`guides[${index}].engine must match its source route engine`);
        }
        for (const eventId of asArray(guide?.event_ids)) {
            const event = asArray(result.event_updates).find(item => item?.op !== 'retire' && String(item?.id || '').trim().toLocaleLowerCase() === String(eventId || '').trim().toLocaleLowerCase());
            if (event && String(event.engine || '').trim().toLocaleLowerCase() !== String(guide?.engine || '').trim().toLocaleLowerCase()) {
                errors.push(`guides[${index}] may link only events owned by its causal engine`);
            }
        }
    }
    const guideLanes = guideRouteIds.map(id => routes.find(route => String(route?.id || '').trim().toLocaleLowerCase() === id)?.lane).filter(Boolean);
    if (new Set(guideLanes).size !== guideLanes.length) errors.push('guides must draw from four distinct route lanes');
    if (typeof result.ledger !== 'string') errors.push('ledger must be a string');
    if (typeof result.guidance !== 'string') errors.push('guidance must be a string');
    if (!Object.hasOwn(result, 'note_resolution')) errors.push('note_resolution must be present');
    return { valid: errors.length === 0, errors };
}

export function validateAnalysisResult(result) {
    if (result?.contract_version === 14) return validateWorldPlan(result);
    // Old detached contracts remain readable; new preparation is validated.
    if (result?.prepared !== undefined) {
        const errors = validatePrepared(result.prepared);
        if (errors.length) return { valid: false, errors };
    }
    if (result?.contract_version === 13) return validateIncrementalAnalysisResult(result, { requireOffscreen: result.offscreen !== undefined });
    if (result?.contract_version === 11) return validateIncrementalAnalysisResult(result);
    if (result?.contract_version === 10) return validateIncrementalAnalysisResult(result, { requireOffscreen: false });
    if ([9, 12].includes(result?.contract_version)) return validateBeatAnalysisResult(result);
    if (result?.contract_version === 8) return validateBeatAnalysisResult(result, { requireOffscreen: false });
    if (result?.contract_version === 2) return validateCompactAnalysisResult(result);
    const errors = [];
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
        return { valid: false, errors: ['result must be a JSON object'] };
    }
    const scene = result.scene;
    const storyFrame = result.story_frame;
    const directorScore = result.director_score;
    const loreModel = result.lore_model;
    const narrativeLayers = result.narrative_layers;
    if (!storyFrame || typeof storyFrame !== 'object' || Array.isArray(storyFrame)
        || ['frame', 'confidence', 'basis'].some(key => typeof storyFrame[key] !== 'string')) {
        errors.push('story_frame must contain frame, confidence, and basis strings');
    } else {
        if (!['grounded', 'heightened', 'surreal'].includes(storyFrame.frame.trim().toLowerCase())) errors.push('story_frame.frame must be a concrete grounded, heightened, or surreal hypothesis');
        if (!storyFrame.basis.trim() || EMPTY_PLANNING_LANGUAGE.test(storyFrame.basis)) errors.push('story_frame.basis must explain the current concrete hypothesis');
    }
    if (!narrativeLayers || typeof narrativeLayers !== 'object' || Array.isArray(narrativeLayers)) {
        errors.push('narrative_layers must be an object');
    } else {
        for (const key of ['immediate_action', 'local_activity', 'situation', 'wider_world', 'durable_trajectory']) {
            if (typeof narrativeLayers[key] !== 'string' || !narrativeLayers[key].trim()) errors.push(`narrative_layers.${key} must be a non-empty string`);
        }
        if (!['incidental', 'routine', 'developmental', 'central', 'transition'].includes(narrativeLayers.activity_role)) errors.push('narrative_layers.activity_role is invalid');
        if (!['moment', 'action', 'activity', 'scene', 'extended'].includes(narrativeLayers.temporal_scope)) errors.push('narrative_layers.temporal_scope is invalid');
    }
    if (!directorScore || typeof directorScore !== 'object' || Array.isArray(directorScore)) {
        errors.push('director_score must be an object');
    } else {
        for (const key of ['story_identity', 'scene_function', 'setting_identity', 'arc_direction', 'meaningful_aim', 'basis']) {
            if (typeof directorScore[key] !== 'string' || !directorScore[key].trim()) errors.push(`director_score.${key} must be a non-empty string`);
        }
        if (!Array.isArray(directorScore.setting_forces)) errors.push('director_score.setting_forces must be an array');
        if (!['hold', 'seed', 'advance', 'converge', 'payoff', 'redirect', 'recover'].includes(directorScore.causal_tempo)) errors.push('director_score.causal_tempo is invalid');
        if (!['keep', 'adjust', 'advance', 'payoff', 'replace'].includes(directorScore.change)) errors.push('director_score.change is invalid');
        const setup = directorScore.future_setup;
        if (!setup || typeof setup !== 'object' || Array.isArray(setup)) {
            errors.push('director_score.future_setup must be an object');
        } else {
            for (const key of ['id', 'development', 'current_step', 'earliest_window']) {
                if (typeof setup[key] !== 'string') errors.push(`director_score.future_setup.${key} must be a string`);
            }
            if (!Array.isArray(setup.conditions)) errors.push('director_score.future_setup.conditions must be an array');
            if (!['hidden', 'signaled', 'ready'].includes(setup.disclosure)) errors.push('director_score.future_setup.disclosure is invalid');
        }
    }
    if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
        errors.push('scene must be an object');
    } else {
        for (const key of ['status', 'activity', 'pace', 'intent', 'location', 'time']) {
            if (typeof scene[key] !== 'string') errors.push(`scene.${key} must be a string`);
        }
        const status = String(scene.status || '').trim();
        if (!status) errors.push('scene.status must not be empty');
        if (status.toLowerCase() === 'uninitialized') errors.push('scene.status must describe the analyzed scene');
        if (typeof scene.loop !== 'boolean') errors.push('scene.loop must be a boolean');
    }
    for (const key of ['objectives', 'entities', 'possibilities']) {
        if (!Array.isArray(result[key])) errors.push(`${key} must be an array`);
    }
    if (!loreModel || typeof loreModel !== 'object' || Array.isArray(loreModel)) {
        errors.push('lore_model must be an object');
    } else {
        for (const key of ['world_identity', 'baseline']) {
            if (typeof loreModel[key] !== 'string' || !loreModel[key].trim()) errors.push(`lore_model.${key} must be a non-empty string`);
        }
        for (const key of ['variant_rules', 'continuity_signatures', 'baseline_departures', 'trajectory_signals', 'active_forces']) {
            if (!Array.isArray(loreModel[key])) errors.push(`lore_model.${key} must be an array`);
        }
        if (!['low', 'moderate', 'high'].includes(loreModel.confidence)) errors.push('lore_model.confidence is invalid');
    }
    for (const [index, entity] of (Array.isArray(result.entities) ? result.entities : []).entries()) {
        for (const key of ['name', 'state', 'location', 'relevance', 'perspective', 'motivation', 'knowledge', 'constraints', 'agenda', 'confidence', 'window']) {
            if (typeof entity?.[key] !== 'string') errors.push(`entities[${index}].${key} must be a string`);
        }
        if (!entity?.name?.trim() || !entity?.state?.trim() || !entity?.motivation?.trim() || !entity?.agenda?.trim()) {
            errors.push(`entities[${index}] must identify a force, its state, motivation, and independent agenda`);
        }
    }
    if (!Array.isArray(result.continuity_threads)) {
        errors.push('continuity_threads must be an array');
    } else {
        for (const [index, thread] of result.continuity_threads.entries()) {
            for (const key of ['id', 'thread', 'state', 'basis']) {
                if (typeof thread?.[key] !== 'string' || !thread[key].trim()) errors.push(`continuity_threads[${index}].${key} must be a non-empty string`);
            }
            if (!['active', 'dormant', 'due', 'blocked'].includes(thread?.status)) errors.push(`continuity_threads[${index}].status is invalid`);
        }
        const ids = result.continuity_threads.map(item => String(item?.id || '').trim().toLowerCase());
        if (new Set(ids).size !== ids.length) errors.push('continuity_threads must use distinct ids');
    }
    for (const [index, possibility] of (Array.isArray(result.possibilities) ? result.possibilities : []).entries()) {
        if (typeof possibility?.description !== 'string' || !possibility.description.trim()) errors.push(`possibilities[${index}].description must be a non-empty string`);
        if (!['local', 'near', 'mid', 'far', 'wildcard'].includes(possibility?.horizon)) errors.push(`possibilities[${index}].horizon is invalid`);
        if (!Array.isArray(possibility?.conditions)) errors.push(`possibilities[${index}].conditions must be an array`);
        if (!['light', 'moderate', 'strong'].includes(possibility?.force)) errors.push(`possibilities[${index}].force is invalid`);
    }
    if (!Array.isArray(result.pathways) || result.pathways.length < 1 || result.pathways.length > 8) {
        errors.push('pathways must contain 1 to 8 conditional routes');
    }
    for (const [index, pathway] of (Array.isArray(result.pathways) ? result.pathways : []).entries()) {
        for (const key of ['id', 'direction', 'when', 'response_bias', 'horizon', 'reason']) {
            if (typeof pathway?.[key] !== 'string') errors.push(`pathways[${index}].${key} must be a string`);
        }
        if (!pathway?.id?.trim() || !pathway?.direction?.trim() || !pathway?.when?.trim()) errors.push(`pathways[${index}] must identify a direction and activation condition`);
        if (!Array.isArray(pathway?.conditions)) errors.push(`pathways[${index}].conditions must be an array`);
        if (!['foreground', 'available', 'latent', 'blocked'].includes(pathway?.status)) errors.push(`pathways[${index}].status is invalid`);
        if (!['keep', 'adjust', 'activate', 'deactivate', 'replace', 'retire'].includes(pathway?.change)) errors.push(`pathways[${index}].change is invalid`);
    }
    if (!Array.isArray(result.next_guides) || result.next_guides.length < 3 || result.next_guides.length > 4) {
        errors.push('next_guides must contain 3 to 4 usable ranked candidates');
    }
    for (const [index, guide] of (Array.isArray(result.next_guides) ? result.next_guides : []).entries()) {
        for (const key of ['id', 'direction', 'use_when', 'drop_when', 'causal_role', 'world_delta', 'basis', 'reason']) {
            if (typeof guide?.[key] !== 'string') errors.push(`next_guides[${index}].${key} must be a string`);
        }
        if (!guide?.id?.trim() || !guide?.direction?.trim() || !guide?.use_when?.trim() || !guide?.drop_when?.trim() || !guide?.causal_role?.trim() || !guide?.world_delta?.trim() || !guide?.basis?.trim()) errors.push(`next_guides[${index}] must be a grounded authorial direction with a story function and impact envelope`);
        if (!Array.isArray(guide?.source_pathways)) errors.push(`next_guides[${index}].source_pathways must be an array`);
        if (!Array.isArray(guide?.causal_event_ids)) errors.push(`next_guides[${index}].causal_event_ids must be an array`);
        if (!['none', 'consequence-only', 'partial-clue', 'reveal-cause'].includes(guide?.disclosure)) errors.push(`next_guides[${index}].disclosure is invalid`);
        if (!['established', 'inferred', 'original'].includes(guide?.origin)) errors.push(`next_guides[${index}].origin is invalid`);
        if (!['strong', 'moderate', 'light'].includes(guide?.strength)) errors.push(`next_guides[${index}].strength is invalid`);
        if (!/\b(?:hold|seed|advance|converge|payoff|redirect|recover)\b/iu.test(guide?.causal_role || '')) errors.push(`next_guides[${index}].causal_role must identify its causal operation`);
        if (/\b(?:mood|tone|warmth|playful|prose|sentence|rhythm|verbosity|descriptive texture|dialogue delivery|surprise latitude)\b/iu.test(guide?.causal_role || '')) errors.push(`next_guides[${index}].causal_role must not direct writing style`);
        const routeConditions = `${guide?.use_when || ''} ${guide?.drop_when || ''}`;
        if (/\b(?:swipe|alternative|preferred|primary guide|next response|next reply|writing the|write the)\b/iu.test(routeConditions)) {
            errors.push(`next_guides[${index}] conditions must describe story state or user direction, not generation metadata`);
        }
        const immediateDevelopment = `${guide?.direction || ''} ${guide?.world_delta || ''}`;
        if (/\b(?:promise|promises|commit|commits|schedule|schedules|plan|plans|agree|agrees)\b[\s\S]{0,140}\b(?:later|tomorrow|morning|next day|next scene|after breakfast|eventually)\b/iu.test(immediateDevelopment)) {
            errors.push(`next_guides[${index}] must deliver substance now rather than defer it through a future promise`);
        }
        if (/\b(?:routine|harmless|minor|small)\b[\s\S]{0,80}\b(?:notice|ping|item|gesture|symptom|detail|update)\b/iu.test(immediateDevelopment)) {
            errors.push(`next_guides[${index}] cannot use a trivial notification or gesture as its meaningful delta`);
        }
    }
    const guideIds = (Array.isArray(result.next_guides) ? result.next_guides : []).map(guide => String(guide?.id || '').trim().toLowerCase());
    const guideDirections = (Array.isArray(result.next_guides) ? result.next_guides : []).map(guide => String(guide?.direction || '').trim().toLowerCase());
    const guideDeltas = (Array.isArray(result.next_guides) ? result.next_guides : []).map(guide => String(guide?.world_delta || '').trim().toLowerCase());
    if (new Set(guideIds).size !== guideIds.length || new Set(guideDirections).size !== guideDirections.length || new Set(guideDeltas).size !== guideDeltas.length) {
        errors.push('next_guides must use distinct ids, contrasting authorial directions, and distinct impact envelopes');
    }
    const horizons = result.plan_horizons;
    if (!horizons || typeof horizons !== 'object' || Array.isArray(horizons)) {
        errors.push('plan_horizons must be an object');
    } else {
        if (!Array.isArray(horizons.items) || horizons.items.length < 6 || horizons.items.length > 10) {
            errors.push('plan_horizons.items must contain 6 to 10 horizons');
        }
        for (const [index, horizon] of (Array.isArray(horizons.items) ? horizons.items : []).entries()) {
            for (const key of ['id', 'branch', 'direction', 'timeframe', 'reason']) {
                if (typeof horizon?.[key] !== 'string' || !horizon[key].trim()) errors.push(`plan_horizons.items[${index}].${key} must be a non-empty string`);
            }
            if (!Array.isArray(horizon?.conditions)) errors.push(`plan_horizons.items[${index}].conditions must be an array`);
            if (!['fluid', 'adaptive', 'stable', 'slow'].includes(horizon?.stability)) errors.push(`plan_horizons.items[${index}].stability is invalid`);
            if (!['keep', 'adjust', 'replace'].includes(horizon?.change)) errors.push(`plan_horizons.items[${index}].change must be keep, adjust, or replace`);
        }
        const horizonDirections = (Array.isArray(horizons.items) ? horizons.items : []).map(item => String(item?.direction || '').trim().toLocaleLowerCase());
        if (new Set(horizonDirections).size !== horizonDirections.length) errors.push('plan_horizons.items must not clone one direction across multiple timeframes');
        const fartherHorizons = (Array.isArray(horizons.items) ? horizons.items : []).slice(-4);
        const futureBranches = fartherHorizons.map(item => String(item?.branch || '').trim().toLocaleLowerCase()).filter(Boolean);
        if (fartherHorizons.length >= 3 && new Set(futureBranches).size < 3) {
            errors.push('the four farthest plan horizons must preserve at least three meaningfully distinct future routes');
        }
        const farthest = Array.isArray(horizons.items) ? horizons.items.at(-1) : null;
        if (farthest && farthest.stability !== 'slow') errors.push('the highest plan horizon must use slow stability');
        if (!horizons.deviation || !['none', 'minor', 'major'].includes(horizons.deviation.level) || typeof horizons.deviation.reason !== 'string') {
            errors.push('plan_horizons.deviation must contain a valid level and reason');
        }
    }
    if (!Array.isArray(result.canon_constraints)) errors.push('canon_constraints must be an array');
    if (!Array.isArray(result.narrative_events)) {
        errors.push('narrative_events must be an array');
    } else {
        for (const [index, event] of result.narrative_events.entries()) {
            for (const key of ['id', 'title', 'summary', 'confidence', 'timing', 'cause', 'basis', 'interpretation']) {
                if (typeof event?.[key] !== 'string') errors.push(`narrative_events[${index}].${key} must be a string`);
            }
            if (!event?.id?.trim() || !event?.title?.trim() || !event?.summary?.trim()) errors.push(`narrative_events[${index}] must identify a concrete causal development`);
            if (!['onscreen', 'offscreen'].includes(event?.scope)) errors.push(`narrative_events[${index}].scope is invalid`);
            if (!['established', 'simulated', 'inferred', 'possible', 'disproved'].includes(event?.epistemic_status)) errors.push(`narrative_events[${index}].epistemic_status is invalid`);
            if (!['hidden', 'signaled', 'revealed'].includes(event?.disclosure)) errors.push(`narrative_events[${index}].disclosure is invalid`);
            if (!['active', 'latent', 'manifested', 'resolved', 'retired'].includes(event?.status)) errors.push(`narrative_events[${index}].status is invalid`);
            if (!['low', 'moderate', 'high'].includes(event?.confidence)) errors.push(`narrative_events[${index}].confidence is invalid`);
            if (!['unscheduled', 'pending', 'due', 'overdue'].includes(event?.due_state)) errors.push(`narrative_events[${index}].due_state is invalid`);
            if (!Array.isArray(event?.consequences)) errors.push(`narrative_events[${index}].consequences must be an array`);
            if (!Array.isArray(event?.requirements)) errors.push(`narrative_events[${index}].requirements must be an array`);
            if (event?.epistemic_status === 'simulated' && event?.scope !== 'offscreen') errors.push(`narrative_events[${index}] can be simulated only offscreen`);
            if (event?.epistemic_status === 'simulated' && (!event?.cause?.trim() || !event?.consequences?.length)) errors.push(`narrative_events[${index}] needs a cause and consequence before it can be simulated`);
            if (event?.scope === 'onscreen' && event?.disclosure === 'hidden') errors.push(`narrative_events[${index}] cannot be both onscreen and hidden`);
        }
        const eventIds = result.narrative_events.map(event => String(event?.id || '').trim());
        if (new Set(eventIds).size !== eventIds.length) errors.push('narrative_events must use distinct ids');
        const eventsById = new Map(result.narrative_events.map(event => [String(event?.id || '').trim(), event]));
        for (const [index, guide] of (Array.isArray(result.next_guides) ? result.next_guides : []).entries()) {
            if (guide?.disclosure === 'none') continue;
            if (!guide?.causal_event_ids?.length) {
                errors.push(`next_guides[${index}] needs a linked causal event for its disclosure boundary`);
                continue;
            }
            for (const id of guide.causal_event_ids) {
                const event = eventsById.get(String(id || '').trim());
                if (!event) errors.push(`next_guides[${index}] links an unknown causal event`);
                else if (['possible', 'disproved'].includes(event.epistemic_status)) errors.push(`next_guides[${index}] cannot realize an unresolved or disproved causal event`);
                else if (guide.disclosure !== 'reveal-cause' && (event.scope !== 'offscreen' || event.disclosure === 'revealed')) errors.push(`next_guides[${index}] cannot conceal a cause that is not hidden offscreen`);
            }
        }
    }
    const audit = result.cue_audit;
    if (!audit || typeof audit !== 'object' || Array.isArray(audit)) {
        errors.push('cue_audit must be an object');
    } else {
        const groups = ['offered_ids', 'manifested_ids', 'unused_ids', 'contradicted_ids'];
        for (const key of groups) {
            if (!Array.isArray(audit[key])) errors.push(`cue_audit.${key} must be an array`);
        }
        if (!['respected', 'exceeded', 'uncertain'].includes(audit.pacing)) errors.push('cue_audit.pacing is invalid');
        if (typeof audit.reason !== 'string') errors.push('cue_audit.reason must be a string');
        if (groups.every(key => Array.isArray(audit[key]))) {
            const offered = new Set(audit.offered_ids);
            const classified = [...audit.manifested_ids, ...audit.unused_ids, ...audit.contradicted_ids];
            if (new Set(audit.offered_ids).size !== audit.offered_ids.length || new Set(classified).size !== classified.length) errors.push('cue_audit ids must be distinct');
            if (classified.some(id => !offered.has(id))) errors.push('cue_audit may classify only offered ids');
            if (classified.length !== offered.size) errors.push('cue_audit must classify every offered id exactly once');
        }
    }
    const challenge = result.self_challenge;
    if (!challenge || typeof challenge !== 'object' || Array.isArray(challenge)) {
        errors.push('self_challenge must be an object');
    } else {
        for (const key of ['weakness', 'counter_route', 'decision']) {
            if (typeof challenge[key] !== 'string' || !challenge[key].trim()) errors.push(`self_challenge.${key} must be a non-empty string`);
        }
    }
    if (typeof result.ledger !== 'string') errors.push('ledger must be a string');
    if (typeof result.guidance !== 'string') errors.push('guidance must be a string');
    if (result.inject !== true) errors.push('inject must be true');
    if (typeof result.reason !== 'string' || !result.reason.trim()) errors.push('reason must be a non-empty string');
    if (!Object.hasOwn(result, 'note_resolution')) {
        errors.push('note_resolution must be present');
    } else if (result.note_resolution !== null) {
        const resolution = result.note_resolution;
        if (!resolution || typeof resolution !== 'object' || Array.isArray(resolution)) {
            errors.push('note_resolution must be an object');
        } else {
            if (!['suggest', 'correct', 'establish', 'forbid'].includes(resolution.kind)) errors.push('note_resolution.kind must be a supported note kind');
        }
    }
    if (typeof result.guidance !== 'string') errors.push('guidance must be a string');
    return { valid: errors.length === 0, errors };
}

function horizonRouteTerms(value) {
    return new Set((String(value || '').toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])
        .filter(term => !HORIZON_ROUTE_STOPWORDS.has(term)));
}

function horizonTimeBand(value) {
    const text = String(value || '').toLocaleLowerCase();
    if (/\b(?:distant|long[- ]?term|multiple arcs?|open[- ]?ended|months?|years?)\b/u.test(text)) return 4;
    if (/\b(?:later|following) arcs?\b/u.test(text)) return 3;
    if (/\b(?:current arc|several scenes?|next several scenes?)\b/u.test(text)) return 2;
    if (/\b(?:scene|day|week)\b/u.test(text)) return 1;
    if (/\b(?:reply|response|turns?|moment|immediate|current action)\b/u.test(text)) return 0;
    return -1;
}

function repeatsHorizonRoute(candidate, existing) {
    const branch = asString(candidate?.branch).trim().toLocaleLowerCase();
    if (!branch || branch !== asString(existing?.branch).trim().toLocaleLowerCase()) return false;
    const candidateTimeframe = asString(candidate?.timeframe).trim().toLocaleLowerCase().replace(/[\s–—-]+/gu, ' ');
    const existingTimeframe = asString(existing?.timeframe).trim().toLocaleLowerCase().replace(/[\s–—-]+/gu, ' ');
    // A branch may legitimately appear at several different rungs of the
    // horizon ladder. Two cards for that same branch at the same named rung,
    // however, are one route even when the provider paraphrases the direction.
    if (candidateTimeframe && candidateTimeframe === existingTimeframe) return true;
    const candidateBand = horizonTimeBand(candidate?.timeframe);
    const existingBand = horizonTimeBand(existing?.timeframe);
    if (candidateBand !== existingBand || candidateBand < 0) return false;
    const candidateTerms = horizonRouteTerms(candidate?.direction);
    const existingTerms = horizonRouteTerms(existing?.direction);
    if (!candidateTerms.size || !existingTerms.size) return false;
    const overlap = [...candidateTerms].filter(term => existingTerms.has(term)).length;
    return overlap >= 2 && overlap / Math.min(candidateTerms.size, existingTerms.size) >= 0.6;
}

function metaDirectiveText(value) {
    const match = String(value || '').match(META_DIRECTIVE_PATTERN);
    return String(match?.[1] || '').trim().replace(/\s*[\])}>]\s*$/u, '').trim();
}

function isExplicitDurableCanonClaim(value) {
    const claim = String(value || '').trim();
    if (!claim || /\bi\s+have\s+to\b/iu.test(claim)) return false;
    return /\b(?:i\s+(?:am|have|possess|can(?:not)?|can't|always|never)\b|i['’]?m\b|my\s+[\p{L}\p{N}'’_-]+(?:\s+[\p{L}\p{N}'’_-]+){0,5}\s+(?:is|are|has|have|should|must|can(?:not)?)\b)/iu.test(claim);
}

function explicitCanonClaims(messages = []) {
    const claims = [];
    for (const message of messages) {
        if (!message?.is_user) continue;
        const claim = metaDirectiveText(stripStructuredEvidence(message?.mes));
        if (isExplicitDurableCanonClaim(claim) && !claims.includes(claim)) claims.push(claim.slice(0, 500));
    }
    return claims.slice(-12);
}

function selectMessages(messages, recentTokenBudget, messageTokenLimit, latestLimit, bootstrapScan = false) {
    const source = Array.isArray(messages) ? messages : [];
    const newestAssistantIndex = source.findLastIndex(message => !message?.is_user);
    const newestUserIndex = source.findLastIndex(message => message?.is_user);
    const recent = [];
    let remainingTokens = Math.max(200, Number(recentTokenBudget) || 4000);
    // Reserve both sides of the authoritative exchange before older prose.
    // A long assistant reply must never consume the player's entire slot.
    for (const index of [newestUserIndex, newestAssistantIndex]) {
        if (index < 0) continue;
        const allowance = index === newestUserIndex && newestAssistantIndex >= 0
            ? Math.min(800, Math.floor((remainingTokens - 48) * 0.3)) : remainingTokens - 24;
        // The explicit scene status has its own protected transcript_head field.
        // Do not spend the raw exchange allowance on a second status panel.
        const content = compactMessageContent(source[index]?.mes, Math.max(16, Math.min(latestLimit, allowance)));
        recent.push({ index, content });
        remainingTokens -= estimateTokenCount(content) + 24;
    }
    for (let index = source.length - 1; index >= 0; index--) {
        if (index === newestUserIndex || index === newestAssistantIndex) continue;
        const message = source[index];
        let content = compactMessageContent(message?.mes, messageTokenLimit);
        let cost = estimateTokenCount(content) + 24;
        if (cost > remainingTokens) {
            const availableContentTokens = remainingTokens - 24;
            // Use leftover capacity for one older excerpt only after the
            // newest user and assistant have their protected allocations.
            if (availableContentTokens >= 80) {
                content = compactMessageContent(message?.mes, Math.min(messageTokenLimit, availableContentTokens));
                cost = estimateTokenCount(content) + 24;
                if (cost <= remainingTokens + 8) recent.push({ index, content });
            }
            break;
        }
        recent.push({ index, content });
        remainingTokens -= cost;
    }
    recent.sort((a, b) => a.index - b.index);
    const recentStart = recent[0]?.index ?? source.length;
    const recentContent = new Map(recent.map(item => [item.index, item.content]));
    const indexes = new Set();
    const directiveIndexes = new Set();
    for (const { index } of recent) indexes.add(index);
    if (bootstrapScan && recentStart > 0) {
        for (let index = 0; index < Math.min(6, source.length); index++) indexes.add(index);
        // Bootstrap sampling is an independently compacted trajectory scan,
        // not part of the raw-recency allocation. Keep enough distributed
        // points that the retained anchor comes from the current arc rather
        // than snapping back to a very old opening scene.
        const sampleCount = Math.min(10, Math.max(6, Math.floor(recentTokenBudget / 800)));
        for (let i = 1; i <= sampleCount; i++) indexes.add(Math.min(source.length - 1, Math.floor((source.length - 1) * i / (sampleCount + 1))));
        const metaIndexes = source
            .map((message, index) => ({ message, index }))
            .filter(({ message }) => message?.is_user && META_DIRECTIVE_PATTERN.test(String(message?.mes || '')))
            .slice(-16);
        for (const { index } of metaIndexes) {
            indexes.add(index);
            directiveIndexes.add(index);
        }
    }
    return [...indexes].sort((a, b) => a - b).map(index => ({
        index,
        kind: recentContent.has(index) ? 'recent' : directiveIndexes.has(index) ? 'directive' : 'anchor',
        message: source[index],
        content: recentContent.get(index),
    }));
}

function compactText(value, limit) {
    return String(value || '').trim().slice(0, limit);
}

function compactOptionalObject(value, limit = 900) {
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, compactText(item, limit)]).filter(([, item]) => item));
}

function playerCharacterName(messages = []) {
    const genericNames = new Set(['', 'user', 'you', 'unused', 'anonymous']);
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index];
        if (!message?.is_user) continue;
        const name = compactText(message.name, 120);
        if (!genericNames.has(name.toLocaleLowerCase())) return name;
    }
    return '';
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function useSpecificPlayerName(value, name) {
    if (!name || value == null) return value;
    if (typeof value === 'string') {
        const escapedName = escapeRegExp(name);
        return value
            .replace(new RegExp(`\\b${escapedName}\\s+(?:and|&)\\s+(?:the\\s+)?protagonist\\b`, 'giu'), name)
            .replace(new RegExp(`\\b(?:the\\s+)?protagonist\\s+(?:and|&)\\s+${escapedName}\\b`, 'giu'), name)
            .replace(/\b(?:the\s+)?protagonist['’]s\b/giu, `${name}'s`)
            .replace(/\bthe\s+protagonist\b/giu, name)
            .replace(/\bprotagonist\b/giu, name);
    }
    if (Array.isArray(value)) return value.map(item => useSpecificPlayerName(item, name));
    if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, useSpecificPlayerName(item, name)]));
    return value;
}

function compactPromptStateForPriority(current = {}) {
    const horizons = current.planHorizons || {};
    return {
        mode: current.mode,
        turnCount: Math.max(0, Number(current.turnCount) || 0),
        directorScore: current.directorScore,
        loreModel: current.loreModel,
        narrativeLayers: current.narrativeLayers,
        scene: current.scene,
        authorBoard: compactAuthorBoard(current.authorBoard),
        objectives: (current.objectives || []).slice(-5).map(item => ({ title: compactText(item.title, 80), detail: compactText(item.detail, 90), status: compactText(item.status, 30) })),
        continuityThreads: (current.continuityThreads || []).slice(0, 8).map(item => ({ id: compactText(item.id, 60), thread: compactText(item.thread, 110), state: compactText(item.state, 130), status: item.status, basis: compactText(item.basis, 90), cmRecordId: compactText(item.cmRecordId, 100), cmRevision: item.cmRevision, canonicalStatus: item.canonicalStatus, directorialReadiness: item.directorialReadiness })),
        selfChallenge: current.selfChallenge ? { weakness: compactText(current.selfChallenge.weakness, 150), counterRoute: compactText(current.selfChallenge.counterRoute, 150), mechanismCheck: compactText(current.selfChallenge.mechanismCheck, 150), decision: compactText(current.selfChallenge.decision, 180) } : undefined,
        entities: (current.entities || []).slice(-3).map(item => ({ name: compactText(item.name, 80), state: compactText(item.state, 100), location: compactText(item.location, 60), relevance: compactText(item.relevance, 60), perspective: compactText(item.perspective, 90), motivation: compactText(item.motivation, 100), knowledge: compactText(item.knowledge, 80), constraints: compactText(item.constraints, 80), agenda: compactText(item.agenda, 100) })),
        possibilities: (current.possibilities || []).slice(-6).map(item => compactText(item, 100)),
        pathways: (current.pathways || []).slice(0, 8).map(item => ({ id: compactText(item.id, 60), lane: item.lane, agent: compactText(item.agent, 60), engine: compactText(item.engine, 60), relation: item.relation, scale: item.scale, origin: item.origin, mechanismStatus: item.mechanismStatus, mechanismBasis: compactText(item.mechanismBasis, 110), direction: compactText(item.direction, 140), when: compactText(item.when, 100), responseBias: compactText(item.responseBias, 120), horizon: compactText(item.horizon, 40), status: item.status, change: item.change })),
        nextGuides: (current.nextGuides || []).slice(0, 4).map(item => ({ id: compactText(item.id, 60), routeLane: item.routeLane, causalAgent: compactText(item.causalAgent, 60), causalEngine: compactText(item.causalEngine, 60), scale: item.scale, direction: compactText(item.direction, 140), useWhen: compactText(item.useWhen, 100), dropWhen: compactText(item.dropWhen, 100), causalRole: compactText(item.causalRole, 100), worldDelta: compactText(item.worldDelta, 100), origin: item.origin, mechanismStatus: item.mechanismStatus, mechanismBasis: compactText(item.mechanismBasis, 110), basis: compactText(item.basis, 100), strength: item.strength, causalEventIds: item.causalEventIds, disclosure: item.disclosure })),
        activeBeat: current.pathways?.length ? undefined : current.activeBeat,
        planHorizons: {
            items: (horizons.items || []).map(item => ({ id: compactText(item.id, 80), lane: item.lane, branch: compactText(item.branch, 60), agent: compactText(item.agent, 60), engine: compactText(item.engine, 60), relation: item.relation, scale: item.scale, origin: item.origin, mechanismStatus: item.mechanismStatus, mechanismBasis: compactText(item.mechanismBasis, 110), direction: compactText(item.direction, 140), timeframe: compactText(item.timeframe, 80), stability: item.stability, change: item.change })),
            deviation: { level: horizons.deviation?.level, reason: compactText(horizons.deviation?.reason, 140) },
        },
        canonConstraints: (current.canonConstraints || []).slice(-6).map(item => compactText(item, 240)),
        userNotes: (current.userNotes || []).slice(-2).map(item => ({ kind: item.kind, text: compactText(item.text, 500) })),
        contextLedger: compactText(current.contextLedger, 700),
        storyFrame: current.storyFrame,
        narrativeEvents: (current.narrativeEvents || []).slice(-3).map(item => ({ id: compactText(item.id, 60), summary: compactText(item.summary, 120), scope: item.scope, epistemicStatus: item.epistemicStatus, disclosure: item.disclosure, status: item.status, cause: compactText(item.cause, 100), consequences: (item.consequences || []).slice(0, 1).map(value => compactText(value, 100)) })),
        lastOfferedCues: (current.lastOfferedCues || []).slice(0, 1).map(item => ({ id: compactText(item.id, 80), direction: compactText(item.direction, 160), useWhen: compactText(item.useWhen, 100), dropWhen: compactText(item.dropWhen, 100), worldDelta: compactText(item.worldDelta, 120), requestConfirmed: item.requestConfirmed === true })),
    };
}

function sampleHorizonItems(items = [], limit = 6) {
    if (items.length <= limit) return items;
    const indexes = new Set([0, 1, items.length - 1]);
    for (let step = 1; indexes.size < limit; step++) indexes.add(Math.round((items.length - 1) * step / (limit - 1)));
    return [...indexes].sort((a, b) => a - b).slice(0, limit).map(index => items[index]);
}

function compactAuthorBoard(board = {}) {
    return {
        setups: (board.setups || []).filter(item => item.status !== 'retired').slice(0, 6).map(item => ({ id: compactText(item.id, 60), description: compactText(item.description, 160), status: item.status, payoff: compactText(item.payoff, 120) })),
        offscreenDevelopments: (board.offscreenDevelopments || []).filter(item => !['retired', 'resolved'].includes(item.status)).slice(0, 5).map(item => ({ id: compactText(item.id, 60), development: compactText(item.development, 160), status: item.status, progress: item.progress, disclosure: item.disclosure })),
        milestones: (board.milestones || []).filter(item => !['retired', 'resolved'].includes(item.status)).slice(0, 5).map(item => ({ id: compactText(item.id, 60), development: compactText(item.development, 160), horizon: compactText(item.horizon, 60), status: item.status })),
        requiredDevelopments: (board.scene?.requiredDevelopments || []).slice(0, 8).map(item => ({ id: compactText(item.id, 60), instruction: compactText(item.instruction, 160), status: item.status, deliveredAtTurn: item.deliveredAtTurn })),
        revision: Number(board.revision) || 0,
    };
}

function compactPromptStateForBudget(current = {}) {
    // Only live causal-world fields belong in routine context. Legacy route,
    // director, conductor and beat scaffolding is storage compatibility, not
    // evidence the model needs to read again on every reply.
    return {
        mode: current.mode, turnCount: current.turnCount,
        preparedWorld: current.preparedWorld, pacing: current.pacing,
        scene: current.scene, sceneProfile: current.sceneProfile,
        // Both are replaced on every pass. Repeating yesterday's selected
        // facts and verdict beside their source amplifies interpretation as
        // apparent evidence; persistent memory and patterns remain below.
        responsePatternMemory: (current.responsePatternMemory || []).slice(-6),
        loreModel: current.loreModel,
        continuityThreads: (current.continuityThreads || []).slice(0, 5),
        entities: (current.entities || []).slice(-5),
        hiddenMotives: current.hiddenMotives,
        offscreenWorld: current.offscreenWorld,
        canonConstraints: (current.canonConstraints || []).slice(-4),
        userNotes: (current.userNotes || []).slice(-2),
        contextLedger: current.contextLedger,
        storyFrame: current.storyFrame,
    };
}

function stripLeadingGeneratedStatusSummary(value) {
    return leadingGeneratedStatusSummary(value).body;
}

function extractLeadingGeneratedStatusSummary(value) {
    return sceneStatus(value);
}

function statusSummaryValue(summary, label) {
    const escaped = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(summary || '').match(new RegExp(`^${escaped}\\s*=\\s*(.+)$`, 'imu'))?.[1]?.trim() || '';
}

function normalizedClockMinutes(value) {
    const match = String(value || '').match(/\b(\d{1,2}):(\d{2})\s*([ap]m)?\b/iu);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    const meridiem = String(match[3] || '').toLocaleLowerCase();
    if (meridiem && hour <= 12) {
        if (hour === 12) hour = 0;
        if (meridiem === 'pm') hour += 12;
    }
    return hour * 60 + minute;
}

const KINSHIP_TERM_SOURCE = 'sister|brother|mother|father|daughter|son|wife|husband|aunt|uncle|niece|nephew|grandmother|grandfather';
const KINSHIP_POSSESSIVE_PATTERN_SOURCE = String.raw`\b([\p{Lu}][\p{L}\p{N}_-]{1,48})[’']s\s+(${KINSHIP_TERM_SOURCE})\b`;
export function alignRetainedStateToTranscript(state) {
    // A relation category is not an identity: Mira and Lena can both have a
    // father, and can even share one. Preserve source attribution verbatim.
    // Only the evidence-aware planner may reconcile an explicit correction.
    return normalizeState(state);
}

export function transcriptHeadAlignmentErrors(result, prompt) {
    let payload = prompt;
    try {
        if (typeof payload === 'string') payload = JSON.parse(payload);
    } catch {
        return [];
    }
    const head = payload?.transcript_head;
    const status = head?.authoritative_assistant_status;
    if (!head || !result?.current) return [];
    const errors = [];
    const expectedTime = statusSummaryValue(status, 'Time') || statusSummaryValue(status, 'Time & Weather');
    const expectedClock = normalizedClockMinutes(expectedTime);
    const actualClock = normalizedClockMinutes(result.current.time);
    if (expectedClock !== null && actualClock === null) {
        errors.push(`current.time omits the authoritative newest-assistant clock ${expectedTime}`);
    }
    if (expectedClock !== null && expectedClock !== actualClock) {
        errors.push(`current.time describes ${String(result.current.time).trim()} but the authoritative newest-assistant status is ${expectedTime}`);
    }

    // Shared relation words or proposal verbs alone cannot establish a
    // contradiction. Do not reject unrelated relatives or earlier proposals.
    return [...new Set(errors)];
}

function stripStructuredEvidence(value) {
    let cleaned = String(value || '')
        .replace(/```[\s\S]*?```/gu, ' ')
        .replace(/~~~[\s\S]*?~~~/gu, ' ');
    const pairedElement = /<([A-Za-z_][\w:.-]*)(?:\s[^<>]*?)?>[\s\S]*?<\/\1\s*>/giu;
    for (let pass = 0; pass < 8; pass++) {
        const next = cleaned.replace(pairedElement, ' ');
        if (next === cleaned) break;
        cleaned = next;
    }
    return cleaned.replace(/<[A-Za-z_][\w:.-]*(?:\s[^<>]*?)?\s*\/>/gu, ' ');
}

function cleanMessageContent(value, { preserveLeadingStatus = false, preserveParagraphs = true } = {}) {
    const leading = leadingGeneratedStatusSummary(value);
    const source = preserveLeadingStatus && leading.status
        ? `${sceneStatus(value)}\n\n${leading.body}`
        : leading.body;
    // Rendered story tables/cards are evidence, not disposable markup. Keep
    // their visible text while excluding generated panels and hidden guidance.
    // stripStructuredEvidence remains stricter for detecting user directives:
    // quoted/embedded text must not acquire OOC authority.
    const visible = source
        .replace(/<!--[\s\S]*?-->/gu, ' ')
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, ' ')
        .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/giu, ' ')
        .replace(/<stat>[\s\S]*?<\/stat>/giu, ' ')
        .replace(/<background_updates>[\s\S]*?<\/background_updates>/giu, ' ')
        .replace(/<(living-world-guide|tale-fairy-authority|tale-fairy-context|plot-anchor|prepared-world)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, ' ');
    return plotExcerpt(visible, Number.MAX_SAFE_INTEGER)
        .replace(preserveParagraphs ? /[^\S\n]+/g : /\s+/g, ' ')
        .trim();
}

function compactMessageContent(value, tokenLimit, { preserveLeadingStatus = false } = {}) {
    const cleaned = cleanMessageContent(value, { preserveLeadingStatus });
    const cap = Math.max(16, tokenLimit);
    if (estimateTokenCount(cleaned) <= cap) return cleaned;
    const separator = ' … ';
    const available = Math.max(0, cap - estimateTokenCount(separator) * 2);
    const head = truncateToTokenBudget(cleaned, Math.ceil(available * 0.42));
    const middleSource = cleaned.slice(Math.max(head.length, Math.floor(cleaned.length * 0.335)));
    const middle = truncateToTokenBudget(middleSource, Math.ceil(available * 0.33));
    const tail = truncateToTokenBudget(cleaned, Math.max(0, available - estimateTokenCount(head) - estimateTokenCount(middle)), { fromEnd: true });
    return truncateToTokenBudget(`${head}${separator}${middle}${separator}${tail}`, cap);
}

const RETRIEVAL_STOP_WORDS = new Set([
    'about', 'after', 'again', 'also', 'and', 'are', 'because', 'been', 'before', 'being', 'but', 'can', 'could',
    'did', 'does', 'doing', 'for', 'from', 'had', 'has', 'have', 'her', 'here', 'him', 'his', 'how', 'into', 'its',
    'just', 'like', 'more', 'not', 'now', 'off', 'only', 'our', 'out', 'over', 'said', 'say', 'she', 'some', 'still',
    'than', 'that', 'the', 'their', 'them', 'then', 'there', 'they', 'this', 'those', 'through', 'too', 'very', 'was',
    'were', 'what', 'when', 'where', 'which', 'while', 'who', 'why', 'will', 'with', 'would', 'you', 'your',
]);

function timelineSentences(value) {
    const cleaned = cleanMessageContent(value);
    if (!cleaned) return [];
    const parts = cleaned.split(/(?<=[.!?。！？])\s+/u).map(item => item.trim()).filter(Boolean);
    return parts.length ? parts : [cleaned];
}

function compactRebuildTimelineEvidence(epochs, requestedTokenLimit) {
    const limit = Math.max(300, Math.floor(Number(requestedTokenLimit) || 0));
    const result = (Array.isArray(epochs) ? epochs : []).map(epoch => ({
        range: Array.isArray(epoch.range) ? epoch.range.slice(0, 2) : [],
        excerpts: (Array.isArray(epoch.excerpts) ? epoch.excerpts : []).map(item => ({ ...item })),
    })).filter(epoch => epoch.excerpts.length);
    if (!result.length) return [];

    // Preserve chronological coverage before density. Under pressure, remove a
    // third excerpt from every epoch before allowing any epoch to disappear.
    while (estimateTokenCount(JSON.stringify(result)) > limit && result.some(epoch => epoch.excerpts.length > 1)) {
        const epoch = [...result].reverse().find(item => item.excerpts.length > 1);
        epoch.excerpts.pop();
    }
    let guard = 0;
    while (estimateTokenCount(JSON.stringify(result)) > limit && guard++ < 200) {
        const entries = result.flatMap(epoch => epoch.excerpts);
        const longest = entries.sort((a, b) => estimateTokenCount(b.content) - estimateTokenCount(a.content))[0];
        if (!longest) break;
        const tokens = estimateTokenCount(longest.content);
        if (tokens <= 14) break;
        longest.content = truncateToTokenBudget(longest.content, Math.max(14, tokens - 10));
    }
    return result;
}

/**
 * Build a recency-independent story map for initialization and broad reviews.
 *
 * This is extractive rather than generative: it scans the raw chat once,
 * divides it into chronological epochs, and retains distinctive evidence from
 * every epoch. Rare names, places, institutions, and events naturally score
 * above repeated routine prose, while equal epoch coverage prevents the latest
 * scene from becoming the whole story merely because it occupies many turns.
 */
export function buildRebuildTimelineEvidence(messages, historicalEnd, requestedTokenLimit = 3200) {
    const source = Array.isArray(messages) ? messages : [];
    const requestedEnd = Number(historicalEnd);
    const end = Math.max(0, Math.min(source.length, Number.isFinite(requestedEnd) ? requestedEnd : source.length));
    if (!end) return [];
    const tokenLimit = Math.max(600, Math.min(6000, Math.floor(Number(requestedTokenLimit) || 3200)));
    const epochCount = Math.min(12, Math.max(3, Math.ceil(end / 28)));
    const documentFrequency = new Map();
    for (let index = 0; index < end; index++) {
        for (const term of new Set(retrievalTerms(cleanMessageContent(source[index]?.mes)))) {
            documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
        }
    }
    const epochs = [];
    for (let epochIndex = 0; epochIndex < epochCount; epochIndex++) {
        const from = Math.floor(end * epochIndex / epochCount);
        const to = Math.max(from + 1, Math.floor(end * (epochIndex + 1) / epochCount));
        const candidates = [];
        for (let index = from; index < to; index++) {
            const message = source[index];
            const sentences = timelineSentences(message?.mes);
            for (const [sentenceIndex, sentence] of sentences.entries()) {
                const terms = [...new Set(retrievalTerms(sentence))];
                if (!terms.length && sentence.length < 20) continue;
                const rarity = terms.reduce((sum, term) => sum + Math.log((end + 1) / ((documentFrequency.get(term) || 0) + 1)) + 0.2, 0);
                const directive = message?.is_user && META_DIRECTIVE_PATTERN.test(sentence) ? 8 : 0;
                const edge = sentenceIndex === 0 || sentenceIndex === sentences.length - 1 ? 0.35 : 0;
                const score = rarity / Math.sqrt(Math.max(1, terms.length)) + directive + edge;
                candidates.push({ index, role: message?.is_user ? 'user' : 'assistant', content: sentence, terms: new Set(terms), score });
            }
        }
        const chosen = [];
        const addBest = pool => {
            const ranked = pool.filter(item => !chosen.includes(item)).map(item => {
                const overlap = chosen.reduce((sum, other) => sum + [...item.terms].filter(term => other.terms.has(term)).length / Math.max(1, item.terms.size), 0);
                return { item, adjusted: item.score - overlap * 2.5 };
            }).sort((a, b) => b.adjusted - a.adjusted || a.item.index - b.item.index);
            if (ranked[0]) chosen.push(ranked[0].item);
        };
        addBest(candidates.filter(item => item.role === 'user'));
        addBest(candidates.filter(item => item.role === 'assistant'));
        addBest(candidates);
        if (!chosen.length) continue;
        epochs.push({
            range: [from, to - 1],
            excerpts: chosen.sort((a, b) => a.index - b.index).map(({ terms: _terms, score: _score, ...item }) => item),
        });
    }
    const excerptCount = epochs.reduce((sum, epoch) => sum + epoch.excerpts.length, 0);
    const overhead = estimateTokenCount(JSON.stringify(epochs.map(epoch => ({ range: epoch.range, excerpts: epoch.excerpts.map(({ index, role }) => ({ index, role, content: '' })) }))));
    const perExcerpt = Math.max(24, Math.floor((tokenLimit - overhead) / Math.max(1, excerptCount)));
    const compacted = epochs.map(epoch => ({
        ...epoch,
        excerpts: epoch.excerpts.map(item => ({ ...item, content: compactMessageContent(item.content, perExcerpt) })),
    }));
    return compactRebuildTimelineEvidence(compacted, tokenLimit);
}

// Collect once for this accepted transcript, before source selection or budget
// fitting. Never reuse evidence across an edit, swipe, or different chat.
export function buildStoryEvidence(messages = []) {
    return {
        messageCount: messages.length,
        opening: messages.length ? { index: 0, role: messages[0].is_user ? 'user' : 'assistant', content: truncateToTokenBudget(cleanMessageContent(messages[0].mes), 400) } : null,
        timeline: buildRebuildTimelineEvidence(messages, messages.length, 3200),
        openThreads: retrieveDormantHookEvidence(messages, messages.length, new Set(), 6),
    };
}

export function storyEvidenceQuery(evidence, bootstrap = {}) {
    return [
        ...Object.values(bootstrap),
        evidence?.opening?.content || '',
        ...(evidence?.timeline || []).flatMap(epoch => epoch.excerpts.map(item => item.content)),
        ...(evidence?.openThreads || []).map(item => item.content),
    ].join('\n');
}

function retrievalTerms(value) {
    return String(value || '')
        .toLocaleLowerCase()
        .match(/[\p{L}\p{N}][\p{L}\p{N}'-]{2,}/gu)?.map(term => term.replace(/(?:'s|s')$/u, ''))
        .filter(term => term.length >= 3 && !RETRIEVAL_STOP_WORDS.has(term)) || [];
}

function retrievalQueryTerms(state, recentMessages) {
    const current = stateForPrompt(state, { query: (recentMessages || []).slice(-4).map(message => message?.mes || '').join('\n') });
    const weighted = new Map();
    const add = (values, weight) => {
        for (const value of values.flat(Infinity).filter(Boolean)) {
            for (const term of new Set(retrievalTerms(value))) weighted.set(term, Math.min(12, weight + (weighted.get(term) || 0)));
        }
    };
    add((recentMessages || []).slice(-6).map(message => compactMessageContent(message?.mes, 700)), 3);
    add((current.entities || []).flatMap(item => [item.name, item.motivation, item.constraints, item.agenda]), 2);
    add((current.preparedWorld?.items || []).filter(item => item.origin !== 'invented').map(item => item.premise), 2);
    add((current.causalContext?.conditions || []).map(item => [item.subject, item.condition]), 2);
    add([
        current.scene?.intent,
        current.directorScore?.storyIdentity,
        current.directorScore?.arcDirection,
        current.directorScore?.meaningfulAim,
        current.directorScore?.futureSetup?.development,
        current.directorScore?.futureSetup?.currentStep,
        current.directorScore?.futureSetup?.conditions,
        current.narrativeLayers?.situation,
        current.narrativeLayers?.widerWorld,
        current.narrativeLayers?.durableTrajectory,
        (current.planHorizons?.items || []).flatMap(item => [item.direction, item.timeframe, item.conditions]),
        (current.objectives || []).flatMap(item => [item.title, item.detail]),
        current.activeBeat?.objective,
        current.activeBeat?.nextAction,
        (current.pathways || []).flatMap(item => [item.direction, item.when, item.responseBias]),
        (current.nextGuides || []).flatMap(item => [item.direction, item.useWhen, item.causalRole, item.worldDelta, item.basis]),
        (current.narrativeEvents || []).flatMap(item => [item.title, item.summary, item.cause, item.consequences, item.basis]),
    ], 2);
    return weighted;
}

function historicalAuditClaims(state) {
    const current = normalizeState(state);
    const statusPriority = { latent: 0, blocked: 1, held: 2, background: 3, active: 4, foreground: 5 };
    const eventPriority = { inferred: 0, simulated: 1, possible: 2, established: 4, disproved: 6 };
    const anchors = value => [...String(value || '').matchAll(/\b(?:msg|message|turn)\s*#?(\d+)\b/giu)]
        .map(match => Number(match[1]))
        .filter(Number.isInteger);
    return [
        ...current.entities.filter(item => item.constraints).map(item => ({
            text: `${item.name} ${item.constraints}`, subject: item.name,
            priority: 1, anchors: [],
        })),
        // Current preparation replaced the legacy horizon boards. Its factual
        // premises still need raw witnesses; invention needs no prior mention.
        ...current.preparedWorld.items.filter(item => item.origin !== 'invented').map(item => ({
            text: `${item.premise} ${item.hold}`, priority: current.preparedWorld.focus.includes(item.id) ? 0 : 2, anchors: [],
        })),
        ...current.causalContext.conditions.map(item => ({
            text: `${item.subject} ${item.condition}`, priority: 1, anchors: anchors(item.learnedFrom),
        })),
        {
            text: [current.directorScore.storyIdentity, current.directorScore.arcDirection, current.directorScore.meaningfulAim, current.narrativeLayers.durableTrajectory, current.narrativeLayers.widerWorld].filter(Boolean).join(' '),
            priority: 1,
            anchors: anchors(current.directorScore.basis),
        },
        ...current.planHorizons.items.map((item, index, items) => ({
            text: [item.direction, item.timeframe, item.conditions].flat().filter(Boolean).join(' '),
            priority: index === items.length - 1 ? 1 : index < 2 ? 4 : 2,
            anchors: anchors(item.reason),
        })),
        ...(current.objectives || []).map(item => ({
            text: [item.title, item.detail].filter(Boolean).join(' '),
            priority: statusPriority[String(item.status || '').toLocaleLowerCase()] ?? 4,
            anchors: anchors(item.source),
        })),
        ...(current.pathways || []).map(item => ({
            text: [item.direction, item.when, item.responseBias].filter(Boolean).join(' '),
            priority: statusPriority[String(item.status || '').toLocaleLowerCase()] ?? 5,
            anchors: anchors(item.reason),
        })),
        ...(current.narrativeEvents || []).map(item => ({
            text: [item.title, item.summary, item.cause, item.consequences, item.basis].flat().filter(Boolean).join(' '),
            priority: eventPriority[String(item.epistemicStatus || '').toLocaleLowerCase()] ?? 3,
            anchors: anchors(item.basis),
        })),
    ].filter(item => retrievalTerms(item.text).length >= 2)
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 6);
}

function focusedHistoricalExcerpt(value, claimTerms) {
    // A tiny topic window can select the right message yet remove the action
    // or qualification needed to interpret it. Keep a normal-sized source
    // turn intact whenever it fits; only long turns need topical selection.
    return plotExcerpt(cleanMessageContent(value, { preserveParagraphs: true }), 700, [...claimTerms].join(' '));
}

function retrieveOlderHistoricalEvidence(messages, state, recentStart, selectedIndexes, maxItems = 4) {
    if (recentStart <= 0) return [];
    const queryTerms = retrievalQueryTerms(state, messages.slice(recentStart));
    if (!queryTerms.size) return [];
    const selected = selectedIndexes instanceof Set ? selectedIndexes : new Set(selectedIndexes || []);
    const intentPattern = /\b(?:i|we)\s+(?:already\s+)?(?:want|wanted|wish|wished|hope|hoped|need|needed|plan|planned|intend|intended|decide|decided|prefer|preferred|tell|told|share|shared|reveal|revealed|disclose|disclosed|explain|explained|ask|asked|promise|promised|believe|believed|will|won't|would)\b/iu;
    const correctionPattern = /\b(?:actually|already|exactly|remember|don't forget|do not forget|i (?:said|told|meant))\b/iu;
    const documentFrequency = new Map();
    let documentCount = 0;
    // Bounded ordinary-dialogue retrieval; older history remains in summaries.
    const scanStart = Math.max(0, recentStart - 400);
    for (let index = scanStart; index < recentStart; index++) {
        if (!messages[index] || selected.has(index)) continue;
        documentCount++;
        for (const term of new Set(retrievalTerms(compactMessageContent(messages[index].mes, 500)))) {
            documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
        }
    }
    const records = [];
    for (let index = scanStart; index < recentStart; index++) {
        const message = messages[index];
        if (!message || selected.has(index)) continue;
        const raw = cleanMessageContent(message.mes, { preserveParagraphs: true });
        const content = relevantExcerpt(raw, 280, [...queryTerms.keys()].join(' '));
        if (!content) continue;
        const terms = new Set(retrievalTerms(content));
        const overlap = [...terms].filter(term => queryTerms.has(term));
        const specificity = overlap.reduce((sum, term) => {
            const rarity = Math.log((documentCount + 1) / ((documentFrequency.get(term) || 0) + 1)) + 0.25;
            return sum + rarity * queryTerms.get(term);
        }, 0);
        const role = message.is_user ? 'user' : 'assistant';
        const hasIntent = role === 'user' && intentPattern.test(content);
        const hasCorrection = role === 'user' && correctionPattern.test(content);
        const intentBoost = hasIntent ? 1.75 : 0;
        const correctionBoost = hasCorrection ? 1 : 0;
        const proximity = index / Math.max(1, recentStart) * 0.35;
        records.push({ index, role, content, raw, rawTerms: new Set(retrievalTerms(raw)), terms, overlap: overlap.length, specificity, hasIntent, hasCorrection, intentBoost, correctionBoost, proximity });
    }
    const topicSeeds = records
        .filter(item => item.overlap >= 1)
        .sort((a, b) => b.specificity - a.specificity || b.index - a.index)
        .slice(0, 1);
    const candidates = records.flatMap(item => {
        const linkedSeed = topicSeeds
            .map(seed => ({ seed, distance: item.index - seed.index }))
            .filter(link => link.distance > 0 && link.distance <= 16)
            .sort((a, b) => a.distance - b.distance)[0];
        const threadBoost = linkedSeed && item.hasIntent
            ? linkedSeed.seed.specificity * 1.5 * (1 - linkedSeed.distance / 17)
            : 0;
        if (item.overlap < 2 && !(item.overlap >= 1 && (item.hasIntent || item.hasCorrection || /\b(?:refused|declined|departed|left|promised|returned)\b/iu.test(item.content))) && !threadBoost) return [];
        return [{ index: item.index, role: item.role, content: item.content, score: item.specificity + item.intentBoost + item.correctionBoost + item.proximity + threadBoost }];
    });
    const limit = Math.max(1, Math.min(4, maxItems));
    const ranked = candidates.sort((a, b) => b.score - a.score || b.index - a.index);
    const primarySeed = topicSeeds[0];
    const threadEvidence = primarySeed
        ? candidates.filter(item => {
            const record = records.find(candidate => candidate.index === item.index);
            return item.index > primarySeed.index && item.index - primarySeed.index <= 16 && (record?.hasIntent || record?.overlap >= 2);
        }).slice(-3)
        : [];
    const chosen = new Map();
    const add = item => {
        if (item && !chosen.has(item.index) && chosen.size < limit) chosen.set(item.index, item);
    };
    // Audit each retained claim independently before the broad relevance
    // ranking. Otherwise several busy recent threads can crowd an older
    // completion out of every retrieval slot and leave only its stale setup.
    for (const claim of historicalAuditClaims(state)) {
        if (chosen.size >= limit) break;
        const claimTerms = new Set(retrievalTerms(claim.text));
        const termWeight = term => Math.log((documentCount + 1) / ((documentFrequency.get(term) || 0) + 1)) + 0.25;
        const claimWeight = [...claimTerms].reduce((sum, term) => sum + termWeight(term), 0);
        // Planner source labels are hints, never proof. When they cite a raw
        // message, inspect the following exchange so a setup at that message
        // cannot outrank its nearby completion.
        const anchoredRecords = claim.anchors.length
            ? records.filter(item => claim.anchors.some(anchor => item.index >= anchor && item.index <= anchor + 20))
            : records;
        const match = anchoredRecords
            .map(item => {
                const subjectTerms = retrievalTerms(claim.subject);
                if (subjectTerms.length && !subjectTerms.some(term => item.rawTerms.has(term))) return null;
                const overlap = [...claimTerms].filter(term => item.rawTerms.has(term));
                if (overlap.length < (claim.anchors.length ? 1 : 2)) return null;
                const specificity = overlap.reduce((sum, term) => sum + termWeight(term), 0);
                // A few common words are not a witness to this subject. Prefer
                // no historical match over presenting unrelated prose as proof.
                if (!claim.anchors.length && specificity / Math.max(1, claimWeight) < 0.3) return null;
                const afterAnchor = claim.anchors.some(anchor => item.index > anchor) ? 1 : 0;
                // Retrieve observations, not hand-coded categories of desired
                // answers. Interpretation and correction belong to the GM.
                return { item, score: specificity + (item.role === 'assistant' ? 1.5 : 0) + afterAnchor + item.proximity };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score || b.item.index - a.item.index)[0];
        if (match) add({
            ...match.item,
            content: focusedHistoricalExcerpt(messages[match.item.index]?.mes, claimTerms),
            purpose: 'audit-current-claim',
            // Do not turn a truncated qualification into a different claim.
            // Extremely large legacy claims can guide retrieval without being
            // misrepresented as a short, complete statement.
            ...(claim.text.length <= 1000 ? { claim: claim.text.trim() } : {}),
        });
    }
    // Preserve both sides of an old exchange when space remains. User turns
    // prove what the player declared; selected assistant turns prove what
    // actually happened afterward in this active chat.
    add(ranked.find(item => item.role === 'user'));
    add(ranked.find(item => item.role === 'assistant'));
    for (const item of threadEvidence) add(item);
    for (const item of ranked) {
        if (chosen.size >= limit) break;
        add(item);
    }
    return [...chosen.values()]
        .map(({ raw: _raw, rawTerms: _rawTerms, score: _score, terms: _terms, overlap: _overlap, specificity: _specificity, hasIntent: _hasIntent, hasCorrection: _hasCorrection, intentBoost: _intentBoost, correctionBoost: _correctionBoost, proximity: _proximity, ...item }) => item);
}

const DURABLE_HOOK_TYPES = Object.freeze([
    ['correspondence-or-petition', /\b(?:letter|petition|appeal|application|formal request|message to|wrote to|write to)\b/iu],
    ['scheduled-decision', /\b(?:appointment|hearing|panel|review|assessment|meeting|interview|deadline|decision(?: date)?|decid(?:e|es|ing)|determination)\b/iu],
    ['investigation-or-search', /\b(?:investigation|inquiry|search order|missing person|case file|evidence trail|records search)\b/iu],
    ['mission-or-invitation', /\b(?:mission|assignment|contract|commission|invitation|job offer|deployment)\b/iu],
    ['commitment-or-debt', /\b(?:promise|agreement|deal|bargain|debt|favor owed|obligation)\b/iu],
    ['planned-journey-or-return', /\b(?:departure|journey|trip|passage|ticket|return to|visit to|route to)\b/iu],
]);
const DURABLE_HOOK_OPEN_STATE = /\b(?:sent|filed|filing|submitted|delivered|received|accepted|registered|stamped|tracking|reference|routed|routing|forwarded|forwarding|intake|pending|queued|await(?:ing)?|waiting|follow[ -]?up|scheduled|due|deadline|opened|ongoing|unresolved|undecided|outstanding|incomplete|not yet|assigned|commissioned|deployed|promised|agreed|owed|booked|reserved|planned|departing|returning|tomorrow|tonight|next (?:day|week|month)|(?:on|for|is) (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|would (?:decid(?:e|es)|answer|reply|respond)|bear fruit)\b|\b(?:remain(?:s|ed)? open|(?:is|stays?) active)\b|\b(?:want|wants|wish|wishes|hope|hopes|wait|waits|waiting)\b.{0,90}\b(?:decid(?:e|es)|answer|reply|respond|outcome|result)\b/iu;
const DURABLE_HOOK_TERMINAL_STATE = /\b(?:withdrawn|cancelled|canceled|rejected|denied|resolved|closed|completed|finished|fulfilled|repaid|released|approved|decided|concluded|arrived|returned)\b/giu;
const DURABLE_HOOK_IDENTITY_STOPWORDS = new Set([
    'about', 'accepted', 'after', 'again', 'against', 'agreed', 'and', 'await', 'awaiting', 'before', 'booked', 'cancelled', 'canceled',
    'closed', 'completed', 'decision', 'delivered', 'denied', 'filed', 'filing', 'follow', 'forwarded', 'from', 'into', 'later',
    'opened', 'pending', 'planned', 'received', 'reference', 'registered', 'rejected', 'remains', 'reply', 'resolved', 'response',
    'routed', 'routing', 'scheduled', 'sent', 'submitted', 'that', 'their', 'there', 'this', 'tracking', 'waiting', 'will', 'with',
    'letter', 'petition', 'appeal', 'application', 'request', 'appointment', 'hearing', 'panel', 'review', 'meeting', 'interview',
    'investigation', 'inquiry', 'search', 'order', 'case', 'file', 'evidence', 'trail', 'records', 'mission', 'assignment', 'contract',
    'commission', 'invitation', 'offer', 'deployment', 'promise', 'agreement', 'deal', 'bargain', 'debt', 'favor', 'owed', 'obligation',
    'departure', 'journey', 'trip', 'passage', 'ticket', 'return', 'visit', 'route', 'remained', 'still', 'the', 'under', 'while',
    'tell', 'tells', 'told', 'ask', 'asks', 'asked', 'think', 'thinks', 'thought', 'whether', 'what', 'when', 'where', 'which',
    'who', 'why', 'how', 'you', 'your', 'yours', 'our', 'ours', 'bear', 'bears', 'fruit', 'hope', 'hopes', 'expect', 'expects',
]);
const DURABLE_HOOK_LIFECYCLE = /\b(?:sent|filed|filing|submitted|delivered|received|accepted|registered|stamped|tracking|reference|routed|routing|forwarded|forwarding|intake|pending|queued|await(?:ing)?|waiting|follow[ -]?up|reply|response|answer|outcome|result|bear fruit|scheduled|due|deadline|opened|ongoing|unresolved|undecided|outstanding|incomplete|not yet|assigned|commissioned|deployed|promised|agreed|owed|booked|reserved|planned|departing|returning|tomorrow|tonight|next (?:day|week|month)|(?:on|for|is) (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|would (?:decid(?:e|es)|answer|reply|respond)|weeks?|months?|eventually|later)\b|\b(?:remain(?:s|ed)? open|(?:is|stays?) active)\b|\b(?:want|wants|wish|wishes|hope|hopes|wait|waits|waiting)\b.{0,90}\b(?:decid(?:e|es)|answer|reply|respond|outcome|result)\b/giu;
const DURABLE_HOOK_USER_INITIATIVE = /\b(?:i|we)\s+(?:sent|filed|submitted|delivered|asked|requested|promised|agreed|accepted|planned|scheduled|intend|hope|expect|wait|await)\b/iu;

function hookTypePattern(hookType) {
    return DURABLE_HOOK_TYPES.find(([type]) => type === hookType)?.[1];
}

function hookIdentityTerms(text, hookType) {
    const tokenize = value => String(value || '').toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
    return [...new Set(tokenize(text))]
        .filter(term => !DURABLE_HOOK_IDENTITY_STOPWORDS.has(term) && !/^\d+$/u.test(term))
        .slice(0, 10);
}

function hasUnnegatedTerminalState(text) {
    for (const match of String(text || '').matchAll(DURABLE_HOOK_TERMINAL_STATE)) {
        const prefix = String(text || '').slice(Math.max(0, match.index - 24), match.index).toLocaleLowerCase();
        if (!/\b(?:not|never|neither|nor|without|isn't|wasn't|hasn't|un)\s*$/u.test(prefix)) return true;
    }
    return false;
}

function hookSubject(text, hookType) {
    const cleaned = String(text || '').replace(/\s+/gu, ' ').trim();
    const pattern = hookTypePattern(hookType);
    const clauses = cleaned.replace(/([.!?])(["'”’)]*)\s+/gu, '$1$2\n')
        .split(/\n|\s+[—–|]\s+/u)
        .filter(Boolean);
    return (clauses.find(clause => pattern?.test(clause)) || cleaned)
        .replace(/^[A-Z0-9 -]{3,30}:\s*/u, '').trim().slice(0, 125);
}

function isReliableHookSubject(subject) {
    const value = String(subject || '').trim();
    if (!value || /(?:…|\.\.\.)/u.test(value)) return false;
    const straightQuotes = value.match(/"/gu)?.length || 0;
    const openCurlyQuotes = value.match(/“/gu)?.length || 0;
    const closeCurlyQuotes = value.match(/”/gu)?.length || 0;
    if (straightQuotes % 2 || openCurlyQuotes !== closeCurlyQuotes) return false;
    return !/\s[\p{L}\p{N}]\s*["'”’)]?$/u.test(value);
}

function isOpenDurableHookCandidate(candidate) {
    const hookType = asString(candidate?.hook_type);
    const text = asString(candidate?.content).trim();
    const pattern = hookTypePattern(hookType);
    if (!text || !pattern?.test(text)) return false;
    const originalSubject = hookSubject(text, hookType);
    const laterEvidence = asArray(candidate?.later_evidence).map(item => asString(item?.content));
    const laterOpenSubjects = laterEvidence.map(value => hookSubject(value, hookType))
        .filter(value => pattern.test(value) && DURABLE_HOOK_OPEN_STATE.test(value) && !hasUnnegatedTerminalState(value) && isReliableHookSubject(value));
    const subject = laterOpenSubjects.at(-1) || originalSubject;
    if (!pattern.test(subject) || !DURABLE_HOOK_OPEN_STATE.test(subject) || hasUnnegatedTerminalState(subject)) return false;
    if (laterEvidence.some(value => {
        const laterSubject = hookSubject(value, hookType);
        return pattern.test(laterSubject) && hasUnnegatedTerminalState(laterSubject);
    })) return false;
    if (!isReliableHookSubject(subject)) return false;
    return candidate?.role !== 'user' || !/^(?:please\s+)?(?:advance|skip|jump|fast[- ]?forward|move)\s+(?:to|ahead|forward)\b/iu.test(subject);
}

function durableHookExcerpt(value, limit = 420) {
    const cleaned = stripStructuredEvidence(stripLeadingGeneratedStatusSummary(value))
        .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/giu, ' ')
        .replace(/<stat>[\s\S]*?<\/stat>/giu, ' ')
        .replace(/<background_updates>[\s\S]*?<\/background_updates>/giu, ' ')
        .replace(/<living-world-guide>[\s\S]*?<\/living-world-guide>/giu, ' ')
        .replace(/\s+/gu, ' ')
        .trim();
    if (cleaned.length <= limit) return cleaned;
    const signal = /\b(?:petition|letter|appeal|application|request|panel|review|appointment|hearing|meeting|interview|investigation|inquiry|search|mission|assignment|contract|commission|invitation|deployment|promise|agreement|debt|obligation|journey|trip|passage|departure|return|filed|submitted|received|accepted|tracking|reference|intake|routing|pending|await(?:ing)?|reply|response|follow[ -]?up|scheduled|due|deadline|opened|ongoing|assigned|promised|agreed|owed|booked|reserved|planned)\b/giu;
    const windows = [...cleaned.matchAll(signal)].map(match => {
        const term = match[0];
        const priority = /^(?:petition|letter|appeal|application|panel|review|investigation|inquiry|mission|assignment|contract|invitation|promise|agreement|debt|journey|trip|passage|departure|return)$/iu.test(term) ? 3
            : /^(?:filed|submitted|received|accepted|tracking|reference|intake|routing|pending|scheduled|due|opened|assigned|promised|agreed|owed|booked|planned)$/iu.test(term) ? 2 : 1;
        return { start: Math.max(0, match.index - 45), end: Math.min(cleaned.length, match.index + term.length + 70), priority };
    });
    if (!windows.length) return compactMessageContent(cleaned, limit);
    const selected = [];
    for (const window of windows.sort((a, b) => b.priority - a.priority || a.start - b.start)) {
        if (selected.some(item => window.start <= item.end && window.end >= item.start)) continue;
        selected.push(window);
        if (selected.length >= 3) break;
    }
    const excerpt = selected.sort((a, b) => a.start - b.start)
        .map(window => cleaned.slice(window.start, window.end).trim())
        .join(' … ');
    return compactMessageContent(excerpt, limit);
}

function retrieveDormantHookEvidence(messages, recentStart, selectedIndexes, maxItems = 6) {
    if (recentStart <= 0) return [];
    const selected = selectedIndexes instanceof Set ? selectedIndexes : new Set(selectedIndexes || []);
    const records = [];
    // Later-state checks share one cleaned transcript instead of repeatedly
    // stripping every long message for each candidate on large rebuilds.
    const excerpts = messages.map(message => durableHookExcerpt(message?.mes, 420));
    for (let index = 0; index < recentStart; index++) {
        const message = messages[index];
        if (!message || selected.has(index)) continue;
        const content = excerpts[index];
        if (!content) continue;
        const types = DURABLE_HOOK_TYPES.filter(([, pattern]) => pattern.test(content)).map(([type]) => type);
        if (!types.length) continue;
        const lifecycleSignals = content.match(DURABLE_HOOK_LIFECYCLE)?.length || 0;
        const userInitiative = Boolean(message.is_user && DURABLE_HOOK_USER_INITIATIVE.test(content));
        const openQuestion = message.is_user && /\b(?:will|might|could|when|whether|what happens|bear fruit)\b/iu.test(content);
        if (!DURABLE_HOOK_OPEN_STATE.test(content) || hasUnnegatedTerminalState(content)) continue;
        const score = types.length * 1.5 + Math.min(4, lifecycleSignals) + (userInitiative ? 2 : 0) + (openQuestion ? 1 : 0) + index / Math.max(1, recentStart);
        records.push({ index, role: message.is_user ? 'user' : 'assistant', hook_type: types[0], content, score });
    }
    const limit = Math.max(1, Math.min(10, maxItems));
    // Rank only candidates that remain open after their later matching evidence
    // is audited. A louder but already closed route must never crowd out a
    // quieter established route from the same family.
    const ranked = records
        .map(record => attachLaterHookEvidence(record, messages, excerpts))
        .filter(isOpenDurableHookCandidate)
        .sort((a, b) => b.score - a.score || b.index - a.index);
    const chosen = [];
    // First preserve one strong candidate from each independent route family.
    // Otherwise many recent appointment mentions can crowd out a filed letter,
    // investigation, journey, or commitment before the planner can audit it.
    for (const [hookType] of DURABLE_HOOK_TYPES) {
        if (chosen.length >= limit) break;
        const candidate = ranked.find(record => record.hook_type === hookType);
        if (candidate && !chosen.includes(candidate)) chosen.push(candidate);
    }
    // Use remaining capacity for other strong, spatially distinct evidence.
    for (const record of ranked) {
        if (chosen.length >= limit) break;
        if (chosen.includes(record)) continue;
        chosen.push(record);
    }
    return chosen.sort((a, b) => a.index - b.index).map(({ score: _score, ...item }) => item);
}

function hookReferenceTokens(value) {
    return [...new Set(String(value || '').match(/\b(?=[\p{L}\p{N}-]{4,}\b)(?=[\p{L}\p{N}-]*\d)[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)+\b/giu) || [])]
        .map(token => token.toLocaleLowerCase());
}

function attachLaterHookEvidence(candidate, messages, excerpts = null) {
    const pattern = hookTypePattern(candidate?.hook_type);
    if (!pattern) return candidate;
    const identity = new Set(hookIdentityTerms(candidate.content, candidate.hook_type));
    const references = new Set(hookReferenceTokens(candidate.content));
    const later = [];
    for (let index = Number(candidate.index) + 1; index < messages.length; index++) {
        const message = messages[index];
        if (!message) continue;
        const content = excerpts?.[index] ?? durableHookExcerpt(message.mes, 360);
        if (!content || !pattern.test(content)) continue;
        const laterIdentity = hookIdentityTerms(content, candidate.hook_type);
        const overlap = laterIdentity.filter(term => identity.has(term)).length;
        const sharedReference = hookReferenceTokens(content).some(token => references.has(token));
        const requiredOverlap = identity.size >= 4 ? 2 : 1;
        if (!sharedReference && overlap < requiredOverlap) continue;
        later.push({ index, role: message.is_user ? 'user' : 'assistant', content });
    }
    return later.length ? { ...candidate, later_evidence: later.slice(-3) } : candidate;
}

/** Keep several kinds of durable hooks represented when prompt space is tight. */
function compactDormantHooks(items, limit, tokenLimit) {
    const source = asArray(items);
    const chosen = [];
    for (const [hookType] of DURABLE_HOOK_TYPES) {
        const candidate = source.findLast(item => item?.hook_type === hookType);
        if (candidate && !chosen.includes(candidate)) chosen.push(candidate);
        if (chosen.length >= limit) break;
    }
    for (const candidate of [...source].reverse()) {
        if (chosen.length >= limit) break;
        if (!chosen.includes(candidate)) chosen.push(candidate);
    }
    return chosen.sort((a, b) => Number(a.index) - Number(b.index))
        .map(item => ({ ...item, content: compactMessageContent(item.content, tokenLimit) }));
}

const PROMPT_EXTREME_CANON_INSTRUCTION = 'Explicit user/OOC facts remain authoritative even when extreme or unprecedented; averages are not ceilings. Apply relevant abilities and limits causally; never make traits decorative or manufacture equal odds. Unspecified details remain creative space. Keep all durable user-established constraints until corrected, but remove ordinary plot history and planner inference from canon constraints.';

function addStoryEvidence(payload, storyEvidence, budget) {
    payload.preparation_brief = 'Build from the wider setting, not only observed problems. For open-ended play, retain or create at least one concrete independent development: if the current investigation/problem vanished, it would still have its own motive, intermediate experiences and later possibilities. Another witness, book, carrier or destination for the same problem is not independent. Keep compatible unexplored material conditional; no previous mention is required. Keep its entry conditional, and do not require its use in the next reply. The lasting approach describes the wider RP and commitments, not the newest scene recap. Respect explicit user restrictions to a closed scenario.';
    payload.story_evidence = {
        instruction: 'Reconstruct the wider premise, accepted changes, durable commitments and independent people/processes before choosing the current scene focus. Indexed excerpts are partial past observations, not current facts: reconcile later corrections and resolutions. Read the current exchange for present state, not as the boundary of the whole story. The opening records original setup and era, subject to later explicit edits/corrections. Lore may concern other eras: it neither establishes current presence nor makes later canon a required future. Never infer that an event has already happened just because a biography describes its aftermath. On an empty history use supplied character/scenario/lore constraints and treat new preparation as invented possibilities; never fabricate a past.',
        opening: storyEvidence.opening,
        timeline: compactRebuildTimelineEvidence(storyEvidence.timeline, Math.max(400, Math.min(2400, budget * 0.22))),
        open_threads: compactDormantHooks(storyEvidence.openThreads, 6, Math.max(24, Math.min(110, Math.floor(budget * 0.05)))),
    };
}

// A separate model-facing path, not a smaller budget around the old reporting
// contract. Reuse evidence extraction, but never copy its policy/audit boards.
export function buildWorldPlannerPrompt(messages, state, note = '', bootstrap = {}, options = {}) {
    const s = normalizeState(state);
    const broad = options.incremental === false || options.bootstrapScan || options.fullRebuild;
    const storyEvidence = broad
        ? options.storyEvidence || options.historyCache?.get('story-evidence') || buildStoryEvidence(messages)
        : null;
    if (storyEvidence) options.historyCache?.set('story-evidence', storyEvidence);
    const evidenceQuery = storyEvidence ? storyEvidenceQuery(storyEvidence, bootstrap)
        : messages.slice(-4).map(message => message.mes).join('\n');
    const budget = Math.max(800, Number(options.effectivePromptTokens) || Number(options.maxPromptTokens) || 6000);
    const selected = selectMessages(messages, Math.min(Number(options.recentContextTokens) || 3000, budget * .6),
        Math.max(600, Number(options.messageTokenLimit) || 900), Math.min(3000, budget * .6), Boolean(options.bootstrapScan));
    const source = selected.map(({ index, kind, message, content }) => ({ index, kind,
        role: message?.is_user ? 'user' : 'assistant', name: compactText(message?.name, 100),
        content: typeof content === 'string' ? content : compactMessageContent(message?.mes, 900),
    }));
    const first = selected.filter(item => item.kind === 'recent')[0]?.index ?? messages.length;
    const witnesses = retrieveOlderHistoricalEvidence(messages, s, first, new Set(selected.map(item => item.index)), 2);
    const board = preparedWorldForPrompt(s.preparedWorld, { query: [note, ...messages.slice(-4).map(message => message?.mes || '')].join('\n') });
    const payload = {
        task: options.bootstrapScan || options.fullRebuild ? 'initialize_world_notebook' : broad ? 'review_wider_developments' : 'update_world_notebook',
        rp_reference: compactOptionalObject(bootstrap, 1800),
        player_controlled: playerCharacterName(messages) || 'The user controls their own character or side of the simulation.',
        constraints: { notes: s.userNotes, pacing: s.pacing.mode, canon: s.canonConstraints },
        ...(note ? { user_instruction: compactText(note, 1600) } : {}),
        notebook_view: { stored: s.plannerContract === 14 ? s.preparedWorld.items.length : 0, shown: s.plannerContract === 14 ? board.items.length : 0 },
        current: {
            memory: s.plannerMemory || s.contextLedger,
            preparedWorld: s.plannerContract === 14 ? { approach: board.approach, summary: board.summary, overview: board.overview, focus: board.focus, items: board.items.map(preparedRecordForPlanner) }
                : { approach: '', summary: '', overview: '', focus: [], items: [] },
            // One-time migration evidence, not ongoing mandatory maintenance.
            ...(s.plannerContract !== 14 ? { migration: 'The supplied memory came from a different planner and may be wrong. Reconstruct facts from actual observations. Its old next-reply proposals are archived separately, not tasks for you to perpetuate. Create a fresh lasting approach and directions from the RP itself.' } : {}),
        },
        summary_sources: compactSummarySources(options.summarySources || [], Math.min(Number(options.summaryContextTokens) || (broad ? 4000 : 1200), budget * .2), { query: evidenceQuery, broad, maxSources: broad ? 8 : 24 })
            .map(({ label, kind, text }) => ({ label, kind, text })),
        historical_evidence: witnesses.map(item => ({ index: item.index, role: item.role, content: item.content,
            ...(item.claim ? { claim_under_review: item.claim } : {}) })),
        messages: source,
    };
    if (storyEvidence) {
        addStoryEvidence(payload, storyEvidence, budget);
        payload.messages = payload.messages.filter(item => item.kind !== 'anchor');
    }
    const size = () => estimateTokenCount(JSON.stringify(payload));
    // Shed optional duplication before source or the active notebook. The full
    // state remains stored; a prompt omission never deletes it.
    while (size() > budget && payload.summary_sources.length) {
        if (!broad) { payload.summary_sources.pop(); continue; }
        const duplicate = payload.summary_sources.findLastIndex((source, index, all) => all.findIndex(item => item.kind === source.kind) !== index);
        if (duplicate < 0) break;
        payload.summary_sources.splice(duplicate, 1);
    }
    if (broad && size() > budget) {
        payload.summary_sources = payload.summary_sources.map(source => ({ ...source, text: relevantExcerpt(source.text, 160, evidenceQuery) }));
    }
    if (size() > budget && s.plannerContract === 14) {
        payload.current.preparedWorld.items = board.items.filter(item => board.focus.includes(item.id)).map(preparedRecordForPlanner);
        payload.current.preparedWorld.retained_index = board.items.filter(item => !board.focus.includes(item.id))
            .map(item => [item.id, item.status, item.premise]);
    }
    // Preserve the newest user/assistant pair and earlier whole witnesses.
    while (size() > budget && payload.messages.length > 2) payload.messages.shift();
    if (size() > budget && s.plannerContract === 14) {
        payload.current.preparedWorld.retained_index = board.items.filter(item => !board.focus.includes(item.id))
            .map(item => [item.id, item.status]);
    }
    if (size() > budget) payload.rp_reference = compactOptionalObject(bootstrap, 300);
    while (size() > budget && payload.historical_evidence.length) payload.historical_evidence.pop();
    if (size() > budget && s.plannerContract === 14) {
        payload.current.preparedWorld.items = [];
        payload.current.preparedWorld.retained_index = board.items.map(item => [item.id, item.status, item.premise]);
    }
    if (storyEvidence && size() > budget) {
        payload.story_evidence.timeline = compactRebuildTimelineEvidence(storyEvidence.timeline, Math.max(400, budget * .14));
        payload.story_evidence.open_threads = compactDormantHooks(storyEvidence.openThreads, 3, 40);
        payload.summary_sources = payload.summary_sources.map(source => ({ ...source, text: relevantExcerpt(source.text, 80, evidenceQuery) }));
    }
    // Keep supplied memory intact as reference, without asking to rewrite it.
    // If mandatory constraints + memory + newest evidence cannot fit, the
    // outer budget guard fails safely rather than silently erasing continuity.
    const { current, historical_evidence, messages: observations, ...reference } = payload;
    return JSON.stringify({ ...reference, current, historical_evidence, messages: observations });
}

export function buildAnalysisPrompt(messages, state, note = '', bootstrap = {}, options = {}) {
    const configuredBudget = Math.max(3000, Math.min(30000, Number(options.maxPromptTokens) || DEFAULT_PROMPT_TOKEN_BUDGET));
    const budget = Math.max(800, Math.min(configuredBudget, Number(options.effectivePromptTokens) || configuredBudget));
    const broad = options.incremental !== true || options.bootstrapScan || options.fullRebuild;
    const storyEvidence = broad
        ? options.storyEvidence || options.historyCache?.get('story-evidence') || buildStoryEvidence(messages)
        : null;
    if (storyEvidence) options.historyCache?.set('story-evidence', storyEvidence);
    const messageTokenLimit = Math.max(180, Math.min(1800, Number(options.messageTokenLimit) || 600));
    const recentTokens = Math.max(900, Math.min(12000, Number(options.recentContextTokens) || Math.floor(budget * 0.42)));
    const selected = selectMessages(messages, recentTokens, messageTokenLimit, Math.min(3000, recentTokens), Boolean(options.bootstrapScan));
    const playerName = playerCharacterName(messages);
    const latestMessageIndex = messages.length - 1;
    const newestAssistantIndex = messages.findLastIndex(message => !message?.is_user);
    const newestUserIndex = messages.findLastIndex(message => message?.is_user);
    const authoritativeAssistantStatus = newestAssistantIndex >= 0
        ? compactText(extractLeadingGeneratedStatusSummary(messages[newestAssistantIndex]?.mes), 1200)
        : '';
    const latestUserText = newestUserIndex >= 0
        ? compactMessageContent(messages[newestUserIndex]?.mes, 800)
        : '';
    const latestUserName = newestUserIndex >= 0
        ? compactText(messages[newestUserIndex]?.name, 120)
        : '';
    const authoritativeAssistantExcerpt = newestAssistantIndex >= 0
        ? compactMessageContent(messages[newestAssistantIndex]?.mes, 2200)
        : '';
    const authoritativeAssistantSource = newestAssistantIndex >= 0
        ? cleanMessageContent(messages[newestAssistantIndex]?.mes, { preserveLeadingStatus: true })
        : '';
    const authoritativeRelations = [...authoritativeAssistantSource.matchAll(new RegExp(KINSHIP_POSSESSIVE_PATTERN_SOURCE, 'giu'))]
        .map(match => match[0]);
    const retainedState = stateForPrompt(state, { query: messages.slice(-6).map(message => message?.mes || '').join('\n') });
    const evidenceQuery = storyEvidence ? storyEvidenceQuery(storyEvidence, bootstrap)
        : [...messages.slice(-4).map(message => message?.mes || ''), ...retainedState.entities.map(item => item.name)].join('\n');
    const currentPlannerTurn = retainedState.turnCount;
    const retainedCurrent = useSpecificPlayerName(options.incremental ? compactPromptStateForBudget(retainedState) : retainedState, playerName);
    const payload = {
        task: 'prepare_playable_world_and_future',
        instruction: options.incremental
            ? 'Update facts from the newest exchange, then sustain and enrich prepared material beyond this scene. Preserve unused developments; prepare concrete middles and future branches without forcing immediate uptake.'
            : 'Review the wider RP and its open creative space, prepare varied playable middles and future developments, and update a concise current factual context. Do not funnel everything into the newest topic.',
        authority: 'Explicit OOC/scenario commands and the latest user text outrank retained state and inference. Never define, modify, complete, or judge the player action, intent, response, consent, or inner state.',
        game_master_rule: PLANNER_AGENCY_RULE,
        actor_agency_rule: ACTOR_AGENCY_RULE,
        agency_audit_rule: AGENCY_AUDIT_RULE,
        world_start_rule: 'The beginning of the available transcript is only the beginning of observation, not the birth of the world. Treat every opening as in medias res: infer currently active people, relationships, institutions, systems, constraints, and environmental forces from the transcript, scenario, World Info, and retained evidence. Even on the first exchange, return useful present causal conditions; reduce confidence or scope when evidence is thin, but never return an empty world merely because the chat is new.',
        context_policy: DIRECTOR_POLICY,
        creative_preparation: 'Sustain prepared.overview and prepared.updates beyond the latest scene; concrete conditional developments are allowed. Return compact decisions, not deliberation.',
        simulation: 'Infer the active simulation scale on every pass and track the causal unit natural to it: people, relationships, households, groups, communities, settlements, organizations, institutions, resources, economies, infrastructure, environments, regions, countries, societies, ecosystems, and world forces. A subject may operate at more than one scale. For factual tracking, prioritize causally active domains. Prepared material can explore independent and not-yet-encountered domains without forcing a genre template. The persistent boards may be broad; context.conditions is only the 1–6 items relevant now.',
        adaptation_rule: 'Match resolution, cadence, and kinds of change to the current simulation. A conversation or chore may move minute by minute; a household or neighborhood by routines and days; a town through residents, services, supply, governance, infrastructure, culture, and surroundings; a country through populations, institutions, factions, production, logistics, diplomacy, security, and geography. These are examples, not mandatory checklists. Change scale smoothly when the user zooms between a person, place, organization, polity, or wider world, while retaining causal links across scales.',
        world_generation_rule: 'An under-specified world is open simulation space, not missing permission. Generate compatible new information when observation, inquiry, travel, creation, ordinary turnover, or a causal process makes it relevant. Prepare setting-native details for present or future opportunities: people, relationships, routines, locations, organizations, customs, goods, services, opportunities, problems, rumors, and discoveries. Preserve anything manifested in the transcript as fact. Before manifestation, keep consequential inventions labeled as conditional prepared proposals; do not retroactively invent decisive secrets, negate established facts, or flood a quiet scene with novelty.',
        opposition_rule: 'Model challenge as resistance from goals, scarcity, rules, tradeoffs, uncertainty, environment, institutions, or opposing actors and groups. Enemies are one optional form of opposition, not a required genre feature. New adversaries or threats need a setting-native motive, capability, constraint, and causal route; keep them as conditional prepared proposals until on-screen manifestation establishes them. Also simulate allies, neutral parties, opportunities, cooperation, recovery, and uneventful periods so the world does not become an escalation machine.',
        condition_rule: 'Each condition must name its actual subject and describe a durable present-state cause. Good conditions answer what the subject wants, believes, knows, can do, is constrained by, or is under pressure from. Do not write a proposed future action, next beat, exact event, dialogue, reveal, discovery, consequence, outcome, or instruction. Do not disguise a planned event with future tense. The main writing model chooses every concrete realization.',
        evidence_rule: 'confidence=established requires direct evidence. confidence=strong permits a well-supported causal inference. confidence=tentative is private scratchpad material and is automatically withheld from the provider. Newer explicit facts and corrections supersede all summaries and inference.',
        disclosure_rule: 'open means generally knowable in scene; limited means known only to relevant participants; private means it may shape behavior without being automatically revealed. Disclosure never commands a reveal.',
        relevance_rule: 'relevance is a private explanation for selecting the condition now. Do not assume that a condition is resolved because it was expressed, or escalate it because it was neglected. Change salience only from new evidence, elapsed time, dependency changes, or a real causal state change. Retrieve dormant actors or systems only when the current scene makes them relevant.',
        offscreen_rule: 'Maintain offscreen as a bounded complete board of relevant actors, relationships, groups, communities, institutions, systems, resources, environments, places, and situations. This is deferred debt, not continuous ticking: preserve an unobserved subject unchanged until the newest exchange makes it relevant again, an explicit material time skip occurs, or a dependency changes. Then settle only the plausible broad change already latent in its trajectory, append rather than replace settled history, and advance last_seen_turn. Never re-roll settled facts. Nothing much changing is valid. To retire a fully settled subject, first return it with motion=static and owed empty; it may be omitted on a later pass.',
        distance_rule: 'Distance controls resolution, not importance: present and near subjects may be specific; distant subjects get broad strokes; remote subjects remain rumour-level, incomplete, and possibly outdated. After more than about fourteen days without reliable contact, cap the settlement at remote resolution unless the transcript supplies a trustworthy nearer witness. Do not grant the player omniscient knowledge of a private settlement.',
        pressure_rule: 'owed records a plausible undelivered consequence, not an event queue or deadline. Wider-world pressure may remain silent, color description or NPC subtext, complicate existing activity, or arrive openly only when causal access and scene scale support it. A quiet scene still progresses through its current activity, relationships, understanding, or immediate circumstances. Never interrupt merely because a subject was ignored or because time passed.',
        scene_scale_rule: 'Support meaningful development without requiring a scene ending, compulsory progress on every reply, or another player command. Genuine pending choices and quiet endings remain valid. Calibrate that movement and any challenge to the actual setting and activity. Task-native progress, NPC decisions or actions, compatible new information, disclosures, consequences, discoveries, opportunities, and environmental changes all qualify when fitting. Dialogue qualifies when it changes what is known, decided, possible, or underway. Challenge can be social, intellectual, bureaucratic, material, emotional, environmental, or physical; combat is only one possibility. Context creates possibilities, never guarantees. Current scene-fit fields are provisional, not permanent locks. Introduce prepared material only when its causal entry fits the actual exchange; allow reaction before contestable consequences and never force a derailment for novelty. The latest explicit user/OOC request to stay, skip, or advance outranks all optional pressure.',
        repetition_rule: 'Use response_audit and retained responsePatternMemory to avoid repeating the same presentation, escalation, arrival, dialogue shape, or emotional turn. Vary realization only through supported causes; choosing no new event is always allowed.',
        horizon_rule: 'The legacy horizon board holds private hypotheses, not a delivery queue. Use prepared for concrete middle and longer-range possibilities that may reach the writer conditionally; none are promised outcomes or fixed plot.',
        motive_rule: 'Maintain the separate private hidden-motive board as ranked hypotheses. It can preserve bold specific explanations, but a likely motive is not canon. Retire or revise only when evidence changes; irrelevance may make an item dormant without resolving it.',
        contribution_rule: 'Set context.inject=true and provide 1–6 concise conditions, normally 3–6 when evidence supports them. At least one must be established or strong. Favor a useful mix rather than exhaustive lore. The factual slice exposes subjects and conditions, not internal ids, confidence, relevance, basis or rankings. Separately, prepared supplies the wider overview and selected conditional developments.',
        situation_rule: 'Maintain 0–6 private optional situations suited to genre, setting, era, location, and activity. Use cause -> present circumstance -> possible entry. Challenges, opportunities, discoveries, encounters, and open quest-hooks are valid. Observation, NPC initiative, and established causal processes may make them relevant without player engagement. An established activity can proceed without the player; an unintroduced possibility is not a scheduled event. Never require player actions, outcomes, reveals, or sequences; preserve quiet scenes. Original inventions stay optional until manifested. Use stable ids and retire contradicted or irrelevant items.',
        response_audit_rule: 'Privately audit only the newest assistant reply for repetition, unjustified escalation, player control, continuity drift, and whether it made meaningful movement. Meaningful movement is an observable change in activity, behavior, understanding, options, or circumstances that carries the situation forward at its natural scale. The audit informs future selection but never mechanically marks a condition resolved or forces regeneration.',
        transcript_head: {
            message_count: messages.length,
            latest_message_index: latestMessageIndex,
            latest_message_role: latestMessageIndex < 0 ? 'none' : messages[latestMessageIndex]?.is_user ? 'user' : 'assistant',
            newest_assistant_index: newestAssistantIndex,
            newest_user_index: newestUserIndex,
            authoritative_assistant_status: authoritativeAssistantStatus || undefined,
            latest_user_name: latestUserName || undefined,
            latest_user_text: latestUserText || undefined,
            authoritative_assistant_excerpt: authoritativeAssistantExcerpt || undefined,
            authoritative_relations: authoritativeRelations.length ? [...new Set(authoritativeRelations)] : undefined,
            attribution_rule: 'Resolve identities, group membership, relationships and quantities from specific source observations, preserving both shared identities and distinct people. Track relationships by their participants, not by relation category alone. Attribute each action and proposal to its source. Correct only evidence-backed errors, never globally rename relatives or speakers.',
            rule: 'messages is chronological and the highest index is newest. Audit only newest_assistant_index. Preserve speakers, actors, owners and sources exactly. Status headers are fallible summaries: direct, specific story observations outrank conflicting summary labels, even when the label is repeated later. New events can change an earlier state; repetition alone cannot. Explicit user/OOC corrections take priority. Copy explicit current time/place unless contradicted by stronger evidence; infer neither a time skip nor a new location from activity. A higher-index assistant reply may already have answered the newest user text.',
        },
        planner_clock: {
            previous_turn: currentPlannerTurn,
            output_turn: currentPlannerTurn + 1,
            rule: 'Use output_turn for last_seen_turn only when this pass observes or settles that subject. Otherwise preserve its previous last_seen_turn. settled_through is the newest turn through which the board was actually settled, not a timer.',
        },
        retained_state_rule: 'current is a fallible draft from before this analysis. Compare retained claims with direct source observations, not with another summary as proof. New events and explicit corrections update earlier facts; repeated unsupported labels do not. Correct contradictions throughout facts and preparation, including old entries still being retained. Compare historical claim_under_review with its source content. Remove obsolete prerequisites and completed beats.',
        current: retainedCurrent,
        messages: selected.map(({ index, kind, message, content }) => ({
            index, kind, role: message?.is_user ? 'user' : 'assistant', name: compactText(message?.name, 100),
            content: kind === 'recent' && typeof content === 'string' ? content : compactMessageContent(message?.mes, messageTokenLimit, {
                latest: index === latestMessageIndex || index === newestAssistantIndex,
                preserveLeadingStatus: index === newestAssistantIndex,
            }),
        })),
    };
    const recentStart = selected.filter(item => item.kind === 'recent')[0]?.index ?? messages.length;
    if (storyEvidence) {
        addStoryEvidence(payload, storyEvidence, budget);
        // The chronological map replaces blind anchor samples.
        payload.messages = payload.messages.filter(item => item.kind !== 'anchor');
    }
    const historyKey = `${recentStart}:${selected.map(item => item.index).join(',')}:${Boolean(options.incremental)}`;
    const historical = options.historyCache?.get(historyKey)
        || retrieveOlderHistoricalEvidence(messages, state, recentStart, new Set(selected.map(item => item.index)), options.incremental ? 2 : 4);
    options.historyCache?.set(historyKey, historical);
    if (historical.length) {
        payload.historical_evidence = historical.map(item => ({ index: item.index, role: item.role, name: compactText(messages[item.index]?.name, 100),
            ...(item.claim ? { claim_under_review: item.claim } : {}), content: item.content }));
        payload.historical_evidence_rule = 'Earlier indexed observations, not simultaneous current states. claim_under_review is fallible retained planner text: compare it with the source content and correct contradictions throughout facts and preparation. New events and explicit corrections can change earlier facts; later summary repetition cannot override direct evidence. A past refusal, departure, promise, or return is not permission to invent a new action.';
    }
    const offscreenDebt = formatDriftRequest(retainedState.offscreenWorld, {
        currentTurn: currentPlannerTurn,
        elapsed: retainedState.offscreenWorld?.elapsed,
    });
    if (offscreenDebt) payload.offscreen_debt = offscreenDebt;
    if (options.incremental) {
        // Static guidance already lives in the cached system prompt. Spend the
        // routine input on story evidence, not a second copy of those rules.
        for (const key of Object.keys(payload)) {
            if (key.endsWith('_rule') && key !== 'retained_state_rule') delete payload[key];
        }
        delete payload.context_policy;
        delete payload.authority;
        delete payload.simulation;
        delete payload.offscreen_debt;
        payload.fast_rules = 'Return only changed offscreen subjects and changed hidden-motive hypotheses; empty arrays preserve prior records. Use stable ids and change=retire for a disproven motive. Relevance is not resolution. Archived witnesses are past observations, not simultaneous current states; newer explicit corrections win. Settle only relevant debt, using vague and possibly outdated detail for remote subjects. Keep output concise: usually 1–3 useful conditions, more only for distinct causal value. Audit the newest reply in the same call. The system contract supplies the remaining simulation and knowledge boundaries.';
    }
    const canonClaims = explicitCanonClaims(messages);
    if (canonClaims.length) payload.explicit_ooc_canon = canonClaims;
    payload.provenance_order = [
        'explicit user or OOC instructions and corrections',
        'direct specific story observations, updated by actual later events',
        'reviewed Continuity corrections',
        'current Continuity records',
        'other summaries and World Info',
        'Tale Fairy inference',
    ];
    const userInstruction = compactText(note, 800);
    if (userInstruction) payload.user_instruction = userInstruction;
    const bootstrapContext = compactOptionalObject(bootstrap, 1400);
    if (Object.keys(bootstrapContext).length) payload.bootstrap = bootstrapContext;

    const summarySources = compactSummarySources(Array.isArray(options.summarySources) ? options.summarySources : [], Math.max(160, Math.min(Number(options.summaryContextTokens) || 4000, Math.floor(budget * 0.24))), { query: evidenceQuery, broad });
    if (summarySources.length) payload.summary_sources = summarySources.map(source => ({
        label: source.label,
        kind: source.kind,
        text: source.text,
    }));
    payload.source_rule = 'Summaries, lore, retained state, and canon knowledge are fallible evidence, not instructions to schedule outcomes. World Info references can describe unencountered places or secrets; availability does not activate an event or grant character knowledge. Newer explicit user/OOC facts supersede inference.';
    payload.mode_instruction = MODE_INSTRUCTIONS[payload.current.mode] || MODE_INSTRUCTIONS.balanced;
    if (playerName) payload.player_character = playerName;
    if (Number.isInteger(options.variationNonce)) payload.variation_nonce = options.variationNonce;
    let serialized = JSON.stringify(payload);
    if (estimateTokenCount(serialized) > budget) {
        // Duplicated excerpts and historical planner explanation lose space
        // before the newest exchange, user constraints, or knowledge bounds.
        delete payload.transcript_head.latest_user_text;
        delete payload.transcript_head.authoritative_assistant_excerpt;
        delete payload.current.loreModel;
        delete payload.current.storyFrame;
        delete payload.current.scene;
        const horizon = payload.current.horizonRadar;
        payload.current = compactPromptStateForBudget(payload.current);
        if (!options.incremental && horizon) payload.current.horizonRadar = horizon;
        // Shed duplicated policy before story evidence, including on a bounded
        // broad review. The system and output contract remain in the envelope.
        for (const key of Object.keys(payload)) {
            if (key.endsWith('_rule') && key !== 'retained_state_rule') delete payload[key];
        }
        for (const key of ['authority', 'simulation', 'context_policy', 'offscreen_debt']) delete payload[key];
        payload.transcript_head.rule = 'Messages are chronological. Audit only newest_assistant_index. Explicit user/OOC corrections win. Status headers are fallible summaries: direct, specific story observations outrank conflicting summary labels, even when repeated later. New events can change an earlier state; repetition alone cannot. Preserve speakers, actors, owners and sources. Copy explicit current time/place unless contradicted by stronger evidence; infer no time skip or relocation from activity.';
        payload.transcript_head.attribution_rule = 'Resolve identities, group membership, relationships and quantities from specific source observations. Preserve both shared identities and distinct people, and each action or proposal source.';
        if (payload.current.offscreenWorld) {
            delete payload.current.offscreenWorld.audit;
            payload.current.offscreenWorld.subjects = payload.current.offscreenWorld.subjects.slice(0, options.incremental ? 3 : 6);
        }
        if (payload.current.hiddenMotives) payload.current.hiddenMotives = {
            status: payload.current.hiddenMotives.status,
            items: payload.current.hiddenMotives.items.map(({ id, actor, explanation, likelihood, evidence, counterevidence, currentRelevance }) =>
                ({ id, actor, explanation, likelihood, evidence: evidence.slice(-1), counterevidence: counterevidence.slice(-1), currentRelevance })),
        };
        payload.current.preparedWorld = compactPreparedForPrompt(payload.current.preparedWorld);
        delete payload.current.responseAudit;
        if (payload.current.causalContext) payload.current.causalContext = {
            conditions: (payload.current.causalContext.conditions || []).slice(0, 3).map(({ id, kind, relevance, ...condition }) => condition),
        };
        // Empty compatibility containers do not help reconstruct this scene.
        for (const [key, value] of Object.entries(payload.current)) {
            if (value === '' || Array.isArray(value) && !value.length) delete payload.current[key];
        }
        serialized = JSON.stringify(payload);
    }
    if (estimateTokenCount(serialized) > budget && payload.summary_sources) {
        payload.summary_sources = compactSummarySources(payload.summary_sources, broad ? Math.max(500, Math.floor(budget * 0.16)) : 500, { maxSources: broad ? 8 : 3, query: evidenceQuery, broad }).map(source => ({ label: source.label, kind: source.kind, text: source.text }));
        serialized = JSON.stringify(payload);
    }
    // Omitted records survive locally. Spend a tight routine budget on the
    // latest exchange and the highest-ranked retrieved witnesses, rather than
    // repeating entire boards and then truncating the new evidence to nothing.
    for (const key of ['continuityThreads', 'causalContext', 'contextLedger']) {
        if (estimateTokenCount(serialized) <= budget) break;
        delete payload.current[key];
        serialized = JSON.stringify(payload);
    }
    for (const items of [payload.current.hiddenMotives?.items, payload.current.offscreenWorld?.subjects, payload.current.offscreenWorld?.archive]) {
        while (items?.length > 1 && estimateTokenCount(serialized) > budget) {
            items.pop();
            serialized = JSON.stringify(payload);
        }
    }
    // Retained optional boards must not crowd out the exchange that can correct
    // them. Their omitted records survive locally for later retrieval.
    for (const key of ['hiddenMotives', 'offscreenWorld', 'horizonRadar', 'responsePatternMemory', 'loreModel', 'sceneProfile']) {
        if (estimateTokenCount(serialized) <= budget) break;
        delete payload.current[key];
        serialized = JSON.stringify(payload);
    }
    for (const key of ['fast_rules', 'creative_preparation', 'provenance_order']) {
        if (estimateTokenCount(serialized) <= budget) break;
        delete payload[key];
        serialized = JSON.stringify(payload);
    }
    // Evidence comes before a verbose interpretation of it. Preserve complete
    // premise/hold boundaries instead of clipping their clauses to make room.
    // This working index is a delta target, not a replacement for stored data.
    if (estimateTokenCount(serialized) > budget && payload.current.preparedWorld) {
        const board = preparedWorldForPrompt(normalizeState(state).preparedWorld, { query: evidenceQuery });
        payload.current.preparedWorld = {
            summary: board.summary,
            overview: board.overview,
            focus: board.focus,
            items: board.items.map(({ id, status, origin, premise, hold }) => ({ id, status, origin, premise, hold })),
        };
        serialized = JSON.stringify(payload);
    }
    // The old status already has an authoritative successor in transcript_head.
    // Per-actor interpretations remain fallible and are sufficient delta targets.
    if (estimateTokenCount(serialized) > budget && payload.current.entities) {
        payload.current.entities = payload.current.entities.map(({ name, state, location, constraints }) => ({ name, state, location, constraints }));
        delete payload.current.scene;
        delete payload.current.storyFrame;
        serialized = JSON.stringify(payload);
    }
    while (estimateTokenCount(serialized) > budget && payload.messages.length > 1) {
        const removableIndex = payload.messages.findIndex(message => message.index !== latestMessageIndex && message.index !== newestAssistantIndex && message.index !== newestUserIndex);
        if (removableIndex < 0) break;
        payload.messages.splice(removableIndex, 1);
        serialized = JSON.stringify(payload);
    }
    // Selection happened before budget compaction. Re-run witness retrieval
    // over newly omitted turns; otherwise an important recent contradiction is
    // excluded from BOTH messages and history simply because it was selected
    // initially. Never treat the retained notebook as its own evidence.
    let witnessedStart = recentStart;
    while ((payload.messages[0]?.index ?? messages.length) > witnessedStart) {
        const retainedStart = payload.messages[0]?.index ?? messages.length;
        const key = `compacted:${retainedStart}:${payload.messages.map(item => item.index).join(',')}:${options.incremental ? 2 : 4}`;
        const witnesses = options.historyCache?.get(key) || retrieveOlderHistoricalEvidence(
            messages, state, retainedStart, new Set(payload.messages.map(item => item.index)), options.incremental ? 2 : 4);
        options.historyCache?.set(key, witnesses);
        payload.historical_evidence = witnesses.map(item => ({ index: item.index, role: item.role,
            name: compactText(messages[item.index]?.name, 100),
            ...(item.claim ? { claim_under_review: item.claim } : {}), content: item.content }));
        serialized = JSON.stringify(payload);
        witnessedStart = retainedStart;
        // Pay for retrieved corrections with older ordinary excerpts before
        // discarding those corrections again in the final fit.
        while (estimateTokenCount(serialized) > budget && payload.messages.length > 1) {
            const removable = payload.messages.findIndex(message => message.index !== latestMessageIndex && message.index !== newestAssistantIndex && message.index !== newestUserIndex);
            if (removable < 0) break;
            payload.messages.splice(removable, 1);
            serialized = JSON.stringify(payload);
        }
    }
    if (estimateTokenCount(serialized) > budget) {
        payload.current.contextLedger = truncateToTokenBudget(payload.current.contextLedger || '', 120);
        if (!broad) delete payload.bootstrap;
        else payload.bootstrap = compactOptionalObject(payload.bootstrap, 280);
        serialized = JSON.stringify(payload);
    }
    // The same newest exchange also remains in messages. On deliberately tiny
    // budgets, retain compact source attribution without duplicating prose.
    if (estimateTokenCount(serialized) > budget) {
        delete payload.transcript_head.latest_user_text;
        delete payload.transcript_head.authoritative_assistant_excerpt;
        serialized = JSON.stringify(payload);
    }
    // These reminders duplicate the system prompt and are the safest material
    // to shed when the caller explicitly supplies a very small prompt budget.
    for (const key of ['calibration', 'scale_fields', 'simulation', 'adaptation_rule', 'world_generation_rule', 'opposition_rule', 'direction_policy', 'authority', 'invention', 'motive_rule', 'horizon_rule', 'movement', 'distance_rule', 'repetition_rule']) {
        if (estimateTokenCount(serialized) <= budget) break;
        delete payload[key];
        serialized = JSON.stringify(payload);
    }
    // Last-resort reductions protect the current exchange and actor boundaries
    // ahead of optional boards. Never erase every actor to retain old prose.
    for (const key of ['hiddenMotives', 'offscreenWorld', 'horizonRadar', 'responsePatternMemory', 'loreModel', 'sceneProfile']) {
        if (estimateTokenCount(serialized) <= budget) break;
        delete payload.current[key];
        serialized = JSON.stringify(payload);
    }
    if (estimateTokenCount(serialized) > budget && payload.current.entities?.length) {
        payload.current.entities = payload.current.entities.slice(0, 3).map(({ name, state, motivation, constraints, agenda }) => ({ name, state, motivation, constraints, agenda }));
        serialized = JSON.stringify(payload);
    }
    for (const key of ['summary_sources', 'historical_evidence']) {
        const floor = broad && key === 'summary_sources' ? new Set((payload[key] || []).map(item => item.kind)).size : 0;
        while (estimateTokenCount(serialized) > budget && payload[key]?.length > floor) {
            payload[key].pop();
            serialized = JSON.stringify(payload);
        }
    }
    while (estimateTokenCount(serialized) > budget && payload.current.entities?.length > 1) {
        payload.current.entities.pop();
        serialized = JSON.stringify(payload);
    }
    // Trim the largest excerpt, not blindly the first (often the player's
    // entire action). Keep both roles, attribution, and sampled beginning/end.
    for (let attempt = 0; attempt < 8 && estimateTokenCount(serialized) > budget; attempt++) {
        const message = [...payload.messages].sort((a, b) => estimateTokenCount(b.content) - estimateTokenCount(a.content))[0];
        if (!message || estimateTokenCount(message.content) <= 80) break;
        const limit = Math.max(80, estimateTokenCount(message.content) - (estimateTokenCount(serialized) - budget) - 16);
        message.content = compactMessageContent(message.content, limit);
        serialized = JSON.stringify(payload);
    }
    if (storyEvidence && estimateTokenCount(serialized) > budget) {
        payload.story_evidence.timeline = compactRebuildTimelineEvidence(storyEvidence.timeline, Math.max(400, budget * 0.14));
        payload.story_evidence.open_threads = compactDormantHooks(storyEvidence.openThreads, 3, 40);
        if (payload.summary_sources) payload.summary_sources = payload.summary_sources.map(source => ({
            ...source, text: relevantExcerpt(source.text, 80, evidenceQuery),
        }));
        serialized = JSON.stringify(payload);
    }
    // End with observations, not yesterday's interpretation: the draft supplies
    // update targets, while chronological source evidence gets the final word.
    // Keep the public payload keys stable for recovery and source proofs.
    const { current, messages: observations, historical_evidence, ...policy } = payload;
    return JSON.stringify({ ...policy, current,
        ...(historical_evidence ? { historical_evidence } : {}), messages: observations });
}
function mergePlanHorizons(previous, proposed) {
    if (!previous?.items?.length || proposed.items.length < 6) return proposed;
    const deviation = proposed.deviation.level;
    const merged = [];
    for (const candidate of proposed.items) {
        // Provider-generated IDs are labels, not globally stable identities.
        // Never revive an old route merely because a later pass reused its ID
        // for a different branch; that can overwrite a genuinely independent
        // route and duplicate another current horizon.
        const candidateBranch = String(candidate.branch || '').trim().toLocaleLowerCase();
        const prior = previous.items.find(item => item.id && item.id === candidate.id
            && candidateBranch
            && String(item.branch || '').trim().toLocaleLowerCase() === candidateBranch);
        let selected = candidate;
        if (prior && candidate.change === 'keep') selected = prior;
        else if (prior && candidate.change !== 'replace') {
            const stability = prior.stability || candidate.stability;
            if (stability === 'adaptive' && deviation === 'none') selected = prior;
            if ((stability === 'stable' || stability === 'slow') && deviation === 'none') selected = prior;
        }
        // A retained stable route must not collide with a distinct current
        // route. Prefer the current proposal when retention would duplicate it.
        if (merged.some(existing => existing.direction.trim().toLocaleLowerCase() === selected.direction.trim().toLocaleLowerCase()
            || repeatsHorizonRoute(selected, existing))) {
            selected = candidate;
        }
        if (!merged.some(existing => existing.direction.trim().toLocaleLowerCase() === selected.direction.trim().toLocaleLowerCase()
            || repeatsHorizonRoute(selected, existing))) {
            merged.push(selected);
        }
    }
    return { ...proposed, items: merged };
}

function mergePathways(previous = [], proposed = []) {
    return proposed.flatMap(candidate => {
        if (candidate.change === 'retire') return [];
        const prior = previous.find(item => item.id && item.id === candidate.id);
        if (candidate.change === 'keep' && prior) return [{ ...prior, status: candidate.status }];
        return [candidate];
    }).slice(0, 8);
}

function mergeActorUpdate(existing, update) {
    const merged = { ...existing, ...update };
    // Structured providers require every string field, even for a partial
    // update. Empty/unknown is not evidence that a departure or boundary ended.
    // An actual change is expressed positively (e.g. "returned to the shop",
    // "no longer committed to the patrol"), not by silently erasing memory.
    for (const key of ['state', 'location', 'perspective', 'motivation', 'knowledge', 'constraints', 'agenda', 'window']) {
        if (!String(update?.[key] ?? '').trim()) merged[key] = update.clear_fields?.includes(key) ? '' : existing[key] || '';
    }
    delete merged.clear_fields;
    return merged;
}

function upsertByKey(previous, updates, key) {
    const items = [...previous];
    for (const update of updates) {
        const identity = String(update?.[key] || '').trim().toLocaleLowerCase();
        if (!identity) continue;
        const index = items.findIndex(item => String(item?.[key] || '').trim().toLocaleLowerCase() === identity);
        if (update.op === 'retire') {
            if (index >= 0) items.splice(index, 1);
        } else if (index >= 0) items[index] = { ...items[index], ...update };
        else items.push(update);
    }
    return items;
}

function applyIncrementalAnalysis(next, value, messages) {
    const current = value.current || {};
    const context = value.context || {};
    next.storyFrame = {
        ...next.storyFrame,
        frame: String(current.frame || next.storyFrame.frame || 'grounded').slice(0, 40),
        basis: String(current.frame_basis || next.storyFrame.basis || '').slice(0, 240),
    };
    next.scene = {
        ...next.scene,
        status: String(current.status || '').slice(0, 300),
        activity: String(current.activity || '').slice(0, 300),
        pace: String(current.phase || 'developing').slice(0, 80),
        intent: String(context.conditions?.[0]?.condition || '').slice(0, 300),
        location: String(current.location || '').slice(0, 200),
        time: String(current.time || '').slice(0, 160),
        loop: current.loop === true,
    };
    next.sceneProfile = normalizeState({ sceneProfile: {
        promise: current.scene_promise,
        phase: current.phase,
        emotional_direction: current.emotional_direction,
        pressure: current.pressure,
        intrusion: current.intrusion,
        novelty_ceiling: current.novelty_ceiling,
        basis: current.frame_basis,
    } }).sceneProfile;
    next.causalContext = normalizeState({ causalContext: context }).causalContext;
    if (Array.isArray(value.situations)) next.situationBoard = mergeSituationUpdates(next.situationBoard, value.situations, { currentTurn: next.turnCount + 1, full: false });
    next.situationBoard = retireManifestedSituations(next.situationBoard, messages);
    // Legacy in-flight passes did not audit replies; never fabricate an audit
    // for them. Every new incremental pass closes the feedback loop.
    if (value.response_audit) {
        next.responseAudit = normalizeState({ responseAudit: value.response_audit }).responseAudit;
        next.responsePatternMemory = [...new Set([...next.responsePatternMemory, ...next.responseAudit.patterns])].slice(-12);
    }
    if (value.offscreen) next.offscreenWorld = mergeOffscreenWorld(next.offscreenWorld, value.offscreen, { currentTurn: next.turnCount + 1 });
    next.narrativeLayers = normalizeState({ narrativeLayers: {
        ...next.narrativeLayers,
        immediate_action: current.immediate_action,
        local_activity: current.activity,
        situation: current.situation,
    } }).narrativeLayers;
    const threadUpdates = asArray(value.thread_updates).map(update => ({ ...update }));
    next.continuityThreads = normalizeState({ continuityThreads: upsertByKey(next.continuityThreads, threadUpdates, 'id') }).continuityThreads;
    const proposedMotives = normalizeState({ hiddenMotives: {
        status: value.hidden_motives?.status,
        items: asArray(value.hidden_motives?.items).map(motive => ({
            ...motive,
            currentRelevance: motive.current_relevance,
            counterevidence: motive.counterevidence,
        })),
        audit: value.hidden_motives?.audit,
    } }).hiddenMotives;
    const previousMotives = next.hiddenMotives;
    const previousMotivesById = new Map(previousMotives.items.map(motive => [motive.id.toLocaleLowerCase(), motive]));
    proposedMotives.items = proposedMotives.items.map(motive => {
        const previous = previousMotivesById.get(motive.id.toLocaleLowerCase());
        return motive.change === 'keep' && previous
            ? { ...previous, ...motive, evidence: motive.evidence.length ? motive.evidence : previous.evidence, counterevidence: motive.counterevidence.length ? motive.counterevidence : previous.counterevidence, change: 'keep' }
            : motive;
    });
    next.hiddenMotives = proposedMotives;
    if (value.contract_version === 13) {
        const changedIds = new Set(asArray(value.hidden_motives?.items).map(item => String(item.id).trim().toLocaleLowerCase()));
        next.hiddenMotives.items = [...proposedMotives.items.filter(item => item.change !== 'retire'),
            ...[...previousMotivesById.values()].filter(item => !changedIds.has(item.id.toLocaleLowerCase()))].slice(0, 6);
        next.hiddenMotives.status = next.hiddenMotives.items.length ? (proposedMotives.status === 'none' ? previousMotives.status : proposedMotives.status) : 'none';
        if (!changedIds.size && !proposedMotives.audit) next.hiddenMotives.audit = previousMotives.audit;
    }
    const actorUpdates = asArray(value.actor_updates).map(update => {
        const existing = next.entities.find(item => item.name.toLocaleLowerCase() === String(update?.name || '').trim().toLocaleLowerCase()) || {};
        return {
            ...mergeActorUpdate(existing, update),
            relevance: existing.relevance || 'current causal actor',
            confidence: existing.confidence || next.storyFrame.confidence || 'low',
        };
    });
    next.entities = normalizeState({ entities: upsertByKey(next.entities, actorUpdates, 'name') }).entities;
    for (const claim of explicitCanonClaims(messages)) {
        if (!next.canonConstraints.some(item => item.toLocaleLowerCase() === claim.toLocaleLowerCase())) next.canonConstraints.push(claim);
    }
    next.canonConstraints = next.canonConstraints.slice(-12);
    next.objectives = [];
    next.possibilities = [];
    next.pathways = [];
    next.nextGuides = [];
    next.planHorizons = { items: [], deviation: { level: 'none', reason: '' } };
    next.narrativeEvents = [];
    next.guidance = '';
    next.lastInject = next.causalContext.inject;
    next.lastReason = String(value.audit || context.basis || '').trim().slice(0, 500);
    if (typeof value.ledger === 'string' && value.ledger.trim()) next.contextLedger = value.ledger.trim().slice(0, 3000);
    next.lastAnalysisFingerprint = fingerprintMessages(messages);
    next.sourceMessageCount = messages.length;
    next.ledgerMessageCount = messages.length;
    next.ledgerUpdatedAt = Date.now();
    next.lastAnalyzedAt = Date.now();
    next.canonBootstrapPending = false;
    next.turnCount += 1;
    return next;
}

function applyBeatAnalysis(next, value, messages) {
    const current = value.current || {};
    const context = value.context || {};
    const world = value.world || {};
    next.storyFrame = { frame: String(current.frame || 'grounded').slice(0, 40), confidence: String(world.confidence || 'low').slice(0, 40), basis: String(current.frame_basis || '').slice(0, 240) };
    next.scene = {
        ...next.scene,
        status: String(current.status || '').slice(0, 300), activity: String(current.activity || '').slice(0, 300),
        pace: String(current.phase || 'developing').slice(0, 80), intent: String(context.conditions?.[0]?.condition || '').slice(0, 300),
        location: String(current.location || '').slice(0, 200), time: String(current.time || '').slice(0, 160), loop: current.loop === true,
    };
    next.sceneProfile = normalizeState({ sceneProfile: {
        promise: current.scene_promise, phase: current.phase, emotional_direction: current.emotional_direction,
        pressure: current.pressure, intrusion: current.intrusion, novelty_ceiling: current.novelty_ceiling, basis: current.frame_basis,
    } }).sceneProfile;
    next.responseAudit = normalizeState({ responseAudit: value.response_audit }).responseAudit;
    next.responsePatternMemory = [...new Set([...next.responsePatternMemory, ...next.responseAudit.patterns])].slice(-12);
    if ([8, 9, 12].includes(value.contract_version)) {
        const proposed = normalizeState({ horizonRadar: {
            status: value.horizon?.status,
            seeds: asArray(value.horizon?.seeds).map(seed => ({ ...seed, presentRelation: seed.present_relation })),
            audit: value.horizon?.audit,
        } }).horizonRadar;
        const previousById = new Map(next.horizonRadar.seeds.map(seed => [seed.id.toLocaleLowerCase(), seed]));
        proposed.seeds = proposed.seeds.map(seed => {
            const previous = previousById.get(seed.id.toLocaleLowerCase());
            return seed.change === 'keep' && previous
                ? { ...previous, presentRelation: seed.presentRelation, basis: seed.basis, change: 'keep' }
                : seed;
        });
        next.horizonRadar = proposed;
        const proposedMotives = normalizeState({ hiddenMotives: {
            status: value.hidden_motives?.status,
            items: asArray(value.hidden_motives?.items).map(motive => ({
                ...motive,
                currentRelevance: motive.current_relevance,
                counterevidence: motive.counterevidence,
            })),
            audit: value.hidden_motives?.audit,
        } }).hiddenMotives;
        const previousMotivesById = new Map(next.hiddenMotives.items.map(motive => [motive.id.toLocaleLowerCase(), motive]));
        proposedMotives.items = proposedMotives.items.map(motive => {
            const previous = previousMotivesById.get(motive.id.toLocaleLowerCase());
            return motive.change === 'keep' && previous
                ? { ...previous, ...motive, evidence: motive.evidence.length ? motive.evidence : previous.evidence, counterevidence: motive.counterevidence.length ? motive.counterevidence : previous.counterevidence, change: 'keep' }
                : motive;
        });
        next.hiddenMotives = proposedMotives;
    }
    next.causalContext = normalizeState({ causalContext: context }).causalContext;
    if (Array.isArray(value.situations)) next.situationBoard = mergeSituationUpdates(next.situationBoard, value.situations, { currentTurn: next.turnCount + 1, full: true });
    next.situationBoard = retireManifestedSituations(next.situationBoard, messages);
    if (value.offscreen) next.offscreenWorld = mergeOffscreenWorld(next.offscreenWorld, value.offscreen, { currentTurn: next.turnCount + 1 });
    const horizonTrajectory = next.horizonRadar.seeds.find(seed => seed.kind === 'detected' && seed.presentRelation !== 'none')?.trajectory || '';
    next.narrativeLayers = normalizeState({ narrativeLayers: {
        immediate_action: current.immediate_action, local_activity: current.activity, situation: current.situation,
        wider_world: world.baseline, durable_trajectory: horizonTrajectory, activity_role: current.activity_role, temporal_scope: current.temporal_scope,
    } }).narrativeLayers;
    next.loreModel = normalizeState({ loreModel: {
        world_identity: world.identity, baseline: world.baseline, variant_rules: world.variant_rules,
        baseline_departures: world.rp_changes, continuity_signatures: world.signatures, active_forces: world.forces, confidence: world.confidence,
    } }).loreModel;

    const threadUpdates = asArray(value.thread_updates).map(update => ({ ...update }));
    next.continuityThreads = normalizeState({ continuityThreads: upsertByKey(next.continuityThreads, threadUpdates, 'id') }).continuityThreads;
    const actorUpdates = asArray(value.actor_updates).map(update => {
        const existing = next.entities.find(item => item.name.toLocaleLowerCase() === String(update?.name || '').trim().toLocaleLowerCase()) || {};
        return { ...mergeActorUpdate(existing, update), relevance: existing.relevance || 'current causal actor', confidence: existing.confidence || world.confidence };
    });
    next.entities = normalizeState({ entities: upsertByKey(next.entities, actorUpdates, 'name') }).entities;

    let canon = [...next.canonConstraints];
    for (const update of asArray(value.canon_updates)) {
        const fact = String(update?.fact || '').trim().slice(0, 500);
        if (!fact) continue;
        const index = canon.findIndex(item => item.toLocaleLowerCase() === fact.toLocaleLowerCase());
        if (update.op === 'remove') { if (index >= 0) canon.splice(index, 1); }
        else if (index < 0) canon.push(fact);
    }
    for (const claim of explicitCanonClaims(messages)) if (!canon.some(item => item.toLocaleLowerCase() === claim.toLocaleLowerCase())) canon.push(claim);
    next.canonConstraints = canon.slice(-12);

    // v48+ deliberately has no prescriptive future route lifecycle. These
    // legacy fields stay empty; v55 horizonRadar and v56 hiddenMotives separately retain only
    // optional private long-range hypotheses without scheduling delivery.
    next.objectives = [];
    next.possibilities = [];
    next.pathways = [];
    next.nextGuides = [];
    next.planHorizons = { items: [], deviation: { level: 'none', reason: '' } };
    next.narrativeEvents = [];
    next.guidance = '';
    next.lastInject = next.causalContext.inject;
    next.lastReason = String(value.audit || context.basis || '').trim().slice(0, 500);
    if (typeof value.ledger === 'string' && value.ledger.trim()) next.contextLedger = value.ledger.trim().slice(0, 3000);
    next.lastAnalysisFingerprint = fingerprintMessages(messages);
    next.sourceMessageCount = messages.length;
    next.ledgerMessageCount = messages.length;
    next.ledgerUpdatedAt = Date.now();
    next.lastAnalyzedAt = Date.now();
    next.canonBootstrapPending = false;
    next.turnCount += 1;
    return next;
}

function applyCompactAnalysis(next, value, messages) {
    const current = value.current || {};
    const decision = value.decision || {};
    const world = value.world || {};
    const author = value.author || {};
    const routes = [...new Map(asArray(value.routes)
        .filter(route => route?.id && route?.direction)
        .map(route => [String(route.id).trim().toLocaleLowerCase(), route])).values()];
    const guides = asArray(value.guides);

    next.storyFrame = {
        frame: String(current.frame || 'grounded').slice(0, 40),
        confidence: String(world.confidence || 'low').slice(0, 40),
        basis: String(current.frame_basis || '').slice(0, 240),
    };
    next.narrativeLayers = normalizeState({ narrativeLayers: {
        immediate_action: current.immediate_action,
        local_activity: current.activity,
        situation: current.situation,
        wider_world: current.wider_world,
        durable_trajectory: author.story_identity,
        activity_role: current.activity_role,
        temporal_scope: current.temporal_scope,
    } }).narrativeLayers;
    next.scene = {
        ...next.scene,
        status: String(current.status || '').slice(0, 300),
        activity: String(current.activity || '').slice(0, 300),
        pace: String(decision.operation || 'hold').slice(0, 80),
        intent: String(decision.aim || '').slice(0, 300),
        location: String(current.location || '').slice(0, 200),
        time: String(current.time || '').slice(0, 160),
        loop: current.loop === true,
    };
    next.loreModel = normalizeState({ loreModel: {
        world_identity: world.identity,
        baseline: world.baseline,
        variant_rules: world.variant_rules,
        continuity_signatures: world.signatures,
        baseline_departures: world.rp_changes,
        trajectory_signals: world.trajectory_signals,
        active_forces: world.forces,
        confidence: world.confidence,
    } }).loreModel;
    next.authorBoard = normalizeState({ ...next, authorBoard: {
        ...next.authorBoard,
        story: { identity: author.story_identity, themes: author.themes },
        activeArc: author.active_arc,
        characterArcs: author.character_arcs,
        relationshipArcs: author.relationship_arcs,
        setups: author.setups,
        milestones: author.milestones,
        revision: (Number(next.authorBoard?.revision) || 0) + 1,
        updatedAtTurn: next.turnCount + 1,
    } }).authorBoard;

    const previousThreads = [...next.continuityThreads];
    const threadUpdates = asArray(value.thread_updates).map(update => ({ ...update }));
    next.continuityThreads = normalizeState({ continuityThreads: upsertByKey(next.continuityThreads, threadUpdates, 'id') }).continuityThreads;
    const actorUpdates = asArray(value.actor_updates).map(update => {
        const existing = next.entities.find(item => item.name.toLocaleLowerCase() === String(update?.name || '').trim().toLocaleLowerCase()) || {};
        return {
            ...existing,
            ...update,
            // A scene location is not an actor location. Keep an established
            // actor location only when an update does not supply one; never
            // place every offscreen actor in the current room by default.
            location: update.location || existing.location || '',
            relevance: existing.relevance || 'independent causal actor',
            perspective: update.perspective || existing.perspective || update.knowledge,
            constraints: update.constraints || existing.constraints || '',
            confidence: existing.confidence || world.confidence,
        };
    });
    next.entities = normalizeState({ entities: upsertByKey(next.entities, actorUpdates, 'name') }).entities;

    const routeOrder = { local: 0, near: 1, mid: 2, far: 3, wildcard: 4 };
    const orderedRoutes = routes.map((route, index) => ({ route, index }))
        .sort((a, b) => (routeOrder[a.route.horizon] ?? 3) - (routeOrder[b.route.horizon] ?? 3) || a.index - b.index)
        .map(item => item.route);
    next.possibilities = normalizeState({ possibilities: orderedRoutes.map(route => ({
        description: route.direction,
        horizon: route.horizon,
        conditions: asArray(route.conditions).slice(0, 1),
        force: route.strength,
        lane: route.lane,
        agent: route.agent,
        engine: route.engine,
        scale: route.scale,
        origin: route.origin,
    })) }).possibilities;
    next.pathways = normalizeState({ pathways: orderedRoutes.slice(0, 8).map(route => ({
        id: route.id,
        lane: route.lane,
        agent: route.agent,
        engine: route.engine,
        relation: route.relation,
        scale: route.scale,
        origin: route.origin,
        mechanism_status: route.mechanism_status,
        mechanism_basis: route.mechanism_basis,
        evidence_refs: route.evidence_refs,
        unresolved_basis: route.unresolved_basis,
        completion_check: route.completion_check,
        direction: route.direction,
        when: asArray(route.conditions).join('; ') || route.timeframe,
        response_bias: route.direction,
        horizon: route.timeframe || route.horizon,
        status: route.status,
        conditions: route.conditions,
        change: 'adjust',
        reason: route.basis,
    })) }).pathways;
    next.planHorizons = normalizeState({ planHorizons: {
        items: orderedRoutes.map((route, index) => ({
            id: route.id,
            lane: route.lane,
            branch: route.branch,
            agent: route.agent,
            engine: route.engine,
            relation: route.relation,
            scale: route.scale,
            origin: route.origin,
            mechanism_status: route.mechanism_status,
            mechanism_basis: route.mechanism_basis,
            evidence_refs: route.evidence_refs,
            unresolved_basis: route.unresolved_basis,
            completion_check: route.completion_check,
            direction: route.direction,
            timeframe: route.timeframe,
            stability: index === orderedRoutes.length - 1 ? 'slow' : route.horizon === 'local' ? 'fluid' : route.horizon === 'near' ? 'adaptive' : route.horizon === 'mid' ? 'stable' : 'slow',
            conditions: route.conditions,
            change: 'adjust',
            reason: route.basis,
        })),
        deviation: { level: decision.operation === 'redirect' || decision.operation === 'recover' ? 'major' : 'none', reason: decision.basis },
    } }).planHorizons;

    const knownEventEngines = new Map([
        ...next.narrativeEvents.map(event => [event.id, event.engine]),
        ...asArray(value.event_updates).filter(event => event.op !== 'retire').map(event => [event.id, event.engine]),
    ].map(([id, engine]) => [String(id || '').trim().toLocaleLowerCase(), String(engine || '').trim().toLocaleLowerCase()]).filter(([id, engine]) => id && engine));
    next.nextGuides = normalizeState({ nextGuides: guides.map((guide, index) => {
        const routeId = String(guide.route_id || '').trim().toLocaleLowerCase();
        const route = routes.find(item => String(item.id || '').trim().toLocaleLowerCase() === routeId) || routes[index] || {};
        const guideEngine = String(guide.engine || route.engine || '').trim().toLocaleLowerCase();
        const eventIds = asArray(guide.event_ids).map(id => String(id || '').trim()).filter(id => knownEventEngines.get(id.toLocaleLowerCase()) === guideEngine).slice(0, 2);
        return {
            id: guide.id,
            direction: guide.direction,
            use_when: guide.use_when,
            drop_when: guide.drop_when,
            causal_role: `${String(guide.operation || decision.operation || 'hold').toUpperCase()}: ${guide.function || route.direction || decision.scene_function}`,
            world_delta: guide.world_delta,
            origin: route.origin || 'inferred',
            mechanism_status: route.mechanism_status,
            mechanism_basis: route.mechanism_basis,
            route_lane: route.lane || 'extra',
            causal_agent: route.agent || '',
            causal_engine: guide.engine || route.engine || '',
            scale: route.scale || 'scene',
            basis: route.basis || decision.basis,
            strength: route.strength || 'moderate',
            source_pathways: route.id ? [route.id] : [],
            causal_event_ids: eventIds,
            disclosure: eventIds.length ? guide.disclosure : 'none',
            reason: route.basis || decision.basis,
        };
    }) }).nextGuides;

    const primary = next.nextGuides[0] || {};
    const operation = String(decision.operation || 'hold').toLowerCase();
    const change = operation === 'hold' ? 'keep' : operation === 'payoff' ? 'payoff' : operation === 'advance' || operation === 'converge' ? 'advance' : 'adjust';
    next.directorScore = normalizeState({ directorScore: {
        story_identity: author.story_identity,
        scene_function: decision.scene_function,
        setting_identity: world.identity,
        setting_forces: world.forces,
        causal_tempo: operation,
        arc_direction: author.active_arc?.purpose || author.active_arc?.title || '',
        future_setup: { id: primary.id || '', development: decision.setup, current_step: primary.direction || '', conditions: decision.conditions, earliest_window: decision.earliest, disclosure: decision.disclosure },
        meaningful_aim: decision.aim,
        change,
        basis: decision.basis,
    } }).directorScore;

    const eventUpdates = asArray(value.event_updates).map(update => {
        const updateEngine = String(update.engine || '').trim().toLocaleLowerCase();
        const updateId = String(update.id || '').trim().toLocaleLowerCase();
        const consequences = guides.filter(guide => asArray(guide.event_ids).some(id => String(id || '').trim().toLocaleLowerCase() === updateId) && String(guide.engine || '').trim().toLocaleLowerCase() === updateEngine).map(guide => guide.world_delta).filter(Boolean).slice(0, 3);
        return {
            ...update,
            confidence: update.epistemic_status === 'established' ? 'high' : update.epistemic_status === 'possible' ? 'low' : 'moderate',
            consequences,
        };
    });
    next.narrativeEvents = normalizeState({ narrativeEvents: upsertByKey(next.narrativeEvents, eventUpdates, 'id') }).narrativeEvents;

    let canon = [...next.canonConstraints];
    for (const update of asArray(value.canon_updates)) {
        const fact = String(update?.fact || '').trim().slice(0, 500);
        if (!fact) continue;
        const index = canon.findIndex(item => item.toLocaleLowerCase() === fact.toLocaleLowerCase());
        if (update.op === 'remove') {
            if (index >= 0) canon.splice(index, 1);
        } else if (index < 0) canon.push(fact);
    }
    for (const claim of explicitCanonClaims(messages)) {
        if (!canon.some(item => item.toLocaleLowerCase() === claim.toLocaleLowerCase())) canon.push(claim);
    }
    next.canonConstraints = canon.slice(-12);

    if (threadUpdates.length) {
        const retiredNames = new Set(threadUpdates.filter(item => item.op === 'retire').flatMap(update => {
            const prior = previousThreads.find(item => String(item.id || '').trim().toLocaleLowerCase() === String(update.id || '').trim().toLocaleLowerCase());
            return [update.thread, prior?.thread].map(name => String(name || '').trim().toLocaleLowerCase()).filter(Boolean);
        }));
        const existing = new Map(next.objectives.filter(item => !retiredNames.has(item.title.toLocaleLowerCase())).map(item => [item.title.toLocaleLowerCase(), item]));
        for (const thread of next.continuityThreads) existing.set(thread.thread.toLocaleLowerCase(), { title: thread.thread, detail: thread.state, status: thread.status, source: thread.basis });
        next.objectives = [...existing.values()].slice(-10);
    }
    next.selfChallenge = normalizeState({ selfChallenge: { weakness: value.audit?.weakness, counter_route: value.audit?.counter_route, mechanism_check: value.audit?.mechanism_check, decision: value.audit?.decision } }).selfChallenge;
    next.guidance = String(value.guidance || '').trim().slice(0, 700);
    next.lastInject = Boolean(next.nextGuides.length && next.directorScore.meaningfulAim);
    next.lastReason = String(value.audit?.decision || decision.basis || '').trim().slice(0, 500);
    if (typeof value.ledger === 'string' && value.ledger.trim()) next.contextLedger = value.ledger.trim().slice(0, 3000);
    next.lastAnalysisFingerprint = fingerprintMessages(messages);
    next.sourceMessageCount = messages.length;
    next.ledgerMessageCount = messages.length;
    next.ledgerUpdatedAt = Date.now();
    next.lastAnalyzedAt = Date.now();
    next.canonBootstrapPending = false;
    next.turnCount += 1;
    return next;
}

export function applyAnalysis(state, result, messages) {
    const playerName = playerCharacterName(messages);
    const next = normalizeState(useSpecificPlayerName(state, playerName));
    const value = normalizeWorldPlan(result && typeof result === 'object' ? useSpecificPlayerName(result, playerName) : {});
    const migrating = value.contract_version === 14 && next.plannerContract !== 14;
    if (migrating) next.legacyPreparedWorld = next.preparedWorld;
    next.preparedWorld = value.contract_version === 14
        ? mergeWorldPlan(migrating ? null : next.preparedWorld, value)
        : mergePreparedWorld(next.preparedWorld, value.prepared);
    if (value.contract_version === 14) {
        const checked = validateWorldPlan(value);
        if (!checked.valid) throw new AnalysisValidationError('Invalid world notebook', checked.errors);
        next.plannerContract = 14;
        next.scene = { ...normalizeState().scene, status: 'World notebook updated' };
        // This job prepares possibilities, not a second transcript summary.
        // Preserve saved continuity without letting generated recaps overwrite
        // it or compete with the writer's actual conversation.
        next.causalContext = normalizeState().causalContext;
        next.preparedWorld.overview = '';
        // No inferred scene restrictions or legacy optional openings are fed
        // back into the replacement writer packet.
        next.sceneProfile = normalizeState().sceneProfile;
        next.responseAudit = normalizeState().responseAudit;
        next.lastInject = next.causalContext.inject;
        next.lastReason = 'World notebook updated';
        next.lastAnalysisFingerprint = fingerprintMessages(messages);
        next.sourceMessageCount = messages.length;
        next.ledgerMessageCount = messages.length;
        next.ledgerUpdatedAt = next.lastAnalyzedAt = Date.now();
        next.canonBootstrapPending = false;
        next.turnCount += 1;
        return next;
    }
    if ([10, 11, 13].includes(value.contract_version)) return applyIncrementalAnalysis(next, value, messages);
    if ([8, 9, 12].includes(value.contract_version)) return applyBeatAnalysis(next, value, messages);
    if (value.contract_version === 2) return applyCompactAnalysis(next, value, messages);
    if (value.story_frame && typeof value.story_frame === 'object') next.storyFrame = { ...next.storyFrame, frame: String(value.story_frame.frame || 'unknown').slice(0, 40), confidence: String(value.story_frame.confidence || 'low').slice(0, 40), basis: String(value.story_frame.basis || '').slice(0, 240) };
    if (value.director_score && typeof value.director_score === 'object') {
        next.directorScore = normalizeState({ directorScore: value.director_score }).directorScore;
    }
    if (value.lore_model && typeof value.lore_model === 'object') {
        next.loreModel = normalizeState({ loreModel: value.lore_model }).loreModel;
    }
    if (value.narrative_layers && typeof value.narrative_layers === 'object') {
        next.narrativeLayers = normalizeState({ narrativeLayers: value.narrative_layers }).narrativeLayers;
    }
    next.scene = { ...next.scene, ...(value.scene || {}) };
    next.objectives = Array.isArray(value.objectives) ? value.objectives.slice(0, 10) : next.objectives;
    if (Array.isArray(value.continuity_threads)) {
        next.continuityThreads = normalizeState({ continuityThreads: value.continuity_threads }).continuityThreads;
    }
    if (value.self_challenge && typeof value.self_challenge === 'object') {
        next.selfChallenge = normalizeState({ selfChallenge: {
            weakness: value.self_challenge.weakness,
            counterRoute: value.self_challenge.counter_route,
            decision: value.self_challenge.decision,
        } }).selfChallenge;
    }
    next.entities = Array.isArray(value.entities) ? normalizeState({ entities: value.entities }).entities : next.entities;
    next.possibilities = Array.isArray(value.possibilities)
        ? normalizeState({ possibilities: value.possibilities }).possibilities
        : next.possibilities;
    if (Array.isArray(value.pathways)) {
        const proposed = normalizeState({ pathways: value.pathways }).pathways;
        next.pathways = mergePathways(next.pathways, proposed);
    }
    if (Array.isArray(value.next_guides)) {
        next.nextGuides = normalizeState({ nextGuides: value.next_guides }).nextGuides;
    }
    if (value.plan_horizons && typeof value.plan_horizons === 'object') {
        const proposed = normalizeState({ planHorizons: {
            items: value.plan_horizons.items,
            deviation: value.plan_horizons.deviation,
        } }).planHorizons;
        next.planHorizons = mergePlanHorizons(next.planHorizons, proposed);
    }
    next.canonConstraints = Array.isArray(value.canon_constraints)
        ? value.canon_constraints.slice(-12).map(item => String(item || '').trim().slice(0, 500)).filter(Boolean)
        : next.canonConstraints;
    next.guidance = String(value.guidance || '').trim().slice(0, 700);
    next.lastInject = Boolean(next.nextGuides.length && next.directorScore.meaningfulAim);
    next.lastReason = String(value.reason || '').trim().slice(0, 500);
    if (typeof value.ledger === 'string' && value.ledger.trim()) next.contextLedger = value.ledger.trim().slice(0, 3000);
    if (Array.isArray(value.narrative_events)) {
        next.narrativeEvents = value.narrative_events.slice(-6).map(event => ({
            id: String(event?.id || '').trim().slice(0, 80),
            title: String(event?.title || '').trim().slice(0, 160),
            summary: String(event?.summary || '').trim().slice(0, 500),
            scope: ['onscreen', 'offscreen'].includes(event?.scope) ? event.scope : 'onscreen',
            epistemicStatus: ['established', 'simulated', 'inferred', 'possible', 'disproved'].includes(event?.epistemic_status) ? event.epistemic_status : 'possible',
            disclosure: ['hidden', 'signaled', 'revealed'].includes(event?.disclosure) ? event.disclosure : event?.scope === 'offscreen' ? 'hidden' : 'revealed',
            status: ['active', 'latent', 'manifested', 'resolved', 'retired'].includes(event?.status) ? event.status : 'active',
            confidence: String(event?.confidence || 'low').trim().slice(0, 60),
            timing: String(event?.timing || '').trim().slice(0, 120),
            dueState: ['unscheduled', 'pending', 'due', 'overdue'].includes(event?.due_state) ? event.due_state : 'unscheduled',
            cause: String(event?.cause || '').trim().slice(0, 220),
            consequences: Array.isArray(event?.consequences) ? event.consequences.slice(0, 3).map(item => String(item || '').trim().slice(0, 160)).filter(Boolean) : [],
            basis: String(event?.basis || '').trim().slice(0, 180),
            requirements: Array.isArray(event?.requirements) ? event.requirements.slice(0, 4).map(item => String(item || '').trim().slice(0, 120)).filter(Boolean) : [],
            interpretation: String(event?.interpretation || 'unsupported').trim().slice(0, 60),
        })).filter(event => event.title && event.summary && !['joke', 'wish', 'hypothetical', 'metacommentary', 'unsupported', 'ooc'].includes(event.interpretation));
    }
    if (value.cue_audit && typeof value.cue_audit === 'object') {
        next.cueAudit = normalizeState({ cueAudit: value.cue_audit }).cueAudit;
    }
    next.lastAnalysisFingerprint = fingerprintMessages(messages);
    next.sourceMessageCount = messages.length;
    next.ledgerMessageCount = messages.length;
    next.ledgerUpdatedAt = Date.now();
    next.lastAnalyzedAt = Date.now();
    next.canonBootstrapPending = false;
    next.turnCount += 1;
    return next;
}

const PLANNER_SYSTEM = `You are Tale Fairy, a private creative GM preparing material for another model that writes the roleplay or simulation. Return only JSON matching the schema. ${PREPARED_RULE} ${PLANNER_AGENCY_RULE} ${ACTOR_AGENCY_RULE}
Reconstruct current facts from the newest authoritative exchange. Adapt to the RP's natural scale without mandatory genre categories. The transcript begins observation, not the world. Maintain useful causes and factual memory without simulating everything. Established requires direct evidence; strong requires a supported inference. Tentative factual conditions are withheld, but labeled conditional preparation can reach the writer. Known_by and learned_from never grant invented knowledge. User instructions and corrections outrank retained state and inference. Preserve settled offscreen history; unseen time does not advance by message count. Select 1–6 useful current conditions with at least one evidenced or strongly inferred cause; do not let that small present slice consume the wider creative job.`;

const KNOWLEDGE_AND_AUDIT_RULES = `For each condition, known_by lists only evidenced knowers and learned_from gives their in-world learning route, not private planner reasoning. Use [] and an empty string when not established; do not invent knowledge or grant it to the player. A suspected fact stays a belief held by its subject, not objective truth. On every pass, response_audit evaluates only the newest assistant reply: state_change describes the supported before-to-after difference, or explicitly says no meaningful change was observed. Evaluate task progress, NPC stance, shared understanding, options, and circumstances, not gesture counts or decorative motion. Rest, silence, routine, and scene landings are legitimate; never manufacture escalation or player feelings to satisfy an audit. Patterns are concrete observed repetition, not speculative criticisms. With no assistant reply, set applicable=false, movement_fit=not-applicable, empty state_change, and no flags. The audit informs the next selection, not automatic retries or imposed outcomes. ${AGENCY_AUDIT_RULE}`;

export const ANALYSIS_OUTPUT_CONTRACT = `Return exactly: contract_version=12, prepared, current, context, situations, offscreen, response_audit, horizon, hidden_motives, world, thread_updates, actor_updates, canon_updates, ledger, note_resolution, audit.
${ACTOR_UPDATE_RULES}
prepared contains overview, updates and focus as specified in the schema and system instructions. It is a persistent creative delta, not factual memory.
context={conditions,inject,inject_reason,basis}; inject=true. conditions has 1–6 items, each {id,kind,subject,condition,disclosure,confidence,relevance,known_by,learned_from}. kind is ${CAUSAL_KINDS.join(', ')}. disclosure is open, limited, or private. confidence is established, strong, or tentative. Describe current causes only, never future actions or planned events. At least one condition must not be tentative. ${KNOWLEDGE_AND_AUDIT_RULES}
situations has 0–6 optional setting-native circumstances, each {op,id,type,premise,cause,entry,scope,persistence,status,origin}. Use cause -> present circumstance -> possible interaction. These are never required events, objectives, outcomes, reveals, or player instructions. Original or consequential situations remain optional and non-canon until manifested. Return zero when none fit; use op=retire when contradicted or no longer relevant.
offscreen={subjects,elapsed,settled_through,audit} is the complete bounded deferred-debt board; confidence is established, strong, or tentative. Inferred and invented are preparation origins, not confidence labels. Preserve unseen subjects and settled history; update last_seen_turn only when settling relevant debt. current records the exact current scene. response_audit privately evaluates the prior assistant response. horizon and hidden_motives remain private optional hypotheses. world and updates contain factual state only. Empty update arrays mean no factual change. No other keys.`;

export const INCREMENTAL_ANALYSIS_OUTPUT_CONTRACT = `Return contract_version=13 and the response shape. Target 900–1400 output tokens total. Short phrases; no deliberation or repeated explanations.
Write audit first: briefly reconcile observations with the retained draft, identifying supported corrections and uncertainty with source indices. Apply those corrections in the actual deltas, not just the audit. An older error remains repairable on a routine pass. Blank actor fields preserve memory; clear_fields explicitly removes now-unsupported actor fields, while nonblank replacements win. This is separate from response_audit of the newest reply.
current states the exact latest scene; copy explicit time/location. context replaces the writer's current factual slice: select 1–3 useful evidenced conditions, inject=true. known_by/learned_from require witnessed knowledge; otherwise []/"". At least one condition is established or strong. Suspicions remain attributed beliefs; tentative conditions stay private.
prepared is a persistent delta: blank overview preserves it; omitted ids survive. Usually return zero or one changed development. A missing wider possibility may justify a new independent development; do not fill slots for their own sake. Change overview only when the wider premise, commitments or alternatives change, never just to recap the latest scene. Keep premise and middle concrete; other notes may be blank. Reassess focus against the latest exchange; repeated injection alone does not justify keeping the same focus. Preserve focus ids when still fitting; retire contradicted or completed ideas explicitly. Do not rewrite an unchanged notebook. Omit offscreen entirely when unchanged. Offscreen subjects, hidden motives, actors and threads also contain changes only; empty arrays preserve records. Actor description fields use "" for unchanged/unknown, never invented filler. ledger may be "" when unchanged.
response_audit checks only the newest assistant reply against recent evidence, not against the notebook as its own proof. Record factual drift, player control, repetition and supported state change briefly. Distinguish real intervention boundaries from repeated questions/readiness without follow-through; do not force progress each turn. Quiet or unchanged scenes are valid. With no assistant reply use applicable=false, movement_fit=not-applicable and no flags. Diagnostics audit/basis fields may be short; do not echo facts across sections. note_resolution is null without a user note.`;

export const INCREMENTAL_SYSTEM = `You are Tale Fairy, a private creative GM supporting the roleplay writer. Return only JSON. Work in this order: observe, reconcile the draft notebook, then prepare.
Reconstruct what actually happened before consulting current, which is a fallible earlier interpretation, not authority. Explicit user/OOC facts prevail. Resolve inconsistencies using direct, specific observations rather than repeated summaries or status labels. Preserve identities, relationships, quantities, chronology and knowledge boundaries. Uncertainty is preferable to invented certainty. Never turn one observed behavior into a permanent personality restriction, or a proposal into established history.
The notebook is playable preparation, not a recap or a queue of compulsory beats. Keep unused possibilities; retire completed material and remove satisfied prerequisites. Develop concrete middles and alternative futures from the world's people, motives, places and processes. Let different interests create genuinely different possibilities rather than making every development serve the latest problem. No genre quotas, compulsory surprises or prescribed endings.
NPCs can decide, act, finish, refuse and disengage without player direction. Respect actual commitments and reasons to wait, not inferred permission requirements. The player controls their own speech, choices, feelings and contested outcomes. Preserve intervention opportunities and viewpoint limits. Latest user pacing wins; a quiet or long scene can develop without ending or being interrupted. Fictional time follows events, not message counts. Keep observations in factual fields and conditional inventions in prepared. One pass, no critic or model repair.`;

export { PLANNER_SYSTEM as SYSTEM, extractJson };
