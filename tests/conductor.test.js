import assert from 'node:assert/strict';
import test from 'node:test';
import { conductorContractInvalidated, formatConductorContract, runConductor } from '../extension/conductor.js';

const board = {
    story: { identity: 'A Star Wars apprenticeship story.' }, revision: 2,
    scene: {
        purpose: "Make Lucia's reading relevant to her apprenticeship.",
        requiredDevelopments: [
            { id: 'principle', instruction: 'Present one specific Jedi principle.', status: 'queued' },
            { id: 'question', instruction: 'Offer a contradiction Lucia can later examine.', status: 'queued' },
        ],
        exitGates: ['Lucia leaves or explicitly advances.'],
    },
    offscreenDevelopments: [{ id: 'secret', development: 'The Council rejects a petition.', status: 'active', disclosure: 'hidden', progress: 40 }],
};

test('conductor issues one concrete development and keeps hidden content out of the contract', () => {
    const result = runConductor({ authorBoard: board, pacing: { inferred: 'linger' }, turnCount: 7 });
    assert.equal(result.contract.developmentId, 'principle');
    assert.equal(result.authorBoard.scene.requiredDevelopments[0].status, 'issued');
    const prompt = formatConductorContract(result.contract);
    assert.match(prompt, /PACE: LINGER/);
    assert.match(prompt, /Present one specific Jedi principle/);
    assert.doesNotMatch(prompt, /Council rejects|petition/iu);
});

test('delivered development invalidates the old contract so the next one can be selected', () => {
    const result = runConductor({ authorBoard: board, pacing: { inferred: 'natural' }, turnCount: 7 });
    const delivered = structuredClone(result.authorBoard);
    delivered.scene.requiredDevelopments[0].status = 'delivered';
    assert.equal(conductorContractInvalidated(result.contract, delivered, { inferred: 'natural' }), true);
    const next = runConductor({ authorBoard: delivered, pacing: { inferred: 'natural' }, turnCount: 8 });
    assert.equal(next.contract.developmentId, 'question');
});

test('linger fallback supports a stated activity without manufacturing a procedural barrier', () => {
    const result = runConductor({
        authorBoard: { story: { identity: 'A general story.' }, scene: { purpose: 'Support the transition.', requiredDevelopments: [] } },
        pacing: { inferred: 'linger' },
        turnCount: 8,
    });
    const prompt = formatConductorContract(result.contract);
    assert.match(prompt, /latest user-authorized activity or stated direction/iu);
    assert.match(prompt, /keep its route open/iu);
    assert.match(prompt, /Do not invent a new obstacle, access or escort requirement/iu);
});
