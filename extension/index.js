import { eventSource, event_types, extension_prompt_roles, extension_prompt_types, generateRaw, setExtensionPrompt, getRequestHeaders, getCharacterCardFields, saveSettingsDebounced } from '/script.js';
import { getContext } from '/scripts/st-context.js';
import { extension_settings } from '/scripts/extensions.js';
import { ConnectionManagerRequestService } from '/scripts/extensions/shared.js';
import { SECRET_KEYS, secret_state, writeSecret } from '/scripts/secrets.js';
import { oai_settings, openai_setting_names, openai_settings, promptManager } from '/scripts/openai.js';
import { AnalysisValidationError, applyAnalysis, ANALYSIS_OUTPUT_CONTRACT, ANALYSIS_SCHEMA, buildAnalysisPrompt, extractJson, SYSTEM, validateAnalysisResult } from './analysis.js?v=0.11.109';
import { applyPlannerAuthorLayer, buildPromptPayload, clearState, defaultState, fingerprintMessages, generationRetrySource, guidesForDiscardedAssistant, horizonInfluence, isAnalysisSourceCurrent, isGuidanceUsable, loadState, returnedReplyMatchesVerification, saveState, STATE_KEY, STATE_VERSION } from './state.js?v=0.11.109';
import { markAuthorBeatDelivered, tickAuthorBoard } from './author-board.js?v=0.11.109';
import { normalizeConductorState, runConductor } from './conductor.js?v=0.11.109';
import { consumeAdvanceOverride, isReleaseSignal, updatePacing } from './pacing.js?v=0.11.101';
import { markAssistantTurn, plannerRefreshDecision, withRefreshReason } from './planner-scheduler.js?v=0.11.101';
import { resolveInjectionPlacement } from './injection-placement.js?v=0.11.100';
import { clearPromptManagerInjection, configurePromptManagerInjection } from './prompt-manager-injection.js?v=0.11.100';
import { chatHasCurrentGuidance, ensureGuidanceInChat, ensureGuidanceInText, requestContainsMarker, textHasCurrentGuidance } from './request-injection.js?v=0.11.100';
import { normalizeModelListResponse } from './models.js?v=0.11.100';
import { buildReasoningRequest, isMandatoryReasoningError, isReasoningControlError, normalizeReasoningMode, reasoningFallbackPayload, resolveReasoningMode } from './reasoning-policy.js?v=0.11.108';
import { readContinuityBridge, waitForContinuityBridge } from './continuity.js?v=0.11.100';
import { isPlannerTimeoutError, plannerRetryDelay, shouldRetryPlannerError } from './retry-policy.js?v=0.11.100';
import { collectSummarySources, summarySourceAudit } from './summary-context.js?v=0.11.100';
import { estimateTokenCount } from './token-budget.js?v=0.11.100';
import { completionText } from './completion-response.js?v=0.11.100';
import { customOutputPayload, detachedPlannerFailure, isUnsupportedStructuredOutputError, negotiateOutputModes, plannerMessages, plannerOutputModes, plannerPrompt, PLANNER_OUTPUT_MODE, stripStructuredOutputControls } from './output-negotiation.js?v=0.11.105';
import { clearPlannerFailed, clearPlannerPending, markPlannerFailed, markPlannerPending, plannerFailedForSnapshot, plannerWasInterrupted, waitForPlannerHandoff } from './planner-lifecycle.js?v=0.11.106';

const EXTENSION_ID = 'living-world-guide';
const RUNTIME_VERSION = '0.11.109';
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
const DEFAULT_SETTINGS = { enabled: true, mode: 'balanced', analysisProfileId: '', analysisSource: 'active', analysisProvider: 'custom', analysisModel: '', analysisUrl: '', analysisSecretId: '', analysisReasoningMode: 'auto', analysisTemperature: 1, directSettingsMigrated: false, directCustomModel: '', directCustomUrl: '', directCustomSecretId: '', directOpenRouterModel: '', directOpenRouterUrl: '', directOpenRouterSecretId: '', injectionPosition: 'at-depth', injectionDepth: 1, injectionRole: 'user', includeWorldInfo: false, showDirectorNotes: false, recentContextTokens: 4000, messageTokenLimit: 700, maxPromptTokens: 12000, continuityIntegration: true, summaryContextTokens: 4000, contextSettingsVersion: 9 };
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
let lastAnalysisError = '';
let pendingRequestVerification = null;
let generationGuideSelection = null;
const swipeGuideCursors = new Map();
let uiMountPromise = null;
let uiMountObserver = null;
let uiMountTimeout = null;
let lastSummaryAudit = { count: 0, includedTokens: 0, originalTokens: 0, labels: [] };
const legacyUpgradeAttempts = new Set();
const directModelCache = new Map();
const plannerOutputModeCache = new Map();
const detachedPlannerJobIds = new Map();
const plannerNativeFetch = globalThis.fetch.bind(globalThis);
let detachedPlannerEnabled = false;
let detachedPlannerRecovering = false;
// Reasoning providers may count hidden thinking against this ceiling. The
// planner prompt and schema separately target a concise visible JSON result.
const PLANNER_RESPONSE_TOKENS = 16384;
const PLANNER_MAX_AUTO_RETRIES = 2;
const UI_MOUNT_TIMEOUT_MS = 30000;
const LEGACY_UPGRADE_MAX_ATTEMPTS = 1;
const INTERNAL_PLANNER_MARKER = 'You are Tale Fairy, the private authorial planning layer for SillyTavern roleplay.';
// Some OpenAI-compatible servers silently ignore native structured output.
// Keep a compact human-readable contract in the prompt, while the native
// request still carries the machine schema. Never duplicate the full schema in
// prompt tokens: that space belongs to lore, summaries, and conversation evidence.
const PLANNER_SYSTEM_PROMPT = `${SYSTEM}\n\n${ANALYSIS_OUTPUT_CONTRACT}`;
// The full schema occupies provider context either as native metadata or as a
// compatibility prompt. Reserve its tokens once in both cases.
const PLANNER_BUDGET_ENVELOPE = `${PLANNER_SYSTEM_PROMPT}\n${JSON.stringify(ANALYSIS_SCHEMA)}`;

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
        if (settings.injectionRole === 'user') settings.injectionRole = 'system';
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
    settings.contextSettingsVersion = DEFAULT_SETTINGS.contextSettingsVersion;
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
    if (!['user', 'system', 'assistant'].includes(settings.injectionRole)) settings.injectionRole = 'user';
    settings.analysisReasoningMode = normalizeReasoningMode(settings.analysisReasoningMode);
    if (settings.analysisReasoningMode === 'default') settings.analysisReasoningMode = 'auto';
    settings.analysisTemperature = normalizePlannerTemperature(settings.analysisTemperature);
    settings.maxPromptTokens = Math.max(9000, Math.min(30000, Number(settings.maxPromptTokens) || DEFAULT_SETTINGS.maxPromptTokens));
    return settings;
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
        if (!detachedPlannerEnabled || !PLANNER_BACKEND_PATHS.has(pathname) || typeof init?.body !== 'string') {
            return plannerNativeFetch(input, init);
        }
        let request;
        try { request = JSON.parse(init.body); }
        catch { return plannerNativeFetch(input, init); }
        const meta = request?._taleFairyPlanner;
        if (!meta || typeof meta !== 'object') return plannerNativeFetch(input, init);
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
    const tokenBudget = Math.max(9000, Math.min(30000, Number(options.maxPromptTokens) || 12000));
    const fixedEnvelope = PLANNER_BUDGET_ENVELOPE;
    const estimatedOverhead = estimateTokenCount(fixedEnvelope);
    const context = currentContext();
    const tokenCounter = typeof context?.getTokenCountAsync === 'function'
        ? context.getTokenCountAsync.bind(context)
        : null;
    let effectivePromptTokens = Math.max(1000, tokenBudget - estimatedOverhead);
    let prompt = '';
    let actualTokens = 0;
    for (let attempt = 0; attempt < 8; attempt++) {
        prompt = buildAnalysisPrompt(messages, state, note, bootstrap, { ...options, maxPromptTokens: tokenBudget, effectivePromptTokens });
        if (!tokenCounter) {
            const estimatedTotal = estimateTokenCount(`${fixedEnvelope}\n${prompt}`);
            if (estimatedTotal <= tokenBudget) return prompt;
            actualTokens = estimatedTotal;
            const scaledBudget = Math.floor(effectivePromptTokens * tokenBudget / estimatedTotal * 0.96);
            effectivePromptTokens = Math.max(1000, Math.min(effectivePromptTokens - 100, scaledBudget));
            continue;
        }
        try {
            actualTokens = Number(await tokenCounter(`${fixedEnvelope}\n${prompt}`, 0));
        } catch {
            // The model-neutral counter still enforces the configured budget
            // if SillyTavern's provider tokenizer is temporarily unavailable.
            const estimatedTotal = estimateTokenCount(`${fixedEnvelope}\n${prompt}`);
            if (estimatedTotal <= tokenBudget) return prompt;
            actualTokens = estimatedTotal;
        }
        if (!Number.isFinite(actualTokens) || actualTokens <= tokenBudget) return prompt;
        const scaledBudget = Math.floor(effectivePromptTokens * tokenBudget / actualTokens * 0.96);
        effectivePromptTokens = Math.max(1000, Math.min(effectivePromptTokens - 100, scaledBudget));
    }
    throw new Error(`Planner context is ${actualTokens} tokens and could not be fitted within the ${tokenBudget}-token limit.`);
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
    if (bridge?.version === 1 && typeof bridge.getContextSnapshot === 'function') {
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
    return continuityContextState(context, allowStale).text;
}

