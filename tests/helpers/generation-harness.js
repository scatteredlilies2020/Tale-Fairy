import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as stateApi from '../../extension/state.js';
import * as cacheApi from '../../extension/generation-context.js';
import * as scheduleApi from '../../extension/planner-scheduler.js';
import * as coalescerApi from '../../extension/planner-coalescer.js';
import * as compactionApi from '../../extension/notebook-compaction.js';
import * as preparedApi from '../../extension/prepared-world.js';
import * as campaignApi from '../../extension/campaign-planner.js';
import * as ownedApi from '../../extension/event-planning.js';
import { CampaignSession, CAMPAIGN_ATTEMPT_KEY } from '../../extension/campaign-session.js';
import { isStoryGeneration, refreshGameMasterContract } from '../../extension/game-master.js';
import { sampleDirectorSignals } from '../../extension/director-sampling.js';
import { selectSituationalOpenings } from '../../extension/situations.js';
import { canRetainSuccessfulPlan, createSafetyFallbackState } from '../../extension/fallback-direction.js';

const source = readFileSync(new URL('../../extension/index.js', import.meta.url), 'utf8');
export function generationHarness(messages, state = stateApi.defaultState(), metadata = {}) {
    const calls = [], statuses = [], timers = [], handlers = new Map();
    const settings = { enabled: true, mode: 'balanced' };
    let chatMetadata = stateApi.saveState(metadata, state);
    const context = {
        chat: messages,
        get chatMetadata() { return chatMetadata; },
        set chatMetadata(value) { chatMetadata = value; },
        getCurrentChatId: () => 'story',
        updateChatMetadata(value, reset) { chatMetadata = reset ? { ...value } : { ...chatMetadata, ...value }; },
    };
    const names = ['GENERATION_STARTED', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'MESSAGE_RECEIVED', 'MESSAGE_SENT', 'MESSAGE_EDITED', 'MESSAGE_UPDATED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'WORLDINFO_UPDATED', 'WORLDINFO_SETTINGS_UPDATED', 'CHARACTER_EDITED', 'PERSONA_CHANGED', 'PERSONA_UPDATED'];
    const scope = {
        ...stateApi, ...cacheApi, ...scheduleApi, ...coalescerApi, ...preparedApi, ...campaignApi, ...ownedApi, ...compactionApi, CampaignSession, CAMPAIGN_ATTEMPT_KEY,
        getRequestHeaders: () => ({}), sha256: bytes => createHash('sha256').update(bytes).digest('hex'),
        isStoryGeneration, refreshGameMasterContract, sampleDirectorSignals, selectSituationalOpenings, createSafetyFallbackState, canRetainSuccessfulPlan,
        // ST returns a new context with a snapshot reference to its metadata.
        // updateChatMetadata replaces the host object, not that reference.
        currentContext: () => ({ ...context }), messagesFromChat: value => value,
        getSettings: () => settings, getCharacterCardFields: () => context.card || {},
        loadWorldInfo: async name => { scope.worldInfoCache.set(name, context.worlds?.[name] || { entries: {} }); },
        world_info: {}, selected_world_info: [], worldInfoCache: new Map(),
        extension_settings: {},
        getWorldInfoSettings: () => ({ world_info: {}, world_info_depth: 2 }), bootstrapContext: () => context.card || {},
        generationGuideSelection: null, activeGenerationType: '', pendingRequestVerification: null,
        analysisPromise: null, activeAnalysisIntent: null, activeAnalysisMessageCount: 0,
        campaignSession: null, analyzeCampaignNow: async options => { calls.push({ campaign: true, ...options }); },
        queuedAnalysisIntent: null, analysisAbortController: null, analysisRunId: 0,
        analysisRequestFingerprint: '', analysisRequestInputKey: '', analysisRetryTimer: null, analysisRetryAttempt: 0,
        generationRevision: 0, analysisStopSequence: 0, transcriptRefreshTimer: null,
        replyRepairInFlight: false,
        renderAnalysisActivity: status => statuses.push(status), renderInjectionActivity: status => statuses.push(status), renderBoard() {}, updatePrompt() {},
        recordRuntimeStage() {}, scheduleVerificationPersistence() {}, saveSettingsDebounced() {},
        cancelDetachedPlannerJobs: async () => {}, clearAutomaticReplyRepair() {},
        recoverDetachedPlannerJobs: async () => ({ recovered: false, active: false }),
        plannerStorage: () => null, plannerWasInterrupted: () => false, plannerFailedForSnapshot: () => false,
        clearPromptManagerInjection() {}, promptManager: null, setExtensionPrompt() {}, PROMPT_KEY: 'test', stopAnalysis() {},
        confirmReturnedReplyUsedGuidance: async () => {}, classifyAssistantReply: () => ({ unusable: false }),
        prepareAuthorContract: value => value, scheduleAutomaticReplyRepair() {},
        analyzeNow: async options => { calls.push({ ...options, messages: structuredClone(options.messages) }); },
        assistantTurnNumber: value => value.filter(item => !item.is_user).length,
        setTimeout: callback => { timers.push(callback); return callback; },
        clearTimeout: callback => { const i = timers.indexOf(callback); if (i >= 0) timers.splice(i, 1); },
        event_types: Object.fromEntries(names.map(name => [name, name])),
        eventSource: { on(name, callback) { handlers.set(name, callback); } },
        DOMException, console,
    };
    vm.createContext(scope);
    for (const name of ['campaignMode', 'campaignFingerprint', 'preparedReady', 'commitCampaignPreparation', 'runningSourceHasOnlyAppends', 'rebuildState', 'normalizeUserNote', 'persistClarifiedNote']) {
        const match = source.match(new RegExp(`(?:export )?(?:async )?function ${name}\\([^]*?^}`, 'm'));
        assert.ok(match, name);
        vm.runInContext(match[0].replace(/^export /u, ''), scope);
    }
    for (const name of ['guideSelectionOptions', 'generationInputs', 'warmPlotWorldInputs', 'replacementPlanningDeferred', 'retryPlannerSourceMatches', 'retryPlannerActive', 'plannerInputsMatch', 'bindResolvedNoteInputProof', 'buildGenerationPacket', 'archiveReadyPlannerContexts', 'deferReplacementPlanning', 'repairDeferredReplacementPlan', 'reevaluateGuideState', 'refreshCurrentPlanIfNeeded', 'resetState', 'rebuildPendingState', 'persistRebuildPending', 'prepareGenerationGuide', 'persist', 'queueLatestAnalysis', 'drainQueuedAnalysis', 'scheduleTranscriptRefresh', 'clearQueuedAnalysis', 'clearTranscriptRefresh', 'cancelAnalysisRetry', 'cancelRunningAnalysis', 'interruptAnalysis', 'verificationMatchesTranscript', 'invalidateChangedTranscriptVerification']) {
        const match = source.match(new RegExp(`(?:export )?(?:async )?function ${name}\\([^]*?^}`, 'm'));
        assert.ok(match, name);
        vm.runInContext(match[0].replace(/^export /u, ''), scope);
    }
    vm.runInContext(source.slice(source.indexOf('eventSource.on(event_types.GENERATION_STARTED,'), source.indexOf('eventSource.on(event_types.CHAT_CHANGED,')), scope);
    return {
        scope, context, settings, calls, statuses,
        state: () => scope.loadState(context.chatMetadata),
        prepare(type = 'normal') { scope.prepareGenerationGuide(this.state(), type); return scope.generationGuideSelection; },
        async emit(name, ...args) { await handlers.get(name)?.(...args); },
        async flush() { while (timers.length) await timers.shift()(); },
    };
}
