import { CAMPAIGN_MARKER, EVENT_POINTS_FORMAT, check } from './campaign-planner.js?v=0.14.36&working-plan=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2';
import { compactPlannerReference } from './planner-reference.js?history-budget=1';
import { compactCampaignSpeakers } from './campaign-evidence.js';
import { witnessMessages, resolveSpanWitnesses, SPAN_WITNESS_SCHEMA } from './accepted-witnesses.js?v=0.14.34&partial-evidence=1';
import { fitEvidenceProviders } from './evidence-providers.js';
import { SELECTED_MATERIAL_SCHEMA, validateSelectedMaterial } from './selected-material.js?v=0.14.36&rp-plot=1&story-goal=2';
import { storyInputTokens } from './story-budget.js?follow-through=1&soft-targets=1&story-map=1&story-goal=2';
import { fitPlannerContext } from './planner-context.js?soft-targets=1&story-map=1&story-goal=2';
import { WORKING_PLAN_SCHEMA, WORKING_PLAN_VERSION, WORKING_PLAN_LIMIT, SELECTED_PACKET_LIMIT, RP_UNDERSTANDING_LIMIT,
    PLANNER_INPUT_LIMIT, planTokens, plannerInputLimit, validateWorkingPlan, validateGoalSelection, workingPlanProjection } from './working-plan.js?rp-understanding=1&soft-targets=1&story-map=1&story-goal=2';
export { PLANNER_INPUT_LIMIT, PLANNER_OUTPUT_LIMIT, plannerInputLimit } from './working-plan.js?rp-understanding=1&soft-targets=1&story-map=1&story-goal=2';

const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const witnesses = { type: 'array', maxItems: 3, items: SPAN_WITNESS_SCHEMA };
const selection = structuredClone(SELECTED_MATERIAL_SCHEMA);
// Instructions live once in the system contract, not repeated in schema prose.
function withoutDescriptions(value) {
    if (Array.isArray(value)) return value.map(withoutDescriptions);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
        .filter(([key]) => key !== 'description').map(([key, child]) => [key, withoutDescriptions(child)]));
    return value;
}
const responseShape = withoutDescriptions(object({
    plan: WORKING_PLAN_SCHEMA,
    exits: { type: 'array', maxItems: 4, items: object({ id: text(80),
        disposition: { type: 'string', enum: ['closed', 'paused', 'dropped', 'changed'] }, reason: text(300), evidence: witnesses }) },
    observations: { type: 'array', maxItems: 4, items: object({ id: text(64), evidence: { ...witnesses, minItems: 1 } }) },
    selected_material: selection,
}));
responseShape.properties.plan.required.push('rpUnderstanding', 'goal');
responseShape.properties.plan.properties.goal.items.required.push('scope');
responseShape.properties.plan.properties.rpUnderstanding.required.push('storyScope', 'independentSource');
// Admission and saved-state compatibility keep the original field ceilings.
// Drafting needs much smaller allowances: those ceilings are not a budget to
// fill independently, and JSON keys/ids consume part of the shared token cap.
export const STORY_SCHEMA = { name: 'tale_fairy_working_plan_goals_v4', value: structuredClone(responseShape) };
const draftPlan = STORY_SCHEMA.value.properties.plan.properties;
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

