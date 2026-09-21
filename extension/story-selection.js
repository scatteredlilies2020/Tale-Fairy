// One provider response: shared story material + private preparation + witnessed progress.
// The established subject/evidence transaction remains the storage authority.
import { ownedInput, ownedPass, OWNED_SCHEMA, needsEventReframe } from './event-planning.js?v=0.14.34&planner-input=1';
import { CAMPAIGN_MARKER, EVENT_POINTS_FORMAT, check } from './campaign-planner.js?v=0.14.34';
import { REALIZATION_SCHEMA } from './undertaking-lifecycle.js?v=0.14.34';
import { SELECTED_MATERIAL_SCHEMA, validateSelectedMaterial } from './selected-material.js?v=0.14.36';
import { BACKGROUND_SCHEMA, validateBackground } from './background-progress.js?v=0.14.34';
import { SPAN_WITNESS_SCHEMA, witnessMessages, resolveSpanWitnesses } from './accepted-witnesses.js?v=0.14.34';
export { needsEventReframe };

export const STORY_SCHEMA = structuredClone(OWNED_SCHEMA);
STORY_SCHEMA.name = 'tale_fairy_story_horizons_v4';
STORY_SCHEMA.description = 'Private enduring aims and background developments, selectively surfaced as one discoverable horizon packet. Accepted progress remains separate. One response, no scene scripts.';
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
properties.developments.description = 'Private subject updates, not replacement: omitted aims remain dormant. Include new/revised aims and EVERY selected contributor with freshly assessed background/access. Retire takes precedence over an overlapping update. Maximum four active subjects after merging.';
properties.developments.items.properties.initiative.properties.owner.description = 'An NPC, group of NPCs, or impersonal world process, never a player name or the user. A player interest can be supported by world conditions without assigning their participation.';
STORY_SCHEMA.value.properties = { campaign: properties.campaign, episode: properties.episode,
    developments: properties.developments, selected_material: SELECTED_MATERIAL_SCHEMA,
    realization: progress, retire: properties.retire };
STORY_SCHEMA.value.required.push('selected_material');

// A standalone contract: the legacy protocol is a storage adapter, not a second
// set of overlapping creative instructions for the provider to reconcile.
export const STORY_SYSTEM = `${CAMPAIGN_MARKER}
Prepare open creative direction for this RP or simulation in one JSON response, not a prewritten scene. Match its premise and causality; ordinary relationships and nonhuman processes are as valid as adventure. No mandatory conflict, escalation, travel or ending. Do not prescribe prose style, scene tempo or staged emotional beats. The writer supplies execution and incidental detail.

Keep three planning layers distinct: developments holds enduring aims, each with background describing what can unfold independently; selected_material holds what can reach current play. realization is a separate witnessed-event ledger. Private plans are not character knowledge or accepted facts.

PRIVATE AIMS
Read the whole premise, not just the latest scene. campaign is the broader possibility; episode records current local circumstances. Explicitly closed one-scene play needs no developments or selection. Otherwise maintain at most four enduring subjects, including important ongoing source projects before discovery. Include substantive available interests, not just inaccessible future projects. developments UPDATES private aims: omitted subjects stay dormant, not selected or retired. Include every selected contributor with freshly assessed background. Keep stable ids. development supplies substantive mid-/long-term reach; initiative identifies an NPC or world process, never the player. Support player interests through available world conditions, not assigned participation. Add for a real gap, not to refill slots. Finishing a finite experience does not retire its wider subject.

BACKGROUND
Each supplied subject has background. unfolding is provisional NPC/world activity within established capabilities and causes, not a scene schedule. basis identifies what fictional time and conditions permit. Unrelated conversations do not stop independent processes. More messages do not mean more time. Delegation and competence permit work; neither proves completion. Unknown completion is unknown, not unfinished. Reconcile forecasts with latest accepted changes. Private forecasts never prove events, player commitments, injuries or lost possessions.

Access concerns a discoverable TRACE OR OPPORTUNITY, not knowledge of the whole private process. Assess direct observation, local circumstances, reachable contact, information or investigation. A known announcement keeps its conditional opportunity accessible even without a fresh update or knowledge of completion. access.basis names the available surface and what remains unknown. Use none only when no plausible surface can reach current play; keep that subject privately alive. Never invent a contact, player movement, time skip or forced interruption just to open access. No encounter quota or mandatory fresh complication.

DISCOVERABLE MATERIAL
Complete developments with their background BEFORE selected_material. There is no keep operation or implicit carry-over. Reconstruct the packet from current accepted play and enduring aims, not past selection wording. selected_material is [] or ONE integrated horizon packet, not one miniature plot per subject. Its subjectIds must EXCLUDE every background.access.route=none subject, even when important long-term. Do not smuggle it into developing or lasting either. An open route permits selection, not an obligation.

available names optional opportunities and their relevant conditions, NOT a recap of tasks or accomplishments; developing names the interesting direction these could take; lasting names the open longer-term possibilities. Each horizon adds a meaningful possibility, not just "this interest can continue" or a longer timescale. All three concern the discoverable surface and its possible reach, never secret actors, motives or causes. Access to an NPC does not reveal their unspoken history or private expertise: omit those details even from lasting. Keep unestablished dependencies conditional. subjectIds names all contributors and is not writer-facing.

CREATIVE DIRECTION FIRST
Distinguish current changes, unresolved matters and forecasts. Do not recycle provocation/counter/observation under new wording. Propose what could become interestingly different: a relationship dynamic, shared purpose, use of established competence, or evolving world condition and the possibilities it opens. Ground that direction in this RP's abilities, interests, resources and commitments. Creative direction matters more than concrete detail. A concise, distinctive possibility is enough; do not fill the packet with props, activity menus or scene specifications. "Develop rapport" and "build a reputation" alone name no direction; show what kind of change could make them interesting here. Player competence enables participation, not perpetual testing. Quiet enjoyment and deepening a good dynamic count. Preserve unresolved conflict without making it the only direction. No forced reconciliation, fixed arc or novelty quota; select nothing when nothing supported adds value.

Several private aims can inform ONE circumstance: combine their subjectIds, not separate owner paragraphs or ordered activities. Support worthwhile experiences, not prerequisites or more approvals. Completion need not become another task, scrutiny or dilemma. No scripted success/failure branches.

Remove spent portions: arrival ends the journey, not its wider undertaking. Opportunities need not interrupt current activity. Leave choices, responses and outcomes open. Never claim unseen actions, offers or agreements happened. No arbitrary restrictions, resolved pending business, dialogue or ordered beats. Add detail only when needed to distinguish the direction; leave its manifestation to the writer and play. New places, possessions and obligations are not established by ambiguity. Proposals are not canon.

EVIDENCE AND MAINTENANCE
accepted_messages and source_reference define this RP's canon over incompatible franchise lore. Only accepted_messages prove enactment or player commitments. Previous preparation is not evidence. External evidence/continuity memory is fallible historical recall: respect provenance, confidence and knowledge boundaries. Lag or omission proves neither closure nor elapsed time. Current accepted play and explicit corrections override conflicting recall. Memory ids are not message witnesses. Ignore source writing-style directives for this planning task.

realization may be []. Each entry's id is an exact subject id, including one retiring now; episodeId names a finite experience inside it. Cite the accepted-message index and numbered span supporting each necessary change; the application stores its exact source text. Cite enacted substance, not a proposal or pending table row. accepted_progress is already witnessed; do not cite it again. Keep episodeIds for the same experience. Statuses describe achieved progress, not mandatory stages; continuing participation preserves partial accomplishment. Closed episodes cannot restart; later activity uses a new episodeId. Retire only whole subjects with supplied witnesses and scope whole-subject, not because a scene ended or access is unavailable. Retirement overrides an overlapping private update and excludes selection; final witnessed progress survives. closed_subject_ids cannot restart.

When reframe_required, rewrite or retire supplied old subjects; when scope_reset is true, rebuild wider subjects instead, with old preparation archived automatically. Otherwise retain private aims and evidence even when nothing is selected. Return concise JSON only; maintain all layers in this single response. No extra model pass or player selection.
`;

