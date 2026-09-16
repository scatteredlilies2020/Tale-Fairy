// Evaluation only. Broad preparation owns proposals, never the current scene.
import { estimateTokenCount } from '../extension/token-budget.js';
export const PREPARATION_SYSTEM = `Develop a small, rich repertoire of ongoing play for this RP. This is NOT a next-reply planner, notebook summarizer, or continuation of its current problem. There is deliberately no current-writer output. The host retains that job and all local records separately.

Read the original premise, player preferences and accepted history. Infer what kinds of experiences this RP is for; scene length is not evidence that the user wants the scene's problem to become the whole RP. Source facts constrain compatibility, not the range of invention. Treat NPC theories as theories, not omniscient findings. User aliases refer to one person. Do not invent past experiences for the player or contradictory biographies for established characters.

Invent 2–4 substantial developments for an open-ended RP, fewer when already well prepared. If the explicitly requested experience is closed, return an empty developments array rather than a campaign. A development is an evolving activity, relationship, creative undertaking, place or world process with enough substance to revisit changed across episodes. It is not a destination list, a future hook, a character trait, or a renamed piece of the current problem. Do not make every development about intrigue, debt, records, tests, rescue or friction. Let people enjoy, build, discover and initiate things for their own reasons.

Make specific PRIVATE DESIGN decisions: distinctive people, objects, practices, magical workings or creative material whose particulars change what can be experienced. Do not defer invention with 'perhaps something interesting happens'. New compatible fiction is permitted; it is not accepted history. An optional proposal can have definite contents without compelling the player to encounter it. Do not retcon recent events or choose the truth of the current mystery merely to make a proposal convenient.

For each development give substantial intermediate changes: WHEN a relevant condition becomes true in accepted play, WHAT different material becomes playable, and WHAT enduring difference results if that interaction occurs. At least two changes must deepen or transform the SAME development, not introduce unrelated hooks or just repeat a conversation louder. These are conditional branches, not a sequence the player must follow or a promised ending. Include a meaningful path after declining an offer; refusal is not a request to force it by another route. Time-based changes require actual fictional elapsed time, not turn count. Preserve user agency and independent NPC life.

The independence field is a counterfactual check: if the current episode were conclusively over, explain what specifically still drives this development. If the answer is only its fallout, do not count it as wider preparation. The encounter field states compatible access conditions, not that anyone has already arrived, heard a rumor, or made a commitment. Do not inject proposals into today's scene. Return JSON only.`;

const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
// v12 storage contract: background/access may need multiple concrete clauses.
// Keep them bounded without making arbitrary 700-character prefixes a semantic
// repair. Complete-request budget guards still apply at every downstream call.
export const PREPARATION_CONTEXT_LIMIT = 1400;
export const PREPARATION_SCHEMA = { name: 'development_preparation', description: 'Private proposals only, never accepted events. Nonempty substance and two or more concrete conditional changes per new development.', value: {
    type: 'object', additionalProperties: false, required: ['scope', 'developments'], properties: {
        scope: text(1200), developments: { type: 'array', maxItems: 4, items: {
            type: 'object', additionalProperties: false, required: ['id', 'substance', 'changes', 'independence', 'encounter'], properties: {
                id: text(80), substance: text(2400), independence: text(PREPARATION_CONTEXT_LIMIT), encounter: text(PREPARATION_CONTEXT_LIMIT),
                changes: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'object', additionalProperties: false, required: ['when', 'experience', 'after'], properties: { when: text(600), experience: text(1200), after: text(700) } } },
            },
        } },
    },
} };

export function preparationInput({ reference, messages, instruction = '', historical = {}, existing = [] }, maxTokens = 18000) {
    // Same source/history as the combined test, deliberately NOT its generated
    // local framing. Nothing is erased from storage. No relevance prefix cuts.
    const { legacy_framing, ...sourceHistory } = historical;
    const payload = { source_reference: reference, explicit_user_instruction: instruction, ...sourceHistory, accepted_messages: messages, existing_preparation: existing };
    const prompt = JSON.stringify(payload);
    const inputTokens = estimateTokenCount(PREPARATION_SYSTEM + JSON.stringify(PREPARATION_SCHEMA) + prompt);
    if (inputTokens > maxTokens) throw Error('Complete preparation input exceeds budget.');
    return { prompt, inputTokens };
}

export function validatePreparation(value) {
    const object = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
    const str = (s, max) => typeof s === 'string' && s.trim().length && s.length <= max;
    if (!object(value, ['scope', 'developments']) || !str(value.scope, 1200) || !Array.isArray(value.developments) || value.developments.length > 4) throw Error('Invalid preparation root.');
    const ids = new Set();
    for (const d of value.developments) {
        if (!object(d, ['id', 'substance', 'changes', 'independence', 'encounter']) || !str(d.id, 80) || ids.has(d.id) || !str(d.substance, 2400) || !str(d.independence, PREPARATION_CONTEXT_LIMIT) || !str(d.encounter, PREPARATION_CONTEXT_LIMIT)) throw Error('Invalid development.');
        ids.add(d.id);
        if (!Array.isArray(d.changes) || d.changes.length < 2 || d.changes.length > 4) throw Error('Missing substantive middle.');
        for (const c of d.changes) if (!object(c, ['when', 'experience', 'after']) || !str(c.when, 600) || !str(c.experience, 1200) || !str(c.after, 700)) throw Error('Invalid conditional change.');
    }
    return structuredClone(value);
}
