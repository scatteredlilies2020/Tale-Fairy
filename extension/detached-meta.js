export function transcriptHeadFromPrompt(prompt) {
    try {
        const value = typeof prompt === 'string' ? JSON.parse(prompt) : prompt;
        const head = value?.transcript_head;
        return head && typeof head === 'object' && !Array.isArray(head) ? head : null;
    } catch {
        return null;
    }
}

export function alignmentPromptFromMeta(meta = {}) {
    const head = meta?.transcriptHead;
    return head && typeof head === 'object' && !Array.isArray(head)
        ? JSON.stringify({ transcript_head: head })
        : '';
}
