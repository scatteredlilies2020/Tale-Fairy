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
const SCOPES = new Set(['personal', 'social', 'institutional', 'societal', 'world']);
const MODES = new Set(['light', 'balanced', 'fun']);

const MODE_TREATMENT = Object.freeze({
    light: 'LIGHT TREATMENT: Keep the NPC or world follow-through understated but perceptible.',
    balanced: 'BALANCED TREATMENT: Give the NPC or world follow-through a clear, meaningful effect.',
    fun: 'FUN TREATMENT: Give the NPC or world follow-through a prominent, lively expression without touching the user action.',
});
const OUTCOME_CAP_PATTERN = /(?:\b(?:narrower way|remain pending|remain closed|stay closed|stay sealed|unrestricted access)\b|\bonly partially resolv\w*\b|\b(?:deny|delay|defer|withhold|block|prevent|restrict)\w*\b.{0,48}\b(?:access|answer|availability|information|outcome|progress|resolution|response)\b|\b(?:limit|limited)\b.{0,48}\b(?:access|answer|availability|information|outcome|progress|resolution|response)\b|\bwithout\b.{0,48}\b(?:allowing|answering|granting|opening|providing|resolving)\b|\bnot\b.{0,32}\b(?:allow|answer|grant|open|provide|resolve)\b)/iu;
const SAFE_FOLLOW_THROUGH = Object.freeze({
    operation: 'let an NPC or the world respond directly and create the natural next step',
    requiredEffect: 'Make the external response observable and open a meaningful next change',
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
    return { operation: '', primaryWhen: '', target: 'current activity', requiredEffect: '', alternatives: [], inject: false, injectReason: '', contentClass: 'none', scope: 'personal', intensity: 'none', quantity: 'none', relativePower: 'none', plotWeight: 'none', duration: 'beat', preserve: [], forbid: [], basis: '' };
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

function branchDirection(label, branch) {
    const capped = OUTCOME_CAP_PATTERN.test(`${branch.operation} ${branch.requiredEffect}`);
    const selected = capped ? SAFE_FOLLOW_THROUGH : branch;
    return `${label} NEXT-STEP DIRECTION: ${sentence(selected.operation)}.\n${label} NEXT-STEP EFFECT: ${effectSentence(selected.requiredEffect)}.`;
}

export function formatBeatContract(_sceneValue, beatValue, options = {}) {
    const beat = normalizeBeatDirective(beatValue);
    if (!hasUsableBeatDirective(beat)) return '';
    const requestedMode = String(options.mode ?? options.directorSample?.mode ?? '').trim().toLowerCase();
    const mode = MODES.has(requestedMode) ? requestedMode : 'balanced';
    return [
        'TALE FAIRY EXTERNAL-REACTION GUIDE: The user action is outside Tale Fairy’s authority. Resolve it only from the user text, established context, and the main roleplay instructions. Do not use this guide to infer, reinterpret, expand, narrow, relocate, complete, substitute, or judge the user action, its target, its manner, or the player’s intent.',
        'Tale Fairy begins only with what NPCs or the surrounding world do in response. It may add an external reaction, consequence, opportunity, or natural next causal step. It may not deny, delay, weaken, cap, or otherwise modify the user action or an outcome explicitly established by the user.',
        'SELF-PROPELLING MOVEMENT: The selected branch must produce observable external development that exists independently of any player reply, including same-scene progress. Use completed NPC decisions, reactions, actions, disclosures, commitments, consequences, discoveries, opportunities, environmental or task progress. If travel or arrival is complete, start at the settled destination rather than repeating transit. In dialogue-centered scenes, let NPCs change the situation; never narrate the player character.',
        'Select exactly one closest-fitting branch for external forward motion and never combine branches. If every branch would affect the user action instead of only the NPC or world response, ignore them and let the main roleplay instructions govern the response.',
        `PRIMARY WHEN: ${effectSentence(beat.primaryWhen)}.`,
        branchDirection('PRIMARY', beat),
        ...beat.alternatives.flatMap((branch, index) => [
            `ALTERNATIVE ${index + 1} WHEN: ${effectSentence(branch.when)}.`,
            branchDirection(`ALTERNATIVE ${index + 1}`, branch),
        ]),
        MODE_TREATMENT[mode],
        'The selected next-step direction and effect govern only NPC or world follow-through. They never define the user action and never control the player character.',
    ].join('\n');
}
