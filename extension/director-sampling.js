const WEIGHTS = Object.freeze({
    light: Object.freeze({
        intervention: Object.freeze({ subtle: 0.65, meaningful: 0.30, major: 0.05 }),
        novelty: Object.freeze({ grounded: 0.70, open: 0.25, surprising: 0.05 }),
    }),
    balanced: Object.freeze({
        intervention: Object.freeze({ subtle: 0.25, meaningful: 0.50, major: 0.25 }),
        novelty: Object.freeze({ grounded: 0.30, open: 0.50, surprising: 0.20 }),
    }),
    fun: Object.freeze({
        intervention: Object.freeze({ subtle: 0.05, meaningful: 0.40, major: 0.55 }),
        novelty: Object.freeze({ grounded: 0.10, open: 0.35, surprising: 0.55 }),
    }),
});

const FORTUNE_WEIGHTS = Object.freeze({ favorable: 0.30, mixed: 0.40, adverse: 0.30 });
const INTERVENTIONS = new Set(['subtle', 'meaningful', 'major']);
const NOVELTIES = new Set(['grounded', 'open', 'surprising']);
const FORTUNES = new Set(['favorable', 'mixed', 'adverse']);

function modeName(value) {
    const mode = String(value || '').toLowerCase();
    return Object.hasOwn(WEIGHTS, mode) ? mode : 'balanced';
}

function unit(seed, salt) {
    let value = (Number(seed) >>> 0) ^ (salt >>> 0);
    value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
    value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
    value ^= value >>> 15;
    return (value >>> 0) / 0x100000000;
}

function weightedChoice(weights, roll) {
    let cumulative = 0;
    const entries = Object.entries(weights);
    for (const [name, weight] of entries) {
        cumulative += weight;
        if (roll < cumulative) return name;
    }
    return entries.at(-1)?.[0] || '';
}

export function normalizeDirectorSample(value = {}) {
    value = value && typeof value === 'object' ? value : {};
    const mode = modeName(value.mode);
    const intervention = String(value.intervention || '').toLowerCase();
    const novelty = String(value.novelty || '').toLowerCase();
    const fortune = String(value.fortune || '').toLowerCase();
    return {
        mode,
        intervention: INTERVENTIONS.has(intervention) ? intervention : 'meaningful',
        novelty: NOVELTIES.has(novelty) ? novelty : 'open',
        fortune: FORTUNES.has(fortune) ? fortune : 'mixed',
    };
}

export function sampleDirectorSignals(mode = 'balanced', seed = 0) {
    const normalizedMode = modeName(mode);
    const weights = WEIGHTS[normalizedMode];
    return normalizeDirectorSample({
        mode: normalizedMode,
        intervention: weightedChoice(weights.intervention, unit(seed, 0x9e3779b9)),
        novelty: weightedChoice(weights.novelty, unit(seed, 0x243f6a88)),
        fortune: weightedChoice(FORTUNE_WEIGHTS, unit(seed, 0xb7e15162)),
    });
}

export function formatDirectorSample(value = {}) {
    const sample = normalizeDirectorSample(value);
    const intervention = {
        subtle: 'Prefer a subtle but observable change; deepen the present situation when that is more alive than adding an incident.',
        meaningful: 'Make a meaningful development that noticeably changes the immediate situation or its possibilities.',
        major: 'Actively seek a bold, disruptive, or story-altering development. Use the strongest context-plausible form rather than retreating to a token detail.',
    }[sample.intervention];
    const novelty = {
        grounded: 'Prefer an established cause, person, pressure, or opportunity, while allowing ordinary new details needed to realize it.',
        open: 'Existing or entirely new compatible causes are equally available; choose whichever makes the scene more alive and coherent.',
        surprising: 'Actively seek an unexpected but context-compatible cause, connection, interruption, opportunity, reversal, or consequence.',
    }[sample.novelty];
    const fortune = {
        favorable: 'Bias the development toward opportunity, relief, advantage, connection, discovery, or another favorable turn.',
        mixed: 'Let the development be beneficial, adverse, ambiguous, or mixed according to the scene; avoid a predictable moral direction.',
        adverse: 'Bias the development toward difficulty, cost, danger, opposition, loss, exposure, or another adverse turn.',
    }[sample.fortune];
    return [
        `WEIGHTED DIRECTOR SAMPLE: ${sample.intervention.toUpperCase()} intervention · ${sample.novelty.toUpperCase()} novelty · ${sample.fortune.toUpperCase()} fortune.`,
        intervention,
        novelty,
        fortune,
        'These signals govern creative appetite, not a menu of event types. Interpret them through the complete current context and at its natural scale: an academic, domestic, institutional, political, investigative, battlefield, fantastical, or other scene should express pressure and consequence in its own terms.',
    ].join('\n');
}

export const DIRECTOR_SAMPLE_WEIGHTS = WEIGHTS;
