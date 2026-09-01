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
function movement(value) { return text(value, 80).replace(/\s+/gu, ' '); }
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
    return { operation: '', target: 'current activity', requiredEffect: '', inject: false, injectReason: '', contentClass: 'none', scope: 'personal', intensity: 'none', quantity: 'none', relativePower: 'none', plotWeight: 'none', duration: 'beat', resolutionCeiling: 'open', preserve: [], forbid: [], basis: '' };
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
    const operation = movement(value.operation);
    const requiredEffect = text(value.requiredEffect ?? value.required_effect, 260);
    return {
        operation,
        target: text(value.target, 160) || 'current activity',
        requiredEffect,
        inject: Object.hasOwn(value, 'inject') ? value.inject === true : Boolean(operation && requiredEffect),
        injectReason: text(value.injectReason ?? value.inject_reason, 220),
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
    return Boolean(beat.inject && beat.operation && beat.requiredEffect);
}

export function formatBeatContract(_sceneValue, beatValue, _options = {}) {
    const beat = normalizeBeatDirective(beatValue);
    if (!beat.inject || !beat.operation) return '';
    const fields = [`movement=${beat.operation}`];
    if (beat.contentClass !== 'none') fields.push(`content=${beat.contentClass}`);
    if (beat.scope !== 'personal') fields.push(`scope=${beat.scope}`);
    if (beat.intensity !== 'none') fields.push(`intensity=${beat.intensity}`);
    if (beat.quantity !== 'none') fields.push(`quantity=${beat.quantity}`);
    if (beat.relativePower !== 'none') fields.push(`relative power=${beat.relativePower}`);
    if (beat.plotWeight !== 'none') fields.push(`plot weight=${beat.plotWeight}`);
    if (beat.duration !== 'beat') fields.push(`duration=${beat.duration}`);
    if (beat.resolutionCeiling !== 'open') fields.push(`resolution ceiling=${beat.resolutionCeiling}`);
    return `ANALYZED BEAT: ${fields.join('; ')}.`;
}
