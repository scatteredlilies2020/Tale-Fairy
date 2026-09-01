import { formatDirectorSample } from './director-sampling.js?v=0.11.123';

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

export const DIRECTOR_AUTHORITY_BOUNDARY = 'DIRECTOR AUTHORITY: Explicit user/OOC instructions remain binding. Otherwise, freely deepen, advance, intensify, relieve, interrupt, resolve, redirect, or transition the scene and its world when context supports it; these are examples, not a closed taxonomy. You may invent a new compatible cause rather than waiting for an existing thread. Choose the exact event, actor, challenge, opportunity, consequence, or other realization from the complete context. Never invent the player character\'s dialogue, thoughts, feelings, decisions, consent, compliance, or reaction.';

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

function envelope(beat) {
    const parts = [beat.contentClass !== 'none' ? beat.contentClass : '', `${beat.scope} scope`, beat.intensity !== 'none' ? `${beat.intensity} intensity` : '', beat.quantity !== 'none' ? beat.quantity : '', beat.relativePower !== 'none' ? `${beat.relativePower} relative power` : '', beat.plotWeight !== 'none' ? `${beat.plotWeight} plot weight` : '', beat.duration ? `${beat.duration} duration` : '', beat.resolutionCeiling !== 'open' ? `${beat.resolutionCeiling} resolution ceiling` : 'resolution remains context-dependent'];
    return parts.filter(Boolean).join('; ');
}

export function formatBeatContract(sceneValue, beatValue, { regeneration = false, directorSample = null } = {}) {
    const scene = normalizeSceneProfile(sceneValue);
    const beat = normalizeBeatDirective(beatValue);
    const lines = [
        'TALE FAIRY — ADAPTIVE DIRECTOR',
        formatDirectorSample(directorSample),
        scene.promise ? `SCENE PROMISE: ${scene.promise}` : '',
        `SCENE READ: ${scene.phase}; ${scene.emotionalDirection}; pressure ${scene.pressure}; intrusion ${scene.intrusion}; novelty ceiling ${scene.noveltyCeiling}.`,
        `PLANNER LEAN: ${beat.operation.toUpperCase()} — ${beat.target}.`,
        beat.requiredEffect ? `PLANNER DIRECTION: ${beat.requiredEffect}` : 'PLANNER DIRECTION: Read the current activity and choose a fitting development.',
        `CONTENT ENVELOPE: ${envelope(beat)}.`,
        beat.preserve.length ? `PRESERVE: ${beat.preserve.join('; ')}.` : '',
        beat.forbid.length ? `DO NOT: ${beat.forbid.join('; ')}.` : '',
        DIRECTOR_AUTHORITY_BOUNDARY,
        'Interpret the weighted sample, planner lean, and latest scene together. Do not mechanically obey a label or default to the smallest possible change. Make one coherent narrative contribution in this response. Its form may be beneficial, adverse, mixed, ordinary, strange, intimate, institutional, political, dangerous, or transformative according to context.',
        'Calibrate scale to the actual setting. A quiet or everyday scene can carry meaningful social, practical, emotional, academic, professional, or intriguing movement; an already dangerous scene can support severe or fatal stakes. Do not import danger merely because another genre would permit it.',
        'Preserve established canon and information boundaries. Scene progression and transitions are allowed; player decisions remain the player\'s alone.',
        regeneration ? 'For this regeneration, reuse this weighted sample and directorial purpose, but realize it differently from the discarded response.' : '',
    ];
    return lines.filter(Boolean).join('\n');
}

export function formatFreshBeatFallback({ regeneration = false, directorSample = null } = {}) {
    return [
        'TALE FAIRY — LIVE ADAPTIVE DIRECTOR',
        formatDirectorSample(directorSample),
        DIRECTOR_AUTHORITY_BOUNDARY,
        'Read the current scene and make one context-aware narrative contribution. It may deepen what is present, create opportunity or adversity, interrupt, reveal, complicate, intensify, relieve, resolve, redirect, transform, or transition the scene—or take another fitting approach. These are examples only. Do not stagnate merely because no retained thread demands movement.',
        'Calibrate the contribution to the setting and current stakes. Use the natural causal unit of personal life, relationships, school, work, institutions, politics, investigation, battle, fantasy, society, or the wider world. Preserve canon and information boundaries.',
        regeneration ? 'Reuse this weighted sample and directorial purpose while producing a genuinely different realization from the discarded response.' : '',
    ].filter(Boolean).join('\n');
}
