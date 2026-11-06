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

function modelListError(response, payload) {
    const detail = payload?.message || payload?.error?.message
        || (typeof payload?.error === 'string' ? payload.error : '');
    return detail || (!response.ok ? `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
        : 'The server could not list models. Check the saved planner key and server connection.');
}

// Keep the regular ST status contract. SDK-backed forks may not implement it;
// OpenRouter's public catalog also works without a saved key or host adapter.
export async function discoverDirectModels({ source, url, secretId, headers, fetchImpl = fetch }) {
    async function request(endpoint, options) {
        const response = await fetchImpl(endpoint, { ...options, signal: AbortSignal.timeout(15000) });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.error) throw new Error(modelListError(response, payload));
        if (payload === null) throw new Error('The model endpoint returned an invalid JSON response.');
        const models = normalizeModelListResponse(payload);
        if (!models.length) throw new Error('The endpoint returned no models.');
        return models;
    }
    const openRouter = source === 'openrouter';
    const publicOpenRouter = openRouter && url.replace(/\/+$/, '') === 'https://openrouter.ai/api/v1';
    try {
        return await request('/api/backends/chat-completions/status', {
            method: 'POST', headers, cache: 'no-cache',
            // Native OpenRouter adapters ignore api_url. Use the custom adapter
            // for proxy URLs rather than silently listing the official catalog.
            body: JSON.stringify({ chat_completion_source: publicOpenRouter ? 'openrouter' : 'custom',
                secret_id: secretId || undefined, ...(publicOpenRouter ? { api_url: url } : { custom_url: url }) }),
        });
    } catch (backendError) {
        // Never redirect a custom endpoint's discovery to an unrelated catalog,
        // and never forward ST authentication headers or provider keys publicly.
        if (!publicOpenRouter) throw backendError;
        try {
            return await request('https://openrouter.ai/api/v1/models', {
                method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', cache: 'no-cache',
            });
        } catch (publicError) {
            throw new Error(`${backendError.message} Public OpenRouter catalog: ${publicError.message}`);
        }
    }
}
