function cleanPrompt(value) {
    return String(value || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function boundedEdge(value, length, fromEnd = false) {
    if (value.length <= length) return value;
    if (fromEnd) {
        const start = value.length - length;
        const boundary = value.indexOf('\n', start);
        return value.slice(boundary >= 0 && boundary - start < 160 ? boundary + 1 : start).trimStart();
    }
    const boundary = value.lastIndexOf('\n', length);
    return value.slice(0, boundary >= length - 160 ? boundary : length).trimEnd();
}

function boundedChronicleTail(value, length) {
    if (value.length <= length) return value;
    const markerIndex = value.toLowerCase().lastIndexOf('recursive chronicle');
    if (markerIndex < 0) return boundedEdge(value, length, true);
    const lineEnd = value.indexOf('\n', markerIndex);
    const heading = value.slice(markerIndex, lineEnd >= 0 ? lineEnd : markerIndex + 100).trim();
    if (!heading) return boundedEdge(value, length, true);
    if (heading.length >= length) return heading.slice(0, length);
    const tail = boundedEdge(value, length - heading.length - 1, true);
    if (tail.toLowerCase().includes('recursive chronicle')) return tail;
    return `${heading}\n${tail}`.slice(0, length);
}

function routeBearingExcerpt(value, limit) {
    const pattern = /\b(?:unresolved|open|pending|due|blocked|dormant|petition|letter|correspondence|decision|hearing|appointment|investigation|promise|commitment|journey|return|review|application|request|order)\b/giu;
    const excerpts = [];
    const seen = new Set();
    for (const match of value.matchAll(pattern)) {
        const excerpt = value.slice(Math.max(0, match.index - 120), Math.min(value.length, match.index + match[0].length + 180)).replace(/\s+/gu, ' ').trim();
        const key = excerpt.toLowerCase();
        if (excerpt && !seen.has(key)) excerpts.push(excerpt);
        seen.add(key);
        if (excerpts.join(' … ').length >= limit) break;
    }
    return excerpts.join(' … ').slice(0, limit).trim();
}

export function compactContinuityPrompt(value, requestedLimit = 3500) {
    const text = cleanPrompt(value);
    const limit = Math.max(500, Math.min(12000, Number(requestedLimit) || 3500));
    if (text.length <= limit) return text;

    // Continuity Memory places its current/retrieved records near the front and
    // its Story/Recursive Chronicle at the end. Preserve both rather than
    // prefix-clipping away the chronological continuity spine.
    const marker = '\n\n[… continuity context compacted …]\n\n';
    const routeBudget = Math.min(600, Math.floor((limit - marker.length) * 0.25));
    const routes = routeBearingExcerpt(text, routeBudget);
    const routeSection = routes ? `Open-route records retained from omitted middle:\n${routes}` : '';
    const edgeBudget = Math.max(0, limit - marker.length * (routeSection ? 2 : 1) - routeSection.length);
    const headLength = Math.floor(edgeBudget * 0.52);
    const tailLength = edgeBudget - headLength;
    return [boundedEdge(text, headLength), routeSection, boundedChronicleTail(text, tailLength)].filter(Boolean).join(marker).slice(0, limit);
}

export function readContinuityBridge(context = {}, bridge, { allowStale = false } = {}) {
    if (bridge?.version !== 1 || typeof bridge.getContextSnapshot !== 'function') return null;
    const snapshot = bridge.getContextSnapshot();
    const chatId = String(context.getCurrentChatId?.() || context.chatId || '');
    const sameChat = !snapshot?.chatId || !chatId || String(snapshot.chatId) === chatId;
    const status = !sameChat ? 'stale'
        : snapshot?.status === 'current' ? 'current'
            : snapshot?.status === 'stale' ? 'stale'
            : 'unavailable';
    const usableStatus = snapshot?.status === 'current' || (allowStale && snapshot?.status === 'stale');
    const text = sameChat && usableStatus && typeof snapshot?.prompt === 'string'
        ? snapshot.prompt
        : '';
    return { text, status };
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
