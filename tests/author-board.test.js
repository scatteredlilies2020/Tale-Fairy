import assert from 'node:assert/strict';
import test from 'node:test';
import { markAuthorBeatDelivered, markAuthorBeatIssued, markDevelopmentDelivered, markDevelopmentIssued, normalizeAuthorBoard, refreshAuthorBoardFromLegacy, tickAuthorBoard } from '../extension/author-board.js';

test('required developments have durable ids and lifecycle state', () => {
    let board = normalizeAuthorBoard({ scene: { requiredDevelopments: ['Explain one concrete Jedi principle.'] } });
    const id = board.scene.requiredDevelopments[0].id;
    board = markDevelopmentIssued(board, id, 3);
    assert.equal(board.scene.requiredDevelopments[0].status, 'issued');
    board = markDevelopmentDelivered(board, id, 4);
    assert.equal(board.scene.requiredDevelopments[0].status, 'delivered');
});

test('delivered milestone and offscreen beats leave the conductor queue', () => {
    let board = normalizeAuthorBoard({
        milestones: [{ id: 'trust', development: 'The rivals choose to cooperate.', status: 'available' }],
        offscreenDevelopments: [{ id: 'fleet', development: 'The fleet reaches orbit.', status: 'ready' }],
    });
    board = markAuthorBeatIssued(board, 'trust', 'milestone', 4);
    assert.equal(board.milestones[0].status, 'active');
    board = markAuthorBeatDelivered(board, 'trust', 'milestone', 5);
    board = markAuthorBeatDelivered(board, 'fleet', 'offscreen', 5);
    assert.equal(board.milestones[0].status, 'resolved');
    assert.equal(board.offscreenDevelopments[0].status, 'released');
});

test('offscreen clocks tick once per accepted turn and honor their clock type', () => {
    const board = normalizeAuthorBoard({ offscreenDevelopments: [
        { id: 'council', development: 'Council review', clockType: 'institutional', progress: 10, tick: 10 },
        { id: 'travel', development: 'Courier travels', clockType: 'story-time', progress: 10, tick: 20 },
        { id: 'trigger', development: 'A trap activates', clockType: 'triggered', progress: 0, tick: 50 },
    ] });
    const first = tickAuthorBoard(board, { turnCount: 5 });
    assert.deepEqual(first.offscreenDevelopments.map(item => item.progress), [20, 10, 0]);
    const duplicate = tickAuthorBoard(first, { turnCount: 5, storyTimeAdvanced: true, triggeredIds: ['trigger'] });
    assert.deepEqual(duplicate.offscreenDevelopments.map(item => item.progress), [20, 10, 0]);
    const second = tickAuthorBoard(first, { turnCount: 6, storyTimeAdvanced: true, triggeredIds: ['trigger'] });
    assert.deepEqual(second.offscreenDevelopments.map(item => item.progress), [30, 30, 50]);
});

test('a routine scene hold stays local instead of becoming a model-authored story interpretation', () => {
    const board = normalizeAuthorBoard({
        story: { identity: 'Lucia grows from institutional childhood into a life shaped by extraordinary Force potential.' },
        activeArc: { id: 'placement', title: 'Who will shape Lucia\'s future?', phase: 'setup', purpose: 'Let institutional custody and Jedi attention converge over multiple scenes.', pressure: 'The Council petition remains unresolved.' },
    });
    const refreshed = refreshAuthorBoardFromLegacy(board, {
        narrativeLayers: { localActivity: 'Quiet garden reading', durableTrajectory: board.story.identity, activityRole: 'routine' },
        directorScore: { storyIdentity: 'A quiet morning interlude before an uncertain future.', sceneFunction: 'Let Lucia read without interruption.', causalTempo: 'hold', arcDirection: 'Read page 42.', meaningfulAim: 'Enjoy the garden.', futureSetup: { id: 'g_garden', currentStep: 'Lucia reads in the garden.', conditions: [] } },
    }, 361);
    assert.equal(board.story.identity, '');
    assert.equal(refreshed.story.identity, '');
    assert.equal(refreshed.activeArc.id, '');
    assert.equal(refreshed.scene.identity, 'Quiet garden reading');
    assert.equal(refreshed.scene.purpose, 'Let Lucia read without interruption.');
});

