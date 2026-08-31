const MAX_ARCS = 8;
const MAX_SETUPS = 12;
const MAX_OFFSCREEN = 10;
const MAX_MILESTONES = 8;
const MAX_DEVELOPMENTS = 8;

const string = (value, limit = 240) => String(value ?? '').trim().slice(0, limit);
const list = (value, limit, mapper = item => string(item)) => (Array.isArray(value) ? value : []).slice(0, limit).map(mapper).filter(Boolean);

function slug(value, fallback = 'development') {
    return string(value, 100).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72) || fallback;
}

export function defaultAuthorBoard() {
    return {
        story: { identity: '', themes: [] }, activeArc: { id: '', title: '', phase: 'setup', purpose: '', pressure: '' },
        characterArcs: [], relationshipArcs: [], setups: [], offscreenDevelopments: [],
        scene: { identity: '', purpose: '', requiredDevelopments: [], allowedMovement: [], forbiddenMovement: [], exitGates: [] },
        milestones: [], revision: 0, updatedAtTurn: 0, lastTickTurn: 0,
    };
}

function normalizeArc(value = {}) {
    return { id: string(value.id, 80), title: string(value.title ?? value.name, 120), phase: string(value.phase, 60) || 'setup', purpose: string(value.purpose ?? value.direction, 260), pressure: string(value.pressure, 220) };
}

function normalizeCharacterArc(value = {}) {
    const name = string(value.name, 100);
    return name ? { name, transformation: string(value.transformation ?? value.arc, 260), currentState: string(value.currentState ?? value.current_state ?? value.state, 220), nextMilestone: string(value.nextMilestone ?? value.next_milestone, 220) } : null;
}

function normalizeRelationshipArc(value = {}) {
    const parties = list(value.parties, 4, item => string(item, 100));
    const id = string(value.id, 80) || slug(parties.join('-'), 'relationship');
    return id || parties.length ? { id, parties, arc: string(value.arc ?? value.transformation, 260), currentState: string(value.currentState ?? value.current_state ?? value.state, 220), nextMilestone: string(value.nextMilestone ?? value.next_milestone, 220) } : null;
}

function normalizeDevelopment(value, index = 0) {
    const source = typeof value === 'string' ? { instruction: value } : (value || {});
    const instruction = string(source.instruction ?? source.development ?? source.direction, 280);
    if (!instruction) return null;
    const status = string(source.status, 30).toLowerCase();
    return {
        id: string(source.id, 80) || `${slug(instruction)}-${index + 1}`, instruction,
        status: ['queued', 'issued', 'delivered', 'retired'].includes(status) ? status : 'queued',
        minTurns: Math.max(1, Math.min(20, Number(source.minTurns ?? source.min_turns) || 1)),
        issuedAtTurn: Math.max(0, Number(source.issuedAtTurn ?? source.issued_at_turn) || 0),
        deliveredAtTurn: Math.max(0, Number(source.deliveredAtTurn ?? source.delivered_at_turn) || 0),
    };
}

function normalizeSetup(value = {}) {
    const description = string(value.description ?? value.setup ?? value.promise, 260);
    if (!description) return null;
    const kind = string(value.kind, 30).toLowerCase();
    const status = string(value.status, 30).toLowerCase();
    return { id: string(value.id, 80) || slug(description, 'setup'), kind: ['setup', 'promise', 'payoff'].includes(kind) ? kind : 'setup', description, status: ['open', 'ready', 'resolved', 'retired'].includes(status) ? status : 'open', payoff: string(value.payoff, 240), conditions: list(value.conditions, 4, item => string(item, 140)) };
}

