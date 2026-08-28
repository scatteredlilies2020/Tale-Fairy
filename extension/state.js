export const STATE_KEY = 'livingWorldGuide';
export const STATE_VERSION = 15;

const MODES = new Set(['light', 'balanced', 'fun']);
const MAX_ITEMS = 12;
const MAX_EVENTS = 10;
const MAX_OBJECTIVES = 10;
const MAX_HORIZONS = 10;
const MAX_PATHWAYS = 5;

export function defaultState() {
    return {
        version: STATE_VERSION,
        enabled: true,
        mode: 'balanced',
        analysisModel: { source: 'active', profileId: '', model: '', url: '' },
        scene: { status: 'uninitialized', activity: '', pace: '', intent: '', location: '', time: '', loop: false },
        storyFrame: { frame: 'unknown', confidence: 'low', basis: '' },
        objectives: [],
        entities: [],
        possibilities: [],
        pathways: [],
        nextGuides: [],
        // Retained only so version 9 state can be inspected during migration.
        activeBeat: { id: '', objective: '', nextAction: '', completion: '', lifecycle: 'replace', reason: '', startedAtTurn: 0, updatedAtTurn: 0 },
        beatHistory: [],
        planHorizons: { items: [], deviation: { level: 'none', reason: '' } },
        canonConstraints: [],
        canonBootstrapPending: false,
        userNotes: [],
        guidance: '',
        lastInject: false,
        lastReason: '',
        contextLedger: '',
        ledgerMessageCount: 0,
        ledgerUpdatedAt: 0,
        narrativeEvents: [],
        lastAnalysisFingerprint: '',
        sourceMessageCount: 0,
        sourceChatId: '',
        lastAnalyzedAt: 0,
        turnCount: 0,
        plannerSeed: 0,
        lastRequestVerification: null,
    };
}

function text(value, fallback = '') { return String(value ?? fallback).trim(); }
function cap(list, limit = MAX_ITEMS) { return Array.isArray(list) ? list.slice(-limit) : []; }
function clippedText(value, limit) {
    const source = text(value);
    if (source.length < limit) return source;
    const candidate = source.slice(0, Math.max(0, limit - 1));
    const boundary = Math.max(candidate.lastIndexOf('.'), candidate.lastIndexOf(';'), candidate.lastIndexOf(','), candidate.lastIndexOf(' '));
    const clean = (boundary >= limit * 0.65 ? candidate.slice(0, boundary) : candidate)
        .replace(/\b(?:and|or|but|with|to|a|an|the)$/iu, '')
        .trimEnd();
    return `${clean.trimEnd()}…`;
}
function normalizeObjective(value = {}) {
    return { title: text(value.title).slice(0, 120), detail: text(value.detail).slice(0, 300), status: text(value.status).slice(0, 40), source: text(value.source).slice(0, 120) };
}
function normalizeEntity(value = {}) {
    return { name: text(value.name).slice(0, 100), state: text(value.state).slice(0, 220), location: text(value.location).slice(0, 140), relevance: text(value.relevance).slice(0, 140), confidence: text(value.confidence).slice(0, 40), window: text(value.window).slice(0, 100) };
}
function normalizePossibility(value = {}) {
    return { description: text(value.description).slice(0, 280), conditions: cap(value.conditions, 4).map(item => text(item).slice(0, 140)).filter(Boolean), force: text(value.force).slice(0, 40) };
}
function normalizePathway(value = {}) {
    const status = text(value.status, 'available').toLowerCase();
    const change = text(value.change, 'replace').toLowerCase();
    return {
        id: text(value.id).slice(0, 100),
        direction: text(value.direction).slice(0, 320),
        when: text(value.when).slice(0, 240),
        responseBias: text(value.responseBias ?? value.response_bias).slice(0, 300),
        horizon: text(value.horizon, 'near').slice(0, 80),
        status: ['foreground', 'available', 'latent', 'blocked'].includes(status) ? status : 'available',
        conditions: cap(value.conditions, 3).map(item => text(item).slice(0, 140)).filter(Boolean),
        change: ['keep', 'adjust', 'activate', 'deactivate', 'replace', 'retire'].includes(change) ? change : 'replace',
        reason: text(value.reason).slice(0, 220),
    };
}
function normalizeNextGuide(value = {}) {
    const strength = text(value.strength, 'moderate').toLowerCase();
    const origin = text(value.origin, 'inferred').toLowerCase();
    return {
        id: clippedText(value.id, 100),
        direction: clippedText(value.direction, 280),
        useWhen: clippedText(value.useWhen ?? value.use_when, 120),
        dropWhen: clippedText(value.dropWhen ?? value.drop_when, 100),
        responseBias: clippedText(value.responseBias ?? value.response_bias, 130),
        worldDelta: clippedText(value.worldDelta ?? value.world_delta, 140),
        origin: ['established', 'inferred', 'original'].includes(origin) ? origin : 'inferred',
        basis: clippedText(value.basis, 100),
        strength: ['strong', 'moderate', 'light'].includes(strength) ? strength : 'moderate',
        sourcePathways: cap(value.sourcePathways ?? value.source_pathways, 3).map(item => clippedText(item, 100)).filter(Boolean),
        reason: text(value.reason).slice(0, 220),
    };
}
function normalizeNote(value = {}) {
    const rawText = text(value.text);
    const legacyTag = rawText.match(/^\[(suggest|correct|establish|forbid)\]\s*/i)?.[1]?.toLowerCase();
    const rawKind = text(value.kind, legacyTag || 'suggest').toLowerCase();
    const kind = ['suggest', 'correct', 'establish', 'forbid'].includes(rawKind) ? rawKind : 'suggest';
    return {
        kind,
        text: rawText.replace(/^\[(?:suggest|correct|establish|forbid)\]\s*/i, '').slice(0, 1000),
        at: Math.max(0, Number(value.at) || 0),
    };
}
function normalizeEvent(value = {}) {
    return {
        id: text(value.id).slice(0, 80),
        title: text(value.title).slice(0, 120),
        summary: text(value.summary).slice(0, 360),
        status: text(value.status, 'uncertain').slice(0, 40),
        relevance: text(value.relevance, 'possible').slice(0, 40),
        confidence: text(value.confidence, 'low').slice(0, 40),
        feasibility: text(value.feasibility, 'unknown').slice(0, 40),
        basis: text(value.basis).slice(0, 180),
        requirements: cap(value.requirements, 4).map(item => text(item).slice(0, 120)).filter(Boolean),
        source_hint: text(value.source_hint).slice(0, 120),
    };
}

