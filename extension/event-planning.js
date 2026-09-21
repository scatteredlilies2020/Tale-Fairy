// One planning call; story substance, not instructions to its writer.
// V1 storage remains readable; successful reframing archives old proposals.
import { CAMPAIGN_MARKER, CAMPAIGN_SCHEMA, EVENT_INITIATIVE_SCHEMA, EVENT_POINTS_FORMAT, EVENT_POINTS_SCHEMA,
    eventPoints, eventPointWire, mergeCampaign, validateCampaign } from './campaign-planner.js?v=0.14.34';
import { compactCampaignSpeakers } from './campaign-evidence.js';
import { fitCampaignContinuity } from './campaign-continuity.js';
import { fitEvidenceProviders } from './evidence-providers.js';
import { REALIZATION_SCHEMA, REALIZATION_INSTRUCTIONS, mergeRealization, needsPlayableReview } from './undertaking-lifecycle.js?v=0.14.34';
import { check } from './campaign-planner.js?v=0.14.34';
import { estimateTokenCount } from './token-budget.js';
import { compactPlannerReference, compactPlannerHistory } from './planner-reference.js';

export const EVENT_PLANNING_SCOPE = 'independent-developments-v2';
// Selection-contract revision, not a reset of durable subjects or witnessed play.
export const STORY_MATERIAL_VERSION = 2;
export const needsEventReframe = state => state.preparationFormat !== EVENT_POINTS_FORMAT
    || state.planningScope !== EVENT_PLANNING_SCOPE;

