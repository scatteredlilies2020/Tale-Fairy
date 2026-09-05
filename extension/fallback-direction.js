import { applyPlannerAuthorLayer, defaultState, normalizeState } from './state.js?v=0.12.17';

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
        status: currentBeat || 'Latest transcript loaded; awaiting the next external follow-through.',
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
    next.beatDirective = {
        operation: 'let an established NPC or the current environment complete one natural observable follow-through',
        primaryWhen: 'When an established NPC or the current environment can naturally answer the latest turn.',
        target: 'the latest established interaction',
        requiredEffect: 'Create one concrete external response, change, or discovery while leaving the player action and intent untouched.',
        alternatives: [
            {
                when: 'When the interaction is quiet or conversational.',
                operation: 'let an established NPC contribute one specific reaction decision or disclosure',
                requiredEffect: 'Move the current interaction forward with information or commitment that does not require a player reply.',
                contentClass: 'reaction', scope: 'social', intensity: 'low', quantity: 'singular', relativePower: 'established', plotWeight: 'connective', duration: 'beat',
            },
            {
                when: 'When environmental movement fits better than an NPC response.',
                operation: 'let the current environment produce one context native observable development',
                requiredEffect: 'Advance the immediate situation without invented conflict urgency or control of the player character.',
                contentClass: 'opportunity', scope: 'social', intensity: 'low', quantity: 'singular', relativePower: 'none', plotWeight: 'connective', duration: 'beat',
            },
        ],
        inject: true,
        injectReason: 'A safe current direction is required while the adaptive planner recovers.',
        contentClass: 'reaction', scope: 'social', intensity: 'low', quantity: 'singular', relativePower: 'established', plotWeight: 'connective', duration: 'beat',
        preserve: ['Established facts and the exact latest transcript state.', 'Player agency, intent, dialogue, and consent.'],
        forbid: ['Inventing or narrating player action.', 'Inventing conflict or urgency merely to force movement.'],
        basis: 'Fresh generic fallback bound to the exact current transcript; never reused after it becomes stale.',
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
    next.lastReason = `Safety fallback prepared from the latest transcript${reason ? ` after ${String(reason).slice(0, 160)}` : ''}.`;
    next.lastAnalysisFingerprint = fingerprint;
    next.sourceMessageCount = messages.length;
    next.sourceChatId = String(chatId || '');
    next.lastAnalyzedAt = now;
    next.turnCount = Math.max(0, Number(turnCount) || 0);
    next.plannerSeed = Math.max(0, Number(seed) || 0);
    return applyPlannerAuthorLayer(next, { turnCount: next.turnCount, fingerprint, seedRequiredDevelopment: false });
}
