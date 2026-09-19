// Candidate single-call campaign preparation; host integration is opt-in.
// Owns proposals only: accepted history always comes from the conversation.
import { playableSituations, storyMaterial, validateStoredRealization } from './undertaking-lifecycle.js?v=0.14.33';
import { estimateTokenCount } from './token-budget.js';

// Matches the existing host's planner-request marker so request interception
// cannot mistake this internal pass for RP and inject the guide into itself.
export const CAMPAIGN_MARKER = 'You are Tale Fairy, the private authorial planning layer for SillyTavern roleplay.';
export const PLOT_POINTS_FORMAT = 'plot-points-v1';
export const EVENT_POINTS_FORMAT = 'event-opportunities-v1';
export const EVENT_POINTS_SCHEMA = { type: 'array', minItems: 1, maxItems: 2, items: {
    type: 'object', additionalProperties: false, required: ['event', 'opens'], properties: {
        event: { type: 'string', minLength: 1, maxLength: 800 },
        opens: { type: 'string', minLength: 1, maxLength: 800 },
    },
} };
export function eventPoints(value) {
    check(value, EVENT_POINTS_SCHEMA, '$.plot_points');
    return structuredClone(value);
}
export const eventPointWire = item => ({ ...plotPointWire(item),
    plot_points: eventPoints(typeof item.premise === 'string' ? JSON.parse(item.premise) : item.premise) });
// Stable storage keys keep archived candidates readable. The model and writer
// see plot vocabulary only for records explicitly produced in the new format.
export const plotPointWire = item => ({ id: item.id, ...(item.initiative ? { initiative: item.initiative } : {}),
    plot_points: item.premise, development: item.progression, stakes: item.outcomes, participation: item.access });
export const CAMPAIGN_SYSTEM = `${CAMPAIGN_MARKER}
Develop the RP's middle and longer future in one JSON response, to be used directly by its writer over several exchanges. Your task is creative development. The conversation already supplies factual memory and immediate action. Do not produce another recap or next-scene plan.

First use source_reference to understand the full experience and scale this RP supports. Give that experience substantive room beyond the present episode. A long local problem does not become the enduring premise through repetition. Source facts, abilities, identities and player choices constrain all invention. An alias establishes identity, not a hidden personal crisis; missing a meal does not establish estrangement. NPC theories stay theories. Never weaken a player's established abilities or invent required resources, permissions or dependence to make a plan work. If evidence conflicts or an identity is unclear, avoid settling it in preparation.

Make a few consequential creative decisions that give the middle content. What distinct situation, practice, relationship or process could develop, what drives it independently, what can be experienced while it changes, and where could those changes lead? A generic ladder of interest, preparation, attempt and eventual success is insufficient. Give the writer enough underlying substance to realize materially different experiences along the way. Substance can be an operating principle with changing uses, a specific divergence of NPC aims, a place whose conditions transform, or work that takes a meaningful form. Fit the source genre; adventure should retain adventure and discovery, and everyday life can remain everyday life. Avoid lists of interchangeable hooks. Invent useful substance without assigning exact gestures, dialogue, props or encounter order.

Build enduring subjects, not more parts of the local problem. Its next employer, witnesses, transport, paperwork and fallout belong to the same episode. Keep its optional unresolved reach in episode, not in several development slots. A new development must have its own reason and useful middle if the current problem ends or is left entirely. Relations with existing NPCs can qualify when they develop actual shared experience beyond reacting to the user's latest feat. There is no quota and empty capacity is not a reason to create something. In a deliberately closed one-scene story, return developments=[]; use episode to support its supplied scope without manufacturing additional conflicts or a sequel.

campaign: a brief proposal for how the RP can accumulate meaningful changes and reach fitting culminations. Stay grounded in source scope; no recap, mandated thematic interpretation, itinerary or promised player destination.
episode: an object with subject (the business being bounded), status (open or finished), and boundary (only what genuinely remains, or why no obligation remains). On review, recognize whether accepted play has already met the boundary. If so, mark finished and release its obligations; do not copy the original unfinished conditions or location. Do not supply a recap or a list of old leads for the writer to revive. An unanswered question, routine follow-through by responsible NPCs, or optional fallout does not automatically reopen finished work. Finishing a problem does not require solving everything above it. Do not create a new obstacle to departure. Older preparation may contain a plain-text episode: replace it with this object, using accepted play to determine status, not merely its old wording.
developments: each record gives concrete premise, a flexible progression of changed experiences within that same subject, meaningful reachable outcomes, and natural access. Experiences in the middle should themselves be worthwhile and have results; do not defer everything behind a future invitation or final reward. Compatible NPC work can be completed and offered through play without the player directing every step. The writer chooses its manifestation. Participation, delay and refusal change possibilities, not the player's ownership. Access permits fitting uptake; invent no compulsory public performance, special permission or waiting period unsupported by the subject. Fictional elapsed time permits independent changes; reply count does not.

Review is forward revision, not a fresh batch of ideas. With previous preparation present, preserve unchanged and unused subjects by omitting them. Update affected subjects under the SAME id. A realized result must change the design: remove resolved uncertainty, retain what the experience established, and develop possibilities that follow from it. Do not merely append a scene recap to the same starting ladder, or turn an achieved result back into an invitation to attempt it. Partial success is not whole-subject completion. Create a new subject only when accepted play opens a genuinely different undertaking or exposes an important source-scope gap the retained subjects cannot support; another aspect of their work is not a new subject by itself. Refusal of one method does not end the whole subject. retire only for evidenced completion, whole-subject rejection, source contradiction or supersession, citing accepted_messages indices supplied here. Omitted subjects remain stored. Retire metadata is never factual memory. Proposals are never accepted events, player decisions or character knowledge. Complete source rules appear last as authority. Return the shortest complete JSON that makes the needed changes, without a second pass. An unchanged review can return empty developments and retire arrays; do not add content to reach a response-length target.`;

