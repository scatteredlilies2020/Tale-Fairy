import { fingerprintMessages, normalizeState, stateForPrompt } from './state.js?v=0.12.0';
import { estimateTokenCount, truncateToTokenBudget } from './token-budget.js?v=0.11.96';
import { compactSummarySources } from './summary-context.js?v=0.11.96';
import { jsonrepair } from './vendor/jsonrepair/regular/jsonrepair.js?v=3.15.0';
import { formatDirectorSample, sampleDirectorSignals } from './director-sampling.js?v=0.12.0';

export const DEFAULT_PROMPT_TOKEN_BUDGET = 16000;

export class AnalysisValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AnalysisValidationError';
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
const ROUTE_LANES = ['immediate', 'character', 'relationship-institution', 'lore-world', 'original', 'long-range', 'extra'];
const REQUIRED_ROUTE_LANES = ROUTE_LANES.slice(0, 6);
const ROUTE_SCALES = ['scene', 'days', 'arc', 'months-years', 'open-ended'];
const ROUTE_RELATIONS = ['direct', 'independent', 'emergent'];
const PORTFOLIO_LANES = Object.freeze({ immediate: 'immediate', character: 'character', relationship_institution: 'relationship-institution', lore_world: 'lore-world', original: 'original', long_range: 'long-range' });
const AUTHOR_ARC_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: text(80), title: text(120), phase: text(60), purpose: text(260), pressure: text(220) }, required: ['id', 'title', 'phase', 'purpose', 'pressure'] };
const AUTHOR_SETUP_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: text(80), kind: { type: 'string', enum: ['setup', 'promise', 'payoff'] }, description: text(260), status: { type: 'string', enum: ['open', 'ready', 'resolved', 'retired'] }, payoff: text(240), conditions: strings(4, 140) }, required: ['id', 'kind', 'description', 'status', 'payoff', 'conditions'] };
const AUTHOR_MILESTONE_SCHEMA = { type: 'object', additionalProperties: false, properties: { id: text(80), development: text(280), horizon: text(80), conditions: strings(4, 140), status: { type: 'string', enum: ['queued', 'available', 'active', 'resolved', 'retired'] } }, required: ['id', 'development', 'horizon', 'conditions', 'status'] };
const CONDITIONAL_BRANCH_SCHEMA = { type: 'object', additionalProperties: false, properties: {
    when: text(180), operation: text(80), required_effect: text(260),
    content_class: { type: 'string', enum: ['none', 'texture', 'reaction', 'obstacle', 'conflict', 'character', 'opposition', 'event', 'opportunity', 'revelation', 'consequence', 'other'] },
    scope: { type: 'string', enum: ['personal', 'social', 'institutional', 'societal', 'world'] },
    intensity: { type: 'string', enum: ['none', 'low', 'moderate', 'high', 'severe'] },
    quantity: { type: 'string', enum: ['none', 'singular', 'pair', 'group', 'numerous', 'swarm'] },
    relative_power: { type: 'string', enum: ['none', 'fodder', 'inferior', 'peer', 'elite', 'overwhelming', 'established'] },
    plot_weight: { type: 'string', enum: ['none', 'incidental', 'connective', 'consequential'] },
    duration: { type: 'string', enum: ['moment', 'beat', 'scene', 'extended'] },
    resolution_ceiling: { type: 'string', enum: ['none', 'local', 'partial', 'decisive', 'open'] },
}, required: ['when', 'operation', 'required_effect', 'content_class', 'scope', 'intensity', 'quantity', 'relative_power', 'plot_weight', 'duration', 'resolution_ceiling'] };

// The model returns observations plus deltas, not a duplicate of Tale Fairy's
// entire persistent state. applyAnalysis expands this compact wire contract into
// the rich internal state used by the UI and prompt injector.
export const ANALYSIS_SCHEMA_VALUE = {
    type: 'object', additionalProperties: false,
    properties: {
        contract_version: { type: 'integer', const: 4 },
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
        beat: { type: 'object', additionalProperties: false, properties: {
            operation: text(80),
            primary_when: text(180), target: text(160), required_effect: text(260),
            alternatives: { type: 'array', minItems: 2, maxItems: 2, items: CONDITIONAL_BRANCH_SCHEMA },
            inject: { type: 'boolean' }, inject_reason: text(220),
            content_class: { type: 'string', enum: ['none', 'texture', 'reaction', 'obstacle', 'conflict', 'character', 'opposition', 'event', 'opportunity', 'revelation', 'consequence', 'other'] },
            scope: { type: 'string', enum: ['personal', 'social', 'institutional', 'societal', 'world'] },
            intensity: { type: 'string', enum: ['none', 'low', 'moderate', 'high', 'severe'] },
            quantity: { type: 'string', enum: ['none', 'singular', 'pair', 'group', 'numerous', 'swarm'] },
            relative_power: { type: 'string', enum: ['none', 'fodder', 'inferior', 'peer', 'elite', 'overwhelming', 'established'] },
            plot_weight: { type: 'string', enum: ['none', 'incidental', 'connective', 'consequential'] },
            duration: { type: 'string', enum: ['moment', 'beat', 'scene', 'extended'] },
            resolution_ceiling: { type: 'string', enum: ['none', 'local', 'partial', 'decisive', 'open'] },
            preserve: strings(5, 180), forbid: strings(5, 180), basis: text(220),
        }, required: ['operation', 'primary_when', 'target', 'required_effect', 'alternatives', 'inject', 'inject_reason', 'content_class', 'scope', 'intensity', 'quantity', 'relative_power', 'plot_weight', 'duration', 'resolution_ceiling', 'preserve', 'forbid', 'basis'] },
        response_audit: { type: 'object', additionalProperties: false, properties: {
            applicable: { type: 'boolean' },
            movement_fit: { type: 'string', enum: ['not-applicable', 'missed', 'partial', 'clear'] },
            repetition: { type: 'string', enum: ['none', 'possible', 'clear'] },
            unjustified_escalation: { type: 'boolean' }, player_control: { type: 'boolean' }, continuity_drift: { type: 'boolean' },
            patterns: strings(5, 140), summary: text(400),
        }, required: ['applicable', 'movement_fit', 'repetition', 'unjustified_escalation', 'player_control', 'continuity_drift', 'patterns', 'summary'] },
        world: { type: 'object', additionalProperties: false, properties: {
            identity: text(140), baseline: text(300), variant_rules: strings(4, 220), rp_changes: strings(5, 240),
            signatures: strings(6, 220), forces: strings(4, 180), confidence: { type: 'string', enum: ['low', 'moderate', 'high'] },
        }, required: ['identity', 'baseline', 'variant_rules', 'rp_changes', 'signatures', 'forces', 'confidence'] },
        thread_updates: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, properties: { op: { type: 'string', enum: ['upsert', 'retire'] }, id: text(100), thread: text(180), state: text(240), status: { type: 'string', enum: ['active', 'dormant', 'due', 'blocked'] }, basis: text(160) }, required: ['op', 'id', 'thread', 'state', 'status', 'basis'] } },
        actor_updates: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, properties: { op: { type: 'string', enum: ['upsert', 'retire'] }, name: text(100), state: text(220), location: text(140), perspective: text(180), motivation: text(180), knowledge: text(180), constraints: text(160), agenda: text(180), window: text(100) }, required: ['op', 'name', 'state', 'location', 'perspective', 'motivation', 'knowledge', 'constraints', 'agenda', 'window'] } },
        canon_updates: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, properties: { op: { type: 'string', enum: ['add', 'remove'] }, fact: text(500) }, required: ['op', 'fact'] } },
        ledger: text(1800),
        note_resolution: { anyOf: [{ type: 'object', additionalProperties: false, properties: { kind: { type: 'string', enum: ['suggest', 'correct', 'establish', 'forbid'] } }, required: ['kind'] }, { type: 'null' }] },
        audit: text(500),
    },
    required: ['contract_version', 'current', 'beat', 'response_audit', 'world', 'thread_updates', 'actor_updates', 'canon_updates', 'ledger', 'note_resolution', 'audit'],
};
export const ANALYSIS_SCHEMA = Object.freeze({
    name: 'tale_fairy_conditional_set_v4',
    description: 'Compact Tale Fairy observations and state deltas.',
    strict: true,
    returnInvalid: true,
    value: ANALYSIS_SCHEMA_VALUE,
});

