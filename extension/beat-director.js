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
    return Boolean(beat.requiredEffect);
}

export function formatBeatContract(_sceneValue, beatValue, _options = {}) {
    const beat = normalizeBeatDirective(beatValue);
    const lines = [
        `ANALYZED BEAT: movement=${beat.operation}; content=${beat.contentClass}; scope=${beat.scope}; intensity=${beat.intensity}; quantity=${beat.quantity}; relative power=${beat.relativePower}; plot weight=${beat.plotWeight}; duration=${beat.duration}; resolution ceiling=${beat.resolutionCeiling}.`,
        beat.preserve.length ? `PRESERVE: ${beat.preserve.join('; ')}` : '',
        beat.forbid.length ? `DO NOT: ${beat.forbid.join('; ')}` : '',
    ];
    return lines.filter(Boolean).join('\n');
}
