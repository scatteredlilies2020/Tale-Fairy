import { CAMPAIGN_MARKER, EVENT_POINTS_FORMAT, check } from './campaign-planner.js?v=0.14.36&working-plan=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1';
import { compactPlannerReference } from './planner-reference.js?history-budget=1';
import { compactCampaignSpeakers } from './campaign-evidence.js';
import { witnessMessages, resolveSpanWitnesses, SPAN_WITNESS_SCHEMA } from './accepted-witnesses.js?v=0.14.34&partial-evidence=1';
import { fitEvidenceProviders } from './evidence-providers.js?story-lifecycle=1';
import { SELECTED_MATERIAL_SCHEMA, validateSelectedMaterial } from './selected-material.js?v=0.14.36&rp-plot=1&story-goal=2&story-horizons=1&story-outlook=1&story-life=1&autonomous-life=1&relaxed-conditions=1';
import { storyInputTokens } from './story-budget.js?follow-through=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-throughline=1&story-life=1&concise-prompts=1&horizon-links=3&story-structure=1&ensemble-pressure=1&story-cards=1';
import { fitPlannerContext } from './planner-context.js?soft-targets=1&story-map=1&story-goal=2&story-throughline=1&story-life=1';
import { PROGRESSION_PATCH_SCHEMA, mergeProgression } from './story-progression.js?story-progression=1&story-workshop=1&story-throughline=1&story-life=1&autonomous-life=1&relaxed-conditions=1&horizon-links=3';
import { WORKING_PLAN_SCHEMA, WORKING_PLAN_VERSION, WORKING_PLAN_LIMIT, SELECTED_PACKET_LIMIT, RP_UNDERSTANDING_LIMIT,
    PLANNER_INPUT_LIMIT, planTokens, plannerInputLimit, validateWorkingPlan, validateGoalSelection, workingPlanProjection } from './working-plan.js?rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-life=1&future-entry=1&autonomous-life=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1';
export { PLANNER_INPUT_LIMIT, PLANNER_OUTPUT_LIMIT, plannerInputLimit } from './working-plan.js?rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-life=1&future-entry=1&autonomous-life=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1';

