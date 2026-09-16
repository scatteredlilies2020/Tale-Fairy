import { stageNotebookCompactions } from './notebook-compaction.js?v=0.14.21';
// Model-facing replacement. Legacy boards remain readable, but are no longer
// mandatory work for every generated update. Transport/lifecycle stay separate.
import { validatePrepared, normalizePreparedWorld, mergePreparedWorld, preparedFieldLimit, PREPARED_APPROACH_LIMIT, PREPARED_SUMMARY_LIMIT, WRITER_MATERIAL_LIMIT } from './prepared-world.js?v=0.14.21';

const text = maxLength => ({ type: 'string', maxLength });
const nonblank = maxLength => ({ type: 'string', minLength: 1, maxLength, pattern: '\\S' });
const proseField = (key, target) => ({ ...nonblank(preparedFieldLimit(key)), description: `Aim for at most ${target} characters; the schema maximum is the existing storage limit. Preserve complete meaning.` });
export const WORLD_PLANNER_SCHEMA = {
    name: 'tale_fairy_world_notebook_v14', strict: true, returnInvalid: true,
    description: 'JSON nesting: only contract_version, prepared and optional note_resolution belong at the root. Put approach, summary, updates, status_changes, focus and writer INSIDE prepared. Before sending this single response, check every operation: unchanged content is omitted; status-only changes go in status_changes; every updates record has id, premise, middle, status, family and dependency. Keep at most three distinct available focus IDs. Each ID occurs in only one update/status operation. Supply writer as a complete selection referencing focused IDs. The input is a selected working view; omitted records remain stored and do not block additions. Use JSON strings for prose, not lists or objects. If space is tight, return fewer complete updates, never partial records. Close the JSON object; return no commentary.',
    value: {
        type: 'object', additionalProperties: false,
        properties: {
            contract_version: { type: 'integer', const: 14 },
            note_resolution: { type: 'object', properties: { kind: { type: 'string', enum: ['suggest', 'correct', 'establish', 'forbid'] } }, required: ['kind'], additionalProperties: false },
            prepared: { type: 'object', additionalProperties: false, properties: {
                approach: { ...text(PREPARED_APPROACH_LIMIT), description: 'Private planner guidance for developing and selecting possibilities; never injected into the writer. Story-specific aims grounded in references and explicit preferences, not general writing rules. Omit when unchanged; otherwise replace completely, aiming for 800 characters. Empty text deliberately clears it.' },
                summary: { ...text(PREPARED_SUMMARY_LIMIT), description: 'Rolling private planner summary. Create when absent; update when developments change. Return a complete replacement, aiming for 1200 characters; omit when unchanged. Preserve wider possibilities and unresolved dependencies from the previous summary; new evidence can correct or resolve them. This is conditional preparation, not story history. Empty text deliberately clears it.' },
                updates: { type: 'array', maxItems: 12, items: {
                    type: 'object', additionalProperties: false,
                    properties: {
                        id: { ...nonblank(80), description: 'Exact existing ID for a replacement, or a new stable ID for new content.' },
                        premise: { ...proseField('premise', 320), description: 'Complete premise in one JSON string; aim for 320 characters.' },
                        middle: { ...proseField('middle', 440), description: 'Complete playable developments in one JSON string; aim for 440 characters. Never omit or replace with a status-only patch.' },
                        future: proseField('future', 260),
                        knowledge: proseField('knowledge', 180),
                        family: { ...nonblank(80), description: 'Stable shared causal-family ID, not a genre or character label. Records serving the same problem share it.' },
                        dependency: { ...nonblank(640), description: 'What sustains this possibility independently, or which other problem it depends on. Private, not writer instructions.' },
                        status: { type: 'string', enum: ['prepared', 'active', 'dormant'] },
                    }, required: ['id', 'premise', 'middle', 'status', 'family', 'dependency'],
                } },
                status_changes: { type: 'array', maxItems: 12, description: 'Use this array for status-only changes and removals of existing IDs, preserving all stored prose.', items: {
                    type: 'object', additionalProperties: false, properties: {
                        id: nonblank(80), status: { type: 'string', enum: ['prepared', 'active', 'dormant', 'resolved', 'retired'] },
                    }, required: ['id', 'status'],
                } },
                focus: { type: 'array', maxItems: 3, uniqueItems: true, description: 'Choose zero to three distinct retained or completely updated IDs; never removed IDs.', items: nonblank(80) },
                writer: { type: 'array', maxItems: 3, description: 'Complete replacement of writer-facing material; [] is valid. Only this selection is injected, not notebook middles or futures.', items: {
                    type: 'object', additionalProperties: false, properties: {
                        id: nonblank(80), material: { ...nonblank(WRITER_MATERIAL_LIMIT), description: 'Concrete story development or situation linked to this focused ID; aim for 400 characters. Affirmative motives, activities, encounters, opportunities and changing circumstances, not prose/pacing instructions.' },
                        knowledge: text(720),
                    }, required: ['id', 'material'],
                } },
            }, required: ['updates', 'focus', 'writer'] },
        }, required: ['contract_version', 'prepared'],
    },
};

