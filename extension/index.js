import { eventSource, event_types, extension_prompt_roles, extension_prompt_types, generateRaw, setExtensionPrompt, getRequestHeaders, getCharacterCardFields, saveSettingsDebounced } from '/script.js';
import { getContext } from '/scripts/st-context.js';
import { extension_settings } from '/scripts/extensions.js';
import { ConnectionManagerRequestService } from '/scripts/extensions/shared.js';
import { SECRET_KEYS, secret_state, writeSecret } from '/scripts/secrets.js';
import { oai_settings, openai_setting_names, openai_settings, promptManager } from '/scripts/openai.js';
import { AnalysisValidationError, applyAnalysis, ANALYSIS_SCHEMA, buildAnalysisPrompt, extractJson, finalizeAnalysisResult, requireValidAnalysisResult, SYSTEM } from './analysis.js';
import { buildPromptPayload, clearState, defaultState, fingerprintMessages, generationRetrySource, guidesForDiscardedAssistant, horizonInfluence, isAnalysisSourceCurrent, isGuidanceUsable, loadState, returnedReplyMatchesVerification, saveState, STATE_KEY, STATE_VERSION } from './state.js';
import { resolveInjectionPlacement } from './injection-placement.js';
import { clearPromptManagerInjection, configurePromptManagerInjection } from './prompt-manager-injection.js';
import { chatHasCurrentGuidance, ensureGuidanceInChat, ensureGuidanceInText, requestContainsMarker, textHasCurrentGuidance } from './request-injection.js';
import { normalizeModelListResponse } from './models.js';
import { buildReasoningRequest, isMandatoryReasoningError, isReasoningControlError, normalizeReasoningMode, reasoningFallbackPayload, resolveReasoningMode } from './reasoning-policy.js';
import { compactContinuityPrompt, readContinuityBridge, waitForContinuityBridge } from './continuity.js';

const EXTENSION_ID = 'living-world-guide';
const RUNTIME_VERSION = '0.11.17';
const PROMPT_KEY = `${EXTENSION_ID}_context`;
const DIRECT_CUSTOM_CHOICE = '__direct_custom__';
const DIRECT_OPENROUTER_CHOICE = '__direct_openrouter__';
const INJECTION_POSITIONS = new Set(['before-main', 'after-main', 'before-character-definitions', 'after-character-definitions', 'before-example-messages', 'after-example-messages', 'before-an', 'after-an', 'before-chat-history', 'after-chat-history', 'before-jailbreak', 'after-jailbreak', 'at-depth']);
const DEFAULT_SETTINGS = { enabled: true, mode: 'balanced', analysisProfileId: '', analysisSource: 'active', analysisProvider: 'custom', analysisModel: '', analysisUrl: '', analysisSecretId: '', analysisReasoningMode: 'auto', analysisTemperature: 1, directSettingsMigrated: false, directCustomModel: '', directCustomUrl: '', directCustomSecretId: '', directOpenRouterModel: '', directOpenRouterUrl: '', directOpenRouterSecretId: '', injectionPosition: 'at-depth', injectionDepth: 1, injectionRole: 'user', includeWorldInfo: false, showDirectorNotes: false, messageWindow: 12, messageCharLimit: 700, maxPromptChars: 12000, continuityIntegration: true, continuityContextLimit: 3500, contextSettingsVersion: 6 };
let settings = null;
let analysisPromise = null;
let analysisAbortController = null;
let analysisRequestFingerprint = '';
let analysisRunId = 0;
let generationRevision = 0;
let analysisStopSequence = 0;
let lastAnalysisError = '';
let pendingRequestVerification = null;
let generationGuideSelection = null;
const swipeGuideCursors = new Map();
let uiMountPromise = null;
let uiMountObserver = null;
let uiMountTimeout = null;
const legacyUpgradeAttempts = new Set();
const directModelCache = new Map();
// Reasoning providers may count hidden thinking against this ceiling. The
// planner prompt and schema separately target a concise visible JSON result.
const PLANNER_RESPONSE_TOKENS = 32768;
const UI_MOUNT_TIMEOUT_MS = 30000;
const LEGACY_UPGRADE_MAX_ATTEMPTS = 1;
const INTERNAL_PLANNER_MARKER = 'You are Tale Fairy, a narrative planning layer for SillyTavern roleplay.';

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
        if ([900, 1200].includes(Number(settings.messageCharLimit))) settings.messageCharLimit = 700;
        if ([14000, 18000].includes(Number(settings.maxPromptChars))) settings.maxPromptChars = 12000;
        if ([4000, 5000].includes(Number(settings.continuityContextLimit))) settings.continuityContextLimit = 3500;
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
    const s = getSettings();
    return compactContinuityPrompt(continuityContextState(context, allowStale).text, s.continuityContextLimit);
}

