// Two creative responsibilities, one transaction. Wider preparation never sees
// the local task list or previous writer packet; scene selection cannot edit it.
import { storyInput, storyPass, STORY_RESPONSE_SCHEMA, nextPlanRevision, plannerInputLimit, PLANNER_OUTPUT_LIMIT } from './bounded-story.js?working-plan=1&draft-budget=1&recovery=1&review-checkpoint=1&commit-revision=1&rp-opportunities=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&rp-activities=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1';
import { CAMPAIGN_MARKER, check } from './campaign-planner.js?v=0.14.36&working-plan=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1';
import { mergeProgression, PROGRESSION_PATCH_SCHEMA, THROUGHLINE_SCHEMA, STORY_LIFE_SCHEMA } from './story-progression.js?story-progression=1&story-workshop=1&story-throughline=1&story-life=1&autonomous-life=1';
import { validateWorkingPlan, planTokens } from './working-plan.js?rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-life=1&future-entry=1&autonomous-life=1';
import { storyInputTokens, fitStoryContext } from './story-budget.js?follow-through=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-throughline=1&story-life=1';
import { fitPlannerContext } from './planner-context.js?soft-targets=1&story-map=1&story-goal=2&story-throughline=1&story-life=1';
import { OUTLOOK_REVIEW_SCHEMA, reviewOutlook, composeOutlookMaterial } from './story-outlook.js?story-outlook=1&story-throughline=1&story-life=1&future-entry=1&autonomous-life=1';
export { nextPlanRevision, plannerInputLimit, PLANNER_OUTPUT_LIMIT };
import { materialHorizons } from './selected-material.js?v=0.14.36&rp-plot=1&story-goal=2&story-horizons=1&story-outlook=1&story-life=1&autonomous-life=1';
import { INITIATIVE_REVIEW_SCHEMA, reviewInitiative } from './story-initiative.js?autonomous-life=1';

export const PREPARATION_REQUEST_LIMIT = 3; // two stages + one shared invalid-output repair
export const HORIZON_TARGET = 1400;
export const SCENE_TARGET = 900;
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const HORIZON_SCHEMA = { name: 'tale_fairy_horizon_v4', value: object({
    rpUnderstanding: structuredClone(STORY_RESPONSE_SCHEMA.value.properties.plan.properties.rpUnderstanding),
    throughline: structuredClone(THROUGHLINE_SCHEMA),
    storyLife: structuredClone(STORY_LIFE_SCHEMA),
    progression: structuredClone(PROGRESSION_PATCH_SCHEMA),
}) };
HORIZON_SCHEMA.value.properties.progression.properties.upsert.items.required.push('experience');
HORIZON_SCHEMA.value.properties.progression.properties.upsert.items.required.push('connection');
const possibility = HORIZON_SCHEMA.value.properties.progression.properties.upsert.items.properties;
possibility.focus.description = 'Title of one specific prepared situation, undertaking or journey, rather than a category of life.';
possibility.experience.description = 'The actual invented substance: a particular place, people and something worth doing or discovering there. Decide what it contains now.';
possibility.next.properties.change.description = 'A concrete subsequent experience: development or a fitting recurrence with modest variation, not a promise to invent later.';
possibility.later.properties.change.description = 'A specific farther experience. Ordinary recurrence is valid; transformation and escalation are not required.';
export const SCENE_SCHEMA = { name: 'tale_fairy_scene_v7', value: structuredClone(STORY_RESPONSE_SCHEMA.value) };
SCENE_SCHEMA.value.properties.plan.required.push('openings', 'futureEntryVersion');
SCENE_SCHEMA.value.properties.plan.properties.openings.items.required.push('futureEntry');
SCENE_SCHEMA.value.properties.plan.properties.openings.items.properties.circumstance.description = 'Private present-scene grounding and unresolved work used to assess access. Never writer material.';
delete SCENE_SCHEMA.value.properties.progression;
SCENE_SCHEMA.value.required = SCENE_SCHEMA.value.required.filter(key => key !== 'progression');
delete SCENE_SCHEMA.value.properties.plan.properties.rpUnderstanding;
SCENE_SCHEMA.value.properties.plan.required = SCENE_SCHEMA.value.properties.plan.required.filter(key => key !== 'rpUnderstanding');
SCENE_SCHEMA.value.properties.outlook = structuredClone(OUTLOOK_REVIEW_SCHEMA);
SCENE_SCHEMA.value.required.push('outlook');
SCENE_SCHEMA.value.properties.initiative_review = structuredClone(INITIATIVE_REVIEW_SCHEMA);
SCENE_SCHEMA.value.required.push('initiative_review');
const currentMaterial = SCENE_SCHEMA.value.properties.selected_material.items;
currentMaterial.required = ['subjectIds', 'available'];
delete currentMaterial.properties.developing;
delete currentMaterial.properties.lasting;
currentMaterial.properties.available.maxLength = 900;
currentMaterial.properties.subjectIds.maxItems = 2;
// Current action already exists in the writer's conversation. The scene ledger
// is private; only authored future entry points and horizons cross this boundary.
// Keep the empty field for the common response/commit contract and old saves.
SCENE_SCHEMA.value.properties.selected_material.maxItems = 0;

