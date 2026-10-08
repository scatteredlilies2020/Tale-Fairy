// One creative request. Memory supplies background, not a continuity audit.
import { storyInput, nextPlanRevision, plannerInputLimit } from './bounded-story.js?working-plan=1&draft-budget=1&recovery=1&review-checkpoint=1&commit-revision=1&rp-opportunities=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&rp-activities=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1&player-cards=1&present-future=1&creative-planning=1&fresh-summary=1&world-frame=1';
import { CAMPAIGN_MARKER, EVENT_POINTS_FORMAT, check, validCampaignState } from './campaign-planner.js?v=0.14.36&working-plan=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1&player-cards=1&present-future=1&creative-planning=1&world-frame=1';
import { WORKING_PLAN_VERSION, validateWorkingPlan, workingPlanProjection, planTokens } from './working-plan.js?rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-life=1&future-entry=1&autonomous-life=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1&player-cards=1&present-future=1&world-frame=1';
import { STORY_SELECTION_SCHEMA, STORY_STRUCTURE_SCHEMA, previousStoryNodes,
    STORY_NODE_RESPONSE_SCHEMA, STORY_SELECTION_RESPONSE_SCHEMA, storeStoryDescription, storyNodeForPlanner,
    STORY_FOUNDATION_RESPONSE_SCHEMA, mergeStoryFoundation,
    mergeStoryNodes, ongoingStoryNodes, storyAncestors, validateStoryStructure, storyWriterMaterial } from './story-structure.js?story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1&player-cards=1&present-future=1&world-frame=1';
import { fitStoryContext, storyInputTokens } from './story-budget.js?follow-through=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-throughline=1&story-life=1&concise-prompts=1&horizon-links=3&story-structure=1&ensemble-pressure=1&story-cards=1&player-cards=1&creative-planning=1';
import { jsonrepair } from './vendor/jsonrepair/regular/jsonrepair.js?v=3.15.0';

export { nextPlanRevision, plannerInputLimit };
export const PLANNER_OUTPUT_LIMIT = 3000;
const text = maxLength => ({ type: 'string', minLength: 1, ...(maxLength ? { maxLength } : {}) });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const DIRECTOR_SCHEMA = { name: 'tale_fairy_story_director_v7', value: object({
    reviewAfter: STORY_STRUCTURE_SCHEMA.properties.reviewAfter,
    foundation: STORY_FOUNDATION_RESPONSE_SCHEMA,
    upsert: { type: 'array', items: STORY_NODE_RESPONSE_SCHEMA },
    retain: { type: 'array', uniqueItems: true, items: text(80) },
    retire: { type: 'array', items: text(80) }, select: { type: 'array', items: STORY_SELECTION_RESPONSE_SCHEMA },
}) };
// Prompt-only transports place these field rules after the response shape,
// beside the actual output request rather than before the RP transcript.
DIRECTOR_SCHEMA.description = `foundation.reminder describes the setting's broad identity and enduring sources of movement: societies, institutions, customs, livelihoods, relationships, discovery and tensions. Exclude individual characters' names, biographies, jobs, households and scene details. Starting cast/factions do not set scope; explicit premise and author instructions do. AI-Dungeon-like sandboxes span ensembles and places; one-on-one RP can remain intimate. Original worlds support invention; canon is a fallible reference. Describe the setting itself; do not repeat prompt rules.

Keep a valid reminder verbatim on ordinary reviews, or return "" to retain it. It persists longer than any card and changes least often. A respite, role or viewpoint switch is not a new premise; finished cards do not redefine it. Correct inherited frames that include biographies or mistake local focus for scope. Otherwise revise only parts made irrelevant by explicit author direction or lasting world changes. Explain in foundation.changeReason, otherwise "". Character-specific concerns belong in cards. Quiet scenes can stay quiet; no quotas, forced escalation or convergence.`;

