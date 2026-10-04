// Two creative responsibilities, one transaction. Wider preparation never sees
// the local task list or previous writer packet; scene selection cannot edit it.
import { storyInput, storyPass, STORY_RESPONSE_SCHEMA, nextPlanRevision, plannerInputLimit, PLANNER_OUTPUT_LIMIT } from './bounded-story.js?working-plan=1&draft-budget=1&recovery=1&review-checkpoint=1&commit-revision=1&rp-opportunities=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&rp-activities=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1';
import { CAMPAIGN_MARKER, check } from './campaign-planner.js?v=0.14.36&working-plan=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1';
import { mergeProgression, PROGRESSION_PATCH_SCHEMA, THROUGHLINE_SCHEMA, STORY_LIFE_SCHEMA } from './story-progression.js?story-progression=1&story-workshop=1&story-throughline=1&story-life=1';
import { validateWorkingPlan, planTokens } from './working-plan.js?rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-life=1&future-entry=1';
import { storyInputTokens, fitStoryContext } from './story-budget.js?follow-through=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-throughline=1&story-life=1';
import { fitPlannerContext } from './planner-context.js?soft-targets=1&story-map=1&story-goal=2&story-throughline=1&story-life=1';
import { OUTLOOK_REVIEW_SCHEMA, reviewOutlook, composeOutlookMaterial } from './story-outlook.js?story-outlook=1&story-throughline=1&story-life=1&future-entry=1';
export { nextPlanRevision, plannerInputLimit, PLANNER_OUTPUT_LIMIT };
import { materialHorizons } from './selected-material.js?v=0.14.36&rp-plot=1&story-goal=2&story-horizons=1&story-outlook=1&story-life=1';

export const PREPARATION_REQUEST_LIMIT = 3; // two stages + one shared invalid-output repair
export const HORIZON_TARGET = 1400;
export const SCENE_TARGET = 900;
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const HORIZON_SCHEMA = { name: 'tale_fairy_horizon_v3', value: object({
    rpUnderstanding: structuredClone(STORY_RESPONSE_SCHEMA.value.properties.plan.properties.rpUnderstanding),
    throughline: structuredClone(THROUGHLINE_SCHEMA),
    storyLife: structuredClone(STORY_LIFE_SCHEMA),
    progression: structuredClone(PROGRESSION_PATCH_SCHEMA),
}) };
HORIZON_SCHEMA.value.properties.progression.properties.upsert.items.required.push('experience');
const possibility = HORIZON_SCHEMA.value.properties.progression.properties.upsert.items.properties;
possibility.focus.description = 'Title of one specific prepared situation, undertaking or journey, rather than a category of life.';
possibility.experience.description = 'The actual invented substance: a particular place, people and something worth doing or discovering there. Decide what it contains now.';
possibility.next.properties.change.description = 'A concrete second experience that develops this particular situation; supply its content, not a promise to invent it later.';
possibility.later.properties.change.description = 'A distinct farther experience or transformed situation made possible by the intermediate development.';
export const SCENE_SCHEMA = { name: 'tale_fairy_scene_v6', value: structuredClone(STORY_RESPONSE_SCHEMA.value) };
SCENE_SCHEMA.value.properties.plan.required.push('openings', 'futureEntryVersion');
SCENE_SCHEMA.value.properties.plan.properties.openings.items.required.push('futureEntry');
SCENE_SCHEMA.value.properties.plan.properties.openings.items.properties.circumstance.description = 'Private present-scene grounding and unresolved work used to assess access. Never writer material.';
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
currentMaterial.properties.subjectIds.maxItems = 2;
// Current action already exists in the writer's conversation. The scene ledger
// is private; only authored future entry points and horizons cross this boundary.
// Keep the empty field for the common response/commit contract and old saves.
SCENE_SCHEMA.value.properties.selected_material.maxItems = 0;