WORLD_PLANNER_SCHEMA.value.properties.prepared.properties.consolidations = {
    type: 'array', maxItems: 2, description: 'When the notebook grows, combine redundant dormant proposals into one shorter development. Never include active, focused, newly changed or unresolved accepted commitments. Originals are archived before replacement.',
    items: { type: 'object', additionalProperties: false, required: ['ids', 'replacement'], properties: {
        ids: { type: 'array', minItems: 2, maxItems: 12, uniqueItems: true, items: nonblank(80) },
        replacement: WORLD_PLANNER_SCHEMA.value.properties.prepared.properties.updates.items,
    } },
};

export const WORLD_PLANNER_SYSTEM = `You are Tale Fairy, a creative story planner for any RP or simulation. Return the JSON contract in one response, without reasoning, a critic, or a repair pass. Maintain wider possibilities and supply concrete story material useful across exchanges.

These instructions govern private preparation only. The writer's preset governs style, viewpoint and narrative behavior. Supply story material, not a replacement preset. Pacing auto follows the preset.

approach: Private planner guidance, never injected into the writer. Ground this RP's aims in rp_reference and explicit preferences, including their full range and scale. A local problem is not the whole premise. Do not generate general writing rules or compulsory themes. Revisit an existing approach containing such mandates; replace unsupported clauses or clear it. Do not copy approach instructions into premise, middle, future, knowledge or writer material. Omit unchanged approach/summary; replace changed text completely; empty text clears it.

summary: Carry forward wider possibilities, unresolved dependencies and knowledge boundaries from supplied records, previous summary and accepted evidence. Correct superseded material. Proposals remain preparation, not history. omitted_fields marks unavailable saved prose, not permission to erase it.

updates: Prepare distinct middle/longer-term possibilities, not next-reply choreography. One local problem normally needs one record, not several disguised as different directions. When the RP has a wider canvas, include an independently motivated possibility beyond that problem. Invent fitting people, places, organizations, activities and opportunities. premise describes the possibility; middle supplies playable processes; optional future gives alternative continuations and knowledge preserves relevant boundaries. Omit empty optional notes. NPCs and systems can act without another player command.

Attention: local and wider IDs are separate review sets, not a foreground schedule. Consider the wider RP even during a long scene. family groups developments serving one underlying problem; different agents, locations or horizons do not make independent families. dependency explains whether a development survives removal of the current problem and why. Classify new or deliberately revised records; unknown legacy families remain unknown. Preserve meaningful independent material without genre quotas or compulsory new subplots. Respect closed scenarios.

writer: Return a complete selection of up to three {id,material,knowledge?} entries referencing focused records, or []. Only these entries reach the writer. Keep the notebook's middle/future/approach private. Supply creative, concrete encounters, NPC initiatives, opportunities and developing circumstances. Interest can come from ordinary life, affection, work, discovery, cooperation or institutions as well as opposition. Influence the story through its content, not instructions about narration, style or pace. Express strong motives and established commitments directly; hesitation and obstacles need story support. Describe a playable situation rather than a sequence of next-reply steps or a distant outcome. Preserve necessary knowledge distinctions within the material. Broader review need not introduce anything into the current scene.

Persistence: updates fully replaces content using id, premise, middle and status prepared/active/dormant; omit unchanged rows. status_changes={id,status} changes EXISTING records without rewriting prose; resolved/retired removes them. Never put an id in both arrays. retained_index contains lookup tuples, not complete records; unavailable prose must not be copied into replacements or writer material. Omitted records survive. Usually change zero to two records. consolidations may combine redundant dormant proposals with originals archived; preserve independent families, active/focused plans and accepted commitments. Storage has no record-count cap. focus selects up to three available IDs. Active requires actual story uptake, not injection. Review rotation never advances fictional time.

Boundaries: Produce preparation only, not a recap or replacement memory. Direct observations and explicit user instructions outrank notebook claims. player_controlled identifies the user's side: preserve their ownership of past choices, motives, decisions, dialogue, feelings and contested outcomes. Supply external developments instead. Distinguish inventions from accepted events and secrets from character knowledge. Classify user_instruction with note_resolution.kind (suggest/correct/establish/forbid). Aim for 600–1400 routine output tokens.`;

