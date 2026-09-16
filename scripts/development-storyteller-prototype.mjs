// Evaluation-only alternative to gating all prepared material through next-beat selection.
import { estimateTokenCount } from '../extension/token-budget.js';
import { validatePreparation } from './development-preparation-prototype.mjs';

export const STORYTELLER_SYSTEM = `Continue the RP from the final user message. Write the scene, not an outline or explanation, in at most 450 words.

The source and accepted conversation are authoritative. The user alone controls their character: do not supply their dialogue, actions, agreement, knowledge, emotions or commitments. Names/aliases do not create another person. NPC beliefs can be mistaken.

The private repertoire is authoring material, not history. You ARE allowed to introduce its compatible new particulars through NPC actions, objects and dialogue in this reply. Do not reduce a directly requested activity to another vague hint or invitation: let the requested interaction actually contain something to experience and respond to. If an NPC is asked to share their work, they can share a concrete passage, mechanism, demonstration or problem in that work, rather than merely promising to do so. Leave the user's response open.

The repertoire's imagined outcomes are NOT instructions to make those outcomes happen. Its claims of prior meetings, player reactions, successful projects or shared memories are not established unless the accepted conversation establishes them. Its future branches are possible transformations, not a checklist. Do not skip prerequisites or time to reach them. Declining a public event need not end private work; declining an entire interest really may end participation. Retain changes made in play instead of resetting to the original draft. Established fictional elapsed time, not reply count, permits offscreen activity, whose details must remain compatible with accepted commitments.

Not every prepared subject belongs in every scene. An unrelated dinner problem stays unrelated; distant material does not teleport into it. An NPC can have an interest without recruiting the user into an errand. Answer the current action while allowing substantive independent life, changed work and relationships to carry across episodes. No forced itinerary, predetermined emotional payoff or inevitable escalation. Enforce explicit source constraints on invented material as well as established material.`;

export function storytellerInput({ reference, history = {}, state, messages }, maxTokens = 24000) {
    const preparation = validatePreparation({ scope: state.scope, developments: state.developments });
    const conversation = [
        { role: 'system', content: STORYTELLER_SYSTEM },
        { role: 'system', content: JSON.stringify({ authoritative_source: reference, accepted_historical_context: history }) },
        { role: 'system', content: JSON.stringify({ provenance: 'PRIVATE UNACCEPTED DESIGN; not history, player knowledge, or a required future', repertoire: preparation, accepted_observations: state.observations, invalidated_options: state.invalidated }) },
        ...messages.map(m => ({ role: m.role ?? (m.is_user ? 'user' : 'assistant'), content: m.content ?? m.mes })),
    ];
    if (conversation.slice(3).some(m => !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim())) throw Error('Invalid accepted message.');
    const inputTokens = estimateTokenCount(JSON.stringify(conversation));
    if (inputTokens > maxTokens) throw Error('Complete storyteller context exceeds budget.');
    return { conversation, inputTokens };
}
