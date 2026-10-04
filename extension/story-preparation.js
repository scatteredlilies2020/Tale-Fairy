// Two creative responsibilities, one transaction. Wider preparation never sees
// the local task list or previous writer packet; scene selection cannot edit it.
import { storyInput, storyPass, STORY_RESPONSE_SCHEMA, nextPlanRevision, plannerInputLimit, PLANNER_OUTPUT_LIMIT } from './bounded-story.js?working-plan=1&draft-budget=1&recovery=1&review-checkpoint=1&commit-revision=1&rp-opportunities=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&rp-activities=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1';
import { CAMPAIGN_MARKER, check } from './campaign-planner.js?v=0.14.36&working-plan=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1';
import { mergeProgression, PROGRESSION_PATCH_SCHEMA, THROUGHLINE_SCHEMA } from './story-progression.js?story-progression=1&story-workshop=1&story-throughline=1';
import { validateWorkingPlan, planTokens } from './working-plan.js?rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1';
import { storyInputTokens } from './story-budget.js?follow-through=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-throughline=1';
import { fitPlannerContext } from './planner-context.js?soft-targets=1&story-map=1&story-goal=2&story-throughline=1';
import { OUTLOOK_REVIEW_SCHEMA, reviewOutlook, composeOutlookMaterial } from './story-outlook.js?story-outlook=1&story-throughline=1';
export { nextPlanRevision, plannerInputLimit, PLANNER_OUTPUT_LIMIT };

export const PREPARATION_REQUEST_LIMIT = 3; // two stages + one shared invalid-output repair
export const HORIZON_TARGET = 1400;
export const SCENE_TARGET = 900;
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const HORIZON_SCHEMA = { name: 'tale_fairy_horizon_v2', value: object({
    rpUnderstanding: structuredClone(STORY_RESPONSE_SCHEMA.value.properties.plan.properties.rpUnderstanding),
    throughline: structuredClone(THROUGHLINE_SCHEMA),
    progression: structuredClone(PROGRESSION_PATCH_SCHEMA),
}) };
HORIZON_SCHEMA.value.properties.progression.properties.upsert.items.required.push('experience');
const possibility = HORIZON_SCHEMA.value.properties.progression.properties.upsert.items.properties;
possibility.focus.description = 'Title of one specific prepared situation, undertaking or journey, rather than a category of life.';
possibility.experience.description = 'The actual invented substance: a particular place, people and something worth doing or discovering there. Decide what it contains now.';
possibility.next.properties.change.description = 'A concrete second experience that develops this particular situation; supply its content, not a promise to invent it later.';
possibility.later.properties.change.description = 'A distinct farther experience or transformed situation made possible by the intermediate development.';
export const SCENE_SCHEMA = { name: 'tale_fairy_scene_v3', value: structuredClone(STORY_RESPONSE_SCHEMA.value) };
SCENE_SCHEMA.value.properties.plan.required.push('openings');
delete SCENE_SCHEMA.value.properties.progression;
SCENE_SCHEMA.value.required = SCENE_SCHEMA.value.required.filter(key => key !== 'progression');
delete SCENE_SCHEMA.value.properties.plan.properties.rpUnderstanding;
SCENE_SCHEMA.value.properties.plan.required = SCENE_SCHEMA.value.properties.plan.required.filter(key => key !== 'rpUnderstanding');
SCENE_SCHEMA.value.properties.outlook = structuredClone(OUTLOOK_REVIEW_SCHEMA);
SCENE_SCHEMA.value.required.push('outlook');
const currentMaterial = SCENE_SCHEMA.value.properties.selected_material.items;
currentMaterial.required = ['subjectIds', 'available'];
delete currentMaterial.properties.developing;
delete currentMaterial.properties.lasting;
currentMaterial.properties.available.maxLength = 900;
currentMaterial.properties.subjectIds.maxItems = 3;

