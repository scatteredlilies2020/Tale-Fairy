import { applyPlannerAuthorLayer, defaultState, normalizeState } from './state.js?v=0.14.2';
import { relevantExcerpt } from './evidence-selection.js?v=0.13.9';

function statusFields(value) {
    const fields = {};
    for (const line of String(value || '').split(/\r?\n/u)) {
        const match = line.trim().match(/^([^=]{2,40})\s*=\s*(.+)$/u);
        if (match) fields[match[1].trim().toLocaleLowerCase()] = match[2].trim();
    }
    return fields;
}

function cleanClause(value, limit = 220) {
    return String(value || '')
        .replace(/<[^>]*>/gu, ' ')
        .replace(/\s+/gu, ' ')
        .replace(/^[\s:;,.!?-]+|[\s:;,.!?-]+$/gu, '')
        .trim()
        .slice(0, limit);
}

function fallbackCausalConditions({ currentBeat = '', location = '', time = '', messages = [] } = {}) {
    const conditions = [];
    const beat = cleanClause(currentBeat);
    const place = cleanClause(location, 120);
    const clock = cleanClause(time, 120);

    if (beat) {
        conditions.push({
            id: 'fallback-current-scene',
            kind: 'system',
            subject: 'The current scene',
            condition: `is already underway around ${beat}; its established participants, relationships, and constraints remain causally active`,
            disclosure: 'open',
            confidence: 'established',
            relevance: 'The authoritative transcript status identifies this as the current beat.',
        });
    }
    if (place) {
        conditions.push({
            id: 'fallback-active-setting',
            kind: 'environment',
            subject: place,
            condition: 'is the active setting, whose established environment and occupants continue operating beyond the visible exchange',
            disclosure: 'open',
            confidence: 'established',
            relevance: 'The authoritative transcript status identifies this as the current location.',
        });
    }
    if (!conditions.length && clock) {
        conditions.push({
            id: 'fallback-active-time',
            kind: 'environment',
            subject: 'The current environment',
            condition: `continues under the established time and weather context: ${clock}`,
            disclosure: 'open',
            confidence: 'established',
            relevance: 'The authoritative transcript status supplies the current temporal context.',
        });
    }
    if (!conditions.length) {
        const user = [...messages].reverse().find(message => message.is_user && message.mes);
        const assistant = [...messages].reverse().find(message => !message.is_user && message.mes);
        const source = user || assistant;
        conditions.push({
            id: 'fallback-transcript-excerpt',
            kind: 'situation',
            subject: user ? 'Latest user contribution' : 'Latest accepted scene',
            condition: source ? `Source excerpt (not an assumed outcome): ${cleanClause(relevantExcerpt(source.mes, 75, assistant?.mes || ''), 230)}` : 'No plot facts have been supplied yet; do not invent prior events.',
            disclosure: 'open',
            confidence: 'established',
            relevance: 'Continue from this actual transcript contribution, without treating a request or intention as a completed outcome.',
        });
    }
    return conditions;
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
        promise: 'Continue the already-active world directly from the latest transcript without inventing player action.',
        phase: 'developing',
        emotionalDirection: 'preserve',
        noveltyCeiling: 'context-native',
        basis: 'Transcript-bound safety fallback used because the adaptive planner did not produce a usable result.',
    };
    // A chat opening is only the edge of the observation window, never the
    // beginning of the world. If the planner fails, retain a minimal causal
    // slice grounded exclusively in the authoritative transcript status.
    next.causalContext = {
        conditions: fallbackCausalConditions({ currentBeat, location, time, messages }),
        inject: true,
        injectReason: 'A minimal in-medias-res causal slice was inferred from the authoritative transcript after planner failure.',
        basis: 'Transcript-grounded safety inference; no future event or player action was invented.',
    };
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
    next.lastInject = true;
    next.lastReason = `Minimal transcript-grounded causal context inferred after planner fallback${reason ? `: ${String(reason).slice(0, 160)}` : ''}.`;
    next.lastAnalysisFingerprint = fingerprint;
    next.sourceMessageCount = messages.length;
    next.sourceChatId = String(chatId || '');
    next.lastAnalyzedAt = now;
    next.turnCount = Math.max(0, Number(turnCount) || 0);
    next.plannerSeed = Math.max(0, Number(seed) || 0);
    return applyPlannerAuthorLayer(next, { turnCount: next.turnCount, fingerprint, seedRequiredDevelopment: false });
}