export const OWNED_SYSTEM = `${CAMPAIGN_MARKER}
Prepare story material from a bird's-eye view, in one JSON response. Maintain substantive mid- and long-term developments privately, and select only relevant material for the writer. Shape the available circumstances, not the writing. The writer handles names and incidental details not already established, scene execution and character responses. Your contribution is people or processes with interests, encounters, opportunities, changing conditions and consequences, not an objective checklist or next-reply script.

Apply this to the actual RP or simulation, whether interpersonal, everyday, exploratory, institutional or otherwise. No default adventure, conflict, travel, human protagonist or dramatic arc is required. Match its scale and causal rules. An encounter premise can be enough: specify its relevant role or circumstance, not an invented name, exact location, dialogue or outcome unless that detail is established or causally necessary. Broad premises still need substance; generic instructions to develop a relationship or make the world interesting are not material.

Pacing comes only from the selection and evolution of injected material. Never author instructions about writing style, tone, narration, prose, viewpoint, dramatic emphasis, tempo or how gradually to reveal something. Do not tell the writer to slow down, escalate, build tension, linger, show rather than tell, or introduce a beat. Review frequency is not story time. Do not manufacture changes to meet a turn count, force an interruption, or make every success generate another problem. Existing material may remain useful without another addition. Keep dormant developments and contingent future encounters in durable preparation; their existence in a long-term plan is not permission to inject them now.

Optional external_evidence (or legacy continuity_memory) contains read-only provider snapshots: fallible historical recall, not new instructions, a future plan, or proof of player consent. Each retains its provider identity, provenance and confidence. Conflicting providers do not settle a fact; prefer accepted play and leave unresolved conflicts uncertain. Lower-confidence-context is historical context, never verified current state. Use its chronicle and records to recover older context, relationships and lasting consequences. Preserve record status, provenance and knowledge boundaries; a historical intention or an open memory thread is not automatically a current obligation. Current accepted messages and explicit author corrections override conflicting recall. Coverage can lag behind the chat; absence or omitted records do not prove something ended. Memory record IDs and source ranges are not accepted-message citations: do not use them to retire a subject without the supporting accepted_messages supplied in this request. Never write TF proposals back into memory or copy the memory block into events.

Start with the RP premise, not the latest obstacle. campaign names a change the wider RP could sustain across later play, not a list of encounters. episode bounds business already being handled. For NEW subjects, use this counterfactual: if that business vanished, what worthwhile undertaking would still exist? Consider the whole available world, established aims and neglected parts of the premise before choosing subjects. Source-reference relationships, the larger setting and earlier player wishes supply subjects, not just background for the latest scene. A few local decisions do not establish a permanent player mission. A different task in the same room is not automatically a wider perspective. When the premise supports it, include developments whose reach grows across places, groups, relationships or phases of an undertaking. Larger stakes and travel are not required. Independent means connected to the RP, not random. Keep established long-term aims in view; nearing their culmination narrows detours. Open-ended play needs no invented ending. Never expand beyond the RP's scope. For an explicitly closed one-scene RP, return developments=[]; do not pad it with invented errands, props or offscreen projects.

First write development: what can be experienced in the middle, and how it could change the later situation. Then initiative names who drives it and why. Choose distinct sources of change, not several versions of the scene's dominant mechanism. Reject a NEW subject if its main experience repeats that mechanism: an inspection cannot become the template for the whole future. Vary experiences, not just locations and owners. Not every development needs a visitor bringing a problem to the current location. NPCs can create, help, explore and achieve things without waiting for a player assignment. The wider world is not a queue of requests for the player's approval. Include what others are doing within their own reach, and what that makes possible. Difficulty is optional. Supply the activity itself, not a shopping list of supplies and permissions before anything can happen. Do not turn every success into scrutiny, rivalry or another requirement. Do not repeat the current problem in a new location.

On EVERY review, reassess the wider horizon before selecting current material. The most recent scene is evidence, not the scope of the whole plan. A long conversation in one place does not make every enduring development about that place or its present dispute. Keep independent aims and longer-running processes intact even when absent from recent messages. Relevance includes circumstances connected to those developments, not only elaborations of the latest exchange. Check existing selections too: remove premises already supplied by accepted play, spent uncertainties and routine follow-ups that merely prolong the same business; retain only their remaining substantive possibilities. Do not wait for every local loose end to close before considering other relevant material. Conversely, do not force departure, declare a scene finished, rotate subjects by quota or inject an interruption to demonstrate variety. Staying with a scene is valid when the player is pursuing it; endlessly feeding it new reasons not to end is not. Reconsider selection without erasing the private mid- and long-term plan.

Author selected material once in realization.playable; omit the optional legacy plot_points field. Connect an available premise to developing conditions and conditional consequences, rather than telling the writer what to achieve. Express uncertainty with could or may. Name an unresolved prerequisite where one is necessary; a future possibility does not need a success-versus-failure branch. Later or that afternoon does not establish a prerequisite. Do not assume any proposed event happened. Encounters and events ARE valid material; predetermined responses, incidental headcounts, ordered action sequences and guaranteed outcomes are not. Never relocate established characters, invent their intervening actions, or resolve pending scenes to make a proposal fit. Do not turn the RP into a task list. Select material for its relevance to accepted play and enduring developments, not to fill slots. A subject can stay privately prepared with playable=[] when it has no useful available circumstance beyond what accepted play already supplies. Alternatives are alternatives, not successive required encounters.

Separate applicability from enactment. An established interest, accessible place or ongoing process can make a possibility relevant before anyone accepts an offer or starts an activity. Selection supplies available material, not consent or an instruction to act now. Do not withhold every wider possibility until the player initiates it, or select only the current problem's remaining chores. Dormant means not presently useful, not merely not yet enacted. Select what is relevant over the coming stretch of play, not just what can happen in the next reply. A compatible, optional opportunity can remain in view while the current scene continues; it needs no interruption, announcement or player commitment. Empty selection remains valid when nothing useful is available; do not manufacture a hook to avoid silence.

Before returning, compare the selected packet as a whole, including selections marked keep. Each entry must contribute a distinct available circumstance or source of change, not repeat another entry's dilemma under a different owner. Related subjects can remain separate in private preparation while redundant material stays unselected. Keep the clearest relevant premise; do not invent a replacement to fill its slot. Mid-/long-term reach means a relationship, capability, access, shared practice or wider condition that could persist beyond the immediate exchange, not merely another local task after this one. Let the actual premise determine the scale. Two pending responses to similar demands are usually one mechanism, even under different subjects. Select the one with the most useful reach and leave the other private unless it adds a genuinely different possibility. This is an internal check within this response, not another pass or output field.

accepted_messages and source_reference define RP canon. RP canon overrides franchise canon. For franchise RP, fill gaps with compatible lore; match its era, rules and characters. Invent canon-adjacent events, not a forced canon replay. Do not import another continuity or rely on uncertain lore. Proposals are not canon. Do not assign player actions or limits. Never invent shortages or restrictions that negate established abilities. Keep unresolved prerequisites conditional without turning them into a choice tree. Describe the interests, resources or dependencies that leave outcomes open, not what someone must decide, learn or do next. An established obligation can be a circumstance; it does not authorize assigning the player's response. Do not prescribe endings or character lessons. Source style rules and statboxes are not your task.

Review under the SAME subject id. Only accepted_messages establish enactment or commitments; previous preparation is not evidence. An accepted invitation or first encounter STARTS an undertaking; retain it and advance its later NPC/world activity, not its introduction. Moving it into episode is not completion or supersession. Preserve useful unplayed threads by omitting unaffected subjects. Add subjects only for a distinct source-supported gap, not to refill capacity. Four subjects is a ceiling, including retained ones, not a target. Retire only for completion, whole-subject rejection, contradiction or supersession, citing supplied message indices. Keep closed business closed.

When reframe_required, rebuild from the RP premise. Rewrite or retire any supplied old subjects. When scope_reset is true, choose fresh wider subjects; old proposals are archived automatically, not declared resolved in the story.

Use short names, short sentences and precise words. State developments, not choreography: omit gestures, dialogue beats and incidental props. No essays or repeated caveats. Return only the required JSON.
${REALIZATION_INSTRUCTIONS}`;