const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
export const INITIATIVE_SCHEMA = { type: 'object', additionalProperties: false,
    required: ['control', 'owner', 'aim'], properties: {
        control: { ...text(5), enum: ['npc', 'world'] }, owner: text(160), aim: text(900),
    } };
export const CAMPAIGN_SCHEMA = { name: 'tale_fairy_campaign_v1', value: {
    type: 'object', additionalProperties: false, required: ['campaign', 'episode', 'developments'], properties: {
        campaign: text(1600), episode: { type: 'object', additionalProperties: false, required: ['subject', 'status', 'boundary'], properties: {
            subject: text(160), status: { ...text(8), enum: ['open', 'finished'] }, boundary: text(1200),
        } },
        developments: { type: 'array', maxItems: 4, items: {
            type: 'object', additionalProperties: false, required: ['id', 'premise', 'progression', 'outcomes', 'access'],
            properties: { id: text(80), premise: text(1600), progression: text(2400), outcomes: text(1600), access: text(900) },
        } },
        retire: { type: 'array', maxItems: 4, items: {
            type: 'object', additionalProperties: false, required: ['id', 'reason', 'evidence'], properties: {
                id: text(80), reason: text(800), evidence: { type: 'array', minItems: 1, maxItems: 12, uniqueItems: true, items: { type: 'integer', minimum: 0 } },
            },
        } },
    },
} };
export const EVENT_INITIATIVE_SCHEMA = structuredClone(INITIATIVE_SCHEMA);
EVENT_INITIATIVE_SCHEMA.properties.owner.maxLength = 320;

// Saved owned records are compatible with the existing host. Keep the original
// model request schema unchanged until the alternative pass is explicitly used.
const CAMPAIGN_STATE_SCHEMA = structuredClone(CAMPAIGN_SCHEMA.value);
CAMPAIGN_STATE_SCHEMA.properties.developments.items.properties.initiative = INITIATIVE_SCHEMA;
const EVENT_STATE_SCHEMA = structuredClone(CAMPAIGN_STATE_SCHEMA);
EVENT_STATE_SCHEMA.properties.developments.items.properties.premise = EVENT_POINTS_SCHEMA;
EVENT_STATE_SCHEMA.properties.developments.items.properties.initiative = EVENT_INITIATIVE_SCHEMA;

