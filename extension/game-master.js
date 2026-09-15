import { formatPacingPreference, PREPARATION_CONTEXT_LABEL } from './prepared-world.js?v=0.14.18';

// Packet semantics only. Narrative behavior belongs to the preset, not here.
export const TALE_FAIRY_CONTEXT_GUIDE = 'TALE FAIRY CONTEXT: Story references and optional preparation, not a replacement preset. Preset and explicit user instructions govern narration. Notebook proposals are not established history, character knowledge, or required events; current story evidence takes priority over conflicting notebook claims.';

// Shared by full and routine planners, including their tight-budget prompts.
export const PLANNER_AGENCY_RULE = 'Autonomous GM: observation/waiting is complete participation. NPC/world activity need not await player engagement; the player is not the default solver or director. NPCs may commit and finish actions without player permission; open outcomes protect player choices, not NPC indecision. Preserve intervention opportunities and viewpoint limits. Willingness follows personality, relationships, duties, and constraints; everyone may refuse/disengage. Distinguish momentary hesitation from evidenced obstacles and commitments. No forced re-engagement, punitive pursuit, automatic escape, or reset availability. Quiet scenes remain valid. Keep present causes factual; concrete NPC/world proposals belong in conditional prepared material, never prescribed player actions.';

export const ACTOR_AGENCY_RULE = 'actor_updates: state=participation and evidenced departure/refusal reason; perspective=personality/stance; agenda=priorities/commitments; constraints=boundaries/limits; location=whereabouts. Omitted updates/empty unknown fields preserve facts. Use clear_fields to explicitly remove unsupported description fields; nonblank replacements win. Departure changes state, not op=retire. Record accepted transcript facts, never planned exits; change availability only with evidence. One observed action is not a permanent restriction or personality rule. Preserve relevant departure/boundary facts in ledger/offscreen records when dropping actors from active attention.';

export const AGENCY_AUDIT_RULE = 'Audit needless player-direction waits/handoffs, mandatory involvement, denied disengagement, and reset availability. In patterns explain evidenced failures with [world-stall], [forced-engagement], [availability-reset], or [agency-overrun]. player_control covers invented choices/compliance or overrunning live interventions; continuity_drift covers contradicted departures/boundaries. Check for replacement hooks or invented punishment after disengagement, rigid compulsory availability, and unsupported time skips or player knowledge. Even during sleep, rest, or routine, look for a supported lasting change rather than repeated gestures, paraphrased feelings, or decorative motion; change need not interrupt the activity. Quiet endings and genuine pending player decisions are not stalls. An NPC question, glance, or wait alone is not a genuine player-choice boundary: identify what requires player intervention versus available independent NPC action. Compare recent replies: repeated readiness, threats, or questions without follow-through are not clear movement merely because they end at another handoff. Respect evidenced reasons to wait; no mandatory escalation or completion each turn. No forced regeneration or imposed events.';

// Migrate recognized application-owned framing in old retry packets locally.
// Saved snapshots, source excerpts and notebook prose must remain untouched.
export function refreshGameMasterContract(payload) {
    const source = String(payload || '');
    const refreshed = source.replace(
        /^(\s*<tale-fairy-context>\s*<living-world-guide>\s*)GAME MASTER RESPONSIBILITY:[^<\r\n]*\r?\nCAUSAL ROLE:[^<\r\n]*\r?\nPLAYER BOUNDARY:[^<\r\n]*(?=\r?\n|<\/living-world-guide>)/u,
        (_, prefix) => `${prefix}${TALE_FAIRY_CONTEXT_GUIDE}`,
    );
    if (refreshed === source) return source;
    return refreshed
        .replace(/^(\s*<tale-fairy-context>\s*<living-world-guide>\s*TALE FAIRY CONTEXT:[^\r\n<]*)\r?\nPACING PREFERENCE: (Adaptive|Linger|Natural|Advance):[^\r\n<]*(\r?\n)/u,
            (_, prefix, mode, newline) => {
                const preference = formatPacingPreference(mode.toLowerCase());
                return `${prefix}${preference ? newline + preference : ''}${newline}`;
            })
        // Protect source quotations before recognizing other structural blocks.
        .split(/(<plot-anchor>[\s\S]*?<\/plot-anchor>)/u)
        .map(part => part.startsWith('<plot-anchor>') ? part : part
            .replace(/(<prepared-world>\r?\n)CONDITIONAL GM PREPARATION, NOT TRANSCRIPT FACTS OR A REQUIRED NEXT BEAT\.[^\r\n<]*/u,
                (_, prefix) => `${prefix}${PREPARATION_CONTEXT_LABEL}`)
            .split(/(<prepared-world>[\s\S]*?<\/prepared-world>)/u)
            .map(section => section.startsWith('<prepared-world>') ? section : section
                .replace(/^DEVELOPMENT: (?:Subtle, within the current activity\.|Natural, proportionate to current conditions\.|Bolder when supported by current conditions\.)\r?\n/gmu, '')
                .replace(/^SCENE FIT \(provisional; latest user intent wins\):[^\r\n<]*\r?\n/gmu, '')
                .replace(' Use what fits; the writing model chooses every concrete action.', '')
                .replace('Private conditions — express through behavior unless disclosure becomes natural in-world:', 'Private conditions:')
                .replace('Limited knowledge — do not make universally known:', 'Limited knowledge:')
                .replace(' May emerge naturally without player engagement; outcomes remain open.', ''))
            .join(''))
        .join('');
}

export function isStoryGeneration(type = '') {
    return ['', 'normal', 'regenerate', 'swipe', 'continue'].includes(String(type || ''));
}
