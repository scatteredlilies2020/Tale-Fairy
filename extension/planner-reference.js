// Planner-only projection. Keep the stored books and source fingerprints intact.
// World Info import backups, insertion controls and editor settings are not lore.
export function compactPlannerReference(reference) {
    if (!Array.isArray(reference?.worldBooks)) return reference;
    return { ...reference, worldBooks: reference.worldBooks.map(book => {
        const data = book?.data;
        if (!data?.entries || typeof data.entries !== 'object') return book;
        const rows = Object.entries(data.entries);
        // Unknown provider formats must not silently lose their source fields.
        if (rows.some(([, entry]) => !entry || typeof entry.content !== 'string')) return book;
        const entries = rows.filter(([, entry]) => entry.disable !== true && entry.enabled !== false)
            .map(([key, entry]) => {
                const keys = entry.key ?? entry.keys;
                const secondary = entry.keysecondary ?? entry.secondary_keys;
                const title = entry.comment || entry.name || entry.title;
                return {
                    id: entry.uid ?? entry.id ?? key,
                    ...(keys?.length ? { keys } : {}),
                    ...(secondary?.length ? { secondary_keys: secondary } : {}),
                    ...(title ? { title } : {}),
                    ...(entry.constant === true ? { constant: true } : {}),
                    content: entry.content,
                };
            });
        const { originalData: _importBackup, entries: _rawEntries, ...details } = data;
        return { ...book, data: { ...details, entries } };
    }) };
}

// Historical excerpts are useful only when their source text isn't already in
// the accepted-message window. Never remove an excerpt on index alone: an older
// generated panel may have been removed from the supplied narrative.
export function compactPlannerHistory(historical, messages) {
    const normalize = value => String(value || '').replace(/\s+/gu, ' ').trim();
    const present = new Map(messages.map(message => [message.index, message]));
    const redundant = excerpt => {
        const message = present.get(excerpt?.index);
        if (!message || message.role !== excerpt.role) return false;
        const text = normalize(excerpt.content);
        return Boolean(text && normalize(message.content).includes(text));
    };
    return { ...historical,
        ...(historical.opening && redundant(historical.opening) ? { opening: undefined } : {}),
        ...(Array.isArray(historical.timeline) ? { timeline: historical.timeline
            .map(epoch => ({ ...epoch, excerpts: epoch.excerpts.filter(excerpt => !redundant(excerpt)) }))
            .filter(epoch => epoch.excerpts.length) } : {}),
        ...(Array.isArray(historical.openThreads) ? { openThreads: historical.openThreads.filter(excerpt => !redundant(excerpt)) } : {}),
    };
}

// Last-resort fitting of optional extractive recall, never accepted messages or
// durable preparation. Remove whole excerpts, thinning the fullest epochs first
// to preserve coverage of the wider story instead of keeping only recent play.
export function fitPlannerHistory(historical, fits) {
    const result = structuredClone(historical);
    if (fits(result)) return result;
    let omitted = 0;
    const recordOmission = () => {
        result.budget_omission = { excerpts: ++omitted,
            reason: 'Input ceiling: whole historical excerpts omitted, not evidence of resolution or absence.' };
    };
    while (result.timeline?.some(epoch => epoch.excerpts.length)) {
        const epoch = result.timeline.reduce((best, item) => !best || item.excerpts.length > best.excerpts.length ? item : best, null);
        epoch.excerpts.pop();
        result.timeline = result.timeline.filter(item => item.excerpts.length);
        recordOmission();
        if (fits(result)) return result;
    }
    while (result.openThreads?.length) {
        result.openThreads.pop();
        recordOmission();
        if (fits(result)) return result;
    }
    if (result.opening) {
        delete result.opening;
        recordOmission();
    }
    return result;
}
