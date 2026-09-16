// Evaluation-only candidate. Nothing in the installed extension imports this.
import { buildWorldPlannerPrompt } from '../extension/analysis.js';
import { WORLD_PLANNER_SCHEMA, mergeWorldPlan } from '../extension/world-planner.js';
import { fitPromptToBudget } from '../extension/prompt-budget.js';
import { estimateTokenCount } from '../extension/token-budget.js';
import { plannerBudgetEnvelope, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';

export const SINGLE_PASS_SYSTEM = `You are Tale Fairy, the private creative planner for an ongoing RP. Return one JSON response containing BOTH persistent preparation and a complete current writer selection. No second planning call, critic, repair pass or narration. The writer's preset owns style and viewpoint.

Two responsibilities, different scopes:
1. Prepare the RP's life across encounters and episodes. Source references, explicit preferences and accepted commitments define its scope; the latest problem only locates current play. Prepare concrete people with purposes, relationships, practices and world processes that can develop through meaningfully different intermediate states. A list of future destinations or quest hooks is not long-term preparation. Show what can change through participation, refusal, discovery or independent initiative, what could matter in later encounters, and what remains undecided. Invent fitting, distinctive possibilities that were not already suggested by the latest scene. Do not turn every pleasure, person or activity into a mystery, debt or obstacle. A development can be worthwhile without a problem to solve. Do not impose genre quotas or a fixed story trajectory.
2. Select material useful NOW for the writer, without requiring the rest of the preparation to justify itself through immediate usefulness. Return focus and writer in this same response. Later material can remain private. Do not introduce it by inventing a player choice, forced interruption, departure, elapsed time or guaranteed ending.

Mode: On initialize/review, give primary attention and output space to viable mid/long-term development before selecting current material. Reconsider a saved approach that has mistaken the current episode for the whole RP. On routine update, maintain the current situation and reconcile any enduring developments actually affected by accepted events. Omit approach on routine updates: its source-grounded scope is protected by the host. Non-selection or silence is not abandonment. Neither routine updates nor broad reviews advance fictional time by themselves.

approach: enduring RP scope and accepted aims, not a recap or writing rules. Do not infer user enthusiasm from scene length or compliance. summary: a compact map of continuing preparation and unresolved dependencies, not the latest chat recap. Omit unchanged text; a replacement must preserve still-valid wider material. Supplied references and direct observations outrank generated notebook claims. Names/aliases of one persona remain one person; never create a second observer from a birth name. Respect current era and distinguish unknowns from negative evidence.

updates: each record is one coherent development with premise, playable middle, conditional future, knowledge, family, dependency and status. Preserve stable IDs when developing it. Different encounters of one enduring relationship or pursuit should build on its existing changes rather than restart its hook. Family/dependency are honest causal descriptions: other witnesses, settlements or fallout from the same episode do not make independent developments. The present episode may end without a successor clue, a hidden mastermind or required future relevance. Its consequences can persist without owning the rest of the RP. Respect an explicitly closed scenario: develop depth within its scope rather than manufacture a campaign.

Evidence boundaries: preparation is not factual history. New proposals are prepared, not active until accepted in play. Preserve player ownership of decisions, motives, speech and feelings. Record actual refusals and changed relationships; revise contradicted proposals rather than freeze them. Do not invent a completed performance, resolved conflict, seasonal change or elapsed deadline. NPC initiative is possible, not proof it already happened. Do not copy private planning instructions into story material.

Persistence: updates completely replace listed records; omit unchanged records. Unshown records remain stored and unavailable prose must not be reconstructed as fact. status_changes only changes existing IDs; resolved/retired removes them and needs accepted resolution or genuine supersession, not irrelevance to this reply. No ID occurs in both operations. Consolidations must obey the supplied schema. Storage has no record-count cap.

writer: complete selection of up to three available focused IDs, or []. Distill concrete motives, relationships, ongoing processes and conditions for change into self-contained playable material. Only writer reaches the storyteller, not approach, summary or private futures. Keep unknowns and proposed secrets separate from character knowledge. No beat queue, mandatory outcome, generic coaching, or premature later-episode material. Prioritize a substantive durable preparation over polishing several local variants. Return fewer complete changes rather than truncated records.`;

export function prototypeSchema() {
    const schema = structuredClone(WORLD_PLANNER_SCHEMA);
    schema.value.properties.prepared.properties.approach.description += ' In routine mode omit this field; the host preserves it. Broad review may revise it against source scope.';
    return schema;
}

export async function buildPrototypePrompt(messages, state, note, bootstrap, options = {}) {
    const schema = prototypeSchema();
    const fixedEnvelope = plannerBudgetEnvelope(SINGLE_PASS_SYSTEM, schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY);
    // Reserve complete source fields separately. A generated local frame cannot
    // buy space by clipping the RP premise. Oversized source fails closed here;
    // scalable source extraction is deliberately not claimed by this prototype.
    const reference = structuredClone(bootstrap);
    const reserve = estimateTokenCount(JSON.stringify(reference)) + 48;
    return fitPromptToBudget({ fixedEnvelope, tokenBudget: options.maxPromptTokens,
        buildPrompt: effectivePromptTokens => {
            if (effectivePromptTokens - reserve < 800) throw Error('Complete source reference cannot fit prototype budget.');
            const payload = JSON.parse(buildWorldPlannerPrompt(messages, state, note, bootstrap,
                { ...options, effectivePromptTokens: effectivePromptTokens - reserve }));
            payload.rp_reference = reference;
            return JSON.stringify(payload);
        },
    });
}

export function mergePrototype(previous, value, { broad }) {
    const effective = structuredClone(value);
    const hostActions = [];
    if (!broad && Object.hasOwn(effective.prepared, 'approach')) {
        delete effective.prepared.approach;
        hostActions.push('Preserved source-grounded approach on routine update.');
    }
    // Existing omission-preserving storage is reused, not a notebook reset.
    return { notebook: mergeWorldPlan(previous, effective), hostActions };
}