const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
export const OWNED_SCHEMA = structuredClone(CAMPAIGN_SCHEMA);
OWNED_SCHEMA.name = 'tale_fairy_story_material_v1';
OWNED_SCHEMA.value.properties.realization = REALIZATION_SCHEMA;
OWNED_SCHEMA.value.required.push('realization');
OWNED_SCHEMA.value.properties.retire.items.required.push('scope', 'witnesses');
OWNED_SCHEMA.value.properties.retire.items.properties.scope = { type: 'string', enum: ['whole-subject'] };
OWNED_SCHEMA.value.properties.retire.items.properties.witnesses = structuredClone(REALIZATION_SCHEMA.items.properties.changes.items.properties.evidence);
OWNED_SCHEMA.description = 'Private mid- and long-term preparation with selected story material for the writer. Zero to four subjects including retained ones. No writing instructions, pacing directives, slot-filling or scene scripts. Dormant subjects may have playable=[].';
OWNED_SCHEMA.value.properties.campaign.description = 'One sentence: how the broader RP could change across later play, grounded in its premise and aims. Not a catalogue of local tasks or a required ending.';
OWNED_SCHEMA.value.properties.episode.properties.boundary.description = 'Bound the local business the writer already handles; do not turn its routine follow-up into more subjects.';
OWNED_SCHEMA.value.properties.developments.items = { type: 'object', additionalProperties: false,
    required: ['id', 'development', 'initiative', 'stakes', 'participation'],
    properties: { id: text(80), development: { ...text(2400), description: 'One sentence: a worthwhile undertaking beyond this episode that still exists if the current problem disappears; identify its playable middle and possible reach into the later RP.' },
        initiative: structuredClone(EVENT_INITIATIVE_SCHEMA), plot_points: structuredClone(EVENT_POINTS_SCHEMA), stakes: text(1600), participation: text(900) },
};
OWNED_SCHEMA.value.properties.developments.items.properties.plot_points.description = 'Legacy optional material. Omit this field in new responses; author writer material once in realization.playable.';
OWNED_SCHEMA.value.properties.developments.items.properties.plot_points.items.properties.event.description = 'Legacy private material, not writer output. Omit plot_points in new responses.';
OWNED_SCHEMA.value.properties.developments.items.properties.plot_points.items.properties.opens.description = 'A possible later NPC/world action, not a required player choice or lesson; private planning only.';

