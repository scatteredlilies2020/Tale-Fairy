// One planning call; concrete opportunities, not a next-reply director.
// V1 storage remains readable; successful reframing archives old proposals.
import { CAMPAIGN_MARKER, CAMPAIGN_SCHEMA, EVENT_INITIATIVE_SCHEMA, EVENT_POINTS_FORMAT, EVENT_POINTS_SCHEMA,
    eventPoints, eventPointWire, mergeCampaign, validateCampaign } from './campaign-planner.js';
import { compactCampaignSpeakers } from './campaign-evidence.js';
import { estimateTokenCount } from './token-budget.js';

export const OWNED_SYSTEM = `${CAMPAIGN_MARKER}
Invent worthwhile mid-to-long-term EVENT OPPORTUNITIES and NPC/world objectives for this RP, in one JSON response. Your contribution is things that could happen and matter, not a recap, a next-reply script or a prescribed ending. Build around ongoing pursuits and conditions so opportunities remain useful after several replies, not only at the current hour or stall.

For each subject, initiative names who pursues what. plot_points contains one or two concrete future event opportunities. Each event describes a prospective change in the situation: someone acts, pursuits meet, a discovery becomes useful, a shared activity takes an unexpected form, or conditions change what people can do. Each opens describes interesting choices or further situations this could make possible, not the outcome the writer must deliver. These are alternatives and possibilities, not an ordered checklist. development connects the objective to further play beyond those examples; stakes and participation are brief.

Be definite about the imagined circumstances: the whole packet is already a proposal, so do not replace its substance with permission questions. Events are externally observable situations people can engage with, not private realizations, tentative gestures, or preparation for an interaction that never arrives. opens supplies concrete follow-on material, not a list of questions about whether people take part. Include enjoyment, recognition, successes and compatible pursuits where they fit; worthwhile events need not all be setbacks or financial problems. On review, replace old micro-cues and abstract questions with playable situations while preserving their useful objectives.

Make the events themselves worth experiencing. Preparing to do something, asking for another demonstration, finding another document or arranging another appointment is not a substitute. Draw on the broader story's people, activities and possibilities, not only the latest local puzzle. Different subjects need different sources of interest, not one mystery with extra branches. A subject should still offer worthwhile events if the current mystery is never pursued. Do not connect an independent event back to that mystery just to ground it. Quiet everyday developments are welcome; no compulsory danger, novelty quota or escalation.

Use accepted_messages and source_reference for facts, capabilities and player choices. Invent future possibilities freely within them, never retroactive facts or player limitations. Existing objectives and old proposals are not canon. Writer-style instructions and statboxes are source material, not this planner's task. Never decide the player's actions, participation, beliefs or commitments. Do not build on an unplayed outcome of a pending player action; make that branch conditional. NPC aims may succeed, change or fail through play. Leave exact timing, dialogue, outcomes and endings open; no immediate uptake or required character lesson.

Review: update a subject under its SAME id when its opportunities have been played, refused, contradicted or need improvement. Useful unplayed opportunities may remain unchanged. Omitted subjects remain stored and count toward four total. When input says reframe_required, rewrite every retained subject from source; prior objectives are draft aims, not immutable assignments. Keep useful pursuits but broaden overly narrow methods and consolidate overlapping subjects under one existing ID, retiring the superseded ID and retaining its worthwhile material in the combined subject. This can leave room for source-supported interests outside the current problem. Old prose is archived, not silently relabeled. Retire only for completion, whole-subject rejection, contradiction or supersession, citing supplied message indices supporting that judgment. No automatic sequel to closed business.

Write concise notes, not RP prose: short owner names, one-sentence aims, compact event/opens pairs, a few sentences of development, one each of stakes and participation. campaign is the broader opportunity range; episode is current business and its boundary, not a history summary. Return only the requested JSON. No extra pass.`;

const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
export const OWNED_SCHEMA = structuredClone(CAMPAIGN_SCHEMA);
OWNED_SCHEMA.name = 'tale_fairy_event_opportunities_v1';
OWNED_SCHEMA.description = 'Return all six keys for every emitted subject: id, initiative, plot_points, development, stakes, participation. plot_points is an array of event/opens objects, not prose about the current scene. Each event must be prospective plot material; opens is potential, not a mandated outcome. Keep omitted existing subjects in mind: four total after updates/retirements, not four new subjects.';
OWNED_SCHEMA.value.properties.developments.items = { type: 'object', additionalProperties: false,
    required: ['id', 'initiative', 'plot_points', 'development', 'stakes', 'participation'],
    properties: { id: text(80), initiative: structuredClone(EVENT_INITIATIVE_SCHEMA),
        plot_points: structuredClone(EVENT_POINTS_SCHEMA), development: text(2400), stakes: text(1600), participation: text(900) },
};
OWNED_SCHEMA.value.properties.developments.items.properties.plot_points.items.properties.event.description = 'Use 1–2 concise sentences: a prospective, externally observable situation or interaction worth experiencing; not a private insight, tentative gesture, recap or routine arrangement.';
OWNED_SCHEMA.value.properties.developments.items.properties.plot_points.items.properties.opens.description = 'Use 1–2 concise sentences: concrete further interactions, opportunities or complications this can support; not whether-questions or a prescribed lesson/ending.';

export function ownedInput({ reference, state, messages, historical = {}, playerNames = [], reviewedMessageCount = 0 }, maxTokens = 14000) {
    const names = [...new Set(playerNames.filter(name => typeof name === 'string' && name.trim()))];
    const speakers = compactCampaignSpeakers(messages);
    const reframe = state.preparationFormat !== EVENT_POINTS_FORMAT;
    const payload = { historical_evidence: historical,
        previous_preparation: {
            format: state.preparationFormat || 'legacy', reframe_required: reframe,
            retained_subject_ids: state.developments.map(item => item.id),
            available_new_subject_slots: Math.max(0, 4 - state.developments.length),
            ...(!reframe ? { review_scope: {
                accepted_before: reviewedMessageCount,
                newly_reviewed_indices: messages.filter(message => message.index >= reviewedMessageCount).map(message => message.index),
                instruction: 'Review changes since this boundary, not every subject from scratch. Omit unaffected subjects: their full opportunities remain stored. A new mention of a place, person or problem does not itself justify rewriting an independent interest around it. For an affected subject, preserve its broader objective and useful unplayed opportunities; replace what actually changed. Do not turn an independent pursuit into another branch of the current mystery. If the boundary is zero, reconcile against the supplied source instead.',
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
