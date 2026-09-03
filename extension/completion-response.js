function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isReasoningBlock(value) {
    const type = String(value?.type || '').toLowerCase();
    return type.includes('reasoning') || type.includes('thinking');
}

function finalBlockText(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(finalBlockText).filter(Boolean).join('');
    if (!isRecord(value) || isReasoningBlock(value)) return '';

    if (typeof value.text === 'string') return value.text;
    if (typeof value.text?.value === 'string') return value.text.value;
    if (typeof value.output_text === 'string') return value.output_text;
    if ([2, 3, 4, 5].includes(value.contract_version) || value.scene) return JSON.stringify(value);
    if (value.content !== undefined) return finalBlockText(value.content);
    return '';
}

function addCandidate(candidates, value) {
    const text = finalBlockText(value);
    if (text.trim()) candidates.push(text);
}

/**
 * Extract only final answer text from common Chat Completions, Responses API,
 * proxy-wrapped, and structured tool-call payloads. Hidden reasoning fields are
 * deliberately ignored.
 */
export function completionText(value) {
    if (typeof value === 'string') return value;

    const roots = [];
    const seen = new Set();
    const queue = [value];
    while (queue.length && roots.length < 8) {
        const root = queue.shift();
        if (!isRecord(root) || seen.has(root)) continue;
        seen.add(root);
        roots.push(root);
        for (const key of ['data', 'response', 'result']) {
            if (isRecord(root[key])) queue.push(root[key]);
        }
    }

    const candidates = [];
    for (const root of roots) {
        for (const choice of Array.isArray(root.choices) ? root.choices : []) {
            const message = choice?.message;
            addCandidate(candidates, message?.content);
            for (const call of Array.isArray(message?.tool_calls) ? message.tool_calls : []) {
                addCandidate(candidates, call?.function?.arguments);
            }
            addCandidate(candidates, message?.function_call?.arguments);
            addCandidate(candidates, choice?.text);
        }

        addCandidate(candidates, root.output_text);
        for (const item of Array.isArray(root.output) ? root.output : []) {
            if (isReasoningBlock(item)) continue;
            addCandidate(candidates, item?.content);
            addCandidate(candidates, item?.text);
        }
        addCandidate(candidates, root.message?.content);
        addCandidate(candidates, root.content);
        addCandidate(candidates, root.text);
        if ([2, 3, 4, 5].includes(root.contract_version) || root.scene) addCandidate(candidates, root);
    }

    return candidates[0] || '';
}