export function ownedInput({ reference, state, messages, historical = {}, playerNames = [], reviewedMessageCount = 0,
    continuity, evidence, verifiedProgress = state.realization || {},
    verifiedRetiredIds = state.archive.filter(a => a.retirement).map(a => a.development?.id), continuityTokens = 4000 }, maxTokens = 14000,
    protocol = { system: OWNED_SYSTEM, schema: OWNED_SCHEMA }) {
    const names = [...new Set(playerNames.filter(name => typeof name === 'string' && name.trim()))];
    const speakers = compactCampaignSpeakers(messages);
    const reframe = needsEventReframe(state);
    const scopeReframe = reframe && state.preparationFormat === EVENT_POINTS_FORMAT;
    const materialReview = state.storyMaterialVersion !== STORY_MATERIAL_VERSION;
    let payload = { historical_evidence: compactPlannerHistory(historical, messages),
        // Source applicability does not turn authored situations into evidence.
        // Only the cited episode ledger belongs on the accepted side of this boundary.
        accepted_progress: Object.fromEntries(Object.entries(verifiedProgress)
            .filter(([, entry]) => Object.keys(entry.episodes).length)
            .map(([id, entry]) => [id, { episodes: structuredClone(entry.episodes) }])),
        closed_subject_ids: verifiedRetiredIds,
        previous_preparation: {
            format: state.preparationFormat || 'legacy', reframe_required: reframe,
            material_review_required: materialReview,
            // Old wording is an anchoring template, not evidence. Reconstruct
            // selections from canon and durable aims; retain episode identity.
            ...(materialReview && !reframe ? {
                material_review_episode_ids: Object.fromEntries(Object.entries(verifiedProgress)
                    .filter(([, entry]) => entry.playable.length)
                    .map(([id, entry]) => [id, entry.playable.map(p => p.episodeId)])),
                material_review_reason: 'Previous selected prose is withheld to avoid copying an outdated contract. Re-select open circumstances from accepted play and the retained mid-/long-term aims. Private preparation is a proposal, not a template or witnessed outcome. Preserve episode identity where appropriate; related subjects need not all be selected.',
            } : {}),
            ...(!reframe ? { playable: Object.fromEntries(Object.entries(verifiedProgress)
                .map(([id, entry]) => [id, materialReview ? [] : structuredClone(entry.playable.filter(p => p.direction))])) } : {}),
            ...(!reframe ? { legacy_guidance_episode_ids: Object.fromEntries(Object.entries(verifiedProgress)
                .filter(([, entry]) => entry.playable.some(p => !p.direction))
                .map(([id, entry]) => [id, entry.playable.filter(p => !p.direction).map(p => p.episodeId)])) } : {}),
            ...(scopeReframe ? { scope_reset: true, reframe_reason: 'Rebuild at the full RP scope with branch-safe developments, not a catalogue of local tasks. Old proposals are excluded to avoid anchoring; accepted play and the RP premise supply continuity.' } : {}),
            retained_subject_ids: scopeReframe ? [] : state.developments.map(item => item.id),
            playable_review_required_ids: scopeReframe ? [] : state.developments.filter(item => needsPlayableReview(state.realization?.[item.id])
                || state.storyMaterialVersion !== STORY_MATERIAL_VERSION && state.realization?.[item.id]?.playable.length).map(item => item.id),
            selection_review_required_ids: scopeReframe ? [] : state.developments
                .filter(item => verifiedProgress[item.id]?.playable.length).map(item => item.id),
            available_new_subject_slots: scopeReframe ? 4 : Math.max(0, 4 - state.developments.length),
            ...(!reframe ? { campaign: state.campaign, episode: state.episode, review_scope: {
                accepted_before: reviewedMessageCount,
                newly_reviewed_indices: messages.filter(message => message.index >= reviewedMessageCount).map(message => message.index),
                instruction: 'Review the wider horizon and all current selections, not just the latest scene. Widen or consolidate episode-only subjects; retain independent mid- and long-term directions even when absent from recent messages. Remove spent premises and completed portions without retiring the wider subject or inventing a scene change. Explicitly keep, revise or withdraw every selection_review_required_id; omission preserves dormant preparation only. No novelty quota. A passing mention does not justify a rewrite. At boundary zero, reconcile against all supplied source.',
            } } : {}),
            // Old essay-length drafts are deliberately not the writing template
            // for the one-time reframe. Preserve ownership/objectives (or the
            // full legacy record when no initiative was ever established).
            // A scope upgrade deliberately excludes the old local drafts as an
            // anchor. Their complete records remain stored until an atomic pass
            // replaces and archives them. Even topical ids can anchor the model.
            developments: scopeReframe ? []
                : reframe ? state.developments.map(item => item.initiative
                ? { id: item.id, previous_objective: structuredClone(item.initiative) } : structuredClone(item))
                : state.developments.map(item => {
                    const wire = eventPointWire(item);
                    if (state.realization?.[item.id]) delete wire.plot_points;
                    return wire;
                }),
        },
        ...(Object.keys(speakers.defaults).length ? { default_speaker_name_by_role: speakers.defaults } : {}),
        accepted_messages: speakers.messages, source_reference: compactPlannerReference(reference),
        player_control: { names, scope: 'Only the player supplies these characters deliberate choices and participation.' } };
    if (protocol.project) payload = protocol.project(payload);
    // JSON ends with a delimiter, so the estimator is additive here. Avoid
    // re-tokenizing the same system/schema for each optional memory candidate.
    const protocolTokens = estimateTokenCount(protocol.system + JSON.stringify(protocol.schema));
    const measure = value => protocolTokens + estimateTokenCount(JSON.stringify(value));
    const external = fitEvidenceProviders(evidence, continuityTokens,
        value => measure({ ...payload, external_evidence: value }) <= maxTokens);
    if (external.length) payload.external_evidence = external;
    const memory = fitCampaignContinuity(evidence ? null : continuity, continuityTokens,
        value => measure({ ...payload, continuity_memory: value }) <= maxTokens);
    if (memory) payload.continuity_memory = memory;
    const prompt = JSON.stringify(payload);
    const inputTokens = measure(payload);
    if (inputTokens > maxTokens) {
        const referenceTokens = estimateTokenCount(JSON.stringify(payload.source_reference));
        const messageTokens = estimateTokenCount(JSON.stringify(payload.accepted_messages));
        throw Error(`Planner input ${inputTokens} exceeds ${maxTokens} tokens (lore/card ${referenceTokens}; messages ${messageTokens}). Reduce source size or raise the input ceiling.`);
    }
    return { prompt, inputTokens, lifecycleRequired: true, verifiedRetiredIds: [...verifiedRetiredIds], verifiedProgress: structuredClone(verifiedProgress), evidenceMessages: structuredClone(messages),
        evidence: { status: external.length ? 'included' : 'omitted-or-unavailable', providers: external.map(e => e.provider) }, indices: messages.map(message => message.index), playerNames: names,
        continuity: { status: memory ? 'included' : continuity?.status === 'current' ? 'omitted-budget-or-empty' : continuity?.status || 'unavailable',
            ...(memory ? { revision: memory.revision, records: memory.records.length, summary: Boolean(memory.summary),
                omittedRecords: memory.omittedRecords, omittedSummary: memory.omittedSummary } : {}) } };
}