export const HORIZON_SYSTEM = `${CAMPAIGN_MARKER}

Develop this RP's unfolding story AND its wider supply of possible experiences. Read source_reference and accepted play together: what story is beginning, what is the player pursuing, and what could meaningfully grow from it across different situations? A new story already has a premise in its opening and first choices; preparation starts there, before a backlog exists. A separate planner handles immediate staging. Your responsibility is what that story can become, alongside other worthwhile territory in its world.

Return rpUnderstanding: basis (original/franchise/mixed/unclear), setting/era, the user's canonIntent (follow/flexible/alternate, otherwise unspecified), established divergence, anchors, departures, storyScope, characteristic experiences, an independentSource of activity and uncertainty. For original RP canonIntent and divergence are not-applicable. Supplied references, user corrections and accepted events outrank franchise knowledge or previous analysis. Treat unknown lore as provisional. Keep this analysis concise.

Return throughline: [] for deliberately unsteered or concluded play, otherwise one {focus, basis, trajectoryIds}. focus names the developing story beyond today's task; basis identifies the opening premise and demonstrated interests, distinguishing uncertainty. Link one or two prepared trajectories that develop it. A profession or the nearest activity alone is not the story's purpose. An inquiry can transform relations and future action; a journey can unfold through different communities; an ensemble's shared life can grow through pursuits and relationships. Infer the substance and scale from this RP. Keep this orientation through routine turns; revise when choices, discoveries or changed premises genuinely redirect it.

Prepare up to three concrete trajectories in total: first develop that throughline, then use remaining capacity for independent possibilities where useful. Supply actual people, places, undertakings or occasions and what makes them worth experiencing. Develop consequences into different situations, not more logistics for the current task. Broader means consequential development, not automatically bigger danger. Ordinary pleasures and recurring pursuits can sustain an entire RP. Independent possibilities add breadth without replacing the story being pursued. Compatible inventions can precede their mention in play; only accepted play enacts them.

focus names that particular possibility; owner is an NPC, group or world process; basis distinguishes established premises from proposed additions; drive gives an independent continuing interest. experience contains the first playable undertaking. next supplies a subsequent episode with different substantive play, growing from its outcome; later supplies a farther episode made possible by changed relationships, knowledge, capabilities or circumstances. Throughline trajectories look beyond resolving the opening incident or completing the first activity: preparation includes what life and further pursuits can become afterward. Complete the creative chain with actual contents, not promises of future discoveries or disagreements. Quiet, domestic and musical episodes deserve this range too, without escalation into danger or a public performance. These are possible futures, not scheduled events or decisions for the player. Causal when conditions carry participation, access and changed prerequisites internally.

previous_horizon is preparation, not history. Return a progression patch: upsert creates or revises whole trajectories; retire withdraws a possibility with a reason. Omitted ids remain unchanged. Preserve useful unplayed futures. Advance or redirect them for actual participation, refusal, discovery or premise changes, not elapsed message turns. Enrich a thin trajectory under its existing id when its subject still fits; different work needs a new id beginning with new_id_prefix. throughline is the complete current orientation and must link merged retained trajectories.

reconsider_horizon, when supplied, is an OLD proposal set from the same accepted conversation prefix whose reference inputs changed. It is neither current preparation nor evidence. Compare it against current references and choices, re-author compatible substance under new_id_prefix, and leave contradicted ideas behind. Its old ids, analysis, conditions and selections are not automatically restored. Current source and accepted play take precedence.

The merged horizon (analysis and all retained trajectories) has its own ${HORIZON_TARGET}-token target, separate from local work. Empty upsert/retire is appropriate when the existing range still serves this RP. Concise JSON only. No writer guidance is produced in this stage.
`;

