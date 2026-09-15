// Model-facing replacement. Legacy boards remain readable, but are no longer
// mandatory work for every generated update. Transport/lifecycle stay separate.
import { validatePrepared, normalizePreparedWorld, mergePreparedWorld, preparedFieldLimit, PREPARED_APPROACH_LIMIT, PREPARED_SUMMARY_LIMIT } from './prepared-world.js?v=0.14.15';

const text = maxLength => ({ type: 'string', maxLength });
const nonblank = maxLength => ({ type: 'string', minLength: 1, maxLength, pattern: '\\S' });
const proseField = (key, target) => ({ ...nonblank(preparedFieldLimit(key)), description: `Aim for at most ${target} characters; the schema maximum is the existing storage limit. Preserve complete meaning.` });
export const WORLD_PLANNER_SCHEMA = {
    name: 'tale_fairy_world_notebook_v14', strict: true, returnInvalid: true,
    description: 'JSON nesting: only contract_version, prepared and optional note_resolution belong at the root. Put approach, summary, updates, status_changes and focus INSIDE prepared. Before sending this single response, check every operation: unchanged content is omitted; status-only changes go in status_changes; every updates record has id, premise, middle and status. Keep at most three distinct available focus IDs. Each ID occurs in only one operation. The input is a selected working view; omitted records remain stored and do not block additions. Use JSON strings for prose, not lists or objects. If space is tight, return fewer complete updates, never partial records. Close the JSON object; return no commentary.',
    value: {
        type: 'object', additionalProperties: false,
        properties: {
            contract_version: { type: 'integer', const: 14 },
            note_resolution: { type: 'object', properties: { kind: { type: 'string', enum: ['suggest', 'correct', 'establish', 'forbid'] } }, required: ['kind'], additionalProperties: false },
            prepared: { type: 'object', additionalProperties: false, properties: {
                approach: { ...text(PREPARED_APPROACH_LIMIT), description: 'Omit when unchanged. Otherwise provide the complete replacement, aiming for 800 characters. Empty text deliberately clears it.' },
                summary: { ...text(PREPARED_SUMMARY_LIMIT), description: 'Rolling private planner summary. Create when absent; update when developments change. Return a complete replacement, aiming for 1200 characters; omit when unchanged. Preserve wider possibilities and unresolved dependencies from the previous summary; new evidence can correct or resolve them. This is conditional preparation, not story history. Empty text deliberately clears it.' },
                updates: { type: 'array', maxItems: 12, items: {
                    type: 'object', additionalProperties: false,
                    properties: {
                        id: { ...nonblank(80), description: 'Exact existing ID for a replacement, or a new stable ID for new content.' },
                        premise: { ...proseField('premise', 320), description: 'Complete premise in one JSON string; aim for 320 characters.' },
                        middle: { ...proseField('middle', 440), description: 'Complete playable developments in one JSON string; aim for 440 characters. Never omit or replace with a status-only patch.' },
                        future: proseField('future', 260),
                        knowledge: proseField('knowledge', 180),
                        status: { type: 'string', enum: ['prepared', 'active', 'dormant'] },
                    }, required: ['id', 'premise', 'middle', 'status'],
                } },
                status_changes: { type: 'array', maxItems: 12, description: 'Use this array for status-only changes and removals of existing IDs, preserving all stored prose.', items: {
                    type: 'object', additionalProperties: false, properties: {
                        id: nonblank(80), status: { type: 'string', enum: ['prepared', 'active', 'dormant', 'resolved', 'retired'] },
                    }, required: ['id', 'status'],
                } },
                focus: { type: 'array', maxItems: 3, uniqueItems: true, description: 'Choose zero to three distinct retained or completely updated IDs; never removed IDs.', items: nonblank(80) },
            }, required: ['updates', 'focus'] },
        }, required: ['contract_version', 'prepared'],
    },
};

