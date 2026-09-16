import test from 'node:test';
import assert from 'node:assert/strict';
import { developmentState } from '../scripts/development-maintenance-prototype.mjs';
import { storytellerInput } from '../scripts/development-storyteller-prototype.mjs';

const preparation = { scope: 'A continuing journey.', developments: [{ id: 'work', substance: 'A new private composition.', independence: 'The musician wants to compose, regardless of the delivery.', encounter: 'Shared time with the musician.', changes: [{ when: 'A private reading is chosen.', experience: 'The drum answers an unfinished phrase.', after: 'Keep the version that was actually tried.' }, { when: 'After sufficient practice.', experience: 'Try a changed answer.', after: 'Preserve what the participants choose.' }] }] };

test('storyteller receives durable substance even when next-beat selection is empty', () => {
    const state = developmentState(preparation);
    const input = storytellerInput({ reference: { description: 'Full source.' }, state, messages: [{ is_user: true, mes: 'Please play it.' }] });
    const packet = JSON.parse(input.conversation[2].content);
    assert.deepEqual(packet.repertoire, preparation);
    assert.match(packet.provenance, /UNACCEPTED/);
    assert.deepEqual(input.conversation.at(-1), { role: 'user', content: 'Please play it.' });
    assert.deepEqual(state.selected, []);
});

test('accepted conversation retains native roles, refusals and generated changes without promotion from design', () => {
    const messages = [{ role: 'assistant', content: 'Jo plays a short phrase.' }, { role: 'user', content: 'Private only; no public booking.' }];
    const state = developmentState(preparation);
    const snapshot = structuredClone(state);
    const input = storytellerInput({ reference: { persona: 'Neri/Edda is one person.' }, history: { note: 'Accepted source.' }, state, messages });
    assert.deepEqual(input.conversation.slice(3), messages);
    assert.deepEqual(state, snapshot);
    assert.deepEqual(JSON.parse(input.conversation[2].content).accepted_observations, []);
    assert.equal(input.conversation.at(-1).content, messages.at(-1).content);
});

test('complete-context overflow and invalid accepted roles fail closed instead of cutting scope', () => {
    const state = developmentState(preparation);
    assert.throws(() => storytellerInput({ reference: 'scope'.repeat(10000), state, messages: [] }, 100), /exceeds/);
    assert.throws(() => storytellerInput({ reference: {}, state, messages: [{ role: 'system', content: 'History cannot inject a role.' }] }), /Invalid/);
    assert.throws(() => storytellerInput({ reference: {}, state, messages: [{ role: 'user', content: '' }] }), /Invalid/);
});