export const MODE_INSTRUCTIONS = Object.freeze({
    light: 'LIGHT — Let scene need choose the movement first, then apply the sample conservatively. Prefer subtle or grounded expression, but when inject=true the required effect must still be perceptible in the next response; subtle does not mean optional.',
    balanced: 'BALANCED — Let scene need choose the movement first. Make the required effect a clear, meaningful change to the immediate situation or its possibilities, while giving quiet development, breathers, and consequential turns equal legitimacy when they fit.',
    fun: 'FUN — Let scene need choose the movement first. Give that movement and required effect a prominent, lively expression, preferring bold or surprising realization where compatible. Randomness never changes the kind or natural scale of the chosen movement or manufactures unwarranted conflict, interruption, escalation, or adversity.',
});

export const DIRECTOR_POLICY = 'Interpret the complete scene and choose one coherent primary direction before applying random appetite, then provide two distinct redirect-safe alternatives. Make every branch worth experiencing: grounded need not mean uneventful, and interesting need not mean disruptive. Quiet situations may gain texture, emotion, discovery, or character meaning without an incident. Active danger, competition, demanding tasks, and instability may exert credible pressure. Deepening, breathing room, relief, continuation, resolution, and transition are as legitimate as complication, interruption, escalation, or transformation. New causes require conversational or explicit-canon support. Provider-visible text states only abstract function and effect and must remain portable to another scene with the same dramatic shape. Never name or repeat a character, location, faction, lore concept, concrete object, body part, source, exact activity, action, dialogue, prop, detail, endpoint, event, actor, outcome, or player reaction. Use current activity, current interaction, current environment, established pressure, or established relationship instead. Explicit user/OOC instructions bind, and player decisions remain the player’s alone.';

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

