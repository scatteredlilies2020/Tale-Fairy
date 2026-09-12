import { evidenceRelevance, relevantExcerpt } from './evidence-selection.js?v=0.13.9';

// Kept outside planner state: an asynchronous planner save must never replace
// the immutable pre-response packet or the replacement lifecycle marker.
export const GENERATION_CONTEXT_KEY = 'taleFairyGenerationContext';
export const REPLACEMENT_PENDING_KEY = 'taleFairyReplacementPending';
export const GENERATION_CACHE_LIMIT = 12;

function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
    return value;
}

export function plotInputKey(chatId, messages, inputs = {}) {
    const text = JSON.stringify(stable({ chatId, messages: messages.map(({ is_user, name, mes }) => ({ is_user: Boolean(is_user), name: name || '', mes: mes || '' })), inputs }));
    let a = 2166136261, b = 5381;
    for (let i = 0; i < text.length; i++) {
        a = Math.imul(a ^ text.charCodeAt(i), 16777619);
        b = Math.imul(b, 33) ^ text.charCodeAt(i);
    }
    return `${text.length}:${a >>> 0}:${b >>> 0}`;
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
    if (messages.length === count) return fingerprint(messages) === pending.fingerprint;
    return messages.length === count + 1 && !messages.at(-1)?.is_user
        && fingerprint(messages.slice(0, -1)) === pending.fingerprint;
}

function excerpt(value, budget, query = '') {
    return relevantExcerpt(String(value || '').replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim(), budget, query)
        .replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

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
