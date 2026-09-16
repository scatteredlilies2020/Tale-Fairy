import test from 'node:test';
import assert from 'node:assert/strict';
import { horizonInput, acceptHorizon } from '../scripts/horizon-preparation-prototype.mjs';
test('premise-first input preserves complete source, instructions and opening without deleting the source history', () => {
    const source = { source_reference: { description: 'x'.repeat(2500), persona: 'Two aliases identify one player.' }, explicit_user_instruction: 'Keep the journey broad.', story_evidence: { opening: { index: 0, content: 'Initial era.' }, timeline: ['current episode'] }, accepted_messages: [{ content: 'latest scene' }], constraints: { canon: ['No flight.'] } };
    const before = structuredClone(source), input = JSON.parse(horizonInput(source));
    assert.deepEqual(input.source_reference, source.source_reference); assert.deepEqual(input.accepted_opening, source.story_evidence.opening);
    assert.equal(input.explicit_user_instruction, source.explicit_user_instruction); assert.deepEqual(input.constraints, source.constraints);
    assert.equal(input.accepted_messages, undefined); assert.deepEqual(source, before);
});
test('generated horizon cannot narrow authoritative scope or smuggle accepted history', () => {
    assert.throws(() => acceptHorizon({ developments: [], scope: 'Only this town matters.' }));
    assert.throws(() => acceptHorizon({ developments: [], observations: [] }));
    assert.deepEqual(acceptHorizon({ developments: [] }).developments, []);
    assert.throws(() => acceptHorizon({ developments: [{ id: 'unfinished' }] }));
});
