// Read-only, preset-informed isolated writer. Not a complete ST request clone:
// runtime world-info, continuity extensions and provider transforms are absent.
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
