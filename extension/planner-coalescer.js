export function normalizePlannerIntent(value = {}) {
    return {
        chatId: String(value?.chatId || ''),
        note: value?.note ?? null,
        rebuild: value?.rebuild === true,
        waitForContinuity: value?.waitForContinuity === true,
        allowStaleContinuity: value?.allowStaleContinuity === true,
    };
}

export function mergePlannerIntents(older, newer) {
    const left = normalizePlannerIntent(older);
    const right = normalizePlannerIntent(newer);
    if (left.chatId && right.chatId && left.chatId !== right.chatId) return right;
    return {
        chatId: right.chatId || left.chatId,
        note: right.note ?? left.note,
        rebuild: left.rebuild || right.rebuild,
        waitForContinuity: left.waitForContinuity || right.waitForContinuity,
        allowStaleContinuity: left.allowStaleContinuity || right.allowStaleContinuity,
    };
}

export function exceedsAppendAllowance(sourceMessageCount, currentMessageCount, allowance = 1) {
    const source = Math.max(0, Number(sourceMessageCount) || 0);
    const current = Math.max(0, Number(currentMessageCount) || 0);
    const permitted = Math.max(0, Number(allowance) || 0);
    return current > source + permitted;
}
