import { estimateTokenCount, truncateToTokenBudget } from './token-budget.js?v=0.11.96';

function cleanPrompt(value) {
    return String(value || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function boundedEdge(value, tokenLimit, fromEnd = false) {
    if (estimateTokenCount(value) <= tokenLimit) return value;
    const clipped = truncateToTokenBudget(value, tokenLimit, { fromEnd });
    if (fromEnd) {
        const boundary = clipped.indexOf('\n');
        return clipped.slice(boundary >= 0 && boundary < 160 ? boundary + 1 : 0).trimStart();
    }
    const boundary = clipped.lastIndexOf('\n');
    return clipped.slice(0, boundary >= clipped.length - 160 ? boundary : clipped.length).trimEnd();
}

function boundedChronicleTail(value, tokenLimit) {
    if (estimateTokenCount(value) <= tokenLimit) return value;
    const markerIndex = value.toLowerCase().lastIndexOf('recursive chronicle');
    if (markerIndex < 0) return boundedEdge(value, tokenLimit, true);
    const lineEnd = value.indexOf('\n', markerIndex);
    const heading = value.slice(markerIndex, lineEnd >= 0 ? lineEnd : markerIndex + 100).trim();
    if (!heading) return boundedEdge(value, tokenLimit, true);
    const headingTokens = estimateTokenCount(heading);
    if (headingTokens >= tokenLimit) return truncateToTokenBudget(heading, tokenLimit);
    const tail = boundedEdge(value, tokenLimit - headingTokens - 1, true);
    if (tail.toLowerCase().includes('recursive chronicle')) return tail;
    return truncateToTokenBudget(`${heading}\n${tail}`, tokenLimit);
}

function semanticEvidenceText(items, requestedTokenLimit = 3500) {
    const limit = Math.max(500, Math.min(12000, Number(requestedTokenLimit) || 3500));
    const groups = new Map([
        ['recent canonical changes', []], ['important/due open threads', []], ['supporting records', []],
        ['relationships and current character state', []], ['Chronicle frontier', []], ['background context', []],
    ]);
    for (const item of Array.isArray(items) ? items : []) {
        const category = String(item?.category || '').toLowerCase();
        const status = String(item?.canonicalStatus || '').toLowerCase();
        const reason = String(item?.retrievalReason || '').toLowerCase();
        const bucket = category === 'threads' && ['open', 'pending'].includes(status)
            ? 'important/due open threads'
            : category === 'relationships' || category === 'states' || category === 'entities'
                ? 'relationships and current character state'
                : category === 'backgrounds' ? 'background context'
                    : category === 'events' && /chronicle|frontier/iu.test(reason) ? 'Chronicle frontier'
                        : /recent|correction|changed|updated/iu.test(reason) ? 'recent canonical changes' : 'supporting records';
        groups.get(bucket).push(item);
    }
    const sections = [];
    for (const [label, values] of groups) {
        if (!values.length) continue;
        const lines = values.slice().sort((a, b) => Number(b?.importance || 0) - Number(a?.importance || 0) || Number(b?.sourceRange?.to ?? -1) - Number(a?.sourceRange?.to ?? -1))
            .map(item => {
                const provenance = [item.id && `id=${item.id}`, item.canonicalStatus && `status=${item.canonicalStatus}`, item.cmRevision && `revision=${item.cmRevision}`, item.sourceRange && `source=${item.sourceRange.from}-${item.sourceRange.to}`].filter(Boolean).join(' · ');
                return `- ${item.text}${provenance ? ` [${provenance}]` : ''}`;
            });
        sections.push(`${label.toUpperCase()}:\n${lines.join('\n')}`);
    }
    return truncateToTokenBudget(sections.join('\n\n'), limit).trim();
}

export function compactContinuityPrompt(value, requestedTokenLimit = 3500) {
    const text = cleanPrompt(value);
    const limit = Math.max(500, Math.min(12000, Number(requestedTokenLimit) || 3500));
    if (estimateTokenCount(text) <= limit) return text;

    // Continuity Memory places its current/retrieved records near the front and
    // its Story/Recursive Chronicle at the end. Preserve both rather than
    // prefix-clipping away the chronological continuity spine.
    const marker = '\n\n[… continuity context compacted …]\n\n';
    const markerTokens = estimateTokenCount(marker);
    const middleLines = [...new Set(text.split(/\n+/u).slice(1, -1).map(line => line.trim()).filter(line => line.length > 24))]
        .sort((a, b) => Number(/[.!?;:]/u.test(b)) - Number(/[.!?;:]/u.test(a)) || b.length - a.length)
        .slice(0, 8);
    const routeSection = middleLines.length ? `Open-route records retained from omitted middle:\n${truncateToTokenBudget(middleLines.join(' '), Math.min(600, Math.floor((limit - markerTokens) * 0.2)))}` : '';
    const edgeBudget = Math.max(0, limit - markerTokens * (routeSection ? 2 : 1) - estimateTokenCount(routeSection));
    const headLength = Math.floor(edgeBudget * 0.52);
    const tailLength = edgeBudget - headLength;
    return truncateToTokenBudget([boundedEdge(text, headLength), routeSection, boundedChronicleTail(text, tailLength)].filter(Boolean).join(marker), limit);
}

export function formatPlanningEvidence(items, requestedTokenLimit = 3500) {
    return semanticEvidenceText(items, requestedTokenLimit);
}

function withMetadata(result, metadata = {}) {
    for (const [key, value] of Object.entries(metadata)) Object.defineProperty(result, key, { value, enumerable: false, configurable: true });
    return result;
}

export function readContinuityBridge(context = {}, bridge, { allowStale = false } = {}) {
    if (![1, 2].includes(Number(bridge?.version)) || typeof bridge.getContextSnapshot !== 'function') return null;
    const snapshot = bridge.getContextSnapshot();
    const chatId = String(context.getCurrentChatId?.() || context.chatId || '');
    const sameChat = !snapshot?.chatId || !chatId || String(snapshot.chatId) === chatId;
    const status = !sameChat ? 'stale'
        : snapshot?.status === 'current' ? 'current'
            : snapshot?.status === 'stale' ? 'stale'
            : 'unavailable';
    const usableStatus = snapshot?.status === 'current' || (allowStale && snapshot?.status === 'stale');
    const planningEvidence = sameChat && usableStatus && Array.isArray(snapshot?.planningEvidence) ? snapshot.planningEvidence : [];
    const evidenceText = planningEvidence.length ? formatPlanningEvidence(planningEvidence) : '';
    const text = sameChat && usableStatus && typeof snapshot?.prompt === 'string' ? snapshot.prompt : '';
    return withMetadata({ text: evidenceText || text, status }, {
        planningEvidence,
        summaryText: text,
        version: Number(snapshot?.version || bridge?.version || 1),
        revision: Number(snapshot?.revision || 0),
        messageSignature: String(snapshot?.coverage?.signature || ''),
        coverageThrough: Number.isFinite(Number(snapshot?.coverage?.throughMessageIndex)) ? Number(snapshot.coverage.throughMessageIndex) : -1,
        chatId: String(snapshot?.chatId || ''),
    });
}

export async function waitForContinuityBridge(context = {}, bridgeProvider, {
    allowStale = false,
    timeoutMs = 8000,
    intervalMs = 200,
    signal,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    now = () => Date.now(),
} = {}) {
    const deadline = now() + Math.max(0, Number(timeoutMs) || 0);
    let latest = { text: '', status: 'unavailable' };
    do {
        signal?.throwIfAborted?.();
        try {
            latest = readContinuityBridge(context, bridgeProvider?.(), { allowStale })
                || { text: '', status: 'unavailable' };
        } catch {
            latest = { text: '', status: 'unavailable' };
        }
        if (latest.text || now() >= deadline) return latest;
        await sleep(Math.max(10, Math.min(Number(intervalMs) || 200, deadline - now())));
    } while (now() < deadline);
    return latest;
}
