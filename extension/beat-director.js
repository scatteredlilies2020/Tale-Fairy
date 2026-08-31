const OPERATIONS = new Set(['retain', 'deepen', 'introduce', 'complicate', 'escalate', 'deescalate', 'resolve', 'transition', 'withdraw', 'stalemate', 'disrupt']);
const PHASES = new Set(['establishing', 'developing', 'turning', 'landing', 'aftermath', 'transition']);
const DIRECTIONS = new Set(['preserve', 'brighten', 'darken', 'release', 'intensify']);
const PRESSURES = new Set(['none', 'latent', 'active', 'high', 'saturated']);
const INTRUSIONS = new Set(['closed', 'incidental', 'socially-open', 'dramatically-open', 'primed']);
const NOVELTY = new Set(['none', 'incidental', 'context-native', 'meaningful', 'major']);
const CONTENT = new Set(['none', 'texture', 'reaction', 'obstacle', 'conflict', 'character', 'opposition', 'event', 'opportunity', 'revelation', 'consequence']);
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
    return Boolean(beat.requiredEffect || beat.operation === 'retain' || beat.operation === 'deepen');
}

function envelope(beat) {
    const parts = [beat.contentClass !== 'none' ? beat.contentClass : '', `${beat.scope} scope`, beat.intensity !== 'none' ? `${beat.intensity} intensity` : '', beat.quantity !== 'none' ? beat.quantity : '', beat.relativePower !== 'none' ? `${beat.relativePower} relative power` : '', beat.plotWeight !== 'none' ? `${beat.plotWeight} plot weight` : '', beat.duration ? `${beat.duration} duration` : '', beat.resolutionCeiling !== 'open' ? `${beat.resolutionCeiling} resolution ceiling` : 'resolution remains context-dependent'];
    return parts.filter(Boolean).join('; ');
}

export function formatBeatContract(sceneValue, beatValue, { regeneration = false } = {}) {
    const scene = normalizeSceneProfile(sceneValue);
    const beat = normalizeBeatDirective(beatValue);
    const lines = [
        'TALE FAIRY — CURRENT BEAT',
        scene.promise ? `SCENE PROMISE: ${scene.promise}` : '',
        `SCENE READ: ${scene.phase}; ${scene.emotionalDirection}; pressure ${scene.pressure}; intrusion ${scene.intrusion}; novelty ceiling ${scene.noveltyCeiling}.`,
        `BEAT MOVE: ${beat.operation.toUpperCase()} — ${beat.target}.`,
        beat.requiredEffect ? `REQUIRED EFFECT: ${beat.requiredEffect}` : 'REQUIRED EFFECT: Keep the present activity and emotional promise coherent; no added incident is required.',
        `CONTENT ENVELOPE: ${envelope(beat)}.`,
        beat.preserve.length ? `PRESERVE: ${beat.preserve.join('; ')}.` : '',
        beat.forbid.length ? `DO NOT: ${beat.forbid.join('; ')}.` : '',
        'Make that function observable only if it still fits the latest user/OOC/scenario authority. Freely invent a compatible context-native realization; the category is not a menu. Do not announce it, prescribe a future route, or add drama merely to show movement.',
        'Quiet and slice-of-life beats may remain quiet; genre alone never licenses intrusion. Match any opposition to the envelope without predetermining identity or outcome. At life, institutional, country, or world scale, use natural causal units such as relationships, decisions, resources, policy effects, public reactions, or trends—not an obligatory encounter.',
        'Latest user/OOC authority wins. Never invent player dialogue, thoughts, consent, decisions, compliance, retreat, or extra actions. Preserve canon and broad trajectory without forecasting canon events.',
        regeneration ? 'For this regeneration, keep the semantic beat if still valid but realize it differently from the discarded response.' : '',
    ];
    return lines.filter(Boolean).join('\n');
}

export function formatFreshBeatFallback({ regeneration = false } = {}) {
    return [
        'TALE FAIRY — LIVE BEAT POLICY',
        'From the latest user/OOC turn and current scene, choose the least forceful fitting move: retain, deepen, introduce, complicate, escalate, deescalate, resolve, transition, withdraw, stalemate, or disrupt. Make it observable when valid.',
        'Do not manufacture conflict, newcomers, urgency, or ominous setup in a closed quiet beat. When intervention fits, freely invent a compatible context-native realization or custom idea without fixing a future route. For life, organization, country, or world simulation, use the causal unit natural to that scale.',
        'Latest user/OOC/scenario authority wins. Never invent player dialogue, thoughts, consent, choices, compliance, retreat, or extra actions; preserve canon and broad trajectory without forecasting events.',
        regeneration ? 'Realize a different concrete response from the discarded generation; do not escalate merely for novelty.' : '',
    ].filter(Boolean).join('\n');
}