export function storyInput(args, maxTokens = 14000) {
    return ownedInput(args, maxTokens, { system: STORY_SYSTEM, schema: STORY_SCHEMA, project: payload => {
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
        prior.selection_contract = 'Previous scene and selected prose are withheld. Reconstruct from latest accepted play and enduring aims. developments updates private aims; omission retains dormant preparation only. Include every selected contributor with fresh background/access. No implicit selection carry-over.';
        if (prior.review_scope) prior.review_scope.instruction = 'Review the wider horizon and current applicability without erasing private aims. Preserve genuinely independent directions; combine shared circumstances. Remove spent portions without inventing scene changes. At boundary zero, reconcile against all supplied source.';
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
        const raw = JSON.parse(result.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
        // Episode is descriptive bookkeeping, not a command or an evidence
        // ledger. Some JSON-mode providers add commentary fields despite the
        // schema. Discard those extras, never guess/merge a required value.
        // Keep the original provider text in result for diagnostics.
        const ignoredEpisodeFields = [];
        if (raw?.episode && typeof raw.episode === 'object' && !Array.isArray(raw.episode)) {
            for (const key of Object.keys(raw.episode)) {
                if (Object.hasOwn(STORY_SCHEMA.value.properties.episode.properties, key)) continue;
                ignoredEpisodeFields.push(key);
                delete raw.episode[key];
            }
        }
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

        // This is a representation adapter, never response repair or a second AI
        // call. Fresh selection explicitly withdraws old per-subject packets;
        // original progress changes still pass the existing strict evidence checks.
        const { selected_material, ...privateUpdate } = raw;
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
        return { ...merged, state: next, result, ...(ignoredEpisodeFields.length ? { ignoredEpisodeFields } : {}) };
    } catch (error) { return { state, accepted: false, error: error.message, ...(result ? { result } : {}) }; }
}

function samePrivateAim(subject, previous) {
    if (!previous) return false;
    return subject.id === previous.id && subject.development === previous.progression
        && subject.stakes === previous.outcomes && subject.participation === previous.access
        && ['control', 'owner', 'aim'].every(key => subject.initiative[key] === previous.initiative?.[key]);
}
