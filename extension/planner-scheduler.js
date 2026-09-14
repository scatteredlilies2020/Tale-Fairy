export const DEFAULT_REFRESH_INTERVAL = 12;

export function defaultPlannerSchedule() {
    return { turnsSincePlanner: 0, turnsSinceFullReview: 0, lastFullReviewTurn: 0, lastReviewedUserKey: '', lastPlannerTurn: 0, lastPlannerFingerprint: '', lastCountedResponseKey: '', pendingReason: 'initialization', refreshReason: 'Story board has not been initialized.', manualRequested: false, refreshInterval: DEFAULT_REFRESH_INTERVAL };
}

export function normalizePlannerSchedule(value = {}) {
    return {
        turnsSincePlanner: Math.max(0, Number(value.turnsSincePlanner ?? value.turns_since_planner) || 0), lastPlannerTurn: Math.max(0, Number(value.lastPlannerTurn ?? value.last_planner_turn) || 0),
        turnsSinceFullReview: Math.max(0, Math.trunc(Number(value.turnsSinceFullReview ?? value.turnsSincePlanner ?? value.turns_since_planner) || 0)),
        lastFullReviewTurn: Math.max(0, Math.trunc(Number(value.lastFullReviewTurn) || 0)),
        lastReviewedUserKey: String(value.lastReviewedUserKey || ''),
        lastPlannerFingerprint: String(value.lastPlannerFingerprint ?? value.last_planner_fingerprint ?? '').trim(), lastCountedResponseKey: String(value.lastCountedResponseKey ?? value.last_counted_response_key ?? '').trim(),
        pendingReason: String(value.pendingReason ?? value.pending_reason ?? '').trim().slice(0, 80), refreshReason: String(value.refreshReason ?? value.refresh_reason ?? '').trim().slice(0, 260),
        manualRequested: value.manualRequested === true || value.manual_requested === true,
        refreshInterval: Math.max(3, Math.min(20, Math.trunc(Number(value.refreshInterval ?? value.refresh_interval) || DEFAULT_REFRESH_INTERVAL))),
    };
}

export function markAssistantTurn(schedule, responseKey = '') {
    const value = normalizePlannerSchedule(schedule);
    const key = String(responseKey || '').trim();
    if (key && key === value.lastCountedResponseKey) return value;
    return { ...value, turnsSincePlanner: value.turnsSincePlanner + 1, turnsSinceFullReview: value.turnsSinceFullReview + 1, lastCountedResponseKey: key || value.lastCountedResponseKey };
}

export function markPlannerCompleted(schedule, { turnCount = 0, fingerprint = '', fullReview = false, manualCompleted = false, messages = [] } = {}) {
    const value = normalizePlannerSchedule(schedule);
    return {
        ...value, turnsSincePlanner: 0, lastPlannerTurn: Math.max(0, Number(turnCount) || 0), lastPlannerFingerprint: String(fingerprint || ''),
        // Small passes and safety fallbacks must not postpone the broad review.
        turnsSinceFullReview: fullReview ? 0 : value.turnsSinceFullReview,
        lastFullReviewTurn: fullReview ? Math.max(0, Number(turnCount) || 0) : value.lastFullReviewTurn,
        lastReviewedUserKey: fullReview ? plannerUserKey(messages) : value.lastReviewedUserKey,
        pendingReason: '', refreshReason: fullReview ? 'Full story review is fresh.' : 'Active world context is fresh.', manualRequested: fullReview || manualCompleted ? false : value.manualRequested,
    };
}

export function plannerUserKey(messages = []) {
    const index = messages.findLastIndex(message => message?.is_user);
    if (index < 0) return '';
    let hash = 2166136261;
    for (const char of String(messages[index]?.mes || '')) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
    return `${index}:${hash >>> 0}`;
}

function latestUserText(messages = []) { return String([...messages].reverse().find(message => message?.is_user)?.mes || ''); }

function hasMajorPivot(messages) {
    const text = latestUserText(messages);
    return /\b(?:new scene|scene change|meanwhile,?|hours? later|days? later|weeks? later|the next (?:morning|day|week)|time[- ]?skip|chapter \d+|elsewhere,)\b/iu.test(text);
}

function hasContradiction(messages) {
    return /(?:\b(?:ooc|correction|retcon)\s*[:\-]|\bactually,? that did not happen\b|\bignore the last\b|\binstead,? (?:this is|it was|they were)\b)/iu.test(latestUserText(messages));
}

export function plannerRefreshDecision({ state, messages = [], event = 'turn', manual = false, swipe = false } = {}) {
    const schedule = normalizePlannerSchedule(state?.plannerSchedule);
    const initialized = state?.plannerContract === 14
        ? Boolean(state.lastAnalyzedAt) : Boolean(state?.sceneProfile?.promise && state?.causalContext?.conditions?.length);
    if (manual || schedule.manualRequested) return { shouldRun: true, code: 'manual', reason: 'Manual active-world reevaluation requested.' };
    if (swipe) return { shouldRun: false, code: '', reason: 'A replacement response reuses the archived causal slice and never spends a planner call.' };
    if (!initialized) return { shouldRun: true, code: 'initialization', reason: 'Current scene promise or causal context is missing.' };
    const unreviewedUser = plannerUserKey(messages) !== schedule.lastReviewedUserKey;
    if (event === 'turn' && unreviewedUser && hasContradiction(messages)) return { shouldRun: true, code: 'contradiction', reason: 'The latest user turn corrects or contradicts retained planning.' };
    if (event === 'turn' && unreviewedUser && hasMajorPivot(messages)) return { shouldRun: true, code: 'major-pivot', reason: 'The latest user turn explicitly begins a new scene or substantial time shift.' };
    if (event === 'turn' && schedule.turnsSinceFullReview >= schedule.refreshInterval) return { shouldRun: true, code: 'periodic', reason: `${schedule.turnsSinceFullReview} assistant turns have passed since the last full story review.` };
    return { shouldRun: false, code: '', reason: 'No active-world refresh trigger is active.' };
}

/** Select the cost tier, not whether generation should wait. Fresh per-response
 * guidance remains asynchronous; broader reviews use an independent clock. */
export function plannerPassDecision({ state, messages = [], rebuild = false, manual = false, sceneRefresh = false, refreshInterval } = {}) {
    const schedule = normalizePlannerSchedule({ ...state?.plannerSchedule, ...(refreshInterval === undefined ? {} : { refreshInterval }) });
    // Re-evaluate/repair means refresh this scene, not reconstruct the whole
    // story. Contract 13 can establish current conditions even with no ledger.
    // An explicit Full Rebuild still wins and has its own larger budget.
    if (!rebuild && (sceneRefresh || (schedule.manualRequested && !manual))) {
        return { fullContextPass: false, bootstrapScan: false, reason: 'Quick current-scene reevaluation.' };
    }
    // An optional empty ledger after an analyzed/fallback scene is not proof
    // that the chat needs initialization again on every subsequent turn.
    const bootstrapScan = Boolean(rebuild || state?.canonBootstrapPending || state?.scene?.status === 'uninitialized' || (!state?.contextLedger && !state?.lastAnalyzedAt));
    const decision = plannerRefreshDecision({ state: { ...state, plannerSchedule: schedule }, messages, manual });
    return { fullContextPass: bootstrapScan || decision.shouldRun, bootstrapScan, reason: bootstrapScan ? 'Initialize factual story context.' : decision.reason };
}

export function withRefreshReason(schedule, decision) {
    const value = normalizePlannerSchedule(schedule);
    return { ...value, pendingReason: decision.code || '', refreshReason: decision.reason || value.refreshReason };
}
