import { compactContinuityPrompt } from './continuity.js';
import { estimateTokenCount, truncateToTokenBudget } from './token-budget.js';

const SUMMARY_KEY = /(?:summar(?:y|ies|i[sz](?:e|ed|er|ing|ation)?)|synopsis|recap|story[\s_.-]*so[\s_.-]*far|memory|continuity|chronicle|world[\s_.-]*(?:state|info|status|model)|lore|plot[\s_.-]*state|session[\s_.-]*state|context[\s_.-]*(?:ledger|summary|memory|state))/iu;
const SUMMARY_SHAPE = /(?:^|\n)\s*(?:#{1,4}\s*)?(?:\[|<)?(?:summary|synopsis|recap|story\s+so\s+far|continuity|chronicle|world\s+(?:state|info|status)|lore|plot\s+state|session\s+state)(?:\]|>|\s*:|\s*$)/imu;
const REASONING_KEY = /(?:reasoning|chain[\s_.-]*of[\s_.-]*thought|scratch[\s_.-]*pad|hidden[\s_.-]*thought|logprobs?|token[\s_.-]*usage|planner[\s_.-]*prompt)/iu;
const TEXT_KEYS = new Set(['summary', 'text', 'content', 'value', 'prompt', 'memory', 'recap', 'synopsis', 'state', 'worldstate', 'world_state', 'lore', 'chronicle']);

function cleanText(value) {
    return String(value || '')
        .replace(/\r\n?/gu, '\n')
        .replace(/[\t ]+/gu, ' ')
        .replace(/ *\n */gu, '\n')
        .replace(/\n{4,}/gu, '\n\n\n')
        .trim();
}

function textLeaves(value, depth = 0, path = '') {
    if (depth > 5 || value == null) return [];
    if (typeof value === 'string') return [{ path, text: cleanText(value) }];
    if (Array.isArray(value)) return value.flatMap((item, index) => textLeaves(item, depth + 1, `${path}[${index}]`));
    if (typeof value !== 'object') return [];
    return Object.entries(value).flatMap(([key, item]) => {
        if (REASONING_KEY.test(key)) return [];
        const semantic = SUMMARY_KEY.test(key) || TEXT_KEYS.has(key.toLocaleLowerCase());
        if (!semantic && depth > 0) return [];
        return textLeaves(item, depth + 1, path ? `${path}.${key}` : key);
    });
}

function sanitizedEvidence(value, depth = 0) {
    if (depth > 6 || value == null) return undefined;
    if (typeof value === 'string') return cleanText(value);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.map(item => sanitizedEvidence(item, depth + 1)).filter(item => item !== undefined);
    if (typeof value !== 'object') return undefined;
    const result = {};
    for (const [key, item] of Object.entries(value)) {
        if (REASONING_KEY.test(key)) continue;
        const cleaned = sanitizedEvidence(item, depth + 1);
        if (cleaned !== undefined && cleaned !== '' && (!Array.isArray(cleaned) || cleaned.length) && (typeof cleaned !== 'object' || Array.isArray(cleaned) || Object.keys(cleaned).length)) result[key] = cleaned;
    }
    return result;
}

function sourceKey(text) {
    return cleanText(text).replace(/\s+/gu, ' ').toLocaleLowerCase();
}

function compactHeadAndTail(value, tokenLimit, kind = '') {
    const text = cleanText(value);
    const limit = Math.max(0, Math.floor(Number(tokenLimit) || 0));
    if (!text || !limit) return '';
    if (estimateTokenCount(text) <= limit) return text;
    // Continuity's specialist compactor intentionally has a 500-token floor.
    // Below that, use the generic two-edge excerpt so this bundle's aggregate
    // token budget remains exact.
    if (kind === 'continuity-memory' && limit >= 500) return compactContinuityPrompt(text, limit);
    if (limit < 48) return truncateToTokenBudget(text, limit);
    const marker = '\n…[summary excerpt compacted]…\n';
    const markerTokens = estimateTokenCount(marker);
    const usable = Math.max(16, limit - markerTokens);
    const head = truncateToTokenBudget(text, Math.ceil(usable * 0.62));
    const tail = truncateToTokenBudget(text, Math.floor(usable * 0.38), { fromEnd: true });
    return `${head}${marker}${tail}`.trim();
}

function normalizedSource(source, ordinal = 0) {
    const text = cleanText(source?.text);
    if (!text) return null;
    return {
        label: cleanText(source?.label || 'Summary source').slice(0, 140),
        kind: cleanText(source?.kind || 'summary').slice(0, 60),
        priority: Math.max(0, Math.min(4, Number(source?.priority) || 0)),
        text,
        ordinal,
        originalTokens: estimateTokenCount(text),
    };
}

/**
 * Give every discovered source a real excerpt before allocating surplus to
 * high-authority sources. This prevents one large memory prompt from starving
 * a smaller world-state recap while keeping the entire bundle token bounded.
 */
export function compactSummarySources(sources, requestedTokenLimit = 4000, { maxSources = 24 } = {}) {
    const limit = Math.max(0, Math.floor(Number(requestedTokenLimit) || 0));
    if (!limit) return [];
    const seen = new Set();
    const unique = [];
    for (const [ordinal, source] of (Array.isArray(sources) ? sources : []).entries()) {
        const item = normalizedSource(source, ordinal);
        if (!item) continue;
        const key = sourceKey(item.text);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push(item);
    }
    const ranked = unique
        .sort((a, b) => a.priority - b.priority || a.ordinal - b.ordinal)
        .slice(0, Math.max(1, Math.min(32, Number(maxSources) || 24)));
    const chosen = [];
    let runningHeaderTokens = 0;
    for (const item of ranked) {
        const headerTokens = estimateTokenCount(`${item.label} ${item.kind}`) + 5;
        if (chosen.length && runningHeaderTokens + headerTokens + (chosen.length + 1) * 16 > limit) break;
        chosen.push(item);
        runningHeaderTokens += headerTokens;
    }
    if (!chosen.length) return [];

    const labelTokens = runningHeaderTokens;
    const available = Math.max(1, limit - labelTokens);
    const base = Math.max(16, Math.min(120, Math.floor(available / chosen.length)));
    const allocations = chosen.map(item => Math.min(item.originalTokens, base));
    let remaining = Math.max(0, available - allocations.reduce((sum, value) => sum + value, 0));

    // Redistribute unused capacity in small passes so short sources do not
    // waste their allocation and priority does not become exclusivity.
    for (let pass = 0; pass < 4 && remaining > 0; pass++) {
        const active = chosen.map((item, index) => ({ item, index }))
            .filter(({ item, index }) => allocations[index] < item.originalTokens);
        if (!active.length) break;
        const weightTotal = active.reduce((sum, { item }) => sum + (5 - item.priority), 0);
        let spent = 0;
        for (const { item, index } of active) {
            const share = Math.max(1, Math.floor(remaining * (5 - item.priority) / weightTotal));
            const grant = Math.min(share, item.originalTokens - allocations[index], remaining - spent);
            allocations[index] += Math.max(0, grant);
            spent += Math.max(0, grant);
            if (spent >= remaining) break;
        }
        if (!spent) break;
        remaining -= spent;
    }

    return chosen.map((item, index) => {
        const text = compactHeadAndTail(item.text, allocations[index], item.kind);
        const includedTokens = estimateTokenCount(text);
        return {
            label: item.label,
            kind: item.kind,
            priority: item.priority,
            text,
            originalTokens: item.originalTokens,
            includedTokens,
            truncated: includedTokens < item.originalTokens,
        };
    }).filter(item => item.text);
}

function appendLeaves(target, value, base, { requireShape = false } = {}) {
    // Once the *container* has been identified as summary/world-state
    // evidence, its internal schema is not required to repeat words such as
    // `summary` or `state`. Serialize genuinely structured containers as one
    // evidence item so arbitrary fields (locations, relationships, clocks,
    // resources, etc.) survive together. Simple { value/text/summary: ... }
    // envelopes still use the prose path below, which also preserves exact
    // deduplication with provider bridge snapshots.
    const keys = value && typeof value === 'object' && !Array.isArray(value)
        ? Object.keys(value).filter(key => !REASONING_KEY.test(key))
        : [];
    const isStructuredContainer = keys.some(key => !TEXT_KEYS.has(key.toLocaleLowerCase()) && !SUMMARY_KEY.test(key));
    if (isStructuredContainer) {
        const text = cleanText(JSON.stringify(sanitizedEvidence(value)));
        if (text.length >= 24 && (!requireShape || SUMMARY_SHAPE.test(text))) target.push({ ...base, text });
        return;
    }
    const leaves = textLeaves(value);
    for (const leaf of leaves) {
        if (leaf.text.length < 24) continue;
        if (requireShape && !SUMMARY_SHAPE.test(leaf.text)) continue;
        target.push({ ...base, label: leaf.path ? `${base.label} · ${leaf.path}` : base.label, text: leaf.text });
    }
    // Some memory tools expose a structured world-state object rather than a
    // prose `summary`/`value` field. Preserve that evidence generically instead
    // of requiring knowledge of the extension's schema.
    if (!leaves.length && value && typeof value === 'object') {
        const text = cleanText(JSON.stringify(sanitizedEvidence(value)));
        if (text.length >= 24 && (!requireShape || SUMMARY_SHAPE.test(text))) target.push({ ...base, text });
    }
}

/**
 * Discover recap-like evidence already exposed by SillyTavern and installed
 * extensions. Tale Fairy remains independent: Continuity Memory is a preferred
 * optional provider, not a required host or owner of the planner.
 */
export async function collectSummarySources(context = {}, messages = [], options = {}) {
    const discovered = [];
    const ownPromptKey = String(options.ownPromptKey || 'living-world-guide_context');
    if (options.continuityContext) {
        discovered.push({ label: 'Continuity Memory snapshot', kind: 'continuity-memory', priority: 0, text: options.continuityContext });
    }

    for (const [key, value] of Object.entries(context.extensionPrompts || {})) {
        if (key === ownPromptKey) continue;
        if (key === 'continuity_memory_context' && options.includeContinuity === false) continue;
        const semanticKey = SUMMARY_KEY.test(key);
        appendLeaves(discovered, value, {
            label: `Extension prompt: ${key}`,
            kind: key === 'continuity_memory_context' ? 'continuity-memory' : 'extension-summary',
            priority: key === 'continuity_memory_context' ? 0 : 1,
        }, { requireShape: !semanticKey });
    }

    for (const [key, value] of Object.entries(context.chatMetadata || {})) {
        if (!SUMMARY_KEY.test(key) || REASONING_KEY.test(key)) continue;
        appendLeaves(discovered, value, { label: `Chat metadata: ${key}`, kind: 'chat-summary', priority: 1 });
    }

    const hostMessages = Array.isArray(context.chat) && context.chat.length ? context.chat : messages;
    for (let index = hostMessages.length - 1; index >= 0; index--) {
        const message = hostMessages[index] || {};
        for (const [key, value] of Object.entries(message.extra || {})) {
            if (!SUMMARY_KEY.test(key) || REASONING_KEY.test(key)) continue;
            appendLeaves(discovered, value, { label: `Message ${index + 1} extra: ${key}`, kind: 'message-summary', priority: 2 });
        }
        const body = cleanText(message.mes);
        if (SUMMARY_SHAPE.test(body)) {
            discovered.push({ label: `In-text recap at message ${index + 1}`, kind: 'in-text-summary', priority: 3, text: body });
        }
    }

    if (typeof context.getWorldInfoPrompt === 'function' && messages.length) {
        try {
            const chatForWorldInfo = messages.map(message => String(message?.mes || '')).filter(Boolean).reverse();
            const result = await context.getWorldInfoPrompt(chatForWorldInfo, Number(context.maxContext) || 100000, true);
            appendLeaves(discovered, result?.worldInfoString || result, { label: 'Active World Info', kind: 'world-info', priority: 1 });
        } catch (error) {
            options.onWarning?.('Could not read active World Info for planner context', error);
        }
    }

    return compactSummarySources(discovered, options.tokenBudget || 4000, { maxSources: options.maxSources || 24 });
}

export function summarySourceAudit(sources) {
    const values = Array.isArray(sources) ? sources : [];
    return {
        count: values.length,
        includedTokens: values.reduce((sum, item) => sum + (Number(item?.includedTokens) || estimateTokenCount(item?.text)), 0),
        originalTokens: values.reduce((sum, item) => sum + (Number(item?.originalTokens) || estimateTokenCount(item?.text)), 0),
        labels: values.map(item => String(item?.label || '')).filter(Boolean),
    };
}
