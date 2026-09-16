// Isolated writer harness: use the production request adapter, not an early
// system-message approximation. Defaults match the inspected ST configuration.
import { ensureGuidanceInChat } from '../extension/request-injection.js';
import { stagedWriterMaterial } from './development-staging-prototype.mjs';

export function injectStagedPreparation(conversation, state, options = { role: 'user', depth: 1, inlineLatestUser: true }) {
    const material = stagedWriterMaterial(state);
    if (!material.length) return conversation;
    const payload = `<tale-fairy-context>\nPrivate unaccepted authoring material, not past events or player commitments:\n${JSON.stringify(material)}\n</tale-fairy-context>`;
    ensureGuidanceInChat(conversation, payload, options);
    return conversation;
}
