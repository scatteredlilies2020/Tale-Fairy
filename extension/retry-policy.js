const PERMANENT_ERROR = /(?:not configured|not selected|invalid api key|unauthori[sz]ed|forbidden|authentication|permission denied|\b(?:400|401|403|404|422)\b)/iu;
const TIMEOUT_ERROR = /(?:timed?\s*out|timeout)/iu;
const EMPTY_COMPLETION_ERROR = /(?:completed without (?:a recoverable response|final content)|stream produced reasoning but completed without final content|exhausted its output budget before producing final content)/iu;

export function isPlannerTimeoutError(error) {
    let current = error;
    for (let depth = 0; current && depth < 4; depth++) {
        if (current?.name === 'TimeoutError' || TIMEOUT_ERROR.test(String(current?.message || current || ''))) return true;
        current = current?.cause;
    }
    return false;
}

export function shouldRetryPlannerError(error, locallyAborted = false) {
    if (locallyAborted || error?.name === 'AnalysisValidationError' || error?.name === 'PlannerBusyInAnotherTabError' || isPlannerTimeoutError(error)) return false;
    const message = String(error?.message || error || '');
    return !PERMANENT_ERROR.test(message) && !EMPTY_COMPLETION_ERROR.test(message);
}

export function plannerRetryDelay(attempt, { baseMs = 2000, maxMs = 60000 } = {}) {
    const exponent = Math.max(0, Math.min(20, Number(attempt) - 1 || 0));
    return Math.min(maxMs, baseMs * (2 ** exponent));
}
