export async function waitForPlannerHandoff(previousPromise, signal) {
    if (previousPromise) {
        try {
            await previousPromise;
        } catch {
            // The replacement only needs the old run to settle and release its
            // browser lock; its failure has already been reported by that run.
        }
    }
    signal?.throwIfAborted();
}

const PENDING_PREFIX = 'living-world-guide:pending:';

function pendingKey(chatId) {
    return `${PENDING_PREFIX}${encodeURIComponent(String(chatId || ''))}`;
}

export function markPlannerPending(storage, chatId, fingerprint) {
    if (!storage || !chatId || !fingerprint) return;
    try {
        storage.setItem(pendingKey(chatId), JSON.stringify({ fingerprint, startedAt: Date.now() }));
    } catch {
        // Storage can be unavailable in restrictive browser modes. The normal
        // stale-plan startup audit remains the fallback in that case.
    }
}

export function plannerWasInterrupted(storage, chatId, fingerprint) {
    if (!storage || !chatId || !fingerprint) return false;
    try {
        const key = pendingKey(chatId);
        const pending = JSON.parse(storage.getItem(key) || 'null');
        if (pending?.fingerprint === fingerprint) return true;
        if (pending) storage.removeItem(key);
    } catch {
        // A malformed or inaccessible marker must never block normal startup.
    }
    return false;
}

export function clearPlannerPending(storage, chatId) {
    if (!storage || !chatId) return;
    try {
        storage.removeItem(pendingKey(chatId));
    } catch {
        // Best effort only; a mismatched marker is discarded during startup.
    }
}