export const HORIZON_SYSTEM = `${CAMPAIGN_MARKER}

Prepare the continuing life of this particular RP, not an expansion of its current conversation. Start from source_reference, the full premise, character interests and independent lives; use accepted play for compatibility, preferences and actual progress. A separate planner handles the present scene. Imagine the current topic absent: what other experiences belong in this life? New beginnings need no topical or causal connection to today's scene, its aftermath or the active arc. Invent fitting substance before the player asks for it, even in a new RP. No genre templates, mandatory travel, antagonist, crisis or subplot quotas.

Return rpUnderstanding: basis (original/franchise/mixed/unclear), setting/era, the user's canonIntent (follow/flexible/alternate, otherwise unspecified), established divergence, anchors, departures, storyScope, characteristic experiences, an independentSource of activity and uncertainty. For original RP canonIntent and divergence are not-applicable. Supplied references, user corrections and accepted events outrank franchise knowledge or previous analysis. Treat unknown lore as provisional. Keep this analysis concise.

Return storyLife: scope (open/bounded/undetermined), premise (the ongoing appeal of this RP), currentEpisode (today's business), continuingLife (relationships, pursuits, places and recurring experiences beyond it), and horizonIds linking that life. Default to open unless the user requests a bounded story; an episode ending is not evidence of RP closure. Renew life beyond completed threads, including unrelated beginnings, without prolonging conflicts or escalating stakes. A profession can be central without monopolizing every experience. Never invent a player's ambition or infer boredom as permission to end the RP.

Return throughline: [] when no central thread is useful, otherwise one {focus, basis, trajectoryIds} linking one or two trajectories. It is not an exclusive agenda. Prepare up to three concrete trajectories across the RP's useful range: arcs, independent episodes or ordinary life. Arcs have motivated actors, developments, possible turning points and room for resolution, never a predetermined player journey. Not every activity serves an arc or needs a payoff. Characters can initiate and finish their own work; only accepted play enacts proposals.

Each trajectory has focus, owner (NPC/group/world process), basis (established premises versus proposed additions), drive (independent interest), experience (actual invented first experience), and connection: independent, continuation or recurrence relative to present play. This label explains the idea, not a quota. next/later supply concrete subsequent experiences with necessary when conditions; a relationship or activity may recur with small differences. Familiar encounters, another place or another undertaking can be worthwhile without transformation. Recurrence means another actual experience, not endlessly discussing starting one. Do not manufacture causal links between independent stories. Only genuinely joint actions require player participation. Preparation commits no player choice, outcome or schedule.

previous_horizon is preparation, not history. horizon_review=orient reconstructs the wider premise from source, opening and choices; maintain reviews that orientation against new play. Return a progression patch: upsert revises/creates whole trajectories; retire withdraws with a reason; omission preserves. Keep useful unfinished futures, not an automatic reroll. Review a shelf trapped downstream of the current topic against the broader premise. Retire spent/redundant proposals to make room, without asserting events. Enrich the same subject under its id; different work uses new_id_prefix. storyLife/throughline link merged retained trajectories. Refused undertakings stay withdrawn unless accepted play changes the relevant interest or access, never repackage a refusal. Routine pauses and turn counts prove neither progress nor expiry. Open RP needs continuing preparation beyond completed episodes; explicit user-requested closure does not.

reconsider_horizon, when supplied, is an OLD proposal set from the same accepted conversation prefix whose reference inputs changed. It is neither current preparation nor evidence. Compare it against current references and choices, re-author compatible substance under new_id_prefix, and leave contradicted ideas behind. Its old ids, analysis, conditions and selections are not automatically restored. Current source and accepted play take precedence.

The merged horizon (analysis and all retained trajectories) has its own ${HORIZON_TARGET}-token target, separate from local work. Empty upsert/retire is appropriate when the existing range still serves this RP. Concise JSON only. No writer guidance is produced in this stage.
`;

