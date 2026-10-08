// Two creative responsibilities, one transaction. Wider preparation never sees
// the local task list or previous writer packet; scene selection cannot edit it.
import { storyInput, storyPass, STORY_RESPONSE_SCHEMA, nextPlanRevision, plannerInputLimit, PLANNER_OUTPUT_LIMIT } from './bounded-story.js?working-plan=1&draft-budget=1&recovery=1&review-checkpoint=1&commit-revision=1&rp-opportunities=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&rp-activities=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1&player-cards=1&present-future=1&creative-planning=1&fresh-summary=1&world-frame=1&portable-frame=1';
import { CAMPAIGN_MARKER, check } from './campaign-planner.js?v=0.14.36&working-plan=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1&player-cards=1&present-future=1&creative-planning=1&world-frame=1&portable-frame=1';
import { mergeProgression, PROGRESSION_PATCH_SCHEMA, THROUGHLINE_SCHEMA, STORY_LIFE_SCHEMA } from './story-progression.js?story-progression=1&story-workshop=1&story-throughline=1&story-life=1&autonomous-life=1&relaxed-conditions=1&horizon-links=3';
import { validateWorkingPlan, planTokens } from './working-plan.js?rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-life=1&future-entry=1&autonomous-life=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1&player-cards=1&present-future=1&world-frame=1';
import { storyInputTokens, fitStoryContext } from './story-budget.js?follow-through=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-throughline=1&story-life=1&concise-prompts=1&horizon-links=3&story-structure=1&ensemble-pressure=1&story-cards=1&player-cards=1&creative-planning=1&portable-frame=1';
import { fitPlannerContext } from './planner-context.js?soft-targets=1&story-map=1&story-goal=2&story-throughline=1&story-life=1&creative-planning=1';
import { OUTLOOK_REVIEW_SCHEMA, reviewOutlook, composeOutlookMaterial } from './story-outlook.js?story-outlook=1&story-throughline=1&story-life=1&future-entry=1&autonomous-life=1&relaxed-conditions=1';
export { nextPlanRevision, plannerInputLimit, PLANNER_OUTPUT_LIMIT };
import { materialHorizons } from './selected-material.js?v=0.14.36&rp-plot=1&story-goal=2&story-horizons=1&story-outlook=1&story-life=1&autonomous-life=1&relaxed-conditions=1';
import { INITIATIVE_REVIEW_SCHEMA, reviewInitiative } from './story-initiative.js?autonomous-life=1&relaxed-conditions=1';

export const HORIZON_TARGET = 1400;
export const SCENE_TARGET = 900;
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const HORIZON_SCHEMA = { name: 'tale_fairy_horizon_v5', value: object({
    rpUnderstanding: structuredClone(STORY_RESPONSE_SCHEMA.value.properties.plan.properties.rpUnderstanding),
    throughline: structuredClone(THROUGHLINE_SCHEMA),
    storyLife: structuredClone(STORY_LIFE_SCHEMA),
    progression: structuredClone(PROGRESSION_PATCH_SCHEMA),
}) };
HORIZON_SCHEMA.value.properties.progression.properties.upsert.items.required.push('experience');
HORIZON_SCHEMA.value.properties.progression.properties.upsert.items.required.push('connection');
const possibility = HORIZON_SCHEMA.value.properties.progression.properties.upsert.items.properties;
possibility.focus.description = 'Name the situation, activity or journey.';
possibility.experience.description = 'Briefly describe the people or process, activity and source of interest. Leave incidental details open.';
// The base schema shares next/later objects. Keep their descriptions distinct.
possibility.next = structuredClone(possibility.next);
possibility.later = structuredClone(possibility.later);
possibility.next.properties.change.description = 'Specify the next experience, including a fitting recurrence.';
possibility.later.properties.change.description = 'Specify a farther experience; escalation is optional.';
export const SCENE_SCHEMA = { name: 'tale_fairy_scene_v8', value: structuredClone(STORY_RESPONSE_SCHEMA.value) };
SCENE_SCHEMA.value.properties.plan.required.push('openings', 'futureEntryVersion');
SCENE_SCHEMA.value.properties.plan.properties.openings.items.required.push('futureEntry');
SCENE_SCHEMA.value.properties.plan.properties.openings.items.properties.circumstance.description = 'Private scene facts and unresolved work used to assess access.';
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

const PLANNER_LANGUAGE = 'Use plain, concise language. Give enough substance to make a possibility interesting: who or what is involved and what begins or changes. Leave incidental props, exact gestures, dialogue and execution open. Omit stock phrases, vague promises and repetition. The writing preset controls prose, tone and pacing.';
const PLANNER_EVIDENCE = 'Source references, user corrections and accepted play govern compatibility. Accepted play records enactment; references supply premises. Memory and summaries are fallible recall; missing context proves no absence or resolution. Preparation establishes no events, player choices or character knowledge.';
const PLANNER_CORRECTION = 'For response_correction, repair rejected_response against the schema and supplied evidence. It is a failed draft, not accepted history. Return complete JSON.';