export const DIRECTOR_SYSTEM = `${CAMPAIGN_MARKER}
Be a creative story director: develop fresh present and future possibilities. Use premise, references, author instructions, recent RP and memory as background. Carry unfinished plans forward for a loose sense of continuity. Continuity Memory handles recall; do not fact-check history, reconcile memories, audit continuity, recap or write scenes.

foundation.reminder is the persistent setting frame; see its content and retention rules in the response contract.

foundation.scratchpad replaces brief creative considerations affecting future possibilities; "" when unnecessary. Ask what still matters and what can meaningfully develop. Divergence can invalidate canonical causes: do not force their events back into existence. Invent fitting people, places and pursuits; proposals are possibilities, not past events.

Read the world's particular character deeply: institutions, incentives, customs, relationships and implied forces. Star Wars can involve Sith influence, Jedi obligations, Senate patronage and trade interests; choose what fits its era and this RP. K-on's musical ambitions, school calendar and affectionate social habits differ from Baki's competitive martial world despite both being in Japan. Depth can be playful. Infer and invent boldly within established possibilities, including original NPCs and hidden motives. Give causal substance.

Use concise saga/arc/thread cards: broad currents, arcs and local threads, with no mandatory levels or counts. description gives the concern and what it encourages in one or two sentences. Descriptions and effects should outlast scenes; leave current actions and routine errands in chat. Rework inherited scene recaps into ongoing concerns, or retire them when none remains. effects holds up to three {label, pressure} pairs: concrete ongoing influences on opportunities, relationships, resources or choices. For example "Diplomatic strain": "Border tensions shape assignments, trade and family ties." These are narrative status effects, not numerical buffs or schedules; [] for none. endsWhen recognizes an end boundary with outcomes open; "" for ongoing concerns. parentId groups cards ("" for root); links connect without merging ([] for none). owner identifies the character, group or process the card concerns, including a player character. It is an organizing label, not permission to choose anyone's actions. Routine props need no cards.

previous_preparation contains candidates for present and future play. upsert replaces changed cards; new ids use new_id_prefix. retain lists unchanged cards still offering current pressure or future development. Upserted and selected cards are kept automatically; other omissions drop preparation. status is proposed, active, dormant, resolved or retired. Resolve from accepted play; retire withdraws proposals and descendants without claiming events occurred. Closed cards leave the map. Keep useful unfinished concerns across focus changes; drop obsolete ideas and recaps. Empty updates are valid.

recent_card_names lists earlier idea names, newest first, to vary ideas and avoid repetition. Names establish no history or outcomes.

select renews writer-facing cards from scratch; [] keeps only the RP reminder. Select relevant proposed/active currents and situations, including wider pressures that remain important during respite. Supply title, context (only parentId ancestors, outermost first; links are not parents), concise description and endsWhen. To select a dormant card, explicitly update it to active first; otherwise retain it without selection. Selected nodes' effects are included automatically, so do not repeat them here. development is an optional brief opportunity ("" otherwise). The writer shares your author-level view: include useful hidden motives, Sith involvement or other secrets when compatible, even before characters discover them. It decides manifestation and revelation; character knowledge follows play. Proposals stay distinguishable from established events. Ask what can meaningfully develop, not merely be mentioned again.

The writer chooses manifestation, timing, prose and pacing; its preset stands alone. The player controls ALL their characters' actions, choices, thoughts and outcomes. Respect current play, references and explicit corrections while inventing freely.

reviewAfter is 4 to 20 accepted AI replies, normally 12, shorter when plans change quickly. It sets the next planning review, not fictional time or an event schedule. Aim for 1,400 response tokens at setup and 900 on reviews; use more when needed for substance. Keep the writer packet around 1,000 tokens including orientation, effects and framing, below its 2,400 ceiling to allow author notes and variation. Preserve causal specifics without filling field limits.
`;

// Bounded title hints, never historical card contents. The host decides whether
// the live plan still belongs to this accepted chat before requesting hints.
export function recentCardNames(state) {
    const current = ongoingStoryNodes(state.workingPlan?.storyStructure?.nodes || []);
    const liveIds = new Set(current.map(node => node.id));
    const seen = new Set(current.map(node => node.title.trim().toLowerCase()));
    const names = [], snapshots = [state, ...(state.archive || []).slice(-12).reverse()];
    for (const snapshot of snapshots) {
        for (const node of [...(snapshot.workingPlan?.storyStructure?.nodes || [])].reverse()) {
            if (liveIds.has(node.id) || typeof node.title !== 'string') continue;
            const title = node.title.trim(), key = title.toLowerCase();
            if (!title || seen.has(key)) continue;
            if (names.length >= 12 || planTokens([...names, title]) > 240) return names;
            names.push(title); seen.add(key);
        }
    }
    return names;
}

// CM's public prompt ends with the complete Story so far section. Read that
// section only, leaving retrieval instructions and canonical records with CM.
export function continuityStorySummary(memory) {
    if (memory?.status !== 'current' || typeof memory.summary !== 'string') return '';
    const match = memory.summary.match(/(?:^|\r?\n)[ \t]*Story so far:[ \t]*\r?\n([\s\S]*)$/i);
    return match ? match[1].replace(/\s*<\/continuity>\s*$/i, '').trim() : '';
}

