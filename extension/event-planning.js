// One planning call; concrete opportunities, not a next-reply director.
// V1 storage remains readable; successful reframing archives old proposals.
import { CAMPAIGN_MARKER, CAMPAIGN_SCHEMA, EVENT_INITIATIVE_SCHEMA, EVENT_POINTS_FORMAT, EVENT_POINTS_SCHEMA,
    eventPoints, eventPointWire, mergeCampaign, validateCampaign } from './campaign-planner.js';
import { compactCampaignSpeakers } from './campaign-evidence.js';
import { estimateTokenCount } from './token-budget.js';

export const OWNED_SYSTEM = `${CAMPAIGN_MARKER}
Plan mid-to-long-term events for this RP in one JSON response.

Fit this RP's genre, scale and current activity. Anchor campaign in its premise, not the latest problem. Keep local business in episode; prepare events beyond it. Follow its larger objective when present. Scale events to progress, not reply count. Link events when useful; keep unrelated threads independent. Do not invent a final objective for an open-ended simulation. Quiet events count; escalation is not required.

Name an external action or encounter that changes the situation. Exclude intentions and recaps. Tie relevance to circumstances, not the next reply. Events may form a loose sequence, not a fixed itinerary. Combine steps of one encounter; do not fill slots with gestures or props given goals. Skip exact dialogue.

Each subject: initiative names an NPC/world owner and goal. plot_points contains one event/opens pair; add a second only for a later phase. Only event reaches the writer: include the encounter itself, not just its setup. opens names a possible later NPC/world action, not a player dilemma. Do not direct prose, pacing or player handling. development covers the longer direction; stakes says why it matters; participation gives possible access. campaign is the overall direction; episode bounds current business.

accepted_messages and source_reference define RP canon. RP canon overrides franchise canon. For franchise RP, fill gaps with compatible lore; match its era, rules and characters. Invent canon-adjacent events, not a forced canon replay. Do not import another continuity or rely on uncertain lore. Proposals are not canon. Do not assign player actions or limits. Never invent shortages or restrictions that negate established abilities. Pending outcomes require conditional branches. Do not prescribe endings or character lessons. Source style rules and statboxes are not your task.

Review changes under the SAME subject id. Only accepted_messages establish enactment or commitments; previous preparation is not evidence, including development. Move enacted events into development; replace them with unplayed consequences, not recaps. Preserve useful unplayed events. Omit unaffected subjects; they remain stored. Four subjects is a ceiling, including retained ones, not a target. A bounded scene may need one or none. Do not absorb every thread into the latest problem. Retire only for completion, whole-subject rejection, contradiction or supersession, citing supplied message indices. Keep closed business closed.

When reframe_required, rewrite or retire every old subject. Preserve useful goals; consolidate overlap under an existing id. Prior text is archived.

Use short names and one sentence per text field. Choose precise words. No repeated caveats or lists of synonyms. Return only the required JSON.`;

const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
export const OWNED_SCHEMA = structuredClone(CAMPAIGN_SCHEMA);
OWNED_SCHEMA.name = 'tale_fairy_event_opportunities_v1';
OWNED_SCHEMA.description = 'Each subject requires id, initiative, plot_points, development, stakes, participation. Zero to four subjects total, including retained ones; do not fill unused slots.';
OWNED_SCHEMA.value.properties.developments.items = { type: 'object', additionalProperties: false,
    required: ['id', 'initiative', 'plot_points', 'development', 'stakes', 'participation'],
    properties: { id: text(80), initiative: structuredClone(EVENT_INITIATIVE_SCHEMA),
        plot_points: structuredClone(EVENT_POINTS_SCHEMA), development: text(2400), stakes: text(1600), participation: text(900) },
};
OWNED_SCHEMA.value.properties.developments.items.properties.plot_points.items.properties.event.description = 'An unplayed, externally observable action or encounter that changes the situation; never a recap of accepted play.';
OWNED_SCHEMA.value.properties.developments.items.properties.plot_points.items.properties.opens.description = 'A possible later NPC/world action, not a required player choice or lesson; private planning only.';