export const HORIZON_SYSTEM = `${CAMPAIGN_MARKER}

Prepare future experiences from the full RP premise, character interests and independent lives. A separate planner handles the current scene. Invent fitting places, people and activities before the player asks, including at initialization. Independent beginnings need no link to the current topic or arc. Fit this RP without mandatory travel, conflict, escalation or subplot quotas.

${PLANNER_LANGUAGE}
${PLANNER_EVIDENCE}
${PLANNER_CORRECTION}

rpUnderstanding: record basis, setting/era, stated canonIntent (otherwise unspecified), established divergence, anchors, departures, storyScope, characteristic experiences, independentSource and uncertainty. Keep departures concise; use empty text when no changes are established. For original RP, canonIntent/divergence are not-applicable. Franchise lore and previous analysis remain provisional.

storyLife: distinguish premise, currentEpisode and continuingLife (relationships, pursuits, places and recurring experiences); horizonIds link retained trajectories. Default scope to open unless the user requests a bounded story. An episode ending does not close the RP. Prepare life beyond completed threads without prolonging conflict, inventing player ambitions or treating boredom as consent to end. Include interests beyond a central profession.

throughline: [] or one {focus, basis, trajectoryIds} linking relevant retained trajectories. Usually prepare up to three useful futures: arcs, independent episodes or ordinary life; this is a target, not a limit on the merged horizon. Reuse ids for continuing work and explicitly retire obsolete proposals. Arcs have motivated actors, possible developments and room for resolution. Ordinary activities can recur without transformation or an arc payoff.

Each trajectory gives focus, owner (NPC/group/world process), basis distinguishing premises from inventions, drive, experience and connection (independent/continuation/recurrence). Sketch the first experience and distinct next/later possibilities. when names only a genuine dependency, broadly; use empty text if none. Leave the route between experiences open rather than detailing each step. Recurrence supplies another experience with modest variation. NPCs can initiate and finish their own work; player participation is required only for joint actions. Proposals prescribe no player choice, outcome or schedule.

previous_horizon contains proposals. horizon_review=orient revisits source, opening and choices; maintain checks that orientation against new play. progression.upsert creates/revises whole trajectories; retire withdraws with a reason; omission preserves. Keep useful unfinished futures across pauses and scene changes. Revise narrow or redundant preparation against the broader premise. Preserve ids for the same undertaking; new work uses new_id_prefix. storyLife/throughline reference merged trajectories. Refused work stays withdrawn unless accepted play changes interest or access. Reply count establishes neither progress nor expiry.

reconsider_horizon contains old proposals from the same accepted prefix after reference changes. Re-author compatible ideas under new_id_prefix against current references; discard contradictions. Old ids, analysis and selections are not restored automatically.

Target ${HORIZON_TARGET} tokens for the merged horizon, including retained trajectories. Compress repetition, preserving distinct experiences and conditions. Empty upsert/retire retains adequate preparation. Return concise JSON only; this stage produces no writer guidance.
`;