async function optionalContinuityContextWhenReady(context, allowStale, signal) {
    const s = getSettings();
    const immediate = continuityContextState(context, allowStale);
    if (!s.continuityIntegration || immediate.text) return immediate.text;
    const ready = await waitForContinuityBridge(context, () => globalThis.continuityMemoryBridge, {
        allowStale,
        timeoutMs: 8000,
        intervalMs: 200,
        signal,
    });
    // Preserve compatibility with Continuity versions that expose only their
    // SillyTavern extension prompt rather than the bridge.
    const finalState = ready.text ? ready : continuityContextState(context, allowStale);
    return finalState.text;
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
    const chat = messagesFromChat(context.chat || []);
    const latestUserAction = [...chat].reverse().find(message => message.is_user)?.mes || '';
    if (generationGuideSelection?.chatId === chatId) {
        return {
            guidanceUsable: generationGuideSelection.usable,
            guideCandidates: generationGuideSelection.candidates,
            guideIndex: generationGuideSelection.index,
            regeneration: generationGuideSelection.regeneration,
            variationCue: generationGuideSelection.variationCue,
            canonConstraints: generationGuideSelection.canonConstraints,
            latestUserAction,
        };
    }
    return {
        guidanceUsable: isGuidanceUsable(state, chat, chatId),
        guideCandidates: null,
        guideIndex: 0,
        regeneration: false,
        variationCue: 0,
        latestUserAction,
    };
}

function guideTurnKey(context = currentContext()) {
    const messages = messagesFromChat(context.chat || []);
    if (messages.length && !messages.at(-1).is_user) messages.pop();
    return `${String(context.getCurrentChatId?.() || '')}:${fingerprintMessages(messages)}`;
}

function prepareGenerationGuide(state, type) {
    const context = currentContext();
    const chatId = String(context.getCurrentChatId?.() || '');
    const swipe = type === 'swipe' || type === 'regenerate';
    const archived = state.lastRequestVerification?.guideCandidates || [];
    const archivedUsable = swipe && archived.length > 1;
    const messages = messagesFromChat(context.chat || []);
    // GENERATION_STARTED fires before SillyTavern removes the assistant turn
    // being regenerated. Evaluate archive-less retry routes against the
    // provider-bound trajectory, which ends on the preceding user turn.
    const retrySource = generationRetrySource(messages, swipe);
    const alignedUsable = !swipe && isGuidanceUsable(state, messages, chatId);
    const retryCandidates = !archivedUsable && !alignedUsable ? guidesForDiscardedAssistant(state, retrySource, chatId) : [];
    const retryUsable = retryCandidates.length > 1;
    const candidates = swipe
        ? (archivedUsable ? archived : retryCandidates)
        : (alignedUsable ? state.nextGuides : retryCandidates);
    const turnKey = guideTurnKey(context);
    const archivedIndex = Number(state.lastRequestVerification?.selectedGuideIndex) || 0;
    const previousIndex = swipe ? (swipeGuideCursors.get(turnKey) ?? archivedIndex) : -1;
    const index = swipe && candidates.length > 1 ? (previousIndex + 1) % candidates.length : 0;
    swipeGuideCursors.set(turnKey, index);
    while (swipeGuideCursors.size > 20) swipeGuideCursors.delete(swipeGuideCursors.keys().next().value);
    generationGuideSelection = {
        chatId,
        candidates,
        index,
        usable: archivedUsable || retryUsable || alignedUsable,
        regeneration: swipe || retryUsable,
        replacement: swipe,
        variationCue: swipe ? randomVariationNonce() : 0,
        // A replacement must not receive canon inferred from the assistant
        // reply being discarded. Reuse the exact pre-response canon snapshot.
        canonConstraints: swipe ? (state.lastRequestVerification?.canonConstraints || []) : null,
    };
}

function assistantTurnNumber(messages = []) {
    return messages.reduce((count, message) => count + (message?.is_user ? 0 : 1), 0);
}

function prepareAuthorContract(state, type = '') {
    const context = currentContext();
    const messages = messagesFromChat(context.chat || []);
    const latestUserAction = [...messages].reverse().find(message => message.is_user)?.mes || '';
    const replacement = type === 'swipe' || type === 'regenerate';
    const targetTurn = assistantTurnNumber(messages) + (messages.at(-1)?.is_user ? 1 : 0);
    state.pacing = updatePacing(state.pacing, { latestUserAction, turnCount: targetTurn });

    // Regenerations replay the same authorial obligation. Discarding wording
    // must not consume a new beat or silently accelerate the story.
    const archived = state.lastRequestVerification?.conductorContract;
    if (replacement && archived?.requiredDevelopment) {
        state.conductor = normalizeConductorState({ ...archived, status: 'active', updatedAtTurn: targetTurn });
    } else {
        const prepared = runConductor({
            authorBoard: state.authorBoard,
            pacing: state.pacing,
            previous: state.conductor,
            turnCount: targetTurn,
        });
        state.authorBoard = prepared.authorBoard;
        state.conductor = prepared.contract;
    }
    context.updateChatMetadata(saveState(context.chatMetadata, state));
    return state;
}

