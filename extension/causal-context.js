const KINDS = new Set(['actor', 'relationship', 'group', 'institution', 'system', 'environment']);
const DISCLOSURES = new Set(['open', 'limited', 'private']);
const CONFIDENCES = new Set(['established', 'strong', 'tentative']);
const MODES = new Set(['light', 'balanced', 'fun']);
const PHASES = new Set(['establishing', 'developing', 'turning', 'landing', 'aftermath', 'transition']);
const DIRECTIONS = new Set(['preserve', 'brighten', 'darken', 'release', 'intensify']);
const PRESSURES = new Set(['none', 'latent', 'active', 'high', 'saturated']);
const INTRUSIONS = new Set(['closed', 'incidental', 'socially-open', 'dramatically-open', 'primed']);
const NOVELTY = new Set(['none', 'incidental', 'context-native', 'meaningful', 'major']);

const MODE_TREATMENT = Object.freeze({
    light: 'Let fitting conditions influence the response subtly; concrete movement is optional when stillness is more natural.',
    balanced: 'Let at least one fitting condition meaningfully shape NPC or world behavior and create natural movement when appropriate.',
    fun: 'Let fitting conditions interact boldly when supported, while leaving their concrete realization to the writing model.',
});

const INTRUSION_TREATMENT = Object.freeze({
    closed: 'Keep outside pressure silent or subtextual unless the latest turn opens the scene.',
    incidental: 'Incidental setting texture may enter, but it must not displace the current activity.',
    'socially-open': 'Natural social contact may carry existing pressure into the scene; an interruption is still optional.',
    'dramatically-open': 'Existing pressure may complicate the scene openly when it has a credible route in.',
    primed: 'A cause already converging may arrive openly, but even here no event is due merely for drama.',
});

const NOVELTY_TREATMENT = Object.freeze({
    none: 'Do not introduce a new development.',
    incidental: 'Keep any novelty incidental and immediately setting-native.',
    'context-native': 'New detail may be context-native, not a genre-generic surprise.',
    meaningful: 'A meaningful development is allowed only when supported by an existing cause.',
    major: 'A major turn is possible only from an established cause already in motion; it is never required.',
});

function text(value, limit = 240) {
    return String(value ?? '').trim().replace(/\s+/gu, ' ').slice(0, limit);
}

function choice(value, allowed, fallback) {
    const candidate = String(value ?? '').trim().toLowerCase();
    return allowed.has(candidate) ? candidate : fallback;
}

export function defaultCausalContext() {
    return { conditions: [], inject: false, injectReason: '', basis: '' };
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
    };
}

export function normalizeCausalContext(value = {}) {
    const conditions = (Array.isArray(value.conditions) ? value.conditions : [])
        .slice(0, 6)
        .map(normalizeCausalCondition)
        .filter(item => item.id && item.subject && item.condition && item.relevance);
    return {
        conditions,
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
    return `${subject} ${lower}.`;
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
    return [
        'RELEVANT UNDERLYING CONDITIONS — causal context, not required events or predetermined outcomes. Interpret only what fits the latest turn; the writing model chooses every concrete action, development, and consequence.',
        section('Current conditions:', open),
        section('Limited knowledge — do not make universally known:', limited),
        section('Private conditions — express through behavior unless disclosure becomes natural in-world:', privateItems),
        MODE_TREATMENT[mode],
        `SCENE-SCALE BOUNDARY: ${INTRUSION_TREATMENT[sceneProfile.intrusion]} ${NOVELTY_TREATMENT[sceneProfile.noveltyCeiling]} Challenge may be social, intellectual, bureaucratic, material, emotional, environmental, or physical; combat is never the default. Quiet activity may linger without interruption. The latest explicit user/OOC request to stay, skip, or advance outranks every optional pressure.`,
        'Never use these conditions to author the player character’s choices, dialogue, consent, thoughts, feelings, or an uncertain result.',
    ].filter(Boolean).join('\n');
}