export const HORIZON_SYSTEM = `${CAMPAIGN_MARKER}

Prepare the continuing life of this RP across episodes, not its next reply. Read source_reference and accepted play together. Separate the full premise and demonstrated interests from the incident currently occupying the conversation. A separate planner handles that incident. New stories need a wider future from their premise even before the player has accumulated choices.

Return rpUnderstanding: basis (original/franchise/mixed/unclear), setting/era, the user's canonIntent (follow/flexible/alternate, otherwise unspecified), established divergence, anchors, departures, storyScope, characteristic experiences, an independentSource of activity and uncertainty. For original RP canonIntent and divergence are not-applicable. Supplied references, user corrections and accepted events outrank franchise knowledge or previous analysis. Treat unknown lore as provisional. Keep this analysis concise.

Return storyLife: scope (open/bounded/undetermined), premise (what this RP is about), currentEpisode (today's bounded business), continuingLife (the relationships, pursuits, places and changing experiences that could sustain play beyond it), and horizonIds linking the trajectories that supply that life. Imagine the current incident settled or left behind: what remains worth playing? Its witnesses, paperwork and political fallout still belong to that incident's causal chain. A profession supplies part of a life, not its entire range. A deliberately bounded story can finish; uncertainty stays explicit rather than inventing a player's ambition.

Return throughline: [] for unsteered/concluded play, otherwise one {focus, basis, trajectoryIds} linking one or two trajectories. It records a developing thread, not an exclusive agenda. Prepare up to three concrete trajectories across the storyLife's useful range, including independently worthwhile life where the premise supports it. Each has actual people, places, undertakings or occasions worth experiencing. Ordinary companionship, recurring interests and discoveries can sustain progression without emergencies or escalation. An incident's consequences may be one strand alongside that wider life. Compatible inventions can precede their mention in play; only accepted play enacts them.

Each trajectory has focus (a particular undertaking), owner (NPC/group/world process), basis (established premises versus proposed additions), drive (independent interest) and experience (the invented first undertaking). next and later contain distinct experiences enabled by changed relationships, knowledge, capabilities or circumstances, with actual contents and causal when conditions. Repeating the first activity later or at a larger scale is insufficient. Separate work owners can pursue, finish, revise or abandon independently from genuinely joint experiences needing the player. Quiet interests can develop without danger or compulsory public performance. These are possible futures, never accepted completions, scheduled events or player decisions.

previous_horizon is preparation, not history. horizon_review=orient means the continuing-life orientation has never been established: reconstruct it from the source, opening and accepted choices, then audit the old proposals against it. An old review checkpoint covers local facts, not this wider responsibility. horizon_review=maintain reviews an already established orientation against new play. Return a progression patch: upsert creates or revises whole trajectories; retire withdraws a possibility with a reason. Omitted ids remain unchanged. Preserve useful unplayed futures through routine turns. Audit old preparation against storyLife: a shelf entirely downstream of the latest incident or confined to one occupational role needs broader substance, not automatic keep. Retire redundant proposals if capacity is needed, without declaring their events completed. Enrich a thin trajectory under its existing id when its subject still fits; different work needs a new id beginning with new_id_prefix. storyLife and throughline are complete current orientations linking merged retained trajectories. Refused opportunities stay withdrawn unless accepted play changes the relevant interest or access; do not repackage the same declined undertaking under a new id. Respect bounded closure without manufacturing a successor.

reconsider_horizon, when supplied, is an OLD proposal set from the same accepted conversation prefix whose reference inputs changed. It is neither current preparation nor evidence. Compare it against current references and choices, re-author compatible substance under new_id_prefix, and leave contradicted ideas behind. Its old ids, analysis, conditions and selections are not automatically restored. Current source and accepted play take precedence.

The merged horizon (analysis and all retained trajectories) has its own ${HORIZON_TARGET}-token target, separate from local work. Empty upsert/retire is appropriate when the existing range still serves this RP. Concise JSON only. No writer guidance is produced in this stage.
`;