async function optionalContinuityContextWhenReady(context, allowStale, signal) {
    const s = getSettings();
    const immediate = continuityContextState(context, allowStale);
    if (!s.continuityIntegration || immediate.text) return compactContinuityPrompt(immediate.text, s.continuityContextLimit);
    const ready = await waitForContinuityBridge(context, () => globalThis.continuityMemoryBridge, {
        allowStale,
        timeoutMs: 8000,
        intervalMs: 200,
        signal,
    });
    // Preserve compatibility with Continuity versions that expose only their
    // SillyTavern extension prompt rather than the bridge.
    const finalState = ready.text ? ready : continuityContextState(context, allowStale);
    return compactContinuityPrompt(finalState.text, s.continuityContextLimit);
}

function auxiliaryTexts(value) {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(auxiliaryTexts);
    if (value && typeof value === 'object') {
        return [value.summary, value.text, value.content, value.value].flatMap(auxiliaryTexts);
    }
    return [];
}

async function collectHostContext(context, messages = []) {
    const sections = [];
    const seen = new Set();
    const append = (label, value, limit = 2400) => {
        for (const candidate of auxiliaryTexts(value)) {
            const text = String(candidate || '').replace(/\s+/g, ' ').trim().slice(0, limit);
            const key = text.toLocaleLowerCase();
            if (!text || seen.has(key)) continue;
            seen.add(key);
            sections.push(`[${label}] ${text}`);
        }
    };

    const usefulKey = /summary|summaries|synopsis|recap|story.?so.?far|memory|context/iu;
    for (const [key, value] of Object.entries(context.chatMetadata || {})) {
        if (usefulKey.test(key)) append(`Chat ${key}`, value);
    }
    for (const message of [...(context.chat || [])].reverse()) {
        for (const [key, value] of Object.entries(message?.extra || {})) {
            if (usefulKey.test(key)) append(`Message ${key}`, value);
        }
    }

    if (typeof context.getWorldInfoPrompt === 'function' && messages.length) {
        try {
            const chatForWorldInfo = messages.map(message => String(message?.mes || '')).filter(Boolean).reverse();
            const result = await context.getWorldInfoPrompt(chatForWorldInfo, Number(context.maxContext) || 100000, true);
            append('Active World Info', result?.worldInfoString || result, 3500);
        } catch (error) {
            console.warn(`[${EXTENSION_ID}] Could not read active World Info for planner context`, error);
        }
    }

    return sections.join('\n').slice(0, 8000);
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
    if (generationGuideSelection?.chatId === chatId) {
        return {
            guidanceUsable: generationGuideSelection.usable,
            guideCandidates: generationGuideSelection.candidates,
            guideIndex: generationGuideSelection.index,
            regeneration: generationGuideSelection.regeneration,
            variationCue: generationGuideSelection.variationCue,
            canonConstraints: generationGuideSelection.canonConstraints,
        };
    }
    const chat = messagesFromChat(context.chat || []);
    return {
        guidanceUsable: isGuidanceUsable(state, chat, chatId),
        guideCandidates: null,
        guideIndex: 0,
        regeneration: false,
        variationCue: 0,
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
            : loadState(context.chatMetadata).nextGuides,
        canonConstraints: loadState(context.chatMetadata).canonConstraints,
        selectedGuideIndex: generationGuideSelection?.index || 0,
        replacementGeneration: generationGuideSelection?.replacement === true,
    };
    renderBoard();
}