const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const witnesses = { type: 'array', maxItems: 3, items: SPAN_WITNESS_SCHEMA };
const selection = structuredClone(SELECTED_MATERIAL_SCHEMA);
// The host selects initiatives through the split scene review, never through
// the provider-authored legacy writer material.
delete selection.items.properties.initiative;
selection.items.properties.available.maxLength = 900;
// Saved packets may lack later horizons; every newly selected packet must
// supply the wider possibility rather than degenerating into a next-turn cue.
selection.items.required.push('developing', 'lasting');
// Instructions live once in the system contract, not repeated in schema prose.
function withoutDescriptions(value) {
    if (Array.isArray(value)) return value.map(withoutDescriptions);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
        .filter(([key]) => key !== 'description').map(([key, child]) => [key, withoutDescriptions(child)]));
    return value;
}
const responseShape = withoutDescriptions(object({
    plan: WORKING_PLAN_SCHEMA,
    progression: PROGRESSION_PATCH_SCHEMA,
    exits: { type: 'array', maxItems: 4, items: object({ id: text(80),
        disposition: { type: 'string', enum: ['closed', 'paused', 'dropped', 'changed'] }, reason: text(300), evidence: witnesses }) },
    observations: { type: 'array', maxItems: 4, items: object({ id: text(64), evidence: { ...witnesses, minItems: 1 } }) },
    selected_material: selection,
}));
responseShape.properties.plan.required.push('rpUnderstanding', 'goal');
// The provider sends changes, never a replacement of the durable progression.
delete responseShape.properties.plan.properties.trajectories;
delete responseShape.properties.plan.properties.outlook;
delete responseShape.properties.plan.properties.throughline;
delete responseShape.properties.plan.properties.storyLife;
delete responseShape.properties.plan.properties.initiative;
delete responseShape.properties.plan.properties.initiativeReceipt;
delete responseShape.properties.plan.properties.storyStructure;
responseShape.properties.plan.properties.developments.items.required.push('trajectoryIds');
responseShape.properties.plan.properties.goal.items.required.push('scope');
responseShape.properties.plan.properties.rpUnderstanding.required.push('storyScope', 'independentSource');
// Admission and saved-state compatibility keep the original field ceilings.
// Drafting needs much smaller allowances: those ceilings are not a budget to
// fill independently, and JSON keys/ids consume part of the shared token cap.
export const STORY_RESPONSE_SCHEMA = { name: 'tale_fairy_story_response', value: responseShape };
const completedShape = structuredClone(responseShape);
completedShape.properties.plan.properties.outlook = structuredClone(WORKING_PLAN_SCHEMA.properties.outlook);
completedShape.properties.plan.properties.throughline = structuredClone(WORKING_PLAN_SCHEMA.properties.throughline);
completedShape.properties.plan.properties.storyLife = structuredClone(WORKING_PLAN_SCHEMA.properties.storyLife);
completedShape.properties.plan.properties.initiative = structuredClone(WORKING_PLAN_SCHEMA.properties.initiative);
completedShape.properties.plan.properties.initiativeReceipt = structuredClone(WORKING_PLAN_SCHEMA.properties.initiativeReceipt);
completedShape.properties.selected_material = structuredClone(SELECTED_MATERIAL_SCHEMA);
export const STORY_SCHEMA = { name: 'tale_fairy_story_progression_v6', value: structuredClone(responseShape) };
const draftPlan = STORY_SCHEMA.value.properties.plan.properties;
// Openings belong to the split scene contract, not the legacy bounded draft.
delete draftPlan.openings;
delete draftPlan.futureEntryVersion;
draftPlan.rpUnderstanding.properties.storyScope.maxLength = 110;
draftPlan.rpUnderstanding.properties.independentSource.maxLength = 110;
draftPlan.direction.maxLength = 140;
draftPlan.threads.maxLength = 140;
draftPlan.goal.items.properties.aim.maxLength = 140;
draftPlan.goal.items.properties.reachedWhen.maxLength = 100;
draftPlan.consequences.items.properties.text.maxLength = 120;
const draftDevelopment = draftPlan.developments.items.properties;
for (const [key, limit] of Object.entries({ owner: 48, question: 80, initiative: 120, resolution: 90, beyond: 90 })) {
    draftDevelopment[key].maxLength = limit;
}
draftDevelopment.access.properties.basis.maxLength = 80;
const draftMaterial = STORY_SCHEMA.value.properties.selected_material.items.properties;
for (const [key, limit] of Object.entries({ available: 400, developing: 220, lasting: 220 })) draftMaterial[key].maxLength = limit;
const draftTrajectory = STORY_SCHEMA.value.properties.progression.properties.upsert.items.properties;
for (const [key, limit] of Object.entries({ focus: 80, owner: 48, basis: 90, drive: 70 })) draftTrajectory[key].maxLength = limit;
for (const stage of ['next', 'later']) {
    draftTrajectory[stage].properties.when.maxLength = 80;
    draftTrajectory[stage].properties.change.maxLength = 100;
}