export const SCENE_SYSTEM = `${CAMPAIGN_MARKER}

Prepare current NPC/world activity and select useful story material. prepared_horizon contains private, provisional wider possibilities. It is read-only: scenes determine access, not which futures survive. horizon_changes lists revisions and withdrawals since previous_plan/previous_outlook. Retired trajectories cannot appear in openings, outlook or development trajectoryIds. Their unfinished NPC work can remain local without those links. accepted_messages establish events; source_reference supplies premises. Planning drafts establish neither events nor player decisions. The writing preset owns prose, tone and pacing.

Return plan as a complete local replacement with at most four developments. direction and threads summarize continuing interests. consequences contains at most four relevant accepted facts. Each development has a stable id, NPC/world owner and control, a concrete question/experience, initiative, possible resolution and useful beyond. NPC-owned work includes what those actors can accomplish with their own resources while the player is occupied elsewhere. Participation is a prerequisite only when the action actually needs that character's decision or involvement; mere presence or a possible chance to intervene is not a dependency. Group one shared situation in one development. trajectoryIds links only causally related prepared trajectories; unrelated work uses [].

Return futureEntryVersion: 1 and openings: zero to two routes into prepared_horizon, separate from the four local developments. Each has trajectoryId, circumstance, access and futureEntry. circumstance is PRIVATE current status and unfinished immediate work. access privately states route/prerequisites (direct/local/contact/information/investigation); none keeps the future private. Renew access for the entry's own time and circumstances, including when a local undertaking tracks it. A future can be reachable IF play later reaches its place/contact; an unchosen destination is not itself lost access. State the later encounter or learning route as a prerequisite, rather than claiming it is available or known now. A nearby person is not access to their hidden knowledge.

futureEntry is the PUBLIC bridge: prerequisite names only the necessary fictional time, place or participation condition; possibility adds a particular forthcoming encounter, undertaking or changed circumstance beyond accepted play. Use this RP's people, interests and places; invent its actual substance rather than a theme or promise. Present-scene recap, next actions and access reasoning stay private. Eventual access can depend on a later transition while current play continues: do not teleport participants, invent a player commitment or interrupt the scene to surface a future. Entries are proposals, not witnessed events; joint participation remains conditional while NPC work can proceed independently. Refusal, distance, knowledge, timing and bounded closure govern selection. Rest can clear selection without deleting preparation.

goal links NPC/world aims to playable subjectIds (a local development id or an opening's trajectoryId), with scope long-term, near-term or side-thread and an observable reachedWhen. goal=[] is valid. Private goals and links are not writer guidance. New local ids begin with new_id_prefix. Preserve an id's specific meaning. Each removed previous local development needs an exit: paused/dropped withdraws preparation; closed/changed requires exact accepted-message index/span evidence for an actual outcome. Openings are reconsidered offers, so dropping one needs no exit. Rebuilds may replace local drafts without exits. Retained ids cannot exit. New or changed consequences require observations with exact supplied spans; unchanged verified facts may carry. Omitted context proves neither resolution nor absence.

Return selected_material: []. The host composes only selected futureEntry prerequisites/possibilities and outlook horizons. Private circumstance, unresolved hazards and local initiatives never substitute. Every selected future needs its own accessible opening and at least one must match a goal subjectId. Zero selection fits deliberate withdrawal, closure or no plausible future. An ordinary pause in current play does not alone withdraw conditional futures; selecting one commits no player action and schedules no interruption.

outlook reviews selected futures independently of routine scene updates: action=keep with material=[] preserves previous_outlook's exact horizons while renewing entries; action=replace supplies one or two {trajectoryId, developing, lasting} on initial selection, relevant changed events/interests or a revised selected trajectory; action=clear with material=[] withdraws for refusal, lost access, rest, closure or no suitable future. reason is private. Revised/retired trajectories require replace/clear; unrelated local activity does not. Complementary futures may coexist without simultaneous demands or automatic priority for the current incident.

developing gives concrete later experiences and lasting a distinct farther experience enabled by their outcomes, with genuine causal/participation conditions. Neither just repeats an opening later or at larger scale. NPC pursuits can evolve independently; only genuinely joint experiences require player involvement. Writer fields contain fictional possibilities and essential prerequisites, never hidden causes, access reasoning, pacing commands, permission, pressure or response choreography.

The local plan has its own ${SCENE_TARGET}-token target. The ENTIRE combined selection (entry circumstances and all future horizons) targets 600 tokens and must fit the 1,000-token writer envelope. The read-only horizon is outside those budgets and is saved verbatim. Compress wording, not distinct unfinished work or prerequisites. Concise JSON only.
`;

// Used for request invalidation, not sent as a third prompt/schema.
export const PREPARATION_SCHEMA = { name: 'tale_fairy_preparation_v2', horizon: HORIZON_SCHEMA, scene: SCENE_SCHEMA };
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
            completeResponse: raw => {
                const { outlook, ...response } = raw;
                const plan = { ...raw.plan, ...structuredClone(prepared.horizon) };
                reviewOutlook(input.rebuild ? {} : input.previousPlan, plan, outlook, check);
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