function ensureChatCompletionRequestGuidance(eventData) {
    if (eventData?.dryRun || containsPlannerMarker(eventData?.chat) || !getSettings().enabled || !Array.isArray(eventData?.chat)) return;
    const payload = currentGuidancePayload();
    if (!payload.includes('<living-world-guide>')) return;
    const repaired = ensureGuidanceInChat(eventData.chat, payload, requestInjectionOptions());
    if (repaired) renderAnalysisActivity('Guidance inserted into request', false);
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

function completionText(value) {
    const content = value?.choices?.[0]?.message?.content ?? value?.choices?.[0]?.text ?? value?.content ?? value?.text ?? value;
    if (Array.isArray(content)) return content.map(item => item?.text || item?.content || '').join('');
    return String(content ?? '');
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

function renderAnalysisActivity(message, running = false) {
    const root = document.querySelector(`#${EXTENSION_ID}-settings`);
    if (!root) return;
    const status = root.querySelector('[data-role="analysis-status"]');
    if (status) status.textContent = message;
    root.querySelector('[data-action="stop"]')?.toggleAttribute('disabled', !running);
    root.querySelector('[data-action="guide"]')?.toggleAttribute('disabled', running);
    root.querySelector('[data-action="rebuild"]')?.toggleAttribute('disabled', running);
}

function cancelRunningAnalysis(reason, status) {
    if (!analysisAbortController) return false;
    analysisRunId++;
    analysisAbortController.abort(new DOMException(reason, 'AbortError'));
    analysisAbortController = null;
    analysisPromise = null;
    analysisRequestFingerprint = '';
    if (status) renderAnalysisActivity(status, false);
    return true;
}

function stopAnalysis() {
    generationGuideSelection = null;
    analysisStopSequence++;
    generationRevision++;
    if (!cancelRunningAnalysis('Tale Fairy analysis stopped by the user.', 'Stopped')) {
        renderAnalysisActivity('Stopped', false);
    }
}

function parseAnalysisResponse(value, evidence = '') {
    try {
        let result;
        if (value && typeof value === 'object' && !Array.isArray(value) && value.scene) {
            result = requireValidAnalysisResult(value);
        } else {
            result = requireValidAnalysisResult(extractJson(completionText(value)));
        }
        return finalizeAnalysisResult(result, evidence);
    } catch (error) {
        if (error instanceof AnalysisValidationError) throw error;
        throw new AnalysisValidationError(`Planner did not return valid JSON: ${error?.message || error}.`);
    }
}

function fallbackSystemPrompt() {
    return `${SYSTEM}\nThe provider did not honor structured output. Return exactly one JSON object matching this schema, with no Markdown fences or surrounding text:\n${JSON.stringify(ANALYSIS_SCHEMA.value)}`;
}

function waitForAbortable(promise, signal) {
    if (signal.aborted) return Promise.reject(signal.reason);
    return Promise.race([
        promise,
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
    ]);
}

function isolatePlannerGenerationData(generateData, reasoningMode, temperature = plannerTemperature()) {
    if (!generateData || typeof generateData !== 'object') return;
    generateData.stream = false;
    generateData.n = 1;
    generateData.temperature = normalizePlannerTemperature(temperature);
    generateData.top_p = 1;
    generateData.frequency_penalty = 0;
    generateData.presence_penalty = 0;
    generateData.repetition_penalty = 1;
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

async function requestAnalysisOnce(prompt, externalSignal) {
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(externalSignal?.reason || new DOMException('Tale Fairy analysis stopped.', 'AbortError'));
    if (externalSignal?.aborted) forwardAbort();
    else externalSignal?.addEventListener('abort', forwardAbort, { once: true });
    try {
        controller.signal.throwIfAborted();
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
            const sendProfile = (structured, systemPrompt = SYSTEM) => ConnectionManagerRequestService.sendRequest(
                model.profileId,
                [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
                PLANNER_RESPONSE_TOKENS,
                { stream: false, extractData: false, includePreset: false, includeInstruct: false, signal: controller.signal },
                {
                    ...(structured ? { json_schema: ANALYSIS_SCHEMA } : {}),
                    custom_prompt_post_processing: '',
                    temperature,
                    ...reasoningPayload,
                },
            );
            try {
                const response = await sendProfile(true);
                controller.signal.throwIfAborted();
                return parseAnalysisResponse(response, prompt);
            } catch (error) {
                controller.signal.throwIfAborted();
                // A completed planner response that fails our deterministic
                // validator will not gain anything from another full model
                // call. Surface the exact cause immediately instead of making
                // the user wait for an equally invalid duplicate response.
                if (error instanceof AnalysisValidationError) throw error;
                if (isReasoningControlError(error) && (reasoning.controlled || isMandatoryReasoningError(error))) {
                    reasoningPayload = reasoningFallbackPayload(error, reasoningPayload);
                }
                const fallbackSystem = fallbackSystemPrompt();
                let response;
                try {
                    response = await sendProfile(false, fallbackSystem);
                } catch (fallbackError) {
                    if (!isReasoningControlError(fallbackError) || (!reasoning.controlled && !isMandatoryReasoningError(fallbackError))) throw fallbackError;
                    reasoningPayload = reasoningFallbackPayload(fallbackError, reasoningPayload);
                    response = await sendProfile(false, fallbackSystem);
                }
                controller.signal.throwIfAborted();
                return parseAnalysisResponse(response, prompt);
            }
        }
        if (model.active) {
            let activeReasoningMode = plannerReasoningMode();
            const runActive = structured => {
                const mainApi = currentContext().mainApi;
                const seedEvent = mainApi === 'openai' ? event_types.CHAT_COMPLETION_SETTINGS_READY : event_types.GENERATE_AFTER_DATA;
                const configurePlanner = generateData => {
                    if (!containsPlannerMarker(generateData)) return;
                    isolatePlannerGenerationData(generateData, activeReasoningMode, temperature);
                };
                eventSource.on(seedEvent, configurePlanner);
                return waitForAbortable(generateRaw({
                    prompt,
                    // The planner must not inherit the user's text-completion
                    // instruct template or preset formatting.
                    instructOverride: true,
                    systemPrompt: structured ? SYSTEM : fallbackSystemPrompt(),
                    suppressErrorToasts: true,
                    ...(structured ? { jsonSchema: ANALYSIS_SCHEMA } : {}),
                    trimNames: false,
                }), controller.signal).finally(() => eventSource.removeListener(seedEvent, configurePlanner));
            };
            try {
                const activeSource = String(currentContext().chatCompletionSettings?.chat_completion_source || '');
                if (activeSource === 'openrouter') {
                    const raw = await runActive(false);
                    controller.signal.throwIfAborted();
                    return parseAnalysisResponse(raw, prompt);
                }
                const raw = await runActive(true);
                controller.signal.throwIfAborted();
                return parseAnalysisResponse(raw, prompt);
            } catch (error) {
                controller.signal.throwIfAborted();
                if (error instanceof AnalysisValidationError) throw error;
                if (isReasoningControlError(error)) {
                    activeReasoningMode = isMandatoryReasoningError(error) ? 'minimum' : 'default';
                    try {
                        const activeSource = String(currentContext().chatCompletionSettings?.chat_completion_source || '');
                        const raw = await runActive(activeSource !== 'openrouter');
                        controller.signal.throwIfAborted();
                        return parseAnalysisResponse(raw, prompt);
                    } catch (retryError) {
                        controller.signal.throwIfAborted();
                        error = retryError;
                    }
                }
                console.warn(`[${EXTENSION_ID}] active model structured request failed; retrying with a JSON-only prompt`, error);
                const raw = await runActive(false);
                controller.signal.throwIfAborted();
                return parseAnalysisResponse(raw, prompt);
            }
        }
        const reasoningMode = plannerReasoningMode();
        const reasoning = buildReasoningRequest({
            mode: reasoningMode,
            source: model.provider === 'openrouter' ? 'openrouter' : 'custom',
            model: model.model,
            url: model.url,
        });
        let reasoningPayload = reasoning.payload;
        const send = async structured => {
            const systemPrompt = structured ? SYSTEM : fallbackSystemPrompt();
            const body = { chat_completion_source: model.provider, model: model.model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }], max_tokens: PLANNER_RESPONSE_TOKENS, stream: false, temperature, ...reasoningPayload, ...(structured ? { response_format: { type: 'json_object' } } : {}), ...(model.provider === 'openrouter' ? { api_url: model.url.replace(/\/$/, '') } : { custom_url: model.url.replace(/\/$/, '') }) };
            if (model.secretId) body.secret_id = model.secretId;
            const response = await fetch('/api/backends/chat-completions/generate', { method: 'POST', headers: currentContext().getRequestHeaders?.() || getRequestHeaders?.() || { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
            const payload = await response.json();
            if (!response.ok || payload?.error) throw new Error(payload?.error?.message || payload?.error || `Analysis request failed (${response.status}).`);
            controller.signal.throwIfAborted();
            return parseAnalysisResponse(payload, prompt);
        };
        const structured = model.provider !== 'openrouter';
        try {
            return await send(structured);
        } catch (error) {
            controller.signal.throwIfAborted();
            if (error instanceof AnalysisValidationError) throw error;
            if (isReasoningControlError(error) && (reasoning.controlled || isMandatoryReasoningError(error))) {
                reasoningPayload = reasoningFallbackPayload(error, reasoningPayload);
                try {
                    return await send(structured);
                } catch (retryError) {
                    controller.signal.throwIfAborted();
                    if (retryError instanceof AnalysisValidationError) throw retryError;
                    error = retryError;
                }
            }
            if (!structured) throw error;
            console.warn(`[${EXTENSION_ID}] direct model structured request failed; retrying with a JSON-only prompt`, error);
            try {
                return await send(false);
            } catch (fallbackError) {
                if (!isReasoningControlError(fallbackError) || (!reasoning.controlled && !isMandatoryReasoningError(fallbackError))) throw fallbackError;
                reasoningPayload = reasoningFallbackPayload(fallbackError, reasoningPayload);
                return await send(false);
            }
        }
    } finally {
        externalSignal?.removeEventListener('abort', forwardAbort);
    }
}

async function requestAnalysis(prompt, externalSignal) {
    try {
        return await requestAnalysisOnce(prompt, externalSignal);
    } catch (error) {
        externalSignal?.throwIfAborted?.();
        if (!(error instanceof AnalysisValidationError)) throw error;
        console.warn(`[${EXTENSION_ID}] planner JSON was incomplete after deterministic recovery; retrying once with explicit correction`, error);
        const correction = `\n\n[REPAIR REQUIRED]\nThe prior planner response was rejected: ${analysisErrorMessage(error)}\nReturn one complete JSON object. Include 3 or 4 distinct, grounded next_guides; each must specify an immediate direction, use/drop conditions, a causal operation, and a distinct world_delta. Do not omit required fields.`;
        return requestAnalysisOnce(`${prompt}${correction}`, externalSignal);
    }
}

export async function analyzeNow({ note = null, force = false, messages = null, rebuild = false, allowOneUserAppend = false, allowStaleContinuity = false, waitForContinuity = false } = {}) {
    const context = currentContext();
    const s = getSettings();
    if (!s.enabled) return loadState(context.chatMetadata);
    const chat = messages || messagesFromChat(context.chat || []);
    const savedState = loadState(context.chatMetadata);
    const state = rebuild ? rebuildState(savedState) : savedState;
    const userNote = normalizeUserNote(note);
    const fingerprint = fingerprintMessages(chat);
    const chatId = String(context.getCurrentChatId?.() || '');
    if (!force && !userNote && !rebuild && !state.canonBootstrapPending && isGuidanceUsable(state, chat, chatId)) { updatePrompt(state); return state; }
    if (analysisPromise) {
        if (!force && !userNote && !rebuild && analysisRequestFingerprint === fingerprint) return analysisPromise;
        cancelRunningAnalysis('A newer Tale Fairy analysis replaced this request.', 'Restarting…');
    }
    const revision = ++generationRevision;
    const runId = ++analysisRunId;
    const variationNonce = randomVariationNonce();
    const controller = new AbortController();
    analysisAbortController = controller;
    analysisRequestFingerprint = fingerprint;
    renderAnalysisActivity('Analyzing…', true);
    let finalStatus = 'Updated';
    const promise = (async () => {
        const latestSaved = loadState(context.chatMetadata);
        const current = rebuild ? rebuildState(latestSaved) : latestSaved;
        current.mode = s.mode;
        const analysisSelection = {
            source: s.analysisSource,
            profileId: s.analysisProfileId,
            model: s.analysisModel,
            url: s.analysisUrl,
        };
        const hostContext = await collectHostContext(context, chat);
        controller.signal.throwIfAborted();
        const continuityContext = waitForContinuity
            ? await optionalContinuityContextWhenReady(context, allowStaleContinuity, controller.signal)
            : optionalContinuityContext(context, allowStaleContinuity);
        controller.signal.throwIfAborted();
        const plannerPrompt = buildAnalysisPrompt(chat, current, noteInstruction(userNote), bootstrapContext(context), { messageWindow: s.messageWindow, messageCharLimit: s.messageCharLimit, continuityContext, hostContext, bootstrapScan: rebuild || current.canonBootstrapPending || current.scene.status === 'uninitialized' || !current.contextLedger, maxPromptChars: s.maxPromptChars, variationNonce });
        const result = await requestAnalysis(plannerPrompt, controller.signal);
        controller.signal.throwIfAborted();
        const resolvedNote = resolveUserNote(result, userNote);
        if (revision !== generationRevision) {
            finalStatus = 'Skipped · chat changed';
            return current;
        }
        const next = applyAnalysis(current, result, chat);
        next.plannerSeed = variationNonce;
        next.sourceChatId = chatId;
        next.analysisModel = analysisSelection;
        if (resolvedNote) next.userNotes = [...next.userNotes, { ...resolvedNote, at: Date.now() }].slice(-12);
        next.noteNeedsClarification = Boolean(userNote && !resolvedNote);
        await persist(next, { chatId, fingerprint, messageCount: chat.length, allowOneUserAppend });
        lastAnalysisError = '';
        finalStatus = userNote && !resolvedNote
            ? 'Note not applied · try again'
            : 'Pathways ready';
        renderBoard(next);
        return next;
    })().catch(error => {
        const stopped = error?.name === 'AbortError';
        if (!stopped) lastAnalysisError = analysisErrorMessage(error);
        finalStatus = stopped ? 'Stopped' : `Analysis failed · ${lastAnalysisError}`;
        if (!stopped) console.warn(`[${EXTENSION_ID}] analysis skipped`, error);
        renderBoard(loadState(context.chatMetadata));
        return loadState(context.chatMetadata);
    }).finally(() => {
        if (runId !== analysisRunId) return;
        analysisPromise = null;
        analysisAbortController = null;
        analysisRequestFingerprint = '';
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

function renderBoard(state = loadState(currentContext().chatMetadata)) {
    const board = document.querySelector(`#${EXTENSION_ID}-board`);
    if (!board) return;
    const rebuildPending = state.canonBootstrapPending === true;
    const boardFallback = fallback => rebuildPending
        ? 'Not populated in the retained plan — the requested refresh has not produced a valid saved result yet.'
        : fallback;
    const analyzed = state.scene.status !== 'uninitialized';
    const settingsRoot = document.querySelector(`#${EXTENSION_ID}-settings`);
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
    scratchpadText(board, 'scratchpad-meta', meta, 'Not analyzed yet. Use Guide now or continue the chat.');
    const continuityStatus = analyzed ? continuityContextState(currentContext()).status : 'unavailable';
    scratchpadText(board, 'scratchpad-continuity', `Continuity: ${continuityStatus}`, 'Continuity: unavailable');

    const layers = state.narrativeLayers || {};
    const scene = [
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
    scratchpadText(board, 'scratchpad-scene', scene, boardFallback('No scene reading yet.'));

    const frame = state.storyFrame.frame && state.storyFrame.frame !== 'unknown'
        ? `${state.storyFrame.frame}${state.storyFrame.confidence ? ` · ${state.storyFrame.confidence} confidence` : ''}${state.storyFrame.basis ? `\nBasis: ${state.storyFrame.basis}` : ''}`
        : '';
    scratchpadText(board, 'scratchpad-frame', frame, boardFallback('Story frame is still uncertain.'));

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
    scratchpadText(board, 'scratchpad-director-score', directorScore, boardFallback('No persistent causal narrative control yet.'));

    const pathwayLines = (state.pathways || []).map(item => [
        `${item.id} [${item.status}${item.horizon ? ` · ${item.horizon}` : ''}${item.change !== 'keep' ? ` · ${item.change}` : ''}] — ${item.direction}`,
        `Use when: ${item.when}`,
        item.responseBias && `If chosen: ${item.responseBias}`,
        item.conditions?.length && `Needs: ${item.conditions.join('; ')}`,
    ].filter(Boolean).join('\n'));
    scratchpadText(board, 'scratchpad-pathways', pathwayLines.join('\n\n'), boardFallback('No conditional pathways yet.'));

    const guideLines = (state.nextGuides || []).map((item, index) => [
        `${index === 0 ? 'Authorial direction' : `Alternative ${index + 1}`} · ${item.id} [${item.strength}] — ${item.direction}`,
        `Impact envelope: ${item.worldDelta}`,
        `Grounding: ${item.origin} — ${item.basis}`,
        `Use if: ${item.useWhen}`,
        `Drop if: ${item.dropWhen}`,
        item.causalRole && `Causal role: ${item.causalRole}`,
    ].filter(Boolean).join('\n'));
    scratchpadText(board, 'scratchpad-next-guides', guideLines.join('\n\n'), boardFallback('No next-guide candidates yet.'));

    const horizonLines = (state.planHorizons?.items || []).map((item, index, items) => {
        const change = item.change && item.change !== 'keep' ? ` · ${item.change}` : '';
        return `${item.timeframe || 'Future'} [${item.stability || 'adaptive'} · ${horizonInfluence(index, items.length)} influence${change}] — ${item.direction}`;
    });
    const deviation = state.planHorizons?.deviation;
    if (deviation?.level && deviation.level !== 'none') horizonLines.push(`Deviation: ${deviation.level}${deviation.reason ? ` — ${deviation.reason}` : ''}`);
    scratchpadText(board, 'scratchpad-horizons', horizonLines.join('\n'), boardFallback('No plan horizons yet.'));

    const audit = state.cueAudit;
    const auditText = audit?.offeredIds?.length
        ? `Cue audit: ${audit.pacing} pacing · ${audit.manifestedIds.length} manifested · ${audit.unusedIds.length} unused · ${audit.contradictedIds.length} contradicted${audit.reason ? `\n${audit.reason}` : ''}`
        : (audit?.reason ? `Pacing audit: ${audit.pacing}\n${audit.reason}` : '');
    const decision = [
        state.guidance || 'No extra guidance.',
        state.lastReason && `Why: ${state.lastReason}`,
        auditText,
    ].filter(Boolean).join('\n\n');
    scratchpadText(board, 'scratchpad-guidance', decision, boardFallback('No extra guidance.'));

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
    scratchpadText(board, 'scratchpad-request-verification', verificationText, 'No provider request has been verified yet.');

    const displayedObjectives = state.objectives?.length
        ? state.objectives
        : (state.planHorizons?.items || []).slice(0, 4).map(item => ({
            title: `Open direction · ${item.timeframe || 'future'}`,
            detail: item.direction,
            status: item.stability,
        }));
    scratchpadText(board, 'scratchpad-objectives', scratchpadList(displayedObjectives, item => {
        if (!item?.title && !item?.detail) return '';
        return `${item.title || 'Open direction'}${item.detail ? ` — ${item.detail}` : ''}${item.status ? ` [${item.status}]` : ''}`;
    }, ''), boardFallback('No active objectives.'));

    const displayedPossibilities = state.possibilities?.length
        ? state.possibilities
        : (state.pathways || []).filter(item => item?.status !== 'blocked').slice(0, 6).map(item => ({
            description: item.direction,
            conditions: item.conditions,
            force: item.status === 'foreground' ? 'strong' : item.status === 'latent' ? 'light' : 'moderate',
        }));
    scratchpadText(board, 'scratchpad-possibilities', scratchpadList(displayedPossibilities, item => {
        if (!item?.description) return '';
        const conditions = Array.isArray(item.conditions) && item.conditions.length ? ` Conditions: ${item.conditions.join('; ')}.` : '';
        return `${item.description}${conditions}${item.force ? ` Weight: ${item.force}.` : ''}`;
    }, ''), boardFallback('No supported possibilities currently retained.'));

    scratchpadText(board, 'scratchpad-entities', scratchpadList(state.entities, item => {
        if (!item?.name) return '';
        const details = [item.state, item.location, item.relevance, item.confidence && `${item.confidence} confidence`, item.window].filter(Boolean).join(' · ');
        return `${item.name}${details ? ` — ${details}` : ''}`;
    }, ''), boardFallback('No relevant off-screen entities retained.'));

    const displayedLedger = state.contextLedger || [
        state.scene?.activity && `Working scene: ${state.scene.activity}.`,
        state.narrativeLayers?.situation && `Situation: ${state.narrativeLayers.situation}`,
        state.narrativeLayers?.widerWorld && `Wider context: ${state.narrativeLayers.widerWorld}`,
        state.narrativeLayers?.durableTrajectory && `Durable trajectory: ${state.narrativeLayers.durableTrajectory}`,
    ].filter(Boolean).join('\n');
    scratchpadText(board, 'scratchpad-ledger', displayedLedger, boardFallback('No narrative ledger yet.'));

    scratchpadText(board, 'scratchpad-events', scratchpadList(state.narrativeEvents, item => {
        if (!item?.title) return '';
        const stateLabels = [item.scope, item.epistemicStatus, item.disclosure, item.status].filter(Boolean).join(' · ');
        const effects = Array.isArray(item.consequences) && item.consequences.length ? `\n  Consequences: ${item.consequences.join('; ')}` : '';
        return `${item.title}${stateLabels ? ` [${stateLabels}]` : ''}${item.summary ? ` — ${item.summary}` : ''}${effects}${item.basis ? `\n  Basis: ${item.basis}` : ''}`;
    }, ''), boardFallback('No private causal events retained.'));

    scratchpadText(board, 'scratchpad-notes', scratchpadList(state.userNotes, item => item?.text ? `[${String(item.kind || 'note').toUpperCase()}] ${item.text}` : '', ''), 'No user notes.');
}

async function resetState() {
    const context = currentContext();
    stopAnalysis();
    pendingRequestVerification = null;
    context.updateChatMetadata(clearState(context.chatMetadata));
    clearPromptManagerInjection(promptManager);
    setExtensionPrompt(PROMPT_KEY, '', 0, 0);
    await context.saveMetadata?.();
    renderAnalysisActivity('Guide state deleted', false);
    renderBoard(defaultState());
}

async function rebuildGuideState() {
    stopAnalysis();
    pendingRequestVerification = null;
    // Build against a clean in-memory state, but keep the last saved plan until
    // its replacement has passed validation and persist() commits it. A failed
    // provider response must never turn Full rebuild into Delete guide state.
    return analyzeNow({ force: true, rebuild: true });
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
    const rawState = context.chatMetadata?.[STATE_KEY];
    const rawVersion = Math.max(0, Number(rawState?.version) || 0);
    const upgradePending = Boolean(rawState && (rawVersion < STATE_VERSION || rawState.canonBootstrapPending === true));
    if (upgradePending) return upgradeLegacyPlanIfNeeded();

    const chatId = String(context.getCurrentChatId?.() || '');
    const messages = messagesFromChat(context.chat || []);
    const state = loadState(context.chatMetadata);
    if (!getSettings().enabled || !chatId || !messages.length || isGuidanceUsable(state, messages, chatId)) {
        updatePrompt(state);
        return state;
    }

    // A current-format plan can still be stale after a closed tab, extension
    // reload, or interrupted background request. Refresh it once on chat load;
    // analyzeNow deduplicates an identical in-flight request and never blocks
    // the user's generation.
    return analyzeNow({ messages, allowOneUserAppend: true, waitForContinuity: true });
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
    root.querySelector('[data-setting="reasoning"]').value = s.analysisReasoningMode;
    root.querySelector('[data-setting="temperature-slider"]').value = s.analysisTemperature;
    root.querySelector('[data-setting="temperature"]').value = s.analysisTemperature;
    root.querySelector('[data-setting="model"]').value = s.analysisModel;
    root.querySelector('[data-setting="url"]').value = s.analysisUrl;
    root.querySelector('[data-setting="continuity"]').checked = Boolean(s.continuityIntegration);
    root.querySelector('[data-setting="window"]').value = s.messageWindow;
    root.querySelector('[data-setting="budget"]').value = s.maxPromptChars;
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
    root.querySelector('[data-setting="window"]').addEventListener('change', e => { invalidatePlanner(); s.messageWindow = Math.max(1, Math.min(80, Number(e.target.value) || 12)); e.target.value = s.messageWindow; save(); });
    root.querySelector('[data-setting="budget"]').addEventListener('change', e => { invalidatePlanner(); s.maxPromptChars = Math.max(8000, Math.min(30000, Number(e.target.value) || 12000)); e.target.value = s.maxPromptChars; save(); });
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
    root.querySelector('[data-setting="temperature-slider"]').value = s.analysisTemperature;
    root.querySelector('[data-setting="temperature"]').value = s.analysisTemperature;
    root.querySelector('[data-setting="connection"]').value = analysisConnectionChoice(s);
    root.querySelector('[data-source-panel="direct"]').hidden = !direct;
    root.querySelector('[data-setting="model"]').value = s.analysisModel;
    root.querySelector('[data-setting="url"]').value = s.analysisUrl;
    root.querySelector('[data-setting="continuity"]').checked = Boolean(s.continuityIntegration);
    root.querySelector('[data-setting="window"]').value = s.messageWindow;
    root.querySelector('[data-setting="budget"]').value = s.maxPromptChars;
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
    const state = loadState(context.chatMetadata);
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
// payload. Verify the finished request too, and repair it in place if another
// prompt path omitted the current dynamic guide.
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
    updatePrompt(loadState(context.chatMetadata));
    // One background planning cycle revises the routes after the completed
    // assistant response. The next user generation never waits for it.
    if (getSettings().enabled) void analyzeNow({ messages, allowOneUserAppend: true, allowStaleContinuity: true });
});
if (event_types.MESSAGE_SENT) eventSource.on(event_types.MESSAGE_SENT, () => {
    // analyzeNow allows exactly one appended user turn. Keep that completed-
    // response plan alive while the next reply generates instead of cancelling
    // the only planner call before it can ever persist in a fast conversation.
    generationGuideSelection = null;
    const context = currentContext();
    const state = loadState(context.chatMetadata);
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
    const messages = messagesFromChat(context.chat || []);
    updatePrompt(loadState(context.chatMetadata));
    const selected = context.chat?.[Number(messageId)];
    const existingSwipeSelected = Array.isArray(selected?.swipes)
        && Number(selected.swipe_id) >= 0
        && Number(selected.swipe_id) < selected.swipes.length;
    // Selecting an existing result changes the active trajectory and needs a
    // replan. An overswipe points one slot past swipes while it generates; do
    // not spend a planner call on the discarded/empty slot. MESSAGE_RECEIVED
    // plans once from the completed new result instead.
    if (existingSwipeSelected && getSettings().enabled && messages.length && !messages.at(-1).is_user) {
        void analyzeNow({ messages, allowOneUserAppend: true });
    }
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
