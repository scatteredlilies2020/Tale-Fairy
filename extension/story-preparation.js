// Two creative responsibilities, one transaction. Wider preparation never sees
// the local task list or previous writer packet; scene selection cannot edit it.
import { storyInput, storyPass, STORY_RESPONSE_SCHEMA, nextPlanRevision, plannerInputLimit, PLANNER_OUTPUT_LIMIT } from './bounded-story.js?working-plan=1&draft-budget=1&recovery=1&review-checkpoint=1&commit-revision=1&rp-opportunities=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&rp-activities=1&story-workshop=1&story-bridge=1';
import { CAMPAIGN_MARKER, check } from './campaign-planner.js?v=0.14.36&working-plan=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1';
import { mergeProgression, PROGRESSION_PATCH_SCHEMA } from './story-progression.js?story-progression=1&story-workshop=1';
import { validateWorkingPlan, planTokens } from './working-plan.js?rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-progression=1&story-workshop=1&story-bridge=1';
import { storyInputTokens } from './story-budget.js?follow-through=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1';
import { fitPlannerContext } from './planner-context.js?soft-targets=1&story-map=1&story-goal=2';
export { nextPlanRevision, plannerInputLimit, PLANNER_OUTPUT_LIMIT };

export const PREPARATION_REQUEST_LIMIT = 3; // two stages + one shared invalid-output repair
export const HORIZON_TARGET = 1400;
export const SCENE_TARGET = 900;
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const HORIZON_SCHEMA = { name: 'tale_fairy_horizon_v1', value: object({
    rpUnderstanding: structuredClone(STORY_RESPONSE_SCHEMA.value.properties.plan.properties.rpUnderstanding),
    progression: structuredClone(PROGRESSION_PATCH_SCHEMA),
}) };
HORIZON_SCHEMA.value.properties.progression.properties.upsert.items.required.push('experience');
const possibility = HORIZON_SCHEMA.value.properties.progression.properties.upsert.items.properties;
possibility.focus.description = 'Title of one specific prepared situation, undertaking or journey, rather than a category of life.';
possibility.experience.description = 'The actual invented substance: a particular place, people and something worth doing or discovering there. Decide what it contains now.';
possibility.next.properties.change.description = 'A concrete second experience that develops this particular situation; supply its content, not a promise to invent it later.';
possibility.later.properties.change.description = 'A distinct farther experience or transformed situation made possible by the intermediate development.';
export const SCENE_SCHEMA = { name: 'tale_fairy_scene_v2', value: structuredClone(STORY_RESPONSE_SCHEMA.value) };
SCENE_SCHEMA.value.properties.plan.required.push('openings');
delete SCENE_SCHEMA.value.properties.progression;
SCENE_SCHEMA.value.required = SCENE_SCHEMA.value.required.filter(key => key !== 'progression');
delete SCENE_SCHEMA.value.properties.plan.properties.rpUnderstanding;
SCENE_SCHEMA.value.properties.plan.required = SCENE_SCHEMA.value.properties.plan.required.filter(key => key !== 'rpUnderstanding');

export const HORIZON_SYSTEM = `${CAMPAIGN_MARKER}

Prepare a small shelf of possible FUTURE EPISODES for this RP, beyond its current situation. Your responsibility is the supply of new story substance across the broader world and cast. A different planner handles today's scene, its unfinished tasks and their immediate follow-through. These future episodes persist privately until there is a suitable way into them. Start from source_reference: which particular experiences would make this RP worth returning to over many scenes? Invent their substance from the setting, people, interests and established departures. Read accepted play for constraints and changed preferences, rather than as the subject to continue.

Return rpUnderstanding: basis (original/franchise/mixed/unclear), setting/era, the user's canonIntent (follow/flexible/alternate, otherwise unspecified), established divergence, anchors, departures, storyScope, characteristic experiences, an independentSource of activity and uncertainty. For original RP canonIntent and divergence are not-applicable. Supplied references, user corrections and accepted events outrank franchise knowledge or previous analysis. Treat unknown lore as provisional. Keep this analysis concise.

Do the creative preparation here, leaving the later writer to enact it. Produce up to three worked-out possibilities: actual situations, places to visit, undertakings or occasions, each with distinctive content worth spending scenes with. Choose their substance now: who is doing what, what is there to experience, and what makes this particular possibility interesting. Supply compatible inventions before they have been mentioned in play. Recurring pursuits and ordinary pleasures are as productive as larger concerns. The prepared set draws on the breadth of the source premise, including people and places absent from today's scene. A small RP can have a small world; a concluded vignette can have none.

focus names that particular possibility; owner is an NPC, group or world process; basis distinguishes established premises from proposed additions; drive gives an independent continuing interest. experience contains the first playable substance. next and later supply the substance of two different experiences farther along, with causal when conditions connecting them. Complete the creative chain: the contents of a discovery, the form of a project or the substance of a disagreement belong in preparation, rather than promises of future discoveries, projects or disagreements. These are possible futures, not scheduled events or decisions for the player. Conditions carry participation, access and changed prerequisites internally.

previous_horizon is preparation, not history. Return a progression patch: upsert creates or revises whole trajectories; retire explicitly withdraws a possibility with a reason. Omitted ids remain unchanged. Keep useful unplayed possibilities rather than rerolling them. Respond to actual refusals, discoveries and changed premises. If older preparation is only an errand or repair followed by using its result, retire that narrow trajectory in favor of substantive story territory; the separate local planner still retains unfinished local work. Different work needs a new id beginning with new_id_prefix. Passage of message turns is not story progress; no proposed event becomes an accepted fact here.

The merged horizon (analysis and all retained trajectories) has its own ${HORIZON_TARGET}-token target, separate from local work. Empty upsert/retire is appropriate when the existing range still serves this RP. Concise JSON only. No writer guidance is produced in this stage.
`;

