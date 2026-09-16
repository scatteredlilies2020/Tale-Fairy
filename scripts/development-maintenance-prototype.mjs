// Evaluation-only ownership boundary. Routine calls cannot rewrite proposals.
import { validatePreparation } from './development-preparation-prototype.mjs';
import { estimateTokenCount } from '../extension/token-budget.js';

export const MAINTENANCE_SYSTEM = `Maintain accepted progress and select useful private preparation for the CURRENT reply. You are not writing that reply. All developments are private proposals, not accepted history. Their definite wording does not establish that a meeting, discovery, agreement, time jump or NPC action has happened.

Every id is a reference to an EXISTING notebook record, never a new observation/event ID. observations, invalidate and select refer only to notebook.developments IDs; retire may also refer to notebook.local IDs. Do not record general scene facts as new developments. The schema lists the exact allowed IDs.

Observe actual changes to these developments only when supplied accepted messages support them, citing exact indices. Do not copy a proposal into accepted progress merely because it would fit. A player's request is not proof that an NPC agreed or a proposed activity happened. NPC guesses are not omniscient facts. Keep refusals, revisions and scope changes rather than resetting to the original plan.

Select zero, one or two developments useful at this precise scene boundary. Selection is not an instruction to make all of them happen. Return only IDs, which conditional changes have their prerequisites ALREADY supported by accepted play (zero-based indices, or none), and a concise compatibility explanation citing accepted messages. Do not select a conditional change merely because it could become applicable later. Selecting substance with changes: [] is valid. Do not select an inaccessible place, future meeting, unchosen travel or offscreen progress merely because it is interesting. A current conversation can naturally reveal an NPC's independent interest without forcing participation. If none fits, select nothing: the storyteller can continue from the transcript without manufactured hooks.

Mark a proposed conditional change invalid only if accepted play contradicts it; a public invitation declined once does not invalidate a private activity. Retire a development only if explicitly resolved, ended, superseded or excluded by the user's new scope. Unused or distant preparation is not stale. Retire bounded local records whose episode has actually closed; do not preserve duplicate investigations after their resolution. Preserve other local records untouched.

You cannot edit scope, the substance of developments, their conditional designs or local records. The host preserves them verbatim and records accepted observations separately. If accepted facts make wider preparation inadequate, set review_needed with a specific reason; never write replacement plans into observations. No fictional time advances from a maintenance call. The user alone controls their character, including aliases. Return JSON only.`;

const str = maxLength => ({ type: 'string', minLength: 1, maxLength });
const evidence = { type: 'array', minItems: 1, items: { type: 'integer', minimum: 0 } };
const changeIndices = { type: 'array', maxItems: 4, uniqueItems: true, items: { type: 'integer', minimum: 0 } };
export const MAINTENANCE_SCHEMA = { name: 'development_maintenance', description: 'Append accepted observations and select private preparation. No design edits, new history or authored scene material.', value: {
    type: 'object', additionalProperties: false, required: ['observations', 'invalidate', 'retire', 'select', 'review_needed'], properties: {
        observations: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['id', 'text', 'evidence'], properties: { id: str(80), text: str(900), evidence } } },
        invalidate: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['id', 'changes', 'reason', 'evidence'], properties: { id: str(80), changes: changeIndices, reason: str(600), evidence } } },
        retire: { type: 'array', maxItems: 12, items: { type: 'object', additionalProperties: false, required: ['id', 'reason', 'evidence'], properties: { id: str(80), reason: str(600), evidence } } },
        select: { type: 'array', maxItems: 2, items: { type: 'object', additionalProperties: false, required: ['id', 'changes', 'reason', 'evidence'], properties: { id: str(80), changes: changeIndices, reason: str(600), evidence } } },
        review_needed: { type: 'string', maxLength: 800 },
    },
} };

export function maintenanceSchema(state) {
    const schema = structuredClone(MAINTENANCE_SCHEMA);
    for (const key of ['observations', 'invalidate', 'retire', 'select']) {
        const ids = (key === 'retire' ? [...state.developments, ...state.local] : state.developments).map(d => d.id);
        if (!ids.length) schema.value.properties[key].maxItems = 0;
        else schema.value.properties[key].items.properties.id = { type: 'string', enum: ids, description: 'Exact existing record ID; never invent a fact ID.' };
    }
    return schema;
}

export function developmentState(preparation, local = []) {
    const value = validatePreparation(preparation);
    const ids = [...value.developments, ...local].map(r => r.id);
    if (new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !id.trim())) throw Error('Invalid storage IDs.');
    return { ...value, local: structuredClone(local), observations: [], invalidated: [], archive: [], selected: [], reviewNeeded: '' };
}