function normalizeOffscreen(value = {}) {
    const development = string(value.development ?? value.summary ?? value.title, 280);
    if (!development) return null;
    const status = string(value.status, 30).toLowerCase();
    const clockType = string(value.clockType ?? value.clock_type, 30).toLowerCase();
    const disclosure = string(value.disclosure, 30).toLowerCase();
    return {
        id: string(value.id, 80) || slug(development, 'offscreen'), development,
        status: ['queued', 'active', 'ready', 'released', 'resolved', 'retired'].includes(status) ? status : 'queued',
        clockType: ['scene-turn', 'story-time', 'institutional', 'triggered'].includes(clockType) ? clockType : 'scene-turn',
        progress: Math.max(0, Math.min(100, Number(value.progress) || 0)), tick: Math.max(0, Math.min(100, Number(value.tick) || 10)),
        releaseConditions: list(value.releaseConditions ?? value.release_conditions ?? value.requirements, 5, item => string(item, 140)),
        disclosure: ['hidden', 'signaled', 'revealed'].includes(disclosure) ? disclosure : 'hidden',
    };
}

function normalizeMilestone(value = {}) {
    const development = string(value.development ?? value.direction ?? value.title, 280);
    if (!development) return null;
    const status = string(value.status, 30).toLowerCase();
    return { id: string(value.id, 80) || slug(development, 'milestone'), development, horizon: string(value.horizon ?? value.timeframe, 80) || 'upcoming', conditions: list(value.conditions, 4, item => string(item, 140)), status: ['queued', 'available', 'active', 'resolved', 'retired'].includes(status) ? status : 'queued' };
}

function durableArcFromLegacy(legacy = {}, fallback = {}) {
    const candidates = [...(Array.isArray(legacy.pathways) ? legacy.pathways : []), ...(Array.isArray(legacy.planHorizons?.items) ? legacy.planHorizons.items : [])]
        .filter(item => item && item.lane !== 'immediate' && item.direction && !['scene', 'days'].includes(item.scale));
    const route = candidates.find(item => ['foreground', 'active'].includes(item.status))
        || candidates.find(item => item.lane === 'relationship-institution')
        || candidates.find(item => item.lane === 'character')
        || candidates[0];
    if (!route) return normalizeArc(fallback);
    return normalizeArc({
        id: route.id,
        title: route.direction,
        phase: route.status || route.horizon || 'setup',
        purpose: route.direction,
        pressure: route.conditions?.[0] || route.engine || fallback.pressure,
    });
}

export function normalizeAuthorBoard(value = {}, legacy = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const director = legacy.directorScore || {};
    const layers = legacy.narrativeLayers || {};
    const scene = source.scene || {};
    const migratedOffscreen = (Array.isArray(legacy.narrativeEvents) ? legacy.narrativeEvents : [])
        .filter(event => event?.scope === 'offscreen' && !['resolved', 'retired'].includes(event?.status))
        .map(event => ({ id: event.id, development: event.summary || event.title, status: ['due', 'overdue'].includes(event.dueState) ? 'ready' : 'active', progress: ['due', 'overdue'].includes(event.dueState) ? 100 : 25, releaseConditions: event.requirements, disclosure: event.disclosure, clockType: 'institutional' }));
    const required = scene.requiredDevelopments ?? scene.required_developments ?? source.requiredDevelopments;
    return {
        story: { identity: string(source.story?.identity ?? source.storyIdentity ?? layers.durableTrajectory ?? director.storyIdentity, 240), themes: list(source.story?.themes ?? source.themes, 6, item => string(item, 120)) },
        activeArc: normalizeArc(source.activeArc ?? source.active_arc ?? { id: director.futureSetup?.id, title: layers.durableTrajectory ?? director.storyIdentity, phase: director.causalTempo, purpose: director.arcDirection, pressure: director.meaningfulAim }),
        characterArcs: list(source.characterArcs ?? source.character_arcs, MAX_ARCS, normalizeCharacterArc),
        relationshipArcs: list(source.relationshipArcs ?? source.relationship_arcs, MAX_ARCS, normalizeRelationshipArc),
        setups: list(source.setups ?? source.promises, MAX_SETUPS, normalizeSetup),
        offscreenDevelopments: list(source.offscreenDevelopments ?? source.offscreen_developments ?? migratedOffscreen, MAX_OFFSCREEN, normalizeOffscreen),
        scene: {
            identity: string(scene.identity ?? source.sceneIdentity ?? layers.localActivity ?? legacy.scene?.activity, 200),
            purpose: string(scene.purpose ?? source.scenePurpose ?? director.sceneFunction, 280),
            requiredDevelopments: list(required ?? [director.futureSetup?.currentStep].filter(Boolean), MAX_DEVELOPMENTS, normalizeDevelopment),
            allowedMovement: list(scene.allowedMovement ?? scene.allowed_movement, 6, item => string(item, 180)),
            forbiddenMovement: list(scene.forbiddenMovement ?? scene.forbidden_movement, 8, item => string(item, 180)),
            exitGates: list(scene.exitGates ?? scene.exit_gates ?? director.futureSetup?.conditions, 6, item => string(item, 160)),
        },
        milestones: list(source.milestones, MAX_MILESTONES, normalizeMilestone), revision: Math.max(0, Number(source.revision) || 0),
        updatedAtTurn: Math.max(0, Number(source.updatedAtTurn ?? source.updated_at_turn) || 0), lastTickTurn: Math.max(0, Number(source.lastTickTurn ?? source.last_tick_turn) || 0),
    };
}

