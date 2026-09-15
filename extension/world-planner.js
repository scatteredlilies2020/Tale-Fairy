// Model-facing replacement. Legacy boards remain readable, but are no longer
// mandatory work for every generated update. Transport/lifecycle stay separate.
import { validatePrepared } from './prepared-world.js?v=0.14.10';

const text = maxLength => ({ type: 'string', maxLength });
const nonblank = maxLength => ({ type: 'string', minLength: 1, maxLength, pattern: '\\S' });
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
                        id: nonblank(80), premise: nonblank(320), middle: nonblank(440), future: nonblank(260),
                        knowledge: nonblank(180),
                        status: { type: 'string', enum: ['prepared', 'active', 'dormant'] },
                    }, required: ['id', 'premise', 'middle', 'status'],
                } },
                status_changes: { type: 'array', maxItems: 12, items: {
                    type: 'object', additionalProperties: false, properties: {
                        id: nonblank(80), status: { type: 'string', enum: ['prepared', 'active', 'dormant', 'resolved', 'retired'] },
                    }, required: ['id', 'status'],
                } },
                focus: { type: 'array', maxItems: 3, items: nonblank(80) },
            }, required: ['approach', 'updates', 'focus'] },
        }, required: ['contract_version', 'prepared'],
    },
};

export const WORLD_PLANNER_SYSTEM = `You are Tale Fairy, preparing durable GM guidance for any ongoing RP or simulation. Return the JSON contract in one response, without reasoning, a critic, or a repair pass. The writer handles the next reply; your job is useful direction across many exchanges.

approach: Write a few practical instructions for making THIS RP worthwhile, using rp_reference and explicit user preferences. Preserve their full range of activities and scale. This is not a literary blurb about the latest scene. A local problem is not the premise of the entire RP. Do not add prohibitions, rank activities as lesser, or demand recurring themes unless the user/reference actually asks for that. Where wider intent is unspecified, leave it open. The approach should still work after this location and problem are left behind. Keep it unchanged during ordinary dialogue. On a real redirection, replace incompatible clauses rather than appending an exception to them. Return the full approach; empty clears it.

updates: Prepare a few distinct possibilities for the middle and longer term, not next-reply choreography. One local problem normally needs one record, not several disguised as different directions. When the RP has a wider canvas, include an independent possibility beyond that problem. Invent fitting people, places, organizations, discoveries, opportunities or opposition with their own motives; no fixed genre menu or required interruption. premise states the possibility; middle supplies processes and several playable developments; future gives alternative consequences beyond them. future and knowledge are optional: include meaningful continuations or knowledge boundaries when useful; otherwise omit the field. Never output empty strings in an update. Do not prescribe introductions or replay questions. NPCs and systems can act without another player command; the user may refuse, linger or redirect.

Persistence: Choose the operation before writing. updates creates or fully replaces content: each record needs a nonblank id, complete premise and playable middle, plus status prepared/active/dormant. Do not echo unchanged notebook rows. status_changes changes only an EXISTING record's status, using {id,status}; it preserves all prose. Use resolved/retired there to remove a record, never an empty update. Do not put an id in both arrays. Leave both arrays empty when nothing changes. An indexed record with omitted details can still receive a status change without reconstructing its content. Omitted records survive. Usually write zero to two complete updates; initialize a small selection. At most twelve live records. Use prepared for proposals, active after actual story uptake, dormant for unused directions. focus selects up to three retained or completely updated IDs; exclude removed IDs. Prioritize a new direction after a pivot. No expiry or fictional time advance based on message counts.

Boundaries: Produce preparation only, not a recap, status panel, cast inventory or replacement memory. Direct observations outrank contradictory summaries/notebook claims. Use minimal existing facts; preserve uncertainty and viewpoint knowledge. Proposals are not established history. player_controlled is the user's side, NOT an NPC: never invent their past, motives, allegiance, decisions, dialogue, feelings or contested outcomes. Offer external situations instead. Explicit user instructions override preparation. If user_instruction supplies an unclassified author note, include note_resolution.kind as suggest, correct, establish or forbid and honor it. Aim for roughly 600–1400 output tokens on routine updates; useful material, not repeated forms.`;

// Supply the current wire fields, without legacy empty-form padding that a
// model could mistake for the requested update format.
export function preparedRecordForPlanner(item) {
    return Object.fromEntries(['id', 'status', 'premise', 'middle', 'future', 'knowledge']
        .filter(key => typeof item[key] === 'string' && item[key].trim())
        .map(key => [key, item[key]]));
}

// The writer always receives proposals under a conditional heading. Origin is
// bookkeeping, not an evidence verdict the model must repeatedly classify.
export function normalizeWorldPlan(value) {
    if (value?.contract_version !== 14 || !Array.isArray(value.prepared?.updates)) return value;
    // Scene recaps from experimental/older responses are not another source of
    // writer facts. Retain factual memory separately; this job is preparation.
    const normalized = { ...value, context: [], memory: '' };
    if (normalized.note_resolution === null) delete normalized.note_resolution;
    const prepared = { ...value.prepared, overview: '', updates: value.prepared.updates.map(item => ({
        ...item, origin: 'invented', status: item?.status === undefined ? 'prepared' : item.status,
        // A replacement record must not inherit obsolete legacy permission gates.
        engine: '', entry: '', hold: '', invalidates: '', intervention: '',
    })) };
    // A blank live update is not a replacement for its saved record. Omit
    // only this specific, recoverable defect; keep strict validation for bad
    // types, identities, duplicate IDs, oversized output and other errors.
    const uniqueIds = new Set(prepared.updates.map(item => item.id));
    const omitted = prepared.updates.length <= 12 && uniqueIds.size === prepared.updates.length
        ? prepared.updates.filter(item => {
            const errors = validatePrepared({ overview: '', updates: [item], focus: [] });
            return errors.length === 1 && errors[0] === 'live prepared records need a premise and playable developments';
        }).map(item => item.id) : [];
    if (omitted.length) {
        const omittedIds = new Set(omitted);
        prepared.updates = prepared.updates.filter(item => !omittedIds.has(item.id));
        // Incomplete new records cannot be focused. Existing omitted records
        // remain stored, but this response supplies no complete focused update.
        if (Array.isArray(prepared.focus)) prepared.focus = prepared.focus.filter(id => !omittedIds.has(id));
        normalized._taleFairyRecovery = { omitted: omitted.map(id => `prepared.updates:${id}`) };
    }
    return { ...normalized, prepared };
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
