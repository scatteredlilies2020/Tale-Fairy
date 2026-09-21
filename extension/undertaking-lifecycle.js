// Accepted witnesses, durable subjects and writer material have distinct ownership.
// This ledger is a cited interpretation of accepted prose, never a world simulator.
const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
const LEGACY_REALIZATION_SCHEMA = { type: 'array', maxItems: 4, items: {
    type: 'object', additionalProperties: false, required: ['id'], properties: {
        id: text(80),
        changes: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false,
            required: ['episodeId', 'status', 'evidence'], properties: {
                episodeId: text(80), status: { enum: ['introduced', 'participating', 'partial', 'completed', 'declined', 'transformed'], type: 'string' },
                evidence: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'object', additionalProperties: false,
                    required: ['index', 'quote'], properties: { index: { type: 'integer', minimum: 0 }, quote: text(1200) } } },
            } } },
        playable: { type: 'array', maxItems: 2, items: { type: 'object', additionalProperties: false,
            required: ['episodeId', 'when', 'situation', 'resolution'], properties: {
                episodeId: text(80), when: text(500), situation: text(1200),
                resolution: { type: 'object', additionalProperties: false, required: ['owner', 'endpoint'], properties: {
                    owner: { type: 'string', enum: ['npc', 'world', 'player'] },
                    actors: { type: 'array', minItems: 1, maxItems: 6, items: text(100) },
                    endpoint: text(1000),
                } },
            } } },
    },
} };
// Keep old scene scripts readable as private migration data, not new output.
const SAVED_REALIZATION_SCHEMA = structuredClone(LEGACY_REALIZATION_SCHEMA);
SAVED_REALIZATION_SCHEMA.items.properties.playable.items.required = ['episodeId', 'when', 'situation'];
export const REALIZATION_SCHEMA = structuredClone(LEGACY_REALIZATION_SCHEMA);
REALIZATION_SCHEMA.items.properties.changes.description = 'One current observation per episodeId. Use its latest supported status, not a row for each historical stage.';
// Up to four active subjects plus final evidence for four retiring in this transaction.
REALIZATION_SCHEMA.maxItems = 8;
REALIZATION_SCHEMA.items.properties.selection = { type: 'string', enum: ['keep'],
    description: 'Explicitly keep existing selected material after checking its applicability against accepted play. Omit when supplying playable to revise it or playable=[] to withdraw it. Not valid for new, legacy or pending-review material.' };
REALIZATION_SCHEMA.items.properties.playable.items = {
    type: 'object', additionalProperties: false, required: ['episodeId', 'when', 'direction', 'middle', 'future'],
    properties: {
        episodeId: text(80),
        when: { ...text(500), description: 'Relevant circumstances or an unresolved prerequisite. No reply count, scheduled entrance, fictional time advance or pacing instruction.' },
        direction: { ...text(600), description: 'Available story premise: an encounter, opportunity, interest or world/process condition. Not an instruction to develop a theme or achieve an objective. Leave unnecessary names and details open.' },
        middle: { ...text(900), description: 'Interacting interests, resources, relationships or process conditions with mid-term reach. Not a prescribed decision, binary dilemma, ordered beats or assigned response. Add substance distinct from other selected entries.' },
        future: { ...text(700), description: 'A contingent lasting change in relationships, capabilities, access or wider conditions relevant now. State necessary dependencies, not an exhaustive success/failure fork, next task, required player response or guaranteed ending. Dormant future encounters stay private.' },
    },
};
export const needsPlayableReview = entry => !entry || Boolean(entry.needsPlayableReview)
    || entry.playable.some(p => !p.direction);

// Only selected story substance crosses into the writer request. Keep the
// historical storage vocabulary for lossless saves and cache authentication.
export const storyMaterial = p => ({ when: p.when, premise: p.direction,
    developing_conditions: p.middle, possible_consequences: p.future });

const actorKey = name => String(name).trim().toLocaleLowerCase();
export function validateResolution(resolution, playerNames = []) {
    if (!resolution) return; // Compatibility is only for stored, older preparation.
    const actors = (resolution.actors || []).map(actorKey);
    if (resolution.owner === 'npc') {
        if (!actors.length || actors.some(name => !name) || new Set(actors).size !== actors.length) {
            throw Error('NPC resolution needs distinct named NPC actors');
        }
        const players = new Set(playerNames.map(actorKey));
        if (actors.some(name => players.has(name))) throw Error('NPC resolution cannot own a player action');
    } else if (actors.length) throw Error('Only NPC resolutions list autonomous actors');
}

