import { eventSource, event_types, extension_prompt_roles, extension_prompt_types, generateRaw, Generate, setExtensionPrompt, getRequestHeaders, getCharacterCardFields, saveSettingsDebounced } from '/script.js';
import { getContext } from '/scripts/st-context.js';
import { extension_settings } from '/scripts/extensions.js';
import { ConnectionManagerRequestService } from '/scripts/extensions/shared.js';
import { SECRET_KEYS, secret_state, writeSecret } from '/scripts/secrets.js';
import { oai_settings, openai_setting_names, openai_settings, promptManager } from '/scripts/openai.js';
import { abstractIncrementalVisibleBranches, AnalysisValidationError, alignRetainedStateToTranscript, applyAnalysis, ANALYSIS_OUTPUT_CONTRACT, ANALYSIS_SCHEMA, buildAnalysisPrompt, extractJson, INCREMENTAL_ANALYSIS_OUTPUT_CONTRACT, INCREMENTAL_ANALYSIS_SCHEMA, INCREMENTAL_SYSTEM, normalizeAnalysisActorUpdates, normalizeAnalysisDiagnostics, SYSTEM, transcriptHeadAlignmentErrors, validateAnalysisResult } from './analysis.js?v=0.13.10';
import { applyPlannerAuthorLayer, buildPromptPayload, clearState, defaultState, fingerprintMessages, generationRetrySource, guidanceSnapshot, isAnalysisSourceCurrent, isDirectionCurrent, isGuidanceUsable, isReplacementVerificationCurrent, isStateAligned, loadState, reconcileContinuityThreads, returnedReplyMatchesVerification, saveState, STATE_KEY, STATE_VERSION } from './state.js?v=0.13.11';
import { isStoryGeneration } from './game-master.js?v=0.13.9';
import { selectSituationalOpenings } from './situations.js?v=0.13.9';
import { DEFAULT_REFRESH_INTERVAL, markAssistantTurn, normalizePlannerSchedule, plannerPassDecision, plannerRefreshDecision, withRefreshReason } from './planner-scheduler.js?v=0.13.9';
import { resolveInjectionPlacement } from './injection-placement.js?v=0.13.9';
import { DEFAULT_INJECTION_ROLE, normalizeInjectionRole } from './injection-role.js?v=0.13.9';
import { clearPromptManagerInjection, configurePromptManagerInjection } from './prompt-manager-injection.js?v=0.13.9';
import { chatHasCurrentGuidance, ensureGuidanceInChat, ensureGuidanceInText, extractTaleFairyContext, requestContainsMarker, textHasCurrentGuidance } from './request-injection.js?v=0.13.9';
import { normalizeModelListResponse } from './models.js?v=0.13.9';
import { buildReasoningRequest, isMandatoryReasoningError, isReasoningControlError, normalizeReasoningMode, reasoningFallbackPayload, resolveReasoningMode } from './reasoning-policy.js?v=0.13.9';
import { readContinuityBridge, waitForContinuityBridge } from './continuity.js?v=0.13.9';
import { isPlannerTimeoutError, plannerRetryDelay, shouldRetryPlannerError } from './retry-policy.js?v=0.13.9';
import { collectSummarySources } from './summary-context.js?v=0.13.9';
import { estimateTokenCount } from './token-budget.js?v=0.13.9';
import { fitPromptToBudget, plannerEvidenceAudit } from './prompt-budget.js?v=0.13.9';
import { DEFAULT_ROUTINE_INPUT, DEFAULT_REVIEW_INPUT, normalizeInputBudget, plannerBudgets } from './planner-budgets.js?v=0.13.9';
import { relevantActors } from './evidence-selection.js?v=0.13.9';
import { completionText } from './completion-response.js?v=0.13.9';
import { sampleDirectorSignals } from './director-sampling.js?v=0.13.9';
import { customOutputPayload, detachedPlannerFailure, isUnsupportedStructuredOutputError, negotiateOutputModes, plannerMessages, plannerOutputModes, plannerPrompt, plannerValidationRepairInstruction, PLANNER_OUTPUT_MODE, stripStructuredOutputControls } from './output-negotiation.js?v=0.13.9';
import { claimPlannerRecoveryRepair, clearPlannerRecoveryRepair, clearPlannerFailed, clearPlannerPending, markPlannerFailed, markPlannerPending, plannerFailedForSnapshot, plannerWasInterrupted, waitForPlannerHandoff } from './planner-lifecycle.js?v=0.13.10';
import { exceedsAppendAllowance, mergePlannerIntents, normalizePlannerIntent } from './planner-coalescer.js?v=0.13.9';
import { hasUsableCausalContext } from './causal-context.js?v=0.13.9';
import { formatHiddenMotives } from './scratchpad-format.js?v=0.13.9';
import { alignmentPromptFromMeta, transcriptHeadFromPrompt } from './detached-meta.js?v=0.13.9';
import { createSafetyFallbackState } from './fallback-direction.js?v=0.13.11';
import { classifyAssistantReply } from './response-usability.js?v=0.13.9';
import { buildPlotAnchor, cachedGenerationContext, generationContextEntries, generationPreviewDescription, GENERATION_CONTEXT_KEY, hasPlannerConditions, PLOT_ANCHOR_VERSION, plotCardInputs, plotInputKey, plotVariableInputs, plotWorldNames, rememberGenerationContext, REPLACEMENT_PENDING_KEY, replacementPendingForMessages } from './generation-context.js?v=0.13.15';
import { getWorldInfoSettings, selected_world_info, world_info, worldInfoCache } from '/scripts/world-info.js';