export function normalizeBeat(value = {}) {
    const lifecycle = text(value.lifecycle, 'replace').toLowerCase();
    return {
        id: text(value.id).slice(0, 100),
        objective: text(value.objective).slice(0, 360),
        nextAction: text(value.nextAction ?? value.next_action).slice(0, 500),
        completion: text(value.completion).slice(0, 360),
        lifecycle: ['keep', 'advance', 'replace'].includes(lifecycle) ? lifecycle : 'replace',
        reason: text(value.reason).slice(0, 280),
        startedAtTurn: Math.max(0, Number(value.startedAtTurn) || 0),
        updatedAtTurn: Math.max(0, Number(value.updatedAtTurn) || 0),
    };
}

function normalizeHorizon(value = {}) {
    const change = text(value.change, 'replace').toLowerCase();
    const rawStability = text(value.stability).toLowerCase();
    const stability = rawStability === 'anchored' ? 'slow' : rawStability;
    return {
        id: text(value.id).slice(0, 100),
        direction: text(value.direction).slice(0, 360),
        timeframe: text(value.timeframe).slice(0, 120),
        stability: ['fluid', 'adaptive', 'stable', 'slow'].includes(stability) ? stability : 'adaptive',
        conditions: cap(value.conditions, 3).map(item => text(item).slice(0, 140)).filter(Boolean),
        change: ['keep', 'adjust', 'replace'].includes(change) ? change : 'replace',
        reason: text(value.reason).slice(0, 220),
    };
}

function normalizePlanHorizons(value = {}) {
    const level = text(value.deviation?.level, 'none').toLowerCase();
    const legacyItems = [value.near, value.long].filter(item => item?.direction);
    const items = Array.isArray(value.items) ? value.items : legacyItems;
    return {
        // Horizons are ordered nearest-to-farthest. Preserve the short end if
        // malformed or legacy state exceeds the current maximum.
        items: items.slice(0, MAX_HORIZONS).map(normalizeHorizon).filter(item => item.direction),
        deviation: {
            level: ['none', 'minor', 'major'].includes(level) ? level : 'none',
            reason: text(value.deviation?.reason).slice(0, 400),
        },
    };
}

