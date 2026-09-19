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
REALIZATION_SCHEMA.items.properties.playable.items = {
    type: 'object', additionalProperties: false, required: ['episodeId', 'when', 'direction', 'middle', 'future'],
    properties: {
        episodeId: text(80),
        when: { ...text(500), description: 'Applicability or an unresolved prerequisite, not a scheduled entrance or action.' },
        direction: { ...text(600), description: 'A flexible objective or source of development, not a scene to enact.' },
        middle: { ...text(900), description: 'What can develop across several scenes: changing aims, relationships, capabilities or meaningful milestones. No ordered tasks or scripted actions.' },
        future: { ...text(700), description: 'Conditional longer-term possibilities opened by progress or changed choices. No guaranteed result, forced ending or automatic sequel.' },
    },
};
export const needsPlayableReview = entry => !entry || Boolean(entry.needsPlayableReview)
    || entry.playable.some(p => !p.direction);

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


export function mergeRealization(previous, updates, { subjects, messages, source, playerNames = [], requireAll = [], onDiscardedWitness = () => {} }) {
    const result = structuredClone(previous || {});
    const supplied = new Map((messages || []).map(m => [m.index, m]));
    const seen = new Set();
    const reviewed = new Set();
    for (const update of updates || []) {
        if (['__proto__', 'constructor', 'prototype'].includes(update.id)) throw Error('Unsafe subject id');
        if (seen.has(update.id) || !subjects.includes(update.id)) throw Error('Realization needs a unique retained subject');
        seen.add(update.id);
        const old = result[update.id] || { episodes: {}, playable: [] };
        const episodes = structuredClone(old.episodes);
        const episodeIds = new Set();
        for (const change of update.changes || []) {
            if (['__proto__', 'constructor', 'prototype'].includes(change.episodeId)) throw Error('Unsafe episode id');
            if (episodeIds.has(change.episodeId)) throw Error('Duplicate episode change');
            episodeIds.add(change.episodeId);
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
            const prior = episodes[change.episodeId];
            if (prior && (closed(prior.status) && prior.status !== change.status
                || rank[change.status] < rank[prior.status])) throw Error('An episode cannot restart or regress; build a new episode on its result');
            if (prior && change.status !== prior.status && !witnesses.some(e => e.index >= prior.source.messageCount)) {
                throw Error('Changed progress requires newly accepted evidence');
            }
            // Echoing an unchanged observation is not a new milestone. Previous
            // ledger versions are archived by the transaction, not recursively
            // nested into the next planner input.
            if (!prior || prior.status !== change.status || JSON.stringify(prior.witnesses) !== JSON.stringify(witnesses)) {
                episodes[change.episodeId] = { status: change.status, witnesses, source: structuredClone(source) };
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
        const needsPlayableReview = !explicitPlayable && (old.needsPlayableReview || withheld);
        result[update.id] = { episodes, playable: structuredClone(playable), ...(needsPlayableReview ? { needsPlayableReview: true } : {}) };
    }
    if (requireAll.some(id => !reviewed.has(id))) throw Error('Each changed subject needs an explicit playable review');
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
Keep three responsibilities separate within this response. developments holds durable mid- and long-term preparation. realization.changes records ONLY changes supported by exact quotes from supplied accepted_messages. realization.playable supplies flexible guidance, not scripted scenes. Generated preparation, memory summaries and an intention to act cannot establish that an activity happened.

For every new subject and each playable_review_required_id provide a realization entry under the same id; other subjects and their playable material survive omission. Revising durable development alone does not mean its current playable situation changed. Omit changes when no accepted progress is claimed. A progress-only entry may omit playable; an old situation with partial or closed progress will no longer be offered. Supply revised playable material when its remaining substance matters now; an explicit empty array is valid quiet. Pending writer reviews do not require another AI call now. Use stable episodeId values for finite experiences within each undertaking. Distinguish introduced, participating, partial, completed, declined and transformed; these are evidence descriptions, not mandatory stages. Quote the actual participation, performed substance or result: an invitation is only introduced, agreement is participation, practice can be partial, a performed piece can complete that episode. Declining a booking closes that episode, not music. Retire a whole subject only on whole-subject evidence, with scope whole-subject and exact witnesses; declining one method or finishing one episode is insufficient. Previously completed/declined episodes cannot restart. A changed arrangement or collaboration is a NEW episode building on the witnessed result under the SAME subject. Keep unused possibilities without recruiting the player into them.

Each guidance entry contains when, direction, middle and future. direction names what could develop and why it matters to the involved people. middle supplies substantive possibilities across several scenes: evolving aims, relationships, capabilities, pressures or meaningful milestones, rather than a queue of prerequisites. future describes conditional longer-term reach, including how different choices or results could change the direction. These are possibilities, not assigned player objectives, mandatory stages or guaranteed endings. when states applicability and any unresolved prerequisite; it must not prescribe an arrival or fictional time advance.

Be specific about motives and sources of change, not execution. Avoid vague advice such as build trust or advance the plot: explain what creates trust or tension and what it could make possible later. Do not supply an encounter script, exact gestures, prop movements, dialogue, incidental quantities, a fixed sequence, or predetermined NPC decisions and outcomes. The writer and player determine how events unfold. NPCs may pursue their own aims without repeated player permission; this does not authorize invented completed work or player actions. A meaningful milestone describes a possible change, not a required checklist step. Finite work may end without another obligation.

Give zero to two concise guidance entries per subject, normally one. The writer receives this guidance, the subject's NPC/world objective and the broader campaign direction, not evidence quotes or ledger statuses. No prose instructions, reply quotas, camera commands or style rules. Preserve knowledge boundaries and player ownership. Quiet or empty guidance is valid; no compulsory crisis, interruption, travel or subplot quota. Review interval and message count are NOT fictional elapsed time. On review, remove completed portions and revise the remaining direction from accepted play without restarting the introduction. Replace legacy situation/resolution scripts with guidance under the same subject and episode IDs where appropriate; preserve witnessed progress. Do not copy old choreography into the new fields.
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