export const SCENE_SYSTEM = `${CAMPAIGN_MARKER}

Prepare current NPC/world activity and select useful story material. prepared_horizon is private, provisional wider preparation from a separate workshop, including the story's throughline and independent possibilities. It is read-only: the current scene determines access, not which wider possibilities survive. accepted_messages establish events; source_reference supplies premises. Planning drafts establish neither events nor player decisions. The writing preset owns prose, tone and pacing.

Return plan as a complete local replacement with at most four developments. direction and threads summarize continuing interests. consequences contains at most four relevant accepted facts. Each development has a stable id, NPC/world owner and control, a concrete question/experience, initiative, possible resolution and useful beyond. Group one shared situation in one development. trajectoryIds links to prepared_horizon trajectories only where causally related; unrelated local work uses []. Unselected or inaccessible wider possibilities remain privately prepared without needing a local row.

The local ledger records unfinished work; it is not the agenda for the next scene. Separately return openings: zero to two present or conditional entry situations into prepared_horizon. Each has trajectoryId, circumstance and access. This space is independent of the four local developments. Renew the selected outlook's route here (or through a linked local development) against actual location, knowledge, timing and choices. Entries are proposals, not witnessed events. Once participation becomes an undertaking, a local development can track it.

Build the bridge from where play is now to something worth experiencing. Invent a compatible NPC activity, encounter, object, invitation, destination or shared occasion that makes a prepared possibility reachable, including at the next natural transition. A route need not already have been narrated. circumstance supplies the actual observable substance and any condition for encountering it, rather than announcing a theme or promising later invention. Use the particular people, interests and places of this RP. Ordinary companionship and voluntary activities can open sustained play just as readily as interruptions. Private ownership and hidden causes stay private; a nearby person is not access to everything they know.

For both developments and openings, access states the route and prerequisites (direct/local/contact/information/investigation); none keeps the material private. Respect accepted refusal, distance, knowledge and timing. Renew a plausible present or conditional route to the throughline when its pursuit remains live. When that route exists, its linked trajectories supply the selected outlook; an easier nearby side activity cannot replace them. Independent openings can enrich the current scene and remain prepared for later. Deliberate rest can clear the outlook without erasing preparation.

goal links NPC/world aims to playable subjectIds (a local development id or an opening's trajectoryId), with scope long-term, near-term or side-thread and an observable reachedWhen. goal=[] is valid. Private goals and links are not writer guidance. New local ids begin with new_id_prefix. Preserve an id's specific meaning. Each removed previous local development needs an exit: paused/dropped withdraws preparation; closed/changed requires exact accepted-message index/span evidence for an actual outcome. Openings are reconsidered offers, so dropping one needs no exit. Rebuilds may replace local drafts without exits. Retained ids cannot exit. New or changed consequences require observations with exact supplied spans; unchanged verified facts may carry. Omitted context proves neither resolution nor absence.

Two independent selections feed one writer packet. selected_material is [] or one CURRENT circumstance: subjectIds and available, from accessible local developments or openings. It can attend to today's quiet activity without supplying its own mid/long-term future. Keep it useful rather than recapping the player. The selected outlook's opening circumstance is included automatically; this current selection contributes only additional scene material, or []. For a locally tracked outlook, include that local id and its entry prerequisites here. The combined packet must include at least one goal's subjectId.

outlook reviews the selected FUTURE separately. previous_outlook persists across routine scene updates. action=keep with material=[] preserves its exact two horizons while you renew its entry route; local activity or another review is not a reason to replace it. action=replace supplies one {trajectoryId, developing, lasting} when first choosing, when accepted participation moves the chain forward, or when events/interests change it. action=clear with material=[] withdraws selection for refusal, lost access, deliberate closure or no suitable future; private preparation may remain. reason states the actual basis of this decision and stays private. A revised/retired trajectory requires replace/clear rather than keep.

Select one worthwhile prepared episode with an accessible opening or linked local development. developing supplies the concrete experience beyond today's situation and its causal/participation condition; lasting supplies a distinct farther experience from that trajectory, conditional on the intermediate development. Adapt its actual contents to this access, exposing neither hidden causes nor information without a route. Use several scenes' worth of substantive possibility, not completion of today's routine. The host combines these durable horizons with the fresh entry and current circumstance; private trajectories and access bases stay private. In writer fields, express participation and timing through positive if/when prerequisites, with the substance of what becomes possible. Permission, pressure and pacing commentary (such as what a scene "needs" or what anyone "has to" do) belongs in private reasoning, not the story material. Entry circumstances include their own encounter conditions.

The local plan has its own ${SCENE_TARGET}-token target; selection has a separate 600-token target. The read-only horizon is outside those budgets and is saved verbatim. Compress wording, not distinct unfinished work or prerequisites. Concise JSON only.
`;

