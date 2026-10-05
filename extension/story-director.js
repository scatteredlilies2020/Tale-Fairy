// One creative request. Continuity remains input, never a second memory ledger.
import { storyInput, nextPlanRevision, plannerInputLimit } from './bounded-story.js?working-plan=1&draft-budget=1&recovery=1&review-checkpoint=1&commit-revision=1&rp-opportunities=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&rp-activities=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1';
import { CAMPAIGN_MARKER, EVENT_POINTS_FORMAT, check, validCampaignState } from './campaign-planner.js?v=0.14.36&working-plan=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1';
import { WORKING_PLAN_VERSION, validateWorkingPlan, workingPlanProjection, planTokens } from './working-plan.js?rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-life=1&future-entry=1&autonomous-life=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1';
import { STORY_NODE_SCHEMA, STORY_SELECTION_SCHEMA, STORY_STRUCTURE_SCHEMA, previousStoryNodes,
    mergeStoryNodes, storyAncestors, validateStoryStructure, storyWriterMaterial } from './story-structure.js?story-structure=1';
import { fitStoryContext } from './story-budget.js?follow-through=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-throughline=1&story-life=1&concise-prompts=1&horizon-links=3&story-structure=1';
import { jsonrepair } from './vendor/jsonrepair/regular/jsonrepair.js?v=3.15.0';

export { nextPlanRevision, plannerInputLimit };
export const PLANNER_OUTPUT_LIMIT = 2200;
const text = maxLength => ({ type: 'string', minLength: 1, ...(maxLength ? { maxLength } : {}) });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const DIRECTOR_SCHEMA = { name: 'tale_fairy_story_director_v2', value: object({
    direction: text(600), reviewAfter: STORY_STRUCTURE_SCHEMA.properties.reviewAfter,
    upsert: { type: 'array', items: STORY_NODE_SCHEMA },
    retire: { type: 'array', items: text(80) }, select: { type: 'array', items: STORY_SELECTION_SCHEMA },
}) };

export const DIRECTOR_SYSTEM = `${CAMPAIGN_MARKER}
Organize this RP's story. Read its premise, characters, accepted play and memory. Return creative preparation, not a recap, memory ledger, writer audit or scene.

direction states the RP's wider direction in one sentence. Infer its expected experiences and interpret their significance without imposing a theme. Develop its particular interests, relationships, places and independent NPC/world activity. Invent compatible substance before the player asks. Quiet life, discoveries and conflict all have room. Introduce developments or positive or negative interruptions when they serve the story. No quotas, forced escalation or constant interruptions.

Maintain coexisting sagas, arcs and threads. A saga spans related arcs; an arc develops a sustained question; a thread follows a particular concern. Use the scale the RP needs, not mandatory levels. parentId groups smaller stories; empty text makes a root. links connect related stories without merging them. Different active stories need not converge. owner is an NPC, group or world process, never the player. interpretation explains the concern; stakes states what matters; expectation describes the experience and possible development, not a guaranteed result or next-reply script.

previous_preparation is private creative state, not history. upsert fully replaces a record under its existing id; new records use new_id_prefix. Omission preserves it. status is proposed, active, dormant, resolved or retired. Resolve only from accepted play; retire withdraws a proposal without claiming events occurred. Retiring a parent withdraws its descendants. Reassess completion, refusal, contradictions and changed premises. Do not revive a completed introduction, convert success back into an invitation, or retire a story merely because focus moved. Empty updates are valid. Keep the map compact.

select renews the public story context from scratch. Choose relevant proposed or active records, not every active story. [] leaves unsteered play. Supply a public title, context (ancestor kinds and public titles, outermost first), interpretation, stakes and expectation. development may add a fitting new opportunity or interruption; empty text leaves execution open. Describe RP expectations and meaning, not conditional commands beginning with "If", exact triggers, scene scripts, forced travel or player obligations. Redact secrets, private motives and unsupported knowledge, including ancestor titles. Do not claim proposed activity already happened. Selection never executes an action. The writer decides manifestation, timing, prose and pacing; its preset stands alone.

The player owns their actions, choices, thoughts and outcomes. References, explicit corrections and accepted play govern compatibility. Memory is fallible recall. Attribute character theories; preparation establishes no events or knowledge. Missing context proves no absence or resolution.

reviewAfter is a safety review horizon of 4 to 20 accepted AI replies, normally 12. Choose a shorter horizon for volatile stories, a longer one for stable arcs. It is not fictional time or a schedule for events. Explicit direction and scene boundaries can prompt earlier review. Return concise JSON. Aim for 900 tokens; omit unchanged records and avoid filling field limits.
`;

export function directorInput(args, maxTokens) {
    return storyInput(args, maxTokens, { system: DIRECTOR_SYSTEM, schema: DIRECTOR_SCHEMA, project: payload => {
        const { previous_plan, prior_story_map: _map, ...context } = payload;
        return { ...context, previous_preparation: {
            direction: previous_plan.direction || '', nodes: previousStoryNodes(previous_plan),
        }, ...(!args.resetPlan && !args.previousUsable && args.reconsiderHorizon ? {
            reconsider_horizon: { nodes: previousStoryNodes(args.reconsiderHorizon) },
        } : {}) };
    } });
}

