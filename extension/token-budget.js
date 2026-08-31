/**
 * Model-neutral token accounting used while assembling prompts. Exact token
 * boundaries differ by provider, so runtime callers may additionally verify
 * the finished prompt with SillyTavern's active tokenizer.
 */
export function estimateTokenCount(value) {
    const text = String(value || '');
    if (!text) return 0;
    const pieces = text.match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) || [];
    let count = 0;
    for (const piece of pieces) {
        if (/^[\x00-\x7F]+$/u.test(piece)) {
            // Ordinary short words are commonly one token; long identifiers,
            // JSON keys, and uninterrupted data split into several tokens.
            count += piece.length <= 6 ? 1 : Math.ceil(piece.length / 5);
        } else {
            // Non-Latin scripts vary widely. Counting code points is a safer
            // cross-model ceiling than treating several bytes as one token.
            count += Math.max(1, [...piece].length);
        }
    }
    return count;
}

export function truncateToTokenBudget(value, requestedLimit, { fromEnd = false } = {}) {
    const text = String(value || '');
    const limit = Math.max(0, Math.floor(Number(requestedLimit) || 0));
    if (!text || !limit) return '';
    if (estimateTokenCount(text) <= limit) return text;

    let low = 0;
    let high = text.length;
    while (low < high) {
        const length = Math.ceil((low + high) / 2);
        const candidate = fromEnd ? text.slice(-length) : text.slice(0, length);
        if (estimateTokenCount(candidate) <= limit) low = length;
        else high = length - 1;
    }
    return (fromEnd ? text.slice(-low) : text.slice(0, low)).trim();
}
