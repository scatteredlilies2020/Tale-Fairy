// Address exact source spans rather than asking a planner to retype formatted
// prose. These are citations, not summaries or proof of their interpretation.
export const SPAN_WITNESS_SCHEMA = { type: 'object', additionalProperties: false,
    required: ['index', 'span'], properties: {
        index: { type: 'integer', minimum: 0, description: 'Exact supplied accepted-message index.' },
        span: { type: 'integer', minimum: 0, description: 'Exact numbered span within that message supporting this observation. Not a memory id.' },
    } };

export function witnessSpans(content) {
    const spans = [];
    for (const line of content.split(/\r?\n/u)) {
        let offset = 0;
        while (offset < line.length) {
            let end = Math.min(offset + 1000, line.length);
            if (end < line.length) {
                const space = line.lastIndexOf(' ', end);
                if (space > offset) end = space + 1;
                // Do not cut a surrogate pair at the fixed bound.
                else if (/[\uD800-\uDBFF]/u.test(line[end - 1])) end--;
            }
            const text = line.slice(offset, end);
            if (text.trim()) spans.push({ span: spans.length, text });
            offset = end;
        }
    }
    return spans;
}

export function witnessMessages(messages) {
    return messages.map(({ content, ...message }) => ({ ...message, spans: witnessSpans(content) }));
}

export function resolveSpanWitnesses(evidence, messages) {
    return evidence.map(({ index, span }) => {
        const message = messages.find(message => message.index === index);
        const quote = message && witnessSpans(message.content)[span]?.text;
        if (!quote) throw Error('Witness requires an exact supplied accepted-message span');
        return { index, quote };
    });
}
