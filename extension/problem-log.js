// Per-chat display history only: never change attempts, reservations or recovery.
export const PROBLEM_LOG_KEY = 'taleFairyProblemLog';

export function problemMessage(error) {
    return String(error?.message || error || 'Unknown planner problem')
        .replace(/\bBearer\s+\S+/giu, 'Bearer [redacted]')
        .replace(/((?:api[_-]?key|authorization|access_token|password)["']?\s*[:=]\s*["']?)[^\s,"'&}]+/giu, '$1[redacted]')
        .slice(0, 1500);
}

export function problemHistory(value) {
    return { entries: Array.isArray(value?.entries) ? value.entries.slice(-20) : [],
        seen: Array.isArray(value?.seen) ? value.seen.slice(-100) : [], dismissedAt: Number(value?.dismissedAt) || 0 };
}

export function appendProblem(value, { id, source, message, at = Date.now() }) {
    const history = problemHistory(value);
    if (history.seen.includes(id)) return history;
    return { ...history, seen: [...history.seen, id].slice(-100),
        entries: [...history.entries, { id, source, message: problemMessage(message), at }].slice(-20) };
}

export function clearProblems(value, at = Date.now()) {
    return { ...problemHistory(value), entries: [], dismissedAt: at };
}

export function attemptProblem(source, attempt) {
    if (!['failed', 'stopped'].includes(attempt?.status) || !attempt.error) return null;
    return { id: `${source}:${attempt.runKey || attempt.at}:${attempt.finishedAt || attempt.at}`,
        source, message: attempt.error, at: attempt.finishedAt || attempt.at || Date.now() };
}

export function attemptProblemDismissed(value, source, attempt) {
    const problem = attemptProblem(source, attempt), history = problemHistory(value);
    return Boolean(problem && history.seen.includes(problem.id) && problem.at <= history.dismissedAt);
}
