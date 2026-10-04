// Stable module identity shared by the public registration URL and versioned
// browser readers. Cache-busting a reader must not create a second registry.
const providers = new Map();

export function registerEvidenceProvider(provider) {
    if (!provider || provider.version !== 1 || !/^[a-z][a-z0-9-]{0,79}$/.test(provider.id)
        || provider.id === 'continuity-memory' || typeof provider.read !== 'function'
        || providers.has(provider.id)) throw Error('Invalid or duplicate evidence provider');
    providers.set(provider.id, provider);
    return () => { if (providers.get(provider.id) === provider) providers.delete(provider.id); };
}

export function registeredEvidenceProviders() {
    return [...providers.values()];
}