export const SCENE_SYSTEM = `${CAMPAIGN_MARKER}

Prepare current NPC/world activity and select useful story material. prepared_horizon is private, provisional wider preparation from a separate workshop. It is read-only: the current scene determines access, not which wider possibilities survive. accepted_messages establish events; source_reference supplies premises. Planning drafts establish neither events nor player decisions. The writing preset owns prose, tone and pacing.

Return plan as a complete local replacement with at most four developments. direction and threads summarize continuing interests. consequences contains at most four relevant accepted facts. Each development has a stable id, NPC/world owner and control, a concrete question/experience, initiative, possible resolution and useful beyond. Group one shared situation in one development. trajectoryIds links to prepared_horizon trajectories only where causally related; unrelated local work uses []. Unselected or inaccessible wider possibilities remain privately prepared without needing a local row.

The local ledger records unfinished work; it is not the agenda for the next scene. Separately return openings: zero to two present or conditional entry situations into prepared_horizon. Each has trajectoryId, circumstance and access. This space is independent of the four local developments: a future episode does not need to evict an unfinished task or wait for one to finish. Reconsider previous openings against accepted play; they are proposals, not commitments or witnessed events. Once participation becomes an undertaking, a local development can track it.

Build the bridge from where play is now to something worth experiencing. Invent a compatible NPC activity, encounter, object, invitation, destination or shared occasion that makes a prepared possibility reachable, including at the next natural transition. A route need not already have been narrated. circumstance supplies the actual observable substance and any condition for encountering it, rather than announcing a theme or promising later invention. Use the particular people, interests and places of this RP. Ordinary companionship and voluntary activities can open sustained play just as readily as interruptions. Private ownership and hidden causes stay private; a nearby person is not access to everything they know.

For both developments and openings, access states the route and prerequisites (direct/local/contact/information/investigation); none keeps the material private. Respect accepted refusal, distance, knowledge and timing. Preparation may remain off-scene indefinitely. Compare the available experiences, including new openings, on their substance and current fit, not the age of their ids or whether they are already underway. A deliberate rest or concluded vignette may need no addition.

goal links NPC/world aims to playable subjectIds (a local development id or an opening's trajectoryId), with scope long-term, near-term or side-thread and an observable reachedWhen. goal=[] is valid. Private goals and links are not writer guidance. New local ids begin with new_id_prefix. Preserve an id's specific meaning. Each removed previous local development needs an exit: paused/dropped withdraws preparation; closed/changed requires exact accepted-message index/span evidence for an actual outcome. Openings are reconsidered offers, so dropping one needs no exit. Rebuilds may replace local drafts without exits. Retained ids cannot exit. New or changed consequences require observations with exact supplied spans; unchanged verified facts may carry. Omitted context proves neither resolution nor absence.

selected_material is [] or one integrated packet drawn from accessible developments and/or openings, including at least one chosen goal's subjectId. An opening is selectable directly by trajectoryId; a horizon without an opening remains private. Select worthwhile playable substance, not a recap of the latest player action or merely getting through today's routine. available carries the concrete entry circumstance and prerequisites; developing carries the actual contents of a further experience and its causal condition; lasting carries a distinct farther possibility with its condition. For an opening, use its prepared experience and causal stages. Each horizon has something specific to play, not just more familiarity, access or an unspecified future event. These fields contain story material, not instructions, rationale, emotional targets or decisions for the player. They never imply a proposal has already happened. Quiet unplayed material may remain available; [] is valid.

The local plan has its own ${SCENE_TARGET}-token target; selection has a separate 600-token target. The read-only horizon is outside those budgets and is saved verbatim. Compress wording, not distinct unfinished work or prerequisites. Concise JSON only.
`;

// Used for request invalidation, not sent as a third prompt/schema.
export const PREPARATION_SCHEMA = { name: 'tale_fairy_preparation_v1', horizon: HORIZON_SCHEMA, scene: SCENE_SCHEMA };
export const PREPARATION_SYSTEM = HORIZON_SYSTEM + '\n' + SCENE_SYSTEM;
const horizonOf = plan => ({ ...(plan.rpUnderstanding ? { rpUnderstanding: plan.rpUnderstanding } : {}), trajectories: plan.trajectories || [] });
const localOf = plan => {
    const { rpUnderstanding: _understanding, trajectories: _trajectories, ...local } = plan;
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
        previous_plan: localOf(payload.previous_plan), prepared_horizon: horizonOf(payload.previous_plan) }) });
    const horizon = storyInput(args, maxTokens, { system: HORIZON_SYSTEM, schema: HORIZON_SCHEMA, project: horizonContext });
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
    const horizon = { rpUnderstanding: raw.rpUnderstanding, trajectories };
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
            completeResponse: raw => ({ ...raw, plan: { ...raw.plan, rpUnderstanding: structuredClone(prepared.horizon.rpUnderstanding) },
                progression: structuredClone(prepared.progression) }),
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
