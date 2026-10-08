// One creative request. Continuity remains input, never a second memory ledger.
import { storyInput, nextPlanRevision, plannerInputLimit } from './bounded-story.js?working-plan=1&draft-budget=1&recovery=1&review-checkpoint=1&commit-revision=1&rp-opportunities=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&rp-activities=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1';
import { CAMPAIGN_MARKER, EVENT_POINTS_FORMAT, check, validCampaignState } from './campaign-planner.js?v=0.14.36&working-plan=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1';
import { WORKING_PLAN_VERSION, validateWorkingPlan, workingPlanProjection, planTokens } from './working-plan.js?rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-life=1&future-entry=1&autonomous-life=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1';
import { STORY_SELECTION_SCHEMA, STORY_STRUCTURE_SCHEMA, previousStoryNodes,
    STORY_NODE_RESPONSE_SCHEMA, STORY_SELECTION_RESPONSE_SCHEMA, storeStoryDescription, storyNodeForPlanner,
    STORY_FOUNDATION_RESPONSE_SCHEMA, mergeStoryFoundation,
    mergeStoryNodes, storyAncestors, validateStoryStructure, storyWriterMaterial } from './story-structure.js?story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1';
import { fitStoryContext } from './story-budget.js?follow-through=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-throughline=1&story-life=1&concise-prompts=1&horizon-links=3&story-structure=1&ensemble-pressure=1&story-cards=1';
import { jsonrepair } from './vendor/jsonrepair/regular/jsonrepair.js?v=3.15.0';

export { nextPlanRevision, plannerInputLimit };
export const PLANNER_OUTPUT_LIMIT = 2200;
const text = maxLength => ({ type: 'string', minLength: 1, ...(maxLength ? { maxLength } : {}) });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const DIRECTOR_SCHEMA = { name: 'tale_fairy_story_director_v5', value: object({
    direction: text(600), reviewAfter: STORY_STRUCTURE_SCHEMA.properties.reviewAfter,
    foundation: STORY_FOUNDATION_RESPONSE_SCHEMA,
    upsert: { type: 'array', items: STORY_NODE_RESPONSE_SCHEMA },
    retire: { type: 'array', items: text(80) }, select: { type: 'array', items: STORY_SELECTION_RESPONSE_SCHEMA },
}) };

