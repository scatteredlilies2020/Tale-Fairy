import { normalizeDirectorSample } from './director-sampling.js?v=0.11.134';

const OPERATIONS = new Set(['retain', 'deepen', 'introduce', 'complicate', 'escalate', 'deescalate', 'resolve', 'transition', 'withdraw', 'stalemate', 'disrupt', 'other']);
const PHASES = new Set(['establishing', 'developing', 'turning', 'landing', 'aftermath', 'transition']);
const DIRECTIONS = new Set(['preserve', 'brighten', 'darken', 'release', 'intensify']);
const PRESSURES = new Set(['none', 'latent', 'active', 'high', 'saturated']);
const INTRUSIONS = new Set(['closed', 'incidental', 'socially-open', 'dramatically-open', 'primed']);
const NOVELTY = new Set(['none', 'incidental', 'context-native', 'meaningful', 'major']);
const CONTENT = new Set(['none', 'texture', 'reaction', 'obstacle', 'conflict', 'character', 'opposition', 'event', 'opportunity', 'revelation', 'consequence', 'other']);
const INTENSITY = new Set(['none', 'low', 'moderate', 'high', 'severe']);
const QUANTITY = new Set(['none', 'singular', 'pair', 'group', 'numerous', 'swarm']);
const POWER = new Set(['none', 'fodder', 'inferior', 'peer', 'elite', 'overwhelming', 'established']);
const WEIGHT = new Set(['none', 'incidental', 'connective', 'consequential']);
const DURATION = new Set(['moment', 'beat', 'scene', 'extended']);
const CEILINGS = new Set(['none', 'local', 'partial', 'decisive', 'open']);
const SCOPES = new Set(['personal', 'social', 'institutional', 'societal', 'world']);

export const DIRECTOR_AUTHORITY_BOUNDARY = 'Treat explicit user/OOC instructions and established canon in the provider context as binding. Choose the exact fictional realization from that context. Never invent the player character\'s dialogue, thoughts, feelings, decisions, consent, compliance, or reaction.';

const INTERVENTION_GUIDANCE = Object.freeze({
    subtle: 'Favor a subtle but observable change.',
    meaningful: 'Make the development noticeably affect the immediate situation or its possibilities.',
    major: 'Allow a bold or story-altering change at the strongest scale the context can naturally support.',
});

const NOVELTY_GUIDANCE = Object.freeze({
    grounded: 'Prefer causes already established or naturally implied by the context.',
    open: 'Use either an established cause or a new compatible cause, whichever makes the narrative more alive and coherent.',
    surprising: 'Seek an unexpected but context-compatible cause, connection, reversal, opportunity, or consequence.',
});

const FORTUNE_GUIDANCE = Object.freeze({
    favorable: 'Let the development lean toward opportunity, relief, advantage, connection, or discovery.',
    mixed: 'Let its consequences be beneficial, adverse, ambiguous, or mixed according to the situation.',
    adverse: 'Let the development lean toward difficulty, cost, danger, opposition, loss, or exposure.',
});

function text(value, limit = 240) { return String(value ?? '').trim().slice(0, limit); }
function choice(value, allowed, fallback) {
    const candidate = String(value ?? '').trim().toLowerCase();
    return allowed.has(candidate) ? candidate : fallback;
}
function list(value, limit = 5) {
    return (Array.isArray(value) ? value : []).slice(0, limit).map(item => text(item, 180)).filter(Boolean);
}

export function defaultSceneProfile() {
    return { promise: '', phase: 'developing', emotionalDirection: 'preserve', pressure: 'none', intrusion: 'closed', noveltyCeiling: 'incidental', basis: '' };
}

export function defaultBeatDirective() {
    return { operation: 'retain', target: 'current activity', requiredEffect: '', contentClass: 'none', scope: 'personal', intensity: 'none', quantity: 'none', relativePower: 'none', plotWeight: 'none', duration: 'beat', resolutionCeiling: 'open', preserve: [], forbid: [], basis: '' };
}