export const WORLD_PLANNER_SYSTEM = `You are Tale Fairy, preparing durable GM guidance for any ongoing RP or simulation. Return the JSON contract in one response, without reasoning, a critic, or a repair pass. The writer handles the next reply; your job is useful direction across many exchanges.

approach: Write a few practical instructions for making THIS RP worthwhile, using rp_reference and explicit user preferences. Preserve their full range of activities and scale. This is not a literary blurb about the latest scene. A local problem is not the premise of the entire RP. Do not add prohibitions, rank activities as lesser, or demand recurring themes unless the user/reference actually asks for that. Where wider intent is unspecified, leave it open. The approach should still work after this location and problem are left behind. On redirection replace incompatible clauses. Omit when unchanged; otherwise return the full replacement. Empty text deliberately clears it.

summary: Maintain a rolling private planner summary from the previous summary, supplied records, accepted evidence and this response’s changes. Preserve wider possibilities, unresolved dependencies and knowledge boundaries even when their detailed records are absent. Correct or remove superseded directions; never turn a proposal into history. Create when absent, replace completely when changed, omit when unchanged. Summarize only supplied material; omitted records remain stored.

updates: Prepare a few distinct possibilities for the middle and longer term, not next-reply choreography. One local problem normally needs one record, not several disguised as different directions. When the RP has a wider canvas, include an independent possibility beyond that problem. Invent fitting people, places, organizations, discoveries, opportunities or opposition with their own motives; no fixed genre menu or required interruption. premise states the possibility; middle supplies processes and several playable developments; future gives alternative consequences beyond them. future and knowledge are optional: include meaningful continuations or knowledge boundaries when useful; otherwise omit the field. Never output empty strings in an update. Do not prescribe introductions or replay questions. NPCs and systems can act without another player command; the user may refuse, linger or redirect.

Persistence: Choose the operation before writing. updates creates or fully replaces content: each record needs a nonblank id, complete premise and playable middle, plus status prepared/active/dormant. Do not echo unchanged notebook rows. status_changes changes only an EXISTING record's status, using {id,status}; it preserves all prose. Use resolved/retired there to remove a record, never an empty update. Do not put an id in both arrays. Leave both arrays empty when nothing changes. Input retained_index contains lookup tuples [id,status,premise label] (the label may be omitted), not update records. Their full content remains stored. Use index IDs for focus/status_changes; content revisions require complete prose, never copied index tuples. Omitted records survive. Usually write zero to two complete updates; initialize a small selection. Storage has no record-count cap. notebook_view reports stored and selected counts; omitted records remain stored. Reuse IDs for revisions; retire only when the story warrants it, never to free slots. Use prepared for proposals, active after actual story uptake, dormant for unused directions. focus selects up to three retained or completely updated IDs; exclude removed IDs. Prioritize a new direction after a pivot. No expiry or fictional time advance based on message counts.

Boundaries: Produce preparation only, not a recap, status panel, cast inventory or replacement memory. Direct observations outrank contradictory summaries/notebook claims. Use minimal existing facts; preserve uncertainty and viewpoint knowledge. Proposals are not established history. player_controlled is the user's side, NOT an NPC: never invent their past, motives, allegiance, decisions, dialogue, feelings or contested outcomes. Offer external situations instead. Explicit user instructions override preparation. Classify an unclassified user_instruction with note_resolution.kind (suggest/correct/establish/forbid) and honor it. Aim for roughly 600–1400 output tokens on routine updates; useful material, not repeated forms.`;

// Supply the current wire fields, without legacy empty-form padding that a
// model could mistake for the requested update format.
export function preparedRecordForPlanner(item) {
    return Object.fromEntries(['id', 'status', 'premise', 'middle', 'future', 'knowledge']
        .filter(key => typeof item[key] === 'string' && item[key].trim())
        .map(key => [key, item[key]]));
}

// Canonicalize presentation only. Never invent missing prose or flatten objects.
function prose(value) {
    return Array.isArray(value) && value.every(part => typeof part === 'string') ? value.join('\n') : value;
}

export function plannerFocus(value, available, limit = 3) {
    const candidates = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
    return [...new Set(candidates.filter(id => typeof id === 'string').map(id => id.trim())
        .filter(id => id && id.length <= 80 && (!available || available.has(id))))].slice(0, limit);
}

function distinctIdenticalOperations(items) {
    if (!Array.isArray(items)) return items;
    const seen = new Set();
    return items.filter(item => {
        const signature = item && typeof item === 'object' && !Array.isArray(item)
            ? JSON.stringify(Object.keys(item).sort().map(key => [key, item[key]])) : JSON.stringify(item);
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
    });
}

// Some prompt-only responses put complete notebook fields at the root.
// Preserve their content; conflicting operation IDs are still validated below.
function notebookFields(value) {
    if (value.prepared != null && (typeof value.prepared !== 'object' || Array.isArray(value.prepared))) return value.prepared;
    const source = { ...(value.prepared || {}) };
    for (const key of ['approach', 'summary', 'updates', 'status_changes', 'focus']) {
        if (!Object.hasOwn(value, key)) continue;
        if (source[key] == null) source[key] = value[key];
        else if (JSON.stringify(source[key]) === JSON.stringify(value[key])) continue;
        else if (Array.isArray(source[key]) && Array.isArray(value[key])) source[key] = [...source[key], ...value[key]];
        else throw new Error(`Conflicting root and prepared.${key} fields.`);
    }
    return source;
}

