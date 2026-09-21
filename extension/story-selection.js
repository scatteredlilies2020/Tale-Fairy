// One provider response: shared story material + private preparation + witnessed progress.
// The established subject/evidence transaction remains the storage authority.
import { ownedInput, ownedPass, OWNED_SCHEMA, needsEventReframe } from './event-planning.js?v=0.14.34&planner-input=1&token-budget=1&rp-plot=1&response=2&history-budget=1';
import { CAMPAIGN_MARKER, EVENT_POINTS_FORMAT, check } from './campaign-planner.js?v=0.14.34&rp-plot=1';
import { REALIZATION_SCHEMA } from './undertaking-lifecycle.js?v=0.14.34&response=2';
import { SELECTED_MATERIAL_SCHEMA, validateSelectedMaterial } from './selected-material.js?v=0.14.36&rp-plot=1';
import { BACKGROUND_SCHEMA, validateBackground } from './background-progress.js?v=0.14.34';
import { SPAN_WITNESS_SCHEMA, witnessMessages, resolveSpanWitnesses, reconcileSpanWitnesses } from './accepted-witnesses.js?v=0.14.34&partial-evidence=1';
import { storyInputTokens } from './story-budget.js';
import { RP_BRIEF_SCHEMA } from './rp-brief.js';
import { normalizePlannerResponse } from './planner-response.js?v=1';
import { reconcileDevelopments } from './planner-developments.js?v=1';
export { needsEventReframe };

export const STORY_SCHEMA = structuredClone(OWNED_SCHEMA);
STORY_SCHEMA.name = 'tale_fairy_rp_plot_v5';
STORY_SCHEMA.description = 'Private RP brief and preparation; optional plot material. One response, no scene script.';
const properties = STORY_SCHEMA.value.properties;
properties.campaign.description = 'The premise and its open longer-term reach. Respect an explicitly limited scope; a closed one-scene RP needs no sequel.';
properties.episode.properties.boundary.description = 'Current local circumstances and unresolved business from latest accepted play, without instructions for the writer.';
const progress = structuredClone(REALIZATION_SCHEMA);
delete progress.items.properties.playable;
delete progress.items.properties.selection;
progress.items.properties.changes.items.properties.evidence.items = structuredClone(SPAN_WITNESS_SCHEMA);
properties.retire.items.properties.witnesses.items = structuredClone(SPAN_WITNESS_SCHEMA);
progress.items.properties.id.description = 'Exact enduring subject id, NOT the finite episodeId. A retained, updated or retiring subject may receive final witnessed changes. Group changes by subject; omit unchanged progress.';
delete properties.developments.items.properties.plot_points;
const backgroundRecord = structuredClone(BACKGROUND_SCHEMA.items);
delete backgroundRecord.properties.subjectId;
backgroundRecord.required = backgroundRecord.required.filter(key => key !== 'subjectId');
properties.developments.items.properties.background = backgroundRecord;
properties.developments.items.required.push('background');
properties.developments.description = 'Update changed aims and every selected contributor with fresh background/access. Omitted aims stay private; retirement wins. At most four retained subjects.';
properties.developments.items.properties.development.description = 'A worthwhile undertaking with possibilities beyond the current problem. One sentence; no fixed arc.';
properties.developments.items.properties.initiative.properties.owner.description = 'NPC, group or world process, never the player. Support player interests without assigning participation.';
STORY_SCHEMA.value.properties = { rp_brief: RP_BRIEF_SCHEMA, campaign: properties.campaign, episode: properties.episode,
    developments: properties.developments, selected_material: SELECTED_MATERIAL_SCHEMA,
    realization: progress, retire: properties.retire };
STORY_SCHEMA.value.required.push('rp_brief', 'selected_material');

