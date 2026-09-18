import { sha256 } from '/lib.js';
import { campaignAuthorInstructions, campaignUsable, emptyCampaign, validCampaignState, eventPointWire, EVENT_POINTS_FORMAT } from './campaign-planner.js';
import { ownedInput, ownedPass, needsEventReframe, OWNED_SCHEMA, OWNED_SYSTEM } from './event-planning.js?v=0.14.29';
import { readCampaignContinuity } from './campaign-continuity.js';
import { readEvidenceProviders, evidenceRevisionKey } from './evidence-providers.js';
import { campaignEvidenceMessages, campaignReviewWindow } from './campaign-evidence.js';
import { CampaignSession, CAMPAIGN_ATTEMPT_KEY } from './campaign-session.js?v=0.14.29';
import { finalizeNotebookCompactions, writeNotebookArchive } from './notebook-compaction.js?v=0.14.22';
import { eventSource, event_types, extension_prompt_roles, extension_prompt_types, generateRaw, Generate, setExtensionPrompt, getRequestHeaders, getCharacterCardFields, saveSettingsDebounced } from '/script.js';
import { getContext } from '/scripts/st-context.js';
import { extension_settings } from '/scripts/extensions.js';
import { ConnectionManagerRequestService } from '/scripts/extensions/shared.js';
import { SECRET_KEYS, secret_state, writeSecret } from '/scripts/secrets.js';
import { oai_settings, openai_setting_names, openai_settings, promptManager } from '/scripts/openai.js';
import { abstractIncrementalVisibleBranches, AnalysisValidationError, alignRetainedStateToTranscript, applyAnalysis, ANALYSIS_OUTPUT_CONTRACT, ANALYSIS_SCHEMA, buildAnalysisPrompt, buildStoryEvidence, storyEvidenceQuery, extractJson, INCREMENTAL_ANALYSIS_OUTPUT_CONTRACT, INCREMENTAL_ANALYSIS_SCHEMA, INCREMENTAL_SYSTEM, normalizeAnalysisActorUpdates, normalizeAnalysisDiagnostics, SYSTEM, transcriptHeadAlignmentErrors, validateAnalysisResult } from './analysis.js?v=0.14.22';
import { applyPlannerAuthorLayer, buildPromptPayload, clearState, defaultPlannerState as defaultState, fingerprintMessages, generationRetrySource, guidanceSnapshot, isAnalysisSourceCurrent, isDirectionCurrent, isGuidanceUsable, isReplacementVerificationCurrent, isStateAligned, loadPlannerState as loadState, reconcileContinuityThreads, returnedReplyMatchesVerification, saveState, STATE_KEY, STATE_VERSION } from './state.js?v=0.14.23';
import { isStoryGeneration, refreshGameMasterContract } from './game-master.js?v=0.14.22';
import { selectSituationalOpenings } from './situations.js?v=0.13.9';
import { DEFAULT_REFRESH_INTERVAL, markAssistantTurn, normalizePlannerSchedule, plannerPassDecision, plannerRefreshDecision, withRefreshReason } from './planner-scheduler.js?v=0.14.22';
import { resolveInjectionPlacement } from './injection-placement.js?v=0.13.9';
import { DEFAULT_INJECTION_ROLE, normalizeInjectionRole } from './injection-role.js?v=0.13.9';
import { clearPromptManagerInjection, configurePromptManagerInjection } from './prompt-manager-injection.js?v=0.13.9';
import { chatHasCurrentGuidance, ensureGuidanceInChat, ensureGuidanceInText, extractTaleFairyContext, requestContainsMarker, textHasCurrentGuidance } from './request-injection.js?v=0.14.22';
import { normalizeModelListResponse } from './models.js?v=0.13.9';
import { buildReasoningRequest, isMandatoryReasoningError, isReasoningControlError, normalizeReasoningMode, plannerOutputTokenBudget, reasoningFallbackPayload, resolveReasoningMode } from './reasoning-policy.js?v=0.14.22';
import { readContinuityBridge, waitForContinuityBridge } from './continuity.js?v=0.14.22';
import { isPlannerTimeoutError, plannerRetryDelay, shouldRetryPlannerError } from './retry-policy.js?v=0.13.9';
import { collectSummarySources } from './summary-context.js?v=0.14.22';
import { estimateTokenCount } from './token-budget.js?v=0.13.9';
import { fitPromptToBudget, plannerEvidenceAudit } from './prompt-budget.js?v=0.14.22';
import { DEFAULT_ROUTINE_INPUT, DEFAULT_REVIEW_INPUT, normalizeInputBudget, plannerBudgets } from './planner-budgets.js?v=0.14.22';
import { relevantActors } from './evidence-selection.js?v=0.13.9';
import { completionText } from './completion-response.js?v=0.14.22';
import { sampleDirectorSignals } from './director-sampling.js?v=0.13.9';
import { customOutputPayload, detachedPlannerFailure, isUnsupportedStructuredOutputError, negotiateOutputModes, plannerMessages, plannerOutputModes, plannerBudgetEnvelope, plannerPrompt, PLANNER_OUTPUT_MODE, stripStructuredOutputControls } from './output-negotiation.js?v=0.14.22';
import { clearPlannerRecoveryRepair, clearPlannerFailed, clearPlannerPending, markPlannerFailed, markPlannerPending, plannerFailedForSnapshot, plannerWasInterrupted, waitForPlannerHandoff } from './planner-lifecycle.js?v=0.13.10';
import { exceedsAppendAllowance, mergePlannerIntents, normalizePlannerIntent } from './planner-coalescer.js?v=0.13.9';
import { hasUsableCausalContext } from './causal-context.js?v=0.14.22';
import { formatHiddenMotives } from './scratchpad-format.js?v=0.13.9';
import { WORLD_PLANNER_SYSTEM, WORLD_PLANNER_SCHEMA } from './world-planner.js?v=0.14.22';
import { buildWorldPlannerPrompt } from './analysis.js?v=0.14.22';
import { defaultPreparedWorld, preparedWorldUsable, unchangedSourcePrefix, stampPreparedWorld } from './prepared-world.js?v=0.14.22';
import { alignmentPromptFromMeta, transcriptHeadFromPrompt } from './detached-meta.js?v=0.13.9';
import { canRetainSuccessfulPlan, createSafetyFallbackState } from './fallback-direction.js?v=0.14.22';
import { classifyAssistantReply } from './response-usability.js?v=0.13.9';
import { buildPlotAnchor, cachedGenerationContext, hasNewerPlannerState, generationContextEntries, generationPreviewDescription, GENERATION_CONTEXT_KEY, hasPlannerConditions, PLOT_ANCHOR_VERSION, plotCardInputs, plotInputKey, plotVariableInputs, plotWorldNames, rememberGenerationContext, REPLACEMENT_PENDING_KEY, replacementPendingForMessages } from './generation-context.js?v=0.14.22';
import { getWorldInfoSettings, loadWorldInfo, selected_world_info, world_info, worldInfoCache } from '/scripts/world-info.js';

const EXTENSION_ID = 'living-world-guide';
const RUNTIME_VERSION = '0.14.29';
const PLANNER_SERVER_BASE = '/api/plugins/tale-fairy';
const PLANNER_BACKEND_PATHS = new Set([
    '/api/backends/chat-completions/generate',
    '/api/backends/text-completions/generate',
    '/api/backends/kobold/generate',
    '/api/backends/koboldhorde/generate',
]);
const PROMPT_KEY = `${EXTENSION_ID}_context`;
const DIRECT_CUSTOM_CHOICE = '__direct_custom__';
const DIRECT_OPENROUTER_CHOICE = '__direct_openrouter__';
const INJECTION_POSITIONS = new Set(['before-main', 'after-main', 'before-character-definitions', 'after-character-definitions', 'before-example-messages', 'after-example-messages', 'before-an', 'after-an', 'before-chat-history', 'after-chat-history', 'before-jailbreak', 'after-jailbreak', 'at-depth']);
const DEFAULT_SETTINGS = { enabled: true, mode: 'balanced', analysisProfileId: '', analysisSource: 'active', analysisProvider: 'custom', analysisModel: '', analysisUrl: '', analysisSecretId: '', analysisReasoningMode: 'auto', analysisTemperature: 1, directSettingsMigrated: false, directCustomModel: '', directCustomUrl: '', directCustomSecretId: '', directOpenRouterModel: '', directOpenRouterUrl: '', directOpenRouterSecretId: '', injectionPosition: 'at-depth', injectionDepth: 1, injectionRole: DEFAULT_INJECTION_ROLE, includeWorldInfo: false, showDirectorNotes: false, recentContextTokens: 6000, messageTokenLimit: 700, maxPromptTokens: 16000, continuityIntegration: true, summaryContextTokens: 4000, fullReviewInterval: DEFAULT_REFRESH_INTERVAL, contextSettingsVersion: 12 };
let settings = null;
let analysisPromise = null;
let campaignSession = null;
// Includes preflight, the asynchronous Web Lock grant, and lock release—not
// just the provider/session promise, which settles before the lock is released.
let campaignHostWork = null;
let analysisAbortController = null;
let analysisRequestFingerprint = '';
let analysisRequestInputKey = '';
let analysisRunId = 0;
let analysisRetryTimer = null;
let analysisRetryAttempt = 0;
let analysisPhaseTimer = null;
let generationRevision = 0;
let analysisStopSequence = 0;
let activeAnalysisIntent = null;
let activeAnalysisMessageCount = 0;
let queuedAnalysisIntent = null;
let transcriptRefreshTimer = null;
let lastAnalysisError = '';
let pendingRequestVerification = null;
let generationGuideSelection = null;
let activeGenerationType = '';
// Page-local only: synced request history is not proof of a new request.
let injectionStatus = 'No request verified on this page';
let uiMountPromise = null;
let uiMountObserver = null;
let uiMountTimeout = null;
let lastSummaryAudit = { count: 0, includedTokens: 0, originalTokens: 0, labels: [] };
let continuityUnsubscribe = null;
let continuityReplacementRevision = 0;
const legacyUpgradeAttempts = new Set();
const directModelCache = new Map();
const plannerOutputModeCache = new Map();
const detachedPlannerJobIds = new Map();
const plannerNativeFetch = globalThis.fetch?.taleFairyNativeFetch || globalThis.fetch.bind(globalThis);
let detachedPlannerEnabled = false;
let detachedPlannerRecovering = false;
let replyRepairTimer = null;
let replyRepairInFlight = false;
// Routine output targets 1200–1800 tokens; leave room for corrections and
// JSON structure. Full reviews/rebuilds have separate, bounded allowances.
const INCREMENTAL_RESPONSE_TOKENS = 4096;
const REBUILD_RESPONSE_TOKENS = 8192;
const REVIEW_RESPONSE_TOKENS = 6144;
const PLANNER_MAX_AUTO_RETRIES = 0;
const UI_MOUNT_TIMEOUT_MS = 30000;
const LEGACY_UPGRADE_MAX_ATTEMPTS = 1;
const INTERNAL_PLANNER_MARKER = 'You are Tale Fairy, the private authorial planning layer for SillyTavern roleplay.';
// Some OpenAI-compatible servers silently ignore native structured output.
// Keep a compact human-readable contract in the prompt, while the native
// request still carries the machine schema. Never duplicate the full schema in
// prompt tokens: that space belongs to lore, summaries, and conversation evidence.
const PLANNER_SYSTEM_PROMPT = `${SYSTEM}\n\n${ANALYSIS_OUTPUT_CONTRACT}`;
const INCREMENTAL_SYSTEM_PROMPT = `${INCREMENTAL_SYSTEM}\n\n${INCREMENTAL_ANALYSIS_OUTPUT_CONTRACT}`;
// Budget fitting uses the selected transport: native schema metadata or its
// shorter compatibility shape, plus the system prompt exactly once.

globalThis.taleFairyRuntime = Object.freeze({ version: RUNTIME_VERSION, loadedAt: Date.now() });
console.info(`[${EXTENSION_ID}] Tale Fairy runtime ${RUNTIME_VERSION} loaded`);

function randomVariationNonce() {
    if (globalThis.crypto?.getRandomValues) {
        const values = new Uint32Array(1);
        globalThis.crypto.getRandomValues(values);
        return values[0] & 0x7fffffff;
    }
    return Math.floor(Math.random() * 0x80000000);
}

function getSettings() {
    const stored = extension_settings[EXTENSION_ID];
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) extension_settings[EXTENSION_ID] = {};
    settings = extension_settings[EXTENSION_ID];
    const previousContextVersion = Math.max(0, Number(settings.contextSettingsVersion) || 0);
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (!Object.hasOwn(settings, key)) settings[key] = value;
    }
    if (previousContextVersion < 3) {
        if ([16, 24].includes(Number(settings.messageWindow))) settings.messageWindow = 12;
        settings.contextSettingsVersion = 3;
    }
    if (previousContextVersion > 0 && previousContextVersion < 4) {
        settings.contextSettingsVersion = 4;
    }
    if (previousContextVersion > 0 && previousContextVersion < 5) {
        if (settings.injectionPosition === 'at-depth' && Number(settings.injectionDepth) === 2) settings.injectionDepth = 0;
        settings.contextSettingsVersion = 5;
    }
    if (previousContextVersion > 0 && previousContextVersion < 6) {
        if (settings.injectionPosition === 'at-depth' && settings.injectionRole === 'system' && Number(settings.injectionDepth) === 0) {
            settings.injectionRole = 'user';
            settings.injectionDepth = 1;
        }
        settings.contextSettingsVersion = 6;
    }
    if (previousContextVersion < 7) {
        // Character-based settings cannot represent a provider token budget.
        // Move every existing install to the explicit 12k-token default.
        settings.messageTokenLimit = Number(settings.messageTokenLimit) || DEFAULT_SETTINGS.messageTokenLimit;
        settings.maxPromptTokens = Number(settings.maxPromptTokens) || DEFAULT_SETTINGS.maxPromptTokens;
        settings.continuityContextTokens = Number(settings.continuityContextTokens) || 3500;
        delete settings.messageCharLimit;
        delete settings.maxPromptChars;
        delete settings.continuityContextLimit;
        settings.contextSettingsVersion = 7;
    }
    if (previousContextVersion < 8) {
        // A message count gives wildly different context depending on turn
        // length. Replace it with a bounded raw-recency token allocation;
        // persistent summaries and relevance retrieval use the remaining
        // planner budget independently.
        settings.recentContextTokens = Number(settings.recentContextTokens) || DEFAULT_SETTINGS.recentContextTokens;
        delete settings.messageWindow;
        settings.contextSettingsVersion = 8;
    }
    if (previousContextVersion < 9) {
        // Continuity Memory is now one provider in a generic summary-evidence
        // layer. Preserve any larger old allocation while moving the setting
        // to its provider-neutral token budget.
        settings.summaryContextTokens = Math.max(
            DEFAULT_SETTINGS.summaryContextTokens,
            Number(settings.summaryContextTokens) || 0,
            Number(settings.continuityContextTokens) || 0,
        );
        delete settings.continuityContextTokens;
        settings.contextSettingsVersion = 9;
    }
    if (previousContextVersion > 0 && previousContextVersion < 10) {
        // Move untouched v9 defaults to the roomier long-form RP budget. Keep
        // deliberate custom allocations unchanged.
        if (Number(settings.recentContextTokens) === 4000) settings.recentContextTokens = 6000;
        if (Number(settings.maxPromptTokens) === 12000) settings.maxPromptTokens = 16000;
        settings.contextSettingsVersion = 10;
    }
    if (previousContextVersion > 0 && previousContextVersion < 11) {
        if (settings.injectionPosition === 'at-depth' && settings.injectionRole === 'user' && Number(settings.injectionDepth) === 2) {
            settings.injectionDepth = 1;
        }
        settings.contextSettingsVersion = 11;
    }
    if (previousContextVersion > 0 && previousContextVersion < 12) {
        if (Number(settings.routineInputTokens) === 10000) settings.routineInputTokens = DEFAULT_ROUTINE_INPUT;
    }
    settings.contextSettingsVersion = DEFAULT_SETTINGS.contextSettingsVersion;
    settings.fullReviewInterval = normalizePlannerSchedule({ refreshInterval: settings.fullReviewInterval }).refreshInterval;
    if (!settings.directSettingsMigrated) {
        const legacySource = settings.analysisSource === 'openrouter' || settings.analysisProvider === 'openrouter' ? 'openrouter' : 'direct';
        const keys = directSettingKeys(legacySource);
        if (!settings[keys.model] && !settings[keys.url] && !settings[keys.secret]) {
            settings[keys.model] = settings.analysisModel;
            settings[keys.url] = settings.analysisUrl;
            settings[keys.secret] = settings.analysisSecretId;
        }
        settings.directSettingsMigrated = true;
    }
    if (!INJECTION_POSITIONS.has(settings.injectionPosition)) settings.injectionPosition = 'at-depth';
    settings.injectionDepth = Math.min(100, Math.max(0, Number(settings.injectionDepth) || 0));
    settings.injectionRole = normalizeInjectionRole(settings.injectionRole);
    settings.analysisReasoningMode = normalizeReasoningMode(settings.analysisReasoningMode);
    if (settings.analysisReasoningMode === 'default') settings.analysisReasoningMode = 'auto';
    settings.analysisTemperature = normalizePlannerTemperature(settings.analysisTemperature);
    settings.maxPromptTokens = Math.max(9000, Math.min(30000, Number(settings.maxPromptTokens) || DEFAULT_SETTINGS.maxPromptTokens));
    settings.routineInputTokens = normalizeInputBudget(settings.routineInputTokens, DEFAULT_ROUTINE_INPUT);
    settings.reviewInputTokens = normalizeInputBudget(settings.reviewInputTokens, DEFAULT_REVIEW_INPUT);
    return settings;
}

function recordRuntimeStage(stage, detail = {}) {
    try {
        const s = getSettings();
        const entry = {
            version: RUNTIME_VERSION,
            stage: String(stage || ''),
            at: Date.now(),
            chatId: String(currentContext().getCurrentChatId?.() || ''),
            ...detail,
        };
        s.runtimeDiagnostic = entry;
        s.runtimeDiagnostics = [...(Array.isArray(s.runtimeDiagnostics) ? s.runtimeDiagnostics : []), entry].slice(-20);
        saveSettingsDebounced();
    } catch (error) {
        console.warn(`[${EXTENSION_ID}] Runtime diagnostic could not be recorded.`, error);
    }
}

function normalizePlannerTemperature(value) {
    const temperature = Number(value);
    if (!Number.isFinite(temperature)) return DEFAULT_SETTINGS.analysisTemperature;
    return Math.round(Math.min(2, Math.max(0, temperature)) * 100) / 100;
}

function plannerTemperature() {
    return normalizePlannerTemperature(getSettings().analysisTemperature);
}

function messagesFromChat(chat = []) { return chat.map(m => ({ mes: m?.mes || '', is_user: Boolean(m?.is_user), name: m?.name || '' })); }
function currentContext() { return getContext(); }

async function plannerServerApi(path, options = {}) {
    const response = await plannerNativeFetch(`${PLANNER_SERVER_BASE}${path}`, {
        ...options,
        headers: options.body
            ? (currentContext().getRequestHeaders?.() || getRequestHeaders?.() || { 'Content-Type': 'application/json' })
            : options.headers,
        cache: 'no-store',
    });
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : {}; }
    catch { payload = { error: text || response.statusText }; }
    if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`);
    return payload;
}

function rememberDetachedPlannerJob(runKey, id) {
    if (!runKey || !id) return;
    if (!detachedPlannerJobIds.has(runKey)) detachedPlannerJobIds.set(runKey, new Set());
    detachedPlannerJobIds.get(runKey).add(id);
}

function installDetachedPlannerTransport() {
    globalThis.fetch = async function taleFairyDetachedFetch(input, init = {}) {
        const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
        let pathname = '';
        try { pathname = new URL(rawUrl, globalThis.location?.origin || 'http://localhost').pathname; }
        catch { /* Leave unrelated or non-URL fetch inputs untouched. */ }
        if (!PLANNER_BACKEND_PATHS.has(pathname) || typeof init?.body !== 'string') {
            return plannerNativeFetch(input, init);
        }
        let request;
        try { request = JSON.parse(init.body); }
        catch { return plannerNativeFetch(input, init); }
        const meta = request?._taleFairyPlanner;
        if (!meta || typeof meta !== 'object') {
            let outboundInit = init;
            let guidanceBlock = '';
            try {
                const context = currentContext();
                const chatId = String(context.getCurrentChatId?.() || '');
                const generationType = request?.type ?? activeGenerationType;
                const plannerRequest = containsPlannerMarker(request);
                const roleplayRequest = !plannerRequest && isStoryGeneration(generationType) && (
                    Boolean(request?.type)
                    || Boolean(chatId && generationGuideSelection?.chatId === chatId)
                );
                const enabled = getSettings().enabled;
                // Explicit quiet/impersonation types override a still-active
                // story selection. Repair leaked context at the final boundary
                // too, but never alter or verify a marked planner request.
                if (!plannerRequest && (roleplayRequest || extractTaleFairyContext(request))) {
                    const payload = roleplayRequest && enabled ? currentGuidancePayload(generationType) : '';
                    if (Array.isArray(request.messages)) {
                        ensureGuidanceInChat(request.messages, payload, requestInjectionOptions());
                    } else if (typeof request.prompt === 'string') {
                        request.prompt = ensureGuidanceInText(request.prompt, payload);
                    }
                    // Serialize even when no fresh usable guidance was available:
                    // ensureGuidance* may have removed stale Tale Fairy context.
                    outboundInit = { ...init, body: JSON.stringify(request) };
                }
                guidanceBlock = roleplayRequest && enabled ? extractTaleFairyContext(JSON.parse(outboundInit.body)) : '';
                if (guidanceBlock) {
                    rememberVerifiedRequest(guidanceBlock, {
                        provider: request.chat_completion_source || currentContext().mainApi,
                        model: request.model,
                    });
                    recordRuntimeStage('provider-bound-proof-saved', { generationType: String(request?.type || '') });
                    renderInjectionActivity('Context verified in outgoing request');
                } else if (roleplayRequest && enabled && generationGuideSelection?.skipped) {
                    rememberSkippedRequest({
                        provider: request.chat_completion_source || currentContext().mainApi,
                        model: request.model,
                    });
                    recordRuntimeStage('provider-bound-skip-saved', { generationType: String(request?.type || '') });
                    renderInjectionActivity('No fresh usable causal context · no injection');
                }
            } catch (error) {
                recordRuntimeStage('provider-bound-proof-error', {
                    generationType: String(request?.type || ''),
                    error: String(error?.message || error).slice(0, 300),
                });
                reportNonBlockingInjectionFailure('Tale Fairy could not repair or record the final outbound payload', error);
            }

            // No Tale Fairy work is awaited and no verification failure can
            // reject the provider request.
            const response = plannerNativeFetch(input, outboundInit);
            recordRuntimeStage('network-dispatched', { generationType: String(request?.type || '') });
            try {
                if (guidanceBlock && getSettings().enabled) renderInjectionActivity('Context included · request sent; reply not yet confirmed');
            } catch (error) {
                console.warn(`[${EXTENSION_ID}] Passive injection verification failed without affecting generation.`, error);
            }
            return response;
        }
        if (!detachedPlannerEnabled) return plannerNativeFetch(input, init);
        delete request._taleFairyPlanner;
        const response = await plannerNativeFetch(`${PLANNER_SERVER_BASE}/planner-jobs/generate`, {
            method: 'POST',
            headers: init.headers || currentContext().getRequestHeaders?.() || getRequestHeaders?.() || { 'Content-Type': 'application/json' },
            body: JSON.stringify({ request, meta, backendPath: pathname }),
            signal: init.signal,
            cache: 'no-store',
        });
        rememberDetachedPlannerJob(meta.runKey, response.headers.get('X-Tale-Fairy-Job-Id'));
        // SillyTavern turns non-2xx response bodies into a generic
        // "Got response status ..." exception after showing its own toast.
        // Preserve the provider's actual reason here so output negotiation can
        // recognize unsupported response formats and retry without them.
        if (!response.ok) throw await detachedPlannerFailure(response);
        return response;
    };
    Object.defineProperty(globalThis.fetch, 'taleFairyNativeFetch', { value: plannerNativeFetch });
}

async function initializeDetachedPlanner() {
    try {
        const health = await plannerServerApi('/health');
        detachedPlannerEnabled = health?.detachedPlanner === true;
    } catch (error) {
        detachedPlannerEnabled = false;
        console.warn(`[${EXTENSION_ID}] Browser-independent planner is unavailable; restart SillyTavern after updating Tale Fairy.`, error);
    }
    return detachedPlannerEnabled;
}

installDetachedPlannerTransport();
const detachedPlannerReady = initializeDetachedPlanner();

function analysisBudgetEnvelope(incremental) {
    return plannerBudgetEnvelope(WORLD_PLANNER_SYSTEM, WORLD_PLANNER_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY);
}

async function buildTokenBudgetedAnalysisPrompt(messages, state, note, bootstrap, options) {
    const tokenBudget = Math.max(options.incremental ? 6000 : 9000, Math.min(30000, Number(options.maxPromptTokens) || DEFAULT_SETTINGS.maxPromptTokens));
    const context = currentContext();
    const historyCache = new Map(); // One transcript-bound cache per fit, never across turns.
    return fitPromptToBudget({
        tokenBudget,
        fixedEnvelope: analysisBudgetEnvelope(options.incremental),
        tokenCounter: typeof context?.getTokenCountAsync === 'function' ? context.getTokenCountAsync.bind(context) : null,
        buildPrompt: effectivePromptTokens => buildWorldPlannerPrompt(messages, state, note, bootstrap, { ...options, maxPromptTokens: tokenBudget, effectivePromptTokens, historyCache }),
    });
}

function analysisConnectionChoice(s = getSettings()) {
    if (s.analysisSource === 'profile') return String(s.analysisProfileId || '');
    if (s.analysisSource === 'openrouter') return DIRECT_OPENROUTER_CHOICE;
    if (s.analysisSource === 'direct') return DIRECT_CUSTOM_CHOICE;
    return '';
}

function directSettingKeys(source) {
    return source === 'openrouter'
        ? { model: 'directOpenRouterModel', url: 'directOpenRouterUrl', secret: 'directOpenRouterSecretId' }
        : { model: 'directCustomModel', url: 'directCustomUrl', secret: 'directCustomSecretId' };
}

function rememberDirectSettings(s, source = s.analysisSource) {
    if (source !== 'direct' && source !== 'openrouter') return;
    const keys = directSettingKeys(source);
    s[keys.model] = s.analysisModel;
    s[keys.url] = s.analysisUrl;
    s[keys.secret] = s.analysisSecretId;
}

function restoreDirectSettings(s, source) {
    const keys = directSettingKeys(source);
    s.analysisModel = String(s[keys.model] || '');
    s.analysisUrl = String(s[keys.url] || (source === 'openrouter' ? 'https://openrouter.ai/api/v1' : ''));
    s.analysisSecretId = String(s[keys.secret] || '');
}

function applyAnalysisConnectionChoice(value, s = getSettings()) {
    const choice = String(value || '');
    rememberDirectSettings(s);
    if (choice === DIRECT_CUSTOM_CHOICE || choice === DIRECT_OPENROUTER_CHOICE) {
        s.analysisSource = choice === DIRECT_OPENROUTER_CHOICE ? 'openrouter' : 'direct';
        s.analysisProvider = choice === DIRECT_OPENROUTER_CHOICE ? 'openrouter' : 'custom';
        s.analysisProfileId = '';
        restoreDirectSettings(s, s.analysisSource);
        return;
    }
    if (choice) {
        s.analysisSource = 'profile';
        s.analysisProfileId = choice;
        return;
    }
    s.analysisSource = 'active';
    s.analysisProfileId = '';
}

function refreshConnectionProfiles(root = document.querySelector(`#${EXTENSION_ID}-settings`)) {
    const select = root?.querySelector('[data-setting="connection"]');
    if (!select) return;
    select.querySelectorAll('option[data-profile]').forEach(option => option.remove());
    const selected = analysisConnectionChoice();
    let selectedFound = !selected || selected === DIRECT_CUSTOM_CHOICE || selected === DIRECT_OPENROUTER_CHOICE;
    try {
        for (const profile of ConnectionManagerRequestService.getSupportedProfiles?.() || []) {
            const option = document.createElement('option');
            const hasModel = Boolean(String(profile?.model || '').trim());
            option.value = String(profile.id || '');
            option.textContent = `${profile.name || profile.id || 'Unnamed profile'}${hasModel ? ` — ${profile.model}` : ' — model not set'}`;
            option.disabled = !hasModel;
            option.dataset.profile = 'true';
            select.append(option);
            if (option.value === selected && hasModel) selectedFound = true;
        }
    } catch (error) {
        console.warn(`[${EXTENSION_ID}] Could not list connection profiles`, error);
    }
    if (!selectedFound && selected) {
        const unavailable = document.createElement('option');
        unavailable.value = selected;
        unavailable.textContent = 'Saved connection profile — unavailable or model not set';
        unavailable.disabled = true;
        unavailable.dataset.profile = 'true';
        select.append(unavailable);
    }
    select.value = selected;
}