export const STORY_SYSTEM = `${CAMPAIGN_MARKER}

Prepare progression for this particular RP: concrete situations that can develop across scenes and alter its longer story. Infer expected experiences from the supplied setting, characters, player premise and established departures. Begin with the wider story territory, then consider today's scene. Relevant past events supply causes and changed relationships. Invent compatible opportunities without requiring prior mention; accepted messages alone establish their enactment. The writing preset owns prose, tone and pacing.

Analyze the RP in rpUnderstanding. Identify original/franchise/mixed/unclear basis, setting and era. canonIntent reflects the user's stated preference (follow/flexible/alternate), otherwise unspecified. divergence describes established causal impact: none-established, local, major or unclear. For original RP both are not-applicable. anchors records applicable rules/relationships; departures records changes and affected prerequisites; leave empty when none are established. storyScope names what this RP is about beyond today's episode; experiences names its characteristic recurring activities and interests; independentSource names a relevant NPC, community, institution or world process beyond the latest scene. uncertainty flags unknowns. Franchise knowledge and prior_story_map are provisional; supplied references, corrections and accepted play take precedence. Reconsider dependent possibilities when their premises change. Keep this analysis below ${RP_UNDERSTANDING_LIMIT} tokens within the plan budget.

Turn that understanding into fresh playable substance. Develop the RP's characteristic activities in specific new forms: a journey can offer distinct settlements, local lives and discoveries along its route; an ensemble's everyday life can offer shared meals, a song taking shape and different ways of spending time together. Infer the activities from this RP, including its ordinary pleasures, pursuits and larger concerns. Prepare concrete places, people, projects or occasions beyond the current scene when its scope supports them, even before they are mentioned in play. Give each chosen possibility something worthwhile to experience in its own right and something that can change through participation or independent activity. Its recurring activities supply new substance across episodes; interruptions, obstacles and conflicts arise from particular circumstances. Use this understanding to shape developments and progression; access determines which material is available now.

Private progression is stored in previous_plan.trajectories, separately from the local plan. Usually prepare up to three distinctive trajectories grounded in that broader territory, including its characteristic people, interests and developing circumstances. A trajectory spans meaningful changes across scenes, rather than extending today's activity with an eventual-friendship sentence. Its owner is an NPC or world process; basis states the supplied premise or a clearly proposed possibility; drive gives the owner's continuing interest. next describes an intermediate change and the condition that could bring it about. later describes a different, farther-reaching change made possible by that development, with its own condition. These are branches of possibility: each when is a causal dependency, and each change is specific story substance. Shared projects, discoveries, relationships and everyday ambitions can carry progression as readily as political or physical conflict. Use the particular RP's substance.

Return progression as a patch: upsert creates or revises whole trajectories; retire explicitly withdraws preparation with a reason. Omitted trajectories remain saved unchanged. Keep a trajectory's id and focus across local scene changes; update its conditions when relevant accepted events, refusal, discovery or premise changes alter its prospects. Retirement withdraws a possibility, not declares an event happened. A bounded vignette or a concluded story can have no trajectories. On ordinary reviews, empty upsert/retire retains the existing progression. Local scene focus and passage of message turns are not progression events.

Return plan as a complete local replacement with at most four developments. direction preserves the broader range of experiences; threads holds continuing relationships/interests; consequences holds at most four relevant witnessed results. Developments contain concrete NPC/world activity: question gives the experience or uncertainty, initiative the activity, resolution its possible boundary, beyond useful follow-through. trajectoryIds links to retained private trajectories where there is a causal connection; [] is valid for unrelated local activity. A trajectory can remain entirely off-scene with no linked development. One shared situation can include several NPCs in a single development; separate rows represent distinct work. access identifies a present route and its prerequisites; none keeps that development private. The current scene governs access, not the limits of preparation.

goal holds selected NPC/world aims linked by subjectId to local developments. scope distinguishes long-term, near-term and side-thread. Choose concrete aims from RP scope, relevant past and user interests; reachedWhen states observable fulfillment. For linked work, local goals describe intermediate experiences while the trajectory carries the farther-range direction. Retain useful unfinished goals through unselected turns and revise for actual fulfillment, refusal or changed circumstances. goal=[] is valid. Trajectories, goals and their links are private planner state, not writer guidance.

Draft below the target: keep the merged plan including retained trajectories below ${WORKING_PLAN_LIMIT} tokens, aiming for 900; use one or two strong trajectories and only useful local developments. Patch only changed trajectories. Field maxima are not allocations. Preserve distinct unfinished work and prerequisites; compress repetitive prose first.

For every removed local development return an exit: closed means ended in play; changed means actual events superseded it. Both require exact supplied message/span evidence. paused and dropped withdraw preparation and need no evidence. Retained ids cannot exit. Migration/rebuild may replace local drafts without exits. New development and trajectory ids start with new_id_prefix. Keep an id's specific meaning; different work gets a different id.

consequences are accepted facts; all other planning fields are preparation. New or changed facts require observations with ids and exact supplied index/span citations. Unchanged verified facts can carry. References supply premises; drafts are not enactment. Omitted context proves neither absence nor resolution.

selected_material is [] or one integrated packet below ${SELECTED_PACKET_LIMIT} tokens; aim for 300. Select useful story substance from currently accessible local developments, including at least one goal's subjectId. Unselected work stays private. available gives observable NPC/world circumstances; developing gives concrete activity and possible changes over later scenes; lasting gives a specific farther-reaching possibility. Draw on a linked trajectory when relevant, carrying only what its access and causal conditions support. Otherwise supply fitting local possibilities. All three fields are story material; planner rationale, behavioral instructions and player decisions belong outside the packet. Preserve useful unplayed material. [] is valid when nothing additional fits. Concise JSON only.
`;

export const needsEventReframe = state => state?.workingPlanVersion !== WORKING_PLAN_VERSION;