// Used for request invalidation, not sent as a third prompt/schema.
export const PREPARATION_SCHEMA = { name: 'tale_fairy_preparation_v1', horizon: HORIZON_SCHEMA, scene: SCENE_SCHEMA };
export const PREPARATION_SYSTEM = HORIZON_SYSTEM + '\n' + SCENE_SYSTEM;
const horizonOf = plan => ({ ...(plan.rpUnderstanding ? { rpUnderstanding: plan.rpUnderstanding } : {}),
    ...(plan.throughline ? { throughline: plan.throughline } : {}), trajectories: plan.trajectories || [] });
const localOf = plan => {
    const { rpUnderstanding: _understanding, trajectories: _trajectories, throughline: _throughline, outlook: _outlook, ...local } = plan;
    return local;
};

// The workshop reads source + durable wider preparation + changes since the
// verified review, not the scene selector's rolling tail of repeated staging.
// Never discard unreviewed play. With no trusted coverage, keep the full input.
export function horizonContext(payload) {
    const { previous_plan, prior_story_map: _localDrafts, ...source } = payload;
    const boundary = payload.coverage?.reviewed_before;
    let messages = payload.accepted_messages;
    if (payload.coverage?.reviewed_context_optional === true && Number.isSafeInteger(boundary) && boundary > 0) {
        const latest = new Set(['user', 'assistant'].map(role => messages.findLast(message => message.role === role)?.index));
        messages = messages.filter(message => message.index >= boundary || latest.has(message.index));
    }
    return { ...source, accepted_messages: messages, coverage: { ...source.coverage,
        supplied_messages: messages.length, wider_lens_omitted_reviewed_messages: payload.accepted_messages.length - messages.length },
        previous_horizon: horizonOf(previous_plan) };
}

export function preparationInput(args, maxTokens) {
    const local = storyInput(args, maxTokens, { system: SCENE_SYSTEM, schema: SCENE_SCHEMA, project: payload => ({ ...payload,
        previous_plan: localOf(payload.previous_plan), previous_outlook: payload.rebuild ? [] : payload.previous_plan.outlook || [],
        prepared_horizon: horizonOf(payload.previous_plan) }) });
    const horizon = storyInput(args, maxTokens, { system: HORIZON_SYSTEM, schema: HORIZON_SCHEMA, project: payload => ({
        ...horizonContext(payload),
        ...(!args.resetPlan && !args.previousUsable && args.reconsiderHorizon ? { reconsider_horizon: horizonOf(args.reconsiderHorizon) } : {}),
    }) });
    return { ...local, horizonInput: horizon, inputTokens: Math.max(local.inputTokens, horizon.inputTokens),
        evidence: { status: [local, horizon].some(input => input.evidence.status === 'included') ? 'included' : 'omitted-or-unavailable',
            providers: [...new Set([...local.evidence.providers, ...horizon.evidence.providers])] } };
}

function fittedInput(input, payload, system, schema) {
    const measure = value => storyInputTokens(JSON.stringify(value), system, schema);
    payload = fitPlannerContext(payload, measure, input.inputLimit);
    const inputTokens = measure(payload);
    return { ...input, prompt: JSON.stringify(payload), inputTokens, inputOverTarget: Math.max(0, inputTokens - input.inputLimit) };
}

