// Experimental architecture, not imported by the extension.
import { estimateTokenCount } from '../extension/token-budget.js';

export const DURABLE_SYSTEM = `You are Tale Fairy, an imaginative private world/story developer, not a summarizer or scene director. In ONE response, maintain continuing developments, reconcile the local episode and supply present writer material. The latest exchange locates play; it is not the boundary of the RP.

Design first, select second. In broad mode invent substantial continuing material for the RP's full source-grounded scope. Do not simply expand the current problem or paraphrase character traits. Author specific people, social practices, places, creative works or other processes with their own purposes and workings. Choose distinctive details that affect how participation feels and what can change over several encounters. Generic placeholders such as 'a local musician might have aims' leave the creative job undone. A list of destinations, motivations, possible secrets or eventual outcomes is not an unfolding middle.

Commit to a coherent PRIVATE DESIGN, not to its occurrence in the story. A proposed person's name, preferences, work and relationships can be specific without claiming anyone has met them. Put uncertainty at the boundary between design and accepted play, not in a 'might/may/perhaps' qualification of every design detail. Do not make every pleasure into an obstacle, every relationship into leverage or every place into another investigation. World life need not await the player, but no fictional time advances because a planner call ran.

ongoing holds developments with a life beyond the present episode. design gives their specific substance; development describes materially different intermediate experiences and conditional changes across encounters, with enough continuity to revisit them changed. These are NOT ordered beats, a fixed itinerary, or predetermined player actions. Include fresh compatible substance not already handed to you by the latest transcript. Depth and invention matter more than record count. Respect an explicitly closed scenario: ongoing can be empty; deepen that evening rather than invent a campaign.

episodes holds present bounded activities/problems. Do not place continuing preparation there merely because it could become relevant now. Do not label several variants of one episode as independent ongoing developments. A continuing relationship can interact with an episode without rewriting its entire life as that episode's fallout. Canon endpoints and original setup are not current events or compulsory destinations.

Each record has id, design, development and accepted. accepted is an append-only list of concise claims citing actual supplied message indices. It records what has changed in play, separately from private design. A new record needs design and development; an existing record is a FIELD PATCH: omitted fields survive verbatim. Usually append accepted changes without replacing enduring design/development. Revise a contradicted proposal explicitly; preserve still-valid alternatives. Unknown is not false: missing observation does not establish absence, safety or lack of knowledge. Source references outrank generated notebook claims. A persona's names/aliases are one person, not an extra observer. The user alone owns their character's choices, feelings, speech and commitments.

On broad reviews reassess enduring scope and invent where preparation lacks substance. On routine runs maintain ongoing changes and the current episode without requiring new ongoing material every time. scope is private, source-grounded and updated on explicit scope changes, never inferred from how long a scene lasted. Source changes can request a broad review. Complete source reference and separate ongoing space are supplied by the host.

Reconcile closures and duplicates across visible storage. retire removes a resolved record using cited accepted evidence, or supersedes a redundant/legacy record using replacement_id. Its original is archived, not destroyed. Do not retire a possibility merely for being unused, distant or refused once. An episode can finish without a successor problem. Legacy records are fallible preparation, not factual history; retain or migrate useful substance rather than blindly perpetuating local framing.

writer is a complete selection of up to three records from either lane or retained legacy, each with self-contained material and knowledge. Supply fitting concrete material, not plans for future turns, generic coaching or every private possibility. Later preparation can remain entirely private. Independent NPC initiative can enter naturally through what is already present or an accepted transition, never a forced departure, interruption, time jump, commitment or invented player reaction. Distinguish a proposed design from witnessed history and from character knowledge. Only writer is shown to the storyteller. Return JSON only.`;

const str = maxLength => ({ type: 'string', maxLength });
const indices = { type: 'array', minItems: 1, items: { type: 'integer', minimum: 0 } };
const fact = { type: 'object', additionalProperties: false, required: ['text', 'evidence'], properties: { text: str(700), evidence: indices } };
const patch = { type: 'object', additionalProperties: false, required: ['id'], properties: {
    id: str(80), design: str(1800), development: str(2200), accepted: { type: 'array', items: fact, maxItems: 8 },
} };
export const DURABLE_SCHEMA = { name: 'tale_fairy_durable_experiment', description: 'One JSON response. Distinct ongoing preparation and current episodes; field patches preserve omitted prose. Invent concrete private designs, cite accepted changes separately, then select present writer material.', value: {
    type: 'object', additionalProperties: false, required: ['ongoing', 'episodes', 'retire', 'writer'], properties: {
        scope: str(1800), ongoing: { type: 'array', items: patch, maxItems: 8 }, episodes: { type: 'array', items: patch, maxItems: 6 },
        retire: { type: 'array', maxItems: 16, items: { type: 'object', required: ['id', 'reason'], additionalProperties: false, properties: { id: str(80), reason: str(500), evidence: indices, replacement_id: str(80) } } },
        writer: { type: 'array', maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['id', 'material', 'knowledge'], properties: { id: str(80), material: str(1200), knowledge: str(600) } } },
    },
} };

export function durableState(legacy = []) {
    return { scope: '', ongoing: [], episodes: [], legacy: structuredClone(legacy), archive: [], writer: [] };
}

