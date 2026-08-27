export const STATE_KEY = 'livingWorldGuide';
export const STATE_VERSION = 6;

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
        canonConstraints: cap(value.canonConstraints).map(item => text(item).slice(0, 700)).filter(Boolean),
        canonBootstrapPending: value.canonBootstrapPending === true || (Number(value.version) > 0 && Number(value.version) < STATE_VERSION),
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
        canonConstraints: s.canonConstraints,
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
    // no guide. Treat those states as stale so background planning refreshes
    // them instead of considering an empty result usable.
    if (!s.lastInject || !s.guidance) return false;
    if (isStateAligned(s, messages, chatId)) return true;
    if (s.scene.status === 'uninitialized' || !s.lastAnalysisFingerprint) return false;
    if (s.sourceChatId && chatId && s.sourceChatId !== String(chatId)) return false;
    if (s.sourceMessageCount !== messages.length - 1 || !messages.at(-1)?.is_user) return false;
    return s.lastAnalysisFingerprint === fingerprintMessages(messages.slice(0, -1));
}

export function hasExplicitProgressDirective(value) {
    const source = text(value).toLowerCase();
    const withoutNegatedProgress = source.replace(/\b(?:do\s+not|don't|dont|never|not\s+yet)\s+(?:advance|proceed|continue|move\s+(?:on|forward)|go\s+ahead|skip(?:\s+(?:ahead|to))?)/giu, '');
    return /\b(?:advance|proceed|continue|move\s+(?:on|forward)|go\s+ahead|fast[- ]?forward|skip(?:\s+(?:ahead|to))?|next(?:\s+(?:part|scene|step))?|my\s+turn|until|before\s+doing\s+anything\s+else|right\s+now)\b/iu.test(withoutNegatedProgress);
}

export function buildPromptPayload(state, { enabled = true, guidanceUsable = false, latestUserMessage = '' } = {}) {
    if (!enabled) return '';
    const s = normalizeState(state);
    const noteLabels = { suggest: 'OPTIONAL SUGGESTION', correct: 'USER CORRECTION', establish: 'USER-ESTABLISHED CANON', forbid: 'HARD EXCLUSION' };
    const narrativePolicy = `\n<tale-fairy-narrative-policy>\nWithin the provider's permitted content, follow the user's requested fictional direction and the established scene directly. Do not replace it with an unrelated safer alternative, hedge away or silently flatten supported conflict, danger, suffering, flaws, rejection, loss, stakes, or consequences, or give the user's persona automatic plot armor. Do not force sympathy, vulnerability, redemption, reconciliation, banter, avoidance, or silent treatment unless characterization and circumstances support it. Do not add darkness without support.\n</tale-fairy-narrative-policy>`;
    const canon = s.canonConstraints.map(item => `- ${item}`).join('\n');
    const canonPrompt = canon
        ? `\n<user-established-canon>\nThese are authoritative semantic constraints established by the user. Preserve their magnitude, rank, scope, and qualifiers exactly. An extreme, unprecedented, off-scale, unique, or setting-defying fact remains valid canon: setting averages and prior records are comparison points, not ceilings. Never regress it toward the mean, cap it at a familiar lore value, weaken it to merely high, reinterpret it as rumor, or invent a conservative exact number. If no exact number was established, preserve the relational constraint instead of fabricating false precision. Reactions, explanations, and consequences remain creatively open unless separately established.\n${canon}\n</user-established-canon>`
        : '';
    const notes = s.userNotes.map(note => `- ${noteLabels[note.kind]}: ${note.text}`).join('\n');
    const notePrompt = notes
        ? `\n<tale-fairy-user-notes>\nThese are user-authored roleplay directives. Hard exclusions must be obeyed; corrections replace conflicting inference; established canon is factual; suggestions remain optional.\n${notes}\n</tale-fairy-user-notes>`
        : '';
    const explicitProgress = hasExplicitProgressDirective(latestUserMessage);
    if (explicitProgress) s.guidance = 'The latest user turn explicitly supersedes any preplanned stopping point. Use the current scene, persistent canon constraints, and the latest-user-action override below; do not recover an earlier instruction to wait, withhold, or end before the requested milestone.';
    const latestUserOverride = `The latest user turn was written after this Tale Fairy guidance was planned and has higher priority. Every action, direct question, or choice the user declares is binding authorization to carry out its routine mechanics and reach an immediate meaningful consequence; no words such as "advance" or "proceed" are required. This follow-through does not require the most obvious outcome and does not guarantee success. Infer routine implied steps instead of making the user micromanage walking through a chosen doorway, reaching a stated nearby destination, receiving an available result, or letting an addressed character answer. Once the mechanics are complete, established character motives, hidden information, constraints, active world processes, or colliding threads may create a surprising, difficult, funny, dramatic, or otherwise fresh consequence when causally supported. Do not turn agency protection into a permission checkpoint, merely restate the action, insert a procedural obstacle without established cause, or end immediately before the action takes effect. Stop for the user only when a genuinely new consequential choice is required and their existing action does not already decide it. If an action is impossible, show the attempt and concrete in-world obstacle. If any earlier Tale Fairy sentence conflicts with the latest user action or pacing, ignore that sentence.${explicitProgress ? ` The latest turn also explicitly commands forward progress. Complete its requested transition or reach its stated milestone in this reply without predetermining what is found there; do not stop at another queue, doorway, preamble, permission question, or "about to" state. Any earlier Tale Fairy sentence that says not this turn, withhold the result, stop before the milestone, wait, or ask whether to proceed is void.` : ''}`;
    const guidancePrompt = guidanceUsable && s.guidance
        ? `\n<living-world-guide>\nTreat this as authoritative context guidance for the next roleplay reply. Apply it at the user's demonstrated pace: do not speed up, slow down, time-skip, montage, compress, prolong, or resolve the story unless the user's recent action or explicit direction signals that pacing change. Slow pacing means meaningful development at the user's chosen granularity, not splitting one obvious action into artificial waiting, approach, threshold, and permission beats. The selected Tale Fairy mode controls narrative pressure and boldness, not narrative speed. A supported NPC or world development may enter the current moment without rushing the user's response or taking control of their timeline. Use relevant continuity, lore, causal pressures, character knowledge, institutional constraints, and consequences directly in narration and dialogue where they apply. Preserve the user's control over their character's choices, dialogue, voluntary actions, thoughts, and feelings, but do not freeze NPCs or the wider world until the user explicitly requests movement. The user's current focus or silence is not a veto on supported external developments. Do not omit a supported influence merely because its outcome is uncertain; portray the influence, mechanism, or pressure without declaring an unestablished result. Follow the requested direction and established scene without sanitizing supported conflict, danger, flaws, rejection, loss, stakes, or consequences. Do not substitute safer alternatives, plot armor, forced sympathy, forced vulnerability, reconciliation, banter, avoidance, or silent treatment unless the evidence supports them. Do not add darkness without support.\n${s.guidance}\n<latest-user-action-override>\n${latestUserOverride}\n</latest-user-action-override>\n</living-world-guide>`
        : '';
    return `${notePrompt}${canonPrompt}${narrativePolicy}${guidancePrompt}`;
}

export function fingerprintMessages(messages = []) {
    const source = messages.map(m => `${m?.is_user ? 'U' : 'A'}:${text(m?.name)}:${text(m?.mes)}`).join('\n');
    let hash = 2166136261;
    for (let i = 0; i < source.length; i++) { hash ^= source.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return `${source.length}:${(hash >>> 0).toString(16)}`;
}
