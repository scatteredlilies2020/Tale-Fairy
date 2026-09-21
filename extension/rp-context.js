import { evidenceIdentity, evidencePrefix } from './evidence-providers.js';

const SOURCE_KEY = /summary|summari|synopsis|recap|chronicle|memory|world.?info|lore|story.?so.?far/i;
const PRIVATE_KEY = /reasoning|scratch|logprob|token|secret|api.?key|password|continuity.?memory|tale.?fairy|living.?world.?guide|preset|style|mood|tone|pacing/i;
const SOURCE_SHAPE = /^\s*(?:#{1,4}\s*|\[|<)?(?:summary|recap|synopsis|chronicle|world info)\b/i;
const OWN_BLOCK = /<(tale-fairy-[\w-]+|living-world-guide|user-established-canon)>[\s\S]*?<\/\1>/gi;
const clean = value => typeof value === 'string' ? value.replace(OWN_BLOCK, '').trim() : '';

// Read named text fields only. Never serialize extension settings, arbitrary
// objects, private recall stores, reasoning, or the assembled writing preset.
function sourceText(value) {
    if (typeof value === 'string') return clean(value);
    if (!value || typeof value !== 'object' || value.status === 'stale') return '';
    return ['summary', 'text', 'content', 'value', 'prompt'].map(key => clean(value[key])).filter(Boolean).join('\n');
}

// One ephemeral snapshot of entries activated by the HOST. No book reads,
// activation calls or persisted lore index. The next generation clears it,
// including when ST emits no activation event for that generation.
export class ActivatedStoryContext {
    clear() { this.snapshot = null; }
    capture(context, entries) {
        const identity = evidenceIdentity(context);
        const chat = context.chat || [];
        this.snapshot = { ...identity, count: chat.length, prefix: evidencePrefix(chat),
            records: (Array.isArray(entries) ? entries : []).slice(0, 64)
                .filter(entry => !entry?.disable)
                .map((entry, index) => ({ id: `activated-${index}`, text: clean(entry?.content), category: 'activated-lore' }))
                .filter(entry => entry.text) };
    }
    read(context) {
        const saved = this.snapshot, identity = evidenceIdentity(context), chat = context.chat || [];
        if (!saved || !identity.chatId || saved.chatId !== identity.chatId || saved.owner !== identity.owner
            || chat.length < saved.count || chat.length > saved.count + 1
            || chat.length > saved.count && chat.at(-1)?.is_user
            || evidencePrefix(chat.slice(0, saved.count)) !== saved.prefix) return [];
        return saved.records;
    }
}

export function readHostStoryEvidence(context, { ownPromptKey, activated, exclude = [] } = {}) {
    const records = [], seen = new Set(exclude.map(clean).filter(Boolean));
    const add = (id, value, category) => {
        const text = sourceText(value);
        if (!text || seen.has(text) || records.length >= 64) return;
        seen.add(text);
        records.push({ id, text, category });
    };
    for (const [key, value] of Object.entries(context.extensionPrompts || {})) {
        if (key === ownPromptKey || PRIVATE_KEY.test(key)) continue;
        if (SOURCE_KEY.test(key) || SOURCE_SHAPE.test(sourceText(value))) add(`prompt:${key}`, value, 'injected-summary');
    }
    for (const [key, value] of Object.entries(context.chatMetadata || {})) {
        if (SOURCE_KEY.test(key) && !PRIVATE_KEY.test(key)) add(`metadata:${key}`, value, 'chat-summary');
    }
    // Message summaries are often successive snapshots. Use the latest text
    // per exposed key, not a stack of earlier versions of the same recap.
    const summaryKeys = new Set(), chat = context.chat || [];
    for (let index = chat.length - 1; index >= Math.max(0, chat.length - 32); index--) {
        const message = chat[index];
        for (const [key, value] of Object.entries(message.extra || {})) {
            if (SOURCE_KEY.test(key) && !PRIVATE_KEY.test(key) && !summaryKeys.has(key) && sourceText(value)) {
                summaryKeys.add(key);
                add(`message:${index}:${key}`, value, 'message-summary');
            }
        }
    }
    for (const record of activated?.read(context) || []) add(record.id, record.text, record.category);
    if (!records.length) return null;
    return { ...evidenceIdentity(context), provider: 'host-story-context', status: 'context',
        confidence: 'lower-confidence-context', freshness: 'host-exposed; not enactment proof',
        provenance: 'Host summaries and observed lore activation; no independent scan',
        revision: null, summary: '', records };
}