function normalizeRequestVerification(value) {
    if (!value || typeof value !== 'object' || value.status !== 'confirmed') return null;
    return {
        status: 'confirmed',
        guidanceBlock: text(value.guidanceBlock).slice(0, 6000),
        requestedAt: Math.max(0, Number(value.requestedAt) || 0),
        confirmedAt: Math.max(0, Number(value.confirmedAt) || 0),
        sourceMessageCount: Math.max(0, Number(value.sourceMessageCount) || 0),
        responseMessageCount: Math.max(0, Number(value.responseMessageCount) || 0),
        chatId: text(value.chatId).slice(0, 300),
        provider: text(value.provider).slice(0, 120),
        model: text(value.model).slice(0, 240),
        position: text(value.position).slice(0, 80),
        role: ['system', 'user', 'assistant'].includes(value.role) ? value.role : 'user',
        depth: Math.max(0, Math.min(100, Number(value.depth) || 0)),
        guideCandidates: (Array.isArray(value.guideCandidates) ? value.guideCandidates.slice(0, 3) : []).map(normalizeNextGuide).filter(item => item.id && item.direction && item.useWhen && item.dropWhen && item.worldDelta && item.basis),
        selectedGuideIndex: Math.max(0, Math.min(2, Number(value.selectedGuideIndex) || 0)),
        replacementGeneration: value.replacementGeneration === true,
    };
}

export function returnedReplyMatchesVerification(pending, messages = [], chatId = '') {
    if (!pending || pending.chatId !== String(chatId || '') || !messages.length || messages.at(-1)?.is_user) return false;
    const requiredCount = Math.max(0, Number(pending.sourceMessageCount) || 0) + (pending.replacementGeneration ? 0 : 1);
    return messages.length >= requiredCount;
}

export function normalizeState(input = {}) {
    const base = defaultState();
    const value = input && typeof input === 'object' ? input : {};
    const inputVersion = Math.max(0, Number(value.version) || 0);
    const plannerUpgradePending = inputVersion > 0 && inputVersion < STATE_VERSION;
    const state = {
        ...base,
        ...value,
        version: STATE_VERSION,
        enabled: value.enabled !== false,
        mode: MODES.has(value.mode) ? value.mode : base.mode,
        analysisModel: { ...base.analysisModel, ...(value.analysisModel || {}) },
        scene: { ...base.scene, ...(value.scene || {}) },
        storyFrame: { ...base.storyFrame, ...(value.storyFrame || {}) },
        objectives: cap(value.objectives, MAX_OBJECTIVES).map(normalizeObjective).filter(item => item.title || item.detail),
        entities: cap(value.entities).map(normalizeEntity).filter(item => item.name),
        possibilities: cap(value.possibilities, 6).map(normalizePossibility).filter(item => item.description),
        pathways: cap(value.pathways, MAX_PATHWAYS).map(normalizePathway).filter(item => item.id && item.direction && item.when),
        nextGuides: plannerUpgradePending ? [] : (Array.isArray(value.nextGuides) ? value.nextGuides.slice(0, 3) : []).map(normalizeNextGuide).filter(item => item.id && item.direction && item.useWhen && item.dropWhen && item.worldDelta && item.basis),
        activeBeat: normalizeBeat(value.activeBeat),
        beatHistory: cap(value.beatHistory, 6).map(normalizeBeat).filter(beat => beat.objective),
        planHorizons: normalizePlanHorizons(value.planHorizons),
        canonConstraints: cap(value.canonConstraints).map(item => text(item).slice(0, 500)).filter(Boolean),
        canonBootstrapPending: value.canonBootstrapPending === true || plannerUpgradePending,
        userNotes: cap(value.userNotes).map(normalizeNote).filter(note => note.text),
        guidance: text(value.guidance).slice(0, 700),
        lastInject: value.lastInject === true,
        lastReason: text(value.lastReason).slice(0, 500),
        contextLedger: text(value.contextLedger).slice(0, 3000),
        ledgerMessageCount: Math.max(0, Number(value.ledgerMessageCount) || 0),
        ledgerUpdatedAt: Number(value.ledgerUpdatedAt) || 0,
        narrativeEvents: cap(value.narrativeEvents, MAX_EVENTS).map(normalizeEvent).filter(event => event.title && event.summary),
        lastAnalysisFingerprint: text(value.lastAnalysisFingerprint),
        sourceMessageCount: Math.max(0, Number(value.sourceMessageCount) || 0),
        sourceChatId: text(value.sourceChatId),
        lastAnalyzedAt: Number(value.lastAnalyzedAt) || 0,
        turnCount: Math.max(0, Number(value.turnCount) || 0),
        plannerSeed: Number.isInteger(value.plannerSeed) ? value.plannerSeed : 0,
        lastRequestVerification: plannerUpgradePending ? null : normalizeRequestVerification(value.lastRequestVerification),
    };
    return state;
}

