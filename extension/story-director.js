// One creative request. Continuity remains input, never a second memory ledger.
import { storyInput, nextPlanRevision, plannerInputLimit } from './bounded-story.js?working-plan=1&draft-budget=1&recovery=1&review-checkpoint=1&commit-revision=1&rp-opportunities=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&rp-activities=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3';
import { CAMPAIGN_MARKER, EVENT_POINTS_FORMAT, check } from './campaign-planner.js?v=0.14.36&working-plan=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3';
import { validateTrajectories } from './story-progression.js?story-progression=1&story-workshop=1&story-throughline=1&story-life=1&autonomous-life=1&relaxed-conditions=1&horizon-links=3';
import { WORKING_PLAN_VERSION, validateWorkingPlan, workingPlanProjection, planTokens } from './working-plan.js?rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-life=1&future-entry=1&autonomous-life=1&relaxed-conditions=1&rp-departures=1&horizon-links=3';
import { composeOutlookMaterial } from './story-outlook.js?story-outlook=1&story-throughline=1&story-life=1&future-entry=1&autonomous-life=1&relaxed-conditions=1';
import { materialHorizons, validateSelectedMaterial } from './selected-material.js?v=0.14.36&rp-plot=1&story-goal=2&story-horizons=1&story-outlook=1&story-life=1&autonomous-life=1&relaxed-conditions=1';
import { fitStoryContext } from './story-budget.js?follow-through=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-throughline=1&story-life=1&concise-prompts=1&horizon-links=3';
import { jsonrepair } from './vendor/jsonrepair/regular/jsonrepair.js?v=3.15.0';

export { nextPlanRevision, plannerInputLimit };
export const PLANNER_OUTPUT_LIMIT = 2200;
const text = maxLength => ({ type: 'string', minLength: 1, ...(maxLength ? { maxLength } : {}) });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const possibility = object({ id: text(80), title: text(240), owner: text(160), idea: text(1000), next: text(600), later: text(600) });
const selection = object({ id: text(80), route: { type: 'string', enum: ['none', 'direct', 'local', 'contact', 'information', 'investigation'] },
    when: { type: 'string', minLength: 0, maxLength: 300 }, action: text(700), next: text(900), later: text(900) });
export const DIRECTOR_SCHEMA = { name: 'tale_fairy_story_director_v1', value: object({
    direction: text(600), upsert: { type: 'array', items: possibility },
    retire: { type: 'array', items: text(80) }, select: { type: 'array', items: selection },
}) };

export const DIRECTOR_SYSTEM = `${CAMPAIGN_MARKER}
You are a story planner and director for this RP. Prepare interesting possibilities and fitting NPC/world activity. Read the supplied premise, characters, accepted play and memory; return only creative preparation. Do not summarize the conversation, rebuild memory, analyze the RP in separate fields, audit the writer or write a scene.

direction names the future creative direction in one sentence, without recapping current events or assigning player obligations. Prepare a few useful possibilities from this RP's particular people, interests and setting: developing stories, independent beginnings and recurring ordinary life. Invent compatible activities, places and people before the player asks. Avoid quotas, mandatory conflict or escalation. Each idea should have something worthwhile to experience; next and later give distinct possible developments or recurrences. Use concise, plain language and broad dependencies where they matter. Leave exact triggers, incidental details, dialogue and execution open.

previous_preparation is unused creative preparation, not accepted history. upsert adds or revises a whole possibility; keep existing ids for continuing work and use new_id_prefix for new ideas. Omission preserves unused possibilities; retire explicitly withdraws obsolete or refused proposals, without declaring events happened. Empty updates are valid when the preparation is adequate. Do not expand the library on every review or retire work merely because another scene took focus.

select chooses at most two fitting possibilities through a renewed route. Return each id, route, when, action, next and later. when names a broad encounter or participation condition only if needed; otherwise use empty text. action describes the forthcoming NPC/world activity, not a recap or instructions about prose. Describe new proposals prospectively; do not claim an unused idea has already been arranged or happened. next/later are public possibilities; redact private motives, secrets and unsupported knowledge. A route permits a possible encounter, not forced travel or player participation. none withholds that possibility. [] fits quiet play, lost access or refusal. Read newer play to avoid replaying an introduction or pursuing completed or declined work. Selected ideas may advance independently without requiring a player request.

The player owns their actions, choices, thoughts and outcomes. Possibility owners must be NPCs, groups or world processes. The writing preset owns prose, tone and pacing. Preparation establishes no events or character knowledge. Source references, explicit user corrections and accepted play govern compatibility; memory is fallible recall, and a perspective label alone says nothing about whether its claim has a basis. Preserve established canon history while attributing character theories precisely. Missing context proves no absence or resolution.

Return concise JSON matching the supplied shape. Aim for about 900 tokens of changes and selection; do not repeat unchanged possibilities or fill every field to its maximum.
`;

const stageText = stage => [stage.when, stage.change].filter(value => value?.trim()).join(': ');
const compactPossibility = row => ({ id: row.id, title: row.focus, owner: row.owner,
    idea: row.experience || row.drive, next: stageText(row.next), later: stageText(row.later) });

