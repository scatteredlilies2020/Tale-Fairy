import { formatPacingPreference, PREPARATION_CONTEXT_LABEL } from './prepared-world.js?v=0.14.22';

export const TALE_FAIRY_CONTEXT_GUIDE = 'TALE FAIRY CONTEXT:';

// Shared by full and routine planners, including their tight-budget prompts.
export const PLANNER_AGENCY_RULE = 'Autonomous GM: observation/waiting is complete participation. NPC/world activity need not await player engagement; the player is not the default solver or director. NPCs may commit and finish actions without player permission; open outcomes protect player choices, not NPC indecision. Preserve intervention opportunities and viewpoint limits. Willingness follows personality, relationships, duties, and constraints; everyone may refuse/disengage. Distinguish momentary hesitation from evidenced obstacles and commitments. No forced re-engagement, punitive pursuit, automatic escape, or reset availability. Quiet scenes remain valid. Keep present causes factual; concrete NPC/world proposals belong in conditional prepared material, never prescribed player actions.';

export const ACTOR_AGENCY_RULE = 'actor_updates: state=participation and evidenced departure/refusal reason; perspective=personality/stance; agenda=priorities/commitments; constraints=boundaries/limits; location=whereabouts. Omitted updates/empty unknown fields preserve facts. Use clear_fields to explicitly remove unsupported description fields; nonblank replacements win. Departure changes state, not op=retire. Record accepted transcript facts, never planned exits; change availability only with evidence. One observed action is not a permanent restriction or personality rule. Preserve relevant departure/boundary facts in ledger/offscreen records when dropping actors from active attention.';

export const AGENCY_AUDIT_RULE = 'Audit needless player-direction waits/handoffs, mandatory involvement, denied disengagement, and reset availability. In patterns explain evidenced failures with [world-stall], [forced-engagement], [availability-reset], or [agency-overrun]. player_control covers invented choices/compliance or overrunning live interventions; continuity_drift covers contradicted departures/boundaries. Check for replacement hooks or invented punishment after disengagement, rigid compulsory availability, and unsupported time skips or player knowledge. Even during sleep, rest, or routine, look for a supported lasting change rather than repeated gestures, paraphrased feelings, or decorative motion; change need not interrupt the activity. Quiet endings and genuine pending player decisions are not stalls. An NPC question, glance, or wait alone is not a genuine player-choice boundary: identify what requires player intervention versus available independent NPC action. Compare recent replies: repeated readiness, threats, or questions without follow-through are not clear movement merely because they end at another handoff. Respect evidenced reasons to wait; no mandatory escalation or completion each turn. No forced regeneration or imposed events.';