export function loadState(metadata) { return normalizeState(metadata?.[STATE_KEY]); }

export function saveState(metadata, state) {
    const next = normalizeState(state);
    return { ...(metadata || {}), [STATE_KEY]: next };
}

export function clearState(metadata) {
    const next = { ...(metadata || {}) };
    delete next[STATE_KEY];
    return next;
}

export function stateForPrompt(state) {
    const s = normalizeState(state);
    return {
        mode: s.mode,
        scene: Object.fromEntries(Object.entries(s.scene).map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 100) : value])),
        objectives: s.objectives.slice(-8).map(item => ({ title: item.title, detail: item.detail.slice(0, 180), status: item.status })),
        entities: s.entities.filter(e => e && e.relevance !== 'ambient').slice(-3).map(item => ({ name: item.name, state: item.state.slice(0, 120), location: item.location.slice(0, 80), relevance: item.relevance.slice(0, 80) })),
        possibilities: s.possibilities.slice(-3).map(item => ({ description: item.description.slice(0, 160), conditions: item.conditions.slice(0, 1).map(condition => condition.slice(0, 100)), force: item.force })),
        pathways: s.pathways.map(item => ({ id: item.id, direction: item.direction.slice(0, 220), when: item.when.slice(0, 180), responseBias: item.responseBias.slice(0, 200), horizon: item.horizon, status: item.status, conditions: item.conditions.slice(0, 2), change: item.change })),
        nextGuides: s.nextGuides.map(item => ({ id: item.id, direction: item.direction.slice(0, 240), useWhen: item.useWhen.slice(0, 160), dropWhen: item.dropWhen.slice(0, 160), responseBias: item.responseBias.slice(0, 180), worldDelta: item.worldDelta.slice(0, 180), origin: item.origin, basis: item.basis.slice(0, 140), strength: item.strength, sourcePathways: item.sourcePathways })),
        // Carry the old live beat only long enough for a v9 state to be
        // converted. Current pathway states do not spend prompt tokens on it.
        activeBeat: s.pathways.length ? undefined : { id: s.activeBeat.id, objective: s.activeBeat.objective, nextAction: s.activeBeat.nextAction, completion: s.activeBeat.completion, lifecycle: s.activeBeat.lifecycle },
        beatHistory: s.beatHistory.slice(-1).map(beat => ({ id: beat.id, objective: beat.objective, completion: beat.completion, lifecycle: beat.lifecycle })),
        planHorizons: {
            items: s.planHorizons.items.map(item => ({ id: item.id, direction: item.direction.slice(0, 240), timeframe: item.timeframe, stability: item.stability, conditions: item.conditions.slice(0, 1), change: item.change })),
            deviation: s.planHorizons.deviation,
        },
        canonConstraints: s.canonConstraints.slice(-8).map(item => item.slice(0, 360)),
        userNotes: s.userNotes.slice(-4),
        lastReason: s.lastReason.slice(0, 180),
        contextLedger: s.contextLedger.slice(0, 1400),
        storyFrame: { frame: s.storyFrame.frame, confidence: s.storyFrame.confidence, basis: s.storyFrame.basis.slice(0, 180) },
        narrativeEvents: s.narrativeEvents.slice(-1).map(event => ({ title: event.title, summary: event.summary.slice(0, 160), status: event.status, relevance: event.relevance })),
    };
}

export function isStateAligned(state, messages = [], chatId = '') {
    const s = normalizeState(state);
    if (s.scene.status === 'uninitialized' || !s.lastAnalysisFingerprint) return false;
    if (s.sourceChatId && chatId && s.sourceChatId !== String(chatId)) return false;
    return s.sourceMessageCount === messages.length && s.lastAnalysisFingerprint === fingerprintMessages(messages);
}

// A completed-turn guide may lean into exactly one new user action. Anything
// older fails closed, so the latest action can select or override fresh routes
// without waiting for another planner request.
export function isGuidanceUsable(state, messages = [], chatId = '') {
    const s = normalizeState(state);
    if (!s.lastInject || !s.nextGuides.length) return false;
    if (s.planHorizons.items.length < 6 || s.planHorizons.items.at(-1)?.stability !== 'slow') return false;
    if (isStateAligned(s, messages, chatId)) return true;
    if (s.sourceChatId && chatId && s.sourceChatId !== String(chatId)) return false;
    if (!messages.at(-1)?.is_user || s.sourceMessageCount !== messages.length - 1) return false;
    return s.lastAnalysisFingerprint === fingerprintMessages(messages.slice(0, -1));
}