export function directorInput(args, maxTokens) {
    const fresh = args.resetPlan || !args.previousUsable && !args.reconsiderHorizon;
    const names = !fresh && args.previousUsable ? recentCardNames(args.state) : [];
    const memory = args.evidence?.find(item => item.provider === 'continuity-memory') ?? args.continuity;
    const summary = fresh && args.continuityEnabled === true ? continuityStorySummary(memory) : '';
    const omitRecall = args.continuityEnabled === false || Boolean(summary);
    const input = storyInput({ ...args,
        ...(omitRecall ? { evidence: args.evidence?.filter(item => item.provider !== 'continuity-memory'), continuity: undefined } : {}),
    }, maxTokens, { system: DIRECTOR_SYSTEM, schema: DIRECTOR_SCHEMA, project: payload => {
        const { previous_plan, prior_story_map: _map, ...context } = payload;
        const { review_boundary: _boundary, omitted_context: _omitted, ...coverage } = context.coverage;
        return { ...context, coverage: { ...coverage,
            context_use: 'Recent RP and summaries provide creative background. Carry useful plans forward; no continuity audit is requested.' },
        ...(summary ? { story_summary: { provider: 'continuity-memory', text: summary } } : {}),
        previous_preparation: {
            nodes: ongoingStoryNodes(previousStoryNodes(previous_plan)).map(storyNodeForPlanner),
            ...(previous_plan.storyStructure?.foundation ? { foundation: previous_plan.storyStructure.foundation } : {}),
        }, ...(!args.resetPlan && !args.previousUsable && args.reconsiderHorizon ? {
            reconsider_horizon: { nodes: ongoingStoryNodes(previousStoryNodes(args.reconsiderHorizon)).map(storyNodeForPlanner) },
        } : {}) };
    } });
    if (summary) {
        // The complete summary is part of fresh preparation, not optional
        // recall subject to the ordinary 1,000-token allowance.
        input.continuity.status = input.evidence.status = 'included';
        input.evidence.providers.unshift('continuity-memory');
    }
    // Add hints only after current plans, RP and memory have their allocation.
    // Precise tokenizer fitting can also drop the whole hint list first.
    if (names.length) {
        const prompt = JSON.stringify({ ...JSON.parse(input.prompt), recent_card_names: names });
        const inputTokens = storyInputTokens(prompt, DIRECTOR_SYSTEM, DIRECTOR_SCHEMA);
        if (inputTokens <= input.inputLimit) Object.assign(input, { prompt, inputTokens });
    }
    return input;
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
        // Read older replies without carrying their scene snapshot into new plans.
        for (const key of Object.keys(raw)) if (key !== 'direction' && !Object.hasOwn(DIRECTOR_SCHEMA.value.properties, key)) throw Error(`Unexpected director field: ${key}`);
        check(raw.reviewAfter, DIRECTOR_SCHEMA.value.properties.reviewAfter, '$.reviewAfter');
        // Legacy replies may omit retain; updated and selected cards still survive.
        if (raw.retain !== undefined) check(raw.retain, DIRECTOR_SCHEMA.value.properties.retain, '$.retain');
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
        const merged = mergeStoryNodes(previousNodes, raw.upsert, raw.retire,
            { check, playerNames: input.playerNames, newIdPrefix: input.newIdPrefix, notices, rejectedIds });
        const retainedIds = new Set(raw.retain ?? []);
        for (const record of [...raw.upsert, ...raw.select]) if (record?.id) retainedIds.add(record.id);
        const nodes = ongoingStoryNodes(merged, retainedIds), mergedRows = new Map(merged.map(node => [node.id, node]));
        const rows = new Map(nodes.map(node => [node.id, node]));
        // These compatibility fields are required by historical saved-state schemas.
        const orientation = foundation?.reminder || 'Ongoing roleplay.';
        const plan = { direction: orientation, threads: orientation, consequences: [], developments: [],
            storyStructure: { version: 1, reviewAfter: raw.reviewAfter, nodes, selection: [], ...(foundation ? { foundation } : {}) } };
        const selectedIds = new Set();
        for (const [index, supplied] of raw.select.entries()) {
            try {
                const entry = storeStoryDescription(supplied, STORY_SELECTION_RESPONSE_SCHEMA, check, '$.select[]');
                check(entry, STORY_SELECTION_SCHEMA, '$.select[]');
                if (selectedIds.has(entry.id)) throw Error('Duplicate selected story');
                const node = rows.get(entry.id);
                if (!node && mergedRows.has(entry.id)) {
                    responseAdjustments.push(`$.select[${index}]`);
                    continue;
                }
                if (!node) throw Error('Selected story is unavailable');
                const ancestors = storyAncestors(node, rows);
                if ([node, ...ancestors].some(item => rejectedIds.has(item.id))) throw Error('Selection depends on a rejected story update');
                // Selection cannot reactivate a dormant/closed card or its parent.
                // This is a redundant request for retained material, not a bad update.
                if ([node, ...ancestors].some(item => !['proposed', 'active'].includes(item.status))) {
                    responseAdjustments.push(`$.select[${index}]`);
                    continue;
                }
                // Links do not make parents. Rebuild only an inconsistent display
                // path from the validated graph, preserving the supplied story text.
                if (entry.context.length !== ancestors.length || entry.context.some((part, i) => part.kind !== ancestors[i].kind)) {
                    entry.context = ancestors.map(({ kind, title }) => ({ kind, title }));
                    responseAdjustments.push(`$.select[${index}].context`);
                }
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