export function maintainDevelopments(state, response, suppliedIndices) {
    const keys = ['observations', 'invalidate', 'retire', 'select', 'review_needed'];
    const object = (v, ks) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === ks.length && ks.every(k => Object.hasOwn(v, k));
    const text = (v, n) => typeof v === 'string' && v.trim().length && v.length <= n;
    if (!object(response, keys) || typeof response.review_needed !== 'string' || response.review_needed.length > 800) throw Error('Invalid maintenance root.');
    const next = structuredClone(state), supplied = new Set(suppliedIndices);
    const validEvidence = e => Array.isArray(e) && e.length && e.every(i => Number.isInteger(i) && supplied.has(i));
    const active = id => [...next.developments, ...next.local].find(r => r.id === id);
    const development = id => next.developments.find(r => r.id === id);
    const validChanges = (id, changes) => development(id) && Array.isArray(changes) && changes.length <= 4 && new Set(changes).size === changes.length && changes.every(i => Number.isInteger(i) && i >= 0 && i < development(id).changes.length);
    for (const [key, max] of [['observations', 8], ['invalidate', 8], ['retire', 12], ['select', 2]]) if (!Array.isArray(response[key]) || response[key].length > max) throw Error('Invalid maintenance array.');
    for (const o of response.observations) {
        if (!object(o, ['id', 'text', 'evidence']) || !development(o.id) || !text(o.text, 900) || !validEvidence(o.evidence)) throw Error('Invalid observation.');
        if (!next.observations.some(p => JSON.stringify(p) === JSON.stringify(o))) next.observations.push(structuredClone(o));
    }
    for (const o of response.invalidate) {
        if (!object(o, ['id', 'changes', 'reason', 'evidence']) || !validChanges(o.id, o.changes) || !o.changes.length || !text(o.reason, 600) || !validEvidence(o.evidence)) throw Error('Invalid invalidation.');
        next.invalidated.push(structuredClone(o));
    }
    for (const o of response.retire) {
        if (!object(o, ['id', 'reason', 'evidence']) || !active(o.id) || !text(o.reason, 600) || !validEvidence(o.evidence)) throw Error('Invalid retirement.');
        const lane = development(o.id) ? 'developments' : 'local';
        next.archive.push({ lane, record: active(o.id), retirement: structuredClone(o) });
        next[lane] = next[lane].filter(r => r.id !== o.id);
    }
    if (new Set(response.select.map(o => o.id)).size !== response.select.length) throw Error('Duplicate selection.');
    for (const o of response.select) {
        if (!object(o, ['id', 'changes', 'reason', 'evidence']) || !validChanges(o.id, o.changes) || !text(o.reason, 600) || !validEvidence(o.evidence) || next.invalidated.some(v => v.id === o.id && v.changes.some(i => o.changes.includes(i)))) throw Error('Invalid selection.');
    }
    next.selected = structuredClone(response.select); next.reviewNeeded = response.review_needed;
    return next;
}

export function maintenanceInput({ state, reference, messages, instruction = '' }, maxTokens = 16000) {
    const accepted = messages.map((m, i) => ({ index: m.index ?? i, role: m.role ?? (m.is_user ? 'user' : 'assistant'), content: m.content ?? m.mes }));
    const prompt = JSON.stringify({ source_reference: reference, instruction, notebook: { scope: state.scope, developments: state.developments, local: state.local, observations: state.observations, invalidated: state.invalidated }, accepted_messages: accepted });
    const inputTokens = estimateTokenCount(MAINTENANCE_SYSTEM + JSON.stringify(MAINTENANCE_SCHEMA) + prompt);
    if (inputTokens > maxTokens) throw Error('Complete maintenance input exceeds budget.');
    return { prompt, inputTokens, indices: accepted.map(m => m.index) };
}

export function writerPreparation(state) {
    // Do not forward the AI's rationale as fictional facts. Supply actual
    // proposal contents with immutable provenance and accepted updates apart.
    return state.selected.map(s => {
        const d = state.developments.find(d => d.id === s.id);
        if (!d) throw Error('Stale selection.');
        return { provenance: 'PRIVATE PROPOSAL — NOT ACCEPTED HISTORY OR PLAYER/CHARACTER KNOWLEDGE', id: d.id, substance: d.substance,
            conditional_options: s.changes.map(i => d.changes[i]), encounter_conditions: d.encounter,
            accepted_observations: state.observations.filter(o => o.id === s.id),
            invalidated_options: state.invalidated.filter(o => o.id === s.id),
        };
    });
}
