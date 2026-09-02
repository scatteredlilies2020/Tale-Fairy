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
const MODES = new Set(['light', 'balanced', 'fun']);

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
const MODE_TREATMENT = Object.freeze({
    light: 'LIGHT TREATMENT: Keep it understated, but make the required effect perceptible in this response; subtle does not mean optional.',
    balanced: 'BALANCED TREATMENT: Make the required effect clear and meaningful enough to change the immediate situation or its possibilities.',
    fun: 'FUN TREATMENT: Give the selected movement and required effect a prominent, lively expression; prefer a bold or surprising realization where it fits, without changing the movement\'s kind or natural scale.',
});

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
    return { operation: '', primaryWhen: '', target: 'current activity', requiredEffect: '', alternatives: [], inject: false, injectReason: '', contentClass: 'none', scope: 'personal', intensity: 'none', quantity: 'none', relativePower: 'none', plotWeight: 'none', duration: 'beat', resolutionCeiling: 'open', preserve: [], forbid: [], basis: '' };
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
    const alternatives = (Array.isArray(value.alternatives) ? value.alternatives : []).slice(0, 2).map(item => ({
        when: text(item?.when, 180),
        operation: movement(item?.operation),
        requiredEffect: text(item?.requiredEffect ?? item?.required_effect, 260),
        contentClass: choice(item?.contentClass ?? item?.content_class, CONTENT, 'none'),
        scope: choice(item?.scope, SCOPES, 'personal'),
        intensity: choice(item?.intensity, INTENSITY, 'none'),
        quantity: choice(item?.quantity, QUANTITY, 'none'),
        relativePower: choice(item?.relativePower ?? item?.relative_power, POWER, 'none'),
        plotWeight: choice(item?.plotWeight ?? item?.plot_weight, WEIGHT, 'none'),
        duration: choice(item?.duration, DURATION, 'beat'),
        resolutionCeiling: choice(item?.resolutionCeiling ?? item?.resolution_ceiling, CEILINGS, 'open'),
    })).filter(item => item.when && item.operation && item.requiredEffect);
    return {
        operation,
        primaryWhen: text(value.primaryWhen ?? value.primary_when, 180),
        target: text(value.target, 160) || 'current activity',
        requiredEffect,
        alternatives,
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
    return Boolean(beat.inject && beat.operation && beat.primaryWhen && beat.requiredEffect && beat.alternatives.length === 2);
}

function sentence(value) {
    const source = movement(value).replace(/[.!?]+$/u, '');
    return source ? `${source.charAt(0).toUpperCase()}${source.slice(1)}` : '';
}

function effectSentence(value) {
    const source = text(value, 260).replace(/\s+/gu, ' ').replace(/[.!?]+$/u, '');
    return source ? `${source.charAt(0).toUpperCase()}${source.slice(1)}` : '';
}

function naturalList(items) {
    if (items.length < 2) return items[0] || '';
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

function branchDirection(label, branch) {
    const qualities = [];
    if (branch.contentClass !== 'none') qualities.push(CONTENT_WORDING[branch.contentClass]);
    if (branch.scope !== 'personal') qualities.push(`${branch.scope} in scope`);
    if (branch.intensity !== 'none') qualities.push(`${branch.intensity} in intensity`);
    if (branch.quantity !== 'none') qualities.push(QUANTITY_WORDING[branch.quantity]);
    if (branch.relativePower !== 'none') qualities.push(POWER_WORDING[branch.relativePower]);
    if (branch.plotWeight !== 'none') qualities.push(PLOT_WORDING[branch.plotWeight]);
    if (branch.duration !== 'beat') qualities.push(DURATION_WORDING[branch.duration]);
    if (branch.resolutionCeiling !== 'open') qualities.push(RESOLUTION_WORDING[branch.resolutionCeiling]);
    const treatment = qualities.length ? `, keeping the development ${naturalList(qualities)}` : '';
    return `${label} DIRECTION: ${sentence(branch.operation)}${treatment}.\n${label} REQUIRED EFFECT: ${effectSentence(branch.requiredEffect)}.`;
}

export function formatBeatContract(_sceneValue, beatValue, options = {}) {
    const beat = normalizeBeatDirective(beatValue);
    if (!hasUsableBeatDirective(beat)) return '';
    const requestedMode = String(options.mode ?? options.directorSample?.mode ?? '').trim().toLowerCase();
    const mode = MODES.has(requestedMode) ? requestedMode : 'balanced';
    return [
        'CONDITIONAL TALE FAIRY DIRECTION SET: Resolve this set only after reading the latest user action. Select exactly one fitting branch. Never combine branches. If no WHEN condition fits, use none of the set and answer the user action directly.',
        `PRIMARY WHEN: ${effectSentence(beat.primaryWhen)}.`,
        branchDirection('PRIMARY', beat),
        ...beat.alternatives.flatMap((branch, index) => [
            `ALTERNATIVE ${index + 1} WHEN: ${effectSentence(branch.when)}.`,
            branchDirection(`ALTERNATIVE ${index + 1}`, branch),
        ]),
        MODE_TREATMENT[mode],
        'After selecting a branch, treat only its direction and required effect as binding while freely choosing their context-compatible concrete realization. The latest user action always takes priority; never override or reinterpret that action to make a branch fit. Do not decide the player character\'s dialogue, thoughts, feelings, consent, choices, or reactions.',
    ].join('\n');
}
