import { GAME_MASTER_CONTRACT } from './game-master.js?v=0.13.19';

// These are causal units rather than genre labels. Keeping settlements, places,
// resources, and situations first-class avoids squeezing a town simulation into
// the misleading catch-all of "system" while still allowing the same contract
// to represent a household, country, ecosystem, or adventure.
export const CAUSAL_KINDS = Object.freeze([
    'actor', 'relationship', 'group', 'community', 'institution',
    'system', 'resource', 'environment', 'place', 'situation',
]);
const KINDS = new Set(CAUSAL_KINDS);
const DISCLOSURES = new Set(['open', 'limited', 'private']);
const CONFIDENCES = new Set(['established', 'strong', 'tentative']);
const MODES = new Set(['light', 'balanced', 'fun']);
const PHASES = new Set(['establishing', 'developing', 'turning', 'landing', 'aftermath', 'transition']);
const DIRECTIONS = new Set(['preserve', 'brighten', 'darken', 'release', 'intensify']);
const PRESSURES = new Set(['none', 'latent', 'active', 'high', 'saturated']);
const INTRUSIONS = new Set(['closed', 'incidental', 'socially-open', 'dramatically-open', 'primed']);
const NOVELTY = new Set(['none', 'incidental', 'context-native', 'meaningful', 'major']);

const MODE_TREATMENT = Object.freeze({
    light: 'DEVELOPMENT: Subtle, within the current activity.',
    balanced: 'DEVELOPMENT: Natural, proportionate to current conditions.',
    fun: 'DEVELOPMENT: Bolder when supported by current conditions.',
});

const INTRUSION_TREATMENT = Object.freeze({
    closed: 'Keep outside pressure silent or subtextual.',
    incidental: 'Outside texture must not displace the activity.',
    'socially-open': 'Existing pressure may enter through natural social contact.',
    'dramatically-open': 'Existing pressure may enter through a credible route.',
    primed: 'Converging causes may arrive; no event is required.',
});

const NOVELTY_TREATMENT = Object.freeze({
    none: 'Develop the established activity and causes; no separate plot element.',
    incidental: 'Keep novelty incidental and setting-native.',
    'context-native': 'New details must fit the setting and activity.',
    meaningful: 'Consequential novelty needs an existing cause.',
    major: 'Major turns need an established cause already in motion.',
});

function text(value, limit = 240) {
    return String(value ?? '').trim().replace(/\s+/gu, ' ').slice(0, limit);
}

function choice(value, allowed, fallback) {
    const candidate = String(value ?? '').trim().toLowerCase();
    return allowed.has(candidate) ? candidate : fallback;
}

export function defaultCausalContext() {
    return { conditions: [], optionalSituations: [], inject: false, injectReason: '', basis: '' };
}

export function defaultSceneProfile() {
    return { promise: '', phase: 'developing', emotionalDirection: 'preserve', pressure: 'none', intrusion: 'closed', noveltyCeiling: 'incidental', basis: '' };
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

export function normalizeCausalCondition(value = {}) {
    return {
        id: text(value.id, 80),
        kind: choice(value.kind, KINDS, 'system'),
        subject: text(value.subject, 120),
        condition: text(value.condition, 280),
        disclosure: choice(value.disclosure, DISCLOSURES, 'open'),
        confidence: choice(value.confidence, CONFIDENCES, 'tentative'),
        relevance: text(value.relevance, 180),
        knownBy: [...new Set((Array.isArray(value.knownBy ?? value.known_by) ? (value.knownBy ?? value.known_by) : [])
            .map(name => text(name, 80)).filter(Boolean))].slice(0, 6),
        learnedFrom: text(value.learnedFrom ?? value.learned_from, 180),
    };
}

export function normalizeCausalContext(value = {}) {
    const conditions = (Array.isArray(value.conditions) ? value.conditions : [])
        .slice(0, 6)
        .map(normalizeCausalCondition)
        .filter(item => item.id && item.subject && item.condition && item.relevance);
    return {
        conditions,
        optionalSituations: (Array.isArray(value.optionalSituations ?? value.optional_situations) ? (value.optionalSituations ?? value.optional_situations) : [])
            .slice(0, 1).map(item => ({ premise: text(item.premise, 260), entry: text(item.entry, 220) }))
            .filter(item => item.premise && item.entry),
        inject: Object.hasOwn(value, 'inject') ? value.inject === true : conditions.some(item => item.confidence !== 'tentative'),
        injectReason: text(value.injectReason ?? value.inject_reason, 220),
        basis: text(value.basis, 240),
    };
}

export function providerCausalConditions(value) {
    return normalizeCausalContext(value).conditions.filter(item => item.confidence !== 'tentative');
}

export function hasUsableCausalContext(value) {
    const context = normalizeCausalContext(value);
    return Boolean(context.inject && providerCausalConditions(context).length);
}

function statement(item) {
    const subject = text(item.subject, 120).replace(/[.!?]+$/u, '');
    const condition = text(item.condition, 280).replace(/[.!?]+$/u, '');
    if (!subject || !condition) return '';
    const lower = condition.charAt(0).toLocaleLowerCase() + condition.slice(1);
    const knowledge = item.knownBy.length ? ` Known to: ${item.knownBy.join(', ')}; others need an in-world learning route.`
        : item.disclosure !== 'open' ? ' Keep awareness local; do not infer additional knowers.' : '';
    const learning = item.learnedFrom ? ` Learning route: ${item.learnedFrom}.` : '';
    return `${subject} ${lower}.${knowledge}${learning}`;
}

function section(label, items) {
    if (!items.length) return '';
    return `${label}\n${items.map(item => `- ${statement(item)}`).filter(Boolean).join('\n')}`;
}

export function formatCausalContext(value, options = {}) {
    const context = normalizeCausalContext(value);
    if (!hasUsableCausalContext(context)) return '';
    const modeValue = String(options.mode ?? '').trim().toLowerCase();
    const mode = MODES.has(modeValue) ? modeValue : 'balanced';
    const sceneProfile = normalizeSceneProfile(options.sceneProfile);
    const conditions = providerCausalConditions(context);
    const open = conditions.filter(item => item.disclosure === 'open');
    const limited = conditions.filter(item => item.disclosure === 'limited');
    const privateItems = conditions.filter(item => item.disclosure === 'private');
    const situations = context.optionalSituations;
    return [
        'RELEVANT UNDERLYING CONDITIONS — causal context, not required events or predetermined outcomes. Use what fits; the writing model chooses every concrete action.',
        section('Current conditions:', open),
        section('Limited knowledge — do not make universally known:', limited),
        section('Private conditions — express through behavior unless disclosure becomes natural in-world:', privateItems),
        situations.length ? [
            'OPTIONAL SITUATIONAL OPENINGS — possibilities, not facts or required events. May emerge naturally without player engagement; outcomes remain open.',
            ...situations.map(item => `- ${item.premise} It is available if someone naturally ${item.entry.replace(/^[Tt]o\s+/u, '')}.`),
        ].join('\n') : '',
        MODE_TREATMENT[mode],
        options.includeRules === false ? '' : GAME_MASTER_CONTRACT,
        `SCENE-SCALE BOUNDARY: ${INTRUSION_TREATMENT[sceneProfile.intrusion]} ${NOVELTY_TREATMENT[sceneProfile.noveltyCeiling]}`,
    ].filter(Boolean).join('\n');
}
