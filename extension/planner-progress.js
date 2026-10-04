export const PLANNER_RESPONSE_TIMEOUT_MS = 10 * 60 * 1000;

export function plannerElapsed(milliseconds) {
    const seconds = Math.max(0, Math.floor(Number(milliseconds) / 1000) || 0);
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

export function campaignAttemptSummary(attempt, active = false) {
    if (!attempt) return 'No recorded planner request';
    if (attempt.requestCount === 0) {
        const reason = attempt.error || attempt.skipped;
        return `${active && attempt.status === 'started' ? 'Building planner context' : 'Last attempt: no provider request sent'}${reason ? ` · ${reason}` : ''}`;
    }
    if (attempt.status === 'started') return active
        ? 'Request in progress · completion not yet confirmed'
        : 'Previous request has no completion record · it may still be running in another page; Guide now can retry';
    const duration = Number.isFinite(attempt.durationMs) ? ` · ${plannerElapsed(attempt.durationMs)}` : '';
    const labels = { complete: 'Last request: preparation saved', failed: 'Last request failed', stopped: 'Last request stopped' };
    const reason = attempt.error || attempt.skipped;
    const recovery = attempt.stages?.length
        ? ` · ${attempt.requestCount} request${attempt.requestCount === 1 ? '' : 's'} · ${attempt.stages.includes('scene') ? 'wider preparation + scene selection' : 'wider preparation'}${attempt.recoveryReason ? ' · automatic correction attempted' : ''}`
        : attempt.requestCount > 1
        ? attempt.status === 'complete' ? ' · automatic correction succeeded (2 requests)' : ' · automatic correction attempted (2 requests)' : '';
    return `${labels[attempt.status] || 'Last request: unknown status'}${duration}${recovery}${reason ? ` · ${reason}` : ''}`;
}

// Race cancellation as well as forwarding it: some host adapters ignore an
// AbortSignal. Their late result must never install a plan or hold the tab lock.
export async function boundedPlannerResponse(generate, controller, timeoutMs = PLANNER_RESPONSE_TIMEOUT_MS) {
    const { signal } = controller;
    signal.throwIfAborted();
    let onAbort, timer;
    const cancelled = new Promise((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => controller.abort(new DOMException(
            `Planner response timed out after ${plannerElapsed(timeoutMs)}; no automatic retry was sent.`, 'TimeoutError')), timeoutMs);
    });
    try {
        return await Promise.race([Promise.resolve().then(() => { signal.throwIfAborted(); return generate(); }), cancelled]);
    } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
    }
}