export function directorInput(args, maxTokens) {
    return storyInput(args, maxTokens, { system: DIRECTOR_SYSTEM, schema: DIRECTOR_SCHEMA, project: payload => {
        const { previous_plan, prior_story_map: _map, ...context } = payload;
        return { ...context, previous_preparation: {
            direction: previous_plan.direction || '', possibilities: (previous_plan.trajectories || []).map(compactPossibility),
        }, ...(!args.resetPlan && !args.previousUsable && args.reconsiderHorizon ? {
            reconsider_horizon: { possibilities: (args.reconsiderHorizon.trajectories || []).map(compactPossibility) },
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
        check(raw.direction, DIRECTOR_SCHEMA.value.properties.direction, '$.direction');
        for (const key of ['upsert', 'retire', 'select']) if (!Array.isArray(raw[key])) throw Error(`$.${key}: array required`);
        const notices = [], previous = input.previousPlan.trajectories || [];
        const rows = new Map(previous.map(row => [row.id, structuredClone(row)]));
        const updates = new Set(), withdrawals = new Set(), rejectedIds = new Set();
        // Bad optional items cannot discard independent, valid preparation.
        // Every admitted proposal still passes ownership, identity and shape checks.
        for (const row of raw.upsert) {
            try {
                check(row, possibility, '$.upsert[]');
                if (updates.has(row.id)) throw Error('Duplicate possibility id');
                if (!rows.has(row.id) && !row.id.startsWith(input.newIdPrefix)) throw Error('New possibility requires the supplied id prefix');
                const proposal = { id: row.id, focus: row.title, owner: row.owner, experience: row.idea,
                    basis: 'Creative proposal compatible with supplied context; not accepted history.', drive: row.title,
                    next: { when: '', change: row.next }, later: { when: '', change: row.later } };
                validateTrajectories([proposal], check, input.playerNames);
                rows.set(row.id, proposal); updates.add(row.id);
            } catch (error) {
                if (typeof row?.id === 'string') rejectedIds.add(row.id);
                notices.push(`Possibility withheld: ${error.message}`);
            }
        }
        for (const id of raw.retire) {
            if (typeof id !== 'string' || !rows.has(id) || updates.has(id) || withdrawals.has(id)) {
                notices.push('Unsupported or conflicting withdrawal ignored'); continue;
            }
            rows.delete(id); withdrawals.add(id);
        }
        const plan = { direction: raw.direction, threads: raw.direction, consequences: [], developments: [],
            trajectories: [...rows.values()], openings: [], futureEntryVersion: 1, outlook: [] };
        const selectedIds = new Set();
        for (const entry of raw.select) {
            try {
                check(entry, selection, '$.select[]');
                if (entry.route === 'none') continue;
                if (plan.openings.length >= 2) throw Error('Only two public possibilities are selected at once');
                if (selectedIds.has(entry.id)) throw Error('Duplicate selected possibility');
                if (rejectedIds.has(entry.id)) throw Error('Selection depends on a rejected possibility update');
                if (!rows.get(entry.id)?.experience) throw Error('Selected possibility is unavailable; it was withdrawn or could not be admitted');
                const candidate = structuredClone(plan);
                candidate.openings.push({ trajectoryId: entry.id, circumstance: 'Proposed encounter, not an established event.',
                    access: { route: entry.route, basis: entry.when || 'Selected compatible encounter; no additional prerequisite.' },
                    futureEntry: { prerequisite: entry.when, possibility: entry.action } });
                candidate.outlook.push({ trajectoryId: entry.id, developing: entry.next, lasting: entry.later });
                validateWorkingPlan(candidate, check, input.playerNames);
                const material = composeOutlookMaterial([], candidate);
                if (fitStoryContext(material.map(materialHorizons), []).omitted) throw Error('Public selection exceeds the writer context budget');
                Object.assign(plan, candidate); selectedIds.add(entry.id);
            } catch (error) { notices.push(`Selection withheld: ${error.message}`); }
        }
        validateWorkingPlan(plan, check, input.playerNames);
        const projection = workingPlanProjection(plan), selectedMaterial = composeOutlookMaterial([], plan);
        validateSelectedMaterial(selectedMaterial, projection.developments, check, projection.background);
        if (state.revision !== basisRevision) throw Error('Preparation changed during planning');
        const archive = input.resetPlan ? [{ preparation: structuredClone(state), rebuild: true }] : structuredClone(state.archive || []);
        if (!input.resetPlan && state.revision) archive.push({ revision: state.revision, source: structuredClone(state.source),
            workingPlan: structuredClone(state.workingPlan), planEvidence: structuredClone(state.planEvidence),
            selectedMaterial: structuredClone(state.selectedMaterial), replaced: true });
        const next = { revision: input.nextRevision, ...projection, archive, source: structuredClone(source),
            preparationFormat: EVENT_POINTS_FORMAT, workingPlanVersion: WORKING_PLAN_VERSION,
            workingPlan: plan, planEvidence: {}, selectedMaterial };
        return { accepted: true, state: next, result, plannerNotices: notices, budget: {
            input: result.plannerInputTokens ?? input.inputTokens, plan: planTokens(plan), selected: planTokens(selectedMaterial),
        }, budgetNotices: [], outputOverrun: 0 };
    } catch (error) {
        return { accepted: false, state, error: error.message, ...(result ? { result } : {}) };
    }
}