function legacyDraft(state) {
    const result = { migration: true, developments: [], omittedDrafts: 0 };
    for (const row of state.developments || []) {
        const draft = { id: row.id, initiative: row.initiative, development: row.progression, resolution: row.outcomes, access: row.access };
        if (planTokens({ ...result, developments: [...result.developments, draft] }) <= WORKING_PLAN_LIMIT - 50) result.developments.push(draft);
        else result.omittedDrafts++;
    }
    if (state.rpBrief && planTokens({ ...result, previousBrief: state.rpBrief }) <= WORKING_PLAN_LIMIT) result.previousBrief = state.rpBrief;
    return result;
}

function provisionalStoryMap(state) {
    let understanding = state?.workingPlan?.rpUnderstanding;
    if (!understanding) {
        for (let i = (state?.archive?.length || 0) - 1; i >= 0; i--) {
            understanding = state.archive[i]?.preparation?.workingPlan?.rpUnderstanding;
            if (understanding) break;
        }
    }
    if (!understanding || typeof understanding !== 'object' || Array.isArray(understanding)) return null;
    const fields = ['basis', 'setting', 'canonIntent', 'divergence', 'anchors', 'departures', 'storyScope', 'experiences', 'independentSource'];
    const map = Object.fromEntries(fields.filter(key => typeof understanding[key] === 'string' && understanding[key].trim())
        .map(key => [key, understanding[key]]));
    return Object.keys(map).length ? map : null;
}

// Older rebuilds reset revision to zero before sending. Keep their archived id
// namespace reserved when recovering; new transactional rebuilds never reset it.
export function nextPlanRevision(state) {
    let revision = state.revision;
    const pending = revision === 0 ? [state] : [], seen = new Set();
    while (pending.length) {
        const item = pending.pop();
        if (!item || seen.has(item)) continue;
        seen.add(item);
        if (Number.isSafeInteger(item.revision)) revision = Math.max(revision, item.revision);
        for (const entry of item.archive || []) {
            if (entry?.rebuild === true && entry.preparation) pending.push(entry.preparation);
        }
    }
    if (!Number.isSafeInteger(revision + 1)) throw Error('Working-plan revision is out of range; saved preparation is intact.');
    return revision + 1;
}

export function storyInput({ reference, state, messages, playerNames = [], previousUsable = false,
    verifiedPlanEvidence = {}, verifiedClosedIds, evidence, continuity, continuityTokens = 1000, reviewedMessageCount = 0, resetPlan = false }, maxTokens = PLANNER_INPUT_LIMIT,
    { system = STORY_SYSTEM, schema = STORY_SCHEMA, project = value => value } = {}) {
    const limit = plannerInputLimit(maxTokens);
    const migration = resetPlan || needsEventReframe(state);
    const trustedEvidence = previousUsable && !resetPlan ? verifiedPlanEvidence : {};
    let previous = resetPlan ? legacyDraft({}) : migration ? legacyDraft(state) : structuredClone(state.workingPlan);
    if (!migration) {
        validateWorkingPlan(previous, check);
        previous.consequences = previous.consequences.filter(fact => Object.hasOwn(trustedEvidence, fact.id) && trustedEvidence[fact.id]?.text === fact.text);
    }
    const speakers = compactCampaignSpeakers(messages);
    const names = [...new Set(playerNames.filter(name => typeof name === 'string' && name.trim()))];
    const nextRevision = nextPlanRevision(state), newIdPrefix = `r${nextRevision}-`;
    const priorStoryMap = resetPlan ? provisionalStoryMap(state) : null;
    let payload = { source_reference: compactPlannerReference(reference),
        previous_plan: previous, rebuild: !previousUsable || migration, new_id_prefix: newIdPrefix,
        ...(priorStoryMap ? { prior_story_map: priorStoryMap } : {}),
        player_names: names,
        coverage: { reviewed_before: reviewedMessageCount, supplied_messages: messages.length,
            ...(reviewedMessageCount ? { reviewed_context_optional: true } : {}),
            ...(reviewedMessageCount && (!previousUsable || migration)
                ? { review_boundary: 'Verified prior review of this unchanged source prefix; old plans and outcomes are not restored by this coverage.' } : {}),
            omitted_context: 'Only supplied accepted spans prove new outcomes. Earlier history stays local; absence from this request is not resolution.' },
        ...(Object.keys(speakers.defaults).length ? { default_speaker_name_by_role: speakers.defaults } : {}),
        accepted_messages: witnessMessages(speakers.messages) };
    payload = project(payload);
    const measure = value => storyInputTokens(JSON.stringify(value), system, schema);
    payload = fitPlannerContext(payload, measure, limit);
    const external = fitEvidenceProviders(evidence ?? (continuity ? [{ ...continuity, provider: 'continuity-memory' }] : []),
        Math.min(1000, Math.max(0, Number(continuityTokens) || 0)), value => measure({ ...payload, external_evidence: value }) <= limit);
    if (external.length) payload.external_evidence = external;
    const prompt = JSON.stringify(payload), inputTokens = measure(payload);
    const indices = payload.accepted_messages.map(m => m.index);
    return { prompt, inputTokens, inputLimit: limit, resetPlan, nextRevision, indices,
        evidenceMessages: structuredClone(messages.filter(m => indices.includes(m.index))),
        inputOverTarget: Math.max(0, inputTokens - limit),
        previousPlan: previous, rebuild: payload.rebuild, newIdPrefix, playerNames: names, verifiedClosedIds,
        verifiedPlanEvidence: structuredClone(trustedEvidence),
        evidence: { status: external.length ? 'included' : 'omitted-or-unavailable', providers: external.map(e => e.provider) },
        continuity: { status: external.some(e => e.provider === 'continuity-memory') ? 'included' : 'omitted-or-unavailable' },
        migration: { required: migration, omittedDrafts: previous.omittedDrafts || 0 } };
}