test('a clean rescan builds a future queue without reconstructing a story identity or active arc', () => {
    const localIdentity = 'A quiet morning interlude in a structured facility before an uncertain future.';
    const durable = 'Lucia survives institutional childhood while extraordinary Force potential may draw Jedi and Republic attention.';
    const weakBoard = {
        story: { identity: localIdentity },
        activeArc: { id: 'g_garden', title: localIdentity, phase: 'hold', purpose: 'Read in the garden.', pressure: 'Reach page 42.' },
    };
    const legacy = {
        narrativeLayers: { localActivity: 'Quiet garden reading', durableTrajectory: durable, activityRole: 'routine' },
        directorScore: { storyIdentity: localIdentity, sceneFunction: 'Linger on reading.', causalTempo: 'hold', arcDirection: 'Read in the garden.', meaningfulAim: 'Reach page 42.', futureSetup: { id: 'g_garden', currentStep: 'Continue reading.', conditions: [] } },
        pathways: [{ id: 'council-review', lane: 'relationship-institution', scale: 'arc', status: 'active', direction: 'The unresolved Council petition changes who may take responsibility for Lucia.', conditions: ['The filed petition reaches a decision.'], engine: 'Jedi Council review' }],
        nextGuides: [{ id: 'council-review', direction: 'The unresolved Council petition reaches a procedurally supported next step.', useWhen: 'The review remains unresolved and its prerequisites are met.', dropWhen: 'A newer event completes, cancels, or invalidates the review.', causalRole: 'Advance the existing institutional process.', worldDelta: 'The review acquires one concrete procedural state.', disclosure: 'none' }],
    };
    const loaded = normalizeAuthorBoard(weakBoard, legacy);
    assert.equal(loaded.story.identity, '');
    assert.equal(loaded.activeArc.id, '');
    const refreshed = refreshAuthorBoardFromLegacy(normalizeAuthorBoard(), legacy, 361);
    assert.equal(refreshed.story.identity, '');
    assert.equal(refreshed.activeArc.id, '');
    assert.ok(refreshed.scene.requiredDevelopments.some(item => item.id === 'council-review'));
});

test('an advancing recent scene also cannot create an established story interpretation', () => {
    const board = normalizeAuthorBoard({
        story: { identity: 'A broad institutional coming-of-age story.' },
        activeArc: { id: 'custody', title: 'Lucia\'s placement', purpose: 'Resolve who will shape Lucia\'s future.', pressure: 'Competing responsibilities remain open.' },
    });
    const refreshed = refreshAuthorBoardFromLegacy(board, {
        narrativeLayers: { localActivity: 'Winning a garden chess game', durableTrajectory: 'The chess match becomes everything.', activityRole: 'central' },
        directorScore: { storyIdentity: 'A decisive garden chess drama.', sceneFunction: 'End the match.', causalTempo: 'advance', arcDirection: 'Win at chess.', meaningfulAim: 'Checkmate.', futureSetup: { id: 'chess-win', currentStep: 'Move the queen.', conditions: [] } },
        pathways: [{ id: 'chess-win', lane: 'character', scale: 'arc', status: 'foreground', direction: 'The chess victory defines Lucia\'s future.', engine: 'garden chess' }],
    }, 362);
    assert.equal(board.story.identity, '');
    assert.equal(refreshed.story.identity, '');
    assert.equal(refreshed.activeArc.id, '');
    assert.equal(refreshed.scene.purpose, 'End the match.');
});

test('delivered future developments cannot be silently requeued through paraphrase', () => {
    let board = normalizeAuthorBoard({
        scene: { requiredDevelopments: [{ id: 'council-decision', instruction: 'The Council petition reaches a formal decision.', status: 'queued' }] },
    });
    board = markDevelopmentDelivered(board, 'council-decision', 7);
    const refreshed = refreshAuthorBoardFromLegacy(board, {
        directorScore: { sceneFunction: 'Hold the current scene.', meaningfulAim: 'Preserve pacing.' },
        nextGuides: [{ id: 'renamed-decision', direction: 'A formal decision arrives for the Council petition.', useWhen: 'The review completes.', dropWhen: 'The petition is withdrawn.' }],
    }, 8);
    assert.equal(refreshed.scene.requiredDevelopments.length, 1);
    assert.equal(refreshed.scene.requiredDevelopments[0].id, 'council-decision');
    assert.equal(refreshed.scene.requiredDevelopments[0].status, 'delivered');
});
