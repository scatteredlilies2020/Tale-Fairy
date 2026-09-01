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

const CONTENT_WORDING = Object.freeze({
    texture: 'texture-led',
    reaction: 'reaction-led',
    obstacle: 'obstacle-centered',
    conflict: 'conflict-centered',
    character: 'character-focused',
    opposition: 'opposition-driven',
    event: 'event-led',
    opportunity: 'opportunity-led',
    revelation: 'revelation-led',
    consequence: 'consequence-driven',
    other: 'open to whatever form best fits the scene',
});
const QUANTITY_WORDING = Object.freeze({
    singular: 'focused on one element', pair: 'focused on a pair', group: 'group-scaled', numerous: 'numerous in scale', swarm: 'swarm-scaled',
});
const POWER_WORDING = Object.freeze({
    fodder: 'matched to minor opposition', inferior: 'matched to weaker opposition', peer: 'matched to peer-level opposition', elite: 'matched to elite opposition', overwhelming: 'matched to overwhelming opposition', established: 'matched to the established power level',
});
const DURATION_WORDING = Object.freeze({ moment: 'momentary', scene: 'sustained through the scene', extended: 'extended in duration' });
const RESOLUTION_WORDING = Object.freeze({ none: 'left unresolved', local: 'locally resolvable', partial: 'only partially resolvable', decisive: 'open to decisive resolution' });
const PLOT_WORDING = Object.freeze({ incidental: 'incidental to the ongoing story', connective: 'connective to the ongoing story', consequential: 'consequential for the ongoing story' });

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

function sentence(value) {
    const source = movement(value).replace(/[.!?]+$/u, '');
    return source ? `${source.charAt(0).toUpperCase()}${source.slice(1)}` : '';
}

function naturalList(items) {
    if (items.length < 2) return items[0] || '';
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

export function formatBeatContract(_sceneValue, beatValue, _options = {}) {
    const beat = normalizeBeatDirective(beatValue);
    if (!beat.inject || !beat.operation) return '';
    const qualities = [];
    if (beat.contentClass !== 'none') qualities.push(CONTENT_WORDING[beat.contentClass]);
    if (beat.scope !== 'personal') qualities.push(`${beat.scope} in scope`);
    if (beat.intensity !== 'none') qualities.push(`${beat.intensity} in intensity`);
    if (beat.quantity !== 'none') qualities.push(QUANTITY_WORDING[beat.quantity]);
    if (beat.relativePower !== 'none') qualities.push(POWER_WORDING[beat.relativePower]);
    if (beat.plotWeight !== 'none') qualities.push(PLOT_WORDING[beat.plotWeight]);
    if (beat.duration !== 'beat') qualities.push(DURATION_WORDING[beat.duration]);
    if (beat.resolutionCeiling !== 'open') qualities.push(RESOLUTION_WORDING[beat.resolutionCeiling]);
    const treatment = qualities.length ? `, keeping the development ${naturalList(qualities)}` : '';
    return `NARRATIVE DIRECTION: ${sentence(beat.operation)}${treatment}.`;
}