export const SCENE_SYSTEM = `${CAMPAIGN_MARKER}

Prepare NPC/world activity and select public story material. prepared_horizon is read-only; horizon_changes lists revisions/withdrawals. Remove retired trajectory links while preserving unfinished local work. The current scene determines access to wider preparation.

${PLANNER_LANGUAGE}
${PLANNER_EVIDENCE}
${PLANNER_CORRECTION}

plan: replace direction/threads, up to four witnessed consequences and four developments. Each development has a stable id, NPC/world owner/control, question, initiative, possible resolution, beyond and access. Group one situation per development; trajectoryIds links related futures, otherwise []. NPCs can act independently while the player is elsewhere; require participation only for joint actions. New local ids use new_id_prefix; retained ids keep their meaning.

Return futureEntryVersion: 1 and up to two openings, separate from developments. Each links trajectoryId to private circumstance/access and public futureEntry. access.route=none means inaccessible. Renew routes for their own time/place. Later travel or contact can be conditional without being chosen or known now. Proximity reveals no secrets.

futureEntry.prerequisite names a broad encounter condition only where needed; use empty text if none. Keep real timing, distance and participation dependencies, without inventing an exact cue, location, clock time or checklist. possibility briefly describes the forthcoming experience and its source of interest, leaving its execution open. Independent beginnings need no current-topic link. Preserve refusal and knowledge boundaries. Respect quiet play; unfinished conversation alone does not block independent activity. Public material contains story possibilities, not recaps, private motives, access reasoning or writing instructions.

initiative_review selects one NPC/world initiative through a renewed opening. material: {id, trajectoryId, owner, prerequisite, action}; match the trajectory owner and use new_id_prefix for new ids. action briefly describes what the owner begins or changes, without directing the player or specifying each gesture. prerequisite follows the same broad-condition rule; it may be empty. Choose an independent beginning, recurrence or arc development without waiting for a user request. keep/material=[] retains an unintroduced move; replace supplies new/revised material; withdraw/material=[] allows refusal, lost access or quiet. introduced requires exact NEW accepted-message index/span evidence of the initiative entering play; incidental details need not match word for word. material may supply a new id or []. Other actions require evidence=[]. Introduction is not arc completion. Check accepted play to avoid replay; conditions use fictional circumstances, never reply counts.

goal: private NPC/world aims linked to local ids or opening trajectoryIds, with scope and observable reachedWhen; [] is valid. Removed developments need exits: paused/dropped withdraw; closed/changed require exact supplied accepted-message index/span evidence. Retained ids cannot exit. Rebuilds and dropped openings need no exits. New/changed consequences need observations; unchanged verified facts carry.

outlook: keep/material=[] preserves previous_outlook while renewing entries; replace supplies one or two {trajectoryId, developing, lasting}; clear/material=[] withdraws. Changed/retired trajectories require replace/clear. Keep unaffected futures through pauses. Renew entry conditions after progress; do not re-offer completed introductions. developing/lasting supply distinct later experiences and conditions, including recurrence. Complementary futures require neither simultaneous uptake nor priority for today's incident.

Return selected_material: []. The host composes public entries, initiative and outlook. Each selected subject needs a renewed opening; at least one matches a goal. Empty selection fits quiet, withdrawal or no access. An episode ending does not close open RP or require a sequel.

Target ${SCENE_TARGET} tokens for local work and 600 for the combined public selection; the latter must fit 1,000 tokens. The read-only horizon is saved separately. Shorten wording while preserving distinct work and prerequisites. Return concise JSON only.
`;

// Used for request invalidation, not sent as a third prompt/schema.
export const PREPARATION_SCHEMA = { name: 'tale_fairy_preparation_v4', horizon: HORIZON_SCHEMA, scene: SCENE_SCHEMA };
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

// Each stage can correct its own invalid response. A horizon correction must
// not prevent scene recovery. Valid over-target work is kept intact.
export async function preparationPass({ state, input, source, generate }) {
    let repaired = false, recoveryReason = '', prepared, horizonResult;
    const repair = (stageInput, system, schema, error, rejectedResponse) => {
        repaired = true; recoveryReason = String(error).slice(0, 320);
        const response_correction = { error: recoveryReason,
            ...(typeof rejectedResponse === 'string' && rejectedResponse.trim() ? { rejected_response: rejectedResponse } : {}) };
        return fittedInput(stageInput, { ...JSON.parse(stageInput.prompt), response_correction }, system, schema);
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
            horizonInput = repair(horizonInput, HORIZON_SYSTEM, HORIZON_SCHEMA, error.message, horizonResult?.text);
        }
    }
    let sceneInput = fittedInput(input, { ...JSON.parse(input.prompt), prepared_horizon: prepared.horizon,
        horizon_changes: { upserted: prepared.progression.upsert.map(row => row.id),
            retired: prepared.progression.retire.map(row => row.id),
            retained: prepared.horizon.trajectories.map(row => row.id) } }, SCENE_SYSTEM, SCENE_SCHEMA);
    let result, sceneRepaired = false;
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
        if (result.accepted || sceneRepaired || !result.recoverableOutput) break;
        sceneRepaired = true;
        sceneInput = { ...repair(sceneInput, SCENE_SYSTEM, SCENE_SCHEMA, result.error, result.result?.text), correctionReason: recoveryReason };
    }
    if (!result.accepted) return { ...result, ...(repaired ? { recovery: { status: 'failed', reason: recoveryReason } } : {}) };
    const budget = { horizonInput: horizonResult.plannerInputTokens ?? horizonInput.inputTokens,
        input: result.budget.input, horizon: planTokens(prepared.horizon), plan: planTokens(localOf(result.state.workingPlan)), selected: result.budget.selected };
    const targets = { horizonInput: input.inputLimit, input: input.inputLimit, horizon: HORIZON_TARGET, plan: SCENE_TARGET, selected: 600 };
    return { ...result, budget, outputOverrun: 0,
        budgetNotices: Object.entries(targets).filter(([key, target]) => budget[key] > target).map(([key, target]) => `${key} ${budget[key]}/${target} token target; kept intact`),
        ...(repaired ? { recovery: { status: 'complete', reason: recoveryReason } } : {}) };
}
