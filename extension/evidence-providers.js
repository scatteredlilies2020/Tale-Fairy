import { readCampaignContinuity, fitCampaignContinuity } from './campaign-continuity.js';
import { conservativeTokenCount } from './token-budget.js?story-budget=1';

// Opt-in, synchronous cached reads only. No scraping, extraction, subscription,
// network, model call, or write method is part of this interface.
const providers = new Map();
export function registerEvidenceProvider(provider) {
    if (!provider || provider.version !== 1 || !/^[a-z][a-z0-9-]{0,79}$/.test(provider.id)
        || provider.id === 'continuity-memory' || typeof provider.read !== 'function'
        || providers.has(provider.id)) throw Error('Invalid or duplicate evidence provider');
    providers.set(provider.id, provider);
    return () => { if (providers.get(provider.id) === provider) providers.delete(provider.id); };
}
export function evidenceIdentity(context) {
    return { chatId: String(context.getCurrentChatId?.() || ''),
        owner: context.groupId ? `group:${context.groupId}` : `character:${context.characterId ?? 'unknown'}` };
}
export function evidencePrefix(messages) {
    return JSON.stringify(messages.map(m => ({ text: String(m?.mes || ''), name: String(m?.name || ''),
        user: Boolean(m?.is_user), system: Boolean(m?.is_system) })));
}
function normalize(provider, raw, identity, messages) {
    if (!raw || raw.chatId !== identity.chatId || raw.owner !== identity.owner
        || raw.status === 'stale' || !identity.chatId) return { provider: provider.id, status: 'stale' };
    const count = raw.coverage?.messageCount;
    const hasProof = Number.isSafeInteger(count) && count >= 0 && count <= messages.length
        && typeof raw.coverage?.sourcePrefix === 'string';
    if (raw.coverage && !hasProof) return { provider: provider.id, status: 'stale' };
    if (hasProof && raw.coverage.sourcePrefix !== evidencePrefix(messages.slice(0, count))) return { provider: provider.id, status: 'stale' };
    // Missing proof is useful context, never a current-state assertion.
    const current = hasProof && raw.status === 'current';
    const records = (Array.isArray(raw.records) ? raw.records : []).slice(0, 64)
        .filter(r => r && typeof r.id === 'string' && r.id && typeof r.text === 'string' && r.text.trim())
        .map(r => structuredClone(r));
    return { provider: provider.id, status: current ? 'current' : 'context',
        confidence: current ? 'source-verified' : 'lower-confidence-context',
        chatId: identity.chatId, owner: identity.owner, revision: raw.revision ?? null,
        freshness: current ? 'verified-accepted-prefix' : 'unknown',
        coverage: hasProof ? { messageCount: count } : null,
        provenance: typeof raw.provenance === 'string' ? raw.provenance : provider.id,
        summary: typeof raw.summary === 'string' ? raw.summary : '', records };
}
export function readEvidenceProviders(context, { continuityBridge, continuityEnabled = true, replacement = false,
    enabled = true, adapters = [...providers.values()] } = {}) {
    if (!enabled || replacement) return [];
    const identity = evidenceIdentity(context), messages = context.chat || [];
    const result = [];
    if (continuityEnabled) {
        const cm = readCampaignContinuity(context, continuityBridge, { replacement });
        result.push({ ...cm, provider: 'continuity-memory', owner: identity.owner,
            confidence: cm.status === 'current' ? cm.coverage ? 'source-verified' : 'lower-confidence-context' : 'unavailable', provenance: 'Continuity Memory public context bridge' });
    }
    for (const provider of adapters.slice(0, 8)) {
        try {
            if (provider.version !== 1 || typeof provider.read !== 'function') throw Error('Unsupported provider');
            // Providers receive identity only, not settings, secrets or mutable ST state.
            const raw = provider.read(Object.freeze({ ...identity }));
            if (raw?.then) { raw.catch?.(() => {}); throw Error('Evidence reads must be synchronous'); }
            result.push(normalize(provider, raw, identity, messages));
        } catch { result.push({ provider: provider.id, status: 'unavailable' }); }
    }
    return result;
}
export function fitEvidenceProviders(evidence, tokenLimit, fits) {
    const limit = Math.max(0, Math.min(12000, Number(tokenLimit) || 0));
    const result = [];
    const seen = new Set();
    for (const snapshot of evidence || []) {
        if (!['current', 'context'].includes(snapshot.status)) continue;
        const meta = { provider: snapshot.provider, owner: snapshot.owner, confidence: snapshot.confidence,
            provenance: snapshot.provenance };
        // Deduplicate exact text only, in provider order. Similar statements
        // may differ in scope or provenance and must not be merged.
        const summary = seen.has(snapshot.summary?.trim()) ? '' : snapshot.summary;
        const local = new Set(seen);
        if (summary?.trim()) local.add(summary.trim());
        const records = (snapshot.records || []).filter(record => {
            const text = record.text?.trim();
            if (!text || local.has(text)) return false;
            local.add(text);
            return true;
        });
        const packed = fitCampaignContinuity({ ...snapshot, summary, records, status: 'current' }, limit, value => {
            const next = [...result, { ...value, ...meta }];
            return conservativeTokenCount(JSON.stringify(next)) <= limit && fits(next);
        });
        if (packed) {
            result.push({ ...packed, ...meta });
            if (packed.summary) seen.add(packed.summary.trim());
            for (const record of packed.records) seen.add(record.text.trim());
        }
    }
    return result;
}
export function evidenceRevisionKey(evidence) {
    return JSON.stringify((evidence || []).filter(e => ['current', 'context'].includes(e.status)));
}