export const DIRECTOR_SYSTEM = `${CAMPAIGN_MARKER}
Prepare movement for this RP, not a recap, memory ledger, writer audit or scene. Read the premise, references, author instructions, accepted play and available memory.

foundation.reminder is the stable RP interpretation: what sustains movement across its world and ensemble. AI-Dungeon-like sandboxes span characters, factions and places, while one-on-one RP can remain intimate. Distinguish world scope from current focus and player roles: missions for soldiers, livelihoods for civilians. Relationships, discovery, encounters and fitting tensions offer ongoing pressure. Original worlds support invention; canon is only a fallible reference. Keep open-ended scope beyond today's scene and cast.

Keep the reminder verbatim on ordinary reviews, or return "" to retain it. A respite or viewpoint switch is not a new premise. Change it for author direction, corrected interpretation, changed roles or lasting circumstances; explain in foundation.changeReason, otherwise "". Check appropriateness each review. direction describes the current phase separately. Author instructions adjust emphasis and pressure. Quiet scenes can stay quiet; movement needs no quota, forced escalation or convergence.

foundation.scratchpad replaces compact private notes: relevant established changes, tentative canon dependencies and uncertain implications, labeled accordingly; "" when unnecessary. Ask what changed, what still fits and the most plausible meaningful progression. Divergence can invalidate canonical causes: do not force their events back into existence. Invent compatible people, places and pursuits beyond mentioned material. Preparation proposes; accepted play establishes enactment, including off-screen events. Existing memory supplies history.

Read the world's particular character deeply: institutions, incentives, customs, relationships and implied forces. Star Wars can involve Sith influence, Jedi obligations, Senate patronage and trade interests; choose what fits its era and this RP. K-on's musical ambitions, school calendar and affectionate social habits differ from Baki's competitive martial world despite both being in Japan. Depth can be playful. Infer and invent boldly within established possibilities, including original NPCs and hidden motives. Give substance and causal interests, leaving prose style to the writer.

Use concise saga/arc/thread cards: broad currents, arcs and local threads, with no mandatory levels or counts. description gives the concern and what it encourages in one or two sentences. effects holds up to three {label, pressure} pairs: concrete ongoing influences on opportunities, relationships, resources or choices. For example "Diplomatic strain": "Cloud's demand makes border assignments and Hyuga protection politically sensitive." These are narrative status effects, not numerical buffs or schedules; [] for none. endsWhen recognizes an end boundary with outcomes open; "" for ongoing concerns. parentId groups cards ("" for root); links connect without merging ([] for none). owner names NPCs, institutions or processes driving it, never the player. Routine props need no cards.

previous_preparation is private, not history. upsert replaces a whole card under its id; new ids use new_id_prefix. Omission preserves cards. status is proposed, active, dormant, resolved or retired. Resolve only from accepted play; retire withdraws proposals, including descendants, without claiming events occurred. Reassess completion, refusal and changed premises. Do not revive completed introductions or abandon unfinished concerns merely because focus moved. Empty updates are valid; keep the map compact.

select renews writer-facing cards from scratch; [] keeps only the RP reminder. Select relevant proposed/active currents and situations, including wider pressures that remain important during respite. Supply title, context (ancestor kinds and titles, outermost first), concise description and endsWhen. Selected nodes' effects are included automatically, so do not repeat them here. development is an optional brief opportunity ("" otherwise). The writer shares your author-level view: include useful hidden motives, Sith involvement or other secrets when compatible, even before characters discover them. It decides manifestation and revelation; character knowledge follows play. Proposals stay distinguishable from established events. Ask what can meaningfully develop, not merely be mentioned again.

The writer interprets the reminder and cards, choosing manifestation, timing, prose and pacing; its preset stands alone. The player controls ALL their characters' actions, choices, thoughts and outcomes. Current play, references and explicit corrections govern compatibility; memory is fallible. Missing context proves neither absence nor resolution.

reviewAfter is 4 to 20 accepted AI replies, normally 12, shorter for volatile circumstances. It is a safety review horizon, not fictional time or an event schedule. Return concise JSON, aiming for 900 tokens; omit unchanged cards and avoid filling field limits.
`;

