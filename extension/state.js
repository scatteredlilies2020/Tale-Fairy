import { defaultAuthorBoard, normalizeAuthorBoard, refreshAuthorBoardFromLegacy } from './author-board.js?v=0.11.153';
import { defaultConductorState, formatConductorContract, normalizeConductorState } from './conductor.js';
import { defaultPacingState, normalizePacingState } from './pacing.js';
import { defaultPlannerSchedule, markPlannerCompleted, normalizePlannerSchedule } from './planner-scheduler.js';
import { defaultBeatDirective, defaultSceneProfile, formatBeatContract, hasUsableBeatDirective, normalizeBeatDirective, normalizeSceneProfile } from './beat-director.js?v=0.11.153';
import { normalizeDirectorSample } from './director-sampling.js?v=0.11.153';

export const STATE_KEY = 'livingWorldGuide';
export const STATE_VERSION = 50;

const MODES = new Set(['light', 'balanced', 'fun']);
const MAX_ITEMS = 12;
const MAX_EVENTS = 10;
const MAX_OBJECTIVES = 10;
const MAX_CONTINUITY_THREADS = 10;
const MAX_POSSIBILITIES = 18;
const MAX_HORIZONS = 10;
const MAX_PATHWAYS = 8;
const MAX_GUIDES = 4;
const ROUTE_LANES = new Set(['immediate', 'character', 'relationship-institution', 'lore-world', 'original', 'long-range', 'extra']);
const ROUTE_RELATIONS = new Set(['direct', 'independent', 'emergent']);
const ROUTE_SCALES = new Set(['scene', 'days', 'arc', 'months-years', 'open-ended']);

export function defaultState() {
    return {
        version: STATE_VERSION,
        enabled: true,
        mode: 'balanced',
        analysisModel: { source: 'active', profileId: '', model: '', url: '' },
        summaryEvidence: { count: 0, includedTokens: 0, originalTokens: 0, labels: [], scannedAt: 0 },
        scene: { status: 'uninitialized', activity: '', pace: '', intent: '', location: '', time: '', loop: false },
        sceneProfile: defaultSceneProfile(),
        beatDirective: defaultBeatDirective(),
        responseAudit: { applicable: false, movementFit: 'not-applicable', repetition: 'none', unjustifiedEscalation: false, playerControl: false, continuityDrift: false, patterns: [], summary: '' },
        responsePatternMemory: [],
        narrativeLayers: { immediateAction: '', localActivity: '', situation: '', widerWorld: '', durableTrajectory: '', activityRole: 'routine', temporalScope: 'action' },
        storyFrame: { frame: 'unknown', confidence: 'low', basis: '' },
        directorScore: { storyIdentity: '', sceneFunction: '', settingIdentity: '', settingForces: [], causalTempo: 'hold', arcDirection: '', futureSetup: { id: '', development: '', currentStep: '', conditions: [], earliestWindow: '', disclosure: 'hidden' }, meaningfulAim: '', change: 'replace', basis: '' },
        loreModel: { worldIdentity: '', baseline: '', variantRules: [], continuitySignatures: [], baselineDepartures: [], trajectorySignals: [], activeForces: [], confidence: 'low' },
        objectives: [],
        continuityThreads: [],
        selfChallenge: { weakness: '', counterRoute: '', mechanismCheck: '', decision: '' },
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
        cueAudit: { offeredIds: [], manifestedIds: [], unusedIds: [], contradictedIds: [], pacing: 'uncertain', reason: '' },
        lastAnalysisFingerprint: '',
        sourceMessageCount: 0,
        sourceChatId: '',
        lastAnalyzedAt: 0,
        turnCount: 0,
        plannerSeed: 0,
        lastRequestVerification: null,
        authorBoard: defaultAuthorBoard(),
        pacing: defaultPacingState(),
        conductor: defaultConductorState(),
        plannerSchedule: defaultPlannerSchedule(),
    };
}

