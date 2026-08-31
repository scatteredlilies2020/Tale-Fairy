const LINGER = /\b(?:linger|stay here|remain here|take (?:my|their|our) time|slow down|focus on|keep (?:reading|studying|talking|working|training|watching)|continue (?:reading|studying|talking|working|training|watching)|another (?:paragraph|page|round|attempt)|page \d+)\b/iu;
const ADVANCE = /\b(?:advance|proceed|move (?:on|forward)|go ahead|next (?:scene|part|chapter|step)|skip(?: ahead| to)?|time[- ]?skip|fast[- ]?forward|later that (?:day|night)|the next (?:day|morning|week)|(?:i|we) (?:leave|depart|head (?:out|back|to))|check (?:my |our )?(?:messages|communications|developments|updates)|what happened|any news)\b/iu;
const NEGATED = /\b(?:do\s+not|don't|dont|never|not\s+yet|without)\s+(?:advance|proceed|continue|move\s+(?:on|forward)|go\s+ahead|skip(?:\s+(?:ahead|to))?|leave|depart|head\s+(?:out|back|to)|check)\b[^.!?;]*/giu;

function actionableText(value) {
    return String(value || '').replace(NEGATED, ' ');
}

export function defaultPacingState() {
    return { mode: 'auto', inferred: 'natural', effective: 'natural', reason: 'No pacing signal yet.', lingeringSinceTurn: 0, lastSignal: '', updatedAtTurn: 0 };
}

export function normalizePacingState(value = {}) {
    const rawMode = String(value.mode || '').toLowerCase();
    const mode = ['auto', 'linger', 'natural', 'advance'].includes(rawMode) ? rawMode : 'auto';
    const rawInferred = String(value.inferred || '').toLowerCase();
    const inferred = ['linger', 'natural', 'advance'].includes(rawInferred) ? rawInferred : 'natural';
    return {
        mode,
        inferred,
        effective: mode === 'auto' ? inferred : mode,
        reason: String(value.reason || '').trim().slice(0, 260),
        lingeringSinceTurn: Math.max(0, Number(value.lingeringSinceTurn ?? value.lingering_since_turn) || 0),
        lastSignal: String(value.lastSignal ?? value.last_signal ?? '').trim().slice(0, 180),
        updatedAtTurn: Math.max(0, Number(value.updatedAtTurn ?? value.updated_at_turn) || 0),
    };
}

export function inferPacing(latestUserAction = '', previous = defaultPacingState(), turnCount = 0) {
    const prior = normalizePacingState(previous);
    const action = String(latestUserAction || '').trim();
    const candidate = actionableText(action);
    let inferred = 'natural';
    let reason = 'No explicit lingering or advancement signal was detected.';
    if (LINGER.test(candidate)) {
        inferred = 'linger';
        reason = 'The user remains engaged with the current activity.';
    } else if (ADVANCE.test(candidate)) {
        inferred = 'advance';
        reason = 'The user authorized leaving the activity, checking developments, or moving time/story forward.';
    } else if (prior.inferred === 'linger') {
        inferred = 'linger';
        reason = 'Lingering persists until the user exits, time-skips, checks developments, or explicitly advances.';
    }
    return normalizePacingState({
        ...prior,
        inferred,
        reason,
        lastSignal: action,
        lingeringSinceTurn: inferred === 'linger' ? (prior.lingeringSinceTurn || turnCount) : 0,
        updatedAtTurn: turnCount,
    });
}

export function updatePacing(previous, { mode, latestUserAction = '', turnCount = 0 } = {}) {
    const inferred = inferPacing(latestUserAction, previous, turnCount);
    return normalizePacingState({ ...inferred, mode: mode ?? inferred.mode });
}

export function consumeAdvanceOverride(value) {
    const pacing = normalizePacingState(value);
    if (pacing.mode !== 'advance') return pacing;
    return normalizePacingState({ ...pacing, mode: 'auto' });
}

export function isReleaseSignal(value = '') {
    const candidate = actionableText(value);
    return !LINGER.test(candidate) && ADVANCE.test(candidate);
}