// Supply the current wire fields, without legacy empty-form padding that a
// model could mistake for the requested update format.
export function preparedRecordForPlanner(item) {
    return Object.fromEntries(['id', 'status', 'premise', 'middle', 'future', 'knowledge', 'family', 'dependency']
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
    for (const key of ['approach', 'summary', 'updates', 'status_changes', 'focus', 'consolidations', 'writer']) {
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
    for (const key of ['approach', 'summary', 'updates', 'status_changes', 'focus', 'consolidations', 'writer']) delete normalized[key];
    if (normalized.note_resolution === null) delete normalized.note_resolution;
    const prepared = { ...source, overview: '',
        // Older/in-flight responses remain usable private preparation. Never
        // manufacture writer instructions by copying their private futures.
        writer: source.writer === undefined ? [] : source.writer,
        focus: plannerFocus(source.focus, undefined, Infinity),
        status_changes: distinctIdenticalOperations(Array.isArray(statusChanges) ? [...statusChanges, ...explicitStatuses] : statusChanges),
        updates: distinctIdenticalOperations(updates.filter(item => !isStatusOnly(item)).map(item => ({
            id: item?.id, premise: prose(item?.premise ?? ''), middle: prose(item?.middle ?? ''),
            future: prose(item?.future ?? ''), knowledge: prose(item?.knowledge ?? ''),
            ...(item?.family !== undefined ? { family: item.family } : {}),
            ...(item?.dependency !== undefined ? { dependency: prose(item.dependency) } : {}),
            origin: 'invented', status: item?.status === undefined ? 'prepared' : item.status,
            // A replacement must not inherit obsolete legacy permission gates.
            engine: '', entry: '', hold: '', invalidates: '', intervention: '',
        }))),
    };
    if (source.summary == null) delete prepared.summary;
    else prepared.summary = prose(source.summary);
    if (source.approach == null) delete prepared.approach;
    else prepared.approach = prose(source.approach);
    const omittedFields = [];
    for (const [key, limit] of [['summary', PREPARED_SUMMARY_LIMIT], ['approach', PREPARED_APPROACH_LIMIT]]) {
        if (typeof prepared[key] === 'string' && prepared[key].length > limit) {
            delete prepared[key]; // Preserve the saved baseline, never clip its meaning.
            omittedFields.push(`prepared.${key}`);
        }
    }
    // Missing/null core prose is the same incomplete form as blank prose.
    // Text lists preserve their complete contents; objects stay invalid.
    // Never borrow old prose to complete a replacement.
    // An incomplete live update is not a replacement for its saved record. Omit
    // only this specific, recoverable defect; keep strict validation for bad
    // types, identities, duplicate IDs and other substantive errors.
    const uniqueIds = new Set(prepared.updates.map(item => item.id));
    const omitted = uniqueIds.size === prepared.updates.length
        ? prepared.updates.filter(item => {
            if (Array.isArray(prepared.status_changes) && prepared.status_changes.some(change => change?.id === item.id)) return false;
            const errors = validatePrepared({ overview: '', updates: [item], focus: [] });
            if (errors.length === 1 && errors[0] === 'live prepared records need a premise and playable developments') return true;
            // A whole overlong record can be skipped without rejecting valid
            // neighbors. Invalid types, IDs and lifecycle data still fail.
            const oversized = ['premise', 'middle', 'future', 'knowledge'].filter(key =>
                typeof item[key] === 'string' && item[key].length > preparedFieldLimit(key));
            return oversized.length > 0 && errors.length === oversized.length
                && errors.every(error => oversized.some(key => error === `prepared.${key} must be text up to ${preparedFieldLimit(key)} characters`));
        }).map(item => item.id) : [];
    if (omitted.length) {
        const omittedIds = new Set(omitted);
        prepared.updates = prepared.updates.filter(item => !omittedIds.has(item.id));
        // Incomplete new records cannot be focused. Existing omitted records
        // remain stored, but this response supplies no complete focused update.
        if (Array.isArray(prepared.focus)) prepared.focus = prepared.focus.filter(id => !omittedIds.has(id));

    }
    if (omitted.length || omittedFields.length) normalized._taleFairyRecovery = {
        ...normalized._taleFairyRecovery,
        omitted: [...new Set([...(normalized._taleFairyRecovery?.omitted || []), ...omittedFields, ...omitted.map(id => `prepared.updates:${id}`)])],
    };
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
    const focus = plannerFocus(value.prepared.focus, available);
    if (value.prepared.writer.some(item => !focus.includes(item.id))) throw new Error('Writer material must reference selected available notebook records.');
    const merged = mergePreparedWorld(prior, { ...value.prepared, status_changes: statusChanges, focus });
    if (merged.writer.length !== value.prepared.writer.length) throw new Error('Writer material cannot reference dormant notebook records.');
    merged.reviewCursor = (prior.reviewCursor || 0) + 1;
    return stageNotebookCompactions(merged, value.prepared.consolidations, prior);
}
