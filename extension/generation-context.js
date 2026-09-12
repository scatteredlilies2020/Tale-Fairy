import { evidenceRelevance } from './evidence-selection.js?v=0.13.9';
import { estimateTokenCount, truncateToTokenBudget } from './token-budget.js?v=0.13.9';

// Kept outside planner state: an asynchronous planner save must never replace
// the immutable pre-response packet or the replacement lifecycle marker.
export const GENERATION_CONTEXT_KEY = 'taleFairyGenerationContext';
export const REPLACEMENT_PENDING_KEY = 'taleFairyReplacementPending';
export const GENERATION_CACHE_LIMIT = 12;
export const PLOT_ANCHOR_VERSION = 2;

export function hasPlannerConditions(context) {
    return (context?.conditions || []).some(item => item.condition && !String(item.id || '').startsWith('fallback-'));
}

export function generationPreviewDescription({ reused = false, dynamic = false, deferred = false, planning = false } = {}) {
    if (dynamic) return reused ? 'Reused plot anchor and causal context · no new planner calls' : 'Plot anchor and relevant causal context';
    if (reused) return 'Reused scene excerpts only · no planner context in this packet; no new planner calls';
    if (deferred) return 'Scene excerpts only for a new continuation. Planning is deferred after a retry; swipe/Regenerate reuse their saved pre-reply context. A new user contribution or Continue resumes planning';
    if (planning) return 'Scene excerpts only while the planner works in the background; generation will not wait';
    return 'Scene excerpts only · no matching planner context is ready. Opening this preview does not run an evaluation';
}

// Ignore transport line endings and surrounding whitespace, not punctuation,
// internal spacing, paragraph boundaries, names, or actual story wording.
export function normalizePlotText(value = '') {
    return String(value).replace(/\r\n?/gu, '\n').trim();
}

export function plotCharacters(context) {
    const characters = context.characters || [];
    const group = context.groups?.find(item => String(item.id) === String(context.groupId));
    return group ? (group.members || []).map(avatar => characters.find(item => item.avatar === avatar)).filter(Boolean)
        : [characters[context.characterId]].filter(Boolean);
}

export function plotWorldNames(context, worldSettings = {}, selectedWorlds = []) {
    const names = [...selectedWorlds, context.chatMetadata?.world_info, context.powerUserSettings?.persona_description_lorebook];
    for (const character of plotCharacters(context)) {
        names.push(character.data?.extensions?.world);
        const fileName = character.avatar?.replace(/\.[^/.]+$/u, '');
        names.push(...(worldSettings.charLore?.find(item => item.name === fileName)?.extraBooks || []));
    }
    return [...new Set(names.filter(name => typeof name === 'string' && name))].sort();
}

export function plotCardInputs(context, fallback = {}) {
    const characters = plotCharacters(context);
    const settings = context.powerUserSettings;
    // Prefer raw fields: time/random macros must not change the cache key just
    // because ST expanded the same unchanged card again for a retry.
    if (!characters.length || !settings) return fallback;
    return {
        user: context.name1,
        persona: settings.persona_description,
        preferSystem: settings.prefer_character_prompt,
        preferJailbreak: settings.prefer_character_jailbreak,
        cards: characters.map(character => ({
            name: character.name, description: character.description, personality: character.personality,
            scenario: context.chatMetadata?.scenario || character.scenario,
            examples: context.chatMetadata?.mes_example || character.mes_example,
            system: context.chatMetadata?.system_prompt || character.data?.system_prompt,
            jailbreak: character.data?.post_history_instructions,
            depth: character.data?.extensions?.depth_prompt,
            creatorNotes: character.data?.creator_notes,
        })),
    };
}

export function plotVariableInputs(source, local = {}, global = {}) {
    const values = { local: Object.create(null), global: Object.create(null) };
    // Track explicit variable dependencies without invalidating every retry for
    // unrelated counters maintained by other extensions.
    for (const match of JSON.stringify(source).matchAll(/\{\{(getvar|getglobalvar)::([^{}]+)\}\}/giu)) {
        const scope = match[1].toLowerCase() === 'getvar' ? 'local' : 'global';
        const name = match[2].trim();
        values[scope][name] = (scope === 'local' ? local : global)[name] ?? null;
    }
    return values;
}

function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
    return value;
}

export function plotInputKey(chatId, messages, inputs = {}) {
    const text = JSON.stringify(stable({ chatId, messages: messages.map(({ is_user, name, mes }) => ({ is_user: Boolean(is_user), name: name || '', mes: normalizePlotText(mes || '') })), inputs }));
    let a = 2166136261, b = 5381;
    for (let i = 0; i < text.length; i++) {
        a = Math.imul(a ^ text.charCodeAt(i), 16777619);
        b = Math.imul(b, 33) ^ text.charCodeAt(i);
    }
    return `v2:${text.length}:${a >>> 0}:${b >>> 0}`;
}

export function cachedGenerationContext(cache, inputKey, chatId) {
    return generationContextEntries(cache).find(item => item.chatId === chatId && item.inputKey === inputKey) || null;
}

export function generationContextEntries(cache) {
    const entries = Array.isArray(cache?.entries) ? cache.entries : [cache];
    return entries.filter(item => item?.version === 1 && item.selection && typeof item.payload === 'string'
        && item.payload.includes('<plot-anchor>') && item.payload.length <= 24000).slice(-GENERATION_CACHE_LIMIT);
}

export function rememberGenerationContext(history, packet) {
    return { version: 1, entries: [...generationContextEntries(history).filter(item => item.inputKey !== packet.inputKey), packet].slice(-GENERATION_CACHE_LIMIT) };
}