export const SCENE_SYSTEM = `${CAMPAIGN_MARKER}

Prepare NPC/world activity and select story substance. prepared_horizon is read-only, provisional wider preparation; scenes determine access, not which futures survive. horizon_changes lists revisions/withdrawals. Remove retired trajectory links, not unfinished local work. accepted_messages establish events; source_reference supplies premises; drafts establish neither events nor player choices. The writing preset owns prose, tone and pacing.

Return a complete local plan: direction/threads, up to four accepted consequences and four developments. Each development has a stable id, NPC/world owner/control, question/experience, initiative, possible resolution and beyond. NPCs can act with their own resources while the player is elsewhere. Participation is a prerequisite only when actually needed, never merely because the player could intervene. Group one situation per development; trajectoryIds links only related futures, otherwise [].

Return futureEntryVersion: 1 and zero to two openings, separate from local developments. Each has trajectoryId, PRIVATE circumstance (present grounding), PRIVATE access (route/prerequisites; none means inaccessible), and PUBLIC futureEntry. Renew routes for their own time/place, even when locally tracked. A later destination/contact can be conditional access without being chosen or known now. Proximity to someone does not reveal their secrets.

futureEntry is the PUBLIC bridge: prerequisite gives necessary fictional time/place/participation conditions; possibility supplies an actual forthcoming experience, not a theme or recap. Unrelated beginnings need no connection to the current conversation. A later transition can supply access without teleportation or a player commitment. Entries remain proposals; only joint actions need player participation. Refusal, distance, knowledge and timing govern selection. Quiet play need not be interrupted, but an unfinished conversation is not an indefinite veto on independent life.

Return initiative_review for one selected NPC/world action that brings preparation into play, separate from later possibilities. material contains {id, trajectoryId, owner, prerequisite, action}; use a renewed opening and its trajectory owner, revision-prefixed new ids, and only public observable substance. State what the actor initiates, not what the player must do; never reveal private motives. Choose a fitting independent beginning, recurrence or arc development, not automatically the next local chore. No user request/manual revision is needed. keep with material=[] retains an unintroduced move; replace supplies a new/revised move; withdraw with material=[] allows refusal, lost access or deliberate quiet. introduced requires exact NEW accepted-message span evidence for the previous move entering play; it may supply a new move with a new id, or []. Introduction is not arc completion. Other actions require evidence=[]. Planning/repeated injection is not enactment. Check current play before reusing a move; do not repeat an already introduced encounter. Conditions may be immediate or a suitable later occasion, never a reply-count schedule.

goal links NPC/world aims to a local id or opening trajectoryId, with scope and observable reachedWhen; [] is valid. Goals stay private. New local ids use new_id_prefix; preserve meanings. Removed local developments need exits: paused/dropped withdraw; closed/changed require exact accepted-message index/span evidence. Rebuilds and dropped openings need no exits; retained ids cannot exit. New/changed consequences need witnessed observations; unchanged verified facts carry. Omitted context proves neither resolution nor absence.

Return selected_material: []. The host composes public future entries, selected initiative and outlook horizons only. Private scene work/reasoning never substitutes. Each selected future/initiative needs a renewed opening; at least one selected subject matches a goal. Zero selection fits deliberate quiet, withdrawal or no plausible access, not a rule to wait for the user to invent the next plot. Finishing an episode does not close open RP; select suitable next life without demanding novelty, escalation or a sequel.

outlook: keep with material=[] preserves exact previous_outlook horizons while renewing entries; replace supplies one or two {trajectoryId, developing, lasting}; clear with material=[] withdraws unsuitable futures. reason stays private. Changed/retired trajectories require replace/clear; unrelated activity does not. Renew entry conditions against accepted progress, never re-offer an entry taken or step finished. Preserve unaffected futures through routine pauses. Complementary futures need not demand simultaneous action or prioritize the current incident.

developing and lasting give concrete later experiences with necessary conditions. Recurring activities with modest variations are valid; neither escalation nor transformation is required. Do not repeat a finished introduction as unfinished work. NPC pursuits need player involvement only for genuinely joint experiences. Writer fields supply fictional substance, never hidden causes, access reasoning, pacing commands, pressure or response choreography.

The local plan has its own ${SCENE_TARGET}-token target. The ENTIRE combined selection (entry circumstances and all future horizons) targets 600 tokens and must fit the 1,000-token writer envelope. The read-only horizon is outside those budgets and is saved verbatim. Compress wording, not distinct unfinished work or prerequisites. Concise JSON only.
`;

