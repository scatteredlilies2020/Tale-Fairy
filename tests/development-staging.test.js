import test from 'node:test';
import assert from 'node:assert/strict';
import { developmentState } from '../scripts/development-maintenance-prototype.mjs';
import { stagingInput, stagingSchema, stageDevelopments, stagedWriterMaterial } from '../scripts/development-staging-prototype.mjs';
const prep = { scope: 'A journey.', developments: [{ id: 'work', substance: 'A lantern play.', encounter: 'Shared camp.', independence: 'Independent composition.', changes: [{ when: 'Chosen reading.', experience: 'A shadow answers a lamp.', after: 'Retain the attempted version.' }, { when: 'Later practice.', experience: 'A changed answer.', after: 'Keep actual choices.' }] }] };
const response = extra => ({ observations: [], invalidate: [], retire: [], stage: [], review_needed: '', ...extra });
const stage = () => ({ id: 'work', use_now: 'Jo can introduce a lamp-and-shadow exchange now.', do_not_assume: 'No chosen participation, prior reading or public booking.', evidence: [3] });
test('staging is useful new material without becoming accepted history or altering the future repertoire', () => {
    const state = developmentState(prep), next = stageDevelopments(state, response({ stage: [stage()] }), [3]);
    assert.deepEqual(next.developments, state.developments); assert.deepEqual(next.observations, []);
    assert.match(stagedWriterMaterial(next)[0].provenance, /NOT ACCEPTED/);
    assert.equal(stagedWriterMaterial(next)[0].use_now, stage().use_now);
    assert.equal(stagedWriterMaterial(next)[0].evidence, undefined);
    assert.equal(state.staged, undefined);
});
test('each staging response replaces disposable directions without erasing durable content', () => {
    const one = stageDevelopments(developmentState(prep), response({ stage: [stage()] }), [3]);
    const two = stageDevelopments(one, response(), [4]);
    assert.deepEqual(stagedWriterMaterial(two), []); assert.deepEqual(two.developments, one.developments);
});
test('staging rejects stale IDs, fake evidence, unauthorized history fields and oversize material atomically', () => {
    const state = developmentState(prep), snapshot = structuredClone(state);
    for (const item of [{ ...stage(), id: 'new-id' }, { ...stage(), evidence: [999] }, { ...stage(), accepted: true }, { ...stage(), use_now: 'x'.repeat(1401) }]) assert.throws(() => stageDevelopments(state, response({ stage: [item] }), [3]));
    assert.throws(() => stageDevelopments(state, response({ retire: [{ id: 'work', reason: 'Ended.', evidence: [3] }], stage: [stage()] }), [3]));
    assert.deepEqual(state, snapshot);
});
test('staging input retains complete source and accounts for its exact enum schema', () => {
    const state = developmentState(prep), schema = stagingSchema(state);
    assert.equal(schema.value.properties.select, undefined); assert.deepEqual(schema.value.properties.stage.items.properties.id.enum, ['work']);
    const built = stagingInput({ state, reference: { description: 'Complete scope.' }, messages: [{ index: 3, role: 'user', content: 'Show me the work.' }] });
    assert.deepEqual(built.schema, schema); assert.deepEqual(built.indices, [3]);
    assert.throws(() => stagingInput({ state, reference: 'x'.repeat(100000), messages: [] }, 100), /exceeds/);
});
