// Alternative handoff: do not ask another scene-focused author to rewrite the
// wider preparation. Give the writer complete bounded designs at the real slot.
import { ensureGuidanceInChat } from '../extension/request-injection.js';
import { validatePreparation } from './development-preparation-prototype.mjs';

export function injectRepertoire(conversation, state, options = { role: 'user', depth: 1, inlineLatestUser: true }) {
    const repertoire = validatePreparation({ scope: state.scope, developments: state.developments });
    if (!repertoire.developments.length) return conversation;
    const data = {
        provenance: 'PRIVATE POSSIBILITIES, NOT ACCEPTED HISTORY OR A REQUIRED FUTURE',
        use: 'Answer the current user first. These subjects can wait through unrelated local business. Do not turn them into clues or hidden continuations of that business. At a compatible opportunity, use their concrete material and let actual play change it. Future phases are conditional possibilities, never a scheduled itinerary. Player choices remain open.',
        repertoire,
        accepted_observations: state.observations,
        invalidated_options: state.invalidated,
    };
    ensureGuidanceInChat(conversation, `<tale-fairy-context>\n${JSON.stringify(data)}\n</tale-fairy-context>`, options);
    return conversation;
}
