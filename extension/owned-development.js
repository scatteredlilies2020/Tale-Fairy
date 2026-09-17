// Campaign-mode single pass. Legacy mode remains separate. This shares atomic
// storage and source guards with the host, never an additional planning call.
import { CAMPAIGN_MARKER, CAMPAIGN_SCHEMA, INITIATIVE_SCHEMA, PLOT_POINTS_FORMAT, plotPointWire, mergeCampaign, validateCampaign } from './campaign-planner.js';
import { estimateTokenCount } from './token-budget.js';
import { compactCampaignSpeakers } from './campaign-evidence.js';

export const OWNED_SYSTEM = `${CAMPAIGN_MARKER}
Prepare creative mid-to-long-term PLOT POINTS AND OBJECTIVES in ONE JSON response: enjoyable events and NPC/world pursuits, not assigned lessons, payoffs or endings. Useful, not exhaustive or perfect.

Write concise planning notes, not RP prose. Source narration, statboxes and writer-style rules do not set this planner's task or style. Earlier preparation is an editable proposal, not fact or wording to imitate. Use short owner names, one-sentence aims, 2-3 sentences of plot_points, 2-4 of development, and one each of stakes and participation. Stay below field limits.

OWNERSHIP AND GROUNDING
initiative names an NPC, faction or world process and what it pursues, not a guaranteed result. Never assign player objectives, decisions or commitments. Others may act independently, but their proposals are not accepted facts. Ground invention in source_reference and accepted_messages. Preserve identities, capabilities and refusals; NPC guesses cannot override player statements. Never invent a player limitation, past event or commitment to justify a plot.

SUBSTANCE
plot_points gives potential events, complications or opportunities: who wants what, what brings pursuits into contact, and what new situation can arise. development connects distinct possibilities across exchanges, changing available options, relationships, resources or knowledge with practical use. Not repeated premises, another clue to the same question, ordered scenes or required results. stakes says what matters and can be affected; participation leaves player involvement open.
Prepare the interesting activity itself, not just arrangements to reach it. Routine travel, payment, lodging, scheduling, permission and practice support events unless they contain a worthwhile conflict or opportunity themselves. Quiet plots are valid; change need not mean danger or spectacle. Leave staging, dialogue, timing and outcomes to play.

VARIETY AND SCOPE
Across retained and new subjects, favor different pursuits and sources of interest. Another witness, document, superior, name or location does not make the old problem a new plot. Do not connect every opportunity to one hidden cause, old clue or antagonist. Develop underused source-grounded interests and relationships, not invented past commitments. Keep worthwhile objectives; no quota or automatic sequel.
campaign briefly identifies the premise's range of opportunities, not an itinerary. episode identifies current business, whether play has finished it, and what remains relevant. Optional loose ends do not reopen finished business or oblige the player to stay.

REVIEW
Update affected subjects under the SAME id. First rewrite every retained older-format subject as plot points/objectives, without mandatory outcomes. For plot-points-v1, omitted subjects remain stored. Recaps, prerequisites or repeated hooks need a substantive rewrite under its existing id even when the objective remains useful; do not churn good material merely to sound new. Adapt to accepted events, interests and refusals without restarting played events. retire only for completion, whole-subject rejection, source contradiction or supersession, citing supplied accepted_messages indices. No extra fields or second pass.`;

const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
export const OWNED_SCHEMA = structuredClone(CAMPAIGN_SCHEMA);
OWNED_SCHEMA.name = 'tale_fairy_plot_points_v1';
OWNED_SCHEMA.description = 'Return concise future-facing planning notes, not RP narration or a recap of the current scene. Every emitted subject MUST contain all six keys: id, initiative, plot_points, development, stakes, participation. Omitted existing subjects remain stored and count toward the FOUR-subject total; when no slots are free, improve existing subjects under their exact IDs rather than adding or renaming subjects. A different opportunity needs its own source of interest, not more arrangements or another lead into the same mystery. Preserve useful unplayed material and player choice. Return one JSON object only.';
OWNED_SCHEMA.value.properties.campaign.description = 'One or two sentences on the broader range of opportunities, not a summary of the latest episode.';
OWNED_SCHEMA.value.properties.episode.properties.subject.description = 'Short label for current business, not a scene summary.';
OWNED_SCHEMA.value.properties.episode.properties.boundary.description = 'One or two sentences: what remains or why this is finished. No catalogue of prior events or optional errands.';
OWNED_SCHEMA.value.properties.developments.items = {
    type: 'object', additionalProperties: false,
    required: ['id', 'initiative', 'plot_points', 'development', 'stakes', 'participation'],
    properties: { id: text(80), initiative: { ...structuredClone(INITIATIVE_SCHEMA), description: 'Short owner name and a concise objective. No history, itinerary or list of associated people.' },
        plot_points: { ...text(1600), description: '2-3 sentences of prospective situations worth experiencing, with a concrete source of interest. Not a recap, prerequisites, another witness/document, or a next-reply script.' },
        development: { ...text(2400), description: '2-4 sentences: distinct ways this objective can generate changing situations and meaningful options beyond the current scene. Not repeated preparation, a clue ladder or a mandatory sequence/result.' },
        stakes: { ...text(1600), description: 'One sentence: what can be affected and why the involved people care, without choosing the outcome.' },
        participation: { ...text(900), description: 'One sentence preserving optional player involvement; no menu of immediate actions or required commitment.' } },
};