export const STORY_SYSTEM = `${CAMPAIGN_MARKER}
Choose coexisting story goals and prepare opportunities tailored to this RP, not a recap, generic quest generator or next-paragraph script. Infer expected experiences from the supplied setting, characters, player premise and established departures, not just the current activity. A music-club RP can offer cake or shared music; a travelling RP can offer towns or discoveries. These are examples, not required events or genre presets. Ordinary pleasures count; conflict, combat and escalation are not defaults. Battles belong where this RP supports them. The writing preset owns prose, tone and pacing. Respect abilities, player choices and deliberate endings; no forced canon trajectory.

Use relevant past events to shape what is plausible, changed or meaningful, not to resurrect every old lead. Invent compatible opportunities without requiring prior mention; do not invent past enactment. The current scene governs access, not the limits of the RP's possibilities. Quiet play permits opportunity without requiring interruption.

Analyze before planning: rpUnderstanding is a compact, revisable interpretation, not verified history. Identify original/franchise/mixed/unclear basis, setting and relevant era; names alone do not prove a franchise. canonIntent reflects the user's stated preference (follow/flexible/alternate), otherwise unspecified. divergence separately describes established causal impact: none-established, local, major or unclear, not a count of edits. For original RP both are not-applicable; derive its rules and possibilities from the supplied world, not a borrowed canon.

anchors records applicable rules/relationships; departures records changes and affected prerequisites. storyScope names the particular setting/era/premise's wider story territory. experiences names fitting experiences. independentSource names one plausible NPC, routine, institution or world force beyond this scene; mundane or "None warranted" is valid. A prior_story_map is only a hypothesis, never evidence. uncertainty flags unknowns. Franchise knowledge is provisional; supplied references, explicit corrections and accepted play override it. No established change is not proof of complete canon fidelity. Following canon permits compatible expectations, not predetermined player choices. Local changes affect dependent possibilities. Major changes require new causal possibilities, not forced return to canon. Check direction, developments and selected_material against this analysis; earlier analysis is not evidence. Keep below ${RP_UNDERSTANDING_LIMIT} tokens within the plan budget.

Return a complete replacement plan, at most four developments; keep the whole plan below the ${WORKING_PLAN_LIMIT}-token target. direction holds the RP's broader range of fitting experiences, not today's agenda; retain that scope across scene changes, revising it for actual premise changes. Reframe a scene-bound previous direction from the RP basis. threads holds relevant long-running interests/relationships, not obligations. consequences holds at most four relevant witnessed results, not a lifetime ledger. Earlier history stays local.

goal holds coexisting aims linked by subjectId to retained developments. scope is long-term (wider direction), near-term (concrete experience), or side-thread (independent interest). Choose automatically from RP scope, relevant past and user interests; no quota per scope or required main quest. Choose concrete experiences beyond the latest reaction, not generic "advance the story" goals. A long-term and near-term goal may share a subjectId; side threads need not serve either. aim guides the WRITER's NPC/world activity, never assigns player objectives or guarantees outcomes. reachedWhen gives observable fulfillment; an offer alone is not fulfillment. Retain unfinished goals across reviews, scene changes and unselected turns. Revise individually for fulfillment, refusal, incompatibility or changed user direction, not mere delay. Completing one need not end others; completion need not spawn a successor. goal=[] permits unsteered play. Goal text goes to the writer: no hidden motives.

Draft below the target: aim for 800 tokens including JSON, at most 1200 prose characters, fewer for non-Latin text. Field maxima are not allocations. Preserve ids, distinct unfinished initiatives and prerequisites; shorten without dropping work. Avoid recaps and duplication.

Developments may be arcs, side activities or emerging opportunities. question is what can be explored or experienced, not necessarily a problem. initiative supplies concrete NPC/world activity. resolution says when this experience can conclude or pass, without requiring a challenge, reward or player participation. beyond offers fitting follow-through or a different experience, not another prerequisite. Keep an id's specific meaning; unrelated opportunities need new ids. access gives a plausible bridge and real prerequisites; none is private/unreachable. Do not expose private causes to the writer.

Reconcile actual play: continue useful work, retire ended attempts, introduce wider possibilities. When fitting, keep one concrete off-scene possibility in private developments, not forced interruptions or fallout from every current problem. Let actions solve obstacles without moving goalposts. Allow rest, celebration and departure. No turn timers, forced time skips, compulsory escalation or novelty quota. Fictional time, causes and player choices govern transitions; NPCs need not await manual activation.

For every removed development return one exit: closed means ended in play; changed means actual events superseded it. Both require exact supplied message/span evidence. paused and dropped withdraw preparation, not claim fictional completion; they require no evidence. Retained ids cannot exit. Omission is not closure. Migration/rebuild may replace old drafts without exits. New ids must start with new_id_prefix; never revive an ended attempt under a new id. Broader relationships may continue as different work.

consequences are accepted facts; other fields are preparation. New/changed facts need observations with ids and exact supplied index/span citations. Unchanged verified facts can carry. No invented player agreement, achievements or unseen actions as history. References supply premises; recall/drafts are not enactment. Current play overrides them; omitted context proves neither absence nor resolution.

selected_material is [] or one integrated packet below the ${SELECTED_PACKET_LIMIT}-token target including selected goals; aim for 300 tokens including JSON. When goals fit now, supply a packet including at least one goal's subjectId. Others stay saved, not resolved. Deliberate rest or no fitting access permits [] without deleting goals. Never force every goal into a reply or rotate on a timer. Reference only retained, accessible developments. available supplies concrete NPC/world steps, not a recap. Invitations are valid when backed by something to experience, not repeated permission-seeking. developing/lasting may carry relevant wider goals, not force them into this scene. Condition only genuine prerequisites; participation and outcomes stay open. No dialogue scripts, ordered beats, assigned player feelings, travel or commitments. Preserve useful unplayed material rather than rerolling. Empty beats filler. Concise JSON only.
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
    verifiedPlanEvidence = {}, evidence, continuity, continuityTokens = 1000, reviewedMessageCount = 0, resetPlan = false }, maxTokens = PLANNER_INPUT_LIMIT) {
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
            ...(reviewedMessageCount && (!previousUsable || resetPlan)
                ? { review_boundary: 'Verified prior review of this unchanged source prefix; old plans and outcomes are not restored by this coverage.' } : {}),
            omitted_context: 'Only supplied accepted spans prove new outcomes. Earlier history stays local; absence from this request is not resolution.' },
        ...(Object.keys(speakers.defaults).length ? { default_speaker_name_by_role: speakers.defaults } : {}),
        accepted_messages: witnessMessages(speakers.messages) };
    const measure = value => storyInputTokens(JSON.stringify(value), STORY_SYSTEM, STORY_SCHEMA);
    payload = fitPlannerContext(payload, measure, limit);
    const external = fitEvidenceProviders(evidence ?? (continuity ? [{ ...continuity, provider: 'continuity-memory' }] : []),
        Math.min(1000, Math.max(0, Number(continuityTokens) || 0)), value => measure({ ...payload, external_evidence: value }) <= limit);
    if (external.length) payload.external_evidence = external;
    const prompt = JSON.stringify(payload), inputTokens = measure(payload);
    const indices = payload.accepted_messages.map(m => m.index);
    return { prompt, inputTokens, inputLimit: limit, resetPlan, nextRevision, indices,
        evidenceMessages: structuredClone(messages.filter(m => indices.includes(m.index))),
        inputOverTarget: Math.max(0, inputTokens - limit),
        previousPlan: previous, rebuild: payload.rebuild, newIdPrefix, playerNames: names,
        verifiedPlanEvidence: structuredClone(trustedEvidence),
        evidence: { status: external.length ? 'included' : 'omitted-or-unavailable', providers: external.map(e => e.provider) },
        continuity: { status: external.some(e => e.provider === 'continuity-memory') ? 'included' : 'omitted-or-unavailable' },
        migration: { required: migration, omittedDrafts: previous.omittedDrafts || 0 } };
}

export async function storyPass({ state, input, source, generate }) {
    let result;
    let received = false;
    const basisRevision = state.revision;
    try {
        result = await generate(input.prompt, STORY_SYSTEM, STORY_SCHEMA);
        received = true;
        if (['length', 'max_tokens', 'max_output_tokens'].includes(String(result.finishReason).toLowerCase())) throw Error('Truncated working-plan response');
        const raw = JSON.parse(result.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
        check(raw, responseShape);
        validateWorkingPlan(raw.plan, check, input.playerNames);
        const before = new Map((input.previousPlan.developments || []).map(d => [d.id, d]));
        const after = new Set(raw.plan.developments.map(d => d.id));
        const exits = new Map(raw.exits.map(exit => [exit.id, exit]));
        if (exits.size !== raw.exits.length) throw Error('Duplicate development exit');
        for (const item of raw.plan.developments) {
            if (!before.has(item.id) && !item.id.startsWith(input.newIdPrefix)) throw Error('New development requires the supplied id prefix');
        }
        if (!input.rebuild && [...before.keys()].some(id => !after.has(id) && !exits.has(id))) throw Error('Removed development requires an explicit exit');
        // Transport preflight can shed more reviewed context when the active
        // tokenizer counts higher. Evidence must exist in the actual sent
        // request, not just the larger locally assembled candidate.
        const sent = JSON.parse(result.plannerPrompt ?? input.prompt);
        const supplied = new Set((sent.accepted_messages || []).flatMap(message => message.spans
            .map(span => `${message.index}:${Array.isArray(span) ? span[0] : span.span}`)));
        const resolve = refs => {
            if (refs.some(ref => !supplied.has(`${ref.index}:${ref.span}`))) throw Error('Witness requires an exact supplied accepted-message span');
            return resolveSpanWitnesses(refs, input.evidenceMessages);
        };
        const transitions = raw.exits.map(exit => {
            if (!before.has(exit.id) || after.has(exit.id)) throw Error('Exit requires a removed previous development');
            if (['closed', 'changed'].includes(exit.disposition) && !exit.evidence.length) throw Error('Closing or superseding an undertaking requires witnessed events');
            return { ...exit, witnesses: resolve(exit.evidence), source: structuredClone(source) };
        });
        // Inspect local history without sending its growing ids/evidence to the
        // model. New revision-prefixed ids also avoid accidental name reuse.
        const closed = new Set((state.archive || []).flatMap(entry => (entry.transitions || [])
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
            transitions, replaced: true });
        const next = { revision: input.nextRevision, ...projection, archive, source: structuredClone(source),
            preparationFormat: EVENT_POINTS_FORMAT, workingPlanVersion: WORKING_PLAN_VERSION,
            workingPlan: structuredClone(raw.plan), planEvidence, selectedMaterial: structuredClone(raw.selected_material) };
        const budget = { input: result.plannerInputTokens ?? input.inputTokens, plan: planTokens(raw.plan),
            selected: planTokens(raw.selected_material) + (raw.selected_material.length
                ? planTokens(raw.plan.goal.filter(goal => raw.selected_material[0].subjectIds.includes(goal.subjectId))) : 0),
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

function correctionInput(input, failure) {
    const limit = plannerInputLimit(input.inputLimit);
    let payload = JSON.parse(input.prompt);
    // Supply validation feedback as data. Never append an unbounded rejected
    // draft to the context, cut source text, or silently raise the configured target.
    const detail = String(failure.error).slice(0, 320);
    payload.response_correction = { error: planTokens(detail) <= 80 ? detail : 'Previous output failed validation. Check the complete response shape and shared budgets.' };
    // Replace verbose drafting advice, not story context, to make room for
    // feedback even when the original input used its entire local budget.
    const system = STORY_SYSTEM.replace(/Draft below the target:[^\n]+/u,
        'Automatic correction: return corrected complete JSON; 700 plan / 250 selected tokens. Preserve ids and unfinished work. response_correction is validation feedback, not history.')
        .replace(/A music-club RP can offer[^\n]+?genre presets\. /u, '');
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
    const measure = value => storyInputTokens(JSON.stringify(value), system, schema);
    payload = fitPlannerContext(payload, measure, limit);
    const tokens = measure(payload);
    return { input: { ...input, prompt: JSON.stringify(payload), inputTokens: tokens }, schema, system };
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
    try { correction = correctionInput(args.input, failure); }
    catch (error) { return refine ? first : { ...first, error: `${first.error} ${error.message}`, recovery: { status: 'unavailable', reason: first.error } }; }
    const next = await storyPass({ ...args, input: correction.input,
        generate: prompt => args.generate(prompt, correction.system, correction.schema, { recoveryReason: failure.error }) });
    // A sizing target is not grounds to throw away an otherwise valid result.
    // Transaction/cancellation checks still run before the chosen result commits.
    if (refine && (!next.accepted || next.outputOverrun >= first.outputOverrun)) {
        return { ...first, recovery: { status: 'target-retained', reason: failure.error } };
    }
    return { ...next, recovery: { status: next.accepted ? refine ? 'shortened' : 'complete' : 'failed', reason: failure.error } };
}
