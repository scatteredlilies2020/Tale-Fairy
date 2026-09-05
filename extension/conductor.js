import { markAuthorBeatIssued, normalizeAuthorBoard } from './author-board.js?v=0.12.7';
import { normalizePacingState } from './pacing.js';

const clean = (value, fallback) => String(value || fallback || '').trim().slice(0, 320);

export function defaultConductorState() {
    return { pacing: 'natural', scenePurpose: '', requiredDevelopment: '', allowedMovement: '', forbiddenMovement: '', backgroundTick: '', exitGate: '', developmentId: '', developmentType: '', boardRevision: 0, status: 'uninitialized', updatedAtTurn: 0 };
}

export function normalizeConductorState(value = {}) {
    value = value && typeof value === 'object' ? value : {};
    const pacing = ['linger', 'natural', 'advance'].includes(String(value.pacing || '').toLowerCase()) ? String(value.pacing).toLowerCase() : 'natural';
    const developmentType = String(value.developmentType ?? value.development_type ?? '').toLowerCase();
    return {
        pacing,
        scenePurpose: clean(value.scenePurpose ?? value.scene_purpose, ''), requiredDevelopment: clean(value.requiredDevelopment ?? value.required_development, ''),
        allowedMovement: clean(value.allowedMovement ?? value.allowed_movement, ''), forbiddenMovement: clean(value.forbiddenMovement ?? value.forbidden_movement, ''),
        backgroundTick: clean(value.backgroundTick ?? value.background_tick, ''), exitGate: clean(value.exitGate ?? value.exit_gate, ''),
        developmentId: clean(value.developmentId ?? value.development_id ?? value.milestoneId ?? value.milestone_id, ''),
        developmentType: ['required', 'milestone', 'offscreen'].includes(developmentType) ? developmentType : '',
        boardRevision: Math.max(0, Number(value.boardRevision ?? value.board_revision) || 0),
        status: ['uninitialized', 'active', 'released', 'invalid'].includes(String(value.status || '').toLowerCase()) ? String(value.status).toLowerCase() : 'active',
        updatedAtTurn: Math.max(0, Number(value.updatedAtTurn ?? value.updated_at_turn) || 0),
    };
}

function selectedDevelopment(board, pacing) {
    if (pacing === 'advance') {
        const ready = board.offscreenDevelopments.find(item => item.status === 'ready' && item.disclosure !== 'hidden');
        if (ready) return { id: ready.id, type: 'offscreen', text: `Release the perceivable consequence of the ready development: ${ready.development}` };
        const milestone = board.milestones.find(item => ['available', 'active'].includes(item.status));
        if (milestone) return { id: milestone.id, type: 'milestone', text: milestone.development };
    }
    const required = board.scene.requiredDevelopments.find(item => ['queued', 'issued'].includes(item.status));
    if (required) return { id: required.id, type: 'required', text: required.instruction };
    const milestone = board.milestones.find(item => ['available', 'active'].includes(item.status));
    if (milestone) return { id: milestone.id, type: 'milestone', text: milestone.development };
    return {
        id: '',
        type: '',
        text: pacing === 'linger'
            ? 'Add substance to the latest user-authorized activity or stated direction without ending it. If the activity has not begun, respond naturally and keep its route open rather than performing it for the player.'
            : 'Make one concrete development that supports the latest user-authorized action or direction without taking control of the player.',
    };
}

export function runConductor({ authorBoard, pacing, previous, turnCount = 0 } = {}) {
    const pace = normalizePacingState(pacing);
    let board = normalizeAuthorBoard(authorBoard);
    const development = selectedDevelopment(board, pace.effective);
    if (development.id) board = markAuthorBeatIssued(board, development.id, development.type, turnCount);
    const visibleBackground = board.offscreenDevelopments.find(item => ['active', 'ready'].includes(item.status) && item.disclosure !== 'hidden');
    const allowed = board.scene.allowedMovement.length
        ? board.scene.allowedMovement.join('; ')
        : pace.effective === 'linger'
            ? 'Deepen the present activity through concrete progress, substance, NPC response, sensory detail, or immediate consequence.'
            : 'Move only as far as the latest user action authorizes while delivering the required development.';
    const agencyBoundary = 'Do not author the player character\'s dialogue, thoughts, feelings, decisions, compliance, or movement beyond the latest user action.';
    const antiObstruction = 'Do not invent a new obstacle, access or escort requirement, delay, interruption, or unrelated task merely to manufacture development or prevent the user\'s stated direction; only use one when it is already established or the selected required development explicitly demands it.';
    const forbidden = board.scene.forbiddenMovement.length
        ? `${board.scene.forbiddenMovement.join('; ')}; ${agencyBoundary} ${antiObstruction}`
        : `${agencyBoundary} ${antiObstruction}`;
    const gates = board.scene.exitGates.length
        ? board.scene.exitGates.join('; ')
        : 'Release the scene only when the user leaves the activity, skips time, checks for developments, or explicitly advances.';
    const prior = normalizeConductorState(previous);
    return {
        authorBoard: board,
        contract: normalizeConductorState({
            pacing: pace.effective,
            scenePurpose: board.scene.purpose || board.activeArc.purpose || board.story.identity || 'Develop the current scene meaningfully without taking control from the user.',
            requiredDevelopment: development.text, allowedMovement: allowed, forbiddenMovement: forbidden,
            backgroundTick: visibleBackground ? `A perceivable background consequence may surface if causally appropriate: ${visibleBackground.development}` : 'Advance hidden background processes silently. Do not mention, hint at, or reveal their contents.',
            exitGate: gates, developmentId: development.id, developmentType: development.type, boardRevision: board.revision, status: 'active', updatedAtTurn: turnCount || prior.updatedAtTurn,
        }),
    };
}

export function conductorContractInvalidated(contract, authorBoard, pacing) {
    const current = normalizeConductorState(contract);
    const board = normalizeAuthorBoard(authorBoard);
    const pace = normalizePacingState(pacing);
    if (current.status === 'uninitialized' || !current.requiredDevelopment) return true;
    if (current.boardRevision !== board.revision || current.pacing !== pace.effective) return true;
    if (current.developmentId) {
        const development = board.scene.requiredDevelopments.find(item => item.id === current.developmentId);
        const milestone = board.milestones.find(item => item.id === current.developmentId);
        const offscreen = board.offscreenDevelopments.find(item => item.id === current.developmentId);
        if (development && ['delivered', 'retired'].includes(development.status)) return true;
        if (!development && !milestone && !offscreen) return true;
        if (milestone && ['resolved', 'retired'].includes(milestone.status)) return true;
        if (offscreen && ['released', 'resolved', 'retired'].includes(offscreen.status)) return true;
    }
    return false;
}

export function formatConductorContract(value) {
    const contract = normalizeConductorState(value);
    return [
        `PACE: ${contract.pacing.toUpperCase()}`,
        `SCENE PURPOSE: ${contract.scenePurpose}`,
        `REQUIRED DEVELOPMENT: ${contract.requiredDevelopment}`,
        `ALLOW: ${contract.allowedMovement}`,
        `DO NOT: ${contract.forbiddenMovement}`,
        `PRIVATE BACKGROUND: ${contract.backgroundTick}`,
        `RELEASE ONLY WHEN: ${contract.exitGate}`,
    ].join('\n');
}
