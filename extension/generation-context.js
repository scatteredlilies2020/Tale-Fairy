import { evidenceRelevance } from './evidence-selection.js?v=0.13.9';
import { estimateTokenCount, truncateToTokenBudget } from './token-budget.js?v=0.13.9';
import { sceneStatus } from './transcript-status.js?v=0.14.5';
import { campaignAuthorInstructions, campaignPayload, validCampaignState } from './campaign-planner.js';

// Kept outside planner state: an asynchronous planner save must never replace
// the immutable pre-response packet or the replacement lifecycle marker.
export const GENERATION_CONTEXT_KEY = 'taleFairyGenerationContext';
export const REPLACEMENT_PENDING_KEY = 'taleFairyReplacementPending';
export const GENERATION_CACHE_LIMIT = 12;
export const PLOT_ANCHOR_VERSION = 4;

// Compare completed planning runs, not UI saves or reply-verification updates.
export function hasNewerPlannerState(state, packet) {
    if (state?.plannerContract === 15) return validCampaignState(state.campaignPreparation)
        && state.campaignPreparation.source.messageCount >= (packet?.plannerState?.campaignPreparation?.source?.messageCount || 0)
        && state.campaignPreparation.revision > (packet?.plannerState?.campaignPreparation?.revision || 0);
    const revision = value => Number(value?.preparedWorld?.source?.startedAt || value?.lastAnalyzedAt || 0);
    return Number(state?.sourceMessageCount || 0) >= Number(packet?.plannerState?.sourceMessageCount || 0)
        && revision(state) > revision(packet?.plannerState);
}

export function hasPlannerConditions(context) {
    return (context?.conditions || []).some(item => item.condition && !String(item.id || '').startsWith('fallback-'));
}

export function generationPreviewDescription({ reused = false, dynamic = false, future = false, deferred = false, planning = false, prepared = false, nextReady = false } = {}) {
    if (future) return reused ? 'Reused story context and possible developments' : 'Story context and possible developments';
    if (dynamic) return reused ? 'Reused scene excerpts and current conditions' : 'Scene excerpts and current conditions';
    if (prepared && nextReady) return 'Scene excerpts · updated context ready for the next retry';
    if (prepared && planning) return 'Scene excerpts · planning for a later request';
    if (prepared) return 'Scene excerpts · use Guide now to refresh planning';
    if (planning) return 'Scene excerpts · planning in the background';
    if (reused) return 'Reused scene excerpts';
    if (deferred) return 'Scene excerpts · a new contribution or Continue resumes planning';
    return 'Scene excerpts · awaiting planner context';
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
        && (item.plannerState?.plannerContract === 15
            ? item.payload === campaignPayload(item.selection.preparedUsable && validCampaignState(item.plannerState.campaignPreparation)
                ? item.plannerState.campaignPreparation : null, campaignAuthorInstructions(item.plannerState))
            : item.payload.includes('<plot-anchor>') && item.payload.length <= 24000)).slice(-GENERATION_CACHE_LIMIT);
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
    const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
        bull: '•', middot: '·', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' };
    // Decode presentation only; never execute HTML or modify the cache's raw
    // transcript identity. Unknown entities remain literal text.
    const decoded = String(value || '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (raw, entity) => {
        if (!entity.startsWith('#')) return entities[entity.toLowerCase()] ?? raw;
        const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
        return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : raw;
    });
    const text = decoded.replace(/\r\n?/gu, '\n')
        .replace(/^\s*(?:`{3,}|~{3,})[^\n]*$/gmu, '')
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, '')
        .replace(/<\/?(?:br|p|div|li|tr|h[1-6])\b[^>]*>/giu, '\n')
        .replace(/<\/?[a-z][^>]*>/giu, ' ')
        .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?)/gmu, '')
        .replace(/[*`]/gu, '').replace(/\b_([^_\n]+)_\b/gu, '$1')
        .replace(/[^\S\n]+/gu, ' ').replace(/ *\n */gu, '\n').replace(/\n{3,}/gu, '\n\n').trim();
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
    const status = assistant && sceneStatus(assistant.mes);
    if (status) lines.push(`Scene status: ${excerpt(status, 220)}`);
    if (assistant) lines.push(`Accepted scene excerpt (${excerpt(assistant.name || 'narrator', 20)}): ${excerpt(assistant.mes, 180, query)}`);
    if (user) lines.push(`Latest contribution: ${excerpt(user.mes, 140, assistant?.mes)}`);
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
    if (!lines.length) lines.push('Opening scene.');
    return `<plot-anchor>\nCURRENT SCENE:\n${lines.join('\n')}\n</plot-anchor>`;
}