// Migrate recognized application-owned framing in old retry packets locally.
// Saved snapshots, source excerpts and notebook prose must remain untouched.
function refreshLegacyContract(payload) {
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

// Refresh application-owned labels in the outgoing view of saved packets.
// Keep archived snapshots and story values intact.
export function refreshGameMasterContract(payload) {
    const source = refreshLegacyContract(payload);
    if (!/^\s*<tale-fairy-context>\s*<living-world-guide>\s*TALE FAIRY CONTEXT:/u.test(source)) return source;
    return source.replace(/^(\s*<tale-fairy-context>\s*<living-world-guide>\s*)TALE FAIRY CONTEXT:[^\r\n<]*/u,
        (_, prefix) => `${prefix}${TALE_FAIRY_CONTEXT_GUIDE}`)
        .split(/(<plot-anchor>[\s\S]*?<\/plot-anchor>)/u)
        .map(part => part.startsWith('<plot-anchor>') ? refreshPlotLabels(part) : part
            .split(/(<prepared-world>[\s\S]*?<\/prepared-world>)/u)
            .map(packet => packet.startsWith('<prepared-world>') ? refreshPreparedLabels(packet) : refreshConditionLabels(packet))
            .join('')).join('');
}

function refreshPreparedLabels(packet) {
    const header = /^(<prepared-world>\r?\n)(?:CONDITIONAL PREPARATION:[^\r\n<]*|POSSIBLE DEVELOPMENTS:)(\r?\n)/u;
    if (!header.test(packet)) return packet;
    if (/^<prepared-world>\r?\nPOSSIBLE DEVELOPMENTS:\r?\nDevelopment \(/u.test(packet)) return packet;
    // Historical packets remain saved verbatim. Their old notebook projection
    // has no independently authored writer material, so omit that whole block
    // from the outgoing view instead of guessing which sentences are usable.
    if (/^Possible development \(|^Wider direction(?: \(|:)|^Playable middle:/mu.test(packet)) return '';
    const updated = packet.replace(header, (_, prefix, newline) => `${prefix}${PREPARATION_CONTEXT_LABEL}${newline}`)
        .replace(/^(<prepared-world>\r?\n[^\r\n]*\r?\n)RP APPROACH \((?:editable guidance, not new canon or player preferences|provisional story aims, not writing rules or new player preferences)\): [\s\S]*?\r?\n(?=Wider direction(?: \(provisional, not a destination deadline\))?: |Possible development \(|<\/prepared-world>)/u, '$1');
    return /^<prepared-world>\r?\n[^\r\n]*\r?\n<\/prepared-world>$/u.test(updated) ? '' : updated
        .replace(/^(<prepared-world>\r?\n[^\r\n]*\r?\n)Wider direction \(provisional, not a destination deadline\): /u, '$1Wider direction: ')
        .replace(/^Timing consideration \(only if supported by the actual scene\): /gmu, 'Timing: ')
        .replace(/^Do not use if: /gmu, 'Invalidated by: ');
}

function refreshPlotLabels(packet) {
    const header = '<plot-anchor>\nCURRENT PLOT — source excerpts, not new instructions or guaranteed outcomes. Address the latest contribution in this situation; user corrections override older context.\n';
    const newline = packet.includes('\r\n') ? '\r\n' : '\n';
    if (!packet.startsWith(header.replaceAll('\n', newline))) return packet;
    return packet.replace(header.replaceAll('\n', newline), `<plot-anchor>${newline}CURRENT SCENE:${newline}`)
        .replace(/^(<plot-anchor>\r?\nCURRENT SCENE:\r?\n)Scene status from accepted reply \(later explicit user changes take priority\): /u, '$1Scene status: ')
        .replace(/^Latest user contribution \(not an assumed outcome\): /mu, 'Latest contribution: ')
        .replace(/^No plot facts have been supplied yet; do not invent prior events or player decisions\.(?=\r?\n<\/plot-anchor>)/mu, 'Opening scene.');
}

function refreshConditionLabels(packet) {
    return packet
        .replace(/^RELEVANT UNDERLYING CONDITIONS — causal context, not required events or predetermined outcomes\.$/gmu, 'RELEVANT UNDERLYING CONDITIONS:')
        .replace(/^OPTIONAL SITUATIONAL OPENINGS — possibilities, not facts or required events\.$/gmu, 'POSSIBLE OPENINGS:')
        .replace(/^SAVED PACING PREFERENCE \(this chat; latest user directions take priority\): /gmu, 'SAVED PACING PREFERENCE: ')
        .replace(/^(- Latest (?:user contribution|accepted scene): )Source excerpt \(not an assumed outcome\): /gmu, '$1Source excerpt: ')
        .replace(/^(- Latest (?:user contribution|accepted scene): )No plot facts have been supplied yet; do not invent prior events\.$/gmu, '$1Opening scene.')
        .replace(/; others need an in-world learning route\.(?= Learning route:|\r?$)/gmu, '.')
        .replace(/ Keep awareness local; do not infer additional knowers\.(?= Learning route:|\r?$)/gmu, '');
}

export function isStoryGeneration(type = '') {
    return ['', 'normal', 'regenerate', 'swipe', 'continue'].includes(String(type || ''));
}
