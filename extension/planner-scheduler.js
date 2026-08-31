export const DEFAULT_REFRESH_INTERVAL = 6;

export function defaultPlannerSchedule() {
    return { turnsSincePlanner: 0, lastPlannerTurn: 0, lastPlannerFingerprint: '', lastCountedResponseKey: '', pendingReason: 'initialization', refreshReason: 'Story board has not been initialized.', manualRequested: false, refreshInterval: DEFAULT_REFRESH_INTERVAL };
}

export function normalizePlannerSchedule(value = {}) {
    return {
        turnsSincePlanner: Math.max(0, Number(value.turnsSincePlanner ?? value.turns_since_planner) || 0), lastPlannerTurn: Math.max(0, Number(value.lastPlannerTurn ?? value.last_planner_turn) || 0),
        lastPlannerFingerprint: String(value.lastPlannerFingerprint ?? value.last_planner_fingerprint ?? '').trim(), lastCountedResponseKey: String(value.lastCountedResponseKey ?? value.last_counted_response_key ?? '').trim(),
        pendingReason: String(value.pendingReason ?? value.pending_reason ?? '').trim().slice(0, 80), refreshReason: String(value.refreshReason ?? value.refresh_reason ?? '').trim().slice(0, 260),
        manualRequested: value.manualRequested === true || value.manual_requested === true,
        refreshInterval: Math.max(3, Math.min(20, Number(value.refreshInterval ?? value.refresh_interval) || DEFAULT_REFRESH_INTERVAL)),
    };
}

export function markAssistantTurn(schedule, responseKey = '') {
    const value = normalizePlannerSchedule(schedule);
    const key = String(responseKey || '').trim();
    if (key && key === value.lastCountedResponseKey) return value;
    return { ...value, turnsSincePlanner: value.turnsSincePlanner + 1, lastCountedResponseKey: key || value.lastCountedResponseKey };
}

export function markPlannerCompleted(schedule, { turnCount = 0, fingerprint = '' } = {}) {
    return { ...normalizePlannerSchedule(schedule), turnsSincePlanner: 0, lastPlannerTurn: Math.max(0, Number(turnCount) || 0), lastPlannerFingerprint: String(fingerprint || ''), pendingReason: '', refreshReason: 'Current beat analysis is fresh.', manualRequested: false };
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
    const initialized = Boolean(state?.sceneProfile?.promise && state?.beatDirective?.operation);
    if (manual || schedule.manualRequested) return { shouldRun: true, code: 'manual', reason: 'Manual current-beat reevaluation requested.' };
    if (swipe) return { shouldRun: false, code: '', reason: 'A replacement response reuses the archived semantic beat and never spends a planner call.' };
    if (!initialized) return { shouldRun: true, code: 'initialization', reason: 'Current scene promise or beat operation is missing.' };
    if (event === 'turn' && hasContradiction(messages)) return { shouldRun: true, code: 'contradiction', reason: 'The latest user turn corrects or contradicts retained planning.' };
    if (event === 'turn' && hasMajorPivot(messages)) return { shouldRun: true, code: 'major-pivot', reason: 'The latest user turn explicitly begins a new scene or substantial time shift.' };
    if (event === 'turn' && schedule.turnsSincePlanner >= schedule.refreshInterval) return { shouldRun: true, code: 'periodic', reason: `${schedule.turnsSincePlanner} assistant turns have passed since the last planner update.` };
    return { shouldRun: false, code: '', reason: 'No current-beat refresh trigger is active.' };
}

export function withRefreshReason(schedule, decision) {
    const value = normalizePlannerSchedule(schedule);
    return { ...value, pendingReason: decision.code || '', refreshReason: decision.reason || value.refreshReason };
}