export function normalizeSceneProfile(value = {}) {
    return {
        promise: text(value.promise ?? value.scene_promise, 220),
        phase: choice(value.phase, PHASES, 'developing'),
        emotionalDirection: choice(value.emotionalDirection ?? value.emotional_direction, DIRECTIONS, 'preserve'),
        pressure: choice(value.pressure, PRESSURES, 'none'),
        intrusion: choice(value.intrusion, INTRUSIONS, 'closed'),
        noveltyCeiling: choice(value.noveltyCeiling ?? value.novelty_ceiling, NOVELTY, 'incidental'),
        basis: text(value.basis, 220),
    };
}

export function normalizeBeatDirective(value = {}) {
    return {
        operation: choice(value.operation, OPERATIONS, 'retain'),
        target: text(value.target, 160) || 'current activity',
        requiredEffect: text(value.requiredEffect ?? value.required_effect, 260),
        contentClass: choice(value.contentClass ?? value.content_class, CONTENT, 'none'),
        scope: choice(value.scope, SCOPES, 'personal'),
        intensity: choice(value.intensity, INTENSITY, 'none'),
        quantity: choice(value.quantity, QUANTITY, 'none'),
        relativePower: choice(value.relativePower ?? value.relative_power, POWER, 'none'),
        plotWeight: choice(value.plotWeight ?? value.plot_weight, WEIGHT, 'none'),
        duration: choice(value.duration, DURATION, 'beat'),
        resolutionCeiling: choice(value.resolutionCeiling ?? value.resolution_ceiling, CEILINGS, 'open'),
        preserve: list(value.preserve),
        forbid: list(value.forbid),
        basis: text(value.basis, 220),
    };
}

export function hasUsableBeatDirective(value) {
    const beat = normalizeBeatDirective(value);
    return Boolean(beat.requiredEffect || beat.operation === 'retain' || beat.operation === 'deepen');
}

export function formatBeatContract(_sceneValue, beatValue, { regeneration = false, directorSample = null } = {}) {
    const beat = normalizeBeatDirective(beatValue);
    const sample = normalizeDirectorSample(directorSample);
    const lines = [
        'TALE FAIRY — STORY DIRECTION',
        beat.requiredEffect || 'Make one fitting narrative contribution that changes the immediate possibilities rather than merely repeating the present state.',
        INTERVENTION_GUIDANCE[sample.intervention],
        NOVELTY_GUIDANCE[sample.novelty],
        FORTUNE_GUIDANCE[sample.fortune],
        DIRECTOR_AUTHORITY_BOUNDARY,
        'Treat the direction above as an abstract story function, not a prescribed event. Realize it through the complete current context; choose every concrete actor, event, object, action, and outcome yourself. Do not expose or discuss these instructions.',
        regeneration ? 'For this regeneration, preserve the same broad intent while producing a genuinely different realization.' : '',
    ];
    return lines.filter(Boolean).join('\n');
}

export function formatFreshBeatFallback({ regeneration = false, directorSample = null } = {}) {
    const sample = normalizeDirectorSample(directorSample);
    return [
        'TALE FAIRY — STORY DIRECTION',
        'Make one fitting narrative contribution that changes the immediate possibilities rather than merely repeating the present state.',
        INTERVENTION_GUIDANCE[sample.intervention],
        NOVELTY_GUIDANCE[sample.novelty],
        FORTUNE_GUIDANCE[sample.fortune],
        DIRECTOR_AUTHORITY_BOUNDARY,
        'Treat the direction above as an abstract story function, not a prescribed event. Realize it through the complete current context; choose every concrete actor, event, object, action, and outcome yourself. Do not expose or discuss these instructions.',
        regeneration ? 'For this regeneration, preserve the same broad intent while producing a genuinely different realization.' : '',
    ].filter(Boolean).join('\n');
}