const EXTENSION_ID = 'living-world-guide';
const RUNTIME_VERSION = '0.13.15';
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
const DEFAULT_SETTINGS = { enabled: true, mode: 'balanced', analysisProfileId: '', analysisSource: 'active', analysisProvider: 'custom', analysisModel: '', analysisUrl: '', analysisSecretId: '', analysisReasoningMode: 'auto', analysisTemperature: 1, directSettingsMigrated: false, directCustomModel: '', directCustomUrl: '', directCustomSecretId: '', directOpenRouterModel: '', directOpenRouterUrl: '', directOpenRouterSecretId: '', injectionPosition: 'at-depth', injectionDepth: 1, injectionRole: DEFAULT_INJECTION_ROLE, includeWorldInfo: false, showDirectorNotes: false, recentContextTokens: 6000, messageTokenLimit: 700, maxPromptTokens: 16000, continuityIntegration: true, summaryContextTokens: 4000, fullReviewInterval: DEFAULT_REFRESH_INTERVAL, contextSettingsVersion: 11 };
let settings = null;
let analysisPromise = null;
let analysisAbortController = null;
let analysisRequestFingerprint = '';
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
// Reasoning providers may count hidden thinking against this ceiling. The
// planner prompt and schema separately target a concise visible JSON result.
// Include enough room for the required audit and actor deltas. A 2,304-token
// cap truncated real routine responses, so retrying only repeated the failure.
const INCREMENTAL_RESPONSE_TOKENS = 4096;
const REBUILD_RESPONSE_TOKENS = 16384;
const REVIEW_RESPONSE_TOKENS = 6144;
const PLANNER_MAX_AUTO_RETRIES = 2;
const UI_MOUNT_TIMEOUT_MS = 30000;
const LEGACY_UPGRADE_MAX_ATTEMPTS = 1;
const INTERNAL_PLANNER_MARKER = 'You are Tale Fairy, the private authorial planning layer for SillyTavern roleplay.';
// Some OpenAI-compatible servers silently ignore native structured output.
// Keep a compact human-readable contract in the prompt, while the native
// request still carries the machine schema. Never duplicate the full schema in
// prompt tokens: that space belongs to lore, summaries, and conversation evidence.
const PLANNER_SYSTEM_PROMPT = `${SYSTEM}\n\n${ANALYSIS_OUTPUT_CONTRACT}`;
const INCREMENTAL_SYSTEM_PROMPT = `${INCREMENTAL_SYSTEM}\n\n${INCREMENTAL_ANALYSIS_OUTPUT_CONTRACT}`;
// The full schema occupies provider context either as native metadata or as a
// compatibility prompt. Reserve its tokens once in both cases.
const PLANNER_BUDGET_ENVELOPE = `${PLANNER_SYSTEM_PROMPT}\n${JSON.stringify(ANALYSIS_SCHEMA)}`;
const INCREMENTAL_BUDGET_ENVELOPE = `${INCREMENTAL_SYSTEM_PROMPT}\n${JSON.stringify(INCREMENTAL_ANALYSIS_SCHEMA)}`;

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