// If a generation has no archived routes yet, a plan made from the discarded
// assistant attempt can still provide safe variation. Exclude established
// routes so a discarded attempt cannot turn its inventions into prior fact.
export function guidesForDiscardedAssistant(state, messages = [], chatId = '') {
    const s = normalizeState(state);
    if (!messages.length
        || !messages.at(-1)?.is_user
        || String(s.sourceChatId || '') !== String(chatId || '')
        || s.sourceMessageCount !== messages.length + 1) return [];
    const candidates = s.nextGuides.filter(guide => guide.origin !== 'established');
    return candidates.length >= 2 ? candidates : [];
}

export function generationRetrySource(messages = [], replacementGeneration = false) {
    if (!replacementGeneration || !messages.length || messages.at(-1)?.is_user) return messages;
    return messages.slice(0, -1);
}

export function isAnalysisSourceCurrent(fingerprint, messageCount, messages = [], { allowOneUserAppend = false } = {}) {
    const count = Math.max(0, Number(messageCount) || 0);
    if (messages.length === count && fingerprintMessages(messages) === fingerprint) return true;
    return Boolean(allowOneUserAppend
        && messages.length === count + 1
        && messages.at(-1)?.is_user
        && fingerprintMessages(messages.slice(0, -1)) === fingerprint);
}