function directModelCacheKey(s = getSettings()) {
    if (s.analysisSource !== 'direct' && s.analysisSource !== 'openrouter') return '';
    const fallbackUrl = s.analysisSource === 'openrouter' ? 'https://openrouter.ai/api/v1' : '';
    const url = String(s.analysisUrl || fallbackUrl).trim().replace(/\/+$/, '');
    return `${s.analysisSource}:${url}`;
}

function setModelListStatus(root, message) {
    const status = root?.querySelector('[data-role="model-list-status"]');
    if (status) status.textContent = message;
}

function renderDirectModelOptions(root = document.querySelector(`#${EXTENSION_ID}-settings`)) {
    const select = root?.querySelector('[data-setting="model-list"]');
    const button = root?.querySelector('[data-action="fetch-models"]');
    if (!select) return;

    const s = getSettings();
    const direct = s.analysisSource === 'direct' || s.analysisSource === 'openrouter';
    const models = directModelCache.get(directModelCacheKey(s)) || [];
    const selected = String(s.analysisModel || '').trim();
    select.replaceChildren();

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = models.length ? 'Choose a fetched model…' : 'Fetch models to populate this list';
    select.append(placeholder);

    for (const model of models) {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name && model.name !== model.id ? `${model.name} — ${model.id}` : model.id;
        select.append(option);
    }

    if (selected && !models.some(model => model.id === selected)) {
        const saved = document.createElement('option');
        saved.value = selected;
        saved.textContent = `${selected} (saved/manual)`;
        select.append(saved);
    }

    select.value = selected;
    if (select.value !== selected) select.value = '';
    select.disabled = !direct || models.length === 0;
    if (button) button.disabled = !direct;
    setModelListStatus(root, models.length ? `${models.length} models available.` : 'No model list fetched yet.');
}

