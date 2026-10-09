// One creative request. Memory supplies background, not a continuity audit.
import { storyInput, nextPlanRevision, plannerInputLimit } from './bounded-story.js?working-plan=1&draft-budget=1&recovery=1&review-checkpoint=1&commit-revision=1&rp-opportunities=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&rp-activities=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1&player-cards=1&present-future=1&creative-planning=1&fresh-summary=1&world-frame=1&portable-frame=1&chapter-labels=1';
import { CAMPAIGN_MARKER, EVENT_POINTS_FORMAT, check, validCampaignState } from './campaign-planner.js?v=0.14.36&working-plan=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1&player-cards=1&present-future=1&creative-planning=1&world-frame=1&portable-frame=1&chapter-labels=1';
import { WORKING_PLAN_VERSION, validateWorkingPlan, workingPlanProjection, planTokens } from './working-plan.js?rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-life=1&future-entry=1&autonomous-life=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1&player-cards=1&present-future=1&world-frame=1&chapter-labels=1';
import { STORY_SELECTION_SCHEMA, STORY_STRUCTURE_SCHEMA, STORY_TERMINOLOGY, previousStoryNodes,
    STORY_NODE_RESPONSE_SCHEMA, STORY_SELECTION_RESPONSE_SCHEMA, storeStoryDescription, storyNodeForPlanner,
    STORY_FOUNDATION_RESPONSE_SCHEMA, mergeStoryFoundation,
    mergeStoryNodes, ongoingStoryNodes, storyAncestors, validateStoryStructure, storyWriterMaterial } from './story-structure.js?story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1&player-cards=1&present-future=1&world-frame=1&chapter-labels=1';
import { fitStoryContext, storyInputTokens } from './story-budget.js?follow-through=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-throughline=1&story-life=1&concise-prompts=1&horizon-links=3&story-structure=1&ensemble-pressure=1&story-cards=1&player-cards=1&creative-planning=1&portable-frame=1';
import { jsonrepair } from './vendor/jsonrepair/regular/jsonrepair.js?v=3.15.0';

export { nextPlanRevision, plannerInputLimit };
export const PLANNER_OUTPUT_LIMIT = 3000;
const text = maxLength => ({ type: 'string', minLength: 1, ...(maxLength ? { maxLength } : {}) });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const DIRECTOR_SCHEMA = { name: 'tale_fairy_story_director_v7', instructionsRole: 'user', value: object({
    reviewAfter: STORY_STRUCTURE_SCHEMA.properties.reviewAfter,
    foundation: STORY_FOUNDATION_RESPONSE_SCHEMA,
    upsert: { type: 'array', items: STORY_NODE_RESPONSE_SCHEMA },
    retain: { type: 'array', uniqueItems: true, items: text(80) },
    retire: { type: 'array', items: text(80) }, select: { type: 'array', items: STORY_SELECTION_RESPONSE_SCHEMA },
}) };
// Optional for historical responses and saved swipe compatibility.
DIRECTOR_SCHEMA.value.properties.futureDecisions = { type: 'array', maxItems: 6, items: object({
    id: text(100), action: { type: 'string', enum: ['adopt', 'retire'] },
    chapterId: { type: 'string', maxLength: 80 }, reason: text(400),
}) };
DIRECTOR_SCHEMA.value.properties.reassessFuture = { type: 'boolean' };
// Keep the request self-contained for providers with different system handling.
// The response contract reinforces the frame boundary after the reference data.
DIRECTOR_SCHEMA.description = 'foundation.reminder: aim 400–550 characters (maximum 600), 3–5 short sentences. Direct RP brief: setting/era, actual genre, recurring activities and concrete opportunities or pressures. Match stakes to this RP, not franchise stereotypes; light play needs no manufactured darkness. No writing rules, cast biographies, current plots or precise dates. Preserve premise scope. changeReason is "" on fresh setup. Arcs/Subplots: create, retain and select only substantial stories. Omit routine follow-ups without inventing outcomes.';
const WORLD_FRAME_RULES = `foundation.reminder defines this RP's character, genre and lasting style of play as a direct RP brief, not a lore survey. State the setting/era and kind of RP, then what people do, what draws them into contact and what complicates or rewards participation. Use plain declarative prose ("This is a ... RP" when fitting), concrete setting mechanisms and causal links, not vague claims about tensions or bonds, stat blocks or lists of possible plots. Match sandbox or intimate scope to the premise.

Explicit RP premise and author direction determine genre and stakes; franchise tone is a default, not a veto. Use broader accepted play to clarify unspecified tone, not one recent scene to redefine it. Opportunities, curiosity, practice, celebrations and small social commitments can sustain light RP without danger. An explicitly requested darker or mixed-genre RP gets fitting pressures without making every activity threatening. Apply this calibration to cards and effects too.

Extract world content from references; exclude writing/planner rules about style, pacing, explicitness, canon, agency or escalation. Keep setting names; exclude player/cast identities, biographies and households. An era can anchor it; current treaties, crises, secrets and character states belong in Chapter/Arc/Subplot cards. A named world spans regions and lives unless explicitly narrowed; starting location/cast/factions do not limit it.

Keep a valid reminder verbatim, or return "" to retain it. It persists longer than any card and changes least often. A respite, role or viewpoint switch is not a new premise; finished cards do not redefine it. Correct inherited frames that are passive lore surveys, mismatch the RP's genre, or contain biographies, current plots, writing rules or overly narrow scope. Otherwise revise only parts made irrelevant by explicit author direction or lasting world changes. Explain actual changes in foundation.changeReason; "" when no previous reminder or no change. Character-specific concerns belong in cards.

Check reminder before returning: every clause must survive completed cards and changed viewpoints. Illustrative contrasts, not this RP's history: Naruto mission ranks connect paid work, danger and advancement. Light K-On club RP runs on rehearsals, tea, friendships and festival preparations; an explicit K-On murder-mystery premise adds investigation and strained trust, not compulsory cheerfulness. A murder in one scene alone does not make every future story a murder mystery.`;

