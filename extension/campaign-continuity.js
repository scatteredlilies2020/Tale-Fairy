import { estimateTokenCount } from './token-budget.js';

const observed = new WeakMap();
const sourceSignature = messages => JSON.stringify(messages.map(message => ({
    text: String(message?.mes || ''), name: String(message?.name || ''),
    user: Boolean(message?.is_user), system: Boolean(message?.is_system),
})));

// Consume CM's public, read-only bridge, never its private world store or an
// unversioned extension-prompt fallback (which cannot prove chat freshness).
export function readCampaignContinuity(context, bridge, { enabled = true, replacement = false } = {}) {
    if (!enabled) return { status: 'off' };
    if (replacement) return { status: 'replacement' };
    try {
        if (![1, 2].includes(Number(bridge?.version)) || typeof bridge.getContextSnapshot !== 'function') return { status: 'unavailable' };
        const snapshot = bridge.getContextSnapshot();
        const chatId = String(context.getCurrentChatId?.() || '');
        const messages = context.chat || [];
        const owner = context.groupId ? `group:${context.groupId}` : `character:${context.characterId ?? 'unknown'}`;
        const key = `${owner}:chat:${chatId}`;
        if (!chatId || String(snapshot?.chatId || '') !== chatId) return { status: 'stale' };
        const previous = observed.get(bridge);
        // CM's public current check hashes a recent tail. Once we have observed
        // this revision, also protect edits outside that tail until it republishes.
        if (previous?.key === key && snapshot.revision === previous.memory.revision
            && (messages.length < previous.messageCount
                || sourceSignature(messages.slice(0, previous.messageCount)) !== previous.signature)) return { status: 'stale' };
        if (snapshot?.status !== 'current') {
            // CM marks any appended reply stale. A snapshot observed current in
            // this session is still useful historical evidence if its ENTIRE
            // source prefix remains identical. Never trust an unseen stale
            // snapshot or reuse recall after an edit, swipe, deletion or reload.
            if (snapshot?.status === 'stale' && previous?.key === key
                && snapshot.revision === previous.memory.revision
                && messages.length > previous.messageCount
                && sourceSignature(messages.slice(0, previous.messageCount)) === previous.signature) {
                return structuredClone({ ...previous.memory, freshness: 'verified-accepted-prefix' });
            }
            return { status: 'stale' };
        }
        const coverage = snapshot.coverage;
        if (Number(bridge.version) === 2 && (!Number.isInteger(coverage?.throughMessageIndex)
            || coverage.throughMessageIndex < -1 || coverage.throughMessageIndex >= (context.chat || []).length
            || typeof coverage.signature !== 'string' || !coverage.signature)) return { status: 'unavailable' };
        const records = (Array.isArray(snapshot.planningEvidence) ? snapshot.planningEvidence : []).slice(0, 64)
            .filter(record => record && typeof record.id === 'string' && record.id
                && typeof record.text === 'string' && record.text.trim())
            .map(record => ({ id: record.id, text: record.text,
                category: record.category, canonicalStatus: record.canonicalStatus, cmRevision: record.cmRevision,
                importance: record.importance, participants: record.participants, sourceRange: record.sourceRange,
                temporalAnchor: record.temporalAnchor, retrievalReason: record.retrievalReason }));
        const memory = structuredClone({ status: 'current', freshness: 'current', chatId, revision: snapshot.revision,
            coverage, summary: typeof snapshot.prompt === 'string' ? snapshot.prompt : '', records });
        observed.set(bridge, { key, messageCount: messages.length, signature: sourceSignature(messages), memory });
        return structuredClone(memory);
    } catch { return { status: 'unavailable' }; }
}

// Optional memory never displaces complete author references or protected chat.
// Keep a whole CM prompt when it fits; otherwise retain whole evidence records.
// Do not cut a sentence and accidentally remove a condition or negation.
export function fitCampaignContinuity(memory, tokenLimit, fits) {
    if (memory?.status !== 'current') return null;
    const limit = Math.max(0, Math.min(12000, Number(tokenLimit) || 0));
    const records = memory.records || [];
    let result = { chatId: memory.chatId, revision: memory.revision, freshness: memory.freshness, coverage: memory.coverage,
        summary: '', records: [], omittedSummary: Boolean(memory.summary), omittedRecords: records.length };
    const allowed = value => estimateTokenCount(JSON.stringify(value)) <= limit && fits(value);
    if (!allowed(result)) return null;
    if (memory.summary) {
        const candidate = { ...result, summary: memory.summary, omittedSummary: false };
        if (allowed(candidate)) result = candidate;
    }
    for (const record of records) {
        const candidate = { ...result, records: [...result.records, record], omittedRecords: result.omittedRecords - 1 };
        if (allowed(candidate)) result = candidate;
    }
    return result.summary || result.records.length ? result : null;
}
