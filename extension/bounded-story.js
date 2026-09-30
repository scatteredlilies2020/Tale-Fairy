import { CAMPAIGN_MARKER, EVENT_POINTS_FORMAT, check } from './campaign-planner.js?v=0.14.36&working-plan=1';
import { compactPlannerReference } from './planner-reference.js?history-budget=1';
import { compactCampaignSpeakers } from './campaign-evidence.js';
import { witnessMessages, resolveSpanWitnesses, SPAN_WITNESS_SCHEMA } from './accepted-witnesses.js?v=0.14.34&partial-evidence=1';
import { fitEvidenceProviders } from './evidence-providers.js';
import { SELECTED_MATERIAL_SCHEMA, validateSelectedMaterial } from './selected-material.js?v=0.14.36&rp-plot=1';
import { storyInputTokens } from './story-budget.js?follow-through=1';
import { WORKING_PLAN_SCHEMA, WORKING_PLAN_VERSION, WORKING_PLAN_LIMIT, SELECTED_PACKET_LIMIT,
    PLANNER_INPUT_LIMIT, planTokens, plannerInputLimit, validateWorkingPlan, workingPlanProjection } from './working-plan.js';
export { PLANNER_INPUT_LIMIT, PLANNER_OUTPUT_LIMIT, plannerInputLimit } from './working-plan.js';

const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const witnesses = { type: 'array', maxItems: 3, items: SPAN_WITNESS_SCHEMA };
const selection = structuredClone(SELECTED_MATERIAL_SCHEMA);
// Instructions live once in the system contract, not repeated in schema prose.
function withoutDescriptions(value) {
    if (Array.isArray(value)) return value.map(withoutDescriptions);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
        .filter(([key]) => key !== 'description').map(([key, child]) => [key, withoutDescriptions(child)]));
    return value;
}
export const STORY_SCHEMA = { name: 'tale_fairy_working_plan_v1', value: withoutDescriptions(object({
    plan: WORKING_PLAN_SCHEMA,
    exits: { type: 'array', maxItems: 4, items: object({ id: text(80),
        disposition: { type: 'string', enum: ['closed', 'paused', 'dropped', 'changed'] }, reason: text(300), evidence: witnesses }) },
    observations: { type: 'array', maxItems: 4, items: object({ id: text(64), evidence: { ...witnesses, minItems: 1 } }) },
    selected_material: selection,
})) };

export const STORY_SYSTEM = `${CAMPAIGN_MARKER}
Invent worthwhile story development across experiences and arcs, not a recap or a next-paragraph script. One response only. The writing preset owns prose, tone and pacing. Respect source scope, abilities, canon departures and explicit player choices. No forced canon trajectory or mandatory sequel to a deliberately closed RP.

Return a complete replacement plan, at most four developments and ${WORKING_PLAN_LIMIT} tokens total. direction is the RP's broader reach; threads are long-running ambitions/relationships, not obligations to keep one arc active. consequences holds at most four relevant witnessed results, not a lifetime ledger. These results may outlive the arc that produced them. Old evidence remains archived locally.

Each development is finite arc work, a side thread, or an emerging direction. Keep stable ids and the specific unfinished initiative, not just its topic. question states what is at issue; initiative chooses concrete NPC/world activity that creates something to experience; resolution describes what could settle this particular undertaking, without prescribing success, player decisions or when it ends. beyond gives substantive follow-through or a different experience, not another prerequisite for the same reward. access states a plausible current bridge and any real prerequisites; none means private and unreachable. Do not reveal private causes in the writer packet.

Reconcile actual play: continue useful work, revise changed premises, close ended undertakings, set aside irrelevant ideas, or introduce genuinely different directions from the wider setting. Different arcs may overlap. New directions need not be sequels to this problem. Long-running ambitions can survive a failed or completed attempt without keeping that attempt open. Let effective actions solve the actual obstacle; do not move the goalposts, reset achievements, or add hidden layers simply to prolong an arc. Aftermath is not automatically unfinished business. Allow rest, celebration, departure and quiet enjoyment. No turn timers, forced time skips, compulsory escalation, scene rotation or novelty quota. Fictional time, causes and player choices govern transitions. Do not wait for the user to declare an arc over or manually activate every NPC.

For every removed previous development return one exit: closed means this finite undertaking ended in play (success, failure or abandonment); changed means actual events superseded it. Both require exact supplied message/span evidence. paused and dropped withdraw creative preparation only, require no evidence, and claim no fictional completion. Retained ids cannot also exit. Omission is not implicit closure. During migration/rebuild old drafts may be replaced without exits. New development ids must start with new_id_prefix; never revive an ended attempt under a new id. A broader relationship may continue as different work.

consequences are accepted facts, unlike the rest of the plan which is creative preparation. Every new or changed consequence needs observations with its id and exact supplied index/span citations. An unchanged verified consequence can carry without new citations. Do not manufacture player agreement, achievements or unseen actions. Source references supply premises; optional external recall and previous drafts are not proof of enactment. Current play/corrections override them. Omitted context does not establish absence or resolution.

selected_material is [] or one integrated packet under ${SELECTED_PACKET_LIMIT} tokens, referencing only retained, accessible developments. available supplies definite NPC/world initiative and its observable surface, not another invitation or maybe-hook. developing/lasting are optional useful horizons. Condition only genuine prerequisites, not NPC initiative on player interest. Player participation and contested outcomes stay open. No dialogue, ordered scene beats, assigned feelings, travel or commitments. Carry unplayed substance while useful; revise rather than reroll it. Empty is better than repetition or filler. Check that invention adds actual experiences beyond the writer merely continuing the current exchange. Concise JSON only.
`;