// A standalone contract: the legacy protocol is a storage adapter, not a second
// set of overlapping creative instructions for the provider to reconcile.
export const STORY_SYSTEM = `${CAMPAIGN_MARKER}
Plot from the supplied RP context in one JSON response. Prepare possibilities, not a story script. Mood, tone, pacing and prose belong to the writing preset, not any output field. Express intended effects through concrete circumstances, events, choices or consequences, never emotional labels or delivery instructions. Ignore source style rules. Use precise words; omit repetition.

RP BRIEF
Write rp_brief before planning: this RP's premise, recurring activities, source continuity, departures and emerging direction. Infer only what context supports; unknowns stay unknown. Begin in medias res, not by reconstructing missing history. Identify a source setting only when supported. For an established fictional setting, use relevant known canon as a baseline, respecting timeline and alternate premises. Accepted play and explicit user premises override incompatible canon. Let departures change future possibilities; never force a return to canonical events. Treat the previous brief as a revisable draft, not evidence. No franchise template, activity rotation, style rules or fixed destination.

PRIVATE PREPARATION
campaign states the broader possibility; episode describes current circumstances. developments updates at most four enduring subjects, not every activity. Omitted subjects stay private. Add only for a useful gap; a quiet or closed RP needs no new subject. Keep stable ids. initiative belongs to an NPC or world process, never the player. Competence permits participation, not agreement or accomplishment. Do not add permission gates or tests of established competence. Completing one experience need not retire its wider subject.
Include initiative (owner, control, aim), development, stakes and participation for each subject. Omitted durable fields on an existing id retain saved values. Every emitted subject needs fresh background and access; these are never copied from an earlier review.

background describes provisional activity, grounded in capabilities, causes and fictional time. Message count is not elapsed time. Delegation does not prove completion; unknown does not mean unfinished. Reconcile forecasts with accepted changes. Private preparation never proves events or player commitments.
access concerns a discoverable trace or opportunity, not the whole private process. State its available surface and unknowns. A known opportunity may remain accessible without a fresh update. Use none when no plausible surface can reach play. Never invent contact, travel or an interruption to create access. Contact does not reveal private motives or knowledge.

SELECTION
Assess developments and background before selected_material. Return [] or one compact packet. Rebuild it from current play, not previous selected prose. Include each contributor in developments with fresh background. Exclude inaccessible subjects from every horizon. Access permits selection; it does not require it. Every horizon stays on the discoverable surface; omit private causes, motives and knowledge.
available supplies useful circumstances or opportunities. developing and lasting are optional: include only distinct, grounded possibilities beyond the scene. Omit them rather than padding a minor activity into an arc. Several subjects may inform one circumstance; subjectIds lists every contributor but stays private.

Look beyond extending the current problem. The next undertaking can be independent, grounded in this RP's people, interests and setting. Ordinary activities and quiet enjoyment are valid. Allow rest, departure, disengagement, scene endings and completed work without another obligation. Unfinished matters need not occupy the present scene. Present supporting circumstances, never decide the player's actions or declare a time skip. No forced conflict, interruption, escalation, reconciliation or novelty quota.
Remove spent material without restarting its introduction. Supply useful story substance, not procedures, dialogue, ordered beats, assigned reactions or success/failure branches. Leave choices and outcomes open. Do not invent accomplished offers, agreements, possessions or obligations. Proposals are not canon. The writer handles execution and incidental detail.

EVIDENCE
Only accepted_messages prove enactment or player commitments. Source references supply premises; external summaries are fallible recall, not current-state authority. Respect provenance and knowledge boundaries. Current play and explicit corrections override conflicting recall. Missing recall proves neither closure nor elapsed time. Previous preparation is not evidence.
realization may be []. Record only necessary changes to existing progress: id is the subject, episodeId the finite experience. Cite supplied message indices and numbered spans, not memory ids or proposals. Do not repeat accepted_progress. Preserve partial accomplishment during participation. Closed episodeIds cannot restart. Retire only whole subjects with exact witnesses and scope whole-subject, not because a scene ends or access closes. Retirement overrides an update and excludes selection; final progress survives. closed_subject_ids cannot restart.
When reframe_required, rewrite or retire supplied old subjects. With scope_reset, rebuild broader preparation; old drafts are archived. Otherwise preserve unselected aims and evidence.

Keep rp_brief under 150 words and selected_material under 600 tokens. Limits are ceilings, not targets. Return concise JSON only. No extra model pass.
`;