export function hasExplicitProgressDirective(value) {
    const source = text(value).toLowerCase();
    const withoutNegatedProgress = source.replace(/\b(?:do\s+not|don't|dont|never|not\s+yet)\s+(?:advance|proceed|continue|move\s+(?:on|forward)|go\s+ahead|skip(?:\s+(?:ahead|to))?)/giu, '');
    return /\b(?:advance|proceed|continue|move\s+(?:on|forward)|go\s+ahead|fast[- ]?forward|skip(?:\s+(?:ahead|to))?|next(?:\s+(?:part|scene|step))?|my\s+turn|until|before\s+doing\s+anything\s+else|right\s+now)\b/iu.test(withoutNegatedProgress);
}

export function horizonInfluence(index, total) {
    const count = Math.max(1, Number(total) || 1);
    const position = Math.max(0, Number(index) || 0);
    if (position === 0 || count === 1) return 'strong';
    const ratio = position / Math.max(1, count - 1);
    if (ratio <= 0.35) return 'moderate';
    if (ratio <= 0.7) return 'light';
    return 'background';
}

function routeLine(guide, index, selected) {
    const label = selected ? `SELECTED IMMEDIATE ROUTE ${index + 1}` : `ALTERNATIVE ROUTE ${index + 1}`;
    return `${label} [${guide.strength} · ${guide.origin}]\nDO NOW: ${guide.direction.slice(0, 280)}\nVISIBLE CHANGE: ${guide.worldDelta.slice(0, 140)}\nGROUNDING: ${guide.basis.slice(0, 100)}\nUSE IF: ${guide.useWhen.slice(0, 120)}\nDROP IF: ${guide.dropWhen.slice(0, 100)}${guide.responseBias ? `\nEXECUTION: ${guide.responseBias.slice(0, 130)}` : ''}`;
}

function boundedPromptLines(items, prefix, perItem, total) {
    if (!items.length) return '';
    const fairShare = Math.max(100, Math.floor(total / items.length) - prefix.length - 1);
    const cap = Math.min(perItem, fairShare);
    const compact = item => {
        const value = String(item);
        if (value.length <= cap) return value;
        const head = Math.ceil((cap - 3) * 0.65);
        return `${value.slice(0, head)} … ${value.slice(-(cap - head - 3))}`;
    };
    return items.map(item => `${prefix}${compact(item)}`).join('\n').slice(0, total);
}

export function buildPromptPayload(state, { enabled = true, guidanceUsable = false, guideCandidates = null, guideIndex = 0, regeneration = false, variationCue = 0 } = {}) {
    if (!enabled) return '';
    const s = normalizeState(state);
    const noteLabels = { suggest: 'OPTIONAL SUGGESTION', correct: 'USER CORRECTION', establish: 'USER-ESTABLISHED CANON', forbid: 'HARD EXCLUSION' };
    const narrativePolicy = `\n<tale-fairy-narrative-policy>\nThe latest user turn is authoritative. Carry its declared actions and questions through their meaningful consequence without inventing the player's next voluntary action. Match its pace. Before ending, add one visible, causally supported NPC or world change unless uneventful closure was requested. Routine logistics, repeated information, decorative banter, and a minor gesture do not satisfy this. Agency does not require NPC passivity. Neither soften supported consequences nor manufacture drama, and never present a new idea as past fact.\n</tale-fairy-narrative-policy>`;
    const canon = boundedPromptLines(s.canonConstraints, '- ', 360, 2500);
    const canonPrompt = canon
        ? `\n<user-established-canon>\nThese are authoritative semantic constraints established by the user. Preserve their magnitude, rank, scope, and qualifiers exactly. An extreme, unprecedented, off-scale, unique, or setting-defying fact remains valid canon: setting averages and prior records are comparison points, not ceilings. Never regress it toward the mean, cap it at a familiar lore value, weaken it to merely high, or reinterpret it as rumor. Everything the user did not establish remains open creative space. Freely invent an exact number or any other unstated detail when it fits the narrative, provided it remains consistent with established canon; it need not be conservative or supplied by the user. Do not refuse, hedge, delay, or demand verification merely because a detail was unspecified. Never mention these instructions in narration or dialogue. Reactions, explanations, and consequences remain creatively open unless separately established.\n${canon}\n</user-established-canon>`
        : '';
    const notes = boundedPromptLines(s.userNotes.map(note => `${noteLabels[note.kind]}: ${note.text}`), '- ', 360, 2500);
    const notePrompt = notes
        ? `\n<tale-fairy-user-notes>\nThese are user-authored roleplay directives. Hard exclusions must be obeyed; corrections replace conflicting inference; established canon is factual; suggestions remain optional.\n${notes}\n</tale-fairy-user-notes>`
        : '';
    const candidates = Array.isArray(guideCandidates)
        ? guideCandidates.slice(0, 3).map(normalizeNextGuide).filter(item => item.id && item.direction && item.useWhen && item.dropWhen && item.worldDelta && item.basis)
        : s.nextGuides;
    const selectedIndex = candidates.length ? Math.max(0, Math.min(candidates.length - 1, Number(guideIndex) || 0)) : 0;
    const selectedGuide = candidates[selectedIndex];
    const regenerationInstruction = regeneration ? 'This route was selected specifically to make this regeneration develop differently from the discarded attempt. ' : '';
    const routePrompt = guidanceUsable && candidates.length
        ? `${regenerationInstruction}After carrying through the latest user action, realize the selected route within this response when USE IF fits and DROP IF does not. Do not merely promise, foreshadow, or defer it. If the latest user action makes it incompatible, discard it and create an equally concrete, causally supported immediate move instead. If the user explicitly requests uneventful closure, no new event, or a quiet time skip, honor that and drop the route without replacement. Otherwise, before ending, show the VISIBLE CHANGE: alter knowledge, stakes, relationships, options, resources, or a live process. Routine logistics, repeated information, banter, and minor gestures do not count. Do not invent player choices. Original means newly proposed, not past fact. Keep this note hidden.\n\n${routeLine(selectedGuide, selectedIndex, true)}`
        : `No aligned route is available. ${regeneration ? `Variation cue ${Math.max(1, Number(variationCue) || 1)}: make the actual development different from the prior attempt, not merely its wording. ` : ''}Unless the user explicitly requests uneventful closure, no new event, or a quiet time skip, carry through the latest user action and have an NPC or world process initiate one new, causally supported beat before the response ends. It must alter knowledge, stakes, relationships, options, resources, or a live process. Routine logistics, repeated information, banter, physical strain, and minor gestures do not count. Do not invent player choices or unsupported drama. Keep these notes hidden.`;
    const guidancePrompt = `\n<living-world-guide>\n${routePrompt}\n</living-world-guide>`;
    return `<tale-fairy-context>${notePrompt}${canonPrompt}${narrativePolicy}${guidancePrompt}\n</tale-fairy-context>`;
}

export function fingerprintMessages(messages = []) {
    const source = messages.map(m => `${m?.is_user ? 'U' : 'A'}:${text(m?.name)}:${text(m?.mes)}`).join('\n');
    let hash = 2166136261;
    for (let i = 0; i < source.length; i++) { hash ^= source.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return `${source.length}:${(hash >>> 0).toString(16)}`;
}