export function playableSituation(p) {
    if (p.direction) return { when: p.when, direction: p.direction, middle: p.middle, future: p.future };
    const result = { when: p.when, situation: p.situation };
    if (!p.resolution) return result;
    const { owner, actors, endpoint } = p.resolution;
    if (owner === 'npc') result.npc_resolution = { actors: [...actors], result: endpoint };
    else if (owner === 'world') result.world_result = endpoint;
    else result.player_decision = endpoint;
    return result;
}

const closed = status => ['completed', 'declined', 'transformed'].includes(status);
const rank = { introduced: 0, participating: 1, partial: 2 };

function matchedWitness(content, quote) {
    if (!quote.trim()) return null;
    if (content.includes(quote)) return quote;
    // Typographical quotes and paragraph spacing do not change the quoted words.
    // Return the original source span; never repair wording or search another message.
    const pattern = [...quote.trim().matchAll(/\s+|["“”]|['‘’]|./gu)].map(([part]) => {
        if (/^\s+$/u.test(part)) return '\\s+';
        if (/^["“”]$/u.test(part)) return '["“”]';
        if (/^['‘’]$/u.test(part)) return "['‘’]";
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
    return content.match(new RegExp(pattern, 'u'))?.[0] || null;
}


export function mergeRealization(previous, updates, { subjects, messages, source, playerNames = [], requireAll = [], requireReview = [], onDiscardedWitness = () => {} }) {
    const result = structuredClone(previous || {});
    const supplied = new Map((messages || []).map(m => [m.index, m]));
    const seen = new Set();
    const reviewed = new Set();
    const kept = new Set();
    for (const update of updates || []) {
        if (['__proto__', 'constructor', 'prototype'].includes(update.id)) throw Error('Unsafe subject id');
        if (seen.has(update.id) || !subjects.includes(update.id)) throw Error('Realization needs a unique retained subject');
        seen.add(update.id);
        const old = result[update.id] || { episodes: {}, playable: [] };
        if (Object.hasOwn(update, 'selection')) {
            if (update.selection !== 'keep' || Object.hasOwn(update, 'playable')
                || !old.playable.length || needsPlayableReview(old)) {
                throw Error('Keep requires existing current material and cannot also supply playable');
            }
            kept.add(update.id);
        }
        const episodes = structuredClone(old.episodes);
        const observations = new Map();
        for (const change of update.changes || []) {
            if (['__proto__', 'constructor', 'prototype'].includes(change.episodeId)) throw Error('Unsafe episode id');
            const witnesses = change.evidence.map(e => {
                const m = supplied.get(e.index);
                const quote = m && matchedWitness(m.content, e.quote);
                if (!quote) {
                    onDiscardedWitness({ subjectId: update.id, episodeId: change.episodeId, index: e.index, reason: 'quote-not-found' });
                    return null;
                }
                return { index: m.index, role: m.role, name: m.name || '', quote };
            }).filter(Boolean);
            // One bad extra citation must not veto independently supported progress.
            // Never invent, relocate or fuzzy-match a quote; zero exact witnesses fails.
            if (!witnesses.length) throw Error('Progress requires an exact supplied accepted-message witness');
            const existing = observations.get(change.episodeId);
            if (existing && closed(existing.status) && closed(change.status) && existing.status !== change.status) {
                throw Error(`Conflicting outcomes for episode ${change.episodeId}`);
            }
            // A model may describe several witnessed stages of one experience.
            // Join compatible milestones independently of output order. Only
            // evidence for the resulting status can authorize its advancement;
            // a newer introduction cannot authenticate an old completion quote.
            if (!existing || (!closed(existing.status) && (closed(change.status) || rank[change.status] > rank[existing.status]))) {
                observations.set(change.episodeId, { ...change, witnesses });
            } else if (existing.status === change.status) {
                existing.witnesses = [...new Map([...existing.witnesses, ...witnesses]
                    .map(w => [JSON.stringify([w.index, w.quote]), w])).values()]
                    .sort((a, b) => a.index - b.index).slice(-4);
            }
        }
        for (const change of observations.values()) {
            let witnesses = change.witnesses;
            const prior = episodes[change.episodeId];
            // Participation can continue after partial accomplishment. Join that
            // observation with the achieved milestone instead of treating it as
            // a rollback. Preserve its witness, plus bounded recent evidence.
            const continuation = prior?.status === 'partial' && change.status === 'participating';
            const status = continuation ? prior.status : change.status;
            if (prior && (closed(prior.status) && prior.status !== status
                || rank[status] < rank[prior.status])) throw Error('An episode cannot restart or regress; build a new episode on its result');
            if (prior && status !== prior.status && !witnesses.some(e => e.index >= prior.source.messageCount)) {
                throw Error('Changed progress requires newly accepted evidence');
            }
            if (continuation) {
                const achieved = prior.witnesses[0];
                const recent = new Map([...prior.witnesses.slice(1), ...witnesses]
                    .filter(w => w.index !== achieved.index || w.quote !== achieved.quote)
                    .map(w => [JSON.stringify([w.index, w.quote]), w]));
                witnesses = [achieved, ...[...recent.values()].slice(-3)];
            }
            // Echoing an unchanged observation is not a new milestone. Previous
            // ledger versions are archived by the transaction, not recursively
            // nested into the next planner input.
            if (!prior || prior.status !== status || JSON.stringify(prior.witnesses) !== JSON.stringify(witnesses)) {
                episodes[change.episodeId] = { status, witnesses, source: structuredClone(source) };
            }
        }
        const explicitPlayable = Object.hasOwn(update, 'playable');
        for (const p of update.playable || []) validateResolution(p.resolution, playerNames);
        if (explicitPlayable) reviewed.add(update.id);
        const offered = explicitPlayable ? update.playable : old.playable;
        if (new Set(offered.map(p => p.episodeId)).size !== offered.length) throw Error('Duplicate playable episode');
        // A progress-only update may consume an old situation without authoring
        // its remainder. Withhold that stale handoff; preserve unrelated options.
        const advanced = new Set((update.changes || []).filter(c => c.status === 'partial'
            && (old.episodes[c.episodeId]?.status !== 'partial'
                || episodes[c.episodeId].witnesses.some(w => w.index >= old.episodes[c.episodeId].source.messageCount)))
            .map(c => c.episodeId));
        const withheld = !explicitPlayable && offered.some(p => advanced.has(p.episodeId));
        const playable = offered.filter(p => !closed(episodes[p.episodeId]?.status)
            && (explicitPlayable || !advanced.has(p.episodeId)));
        if (kept.has(update.id) && playable.length !== offered.length) {
            throw Error('Advanced or closed material cannot be kept; revise or withdraw playable');
        }
        const reviewPending = !explicitPlayable && (old.needsPlayableReview || withheld);
        result[update.id] = { episodes, playable: structuredClone(playable), ...(reviewPending ? { needsPlayableReview: true } : {}) };
    }
    if (requireAll.some(id => !reviewed.has(id))) throw Error('Each changed subject needs an explicit playable review');
    for (const id of requireReview) {
        // Do not reject an otherwise valid review and thereby keep injecting
        // the old selection. Withhold only unreviewed material; its subject,
        // witnessed progress and archived prior preparation remain intact.
        if (!reviewed.has(id) && !kept.has(id) && result[id]?.playable.length) {
            result[id] = { ...result[id], playable: [], needsPlayableReview: true };
        }
    }
    // Retired subjects retain their evidence privately, but never contribute packets.
    return result;
}

export function playableSituations(state) {
    return state.developments.flatMap(subject => {
        const entry = state.realization?.[subject.id];
        if (!entry) return null; // Caller retains the pre-upgrade packet for this subject.
        return entry.playable.filter(p => !closed(entry.episodes[p.episodeId]?.status))
            .map(playableSituation);
    }).filter(Boolean);
}

export const REALIZATION_INSTRUCTIONS = `
Keep three responsibilities separate within this response. developments holds durable mid- and long-term preparation, including dormant possibilities. realization.changes records ONLY changes supported by exact quotes from supplied accepted_messages. realization.playable supplies selected story material, not instructions to the writer or scripted scenes. Generated preparation, memory summaries and an intention to act cannot establish that an activity happened.

For every new subject and each playable_review_required_id provide an explicit playable array under the same id. On every normal review, also decide every selection_review_required_id: selection="keep" retains still-applicable material unchanged without copying it; playable=[...] revises it; playable=[] withdraws it while preserving the subject. Do not combine selection with playable. A changed scene, spent premise or advanced/closed episode needs revision or withdrawal, not keep. Omission is not a decision for injected material. Dormant subjects and their private mid-/long-term preparation survive omission; no automatic replacement or novelty quota. Make these decisions inside this single response, never ask the user to choose or run another review. Revising durable preparation alone does not decide its injection. Omit changes when no accepted progress is claimed. Progress-only updates can withhold consumed material, but do not satisfy a required selection decision. Use stable episodeId values for finite experiences within each undertaking. Distinguish introduced, participating, partial, completed, declined and transformed; these are evidence descriptions, not mandatory stages. Quote the actual participation, performed substance or result: an invitation is only introduced, agreement is participation, practice can be partial, a performed piece can complete that episode. Declining a booking closes that episode, not music. Retire a whole subject only on whole-subject evidence, with scope whole-subject and exact witnesses; declining one method or finishing one episode is insufficient. Previously completed/declined episodes cannot restart. A changed arrangement or collaboration is a NEW episode building on the witnessed result under the SAME subject. Keep unused possibilities without recruiting the player into them.

Each selected entry contains when, direction, middle and future; these storage names do not authorize directions to the writer. direction states an available premise: an encounter, opportunity, competing interest or world/process condition. middle supplies its developing substance: changing interests, relationships, capabilities, pressures or arrangements, rather than a queue of prerequisites. future supplies a possible lasting consequence of those conditions, not a resolution tree or a second encounter. Keep the larger horizon in developments until relevant; selecting it is not an instruction to enact it immediately. These are possibilities, not assigned player objectives, mandatory stages or guaranteed endings. when states applicability and any unresolved prerequisite; it must not prescribe an arrival or fictional time advance.

Be specific about useful circumstances and sources of change, not execution. Avoid vague advice such as build trust or advance the plot: supply the underlying interests, opportunities or conditions instead. A broadly specified encounter is valid; new names, biographies and incidental details are not required. Retain established identities when relevant. Do not supply an encounter script, exact gestures, prop movements, dialogue, incidental quantities, a fixed sequence, or predetermined NPC decisions and outcomes. Present open conditions, not a menu of what each character must choose. Conditional does not mean an obligatory if-success/if-failure pair: one meaningful possible consequence with its dependency can suffice. Do not turn every institution into honest-versus-corrupt reporting or every relationship into trust-versus-rejection. Such tensions may be relevant, but their repeated decision pattern is not independent material. The writer and player determine how events unfold. NPCs may pursue their own aims without repeated player permission; this does not authorize invented completed work or player actions. Processes need no invented NPC owner, conflict or human motive. Finite work may end without another obligation.

Select across the whole preparation, not one nonempty entry for every subject. Every NEW subject still requires its own realization record; use playable=[] for an unselected new subject. Give zero to two concise selected entries per subject, normally one. Usually one short sentence per field is enough; omit lists of possible reactions. The writer receives only their premise, developing conditions, conditional consequences and applicability, not the whole campaign plan, objective commands, evidence quotes or ledger statuses. No prose instructions, reply quotas, camera commands, style rules, tone guidance or pacing directives anywhere in selected material. Selection supplies the substance; never add instructions about how to present it. Preserve knowledge boundaries and player ownership. Empty selection is valid; no compulsory crisis, interruption, travel or subplot quota. Review interval and message count are NOT fictional elapsed time. On review, remove completed portions and revise remaining material from accepted play without restarting the introduction. When material_review_required, review all supplied playable_review_required_ids: reassess each old selection against this contract and supply a revised playable array, or keep the subject private with playable=[]. The old fields alone do not establish suitability. Remove assigned decisions, exhaustive either/or outcomes and duplicated mechanisms; retain useful circumstances and longer-term reach. selection="keep" is not valid for this one-time migration. Replace legacy situation/resolution scripts under the same subject and episode IDs where appropriate; preserve witnessed progress. Do not copy old choreography or writing advice into the new fields.

Representation examples, not required content: an accessible craft exchange can connect complementary skills to recurring collaboration without inventing a meeting, acceptance or finished project. Connected pools can permit dispersal into different habitats and change later species distribution without a disaster or an assigned human goal. In either case, the premise is useful before anyone enacts a scene. Apply that distinction to the actual source, rather than copying these examples.
`;

export function validateStoredRealization(value, check) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid stored realization');
    for (const [id, entry] of Object.entries(value)) {
        if (!entry || !entry.episodes || typeof entry.episodes !== 'object' || Array.isArray(entry.episodes)) throw Error('Invalid progress ledger');
        if (!Array.isArray(entry.playable) || entry.needsPlayableReview !== undefined && typeof entry.needsPlayableReview !== 'boolean') throw Error('Invalid writer review state');
        check([{ id, changes: [], playable: [] }], REALIZATION_SCHEMA);
        if (entry.playable.length > 2) throw Error('Too many guidance entries');
        for (const p of entry.playable) check([{ id, changes: [], playable: [p] }],
            Object.hasOwn(p, 'direction') ? REALIZATION_SCHEMA : SAVED_REALIZATION_SCHEMA);
        for (const p of entry.playable) validateResolution(p.resolution);
        for (const [episodeId, episode] of Object.entries(entry.episodes)) {
            check([{ id, playable: [], changes: [{ episodeId, status: episode.status,
                evidence: episode.witnesses.map(({ index, quote }) => ({ index, quote })) }] }], REALIZATION_SCHEMA);
            if (!episode.source || !Number.isSafeInteger(episode.source.messageCount) || episode.source.messageCount < 0
                || !['chatId', 'referenceHash', 'fingerprint'].every(k => typeof episode.source[k] === 'string' && episode.source[k])) throw Error('Missing progress source proof');
        }
    }
}
