export const STATE_KEY = 'livingWorldGuide';
export const STATE_VERSION = 5;

const MODES = new Set(['light', 'balanced', 'fun']);
const MAX_ITEMS = 12;
const MAX_EVENTS = 10;

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

function normalizeRequestVerification(value) {
    if (!value || typeof value !== 'object' || value.status !== 'confirmed') return null;
    return {
        status: 'confirmed',
        guidanceBlock: text(value.guidanceBlock).slice(0, 1800),
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
    };
}

export function normalizeState(input = {}) {
    const base = defaultState();
    const value = input && typeof input === 'object' ? input : {};
    const state = {
        ...base,
        ...value,
        version: STATE_VERSION,
        enabled: value.enabled !== false,
        mode: MODES.has(value.mode) ? value.mode : base.mode,
        analysisModel: { ...base.analysisModel, ...(value.analysisModel || {}) },
        scene: { ...base.scene, ...(value.scene || {}) },
        storyFrame: { ...base.storyFrame, ...(value.storyFrame || {}) },
        objectives: cap(value.objectives, 3),
        entities: cap(value.entities),
        possibilities: cap(value.possibilities),
        userNotes: cap(value.userNotes).map(normalizeNote).filter(note => note.text),
        guidance: text(value.guidance),
        lastInject: value.lastInject === true,
        lastReason: text(value.lastReason).slice(0, 500),
        contextLedger: text(value.contextLedger).slice(0, 4000),
        ledgerMessageCount: Math.max(0, Number(value.ledgerMessageCount) || 0),
        ledgerUpdatedAt: Number(value.ledgerUpdatedAt) || 0,
        narrativeEvents: cap(value.narrativeEvents, MAX_EVENTS).map(normalizeEvent).filter(event => event.title && event.summary),
        lastAnalysisFingerprint: text(value.lastAnalysisFingerprint),
        sourceMessageCount: Math.max(0, Number(value.sourceMessageCount) || 0),
        sourceChatId: text(value.sourceChatId),
        lastAnalyzedAt: Number(value.lastAnalyzedAt) || 0,
        turnCount: Math.max(0, Number(value.turnCount) || 0),
        plannerSeed: Number.isInteger(value.plannerSeed) ? value.plannerSeed : 0,
        lastRequestVerification: normalizeRequestVerification(value.lastRequestVerification),
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
        scene: s.scene,
        objectives: s.objectives,
        entities: s.entities.filter(e => e && e.relevance !== 'ambient'),
        possibilities: s.possibilities,
        userNotes: s.userNotes.slice(-4),
        guidance: s.guidance,
        lastInject: s.lastInject,
        lastReason: s.lastReason,
        contextLedger: s.contextLedger,
        storyFrame: s.storyFrame,
        narrativeEvents: s.narrativeEvents,
    };
}

export function isStateAligned(state, messages = [], chatId = '') {
    const s = normalizeState(state);
    if (s.scene.status === 'uninitialized' || !s.lastAnalysisFingerprint) return false;
    if (s.sourceChatId && chatId && s.sourceChatId !== String(chatId)) return false;
    return s.sourceMessageCount === messages.length && s.lastAnalysisFingerprint === fingerprintMessages(messages);
}

// Guidance produced after the previous assistant reply is intended for the
// next reply. It remains usable after exactly one new user message is added,
// while edits, transfers, or additional unseen messages invalidate it.
export function isGuidanceUsable(state, messages = [], chatId = '') {
    const s = normalizeState(state);
    // Older Tale Fairy states could be aligned while intentionally containing
    // no guide. Always-guide mode must treat those states as stale so the next
    // generation requests a fresh, non-empty planner note.
    if (!s.lastInject || !s.guidance) return false;
    if (isStateAligned(s, messages, chatId)) return true;
    if (s.scene.status === 'uninitialized' || !s.lastAnalysisFingerprint) return false;
    if (s.sourceChatId && chatId && s.sourceChatId !== String(chatId)) return false;
    if (s.sourceMessageCount !== messages.length - 1 || !messages.at(-1)?.is_user) return false;
    return s.lastAnalysisFingerprint === fingerprintMessages(messages.slice(0, -1));
}

export function buildPromptPayload(state, { enabled = true, guidanceUsable = false } = {}) {
    if (!enabled) return '';
    const s = normalizeState(state);
    const noteLabels = { suggest: 'OPTIONAL SUGGESTION', correct: 'USER CORRECTION', establish: 'USER-ESTABLISHED CANON', forbid: 'HARD EXCLUSION' };
    const narrativePolicy = `\n<tale-fairy-narrative-policy>\nWithin the provider's permitted content, follow the user's requested fictional direction and the established scene directly. Do not replace it with an unrelated safer alternative, hedge away or silently flatten supported conflict, danger, suffering, flaws, rejection, loss, stakes, or consequences, or give the user's persona automatic plot armor. Do not force sympathy, vulnerability, redemption, reconciliation, banter, avoidance, or silent treatment unless characterization and circumstances support it. Do not add darkness without support.\n</tale-fairy-narrative-policy>`;
    const notes = s.userNotes.map(note => `- ${noteLabels[note.kind]}: ${note.text}`).join('\n');
    const notePrompt = notes
        ? `\n<tale-fairy-user-notes>\nThese are user-authored roleplay directives. Hard exclusions must be obeyed; corrections replace conflicting inference; established canon is factual; suggestions remain optional.\n${notes}\n</tale-fairy-user-notes>`
        : '';
    const guidancePrompt = guidanceUsable && s.guidance
        ? `\n<living-world-guide>\nTreat this as authoritative context guidance for the next roleplay reply, not as a command to force a plot event. Use its relevant continuity, lore, causal pressures, character knowledge, institutional constraints, and consequences directly in the narration and dialogue where they apply. Preserve the user's agency and write the actual roleplay response yourself. Do not omit a supported influence merely because its outcome is uncertain; portray the influence, mechanism, or pressure without declaring an unestablished result. Follow the requested direction and established scene without sanitizing supported conflict, danger, flaws, rejection, loss, stakes, or consequences. Do not substitute safer alternatives, plot armor, forced sympathy, forced vulnerability, reconciliation, banter, avoidance, or silent treatment unless the evidence supports them. Do not add darkness without support.\n${s.guidance}\n</living-world-guide>`
        : '';
    return `${notePrompt}${narrativePolicy}${guidancePrompt}`;
}

export function fingerprintMessages(messages = []) {
    const source = messages.map(m => `${m?.is_user ? 'U' : 'A'}:${text(m?.name)}:${text(m?.mes)}`).join('\n');
    let hash = 2166136261;
    for (let i = 0; i < source.length; i++) { hash ^= source.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return `${source.length}:${(hash >>> 0).toString(16)}`;
}