async function buildTokenBudgetedAnalysisPrompt(messages, state, note, bootstrap, options) {
    const tokenBudget = Math.max(options.incremental ? 6000 : 9000, Math.min(30000, Number(options.maxPromptTokens) || DEFAULT_SETTINGS.maxPromptTokens));
    const context = currentContext();
    const historyCache = new Map(); // One transcript-bound cache per fit, never across turns.
    return fitPromptToBudget({
        tokenBudget,
        fixedEnvelope: options.incremental ? INCREMENTAL_BUDGET_ENVELOPE : PLANNER_BUDGET_ENVELOPE,
        tokenCounter: typeof context?.getTokenCountAsync === 'function' ? context.getTokenCountAsync.bind(context) : null,
        buildPrompt: effectivePromptTokens => buildAnalysisPrompt(messages, state, note, bootstrap, { ...options, maxPromptTokens: tokenBudget, effectivePromptTokens, historyCache }),
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

function bootstrapContext(context) {
    const result = {};
    try {
        const fields = getCharacterCardFields?.() || context.getCharacterCardFields?.() || {};
        for (const key of ['description', 'personality', 'scenario', 'persona']) {
            if (fields[key]) result[key] = String(fields[key]).slice(0, 3500);
        }
        // A card system field may contain real setting mechanics alongside RP
        // instructions. Pass it as untrusted reference material so the planner
        // can retain factual rules without adopting its behavioral directives.
        if (fields.system) result.cardSystemReference = String(fields.system).slice(0, 3500);
    } catch { /* older hosts may not expose card fields */ }
    if (context.chatMetadata?.scenario) result.scenario = String(context.chatMetadata.scenario).slice(0, 3500);
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
            latestUserAction,
        };
    }
    return {
        guidanceUsable: isGuidanceUsable(state, chat, chatId),
        guideCandidates: null,
        guideIndex: 0,
        regeneration: false,
        variationCue: 0,
        directorSample: sampleDirectorSignals(state.mode, state.plannerSeed),
        latestUserAction,
        causalContext: selectedCausalContext,
        plotAnchor: buildPlotAnchor(chat, { state, stateCurrent: isDirectionCurrent(state, chat, chatId), bootstrap: bootstrapContext(context) }),
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
        // Pending author requests matter; planner diagnostics and note-resolution
        // timestamps do not invalidate a packet during regeneration.
        notes: state.userNotes.map(note => ({ text: note.text, kind: note.kind })),
    };
}

function replacementPlanningDeferred(context = currentContext()) {
    return replacementPendingForMessages(context.chatMetadata?.[REPLACEMENT_PENDING_KEY],
        messagesFromChat(context.chat || []), String(context.getCurrentChatId?.() || ''), fingerprintMessages);
}

function deferReplacementPlanning(context = currentContext(), sourceMessages = null) {
    if (!getSettings().enabled) return;
    const messages = sourceMessages || generationRetrySource(messagesFromChat(context.chat || []), true);
    const chatId = String(context.getCurrentChatId?.() || '');
    const current = loadState(context.chatMetadata);
    const inputKey = plotInputKey(chatId, messages, generationInputs(context, current));
    const archived = cachedGenerationContext(context.chatMetadata?.[GENERATION_CONTEXT_KEY], inputKey, chatId);
    // Roll back planner memory as well as the visible injection. Otherwise a
    // later routine pass could inherit entities/ledger facts from deleted prose.
    if (!isDirectionCurrent(current, messages, chatId)) {
        const restored = archived?.plannerState ? { ...archived.plannerState } : createSafetyFallbackState(defaultState(), {
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
        context.updateChatMetadata(saveState(context.chatMetadata, { ...restored,
            userNotes: current.userNotes, mode: current.mode, lastRequestVerification: current.lastRequestVerification,
        }));
    }
    context.updateChatMetadata({ ...context.chatMetadata, [REPLACEMENT_PENDING_KEY]: {
        chatId, fingerprint: fingerprintMessages(messages), sourceKey: plotInputKey(chatId, messages), messageCount: messages.length,
    } });
    interruptAnalysis('A replacement reuses its pre-response context.', 'Plot context ready · retries need no new planner calls');
    void cancelDetachedPlannerJobs(chatId);
    scheduleVerificationPersistence(context);
}

function prepareGenerationGuide(state, type) {
    const context = currentContext();
    const chatId = String(context.getCurrentChatId?.() || '');
    const messages = messagesFromChat(context.chat || []);
    const replacement = type === 'swipe' || type === 'regenerate';
    const replacementMessages = generationRetrySource(messages, replacement);
    const inputs = generationInputs(context, state);
    const inputKey = plotInputKey(chatId, replacementMessages, inputs);
    const archived = cachedGenerationContext(context.chatMetadata?.[GENERATION_CONTEXT_KEY], inputKey, chatId);
    const reuseArchived = () => {
        generationGuideSelection = { ...archived.selection, chatId, inputKey, replacement, regeneration: replacement, payload: archived.payload, reused: true };
        renderInjectionActivity(archived.selection.usable ? 'Cached plot context ready · no new planner calls' : 'Cached scene excerpts ready · planner context unavailable; no new planner calls');
    };
    if (archived?.selection.usable && hasPlannerConditions(archived.selection.causalContext)) {
        reuseArchived();
        return;
    }
    // Legacy request archives cannot prove card/lore inputs. Reconstruct a
    // local anchor rather than reusing unverified or post-response facts.
    const priorCache = generationContextEntries(context.chatMetadata?.[GENERATION_CONTEXT_KEY]);
    const sourceKey = plotInputKey(chatId, replacementMessages);
    const sourceFingerprint = fingerprintMessages(replacementMessages);
    // New plans record the actual input dependencies. An older packet made
    // before a book loaded must not veto a later plan that used that book.
    // Legacy plans still need the conservative history check.
    const changedInputs = state.analysisModel?.plotInputsKey
        ? state.analysisModel.plotInputsKey !== plotInputKey(chatId, [], inputs)
        : priorCache.some(item => (item.sourceKey === sourceKey || item.sourceFingerprint === sourceFingerprint) && item.inputKey !== inputKey);
    const currentDirectionReady = !changedInputs && isDirectionCurrent(state, replacementMessages, chatId);
    const currentGuidanceUsable = currentDirectionReady && isGuidanceUsable(state, replacementMessages, chatId);
    const upgradeFallback = archived && !hasPlannerConditions(archived.selection.causalContext)
        && currentGuidanceUsable && hasPlannerConditions(state.causalContext);
    // A completed usable packet stays immutable. A rules/excerpts-only packet
    // may gain an already-ready, source-aligned plan, without making any call.
    // Refresh old fallback formatting locally too, so reloads do not preserve
    // the former chopped-sentence anchor forever.
    if (archived && !upgradeFallback && (archived.selection.usable || archived.anchorVersion === PLOT_ANCHOR_VERSION)) {
        reuseArchived();
        return;
    }
    const selectedSituations = currentGuidanceUsable ? selectSituationalOpenings(state.situationBoard, {
        scene: state.scene, sceneProfile: state.sceneProfile,
        latestUserAction: [...replacementMessages].reverse().find(message => message.is_user)?.mes || '',
    }) : [];
    generationGuideSelection = {
        chatId,
        inputKey,
        candidates: [], index: 0,
        usable: currentGuidanceUsable,
        skipped: false,
        regeneration: replacement,
        replacement,
        variationCue: currentDirectionReady ? state.plannerSeed : 0,
        directorSample: sampleDirectorSignals(state.mode, currentDirectionReady ? state.plannerSeed : 0),
        canonConstraints: currentGuidanceUsable ? state.canonConstraints : [],
        sceneProfile: currentGuidanceUsable ? state.sceneProfile : null,
        causalContext: currentGuidanceUsable ? { ...state.causalContext, optionalSituations: selectedSituations.slice(0, 1).map(item => ({ premise: item.premise, entry: item.entry })) } : null,
        plotAnchor: buildPlotAnchor(replacementMessages, { state, stateCurrent: currentDirectionReady, bootstrap: bootstrapContext(context) }),
    };
    const payload = buildPromptPayload(state, { generationType: type, ...guideSelectionOptions(state, context) });
    const cache = JSON.parse(JSON.stringify({ version: 1, anchorVersion: PLOT_ANCHOR_VERSION, chatId, inputKey,
        sourceFingerprint, sourceKey, payload, selection: generationGuideSelection,
        plannerState: currentDirectionReady ? { ...state, lastRequestVerification: null } : null,
    }));
    generationGuideSelection.payload = payload;
    context.updateChatMetadata({ ...context.chatMetadata, [GENERATION_CONTEXT_KEY]: rememberGenerationContext(context.chatMetadata?.[GENERATION_CONTEXT_KEY], cache) });
    scheduleVerificationPersistence(context);
    if (archived) renderInjectionActivity(currentGuidanceUsable
        ? 'Cached fallback upgraded with ready planner context · no new planner calls'
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
        // metadata that happened to coexist with the permanent GM rules.
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
        const hasGuidance = payload.includes('<living-world-guide>');
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
        const hasGuidance = payload.includes('<living-world-guide>');
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
        const hasGuidance = payload.includes('<living-world-guide>');
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
        : pending.dynamicContextIncluded === false
            ? 'GM rules confirmed in returned reply; no world facts were included'
            : 'GM rules and causal context confirmed in returned reply');
    return true;
}

async function persist(state, guard = {}) {
    const context = currentContext();
    const chat = messagesFromChat(context.chat || []);
    const chatId = String(context.getCurrentChatId?.() || '');
    if ((guard.chatId && chatId !== guard.chatId)
        || (guard.fingerprint && !isAnalysisSourceCurrent(guard.fingerprint, guard.messageCount, chat, {
            allowOneUserAppend: guard.allowOneUserAppend,
            allowOneAssistantAppend: guard.allowOneAssistantAppend,
        }))
        || chat.length === 0) {
        throw new DOMException('The chat changed before Tale Fairy could save its analysis.', 'AbortError');
    }
    context.updateChatMetadata(saveState(context.chatMetadata, state));
    updatePrompt(state);
    if (typeof context.saveMetadata === 'function') await context.saveMetadata();
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
    if (replacementPlanningDeferred(context)) return;
    const messages = messagesFromChat(context.chat || []);
    // Hosts can report the same transcript repeatedly during finalization.
    // Do not abort a useful planner (or discard its queued successor) for a
    // notification that has not changed its source.
    if (activeAnalysisIntent?.chatId === String(context.getCurrentChatId?.() || '')
        && analysisAbortController && !analysisAbortController.signal.aborted
        && isAnalysisSourceCurrent(analysisRequestFingerprint, activeAnalysisMessageCount, messages, { allowOneUserAppend: true })) return;
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
    });
}

function queueLatestAnalysis(value = {}) {
    const context = currentContext();
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
        const rawResult = value && typeof value === 'object' && !Array.isArray(value) && ([2, 8, 9, 10, 11, 12, 13].includes(value.contract_version) || value.scene)
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
    if (detachedPlannerRecovering || analysisPromise || !getSettings().enabled) return { active: false, recovered: false };
    const context = currentContext();
    if (replacementPlanningDeferred(context)) return { active: false, recovered: false };
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
            if (analysisStopSequence !== stopSequence || replacementPlanningDeferred(currentContext())) return { active: false, recovered: false };
            const meta = job.meta || {};
            const sourceCurrent = isAnalysisSourceCurrent(meta.fingerprint, meta.messageCount, chat, {
                allowOneUserAppend: Boolean(meta.allowOneUserAppend),
                allowOneAssistantAppend: Boolean(meta.allowOneAssistantAppend),
            });
            if (job.status === 'queued' || job.status === 'processing') {
                if (sourceCurrent) active = true;
                continue;
            }
            if (job.status === 'error' || job.status === 'cancelled' || !sourceCurrent) {
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
            const current = meta.rebuild ? rebuildState() : loadState(context.chatMetadata);
            current.mode = meta.mode || getSettings().mode;
            let next = applyAnalysis(current, result, chat.slice(0, Number(meta.messageCount) || chat.length));
            next = applyPlannerAuthorLayer(next, {
                turnCount: assistantTurnNumber(chat.slice(0, Number(meta.messageCount) || chat.length)),
                fingerprint: String(meta.fingerprint || ''),
                seedRequiredDevelopment: !meta.rebuild,
                fullReview: meta.fullContextPass === true && [8, 9, 12].includes(result.contract_version),
                messages: chat.slice(0, Number(meta.messageCount) || chat.length),
            });
            next.summaryEvidence = { ...(meta.summaryEvidence || {}), scannedAt: Date.now() };
            next.continuityRevisionUsed = Number(meta.continuityRevision || 0);
            next.continuityMessageSignature = String(meta.continuityMessageSignature || '');
            next.continuityCoverageThrough = Number(meta.continuityCoverageThrough ?? -1);
            next = reconcileStateWithContinuity(next, optionalContinuityContext(context, true)).state;
            next.plannerSeed = Number(meta.plannerSeed) || 0;
            next.sourceChatId = chatId;
            next.analysisModel = meta.analysisSelection || {};
            const submittedNote = normalizeUserNote(meta.userNote);
            const resolvedNote = resolveUserNote(result, submittedNote);
            if (resolvedNote) next.userNotes = [...next.userNotes, { ...resolvedNote, at: Date.now() }].slice(-12);
            next.noteNeedsClarification = Boolean(submittedNote && !resolvedNote);
            await persist(next, {
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
            renderAnalysisActivity('Recovered planner result completed while this page was unavailable', false);
            return { active: false, recovered: true, state: next };
        }
        if (active) {
            renderAnalysisActivity('Planner continuing on the SillyTavern server', true);
            return { active: true, recovered: false };
        }
        if (invalid) {
            const latestContext = currentContext();
            const latestChat = messagesFromChat(latestContext.chat || []);
            const fingerprint = fingerprintMessages(chat);
            if (!getSettings().enabled || analysisStopSequence !== stopSequence || analysisPromise
                || String(latestContext.getCurrentChatId?.() || '') !== chatId
                || fingerprintMessages(latestChat) !== fingerprint) return { active: false, recovered: false };
            const { job, meta, error } = invalid;
            await acknowledgeDetachedPlannerRun(job.runKey, chatId);
            if (!getSettings().enabled || analysisStopSequence !== stopSequence || analysisPromise
                || String(currentContext().getCurrentChatId?.() || '') !== chatId
                || fingerprintMessages(messagesFromChat(currentContext().chat || [])) !== fingerprint) return { active: false, recovered: false };
            if (claimPlannerRecoveryRepair(plannerStorage(), chatId, fingerprint)) {
                renderAnalysisActivity('Correcting recovered planner response once', true);
                // Rebuild the evidence from the current chat, never resend stale
                // stored prompts. Keep this asynchronous and bounded across reloads.
                const state = await analyzeNow({ force: true, messages: chat, note: meta.userNote,
                    rebuild: Boolean(meta.rebuild), allowOneUserAppend: true,
                    recovery: { instruction: plannerValidationRepairInstruction(error), fullContextPass: meta.fullContextPass === true },
                });
                return { active: false, recovered: true, state };
            }
            const fallback = createSafetyFallbackState(loadState(latestContext.chatMetadata), {
                transcriptHead: chat.length === Number(meta.messageCount) ? meta.transcriptHead : null,
                messages: chat, chatId, fingerprint, turnCount: assistantTurnNumber(chat),
                seed: Number(meta.plannerSeed) || randomVariationNonce(), reason: analysisErrorMessage(error),
            });
            await persist(fallback, { chatId, fingerprint, messageCount: chat.length });
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
    const reasoning = buildReasoningRequest({
        mode: reasoningMode,
        source: generateData.chat_completion_source,
        model: generateData.model,
        url: generateData.custom_url || generateData.reverse_proxy,
    });
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
    state.userNotes = [...state.userNotes, { ...note, at: Date.now() }].slice(-12);
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

function rebuildState() {
    return defaultState();
}

function rebuildPendingState(context = currentContext()) {
    const pending = defaultState();
    pending.canonBootstrapPending = true;
    pending.sourceChatId = String(context.getCurrentChatId?.() || '');
    pending.lastReason = 'Full Rebuild requested; no replacement planner result has been saved yet.';
    return pending;
}

async function persistRebuildPending(context = currentContext()) {
    const pending = rebuildPendingState(context);
    // This replaces only Tale Fairy's state. It deliberately retains no fields
    // from the deleted guide, while making the requested full-history rebuild
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
        let repairInstruction = requestSpec.repairInstruction || '';
        let repairAttempted = false;
        const withValidationRepair = async (run, label) => {
            try {
                return await run();
            } catch (error) {
                controller.signal.throwIfAborted();
                if (requestSpec.allowValidationRepair === false || !(error instanceof AnalysisValidationError) || repairAttempted) throw error;
                repairAttempted = true;
                claimPlannerRecoveryRepair(plannerStorage(), detachedMeta?.chatId, detachedMeta?.fingerprint);
                repairInstruction = plannerValidationRepairInstruction(error);
                console.warn(`[${EXTENSION_ID}] ${label} violated the planner contract; requesting one corrected replacement`, error);
                return run();
            }
        };
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
            let samplingEnabled = !plannerModelRejectsTemperature(profile.model);
            const sendProfileRaw = mode => ConnectionManagerRequestService.sendRequest(
                model.profileId,
                plannerMessages(systemPrompt, prompt, schema, mode, repairInstruction),
                responseTokens,
                { stream: false, extractData: false, includePreset: false, includeInstruct: false, signal: controller.signal },
                {
                    ...(mode === PLANNER_OUTPUT_MODE.JSON_SCHEMA ? { json_schema: schema } : {}),
                    custom_prompt_post_processing: '',
                    ...plannerTemperaturePayload(temperature, samplingEnabled),
                    ...reasoningPayload,
                    ...detachedMarker,
                },
            );
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
                    const response = await sendProfile(mode);
                    controller.signal.throwIfAborted();
                    return parseResponse(response);
                }
            };
            const runProfileMode = mode => withValidationRepair(() => runProfileAttempt(mode), `${requestLabel} connection profile`);
            return negotiatePlannerOutput(
                runProfileMode,
                [PLANNER_OUTPUT_MODE.JSON_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY],
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
                    prompt: plannerPrompt(prompt, schema, mode, repairInstruction),
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
            const runActiveMode = mode => withValidationRepair(() => runActiveAttempt(mode), `${requestLabel} active model`);
            return negotiatePlannerOutput(
                runActiveMode,
                [PLANNER_OUTPUT_MODE.JSON_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY],
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
        let samplingEnabled = !plannerModelRejectsTemperature(model.model);
        const sendRaw = async mode => {
            const modePayload = model.provider === 'custom' ? customOutputPayload(reasoningPayload, mode) : reasoningPayload;
            const body = { chat_completion_source: model.provider, model: model.model, messages: plannerMessages(systemPrompt, prompt, schema, mode, repairInstruction), max_tokens: responseTokens, stream: false, ...plannerTemperaturePayload(temperature, samplingEnabled), ...modePayload, ...(mode === PLANNER_OUTPUT_MODE.JSON_SCHEMA ? { json_schema: schema } : {}), ...(model.provider === 'openrouter' ? { api_url: model.url.replace(/\/$/, '') } : { custom_url: model.url.replace(/\/$/, '') }), ...detachedMarker };
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
        const runDirectAttempt = async mode => {
            try {
                return await send(mode);
            } catch (error) {
                controller.signal.throwIfAborted();
                if (error instanceof AnalysisValidationError) throw error;
                if (!isReasoningControlError(error) || (!reasoning.controlled && !isMandatoryReasoningError(error))) throw error;
                reasoningPayload = reasoningFallbackPayload(error, reasoningPayload);
                return send(mode);
            }
        };
        const runDirectMode = mode => withValidationRepair(() => runDirectAttempt(mode), `${requestLabel} direct model`);
        const modes = plannerOutputModes(model);
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
    return requestAnalysisOnce(prompt, externalSignal, detachedMeta, {
        responseTokens: fullContextPass ? (bootstrapScan ? REBUILD_RESPONSE_TOKENS : REVIEW_RESPONSE_TOKENS) : INCREMENTAL_RESPONSE_TOKENS,
        ...(fullContextPass && !bootstrapScan ? { reasoningMode: 'off', label: 'bounded story review', cacheNamespace: 'analysis-review-v12', allowValidationRepair: true } : {}),
        ...(fullContextPass ? {} : {
            systemPrompt: INCREMENTAL_SYSTEM_PROMPT,
            schema: INCREMENTAL_ANALYSIS_SCHEMA,
            // Routine refresh is latency-sensitive and needs visible JSON, not
            // a hidden chain of thought that can consume the entire response
            // budget before the provider emits an answer. Full Rebuild still
            // honors the configured/inherited reasoning level.
            reasoningMode: 'off',
            // Invalid structured output still gets one focused repair pass.
            // A routine refresh must not discard an active world merely because
            // the first response omitted a required field.
            allowValidationRepair: true,
            label: 'incremental planner',
            cacheNamespace: 'analysis-incremental-v13',
        }),
        ...(recovery ? { repairInstruction: recovery.instruction, allowValidationRepair: false } : {}),
    });
}

export async function analyzeNow({ note = null, force = false, messages = null, rebuild = false, allowOneUserAppend = false, allowOneAssistantAppend = false, allowStaleContinuity = false, waitForContinuity = false, retryAttempt = 0, recovery = null } = {}) {
    const context = currentContext();
    const s = getSettings();
    if (!s.enabled) return loadState(context.chatMetadata);
    if (!retryAttempt) cancelAnalysisRetry();
    const chat = messages || messagesFromChat(context.chat || []);
    const savedState = loadState(context.chatMetadata);
    const state = rebuild ? rebuildState(savedState) : savedState;
    const userNote = normalizeUserNote(note);
    const fingerprint = fingerprintMessages(chat);
    const chatId = String(context.getCurrentChatId?.() || '');
    if (!force && !userNote && !rebuild && !state.canonBootstrapPending && isGuidanceUsable(state, chat, chatId)) { updatePrompt(state); return state; }
    let previousAnalysisPromise = null;
    if (analysisPromise) {
        if (!force && !userNote && !rebuild && analysisRequestFingerprint === fingerprint) return analysisPromise;
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
        const latestSaved = loadState(context.chatMetadata);
        const current = rebuild ? rebuildState(latestSaved) : latestSaved;
        current.mode = s.mode;
        current.plannerSchedule = normalizePlannerSchedule({ ...current.plannerSchedule, refreshInterval: s.fullReviewInterval });
        const { fullContextPass, bootstrapScan } = plannerPassDecision({ state: current, messages: chat, rebuild, manual: Boolean(userNote) || recovery?.fullContextPass === true });
        const budgets = plannerBudgets(s, { bootstrapScan, fullContextPass });
        const { input: plannerMaxPromptTokens, recent: plannerRecentContextTokens, summary: plannerSummaryContextTokens } = budgets;
        const analysisSelection = {
            source: s.analysisSource,
            profileId: s.analysisProfileId,
            model: s.analysisModel,
            url: s.analysisUrl,
        };
        if (waitForContinuity) showAnalysisPhase('Waiting for Continuity Memory', runId, startedAt);
        const continuityState = waitForContinuity
            ? await optionalContinuityContextWhenReady(context, allowStaleContinuity, controller.signal)
            : optionalContinuityContext(context, allowStaleContinuity);
        const continuityContext = continuityState?.text ?? continuityState;
        controller.signal.throwIfAborted();
        showAnalysisPhase('Reading summaries and World Info', runId, startedAt);
        const summarySources = await collectSummarySources(context, chat, {
            continuityContext,
            continuityEvidence: continuityState?.planningEvidence,
            includeContinuity: s.continuityIntegration,
            ownPromptKey: PROMPT_KEY,
            tokenBudget: plannerSummaryContextTokens,
            query: [...chat.slice(-4).map(message => message?.mes || ''), ...relevantActors(current.entities, chat.slice(-4).map(message => message?.mes || '').join('\n')).map(item => item.name)].join('\n'),
            worldInfoActivationTokens: plannerMaxPromptTokens,
            onWarning: (message, error) => console.warn(`[${EXTENSION_ID}] ${message}`, error),
        });
        controller.signal.throwIfAborted();
        showAnalysisPhase(`Building ${Number(plannerMaxPromptTokens).toLocaleString()}-token ${fullContextPass ? 'full' : 'incremental'} planner input`, runId, startedAt);
        // Kept with run metadata so detached recovery retains the same proof.
        analysisSelection.plotInputsKey = plotInputKey(chatId, [], generationInputs(context, current));
        const plannerPrompt = await buildTokenBudgetedAnalysisPrompt(chat, current, noteInstruction(userNote), bootstrapContext(context), { recentContextTokens: plannerRecentContextTokens, messageTokenLimit: s.messageTokenLimit, summaryContextTokens: plannerSummaryContextTokens, summarySources, bootstrapScan, fullRebuild: rebuild, incremental: !fullContextPass, maxPromptTokens: plannerMaxPromptTokens, variationNonce });
        plannerTranscriptHead = transcriptHeadFromPrompt(plannerPrompt);
        lastSummaryAudit = plannerEvidenceAudit(plannerPrompt, summarySources, {
            fixedEnvelope: fullContextPass ? PLANNER_BUDGET_ENVELOPE : INCREMENTAL_BUDGET_ENVELOPE,
            tokenBudget: plannerMaxPromptTokens, tier: budgets.tier,
        });
        showAnalysisPhase('Waiting for planner model', runId, startedAt);
        const result = await requestAnalysis(plannerPrompt, controller.signal, {
            chatId,
            runKey: detachedRunKey,
            fingerprint,
            messageCount: chat.length,
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
        next = applyPlannerAuthorLayer(next, { turnCount: assistantTurnNumber(chat), fingerprint, seedRequiredDevelopment: !rebuild, fullReview: fullContextPass && [8, 9, 12].includes(result.contract_version), messages: chat });
        // A bridge notification can arrive while the planner is running. The
        // direction still records the snapshot it actually used, while linked
        // factual entries immediately accept the latest canonical correction.
        next = reconcileStateWithContinuity(next, optionalContinuityContext(context, true)).state;
        next.summaryEvidence = { ...lastSummaryAudit, scannedAt: Date.now() };
        next.continuityRevisionUsed = Number(continuityState?.revision || 0);
        next.continuityMessageSignature = String(continuityState?.messageSignature || '');
        next.continuityCoverageThrough = Number(continuityState?.coverageThrough ?? -1);
        next.plannerSeed = variationNonce;
        next.sourceChatId = chatId;
        next.analysisModel = analysisSelection;
        if (resolvedNote) next.userNotes = [...next.userNotes, { ...resolvedNote, at: Date.now() }].slice(-12);
        next.noteNeedsClarification = Boolean(userNote && !resolvedNote);
        await persist(next, { chatId, fingerprint, messageCount: chat.length, allowOneUserAppend, allowOneAssistantAppend });
        await acknowledgeDetachedPlannerRun(detachedRunKey, chatId);
        clearPlannerFailed(plannerStorage(), chatId);
        cancelAnalysisRetry();
        lastAnalysisError = '';
        finalStatus = userNote && !resolvedNote
            ? 'Note not applied · try again'
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
                        const fallbackFingerprint = fingerprintMessages(latestChat);
                        const fallback = createSafetyFallbackState(alignRetainedStateToTranscript(loadState(latestContext.chatMetadata), latestChat), {
                            transcriptHead: latestChat.length === chat.length ? plannerTranscriptHead : null,
                            messages: latestChat,
                            chatId,
                            fingerprint: fallbackFingerprint,
                            turnCount: assistantTurnNumber(latestChat),
                            seed: variationNonce,
                            reason: lastAnalysisError,
                        });
                        await persist(fallback, { chatId, fingerprint: fallbackFingerprint, messageCount: latestChat.length });
                        clearPlannerFailed(plannerStorage(), chatId);
                        cancelAnalysisRetry();
                        finalStatus = `Safety fallback ready · planner ${isPlannerTimeoutError(error) ? 'timed out' : 'output was unusable'}`;
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
    const analyzed = state.scene.status !== 'uninitialized';
    const settingsRoot = document.querySelector(`#${EXTENSION_ID}-settings`);
    const guideButton = settingsRoot?.querySelector('[data-action="guide"]');
    const guideLabel = guideButton?.querySelector('[data-role="guide-label"]');
    if (guideLabel) guideLabel.textContent = analyzed ? 'Re-evaluate' : 'Guide now';
    if (guideButton) guideButton.title = analyzed ? 'Re-analyze the current scene and active world context' : 'Analyze the current chat and context';

    const analyzedAt = state.lastAnalyzedAt ? new Date(state.lastAnalyzedAt).toLocaleString() : '';
    const meta = state.canonBootstrapPending
        ? 'Full rebuild pending · retained world facts are not injected'
        : analyzed ? `Tale Fairy v${RUNTIME_VERSION} · ${state.mode} mode · world context updated ${analyzedAt || 'recently'}` : '';
    scratchpadText(board, 'scratchpad-meta', meta, 'No world analysis yet. Run Guide now or Full rebuild.');
    const continuityStatus = analyzed ? continuityContextState(currentContext()).status : 'unavailable';
    const summaryAudit = state.summaryEvidence?.scannedAt ? state.summaryEvidence : lastSummaryAudit;
    const summaryStatus = summaryAudit.scannedAt || summaryAudit.count
        ? ` · final summaries: ${summaryAudit.count} sources / ${summaryAudit.includedTokens.toLocaleString()} text tokens${summaryAudit.inputBudget ? ` · ${summaryAudit.tier}: ~${summaryAudit.inputTokens.toLocaleString()}/${summaryAudit.inputBudget.toLocaleString()} input tokens · raw excerpts: ${summaryAudit.recentTokens} tokens · historical witnesses: ${summaryAudit.historyCount} · actors: ${summaryAudit.actorCount} · candidate pool: ${summaryAudit.candidateCount} sources / ${summaryAudit.candidateTokens} text tokens${summaryAudit.droppedLabels?.length ? ` · omitted sources: ${summaryAudit.droppedLabels.join(', ')}` : ''}` : ' (legacy evidence count)'}`
        : '';
    scratchpadText(board, 'scratchpad-continuity', `Direct Continuity connector: ${continuityStatus}${summaryStatus}`, 'Direct Continuity connector: unavailable');

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
    const previewDynamic = guidanceSnapshot(state, previewOptions).dynamicContextIncluded;
    const previewKind = preparedSelection
        ? preparedSelection.replacement ? 'CURRENT REGENERATION REQUEST' : 'CURRENT GENERATION REQUEST'
        : 'NEXT NORMAL GENERATION';
    const previewSettings = getSettings();
    const previewPlacement = previewSettings.injectionPosition === 'at-depth'
        ? `at-depth · ${previewSettings.injectionRole} · depth ${previewSettings.injectionDepth}`
        : `${previewSettings.injectionPosition} · ${previewSettings.injectionRole}`;
    const previewText = previewPayload
        ? `${previewKind} — ${generationPreviewDescription({ reused: preparedSelection?.reused, dynamic: previewDynamic,
            deferred: !preparedSelection && replacementPlanningDeferred(previewContext), planning: Boolean(analysisPromise) })}.\nPlacement: ${previewPlacement}\n\n${previewPayload}`
        : !getSettings().enabled || !isStoryGeneration(activeGenerationType)
            ? 'TALE FAIRY INJECTION DISABLED — extension off or a non-story generation.'
        : isDirectionCurrent(state, messagesFromChat(previewContext.chat || []), chatId) && !state.lastInject
            ? 'INVALID OR LEGACY NON-INJECTION CONTEXT — waiting for fresh causal analysis.'
            : analysisPromise
                ? 'PREPARING FRESH CAUSAL CONTEXT IN BACKGROUND — roleplay generation will not wait for it.'
                : 'NO FRESH CAUSAL CONTEXT READY — used or stale context is audit history only and will not be reused.';
    scratchpadText(board, 'scratchpad-request-verification', previewText, 'No fresh Tale Fairy causal context is ready.');

    scratchpadOptionalText(board, 'scratchpad-continuity-section', 'scratchpad-continuity-processes', analyzed ? scratchpadList(state.continuityThreads, item => item?.thread ? `${item.thread} — ${item.state}` : '', '') : '');
    scratchpadOptionalText(board, 'scratchpad-entities-section', 'scratchpad-entities', analyzed ? scratchpadList(state.entities, item => item?.name ? `${item.name}${item.state ? ` — ${item.state}` : ''}${item.agenda ? ` · Agenda: ${item.agenda}` : ''}` : '', '') : '');
    scratchpadText(board, 'scratchpad-ledger', analyzed ? state.contextLedger : '', 'No current continuity ledger yet.');
    scratchpadText(board, 'scratchpad-notes', scratchpadList(state.userNotes, item => item?.text ? `[${String(item.kind || 'note').toUpperCase()}] ${item.text}` : '', ''), 'No user notes.');
}
async function resetState({ rebuilding = false } = {}) {
    const context = currentContext();
    context.updateChatMetadata({ ...context.chatMetadata, [GENERATION_CONTEXT_KEY]: null, [REPLACEMENT_PENDING_KEY]: null });
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
    // Delete the old guide first, but retain a content-free pending marker so a
    // failed or interrupted request resumes as a Full Rebuild after a reload.
    await resetState({ rebuilding: true });
    renderAnalysisActivity('Old guide deleted · starting Full Rebuild…', true);
    return analyzeNow({ force: true, rebuild: true, waitForContinuity: true });
}

async function reevaluateGuideState() {
    const context = currentContext();
    const state = loadState(context.chatMetadata);
    state.plannerSchedule.manualRequested = true;
    context.chatMetadata = saveState(context.chatMetadata, state);
    return analyzeNow({ force: true });
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
    const context = currentContext();
    if (replacementPlanningDeferred(context)) {
        const state = loadState(context.chatMetadata);
        updatePrompt(state);
        renderAnalysisActivity('Plot context ready · retries reuse it; planning resumes on the next turn', false);
        return state;
    }
    const recovered = await recoverDetachedPlannerJobs();
    if (recovered.recovered) return recovered.state;
    if (recovered.active) return loadState(context.chatMetadata);
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
    const directionMissing = !isDirectionCurrent(state, messages, chatId);
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
    root.querySelector('[data-setting="mode"]').value = s.mode;
    root.querySelector('[data-setting="reasoning"]').value = s.analysisReasoningMode;
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
    root.querySelector('[data-setting="mode"]').addEventListener('change', e => { invalidatePlanner(); s.mode = e.target.value; save(); });
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
        const saved = finalResult.userNotes.some(item => item.at >= submittedAt);
        if (saved) root.querySelector('[data-setting="note"]').value = '';
        renderBoard();
    });
    root.querySelector('[data-action="board"]').addEventListener('click', () => { s.showDirectorNotes = !s.showDirectorNotes; root.classList.toggle('is-expanded', s.showDirectorNotes); saveSettingsDebounced(); });
    root.classList.toggle('is-expanded', Boolean(s.showDirectorNotes));
    refreshControls(root);
    renderAnalysisActivity(analysisPromise ? 'Analyzing…' : 'Ready', Boolean(analysisPromise));
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
    const source = s.analysisSource;
    const direct = source === 'direct' || source === 'openrouter';
    root.querySelector('[data-setting="enabled"]').checked = Boolean(s.enabled);
    root.querySelector('[data-setting="mode"]').value = s.mode;
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
        if (replacementPlanningDeferred(context)) return;
        const chatId = String(context.getCurrentChatId?.() || '');
        if (!chatId || String(snapshot?.chatId || '') !== chatId || snapshot?.status !== 'current') return;
        const revision = Number(snapshot.revision || 0);
        if (!revision || revision <= continuityReplacementRevision) return;
        continuityReplacementRevision = revision;
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
    if (type === 'swipe' || type === 'regenerate') deferReplacementPlanning();
    else if (isStoryGeneration(type)) {
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
    setTimeout(() => {
        const context = currentContext();
        const chatId = String(context.getCurrentChatId?.() || '');
        const messages = messagesFromChat(context.chat || []);
        const state = loadState(context.chatMetadata);
        if (!getSettings().enabled || !chatId || !messages.length || isDirectionCurrent(state, messages, chatId)) return;
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
    setTimeout(() => {
        const context = currentContext();
        const chatId = String(context.getCurrentChatId?.() || '');
        const messages = messagesFromChat(context.chat || []);
        const state = loadState(context.chatMetadata);
        if (!getSettings().enabled || !chatId || !messages.length || isDirectionCurrent(state, messages, chatId)) return;
        void queueLatestAnalysis({ chatId, allowStaleContinuity: true });
    }, 0);
});
eventSource.on(event_types.MESSAGE_RECEIVED, () => {
    const receivedChatId = String(currentContext().getCurrentChatId?.() || '');
    const supersededIntent = analysisPromise ? activeAnalysisIntent : null;
    generationRevision++;
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
        generationRevision++;
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
                updatePrompt(loadState(context.chatMetadata));
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
    const state = loadState(context.chatMetadata);
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
