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

export function compactContinuityPrompt(value, requestedLimit = 3500) {
    const text = cleanPrompt(value);
    const limit = Math.max(500, Math.min(12000, Number(requestedLimit) || 3500));
    if (text.length <= limit) return text;

    // Continuity Memory places its current/retrieved records near the front and
    // its Story/Recursive Chronicle at the end. Preserve both rather than
    // prefix-clipping away the chronological continuity spine.
    const separator = '\n\n[… continuity context compacted …]\n\n';
    const available = limit - separator.length;
    const headLength = Math.floor(available * 0.52);
    const tailLength = available - headLength;
    return `${boundedEdge(text, headLength)}${separator}${boundedEdge(text, tailLength, true)}`.slice(0, limit);
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