// Repair complete JSON syntax locally. Never close a cut-off response or send
// another model request to repair punctuation.
export function parseDirectorResponse(raw) {
    const source = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { return JSON.parse(source); } catch { /* Inspect completeness before repair. */ }
    const stack = [];
    let quoted = false, escaped = false;
    if (!source.startsWith('{') || !source.endsWith('}')) throw Error('Incomplete story-director JSON');
    for (const char of source) {
        if (quoted) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') quoted = false;
        } else if (char === '"') quoted = true;
        else if (char === '{' || char === '[') stack.push(char);
        else if (char === '}' || char === ']') {
            if (stack.pop() !== (char === '}' ? '{' : '[')) throw Error('Incomplete story-director JSON');
        }
    }
    if (quoted || stack.length) throw Error('Incomplete story-director JSON');
    return JSON.parse(jsonrepair(source));
}

export async function directorPass({ state, input, source, generate }) {
    let result;
    const basisRevision = state.revision;
    try {
        result = await generate(input.prompt, DIRECTOR_SYSTEM, DIRECTOR_SCHEMA, { stage: 'director' });
        if (['length', 'max_tokens', 'max_output_tokens'].includes(String(result.finishReason).toLowerCase())) throw Error('Truncated story-director response');
        const raw = parseDirectorResponse(result.text);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Story director requires an object');
        for (const key of Object.keys(raw)) if (!Object.hasOwn(DIRECTOR_SCHEMA.value.properties, key)) throw Error(`Unexpected director field: ${key}`);
        check(raw.direction, DIRECTOR_SCHEMA.value.properties.direction, '$.direction');
        check(raw.reviewAfter, DIRECTOR_SCHEMA.value.properties.reviewAfter, '$.reviewAfter');
        for (const key of ['upsert', 'retire', 'select']) if (!Array.isArray(raw[key])) throw Error(`$.${key}: array required`);
        const notices = [], rejectedIds = new Set();
        const nodes = mergeStoryNodes(previousStoryNodes(input.previousPlan), raw.upsert, raw.retire,
            { check, playerNames: input.playerNames, newIdPrefix: input.newIdPrefix, notices, rejectedIds });
        const rows = new Map(nodes.map(node => [node.id, node]));
        const plan = { direction: raw.direction, threads: raw.direction, consequences: [], developments: [],
            storyStructure: { version: 1, reviewAfter: raw.reviewAfter, nodes, selection: [] } };
        const selectedIds = new Set();
        for (const entry of raw.select) {
            try {
                check(entry, STORY_SELECTION_SCHEMA, '$.select[]');
                if (selectedIds.has(entry.id)) throw Error('Duplicate selected story');
                const node = rows.get(entry.id);
                if (!node) throw Error('Selected story is unavailable');
                if ([node, ...storyAncestors(node, rows)].some(item => rejectedIds.has(item.id))) throw Error('Selection depends on a rejected story update');
                const candidate = structuredClone(plan);
                candidate.storyStructure.selection.push(structuredClone(entry));
                validateStoryStructure(candidate.storyStructure, check, input.playerNames);
                validateWorkingPlan(candidate, check, input.playerNames);
                if (fitStoryContext(storyWriterMaterial(candidate), [], { storyStructure: true }).omitted) throw Error('Public selection exceeds the writer context budget');
                Object.assign(plan, candidate); selectedIds.add(entry.id);
            } catch (error) { notices.push(`Selection withheld: ${error.message}`); }
        }
        validateWorkingPlan(plan, check, input.playerNames);
        const projection = workingPlanProjection(plan), selectedMaterial = [];
        if (state.revision !== basisRevision) throw Error('Preparation changed during planning');
        const archive = input.resetPlan ? [{ preparation: structuredClone(state), rebuild: true }] : structuredClone(state.archive || []);
        if (!input.resetPlan && state.revision) archive.push({ revision: state.revision, source: structuredClone(state.source),
            workingPlan: structuredClone(state.workingPlan), planEvidence: structuredClone(state.planEvidence),
            selectedMaterial: structuredClone(state.selectedMaterial), replaced: true });
        const next = { revision: input.nextRevision, ...projection, archive, source: structuredClone(source),
            preparationFormat: EVENT_POINTS_FORMAT, workingPlanVersion: WORKING_PLAN_VERSION,
            workingPlan: plan, planEvidence: {}, selectedMaterial };
        if (!validCampaignState(next)) throw Error('Story preparation failed saved-state validation');
        return { accepted: true, state: next, result, plannerNotices: notices, budget: {
            input: result.plannerInputTokens ?? input.inputTokens, plan: planTokens(plan), selected: planTokens(selectedMaterial),
        }, budgetNotices: [], outputOverrun: 0 };
    } catch (error) {
        return { accepted: false, state, error: error.message, ...(result ? { result } : {}) };
    }
}
