export function normalizeModelListResponse(payload) {
    const source = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload?.models)
                ? payload.models
                : Array.isArray(payload?.data?.data)
                    ? payload.data.data
                    : [];
    const models = new Map();
    for (const value of source) {
        const id = String(typeof value === 'string' ? value : value?.id || value?.name || '').trim();
        if (!id || models.has(id)) continue;
        const name = String(typeof value === 'object' ? value?.name || value?.display_name || value?.displayName || id : id).trim();
        models.set(id, { id, name: name || id });
    }
    return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
}