// The same normalization is used for live responses and detached recovery.
export function normalizeWorldPlan(value) {
    if (value?.contract_version !== 14) return value;
    const source = notebookFields(value);
    if ( !source || typeof source !== 'object' || Array.isArray(source)
        || !(Array.isArray(source.updates) || Array.isArray(source.status_changes)
            || typeof prose(source.approach) === 'string' || typeof prose(source.summary) === 'string' || typeof source.focus === 'string' || Array.isArray(source.focus))) return value;
    const updates = source.updates ?? [];
    if (!Array.isArray(updates)) return value;
    // An exact {id,status} operation is unambiguous even in the wrong array.
    // Any prose field makes it a content replacement, never an inferred patch.
    const isStatusOnly = item => item && typeof item === 'object' && !Array.isArray(item)
        && Object.keys(item).length === 2 && Object.hasOwn(item, 'id') && Object.hasOwn(item, 'status');
    const statusChanges = source.status_changes ?? [];
    const explicitStatuses = updates.filter(isStatusOnly);
    // Scene recaps from experimental/older responses are not another source of
    // writer facts. Retain factual memory separately; this job is preparation.
    const normalized = { ...value, context: [], memory: '' };
    for (const key of ['approach', 'summary', 'updates', 'status_changes', 'focus']) delete normalized[key];
    if (normalized.note_resolution === null) delete normalized.note_resolution;
    const prepared = { ...source, overview: '',
        focus: plannerFocus(source.focus, undefined, Infinity),
        status_changes: distinctIdenticalOperations(Array.isArray(statusChanges) ? [...statusChanges, ...explicitStatuses] : statusChanges),
        updates: distinctIdenticalOperations(updates.filter(item => !isStatusOnly(item)).map(item => ({
            id: item?.id, premise: prose(item?.premise ?? ''), middle: prose(item?.middle ?? ''),
            future: prose(item?.future ?? ''), knowledge: prose(item?.knowledge ?? ''),
            origin: 'invented', status: item?.status === undefined ? 'prepared' : item.status,
            // A replacement must not inherit obsolete legacy permission gates.
            engine: '', entry: '', hold: '', invalidates: '', intervention: '',
        }))),
    };
    if (source.summary == null) delete prepared.summary;
    else prepared.summary = prose(source.summary);
    if (source.approach == null) delete prepared.approach;
    else prepared.approach = prose(source.approach);
    // Missing/null core prose is the same incomplete form as blank prose.
    // Text lists preserve their complete contents; objects stay invalid.
    // Never borrow old prose to complete a replacement.
    // An incomplete live update is not a replacement for its saved record. Omit
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
    if (value?.prepared?.approach !== undefined && typeof value.prepared.approach !== 'string') errors.push('prepared.approach must be text.');
    if (value?.note_resolution !== undefined && !['suggest', 'correct', 'establish', 'forbid'].includes(value.note_resolution?.kind)) errors.push('note_resolution.kind is invalid.');
    // Focus is advisory. Validate content here; select valid references against
    // the resulting notebook at merge time, before applying the three-item cap.
    errors.push(...validatePrepared(value?.prepared ? { ...value.prepared, focus: plannerFocus(value.prepared.focus) } : value?.prepared));
    return { valid: errors.length === 0, errors };
}

// Content/identity/status changes remain atomic. Focus is only a view into the
// resulting notebook, so absent/duplicate/excess/stale references cannot reject it.
export function mergeWorldPlan(previous, raw) {
    const value = normalizeWorldPlan(raw);
    const checked = validateWorldPlan(value);
    if (!checked.valid) throw new Error(checked.errors.join('; '));
    const prior = normalizePreparedWorld(previous);
    const available = new Set(prior.items.map(item => item.id));
    for (const item of value.prepared.updates) {
        if (['resolved', 'retired'].includes(item.status)) available.delete(item.id);
        else available.add(item.id);
    }
    const statusChanges = (value.prepared.status_changes || []).filter(change => {
        const terminal = ['resolved', 'retired'].includes(change.status);
        const exists = available.has(change.id);
        if (terminal) available.delete(change.id);
        // Replaying an already completed removal is a no-op. Activating or
        // editing an unavailable record still fails in the content merge.
        return !terminal || exists;
    });
    return mergePreparedWorld(prior, { ...value.prepared, status_changes: statusChanges, focus: plannerFocus(value.prepared.focus, available) });
}