export function storyInput(args, maxTokens = 14000) {
    if (!Number.isFinite(maxTokens) || maxTokens <= 0) throw Error('Planner input budget must be a finite positive token count.');
    return ownedInput(args, maxTokens, { system: STORY_SYSTEM, schema: STORY_SCHEMA,
        measure: payload => storyInputTokens(JSON.stringify(payload), STORY_SYSTEM, STORY_SCHEMA), project: payload => {
        const prior = payload.previous_preparation;
        for (const key of ['playable', 'playable_review_required_ids', 'selection_review_required_ids',
            'material_review_required', 'material_review_reason', 'legacy_guidance_episode_ids']) delete prior[key];
        for (const subject of prior.developments) {
            const background = args.state.background?.find(entry => entry.subjectId === subject.id);
            if (background) {
                const { subjectId, ...record } = background;
                subject.background = structuredClone(record);
            }
        }
        // Transient prose is not planner memory. Rebuilding it from current play
        // prevents yesterday's scene/selection becoming today's default template.
        // Durable aims, forecasts and witnessed progress remain available.
        delete prior.episode;
        if (args.state.rpBrief) prior.rp_brief = args.state.rpBrief;
        prior.selection_contract = 'Rebuild selection from current play, not old prose. Omitted aims stay private. Refresh background for each selected subject.';
        if (prior.review_scope) prior.review_scope.instruction = 'Review relevance across the RP. Remove spent material; retain independent possibilities. Boundary zero means reconcile all supplied context.';
        // Static premises and prior drafts precede current play, which can change
        // their time-sensitive conditions without rewriting the source reference.
        const { source_reference, accepted_messages, ...context } = payload;
        return { source_reference, ...context, accepted_messages: witnessMessages(accepted_messages) };
    } });
}

