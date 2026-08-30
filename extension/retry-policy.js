const PERMANENT_ERROR = /(?:not configured|not selected|invalid api key|unauthori[sz]ed|forbidden|authentication|permission denied|\b(?:400|401|403|404|422)\b)/iu;

export function shouldRetryPlannerError(error, locallyAborted = false) {
    if (locallyAborted || error?.name === 'AnalysisValidationError') return false;
    const message = String(error?.message || error || '');
    return !PERMANENT_ERROR.test(message);
}

export function plannerRetryDelay(attempt, { baseMs = 2000, maxMs = 60000 } = {}) {
    const exponent = Math.max(0, Math.min(20, Number(attempt) - 1 || 0));
    return Math.min(maxMs, baseMs * (2 ** exponent));
}
