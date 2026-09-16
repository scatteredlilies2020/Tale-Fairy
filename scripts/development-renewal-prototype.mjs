import { reviewBasis, applyDevelopmentReview } from './development-review-prototype.mjs';
import { PREPARATION_SCHEMA } from './development-preparation-prototype.mjs';
export { applyDevelopmentReview };

export const RENEWAL_SYSTEM = `Review the private repertoire after actual play. Give an explicit retain, replace or retire decision for EVERY existing subject. Retain unused but compatible subjects. Replace when actual choices or changed circumstances make its future design inadequate. Preserve its ID and useful specific invention, but redesign its conditional middle and later possibilities around what actually happened, including refusal or departure. The old entrance is not a mandatory quest to restart.
Create usable future material, not merely a recap or a list of invitations. Give concrete workings and meaningful changed uses, relationships or situations that can carry across episodes. Preserve the source's genre breadth and exact constraints, including names, setting era and player agency. Do not force a permanent role or itinerary. An unrelated local problem is not the cause of everything else. A closed or excluded subject may end without a replacement obligation.
Accepted messages and observations are evidence; private design is not past history. Never rewrite scope or invent accepted events. In replacements, write conditional possibilities, not assertions of completed player actions, agreements or emotional outcomes. Retire only genuinely ended or excluded subjects with accepted evidence. New subjects are optional, at most four active total; do not fill space mechanically. Use exact basis and IDs. Return complete schema JSON, with short background fields and concise concrete phase material.`;

// Experimental alternative, not a silent change to earlier review protocols.
export const SUBJECT_RENEWAL_SYSTEM = `${RENEWAL_SYSTEM}
The unit under review is the enduring subject, NOT its initial access episode. Before deciding, distinguish what ended locally from what remains learned, wanted, practiced or independently available. Finishing or refusing one commission, leaving a town, not keeping an object, or declining a permanent role does not by itself reject the broader subject. An old draft may no longer fit even though its core remains useful: replace its future design around the actual residual capabilities/interests, instead of either restarting its entrance or deleting the whole subject. Conversely, respect a rejection of the entire interest; do not preserve unwanted involvement under a new name. Historical user instructions have their original referents and do not automatically refer to the newest subject. Cite accepted evidence for changed circumstances; imagined invitations and outcomes are still private. Keep reasons short and replacements comfortably within every field limit.`;

export function renewalInput({ state, reference, history, messages }) {
    const basis = reviewBasis(state), id = { type: 'string', enum: state.developments.map(d => d.id) };
    const indices = [...new Set(messages.map(m => m.index))];
    const reason = { type: 'string', minLength: 1, maxLength: 900 }, evidence = { type: 'array', minItems: 1, items: { type: 'integer', enum: indices } };
    const schema = { name: 'development_renewal', description: 'Transactional review of every existing private subject. Accepted observations remain separately preserved.', value: {
        type: 'object', additionalProperties: false, required: ['basis', 'decisions', 'additions'], properties: {
            basis: { const: basis },
            decisions: { type: 'array', minItems: state.developments.length, maxItems: state.developments.length, items: { oneOf: [
                { type: 'object', additionalProperties: false, required: ['id', 'action'], properties: { id, action: { const: 'retain' }, reason } },
                { type: 'object', additionalProperties: false, required: ['id', 'action', 'reason', 'evidence'], properties: { id, action: { const: 'retire' }, reason, evidence } },
                { type: 'object', additionalProperties: false, required: ['id', 'action', 'reason', 'evidence', 'replacement'], properties: { id, action: { const: 'replace' }, reason, evidence, replacement: PREPARATION_SCHEMA.value.properties.developments.items } },
            ] } },
            additions: { type: 'array', maxItems: 4, items: PREPARATION_SCHEMA.value.properties.developments.items },
        },
    } };
    return { prompt: JSON.stringify({ basis, source_reference: reference, accepted_historical_context: history, notebook: state, accepted_messages: messages,
        review_rules: 'Cite only supplied accepted-message indices. Absence from play, an unused entrance, or departure from its town is not evidence that an unused subject ended. Retain compatible unused subjects. Separate facts from future invention; a partial dry test is not a completed prop or performance.' }), schema, indices };
}

// Supply complete witnesses for stored evidence, not just a recent window.
// Missing witnesses fail closed; an index in a summary is not a supplied message.
export function renewalWitnesses(state, transcript, window) {
    const wanted = new Set(window.map(m => m.index));
    const visit = value => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value.evidence)) for (const i of value.evidence) wanted.add(i);
        for (const [key, child] of Object.entries(value)) if (key !== 'evidence') visit(child);
    };
    visit(state.observations); visit(state.invalidated); visit(state.archive);
    const available = new Set(transcript.map(m => m.index));
    if (available.size !== transcript.length || [...wanted].some(i => !Number.isInteger(i) || !available.has(i))) throw Error('Review evidence witness missing or ambiguous');
    return transcript.filter(m => wanted.has(m.index)).map(m => structuredClone(m));
}