export function directorInput(args, maxTokens) {
    return storyInput(args, maxTokens, { system: DIRECTOR_SYSTEM, schema: DIRECTOR_SCHEMA, project: payload => {
        const { previous_plan, prior_story_map: _map, ...context } = payload;
        return { ...context, previous_preparation: {
            direction: previous_plan.direction || '', nodes: previousStoryNodes(previous_plan).map(storyNodeForPlanner),
            ...(previous_plan.storyStructure?.foundation ? { foundation: previous_plan.storyStructure.foundation } : {}),
        }, ...(!args.resetPlan && !args.previousUsable && args.reconsiderHorizon ? {
            reconsider_horizon: { nodes: previousStoryNodes(args.reconsiderHorizon).map(storyNodeForPlanner) },
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
        const previousNodes = previousStoryNodes(input.previousPlan), previousRows = new Map(previousNodes.map(node => [node.id, node]));
        const responseAdjustments = [];
        // Missing empty fields need no creative repair call. Preserve known
        // relationships on updates; explicitly supplied invalid values still fail.
        for (const [index, node] of raw.upsert.entries()) {
            if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
            const previous = previousRows.get(node.id);
            for (const [key, fallback] of [['parentId', previous?.parentId ?? ''], ['links', previous?.links ?? []],
                ...(Object.hasOwn(node, 'description') ? [['endsWhen', previous?.endsWhen ?? '']] : [])]) {
                if (Object.hasOwn(node, key)) continue;
                node[key] = structuredClone(fallback);
                responseAdjustments.push(`$.upsert[${index}].${key}`);
            }
        }
        for (const [index, entry] of raw.select.entries()) {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
            for (const key of ['development', ...(Object.hasOwn(entry, 'description') ? ['endsWhen'] : [])]) {
                if (Object.hasOwn(entry, key)) continue;
                entry[key] = '';
                responseAdjustments.push(`$.select[${index}].${key}`);
            }
        }
        const notices = [], rejectedIds = new Set();
        const foundation = mergeStoryFoundation(input.previousPlan.storyStructure?.foundation, raw.foundation, check, notices);
        const contextOptions = { storyStructure: true, orientation: foundation?.reminder || '' };
        if (fitStoryContext([], [], contextOptions).orientationOmitted) throw Error('RP orientation exceeds the writer context budget');
        const nodes = mergeStoryNodes(previousNodes, raw.upsert, raw.retire,
            { check, playerNames: input.playerNames, newIdPrefix: input.newIdPrefix, notices, rejectedIds });
        const rows = new Map(nodes.map(node => [node.id, node]));
        const plan = { direction: raw.direction, threads: raw.direction, consequences: [], developments: [],
            storyStructure: { version: 1, reviewAfter: raw.reviewAfter, nodes, selection: [], ...(foundation ? { foundation } : {}) } };
        const selectedIds = new Set();
        for (const supplied of raw.select) {
            try {
                const entry = storeStoryDescription(supplied, STORY_SELECTION_RESPONSE_SCHEMA, check, '$.select[]');
                check(entry, STORY_SELECTION_SCHEMA, '$.select[]');
                if (selectedIds.has(entry.id)) throw Error('Duplicate selected story');
                const node = rows.get(entry.id);
                if (!node) throw Error('Selected story is unavailable');
                if ([node, ...storyAncestors(node, rows)].some(item => rejectedIds.has(item.id))) throw Error('Selection depends on a rejected story update');
                const candidate = structuredClone(plan);
                candidate.storyStructure.selection.push(structuredClone(entry));
                validateStoryStructure(candidate.storyStructure, check, input.playerNames);
                validateWorkingPlan(candidate, check, input.playerNames);
                if (fitStoryContext(storyWriterMaterial(candidate), [], contextOptions).omitted) throw Error('Public selection exceeds the writer context budget');
                Object.assign(plan, candidate); selectedIds.add(entry.id);
            } catch (error) { notices.push(`Selection withheld: ${error.message}`); }
        }
        validateWorkingPlan(plan, check, input.playerNames);
        const projection = workingPlanProjection(plan), selectedMaterial = [];
        if (state.revision !== basisRevision) throw Error('Preparation changed during planning');
        const archive = input.resetPlan ? [] : structuredClone(state.archive || []);
        if (!input.resetPlan && state.revision) archive.push({ revision: state.revision, source: structuredClone(state.source),
            workingPlan: structuredClone(state.workingPlan), planEvidence: structuredClone(state.planEvidence),
            selectedMaterial: structuredClone(state.selectedMaterial), replaced: true });
        const next = { revision: input.nextRevision, ...projection, archive, source: structuredClone(source),
            preparationFormat: EVENT_POINTS_FORMAT, workingPlanVersion: WORKING_PLAN_VERSION,
            workingPlan: plan, planEvidence: {}, selectedMaterial };
        if (!validCampaignState(next)) throw Error('Story preparation failed saved-state validation');
        return { accepted: true, state: next, result, plannerNotices: notices, responseAdjustments, budget: {
            input: result.plannerInputTokens ?? input.inputTokens, plan: planTokens(plan), selected: planTokens(selectedMaterial),
        }, budgetNotices: [], outputOverrun: 0 };
    } catch (error) {
        return { accepted: false, state, error: error.message, ...(result ? { result } : {}) };
    }
}
