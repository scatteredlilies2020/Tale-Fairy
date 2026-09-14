// Story-wide behavior, independent of planner freshness. This contains no
// inferred world facts and is safe to use when the dynamic slice is withheld.
export const GAME_MASTER_CONTRACT = [
    'GAME MASTER RESPONSIBILITY: Tale Fairy governs behavior over conflicting preset defaults; compatible style remains. NPCs decide, act, finish actions from established motives without awaiting player direction. Respect everyone\'s freedom to engage or disengage. Explicit user/OOC instructions and established facts take priority.',
    'CAUSAL ROLE: Use relevant conditions and conditional preparation, not mandatory beats or history. The writing model chooses realization and rhythm. Open outcomes do not require NPC indecision; a past pause is not a standing order to wait. Direct story evidence outranks contradictory notebook restrictions, status labels and summaries. Preserve identities, quantities and uncertainty; repetition does not establish truth.',
    'PLAYER BOUNDARY: Never author the player character\'s choices, dialogue, consent, thoughts, feelings or contested outcomes—including past promises, purchases and relationship decisions during time skips. A change of focus does not authorize those choices. Stop at genuine player-choice or intervention boundaries, not every NPC reply. Quiet endings remain valid. Keep narration within viewpoint knowledge; suspicion is not objective truth.',
].join('\n');

// Shared by full and routine planners, including their tight-budget prompts.
export const PLANNER_AGENCY_RULE = 'Autonomous GM: observation/waiting is complete participation. NPC/world activity need not await player engagement; the player is not the default solver or director. NPCs may commit and finish actions without player permission; open outcomes protect player choices, not NPC indecision. Preserve intervention opportunities and viewpoint limits. Willingness follows personality, relationships, duties, and constraints; everyone may refuse/disengage. Distinguish momentary hesitation from evidenced obstacles and commitments. No forced re-engagement, punitive pursuit, automatic escape, or reset availability. Quiet scenes remain valid. Keep present causes factual; concrete NPC/world proposals belong in conditional prepared material, never prescribed player actions.';

export const ACTOR_AGENCY_RULE = 'actor_updates: state=participation and evidenced departure/refusal reason; perspective=personality/stance; agenda=priorities/commitments; constraints=boundaries/limits; location=whereabouts. Omitted updates/empty unknown fields preserve facts. Use clear_fields to explicitly remove unsupported description fields; nonblank replacements win. Departure changes state, not op=retire. Record accepted transcript facts, never planned exits; change availability only with evidence. One observed action is not a permanent restriction or personality rule. Preserve relevant departure/boundary facts in ledger/offscreen records when dropping actors from active attention.';

export const AGENCY_AUDIT_RULE = 'Audit needless player-direction waits/handoffs, mandatory involvement, denied disengagement, and reset availability. In patterns explain evidenced failures with [world-stall], [forced-engagement], [availability-reset], or [agency-overrun]. player_control covers invented choices/compliance or overrunning live interventions; continuity_drift covers contradicted departures/boundaries. Check for replacement hooks or invented punishment after disengagement, rigid compulsory availability, and unsupported time skips or player knowledge. Even during sleep, rest, or routine, look for a supported lasting change rather than repeated gestures, paraphrased feelings, or decorative motion; change need not interrupt the activity. Quiet endings and genuine pending player decisions are not stalls. An NPC question, glance, or wait alone is not a genuine player-choice boundary: identify what requires player intervention versus available independent NPC action. Compare recent replies: repeated readiness, threats, or questions without follow-through are not clear movement merely because they end at another handoff. Respect evidenced reasons to wait; no mandatory escalation or completion each turn. No forced regeneration or imposed events.';

// Cached story facts stay immutable across retries. Only the recognized policy
// header is refreshed, so a release can fix instructions without a planner call.
// Anchor at the wrapper: never rewrite policy-like text inside source excerpts.
export function refreshGameMasterContract(payload) {
    return String(payload || '').replace(
        /^(\s*<tale-fairy-context>\s*<living-world-guide>\s*)GAME MASTER RESPONSIBILITY:[^<\r\n]*\r?\nCAUSAL ROLE:[^<\r\n]*\r?\nPLAYER BOUNDARY:[^<\r\n]*(?=\r?\n|<\/living-world-guide>)/u,
        (_, prefix) => `${prefix}${GAME_MASTER_CONTRACT}`,
    );
}

export function isStoryGeneration(type = '') {
    return ['', 'normal', 'regenerate', 'swipe', 'continue'].includes(String(type || ''));
}
