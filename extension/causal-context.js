import { TALE_FAIRY_CONTEXT_GUIDE } from './game-master.js?v=0.14.21';

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
const PHASES = new Set(['establishing', 'developing', 'turning', 'landing', 'aftermath', 'transition']);
const DIRECTIONS = new Set(['preserve', 'brighten', 'darken', 'release', 'intensify']);
const PRESSURES = new Set(['none', 'latent', 'active', 'high', 'saturated']);
const INTRUSIONS = new Set(['closed', 'incidental', 'socially-open', 'dramatically-open', 'primed']);
const NOVELTY = new Set(['none', 'incidental', 'context-native', 'meaningful', 'major']);

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
        condition: text(value.condition, 1120),
        disclosure: choice(value.disclosure, DISCLOSURES, 'open'),
        confidence: choice(value.confidence, CONFIDENCES, 'tentative'),
        relevance: text(value.relevance, 180),
        knownBy: [...new Set((Array.isArray(value.knownBy ?? value.known_by) ? (value.knownBy ?? value.known_by) : [])
            .map(name => text(name, 80)).filter(Boolean))].slice(0, 24),
        learnedFrom: text(value.learnedFrom ?? value.learned_from, 720),
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
    const knowledge = item.knownBy.length ? ` Known to: ${item.knownBy.join(', ')}.` : '';
    const learning = item.learnedFrom ? ` Learning route: ${item.learnedFrom.replace(/[.!?]+$/u, '')}.` : '';
    return `${subject}: ${condition}.${knowledge}${learning}`;
}

function section(label, items) {
    if (!items.length) return '';
    return `${label}\n${items.map(item => `- ${statement(item)}`).filter(Boolean).join('\n')}`;
}

export function formatCausalContext(value, options = {}) {
    const context = normalizeCausalContext(value);
    if (!hasUsableCausalContext(context)) return '';
    const conditions = providerCausalConditions(context);
    const open = conditions.filter(item => item.disclosure === 'open');
    const limited = conditions.filter(item => item.disclosure === 'limited');
    const privateItems = conditions.filter(item => item.disclosure === 'private');
    const situations = context.optionalSituations;
    return [
        'RELEVANT UNDERLYING CONDITIONS:',
        section('Current conditions:', open),
        section('Limited knowledge:', limited),
        section('Private conditions:', privateItems),
        situations.length ? [
            'POSSIBLE OPENINGS:',
            ...situations.map(item => `- ${item.premise} Entry: ${item.entry}.`),
        ].join('\n') : '',
        options.includeRules === false ? '' : TALE_FAIRY_CONTEXT_GUIDE,
    ].filter(Boolean).join('\n');
}
