import test from 'node:test';
import assert from 'node:assert/strict';
import { memorySchema, updateMemory } from '../scripts/development-memory-prototype.mjs';
const state = { developments: [{ id: 'music', changes: [] }], local: [], observations: [], invalidated: [], archive: [], selected: [] };
test('memory-only contract excludes unused selection and preserves proposals atomically', () => {
    const schema = memorySchema(state), before = structuredClone(state);
    assert.ok(!schema.value.required.includes('select'));
    assert.ok(!Object.hasOwn(schema.value.properties, 'select'));
    const response = { observations: [{ id: 'music', text: 'Jo declined a public booking.', evidence: [3] }], invalidate: [], retire: [], review_needed: 'The design assumes a public booking.' };
    const next = updateMemory(state, response, [3]);
    assert.deepEqual(next.developments, state.developments);
    assert.equal(next.observations.length, 1);
    assert.equal(next.reviewNeeded, response.review_needed);
    assert.deepEqual(state, before);
    assert.throws(() => updateMemory(state, { ...response, select: [] }, [3]));
    assert.throws(() => updateMemory(state, response, [2]));
    assert.deepEqual(state, before);
});