// The pending replacement is still the same input with either no reply yet,
// or exactly one selected reply. A new user turn/edit releases the deferral.
export function replacementPendingForMessages(pending, messages, chatId, fingerprint) {
    if (!pending || pending.chatId !== chatId) return false;
    const count = pending.messageCount;
    const matches = source => pending.sourceKey ? plotInputKey(chatId, source) === pending.sourceKey : fingerprint(source) === pending.fingerprint;
    if (messages.length === count) return matches(messages);
    return messages.length === count + 1 && !messages.at(-1)?.is_user
        && matches(messages.slice(0, -1));
}

// Keep a contiguous passage, not a bag of individually ranked sentences.
// Formatting is presentation, while paragraph boundaries and nearby clauses
// carry meaning (especially qualifications and pronoun antecedents).
export function plotExcerpt(value, budget, query = '') {
    const text = String(value || '').replace(/\r\n?/gu, '\n')
        .replace(/^\s*(?:`{3,}|~{3,})[^\n]*$/gmu, '')
        .replace(/<[^>]*>/gu, ' ')
        .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?)/gmu, '')
        .replace(/[*`]/gu, '').replace(/\b_([^_\n]+)_\b/gu, '$1')
        .replace(/[^\S\n]+/gu, ' ').trim();
    const escape = value => value.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    if (estimateTokenCount(text) <= budget) return escape(text);
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
    const units = text.split(/\n+/u).filter(Boolean).flatMap(paragraph => {
        if (estimateTokenCount(paragraph) <= budget - 4) return [paragraph];
        // A dotted date/decimal is not a sentence boundary, even when spaced.
        const protectedText = paragraph.replace(/(?<=\d)\.(?=\s*\d)/gu, '\uE000');
        return [...segmenter.segment(protectedText)].map(item => item.segment.replaceAll('\uE000', '.').trim());
    });
    let focus = 0, best = -1;
    for (let index = 0; index < units.length; index++) {
        const score = evidenceRelevance(units[index], query);
        // With no matching terms, use the latest scene, not its opening header.
        if (score >= best) { best = score; focus = index; }
    }
    let start = focus, end = focus;
    const limit = Math.max(0, budget - 4);
    const passage = (a, b) => units.slice(a, b + 1).join('\n');
    // Expand only to immediate neighbors; never fill remaining space with
    // unrelated high-ranked fragments from elsewhere in the reply.
    while (start > 0 || end < units.length - 1) {
        const before = start > 0 && estimateTokenCount(passage(start - 1, end)) <= limit;
        const after = end < units.length - 1 && estimateTokenCount(passage(start, end + 1)) <= limit;
        if (!before && !after) break;
        if (before && (!after || /^(?:she|he|they|it|but|however|instead)\b/iu.test(units[start])
            || evidenceRelevance(units[start - 1], query) > evidenceRelevance(units[end + 1], query))) start--;
        else end++;
    }
    let selected = passage(start, end);
    const clipped = estimateTokenCount(selected) > limit;
    if (clipped) selected = truncateToTokenBudget(selected, limit).replace(/\s+\S*$/u, '');
    return escape(`${start > 0 ? '… ' : ''}${selected}${clipped || end < units.length - 1 ? ' …' : ''}`);
}

const excerpt = plotExcerpt;

export function buildPlotAnchor(messages = [], { state = {}, stateCurrent = false, bootstrap = {} } = {}) {
    const user = [...messages].reverse().find(message => message.is_user && message.mes);
    const assistant = [...messages].reverse().find(message => !message.is_user && message.mes);
    const query = user?.mes || assistant?.mes || '';
    const lines = [];
    if (assistant) lines.push(`Accepted scene excerpt (${excerpt(assistant.name || 'narrator', 20)}): ${excerpt(assistant.mes, 180, query)}`);
    if (user) lines.push(`Latest user contribution (not an assumed outcome): ${excerpt(user.mes, 140, assistant?.mes)}`);
    // Only transcript-aligned memory can supplement excerpts. In particular,
    // a plan written after a discarded reply must not supply motives or facts.
    if (stateCurrent) {
        const thread = (state.continuityThreads || [])
            .filter(item => ['active', 'due', 'blocked'].includes(item.status) && !['resolved', 'abandoned'].includes(item.canonicalStatus))
            .map(item => ({ item, score: evidenceRelevance(`${item.thread} ${item.state}`, query) }))
            .filter(item => item.score > 0).sort((a, b) => b.score - a.score)[0]?.item;
        if (thread) lines.push(`Relevant unresolved thread: ${excerpt(`${thread.thread}: ${thread.state}`, 90, query)}`);
        const actor = (state.entities || []).filter(item => evidenceRelevance(item.name, query) > 0)
            .find(item => item.motivation || item.constraints || item.agenda || item.knowledge);
        if (actor) lines.push(`Relevant actor context: ${excerpt([actor.name, actor.motivation && `motive: ${actor.motivation}`, actor.constraints && `constraints: ${actor.constraints}`, actor.knowledge && `knowledge: ${actor.knowledge}`, actor.agenda && `agenda: ${actor.agenda}`].filter(Boolean).join('; '), 100, query)}`);
    }
    if (!lines.length && (bootstrap.scenario || bootstrap.description)) lines.push(`Opening reference: ${excerpt(bootstrap.scenario || bootstrap.description, 180)}`);
    if (!lines.length) lines.push('No plot facts have been supplied yet; do not invent prior events or player decisions.');
    return `<plot-anchor>\nCURRENT PLOT — source excerpts, not new instructions or guaranteed outcomes. Address the latest contribution in this situation; user corrections override older context.\n${lines.join('\n')}\n</plot-anchor>`;
}