export function refreshAuthorBoardFromLegacy(board, legacy = {}, turnCount = 0) {
    const prior = normalizeAuthorBoard(board, legacy);
    const migrated = normalizeAuthorBoard({}, legacy);
    const rawStoryIdentity = string(board?.story?.identity ?? board?.storyIdentity, 240);
    const rawArc = normalizeArc(board?.activeArc ?? board?.active_arc);
    const durableTrajectory = string(legacy.narrativeLayers?.durableTrajectory, 240);
    const currentDecisionIdentity = string(legacy.directorScore?.storyIdentity, 240);
    const tempo = string(legacy.directorScore?.causalTempo, 30).toLowerCase();
    const quietLocalDecision = ['hold', 'seed'].includes(tempo)
        && ['incidental', 'routine'].includes(string(legacy.narrativeLayers?.activityRole, 30).toLowerCase());
    // Older boards were generated directly from the latest director decision. Repair
    // that migration when a durable trajectory exists, then keep durable scopes
    // stable during scene-level HOLD/SEED decisions.
    const storyWasCurrentDecision = rawStoryIdentity && rawStoryIdentity === currentDecisionIdentity;
    const story = quietLocalDecision
        ? rawStoryIdentity && !(storyWasCurrentDecision && durableTrajectory && durableTrajectory !== rawStoryIdentity)
            ? prior.story
            : { ...prior.story, identity: durableTrajectory || migrated.story.identity }
        : migrated.story.identity ? migrated.story : prior.story;
    const arcWasCurrentSetup = rawArc.id && rawArc.id === string(legacy.directorScore?.futureSetup?.id, 80);
    const activeArc = quietLocalDecision
        ? rawArc.purpose && !arcWasCurrentSetup ? prior.activeArc : durableArcFromLegacy(legacy, migrated.activeArc)
        : migrated.activeArc.purpose ? migrated.activeArc : prior.activeArc;
    const guide = legacy.nextGuides?.[0];
    const instruction = string(guide?.worldDelta ?? guide?.direction ?? legacy.directorScore?.futureSetup?.currentStep, 280);
    const existing = prior.scene.requiredDevelopments.filter(item => !['delivered', 'retired'].includes(item.status));
    const requiredDevelopments = instruction ? [normalizeDevelopment({ instruction }, 0), ...existing.filter(item => item.instruction !== instruction)].slice(0, MAX_DEVELOPMENTS) : existing;
    return normalizeAuthorBoard({
        ...prior, story, activeArc,
        offscreenDevelopments: migrated.offscreenDevelopments.length ? migrated.offscreenDevelopments : prior.offscreenDevelopments,
        scene: { ...prior.scene, identity: migrated.scene.identity || prior.scene.identity, purpose: migrated.scene.purpose || prior.scene.purpose, requiredDevelopments, exitGates: migrated.scene.exitGates.length ? migrated.scene.exitGates : prior.scene.exitGates },
        revision: prior.revision + 1, updatedAtTurn: turnCount,
    }, legacy);
}