export function ownedInput({ reference, state, messages, historical = {}, playerNames = [] }, maxTokens = 14000) {
    const names = [...new Set(playerNames.filter(name => typeof name === 'string' && name.trim()))];
    const speakers = compactCampaignSpeakers(messages);
    const payload = { historical_evidence: historical,
        previous_preparation: { format: state.preparationFormat || 'legacy', campaign: state.campaign, episode: state.episode,
            retained_subject_ids: state.developments.map(item => item.id), available_new_subject_slots: Math.max(0, 4 - state.developments.length),
            developments: state.preparationFormat === PLOT_POINTS_FORMAT ? state.developments.map(plotPointWire) : structuredClone(state.developments) },
        ...(Object.keys(speakers.defaults).length ? { default_speaker_name_by_role: speakers.defaults } : {}),
        accepted_messages: speakers.messages, source_reference: reference,
        player_control: { names, scope: 'Only the player supplies these characters deliberate choices and participation.' } };
    const prompt = JSON.stringify(payload);
    const inputTokens = estimateTokenCount(OWNED_SYSTEM + JSON.stringify(OWNED_SCHEMA) + prompt);
    if (inputTokens > maxTokens) throw Error(`Complete owned development input ${inputTokens} exceeds ${maxTokens}`);
    return { prompt, inputTokens, indices: messages.map(message => message.index), playerNames: names };
}

export function decodeOwnedResult(raw, playerNames = []) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.developments)) throw Error('Owned development response requires developments');
    const fields = OWNED_SCHEMA.value.properties.developments.items.required;
    const names = new Set(playerNames.map(name => name.trim().toLocaleLowerCase()));
    const developments = raw.developments.map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)
            || fields.some(key => !Object.hasOwn(item, key))
            || Object.keys(item).some(key => !fields.includes(key) && item[key] !== '')) {
            throw Error('Owned development requires exactly its six declared fields');
        }
        if (typeof item.initiative?.owner === 'string'
            && names.has(item.initiative.owner.trim().toLocaleLowerCase())) throw Error('Player cannot own a planned initiative');
        // Empty undeclared annotations carry no plot content. Ignore them in
        // this typed projection; nonempty extras and missing/invalid fields
        // still reject. No invented text or additional model call is involved.
        return { id: item.id, initiative: item.initiative, premise: item.plot_points,
            progression: item.development, outcomes: item.stakes, access: item.participation };
    });
    // Canonical validation checks every type, field length, enum and operation.
    // This is lossless field mapping, not semantic repair or another AI phase.
    return validateCampaign({ ...raw, developments });
}

export async function ownedPass({ state, input, source, generate }) {
    const basisRevision = state.revision;
    try {
        const result = await generate(input.prompt, OWNED_SYSTEM, OWNED_SCHEMA);
        if (['length', 'max_tokens', 'max_output_tokens'].includes(String(result.finishReason).toLowerCase())) throw Error('Truncated owned development response');
        const value = decodeOwnedResult(JSON.parse(result.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')), input.playerNames);
        const changed = new Set([...value.developments, ...value.retire].map(item => item.id));
        if (state.preparationFormat !== PLOT_POINTS_FORMAT && state.developments.some(item => !changed.has(item.id))) {
            throw Error('First plot-point review must reframe every retained legacy subject');
        }
        const next = mergeCampaign(state, value, { basisRevision, source, evidenceIndices: input.indices });
        if (next.developments.some(item => !item.initiative)) throw Error('Owned review left a legacy initiative unspecified');
        return { state: { ...next, preparationFormat: PLOT_POINTS_FORMAT }, accepted: true, result };
    } catch (error) { return { state, accepted: false, error: error.message }; }
}