async function fetchDirectModels(root = document.querySelector(`#${EXTENSION_ID}-settings`)) {
    const s = getSettings();
    const openRouter = s.analysisSource === 'openrouter';
    if (!openRouter && s.analysisSource !== 'direct') return;

    const url = String(s.analysisUrl || (openRouter ? 'https://openrouter.ai/api/v1' : '')).trim();
    const button = root?.querySelector('[data-action="fetch-models"]');
    const select = root?.querySelector('[data-setting="model-list"]');
    if (!url) {
        setModelListStatus(root, 'Enter an API URL before fetching models.');
        return;
    }
    try {
        new URL(url);
    } catch {
        setModelListStatus(root, 'Enter a valid API URL before fetching models.');
        return;
    }

    if (button) button.disabled = true;
    if (select) select.disabled = true;
    setModelListStatus(root, 'Fetching models…');
    try {
        const body = {
            chat_completion_source: openRouter ? 'openrouter' : 'custom',
            secret_id: s.analysisSecretId || undefined,
            ...(openRouter ? { api_url: url } : { custom_url: url }),
        };
        const response = await fetch('/api/backends/chat-completions/status', {
            method: 'POST',
            headers: currentContext().getRequestHeaders?.() || getRequestHeaders?.() || { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            cache: 'no-cache',
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.error) {
            const detail = String(payload?.message || payload?.error?.message || response.statusText || 'request failed');
            throw new Error(detail);
        }
        const models = normalizeModelListResponse(payload);
        if (!models.length) throw new Error('the endpoint returned no models');
        directModelCache.set(directModelCacheKey(s), models);
        renderDirectModelOptions(root);
        setModelListStatus(root, `${models.length} models loaded.`);
    } catch (error) {
        console.warn(`[${EXTENSION_ID}] Could not fetch planner models`, error);
        setModelListStatus(root, `Could not fetch models: ${error?.message || error}`);
    } finally {
        if (button) button.disabled = false;
        if (select) select.disabled = !(directModelCache.get(directModelCacheKey(s)) || []).length;
    }
}

function continuityContextState(context, allowStale = false) {
    const s = getSettings();
    if (!s.continuityIntegration) return { text: '', status: 'off' };
    const bridge = globalThis.continuityMemoryBridge;
    if ([1, 2].includes(Number(bridge?.version)) && typeof bridge.getContextSnapshot === 'function') {
        try {
            return readContinuityBridge(context, bridge, { allowStale });
        } catch (error) {
            console.warn(`[${EXTENSION_ID}] Continuity context bridge was unavailable`, error);
            return { text: '', status: 'unavailable' };
        }
    }
    const prompt = context.extensionPrompts?.continuity_memory_context?.value;
    return typeof prompt === 'string' && prompt
        ? { text: prompt, status: 'current' }
        : { text: '', status: 'unavailable' };
}

function optionalContinuityContext(context, allowStale = false) {
    return continuityContextState(context, allowStale);
}

async function optionalContinuityContextWhenReady(context, allowStale, signal) {
    const s = getSettings();
    const immediate = continuityContextState(context, allowStale);
    if (!s.continuityIntegration || immediate.text) return immediate;
    const ready = await waitForContinuityBridge(context, () => globalThis.continuityMemoryBridge, {
        allowStale,
        timeoutMs: 8000,
        intervalMs: 200,
        signal,
    });
    // Preserve compatibility with Continuity versions that expose only their
    // SillyTavern extension prompt rather than the bridge.
    const finalState = ready.text ? ready : continuityContextState(context, allowStale);
    return finalState;
}

function bootstrapContext(context, { broad = false } = {}) {
    const result = {};
    try {
        const fields = getCharacterCardFields?.() || context.getCharacterCardFields?.() || {};
        for (const key of ['description', 'personality', 'scenario', 'persona']) {
            if (fields[key]) result[key] = String(fields[key]);
        }
        // A card system field may contain real setting mechanics alongside RP
        // instructions. Pass it as untrusted reference material so the planner
        // can retain factual rules without adopting its behavioral directives.
        if (fields.system) result.cardSystemReference = String(fields.system);
    } catch { /* older hosts may not expose card fields */ }
    if (context.chatMetadata?.scenario) result.scenario = String(context.chatMetadata.scenario);
    if (broad && context.chatMetadata?.note_prompt) result.authorNote = String(context.chatMetadata.note_prompt);
    return result;
}

function guideSelectionOptions(state, context = currentContext()) {
    const chatId = String(context.getCurrentChatId?.() || '');
    const chat = generationRetrySource(messagesFromChat(context.chat || []), activeGenerationType === 'swipe' || activeGenerationType === 'regenerate');
    const latestUserAction = [...chat].reverse().find(message => message.is_user)?.mes || '';
    const selectedSituations = selectSituationalOpenings(state.situationBoard, { scene: state.scene, sceneProfile: state.sceneProfile, latestUserAction });
    const selectedCausalContext = { ...(state.causalContext || {}), optionalSituations: selectedSituations.slice(0, 1).map(item => ({ premise: item.premise, entry: item.entry })) };
    if (generationGuideSelection?.chatId === chatId) {
        return {
            guidanceUsable: generationGuideSelection.usable,
            guideCandidates: generationGuideSelection.candidates,
            guideIndex: generationGuideSelection.index,
            regeneration: generationGuideSelection.regeneration,
            variationCue: generationGuideSelection.variationCue,
            directorSample: generationGuideSelection.directorSample,
            canonConstraints: generationGuideSelection.canonConstraints,
            sceneProfile: generationGuideSelection.sceneProfile,
            causalContext: generationGuideSelection.causalContext,
            plotAnchor: generationGuideSelection.plotAnchor,
            cachedPayload: generationGuideSelection.payload,
            preparedUsable: generationGuideSelection.preparedUsable,
            preparedWorld: generationGuideSelection.preparedWorld,
            campaignPreparation: generationGuideSelection.campaignPreparation,
            latestUserAction,
        };
    }
    const directionReady = plannerInputsMatch(state, chat, context) && isDirectionCurrent(state, chat, chatId);
    return {
        guidanceUsable: directionReady && isGuidanceUsable(state, chat, chatId),
        preparedUsable: preparedReady(state, chat, context),
        preparedWorld: state.preparedWorld,
        campaignPreparation: state.campaignPreparation,
        guideCandidates: null,
        guideIndex: 0,
        regeneration: false,
        variationCue: 0,
        directorSample: sampleDirectorSignals(state.mode, state.plannerSeed),
        latestUserAction,
        causalContext: selectedCausalContext,
        plotAnchor: buildPlotAnchor(chat, { state, stateCurrent: directionReady, bootstrap: bootstrapContext(context) }),
    };
}

function generationInputs(context, state) {
    let card = plotCardInputs(context, null);
    if (!card) {
        try { card = getCharacterCardFields?.() || context.getCharacterCardFields?.() || {}; } catch { card = {}; }
    }
    const { world_info: _allBookLinks, world_info_overflow_alert: _notificationOnly, ...worldSettings } = getWorldInfoSettings();
    const worlds = plotWorldNames(context, world_info, selected_world_info);
    const worldData = worlds.map(name => worldInfoCache.get(name));
    return {
        card,
        variables: plotVariableInputs([card, context.chatMetadata?.note_prompt, worldData], context.chatMetadata?.variables, extension_settings.variables?.global),
        group: context.groupId ? context.groups?.find(group => String(group.id) === String(context.groupId))?.members : null,
        scenario: context.chatMetadata?.scenario,
        authorNote: context.chatMetadata?.note_prompt,
        worldSettings,
        // Only books available to this chat matter. Fingerprint actual content,
        // not editor notifications or links belonging to other characters.
        worlds: worlds.map((name, index) => [name, worldInfoCache.has(name) ? plotInputKey(name, [], worldData[index]) : 'not-loaded']),
        mode: getSettings().mode,
        pacing: state.pacing.mode,
        // Pending author requests matter; planner diagnostics and note-resolution
        // timestamps do not invalidate a packet during regeneration.
        notes: state.userNotes.map(note => ({ text: note.text, kind: note.kind })),
        ...(state.plannerContract === 15 ? { campaignInstructions: campaignAuthorInstructions(state) } : {}),
    };
}

function replacementPlanningDeferred(context = currentContext()) {
    return replacementPendingForMessages(context.chatMetadata?.[REPLACEMENT_PENDING_KEY],
        messagesFromChat(context.chat || []), String(context.getCurrentChatId?.() || ''), fingerprintMessages);
}

async function warmPlotWorldInputs(context = currentContext()) {
    // Page reload clears ST's in-memory lore cache. Read the selected books
    // before deciding a saved packet is incompatible; this is not an AI call.
    await Promise.all(plotWorldNames(context, world_info, selected_world_info).map(async name => {
        if (worldInfoCache.has(name)) return;
        try { await loadWorldInfo(name); }
        catch (error) { console.warn(`[${EXTENSION_ID}] Could not load plot input book ${name}`, error); }
    }));
}

function retryPlannerSourceMatches(context, { fingerprint, messageCount, allowOneAssistantAppend } = {}) {
    const pending = context.chatMetadata?.[REPLACEMENT_PENDING_KEY];
    return Boolean(allowOneAssistantAppend && replacementPlanningDeferred(context)
        && pending.messageCount === messageCount
        && isAnalysisSourceCurrent(fingerprint, messageCount, messagesFromChat(context.chat || []), { allowOneAssistantAppend: true }));
}

function retryPlannerActive(context = currentContext()) {
    return Boolean(analysisPromise && !analysisAbortController?.signal.aborted
        && activeAnalysisIntent?.chatId === String(context.getCurrentChatId?.() || '')
        && retryPlannerSourceMatches(context, { fingerprint: analysisRequestFingerprint,
            messageCount: activeAnalysisMessageCount, allowOneAssistantAppend: activeAnalysisIntent?.allowOneAssistantAppend }));
}

function plannerInputsMatch(state, messages, context, metadata = context.chatMetadata) {
    const chatId = String(context.getCurrentChatId?.() || '');
    const inputs = generationInputs(context, state);
    if (state.analysisModel?.plotInputsKey) return state.analysisModel.plotInputsKey === plotInputKey(chatId, [], inputs);
    const inputKey = plotInputKey(chatId, messages, inputs);
    const sourceKey = plotInputKey(chatId, messages);
    const sourceFingerprint = fingerprintMessages(messages);
    return !generationContextEntries(metadata?.[GENERATION_CONTEXT_KEY]).some(item =>
        (item.sourceKey === sourceKey || item.sourceFingerprint === sourceFingerprint) && item.inputKey !== inputKey);
}

function campaignFingerprint(value) {
    return sha256(JSON.stringify(value));
}

function campaignMode(context = currentContext()) {
    return loadState(context.chatMetadata).plannerContract === 15;
}

function readCampaignSnapshot() {
    const context = currentContext(), state = loadState(context.chatMetadata), s = getSettings();
    const chatId = String(context.getCurrentChatId?.() || '');
    const replacement = replacementPlanningDeferred(context);
    const messages = messagesFromChat(context.chat || []);
    const accepted = replacement ? messages.slice(0, context.chatMetadata[REPLACEMENT_PENDING_KEY].messageCount) : messages;
    const evidence = readEvidenceProviders(context, { continuityBridge: globalThis.continuityMemoryBridge,
        continuityEnabled: s.continuityIntegration !== false, replacement,
        enabled: context.chatMetadata?.taleFairyEvidence !== 'off' });
    const continuity = evidence.find(e => e.provider === 'continuity-memory') || { status: replacement ? 'replacement' : 'off' };
    const worlds = plotWorldNames(context, world_info, selected_world_info);
    let attempt = context.chatMetadata?.[CAMPAIGN_ATTEMPT_KEY];
    try {
        const shared = JSON.parse(plannerStorage()?.getItem(`${CAMPAIGN_ATTEMPT_KEY}:${chatId}`) || 'null');
        if (shared?.chatId === chatId && (!attempt || shared.at >= attempt.at)) attempt = shared;
    } catch { /* Metadata remains the reload fallback when shared storage is unavailable. */ }
    return { state: state.campaignPreparation || emptyCampaign(), messages: accepted, chatId, replacement,
        enabled: s.enabled, attempt,
        playerNames: [...new Set([context.name1, ...accepted.filter(m => m.is_user).map(m => m.name)]
            .filter(name => typeof name === 'string' && name.trim()))],
        referenceHash: plotInputKey(chatId, [], generationInputs(context, state)),
        requestSignature: campaignFingerprint({ contract: OWNED_SCHEMA, prompt: OWNED_SYSTEM, settings: Object.fromEntries(['analysisSource', 'analysisProvider', 'analysisProfileId',
            'analysisModel', 'analysisUrl', 'analysisSecretId', 'analysisReasoningMode', 'analysisTemperature', 'maxPromptTokens', 'continuityIntegration', 'summaryContextTokens']
            .map(key => [key, s[key]])) }),
        reference: { ...bootstrapContext(context, { broad: true }), authorInstructions: campaignAuthorInstructions(state),
            worldBooks: worlds.map(name => ({ name, data: worldInfoCache.get(name) })) },
        missingWorlds: worlds.filter(name => !worldInfoCache.has(name)),
        continuity, evidence,
        evidenceKey: evidenceRevisionKey(evidence),
        continuityTokens: s.summaryContextTokens ?? 4000,
        inputBudget: Number(s.maxPromptTokens) || 14000,
    };
}

function buildCampaignHostInput(snapshot) {
    if (snapshot.missingWorlds.length) throw Error('Selected world books are unavailable; no campaign request sent.');
    if (snapshot.state.revision && !validCampaignState(snapshot.state)) throw Error('Saved campaign is invalid; inspect or rebuild it before planning.');
    const historical = { ...buildStoryEvidence(snapshot.messages), opening: undefined };
    const messages = snapshot.messages.map((m, index) => ({ index, role: m.is_user ? 'user' : 'assistant', name: m.name || '', content: m.mes || '' }));
    const reviewedCount = !needsEventReframe(snapshot.state) && campaignUsable(snapshot.state, { ...snapshot, fingerprint: campaignFingerprint })
        ? snapshot.state.source.messageCount : 0;
    const verifiedRetiredIds = snapshot.state.archive.filter(a => a.retirement
        && campaignUsable({ source: a.source || snapshot.state.source }, { ...snapshot, fingerprint: campaignFingerprint })).map(a => a.development?.id);
    const verifiedProgress = Object.fromEntries(Object.entries(snapshot.state.realization || {}).filter(([, entry]) =>
        Object.values(entry.episodes).every(episode => campaignUsable({ source: episode.source }, { ...snapshot, fingerprint: campaignFingerprint }))));
    let failure;
    for (const count of [32, 24, 20, 16, 12, 8, 4, 2]) {
        const selected = campaignReviewWindow(messages, count, reviewedCount);
        try {
            return ownedInput({ reference: snapshot.reference, state: snapshot.state, playerNames: snapshot.playerNames, reviewedMessageCount: reviewedCount,
                messages: campaignEvidenceMessages(selected, { narrative: true }), historical, verifiedProgress, verifiedRetiredIds,
                continuity: snapshot.continuity, evidence: snapshot.evidence, continuityTokens: snapshot.continuityTokens }, snapshot.inputBudget);
        } catch (error) { if (!error.message.includes('exceeds')) throw error; failure = error; }
    }
    throw failure;
}

async function saveCampaignAttempt(attempt) {
    const context = currentContext();
    if (String(context.getCurrentChatId?.() || '') !== attempt.chatId) throw Error('Chat changed before campaign attempt could be recorded.');
    plannerStorage()?.setItem(`${CAMPAIGN_ATTEMPT_KEY}:${attempt.chatId}`, JSON.stringify(attempt));
    context.updateChatMetadata({ ...context.chatMetadata, [CAMPAIGN_ATTEMPT_KEY]: attempt });
    // Reserve the attempt durably before spending the provider request.
    if (typeof context.saveMetadata === 'function') await context.saveMetadata();
}

function campaignCompletion(response) {
    // The browser provider envelope can carry a complete-looking JSON string
    // even when generation was truncated; reject that signal, never repair it.
    const queue = [response], seen = new Set();
    for (let n = 0; queue.length && n < 16; n++) {
        const item = queue.shift();
        if (!item || typeof item !== 'object' || seen.has(item)) continue;
        seen.add(item);
        const reason = String(item.finish_reason || item.finishReason || item.stop_reason || '').toLowerCase();
        if (['length', 'max_tokens', 'max_output_tokens'].includes(reason)
            || item.status === 'incomplete' || item.incomplete_details) throw Error('Truncated campaign response.');
        for (const key of ['data', 'response', 'result', 'choices', 'candidates']) {
            if (Array.isArray(item[key])) queue.push(...item[key]); else if (item[key]) queue.push(item[key]);
        }
    }
    return { text: completionText(response), finishReason: 'stop' };
}

function analyzeCampaignNow({ manual = false } = {}) {
    const context = currentContext();
    const chatId = String(context.getCurrentChatId?.() || '');
    if (!chatId || !getSettings().enabled) return Promise.resolve(loadState(context.chatMetadata));
    const stopSequence = analysisStopSequence;
    const previous = campaignHostWork;
    if (previous?.chatId === chatId && previous.stopSequence === stopSequence) {
        // A manual click during preflight can promote a not-yet-started
        // automatic pass, but never duplicates a request already in progress.
        previous.manual ||= manual;
        return previous.promise;
    }
    const work = { chatId, stopSequence, manual, promise: null };
    work.promise = Promise.resolve(previous?.promise).catch(() => {}).then(() => {
        if (stopSequence !== analysisStopSequence || chatId !== String(currentContext().getCurrentChatId?.() || '')
            || !getSettings().enabled) return loadState(currentContext().chatMetadata);
        return runCampaignAnalysis(work);
    }).catch(error => {
        if (stopSequence === analysisStopSequence && chatId === String(currentContext().getCurrentChatId?.() || '')) {
            const busy = error?.name === 'PlannerBusyInAnotherTabError';
            renderAnalysisActivity(busy
                ? 'Planner running in another page · existing preparation unchanged'
                : `Campaign preparation failed · ${error.message}`, false);
        }
        return loadState(currentContext().chatMetadata);
    }).finally(() => {
        if (campaignHostWork === work) campaignHostWork = null;
    });
    // Publish before any async preflight or lock acquisition can re-enter.
    campaignHostWork = work;
    renderAnalysisActivity(previous ? 'Waiting for previous planner to finish' : 'Preparing planner context', true);
    return work.promise;
}

async function runCampaignAnalysis(work) {
    const { chatId, stopSequence } = work;
    let initial = currentContext();
    if (initial.chatMetadata?.[STATE_KEY]?.plannerContract !== 15) {
        // Persist migration before generation, including on a failed first pass.
        // Old notebook/notes remain saved but cannot enter the event injection.
        initial.updateChatMetadata(saveState(initial.chatMetadata, loadState(initial.chatMetadata)));
        scheduleVerificationPersistence(currentContext());
        await cancelDetachedPlannerJobs(chatId);
        initial = currentContext();
        if (stopSequence !== analysisStopSequence || chatId !== String(initial.getCurrentChatId?.() || '')) return loadState(initial.chatMetadata);
    }
    await warmPlotWorldInputs(initial);
    if (stopSequence !== analysisStopSequence || chatId !== String(currentContext().getCurrentChatId?.() || '')) return loadState(currentContext().chatMetadata);
    campaignSession ||= new CampaignSession({ read: readCampaignSnapshot, prepare: buildCampaignHostInput,
        runPass: ownedPass,
        fingerprint: campaignFingerprint, saveAttempt: saveCampaignAttempt, commit: commitCampaignPreparation,
        interval: () => Number(getSettings().fullReviewInterval) || 8,
        generate: (prompt, systemPrompt, schema, { signal }) => requestAnalysisOnce(prompt, signal, null, {
            singleShot: true, systemPrompt, schema, responseTokens: 6000, parseResponse: campaignCompletion,
            label: 'campaign preparation', cacheNamespace: `campaign-v15:${OWNED_SCHEMA.name}`,
        }),
    });
    const result = await withPlannerTabLock(chatId, () => {
        if (stopSequence !== analysisStopSequence || chatId !== String(currentContext().getCurrentChatId?.() || '')
            || !getSettings().enabled) return { accepted: false, skipped: 'cancelled-before-lock' };
        const result = campaignSession.request({ manual: work.manual });
        if (campaignSession.pending) renderAnalysisActivity('Preparing later developments · one request', true);
        return result;
    });
    if (stopSequence === analysisStopSequence && chatId === String(currentContext().getCurrentChatId?.() || '')) {
        if (result.accepted) renderAnalysisActivity(result.warnings?.length
            ? `Campaign preparation ready · ignored ${result.warnings.length} unsupported extra citation(s)`
            : 'Campaign preparation ready', false);
        else if (result.error) renderAnalysisActivity(`Previous preparation retained · ${result.error}`, false);
        else renderAnalysisActivity('No new planning pass needed', false);
    }
    return loadState(currentContext().chatMetadata);
}

async function startCampaignPlanning({ rebuild = false } = {}) {
    const chatId = String(currentContext().getCurrentChatId?.() || '');
    if (!chatId || !getSettings().enabled) return loadState(currentContext().chatMetadata);
    const previousWork = campaignHostWork?.promise || campaignSession?.pending || analysisPromise;
    interruptAnalysis('Rebuilding plot preparation.', 'Preparing plot events');
    const switchSequence = analysisStopSequence;
    await cancelDetachedPlannerJobs(chatId);
    if (previousWork) await previousWork.catch(() => {});
    const context = currentContext();
    if (switchSequence !== analysisStopSequence || String(context.getCurrentChatId?.() || '') !== chatId) return loadState(context.chatMetadata);
    const previous = loadState(context.chatMetadata);
    const preparation = rebuild ? { ...emptyCampaign(), archive: previous.campaignPreparation
        ? [{ preparation: previous.campaignPreparation, rebuild: true }] : [] } : previous.campaignPreparation;
    const next = { ...previous, plannerContract: 15, campaignPreparation: preparation,
        legacyPreparedWorld: previous.legacyPreparedWorld || previous.preparedWorld,
        canonBootstrapPending: false };
    context.updateChatMetadata(saveState(context.chatMetadata, next));
    if (typeof context.saveMetadata === 'function') await context.saveMetadata();
    if (switchSequence !== analysisStopSequence || String(currentContext().getCurrentChatId?.() || '') !== chatId) return loadState(currentContext().chatMetadata);
    generationGuideSelection = null;
    updatePrompt(next);
    renderBoard(next);
    return analyzeCampaignNow({ manual: true });
}

async function applyCampaignInstruction(note) {
    const text = typeof note === 'string' ? note : typeof note?.text === 'string'
        ? `${note.kind ? `[${note.kind}] ` : ''}${note.text}` : '';
    if (!text.trim() || !getSettings().enabled) return loadState(currentContext().chatMetadata);
    const chatId = String(currentContext().getCurrentChatId?.() || '');
    if (!chatId) return loadState(currentContext().chatMetadata);
    const pending = campaignHostWork?.promise || campaignSession?.pending;
    interruptAnalysis('An author instruction changed the planning source.', 'Saving author instruction');
    const sequence = analysisStopSequence;
    if (pending) await pending.catch(() => {});
    const context = currentContext();
    if (sequence !== analysisStopSequence || chatId !== String(context.getCurrentChatId?.() || '')) return loadState(context.chatMetadata);
    const state = loadState(context.chatMetadata);
    state.campaignInstructions.push({ text, at: Date.now() });
    state.noteNeedsClarification = false;
    context.updateChatMetadata(saveState(context.chatMetadata, state));
    if (typeof context.saveMetadata === 'function') await context.saveMetadata();
    if (sequence !== analysisStopSequence || chatId !== String(currentContext().getCurrentChatId?.() || '')) return loadState(currentContext().chatMetadata);
    generationGuideSelection = null;
    updatePrompt(state);
    renderBoard(state);
    // The original instruction is already usable by the writer. This single
    // review develops compatible preparation; no classifier or repair call.
    return analyzeCampaignNow({ manual: true });
}

function preparedReady(state, messages, context = currentContext(), forReplanning = false) {
    const chatId = String(context.getCurrentChatId?.() || '');
    if (state.plannerContract === 15) return validCampaignState(state.campaignPreparation)
        && campaignUsable(state.campaignPreparation, { chatId, messages, fingerprint: campaignFingerprint,
            referenceHash: plotInputKey(chatId, [], generationInputs(context, state)) });
    return preparedWorldUsable(state.preparedWorld, { chatId, messages, fingerprint: fingerprintMessages, forReplanning,
        inputsKey: plotInputKey(chatId, [], generationInputs(context, state)) });
}

function runningSourceHasOnlyAppends(context = currentContext()) {
    return Boolean(analysisPromise && !activeAnalysisIntent?.allowOneAssistantAppend
        && activeAnalysisIntent?.chatId === String(context.getCurrentChatId?.() || '')
        && unchangedSourcePrefix({ fingerprint: analysisRequestFingerprint, messageCount: activeAnalysisMessageCount },
            messagesFromChat(context.chat || []), fingerprintMessages));
}

function bindResolvedNoteInputProof(next, previous, context = currentContext()) {
    const chatId = String(context.getCurrentChatId?.() || '');
    // The submitted note was part of this planner call. Recording its resolved
    // form must not make that very result look stale; unrelated edits still do.
    if (next.analysisModel?.plotInputsKey === plotInputKey(chatId, [], generationInputs(context, previous))) {
        next.analysisModel = { ...next.analysisModel, plotInputsKey: plotInputKey(chatId, [], generationInputs(context, next)) };
    }
}

// Pure packet construction: saving a completed plan must not replace the
// selection already frozen for an in-flight story request.
function buildGenerationPacket(state, messages, context, type = 'normal', currentDirectionReady = false) {
    const chatId = String(context.getCurrentChatId?.() || '');
    const inputKey = plotInputKey(chatId, messages, generationInputs(context, state));
    const usable = currentDirectionReady && isGuidanceUsable(state, messages, chatId);
    const replacement = type === 'swipe' || type === 'regenerate';
    const latestUserAction = [...messages].reverse().find(message => message.is_user)?.mes || '';
    const situations = usable ? selectSituationalOpenings(state.situationBoard, {
        scene: state.scene, sceneProfile: state.sceneProfile, latestUserAction,
    }) : [];
    const selection = {
        chatId, inputKey, candidates: [], index: 0, usable, skipped: false,
        preparedUsable: preparedReady(state, messages, context),
        preparedWorld: state.preparedWorld,
        campaignPreparation: state.campaignPreparation,
        regeneration: replacement, replacement,
        variationCue: currentDirectionReady ? state.plannerSeed : 0,
        directorSample: sampleDirectorSignals(state.mode, currentDirectionReady ? state.plannerSeed : 0),
        canonConstraints: usable ? state.canonConstraints : [],
        sceneProfile: usable ? state.sceneProfile : null,
        causalContext: usable ? { ...state.causalContext, optionalSituations: situations.slice(0, 1).map(item => ({ premise: item.premise, entry: item.entry })) } : null,
        plotAnchor: buildPlotAnchor(messages, { state, stateCurrent: currentDirectionReady, bootstrap: bootstrapContext(context) }),
    };
    const payload = buildPromptPayload(state, { ...selection, guidanceUsable: usable, latestUserAction, generationType: type });
    return JSON.parse(JSON.stringify({ version: 1, anchorVersion: PLOT_ANCHOR_VERSION, chatId, inputKey,
        sourceFingerprint: fingerprintMessages(messages), sourceKey: plotInputKey(chatId, messages), payload, selection,
        // A compatible notebook does not make old scene facts current. Retry
        // rollback may rebind this snapshot, so retain only a factual fallback
        // when the packet was built from preparation alone.
        plannerState: state.plannerContract === 15 ? { ...state, lastRequestVerification: null }
            : currentDirectionReady ? { ...state, lastRequestVerification: null }
            : selection.preparedUsable ? { ...createSafetyFallbackState(defaultState(), {
                messages, chatId, fingerprint: fingerprintMessages(messages),
                turnCount: assistantTurnNumber(messages), reason: 'conditional preparation only',
            }), preparedWorld: state.preparedWorld, pacing: state.pacing } : null,
    }));
}

function archiveReadyPlannerContexts(metadata, states, context = currentContext()) {
    const messages = messagesFromChat(context.chat || []);
    const chatId = String(context.getCurrentChatId?.() || '');
    let cache = metadata?.[GENERATION_CONTEXT_KEY];
    const original = cache;
    for (const state of states) {
        if (state.plannerContract === 15) {
            const count = state.campaignPreparation?.source?.messageCount;
            if (!Number.isSafeInteger(count)) continue;
            const source = messages.slice(0, count);
            if (!preparedReady(state, source, context)) continue;
            const sources = [source];
            if (messages[count]?.is_user) sources.push(messages.slice(0, count + 1));
            for (const candidate of sources) {
                const key = plotInputKey(chatId, candidate, generationInputs(context, state));
                const existing = cachedGenerationContext(cache, key, chatId);
                if (existing?.selection.preparedUsable && !hasNewerPlannerState(state, existing)) continue;
                cache = rememberGenerationContext(cache, buildGenerationPacket(state, candidate, context));
            }
            continue;
        }
        if (!state.sourceMessageCount || state.plannerContract !== 14 && !hasPlannerConditions(state.causalContext)) continue;
        const source = messages.slice(0, state.sourceMessageCount);
        if (!(state.plannerContract === 14 ? isDirectionCurrent(state, source, chatId) && preparedReady(state, source, context)
            : isGuidanceUsable(state, source, chatId))) continue;
        const sources = [source];
        // Ahead plans also support exactly one new user contribution. Archive
        // that pre-reply input before the next completed plan can replace it.
        if (messages[source.length]?.is_user) sources.push(messages.slice(0, source.length + 1));
        for (const candidate of sources) {
            if (!plannerInputsMatch(state, candidate, context, { ...metadata, [GENERATION_CONTEXT_KEY]: cache })) continue;
            const key = plotInputKey(chatId, candidate, generationInputs(context, state));
            const existing = cachedGenerationContext(cache, key, chatId);
            if ((existing?.selection.preparedUsable || existing?.selection.usable && hasPlannerConditions(existing.selection.causalContext))
                && !hasNewerPlannerState(state, existing)) continue;
            cache = rememberGenerationContext(cache, buildGenerationPacket(state, candidate, context, 'normal', true));
        }
    }
    return cache === original ? metadata : { ...metadata, [GENERATION_CONTEXT_KEY]: cache };
}

function deferReplacementPlanning(context = currentContext(), sourceMessages = null, { preserveSelection = false } = {}) {
    if (!getSettings().enabled) return;
    const messages = sourceMessages || generationRetrySource(messagesFromChat(context.chat || []), true);
    const chatId = String(context.getCurrentChatId?.() || '');
    const current = loadState(context.chatMetadata);
    const inputKey = plotInputKey(chatId, messages, generationInputs(context, current));
    const previousPending = context.chatMetadata?.[REPLACEMENT_PENDING_KEY];
    const previousSelection = generationGuideSelection;
    let metadata = archiveReadyPlannerContexts(context.chatMetadata, [current], context);
    const archived = cachedGenerationContext(metadata?.[GENERATION_CONTEXT_KEY], inputKey, chatId);
    // Roll back planner memory as well as the visible injection. Otherwise a
    // later routine pass could inherit entities/ledger facts from deleted prose.
    const compatibleCampaign = current.plannerContract === 15 && preparedReady(current, messages, context);
    if (!compatibleCampaign && (!isDirectionCurrent(current, messages, chatId) || !plannerInputsMatch(current, messages, context, metadata))) {
        const restored = archived?.plannerState ? { ...archived.plannerState }
            : current.plannerContract === 15 ? { ...current } : createSafetyFallbackState(defaultState(), {
            messages, chatId, fingerprint: fingerprintMessages(messages), turnCount: assistantTurnNumber(messages),
            reason: 'replacement has no compatible saved planner state',
        });
        if (archived?.plannerState) {
            // The normalized cache key proves the same input despite harmless
            // whitespace. Rebind the restored memory to the current transcript.
            restored.lastAnalysisFingerprint = fingerprintMessages(messages);
            restored.sourceMessageCount = messages.length;
            restored.sourceChatId = chatId;
        }
        metadata = saveState(metadata, { ...restored,
            userNotes: current.userNotes, mode: current.mode, pacing: current.pacing, lastRequestVerification: current.lastRequestVerification,
        });
    }
    // ST replaces its metadata object; a second write from context.chatMetadata
    // would restore the OLD planner. Commit rollback and marker atomically.
    context.updateChatMetadata({ ...metadata, [REPLACEMENT_PENDING_KEY]: {
        ...(previousPending?.chatId === chatId && previousPending.sourceKey === plotInputKey(chatId, messages) ? previousPending : {}),
        chatId, fingerprint: fingerprintMessages(messages), sourceKey: plotInputKey(chatId, messages), messageCount: messages.length,
    } });
    const keepRepair = retryPlannerActive(currentContext())
        || (!analysisPromise && previousPending?.repairAttemptedKey === inputKey);
    if (keepRepair) {
        // A single missing-cache repair uses this exact pre-reply source. Fast
        // swipes must not cancel it, including a detached job after a reload.
        generationGuideSelection = null;
        clearTranscriptRefresh();
        clearQueuedAnalysis();
    } else {
        interruptAnalysis('A replacement reuses its pre-response context.', 'Retry source preserved · no per-retry planner calls');
        void cancelDetachedPlannerJobs(chatId);
    }
    if (preserveSelection && previousSelection?.chatId === chatId && previousSelection.inputKey === inputKey) generationGuideSelection = previousSelection;
    scheduleVerificationPersistence(context);
}

async function repairDeferredReplacementPlan() {
    let context = currentContext();
    if (!getSettings().enabled || !replacementPlanningDeferred(context)) return loadState(context.chatMetadata);
    // Campaign-only mode retains compatible preparation or runs without it.
    // A writer retry is never permission for a planner repair call.
    if (loadState(context.chatMetadata).plannerContract === 15) return loadState(context.chatMetadata);
    if (retryPlannerActive(context)) return analysisPromise;
    const messages = messagesFromChat(context.chat || []).slice(0, context.chatMetadata[REPLACEMENT_PENDING_KEY].messageCount);
    deferReplacementPlanning(context, messages, { preserveSelection: true });
    context = currentContext();
    const state = loadState(context.chatMetadata);
    const chatId = String(context.getCurrentChatId?.() || '');
    const inputKey = plotInputKey(chatId, messages, generationInputs(context, state));
    const packet = cachedGenerationContext(context.chatMetadata?.[GENERATION_CONTEXT_KEY], inputKey, chatId);
    const packetState = packet?.plannerState || state;
    const failedPlan = !hasPlannerConditions(packetState.causalContext) && /planner fallback/iu.test(packetState.lastReason);
    const legacyNotebook = packetState.plannerContract === 14 && packetState.preparedWorld?.writer === undefined;
    if (!failedPlan && !legacyNotebook && (packet?.selection.preparedUsable || packet?.selection.usable && hasPlannerConditions(packet.selection.causalContext))) return state;
    const pending = context.chatMetadata[REPLACEMENT_PENDING_KEY];
    if (pending.repairAttemptedKey === inputKey && pending.repairPolicyVersion === 6) {
        renderAnalysisActivity('Missing retry plan · automatic repair already attempted; Guide now can retry', false);
        return state;
    }
    // One bounded repair per pre-reply input, including a cached fallback.
    // Generation start/stop and chat load share this persisted attempt marker.
    // Policy 3 permits one retry with explicit status changes and nonblank
    // content updates. Persist before starting so reloads cannot form a loop.
    context.updateChatMetadata({ [REPLACEMENT_PENDING_KEY]: { ...pending, repairAttemptedKey: inputKey, repairPolicyVersion: 6 } });
    scheduleVerificationPersistence(context);
    renderAnalysisActivity('Repairing missing pre-reply plan once · generation will not wait', true);
    return analyzeNow({ force: true, messages, allowOneAssistantAppend: true });
}

function prepareGenerationGuide(state, type) {
    const context = currentContext();
    const chatId = String(context.getCurrentChatId?.() || '');
    const messages = messagesFromChat(context.chat || []);
    const replacement = type === 'swipe' || type === 'regenerate';
    const replacementMessages = generationRetrySource(messages, replacement);
    const inputs = generationInputs(context, state);
    const inputKey = plotInputKey(chatId, replacementMessages, inputs);
    const candidatePacket = cachedGenerationContext(context.chatMetadata?.[GENERATION_CONTEXT_KEY], inputKey, chatId);
    const savedPacket = state.plannerContract === 15 && candidatePacket?.plannerState?.plannerContract !== 15 ? null : candidatePacket;
    const legacyNotebook = savedPacket?.plannerState?.plannerContract === 14 && savedPacket.plannerState.preparedWorld?.writer === undefined;
    const incompatibleCampaign = savedPacket?.plannerState?.plannerContract === 15
        && !preparedReady(savedPacket.plannerState, replacementMessages, context);
    const archived = legacyNotebook || incompatibleCampaign
        ? { ...savedPacket, selection: { ...savedPacket.selection, preparedUsable: false } } : savedPacket;
    const currentDirectionReady = plannerInputsMatch(state, replacementMessages, context) && isDirectionCurrent(state, replacementMessages, chatId);
    const currentGuidanceUsable = currentDirectionReady && isGuidanceUsable(state, replacementMessages, chatId);
    const refreshPlan = (state.plannerContract === 15 ? preparedReady(state, replacementMessages, context)
        : currentGuidanceUsable && hasPlannerConditions(state.causalContext)) && hasNewerPlannerState(state, archived);
    const reuseArchived = () => {
        // Reformat the saved selection with current policy and source excerpts;
        // never substitute post-response planner facts into a retry.
        const plotAnchor = buildPlotAnchor(replacementMessages, { state: archived.plannerState || {},
            stateCurrent: Boolean(archived.plannerState), bootstrap: bootstrapContext(context) });
        const payload = archived.plannerState ? buildPromptPayload(archived.plannerState, {
            ...archived.selection, plotAnchor, guidanceUsable: archived.selection.usable,
        }) : refreshGameMasterContract(archived.payload);
        generationGuideSelection = { ...archived.selection, plotAnchor, chatId, inputKey, replacement, regeneration: replacement, payload, reused: true };
        renderInjectionActivity(retryPlannerActive(context) ? 'Cached context included · planner updating in background'
            : archived.selection.preparedUsable ? 'Cached conditional preparation ready'
            : archived.selection.usable && hasPlannerConditions(archived.selection.causalContext)
                ? 'Cached plot context ready' : 'Cached scene excerpts included · no current planner context');
    };
    if (!refreshPlan && (archived?.selection.preparedUsable || archived?.selection.usable && hasPlannerConditions(archived.selection.causalContext))) {
        reuseArchived();
        return;
    }
    // Legacy request archives cannot prove card/lore inputs. Reconstruct a
    // local anchor rather than reusing unverified or post-response facts.
    // New plans record the actual input dependencies. An older packet made
    // before a book loaded must not veto a later plan that used that book.
    // Legacy plans still need the conservative history check.
    const upgradeFallback = archived && !archived.selection.preparedUsable && !hasPlannerConditions(archived.selection.causalContext)
        && (preparedReady(state, replacementMessages, context) || currentGuidanceUsable && hasPlannerConditions(state.causalContext));
    // A newer completed plan for this same pre-reply source can refresh the
    // next request. The selection already held by an in-flight request stays frozen.
    // A rules/excerpts-only packet may gain an already-ready, source-aligned
    // plan without making any call.
    // Refresh old fallback formatting locally too, so reloads do not preserve
    // the former chopped-sentence anchor forever.
    if (archived && !refreshPlan && !upgradeFallback && archived.anchorVersion === PLOT_ANCHOR_VERSION) {
        reuseArchived();
        return;
    }
    const cache = buildGenerationPacket(state, replacementMessages, context, type, currentDirectionReady);
    generationGuideSelection = { ...cache.selection, payload: cache.payload };
    context.updateChatMetadata({ ...context.chatMetadata, [GENERATION_CONTEXT_KEY]: rememberGenerationContext(context.chatMetadata?.[GENERATION_CONTEXT_KEY], cache) });
    scheduleVerificationPersistence(context);
    if (archived) renderInjectionActivity(currentGuidanceUsable
        ? 'Ready planner context refreshed for this request · no new planner calls'
        : 'Cached scene excerpts refreshed locally · no new planner calls');
}

function assistantTurnNumber(messages = []) {
    return messages.reduce((count, message) => count + (message?.is_user ? 0 : 1), 0);
}

function clearAutomaticReplyRepair() {
    if (replyRepairTimer) clearTimeout(replyRepairTimer);
    replyRepairTimer = null;
}

function scheduleAutomaticReplyRepair({ chatId = '', responseKey = '', reason = '' } = {}) {
    clearAutomaticReplyRepair();
    if (!chatId || !responseKey || replyRepairInFlight) return;
    replyRepairTimer = setTimeout(async () => {
        replyRepairTimer = null;
        if (replyRepairInFlight) return;

        const context = currentContext();
        const activeChatId = String(context.getCurrentChatId?.() || '');
        if (activeChatId !== String(chatId)) return;
        const messages = messagesFromChat(context.chat || []);
        const activeResponseKey = `${activeChatId}:${assistantTurnNumber(messages)}`;
        const verdict = classifyAssistantReply(messages);
        const state = loadState(context.chatMetadata);
        if (activeResponseKey !== responseKey
            || !verdict.unusable
            || state.replyRepair.attemptedResponseKey !== responseKey
            || !getSettings().enabled) return;

        // Make the one-shot marker durable before asking the host to mutate the
        // latest assistant turn. The in-memory metadata is authoritative, but
        // saving here also prevents a reload from losing the loop guard.
        try {
            await context.saveMetadata?.();
        } catch (error) {
            console.warn(`[${EXTENSION_ID}] Could not persist automatic reply repair marker`, error);
        }

        const currentContextAfterSave = currentContext();
        const currentChatAfterSave = String(currentContextAfterSave.getCurrentChatId?.() || '');
        const currentMessagesAfterSave = messagesFromChat(currentContextAfterSave.chat || []);
        const currentKeyAfterSave = `${currentChatAfterSave}:${assistantTurnNumber(currentMessagesAfterSave)}`;
        if (currentChatAfterSave !== String(chatId)
            || currentKeyAfterSave !== responseKey
            || !classifyAssistantReply(currentMessagesAfterSave).unusable
            || !getSettings().enabled) return;
        if (typeof Generate !== 'function') {
            console.warn(`[${EXTENSION_ID}] Automatic reply repair is unavailable because Generate() is not exposed by SillyTavern.`);
            return;
        }

        replyRepairInFlight = true;
        recordRuntimeStage('reply-repair-started', { responseKey, reason });
        try {
            await Generate('regenerate');
            recordRuntimeStage('reply-repair-finished', { responseKey, reason });
        } catch (error) {
            console.warn(`[${EXTENSION_ID}] Automatic reply repair failed; keeping the original response`, error);
            recordRuntimeStage('reply-repair-failed', { responseKey, reason, error: String(error?.message || error || '') });
        } finally {
            replyRepairInFlight = false;
        }
    }, 0);
}

function prepareAuthorContract(state, type = '') {
    // Kept as a compatibility seam for hosts/tests that call this lifecycle.
    // v48 issues no separate author contract and performs no AI call.
    return state;
}

function updatePrompt(state) {
    const context = currentContext();
    const s = getSettings();
    const selection = guideSelectionOptions(state, context);
    const payload = buildPromptPayload(state, { enabled: s.enabled, generationType: activeGenerationType, ...selection });
    const placement = resolveInjectionPlacement(s, extension_prompt_types, extension_prompt_roles);
    const managerApplied = context.mainApi === 'openai' && configurePromptManagerInjection(promptManager, s, payload);
    if (!managerApplied) clearPromptManagerInjection(promptManager);
    setExtensionPrompt(
        PROMPT_KEY,
        managerApplied ? '' : payload,
        managerApplied ? extension_prompt_types.NONE : placement.position,
        managerApplied ? 0 : placement.depth,
        Boolean(s.includeWorldInfo),
        placement.role,
    );
}

function currentGuidancePayload(generationType = activeGenerationType) {
    const context = currentContext();
    const state = loadState(context.chatMetadata);
    return buildPromptPayload(state, { enabled: getSettings().enabled, generationType, ...guideSelectionOptions(state, context) });
}

function reconcileStateWithContinuity(state, continuityState) {
    if (!Array.isArray(continuityState?.planningEvidence)) return { state, changed: false };
    const reconciled = reconcileContinuityThreads(state.continuityThreads, continuityState.planningEvidence);
    if (!reconciled.changed) return { state, changed: false };
    return { state: { ...state, continuityThreads: reconciled.threads }, changed: true };
}

function requestInjectionOptions() {
    const s = getSettings();
    return {
        role: s.injectionRole,
        depth: s.injectionPosition === 'at-depth' ? s.injectionDepth : 0,
        inlineLatestUser: s.injectionPosition === 'at-depth' && s.injectionRole === 'user' && s.injectionDepth === 1,
    };
}

function containsPlannerMarker(value) {
    return requestContainsMarker(value, INTERNAL_PLANNER_MARKER);
}

function verificationFingerprint(value) {
    const source = String(value || '');
    let hash = 2166136261;
    for (let index = 0; index < source.length; index++) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `tf-${source.length}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function scheduleVerificationPersistence(context) {
    if (typeof context.saveMetadata !== 'function') return;
    setTimeout(() => {
        void Promise.resolve(context.saveMetadata()).catch(error => {
            console.warn(`[${EXTENSION_ID}] Could not persist injection proof immediately; the next chat save will retry it.`, error);
        });
    }, 0);
}

function cacheProviderBoundVerification(verification) {
    if (!verification?.chatId || (verification?.injectionDecision !== 'skip' && !verification?.guidanceBlock)) return;
    const s = getSettings();
    s.lastProviderBoundVerification = verification;
    saveSettingsDebounced();
}

function cachedProviderBoundVerification(chatId) {
    const verification = getSettings().lastProviderBoundVerification;
    return verification?.runtimeVersion === RUNTIME_VERSION
        && verification?.chatId === String(chatId || '')
        && (verification?.injectionDecision === 'skip' || verification?.guidanceBlock) ? verification : null;
}

function newestProviderBoundVerification(chatId, ...candidates) {
    return candidates
        .filter(item => item?.runtimeVersion === RUNTIME_VERSION && item?.chatId === String(chatId || '') && (item?.injectionDecision === 'skip' || item?.guidanceBlock))
        .sort((left, right) => Number(right.requestedAt || 0) - Number(left.requestedAt || 0))[0] || null;
}

function rememberVerifiedRequest(payload, { provider = '', model = '' } = {}) {
    const guidanceBlock = extractTaleFairyContext(payload);
    if (!guidanceBlock) return;
    const context = currentContext();
    const messages = messagesFromChat(context.chat || []);
    const s = getSettings();
    const state = loadState(context.chatMetadata);
    const replacementGeneration = generationGuideSelection?.replacement === true;
    const sourceMessages = generationRetrySource(messages, replacementGeneration);
    const verification = {
        status: 'included',
        injectionDecision: 'inject',
        runtimeVersion: RUNTIME_VERSION,
        verificationId: verificationFingerprint(guidanceBlock),
        guidanceBlock,
        requestedAt: Date.now(),
        confirmedAt: 0,
        sourceMessageCount: messages.length,
        sourceFingerprint: fingerprintMessages(sourceMessages),
        responseMessageCount: 0,
        chatId: String(context.getCurrentChatId?.() || ''),
        provider: String(provider || ''),
        model: String(model || ''),
        position: s.injectionPosition,
        role: s.injectionRole,
        depth: s.injectionPosition === 'at-depth' ? s.injectionDepth : 0,
        guideCandidates: [],
        canonConstraints: generationGuideSelection?.canonConstraints || [],
        selectedGuideIndex: generationGuideSelection?.index || 0,
        replacementGeneration,
        reusedContext: generationGuideSelection?.reused === true,
        // Archive only facts actually eligible for this request, never stale
        // metadata that happened to coexist with the context framing.
        ...guidanceSnapshot(state, guideSelectionOptions(state, context)),
        directorSample: generationGuideSelection?.directorSample || sampleDirectorSignals(state.mode, state.plannerSeed),
        directorSeed: generationGuideSelection?.variationCue ?? state.plannerSeed,
        conductorDevelopmentId: '', conductorContract: null,
    };
    pendingRequestVerification = verification;
    state.lastRequestVerification = verification;
    context.updateChatMetadata(saveState(context.chatMetadata, state));
    cacheProviderBoundVerification(verification);
    renderBoard(state);
    // Do not make the provider request wait on SillyTavern's chat-save lock.
    // The in-memory metadata is already authoritative and will also be written
    // by the normal response save; this timer makes the proof durable sooner.
    scheduleVerificationPersistence(context);
}

function rememberSkippedRequest({ provider = '', model = '' } = {}) {
    const context = currentContext();
    const messages = messagesFromChat(context.chat || []);
    const state = loadState(context.chatMetadata);
    const replacementGeneration = generationGuideSelection?.replacement === true;
    const sourceMessages = generationRetrySource(messages, replacementGeneration);
    const verification = {
        status: 'included', injectionDecision: 'skip', runtimeVersion: RUNTIME_VERSION,
        verificationId: verificationFingerprint(`skip:${fingerprintMessages(messages)}`), guidanceBlock: '', requestedAt: Date.now(), confirmedAt: 0,
        sourceMessageCount: messages.length, sourceFingerprint: fingerprintMessages(sourceMessages), responseMessageCount: 0, chatId: String(context.getCurrentChatId?.() || ''),
        provider: String(provider || ''), model: String(model || ''), position: '', role: 'user', depth: 0,
        guideCandidates: [], canonConstraints: state.canonConstraints, selectedGuideIndex: 0,
        replacementGeneration,
        sceneProfile: generationGuideSelection?.sceneProfile || state.sceneProfile,
        causalContext: generationGuideSelection?.causalContext || state.causalContext,
        directorSample: generationGuideSelection?.directorSample || sampleDirectorSignals(state.mode, state.plannerSeed),
        directorSeed: generationGuideSelection?.variationCue ?? state.plannerSeed,
        conductorDevelopmentId: '', conductorContract: null,
    };
    pendingRequestVerification = verification;
    state.lastRequestVerification = verification;
    context.updateChatMetadata(saveState(context.chatMetadata, state));
    cacheProviderBoundVerification(verification);
    renderBoard(state);
    scheduleVerificationPersistence(context);
}

function reportNonBlockingInjectionFailure(message, error) {
    console.warn(`[${EXTENSION_ID}] ${message} Generation will continue without Tale Fairy blocking it.`, error);
    try { renderInjectionActivity(`${message} · generation continued`); }
    catch { /* Verification UI must never affect generation. */ }
}

function ensureChatCompletionRequestGuidance(eventData) {
    try {
        if (eventData?.dryRun || containsPlannerMarker(eventData?.chat) || !Array.isArray(eventData?.chat)) return;
        const payload = currentGuidancePayload(eventData?.type ?? activeGenerationType);
        const hasGuidance = payload.includes('<tale-fairy-context>');
        const inserted = ensureGuidanceInChat(eventData.chat, payload, requestInjectionOptions());
        if (!hasGuidance) return;
        if (inserted) renderInjectionActivity('Context added to draft request');
        if (!chatHasCurrentGuidance(eventData.chat, payload)) throw new Error('Current guidance was absent after chat insertion.');
    } catch (error) {
        reportNonBlockingInjectionFailure('Tale Fairy could not place guidance in the chat request', error);
    }
}

function ensureTextCompletionRequestGuidance(eventData) {
    try {
        if (eventData?.dryRun || containsPlannerMarker(eventData?.prompt) || typeof eventData?.prompt !== 'string') return;
        const payload = currentGuidancePayload(eventData?.type ?? activeGenerationType);
        const hasGuidance = payload.includes('<tale-fairy-context>');
        eventData.prompt = ensureGuidanceInText(eventData.prompt, payload);
        if (!hasGuidance) return;
        if (!textHasCurrentGuidance(eventData.prompt, payload)) throw new Error('Current guidance was absent after text insertion.');
        rememberVerifiedRequest(extractTaleFairyContext(eventData.prompt), { provider: currentContext().mainApi });
        recordRuntimeStage('final-text-payload');
        renderInjectionActivity('Context verified in outgoing text request');
    } catch (error) {
        reportNonBlockingInjectionFailure('Tale Fairy could not verify the final text payload', error);
    }
}

function ensureProviderChatRequestGuidance(generateData) {
    try {
        if (containsPlannerMarker(generateData) || !Array.isArray(generateData?.messages)) return;
        const payload = currentGuidancePayload(generateData?.type ?? activeGenerationType);
        const hasGuidance = payload.includes('<tale-fairy-context>');
        ensureGuidanceInChat(generateData.messages, payload, requestInjectionOptions());
        if (!hasGuidance) return;
        if (!chatHasCurrentGuidance(generateData.messages, payload)) throw new Error('Current guidance was absent after provider insertion.');
        rememberVerifiedRequest(extractTaleFairyContext(generateData), {
            provider: generateData.chat_completion_source,
            model: generateData.model,
        });
        recordRuntimeStage('final-provider-payload', { generationType: String(generateData.type || '') });
        renderInjectionActivity('Context verified in outgoing request');
    } catch (error) {
        reportNonBlockingInjectionFailure('Tale Fairy could not verify the final provider payload', error);
    }
}

function confirmReturnedReplyUsedGuidance() {
    const context = currentContext();
    const savedState = loadState(context.chatMetadata);
    const chatId = String(context.getCurrentChatId?.() || '');
    const pending = newestProviderBoundVerification(
        chatId,
        pendingRequestVerification,
        savedState.lastRequestVerification?.status === 'included' ? savedState.lastRequestVerification : null,
        cachedProviderBoundVerification(chatId)?.status === 'included' ? cachedProviderBoundVerification(chatId) : null,
    );
    if (!pending) return false;
    const messages = messagesFromChat(context.chat || []);
    if (!returnedReplyMatchesVerification(pending, messages, chatId)) return false;

    const state = savedState;
    state.lastRequestVerification = {
        ...pending,
        status: 'confirmed',
        confirmedAt: Date.now(),
        responseMessageCount: messages.length,
    };
    context.updateChatMetadata(saveState(context.chatMetadata, state));
    cacheProviderBoundVerification(state.lastRequestVerification);
    pendingRequestVerification = null;
    // Keep host reply completion synchronous. Waiting for a disk save here
    // delays scheduling and lets an older reply clear a newer swipe's packet.
    scheduleVerificationPersistence(context);
    renderBoard(state);
    renderInjectionActivity(pending.injectionDecision === 'skip'
        ? 'No Tale Fairy context was used for the returned reply'
        : pending.reusedContext
            ? 'Reused plot context confirmed · no new planner calls'
        : pending.guidanceBlock?.includes('<plot-anchor>')
            ? 'Plot-specific context confirmed in the story request'
        : pending.preparedContextIncluded
            ? 'Conditional preparation confirmed in returned reply'
        : pending.dynamicContextIncluded === false
            ? 'Context packet confirmed in returned reply; no world facts were included'
            : 'Causal context confirmed in returned reply');
    return true;
}

function commitCampaignPreparation(preparation, { stateFingerprint, evidenceKey } = {}) {
    const context = currentContext();
    const previous = loadState(context.chatMetadata);
    const messages = messagesFromChat(context.chat || []);
    const chatId = String(context.getCurrentChatId?.() || '');
    if (!getSettings().enabled || !validCampaignState(preparation)
        || preparation.revision !== (previous.campaignPreparation?.revision || 0) + 1
        || campaignFingerprint(previous.campaignPreparation || emptyCampaign()) !== stateFingerprint
        || !campaignUsable(preparation, { chatId, messages, fingerprint: campaignFingerprint,
            referenceHash: plotInputKey(chatId, [], generationInputs(context, previous)) })) return false;
    if (evidenceKey && messages.length === preparation.source.messageCount
        && readCampaignSnapshot().evidenceKey !== evidenceKey) return false;
    // Install only preparation. Accepted appends, user notes, pacing and request
    // verification belong to the current host, never the planner's old snapshot.
    const next = { ...previous, plannerContract: 15, campaignPreparation: preparation,
        legacyPreparedWorld: previous.legacyPreparedWorld || previous.preparedWorld,
        sourceChatId: chatId, sourceMessageCount: preparation.source.messageCount,
        lastAnalysisFingerprint: fingerprintMessages(messages.slice(0, preparation.source.messageCount)),
        lastAnalyzedAt: Date.now(), lastReason: 'Campaign preparation updated in one pass.' };
    const metadata = archiveReadyPlannerContexts(context.chatMetadata, [previous, next], context);
    context.updateChatMetadata(saveState(metadata, next));
    // Disk/UI work follows the synchronous compare-and-swap. It cannot change
    // whether the authoritative in-memory metadata was installed successfully.
    try { scheduleVerificationPersistence(context); updatePrompt(next); renderBoard(next); }
    catch (error) { console.warn(`[${EXTENSION_ID}] Campaign saved; display refresh failed.`, error); }
    return true;
}

async function persist(state, guard = {}) {
    const context = currentContext();
    const chat = messagesFromChat(context.chat || []);
    const chatId = String(context.getCurrentChatId?.() || '');
    const previous = loadState(context.chatMetadata);
    const inputsMatch = !guard.inputsKey || guard.inputsKey === plotInputKey(chatId, [], generationInputs(context, previous));
    const sourceCurrent = !guard.fingerprint || isAnalysisSourceCurrent(guard.fingerprint, guard.messageCount, chat, {
        allowOneUserAppend: guard.allowOneUserAppend, allowOneAssistantAppend: guard.allowOneAssistantAppend,
    });
    const appended = !guard.allowOneAssistantAppend && inputsMatch && unchangedSourcePrefix(guard, chat, fingerprintMessages);
    if ((guard.chatId && chatId !== guard.chatId)
        || !inputsMatch || (!sourceCurrent && !appended)
        || chat.length === 0) {
        throw new DOMException('The chat changed before Tale Fairy could save its analysis.', 'AbortError');
    }
    // Detached completion from an older same-source job must not supersede a
    // newer result just because both inspected the same number of messages.
    if (guard.startedAt && previous.preparedWorld?.source?.startedAt > guard.startedAt) return previous;
    if (!sourceCurrent) {
        // A delayed plan may refresh conditional preparation, never roll back
        // factual scene state, audits, scheduling or newer memory corrections.
        const incoming = state.preparedWorld;
        const newer = previous.preparedWorld?.source?.messageCount > guard.messageCount;
        state = !newer && incoming?.source?.fingerprint === guard.fingerprint
            ? { ...previous, preparedWorld: incoming, userNotes: state.userNotes,
                plannerContract: state.plannerContract === 14 ? 14 : previous.plannerContract,
                legacyPreparedWorld: previous.legacyPreparedWorld || state.legacyPreparedWorld }
            : previous;
    }
    if (state.preparedWorld?.compactions?.length) {
        const compacted = await finalizeNotebookCompactions(state.preparedWorld,
            payload => writeNotebookArchive(payload, { headers: getRequestHeaders(), hashFn: sha256 }));
        // Archive I/O can outlive this chat or a newer planner. Recheck every
        // source guard before replacing any active records in metadata.
        return persist({ ...state, preparedWorld: compacted }, guard);
    }
    const metadata = archiveReadyPlannerContexts(context.chatMetadata, [loadState(context.chatMetadata), state], context);
    context.updateChatMetadata(saveState(metadata, state));
    updatePrompt(state);
    if (typeof context.saveMetadata === 'function') await context.saveMetadata();
    return state;
}

function analysisModelOptions() {
    const s = getSettings();
    if (s.analysisSource === 'profile') {
        if (!s.analysisProfileId) throw new Error('Tale Fairy connection profile is not selected.');
        return { profileId: s.analysisProfileId };
    }
    if (s.analysisSource === 'openrouter' || s.analysisSource === 'direct') {
        const provider = s.analysisSource === 'openrouter' ? 'openrouter' : 'custom';
        const url = String(s.analysisUrl || (provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : '')).trim();
        const model = String(s.analysisModel || '').trim();
        if (!url) throw new Error('Tale Fairy direct planner API URL is not configured.');
        if (!model) throw new Error('Tale Fairy direct planner model is not configured.');
        return { direct: true, provider, model, url, secretId: s.analysisSecretId };
    }
    return { active: true };
}

function plannerReasoningMode(profile = null) {
    return resolveReasoningMode(
        getSettings().analysisReasoningMode,
        profile,
        openai_setting_names,
        openai_settings,
        oai_settings?.reasoning_effort,
    );
}

function analysisErrorMessage(error) {
    const messages = [];
    let current = error;
    for (let depth = 0; current && depth < 4; depth++) {
        const message = String(current?.message || current).replace(/\s+/g, ' ').trim();
        if (message && !messages.includes(message)) messages.push(message);
        current = current?.cause;
    }
    return (messages.join(' → ') || 'Unknown planner failure').slice(0, 220);
}

function elapsedLabel(milliseconds) {
    const seconds = Math.max(0, Math.floor(Number(milliseconds) / 1000) || 0);
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return minutes ? `${minutes}m ${String(remainder).padStart(2, '0')}s` : `${seconds}s`;
}

function clearAnalysisPhase() {
    if (analysisPhaseTimer) clearInterval(analysisPhaseTimer);
    analysisPhaseTimer = null;
}

function renderInjectionActivity(message = injectionStatus) {
    injectionStatus = message;
    const status = document.querySelector(`#${EXTENSION_ID}-settings [data-role="injection-status"]`);
    if (status) status.textContent = message;
    // Never touch the planner timer or its Stop/Guide/Rebuild controls here.
}

function renderAnalysisActivity(message, running = false) {
    if (!running) clearAnalysisPhase();
    const root = document.querySelector(`#${EXTENSION_ID}-settings`);
    if (!root) return;
    const status = root.querySelector('[data-role="analysis-status"]');
    if (status) status.textContent = message;
    root.querySelector('[data-action="stop"]')?.toggleAttribute('disabled', !running);
    root.querySelector('[data-action="guide"]')?.toggleAttribute('disabled', running);
    root.querySelector('[data-action="rebuild"]')?.toggleAttribute('disabled', running);
}

function showAnalysisPhase(label, runId, startedAt) {
    clearAnalysisPhase();
    const update = () => {
        if (runId !== analysisRunId) {
            clearAnalysisPhase();
            return;
        }
        renderAnalysisActivity(`${label} · ${elapsedLabel(Date.now() - startedAt)}`, true);
    };
    update();
    analysisPhaseTimer = setInterval(update, 1000);
}

class PlannerBusyInAnotherTabError extends Error {
    constructor() {
        super('Planner is already active for this chat in another SillyTavern page.');
        this.name = 'PlannerBusyInAnotherTabError';
    }
}

async function withPlannerTabLock(chatId, task) {
    if (!chatId || typeof globalThis.navigator?.locks?.request !== 'function') return task();
    return globalThis.navigator.locks.request(`${EXTENSION_ID}:planner:${chatId}`, { mode: 'exclusive', ifAvailable: true }, lock => {
        if (!lock) throw new PlannerBusyInAnotherTabError();
        return task();
    });
}

function cancelRunningAnalysis(reason, status) {
    campaignSession?.stop(reason);
    clearQueuedAnalysis();
    if (!analysisAbortController) return false;
    analysisRunId++;
    analysisAbortController.abort(new DOMException(reason, 'AbortError'));
    analysisAbortController = null;
    // Keep the aborted promise reachable until its request has actually
    // settled and released this page's Web Lock. A replacement analysis can
    // then await the real handoff instead of mistaking our own lock for one
    // held by another page.
    analysisRequestFingerprint = '';
    analysisRequestInputKey = '';
    if (status) renderAnalysisActivity(status, false);
    return true;
}

function clearQueuedAnalysis() {
    queuedAnalysisIntent = null;
}

function clearTranscriptRefresh() {
    if (transcriptRefreshTimer) clearTimeout(transcriptRefreshTimer);
    transcriptRefreshTimer = null;
}

function verificationMatchesTranscript(verification, messages, chatId) {
    if (!verification) return false;
    if (verification.sourceFingerprint) {
        return fingerprintMessages(messages) === verification.sourceFingerprint;
    }
    return isReplacementVerificationCurrent(verification, messages, chatId);
}

function invalidateChangedTranscriptVerification(context, messages) {
    const chatId = String(context.getCurrentChatId?.() || '');
    const state = loadState(context.chatMetadata);
    const verification = state.lastRequestVerification;
    const verificationStillMatches = verificationMatchesTranscript(verification, messages, chatId);
    if (verificationStillMatches && (!pendingRequestVerification || verificationMatchesTranscript(pendingRequestVerification, messages, chatId))) return state;

    pendingRequestVerification = null;
    if (state.lastRequestVerification) {
        state.lastRequestVerification = null;
        context.updateChatMetadata(saveState(context.chatMetadata, state));
    }
    const cached = getSettings().lastProviderBoundVerification;
    if (cached?.chatId === chatId) {
        delete getSettings().lastProviderBoundVerification;
        saveSettingsDebounced();
    }
    return state;
}

function scheduleTranscriptRefresh(reason, status = 'Refreshing…') {
    const context = currentContext();
    if (campaignMode(context)) {
        generationGuideSelection = null;
        updatePrompt(loadState(context.chatMetadata));
        void analyzeCampaignNow();
        return;
    }
    if (replacementPlanningDeferred(context)) return;
    const messages = messagesFromChat(context.chat || []);
    // Hosts can report the same transcript repeatedly during finalization.
    // Do not abort a useful planner (or discard its queued successor) for a
    // notification that has not changed its source.
    if (activeAnalysisIntent?.chatId === String(context.getCurrentChatId?.() || '')
        && analysisAbortController && !analysisAbortController.signal.aborted
        && isAnalysisSourceCurrent(analysisRequestFingerprint, activeAnalysisMessageCount, messages, { allowOneUserAppend: true })) return;
    if (runningSourceHasOnlyAppends(context)) {
        generationGuideSelection = null;
        void queueLatestAnalysis({ chatId: String(context.getCurrentChatId?.() || '') });
        return;
    }
    const hadRunningAnalysis = Boolean(analysisPromise);
    const chatId = String(context.getCurrentChatId?.() || '');
    generationRevision++;
    cancelRunningAnalysis(reason, status);
    if (hadRunningAnalysis) void cancelDetachedPlannerJobs(chatId);
    generationGuideSelection = null;
    const state = invalidateChangedTranscriptVerification(context, messages);
    updatePrompt(state);
    renderBoard(state);
    const archiveStillMatches = verificationMatchesTranscript(state.lastRequestVerification, messages, chatId);
    const stateStillMatches = isStateAligned(state, messages, chatId);
    if (archiveStillMatches || stateStillMatches) return;
    clearTranscriptRefresh();
    transcriptRefreshTimer = setTimeout(() => {
        transcriptRefreshTimer = null;
        const latestContext = currentContext();
        const chatId = String(latestContext.getCurrentChatId?.() || '');
        const latestMessages = messagesFromChat(latestContext.chat || []);
        if (!getSettings().enabled || !chatId || !latestMessages.length) return;
        renderAnalysisActivity('Checking the changed transcript…', true);
        void queueLatestAnalysis({ chatId });
    }, 0);
}

function drainQueuedAnalysis() {
    if (analysisPromise || !queuedAnalysisIntent) return;
    const intent = queuedAnalysisIntent;
    queuedAnalysisIntent = null;
    const context = currentContext();
    if (replacementPlanningDeferred(context)) return;
    const chatId = String(context.getCurrentChatId?.() || '');
    const messages = messagesFromChat(context.chat || []);
    if (!getSettings().enabled || !chatId || chatId !== intent.chatId || !messages.length) return;
    renderAnalysisActivity('Refreshing planner from latest turn…', true);
    void analyzeNow({
        ...intent,
        force: true,
        messages,
        allowOneUserAppend: true,
        // The retry repair's source allowance must not follow its queued
        // successor into a real continuation with a new accepted transcript.
        allowOneAssistantAppend: false,
    });
}

function queueLatestAnalysis(value = {}) {
    const context = currentContext();
    if (campaignMode(context)) return analyzeCampaignNow();
    if (replacementPlanningDeferred(context)) return analysisPromise;
    const intent = mergePlannerIntents(activeAnalysisIntent, {
        ...value,
        chatId: value.chatId || String(context.getCurrentChatId?.() || ''),
    });
    if (analysisPromise) {
        queuedAnalysisIntent = queuedAnalysisIntent
            ? mergePlannerIntents(queuedAnalysisIntent, intent)
            : intent;
        renderAnalysisActivity('Planner active · latest turn queued', true);
        return analysisPromise;
    }
    queuedAnalysisIntent = intent;
    drainQueuedAnalysis();
    return analysisPromise;
}

function cancelAnalysisRetry({ resetAttempt = true } = {}) {
    if (analysisRetryTimer) clearTimeout(analysisRetryTimer);
    analysisRetryTimer = null;
    if (resetAttempt) analysisRetryAttempt = 0;
}

function scheduleAnalysisRetry(error, options, chatId) {
    cancelAnalysisRetry({ resetAttempt: false });
    const attempt = ++analysisRetryAttempt;
    const delay = plannerRetryDelay(attempt);
    const stopSequence = analysisStopSequence;
    const seconds = Math.max(1, Math.round(delay / 1000));
    const status = `Connection interrupted · retrying in ${seconds}s (attempt ${attempt})`;
    renderAnalysisActivity(status, false);
    analysisRetryTimer = setTimeout(() => {
        analysisRetryTimer = null;
        const context = currentContext();
        if (!getSettings().enabled
            || analysisStopSequence !== stopSequence
            || String(context.getCurrentChatId?.() || '') !== chatId) return;
        const currentMessages = messagesFromChat(context.chat || []);
        const messages = options.allowOneAssistantAppend
            ? generationRetrySource(currentMessages, true)
            : currentMessages;
        if (!messages.length) return;
        renderAnalysisActivity(`Retrying planner · attempt ${attempt}`, true);
        void analyzeNow({
            ...options,
            force: true,
            messages,
            allowOneUserAppend: true,
            allowStaleContinuity: true,
            retryAttempt: attempt,
        });
    }, delay);
    console.warn(`[${EXTENSION_ID}] planner request failed; ${status.toLowerCase()}`, error);
    return status;
}

function interruptAnalysis(reason, status) {
    campaignSession?.stop(reason);
    generationGuideSelection = null;
    clearTranscriptRefresh();
    analysisStopSequence++;
    generationRevision++;
    clearQueuedAnalysis();
    cancelAnalysisRetry();
    if (!cancelRunningAnalysis(reason, status)) {
        renderAnalysisActivity(status, false);
    }
}

function stopAnalysis() {
    const context = currentContext();
    const chatId = String(context.getCurrentChatId?.() || '');
    clearPlannerPending(plannerStorage(), chatId);
    interruptAnalysis('Tale Fairy analysis stopped by the user.', 'Stopped');
    void cancelDetachedPlannerJobs(chatId);
}

function plannerStorage() {
    try {
        return globalThis.localStorage;
    } catch {
        return null;
    }
}

function parseAnalysisResponse(value, prompt = '') {
    try {
        const rawResult = value && typeof value === 'object' && !Array.isArray(value) && ([2, 8, 9, 10, 11, 12, 13, 14].includes(value.contract_version) || value.scene)
            ? value
            : extractJson(completionText(value));
        const result = normalizeAnalysisActorUpdates(normalizeAnalysisDiagnostics(abstractIncrementalVisibleBranches(rawResult)));
        const validation = validateAnalysisResult(result);
        if (!validation.valid) {
            const validationErrors = validation.errors.slice(0, 16);
            throw new AnalysisValidationError(`Planner violated its strict output contract: ${validationErrors.join('; ')}.`, validationErrors);
        }
        const alignmentErrors = transcriptHeadAlignmentErrors(result, prompt);
        if (alignmentErrors.length) {
            throw new AnalysisValidationError(`Planner analyzed stale transcript state: ${alignmentErrors.join('; ')}.`, alignmentErrors);
        }
        return result;
    } catch (error) {
        if (error instanceof AnalysisValidationError) throw error;
        throw new AnalysisValidationError(`Planner did not return valid JSON: ${error?.message || error}.`);
    }
}

async function acknowledgeDetachedPlannerJob(id) {
    if (!id || !detachedPlannerEnabled) return;
    await plannerServerApi(`/planner-jobs/${encodeURIComponent(id)}/ack`, { method: 'POST', body: '{}' });
}

async function detachedPlannerJobs(chatId = '') {
    if (!await detachedPlannerReady) return [];
    const query = chatId ? `?chatId=${encodeURIComponent(chatId)}` : '';
    const payload = await plannerServerApi(`/planner-jobs${query}`);
    return Array.isArray(payload.jobs) ? payload.jobs : [];
}

async function acknowledgeDetachedPlannerRun(runKey, chatId = '') {
    if (!runKey || !detachedPlannerEnabled) return;
    let ids = [...(detachedPlannerJobIds.get(runKey) || [])];
    try {
        const jobs = await detachedPlannerJobs(chatId);
        ids.push(...jobs.filter(job => job.runKey === runKey).map(job => job.id));
    } catch (error) {
        console.warn(`[${EXTENSION_ID}] Could not list completed planner jobs for acknowledgement`, error);
    }
    ids = [...new Set(ids)];
    await Promise.allSettled(ids.map(acknowledgeDetachedPlannerJob));
    detachedPlannerJobIds.delete(runKey);
}

async function cancelDetachedPlannerJobs(chatId) {
    if (!chatId || !detachedPlannerEnabled) return;
    const runId = analysisRunId;
    const stopSequence = analysisStopSequence;
    try {
        const jobs = await detachedPlannerJobs(chatId);
        // A slow listing from a previous swipe must not cancel the planner
        // that has since resumed for a new turn (or a newer stop request).
        if (runId !== analysisRunId || stopSequence !== analysisStopSequence) return;
        await Promise.allSettled(jobs
            .filter(job => job.status === 'queued' || job.status === 'processing')
            .map(job => plannerServerApi(`/planner-jobs/${encodeURIComponent(job.id)}`, { method: 'DELETE', body: '{}' })));
    } catch (error) {
        console.warn(`[${EXTENSION_ID}] Could not cancel detached planner jobs`, error);
    }
}

async function recoverDetachedPlannerJobs() {
    if (campaignMode()) return { active: Boolean(campaignHostWork || campaignSession?.pending), recovered: false };
    if (detachedPlannerRecovering || analysisPromise || !getSettings().enabled) return { active: false, recovered: false };
    const context = currentContext();
    const chatId = String(context.getCurrentChatId?.() || '');
    if (!chatId) return { active: false, recovered: false };
    const stopSequence = analysisStopSequence;
    detachedPlannerRecovering = true;
    try {
        const chat = messagesFromChat(context.chat || []);
        const jobs = await detachedPlannerJobs(chatId);
        let active = false;
        let invalid = null;
        for (const job of jobs) {
            if (analysisStopSequence !== stopSequence) return { active: false, recovered: false };
            const meta = job.meta || {};
            // Deferred retries may recover only their pre-reply repair, never
            // an ahead plan whose source includes the discarded response.
            if (replacementPlanningDeferred(currentContext()) && !retryPlannerSourceMatches(currentContext(), meta)) continue;
            const detachedInputsMatch = meta.analysisSelection?.plotInputsKey === plotInputKey(chatId, [], generationInputs(currentContext(), loadState(currentContext().chatMetadata)));
            const sourceAppended = !meta.allowOneAssistantAppend && detachedInputsMatch && unchangedSourcePrefix(meta, chat, fingerprintMessages);
            const sourceCurrent = isAnalysisSourceCurrent(meta.fingerprint, meta.messageCount, chat, {
                allowOneUserAppend: Boolean(meta.allowOneUserAppend),
                allowOneAssistantAppend: Boolean(meta.allowOneAssistantAppend),
            });
            if (job.status === 'queued' || job.status === 'processing') {
                if (sourceCurrent || sourceAppended) active = true;
                continue;
            }
            if (job.status === 'error' || job.status === 'cancelled' || (!sourceCurrent && !sourceAppended) || (meta.analysisSelection?.plotInputsKey && !detachedInputsMatch)) {
                await acknowledgeDetachedPlannerJob(job.id).catch(() => {});
                continue;
            }
            if (job.status !== 'complete' || !job.text) continue;
            let result;
            try {
                result = parseAnalysisResponse(job.text, alignmentPromptFromMeta(meta));
            } catch (error) {
                await acknowledgeDetachedPlannerJob(job.id).catch(() => {});
                console.warn(`[${EXTENSION_ID}] A retained planner result was invalid`, error);
                // A different attempt may already be valid or still running.
                // Never let an earlier invalid response overwrite its result.
                invalid ||= { job, meta, error };
                continue;
            }
            const current = meta.rebuild ? rebuildState(loadState(currentContext().chatMetadata)) : alignRetainedStateToTranscript(loadState(currentContext().chatMetadata), chat.slice(0, Number(meta.messageCount) || chat.length));
            current.mode = meta.mode || getSettings().mode;
            if (!preparedReady(current, chat.slice(0, meta.messageCount), currentContext(), true)) current.preparedWorld = defaultPreparedWorld();
            let next = applyAnalysis(current, result, chat.slice(0, Number(meta.messageCount) || chat.length));
            next = applyPlannerAuthorLayer(next, {
                turnCount: assistantTurnNumber(chat.slice(0, Number(meta.messageCount) || chat.length)),
                fingerprint: String(meta.fingerprint || ''),
                seedRequiredDevelopment: !meta.rebuild,
                fullReview: meta.fullContextPass === true && [8, 9, 12, 14].includes(result.contract_version),
                manualCompleted: true,
                messages: chat.slice(0, Number(meta.messageCount) || chat.length),
            });
            next.summaryEvidence = { ...(meta.summaryEvidence || {}), scannedAt: Date.now() };
            next.continuityRevisionUsed = Number(meta.continuityRevision || 0);
            next.continuityMessageSignature = String(meta.continuityMessageSignature || '');
            next.continuityCoverageThrough = Number(meta.continuityCoverageThrough ?? -1);
            if (!meta.allowOneAssistantAppend) next = reconcileStateWithContinuity(next, optionalContinuityContext(context, true)).state;
            next.plannerSeed = Number(meta.plannerSeed) || 0;
            next.sourceChatId = chatId;
            next.analysisModel = meta.analysisSelection || {};
            const submittedNote = normalizeUserNote(meta.userNote);
            const resolvedNote = resolveUserNote(result, submittedNote);
            if (resolvedNote) {
                next.userNotes = [...next.userNotes, { ...resolvedNote, at: Date.now() }];
                bindResolvedNoteInputProof(next, current);
            }
            next.noteNeedsClarification = Boolean(submittedNote && !resolvedNote);
            if (result.prepared) next.preparedWorld = stampPreparedWorld(next.preparedWorld, {
                startedAt: meta.startedAt,
                chatId, fingerprint: meta.fingerprint, messageCount: meta.messageCount, inputsKey: next.analysisModel.plotInputsKey,
            });
            next = await persist(next, {
                inputsKey: meta.analysisSelection?.plotInputsKey,
                startedAt: meta.startedAt,
                chatId,
                fingerprint: meta.fingerprint,
                messageCount: meta.messageCount,
                allowOneUserAppend: Boolean(meta.allowOneUserAppend),
                allowOneAssistantAppend: Boolean(meta.allowOneAssistantAppend),
            });
            await acknowledgeDetachedPlannerRun(job.runKey, chatId);
            clearPlannerPending(plannerStorage(), chatId);
            lastAnalysisError = '';
            renderBoard(next);
            renderAnalysisActivity(result._taleFairyRecovery
                ? 'Guidance ready · incomplete or oversized parts omitted'
                : 'Recovered planner result completed while this page was unavailable', false);
            return { active: false, recovered: true, state: next };
        }
        if (active) {
            renderAnalysisActivity('Planner continuing on the SillyTavern server', true);
            return { active: true, recovered: false };
        }
        if (invalid) {
            const latestContext = currentContext();
            const latestChat = messagesFromChat(latestContext.chat || []);
            const { job, meta, error } = invalid;
            const repairSource = meta.allowOneAssistantAppend ? chat.slice(0, meta.messageCount) : chat;
            const fingerprint = fingerprintMessages(repairSource);
            const sourceMatches = messages => isAnalysisSourceCurrent(fingerprint, repairSource.length, messages, { allowOneAssistantAppend: Boolean(meta.allowOneAssistantAppend) });
            if (!getSettings().enabled || analysisStopSequence !== stopSequence || analysisPromise
                || String(latestContext.getCurrentChatId?.() || '') !== chatId
                || !sourceMatches(latestChat)) return { active: false, recovered: false };
            await acknowledgeDetachedPlannerRun(job.runKey, chatId);
            if (!getSettings().enabled || analysisStopSequence !== stopSequence || analysisPromise
                || String(currentContext().getCurrentChatId?.() || '') !== chatId
                || !sourceMatches(messagesFromChat(currentContext().chat || []))) return { active: false, recovered: false };
            const retained = loadState(latestContext.chatMetadata);
            if (!meta.userNote && !meta.rebuild && canRetainSuccessfulPlan(retained, {
                chatId, fingerprint, messageCount: repairSource.length,
                inputsKey: plotInputKey(chatId, [], generationInputs(latestContext, retained)),
            })) {
                clearPlannerFailed(plannerStorage(), chatId);
                clearPlannerPending(plannerStorage(), chatId);
                lastAnalysisError = analysisErrorMessage(error);
                renderBoard(retained);
                renderAnalysisActivity('Current good plan retained · recovered refresh failed', false);
                return { active: false, recovered: true, retained: true, state: retained };
            }
            const fallback = createSafetyFallbackState(alignRetainedStateToTranscript(retained, repairSource), {
                transcriptHead: repairSource.length === Number(meta.messageCount) ? meta.transcriptHead : null,
                messages: repairSource, chatId, fingerprint, turnCount: assistantTurnNumber(repairSource),
                seed: Number(meta.plannerSeed) || randomVariationNonce(), reason: analysisErrorMessage(error),
            });
            await persist(fallback, { chatId, fingerprint, messageCount: repairSource.length, allowOneAssistantAppend: Boolean(meta.allowOneAssistantAppend) });
            clearPlannerFailed(plannerStorage(), chatId);
            clearPlannerPending(plannerStorage(), chatId);
            renderBoard(fallback);
            renderAnalysisActivity('Safety fallback ready · retained planner result was unusable', false);
            return { active: false, recovered: true, fallback: true, state: fallback };
        }
        return { active, recovered: false };
    } catch (error) {
        console.warn(`[${EXTENSION_ID}] Detached planner recovery check failed`, error);
        return { active: false, recovered: false };
    } finally {
        detachedPlannerRecovering = false;
    }
}

async function negotiatePlannerOutput(run, modes, label, signal, cacheKey = '', { retryInvalidOutput = false } = {}) {
    return negotiateOutputModes({
        run,
        modes,
        signal,
        cache: plannerOutputModeCache,
        cacheKey,
        canFallback: error => (retryInvalidOutput && error instanceof AnalysisValidationError) || isUnsupportedStructuredOutputError(error),
        onFallback: (error, mode, nextMode) => {
            console.warn(`[${EXTENSION_ID}] ${label} returned unusable ${mode} output; retrying with ${nextMode} compatibility`, error);
        },
    });
}

function waitForAbortable(promise, signal) {
    if (signal.aborted) return Promise.reject(signal.reason);
    return Promise.race([
        promise,
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
    ]);
}

function isUnsupportedTemperatureError(error) {
    let serialized = '';
    try { serialized = JSON.stringify(error); } catch { /* best effort */ }
    const text = [error?.message, error?.error?.message, error?.cause?.message, serialized, String(error || '')]
        .filter(Boolean)
        .join('\n');
    return /(?:unsupported parameter.{0,160}temperature|temperature.{0,160}(?:not supported|unsupported|out of range|must be|less than|greater than|between|maximum|at most|invalid))/is.test(text);
}

async function retryWithoutUnsupportedTemperature(run, disableSampling) {
    try {
        return await run();
    } catch (error) {
        if (!isUnsupportedTemperatureError(error)) throw error;
        disableSampling();
        console.warn(`[${EXTENSION_ID}] planner model rejected temperature; retrying with provider-default sampling`);
        return await run();
    }
}

function plannerTemperaturePayload(temperature, samplingEnabled) {
    return samplingEnabled ? { temperature: normalizePlannerTemperature(temperature) } : {};
}

function plannerModelRejectsTemperature(model) {
    const id = String(model || '').trim();
    // OpenAI reasoning/Responses models reject sampling controls. Match both
    // native ids and proxy-prefixed ids such as openai/gpt-5.6-terra.
    return /(?:^|\/)(?:gpt-5(?:[.\-]|$)|o[134](?:[.\-]|$))/i.test(id);
}

function isolatePlannerGenerationData(generateData, reasoningMode, temperature = plannerTemperature(), samplingEnabled = true, outputMode = PLANNER_OUTPUT_MODE.JSON_SCHEMA, responseTokens = INCREMENTAL_RESPONSE_TOKENS) {
    if (!generateData || typeof generateData !== 'object') return;
    const reasoning = buildReasoningRequest({
        mode: reasoningMode,
        source: generateData.chat_completion_source,
        model: generateData.model,
        url: generateData.custom_url || generateData.reverse_proxy,
    });
    responseTokens = plannerOutputTokenBudget(responseTokens, reasoning.payload.reasoning_effort || reasoningMode);
    generateData.stream = false;
    generateData.n = 1;
    if (samplingEnabled) {
        generateData.temperature = normalizePlannerTemperature(temperature);
        generateData.top_p = 1;
        generateData.frequency_penalty = 0;
        generateData.presence_penalty = 0;
        generateData.repetition_penalty = 1;
    } else {
        for (const key of ['temperature', 'top_p', 'frequency_penalty', 'presence_penalty', 'repetition_penalty']) delete generateData[key];
    }
    generateData.custom_prompt_post_processing = '';
    const responseLengthKeys = ['max_tokens', 'max_completion_tokens', 'max_length', 'max_new_tokens', 'max_output_tokens', 'n_predict'];
    let responseLengthSet = false;
    for (const key of responseLengthKeys) {
        if (!Object.hasOwn(generateData, key)) continue;
        generateData[key] = responseTokens;
        responseLengthSet = true;
    }
    if (!responseLengthSet && Array.isArray(generateData.messages)) generateData.max_tokens = responseTokens;
    Object.assign(generateData, reasoning.payload);
    // generateRaw starts from the active SillyTavern preset. A provider-level
    // response_format can therefore survive even when Tale Fairy retries in
    // prompt-only mode unless it is removed from the final request object.
    if (outputMode === PLANNER_OUTPUT_MODE.PROMPT_ONLY) stripStructuredOutputControls(generateData);
    for (const key of ['stop', 'stopping_strings', 'logit_bias', 'tools', 'tool_choice', 'enable_web_search', 'request_images', 'request_image_resolution', 'request_image_aspect_ratio']) {
        delete generateData[key];
    }
}

function normalizeUserNote(note) {
    if (!note) return null;
    if (typeof note === 'string') {
        const match = note.match(/^\[(suggest|correct|establish|forbid)\]\s*(.*)$/is);
        const text = String(match?.[2] || note).trim();
        return text ? { ...(match ? { kind: match[1].toLowerCase() } : {}), text } : null;
    }
    const kind = ['suggest', 'correct', 'establish', 'forbid'].includes(note.kind) ? note.kind : null;
    const text = String(note.text || '').trim();
    return text ? { ...(kind ? { kind } : {}), text } : null;
}

function noteInstruction(note) {
    if (!note) return '';
    return note.kind
        ? `[LEGACY USER NOTE - apply as ${note.kind}] ${note.text}`
        : `[AI-ASSISTED USER NOTE - classify and apply appropriately] ${note.text}`;
}

function resolveUserNote(result, submittedNote) {
    if (!submittedNote) return null;
    if (submittedNote.kind) return submittedNote;
    const resolution = result?.note_resolution;
    if (!resolution || !['suggest', 'correct', 'establish', 'forbid'].includes(resolution.kind)) return null;
    return { kind: resolution.kind, text: submittedNote.text };
}

async function persistClarifiedNote(text, kind) {
    const context = currentContext();
    const state = loadState(context.chatMetadata);
    const note = normalizeUserNote({ kind, text });
    if (!note) return state;
    state.userNotes = [...state.userNotes, { ...note, at: Date.now() }];
    state.noteNeedsClarification = false;
    const chat = messagesFromChat(context.chat || []);
    await persist(state, {
        chatId: String(context.getCurrentChatId?.() || ''),
        fingerprint: fingerprintMessages(chat),
        messageCount: chat.length,
    });
    renderBoard(state);
    renderAnalysisActivity('Instruction saved', false);
    return state;
}

function rebuildState(previous = loadState(currentContext().chatMetadata)) {
    return { ...defaultState(), pacing: previous.pacing, userNotes: previous.userNotes };
}

function rebuildPendingState(context = currentContext()) {
    const pending = rebuildState(loadState(context.chatMetadata));
    pending.canonBootstrapPending = true;
    pending.sourceChatId = String(context.getCurrentChatId?.() || '');
    pending.lastReason = 'Full Rebuild requested; no replacement planner result has been saved yet.';
    return pending;
}

async function persistRebuildPending(context = currentContext()) {
    const pending = rebuildPendingState(context);
    // This replaces only Tale Fairy's state, retaining user notes and pacing,
    // not generated guide content, while making the requested full-history rebuild
    // durable across reloads, navigation, and an interrupted model request.
    context.updateChatMetadata(saveState(clearState(context.chatMetadata), pending), true);
    if (typeof context.saveMetadata === 'function') await context.saveMetadata();
    return pending;
}

async function requestAnalysisOnce(prompt, externalSignal, detachedMeta = null, requestSpec = {}) {
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(externalSignal?.reason || new DOMException('Tale Fairy analysis stopped.', 'AbortError'));
    if (externalSignal?.aborted) forwardAbort();
    else externalSignal?.addEventListener('abort', forwardAbort, { once: true });
    try {
        controller.signal.throwIfAborted();
        await waitForAbortable(detachedPlannerReady, controller.signal);
        controller.signal.throwIfAborted();
        const systemPrompt = requestSpec.systemPrompt || PLANNER_SYSTEM_PROMPT;
        const schema = requestSpec.schema || ANALYSIS_SCHEMA;
        const responseTokens = Math.max(128, Number(requestSpec.responseTokens) || INCREMENTAL_RESPONSE_TOKENS);
        const parseResponse = requestSpec.parseResponse || (value => parseAnalysisResponse(value, prompt));
        const requestedReasoningMode = requestSpec.reasoningMode || '';
        const requestLabel = requestSpec.label || 'planner';
        const cacheNamespace = requestSpec.cacheNamespace || 'analysis';
        // Campaign passes must never negotiate by spending a second request.
        // Prompt-only JSON works without provider schema support. Unsupported
        // sampling/reasoning controls fail this pass; the caller retains its
        // previous preparation and exposes the error instead of repairing it.
        const singleShot = requestSpec.singleShot === true;
        const compactModes = requestSpec.compactOutput ? [PLANNER_OUTPUT_MODE.PROMPT_ONLY] : null;
        const detachedMarker = detachedPlannerEnabled && detachedMeta ? { _taleFairyPlanner: detachedMeta } : {};
        const model = analysisModelOptions();
        const temperature = requestSpec.temperature === undefined ? plannerTemperature() : normalizePlannerTemperature(requestSpec.temperature);
        if (model.profileId) {
            const profile = ConnectionManagerRequestService.getProfile(model.profileId);
            const apiMap = ConnectionManagerRequestService.validateProfile(profile);
            const reasoningMode = requestedReasoningMode || plannerReasoningMode(profile);
            const reasoning = buildReasoningRequest({
                mode: reasoningMode,
                source: apiMap.source,
                model: profile.model,
                url: profile['api-url'],
                profileName: profile.name,
            });
            let reasoningPayload = reasoning.payload;
            let reasoningBudgetMode = reasoningMode;
            let samplingEnabled = !plannerModelRejectsTemperature(profile.model);
            const sendProfileRaw = mode => ConnectionManagerRequestService.sendRequest(
                model.profileId,
                plannerMessages(systemPrompt, prompt, schema, mode),
                plannerOutputTokenBudget(responseTokens, reasoningPayload.reasoning_effort || reasoningBudgetMode),
                { stream: false, extractData: false, includePreset: false, includeInstruct: false, signal: controller.signal },
                {
                    ...(mode === PLANNER_OUTPUT_MODE.JSON_SCHEMA ? { json_schema: schema } : {}),
                    custom_prompt_post_processing: '',
                    ...plannerTemperaturePayload(temperature, samplingEnabled),
                    ...reasoningPayload,
                    ...detachedMarker,
                },
            );
            if (singleShot) {
                const response = await sendProfileRaw(PLANNER_OUTPUT_MODE.PROMPT_ONLY);
                controller.signal.throwIfAborted();
                return parseResponse(response);
            }
            const sendProfile = mode => retryWithoutUnsupportedTemperature(
                () => sendProfileRaw(mode),
                () => { samplingEnabled = false; },
            );
            const runProfileAttempt = async mode => {
                try {
                    const response = await sendProfile(mode);
                    controller.signal.throwIfAborted();
                    return parseResponse(response);
                } catch (error) {
                    controller.signal.throwIfAborted();
                    if (error instanceof AnalysisValidationError) throw error;
                    if (!isReasoningControlError(error) || (!reasoning.controlled && !isMandatoryReasoningError(error))) throw error;
                    reasoningPayload = reasoningFallbackPayload(error, reasoningPayload);
                    reasoningBudgetMode = 'default';
                    const response = await sendProfile(mode);
                    controller.signal.throwIfAborted();
                    return parseResponse(response);
                }
            };
            const runProfileMode = mode => runProfileAttempt(mode);
            return negotiatePlannerOutput(
                runProfileMode,
                compactModes || [PLANNER_OUTPUT_MODE.JSON_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY],
                `${requestLabel} connection profile`,
                controller.signal,
                `${cacheNamespace}:profile:${model.profileId}:${apiMap.source}:${profile.model || ''}:${profile['api-url'] || ''}`,
            );
        }
        if (model.active) {
            let activeReasoningMode = requestedReasoningMode || plannerReasoningMode();
            let samplingEnabled = true;
            const activeContext = currentContext();
            const activeSource = String(activeContext.chatCompletionSettings?.chat_completion_source || activeContext.mainApi || 'active');
            const runActive = mode => {
                const mainApi = currentContext().mainApi;
                const seedEvent = mainApi === 'openai' ? event_types.CHAT_COMPLETION_SETTINGS_READY : event_types.GENERATE_AFTER_DATA;
                const configurePlanner = generateData => {
                    if (!containsPlannerMarker(generateData)) return;
                    const requestSamplingEnabled = samplingEnabled
                        && Object.hasOwn(generateData, 'temperature')
                        && !plannerModelRejectsTemperature(generateData.model);
                    isolatePlannerGenerationData(generateData, activeReasoningMode, temperature, requestSamplingEnabled, mode, responseTokens);
                    Object.assign(generateData, detachedMarker);
                };
                eventSource.on(seedEvent, configurePlanner);
                return waitForAbortable(generateRaw({
                    prompt: plannerPrompt(prompt, schema, mode),
                    // The planner must not inherit the user's text-completion
                    // instruct template or preset formatting.
                    instructOverride: true,
                    systemPrompt,
                    suppressErrorToasts: true,
                    ...(mode === PLANNER_OUTPUT_MODE.JSON_SCHEMA ? { jsonSchema: schema } : {}),
                    trimNames: false,
                }), controller.signal).finally(() => eventSource.removeListener(seedEvent, configurePlanner));
            };
            const runActiveCompatible = mode => retryWithoutUnsupportedTemperature(
                () => runActive(mode),
                () => { samplingEnabled = false; },
            );
            if (singleShot) {
                const response = await runActive(PLANNER_OUTPUT_MODE.PROMPT_ONLY);
                controller.signal.throwIfAborted();
                return parseResponse(response);
            }
            const runActiveAttempt = async mode => {
                try {
                    const raw = await runActiveCompatible(mode);
                    controller.signal.throwIfAborted();
                    return parseResponse(raw);
                } catch (error) {
                    controller.signal.throwIfAborted();
                    if (error instanceof AnalysisValidationError || !isReasoningControlError(error)) throw error;
                    activeReasoningMode = isMandatoryReasoningError(error) ? 'minimum' : 'default';
                    const raw = await runActiveCompatible(mode);
                    controller.signal.throwIfAborted();
                    return parseResponse(raw);
                }
            };
            const runActiveMode = mode => runActiveAttempt(mode);
            return negotiatePlannerOutput(
                runActiveMode,
                compactModes || [PLANNER_OUTPUT_MODE.JSON_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY],
                `${requestLabel} active model`,
                controller.signal,
                `${cacheNamespace}:active:${activeContext.mainApi || ''}:${activeSource}`,
            );
        }
        const reasoningMode = requestedReasoningMode || plannerReasoningMode();
        const reasoning = buildReasoningRequest({
            mode: reasoningMode,
            source: model.provider === 'openrouter' ? 'openrouter' : 'custom',
            model: model.model,
            url: model.url,
        });
        let reasoningPayload = reasoning.payload;
        let reasoningBudgetMode = reasoningMode;
        let samplingEnabled = !plannerModelRejectsTemperature(model.model);
        const sendRaw = async mode => {
            const modePayload = model.provider === 'custom' ? customOutputPayload(reasoningPayload, mode) : reasoningPayload;
            const body = { chat_completion_source: model.provider, model: model.model, messages: plannerMessages(systemPrompt, prompt, schema, mode), max_tokens: plannerOutputTokenBudget(responseTokens, reasoningPayload.reasoning_effort || reasoningBudgetMode), stream: false, ...plannerTemperaturePayload(temperature, samplingEnabled), ...modePayload, ...(mode === PLANNER_OUTPUT_MODE.JSON_SCHEMA ? { json_schema: schema } : {}), ...(model.provider === 'openrouter' ? { api_url: model.url.replace(/\/$/, '') } : { custom_url: model.url.replace(/\/$/, '') }), ...detachedMarker };
            if (model.secretId) body.secret_id = model.secretId;
            const response = await fetch('/api/backends/chat-completions/generate', { method: 'POST', headers: currentContext().getRequestHeaders?.() || getRequestHeaders?.() || { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
            const payload = await response.json();
            if (!response.ok || payload?.error) throw new Error(payload?.error?.message || payload?.error || `Analysis request failed (${response.status}).`);
            controller.signal.throwIfAborted();
            return parseResponse(payload);
        };
        const send = mode => retryWithoutUnsupportedTemperature(
            () => sendRaw(mode),
            () => { samplingEnabled = false; },
        );
        if (singleShot) return await sendRaw(PLANNER_OUTPUT_MODE.PROMPT_ONLY);
        const runDirectAttempt = async mode => {
            try {
                return await send(mode);
            } catch (error) {
                controller.signal.throwIfAborted();
                if (error instanceof AnalysisValidationError) throw error;
                if (!isReasoningControlError(error) || (!reasoning.controlled && !isMandatoryReasoningError(error))) throw error;
                reasoningPayload = reasoningFallbackPayload(error, reasoningPayload);
                reasoningBudgetMode = 'default';
                return send(mode);
            }
        };
        const runDirectMode = mode => runDirectAttempt(mode);
        const modes = compactModes || plannerOutputModes(model);
        return negotiatePlannerOutput(
            runDirectMode,
            modes,
            `${requestLabel} direct model`,
            controller.signal,
            `${cacheNamespace}:direct:${model.provider}:${model.model}:${model.url}`,
        );
    } finally {
        externalSignal?.removeEventListener('abort', forwardAbort);
    }
}

async function requestAnalysis(prompt, externalSignal, detachedMeta, recovery = null) {
    const fullContextPass = detachedMeta?.fullContextPass === true;
    const bootstrapScan = detachedMeta?.bootstrapScan === true || detachedMeta?.rebuild === true;
    // Same lean contract on every pass; wider review changes the evidence
    // window, not the number of mandatory reporting boards or thinking depth.
    return requestAnalysisOnce(prompt, externalSignal, detachedMeta, {
        responseTokens: fullContextPass ? (bootstrapScan ? REBUILD_RESPONSE_TOKENS : REVIEW_RESPONSE_TOKENS) : INCREMENTAL_RESPONSE_TOKENS,
        systemPrompt: WORLD_PLANNER_SYSTEM,
        reasoningMode: 'off',
        compactOutput: true,
        schema: WORLD_PLANNER_SCHEMA,
        allowValidationRepair: false,
        label: fullContextPass ? 'world notebook review' : 'world notebook update',
        cacheNamespace: 'analysis-world-v14',
    });
}

export async function analyzeNow({ note = null, force = false, messages = null, rebuild = false, allowOneUserAppend = false, allowOneAssistantAppend = false, allowStaleContinuity = false, waitForContinuity = false, retryAttempt = 0, recovery = null } = {}) {
    const context = currentContext();
    if (campaignMode(context)) {
        if (note) return applyCampaignInstruction(note);
        if (rebuild) return startCampaignPlanning({ rebuild: true });
        return analyzeCampaignNow({ manual: force });
    }
    const s = getSettings();
    if (!s.enabled) return loadState(context.chatMetadata);
    if (!retryAttempt) cancelAnalysisRetry();
    const chat = messages || messagesFromChat(context.chat || []);
    const savedState = loadState(context.chatMetadata);
    const state = rebuild ? rebuildState(savedState) : savedState;
    const userNote = normalizeUserNote(note);
    const fingerprint = fingerprintMessages(chat);
    const chatId = String(context.getCurrentChatId?.() || '');
    if (!force && !userNote && !rebuild && !state.canonBootstrapPending
        && (state.plannerContract === 14 ? isDirectionCurrent(state, chat, chatId) : isGuidanceUsable(state, chat, chatId))) { updatePrompt(state); return state; }
    const pass = plannerPassDecision({ state, messages: chat, rebuild,
        manual: Boolean(userNote) || recovery?.fullContextPass === true,
        sceneRefresh: allowOneAssistantAppend || (!userNote && state.plannerSchedule.manualRequested),
        refreshInterval: s.fullReviewInterval });
    const requestInputKey = plotInputKey(chatId, chat, {
        inputs: generationInputs(context, state), note: userNote, rebuild, recovery,
        allowOneUserAppend, allowOneAssistantAppend, allowStaleContinuity, waitForContinuity,
        fullContextPass: pass.fullContextPass, bootstrapScan: pass.bootstrapScan,
        // UI changes do not restart a request; actual provider/budget changes do.
        settings: Object.fromEntries(['analysisSource', 'analysisProvider', 'analysisProfileId', 'analysisModel', 'analysisUrl',
            'analysisSecretId', 'analysisReasoningMode', 'analysisTemperature', 'maxPromptTokens', 'routineInputTokens',
            'reviewInputTokens', 'recentContextTokens', 'summaryContextTokens', 'messageTokenLimit', 'continuityIntegration']
            .map(key => [key, s[key]])),
    });
    let previousAnalysisPromise = null;
    if (analysisPromise) {
        // Force bypasses a completed cache, not identical work already running.
        // Repeated clicks must not throw away the provider's progress.
        if (!analysisAbortController?.signal.aborted && analysisRequestInputKey === requestInputKey) return analysisPromise;
        previousAnalysisPromise = analysisPromise;
        clearQueuedAnalysis();
        cancelRunningAnalysis('A newer Tale Fairy analysis replaced this request.', 'Restarting…');
    }
    if (!recovery && !retryAttempt) clearPlannerRecoveryRepair(plannerStorage(), chatId);
    const revision = ++generationRevision;
    const runId = ++analysisRunId;
    const detachedRunKey = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${runId}-${randomVariationNonce()}`;
    const variationNonce = randomVariationNonce();
    const startedAt = Date.now();
    const controller = new AbortController();
    analysisAbortController = controller;
    analysisRequestFingerprint = fingerprint;
    analysisRequestInputKey = requestInputKey;
    activeAnalysisIntent = normalizePlannerIntent({
        chatId,
        note,
        rebuild,
        waitForContinuity,
        allowStaleContinuity,
        allowOneAssistantAppend,
    });
    activeAnalysisMessageCount = chat.length;
    markPlannerPending(plannerStorage(), chatId, fingerprint);
    showAnalysisPhase('Waiting for planner slot', runId, startedAt);
    let finalStatus = 'Updated';
    let plannerTranscriptHead = null;
    const runAnalysis = async () => {
        const latestSaved = loadState(currentContext().chatMetadata);
        const current = rebuild ? rebuildState(latestSaved) : latestSaved;
        current.mode = s.mode;
        // Changed author inputs require revision, not loss of the whole brief.
        // Edited/discarded source branches and foreign chats still cannot carry it.
        if (!preparedReady(current, chat, context, true)) current.preparedWorld = defaultPreparedWorld();
        current.plannerSchedule = normalizePlannerSchedule({ ...current.plannerSchedule, refreshInterval: s.fullReviewInterval });
        const { fullContextPass, bootstrapScan } = pass;
        const budgets = plannerBudgets(s, { bootstrapScan, fullContextPass });
        const { input: plannerMaxPromptTokens, recent: plannerRecentContextTokens, summary: plannerSummaryContextTokens } = budgets;
        const bootstrap = bootstrapContext(context, { broad: fullContextPass });
        const storyEvidence = fullContextPass ? buildStoryEvidence(chat) : null;
        const referenceSources = [];
        if (fullContextPass) {
            await warmPlotWorldInputs(context);
            controller.signal.throwIfAborted();
            for (const [name, text] of Object.entries(bootstrap)) {
                referenceSources.push({ label: name, kind: 'character-reference', priority: 0, text });
            }
            for (const name of plotWorldNames(context, world_info, selected_world_info)) {
                for (const entry of Object.values(worldInfoCache.get(name)?.entries || {})) {
                    if (entry.disable || !entry.content) continue;
                    referenceSources.push({ label: `World Info: ${name} · ${entry.comment || entry.uid}`,
                        kind: 'world-info-reference', priority: 1, text: String(entry.content) });
                }
            }
        }
        const analysisSelection = {
            source: s.analysisSource,
            profileId: s.analysisProfileId,
            model: s.analysisModel,
            url: s.analysisUrl,
        };
        if (waitForContinuity) showAnalysisPhase('Waiting for Continuity Memory', runId, startedAt);
        // Continuity Memory may already summarize the discarded response.
        // A pre-reply repair must not import that future into its source.
        const continuityState = allowOneAssistantAppend ? null : waitForContinuity
            ? await optionalContinuityContextWhenReady(context, allowStaleContinuity, controller.signal)
            : optionalContinuityContext(context, allowStaleContinuity);
        const continuityContext = continuityState?.text ?? continuityState;
        controller.signal.throwIfAborted();
        showAnalysisPhase('Reading summaries and World Info', runId, startedAt);
        // Global summaries, extension prompts, and mutable message extras can
        // include the discarded reply. Use accepted transcript recaps and lore.
        const summaryContext = allowOneAssistantAppend
            ? { ...context, chat, chatMetadata: {}, extensionPrompts: {} }
            : context;
        const summarySources = await collectSummarySources(summaryContext, chat, {
            continuityContext,
            continuityEvidence: continuityState?.planningEvidence,
            continuitySummary: continuityState?.summaryText,
            includeContinuity: s.continuityIntegration && !allowOneAssistantAppend,
            ownPromptKey: PROMPT_KEY,
            broad: fullContextPass, referenceSources,
            tokenBudget: plannerSummaryContextTokens,
            query: storyEvidence ? storyEvidenceQuery(storyEvidence, bootstrap) : [...chat.slice(-4).map(message => message?.mes || ''), ...relevantActors(current.entities, chat.slice(-4).map(message => message?.mes || '').join('\n')).map(item => item.name)].join('\n'),
            worldInfoActivationTokens: plannerMaxPromptTokens,
            onWarning: (message, error) => console.warn(`[${EXTENSION_ID}] ${message}`, error),
        });
        controller.signal.throwIfAborted();
        showAnalysisPhase(`Building ${Number(plannerMaxPromptTokens).toLocaleString()}-token ${fullContextPass ? 'full' : 'incremental'} planner input`, runId, startedAt);
        // Kept with run metadata so detached recovery retains the same proof.
        analysisSelection.plotInputsKey = plotInputKey(chatId, [], generationInputs(context, current));
        const plannerPrompt = await buildTokenBudgetedAnalysisPrompt(chat, current, noteInstruction(userNote), bootstrap, { storyEvidence, recentContextTokens: plannerRecentContextTokens, messageTokenLimit: s.messageTokenLimit, summaryContextTokens: plannerSummaryContextTokens, summarySources, bootstrapScan, fullRebuild: rebuild, incremental: !fullContextPass, maxPromptTokens: plannerMaxPromptTokens, variationNonce });
        plannerTranscriptHead = transcriptHeadFromPrompt(plannerPrompt);
        lastSummaryAudit = plannerEvidenceAudit(plannerPrompt, summarySources, {
            fixedEnvelope: analysisBudgetEnvelope(!fullContextPass),
            tokenBudget: plannerMaxPromptTokens, tier: budgets.tier,
        });
        showAnalysisPhase('Waiting for planner model', runId, startedAt);
        const result = await requestAnalysis(plannerPrompt, controller.signal, {
            chatId,
            runKey: detachedRunKey,
            fingerprint,
            messageCount: chat.length,
            startedAt,
            allowOneUserAppend,
            allowOneAssistantAppend,
            rebuild,
            fullContextPass,
            bootstrapScan,
            mode: current.mode,
            plannerSeed: variationNonce,
            analysisSelection,
            userNote,
            summaryEvidence: lastSummaryAudit,
            continuityRevision: Number(continuityState?.revision || 0),
            continuityMessageSignature: String(continuityState?.messageSignature || ''),
            continuityCoverageThrough: Number(continuityState?.coverageThrough ?? -1),
            transcriptHead: plannerTranscriptHead,
        }, recovery);
        controller.signal.throwIfAborted();
        showAnalysisPhase('Validating and saving planner result', runId, startedAt);
        const resolvedNote = resolveUserNote(result, userNote);
        if (revision !== generationRevision) {
            await acknowledgeDetachedPlannerRun(detachedRunKey, chatId);
            finalStatus = 'Skipped · chat changed';
            return current;
        }
        let next = applyAnalysis(alignRetainedStateToTranscript(current, chat), result, chat);
        next = applyPlannerAuthorLayer(next, { turnCount: assistantTurnNumber(chat), fingerprint, seedRequiredDevelopment: !rebuild, fullReview: fullContextPass && [8, 9, 12, 14].includes(result.contract_version), manualCompleted: true, messages: chat });
        // A bridge notification can arrive while the planner is running. The
        // direction still records the snapshot it actually used, while linked
        // factual entries immediately accept the latest canonical correction.
        if (!allowOneAssistantAppend) next = reconcileStateWithContinuity(next, optionalContinuityContext(context, true)).state;
        next.summaryEvidence = { ...lastSummaryAudit, scannedAt: Date.now() };
        next.continuityRevisionUsed = Number(continuityState?.revision || 0);
        next.continuityMessageSignature = String(continuityState?.messageSignature || '');
        next.continuityCoverageThrough = Number(continuityState?.coverageThrough ?? -1);
        next.plannerSeed = variationNonce;
        next.sourceChatId = chatId;
        next.analysisModel = analysisSelection;
        if (resolvedNote) {
            next.userNotes = [...next.userNotes, { ...resolvedNote, at: Date.now() }];
            bindResolvedNoteInputProof(next, current);
        }
        next.noteNeedsClarification = Boolean(userNote && !resolvedNote);
        if (result.prepared) next.preparedWorld = stampPreparedWorld(next.preparedWorld, {
            startedAt,
            chatId, fingerprint, messageCount: chat.length, inputsKey: next.analysisModel.plotInputsKey,
        });
        next = await persist(next, { chatId, fingerprint, messageCount: chat.length, startedAt, allowOneUserAppend, allowOneAssistantAppend,
            inputsKey: analysisSelection.plotInputsKey });
        await acknowledgeDetachedPlannerRun(detachedRunKey, chatId);
        clearPlannerFailed(plannerStorage(), chatId);
        cancelAnalysisRetry();
        lastAnalysisError = '';
        finalStatus = userNote && !resolvedNote
            ? 'Note not applied · try again'
            : result._taleFairyRecovery ? `Guidance ready · incomplete or oversized parts omitted · ${elapsedLabel(Date.now() - startedAt)}`
            : `Active world context ready · ${elapsedLabel(Date.now() - startedAt)}`;
        renderBoard(next);
        return next;
    };
    const promise = waitForPlannerHandoff(previousAnalysisPromise, controller.signal)
        .then(() => withPlannerTabLock(chatId, runAnalysis))
        .catch(async error => {
            const stopped = controller.signal.aborted;
            if (!stopped) lastAnalysisError = analysisErrorMessage(error);
            const retryable = !(error instanceof AnalysisValidationError) && shouldRetryPlannerError(error, stopped);
            const willRetry = !recovery && !stopped && retryable && analysisRetryAttempt < PLANNER_MAX_AUTO_RETRIES;
            if (!stopped && !willRetry && error?.name !== 'PlannerBusyInAnotherTabError') {
                // These attempts were handled live. They must not be recovered
                // again as if they completed while the page was unavailable.
                await acknowledgeDetachedPlannerRun(detachedRunKey, chatId);
                console.warn(`[${EXTENSION_ID}] Planner result was unusable; preparing a transcript-bound safety fallback`, error);
                try {
                    const latestContext = currentContext();
                    const latestChat = messagesFromChat(latestContext.chat || []);
                    const latestChatId = String(latestContext.getCurrentChatId?.() || '');
                    const sourceCurrent = latestChatId === chatId && isAnalysisSourceCurrent(fingerprint, chat.length, latestChat, { allowOneUserAppend, allowOneAssistantAppend });
                    if (sourceCurrent && latestChat.length) {
                        const fallbackSource = allowOneAssistantAppend ? chat : latestChat;
                        const fallbackFingerprint = fingerprintMessages(fallbackSource);
                        const retained = loadState(latestContext.chatMetadata);
                        if (!userNote && !rebuild && canRetainSuccessfulPlan(retained, {
                            chatId, fingerprint: fallbackFingerprint, messageCount: fallbackSource.length,
                            inputsKey: plotInputKey(chatId, [], generationInputs(latestContext, retained)),
                        })) {
                            clearPlannerFailed(plannerStorage(), chatId);
                            cancelAnalysisRetry();
                            finalStatus = 'Current good plan retained · planner refresh failed';
                            renderBoard(retained);
                            return retained;
                        }
                        const fallback = createSafetyFallbackState(alignRetainedStateToTranscript(retained, fallbackSource), {
                            transcriptHead: fallbackSource.length === chat.length ? plannerTranscriptHead : null,
                            messages: fallbackSource,
                            chatId,
                            fingerprint: fallbackFingerprint,
                            turnCount: assistantTurnNumber(fallbackSource),
                            seed: variationNonce,
                            reason: lastAnalysisError,
                        });
                        await persist(fallback, { chatId, fingerprint: fallbackFingerprint, messageCount: fallbackSource.length, allowOneAssistantAppend });
                        clearPlannerFailed(plannerStorage(), chatId);
                        cancelAnalysisRetry();
                        finalStatus = `Safety fallback ready · ${isPlannerTimeoutError(error) ? 'planner timed out' : analysisErrorMessage(error).replace(/^Planner violated its strict output contract: /u, '').slice(0, 160)}`;
                        renderBoard(fallback);
                        return fallback;
                    }
                } catch (fallbackError) {
                    console.warn(`[${EXTENSION_ID}] Could not persist the safety fallback`, fallbackError);
                }
                markPlannerFailed(plannerStorage(), chatId, fingerprint);
            }
            finalStatus = stopped
                ? 'Stopped'
                : error?.name === 'PlannerBusyInAnotherTabError'
                    ? 'Planner active in another page'
                    : isPlannerTimeoutError(error)
                        ? `Planner timed out after ${elapsedLabel(Date.now() - startedAt)} · automatic retry stopped`
                        : willRetry
                            ? scheduleAnalysisRetry(error, { note, rebuild, waitForContinuity, allowOneAssistantAppend }, chatId)
                            : `Analysis failed · ${lastAnalysisError}`;
            if (!stopped && (!retryable || analysisRetryAttempt >= PLANNER_MAX_AUTO_RETRIES)) console.warn(`[${EXTENSION_ID}] analysis skipped`, error);
            renderBoard(loadState(context.chatMetadata));
            return loadState(context.chatMetadata);
        }).finally(() => {
            if (analysisPromise === promise) {
                analysisPromise = null;
                activeAnalysisIntent = null;
                activeAnalysisMessageCount = 0;
                queueMicrotask(drainQueuedAnalysis);
            }
            if (runId !== analysisRunId) return;
            analysisAbortController = null;
            analysisRequestFingerprint = '';
            analysisRequestInputKey = '';
            clearPlannerPending(plannerStorage(), chatId);
            renderAnalysisActivity(finalStatus, false);
        });
    analysisPromise = promise;
    return promise;
}

function scratchpadText(board, role, value, fallback) {
    const element = board.querySelector(`[data-role="${role}"]`);
    if (element) element.textContent = value || fallback;
}

function scratchpadOptionalText(board, sectionRole, contentRole, value) {
    const section = board.querySelector(`[data-role="${sectionRole}"]`);
    const element = board.querySelector(`[data-role="${contentRole}"]`);
    const content = String(value || '').trim();
    if (element) element.textContent = content;
    if (section) section.hidden = !content;
}

function scratchpadList(items, formatter, fallback) {
    const lines = (items || []).map(formatter).filter(Boolean);
    return lines.length ? lines.map(line => `• ${line}`).join('\n') : fallback;
}

function renderBoard(state = loadState(currentContext().chatMetadata)) {
    const board = document.querySelector(`#${EXTENSION_ID}-board`);
    if (!board) return;
    const campaign = state.plannerContract === 15;
    const analyzed = !campaign && state.scene.status !== 'uninitialized';
    for (const role of ['scratchpad-scene', 'scratchpad-frame', 'scratchpad-lore', 'scratchpad-next-guides', 'scratchpad-ledger']) {
        const section = board.querySelector(`[data-role="${role}"]`)?.closest?.('section');
        if (section) section.hidden = campaign;
    }
    const settingsRoot = document.querySelector(`#${EXTENSION_ID}-settings`);
    const reasoningControl = settingsRoot?.querySelector('[data-setting="reasoning"]');
    if (reasoningControl) {
        reasoningControl.disabled = !campaign;
        reasoningControl.value = campaign ? getSettings().analysisReasoningMode : 'off';
    }
    const reasoningHelp = settingsRoot?.querySelector('[data-role="reasoning-help"]');
    if (reasoningHelp) reasoningHelp.textContent = campaign
        ? 'Planning uses the selected reasoning setting. Unsupported controls fail the pass; no compatibility retry is sent.'
        : 'Planner reasoning is off, with a Low retry for providers that require it. Your roleplay model keeps its own settings.';
    const instructionHelp = settingsRoot?.querySelector('[data-role="instruction-help"]');
    if (instructionHelp) instructionHelp.textContent = campaign
        ? 'Your instruction is saved verbatim for planning and writing. Its stated intent applies directly; no extra classifier or automatic canon declaration.'
        : 'Add a suggestion, correction, canon detail, or exclusion. Tale Fairy applies it to the notebook and asks if clarification is needed.';
    const pacingControl = settingsRoot?.querySelector('[data-setting="pacing"]');
    if (pacingControl) pacingControl.value = state.pacing.mode;
    const notebook = state.preparedWorld;
    scratchpadText(board, 'scratchpad-prepared', [
        notebook.items.length || notebook.overview || notebook.approach || notebook.summary ? (preparedReady(state, messagesFromChat(currentContext().chat || []))
            ? 'Preparation ready.'
            : 'Preparation awaiting refresh after context changes.') : '',
        notebook.archives?.length && `STORAGE: ${notebook.items.length} active records; ${notebook.archives.reduce((sum, item) => sum + item.count, 0)} original records in verified archives.`,
        notebook.compactionError && `Compaction deferred: ${notebook.compactionError}`,
        notebook.approach && `APPROACH\n${notebook.approach}`,
        notebook.summary && `ROLLING PLANNER SUMMARY (private)\n${notebook.summary}`,
        state.summaryEvidence?.inputBudget && `LAST PLANNER VIEW: ${state.summaryEvidence.notebookLocalCount || 0} local, ${state.summaryEvidence.notebookWiderCount || 0} wider records. Review changes attention, not fictional time.`,
        notebook.writer !== undefined && `WRITER MATERIAL\n${notebook.writer.map(item => [item.material, item.knowledge].filter(Boolean).join('\n')).join('\n\n') || 'No additional development selected.'}`,
        notebook.overview && `DIRECTIONS\n${notebook.overview}`,
        ...notebook.items.map(item => [`[${item.status} · ${item.origin}${notebook.focus.includes(item.id) ? ' · selected' : ''}] ${item.premise}`,
            ...Object.entries({ Family: item.family, Dependency: item.dependency, Process: item.engine, Middle: item.middle, Beyond: item.future, Entry: item.entry,
                Hold: item.hold, 'Invalidated by': item.invalidates, Intervention: item.intervention, Knowledge: item.knowledge })
                .filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`)].join('\n')),
    ].filter(Boolean).join('\n\n'), 'No prepared material yet.');
    if (campaign) {
        const preparation = state.campaignPreparation;
        scratchpadText(board, 'scratchpad-prepared', validCampaignState(preparation) ? [
            `CAMPAIGN PREPARATION · revision ${preparation.revision} · ${preparedReady(state, messagesFromChat(currentContext().chat || [])) ? 'compatible with current play' : 'source changed; not injected'}`,
            preparation.campaign,
            `EPISODE · ${preparation.episode.status}: ${preparation.episode.subject}\n${preparation.episode.boundary}`,
            ...preparation.developments.map(item => [
                `[${item.id}] ${preparation.realization?.[item.id] ? '' : preparation.preparationFormat === EVENT_POINTS_FORMAT
                    ? eventPointWire(item).plot_points.map(point => `Event opportunity: ${point.event}\nOpens: ${point.opens}`).join('\n\n') : item.premise}`,
                preparation.realization?.[item.id] && `Accepted progress (cited interpretation): ${Object.entries(preparation.realization[item.id].episodes).map(([id, e]) => `${id}: ${e.status}`).join('; ') || 'No witnessed enactment yet'}`,
                preparation.realization?.[item.id]?.needsPlayableReview && 'Writer review pending: prior situation advanced; stale material withheld.',
                preparation.realization?.[item.id] && `Writer situations: ${preparation.realization[item.id].playable.map(p => [`${p.when} — ${p.situation}`, p.resolution && `${p.resolution.owner === 'npc' ? 'NPC result' : p.resolution.owner === 'world' ? 'World result' : 'Player decision'}: ${p.resolution.endpoint}`].filter(Boolean).join('\n')).join('\n') || 'None; subject retained privately'}`,
                item.initiative && `Proposed ${item.initiative.control} aim · ${item.initiative.owner}: ${item.initiative.aim}`,
                `Development: ${item.progression}`, `${['plot-points-v1', 'event-opportunities-v1'].includes(state.campaignPreparation.preparationFormat) ? 'Stakes' : 'Outcomes'}: ${item.outcomes}`, `Participation: ${item.access}`,
            ].filter(Boolean).join('\n')),
            `${preparation.archive.length} prior designs/boundaries retained in chat metadata. Proposals are not established story facts.`,
        ].join('\n\n') : 'No valid campaign preparation yet. Previous material is retained in metadata; no legacy scene plan is injected.', '');
    }
    const archives = board.querySelector('[data-role="scratchpad-archives"]');
    if (archives) {
        archives.replaceChildren();
        for (const entry of notebook.archives || []) {
            const link = document.createElement('a');
            link.href = `/user/files/${entry.file}`;
            link.download = entry.file;
            link.textContent = `Download ${entry.count} original plans (${entry.replacementId})`;
            archives.append(link, document.createElement('br'));
        }
    }
    const guideButton = settingsRoot?.querySelector('[data-action="guide"]');
    const guideLabel = guideButton?.querySelector('[data-role="guide-label"]');
    if (guideLabel) guideLabel.textContent = analyzed ? 'Re-evaluate' : 'Guide now';
    if (guideButton) guideButton.title = analyzed ? 'Refresh context and plans' : 'Prepare plans for this chat';

    const analyzedAt = state.lastAnalyzedAt ? new Date(state.lastAnalyzedAt).toLocaleString() : '';
    const meta = campaign ? `Campaign preparation · ${validCampaignState(state.campaignPreparation) ? `revision ${state.campaignPreparation.revision}` : 'not ready'} · ${analyzedAt || 'no completed pass'}`
        : state.canonBootstrapPending
        ? 'Full rebuild pending'
        : analyzed ? `Tale Fairy v${RUNTIME_VERSION} · ${state.mode} mode · world context updated ${analyzedAt || 'recently'}` : '';
    scratchpadText(board, 'scratchpad-meta', meta, 'No world analysis yet. Run Guide now or Full rebuild.');
    const campaignRecall = campaign ? readCampaignSnapshot().evidence : null;
    const continuityStatus = campaign ? campaignRecall.map(e => `${e.provider}: ${e.confidence || e.status}`).join('; ') || 'off'
        : analyzed ? continuityContextState(currentContext()).status : 'unavailable';
    const summaryAudit = state.summaryEvidence?.scannedAt ? state.summaryEvidence : lastSummaryAudit;
    const summaryStatus = !campaign && (summaryAudit.scannedAt || summaryAudit.count)
        ? ` · final summaries: ${summaryAudit.count} sources / ${summaryAudit.includedTokens.toLocaleString()} text tokens${summaryAudit.inputBudget ? ` · ${summaryAudit.tier}: ~${summaryAudit.inputTokens.toLocaleString()}/${summaryAudit.inputBudget.toLocaleString()} input tokens · raw excerpts: ${summaryAudit.recentTokens} tokens · historical witnesses: ${summaryAudit.historyCount}${summaryAudit.timelineEpochCount ? ` · story map: ${summaryAudit.timelineEpochCount} periods / ${summaryAudit.storyMessageCount} messages · older thread candidates: ${summaryAudit.openThreadCount}` : ''} · actors: ${summaryAudit.actorCount} · candidate pool: ${summaryAudit.candidateCount} sources / ${summaryAudit.candidateTokens} text tokens${summaryAudit.droppedLabels?.length ? ` · omitted sources: ${summaryAudit.droppedLabels.join(', ')}` : ''}` : ' (legacy evidence count)'}`
        : '';
    scratchpadText(board, 'scratchpad-continuity', campaign
        ? `Evidence availability for next planning pass: ${continuityStatus} (subject to input budget)`
        : `Direct Continuity connector: ${continuityStatus}${summaryStatus}`, 'Direct Continuity connector: unavailable');

    const profile = state.sceneProfile || {};
    const scene = [
        profile.promise && `Promise: ${profile.promise}`,
        `Read: ${profile.phase || 'developing'} · ${profile.emotionalDirection || 'preserve'} · pressure ${profile.pressure || 'none'} · intrusion ${profile.intrusion || 'closed'} · novelty ${profile.noveltyCeiling || 'incidental'}`,
        state.scene.activity && `Activity: ${state.scene.activity}`,
        state.scene.intent && `Intent: ${state.scene.intent}`,
        state.scene.location && `Location: ${state.scene.location}`,
        state.scene.time && `Time: ${state.scene.time}`,
        profile.basis && `Basis: ${profile.basis}`,
    ].filter(Boolean).join('\n');
    scratchpadText(board, 'scratchpad-scene', analyzed ? scene : '', 'No generated scene read yet.');

    const causal = state.causalContext || {};
    const conditionText = [
        causal.inject ? `Provider causal context: ${causal.injectReason || 'current relevant conditions'}` : 'Provider causal context: unavailable',
        ...(causal.conditions || []).map(item => `${item.confidence === 'tentative' ? '[Scratchpad only · tentative]' : `[${item.confidence} · ${item.disclosure} · ${item.kind}]`} ${item.subject} — ${item.condition}${item.relevance ? `\n  Relevance: ${item.relevance}` : ''}`),
        causal.basis && `Selection basis: ${causal.basis}`,
    ].filter(Boolean).join('\n');
    scratchpadText(board, 'scratchpad-next-guides', analyzed ? conditionText : '', 'No generated causal context yet.');

    const audit = state.responseAudit || {};
    const auditFlags = [
        audit.unjustifiedEscalation && 'unjustified escalation',
        audit.playerControl && 'player control',
        audit.continuityDrift && 'continuity drift',
    ].filter(Boolean);
    const auditText = audit.applicable ? [
        `Movement fit: ${audit.movementFit || 'not-applicable'} · repetition: ${audit.repetition || 'none'}`,
        auditFlags.length ? `Flags: ${auditFlags.join(' · ')}` : 'Flags: none',
        audit.patterns?.length ? `Observed patterns: ${audit.patterns.join('; ')}` : '',
        audit.stateChange ? `State change: ${audit.stateChange}` : '',
        audit.summary,
    ].filter(Boolean).join('\n') : '';
    scratchpadOptionalText(board, 'scratchpad-response-audit-section', 'scratchpad-response-audit', auditText);

    const frame = state.storyFrame.frame && state.storyFrame.frame !== 'unknown'
        ? `${state.storyFrame.frame}${state.storyFrame.confidence ? ` · ${state.storyFrame.confidence} confidence` : ''}${state.storyFrame.basis ? `\nBasis: ${state.storyFrame.basis}` : ''}`
        : '';
    const missingAnalysis = state.canonBootstrapPending
        ? `Full rebuild has not completed. ${state.lastReason || 'Waiting for a valid planner result.'}`
        : analyzed && /planner fallback/iu.test(state.lastReason)
            ? `Planner analysis failed. ${state.lastReason}`
            : '';
    scratchpadText(board, 'scratchpad-frame', analyzed ? frame : '', missingAnalysis || 'No generated story frame yet.');

    const lore = state.loreModel || {};
    const loreText = [
        lore.worldIdentity && `World: ${lore.worldIdentity}`,
        lore.baseline && `Baseline: ${lore.baseline}`,
        lore.variantRules?.length && `Supplied rules: ${lore.variantRules.join('; ')}`,
        lore.continuitySignatures?.length && `RP-specific canon: ${lore.continuitySignatures.join('; ')}`,
        lore.baselineDepartures?.length && `Departures: ${lore.baselineDepartures.join('; ')}`,
        lore.activeForces?.length && `Relevant forces: ${lore.activeForces.join('; ')}`,
    ].filter(Boolean).join('\n');
    scratchpadText(board, 'scratchpad-lore', analyzed ? loreText : '', missingAnalysis || 'No generated lore model yet.');

    const motiveText = formatHiddenMotives(state.hiddenMotives, analyzed);
    scratchpadOptionalText(board, 'scratchpad-hidden-motives-section', 'scratchpad-hidden-motives', motiveText);

    const previewContext = currentContext();
    const chatId = String(previewContext.getCurrentChatId?.() || '');
    const preparedSelection = generationGuideSelection?.chatId === chatId ? generationGuideSelection : null;
    const previewOptions = guideSelectionOptions(state, previewContext);
    const previewPayload = buildPromptPayload(state, { enabled: getSettings().enabled, generationType: activeGenerationType, ...previewOptions });
    const previewDynamic = guidanceSnapshot(state, previewOptions).dynamicContextIncluded
        && hasPlannerConditions(previewOptions.causalContext || state.causalContext);
    const nextPacket = preparedSelection && cachedGenerationContext(previewContext.chatMetadata?.[GENERATION_CONTEXT_KEY], preparedSelection.inputKey, chatId);
    const previewKind = preparedSelection
        ? preparedSelection.replacement ? 'CURRENT REGENERATION REQUEST' : 'CURRENT GENERATION REQUEST'
        : 'NEXT NORMAL GENERATION';
    const previewSettings = getSettings();
    const previewPlacement = previewSettings.injectionPosition === 'at-depth'
        ? `at-depth · ${previewSettings.injectionRole} · depth ${previewSettings.injectionDepth}`
        : `${previewSettings.injectionPosition} · ${previewSettings.injectionRole}`;
    const previewText = previewPayload
        ? `${previewKind} — ${generationPreviewDescription({ reused: preparedSelection?.reused, dynamic: previewDynamic, future: guidanceSnapshot(state, previewOptions).preparedContextIncluded,
            prepared: Boolean(preparedSelection), nextReady: Boolean(nextPacket?.selection.preparedUsable || nextPacket?.selection.usable && hasPlannerConditions(nextPacket.selection.causalContext)),
            deferred: !preparedSelection && replacementPlanningDeferred(previewContext), planning: Boolean(analysisPromise || campaignHostWork || campaignSession?.pending) })}.\nPlacement: ${previewPlacement}\n\n${previewPayload}`
        : !getSettings().enabled || !isStoryGeneration(activeGenerationType)
            ? 'Injection inactive for this request.'
        : isDirectionCurrent(state, messagesFromChat(previewContext.chat || []), chatId) && !state.lastInject
            ? 'Context awaiting refresh.'
            : analysisPromise
                ? 'Preparing context in the background.'
                : 'Awaiting current context.';
    scratchpadText(board, 'scratchpad-request-verification', previewText, 'No fresh Tale Fairy causal context is ready.');

    scratchpadOptionalText(board, 'scratchpad-continuity-section', 'scratchpad-continuity-processes', analyzed ? scratchpadList(state.continuityThreads, item => item?.thread ? `${item.thread} — ${item.state}` : '', '') : '');
    scratchpadOptionalText(board, 'scratchpad-entities-section', 'scratchpad-entities', analyzed ? scratchpadList(state.entities, item => item?.name ? `${item.name}${item.state ? ` — ${item.state}` : ''}${item.agenda ? ` · Agenda: ${item.agenda}` : ''}` : '', '') : '');
    scratchpadText(board, 'scratchpad-ledger', analyzed ? (state.plannerContract === 14 ? state.plannerMemory : state.contextLedger) : '', 'No current continuity memory yet.');
    scratchpadText(board, 'scratchpad-notes', campaign ? campaignAuthorInstructions(state).join('\n\n')
        : scratchpadList(state.userNotes, item => item?.text ? `[${String(item.kind || 'note').toUpperCase()}] ${item.text}` : '', ''), 'No user notes.');
    // Legacy data remains stored for migration, never displayed as freshly
    // generated by the replacement planner.
    for (const role of ['scratchpad-scene', 'scratchpad-frame', 'scratchpad-lore', 'scratchpad-hidden-motives',
        'scratchpad-response-audit', 'scratchpad-continuity-processes', 'scratchpad-entities', 'scratchpad-ledger']) {
        const section = board.querySelector(`[data-role="${role}"]`)?.closest('section');
        if (section) section.hidden = state.plannerContract === 14 || !board.querySelector(`[data-role="${role}"]`)?.textContent.trim();
    }
}
async function resetState({ rebuilding = false } = {}) {
    let context = currentContext();
    context.updateChatMetadata({ ...context.chatMetadata, [GENERATION_CONTEXT_KEY]: null, [REPLACEMENT_PENDING_KEY]: null });
    context = currentContext();
    if (rebuilding) {
        interruptAnalysis('A Full Rebuild replaced the previous Tale Fairy analysis.', 'Clearing old guide…');
    } else {
        stopAnalysis();
    }
    pendingRequestVerification = null;
    const cachedVerification = getSettings().lastProviderBoundVerification;
    if (cachedVerification?.chatId === String(context.getCurrentChatId?.() || '')) {
        delete getSettings().lastProviderBoundVerification;
        saveSettingsDebounced();
    }
    // SillyTavern merges chat metadata by default. Omitting STATE_KEY from a
    // normal update therefore leaves the previous Tale Fairy state intact.
    // Replacement mode removes only our key from the complete current
    // metadata snapshot while preserving every other chat/extension field.
    const visibleState = rebuilding
        ? await persistRebuildPending(context)
        : defaultState();
    if (!rebuilding) context.updateChatMetadata(clearState(context.chatMetadata), true);
    clearPromptManagerInjection(promptManager);
    setExtensionPrompt(PROMPT_KEY, '', 0, 0);
    renderBoard(visibleState);
    renderAnalysisActivity(rebuilding ? 'Old guide deleted · Full Rebuild saved as pending' : 'Guide state deleted', rebuilding);
    await context.saveMetadata?.();
}

async function rebuildGuideState() {
    if (campaignMode()) return startCampaignPlanning({ rebuild: true });
    // Delete the old guide first, but retain a content-free pending marker so a
    // failed or interrupted request resumes as a Full Rebuild after a reload.
    await resetState({ rebuilding: true });
    renderAnalysisActivity('Old guide deleted · starting Full Rebuild…', true);
    return analyzeNow({ force: true, rebuild: true, waitForContinuity: true });
}

async function reevaluateGuideState() {
    let context = currentContext();
    const chatId = String(context.getCurrentChatId?.() || '');
    await warmPlotWorldInputs(context);
    context = currentContext();
    if (String(context.getCurrentChatId?.() || '') !== chatId) return loadState(context.chatMetadata);
    const replacement = replacementPlanningDeferred(context);
    const messages = replacement ? messagesFromChat(context.chat || []).slice(0, context.chatMetadata[REPLACEMENT_PENDING_KEY].messageCount) : null;
    if (replacement) {
        deferReplacementPlanning(context, messages, { preserveSelection: true });
        context = currentContext();
    }
    const state = loadState(context.chatMetadata);
    state.plannerSchedule.manualRequested = true;
    const metadata = saveState(context.chatMetadata, state);
    if (replacement) metadata[REPLACEMENT_PENDING_KEY] = { ...metadata[REPLACEMENT_PENDING_KEY],
        repairAttemptedKey: plotInputKey(chatId, messages, generationInputs(context, state)), repairPolicyVersion: 6 };
    context.updateChatMetadata(metadata);
    scheduleVerificationPersistence(context);
    return analyzeNow({ force: true, messages, allowOneAssistantAppend: replacement });
}

function resetSettingsToDefaults(root = document.querySelector(`#${EXTENSION_ID}-settings`)) {
    if (typeof globalThis.confirm === 'function' && !globalThis.confirm('Reset all Tale Fairy settings to their defaults? Guide state in the current chat will be kept.')) return;
    stopAnalysis();
    pendingRequestVerification = null;
    directModelCache.clear();
    const s = getSettings();
    for (const key of Object.keys(s)) delete s[key];
    Object.assign(s, { ...DEFAULT_SETTINGS, fullReviewInterval: DEFAULT_REFRESH_INTERVAL });
    getSettings();
    saveSettingsDebounced();
    refreshConnectionProfiles(root);
    refreshControls(root);
    root?.classList.toggle('is-expanded', Boolean(s.showDirectorNotes));
    updatePrompt(loadState(currentContext().chatMetadata));
    renderBoard();
    renderAnalysisActivity('Settings reset to defaults', false);
}

async function upgradeLegacyPlanIfNeeded() {
    const context = currentContext();
    const rawState = context.chatMetadata?.[STATE_KEY];
    const rawVersion = Math.max(0, Number(rawState?.version) || 0);
    // An interceptor can normalize and save the new version before this startup
    // audit runs. The bootstrap flag must therefore remain an independent
    // migration marker until a fresh planner pass clears it.
    const upgradePending = rawVersion < STATE_VERSION || rawState?.canonBootstrapPending === true;
    const chatId = String(context.getCurrentChatId?.() || '');
    const messages = messagesFromChat(context.chat || []);
    const fingerprint = fingerprintMessages(messages);
    const attemptKey = `${chatId}:${rawVersion}:${Number(rawState?.canonBootstrapPending === true)}:${messages.length}`;
    if (!getSettings().enabled || !chatId || !messages.length || !rawState || !upgradePending || legacyUpgradeAttempts.has(attemptKey)) return;
    legacyUpgradeAttempts.add(attemptKey);
    const stopSequence = analysisStopSequence;
    let upgraded = loadState(context.chatMetadata);
    let completed = false;
    try {
        for (let attempt = 1; attempt <= LEGACY_UPGRADE_MAX_ATTEMPTS; attempt++) {
            const activeContext = currentContext();
            const activeMessages = messagesFromChat(activeContext.chat || []);
            if (!getSettings().enabled
                || analysisStopSequence !== stopSequence
                || String(activeContext.getCurrentChatId?.() || '') !== chatId
                || fingerprintMessages(activeMessages) !== fingerprint) return;
            const activity = rawState?.canonBootstrapPending === true && rawVersion >= STATE_VERSION
                ? `Resuming pending Full Rebuild · attempt ${attempt}/${LEGACY_UPGRADE_MAX_ATTEMPTS}…`
                : `Upgrading legacy Tale Fairy plan v${rawVersion} · attempt ${attempt}/${LEGACY_UPGRADE_MAX_ATTEMPTS}…`;
            renderAnalysisActivity(activity, true);
            upgraded = await analyzeNow({ messages, force: true, rebuild: true });
            const persistedState = currentContext().chatMetadata?.[STATE_KEY];
            const persistedVersion = Math.max(0, Number(persistedState?.version) || 0);
            // Version normalization can happen before a planner pass. A rebuild
            // is only complete once that pass has actually replaced the pending
            // bootstrap state and preserved its extracted canon.
            if (persistedVersion >= STATE_VERSION && persistedState?.canonBootstrapPending !== true) {
                completed = true;
                renderBoard(upgraded);
                renderAnalysisActivity(rawState?.canonBootstrapPending === true ? 'Full Rebuild completed' : 'Legacy plan upgraded', false);
                return;
            }
            if (attempt < LEGACY_UPGRADE_MAX_ATTEMPTS && analysisStopSequence === stopSequence) {
                const delay = 1500 * (2 ** (attempt - 1));
                renderAnalysisActivity(`Upgrade retrying in ${Math.round(delay / 1000)}s · ${lastAnalysisError || 'planner returned no saved plan'}`, true);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        renderBoard(upgraded);
        renderAnalysisActivity(`Upgrade pending · ${lastAnalysisError || 'planner returned no saved plan'}`, false);
    } finally {
        if (!completed) legacyUpgradeAttempts.delete(attemptKey);
    }
}

async function refreshCurrentPlanIfNeeded() {
    let context = currentContext();
    if (campaignMode(context)) return analyzeCampaignNow();
    const loadedChatId = String(context.getCurrentChatId?.() || '');
    await warmPlotWorldInputs(context);
    context = currentContext();
    if (String(context.getCurrentChatId?.() || '') !== loadedChatId) return loadState(context.chatMetadata);
    if (replacementPlanningDeferred(context)) {
        const recovered = await recoverDetachedPlannerJobs();
        if (recovered.recovered) return recovered.state;
        if (recovered.active || retryPlannerActive()) return loadState(currentContext().chatMetadata);
        await repairDeferredReplacementPlan();
        context = currentContext();
        const state = loadState(context.chatMetadata);
        updatePrompt(state);
        return state;
    }
    const recovered = await recoverDetachedPlannerJobs();
    if (recovered.recovered) return recovered.state;
    if (recovered.active) return loadState(context.chatMetadata);
    context = currentContext();
    const rawState = context.chatMetadata?.[STATE_KEY];
    const rawVersion = Math.max(0, Number(rawState?.version) || 0);
    const upgradePending = Boolean(rawState && ((rawVersion > 0 && rawVersion < STATE_VERSION) || rawState.canonBootstrapPending === true));
    if (upgradePending) return upgradeLegacyPlanIfNeeded();

    const chatId = String(context.getCurrentChatId?.() || '');
    const messages = messagesFromChat(context.chat || []);
    const fingerprint = fingerprintMessages(messages);
    const interrupted = plannerWasInterrupted(plannerStorage(), chatId, fingerprint);
    const state = loadState(context.chatMetadata);
    if (!getSettings().enabled || !chatId || !messages.length) {
        updatePrompt(state);
        return state;
    }
    if (!rawState) {
        const pending = await persistRebuildPending(context);
        updatePrompt(pending);
        renderBoard(pending);
        renderAnalysisActivity('No saved plan · starting Full Rebuild…', true);
        return analyzeNow({ messages, force: true, rebuild: true, allowOneUserAppend: true, waitForContinuity: true });
    }
    if (plannerFailedForSnapshot(plannerStorage(), chatId, fingerprint)) {
        updatePrompt(state);
        renderAnalysisActivity('Planner paused after unusable output · waiting for a new turn or Guide now', false);
        return state;
    }
    const directionMissing = !plannerInputsMatch(state, messages, context) || !isDirectionCurrent(state, messages, chatId);
    const decision = interrupted
        ? { shouldRun: true, code: 'interrupted', reason: 'A previously interrupted planner run must be recovered.' }
        : directionMissing
            ? { shouldRun: true, code: 'missing-direction', reason: 'No fresh causal context is ready for the next generation.' }
        : plannerRefreshDecision({ state, messages, event: 'load' });
    state.plannerSchedule = withRefreshReason(state.plannerSchedule, decision);
    context.updateChatMetadata(saveState(context.chatMetadata, state));
    updatePrompt(state);
    if (!decision.shouldRun) return state;
    return analyzeNow({ messages, force: true, allowOneUserAppend: true, waitForContinuity: true });
}

async function mountUI() {
    const s = getSettings();
    const target = document.querySelector('#extensions_settings2')
        || document.querySelector('#extensions_settings');
    if (!target || document.querySelector(`#${EXTENSION_ID}-settings`)) return Boolean(target);
    if (uiMountPromise) return uiMountPromise;

    uiMountPromise = (async () => {
    // Load the template relative to this module so the extension works from
    // third-party/Tale-Fairy as well as any legacy installation directory.
    const response = await fetch(new URL(`./settings.html?v=${RUNTIME_VERSION}`, import.meta.url));
    if (!response.ok) {
        throw new Error(`Could not load Tale Fairy settings: ${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    const mountTarget = document.querySelector('#extensions_settings2')
        || document.querySelector('#extensions_settings');
    if (!mountTarget || document.querySelector(`#${EXTENSION_ID}-settings`)) return Boolean(mountTarget);
    mountTarget.insertAdjacentHTML('beforeend', html);
    const root = document.querySelector(`#${EXTENSION_ID}-settings`);
    root.querySelector('[data-setting="enabled"]').checked = s.enabled;
    root.querySelector('[data-setting="reasoning"]').value = campaignMode() ? s.analysisReasoningMode : 'off';
    root.querySelector('[data-setting="temperature-slider"]').value = s.analysisTemperature;
    root.querySelector('[data-setting="temperature"]').value = s.analysisTemperature;
    root.querySelector('[data-setting="model"]').value = s.analysisModel;
    root.querySelector('[data-setting="url"]').value = s.analysisUrl;
    root.querySelector('[data-setting="continuity"]').checked = Boolean(s.continuityIntegration);
    root.querySelector('[data-setting="recent-budget"]').value = s.recentContextTokens;
    root.querySelector('[data-setting="summary-budget"]').value = s.summaryContextTokens;
    root.querySelector('[data-setting="budget"]').value = s.maxPromptTokens;
    root.querySelector('[data-setting="routine-budget"]').value = s.routineInputTokens;
    root.querySelector('[data-setting="review-budget"]').value = s.reviewInputTokens;
    root.querySelector('[data-setting="injection-position"]').value = s.injectionPosition;
    root.querySelector('[data-setting="injection-depth"]').value = s.injectionDepth;
    root.querySelector('[data-setting="injection-role"]').value = s.injectionRole;
    root.querySelector('[data-setting="note"]').value = '';
    const save = () => { saveSettingsDebounced(); updatePrompt(loadState(currentContext().chatMetadata)); refreshControls(root); };
    const invalidatePlanner = () => {
        generationRevision++;
        cancelRunningAnalysis('Planner settings changed during analysis.', 'Settings changed');
    };
    root.querySelector('[data-setting="enabled"]').addEventListener('change', e => {
        s.enabled = e.target.checked;
        if (!s.enabled) stopAnalysis();
        save();
    });
    root.querySelector('[data-setting="pacing"]').addEventListener('change', e => {
        invalidatePlanner();
        const context = currentContext();
        const state = loadState(context.chatMetadata);
        const keepPreparation = preparedReady(state, messagesFromChat(context.chat || []), context);
        state.pacing = { ...state.pacing, mode: e.target.value };
        if (keepPreparation) state.preparedWorld = stampPreparedWorld(state.preparedWorld, {
            ...state.preparedWorld.source,
            inputsKey: plotInputKey(String(context.getCurrentChatId?.() || ''), [], generationInputs(context, state)),
        });
        generationGuideSelection = null;
        context.updateChatMetadata(saveState(context.chatMetadata, state));
        updatePrompt(state);
        renderBoard(state);
        scheduleVerificationPersistence(context);
        void queueLatestAnalysis({ chatId: String(context.getCurrentChatId?.() || '') });
    });
    root.querySelector('[data-setting="connection"]').addEventListener('change', e => { invalidatePlanner(); applyAnalysisConnectionChoice(e.target.value, s); save(); });
    root.querySelector('[data-setting="reasoning"]').addEventListener('change', e => { invalidatePlanner(); s.analysisReasoningMode = normalizeReasoningMode(e.target.value); save(); });
    const updateTemperature = value => {
        s.analysisTemperature = normalizePlannerTemperature(value);
        root.querySelector('[data-setting="temperature-slider"]').value = s.analysisTemperature;
        root.querySelector('[data-setting="temperature"]').value = s.analysisTemperature;
        invalidatePlanner();
        save();
    };
    root.querySelector('[data-setting="temperature-slider"]').addEventListener('input', e => updateTemperature(e.target.value));
    root.querySelector('[data-setting="temperature"]').addEventListener('change', e => updateTemperature(e.target.value));
    root.querySelector('[data-setting="model"]').addEventListener('change', e => { invalidatePlanner(); s.analysisModel = e.target.value.trim(); rememberDirectSettings(s); save(); });
    root.querySelector('[data-setting="model-list"]').addEventListener('change', e => {
        const model = String(e.target.value || '').trim();
        if (!model) return;
        invalidatePlanner();
        s.analysisModel = model;
        rememberDirectSettings(s);
        save();
    });
    root.querySelector('[data-setting="url"]').addEventListener('change', e => {
        invalidatePlanner();
        directModelCache.delete(directModelCacheKey(s));
        s.analysisUrl = e.target.value.trim();
        rememberDirectSettings(s);
        save();
    });
    root.querySelector('[data-setting="continuity"]').addEventListener('change', e => { invalidatePlanner(); s.continuityIntegration = e.target.checked; save(); });
    root.querySelector('[data-setting="full-review-interval"]').addEventListener('change', e => { s.fullReviewInterval = normalizePlannerSchedule({ refreshInterval: e.target.value }).refreshInterval; e.target.value = s.fullReviewInterval; save(); });
    root.querySelector('[data-setting="recent-budget"]').addEventListener('change', e => { invalidatePlanner(); s.recentContextTokens = Math.max(1000, Math.min(12000, Number(e.target.value) || DEFAULT_SETTINGS.recentContextTokens)); e.target.value = s.recentContextTokens; save(); });
    root.querySelector('[data-setting="summary-budget"]').addEventListener('change', e => { invalidatePlanner(); s.summaryContextTokens = Math.max(1000, Math.min(8000, Number(e.target.value) || 4000)); e.target.value = s.summaryContextTokens; save(); });
    root.querySelector('[data-setting="budget"]').addEventListener('change', e => { invalidatePlanner(); s.maxPromptTokens = Math.max(9000, Math.min(30000, Number(e.target.value) || DEFAULT_SETTINGS.maxPromptTokens)); e.target.value = s.maxPromptTokens; save(); });
    for (const [key, setting, fallback] of [['routine-budget', 'routineInputTokens', DEFAULT_ROUTINE_INPUT], ['review-budget', 'reviewInputTokens', DEFAULT_REVIEW_INPUT]]) {
        root.querySelector(`[data-setting="${key}"]`).addEventListener('change', e => { invalidatePlanner(); s[setting] = normalizeInputBudget(e.target.value, fallback); e.target.value = s[setting]; save(); });
    }
    root.querySelector('[data-setting="injection-position"]').addEventListener('change', e => { s.injectionPosition = e.target.value; save(); });
    root.querySelector('[data-setting="injection-depth"]').addEventListener('change', e => { s.injectionDepth = Math.min(100, Math.max(0, Number(e.target.value) || 0)); e.target.value = s.injectionDepth; save(); });
    root.querySelector('[data-setting="injection-role"]').addEventListener('change', e => { s.injectionRole = e.target.value; save(); });
    root.querySelector('[data-action="save-key"]')?.addEventListener('click', async () => {
        const value = root.querySelector('[data-setting="key"]').value.trim();
        if (!value) return;
        invalidatePlanner();
        const slot = s.analysisProvider === 'openrouter' ? SECRET_KEYS.OPENROUTER : SECRET_KEYS.CUSTOM;
        s.analysisSecretId = await writeSecret(slot, value, 'Tale Fairy analysis key');
        root.querySelector('[data-setting="key"]').value = '';
        save();
    });
    root.querySelector('[data-action="fetch-models"]').addEventListener('click', () => void fetchDirectModels(root));
    refreshConnectionProfiles(root);
    root.querySelector('[data-action="guide"]').addEventListener('click', async () => {
        await reevaluateGuideState();
        renderBoard();
    });
    root.querySelector('[data-action="rebuild"]').addEventListener('click', async () => {
        await rebuildGuideState();
        renderBoard();
    });
    root.querySelector('[data-action="stop"]').addEventListener('click', stopAnalysis);
    root.querySelector('[data-action="reset-settings"]').addEventListener('click', () => resetSettingsToDefaults(root));
    root.querySelector('[data-action="reset"]').addEventListener('click', resetState);
    root.querySelector('[data-action="note"]').addEventListener('click', async () => {
        const text = root.querySelector('[data-setting="note"]').value.trim();
        if (!text) return;
        const submittedAt = Date.now();
        let finalResult = await analyzeNow({ note: text, force: true });
        if (finalResult.noteNeedsClarification) {
            const answer = globalThis.prompt?.('Tale Fairy is unsure how to apply this instruction. Enter: suggest, correct, establish, or forbid.', 'suggest')?.trim().toLowerCase();
            const kind = ['suggest', 'correct', 'establish', 'forbid'].includes(answer) ? answer : '';
            if (kind) finalResult = await persistClarifiedNote(text, kind);
            else renderAnalysisActivity('Instruction not applied', false);
        }
        const saved = [...finalResult.userNotes, ...(finalResult.campaignInstructions || [])].some(item => item.at >= submittedAt);
        if (saved) root.querySelector('[data-setting="note"]').value = '';
        renderBoard();
    });
    root.querySelector('[data-action="board"]').addEventListener('click', () => { s.showDirectorNotes = !s.showDirectorNotes; root.classList.toggle('is-expanded', s.showDirectorNotes); saveSettingsDebounced(); });
    root.classList.toggle('is-expanded', Boolean(s.showDirectorNotes));
    refreshControls(root);
    const planning = Boolean(analysisPromise || campaignHostWork || campaignSession?.pending);
    renderAnalysisActivity(planning ? 'Planning…' : 'Ready', planning);
    renderInjectionActivity();
    renderBoard();
    void upgradeLegacyPlanIfNeeded();
    return true;
    })().finally(() => { uiMountPromise = null; });
    return uiMountPromise;
}

function stopUIMountObserver() {
    uiMountObserver?.disconnect();
    uiMountObserver = null;
    if (uiMountTimeout) clearTimeout(uiMountTimeout);
    uiMountTimeout = null;
}

function startUIMounting() {
    if (document.querySelector(`#${EXTENSION_ID}-settings`)) {
        stopUIMountObserver();
        return;
    }
    const attemptMount = () => {
        void mountUI().then(mounted => {
            if (mounted && document.querySelector(`#${EXTENSION_ID}-settings`)) stopUIMountObserver();
        }).catch(error => console.warn(`[${EXTENSION_ID}] settings UI was not mounted`, error));
    };
    if (!uiMountObserver && document.documentElement) {
        uiMountObserver = new MutationObserver(attemptMount);
        uiMountObserver.observe(document.documentElement, { childList: true, subtree: true });
        uiMountTimeout = setTimeout(stopUIMountObserver, UI_MOUNT_TIMEOUT_MS);
    }
    attemptMount();
}

function refreshControls(root = document.querySelector(`#${EXTENSION_ID}-settings`)) {
    if (!root) return;
    const s = getSettings();
    root.querySelector('[data-setting="pacing"]').value = loadState(currentContext().chatMetadata).pacing.mode;
    const source = s.analysisSource;
    const direct = source === 'direct' || source === 'openrouter';
    root.querySelector('[data-setting="enabled"]').checked = Boolean(s.enabled);
    root.querySelector('[data-setting="temperature-slider"]').value = s.analysisTemperature;
    root.querySelector('[data-setting="temperature"]').value = s.analysisTemperature;
    root.querySelector('[data-setting="connection"]').value = analysisConnectionChoice(s);
    root.querySelector('[data-source-panel="direct"]').hidden = !direct;
    root.querySelector('[data-setting="model"]').value = s.analysisModel;
    root.querySelector('[data-setting="url"]').value = s.analysisUrl;
    root.querySelector('[data-setting="continuity"]').checked = Boolean(s.continuityIntegration);
    root.querySelector('[data-setting="full-review-interval"]').value = s.fullReviewInterval;
    root.querySelector('[data-setting="recent-budget"]').value = s.recentContextTokens;
    root.querySelector('[data-setting="summary-budget"]').value = s.summaryContextTokens;
    root.querySelector('[data-setting="budget"]').value = s.maxPromptTokens;
    root.querySelector('[data-setting="routine-budget"]').value = s.routineInputTokens;
    root.querySelector('[data-setting="review-budget"]').value = s.reviewInputTokens;
    root.querySelector('[data-setting="injection-position"]').value = s.injectionPosition;
    root.querySelector('[data-setting="injection-depth"]').value = s.injectionDepth;
    root.querySelector('[data-setting="injection-role"]').value = s.injectionRole;
    root.querySelector('[data-placement-depth]').hidden = s.injectionPosition !== 'at-depth';
    const directTitle = root.querySelector('[data-role="direct-title"]');
    if (directTitle) directTitle.textContent = source === 'openrouter' ? 'Direct OpenRouter planner API' : 'Direct OpenAI-compatible / proxy API';
    const saved = Boolean(s.analysisSecretId) && Object.values(secret_state || {}).some(list => Array.isArray(list) && list.some(item => item?.id === s.analysisSecretId));
    const keyStatus = root.querySelector('[data-role="key-status"]');
    if (keyStatus) keyStatus.textContent = saved ? 'A password/key is saved in SillyTavern.' : 'No password/key saved; keyless endpoints are supported.';
    renderDirectModelOptions(root);
}

export async function livingWorldGuideGenerateInterceptor(_chat, _contextSize, _abort, type) {
    activeGenerationType = String(type || '');
    renderInjectionActivity(!getSettings().enabled ? 'Disabled'
        : isStoryGeneration(type) ? 'Preparing plot context' : 'Not used for this request type');
    const context = currentContext();
    if (!isStoryGeneration(activeGenerationType) || !getSettings().enabled) {
        updatePrompt(loadState(context.chatMetadata));
        return;
    }
    const state = prepareAuthorContract(loadState(context.chatMetadata), type);
    // Normal planning never blocks generation. The completed-turn guide is
    // already in metadata and the latest user action has absolute priority.
    prepareGenerationGuide(state, type);
    // Planning is strictly ahead-of-time. Never spend roleplay-generation
    // latency on a planner request. A local plot anchor is always available;
    // unverified world facts are withheld and replacements reuse their packet.
    updatePrompt(state);
    renderBoard(state);
}

// SillyTavern resolves manifest.generate_interceptor through globalThis.
// Keep the named export for module consumers while also supporting the host
// interceptor registry used by current and older builds.
globalThis.livingWorldGuideGenerateInterceptor = livingWorldGuideGenerateInterceptor;

function bindContinuityBridge() {
    continuityUnsubscribe?.();
    continuityUnsubscribe = null;
    const bridge = globalThis.continuityMemoryBridge;
    if (!getSettings().continuityIntegration || typeof bridge?.subscribe !== 'function') return;
    continuityUnsubscribe = bridge.subscribe(snapshot => {
        const context = currentContext();
        if (!getSettings().continuityIntegration) return;
        if (replacementPlanningDeferred(context)) return;
        const chatId = String(context.getCurrentChatId?.() || '');
        if (!chatId || String(snapshot?.chatId || '') !== chatId || snapshot?.status !== 'current') return;
        const revision = Number(snapshot.revision || 0);
        if (!revision || revision <= continuityReplacementRevision) return;
        continuityReplacementRevision = revision;
        if (campaignMode(context)) {
            readCampaignContinuity(context, bridge);
            // CM publications may arrive after the reply. Let the existing
            // interval/attempt policy decide; never reconcile legacy notebooks
            // or start an extra pass for every memory publication.
            void analyzeCampaignNow();
            return;
        }
        let state = loadState(context.chatMetadata);
        const reconciled = reconcileStateWithContinuity(state, {
            planningEvidence: Array.isArray(snapshot.planningEvidence) ? snapshot.planningEvidence : [],
        });
        if (reconciled.changed) {
            state = reconciled.state;
            context.updateChatMetadata(saveState(context.chatMetadata, state));
            updatePrompt(state);
            renderBoard(state);
            if (typeof context.saveMetadata === 'function') {
                void context.saveMetadata().catch(error => console.warn(`[${EXTENSION_ID}] Could not persist Continuity reconciliation`, error));
            }
        }
        // lastInject means the direction is eligible, not that it reached a
        // generation request. Only the request-selection lifecycle marks use.
        const planAlreadyUsed = Boolean(pendingRequestVerification || generationGuideSelection);
        if (planAlreadyUsed && !analysisPromise) return;
        if (analysisPromise) {
            if (Number(state.continuityRevisionUsed || 0) >= revision) return;
            void queueLatestAnalysis({ chatId, note: null, allowStaleContinuity: false });
            return;
        }
        if (Number(state.continuityRevisionUsed || 0) >= revision) return;
        void queueLatestAnalysis({ chatId, allowStaleContinuity: false });
    });
}

// The generation interceptor runs before SillyTavern assembles the provider
// payload. Verify the finished request too and insert the current dynamic guide
// if another prompt path omitted it.
eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, ensureChatCompletionRequestGuidance);
eventSource.on(event_types.CHAT_COMPLETION_SETTINGS_READY, ensureProviderChatRequestGuidance);
eventSource.on(event_types.GENERATE_AFTER_COMBINE_PROMPTS, ensureTextCompletionRequestGuidance);
eventSource.on(event_types.GENERATION_STARTED, (type, _options, dryRun) => {
    if (dryRun) return;
    clearAutomaticReplyRepair();
    activeGenerationType = String(type || '');
    if (type === 'swipe' || type === 'regenerate') {
        deferReplacementPlanning();
        // Reusing a packet with only fallback text is not a completed plan.
        // Start its bounded repair without making story generation wait.
        const repairChatId = String(currentContext().getCurrentChatId?.() || '');
        const stopSequence = analysisStopSequence;
        setTimeout(() => {
            if (stopSequence !== analysisStopSequence || repairChatId !== String(currentContext().getCurrentChatId?.() || '')) return;
            void repairDeferredReplacementPlan();
        }, 0);
    } else if (isStoryGeneration(type)) {
        const context = currentContext();
        // Continue is a real continuation, unlike a replacement. Release the
        // deferred selected reply even when no new user message was appended.
        if (context.chatMetadata?.[REPLACEMENT_PENDING_KEY] && (type === 'continue' || !replacementPlanningDeferred(context))) {
            context.updateChatMetadata({ ...context.chatMetadata, [REPLACEMENT_PENDING_KEY]: null });
            void queueLatestAnalysis({ chatId: String(context.getCurrentChatId?.() || ''), allowStaleContinuity: true });
        }
    }
    updatePrompt(loadState(currentContext().chatMetadata));
    recordRuntimeStage('generation-started', { generationType: activeGenerationType });
});
eventSource.on(event_types.GENERATION_ENDED, () => {
    activeGenerationType = '';
    recordRuntimeStage('generation-ended');
    // MESSAGE_RECEIVED is the primary successor trigger, but some stopped or
    // empty generations do not emit it consistently. Recheck after the host
    // finishes committing the result so Tale Fairy cannot remain stranded
    // with only a used/stale direction.
    const scheduledChatId = String(currentContext().getCurrentChatId?.() || '');
    const stopSequence = analysisStopSequence;
    setTimeout(() => {
        const context = currentContext();
        const chatId = String(context.getCurrentChatId?.() || '');
        const messages = messagesFromChat(context.chat || []);
        const state = loadState(context.chatMetadata);
        if (stopSequence !== analysisStopSequence || chatId !== scheduledChatId
            || !getSettings().enabled || !chatId || !messages.length) return;
        if (replacementPlanningDeferred(context)) {
            void repairDeferredReplacementPlan();
            return;
        }
        if (isDirectionCurrent(state, messages, chatId)) return;
        void queueLatestAnalysis({ chatId, allowStaleContinuity: true });
    }, 0);
});

if (event_types.GENERATION_STOPPED) eventSource.on(event_types.GENERATION_STOPPED, () => {
    clearAutomaticReplyRepair();
    activeGenerationType = '';
    recordRuntimeStage('generation-stopped');
    clearTranscriptRefresh();
    if (pendingRequestVerification) renderInjectionActivity('Generation stopped · reply not confirmed');
    pendingRequestVerification = null;
    generationGuideSelection = null;
    renderBoard();
    // Some host paths emit GENERATION_STOPPED without MESSAGE_RECEIVED or a
    // reliable trailing GENERATION_ENDED. Recover the successor directly so
    // the board cannot remain stranded on a consumed direction.
    const scheduledChatId = String(currentContext().getCurrentChatId?.() || '');
    const stopSequence = analysisStopSequence;
    setTimeout(() => {
        const context = currentContext();
        const chatId = String(context.getCurrentChatId?.() || '');
        const messages = messagesFromChat(context.chat || []);
        const state = loadState(context.chatMetadata);
        if (stopSequence !== analysisStopSequence || chatId !== scheduledChatId
            || !getSettings().enabled || !chatId || !messages.length) return;
        if (replacementPlanningDeferred(context)) {
            void repairDeferredReplacementPlan();
            return;
        }
        if (isDirectionCurrent(state, messages, chatId)) return;
        void queueLatestAnalysis({ chatId, allowStaleContinuity: true });
    }, 0);
});
eventSource.on(event_types.MESSAGE_RECEIVED, () => {
    if (campaignMode()) {
        confirmReturnedReplyUsedGuidance();
        generationGuideSelection = null;
        const state = loadState(currentContext().chatMetadata);
        updatePrompt(state);
        renderBoard(state);
        void analyzeCampaignNow();
        return;
    }
    const receivedChatId = String(currentContext().getCurrentChatId?.() || '');
    const supersededIntent = analysisPromise ? activeAnalysisIntent : null;
    if (!retryPlannerActive() && !runningSourceHasOnlyAppends()) generationRevision++;
    confirmReturnedReplyUsedGuidance();
    generationGuideSelection = null;
    const context = currentContext();
    if (String(context.getCurrentChatId?.() || '') !== receivedChatId) return;
    const messages = messagesFromChat(context.chat || []);
    const state = loadState(context.chatMetadata);
    const turn = assistantTurnNumber(messages);
    const responseKey = `${String(context.getCurrentChatId?.() || '')}:${turn}`;
    const replacement = replacementPlanningDeferred(context) || state.plannerSchedule.lastCountedResponseKey === responseKey;
    if (!replacement) state.plannerSchedule = markAssistantTurn(state.plannerSchedule, responseKey);
    const decision = plannerRefreshDecision({ state, messages, event: replacement ? 'replacement' : 'turn', swipe: replacement });
    state.plannerSchedule = withRefreshReason(state.plannerSchedule, decision);
    context.updateChatMetadata(saveState(context.chatMetadata, state));
    updatePrompt(state);
    renderBoard(state);
    const unusableReply = classifyAssistantReply(messages);
    if (getSettings().enabled
        && unusableReply.unusable
        && !replyRepairInFlight
        && state.replyRepair.attemptedResponseKey !== responseKey) {
        state.replyRepair = {
            attemptedResponseKey: responseKey,
            reason: unusableReply.reason,
            attemptedAt: Date.now(),
        };
        context.updateChatMetadata(saveState(context.chatMetadata, state));
        scheduleAutomaticReplyRepair({
            chatId: String(context.getCurrentChatId?.() || ''),
            responseKey,
            reason: unusableReply.reason,
        });
    }
    // Replacement replies defer their successor until a real continuation.
    // All automatic scheduling paths share the same persisted deferral guard.
    const freshDirectionNeeded = !isDirectionCurrent(state, messages, String(context.getCurrentChatId?.() || ''));
    if (!replacement && getSettings().enabled && (decision.shouldRun || supersededIntent || freshDirectionNeeded)) {
        void queueLatestAnalysis({
            ...supersededIntent,
            chatId: String(context.getCurrentChatId?.() || ''),
            allowStaleContinuity: true,
        });
    }
});
if (event_types.MESSAGE_SENT) eventSource.on(event_types.MESSAGE_SENT, () => {
    // analyzeNow allows exactly one appended user turn. Keep that completed-
    // response plan alive while the next reply generates instead of cancelling
    // the only planner call before it can ever persist in a fast conversation.
    generationGuideSelection = null;
    const context = currentContext();
    const messages = messagesFromChat(context.chat || []);
    if (context.chatMetadata?.[REPLACEMENT_PENDING_KEY] && !replacementPlanningDeferred(context)) {
        context.updateChatMetadata({ ...context.chatMetadata, [REPLACEMENT_PENDING_KEY]: null });
        void queueLatestAnalysis({ chatId: String(context.getCurrentChatId?.() || ''), allowStaleContinuity: true });
    }
    if (analysisPromise && activeAnalysisMessageCount && exceedsAppendAllowance(activeAnalysisMessageCount, messages.length)) {
        if (!runningSourceHasOnlyAppends(context)) generationRevision++;
        void queueLatestAnalysis({ chatId: String(context.getCurrentChatId?.() || '') });
    }
    const state = prepareAuthorContract(loadState(context.chatMetadata));
    updatePrompt(state);
    renderBoard(state);
});
for (const event of [event_types.MESSAGE_EDITED, event_types.MESSAGE_UPDATED, event_types.MESSAGE_DELETED]) {
    if (event) eventSource.on(event, () => {
        if (event === event_types.MESSAGE_DELETED || event === event_types.MESSAGE_EDITED) {
            const context = currentContext();
            const messages = generationRetrySource(messagesFromChat(context.chat || []), event === event_types.MESSAGE_EDITED);
            const chatId = String(context.getCurrentChatId?.() || '');
            const key = plotInputKey(chatId, messages, generationInputs(context, loadState(context.chatMetadata)));
            if (cachedGenerationContext(context.chatMetadata?.[GENERATION_CONTEXT_KEY], key, chatId)) {
                deferReplacementPlanning(context, messages);
                updatePrompt(loadState(currentContext().chatMetadata));
                renderBoard();
                return;
            }
        }
        scheduleTranscriptRefresh('The chat changed while Tale Fairy was analyzing.');
    });
}
eventSource.on(event_types.MESSAGE_SWIPED, messageId => {
    clearAutomaticReplyRepair();
    clearTranscriptRefresh();
    const context = currentContext();
    deferReplacementPlanning(context);
    const state = loadState(currentContext().chatMetadata);
    updatePrompt(state);
    renderBoard(state);
    // A discarded wording never advances clocks or spends a planner call.
    // Newly generated replacements reuse the archived response contract.
});
for (const event of [event_types.WORLDINFO_UPDATED, event_types.WORLDINFO_SETTINGS_UPDATED, event_types.CHARACTER_EDITED, event_types.PERSONA_CHANGED, event_types.PERSONA_UPDATED]) {
    if (event) eventSource.on(event, () => {
        if (!generationGuideSelection) return;
        const context = currentContext();
        const chatId = String(context.getCurrentChatId?.() || '');
        const messages = generationRetrySource(messagesFromChat(context.chat || []), generationGuideSelection.replacement);
        const key = plotInputKey(chatId, messages, generationInputs(context, loadState(context.chatMetadata)));
        if (generationGuideSelection.inputKey !== key) generationGuideSelection = null;
    });
}
eventSource.on(event_types.CHAT_CHANGED, () => {
    clearAutomaticReplyRepair();
    activeGenerationType = '';
    renderInjectionActivity('No request verified in this chat on this page');
    clearTranscriptRefresh();
    pendingRequestVerification = null;
    generationGuideSelection = null;
    generationRevision++;
    cancelRunningAnalysis('The active chat changed while Tale Fairy was analyzing.', 'Ready');
    updatePrompt(loadState(currentContext().chatMetadata));
    // Refresh stale causal context as well as migrating legacy state. The
    // planner remains non-blocking and identical in-flight work is reused.
    setTimeout(() => {
        renderBoard();
        void refreshCurrentPlanIfNeeded();
    }, 0);
});
for (const event of [event_types.CONNECTION_PROFILE_CREATED, event_types.CONNECTION_PROFILE_UPDATED, event_types.CONNECTION_PROFILE_DELETED]) {
    if (event) eventSource.on(event, () => refreshConnectionProfiles());
}
// Third-party modules can load before the Extensions settings drawer exists.
// Observe briefly instead of assuming one startup event is late enough.
eventSource.on(event_types.EXTENSIONS_FIRST_LOAD, startUIMounting);
startUIMounting();
bindContinuityBridge();
setTimeout(bindContinuityBridge, 0);
recordRuntimeStage('runtime-loaded');
// CHAT_CHANGED may fire before a third-party module finishes loading. Audit
// the active beat once on startup as well, so stale or legacy guidance is
// replaced without waiting for another assistant response.
setTimeout(() => void refreshCurrentPlanIfNeeded(), 0);
setInterval(() => void recoverDetachedPlannerJobs(), 3000);

// Android may discard or freeze the page while SillyTavern itself remains
// available. Release only this page's wait and Web Lock: the SillyTavern server
// continues the detached model request. A restored or newly loaded page polls
// the retained job and saves its result into chat metadata.
globalThis.addEventListener?.('pagehide', () => {
    interruptAnalysis('Tale Fairy page is shutting down.', '');
});
globalThis.addEventListener?.('pageshow', () => {
    setTimeout(() => void refreshCurrentPlanIfNeeded(), 0);
});
globalThis.addEventListener?.('focus', () => void recoverDetachedPlannerJobs());
globalThis.document?.addEventListener?.('visibilitychange', () => {
    if (globalThis.document.visibilityState === 'visible') void recoverDetachedPlannerJobs();
});