function validateBeatAnalysisResult(result) {
    const errors = [];
    const requiredStrings = (value, keys, label) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            errors.push(`${label} must be an object`);
            return;
        }
        for (const key of keys) if (typeof value[key] !== 'string' || !value[key].trim()) errors.push(`${label}.${key} must be a non-empty string`);
    };
    if (result?.contract_version !== 4) errors.push('contract_version must be 4');
    requiredStrings(result?.current, ['frame', 'frame_basis', 'status', 'immediate_action', 'activity', 'situation', 'activity_role', 'temporal_scope', 'scene_promise', 'phase', 'emotional_direction', 'pressure', 'intrusion', 'novelty_ceiling'], 'current');
    requiredStrings(result?.beat, ['operation', 'primary_when', 'target', 'required_effect', 'inject_reason', 'content_class', 'scope', 'intensity', 'quantity', 'relative_power', 'plot_weight', 'duration', 'resolution_ceiling', 'basis'], 'beat');
    requiredStrings(result?.response_audit, ['movement_fit', 'repetition', 'summary'], 'response_audit');
    requiredStrings(result?.world, ['identity', 'baseline', 'confidence'], 'world');
    for (const key of ['thread_updates', 'actor_updates', 'canon_updates']) if (!Array.isArray(result?.[key])) errors.push(`${key} must be an array`);
    for (const key of ['preserve', 'forbid']) if (!Array.isArray(result?.beat?.[key])) errors.push(`beat.${key} must be an array`);
    if (!Array.isArray(result?.beat?.alternatives) || result.beat.alternatives.length !== 2) errors.push('beat.alternatives must contain exactly 2 branches');
    for (const [index, branch] of (Array.isArray(result?.beat?.alternatives) ? result.beat.alternatives : []).entries()) {
        requiredStrings(branch, ['when', 'operation', 'required_effect', 'content_class', 'scope', 'intensity', 'quantity', 'relative_power', 'plot_weight', 'duration', 'resolution_ceiling'], `beat.alternatives[${index}]`);
    }
    const visibleText = [
        ['beat.primary_when', result?.beat?.primary_when],
        ['beat.operation', result?.beat?.operation],
        ['beat.required_effect', result?.beat?.required_effect],
        ...(Array.isArray(result?.beat?.alternatives) ? result.beat.alternatives.flatMap((branch, index) => [
            [`beat.alternatives[${index}].when`, branch?.when],
            [`beat.alternatives[${index}].operation`, branch?.operation],
            [`beat.alternatives[${index}].required_effect`, branch?.required_effect],
        ]) : []),
    ];
    const abstractCapitalizedWords = new Set(['A', 'An', 'The', 'If', 'When', 'Let', 'Make', 'Keep', 'Give', 'Allow', 'Introduce', 'Deepen', 'Support', 'Preserve', 'Increase', 'Reduce', 'Resolve', 'Transition', 'Continue', 'Shift', 'Guide', 'Create', 'Add', 'Acknowledge', 'Carry', 'Expose', 'Maintain', 'Move', 'Use', 'Current', 'Established', 'Existing', 'Immediate', 'Observable', 'Narrative', 'Scene', 'User', 'Player']);
    for (const [path, value] of visibleText) {
        if (typeof value !== 'string') continue;
        const words = [...value.matchAll(/\b[\p{Lu}][\p{L}'’-]*\b/gu)];
        for (const match of words) {
            if (abstractCapitalizedWords.has(match[0])) continue;
            errors.push(`${path} must stay abstract and must not name canon-specific proper nouns (${match[0]})`);
        }
    }
    if (typeof result?.beat?.inject !== 'boolean') errors.push('beat.inject must be a boolean');
    for (const key of ['applicable', 'unjustified_escalation', 'player_control', 'continuity_drift']) if (typeof result?.response_audit?.[key] !== 'boolean') errors.push(`response_audit.${key} must be a boolean`);
    if (!Array.isArray(result?.response_audit?.patterns)) errors.push('response_audit.patterns must be an array');
    if (typeof result?.current?.loop !== 'boolean') errors.push('current.loop must be a boolean');
    for (const key of ['location', 'time']) if (typeof result?.current?.[key] !== 'string') errors.push(`current.${key} must be a string`);
    const allowed = {
        'current.frame': ['grounded', 'heightened', 'surreal'], 'current.activity_role': ['incidental', 'routine', 'developmental', 'central', 'transition'],
        'current.temporal_scope': ['moment', 'action', 'activity', 'scene', 'extended'], 'current.phase': ['establishing', 'developing', 'turning', 'landing', 'aftermath', 'transition'],
        'current.emotional_direction': ['preserve', 'brighten', 'darken', 'release', 'intensify'], 'current.pressure': ['none', 'latent', 'active', 'high', 'saturated'],
        'current.intrusion': ['closed', 'incidental', 'socially-open', 'dramatically-open', 'primed'], 'current.novelty_ceiling': ['none', 'incidental', 'context-native', 'meaningful', 'major'],
        'beat.content_class': ['none', 'texture', 'reaction', 'obstacle', 'conflict', 'character', 'opposition', 'event', 'opportunity', 'revelation', 'consequence', 'other'],
        'beat.scope': ['personal', 'social', 'institutional', 'societal', 'world'], 'beat.intensity': ['none', 'low', 'moderate', 'high', 'severe'],
        'beat.quantity': ['none', 'singular', 'pair', 'group', 'numerous', 'swarm'], 'beat.relative_power': ['none', 'fodder', 'inferior', 'peer', 'elite', 'overwhelming', 'established'],
        'beat.plot_weight': ['none', 'incidental', 'connective', 'consequential'], 'beat.duration': ['moment', 'beat', 'scene', 'extended'],
        'beat.resolution_ceiling': ['none', 'local', 'partial', 'decisive', 'open'], 'world.confidence': ['low', 'moderate', 'high'],
        'response_audit.movement_fit': ['not-applicable', 'missed', 'partial', 'clear'], 'response_audit.repetition': ['none', 'possible', 'clear'],
    };
    for (const [path, values] of Object.entries(allowed)) {
        const [group, key] = path.split('.');
        if (!values.includes(result?.[group]?.[key])) errors.push(`${path} is invalid`);
    }
    for (const [index, branch] of (Array.isArray(result?.beat?.alternatives) ? result.beat.alternatives : []).entries()) {
        for (const key of ['content_class', 'scope', 'intensity', 'quantity', 'relative_power', 'plot_weight', 'duration', 'resolution_ceiling']) {
            if (!allowed[`beat.${key}`].includes(branch?.[key])) errors.push(`beat.alternatives[${index}].${key} is invalid`);
        }
    }
    for (const key of ['variant_rules', 'rp_changes', 'signatures', 'forces']) if (!Array.isArray(result?.world?.[key])) errors.push(`world.${key} must be an array`);
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
    if (result?.contract_version === 4) return validateBeatAnalysisResult(result);
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
    const recent = [];
    let remainingTokens = Math.max(200, Number(recentTokenBudget) || 4000);
    for (let index = source.length - 1; index >= 0; index--) {
        const message = source[index];
        const latest = index === source.length - 1;
        const maximum = latest ? latestLimit : messageTokenLimit;
        let content = compactMessageContent(message?.mes, maximum, { latest });
        let cost = estimateTokenCount(content) + 24;
        if (cost > remainingTokens) {
            const availableContentTokens = remainingTokens - 24;
            // Always retain the completed latest turn. Also retain a compact
            // preceding turn when useful space remains so a reply is not
            // interpreted without the action or request that caused it.
            if (!recent.length || (recent.length === 1 && availableContentTokens >= 160)) {
                content = compactMessageContent(message?.mes, Math.max(160, Math.min(maximum, availableContentTokens)), { latest });
                cost = estimateTokenCount(content) + 24;
                if (cost <= remainingTokens + 8) recent.push({ index, content });
            }
            break;
        }
        recent.push({ index, content });
        remainingTokens -= cost;
    }
    recent.reverse();
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
        directorScore: current.directorScore,
        loreModel: current.loreModel,
        narrativeLayers: current.narrativeLayers,
        scene: current.scene,
        authorBoard: compactAuthorBoard(current.authorBoard),
        objectives: (current.objectives || []).slice(-5).map(item => ({ title: compactText(item.title, 80), detail: compactText(item.detail, 90), status: compactText(item.status, 30) })),
        continuityThreads: (current.continuityThreads || []).slice(0, 8).map(item => ({ id: compactText(item.id, 60), thread: compactText(item.thread, 110), state: compactText(item.state, 130), status: item.status, basis: compactText(item.basis, 90) })),
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
    const beat = current.activeBeat || {};
    const horizons = current.planHorizons || {};
    return {
        mode: current.mode,
        directorScore: current.directorScore ? { sceneFunction: compactText(current.directorScore.sceneFunction, 80), settingIdentity: compactText(current.directorScore.settingIdentity, 80), settingForces: (current.directorScore.settingForces || []).slice(0, 2).map(item => compactText(item, 80)), causalTempo: current.directorScore.causalTempo, futureSetup: current.directorScore.futureSetup ? { id: compactText(current.directorScore.futureSetup.id, 50), development: compactText(current.directorScore.futureSetup.development, 100), currentStep: compactText(current.directorScore.futureSetup.currentStep, 90), conditions: (current.directorScore.futureSetup.conditions || []).slice(0, 2).map(item => compactText(item, 70)), earliestWindow: compactText(current.directorScore.futureSetup.earliestWindow, 60), disclosure: current.directorScore.futureSetup.disclosure } : undefined, meaningfulAim: compactText(current.directorScore.meaningfulAim, 100), change: current.directorScore.change } : undefined,
        loreModel: current.loreModel ? { worldIdentity: compactText(current.loreModel.worldIdentity, 90), baseline: compactText(current.loreModel.baseline, 140), variantRules: (current.loreModel.variantRules || []).slice(0, 4).map(item => compactText(item, 100)), continuitySignatures: (current.loreModel.continuitySignatures || []).slice(0, 5).map(item => compactText(item, 105)), baselineDepartures: (current.loreModel.baselineDepartures || []).slice(0, 5).map(item => compactText(item, 110)), trajectorySignals: (current.loreModel.trajectorySignals || []).slice(0, 3).map(item => compactText(item, 100)), activeForces: (current.loreModel.activeForces || []).slice(0, 3).map(item => compactText(item, 90)), confidence: current.loreModel.confidence } : undefined,
        narrativeLayers: current.narrativeLayers ? { immediateAction: compactText(current.narrativeLayers.immediateAction, 80), localActivity: compactText(current.narrativeLayers.localActivity, 90), situation: compactText(current.narrativeLayers.situation, 100), widerWorld: compactText(current.narrativeLayers.widerWorld, 110), activityRole: current.narrativeLayers.activityRole, temporalScope: current.narrativeLayers.temporalScope } : undefined,
        scene: current.scene,
        authorBoard: compactAuthorBoard(current.authorBoard),
        objectives: (current.objectives || []).slice(-2).map(item => ({ title: compactText(item.title, 70), detail: compactText(item.detail, 70), status: compactText(item.status, 24) })),
        continuityThreads: (current.continuityThreads || []).slice(0, 5).map(item => ({ id: compactText(item.id, 40), thread: compactText(item.thread, 70), state: compactText(item.state, 80), status: item.status })),
        selfChallenge: current.selfChallenge ? { weakness: compactText(current.selfChallenge.weakness, 90), counterRoute: compactText(current.selfChallenge.counterRoute, 90), mechanismCheck: compactText(current.selfChallenge.mechanismCheck, 90), decision: compactText(current.selfChallenge.decision, 110) } : undefined,
        entities: (current.entities || []).slice(-2).map(item => ({ name: compactText(item.name, 70), state: compactText(item.state, 70), perspective: compactText(item.perspective, 70), motivation: compactText(item.motivation, 80), knowledge: compactText(item.knowledge, 65), constraints: compactText(item.constraints, 65), agenda: compactText(item.agenda, 80) })),
        possibilities: (current.possibilities || []).slice(-2).map(item => compactText(item, 80)),
        pathways: (current.pathways || []).slice(0, 6).map(item => ({ id: compactText(item.id, 50), lane: item.lane, agent: compactText(item.agent, 40), engine: compactText(item.engine, 45), relation: item.relation, scale: item.scale, origin: item.origin, evidenceRefs: (item.evidenceRefs || []).slice(0, 2), unresolvedBasis: compactText(item.unresolvedBasis, 75), completionCheck: item.completionCheck, mechanismStatus: item.mechanismStatus, mechanismBasis: compactText(item.mechanismBasis, 75), direction: compactText(item.direction, 90), when: compactText(item.when, 70), horizon: compactText(item.horizon, 30), status: item.status })),
        nextGuides: (current.nextGuides || []).slice(0, 2).map(item => ({ id: compactText(item.id, 50), routeLane: item.routeLane, causalAgent: compactText(item.causalAgent, 40), causalEngine: compactText(item.causalEngine, 45), scale: item.scale, direction: compactText(item.direction, 100), useWhen: compactText(item.useWhen, 70), dropWhen: compactText(item.dropWhen, 70), worldDelta: compactText(item.worldDelta, 80), origin: item.origin, mechanismStatus: item.mechanismStatus, mechanismBasis: compactText(item.mechanismBasis, 75), basis: compactText(item.basis, 80), strength: item.strength, causalEventIds: (item.causalEventIds || []).slice(0, 1), disclosure: item.disclosure })),
        activeBeat: current.pathways?.length ? undefined : { id: compactText(beat.id, 80), objective: compactText(beat.objective, 180), nextAction: compactText(beat.nextAction, 260), completion: compactText(beat.completion, 180), lifecycle: beat.lifecycle },
        planHorizons: {
            items: sampleHorizonItems(horizons.items || []).map(item => ({ id: compactText(item.id, 50), lane: item.lane, agent: compactText(item.agent, 32), engine: compactText(item.engine, 40), scale: item.scale, evidenceRefs: (item.evidenceRefs || []).slice(0, 2), unresolvedBasis: compactText(item.unresolvedBasis, 70), completionCheck: item.completionCheck, mechanismStatus: item.mechanismStatus, mechanismBasis: compactText(item.mechanismBasis, 70), direction: compactText(item.direction, 60), timeframe: compactText(item.timeframe, 50), stability: item.stability })),
            deviation: { level: horizons.deviation?.level, reason: compactText(horizons.deviation?.reason, 100) },
        },
        canonConstraints: (current.canonConstraints || []).slice(-4).map(item => compactText(item, 150)),
        userNotes: (current.userNotes || []).slice(-1).map(item => ({ kind: item.kind, text: compactText(item.text, 250) })),
        contextLedger: compactText(current.contextLedger, 300),
        storyFrame: { frame: current.storyFrame?.frame, confidence: current.storyFrame?.confidence, basis: compactText(current.storyFrame?.basis, 100) },
        narrativeEvents: (current.narrativeEvents || []).slice(-2).map(item => ({ id: compactText(item.id, 50), summary: compactText(item.summary, 90), scope: item.scope, epistemicStatus: item.epistemicStatus, disclosure: item.disclosure, status: item.status, cause: compactText(item.cause, 70), consequences: (item.consequences || []).slice(0, 1).map(value => compactText(value, 70)) })),
        lastOfferedCues: (current.lastOfferedCues || []).slice(0, 1).map(item => ({ id: compactText(item.id, 60), direction: compactText(item.direction, 100), worldDelta: compactText(item.worldDelta, 80), requestConfirmed: item.requestConfirmed === true })),
    };
}

function stripLeadingGeneratedStatusSummary(value) {
    const source = String(value || '').replace(/^\uFEFF/u, '');
    const sections = source.split(/\r?\n\s*\r?\n/u);
    const lines = String(sections[0] || '').split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
    const statusLine = /^(?:time(?:\s*&\s*weather)?|date|day|weather|location|current\s+beat|positions?|inventory(?:\s*&\s*objects)?|objects?|physical\s+state|emotions?|psyche|characters?|active\s+threads?)\s*=\s*\S/iu;
    const contentLines = lines.filter(line => !/^```(?:[\p{L}\p{N}_-]+)?$/u.test(line));
    if (contentLines.length < 3 || !contentLines.every(line => statusLine.test(line))) return source;
    return sections.slice(1).join('\n\n');
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

function cleanMessageContent(value) {
    return stripStructuredEvidence(stripLeadingGeneratedStatusSummary(value))
        .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/giu, ' ')
        .replace(/<stat>[\s\S]*?<\/stat>/giu, ' ')
        .replace(/<background_updates>[\s\S]*?<\/background_updates>/giu, ' ')
        .replace(/<living-world-guide>[\s\S]*?<\/living-world-guide>/giu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function compactMessageContent(value, tokenLimit, { latest = false } = {}) {
    const cleaned = cleanMessageContent(value);
    const cap = latest ? Math.max(tokenLimit, 1400) : tokenLimit;
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
 * Build a recency-independent story map for destructive Full Rebuilds.
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

function retrievalTerms(value) {
    return String(value || '')
        .toLocaleLowerCase()
        .match(/[\p{L}\p{N}][\p{L}\p{N}'-]{2,}/gu)?.map(term => term.replace(/(?:'s|s')$/u, ''))
        .filter(term => term.length >= 3 && !RETRIEVAL_STOP_WORDS.has(term)) || [];
}

function retrievalQueryTerms(state, recentMessages) {
    const current = stateForPrompt(state);
    const weighted = new Map();
    const add = (values, weight) => {
        for (const value of values.flat(Infinity).filter(Boolean)) {
            for (const term of new Set(retrievalTerms(value))) weighted.set(term, Math.min(12, weight + (weighted.get(term) || 0)));
        }
    };
    add((recentMessages || []).slice(-6).map(message => compactMessageContent(message?.mes, 700)), 3);
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

function focusedHistoricalExcerpt(value, claimTerms, documentFrequency, documentCount, limit = 300) {
    const source = compactMessageContent(value, Math.max(1200, String(value || '').length));
    const lower = source.toLocaleLowerCase();
    const focus = [...claimTerms]
        .map(term => ({
            index: lower.indexOf(term),
            rarity: Math.log((documentCount + 1) / ((documentFrequency.get(term) || 0) + 1)),
        }))
        .filter(item => item.index >= 0)
        .sort((a, b) => b.rarity - a.rarity || a.index - b.index)[0];
    if (!focus || source.length <= limit) return source;
    const start = Math.max(0, Math.min(source.length - limit, focus.index - Math.floor(limit * 0.2)));
    const excerpt = source.slice(start, start + limit).trim();
    return `${start ? '… ' : ''}${excerpt}${start + limit < source.length ? ' …' : ''}`;
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
    for (let index = 0; index < recentStart; index++) {
        if (!messages[index] || selected.has(index)) continue;
        documentCount++;
        for (const term of new Set(retrievalTerms(compactMessageContent(messages[index].mes, 500)))) {
            documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
        }
    }
    const records = [];
    for (let index = 0; index < recentStart; index++) {
        const message = messages[index];
        if (!message || selected.has(index)) continue;
        const content = compactMessageContent(message.mes, 360);
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
        records.push({ index, role, content, terms, overlap: overlap.length, specificity, hasIntent, hasCorrection, intentBoost, correctionBoost, proximity });
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
        if (item.overlap < 2 && !(item.overlap >= 1 && (item.hasIntent || item.hasCorrection)) && !threadBoost) return [];
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
        // Planner source labels are hints, never proof. When they cite a raw
        // message, inspect the following exchange so a setup at that message
        // cannot outrank its nearby completion.
        const anchoredRecords = claim.anchors.length
            ? records.filter(item => claim.anchors.some(anchor => item.index >= anchor && item.index <= anchor + 20))
            : records;
        const match = anchoredRecords
            .map(item => {
                const overlap = [...item.terms].filter(term => claimTerms.has(term));
                if (overlap.length < (claim.anchors.length ? 1 : 2)) return null;
                const specificity = overlap.reduce((sum, term) => sum + Math.log((documentCount + 1) / ((documentFrequency.get(term) || 0) + 1)) + 0.25, 0);
                const afterAnchor = claim.anchors.some(anchor => item.index > anchor) ? 1 : 0;
                return { item, score: specificity + (item.role === 'assistant' ? 1.5 : 0) + afterAnchor + item.proximity };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score || b.item.index - a.item.index)[0]?.item;
        if (match) add({
            ...match,
            content: focusedHistoricalExcerpt(messages[match.index]?.mes, claimTerms, documentFrequency, documentCount),
            purpose: 'audit-current-claim',
            claim: compactText(claim.text, 160),
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
        .map(({ score: _score, terms: _terms, overlap: _overlap, specificity: _specificity, hasIntent: _hasIntent, hasCorrection: _hasCorrection, intentBoost: _intentBoost, correctionBoost: _correctionBoost, proximity: _proximity, ...item }) => item);
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
    for (let index = 0; index < recentStart; index++) {
        const message = messages[index];
        if (!message || selected.has(index)) continue;
        const content = durableHookExcerpt(message.mes, 420);
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
        .map(record => attachLaterHookEvidence(record, messages))
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

function attachLaterHookEvidence(candidate, messages) {
    const pattern = hookTypePattern(candidate?.hook_type);
    if (!pattern) return candidate;
    const identity = new Set(hookIdentityTerms(candidate.content, candidate.hook_type));
    const references = new Set(hookReferenceTokens(candidate.content));
    const later = [];
    for (let index = Number(candidate.index) + 1; index < messages.length; index++) {
        const message = messages[index];
        if (!message) continue;
        const content = durableHookExcerpt(message.mes, 360);
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

export function buildAnalysisPrompt(messages, state, note = '', bootstrap = {}, options = {}) {
    const configuredBudget = Math.max(3000, Math.min(30000, Number(options.maxPromptTokens) || DEFAULT_PROMPT_TOKEN_BUDGET));
    const budget = Math.max(1800, Math.min(configuredBudget, Number(options.effectivePromptTokens) || configuredBudget));
    const messageTokenLimit = Math.max(180, Math.min(1800, Number(options.messageTokenLimit) || 600));
    const recentTokens = Math.max(900, Math.min(12000, Number(options.recentContextTokens) || Math.floor(budget * 0.42)));
    const selected = selectMessages(messages, recentTokens, messageTokenLimit, Math.min(3000, recentTokens), Boolean(options.bootstrapScan));
    const playerName = playerCharacterName(messages);
    const payload = {
        task: 'prepare_conditional_direction_set',
        instruction: 'Audit the newest eligible assistant reply, then prepare one primary and exactly two redirect-safe directions for the next user action. The writing model selects one fitting branch or none; it never combines branches.',
        authority: 'Explicit OOC/scenario commands and the latest user action outrank every retained inference. OOC outcome commands bind the stated outcome; continue or advance-time commands widen scope only as stated. Never invent player dialogue, thoughts, consent, choices, compliance, retreat, or extra actions.',
        direction_policy: DIRECTOR_POLICY,
        calibration: 'Choose movement from scene need first; apply the sampled appetite only within that compatible movement. A high or adverse sample never independently warrants complication, conflict, interruption, or escalation. It may instead make a breather, deepening, relief, resolution, or transition more vivid and consequential.',
        invention: 'New causes or conditions require conversational or explicit-canon support. Provider-visible when, operation, and required_effect text must contain only portable abstractions. Never copy names or concrete nouns from the scene: no character, location, faction, lore concept, object, body part, source material, exact activity, action, dialogue, prop, detail, endpoint, event, actor, outcome, or player reaction. Refer only to the current activity, current interaction, current environment, established pressure, or established relationship. Private fields may remain scene-specific. When injected, the provider sees only the abstract conditions, directions, effects, and useful scale fields; target, basis, preserve, forbid, and retained evidence stay private.',
        simulation: 'Use the causal unit natural to the scope. Personal and life simulation may move through needs, relationships, work, routine, opportunity, or consequence. Organization and country simulation may move through decisions, institutions, resources, factions, policy effects, public reaction, trends, or systemic pressures. World simulation may move through broad forces. Do not translate every scale into a conventional adventure encounter.',
        movement: 'Write concise natural operations, not generic bare verbs. primary_when and both alternative when conditions must distinguish plausible user intents without predicting wording. The latest user action selects one branch; if none fits, use none.',
        necessity_gate: 'Set beat.inject=false when the newest user instruction or immediate causal response is already clear enough that an abstract beat would add no useful choice or correction. Set it true only when the writing model benefits from a meaningful movement with an observable required effect. Never inject merely to prove Tale Fairy ran. Explain the private decision in inject_reason.',
        response_audit_rule: 'response_audit evaluates only the newest assistant reply after a prior conditional set. Infer the matching branch, then check that branch\'s movement and required effect, plus repetition, unjustified escalation, player control, and continuity drift. Record brief patterns, not quoted prose. If no branch fits or no reply is eligible, set applicable=false and movement_fit=not-applicable. Audit and pattern memory are private, never injected, and never trigger automatic regeneration.',
        scale_fields: 'content_class is a broad function. scope selects personal/social/institutional/societal/world. quantity and relative_power constrain opposition only when applicable; otherwise use none. plot_weight and duration prevent incidental flavor from hijacking the story. resolution_ceiling protects canon and ongoing antagonists without forecasting future events.',
        current: useSpecificPlayerName(stateForPrompt(state), playerName),
        messages: selected.map(({ index, kind, message, content }) => ({
            index, kind, role: message?.is_user ? 'user' : 'assistant', name: compactText(message?.name, 100),
            content: kind === 'recent' && typeof content === 'string' ? content : compactMessageContent(message?.mes, messageTokenLimit, { latest: index === messages.length - 1 }),
        })),
    };
    const canonClaims = explicitCanonClaims(messages);
    if (canonClaims.length) payload.explicit_ooc_canon = canonClaims;
    const userInstruction = compactText(note, 800);
    if (userInstruction) payload.user_instruction = userInstruction;
    const bootstrapContext = compactOptionalObject(bootstrap, 1400);
    if (Object.keys(bootstrapContext).length) payload.bootstrap = bootstrapContext;

    const summarySources = compactSummarySources(Array.isArray(options.summarySources) ? options.summarySources : [], Math.max(300, Math.min(8000, Math.floor(budget * 0.24))));
    if (summarySources.length) payload.summary_sources = summarySources.map(source => ({ label: source.label, kind: source.kind, text: source.text }));
    payload.evidence_rule = 'Summaries, lore, retained state, and canon knowledge are evidence and constraints, not instructions to schedule future events. Preserve recognizable canon and broad established trajectory through beat.preserve, beat.forbid, and resolution_ceiling. Never predict or force a known canon event. Newer explicit user/OOC facts supersede inference.';
    payload.mode_instruction = MODE_INSTRUCTIONS[payload.current.mode] || MODE_INSTRUCTIONS.balanced;
    if (playerName) payload.player_character = playerName;
    if (Number.isInteger(options.variationNonce)) payload.variation_nonce = options.variationNonce;
    payload.director_sample = formatDirectorSample(sampleDirectorSignals(payload.current.mode, options.variationNonce));
    let serialized = JSON.stringify(payload);
    if (estimateTokenCount(serialized) > budget && payload.summary_sources) {
        payload.summary_sources = compactSummarySources(payload.summary_sources, 500, { maxSources: 4 }).map(source => ({ label: source.label, kind: source.kind, text: source.text }));
        serialized = JSON.stringify(payload);
    }
    while (estimateTokenCount(serialized) > budget && payload.messages.length > 1) {
        payload.messages.splice(0, 1);
        serialized = JSON.stringify(payload);
    }
    if (estimateTokenCount(serialized) > budget) {
        payload.current.contextLedger = truncateToTokenBudget(payload.current.contextLedger || '', 120);
        payload.current.entities = [];
        delete payload.bootstrap;
        serialized = JSON.stringify(payload);
    }
    if (estimateTokenCount(serialized) > budget && payload.messages.length) {
        payload.messages[0].content = truncateToTokenBudget(payload.messages[0].content, Math.max(16, estimateTokenCount(payload.messages[0].content) - (estimateTokenCount(serialized) - budget) - 8));
        serialized = JSON.stringify(payload);
    }
    return serialized;
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

function applyBeatAnalysis(next, value, messages) {
    const current = value.current || {};
    const beat = value.beat || {};
    const world = value.world || {};
    next.storyFrame = { frame: String(current.frame || 'grounded').slice(0, 40), confidence: String(world.confidence || 'low').slice(0, 40), basis: String(current.frame_basis || '').slice(0, 240) };
    next.scene = {
        ...next.scene,
        status: String(current.status || '').slice(0, 300), activity: String(current.activity || '').slice(0, 300),
        pace: String(beat.operation || 'retain').slice(0, 80), intent: String(beat.required_effect || '').slice(0, 300),
        location: String(current.location || '').slice(0, 200), time: String(current.time || '').slice(0, 160), loop: current.loop === true,
    };
    next.sceneProfile = normalizeState({ sceneProfile: {
        promise: current.scene_promise, phase: current.phase, emotional_direction: current.emotional_direction,
        pressure: current.pressure, intrusion: current.intrusion, novelty_ceiling: current.novelty_ceiling, basis: current.frame_basis,
    } }).sceneProfile;
    next.responseAudit = normalizeState({ responseAudit: value.response_audit }).responseAudit;
    next.responsePatternMemory = [...next.responsePatternMemory, ...next.responseAudit.patterns].slice(-12);
    next.beatDirective = normalizeState({ beatDirective: beat }).beatDirective;
    next.narrativeLayers = normalizeState({ narrativeLayers: {
        immediate_action: current.immediate_action, local_activity: current.activity, situation: current.situation,
        wider_world: world.baseline, durable_trajectory: '', activity_role: current.activity_role, temporal_scope: current.temporal_scope,
    } }).narrativeLayers;
    next.loreModel = normalizeState({ loreModel: {
        world_identity: world.identity, baseline: world.baseline, variant_rules: world.variant_rules,
        baseline_departures: world.rp_changes, continuity_signatures: world.signatures, active_forces: world.forces, confidence: world.confidence,
    } }).loreModel;

    const threadUpdates = asArray(value.thread_updates).map(update => ({ ...update }));
    next.continuityThreads = normalizeState({ continuityThreads: upsertByKey(next.continuityThreads, threadUpdates, 'id') }).continuityThreads;
    const actorUpdates = asArray(value.actor_updates).map(update => {
        const existing = next.entities.find(item => item.name.toLocaleLowerCase() === String(update?.name || '').trim().toLocaleLowerCase()) || {};
        return { ...existing, ...update, relevance: existing.relevance || 'current causal actor', confidence: existing.confidence || world.confidence };
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

    // v48+ deliberately has no future route lifecycle. These fields remain in
    // saved-state shape for downgrade/migration safety but never drive output.
    next.objectives = [];
    next.possibilities = [];
    next.pathways = [];
    next.nextGuides = [];
    next.planHorizons = { items: [], deviation: { level: 'none', reason: '' } };
    next.narrativeEvents = [];
    next.guidance = '';
    next.lastInject = next.beatDirective.inject;
    next.lastReason = String(value.audit || beat.basis || '').trim().slice(0, 500);
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
    const value = result && typeof result === 'object' ? useSpecificPlayerName(result, playerName) : {};
    if (value.contract_version === 4) return applyBeatAnalysis(next, value, messages);
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

const PLANNER_SYSTEM = `You are Tale Fairy, an adaptive narrative director. Another model writes the actual roleplay or simulation. Return only JSON matching the schema.

First determine what movement the scene actually warrants. Then use the weighted sample to color that movement's strength, novelty, and fortune. The sample is not an event taxonomy: it never selects the movement and never creates a need for an incident. Conduct the next response, not a future route; leave its exact realization to the writing model.

AUTHORITY: Explicit user/OOC/scenario commands outrank retained state and your preferences. A forced outcome binds that outcome. A continue or time-advance command widens scope only as stated. The latest user action defines the endpoint. Never invent player dialogue, thoughts, feelings, consent, decisions, compliance, retreat, or extra actions.

DIRECTION: ${DIRECTOR_POLICY}

CALIBRATION: Quietness is not stagnation. A scene may warrant a breather, deepening, relief, resolution, or transition with no incident. High intervention means fuller expression of the chosen movement, not compulsory disruption. An adverse sample cannot justify manufacturing difficulty. Escalate only when pressure, causality, unresolved action, or explicit user direction independently supports it.

CONDITIONAL MOVEMENT SET: When the newest message is an assistant response, the user's next action is unknown; prepare a compact policy that remains fresh for exactly that next action. When the newest message is already a user action, make the primary branch fit that known action. beat.primary_when states when the primary direction fits. beat.alternatives contains exactly two materially distinct redirect-safe branches with natural-language when conditions. Cover plausible changes of intent rather than predicting exact words: for example continued engagement, resistance or withdrawal, a focus change, or an authorized time transition as the scene warrants. Conditions must be mutually distinguishable, and none may require changing or reinterpreting the user's action. If no condition later fits, the writing model will use none of the set.

MOVEMENT: Write every operation as a concise, natural, scene-aware direction for how the next response should move under that branch. Each must be general enough to leave the concrete realization open, but not a generic bare verb such as deepen, continue, complicate, or introduce. There is no fixed taxonomy, approved vocabulary, nearest label, or fallback bucket. Scene changes, pressure shifts, reversals, discoveries, good turns, bad turns, mixed consequences, new causes, stillness, and any other context-compatible movement are all available.

INVENTION: The writing model chooses the realization. Visible branch text must be portable to any scene with the same dramatic shape and state only wanted function or change. Never name or repeat a character, location, faction, lore concept, object, body part, source, exact activity, action, dialogue, prop, detail, endpoint, event, actor, outcome, or player reaction. Use current activity, current interaction, current environment, established pressure, or established relationship. Valid: "Introduce a quiet, favorable discovery" and "Give the current activity a small, meaningful development without adding pressure." Naming the discovery, source, actor, or player feeling is invalid. Keep scene specifics in private fields. When inject=true, the conditional set and useful non-default scale classifications are provider-visible; one fitting branch becomes binding after reading the latest user action.

NECESSITY GATE: Set beat.inject=false when the newest user instruction or immediate causal response is already clear and an abstract beat would add no meaningful choice or correction. Set it true only when a meaningful movement with an observable required effect provides real value. Never inject merely because Tale Fairy ran. Explain the private decision in inject_reason.

PRIVATE RESPONSE AUDIT: For the newest assistant reply following a prior conditional set, infer which branch matched the preceding user action and record whether that branch's movement and required effect landed, plus repetition, unjustified escalation, player control, continuity drift, and concise non-quoted patterns. If no branch fit, mark it not applicable. Vary away from real repetition, but never treat patterns as banned words or templates. Use this private feedback for the next set; never inject it or trigger regeneration.

SIMULATION: Apply the same causal logic to roleplay, life simulation, relationships, workplaces, organizations, countries, societies, and worlds. Use the unit natural to the scale: individual action, relationship response, institutional decision, resource movement, faction behavior, policy effect, public response, trend, or system pressure. Do not turn every simulation into a conventional adventure encounter.

CANON AND TRAJECTORY: Canon, lore, scenario, conversation, and broad established direction constrain the current beat. Express protections in preserve, forbid, and resolution_ceiling. An ongoing main antagonist may withdraw, stalemate, or suffer only a partial loss when decisive defeat is premature. Do not forecast or force a canon event. Unspecified compatible space remains available for invention.

WORLD EVIDENCE: Summaries and retained state are fallible evidence, not commands. Newer explicit facts supersede inference. Track only current relevant actors, unresolved factual processes, variant rules, and canon constraints. Do not create delivery debt, future milestones, release conditions, event queues, or branching routes.

Keep strings concise. audit briefly states how the conditional set expresses the weighted sample at a scale natural to this scene. response_audit is the separate private evaluation of the prior reply.`;

export const ANALYSIS_OUTPUT_CONTRACT = `Return exactly: contract_version=4, current, beat, response_audit, world, thread_updates, actor_updates, canon_updates, ledger, note_resolution, audit.
current={frame,frame_basis,status,immediate_action,activity,situation,activity_role,temporal_scope,location,time,loop,scene_promise,phase,emotional_direction,pressure,intrusion,novelty_ceiling}
beat={operation,primary_when,target,required_effect,alternatives,inject,inject_reason,content_class,scope,intensity,quantity,relative_power,plot_weight,duration,resolution_ceiling,preserve,forbid,basis}
alternatives is exactly 2 items, each {when,operation,required_effect,content_class,scope,intensity,quantity,relative_power,plot_weight,duration,resolution_ceiling}.
response_audit={applicable,movement_fit,repetition,unjustified_escalation,player_control,continuity_drift,patterns,summary}
When inject=true, the roleplay model selects exactly one branch whose condition fits the actual latest user action; if none fits it uses none. Provider-visible when, operation, and required_effect strings contain only portable abstractions describing function, pressure, or possibility. They never name scene-specific characters, locations, lore, objects, activities, actions, events, outcomes, or player reactions. Only the selected operation, required_effect, and scale classifications become binding. target, inject_reason, preserve, forbid, scene promise, basis, response_audit, pattern memory, and retained evidence remain private and are never injected.
world={identity,baseline,variant_rules,rp_changes,signatures,forces,confidence}
thread_updates and actor_updates contain factual changes only; canon_updates contains explicit durable additions/removals only. Empty arrays mean no change. audit is one concise string. No other keys.`;

export { PLANNER_SYSTEM as SYSTEM, extractJson };