export function markDevelopmentIssued(board, developmentId, turnCount = 0) {
    const next = normalizeAuthorBoard(board);
    next.scene.requiredDevelopments = next.scene.requiredDevelopments.map(item => item.id === developmentId && item.status === 'queued' ? { ...item, status: 'issued', issuedAtTurn: turnCount } : item);
    return next;
}

export function markDevelopmentDelivered(board, developmentId, turnCount = 0) {
    const next = normalizeAuthorBoard(board);
    next.scene.requiredDevelopments = next.scene.requiredDevelopments.map(item => item.id === developmentId && ['queued', 'issued'].includes(item.status) ? { ...item, status: 'delivered', deliveredAtTurn: turnCount } : item);
    return next;
}

export function markAuthorBeatIssued(board, beatId, beatType = '', turnCount = 0) {
    const next = normalizeAuthorBoard(board);
    if (!beatType || beatType === 'required') {
        next.scene.requiredDevelopments = next.scene.requiredDevelopments.map(item => item.id === beatId && item.status === 'queued' ? { ...item, status: 'issued', issuedAtTurn: turnCount } : item);
    }
    if (!beatType || beatType === 'milestone') {
        next.milestones = next.milestones.map(item => item.id === beatId && item.status === 'available' ? { ...item, status: 'active' } : item);
    }
    return next;
}

export function markAuthorBeatDelivered(board, beatId, beatType = '', turnCount = 0) {
    const next = normalizeAuthorBoard(board);
    if (!beatType || beatType === 'required') {
        next.scene.requiredDevelopments = next.scene.requiredDevelopments.map(item => item.id === beatId && ['queued', 'issued'].includes(item.status) ? { ...item, status: 'delivered', deliveredAtTurn: turnCount } : item);
    }
    if (!beatType || beatType === 'milestone') {
        next.milestones = next.milestones.map(item => item.id === beatId && ['available', 'active'].includes(item.status) ? { ...item, status: 'resolved' } : item);
    }
    if (!beatType || beatType === 'offscreen') {
        next.offscreenDevelopments = next.offscreenDevelopments.map(item => item.id === beatId && item.status === 'ready' ? { ...item, status: 'released' } : item);
    }
    return next;
}

export function tickAuthorBoard(board, { turnCount = 0, storyTimeAdvanced = false, triggeredIds = [] } = {}) {
    const next = normalizeAuthorBoard(board);
    const turn = Math.max(0, Number(turnCount) || 0);
    if (!turn || turn <= next.lastTickTurn) return next;
    const triggered = new Set(triggeredIds);
    next.offscreenDevelopments = next.offscreenDevelopments.map(item => {
        if (!['queued', 'active'].includes(item.status)) return item;
        const ticks = item.clockType === 'scene-turn' || item.clockType === 'institutional' || (item.clockType === 'story-time' && storyTimeAdvanced) || (item.clockType === 'triggered' && triggered.has(item.id));
        if (!ticks) return item;
        const progress = Math.min(100, item.progress + item.tick);
        return { ...item, progress, status: progress >= 100 ? 'ready' : 'active' };
    });
    next.lastTickTurn = turn;
    next.updatedAtTurn = Math.max(next.updatedAtTurn, turn);
    return next;
}

export function authorBoardForPrompt(board) {
    const value = normalizeAuthorBoard(board);
    return { ...value, setups: value.setups.filter(item => item.status !== 'retired'), offscreenDevelopments: value.offscreenDevelopments.filter(item => !['retired', 'resolved'].includes(item.status)), milestones: value.milestones.filter(item => !['retired', 'resolved'].includes(item.status)) };
}