export function decodeOwnedResult(raw, playerNames = []) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.developments)) throw Error('Event response requires developments');
    const fields = OWNED_SCHEMA.value.properties.developments.items.required;
    const allowed = Object.keys(OWNED_SCHEMA.value.properties.developments.items.properties);
    const names = new Set(playerNames.map(name => name.trim().toLocaleLowerCase()));
    const developments = raw.developments.map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)
            || fields.some(key => !Object.hasOwn(item, key))
            || Object.keys(item).some(key => !allowed.includes(key) && item[key] !== '' && item[key] !== null)) throw Error('Event subject requires its declared fields');
        if (typeof item.initiative?.owner === 'string' && names.has(item.initiative.owner.trim().toLocaleLowerCase())) throw Error('Player cannot own a planned initiative');
        return { id: item.id, initiative: item.initiative, premise: eventPoints(item.plot_points === undefined ? [{ event: 'Writer material is maintained in realization.playable.', opens: item.development }] : item.plot_points),
            progression: item.development, outcomes: item.stakes, access: item.participation };
    });
    const { realization, ...campaign } = raw;
    if (Object.hasOwn(raw, 'retire') && !Array.isArray(raw.retire)) throw Error('Invalid retirement list');
    campaign.retire = (raw.retire || []).map(({ scope, witnesses, ...retirement }) => retirement);
    if (realization !== undefined) check(realization, REALIZATION_SCHEMA, '$.realization');
    return { ...validateCampaign({ ...campaign, developments }, { eventFormat: true }), ...(realization !== undefined ? { realization } : {}) };
}