function text(value, fallback = '') { return String(value ?? fallback).trim(); }
function cap(list, limit = MAX_ITEMS) { return Array.isArray(list) ? list.slice(-limit) : []; }
function clippedText(value, limit) {
    const source = text(value);
    if (source.length <= limit) return source;
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
function normalizeContinuityThread(value = {}) {
    const status = text(value.status, 'dormant').toLowerCase();
    return {
        id: text(value.id).slice(0, 100),
        thread: clippedText(value.thread, 180),
        state: clippedText(value.state, 240),
        status: ['active', 'dormant', 'due', 'blocked'].includes(status) ? status : 'dormant',
        basis: clippedText(value.basis, 160),
    };
}
function normalizeSelfChallenge(value = {}) {
    return {
        weakness: clippedText(value.weakness, 260),
        counterRoute: clippedText(value.counterRoute ?? value.counter_route, 260),
        mechanismCheck: clippedText(value.mechanismCheck ?? value.mechanism_check, 280),
        decision: clippedText(value.decision, 320),
    };
}
function normalizeEntity(value = {}) {
    return {
        name: text(value.name).slice(0, 100),
        state: clippedText(value.state, 220),
        location: clippedText(value.location, 140),
        relevance: clippedText(value.relevance, 140),
        perspective: clippedText(value.perspective ?? value.point_of_view, 180),
        motivation: clippedText(value.motivation ?? value.motive, 180),
        knowledge: clippedText(value.knowledge ?? value.beliefs, 180),
        constraints: clippedText(value.constraints ?? value.limits, 180),
        agenda: clippedText(value.agenda ?? value.next_action, 180),
        confidence: text(value.confidence).slice(0, 40),
        window: clippedText(value.window ?? value.timing, 100),
    };
}
function normalizePossibility(value = {}) {
    const horizon = text(value.horizon).toLowerCase();
    const lane = text(value.lane, 'extra').toLowerCase();
    const scale = text(value.scale, 'scene').toLowerCase();
    const origin = text(value.origin, 'inferred').toLowerCase();
    const rawDescription = text(value.description);
    const description = clippedText(rawDescription.length === 120 && !/[.!?…]$/u.test(rawDescription) ? `${rawDescription}\u2060` : rawDescription, 120);
    return { description, horizon: ['local', 'near', 'mid', 'far', 'wildcard'].includes(horizon) ? horizon : '', conditions: cap(value.conditions, 1).map(item => clippedText(item, 90)).filter(Boolean), force: text(value.force).slice(0, 20), lane: ROUTE_LANES.has(lane) ? lane : 'extra', agent: clippedText(value.agent, 100), engine: clippedText(value.engine, 100), scale: ROUTE_SCALES.has(scale) ? scale : 'scene', origin: ['established', 'inferred', 'original'].includes(origin) ? origin : 'inferred' };
}
function normalizeDirectorScore(value = {}) {
    const causalTempo = text(value.causalTempo ?? value.causal_tempo, 'hold').toLowerCase();
    const change = text(value.change, 'replace').toLowerCase();
    const future = value.futureSetup ?? value.future_setup ?? {};
    return {
        storyIdentity: clippedText(value.storyIdentity ?? value.story_identity, 240),
        sceneFunction: clippedText(value.sceneFunction ?? value.scene_function, 120),
        settingIdentity: clippedText(value.settingIdentity ?? value.setting_identity, 120),
        settingForces: cap(value.settingForces ?? value.setting_forces, 3).map(item => clippedText(item, 140)).filter(Boolean),
        causalTempo: ['hold', 'seed', 'advance', 'converge', 'payoff', 'redirect', 'recover'].includes(causalTempo) ? causalTempo : 'hold',
        arcDirection: clippedText(value.arcDirection ?? value.arc_direction, 260),
        futureSetup: {
            id: clippedText(future.id, 100),
            development: clippedText(future.development, 220),
            currentStep: clippedText(future.currentStep ?? future.current_step, 180),
            conditions: cap(future.conditions, 4).map(item => clippedText(item, 120)).filter(Boolean),
            earliestWindow: clippedText(future.earliestWindow ?? future.earliest_window, 120),
            disclosure: ['hidden', 'signaled', 'ready'].includes(text(future.disclosure).toLowerCase()) ? text(future.disclosure).toLowerCase() : 'hidden',
        },
        meaningfulAim: clippedText(value.meaningfulAim ?? value.meaningful_aim, 200),
        change: ['keep', 'adjust', 'advance', 'payoff', 'replace'].includes(change) ? change : 'replace',
        basis: clippedText(value.basis, 180),
    };
}
function normalizeNarrativeLayers(value = {}) {
    const activityRole = text(value.activityRole ?? value.activity_role, 'routine').toLowerCase();
    const temporalScope = text(value.temporalScope ?? value.temporal_scope, 'action').toLowerCase();
    return {
        immediateAction: clippedText(value.immediateAction ?? value.immediate_action, 140),
        localActivity: clippedText(value.localActivity ?? value.local_activity, 180),
        situation: clippedText(value.situation, 220),
        widerWorld: clippedText(value.widerWorld ?? value.wider_world, 240),
        durableTrajectory: clippedText(value.durableTrajectory ?? value.durable_trajectory, 300),
        activityRole: ['incidental', 'routine', 'developmental', 'central', 'transition'].includes(activityRole) ? activityRole : 'routine',
        temporalScope: ['moment', 'action', 'activity', 'scene', 'extended'].includes(temporalScope) ? temporalScope : 'action',
    };
}
function normalizePathway(value = {}) {
    const status = text(value.status, 'available').toLowerCase();
    const change = text(value.change, 'replace').toLowerCase();
    const lane = text(value.lane, 'extra').toLowerCase();
    const relation = text(value.relation, 'independent').toLowerCase();
    const scale = text(value.scale, 'scene').toLowerCase();
    const origin = text(value.origin, 'inferred').toLowerCase();
    const mechanismStatus = text(value.mechanismStatus ?? value.mechanism_status).toLowerCase();
    return {
        id: text(value.id).slice(0, 100),
        lane: ROUTE_LANES.has(lane) ? lane : 'extra',
        agent: clippedText(value.agent, 100),
        engine: clippedText(value.engine, 100),
        relation: ROUTE_RELATIONS.has(relation) ? relation : 'independent',
        scale: ROUTE_SCALES.has(scale) ? scale : 'scene',
        origin: ['established', 'inferred', 'original'].includes(origin) ? origin : 'inferred',
        mechanismStatus: ['evidenced', 'new'].includes(mechanismStatus) ? mechanismStatus : '',
        mechanismBasis: clippedText(value.mechanismBasis ?? value.mechanism_basis, 180),
        evidenceRefs: cap(value.evidenceRefs ?? value.evidence_refs, 4).map(item => clippedText(item, 80)).filter(Boolean),
        unresolvedBasis: clippedText(value.unresolvedBasis ?? value.unresolved_basis, 180),
        completionCheck: ['unresolved', 'new-cause'].includes(text(value.completionCheck ?? value.completion_check).toLowerCase()) ? text(value.completionCheck ?? value.completion_check).toLowerCase() : '',
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
    const disclosure = text(value.disclosure, 'none').toLowerCase();
    const routeLane = text(value.routeLane ?? value.route_lane, 'extra').toLowerCase();
    const scale = text(value.scale, 'scene').toLowerCase();
    const mechanismStatus = text(value.mechanismStatus ?? value.mechanism_status).toLowerCase();
    return {
        id: clippedText(value.id, 100),
        direction: clippedText(value.direction, 280),
        useWhen: clippedText(value.useWhen ?? value.use_when, 120),
        dropWhen: clippedText(value.dropWhen ?? value.drop_when, 100),
        causalRole: clippedText(value.causalRole ?? value.causal_role, 130),
        worldDelta: clippedText(value.worldDelta ?? value.world_delta, 140),
        routeLane: ROUTE_LANES.has(routeLane) ? routeLane : 'extra',
        causalAgent: clippedText(value.causalAgent ?? value.causal_agent, 100),
        causalEngine: clippedText(value.causalEngine ?? value.causal_engine, 100),
        scale: ROUTE_SCALES.has(scale) ? scale : 'scene',
        origin: ['established', 'inferred', 'original'].includes(origin) ? origin : 'inferred',
        mechanismStatus: ['evidenced', 'new'].includes(mechanismStatus) ? mechanismStatus : '',
        mechanismBasis: clippedText(value.mechanismBasis ?? value.mechanism_basis, 180),
        basis: clippedText(value.basis, 100),
        strength: ['strong', 'moderate', 'light'].includes(strength) ? strength : 'moderate',
        sourcePathways: cap(value.sourcePathways ?? value.source_pathways, 3).map(item => clippedText(item, 100)).filter(Boolean),
        causalEventIds: cap(value.causalEventIds ?? value.causal_event_ids, 2).map(item => clippedText(item, 80)).filter(Boolean),
        disclosure: ['none', 'consequence-only', 'partial-clue', 'reveal-cause'].includes(disclosure) ? disclosure : 'none',
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
    const scope = text(value.scope, 'onscreen').toLowerCase();
    const epistemicStatus = text(value.epistemicStatus ?? value.epistemic_status, 'possible').toLowerCase();
    const disclosure = text(value.disclosure, scope === 'offscreen' ? 'hidden' : 'revealed').toLowerCase();
    const status = text(value.status, 'active').toLowerCase();
    const confidence = text(value.confidence, 'low').toLowerCase();
    return {
        id: text(value.id).slice(0, 80),
        engine: text(value.engine).slice(0, 100),
        title: text(value.title).slice(0, 120),
        summary: text(value.summary).slice(0, 360),
        scope: ['onscreen', 'offscreen'].includes(scope) ? scope : 'onscreen',
        epistemicStatus: ['established', 'simulated', 'inferred', 'possible', 'disproved'].includes(epistemicStatus) ? epistemicStatus : 'possible',
        disclosure: ['hidden', 'signaled', 'revealed'].includes(disclosure) ? disclosure : 'hidden',
        status: ['active', 'latent', 'manifested', 'resolved', 'retired'].includes(status) ? status : 'active',
        confidence: ['low', 'moderate', 'high'].includes(confidence) ? confidence : 'low',
        timing: text(value.timing).slice(0, 120),
        dueState: ['unscheduled', 'pending', 'due', 'overdue'].includes(text(value.dueState ?? value.due_state).toLowerCase()) ? text(value.dueState ?? value.due_state).toLowerCase() : 'unscheduled',
        cause: text(value.cause).slice(0, 220),
        consequences: cap(value.consequences, 3).map(item => text(item).slice(0, 160)).filter(Boolean),
        basis: text(value.basis).slice(0, 180),
        requirements: cap(value.requirements, 4).map(item => text(item).slice(0, 120)).filter(Boolean),
    };
}

function normalizeCueAudit(value = {}) {
    const ids = key => cap(value[key] ?? value[key.replace(/[A-Z]/g, match => `_${match.toLowerCase()}`)], MAX_GUIDES)
        .map(item => text(item).slice(0, 100)).filter(Boolean);
    const pacing = text(value.pacing, 'uncertain').toLowerCase();
    return {
        offeredIds: ids('offeredIds'),
        manifestedIds: ids('manifestedIds'),
        unusedIds: ids('unusedIds'),
        contradictedIds: ids('contradictedIds'),
        pacing: ['respected', 'exceeded', 'uncertain'].includes(pacing) ? pacing : 'uncertain',
        reason: text(value.reason).slice(0, 300),
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

const GENERIC_HORIZON_TIMEFRAME = /^(?:future|open[- ]ended future|unknown|uncertain|tbd)$/iu;

function inferredHorizonTimeframe(index, total) {
    if (index >= total - 1) return 'distant / open-ended';
    return ['next response', 'next few turns', 'current scene', 'next scene', 'several scenes', 'current arc'][index] || 'later arcs';
}

function normalizeHorizon(value = {}, index = 0, items = [value]) {
    const change = text(value.change, 'replace').toLowerCase();
    const rawStability = text(value.stability).toLowerCase();
    const stability = rawStability === 'anchored' ? 'slow' : rawStability;
    const rawTimeframe = text(value.timeframe);
    const lane = text(value.lane, 'extra').toLowerCase();
    const relation = text(value.relation, 'independent').toLowerCase();
    const scale = text(value.scale, 'scene').toLowerCase();
    const origin = text(value.origin, 'inferred').toLowerCase();
    const mechanismStatus = text(value.mechanismStatus ?? value.mechanism_status).toLowerCase();
    return {
        id: text(value.id).slice(0, 100),
        lane: ROUTE_LANES.has(lane) ? lane : 'extra',
        branch: text(value.branch, 'current-trajectory').slice(0, 80),
        agent: clippedText(value.agent, 100),
        engine: clippedText(value.engine, 100),
        relation: ROUTE_RELATIONS.has(relation) ? relation : 'independent',
        scale: ROUTE_SCALES.has(scale) ? scale : 'scene',
        origin: ['established', 'inferred', 'original'].includes(origin) ? origin : 'inferred',
        mechanismStatus: ['evidenced', 'new'].includes(mechanismStatus) ? mechanismStatus : '',
        mechanismBasis: clippedText(value.mechanismBasis ?? value.mechanism_basis, 180),
        evidenceRefs: cap(value.evidenceRefs ?? value.evidence_refs, 4).map(item => clippedText(item, 80)).filter(Boolean),
        unresolvedBasis: clippedText(value.unresolvedBasis ?? value.unresolved_basis, 180),
        completionCheck: ['unresolved', 'new-cause'].includes(text(value.completionCheck ?? value.completion_check).toLowerCase()) ? text(value.completionCheck ?? value.completion_check).toLowerCase() : '',
        direction: text(value.direction).slice(0, 360),
        timeframe: (!rawTimeframe || GENERIC_HORIZON_TIMEFRAME.test(rawTimeframe)
            ? inferredHorizonTimeframe(index, items.length)
            : rawTimeframe).slice(0, 120),
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
    if (!value || typeof value !== 'object' || !['included', 'confirmed'].includes(value.status)) return null;
    const injectionDecision = value.injectionDecision === 'skip' ? 'skip' : 'inject';
    if (injectionDecision === 'inject' && !text(value.guidanceBlock)) return null;
    return {
        status: value.status,
        injectionDecision,
        runtimeVersion: text(value.runtimeVersion).slice(0, 40),
        verificationId: text(value.verificationId).slice(0, 100),
        guidanceBlock: injectionDecision === 'inject' ? text(value.guidanceBlock).slice(0, 12000) : '',
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
        guideCandidates: (Array.isArray(value.guideCandidates) ? value.guideCandidates.slice(0, MAX_GUIDES) : []).map(normalizeNextGuide).filter(item => item.id && item.direction && item.useWhen && item.dropWhen && item.causalRole && item.worldDelta && item.basis),
        canonConstraints: cap(value.canonConstraints).map(item => text(item).slice(0, 500)).filter(Boolean),
        selectedGuideIndex: Math.max(0, Math.min(MAX_GUIDES - 1, Number(value.selectedGuideIndex) || 0)),
        replacementGeneration: value.replacementGeneration === true,
        sceneProfile: normalizeSceneProfile(value.sceneProfile),
        beatDirective: normalizeBeatDirective(value.beatDirective),
        directorSample: value.directorSample && typeof value.directorSample === 'object'
            ? normalizeDirectorSample(value.directorSample)
            : null,
        directorSeed: Number.isInteger(Number(value.directorSeed)) && Number(value.directorSeed) >= 0
            ? Number(value.directorSeed)
            : null,
        conductorDevelopmentId: text(value.conductorDevelopmentId).slice(0, 100),
        conductorContract: normalizeConductorState(value.conductorContract),
    };
}

export function returnedReplyMatchesVerification(pending, messages = [], chatId = '') {
    if (!pending || pending.chatId !== String(chatId || '') || !messages.length || messages.at(-1)?.is_user) return false;
    const requiredCount = Math.max(0, Number(pending.sourceMessageCount) || 0) + (pending.replacementGeneration ? 0 : 1);
    return messages.length >= requiredCount;
}
function normalizeResponseAudit(value = {}) {
    const movementFit = text(value.movementFit ?? value.movement_fit, 'not-applicable').toLowerCase();
    const repetition = text(value.repetition, 'none').toLowerCase();
    return {
        applicable: value.applicable === true,
        movementFit: ['not-applicable', 'missed', 'partial', 'clear'].includes(movementFit) ? movementFit : 'not-applicable',
        repetition: ['none', 'possible', 'clear'].includes(repetition) ? repetition : 'none',
        unjustifiedEscalation: value.unjustifiedEscalation === true || value.unjustified_escalation === true,
        playerControl: value.playerControl === true || value.player_control === true,
        continuityDrift: value.continuityDrift === true || value.continuity_drift === true,
        patterns: cap(value.patterns, 5).map(item => clippedText(item, 140)).filter(Boolean),
        summary: clippedText(value.summary, 400),
    };
}

export function isReplacementVerificationCurrent(verification, messages = [], chatId = '') {
    if (!verification
        || verification.status !== 'confirmed'
        || verification.chatId !== String(chatId || '')
        || !messages.length) return false;
    const responseCount = Math.max(0, Number(verification.responseMessageCount) || 0);
    if (!responseCount) return false;
    if (messages.length === responseCount) return true;
    return Boolean(messages.at(-1)?.is_user && messages.length + 1 === responseCount);
}

export function normalizeState(input = {}) {
    const base = defaultState();
    const value = input && typeof input === 'object' ? input : {};
    const inputVersion = Math.max(0, Number(value.version) || 0);
    const plannerUpgradePending = inputVersion > 0 && inputVersion < 42;
    // v18 already stores the current canon shape. Preserve that evidence, but
    // v21 rebuilt event-prescriptive guides, v22 added a dramatic score, and
    // v23 replaces that style-adjacent score with causal narrative control;
    // v24 separates layered authorial intent from concrete scene realization;
    // v25 rebuilds canon after embedded OOC assertions became auditable;
    // v26 rebuilds plans whose recovery could clone one local beat across
    // every horizon or misclassify that beat as an offscreen event; v27
    // rebuilds once with an explicit newest-message recency boundary. v28
    // also preserves upstream plans through incomplete provider output and
    // makes depicted chronology an explicit planning boundary; v29 stops
    // generated status summaries from manufacturing elapsed time; v30 strips
    // plain leading statboxes and discards local state they may have tainted;
    // v31 excludes fenced code and XML/HTML-style blocks from chat evidence;
    // v32 gives future horizons explicit branches; v33 rebuilds once to seed
    // the durable established-open-thread inventory; v34 requires the planner
    // to challenge its preferred route before committing to it; v35 rebuilds
    // ranked alternatives with durable-hook diversity and tolerant schema handling;
    // v37 rebuilds once for persistent omniscient actors, lore, RP-specific
    // continuity signatures, and explicit departures from inferred baselines;
    // v38 rebuilds once after clipped historical evidence could displace
    // authored alternatives and the planner's own self-challenge; v39
    // rebuilds with a token-adaptive raw recent tail instead of a fixed turn
    // count while retaining persistent summaries and historical retrieval;
    // v40 preserves the complete typed route portfolio instead of silently
    // dropping three future paths and rebuilds route-specific guide functions;
    // v41 separates the underlying causal engines so one recent matter cannot
    // masquerade as several independent futures by changing actor or timing;
    // v42 binds each selected guide to its route's engine so it cannot consume
    // another route's signature development. v43 adds an author board,
    // deterministic conductor, pacing state, and periodic planner scheduler;
    // v42 plans migrate into that layer without spending a forced AI call;
    // v44 temporarily removed durable author direction; v45 restores it as a
    // provisional future-facing author map, distinct from factual history and
    // from the immediate pacing boundary. v46 retires that agenda at runtime:
    // planning now describes only the current scene and one semantic beat. v47
    // rebuilds the beat so no direction created under the old provider-visible
    // evidence contract can survive into the privacy-safe injection format.
    // v48 rebuilds sample-first decisions so scene need selects movement before
    // random creative appetite colors its expression. v49 adds a private reply
    // audit and an explicit necessity gate. v50 clears the current direction
    // once because required_effect becomes a general provider-visible result
    // rather than a private exact realization.
    const unsafePlannerUpgrade = inputVersion > 0 && inputVersion < 18;
    const movementUpgrade = inputVersion > 0 && inputVersion < 42;
    const recoveryUpgrade = inputVersion > 0 && inputVersion < 26;
    const chronologyAuditUpgrade = inputVersion > 0 && inputVersion < 31;
    const authorMapUpgrade = inputVersion > 0 && inputVersion < 45;
    const beatContractUpgrade = inputVersion > 0 && inputVersion < 48;
    const providerEffectUpgrade = inputVersion > 0 && inputVersion < 50;
    const normalizedLayers = normalizeNarrativeLayers(value.narrativeLayers);
    const normalizedDirector = normalizeDirectorScore(value.directorScore);
    const state = {
        ...base,
        ...value,
        version: STATE_VERSION,
        enabled: value.enabled !== false,
        mode: MODES.has(value.mode) ? value.mode : base.mode,
        analysisModel: { ...base.analysisModel, ...(value.analysisModel || {}) },
        summaryEvidence: {
            count: Math.max(0, Number(value.summaryEvidence?.count) || 0),
            includedTokens: Math.max(0, Number(value.summaryEvidence?.includedTokens) || 0),
            originalTokens: Math.max(0, Number(value.summaryEvidence?.originalTokens) || 0),
            // Summary sources are priority ordered, so retain the leading
            // witnesses (including Continuity) rather than the newest tail.
            labels: (Array.isArray(value.summaryEvidence?.labels) ? value.summaryEvidence.labels.slice(0, 12) : []).map(item => text(item).slice(0, 120)).filter(Boolean),
            scannedAt: Math.max(0, Number(value.summaryEvidence?.scannedAt) || 0),
        },
        scene: chronologyAuditUpgrade ? base.scene : { ...base.scene, ...(value.scene || {}) },
        sceneProfile: beatContractUpgrade ? base.sceneProfile : normalizeSceneProfile(value.sceneProfile ?? value.scene_profile),
        beatDirective: providerEffectUpgrade ? base.beatDirective : normalizeBeatDirective(value.beatDirective ?? value.beat_directive),
        responseAudit: normalizeResponseAudit(value.responseAudit ?? value.response_audit),
        responsePatternMemory: cap(value.responsePatternMemory ?? value.response_pattern_memory, 12).map(item => clippedText(item, 140)).filter(Boolean),
        narrativeLayers: chronologyAuditUpgrade
            ? { ...base.narrativeLayers, widerWorld: normalizedLayers.widerWorld }
            : authorMapUpgrade ? { ...normalizedLayers, durableTrajectory: '' } : normalizedLayers,
        storyFrame: { ...base.storyFrame, ...(value.storyFrame || {}) },
        directorScore: authorMapUpgrade ? { ...normalizedDirector, storyIdentity: '', arcDirection: '' } : normalizedDirector,
        loreModel: normalizeLoreModel(value.loreModel ?? value.lore_model),
        objectives: beatContractUpgrade || recoveryUpgrade ? [] : cap(value.objectives, MAX_OBJECTIVES).map(normalizeObjective).filter(item => item.title || item.detail),
        continuityThreads: cap(value.continuityThreads ?? value.continuity_threads, MAX_CONTINUITY_THREADS).map(normalizeContinuityThread).filter(item => item.id && item.thread && item.state && item.basis),
        selfChallenge: beatContractUpgrade ? base.selfChallenge : normalizeSelfChallenge(value.selfChallenge ?? value.self_challenge),
        entities: cap(value.entities).map(normalizeEntity).filter(item => item.name),
        possibilities: beatContractUpgrade ? [] : cap(value.possibilities, MAX_POSSIBILITIES).map(normalizePossibility).filter(item => item.description),
        pathways: beatContractUpgrade || chronologyAuditUpgrade ? [] : cap(value.pathways, MAX_PATHWAYS).map(normalizePathway).filter(item => item.id && item.direction && item.when),
        nextGuides: beatContractUpgrade || movementUpgrade ? [] : (Array.isArray(value.nextGuides) ? value.nextGuides.slice(0, MAX_GUIDES) : []).map(normalizeNextGuide).filter(item => item.id && item.direction && item.useWhen && item.dropWhen && item.causalRole && item.worldDelta && item.basis),
        activeBeat: chronologyAuditUpgrade ? base.activeBeat : normalizeBeat(value.activeBeat),
        beatHistory: beatContractUpgrade ? [] : cap(value.beatHistory, 6).map(normalizeBeat).filter(beat => beat.objective),
        planHorizons: beatContractUpgrade || recoveryUpgrade ? base.planHorizons : normalizePlanHorizons(value.planHorizons),
        // Older migrated states have no reliable pre-response canon snapshot.
        // v18 already has one, so retain it until the upgrade pass refreshes it.
        canonConstraints: unsafePlannerUpgrade ? [] : cap(value.canonConstraints).map(item => text(item).slice(0, 500)).filter(Boolean),
        canonBootstrapPending: value.canonBootstrapPending === true || plannerUpgradePending,
        userNotes: cap(value.userNotes).map(normalizeNote).filter(note => note.text),
        guidance: beatContractUpgrade || recoveryUpgrade ? '' : text(value.guidance).slice(0, 700),
        lastInject: providerEffectUpgrade || recoveryUpgrade ? false : value.lastInject === true,
        lastReason: text(value.lastReason).slice(0, 500),
        contextLedger: inputVersion > 0 && inputVersion < 44 ? '' : (chronologyAuditUpgrade ? '' : text(value.contextLedger).slice(0, 3000)),
        ledgerMessageCount: Math.max(0, Number(value.ledgerMessageCount) || 0),
        ledgerUpdatedAt: Number(value.ledgerUpdatedAt) || 0,
        narrativeEvents: beatContractUpgrade || recoveryUpgrade || chronologyAuditUpgrade ? [] : cap(value.narrativeEvents, MAX_EVENTS).map(normalizeEvent).filter(event => event.title && event.summary && event.engine),
        cueAudit: normalizeCueAudit(value.cueAudit),
        lastAnalysisFingerprint: text(value.lastAnalysisFingerprint),
        sourceMessageCount: Math.max(0, Number(value.sourceMessageCount) || 0),
        sourceChatId: text(value.sourceChatId),
        lastAnalyzedAt: Number(value.lastAnalyzedAt) || 0,
        turnCount: Math.max(0, Number(value.turnCount) || 0),
        plannerSeed: Number.isInteger(value.plannerSeed) ? value.plannerSeed : 0,
        lastRequestVerification: providerEffectUpgrade ? null : normalizeRequestVerification(value.lastRequestVerification),
    };
    state.authorBoard = beatContractUpgrade ? defaultAuthorBoard() : normalizeAuthorBoard(authorMapUpgrade ? {
        ...(value.authorBoard || {}),
        story: { identity: '', themes: [] },
        activeArc: {},
        characterArcs: [],
        relationshipArcs: [],
    } : value.authorBoard, state);
    state.pacing = normalizePacingState(value.pacing);
    state.conductor = beatContractUpgrade ? defaultConductorState() : normalizeConductorState(value.conductor);
    state.plannerSchedule = normalizePlannerSchedule(value.plannerSchedule);
    state.objectives = state.objectives.map((objective, index) => {
        if (!/^Open direction · open[- ]ended future$/iu.test(objective.title)) return objective;
        const timeframe = state.planHorizons.items[index]?.timeframe;
        return timeframe ? { ...objective, title: `Open direction · ${timeframe}`.slice(0, 120) } : objective;
    });
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

export function applyPlannerAuthorLayer(state, { turnCount = 0, fingerprint = '', seedRequiredDevelopment = true } = {}) {
    const next = normalizeState(state);
    const turn = Math.max(0, Number(turnCount) || next.turnCount);
    next.plannerSchedule = markPlannerCompleted(next.plannerSchedule, { turnCount: turn, fingerprint });
    return next;
}

export function stateForPrompt(state) {
    const s = normalizeState(state);
    return {
        mode: s.mode,
        scene: Object.fromEntries(Object.entries(s.scene).map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 100) : value])),
        sceneProfile: s.sceneProfile,
        beatDirective: s.beatDirective,
        responseAudit: s.responseAudit,
        responsePatternMemory: s.responsePatternMemory.slice(-10),
        narrativeLayers: { immediateAction: s.narrativeLayers.immediateAction, localActivity: s.narrativeLayers.localActivity, situation: s.narrativeLayers.situation, widerWorld: s.narrativeLayers.widerWorld, durableTrajectory: s.narrativeLayers.durableTrajectory, activityRole: s.narrativeLayers.activityRole, temporalScope: s.narrativeLayers.temporalScope },
        loreModel: { ...s.loreModel },
        continuityThreads: s.continuityThreads.map(item => ({ id: item.id, thread: item.thread, state: item.state, status: item.status, basis: item.basis })),
        entities: s.entities.filter(e => e && e.relevance !== 'ambient').slice(-5).map(item => ({
            name: item.name, state: item.state.slice(0, 120), location: item.location.slice(0, 80), relevance: item.relevance.slice(0, 80),
            perspective: item.perspective.slice(0, 100), motivation: item.motivation.slice(0, 110), knowledge: item.knowledge.slice(0, 90),
            constraints: item.constraints.slice(0, 90), agenda: item.agenda.slice(0, 110),
        })),
        canonConstraints: s.canonConstraints.slice(-8).map(item => item.slice(0, 360)),
        userNotes: s.userNotes.slice(-4),
        lastReason: s.lastReason.slice(0, 180),
        contextLedger: s.contextLedger.slice(0, 1400),
        storyFrame: { frame: s.storyFrame.frame, confidence: s.storyFrame.confidence, basis: s.storyFrame.basis.slice(0, 180) },
        plannerSchedule: s.plannerSchedule,
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
    if (!s.lastInject || !hasUsableBeatDirective(s.beatDirective)) return false;
    return isDirectionCurrent(s, messages, chatId);
}

export function isDirectionCurrent(state, messages = [], chatId = '') {
    const s = normalizeState(state);
    if (!s.beatDirective.operation || !s.beatDirective.requiredEffect) return false;
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

export function isAnalysisSourceCurrent(fingerprint, messageCount, messages = [], { allowOneUserAppend = false, allowOneAssistantAppend = false } = {}) {
    const count = Math.max(0, Number(messageCount) || 0);
    if (messages.length === count && fingerprintMessages(messages) === fingerprint) return true;
    if (messages.length !== count + 1 || fingerprintMessages(messages.slice(0, -1)) !== fingerprint) return false;
    return Boolean((allowOneUserAppend && messages.at(-1)?.is_user)
        || (allowOneAssistantAppend && !messages.at(-1)?.is_user));
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

function authorialDirective(guide) {
    const boundaries = {
        'consequence-only': 'Show only the perceivable consequence. Do not state, confirm, summarize, or flash back to its hidden cause.',
        'partial-clue': 'Show the consequence and at most one supported clue. Do not confirm or narrate the hidden cause.',
        'reveal-cause': 'The cause may become known only through an in-world reveal supported by this route.',
    };
    const boundary = boundaries[guide.disclosure];
    return `AUTHORIAL INTENT: ${clippedText(guide.direction, 180)}\nAPPLY WHEN: ${clippedText(guide.useWhen, 90)}\nDO NOT APPLY WHEN: ${clippedText(guide.dropWhen, 80)}\nSTORY FUNCTION: ${clippedText(guide.causalRole, 110)}\nIMPACT ENVELOPE: ${clippedText(guide.worldDelta, 110)}${boundary ? `\nINFORMATION BOUNDARY: ${boundary}` : ''}`;
}

function narrativeConductor(score, layers, continuityThreads = [], latestUserAction = '') {
    const forces = score.settingForces.length ? score.settingForces.map(item => clippedText(item, 55).replace(/[.;:,]+$/u, '')).join('; ') : 'Use only setting forces established by context.';
    const situation = layers.situation || score.sceneFunction || 'Use the current situation established in the latest conversation.';
    const widerWorld = layers.widerWorld || score.settingIdentity || 'Keep established world processes coherent without forcing them onscreen.';
    const presentPressure = score.futureSetup?.currentStep || 'Let one unresolved or genuinely new future cause develop without predetermining its outcome.';
    const currentAction = clippedText(latestUserAction || layers.immediateAction || 'Follow the latest authorized action.', 110);
    const actionLabel = latestUserAction ? 'LATEST USER ACTION' : 'IMMEDIATE CONTEXT';
    const openThreads = continuityThreads.slice(0, 5).map(item => `${item.status}: ${clippedText(item.thread, 62)} — ${clippedText(item.state, 78)}`).join(' | ');
    const threadLine = openThreads ? `\nESTABLISHED OPEN THREADS (continuity only; do not force onscreen): ${openThreads}` : '';
    return `TALE FAIRY AUTHORIAL FRAME:\nSELECTED FUTURE CAUSE: ${clippedText(presentPressure, 90)}\nCURRENT SITUATION: ${clippedText(situation, 100)}\nLOCAL ACTIVITY: ${clippedText(layers.localActivity || 'Use the latest established activity.', 90)} [${layers.activityRole.toUpperCase()}]\n${actionLabel}: ${currentAction}\nAUTHORIZED SCOPE: ${layers.temporalScope.toUpperCase()} (a ceiling, not a quota)\nWIDER WORLD: ${clippedText(widerWorld, 65)}${threadLine}\nACTIVE CAUSAL FORCES: ${forces}\nSTORY OPERATION: ${score.causalTempo.toUpperCase()}\nTale Fairy controls future narrative function, pressure, and scale—not the meaning of past events, outcomes, or player action; realize exact events, NPC actions, dialogue, outcomes, and prose from context.`;
}
function normalizeLoreModel(value = {}) {
    const confidence = text(value.confidence, 'low').toLowerCase();
    return {
        worldIdentity: clippedText(value.worldIdentity ?? value.world_identity, 140),
        baseline: clippedText(value.baseline, 300),
        variantRules: cap(value.variantRules ?? value.variant_rules, 6).map(item => clippedText(item, 220)).filter(Boolean),
        continuitySignatures: cap(value.continuitySignatures ?? value.continuity_signatures, 8).map(item => clippedText(item, 220)).filter(Boolean),
        baselineDepartures: cap(value.baselineDepartures ?? value.baseline_departures, 8).map(item => clippedText(item, 240)).filter(Boolean),
        trajectorySignals: cap(value.trajectorySignals ?? value.trajectory_signals, 6).map(item => clippedText(item, 220)).filter(Boolean),
        activeForces: cap(value.activeForces ?? value.active_forces, 5).map(item => clippedText(item, 180)).filter(Boolean),
        confidence: ['low', 'moderate', 'high'].includes(confidence) ? confidence : 'low',
    };
}

export function buildPromptPayload(state, { enabled = true, guidanceUsable = false, regeneration = false, sceneProfile = null, beatDirective = null, directorSample = null, mode = null } = {}) {
    if (!enabled || !guidanceUsable) return '';
    const s = normalizeState(state);
    const selectedBeat = normalizeBeatDirective(beatDirective || s.beatDirective);
    if (!hasUsableBeatDirective(selectedBeat)) return '';
    const routePrompt = formatBeatContract(sceneProfile || s.sceneProfile, selectedBeat, {
        regeneration,
        mode: directorSample?.mode || mode || s.mode,
    });
    const guidancePrompt = `\n<living-world-guide>\n${routePrompt}\n</living-world-guide>`;
    return `<tale-fairy-context>${guidancePrompt}\n</tale-fairy-context>`;
}

export function fingerprintMessages(messages = []) {
    const source = messages.map(m => `${m?.is_user ? 'U' : 'A'}:${text(m?.name)}:${text(m?.mes)}`).join('\n');
    let hash = 2166136261;
    for (let i = 0; i < source.length; i++) { hash ^= source.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return `${source.length}:${(hash >>> 0).toString(16)}`;
}
