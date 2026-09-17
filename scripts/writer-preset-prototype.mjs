// Read-only, preset-informed isolated writer. Not a complete ST request clone:
// runtime world-info, continuity extensions and provider transforms are absent.
import { buildStoryEvidence } from '../extension/analysis.js';

// Rebuild deterministic evidence from this accepted prefix, as TF's host does.
// Frozen fixture evidence cannot describe developments accepted since freezing.
export function acceptedStoryEvidence(messages, { userName, characterName }) {
    const rows = messages.map((message, index) => {
        if (message.index !== index || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') {
            throw Error('Historical evidence needs a complete indexed accepted prefix');
        }
        return { mes: message.content, is_user: message.role === 'user',
            name: message.name || (message.role === 'user' ? userName : characterName) || '' };
    });
    return buildStoryEvidence(rows);
}

export const SCOPE_COMPATIBILITY = `# TALE FAIRY SCOPE COMPATIBILITY (ISOLATED EXPERIMENT)
CURRENT and HELD describe this reply's scene, not the lifetime or geographical bounds of the story. They do not freeze the campaign in the previous scene after the user explicitly advances time or place. A direction such as "a season later, farther along the journey" establishes a new starting scene: apply the stated elapsed time and changed location to the starting stat, without inventing the user's intervening choices. Unspecified user possessions, feelings and commitments remain unchanged.
The first meaningful phase of an already requested experience is the experience itself, not another offer to begin it. Show the relevant NPC's work or changed situation operating now, including its observable result when it requires no further player decision. Then stop for the user's response. Do not fast-forward merely to reach prepared material, force travel or consent, or activate unrelated HELD business.
Private future designs are possibilities, never evidence that an event already happened. Established elapsed time permits compatible new NPC activity, not invented past player actions. Do not replace actual present play with a retrospective speech about everything that supposedly changed. Apply the original setting constraints, including original names for new spells. Preserve all remaining preset instructions and player-agency protections.`;

export function presetSnapshot(settings) {
    const oai = settings.oai_settings;
    const order = oai?.prompt_order?.find(p => String(p.character_id) === '100001')?.order;
    if (!order) throw Error('Expected verified global ST prompt order 100001');
    const prompts = order.filter(p => p.enabled).map(p => oai.prompts.find(v => v.identifier === p.identifier)).filter(Boolean)
        .map(({ identifier, name, role, content, injection_position, injection_depth, injection_order }) => ({ identifier, name, role, content, injection_position, injection_depth, injection_order }));
    return { prompts, model: oai.deepseek_model, source: oai.chat_completion_source, reasoning: oai.reasoning_effort,
        temperature: oai.temp_openai, context: oai.openai_max_context, maxOutput: oai.openai_max_tokens };
}

// Explicit evaluation-only ablation, never applied to a saved/live preset.
// Removing the requirement is not proof that a model omits the field: accepted
// history may still reproduce it, which must be checked in the actual output.
export function presetWithoutPsycheField(preset) {
    let removed = 0;
    const result = { ...preset, prompts: preset.prompts.map(prompt => typeof prompt.content !== 'string'
        ? { ...prompt } : { ...prompt, content: prompt.content.replace(/^Psyche =[^\n]*(?:\n|$)/gm,
            () => { removed++; return ''; }) }) };
    if (removed !== 1) throw Error('Expected exactly one Psyche field in the isolated preset; no writer request sent.');
    return result;
}

// Bounded static counterpart of the host's name expansion in card fields.
// Not a general ST macro engine: other macros remain visible, never invented.
export function resolvedPlannerReference(reference, { userName, characterName }) {
    if (typeof userName !== 'string' || !userName || typeof characterName !== 'string' || !characterName) {
        throw Error('Resolved planner reference requires explicit frozen names');
    }
    const result = structuredClone(reference);
    for (const key of ['description', 'personality', 'scenario', 'persona', 'cardSystemReference']) {
        if (typeof result[key] === 'string') result[key] = result[key].replace(/\{\{(user|char)\}\}/gi,
            (_match, name) => name.toLowerCase() === 'user' ? userName : characterName);
    }
    return result;
}

export function presetWriterInput({ preset, reference, history, messages, clarified = false, userName = 'Elizabeth', characterName = 'Storyteller' }) {
    const expand = s => s.replace(/\{\{user\}\}/gi, userName).replace(/\{\{char\}\}/gi, characterName);
    const contentFor = p => ({ charDescription: reference.description, charPersonality: reference.personality,
        personaDescription: reference.persona, scenario: reference.scenario })[p.identifier] ?? p.content ?? '';
    const absolute = preset.prompts.filter(p => p.injection_position === 1 && contentFor(p).trim());
    if (absolute.some(p => p.injection_depth !== 1 || (p.injection_order ?? 100) !== 100)) throw Error('Unsupported preset depth/order; do not silently approximate');
    const chat = messages.map(m => ({ role: m.role, content: m.content }));
    if (chat.at(-1)?.role !== 'user') throw Error('Expected latest user');
    // ST populationInjectionPrompts groups system/user/assistant into reverse
    // chronological history, then reverses it. Reproduce the resulting order.
    const injected = ['assistant', 'user', 'system'].map(role => ({ role, content: absolute.filter(p => p.role === role).map(p => expand(contentFor(p))).join('\n') })).filter(p => p.content);
    if (clarified) injected.push({ role: 'system', content: SCOPE_COMPATIBILITY });
    chat.splice(chat.length - 1, 0, ...injected);
    const conversation = [];
    for (const prompt of preset.prompts) {
        if (prompt.identifier === 'chatHistory') conversation.push(...chat);
        else if (prompt.injection_position !== 1 && contentFor(prompt).trim()) conversation.push({ role: prompt.role || 'system', content: expand(contentFor(prompt)) });
    }
    // Saved historical evidence, not a fabricated runtime continuity snapshot.
    conversation.unshift({ role: 'system', content: JSON.stringify({ accepted_historical_context: history, limitation: 'Isolated branch; runtime world-info and continuity retrieval are not reproduced.' }) });
    return conversation;
}