function updatePrompt(state) {
    const context = currentContext();
    const s = getSettings();
    const selection = guideSelectionOptions(state, context);
    const payload = buildPromptPayload(state, { enabled: s.enabled, ...selection });
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

function currentGuidancePayload() {
    const context = currentContext();
    const state = loadState(context.chatMetadata);
    return buildPromptPayload(state, { enabled: getSettings().enabled, ...guideSelectionOptions(state, context) });
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

function rememberVerifiedRequest(payload, { provider = '', model = '' } = {}) {
    const guidanceBlock = String(payload).match(/<living-world-guide>[\s\S]*?<\/living-world-guide>/iu)?.[0] || '';
    if (!guidanceBlock) return;
    const context = currentContext();
    const messages = messagesFromChat(context.chat || []);
    const s = getSettings();
    const state = loadState(context.chatMetadata);
    pendingRequestVerification = {
        status: 'included',
        guidanceBlock,
        requestedAt: Date.now(),
        confirmedAt: 0,
        sourceMessageCount: messages.length,
        responseMessageCount: 0,
        chatId: String(context.getCurrentChatId?.() || ''),
        provider: String(provider || ''),
        model: String(model || ''),
        position: s.injectionPosition,
        role: s.injectionRole,
        depth: s.injectionPosition === 'at-depth' ? s.injectionDepth : 0,
        guideCandidates: generationGuideSelection
            ? (generationGuideSelection.usable ? generationGuideSelection.candidates : [])
            : state.nextGuides,
        canonConstraints: state.canonConstraints,
        selectedGuideIndex: generationGuideSelection?.index || 0,
        replacementGeneration: generationGuideSelection?.replacement === true,
        conductorDevelopmentId: state.conductor.status === 'active' ? state.conductor.developmentId : '',
        conductorContract: state.conductor.status === 'active' ? state.conductor : null,
    };
    renderBoard();
}

function ensureChatCompletionRequestGuidance(eventData) {
    if (eventData?.dryRun || containsPlannerMarker(eventData?.chat) || !getSettings().enabled || !Array.isArray(eventData?.chat)) return;
    const payload = currentGuidancePayload();
    if (!payload.includes('<living-world-guide>')) return;
    const inserted = ensureGuidanceInChat(eventData.chat, payload, requestInjectionOptions());
    if (inserted) renderAnalysisActivity('Guidance inserted into request', false);
    if (!chatHasCurrentGuidance(eventData.chat, payload)) throw new Error('Tale Fairy could not place current guidance in the chat request.');
}

function ensureTextCompletionRequestGuidance(eventData) {
    if (eventData?.dryRun || containsPlannerMarker(eventData?.prompt) || !getSettings().enabled || typeof eventData?.prompt !== 'string') return;
    const payload = currentGuidancePayload();
    if (!payload.includes('<living-world-guide>')) return;
    eventData.prompt = ensureGuidanceInText(eventData.prompt, payload);
    if (!textHasCurrentGuidance(eventData.prompt, payload)) throw new Error('Tale Fairy could not place current guidance in the text request.');
    rememberVerifiedRequest(payload, { provider: currentContext().mainApi });
}

function ensureProviderChatRequestGuidance(generateData) {
    if (containsPlannerMarker(generateData) || generateData?.type === 'quiet' || !getSettings().enabled || !Array.isArray(generateData?.messages)) return;
    const payload = currentGuidancePayload();
    if (!payload.includes('<living-world-guide>')) return;
    ensureGuidanceInChat(generateData.messages, payload, requestInjectionOptions());
    if (!chatHasCurrentGuidance(generateData.messages, payload)) throw new Error('Tale Fairy could not place current guidance in the provider request.');
    rememberVerifiedRequest(payload, { provider: generateData.chat_completion_source, model: generateData.model });
    renderAnalysisActivity('Guidance verified in provider request', false);
}

async function confirmReturnedReplyUsedGuidance() {
    const pending = pendingRequestVerification;
    if (!pending) return false;
    const context = currentContext();
    const chatId = String(context.getCurrentChatId?.() || '');
    const messages = messagesFromChat(context.chat || []);
    if (!returnedReplyMatchesVerification(pending, messages, chatId)) return false;

    const state = loadState(context.chatMetadata);
    state.lastRequestVerification = {
        ...pending,
        status: 'confirmed',
        confirmedAt: Date.now(),
        responseMessageCount: messages.length,
    };
    const turn = assistantTurnNumber(messages);
    if (pending.conductorDevelopmentId) {
        state.authorBoard = markAuthorBeatDelivered(state.authorBoard, pending.conductorDevelopmentId, pending.conductorContract?.developmentType, turn);
    }
    state.conductor = normalizeConductorState({ ...state.conductor, status: 'invalid' });
    state.pacing = consumeAdvanceOverride(state.pacing);
    context.updateChatMetadata(saveState(context.chatMetadata, state));
    pendingRequestVerification = null;
    if (typeof context.saveMetadata === 'function') {
        try {
            await context.saveMetadata();
        } catch (error) {
            console.warn(`[${EXTENSION_ID}] Could not persist request verification`, error);
        }
    }
    renderBoard(state);
    renderAnalysisActivity('Guidance confirmed in returned reply', false);
    return true;
}

async function persist(state, guard = {}) {
    const context = currentContext();
    const chat = messagesFromChat(context.chat || []);
    const chatId = String(context.getCurrentChatId?.() || '');
    if ((guard.chatId && chatId !== guard.chatId)
        || (guard.fingerprint && !isAnalysisSourceCurrent(guard.fingerprint, guard.messageCount, chat, { allowOneUserAppend: guard.allowOneUserAppend }))
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
        const messages = messagesFromChat(context.chat || []);
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
    analysisStopSequence++;
    generationRevision++;
    cancelAnalysisRetry();
    if (!cancelRunningAnalysis(reason, status)) {
        renderAnalysisActivity(status, false);
    }
}

function stopAnalysis() {
    const context = currentContext();
    const chatId = String(context.getCurrentChatId?.() || '');
    clearPlannerPending(plannerStorage(), chatId);
    void cancelDetachedPlannerJobs(chatId);
    interruptAnalysis('Tale Fairy analysis stopped by the user.', 'Stopped');
}

function plannerStorage() {
    try {
        return globalThis.localStorage;
    } catch {
        return null;
    }
}

function parseAnalysisResponse(value) {
    try {
        const rawResult = value && typeof value === 'object' && !Array.isArray(value) && (value.contract_version === 2 || value.scene)
            ? value
            : extractJson(completionText(value));
        const validation = validateAnalysisResult(rawResult);
        if (!validation.valid) {
            throw new AnalysisValidationError(`Planner violated its strict output contract: ${validation.errors.slice(0, 16).join('; ')}.`);
        }
        return rawResult;
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
    try {
        const jobs = await detachedPlannerJobs(chatId);
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
    const chatId = String(context.getCurrentChatId?.() || '');
    if (!chatId) return { active: false, recovered: false };
    detachedPlannerRecovering = true;
    try {
        const chat = messagesFromChat(context.chat || []);
        const jobs = await detachedPlannerJobs(chatId);
        let active = false;
        for (const job of jobs) {
            const meta = job.meta || {};
            const sourceCurrent = isAnalysisSourceCurrent(meta.fingerprint, meta.messageCount, chat, {
                allowOneUserAppend: Boolean(meta.allowOneUserAppend),
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
                result = parseAnalysisResponse(job.text);
            } catch (error) {
                await acknowledgeDetachedPlannerJob(job.id).catch(() => {});
                console.warn(`[${EXTENSION_ID}] A retained planner result was invalid`, error);
                continue;
            }
            const current = meta.rebuild ? rebuildState() : loadState(context.chatMetadata);
            current.mode = meta.mode || getSettings().mode;
            let next = applyAnalysis(current, result, chat.slice(0, Number(meta.messageCount) || chat.length));
            next = applyPlannerAuthorLayer(next, {
                turnCount: assistantTurnNumber(chat.slice(0, Number(meta.messageCount) || chat.length)),
                fingerprint: String(meta.fingerprint || ''),
            });
            next.summaryEvidence = { ...(meta.summaryEvidence || {}), scannedAt: Date.now() };
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
            });
            await acknowledgeDetachedPlannerRun(job.runKey, chatId);
            clearPlannerPending(plannerStorage(), chatId);
            lastAnalysisError = '';
            renderBoard(next);
            renderAnalysisActivity('Recovered planner result completed while this page was unavailable', false);
            return { active: false, recovered: true, state: next };
        }
        if (active) renderAnalysisActivity('Planner continuing on the SillyTavern server', true);
        return { active, recovered: false };
    } catch (error) {
        console.warn(`[${EXTENSION_ID}] Detached planner recovery check failed`, error);
        return { active: false, recovered: false };
    } finally {
        detachedPlannerRecovering = false;
    }
}

async function negotiatePlannerOutput(run, modes, label, signal, cacheKey = '', { retryInvalidOutput = true } = {}) {
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

function isolatePlannerGenerationData(generateData, reasoningMode, temperature = plannerTemperature(), samplingEnabled = true, outputMode = PLANNER_OUTPUT_MODE.JSON_SCHEMA) {
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
        generateData[key] = PLANNER_RESPONSE_TOKENS;
        responseLengthSet = true;
    }
    if (!responseLengthSet && Array.isArray(generateData.messages)) generateData.max_tokens = PLANNER_RESPONSE_TOKENS;
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

async function requestAnalysisOnce(prompt, externalSignal, detachedMeta = null) {
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(externalSignal?.reason || new DOMException('Tale Fairy analysis stopped.', 'AbortError'));
    if (externalSignal?.aborted) forwardAbort();
    else externalSignal?.addEventListener('abort', forwardAbort, { once: true });
    try {
        controller.signal.throwIfAborted();
        await detachedPlannerReady;
        controller.signal.throwIfAborted();
        const detachedMarker = detachedPlannerEnabled && detachedMeta ? { _taleFairyPlanner: detachedMeta } : {};
        const model = analysisModelOptions();
        const temperature = plannerTemperature();
        if (model.profileId) {
            const profile = ConnectionManagerRequestService.getProfile(model.profileId);
            const apiMap = ConnectionManagerRequestService.validateProfile(profile);
            const reasoningMode = plannerReasoningMode(profile);
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
                plannerMessages(PLANNER_SYSTEM_PROMPT, prompt, ANALYSIS_SCHEMA, mode),
                PLANNER_RESPONSE_TOKENS,
                { stream: false, extractData: false, includePreset: false, includeInstruct: false, signal: controller.signal },
                {
                    ...(mode === PLANNER_OUTPUT_MODE.JSON_SCHEMA ? { json_schema: ANALYSIS_SCHEMA } : {}),
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
            const runProfileMode = async mode => {
                try {
                    const response = await sendProfile(mode);
                    controller.signal.throwIfAborted();
                    return parseAnalysisResponse(response);
                } catch (error) {
                    controller.signal.throwIfAborted();
                    if (error instanceof AnalysisValidationError) throw error;
                    if (!isReasoningControlError(error) || (!reasoning.controlled && !isMandatoryReasoningError(error))) throw error;
                    reasoningPayload = reasoningFallbackPayload(error, reasoningPayload);
                    const response = await sendProfile(mode);
                    controller.signal.throwIfAborted();
                    return parseAnalysisResponse(response);
                }
            };
            return negotiatePlannerOutput(
                runProfileMode,
                [PLANNER_OUTPUT_MODE.JSON_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY],
                'connection profile',
                controller.signal,
                `profile:${model.profileId}:${apiMap.source}:${profile.model || ''}:${profile['api-url'] || ''}`,
            );
        }
        if (model.active) {
            let activeReasoningMode = plannerReasoningMode();
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
                    isolatePlannerGenerationData(generateData, activeReasoningMode, temperature, requestSamplingEnabled, mode);
                    Object.assign(generateData, detachedMarker);
                };
                eventSource.on(seedEvent, configurePlanner);
                return waitForAbortable(generateRaw({
                    prompt: plannerPrompt(prompt, ANALYSIS_SCHEMA, mode),
                    // The planner must not inherit the user's text-completion
                    // instruct template or preset formatting.
                    instructOverride: true,
                    systemPrompt: PLANNER_SYSTEM_PROMPT,
                    suppressErrorToasts: true,
                    ...(mode === PLANNER_OUTPUT_MODE.JSON_SCHEMA ? { jsonSchema: ANALYSIS_SCHEMA } : {}),
                    trimNames: false,
                }), controller.signal).finally(() => eventSource.removeListener(seedEvent, configurePlanner));
            };
            const runActiveCompatible = mode => retryWithoutUnsupportedTemperature(
                () => runActive(mode),
                () => { samplingEnabled = false; },
            );
            const runActiveMode = async mode => {
                try {
                    const raw = await runActiveCompatible(mode);
                    controller.signal.throwIfAborted();
                    return parseAnalysisResponse(raw);
                } catch (error) {
                    controller.signal.throwIfAborted();
                    if (error instanceof AnalysisValidationError || !isReasoningControlError(error)) throw error;
                    activeReasoningMode = isMandatoryReasoningError(error) ? 'minimum' : 'default';
                    const raw = await runActiveCompatible(mode);
                    controller.signal.throwIfAborted();
                    return parseAnalysisResponse(raw);
                }
            };
            return negotiatePlannerOutput(
                runActiveMode,
                [PLANNER_OUTPUT_MODE.JSON_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY],
                'active model',
                controller.signal,
                `active:${activeContext.mainApi || ''}:${activeSource}`,
            );
        }
        const reasoningMode = plannerReasoningMode();
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
            const body = { chat_completion_source: model.provider, model: model.model, messages: plannerMessages(PLANNER_SYSTEM_PROMPT, prompt, ANALYSIS_SCHEMA, mode), max_tokens: PLANNER_RESPONSE_TOKENS, stream: false, ...plannerTemperaturePayload(temperature, samplingEnabled), ...modePayload, ...(mode === PLANNER_OUTPUT_MODE.JSON_SCHEMA ? { json_schema: ANALYSIS_SCHEMA } : {}), ...(model.provider === 'openrouter' ? { api_url: model.url.replace(/\/$/, '') } : { custom_url: model.url.replace(/\/$/, '') }), ...detachedMarker };
            if (model.secretId) body.secret_id = model.secretId;
            const response = await fetch('/api/backends/chat-completions/generate', { method: 'POST', headers: currentContext().getRequestHeaders?.() || getRequestHeaders?.() || { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
            const payload = await response.json();
            if (!response.ok || payload?.error) throw new Error(payload?.error?.message || payload?.error || `Analysis request failed (${response.status}).`);
            controller.signal.throwIfAborted();
            return parseAnalysisResponse(payload);
        };
        const send = mode => retryWithoutUnsupportedTemperature(
            () => sendRaw(mode),
            () => { samplingEnabled = false; },
        );
        const runDirectMode = async mode => {
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
        const glmTarget = model.provider === 'custom' && /^(?:.*\/)?glm[-_.]/i.test(model.model);
        const modes = plannerOutputModes(model);
        return negotiatePlannerOutput(
            runDirectMode,
            modes,
            'direct model',
            controller.signal,
            `direct:${model.provider}:${model.model}:${model.url}`,
            { retryInvalidOutput: !glmTarget },
        );
    } finally {
        externalSignal?.removeEventListener('abort', forwardAbort);
    }
}

async function requestAnalysis(prompt, externalSignal, detachedMeta) {
    return requestAnalysisOnce(prompt, externalSignal, detachedMeta);
}

export async function analyzeNow({ note = null, force = false, messages = null, rebuild = false, allowOneUserAppend = false, allowStaleContinuity = false, waitForContinuity = false, retryAttempt = 0 } = {}) {
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
        cancelRunningAnalysis('A newer Tale Fairy analysis replaced this request.', 'Restarting…');
    }
    const revision = ++generationRevision;
    const runId = ++analysisRunId;
    const detachedRunKey = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${runId}-${randomVariationNonce()}`;
    const variationNonce = randomVariationNonce();
    const startedAt = Date.now();
    const controller = new AbortController();
    analysisAbortController = controller;
    analysisRequestFingerprint = fingerprint;
    markPlannerPending(plannerStorage(), chatId, fingerprint);
    showAnalysisPhase('Waiting for planner slot', runId, startedAt);
    let finalStatus = 'Updated';
    const runAnalysis = async () => {
        const latestSaved = loadState(context.chatMetadata);
        const current = rebuild ? rebuildState(latestSaved) : latestSaved;
        current.mode = s.mode;
        const analysisSelection = {
            source: s.analysisSource,
            profileId: s.analysisProfileId,
            model: s.analysisModel,
            url: s.analysisUrl,
        };
        if (waitForContinuity) showAnalysisPhase('Waiting for Continuity Memory', runId, startedAt);
        const continuityContext = waitForContinuity
            ? await optionalContinuityContextWhenReady(context, allowStaleContinuity, controller.signal)
            : optionalContinuityContext(context, allowStaleContinuity);
        controller.signal.throwIfAborted();
        showAnalysisPhase('Reading summaries and World Info', runId, startedAt);
        const summarySources = await collectSummarySources(context, chat, {
            continuityContext,
            includeContinuity: s.continuityIntegration,
            ownPromptKey: PROMPT_KEY,
            tokenBudget: s.summaryContextTokens,
            worldInfoActivationTokens: s.maxPromptTokens,
            onWarning: (message, error) => console.warn(`[${EXTENSION_ID}] ${message}`, error),
        });
        lastSummaryAudit = summarySourceAudit(summarySources);
        controller.signal.throwIfAborted();
        showAnalysisPhase(`Building ${Number(s.maxPromptTokens).toLocaleString()}-token total planner input`, runId, startedAt);
        const plannerPrompt = await buildTokenBudgetedAnalysisPrompt(chat, current, noteInstruction(userNote), bootstrapContext(context), { recentContextTokens: s.recentContextTokens, messageTokenLimit: s.messageTokenLimit, summaryContextTokens: s.summaryContextTokens, summarySources, bootstrapScan: rebuild || current.canonBootstrapPending || current.scene.status === 'uninitialized' || !current.contextLedger, maxPromptTokens: s.maxPromptTokens, variationNonce });
        showAnalysisPhase('Waiting for planner model', runId, startedAt);
        const result = await requestAnalysis(plannerPrompt, controller.signal, {
            chatId,
            runKey: detachedRunKey,
            fingerprint,
            messageCount: chat.length,
            allowOneUserAppend,
            rebuild,
            mode: current.mode,
            plannerSeed: variationNonce,
            analysisSelection,
            userNote,
            summaryEvidence: lastSummaryAudit,
        });
        controller.signal.throwIfAborted();
        showAnalysisPhase('Validating and saving planner result', runId, startedAt);
        const resolvedNote = resolveUserNote(result, userNote);
        if (revision !== generationRevision) {
            finalStatus = 'Skipped · chat changed';
            return current;
        }
        let next = applyAnalysis(current, result, chat);
        next = applyPlannerAuthorLayer(next, { turnCount: assistantTurnNumber(chat), fingerprint });
        next.summaryEvidence = { ...lastSummaryAudit, scannedAt: Date.now() };
        next.plannerSeed = variationNonce;
        next.sourceChatId = chatId;
        next.analysisModel = analysisSelection;
        if (resolvedNote) next.userNotes = [...next.userNotes, { ...resolvedNote, at: Date.now() }].slice(-12);
        next.noteNeedsClarification = Boolean(userNote && !resolvedNote);
        await persist(next, { chatId, fingerprint, messageCount: chat.length, allowOneUserAppend });
        await acknowledgeDetachedPlannerRun(detachedRunKey, chatId);
        clearPlannerFailed(plannerStorage(), chatId);
        cancelAnalysisRetry();
        lastAnalysisError = '';
        finalStatus = userNote && !resolvedNote
            ? 'Note not applied · try again'
            : `Pathways ready · ${elapsedLabel(Date.now() - startedAt)}`;
        renderBoard(next);
        return next;
    };
    const promise = waitForPlannerHandoff(previousAnalysisPromise, controller.signal)
        .then(() => withPlannerTabLock(chatId, runAnalysis))
        .catch(error => {
            const stopped = controller.signal.aborted;
            if (!stopped) lastAnalysisError = analysisErrorMessage(error);
            const retryable = shouldRetryPlannerError(error, stopped);
            const willRetry = !stopped && retryable && analysisRetryAttempt < PLANNER_MAX_AUTO_RETRIES;
            if (!stopped && !willRetry) markPlannerFailed(plannerStorage(), chatId, fingerprint);
            finalStatus = stopped
                ? 'Stopped'
                : error?.name === 'PlannerBusyInAnotherTabError'
                    ? 'Planner active in another page'
                    : isPlannerTimeoutError(error)
                        ? `Planner timed out after ${elapsedLabel(Date.now() - startedAt)} · automatic retry stopped`
                        : willRetry
                            ? scheduleAnalysisRetry(error, { note, rebuild, waitForContinuity }, chatId)
                            : `Analysis failed · ${lastAnalysisError}`;
            if (!stopped && (!retryable || analysisRetryAttempt >= PLANNER_MAX_AUTO_RETRIES)) console.warn(`[${EXTENSION_ID}] analysis skipped`, error);
            renderBoard(loadState(context.chatMetadata));
            return loadState(context.chatMetadata);
        }).finally(() => {
            if (analysisPromise === promise) analysisPromise = null;
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

function scratchpadList(items, formatter, fallback) {
    const lines = (items || []).map(formatter).filter(Boolean);
    return lines.length ? lines.map(line => `• ${line}`).join('\n') : fallback;
}

function readableScratchpadGuidance(state) {
    let value = String(state.guidance || 'Choose a concrete beat from current evidence; deepen the present activity unless a supported horizon or due event justifies wider change.');
    const routes = [...(state.pathways || []), ...(state.nextGuides || [])]
        .filter(item => item?.id && item?.direction)
        .sort((a, b) => String(b.id).length - String(a.id).length);
    for (const route of routes) {
        const id = String(route.id).trim();
        if (!id || id.length > 60) continue;
        const escaped = id.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
        const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_-])${escaped}(?=$|[^\\p{L}\\p{N}_-])`, 'giu');
        const direction = String(route.direction).trim().slice(0, 160);
        value = value.replace(pattern, (_match, prefix) => `${prefix}“${direction}”`);
    }
    return value;
}

function renderBoard(state = loadState(currentContext().chatMetadata)) {
    const board = document.querySelector(`#${EXTENSION_ID}-board`);
    if (!board) return;
    const rebuildPending = state.canonBootstrapPending === true;
    const analyzed = state.scene.status !== 'uninitialized';
    const generatedValue = value => analyzed ? value : '';
    const boardFallback = (fallback, empty = 'No generated value yet.') => !analyzed
        ? empty
        : (rebuildPending
            ? 'Not populated in the retained plan — the requested refresh has not produced a valid saved result yet.'
            : fallback);
    const settingsRoot = document.querySelector(`#${EXTENSION_ID}-settings`);
    const pacingControl = settingsRoot?.querySelector('[data-setting="pacing"]');
    if (pacingControl) pacingControl.value = state.pacing.mode;
    const guideButton = settingsRoot?.querySelector('[data-action="guide"]');
    const guideLabel = guideButton?.querySelector('[data-role="guide-label"]');
    if (guideLabel) guideLabel.textContent = analyzed ? 'Re-evaluate' : 'Guide now';
    if (guideButton) guideButton.title = analyzed
        ? 'Analyze again while retaining Tale Fairy\'s accumulated guide state'
        : 'Analyze the current chat and context';
    const analyzedAt = state.lastAnalyzedAt ? new Date(state.lastAnalyzedAt).toLocaleString() : '';
    const meta = rebuildPending
        ? `Refresh pending · showing retained plan from ${analyzedAt || 'the previous version'} · not injected until refreshed`
        : (analyzed ? `${state.mode} mode · updated ${analyzedAt || 'recently'}` : '');
    scratchpadText(board, 'scratchpad-meta', meta, 'No planner result yet. Run Guide now or Full rebuild.');
    const continuityStatus = analyzed ? continuityContextState(currentContext()).status : 'unavailable';
    const summaryAudit = state.summaryEvidence?.scannedAt ? state.summaryEvidence : lastSummaryAudit;
    const continuitySummaryIncluded = summaryAudit.labels?.some(label => /continuity/i.test(label));
    const summaryStatus = summaryAudit.scannedAt || summaryAudit.count
        ? ` · summary evidence: ${summaryAudit.count} sources / ${summaryAudit.includedTokens.toLocaleString()} tokens${continuitySummaryIncluded ? ' · Continuity-derived source included' : ''}`
        : ' · summary evidence will be scanned during analysis';
    scratchpadText(board, 'scratchpad-continuity', `Direct Continuity connector: ${continuityStatus}${summaryStatus}`, 'Direct Continuity connector: unavailable');

    const layers = state.narrativeLayers || {};
    const scene = [
        state.pacing && `Tale Fairy pacing: ${state.pacing.effective.toUpperCase()} (${state.pacing.mode === 'auto' ? state.pacing.reason : `${state.pacing.mode} override`})`,
        layers.immediateAction && `Immediate action: ${layers.immediateAction}`,
        layers.localActivity && `Local activity: ${layers.localActivity} [${layers.activityRole || 'routine'}]`,
        layers.situation && `Situation: ${layers.situation}`,
        layers.widerWorld && `Wider world: ${layers.widerWorld}`,
        layers.durableTrajectory && `Durable trajectory: ${layers.durableTrajectory}`,
        layers.temporalScope && `Authorized scope: ${layers.temporalScope}`,
        state.scene.activity && `Activity: ${state.scene.activity}`,
        state.scene.intent && `Intent: ${state.scene.intent}`,
        state.scene.pace && `Pace: ${state.scene.pace}`,
        state.scene.location && `Location: ${state.scene.location}`,
        state.scene.time && `Time: ${state.scene.time}`,
        state.scene.loop && 'Pattern: the scene may be looping or repeating',
    ].filter(Boolean).join('\n');
    scratchpadText(board, 'scratchpad-scene', generatedValue(scene), boardFallback('Immediate action: Await the first declared player action.\nLocal activity: Opening situation [transition]\nSituation: Establish the initial people, place, and pressures from the first story evidence.\nWider world: Track only pressures with a credible route toward the scene.\nDurable trajectory: Grow an open-ended path from the player’s choices without deciding those choices.', 'No generated scene state yet.'));

    const frame = state.storyFrame.frame && state.storyFrame.frame !== 'unknown'
        ? `${state.storyFrame.frame}${state.storyFrame.confidence ? ` · ${state.storyFrame.confidence} confidence` : ''}${state.storyFrame.basis ? `\nBasis: ${state.storyFrame.basis}` : ''}`
        : '';
    scratchpadText(board, 'scratchpad-frame', generatedValue(frame), boardFallback('grounded · low confidence\nBasis: Provisional opening classification; replace it immediately when the first story evidence supports heightened or surreal.', 'No generated story frame yet.'));

    const lore = state.loreModel || {};
    const loreText = [
        lore.worldIdentity && `World: ${lore.worldIdentity}${lore.confidence ? ` · ${lore.confidence} confidence` : ''}`,
        lore.baseline && `Inferred baseline: ${lore.baseline}`,
        lore.variantRules?.length && `Narrative-supplied rules: ${lore.variantRules.join('; ')}`,
        lore.continuitySignatures?.length && `Unique to this RP: ${lore.continuitySignatures.join('; ')}`,
        lore.baselineDepartures?.length && `Changes from baseline: ${lore.baselineDepartures.join('; ')}`,
        lore.trajectorySignals?.length && `Trajectory evidence: ${lore.trajectorySignals.join('; ')}`,
        lore.activeForces?.length && `Active lore forces: ${lore.activeForces.join('; ')}`,
    ].filter(Boolean).join('\n');
    scratchpadText(board, 'scratchpad-lore', generatedValue(loreText), boardFallback('World: Infer the setting from supplied evidence.\nInferred baseline: Use recognized lore provisionally.\nUnique to this RP: Preserve distinctive established facts and accumulated changes.\nChanges from baseline: Record only evidenced departures.', 'No generated lore model yet.'));

    const score = state.directorScore || {};
    const setup = score.futureSetup || {};
    const directorScore = score.storyIdentity ? [
        `Overall story: ${score.storyIdentity}`,
        score.sceneFunction && `Current scene function: ${score.sceneFunction}`,
        score.settingIdentity && `Setting: ${score.settingIdentity}`,
        score.settingForces?.length && `Active causal forces: ${score.settingForces.join('; ')}`,
        `Causal tempo: ${String(score.causalTempo || 'hold').toUpperCase()}${score.change ? ` · ${score.change}` : ''}`,
        score.arcDirection && `Near-term arc: ${score.arcDirection}`,
        setup.development && `Private future setup: ${setup.development}${setup.earliestWindow ? ` · earliest ${setup.earliestWindow}` : ''}`,
        setup.currentStep && `Setup step: ${setup.currentStep}`,
        setup.conditions?.length && `Setup needs: ${setup.conditions.join('; ')}`,
        score.meaningfulAim && `Meaningful aim: ${score.meaningfulAim}`,
        score.basis && `Basis: ${score.basis}`,
    ].filter(Boolean).join('\n') : '';
    scratchpadText(board, 'scratchpad-director-score', generatedValue(directorScore), boardFallback('Overall story: An open-ended character story that will specialize around the first concrete action.\nCurrent scene function: Establish and deepen a playable situation while preserving every player choice.\nSetting: The opening location as a source of sensory context and causally supported possibilities.\nCausal tempo: HOLD\nNear-term arc: Let current evidence determine whether to sustain, advance, reveal, introduce, or pay off.\nPrivate future setup: Keep one distant transformation available without making it canon.\nMeaningful aim: Change knowledge, relationships, pressures, or available choices without controlling the player.', 'No generated director plan yet.'));

    const pathways = state.pathways || [];
    const requiredRouteLanes = ['immediate', 'character', 'relationship-institution', 'lore-world', 'original', 'long-range'];
    const representedRouteLanes = new Set(pathways.map(item => item.lane).filter(Boolean));
    const causalCenters = new Set(pathways.map(item => item.agent?.trim().toLocaleLowerCase()).filter(Boolean));
    const causalEngines = new Set(pathways.map(item => item.engine?.trim().toLocaleLowerCase()).filter(Boolean));
    const routePortfolioAudit = pathways.length
        ? `Portfolio: ${requiredRouteLanes.filter(lane => representedRouteLanes.has(lane)).length}/${requiredRouteLanes.length} core lanes · ${causalEngines.size} causal engines · ${causalCenters.size} causal centers · ${pathways.length} retained routes`
        : '';
    const pathwayLines = pathways.map(item => [
        `${item.id} [${[item.lane, item.status, item.horizon, item.scale, item.origin, item.change !== 'keep' ? item.change : ''].filter(Boolean).join(' · ')}] — ${item.direction}`,
        item.agent && `Causal center: ${item.agent}${item.relation ? ` (${item.relation})` : ''}`,
        item.engine && `Engine: ${item.engine}`,
        item.mechanismStatus && `Mechanism: ${item.mechanismStatus}${item.mechanismBasis ? ` — ${item.mechanismBasis}` : ''}`,
        `Use when: ${item.when}`,
        item.responseBias && `If chosen: ${item.responseBias}`,
        item.conditions?.length && `Needs: ${item.conditions.join('; ')}`,
        item.reason && `Basis: ${item.reason}`,
    ].filter(Boolean).join('\n'));
    scratchpadText(board, 'scratchpad-pathways', generatedValue([routePortfolioAudit, pathwayLines.join('\n\n')].filter(Boolean).join('\n\n')), boardFallback('opening-depth [foreground · first scene] — Develop the first declared activity through its own actions, sensory state, and immediate consequences.\nUse when: No wider development has a supported route into the beat.\n\nopening-horizon [available · early scenes] — Prepare a setting-compatible reaction, process, or opportunity.\nUse when: Current evidence provides a credible causal bridge.', 'No generated pathways yet.'));

    const guideLines = (state.nextGuides || []).map((item, index) => [
        `${index === 0 ? 'Preferred current beat' : `Alternative ${index + 1}`} · ${item.id} [${[item.routeLane, item.causalAgent, item.scale, item.strength].filter(Boolean).join(' · ')}] — ${item.direction}`,
        `Impact envelope: ${item.worldDelta}`,
        `Grounding: ${item.origin} — ${item.basis}`,
        item.causalEngine && `Engine: ${item.causalEngine}`,
        item.mechanismStatus && `Mechanism: ${item.mechanismStatus}${item.mechanismBasis ? ` — ${item.mechanismBasis}` : ''}`,
        `Use if: ${item.useWhen}`,
        `Drop if: ${item.dropWhen}`,
        item.causalRole && `Causal role: ${item.causalRole}`,
        item.sourcePathways?.length && `Source pathways: ${item.sourcePathways.join('; ')}`,
        item.causalEventIds?.length && `Causal events: ${item.causalEventIds.join('; ')}`,
        item.disclosure && item.disclosure !== 'none' && `Disclosure: ${item.disclosure}`,
        item.reason && `Why ranked here: ${item.reason}`,
    ].filter(Boolean).join('\n'));
    scratchpadText(board, 'scratchpad-next-guides', generatedValue(guideLines.join('\n\n')), boardFallback('Preferred current beat · opening-depth [moderate] — Deepen the first established activity through its own concrete process and sensory state.\nImpact envelope: The activity progresses while every consequential player choice remains open.\n\nAlternative 2 · opening-reaction [light] — Show a reaction or consequence only if current evidence supports it.\nImpact envelope: The scene gains meaning without forced escalation.\n\nAlternative 3 · opening-horizon [light] — Prepare one setting-compatible route without inserting it into the scene.\nImpact envelope: A future option becomes possible, not promised.', 'No generated next guides yet.'));

    const horizonLines = (state.planHorizons?.items || []).map((item, index, items) => {
        const change = item.change && item.change !== 'keep' ? ` · ${item.change}` : '';
        return [
            `${item.timeframe || 'Future'} [${item.stability || 'adaptive'} · ${horizonInfluence(index, items.length)} influence${change}] — ${item.direction}`,
            item.branch && `Branch: ${item.branch}${item.lane ? ` · ${item.lane}` : ''}${item.scale ? ` · ${item.scale}` : ''}${item.origin ? ` · ${item.origin}` : ''}`,
            item.agent && `Causal center: ${item.agent}${item.relation ? ` (${item.relation})` : ''}`,
            item.engine && `Engine: ${item.engine}`,
            item.mechanismStatus && `Mechanism: ${item.mechanismStatus}${item.mechanismBasis ? ` — ${item.mechanismBasis}` : ''}`,
            item.conditions?.length && `Needs: ${item.conditions.join('; ')}`,
            item.reason && `Basis: ${item.reason}`,
        ].filter(Boolean).join('\n');
    });
    const deviation = state.planHorizons?.deviation;
    if (deviation?.level && deviation.level !== 'none') horizonLines.push(`Deviation: ${deviation.level}${deviation.reason ? ` — ${deviation.reason}` : ''}`);
    scratchpadText(board, 'scratchpad-horizons', generatedValue(horizonLines.join('\n')), boardFallback('First action [fluid · immediate influence] — Establish the opening activity and its direct response.\nCurrent scene [adaptive · strong influence] — Let relationships or practical conditions begin changing.\nNext scene [adaptive · moderate influence] — Carry forward one consequence or opportunity.\nSeveral scenes [stable · light influence] — Develop a recurring person, place, activity, or pressure.\nCurrent arc [stable · background influence] — Let accumulated choices reshape the character’s circumstances.\nLater arcs / open-ended [slow · background influence] — Keep multiple major life directions available and fully revisable.', 'No generated planning horizons yet.'));

    const challenge = state.selfChallenge || {};
    const challengeText = [
        challenge.weakness && `Weakness tested: ${challenge.weakness}`,
        challenge.counterRoute && `Strongest counter-route: ${challenge.counterRoute}`,
        challenge.mechanismCheck && `Mechanism scope check: ${challenge.mechanismCheck}`,
        challenge.decision && `Decision: ${challenge.decision}`,
    ].filter(Boolean).join('\n');
    scratchpadText(board, 'scratchpad-self-challenge', generatedValue(challengeText), boardFallback('Weakness tested: The first idea may be overfocused on the newest local beat.\nStrongest counter-route: Compare a distinct established continuity or wider-world route.\nDecision: Keep or revise the preference according to causal support, variety, simulation integrity, and player agency.', 'No planner self-challenge yet.'));

    const audit = state.cueAudit;
    const auditText = audit?.offeredIds?.length
        ? `Cue audit: ${audit.pacing} pacing · ${audit.manifestedIds.length} manifested · ${audit.unusedIds.length} unused · ${audit.contradictedIds.length} contradicted${audit.reason ? `\n${audit.reason}` : ''}`
        : '';
    const recovered = state.nextGuides.some(guide => /^recovered-path-guide-/u.test(guide.id || ''))
        && /Recovered (?:usable narrative guidance from incomplete planner output|ranked guidance from grounded planner pathways)/iu.test(state.lastReason || '');
    const decision = [
        readableScratchpadGuidance(state),
        state.lastReason && (recovered
            ? 'Recovery: the planner omitted ranked guides, so Tale Fairy rebuilt them from grounded pathways.'
            : `Why: ${state.lastReason}`),
        auditText,
    ].filter(Boolean).join('\n\n');
    scratchpadText(board, 'scratchpad-guidance', generatedValue(decision), boardFallback('Choose the current beat from present evidence. Deepen the authorized activity unless a selected horizon or due event provides a concrete reason for wider change.', 'No generated response guidance yet.'));

    const chatId = String(currentContext().getCurrentChatId?.() || '');
    const verification = pendingRequestVerification?.chatId === chatId
        ? pendingRequestVerification
        : state.lastRequestVerification;
    const verificationText = verification
        ? [
            verification.status === 'confirmed'
                ? 'CONFIRMED — the provider returned an assistant reply from a request containing this exact Tale Fairy block.'
                : 'INCLUDED — this exact Tale Fairy block is in the outgoing provider request; waiting for its reply.',
            verification.requestedAt ? `Request: ${new Date(verification.requestedAt).toLocaleString()}` : '',
            verification.confirmedAt ? `Reply confirmed: ${new Date(verification.confirmedAt).toLocaleString()}` : '',
            [verification.provider, verification.model].filter(Boolean).length ? `Provider: ${[verification.provider, verification.model].filter(Boolean).join(' · ')}` : '',
            `Placement: ${verification.position || 'at-depth'} · ${verification.role || 'system'}${verification.position === 'at-depth' ? ` · depth ${verification.depth}` : ''}`,
            `\nExact dynamic block:\n${verification.guidanceBlock}`,
        ].filter(Boolean).join('\n')
        : '';
    scratchpadText(board, 'scratchpad-request-verification', verificationText, 'No roleplay-generation guide injection has been verified yet.');

    const displayedObjectives = state.objectives?.length
        ? state.objectives
        : (state.planHorizons?.items || []).slice(0, 4).map(item => ({
            title: `Open direction · ${item.timeframe || 'future'}`,
            detail: item.direction,
            status: item.stability,
        }));
    scratchpadText(board, 'scratchpad-objectives', analyzed ? scratchpadList(displayedObjectives, item => {
        if (!item?.title && !item?.detail) return '';
        return `${item.title || 'Open direction'}${item.detail ? ` — ${item.detail}` : ''}${item.status ? ` [${item.status}]` : ''}`;
    }, '') : '', boardFallback('Opening objective — Establish what the character is doing, what can respond, and which choices remain open. [provisional]', 'No generated objectives yet.'));

    scratchpadText(board, 'scratchpad-continuity-routes', analyzed ? scratchpadList(state.continuityThreads, item => {
        if (!item?.thread) return '';
        return `${item.thread} [${item.status || 'dormant'}] — ${item.state}${item.basis ? `\n  Basis: ${item.basis}` : ''}`;
    }, '') : '', 'No established open routes yet.');

    const displayedPossibilities = state.possibilities?.length
        ? state.possibilities
        : (state.pathways || []).filter(item => item?.status !== 'blocked').slice(0, 6).map(item => ({
            description: item.direction,
            horizon: item.status === 'foreground' ? 'local' : item.status === 'latent' ? 'mid' : 'near',
            conditions: item.conditions,
            force: item.status === 'foreground' ? 'strong' : item.status === 'latent' ? 'light' : 'moderate',
        }));
    scratchpadText(board, 'scratchpad-possibilities', analyzed ? scratchpadList(displayedPossibilities, item => {
        if (!item?.description) return '';
        const conditions = Array.isArray(item.conditions) && item.conditions.length ? ` Conditions: ${item.conditions.join('; ')}.` : '';
        return `${item.horizon ? `[${item.horizon}] ` : ''}${item.description}${conditions}${item.force ? ` Weight: ${item.force}.` : ''}`;
    }, '') : '', boardFallback('A relationship becomes important. Weight: moderate.\nA routine develops into a recurring source of change. Weight: light.\nA new ally, rival, mentor, neighbor, colleague, or institution takes interest. Weight: light.\nA practical opportunity opens. Weight: light.\nA misunderstanding creates quiet conflict. Weight: light.\nA success changes expectations. Weight: light.\nA setback redirects the current route. Weight: light.\nAn invitation opens a different social path. Weight: light.\nA hidden motive later becomes relevant. Weight: light.\nA departure or return changes a relationship. Weight: light.\nA moral or allegiance choice becomes possible. Weight: light.\nA distant transformation emerges from accumulated choices. Weight: light.', 'No generated possibilities yet.'));

    scratchpadText(board, 'scratchpad-entities', analyzed ? scratchpadList(state.entities, item => {
        if (!item?.name) return '';
        const details = [
            item.state,
            item.perspective && `Perspective: ${item.perspective}`,
            item.motivation && `Motivation: ${item.motivation}`,
            item.knowledge && `Knowledge: ${item.knowledge}`,
            item.constraints && `Constraints: ${item.constraints}`,
            item.agenda && `Independent agenda: ${item.agenda}`,
            item.location, item.relevance, item.confidence && `${item.confidence} confidence`, item.window,
        ].filter(Boolean).join(' · ');
        return `${item.name}${details ? ` — ${details}` : ''}`;
    }, '') : '', boardFallback('Opening situation — Waiting to replace this provisional process with the first concrete people, institutions, places, and ongoing activities.', 'No generated entities or processes yet.'));

    const displayedLedger = state.contextLedger || [
        state.scene?.activity && `Working scene: ${state.scene.activity}.`,
        state.narrativeLayers?.situation && `Situation: ${state.narrativeLayers.situation}`,
        state.narrativeLayers?.widerWorld && `Wider context: ${state.narrativeLayers.widerWorld}`,
        state.narrativeLayers?.durableTrajectory && `Durable trajectory: ${state.narrativeLayers.durableTrajectory}`,
    ].filter(Boolean).join('\n');
    scratchpadText(board, 'scratchpad-ledger', generatedValue(displayedLedger), boardFallback('Opening state: no story facts have been established yet. First evidence will replace this line with concrete continuity.', 'No generated context ledger yet.'));

    scratchpadText(board, 'scratchpad-events', analyzed ? scratchpadList(state.narrativeEvents, item => {
        if (!item?.title) return '';
        const stateLabels = [item.scope, item.epistemicStatus, item.disclosure, item.status].filter(Boolean).join(' · ');
        const timing = [item.timing, item.dueState].filter(Boolean).join(' · ');
        const engine = item.engine ? `\n  Engine: ${item.engine}` : '';
        const cause = item.cause ? `\n  Cause: ${item.cause}` : '';
        const requirements = Array.isArray(item.requirements) && item.requirements.length ? `\n  Needs: ${item.requirements.join('; ')}` : '';
        const effects = Array.isArray(item.consequences) && item.consequences.length ? `\n  Consequences: ${item.consequences.join('; ')}` : '';
        return `${item.title}${stateLabels ? ` [${stateLabels}]` : ''}${item.summary ? ` — ${item.summary}` : ''}${engine}${timing ? `\n  Timing: ${timing}` : ''}${cause}${requirements}${effects}${item.basis ? `\n  Basis: ${item.basis}` : ''}`;
    }, '') : '', boardFallback('No new independent causal event was established in this analysis; conditional future routes remain available.', 'No generated narrative events yet.'));

    scratchpadText(board, 'scratchpad-notes', scratchpadList(state.userNotes, item => item?.text ? `[${String(item.kind || 'note').toUpperCase()}] ${item.text}` : '', ''), 'No user notes.');
}

async function resetState({ rebuilding = false } = {}) {
    const context = currentContext();
    if (rebuilding) {
        interruptAnalysis('A Full Rebuild replaced the previous Tale Fairy analysis.', 'Clearing old guide…');
    } else {
        stopAnalysis();
    }
    pendingRequestVerification = null;
    // SillyTavern merges chat metadata by default. Omitting STATE_KEY from a
    // normal update therefore leaves the previous Tale Fairy state intact.
    // Replacement mode removes only our key from the complete current
    // metadata snapshot while preserving every other chat/extension field.
    context.updateChatMetadata(clearState(context.chatMetadata), true);
    clearPromptManagerInjection(promptManager);
    setExtensionPrompt(PROMPT_KEY, '', 0, 0);
    renderBoard(defaultState());
    renderAnalysisActivity(rebuilding ? 'Old guide cleared · saving…' : 'Guide state deleted', rebuilding);
    await context.saveMetadata?.();
}

async function rebuildGuideState() {
    // Run the actual Delete guide state operation first so these actions cannot
    // drift apart. A failed rebuild must leave the explicitly deleted state empty.
    await resetState({ rebuilding: true });
    renderAnalysisActivity('Old guide cleared · starting planner…', true);
    return analyzeNow({ force: true, rebuild: true, waitForContinuity: true });
}

async function reevaluateGuideState() {
    return analyzeNow({ force: true });
}

function resetSettingsToDefaults(root = document.querySelector(`#${EXTENSION_ID}-settings`)) {
    if (typeof globalThis.confirm === 'function' && !globalThis.confirm('Reset all Tale Fairy settings to their defaults? Guide state in the current chat will be kept.')) return;
    stopAnalysis();
    pendingRequestVerification = null;
    directModelCache.clear();
    const s = getSettings();
    for (const key of Object.keys(s)) delete s[key];
    Object.assign(s, { ...DEFAULT_SETTINGS });
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
    const upgradePending = rawVersion < 42 || rawState?.canonBootstrapPending === true;
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
            renderAnalysisActivity(`Upgrading legacy Tale Fairy plan v${rawVersion} · attempt ${attempt}/${LEGACY_UPGRADE_MAX_ATTEMPTS}…`, true);
            upgraded = await analyzeNow({ messages, force: true, rebuild: true });
            const persistedState = currentContext().chatMetadata?.[STATE_KEY];
            const persistedVersion = Math.max(0, Number(persistedState?.version) || 0);
            // Version normalization can happen before a planner pass. A rebuild
            // is only complete once that pass has actually replaced the pending
            // bootstrap state and preserved its extracted canon.
            if (persistedVersion >= STATE_VERSION && persistedState?.canonBootstrapPending !== true) {
                completed = true;
                renderBoard(upgraded);
                renderAnalysisActivity('Legacy plan upgraded', false);
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
    const recovered = await recoverDetachedPlannerJobs();
    if (recovered.recovered) return recovered.state;
    if (recovered.active) return loadState(context.chatMetadata);
    const rawState = context.chatMetadata?.[STATE_KEY];
    const rawVersion = Math.max(0, Number(rawState?.version) || 0);
    const upgradePending = Boolean(rawState && ((rawVersion > 0 && rawVersion < 42) || rawState.canonBootstrapPending === true));
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
    if (plannerFailedForSnapshot(plannerStorage(), chatId, fingerprint)) {
        updatePrompt(state);
        renderAnalysisActivity('Planner paused after unusable output · waiting for a new turn or Guide now', false);
        return state;
    }
    const decision = interrupted
        ? { shouldRun: true, code: 'interrupted', reason: 'A previously interrupted planner run must be recovered.' }
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
    const response = await fetch(new URL('./settings.html', import.meta.url));
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
    root.querySelector('[data-setting="pacing"]').value = loadState(currentContext().chatMetadata).pacing.mode;
    root.querySelector('[data-setting="reasoning"]').value = s.analysisReasoningMode;
    root.querySelector('[data-setting="temperature-slider"]').value = s.analysisTemperature;
    root.querySelector('[data-setting="temperature"]').value = s.analysisTemperature;
    root.querySelector('[data-setting="model"]').value = s.analysisModel;
    root.querySelector('[data-setting="url"]').value = s.analysisUrl;
    root.querySelector('[data-setting="continuity"]').checked = Boolean(s.continuityIntegration);
    root.querySelector('[data-setting="recent-budget"]').value = s.recentContextTokens;
    root.querySelector('[data-setting="summary-budget"]').value = s.summaryContextTokens;
    root.querySelector('[data-setting="budget"]').value = s.maxPromptTokens;
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
    root.querySelector('[data-setting="pacing"]').addEventListener('change', async e => {
        const context = currentContext();
        const state = loadState(context.chatMetadata);
        const messages = messagesFromChat(context.chat || []);
        const latestUserAction = [...messages].reverse().find(message => message.is_user)?.mes || '';
        state.pacing = updatePacing(state.pacing, {
            mode: e.target.value,
            latestUserAction,
            turnCount: assistantTurnNumber(messages) + (messages.at(-1)?.is_user ? 1 : 0),
        });
        state.conductor = normalizeConductorState({ ...state.conductor, status: 'invalid' });
        context.updateChatMetadata(saveState(context.chatMetadata, state));
        updatePrompt(state);
        renderBoard(state);
        try {
            await context.saveMetadata?.();
        } catch (error) {
            console.warn(`[${EXTENSION_ID}] Could not persist pacing control`, error);
        }
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
    root.querySelector('[data-setting="recent-budget"]').addEventListener('change', e => { invalidatePlanner(); s.recentContextTokens = Math.max(1000, Math.min(12000, Number(e.target.value) || 4000)); e.target.value = s.recentContextTokens; save(); });
    root.querySelector('[data-setting="summary-budget"]').addEventListener('change', e => { invalidatePlanner(); s.summaryContextTokens = Math.max(1000, Math.min(8000, Number(e.target.value) || 4000)); e.target.value = s.summaryContextTokens; save(); });
    root.querySelector('[data-setting="budget"]').addEventListener('change', e => { invalidatePlanner(); s.maxPromptTokens = Math.max(9000, Math.min(30000, Number(e.target.value) || 12000)); e.target.value = s.maxPromptTokens; save(); });
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
    root.querySelector('[data-setting="pacing"]').value = loadState(currentContext().chatMetadata).pacing.mode;
    root.querySelector('[data-setting="temperature-slider"]').value = s.analysisTemperature;
    root.querySelector('[data-setting="temperature"]').value = s.analysisTemperature;
    root.querySelector('[data-setting="connection"]').value = analysisConnectionChoice(s);
    root.querySelector('[data-source-panel="direct"]').hidden = !direct;
    root.querySelector('[data-setting="model"]').value = s.analysisModel;
    root.querySelector('[data-setting="url"]').value = s.analysisUrl;
    root.querySelector('[data-setting="continuity"]').checked = Boolean(s.continuityIntegration);
    root.querySelector('[data-setting="recent-budget"]').value = s.recentContextTokens;
    root.querySelector('[data-setting="summary-budget"]').value = s.summaryContextTokens;
    root.querySelector('[data-setting="budget"]').value = s.maxPromptTokens;
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
    if (type === 'quiet' || !getSettings().enabled) return;
    const context = currentContext();
    const state = prepareAuthorContract(loadState(context.chatMetadata), type);
    // Planning never blocks generation. The completed-turn guide is already
    // in metadata; the latest user action may use, reshape, or discard it.
    prepareGenerationGuide(state, type);
    updatePrompt(state);
}

// SillyTavern resolves manifest.generate_interceptor through globalThis.
// Keep the named export for module consumers while also supporting the host
// interceptor registry used by current and older builds.
globalThis.livingWorldGuideGenerateInterceptor = livingWorldGuideGenerateInterceptor;

// The generation interceptor runs before SillyTavern assembles the provider
// payload. Verify the finished request too and insert the current dynamic guide
// if another prompt path omitted it.
eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, ensureChatCompletionRequestGuidance);
eventSource.on(event_types.CHAT_COMPLETION_SETTINGS_READY, ensureProviderChatRequestGuidance);
eventSource.on(event_types.GENERATE_AFTER_COMBINE_PROMPTS, ensureTextCompletionRequestGuidance);

if (event_types.GENERATION_STOPPED) eventSource.on(event_types.GENERATION_STOPPED, () => {
    pendingRequestVerification = null;
    generationGuideSelection = null;
});
eventSource.on(event_types.MESSAGE_RECEIVED, async () => {
    generationRevision++;
    cancelRunningAnalysis('The chat advanced while Tale Fairy was analyzing.', 'Refreshing…');
    await confirmReturnedReplyUsedGuidance();
    generationGuideSelection = null;
    const context = currentContext();
    const messages = messagesFromChat(context.chat || []);
    const state = loadState(context.chatMetadata);
    const turn = assistantTurnNumber(messages);
    const latestUserAction = [...messages].reverse().find(message => message.is_user)?.mes || '';
    state.authorBoard = tickAuthorBoard(state.authorBoard, {
        turnCount: turn,
        storyTimeAdvanced: state.lastRequestVerification?.conductorContract?.pacing === 'advance' || isReleaseSignal(latestUserAction),
    });
    const responseKey = `${String(context.getCurrentChatId?.() || '')}:${turn}`;
    const replacement = state.plannerSchedule.lastCountedResponseKey === responseKey;
    state.plannerSchedule = markAssistantTurn(state.plannerSchedule, responseKey);
    const decision = plannerRefreshDecision({ state, messages, event: replacement ? 'replacement' : 'turn', swipe: replacement });
    state.plannerSchedule = withRefreshReason(state.plannerSchedule, decision);
    context.updateChatMetadata(saveState(context.chatMetadata, state));
    updatePrompt(state);
    // Ordinary turns are directed locally. The AI planner wakes only for
    // initialization, meaningful pivots/corrections/payoffs, or maintenance.
    if (getSettings().enabled && decision.shouldRun) {
        void analyzeNow({ messages, force: true, allowOneUserAppend: true, allowStaleContinuity: true });
    }
});
if (event_types.MESSAGE_SENT) eventSource.on(event_types.MESSAGE_SENT, () => {
    // analyzeNow allows exactly one appended user turn. Keep that completed-
    // response plan alive while the next reply generates instead of cancelling
    // the only planner call before it can ever persist in a fast conversation.
    generationGuideSelection = null;
    const context = currentContext();
    const state = prepareAuthorContract(loadState(context.chatMetadata));
    updatePrompt(state);
});
for (const event of [event_types.MESSAGE_EDITED, event_types.MESSAGE_UPDATED, event_types.MESSAGE_DELETED]) {
    if (event) eventSource.on(event, () => {
        generationRevision++;
        cancelRunningAnalysis('The chat was edited while Tale Fairy was analyzing.', 'Refreshing…');
        updatePrompt(loadState(currentContext().chatMetadata));
    });
}
eventSource.on(event_types.MESSAGE_SWIPED, messageId => {
    generationRevision++;
    cancelRunningAnalysis('The selected swipe changed while Tale Fairy was analyzing.', 'Refreshing…');
    const context = currentContext();
    updatePrompt(loadState(context.chatMetadata));
    // A discarded wording never advances clocks or spends a planner call.
    // Newly generated replacements reuse the archived response contract.
});
eventSource.on(event_types.CHAT_CHANGED, () => {
    pendingRequestVerification = null;
    generationGuideSelection = null;
    swipeGuideCursors.clear();
    generationRevision++;
    cancelRunningAnalysis('The active chat changed while Tale Fairy was analyzing.', 'Ready');
    updatePrompt(loadState(currentContext().chatMetadata));
    // Refresh a stale current plan as well as migrating legacy state. The
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
// CHAT_CHANGED may fire before a third-party module finishes loading. Audit
// the active plan once on startup as well, so a stale or legacy chat cannot
// remain route-less until another assistant response arrives.
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
