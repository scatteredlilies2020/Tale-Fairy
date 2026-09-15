// Model-facing replacement. Legacy boards remain readable, but are no longer
// mandatory work for every generated update. Transport/lifecycle stay separate.
import { validatePrepared } from './prepared-world.js?v=0.14.8';

const text = maxLength => ({ type: 'string', maxLength });
export const WORLD_PLANNER_SCHEMA = {
    name: 'tale_fairy_world_notebook_v14', strict: true, returnInvalid: true,
    value: {
        type: 'object', additionalProperties: false,
        properties: {
            contract_version: { type: 'integer', const: 14 },
            note_resolution: { type: 'object', properties: { kind: { type: 'string', enum: ['suggest', 'correct', 'establish', 'forbid'] } }, required: ['kind'], additionalProperties: false },
            prepared: { type: 'object', additionalProperties: false, properties: {
                approach: text(800),
                updates: { type: 'array', maxItems: 12, items: {
                    type: 'object', additionalProperties: false,
                    properties: {
                        id: text(80), premise: text(320), middle: text(440), future: text(260),
                        knowledge: text(180),
                        status: { type: 'string', enum: ['prepared', 'active', 'dormant', 'resolved', 'retired'] },
                    }, required: ['id', 'premise', 'middle', 'future', 'knowledge', 'status'],
                } },
                focus: { type: 'array', maxItems: 3, items: text(80) },
            }, required: ['approach', 'updates', 'focus'] },
        }, required: ['contract_version', 'prepared'],
    },
};

export const WORLD_PLANNER_SYSTEM = `You are Tale Fairy, preparing durable GM guidance for any ongoing RP or simulation. Return the JSON contract in one response, without reasoning, a critic, or a repair pass. The writer handles the next reply; your job is useful direction across many exchanges.

approach: Write a few practical instructions for making THIS RP worthwhile, using rp_reference and explicit user preferences. Preserve their full range of activities and scale. This is not a literary blurb about the latest scene. A local problem is not the premise of the entire RP. Do not add prohibitions, rank activities as lesser, or demand recurring themes unless the user/reference actually asks for that. Where wider intent is unspecified, leave it open. The approach should still work after this location and problem are left behind. Keep it unchanged during ordinary dialogue. On a real redirection, replace incompatible clauses rather than appending an exception to them. Return the full approach; empty clears it.

updates: Prepare a few distinct possibilities for the middle and longer term, not next-reply choreography. One local problem normally needs one record, not several disguised as different directions. When the RP has a wider canvas, include an independent possibility beyond that problem. Invent fitting people, places, organizations, discoveries, opportunities or opposition with their own motives; no fixed genre menu or required interruption. premise states the possibility; middle supplies processes and several playable developments; future gives alternative consequences beyond them. knowledge holds necessary secrets, uncertainty or boundaries, otherwise empty. Do not prescribe introductions or replay questions. NPCs and systems can act without another player command; the user may refuse, linger or redirect.

Persistence: Usually change zero to two records; initialize a small selection, not a catalog. Omitted records survive. Every prepared, active or dormant update must contain a complete nonempty premise and middle, even when only its status changes. To leave a record unchanged, omit it from updates and select its id in focus if useful; never send blank placeholder records. Resolved/retired removals may use empty prose. id is only an update handle. Use prepared for unaccepted proposals, active after actual story uptake, dormant for unused directions, resolved/retired to remove finished or contradicted proposals. At most twelve live records. Leave indexed records with omitted details unchanged unless deliberately replacing/removing them. focus selects up to three relevant IDs, most important first; only fitting whole records reach the writer. Prioritize a new direction after a pivot. No expiry or fictional time advance based on message counts.

Boundaries: Produce preparation only, not a recap, status panel, cast inventory or replacement memory. Direct observations outrank contradictory summaries/notebook claims. Use minimal existing facts; preserve uncertainty and viewpoint knowledge. Proposals are not established history. player_controlled is the user's side, NOT an NPC: never invent their past, motives, allegiance, decisions, dialogue, feelings or contested outcomes. Offer external situations instead. Explicit user instructions override preparation. If user_instruction supplies an unclassified author note, include note_resolution.kind as suggest, correct, establish or forbid and honor it. Aim for roughly 600–1400 output tokens on routine updates; useful material, not repeated forms.`;

// The writer always receives proposals under a conditional heading. Origin is
// bookkeeping, not an evidence verdict the model must repeatedly classify.
export function normalizeWorldPlan(value) {
    if (value?.contract_version !== 14 || !Array.isArray(value.prepared?.updates)) return value;
    // Scene recaps from experimental/older responses are not another source of
    // writer facts. Retain factual memory separately; this job is preparation.
    const normalized = { ...value, context: [], memory: '' };
    if (normalized.note_resolution === null) delete normalized.note_resolution;
    return { ...normalized, prepared: { ...value.prepared, overview: '', updates: value.prepared.updates.map(item => ({
        ...item, origin: 'invented', status: item?.status === undefined ? 'prepared' : item.status,
        // A replacement record must not inherit obsolete legacy permission gates.
        engine: '', entry: '', hold: '', invalidates: '', intervention: '',
    })) } };
}

export function validateWorldPlan(raw) {
    const value = normalizeWorldPlan(raw);
    const errors = [];
    if (value?.contract_version !== 14) errors.push('Expected world notebook contract 14.');
    if (typeof value?.prepared?.approach !== 'string') errors.push('prepared.approach must be text.');
    if (value?.note_resolution !== undefined && !['suggest', 'correct', 'establish', 'forbid'].includes(value.note_resolution?.kind)) errors.push('note_resolution.kind is invalid.');
    errors.push(...validatePrepared(value?.prepared));
    return { valid: errors.length === 0, errors };
}