export const needsEventReframe = state => state?.workingPlanVersion !== WORKING_PLAN_VERSION;

function legacyDraft(state) {
    const result = { migration: true, developments: [], omittedDrafts: 0 };
    for (const row of state.developments || []) {
        const draft = { id: row.id, initiative: row.initiative, development: row.progression, resolution: row.outcomes, access: row.access };
        if (planTokens({ ...result, developments: [...result.developments, draft] }) <= WORKING_PLAN_LIMIT - 50) result.developments.push(draft);
        else result.omittedDrafts++;
    }
    if (state.rpBrief && planTokens({ ...result, previousBrief: state.rpBrief }) <= WORKING_PLAN_LIMIT) result.previousBrief = state.rpBrief;
    return result;
}

export function storyInput({ reference, state, messages, playerNames = [], previousUsable = false,
    verifiedPlanEvidence = {}, evidence, continuity, continuityTokens = 1000, reviewedMessageCount = 0 }, maxTokens = PLANNER_INPUT_LIMIT) {
    const limit = plannerInputLimit(maxTokens);
    const migration = needsEventReframe(state);
    const trustedEvidence = previousUsable ? verifiedPlanEvidence : {};
    let previous = migration ? legacyDraft(state) : structuredClone(state.workingPlan);
    if (!migration) {
        validateWorkingPlan(previous, check);
        previous.consequences = previous.consequences.filter(fact => Object.hasOwn(trustedEvidence, fact.id) && trustedEvidence[fact.id]?.text === fact.text);
    }
    const speakers = compactCampaignSpeakers(messages);
    const names = [...new Set(playerNames.filter(name => typeof name === 'string' && name.trim()))];
    const newIdPrefix = `r${state.revision + 1}-`;
    const payload = { source_reference: compactPlannerReference(reference),
        previous_plan: previous, rebuild: !previousUsable || migration, new_id_prefix: newIdPrefix,
        player_names: names,
        coverage: { reviewed_before: reviewedMessageCount, supplied_messages: messages.length,
            omitted_context: 'Only supplied accepted spans prove new outcomes. Earlier history stays local; absence from this request is not resolution.' },
        ...(Object.keys(speakers.defaults).length ? { default_speaker_name_by_role: speakers.defaults } : {}),
        accepted_messages: witnessMessages(speakers.messages) };
    const measure = value => storyInputTokens(JSON.stringify(value), STORY_SYSTEM, STORY_SCHEMA);
    const external = fitEvidenceProviders(evidence ?? (continuity ? [{ ...continuity, provider: 'continuity-memory' }] : []),
        Math.min(1000, Math.max(0, Number(continuityTokens) || 0)), value => measure({ ...payload, external_evidence: value }) <= limit);
    if (external.length) payload.external_evidence = external;
    const prompt = JSON.stringify(payload), inputTokens = measure(payload);
    if (inputTokens > limit) throw Error(`Planner input ${inputTokens} exceeds ${limit} tokens (including instructions/schema). Required source or unreviewed messages cannot fit whole; reduce the supplied source or backlog explicitly. No provider request sent; saved preparation is intact.`);
    return { prompt, inputTokens, indices: messages.map(m => m.index), evidenceMessages: structuredClone(messages),
        previousPlan: previous, rebuild: payload.rebuild, newIdPrefix, playerNames: names,
        verifiedPlanEvidence: structuredClone(trustedEvidence),
        evidence: { status: external.length ? 'included' : 'omitted-or-unavailable', providers: external.map(e => e.provider) },
        continuity: { status: external.some(e => e.provider === 'continuity-memory') ? 'included' : 'omitted-or-unavailable' },
        migration: { required: migration, omittedDrafts: previous.omittedDrafts || 0 } };
}