export async function storyPass({ state, input, source, generate }) {
    let result;
    try {
        result = await generate(input.prompt, STORY_SYSTEM, STORY_SCHEMA);
        if (['length', 'max_tokens', 'max_output_tokens'].includes(String(result.finishReason).toLowerCase())) throw Error('Truncated story selection response');
        const normalized = normalizePlannerResponse(JSON.parse(result.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')), STORY_SCHEMA.value);
        const raw = normalized.value;
        const ignoredEpisodeFields = normalized.ignoredFields.filter(path => path.startsWith('$.episode.')).map(path => path.slice('$.episode.'.length));
        const responseAdjustments = [...normalized.adjustments, ...normalized.ignoredFields.filter(path => !path.startsWith('$.episode.'))];
        if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.realization == null) {
            raw.realization = [];
            responseAdjustments.push('$.realization');
        }
        // Progress may be split across several rows for the same subject. Its
        // changes remain independently checked by the evidence ledger below.
        if (Array.isArray(raw?.realization)) {
            const grouped = new Map();
            raw.realization = raw.realization.filter((entry, index) => {
                if (!entry || typeof entry.id !== 'string' || entry.changes !== undefined && !Array.isArray(entry.changes)) return true;
                const previous = grouped.get(entry.id);
                if (!previous) { grouped.set(entry.id, entry); return true; }
                previous.changes = [...(previous.changes || []), ...(entry.changes || [])];
                responseAdjustments.push(`$.realization[${index}]`);
                return false;
            });
        }
        const reconciled = reconcileDevelopments(raw, { state, schema: STORY_SCHEMA.value.properties.developments.items,
            reusePrevious: !needsEventReframe(state), playerNames: input.playerNames });
        responseAdjustments.push(...reconciled.adjustments);
        const witnessReview = reconcileSpanWitnesses(raw, input.evidenceMessages);
        check(raw, STORY_SCHEMA.value);
        const scopeReset = needsEventReframe(state) && state.preparationFormat === EVENT_POINTS_FORMAT;
        const updates = new Map(raw.developments.map(subject => [subject.id, subject]));
        if (updates.size !== raw.developments.length) throw Error('Duplicate private subject update');
        const retired = new Set((raw.retire || []).map(entry => entry.id));
        const subjects = new Map((scopeReset ? [] : state.developments).map(subject => [subject.id, subject]));
        for (const subject of raw.developments) subjects.set(subject.id, subject);
        for (const id of retired) subjects.delete(id);
        const background = [...subjects.keys()].map(id => updates.has(id)
            ? { subjectId: id, ...updates.get(id).background }
            : state.background?.find(entry => entry.subjectId === id) || {
                subjectId: id, unfolding: 'Retained private aim; background not yet assessed.',
                basis: 'Unreviewed legacy preparation, not accepted progress.',
                access: { route: 'none', basis: 'Fresh access assessment required before selection.' },
            });
        validateBackground(background, [...subjects.values()], check);
        validateSelectedMaterial(raw.selected_material, [...subjects.values()], check, background);
        if (raw.selected_material.some(entry => entry.subjectIds.some(id => !updates.has(id)))) {
            throw Error('Every selected contributor requires a fresh background assessment');
        }
        const progressIds = new Set(raw.realization.map(entry => entry.id));
        const progressSubjects = new Set([...subjects.keys(), ...(scopeReset ? [] : state.developments).map(subject => subject.id)]);
        if (progressIds.size !== raw.realization.length || raw.realization.some(entry => !progressSubjects.has(entry.id))) {
            throw Error('Realization requires unique retained subject ids, not episode ids');
        }

        // This storage adapter makes no second AI call. Fresh selection
        // explicitly withdraws old per-subject packets;
        // original progress changes still pass the existing strict evidence checks.
        const { selected_material, rp_brief, ...privateUpdate } = raw;
        const resolve = evidence => resolveSpanWitnesses(evidence, input.evidenceMessages);
        if (raw.retire) privateUpdate.retire = raw.retire.map(entry => ({ ...entry, witnesses: resolve(entry.witnesses) }));
        privateUpdate.developments = raw.developments.map(({ background, ...subject }) => subject)
            .filter(subject => !retired.has(subject.id))
            .filter(subject => needsEventReframe(state) || !samePrivateAim(subject, state.developments.find(old => old.id === subject.id)));
        privateUpdate.realization = [
            ...raw.realization.map(entry => ({ ...entry, ...(entry.changes ? { changes: entry.changes.map(change => ({
                ...change, evidence: resolve(change.evidence),
            })) } : {}), playable: [] })),
            ...[...subjects.keys()].filter(id => !progressIds.has(id)).map(id => ({ id, playable: [] })),
        ];
        const merged = await ownedPass({ state, input: { ...input, lifecycleRequired: true }, source,
            generate: async () => ({ ...result, text: JSON.stringify(privateUpdate) }) });
        if (!merged.accepted) return { ...merged, result };
        const next = merged.state;
        next.rpBrief = rp_brief;
        if (state.selectedMaterial !== undefined && JSON.stringify(state.selectedMaterial) !== JSON.stringify(selected_material)) {
            next.archive.push({ selectedMaterial: structuredClone(state.selectedMaterial),
                source: structuredClone(state.source), revision: state.revision, replaced: true });
        }
        next.selectedMaterial = structuredClone(selected_material);
        if (state.background !== undefined && JSON.stringify(state.background) !== JSON.stringify(background)) {
            next.archive.push({ background: structuredClone(state.background),
                source: structuredClone(state.source), revision: state.revision, replaced: true });
        }
        next.background = structuredClone(background);
        return { ...merged, state: next, result,
            warnings: [...witnessReview.warnings, ...(merged.warnings || [])],
            skippedProgress: witnessReview.skippedProgress, skippedRetirements: witnessReview.skippedRetirements,
            ...(ignoredEpisodeFields.length ? { ignoredEpisodeFields } : {}),
            ...(responseAdjustments.length ? { responseAdjustments } : {}),
            ...(reconciled.deferredDevelopments.length ? { deferredDevelopments: reconciled.deferredDevelopments,
                withheldMaterial: reconciled.withheldMaterial } : {}) };
    } catch (error) { return { state, accepted: false, error: error.message, ...(result ? { result } : {}) }; }
}

function samePrivateAim(subject, previous) {
    if (!previous) return false;
    return subject.id === previous.id && subject.development === previous.progression
        && subject.stakes === previous.outcomes && subject.participation === previous.access
        && ['control', 'owner', 'aim'].every(key => subject.initiative[key] === previous.initiative?.[key]);
}
