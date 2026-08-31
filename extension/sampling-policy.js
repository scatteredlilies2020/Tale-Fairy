export function normalizePlannerTemperature(value, fallback = 1) {
    const temperature = Number(value);
    const normalized = Number.isFinite(temperature) ? temperature : Number(fallback);
    return Math.round(Math.min(2, Math.max(0, normalized || 0)) * 100) / 100;
}

export function isGlmPlannerTarget({ source = '', model = '', url = '' } = {}) {
    const sourceId = String(source).trim().toLowerCase();
    const modelId = String(model).trim().toLowerCase();
    const endpoint = String(url).trim().toLowerCase();
    return sourceId === 'zai'
        || /(?:^|\/)glm[-_.]/u.test(modelId)
        || /(?:^|[./_-])zai(?:[./_-]|$)/u.test(endpoint)
        || /(?:^|[./_-])glm(?:[./_-]|$)/u.test(endpoint);
}

export function effectivePlannerTemperature(value, target = {}, fallback = 1) {
    const normalized = normalizePlannerTemperature(value, fallback);
    return isGlmPlannerTarget(target) ? Math.min(1, normalized) : normalized;
}