export function check(value, schema, at = '$') {
    if (schema.enum && !schema.enum.includes(value)) throw Error(`${at}: invalid enum value`);
    if (schema.type === 'object') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${at}: expected object`);
        for (const key of schema.required || []) if (!Object.hasOwn(value, key)) throw Error(`${at}: missing ${key}`);
        for (const [key, child] of Object.entries(value)) {
            if (!Object.hasOwn(schema.properties, key)) throw Error(`${at}: unexpected ${key}`);
            check(child, schema.properties[key], `${at}.${key}`);
        }
    } else if (schema.type === 'array') {
        if (!Array.isArray(value) || value.length < (schema.minItems || 0) || value.length > schema.maxItems) throw Error(`${at}: array bounds`);
        if (schema.uniqueItems && new Set(value.map(v => JSON.stringify(v))).size !== value.length) throw Error(`${at}: duplicates`);
        value.forEach((v, i) => check(v, schema.items, `${at}[${i}]`));
    } else if (schema.type === 'string') {
        if (typeof value !== 'string' || !value.trim() || value.length > schema.maxLength) throw Error(`${at}: nonblank text up to ${schema.maxLength} characters required`);
    } else if (!Number.isSafeInteger(value) || value < schema.minimum) throw Error(`${at}: invalid integer`);
}

export function emptyCampaign() {
    return { revision: 0, campaign: '', episode: '', developments: [], archive: [], source: null };
}

// Saved metadata is not assumed valid merely because it was once generated.
// Validate the active design without truncating it or rewriting its archive.
export function validCampaignState(state) {
    try {
        if (!Number.isSafeInteger(state?.revision) || state.revision < 1 || !Array.isArray(state.archive)) return false;
        if (state.realization !== undefined) validateStoredRealization(state.realization, check);
        const source = state.source;
        if (!source || !Number.isSafeInteger(source.messageCount) || source.messageCount < 0
            || !['chatId', 'referenceHash', 'fingerprint'].every(key => typeof source[key] === 'string' && source[key])) return false;
        validateCampaign({ campaign: state.campaign, episode: state.episode, developments: state.developments },
            { eventFormat: state.preparationFormat === EVENT_POINTS_FORMAT });
        if (state.preparationFormat === EVENT_POINTS_FORMAT) {
            if (state.developments.some(item => !item.initiative)) return false;
            state.developments.forEach(eventPointWire);
        }
        return true;
    } catch { return false; }
}

export function validateCampaign(value, { eventFormat = false } = {}) {
    // An omitted retirement list is unambiguously no destructive operation.
    // Normalize only absence, never null, malformed lists or missing designs.
    let normalized = value && typeof value === 'object' && !Array.isArray(value) && !Object.hasOwn(value, 'retire')
        ? { ...value, retire: [] } : value;
    if (eventFormat && Array.isArray(normalized?.developments)) normalized = { ...normalized,
        developments: normalized.developments.map(item => item && typeof item.premise === 'string'
            ? { ...item, premise: eventPoints(JSON.parse(item.premise)) } : item) };
    check(normalized, eventFormat ? EVENT_STATE_SCHEMA : CAMPAIGN_STATE_SCHEMA);
    const ids = [...normalized.developments, ...normalized.retire].map(d => d.id);
    if (new Set(ids).size !== ids.length) throw Error('Duplicate campaign operation id');
    return structuredClone(normalized);
}

// Source fingerprint and reference hash are supplied by the host. They are
// transaction data, never echoed by an AI or promoted to story knowledge.
export function mergeCampaign(previous, raw, { basisRevision, source, evidenceIndices, eventFormat = false }) {
    if (previous.revision !== basisRevision) throw Error('Campaign changed during planning');
    const value = validateCampaign(raw, { eventFormat }), next = structuredClone(previous);
    if (previous.episode && JSON.stringify(previous.episode) !== JSON.stringify(value.episode)) {
        next.archive.push({ episode: structuredClone(previous.episode), revision: previous.revision, source: structuredClone(previous.source) });
    }
    const items = new Map(next.developments.map(d => [d.id, d]));
    for (const retirement of value.retire) {
        if (!items.has(retirement.id) || !retirement.evidence.every(i => evidenceIndices.includes(i))) throw Error('Retirement needs an existing subject and supplied evidence');
        next.archive.push({ development: items.get(retirement.id), revision: previous.revision, retirement, source: structuredClone(source) });
        items.delete(retirement.id);
    }
    for (const d of value.developments) {
        if (items.has(d.id)) next.archive.push({ development: items.get(d.id), revision: previous.revision, replaced: true });
        items.set(d.id, d);
    }
    if (items.size > 4) throw Error('Campaign repertoire exceeds four complete subjects');
    return { ...next, revision: previous.revision + 1, campaign: value.campaign, episode: value.episode,
        developments: [...items.values()], source: structuredClone(source) };
}

export function campaignUsable(state, { chatId, referenceHash, messages, fingerprint }) {
    const s = state?.source;
    return Boolean(s && s.chatId === chatId && s.referenceHash === referenceHash && Number.isSafeInteger(s.messageCount)
        && s.messageCount >= 0 && s.messageCount <= messages.length
        && s.fingerprint === fingerprint(messages.slice(0, s.messageCount)));
}

export function campaignAuthorInstructions(state) {
    return [
        ...(Array.isArray(state?.userNotes) ? state.userNotes : []).map(note => ({
            text: typeof note?.text === 'string' ? `${note.kind ? `[${note.kind}] ` : ''}${note.text}` : '',
        })),
        ...(Array.isArray(state?.campaignInstructions) ? state.campaignInstructions : []),
    ].filter(note => typeof note?.text === 'string' && note.text.trim()).map(note => note.text);
}

function contextJson(value) {
    // Preserve decoded text exactly while preventing literal author/proposal
    // markup from prematurely closing the host's context wrapper.
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function campaignPayload(state, instructions = []) {
    const authored = instructions.filter(text => typeof text === 'string' && text.trim());
    const possible_developments = (state?.revision ? state.developments : []).flatMap(subject => {
        const entry = state.realization?.[subject.id];
        const open = entry?.playable.filter(p => !['completed', 'declined', 'transformed'].includes(entry.episodes[p.episodeId]?.status));
        if (open && !open.length) return []; // Quiet, dormant and closed subjects stay private.
        const origin = subject.initiative ? { source: subject.initiative.owner } : {};
        const selected = open?.filter(p => p.direction) || [];
        if (selected.length) return selected.map(p => ({ ...origin, ...storyMaterial(p) }));
        // Transitional substance, not old scene scripts or instruction wrappers.
        // Semantic rewriting belongs to the next normal planner review, not a
        // lossy sentence filter in the formatter. Saved text stays untouched.
        return [{ ...origin, developing_conditions: subject.progression,
            possible_consequences: subject.outcomes, access: subject.access }];
    });
    if (!possible_developments.length && !authored.length) return '';
    return `<tale-fairy-context>\n${contextJson({
        ...(possible_developments.length ? { possible_developments } : {}),
        ...(authored.length ? { author_instructions: authored } : {}),
    })}\n</tale-fairy-context>`;
}

// Exact 0.14.32 serialization authenticates saved packets only. Never send it
// directly to the writer; rebuild authenticated snapshots with campaignPayload.
export function objectiveGuidancePayload(state, instructions = []) {
    if (state?.preparationFormat !== EVENT_POINTS_FORMAT) return legacyCampaignPayload(state, instructions);
    const authored = instructions.filter(text => typeof text === 'string' && text.trim());
    const development_guidance = state.developments.flatMap(subject => {
        const entry = state.realization?.[subject.id];
        const open = entry?.playable.filter(p => !['completed', 'declined', 'transformed'].includes(entry.episodes[p.episodeId]?.status));
        if (open && !open.length) return []; // Explicit quiet/closed guidance stays quiet.
        const objective = { owner: subject.initiative.owner, aim: subject.initiative.aim };
        const guidance = open?.filter(p => p.direction) || [];
        if (guidance.length) return guidance.map(p => ({ objective, when: p.when,
            direction: p.direction, middle: p.middle, future: p.future }));
        // A legacy plan remains useful immediately, without copying its staged
        // scenes or predetermined endpoints. No generated rewriting or AI call.
        return [{ objective, middle: subject.progression, stakes: subject.outcomes, participation: subject.access }];
    });
    if (!development_guidance.length && !authored.length) return '';
    return `<tale-fairy-context>\n${contextJson({
        ...(development_guidance.length ? { long_term_direction: state.campaign, development_guidance } : {}),
        ...(authored.length ? { author_instructions: authored } : {}),
    })}\n</tale-fairy-context>`;
}

// Exact historical serialization is only for authenticating saved retry
// packets. The host always rebuilds their outgoing text with campaignPayload.
export function legacyCampaignPayload(state, instructions = []) {
    const authored = instructions.filter(text => typeof text === 'string' && text.trim());
    if (!state?.revision) return authored.length ? `<tale-fairy-context>\n${contextJson({
        author_instructions: authored,
    })}\n</tale-fairy-context>` : '';
    if (state.preparationFormat === EVENT_POINTS_FORMAT) {
        // TF supplies story material, not a second writing preset. Ownership,
        // review commentary and closure metadata remain private to planning.
        const proposed_events = state.developments.filter(item => !state.realization?.[item.id]).flatMap(item => eventPointWire(item).plot_points.map(point => point.event));
        const playable_situations = playableSituations(state);
        if (!proposed_events.length && !playable_situations.length && !authored.length) return '';
        return `<tale-fairy-context>\n${contextJson({
            ...(proposed_events.length ? { proposed_events } : {}),
            ...(playable_situations.length ? { playable_situations } : {}),
            ...(authored.length ? { author_instructions: authored } : {}),
        })}\n</tale-fairy-context>`;
    }
    // Completed local scaffolding remains available to future planning and
    // inspection, but is no longer an always-injected catalogue of old hooks.
    // Legacy prototype strings remain intact until a fresh pass classifies them.
    const episode = state.episode?.status === 'finished' ? {
        subject: state.episode.subject, status: 'finished',
        application: 'This prepared episode is finished. Its completion creates no automatic successor obligation. Do not use its old leads as the default next undertaking; newer accepted play governs any continuation.',
    } : state.episode;
    return `<tale-fairy-context>\n${contextJson({
        provenance: 'Private creative guidance prepared from an earlier conversation prefix. All unmanifested content is proposed, never established history, character knowledge, or a required future. The latest conversation governs compatibility and which possibilities have already happened or been refused. Source rules and the player’s explicit statements take precedence over NPC guesses; an NPC’s uncertainty is not a limit on the player. Treat NPC explanations as provisional unless the evidence actually establishes them.',
        application: 'Use the concrete substance when it fits the ongoing RP. Let NPC initiatives and undertaken activities develop to meaningful results where no further player choice is required. When the player requests an experience, show its essential discovery, change or result in the prose; do not assume it already completed in a status panel or replace it with a recap. Independent NPC work can occur offscreen, but this supplies no unseen player actions or experiences. Preserve player ownership. Outcomes can conclude an episode without a successor obligation. These are developing possibilities across exchanges; no next action or fictional time advance is prescribed.',
        ...(state.preparationFormat === PLOT_POINTS_FORMAT ? {
            application: 'Use these proposed plot points and NPC/world objectives to support enjoyable connected events when they fit the ongoing RP. They are not scheduled scenes, required outcomes or lessons. Let characters pursue their own aims and let the surrounding situation respond. Once an activity is underway, let it produce fresh situations rather than repeatedly promising it, restating its hook or adding routine prerequisites. Give routine logistics proportionate space; linger when the player shows interest or something meaningful happens, not as a default obstacle to events. The player controls their own actions, participation and commitments; never move them or decide for them as part of a group action. Newer accepted play governs what remains relevant. Do not force immediate uptake or revive finished business. Leave events and outcomes to the unfolding RP.',
            campaign: state.campaign, current_episode: episode,
            plot_points_and_objectives: state.developments.map(plotPointWire),
        } : { campaign: state.campaign, episode_resolution: episode, developments: state.developments }),
        ...(authored.length ? { author_instruction_provenance: 'User-provided instructions retained verbatim, not AI-classified or automatically declared canon. Their stated intent takes precedence over this preparation.', author_instructions: authored } : {}),
    })}\n</tale-fairy-context>`;
}

export function campaignInput({ reference, state, messages, historical = {}, instruction = '' }, maxTokens = 14000) {
    // Keep each provided source and each retained development complete. Budget
    // selection belongs to the host; it must disclose its actual evidence window.
    const payload = { historical_evidence: historical,
        previous_preparation: { campaign: state.campaign, episode: state.episode, developments: state.developments },
        accepted_messages: messages, source_reference: reference, ...(instruction ? { explicit_instruction: instruction } : {}) };
    const prompt = JSON.stringify(payload);
    const inputTokens = estimateTokenCount(CAMPAIGN_SYSTEM + JSON.stringify(CAMPAIGN_SCHEMA) + prompt);
    if (inputTokens > maxTokens) throw Error(`Complete campaign input ${inputTokens} exceeds ${maxTokens}`);
    return { prompt, inputTokens, indices: messages.map(m => m.index) };
}

export async function campaignPass({ state, input, source, generate }) {
    // One request, including on invalid output or transport error. Last usable
    // preparation survives; a subsequent scheduled pass is a new transaction.
    const basisRevision = state.revision;
    try {
        const result = await generate(input.prompt, CAMPAIGN_SYSTEM, CAMPAIGN_SCHEMA);
        if (result.finishReason === 'length') throw Error('Truncated campaign response');
        const text = result.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        const value = JSON.parse(text);
        check(value, CAMPAIGN_SCHEMA.value);
        return { state: mergeCampaign(state, value, { basisRevision, source, evidenceIndices: input.indices }), accepted: true, result };
    } catch (error) {
        return { state, accepted: false, error: error.message };
    }
}
