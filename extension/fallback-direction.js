import { applyPlannerAuthorLayer, defaultState, normalizeState } from './state.js?v=0.13.2';

function statusFields(value) {
    const fields = {};
    for (const line of String(value || '').split(/\r?\n/u)) {
        const match = line.trim().match(/^([^=]{2,40})\s*=\s*(.+)$/u);
        if (match) fields[match[1].trim().toLocaleLowerCase()] = match[2].trim();
    }
    return fields;
}

export function createSafetyFallbackState(state, {
    transcriptHead = null,
    messages = [],
    chatId = '',
    fingerprint = '',
    turnCount = 0,
    seed = 0,
    now = Date.now(),
    reason = '',
} = {}) {
    const next = normalizeState(state);
    const clean = defaultState();
    const fields = statusFields(transcriptHead?.authoritative_assistant_status);
    const currentBeat = fields['current beat'] || '';
    const time = fields['time & weather'] || fields.time || fields.date || '';
    const location = fields.location || '';

    next.scene = {
        ...next.scene,
        status: currentBeat || 'Latest transcript loaded; awaiting fresh causal analysis.',
        activity: currentBeat || 'Continue from the exact latest transcript.',
        location: location || '',
        time: time || '',
        loop: false,
    };
    next.sceneProfile = {
        ...clean.sceneProfile,
        promise: 'Continue directly from the latest transcript without inventing player action.',
        phase: 'developing',
        emotionalDirection: 'preserve',
        noveltyCeiling: 'context-native',
        basis: 'Transcript-bound safety fallback used because the adaptive planner did not produce a usable result.',
    };
    // A planner failure cannot safely invent causal facts. Keep the fallback
    // transcript-bound and inject nothing until a verified analysis succeeds.
    next.causalContext = clean.causalContext;
    next.responseAudit = clean.responseAudit;
    next.hiddenMotives = clean.hiddenMotives;
    next.horizonRadar = clean.horizonRadar;
    next.narrativeLayers = {
        ...next.narrativeLayers,
        immediateAction: '',
        localActivity: currentBeat || 'Continue from the exact latest transcript.',
        situation: currentBeat || 'Use only the exact latest transcript state.',
        activityRole: 'routine',
        temporalScope: 'action',
    };
    next.lastInject = false;
    next.lastReason = `No causal context injected; planner fallback retained only the latest transcript${reason ? ` after ${String(reason).slice(0, 160)}` : ''}.`;
    next.lastAnalysisFingerprint = fingerprint;
    next.sourceMessageCount = messages.length;
    next.sourceChatId = String(chatId || '');
    next.lastAnalyzedAt = now;
    next.turnCount = Math.max(0, Number(turnCount) || 0);
    next.plannerSeed = Math.max(0, Number(seed) || 0);
    return applyPlannerAuthorLayer(next, { turnCount: next.turnCount, fingerprint, seedRequiredDevelopment: false });
}