export async function storyPass({ state, input, source, generate }) {
    let result;
    const basisRevision = state.revision;
    try {
        result = await generate(input.prompt, STORY_SYSTEM, STORY_SCHEMA);
        if (['length', 'max_tokens', 'max_output_tokens'].includes(String(result.finishReason).toLowerCase())) throw Error('Truncated working-plan response');
        const raw = JSON.parse(result.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
        check(raw, STORY_SCHEMA.value);
        validateWorkingPlan(raw.plan, check, input.playerNames);
        if (planTokens(raw.selected_material) > SELECTED_PACKET_LIMIT) throw Error(`Selected writer packet exceeds ${SELECTED_PACKET_LIMIT} tokens`);
        const before = new Map((input.previousPlan.developments || []).map(d => [d.id, d]));
        const after = new Set(raw.plan.developments.map(d => d.id));
        const exits = new Map(raw.exits.map(exit => [exit.id, exit]));
        if (exits.size !== raw.exits.length) throw Error('Duplicate development exit');
        for (const item of raw.plan.developments) {
            if (!before.has(item.id) && !item.id.startsWith(input.newIdPrefix)) throw Error('New development requires the supplied id prefix');
        }
        if (!input.rebuild && [...before.keys()].some(id => !after.has(id) && !exits.has(id))) throw Error('Removed development requires an explicit exit');
        const resolve = refs => resolveSpanWitnesses(refs, input.evidenceMessages);
        const transitions = raw.exits.map(exit => {
            if (!before.has(exit.id) || after.has(exit.id)) throw Error('Exit requires a removed previous development');
            if (['closed', 'changed'].includes(exit.disposition) && !exit.evidence.length) throw Error('Closing or superseding an undertaking requires witnessed events');
            return { ...exit, witnesses: resolve(exit.evidence), source: structuredClone(source) };
        });
        // Inspect local history without sending its growing ids/evidence to the
        // model. New revision-prefixed ids also avoid accidental name reuse.
        const closed = new Set((state.archive || []).flatMap(entry => (entry.transitions || [])
            .filter(exit => ['closed', 'changed'].includes(exit.disposition)).map(exit => exit.id)));
        if ([...after].some(id => closed.has(id))) throw Error('An ended undertaking cannot restart under its closed id');
        const observations = new Map(raw.observations.map(row => [row.id, row]));
        if (observations.size !== raw.observations.length || raw.observations.some(row => !raw.plan.consequences.some(f => f.id === row.id))) throw Error('Observation requires a unique current consequence');
        const planEvidence = Object.create(null);
        for (const fact of raw.plan.consequences) {
            const observed = observations.get(fact.id);
            const previous = Object.hasOwn(input.verifiedPlanEvidence, fact.id) ? input.verifiedPlanEvidence[fact.id] : null;
            if (observed) planEvidence[fact.id] = { text: fact.text, witnesses: resolve(observed.evidence), source: structuredClone(source) };
            else if (previous?.text === fact.text) planEvidence[fact.id] = structuredClone(previous);
            else throw Error('New or changed consequence requires accepted-message witnesses');
        }
        const projection = workingPlanProjection(raw.plan);
        validateSelectedMaterial(raw.selected_material, projection.developments, check, projection.background);
        if (state.revision !== basisRevision) throw Error('Preparation changed during planning');
        const archive = structuredClone(state.archive || []);
        const { archive: _archive, ...old } = state;
        if (state.revision) archive.push({ revision: state.revision, source: structuredClone(state.source),
            ...(needsEventReframe(state) ? { legacyPreparation: structuredClone(old), migration: structuredClone(input.migration) }
                : { workingPlan: structuredClone(state.workingPlan), planEvidence: structuredClone(state.planEvidence),
                    selectedMaterial: structuredClone(state.selectedMaterial) }),
            transitions, replaced: true });
        const next = { revision: basisRevision + 1, ...projection, archive, source: structuredClone(source),
            preparationFormat: EVENT_POINTS_FORMAT, workingPlanVersion: WORKING_PLAN_VERSION,
            workingPlan: structuredClone(raw.plan), planEvidence, selectedMaterial: structuredClone(raw.selected_material) };
        return { accepted: true, state: next, result, warnings: [], migration: input.migration,
            budget: { input: input.inputTokens, plan: planTokens(raw.plan), selected: planTokens(raw.selected_material) } };
    } catch (error) { return { accepted: false, state, error: error.message, ...(result ? { result } : {}) }; }
}