export async function ownedPass({ state, input, source, generate }) {
    try {
        const result = await generate(input.prompt, OWNED_SYSTEM, OWNED_SCHEMA);
        if (['length', 'max_tokens', 'max_output_tokens'].includes(String(result.finishReason).toLowerCase())) throw Error('Truncated event opportunity response');
        const decoded = JSON.parse(result.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
        if (input.lifecycleRequired) {
            for (const retirement of decoded.retire || []) {
                check(retirement, OWNED_SCHEMA.value.properties.retire.items, '$.retire');
                if (!retirement.witnesses.every(e => retirement.evidence.includes(e.index)
                    && input.evidenceMessages?.some(m => m.index === e.index && m.content.includes(e.quote)))) {
                    throw Error('Whole-subject retirement requires exact supplied witnesses');
                }
            }
        }
        const value = decodeOwnedResult(decoded, input.playerNames);
        const changed = new Set([...value.developments, ...value.retire].map(item => item.id));
        const scopeReset = needsEventReframe(state) && state.preparationFormat === EVENT_POINTS_FORMAT;
        if (!scopeReset && needsEventReframe(state) && state.developments.some(item => !changed.has(item.id))) throw Error('First event review must reframe every retained subject');
        const base = scopeReset ? { ...state, developments: [], archive: [...state.archive,
            ...state.developments.map(development => ({ development: structuredClone(development), revision: state.revision, scopeReframe: true }))] } : state;
        const { realization, ...campaign } = value;
        if (input.lifecycleRequired && !realization) throw Error('Response requires a playable realization review');
        const retired = new Set(input.verifiedRetiredIds ?? base.archive.filter(a => a.retirement).map(a => a.development?.id));
        if (campaign.developments.some(d => retired.has(d.id))) throw Error('Retired subjects cannot restart under a closed id');
        const next = mergeCampaign(base, campaign, { basisRevision: state.revision, source, evidenceIndices: input.indices, eventFormat: true });
        const retiring = new Set(campaign.retire.map(entry => entry.id));
        if (realization?.some(entry => retiring.has(entry.id) && (entry.selection || entry.playable?.length))) {
            throw Error('Retiring subjects cannot retain selected material');
        }
        const warnings = [];
        const previousRealization = input.verifiedProgress ?? base.realization;
        if (realization) next.realization = mergeRealization(previousRealization, realization, {
            // A final witnessed event and whole-subject retirement are one atomic
            // operation. Closure removes the aim, not its last accepted evidence.
            subjects: [...next.developments.map(d => d.id), ...retiring], playerNames: input.playerNames,
            messages: input.evidenceMessages, source,
            onDiscardedWitness: warning => warnings.push(warning),
            // A normal pass must decide the fate of every existing selection.
            // Keeping useful current material needs no duplicate authorship;
            // new and pre-upgrade material needs an explicit playable array.
            // Omitted current selections are withheld, not silently carried on.
            requireAll: input.lifecycleRequired ? next.developments
                .filter(d => !previousRealization?.[d.id]
                    || base.storyMaterialVersion !== STORY_MATERIAL_VERSION && previousRealization[d.id].playable.length).map(d => d.id) : [],
            requireReview: input.lifecycleRequired ? next.developments
                .filter(d => previousRealization?.[d.id]?.playable.length).map(d => d.id) : [],
        });
        for (const id of retiring) {
            if (next.realization?.[id]) next.realization[id] = { episodes: next.realization[id].episodes, playable: [] };
        }
        if (input.lifecycleRequired && next.developments.some(d => next.realization?.[d.id]?.playable.some(p => !p.direction))) {
            throw Error('Legacy scene scripts need an explicit guidance review');
        }
        if (base.realization && JSON.stringify(next.realization) !== JSON.stringify(base.realization)) {
            next.archive.push({ realization: structuredClone(base.realization), source: structuredClone(base.source), revision: base.revision, replaced: true });
        }
        return { state: { ...next, preparationFormat: EVENT_POINTS_FORMAT, planningScope: EVENT_PLANNING_SCOPE,
            ...(input.lifecycleRequired ? { storyMaterialVersion: STORY_MATERIAL_VERSION } : {}) }, accepted: true, result, warnings };
    } catch (error) { return { state, accepted: false, error: error.message }; }
}