export function ownedInput({ reference, state, messages, historical = {}, playerNames = [], reviewedMessageCount = 0 }, maxTokens = 14000) {
    const names = [...new Set(playerNames.filter(name => typeof name === 'string' && name.trim()))];
    const speakers = compactCampaignSpeakers(messages);
    const reframe = state.preparationFormat !== EVENT_POINTS_FORMAT;
    const payload = { historical_evidence: historical,
        previous_preparation: {
            format: state.preparationFormat || 'legacy', reframe_required: reframe,
            retained_subject_ids: state.developments.map(item => item.id),
            available_new_subject_slots: Math.max(0, 4 - state.developments.length),
            ...(!reframe ? { campaign: state.campaign, episode: state.episode, review_scope: {
                accepted_before: reviewedMessageCount,
                newly_reviewed_indices: messages.filter(message => message.index >= reviewedMessageCount).map(message => message.index),
                instruction: 'Review new messages. Move enacted events to development; event contains only unplayed material. Preserve unaffected subjects and unplayed events. A passing mention does not justify a rewrite. At boundary zero, reconcile against all supplied source.',
            } } : {}),
            // Old essay-length drafts are deliberately not the writing template
            // for the one-time reframe. Preserve ownership/objectives (or the
            // full legacy record when no initiative was ever established).
            developments: reframe ? state.developments.map(item => item.initiative
                ? { id: item.id, previous_objective: structuredClone(item.initiative) } : structuredClone(item))
                : state.developments.map(eventPointWire),
        },
        ...(Object.keys(speakers.defaults).length ? { default_speaker_name_by_role: speakers.defaults } : {}),
        accepted_messages: speakers.messages, source_reference: reference,
        player_control: { names, scope: 'Only the player supplies these characters deliberate choices and participation.' } };
    const prompt = JSON.stringify(payload);
    const inputTokens = estimateTokenCount(OWNED_SYSTEM + JSON.stringify(OWNED_SCHEMA) + prompt);
    if (inputTokens > maxTokens) throw Error(`Complete event opportunity input ${inputTokens} exceeds ${maxTokens}`);
    return { prompt, inputTokens, indices: messages.map(message => message.index), playerNames: names };
}

export function decodeOwnedResult(raw, playerNames = []) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.developments)) throw Error('Event response requires developments');
    const fields = OWNED_SCHEMA.value.properties.developments.items.required;
    const names = new Set(playerNames.map(name => name.trim().toLocaleLowerCase()));
    const developments = raw.developments.map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)
            || fields.some(key => !Object.hasOwn(item, key))
            || Object.keys(item).some(key => !fields.includes(key) && item[key] !== '' && item[key] !== null)) throw Error('Event subject requires its six declared fields');
        if (typeof item.initiative?.owner === 'string' && names.has(item.initiative.owner.trim().toLocaleLowerCase())) throw Error('Player cannot own a planned initiative');
        return { id: item.id, initiative: item.initiative, premise: eventPoints(item.plot_points),
            progression: item.development, outcomes: item.stakes, access: item.participation };
    });
    return validateCampaign({ ...raw, developments }, { eventFormat: true });
}

export async function ownedPass({ state, input, source, generate }) {
    try {
        const result = await generate(input.prompt, OWNED_SYSTEM, OWNED_SCHEMA);
        if (['length', 'max_tokens', 'max_output_tokens'].includes(String(result.finishReason).toLowerCase())) throw Error('Truncated event opportunity response');
        const value = decodeOwnedResult(JSON.parse(result.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')), input.playerNames);
        const changed = new Set([...value.developments, ...value.retire].map(item => item.id));
        if (state.preparationFormat !== EVENT_POINTS_FORMAT && state.developments.some(item => !changed.has(item.id))) throw Error('First event review must reframe every retained subject');
        const next = mergeCampaign(state, value, { basisRevision: state.revision, source, evidenceIndices: input.indices, eventFormat: true });
        return { state: { ...next, preparationFormat: EVENT_POINTS_FORMAT }, accepted: true, result };
    } catch (error) { return { state, accepted: false, error: error.message }; }
}
