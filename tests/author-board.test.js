import assert from 'node:assert/strict';
import test from 'node:test';
import { markAuthorBeatDelivered, markAuthorBeatIssued, markDevelopmentDelivered, markDevelopmentIssued, normalizeAuthorBoard, tickAuthorBoard } from '../extension/author-board.js';

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