function parseHorizon(result, input) {
    if (['length', 'max_tokens', 'max_output_tokens'].includes(String(result.finishReason).toLowerCase())) throw Error('Truncated horizon response');
    const raw = JSON.parse(result.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    check(raw, HORIZON_SCHEMA.value);
    const trajectories = mergeProgression(input.previousPlan.trajectories || [], raw.progression, input.newIdPrefix, check, input.playerNames);
    const horizon = { rpUnderstanding: raw.rpUnderstanding, throughline: raw.throughline, trajectories };
    validateWorkingPlan({ ...horizon, direction: 'Private horizon', threads: 'Private horizon', consequences: [], developments: [], goal: [] }, check, input.playerNames);
    return { horizon, progression: raw.progression };
}

// There is one repair credit for the whole transaction, not a retry per stage.
// Valid over-target work is kept intact; no optional rewrite spends that credit.
export async function preparationPass({ state, input, source, generate }) {
    let repaired = false, recoveryReason = '', prepared, horizonResult;
    const repair = (stageInput, system, schema, error) => {
        repaired = true; recoveryReason = String(error).slice(0, 320);
        return fittedInput(stageInput, { ...JSON.parse(stageInput.prompt), response_correction: { error: recoveryReason } }, system, schema);
    };
    let horizonInput = input.horizonInput;
    for (;;) {
        let received = false;
        try {
            horizonResult = await generate(horizonInput.prompt, HORIZON_SYSTEM, HORIZON_SCHEMA,
                { stage: 'horizon', ...(repaired ? { recoveryReason } : {}) });
            received = true;
            prepared = parseHorizon(horizonResult, input);
            break;
        } catch (error) {
            if (repaired || !received && error.code !== 'TF_INVALID_PLANNER_RESPONSE') return { accepted: false, state, error: error.message,
                ...(repaired ? { recovery: { status: 'failed', reason: recoveryReason } } : {}) };
            horizonInput = repair(horizonInput, HORIZON_SYSTEM, HORIZON_SCHEMA, error.message);
        }
    }
    let sceneInput = fittedInput(input, { ...JSON.parse(input.prompt), prepared_horizon: prepared.horizon }, SCENE_SYSTEM, SCENE_SCHEMA);
    let result;
    for (;;) {
        result = await storyPass({ state, source, input: sceneInput, system: SCENE_SYSTEM, schema: SCENE_SCHEMA,
            completeResponse: raw => {
                const { outlook, ...response } = raw;
                const plan = { ...raw.plan, ...structuredClone(prepared.horizon) };
                reviewOutlook(input.rebuild ? {} : input.previousPlan, plan, outlook, check);
                const selected_material = composeOutlookMaterial(raw.selected_material, plan);
                // storyPass merges the same verified progression patch below.
                delete plan.trajectories;
                return { ...response, plan, selected_material, progression: structuredClone(prepared.progression) };
            },
            generate: (prompt, system, schema) => generate(prompt, system, schema,
                { stage: 'scene', ...(sceneInput !== input && sceneInput.correctionReason ? { recoveryReason: sceneInput.correctionReason } : {}) }),
        });
        if (result.accepted || repaired || !result.recoverableOutput) break;
        sceneInput = { ...repair(sceneInput, SCENE_SYSTEM, SCENE_SCHEMA, result.error), correctionReason: recoveryReason };
    }
    if (!result.accepted) return { ...result, ...(repaired ? { recovery: { status: 'failed', reason: recoveryReason } } : {}) };
    const budget = { horizonInput: horizonResult.plannerInputTokens ?? horizonInput.inputTokens,
        input: result.budget.input, horizon: planTokens(prepared.horizon), plan: planTokens(localOf(result.state.workingPlan)), selected: result.budget.selected };
    const targets = { horizonInput: input.inputLimit, input: input.inputLimit, horizon: HORIZON_TARGET, plan: SCENE_TARGET, selected: 600 };
    return { ...result, budget, outputOverrun: 0,
        budgetNotices: Object.entries(targets).filter(([key, target]) => budget[key] > target).map(([key, target]) => `${key} ${budget[key]}/${target} token target; kept intact`),
        ...(repaired ? { recovery: { status: 'complete', reason: recoveryReason } } : {}) };
}
