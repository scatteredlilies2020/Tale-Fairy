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

// Unsupported history claims are optional operations, not a reason to discard
// fresh proposals. Keep exact addresses only; never guess a neighbouring span.
export function reconcileSpanWitnesses(raw, messages) {
    const supplied = new Map(witnessMessages(messages).map(message => [message.index, message.spans]));
    const warnings = [];
    let skippedProgress = 0, skippedRetirements = 0;
    const filter = (evidence, context, indices) => {
        if (!Array.isArray(evidence)) return [];
        return evidence.filter(ref => {
            if (Number.isSafeInteger(ref?.index) && Number.isSafeInteger(ref?.span) && ref.span >= 0
                && supplied.get(ref.index)?.[ref.span]?.text
                && (indices === undefined || indices.includes(ref.index))) return true;
            warnings.push({ ...context, index: ref?.index, span: ref?.span, reason: 'span-not-supplied' });
            return false;
        });
    };
    if (Array.isArray(raw?.realization)) {
        for (const entry of raw.realization) {
            if (!Array.isArray(entry?.changes)) continue;
            entry.changes = entry.changes.filter(change => {
                const evidence = filter(change?.evidence, { subjectId: entry.id, episodeId: change?.episodeId });
                if (!evidence.length) { skippedProgress++; return false; }
                change.evidence = evidence;
                return true;
            });
        }
    }
    if (Array.isArray(raw?.retire)) {
        raw.retire = raw.retire.filter(entry => {
            // Retirement must agree with its declared accepted-message indices.
            const indices = Array.isArray(entry?.evidence) ? entry.evidence : [];
            const witnesses = filter(entry?.witnesses, { subjectId: entry?.id, operation: 'retire' }, indices);
            if (!witnesses.length) { skippedRetirements++; return false; }
            entry.witnesses = witnesses;
            entry.evidence = [...new Set(witnesses.map(ref => ref.index))];
            for (const index of indices.filter(index => !entry.evidence.includes(index))) {
                warnings.push({ subjectId: entry.id, index, operation: 'retire', reason: 'index-without-witness' });
            }
            return true;
        });
    }
    return { warnings, skippedProgress, skippedRetirements };
}