export function mergeDurable(previous, response, evidenceIndices) {
    const next = structuredClone(previous), seen = new Set(), evidence = new Set(evidenceIndices);
    const nonblank = v => typeof v === 'string' && v.trim();
    const citations = refs => Array.isArray(refs) && refs.length && refs.every(i => Number.isInteger(i) && evidence.has(i));
    if (!response || typeof response !== 'object' || Array.isArray(response)) throw Error('Expected object.');
    for (const key of Object.keys(response)) if (!['scope', 'ongoing', 'episodes', 'retire', 'writer'].includes(key)) throw Error(`Unknown response field ${key}.`);
    for (const key of ['ongoing', 'episodes', 'retire', 'writer']) if (!Array.isArray(response[key])) throw Error(`Missing ${key} array.`);
    if (response.scope !== undefined) { if (!nonblank(response.scope) || response.scope.length > 1800) throw Error('Invalid scope.'); next.scope = response.scope; }
    for (const lane of ['ongoing', 'episodes']) {
        if (response[lane].length > (lane === 'ongoing' ? 8 : 6)) throw Error('Too many changes.');
        for (const patch of response[lane]) {
            if (!nonblank(patch.id) || patch.id.length > 80 || seen.has(patch.id)) throw Error('Invalid/duplicate ID.');
            seen.add(patch.id);
            if (['ongoing', 'episodes', 'legacy'].filter(l => l !== lane).some(l => next[l].some(r => r.id === patch.id))) throw Error('Cross-lane ID collision; explicitly supersede with a new ID.');
            for (const key of Object.keys(patch)) if (!['id', 'design', 'development', 'accepted'].includes(key)) throw Error(`Unknown patch field ${key}.`);
            let current = next[lane].find(r => r.id === patch.id);
            if (!current) { if (!nonblank(patch.design) || !nonblank(patch.development)) throw Error('New record needs complete design and development.'); current = { id: patch.id, design: '', development: '', accepted: [] }; next[lane].push(current); }
            for (const [key, limit] of [['design', 1800], ['development', 2200]]) if (patch[key] !== undefined) {
                if (!nonblank(patch[key]) || patch[key].length > limit) throw Error(`Invalid ${key}.`);
                current[key] = patch[key];
            }
            if (patch.accepted !== undefined) {
                if (!Array.isArray(patch.accepted) || patch.accepted.length > 8) throw Error('Invalid accepted changes.');
                for (const f of patch.accepted) {
                    if (!nonblank(f.text) || f.text.length > 700 || !citations(f.evidence) || Object.keys(f).some(k => !['text', 'evidence'].includes(k))) throw Error('Accepted changes need valid supplied evidence.');
                    if (!current.accepted.some(old => old.text === f.text && JSON.stringify(old.evidence) === JSON.stringify(f.evidence))) current.accepted.push(structuredClone(f));
                }
            }
        }
    }
    if (response.retire.length > 16) throw Error('Too many retirements.');
    for (const retirement of response.retire) {
        if (!nonblank(retirement.id) || !nonblank(retirement.reason) || seen.has(retirement.id)) throw Error('Invalid/conflicting retirement.');
        seen.add(retirement.id);
        const lane = ['ongoing', 'episodes', 'legacy'].find(l => next[l].some(r => r.id === retirement.id));
        if (!lane) throw Error('Unknown retirement.');
        const replacement = retirement.replacement_id;
        if (replacement ? replacement === retirement.id || ![...next.ongoing, ...next.episodes].some(r => r.id === replacement) : !citations(retirement.evidence)) throw Error('Retirement needs accepted evidence or a real replacement.');
        next.archive.push({ lane, record: next[lane].find(r => r.id === retirement.id), retirement: structuredClone(retirement) });
        next[lane] = next[lane].filter(r => r.id !== retirement.id);
    }
    const available = new Set([...next.ongoing, ...next.episodes, ...next.legacy].map(r => r.id));
    if (response.retire.some(r => r.replacement_id && !available.has(r.replacement_id))) throw Error('Replacement retired in same response.');
    if (response.writer.length > 3 || new Set(response.writer.map(r => r.id)).size !== response.writer.length) throw Error('Invalid writer count.');
    for (const w of response.writer) if (!available.has(w.id) || !nonblank(w.material) || w.material.length > 1200 || typeof w.knowledge !== 'string' || w.knowledge.length > 600) throw Error('Invalid writer reference/material.');
    next.writer = structuredClone(response.writer);
    return next;
}

export function durablePrompt({ state, reference, messages, broad, instruction = '', historical = {} }, maxTokens = broad ? 14000 : 8000) {
    // Separate state, not a relevance-sorted flat board. This small prototype
    // fails closed on overflow rather than silently discarding durable middles.
    // Scalable archival retrieval remains a later integration requirement.
    const payload = { mode: broad ? 'broad' : 'routine', source_reference: reference, explicit_user_instruction: instruction,
        ...historical, notebook: { scope: state.scope, ongoing: state.ongoing, episodes: state.episodes, legacy: state.legacy },
        accepted_messages: messages.map((m, i) => ({ index: m.index ?? i, role: m.role ?? (m.is_user ? 'user' : 'assistant'), name: m.name, content: m.content ?? m.mes })),
    };
    const serialized = JSON.stringify(payload);
    const totalTokens = estimateTokenCount(DURABLE_SYSTEM + '\n' + JSON.stringify(DURABLE_SCHEMA) + '\n' + serialized);
    if (totalTokens > maxTokens) throw Error(`Complete durable input needs ${totalTokens} tokens, exceeds ${maxTokens}.`);
    const indices = new Set(payload.accepted_messages.map(m => m.index));
    const collect = value => {
        if (!value || typeof value !== 'object') return;
        if (Number.isInteger(value.index) && typeof value.content === 'string') indices.add(value.index);
        for (const child of Object.values(value)) collect(child);
    };
    collect(historical);
    return { prompt: serialized, inputTokens: totalTokens, indices: [...indices] };
}