export async function storyPass({ state, input, source, generate,
    system = STORY_SYSTEM, schema = STORY_SCHEMA, completeResponse = value => value }) {
    let result;
    let received = false;
    const basisRevision = state.revision;
    try {
        result = await generate(input.prompt, system, schema);
        received = true;
        if (['length', 'max_tokens', 'max_output_tokens'].includes(String(result.finishReason).toLowerCase())) throw Error('Truncated working-plan response');
        let raw = JSON.parse(result.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
        check(raw, schema === STORY_SCHEMA ? responseShape : schema.value);
        // Resolve against the actual transport request, including preflight
        // compaction, for both host-composed initiative receipts and local facts.
        const sent = JSON.parse(result.plannerPrompt ?? input.prompt);
        const supplied = new Set((sent.accepted_messages || []).flatMap(message => message.spans
            .map(span => `${message.index}:${Array.isArray(span) ? span[0] : span.span}`)));
        const resolve = refs => {
            if (refs.some(ref => !supplied.has(`${ref.index}:${ref.span}`))) throw Error('Witness requires an exact supplied accepted-message span');
            return resolveSpanWitnesses(refs, input.evidenceMessages);
        };
        raw = completeResponse(raw, { resolve });
        check(raw, completedShape);
        raw.plan.trajectories = mergeProgression(input.previousPlan.trajectories || [], raw.progression,
            input.newIdPrefix, check, input.playerNames);
        validateWorkingPlan(raw.plan, check, input.playerNames);
        const before = new Map((input.previousPlan.developments || []).map(d => [d.id, d]));
        const after = new Set(raw.plan.developments.map(d => d.id));
        const exits = new Map(raw.exits.map(exit => [exit.id, exit]));
        if (exits.size !== raw.exits.length) throw Error('Duplicate development exit');
        for (const item of raw.plan.developments) {
            if (!before.has(item.id) && !item.id.startsWith(input.newIdPrefix)) throw Error('New development requires the supplied id prefix');
        }
        if (!input.rebuild && [...before.keys()].some(id => !after.has(id) && !exits.has(id))) throw Error('Removed development requires an explicit exit');
        const transitions = raw.exits.map(exit => {
            if (!before.has(exit.id) || after.has(exit.id)) throw Error('Exit requires a removed previous development');
            if (['closed', 'changed'].includes(exit.disposition) && !exit.evidence.length) throw Error('Closing or superseding an undertaking requires witnessed events');
            return { ...exit, witnesses: resolve(exit.evidence), source: structuredClone(source) };
        });
        // Inspect local history without sending its growing ids/evidence to the
        // model. New revision-prefixed ids also avoid accidental name reuse.
        const closed = new Set(input.verifiedClosedIds ?? (state.archive || []).flatMap(entry => (entry.transitions || [])
            .filter(exit => ['closed', 'changed'].includes(exit.disposition)).map(exit => exit.id)));
        if ([...after].some(id => closed.has(id))) throw Error('An ended undertaking cannot restart under its closed id');
        const observations = new Map(raw.observations.map(row => [row.id, row]));
        if (observations.size !== raw.observations.length || raw.observations.some(row => !raw.plan.consequences.some(f => f.id === row.id))) throw Error('Observation requires a unique current consequence');
        const planEvidence = Object.create(null);
        for (const fact of raw.plan.consequences) {
            const observed = observations.get(fact.id);
            const previous = Object.hasOwn(input.verifiedPlanEvidence, fact.id) ? input.verifiedPlanEvidence[fact.id] : null;
            if (observed) planEvidence[fact.id] = { text: fact.text, witnesses: resolve(observed.evidence), source: structuredClone(source) };
            else if (previous?.text === fact.text) planEvidence[fact.id] = structuredClone(previous);
            else throw Error('New or changed consequence requires accepted-message witnesses');
        }
        const projection = workingPlanProjection(raw.plan);
        validateSelectedMaterial(raw.selected_material, projection.developments, check, projection.background);
        validateGoalSelection(raw.plan, raw.selected_material);
        if (state.revision !== basisRevision) throw Error('Preparation changed during planning');
        const archive = input.resetPlan ? [] : structuredClone(state.archive || []);
        const { archive: _archive, ...old } = state;
        if (input.resetPlan) archive.push({ preparation: structuredClone(state), rebuild: true });
        else if (state.revision) archive.push({ revision: state.revision, source: structuredClone(state.source),
            ...(needsEventReframe(state) ? { legacyPreparation: structuredClone(old), migration: structuredClone(input.migration) }
                : { workingPlan: structuredClone(state.workingPlan), planEvidence: structuredClone(state.planEvidence),
                    selectedMaterial: structuredClone(state.selectedMaterial) }),
            transitions, progressionChanges: structuredClone(raw.progression), replaced: true });
        const next = { revision: input.nextRevision, ...projection, archive, source: structuredClone(source),
            preparationFormat: EVENT_POINTS_FORMAT, workingPlanVersion: WORKING_PLAN_VERSION,
            workingPlan: structuredClone(raw.plan), planEvidence, selectedMaterial: structuredClone(raw.selected_material) };
        const budget = { input: result.plannerInputTokens ?? input.inputTokens, plan: planTokens(raw.plan),
            selected: planTokens(raw.selected_material),
            understanding: planTokens(raw.plan.rpUnderstanding) };
        const targets = { input: input.inputLimit, plan: WORKING_PLAN_LIMIT, selected: SELECTED_PACKET_LIMIT, understanding: RP_UNDERSTANDING_LIMIT };
        const budgetNotices = Object.entries(targets).filter(([key, target]) => budget[key] > target)
            .map(([key, target]) => `${key} ${budget[key]}/${target} token target; kept intact`);
        const outputOverrun = ['plan', 'selected', 'understanding'].reduce((sum, key) => sum + Math.max(0, budget[key] / targets[key] - 1), 0);
        return { accepted: true, state: next, result, warnings: [], migration: input.migration, budget, budgetNotices, outputOverrun };
    } catch (error) {
        return { accepted: false, state, error: error.message,
            recoverableOutput: received || error.code === 'TF_INVALID_PLANNER_RESPONSE',
            ...(result ? { result } : {}) };
    }
}

function correctionInput(input, failure, validDraft) {
    const limit = plannerInputLimit(input.inputLimit);
    let payload = JSON.parse(input.prompt);
    // Supply validation feedback as data. Never append an unbounded rejected
    // draft to the context, cut source text, or silently raise the configured target.
    const detail = String(failure.error).slice(0, 320);
    payload.response_correction = { error: planTokens(detail) <= 80 ? detail : 'Previous output failed validation. Check the complete response shape and shared budgets.' };
    // Replace verbose drafting advice, not story context, to make room for
    // feedback even when the original input used its entire local budget.
    const system = STORY_SYSTEM.replace(/Draft below the target:[^\n]+/u, validDraft
        ? 'Size edit: compress validated_draft, preserving its ids, subjects, specific places, activities, dependencies and choices. Shorten wording only; plan target 900 tokens, selection 250. Return complete JSON.'
        : 'Automatic correction: return corrected complete JSON. Compress merged plan to 700 tokens using upsert; selection 250. Preserve ids, dependencies and unfinished work.');
    const schema = structuredClone(STORY_SCHEMA);
    const plan = schema.value.properties.plan.properties;
    for (const key of ['direction', 'threads']) plan[key].maxLength = 100;
    plan.goal.items.properties.aim.maxLength = 100;
    plan.goal.items.properties.reachedWhen.maxLength = 70;
    for (const key of ['setting', 'anchors', 'departures', 'storyScope', 'experiences', 'independentSource', 'uncertainty']) {
        plan.rpUnderstanding.properties[key].maxLength = 70;
    }
    const development = plan.developments.items.properties;
    for (const key of ['question', 'initiative', 'resolution', 'beyond']) development[key].maxLength = 70;
    development.access.properties.basis.maxLength = 60;
    const trajectory = schema.value.properties.progression.properties.upsert.items.properties;
    for (const key of ['focus', 'basis', 'drive']) trajectory[key].maxLength = 60;
    for (const stage of ['next', 'later']) {
        trajectory[stage].properties.when.maxLength = 60;
        trajectory[stage].properties.change.maxLength = 70;
    }
    const measure = value => storyInputTokens(JSON.stringify(value), system, schema);
    if (validDraft) {
        // A valid proposal must be visible to an editor. If source + draft do
        // not fit, keep the proposal rather than regenerate it from scratch or
        // displace source/evidence to make room for an optional size edit.
        payload.validated_draft = JSON.parse(validDraft.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
        if (measure(payload) > limit) throw Error('Optional shortening draft exceeds input target; original preparation retained.');
    }
    payload = fitPlannerContext(payload, measure, limit);
    const tokens = measure(payload);
    return { input: { ...input, prompt: JSON.stringify(payload), inputTokens: tokens }, schema, system };
}

// A size-only edit cannot replace subjects, remove possibilities or change
// their ownership/access. Prose equivalence still needs qualitative evaluation.
function preparationStructure(state) {
    const sorted = rows => rows.map(row => JSON.stringify(row)).sort();
    const plan = state.workingPlan;
    return JSON.stringify({
        developments: sorted(plan.developments.map(d => [d.id, d.kind, d.owner, d.control, d.access.route, [...d.trajectoryIds].sort()])),
        trajectories: sorted(plan.trajectories.map(t => [t.id, t.owner])),
        goals: sorted(plan.goal.map(g => [g.subjectId, g.scope])),
        consequences: sorted(plan.consequences.map(c => c.id)),
        selected: sorted(state.selectedMaterial.map(packet => [...packet.subjectIds].sort())),
    });
}

// One correction belongs to the same reserved planning pass. The session guards
// each send against cancellation/source changes and records the request count.
// Transport/authentication/timeouts are not output errors and never loop here.
export async function storyPassWithRecovery(args) {
    const first = await storyPass(args);
    const refine = first.accepted && first.outputOverrun > 0;
    if (!refine && (first.accepted || !first.recoverableOutput)) return first;
    const failure = refine ? { error: 'Valid response is above sizing targets. Shorten prose without losing ids, prerequisites or unfinished initiatives: plan 1200, selected packet 600, RP analysis 300 tokens.' } : first;
    let correction;
    try { correction = correctionInput(args.input, failure, refine ? first.result : null); }
    catch (error) { return refine ? { ...first, recovery: { status: 'target-retained', reason: error.message } }
        : { ...first, error: `${first.error} ${error.message}`, recovery: { status: 'unavailable', reason: first.error } }; }
    const next = await storyPass({ ...args, input: correction.input,
        generate: prompt => args.generate(prompt, correction.system, correction.schema, { recoveryReason: failure.error }) });
    // A sizing target is not grounds to throw away an otherwise valid result.
    // Transaction/cancellation checks still run before the chosen result commits.
    if (refine && (!next.accepted || next.outputOverrun >= first.outputOverrun
        || preparationStructure(next.state) !== preparationStructure(first.state))) {
        return { ...first, recovery: { status: 'target-retained', reason: failure.error } };
    }
    return { ...next, recovery: { status: next.accepted ? refine ? 'shortened' : 'complete' : 'failed', reason: failure.error } };
}
