// Lossless request representation only. The saved ledger and the exact messages
// used to validate new evidence never pass through this encoder.
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function internTable() {
    const values = [], indices = new Map();
    return { values, add(value) {
        const key = JSON.stringify(value);
        if (!indices.has(key)) { indices.set(key, values.length); values.push(value); }
        return indices.get(key);
    } };
}

// Factor shared fields, including provenance, without assuming that different
// episode sources or different quotes at the same message index are equivalent.
function factorRecords(records) {
    const defaults = {};
    for (const [key, value] of Object.entries(records[0] || {})) {
        if (records.every(record => Object.hasOwn(record, key) && equal(record[key], value))) defaults[key] = value;
    }
    return { defaults, records: records.map(record => Object.fromEntries(Object.entries(record)
        .filter(([key]) => !Object.hasOwn(defaults, key)))) };
}

function tableRecords(records) {
    const columns = Object.keys(records[0] || {});
    if (records.some(record => Object.keys(record).length !== columns.length
        || columns.some(key => !Object.hasOwn(record, key)))) return { records };
    return { columns, rows: records.map(record => columns.map(key => record[key])) };
}

export function compactProgressPayload(payload) {
    const progress = payload.accepted_progress;
    if (!object(progress) || !Object.keys(progress).length) return payload;
    const subjects = internTable(), sources = internTable(), witnesses = internTable(), episodes = [];
    for (const [subjectId, entry] of Object.entries(progress)) {
        // An unknown future ledger format must pass through intact.
        if (!object(entry) || Object.keys(entry).some(key => key !== 'episodes') || !object(entry.episodes)) return payload;
        for (const [episodeId, episode] of Object.entries(entry.episodes)) {
            if (!object(episode) || typeof episode.status !== 'string' || !object(episode.source) || !Array.isArray(episode.witnesses)
                || episode.witnesses.some(witness => !object(witness))
                || Object.keys(episode).some(key => !['status', 'source', 'witnesses'].includes(key))) return payload;
            episodes.push([subjects.add(subjectId), episodeId, episode.status, sources.add(episode.source), episode.witnesses.map(witness => witnesses.add(witness))]);
        }
        if (!Object.keys(entry.episodes).length) return payload;
    }
    const { defaults, records } = factorRecords(sources.values);
    return { ...payload, accepted_progress: {
        encoding: 'Lossless ledger tables: rows follow their columns. subject, source and witnesses are zero-based indices into subjects, sources and witnesses. Merge sources.defaults into each source row. These are previously verified witnesses, not new accepted-message citations. Preserve episode ids and statuses; only accepted_messages can support new changes.',
        columns: ['subject', 'episodeId', 'status', 'source', 'witnesses'],
        episodes, subjects: subjects.values, sources: { defaults, ...tableRecords(records) }, witnesses: tableRecords(witnesses.values),
    } };
}

// Numbered span objects repeat substantial JSON scaffolding in long chats.
// Keep each exact span and its address, merely stating the columns once.
export function compactMessagePayload(payload) {
    if (!Array.isArray(payload.accepted_messages) || !payload.accepted_messages.length
        || payload.accepted_messages.some(message => !object(message) || !Array.isArray(message.spans)
            || message.spans.some(span => !object(span) || !Number.isSafeInteger(span.span) || span.span < 0
                || typeof span.text !== 'string' || Object.keys(span).some(key => !['span', 'text'].includes(key))))) return payload;
    return { ...payload,
        accepted_message_encoding: 'Each accepted_messages.spans row is [span, text]. Both numbers and exact text are unchanged. Cite the enclosing message index and the row span number, using the ordinary response schema.',
        accepted_messages: payload.accepted_messages.map(message => ({ ...message, spans: message.spans.map(span => [span.span, span.text]) })),
    };
}

export function compactPlannerPayload(payload, measure, limit) {
    let result = payload, tokens = measure(result);
    for (const compact of [compactProgressPayload, compactMessagePayload]) {
        if (tokens <= limit) break;
        const candidate = compact(result), candidateTokens = measure(candidate);
        // Tiny inputs may cost more with table definitions. Never spend context
        // on a representation that does not actually reduce the full envelope.
        if (candidateTokens < tokens) { result = candidate; tokens = candidateTokens; }
    }
    return result;
}
