export const DEFAULT_ROUTINE_INPUT = 6000;
export const DEFAULT_REVIEW_INPUT = 14000;

export function normalizeInputBudget(value, fallback = 16000) {
    return Math.max(fallback === DEFAULT_ROUTINE_INPUT ? 6000 : 9000, Math.min(30000, Math.floor(Number(value) || fallback)));
}

export function plannerBudgets(settings = {}, { bootstrapScan = false, fullContextPass = false } = {}) {
    const ceiling = normalizeInputBudget(settings.maxPromptTokens);
    const tier = bootstrapScan ? 'rebuild' : fullContextPass ? 'review' : 'routine';
    const input = bootstrapScan ? ceiling : Math.min(ceiling, normalizeInputBudget(
        fullContextPass ? settings.reviewInputTokens : settings.routineInputTokens,
        fullContextPass ? DEFAULT_REVIEW_INPUT : DEFAULT_ROUTINE_INPUT));
    return {
        tier, input,
        recent: Math.min(Math.max(1000, Math.min(12000, Number(settings.recentContextTokens) || 6000)), bootstrapScan ? 12000 : fullContextPass ? 4500 : Math.floor(input / 2)),
        summary: Math.min(Math.max(1000, Math.min(8000, Number(settings.summaryContextTokens) || 4000)), bootstrapScan ? 8000 : fullContextPass ? 2400 : 1200),
    };
}