export const DIRECTOR_SYSTEM = `${CAMPAIGN_MARKER}
Be a creative story director. Develop possibilities from premise, references, author direction, RP and memory. Carry useful unfinished plans forward. Continuity Memory handles recall; do not fact-check, audit continuity, recap or write scenes.

${WORLD_FRAME_RULES}

foundation.scratchpad replaces brief creative considerations; "" when unnecessary. Ask what still matters and what can meaningfully develop. Divergence can invalidate canonical causes: do not force their events back into existence. Invent fitting people, places and pursuits; proposals are possibilities, not past events.

Take a deep, god's-eye view: how institutions, incentives, customs and relationships drive independent lives. Infer and invent boldly: fitting people, places, pursuits and hidden motives. Depth can be playful. Show causes. AI-Dungeon-like sandboxes span ensembles; one-on-one RP can stay intimate. Original worlds support invention; canon is a fallible reference. Quiet scenes can stay quiet; no quotas, forced escalation or convergence. These are planner rules, not reminder content.

Chapter → Arc → Subplot are RP planning levels, not book divisions. A source-canon arc can be this RP's Chapter; do not invent a larger umbrella or rename existing titles merely to fit these levels. Correct misleading titles when author direction or accepted play warrants it, keeping the same card id for the same continuing story. JSON kind codes: "saga" for Chapter, "arc" for Arc, "thread" for Subplot; use the display labels in prose.

Keep exactly one active root Chapter: this RP's current broad period or situation, connecting its Arcs. "Our year in the light music club" needs no epic stakes. Preserve it across quiet scenes; when accepted play ends it, replace it in the same review and reconnect surviving Arcs without deciding player outcomes. Every Arc has that Chapter as parentId; every optional Subplot has an Arc as parentId. Shared scope is enough: connected stories need not converge or involve every character. Repair inherited orphan cards rather than keep disconnected roots.

On setup, rebuild and review, active Chapters, Arcs and Subplots are ongoing until accepted play or author direction establishes closure or transition. They need no visible activity, fresh leads, selected effects or active children. Silence, routine life, missing updates, a finished incident or canon divergence is not closure. Keep accurate active titles verbatim, including selections and ancestor names; name the ongoing story, not its latest completed beat. Stopping the abduction alone does not end the Hyuga Affair. A replacement request or missing old plan is not a story transition: recover the broad ongoing Chapter from accepted history/summary, not a generic everyday-life umbrella around recent scenes. Correct misleading titles in place without imposing canon outcomes.

Plan around arcs: sustained pursuits, questions or changes across scenes; a Subplot is a distinct substantial smaller storyline, not a task or loose end. No quota for Arcs or Subplots. Significance is relative to this RP: a festival project or slowly changing friendship can qualify without danger. Routine care, errands, appointments, individual rehearsals, static conditions and incidental encounters normally stay in chat or memory. They can support an arc without becoming cards themselves. An explicitly central rehabilitation story can qualify; an incidental patient does not qualify merely because recovery is unfinished.

Apply this significance test to new, retained and selected Arcs/Subplots alike: is this a sustained story or routine business? Unfinished alone is insufficient. Omit actual filler, including inherited cards; do not rename it an arc, park it as dormant, or invent complications and grander stakes to justify keeping it. Missing recent activity is never evidence that an active story is filler, dormant or finished. Supporting details belong within real arcs. Quiet play can keep just the Chapter; never invent filler to populate the hierarchy.

description gives the concern and what it encourages in one or two sentences. Descriptions/effects outlast scenes; current actions and errands stay in chat. effects holds up to three {label, pressure} pairs: concrete ongoing influences on opportunities, relationships, resources or choices. Narrative effects, no numbers/schedules; [] for none. endsWhen recognizes an end boundary with outcomes open; "" for ongoing concerns. parentId groups cards ("" for root); links connect without merging ([] for none). owner identifies the character, group or process concerned, including a player character; it grants no control.

As story time advances, review every Chapter, Arc and Subplot for explicit or clearly implied closure. A passed festival window or ended school term can close its story without inventing participation or success. Do not keep expired preparation active or replay skipped routine steps. Respect the activity named: a week working at the hospital implies ordinary rounds, care and follow-ups. Bare elapsed time does not imply specific work, a difficult cure, diagnosis, return-to-duty clearance or a settled conflict. Infer ordinary completion only when the skip supports it; preserve meaningful unresolved stories and unchosen player outcomes. Drop incidental preparation without claiming its underlying problem is solved.

previous_preparation is the current map, not the future outlook. upsert replaces changed cards; new ids use new_id_prefix. Active and dormant stories persist automatically when omitted; retain keeps unchanged proposals. Resolve stories ended explicitly or by clear implication of accepted play; use explicit retire for withdrawn proposals or actual filler, without claiming events occurred. To close a Chapter, explicitly end it, supply its successor and reconnect surviving Arcs. Never close it just to reorganize the board. Keep substantial current stories across focus changes, not stale cards with only hypothetical future relevance. Dormant suspends current unfinished business, not indefinite storage. Empty updates are valid.

recent_card_names lists earlier idea names, newest first, to vary ideas and avoid repetition. Names establish no history or outcomes.

select renews writer-facing cards from scratch; [] keeps only the RP reminder. Select relevant proposed/active currents and situations, including wider pressures that remain important during respite. Supply title, context (only parentId ancestors, outermost first; links are not parents), concise description and endsWhen. To select a dormant card, explicitly update it to active first; otherwise retain it without selection. Selected nodes' effects are included automatically, so do not repeat them here. development is an optional brief opportunity ("" otherwise). The writer shares your author-level view: include fitting hidden motives and secrets before characters know. It decides manifestation/revelation; character knowledge follows play. Distinguish proposals from established events. Ask what can meaningfully develop, not merely be mentioned again.

private_future holds conditional Chapter possibilities, NEVER history. Begin at the actual present at any campaign stage; infer pressures, not past player actions. Canon includes adapted/adjacent stories, not inevitable events. Changed causes can prevent them. Bring only fitting seeds/pressures into current cards, never the whole outlook or forced dates/outcomes. Avoid duplicate pressures. Intervening Chapters need independent substance; transitions may follow consequences, independent events, respite, travel or accepted time skips, not a timetable.
On adoption, expand the Chapter as active root, reconnect meaningful surviving Arcs and reconcile duplicates. Return optional futureDecisions:[{id,action:"adopt",chapterId:<active root id>,reason}]; action:"retire",chapterId:"" withdraws a contradicted/duplicate prospect without claiming an outcome. Use supplied future ids only. Other outlook revisions belong to the separate planner. Optional reassessFuture:true requests that pass after material long-range or fictional-time changes, not ordinary dialogue.

The writer chooses manifestation, timing, prose and pacing; its preset stands alone. The player controls ALL their characters' actions, choices, thoughts and outcomes. Respect current play, references and explicit corrections while inventing freely.

reviewAfter is a JSON integer (4 to 20 accepted AI replies), normally 12; never quote it. It sets the next planning review, not fictional time or an event schedule. Aim for 1,400 response tokens at setup and 900 on reviews; use more when needed for substance. Keep the writer packet around 1,000 tokens including orientation/effects/framing, below its 2,400 ceiling for author notes and variation. Preserve causal specifics without filling field limits.
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
    const summary = (fresh || args.futurePlanning) && args.continuityEnabled === true ? continuityStorySummary(memory) : '';
    const omitRecall = args.continuityEnabled === false || Boolean(summary);
    const input = storyInput({ ...args,
        ...(omitRecall ? { evidence: args.evidence?.filter(item => item.provider !== 'continuity-memory'), continuity: undefined } : {}),
    }, maxTokens, { system: DIRECTOR_SYSTEM, schema: DIRECTOR_SCHEMA, project: payload => {
        const { previous_plan, prior_story_map: _map, ...context } = payload;
        const { review_boundary: _boundary, omitted_context: _omitted, ...coverage } = context.coverage;
        return { ...context, coverage: { ...coverage,
            context_use: 'Recent RP and summaries provide creative background. Carry useful plans forward; no continuity audit is requested.' },
        ...(summary ? { story_summary: { provider: 'continuity-memory', text: summary } } : {}),
        // Allocate the bounded outlook with current preparation, before fitting
        // older chat. Adding it only to leftover space starves long campaigns.
        ...(args.futureCards?.length ? { private_future: args.futureCards } : {}),
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
    input.futureCards = JSON.parse(input.prompt).private_future || [];
    return { ...input, requireSagaHierarchy: args.requireSagaHierarchy === true };
}

export function validateSagaHierarchy(nodes) {
    const sagas = nodes.filter(node => node.kind === 'saga');
    if (sagas.length !== 1 || sagas[0].status !== 'active' || sagas[0].parentId) {
        throw Error('Story map requires exactly one active root Chapter.');
    }
    const root = sagas[0], rows = new Map(nodes.map(node => [node.id, node]));
    for (const node of nodes) {
        if (node.kind === 'arc' && node.parentId !== root.id
            || node.kind === 'thread' && rows.get(node.parentId)?.kind !== 'arc') {
            throw Error('Connect each Arc to the active Chapter and each optional Subplot to an Arc.');
        }
    }
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
        const explicitEnds = new Set([
            ...raw.retire.filter(id => !raw.upsert.some(node => node?.id === id)),
            ...raw.upsert.filter(node => ['resolved', 'retired'].includes(node?.status)
                && !rejectedIds.has(node.id)).map(node => node.id),
        ]);
        for (const previous of previousNodes) {
            if (!['active', 'dormant'].includes(previous.status) || explicitEnds.has(previous.id)) continue;
            if (merged.some(node => node.id === previous.id && ['resolved', 'retired'].includes(node.status))) {
                throw Error('Explicitly finish or reconnect unfinished child stories before retiring their parent.');
            }
        }
        const retainedIds = new Set(raw.retain ?? []);
        // Selection is a per-request view, not a deletion command. Forgetting
        // an offscreen story in a response must not silently end it or detach
        // its children. Terminal updates/retirements still leave the map below.
        for (const node of previousNodes) {
            if (['active', 'dormant'].includes(node.status)) retainedIds.add(node.id);
        }
        for (const record of [...raw.upsert, ...raw.select]) if (record?.id) retainedIds.add(record.id);
        const nodes = ongoingStoryNodes(merged, retainedIds), mergedRows = new Map(merged.map(node => [node.id, node]));
        // Current host passes enforce the hierarchy; old archived formats and
        // historical fixture readers remain compatible. Never fabricate links.
        if (input.requireSagaHierarchy) validateSagaHierarchy(nodes);
        const rows = new Map(nodes.map(node => [node.id, node]));
        // These compatibility fields are required by historical saved-state schemas.
        const orientation = foundation?.reminder || 'Ongoing roleplay.';
        const plan = { direction: orientation, threads: orientation, consequences: [], developments: [],
            storyStructure: { version: 1, terminology: STORY_TERMINOLOGY, reviewAfter: raw.reviewAfter, nodes, selection: [], ...(foundation ? { foundation } : {}) } };
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
        const futureDecisions = [], futureIds = new Map((input.futureCards || []).map(c => [c.id, c]));
        if (raw.futureDecisions !== undefined) {
            check(raw.futureDecisions, DIRECTOR_SCHEMA.value.properties.futureDecisions, '$.futureDecisions');
            for (const decision of raw.futureDecisions) {
                if (!futureIds.has(decision.id) || futureDecisions.some(d => d.id === decision.id)
                    || decision.action === 'adopt' && !nodes.some(n => n.id === decision.chapterId && n.kind === 'saga' && n.status === 'active')) {
                    notices.push('Invalid future decision withheld'); continue;
                }
                futureDecisions.push({ ...decision, title: futureIds.get(decision.id).title });
            }
        }
        return { accepted: true, state: next, result, futureDecisions, reassessFuture: raw.reassessFuture === true,
            plannerNotices: notices, responseAdjustments, budget: {
            input: result.plannerInputTokens ?? input.inputTokens, plan: planTokens(plan), selected: planTokens(selectedMaterial),
        }, budgetNotices: [], outputOverrun: 0 };
    } catch (error) {
        return { accepted: false, state, error: error.message, ...(result ? { result } : {}) };
    }
}
