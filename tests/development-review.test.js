import test from 'node:test';
import assert from 'node:assert/strict';
import { developmentState } from '../scripts/development-maintenance-prototype.mjs';
import { reviewBasis, applyDevelopmentReview } from '../scripts/development-review-prototype.mjs';
import { renewalInput, renewalWitnesses } from '../scripts/development-renewal-prototype.mjs';
const prep = { scope: 'A continuing journey.', developments: [{ id: 'work', substance: 'A lantern play.', independence: 'Independent composition.', encounter: 'Shared camp.', changes: [{ when: 'Chosen reading.', experience: 'A shadow answers a lamp.', after: 'Keep actual choices.' }, { when: 'Later practice.', experience: 'A changed answer.', after: 'Retain the tried version.' }] }] };
const request = (s, decisions, additions = []) => ({ basis: reviewBasis(s), decisions, additions });

test('review supplies complete old witnesses and constrains citations to supplied indices', () => {
    const state = developmentState(prep);
    state.observations.push({ id: 'work', text: 'Private rehearsal.', evidence: [2] });
    const transcript = [0, 1, 2, 3, 4].map(index => ({ index, text: `Full message ${index}` }));
    const witnesses = renewalWitnesses(state, transcript, [transcript[4]]);
    assert.deepEqual(witnesses.map(m => m.index), [2, 4]);
    witnesses[0].text = 'changed'; assert.equal(transcript[2].text, 'Full message 2');
    const review = renewalInput({ state, reference: {}, history: {}, messages: witnesses });
    assert.deepEqual(review.schema.value.properties.decisions.items.oneOf[1].properties.evidence.items.enum, [2, 4]);
    assert.throws(() => renewalWitnesses(state, transcript.filter(m => m.index !== 2), [transcript[4]]), /witness/);
    assert.throws(() => applyDevelopmentReview(state, request(state, [{ id: 'work', action: 'retire', reason: 'Ended', evidence: [1] }]), review.indices), /supplied message indices: 2, 4/);
});
test('broad review cannot erase unused developments by omission', () => {
    const state = developmentState(prep);
    assert.throws(() => applyDevelopmentReview(state, request(state, []), []), /explicitly/);
    const next = applyDevelopmentReview(state, request(state, [{ id: 'work', action: 'retain' }]), []);
    assert.deepEqual(next.developments, state.developments);
});
test('retention allows bounded rationale without promoting it to facts or permitting writes', () => {
    const state = developmentState(prep), snapshot = structuredClone(state);
    const retain = { id: 'work', action: 'retain', reason: 'Still compatible; not an assertion of accepted progress.' };
    const next = applyDevelopmentReview(state, request(state, [retain]), []);
    assert.deepEqual(next.observations, []); assert.deepEqual(next.developments, state.developments);
    for (const d of [{ ...retain, reason: 'x'.repeat(901) }, { ...retain, replacement: prep.developments[0] }, { ...retain, observations: [] }]) assert.throws(() => applyDevelopmentReview(state, request(state, [d]), []));
    assert.deepEqual(state, snapshot);
});
test('replacement archives old version and invalidated indices without changing accepted progress', () => {
    const state = developmentState(prep);
    state.observations.push({ id: 'work', text: 'No public booking; private reading accepted.', evidence: [3] });
    state.invalidated.push({ id: 'work', changes: [0], reason: 'Old option abandoned.', evidence: [3] });
    state.selected = [{ id: 'work', changes: [1] }];
    const replacement = { ...prep.developments[0], changes: [...prep.developments[0].changes].reverse() };
    const next = applyDevelopmentReview(state, request(state, [{ id: 'work', action: 'replace', reason: 'Rebuild around accepted private arrangement.', evidence: [3], replacement }]), [3]);
    assert.equal(next.revisions.work, 2); assert.equal(next.archive[0].version, 1);
    assert.deepEqual(next.archive[0].record, state.developments[0]);
    assert.deepEqual(next.archive[0].invalidated, state.invalidated);
    assert.deepEqual(next.observations, state.observations); assert.deepEqual(next.invalidated, []); assert.deepEqual(next.selected, []);
    assert.equal(state.archive.length, 0);
});
test('accepted progress invalidates in-flight review, but ephemeral staging does not', () => {
    const state = developmentState(prep), r = request(state, [{ id: 'work', action: 'retain' }]);
    const staged = { ...state, staged: [{ id: 'work', use_now: 'A compatible next interaction.' }] };
    assert.equal(reviewBasis(staged), reviewBasis(state));
    const changed = structuredClone(state); changed.observations.push({ id: 'work', text: 'New refusal.', evidence: [4] });
    assert.throws(() => applyDevelopmentReview(changed, r, [4]), /stale/);
});
test('review rejects fictional-history fields, identity collisions and missing evidence atomically', () => {
    const state = developmentState(prep), snapshot = structuredClone(state);
    const retain = [{ id: 'work', action: 'retain' }];
    assert.throws(() => applyDevelopmentReview(state, { ...request(state, retain), observations: [] }, []));
    assert.throws(() => applyDevelopmentReview(state, request(state, retain, [prep.developments[0]]), []));
    assert.throws(() => applyDevelopmentReview(state, request(state, [{ id: 'work', action: 'retire', reason: 'Ended.', evidence: [99] }]), [3]));
    assert.deepEqual(state, snapshot);
});