// Used for request invalidation, not sent as a third prompt/schema.
export const PREPARATION_SCHEMA = { name: 'tale_fairy_preparation_v3', horizon: HORIZON_SCHEMA, scene: SCENE_SCHEMA };
export const PREPARATION_SYSTEM = HORIZON_SYSTEM + '\n' + SCENE_SYSTEM;
const horizonOf = plan => ({ ...(plan.rpUnderstanding ? { rpUnderstanding: plan.rpUnderstanding } : {}),
    ...(plan.throughline ? { throughline: plan.throughline } : {}), ...(plan.storyLife ? { storyLife: plan.storyLife } : {}), trajectories: plan.trajectories || [] });
const localOf = plan => {
    const { rpUnderstanding: _understanding, trajectories: _trajectories, throughline: _throughline, storyLife: _life, outlook: _outlook, ...local } = plan;
    return local;
};

// The workshop reads source + durable wider preparation + changes since the
// verified review, not the scene selector's rolling tail of repeated staging.
// Never discard unreviewed play. With no trusted coverage, keep the full input.
export function horizonContext(payload) {
    const { previous_plan, prior_story_map: _localDrafts, ...source } = payload;
    const boundary = payload.coverage?.reviewed_before;
    let messages = payload.accepted_messages;
    const orient = !previous_plan.storyLife;
    // An old local review is not evidence that the story's wider premise was
    // ever considered. Preserve the opening when migrating such preparation,
    // along with accepted choices, rather than showing only the incident tail.
    const opening = orient ? ['assistant', 'user'].map(role => messages.find(message => message.role === role)?.index)
        .filter(Number.isSafeInteger) : [];
    if (payload.coverage?.reviewed_context_optional === true && Number.isSafeInteger(boundary) && boundary > 0) {
        const latest = new Set(['user', 'assistant'].map(role => messages.findLast(message => message.role === role)?.index));
        messages = messages.filter(message => message.index >= boundary || latest.has(message.index)
            || orient && (message.role === 'user' || opening.includes(message.index)));
    }
    return { ...source, horizon_review: orient ? 'orient' : 'maintain', accepted_messages: messages, coverage: { ...source.coverage,
        ...(orient ? { protected_message_indices: opening } : {}),
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
    const horizon = { rpUnderstanding: raw.rpUnderstanding, throughline: raw.throughline, storyLife: raw.storyLife, trajectories };
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
    let sceneInput = fittedInput(input, { ...JSON.parse(input.prompt), prepared_horizon: prepared.horizon,
        horizon_changes: { upserted: prepared.progression.upsert.map(row => row.id),
            retired: prepared.progression.retire.map(row => row.id),
            retained: prepared.horizon.trajectories.map(row => row.id) } }, SCENE_SYSTEM, SCENE_SCHEMA);
    let result;
    for (;;) {
        result = await storyPass({ state, source, input: sceneInput, system: SCENE_SYSTEM, schema: SCENE_SCHEMA,
            completeResponse: (raw, { resolve }) => {
                const { outlook, initiative_review, ...response } = raw;
                const plan = { ...raw.plan, ...structuredClone(prepared.horizon) };
                reviewOutlook(input.rebuild ? {} : input.previousPlan, plan, outlook, check);
                reviewInitiative(input.rebuild ? {} : input.previousPlan, plan, initiative_review, {
                    check, resolve, prefix: input.newIdPrefix, sourceCount: state.source?.messageCount || 0, playerNames: input.playerNames,
                });
                const selected_material = composeOutlookMaterial(raw.selected_material, plan);
                if (fitStoryContext(selected_material.map(materialHorizons), []).omitted) {
                    throw Error('Combined selected material exceeds the 1,000-token writer envelope; shorten public entry/future wording together without losing prerequisites');
                }
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
