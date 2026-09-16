import test from 'node:test';
import assert from 'node:assert/strict';
import { durableState, mergeDurable, durablePrompt } from '../scripts/durable-planner-prototype.mjs';

const response = extras => ({ ongoing: [], episodes: [], retire: [], writer: [], ...extras });
const project = { id: 'project', design: 'A specific independent craft practice.', development: 'An experiment, revision and later shared use; no required player decision.', accepted: [] };
const start = () => mergeDurable(durableState(), response({ ongoing: [project] }), [0, 1]);

test('durable progress patches preserve the actual long-term middle and input immutability', () => {
    const before = start(), copy = structuredClone(before);
    const after = mergeDurable(before, response({ ongoing: [{ id: 'project', accepted: [{ text: 'The first experiment was revised, not publicly booked.', evidence: [1] }] }] }), [0, 1]);
    assert.deepEqual(before, copy);
    assert.equal(after.ongoing[0].design, project.design);
    assert.equal(after.ongoing[0].development, project.development);
    assert.equal(after.ongoing[0].accepted.length, 1);
});

test('twelve local updates do not replace or hide continuing development in the input', () => {
    let state = start();
    for (let i = 0; i < 12; i++) state = mergeDurable(state, response({ episodes: [{ id: 'meal', design: `Meal condition ${i}`, development: 'Ordinary cooking, no wider obligation.' }] }), [i]);
    const built = durablePrompt({ state, reference: { scope: 'Travel across regions and seasons.' }, messages: [{ mes: 'We are still at dinner.', is_user: false }], broad: false });
    assert.deepEqual(JSON.parse(built.prompt).notebook.ongoing, [project]);
    assert.equal(state.ongoing[0].accepted.length, 0);
});

test('invented designs cannot become accepted changes without supplied evidence indices', () => {
    assert.throws(() => mergeDurable(start(), response({ ongoing: [{ id: 'project', accepted: [{ text: 'A public show occurred.', evidence: [99] }] }] }), [0, 1]), /evidence/);
    assert.throws(() => mergeDurable(start(), response({ ongoing: [{ id: 'project', accepted: [{ text: 'A public show occurred.', evidence: [] }] }] }), [0, 1]), /evidence/);
});

test('legacy supersession archives old records while selecting only the coherent replacement', () => {
    const state = durableState([{ id: 'warehouse', premise: 'Misdelivery.' }, { id: 'carrier', premise: 'Same misdelivery.' }]);
    const next = mergeDurable(state, response({ episodes: [{ id: 'delivery', design: 'The common delivery problem.', development: 'Compare addresses; no theft established.' }],
        retire: [{ id: 'warehouse', replacement_id: 'delivery', reason: 'Same episode.' }, { id: 'carrier', replacement_id: 'delivery', reason: 'Same episode.' }],
        writer: [{ id: 'delivery', material: 'Two addresses can be compared.', knowledge: 'Intent unknown.' }],
    }), [0]);
    assert.equal(next.legacy.length, 0); assert.equal(next.archive.length, 2); assert.equal(state.legacy.length, 2);
    assert.deepEqual(next.archive[0].record, state.legacy[0]);
});

test('accepted episode closure archives it without removing independent preparation', () => {
    const state = mergeDurable(start(), response({ episodes: [{ id: 'delivery', design: 'A misdelivery.', development: 'Address comparison.' }] }), [0]);
    const after = mergeDurable(state, response({ retire: [{ id: 'delivery', reason: 'Delivery explicitly resolved.', evidence: [1] }] }), [0, 1]);
    assert.equal(after.episodes.length, 0); assert.deepEqual(after.ongoing, state.ongoing); assert.equal(after.archive.length, 1);
});

test('unknown, conflicting and dangling record references fail atomically', () => {
    const state = start(), original = structuredClone(state);
    for (const r of [
        response({ episodes: [project] }),
        response({ ongoing: [{ id: 'new', design: 'Incomplete.' }] }),
        response({ retire: [{ id: 'project', reason: 'Irrelevant.' }] }),
        response({ retire: [{ id: 'project', reason: 'New one.', replacement_id: 'missing' }] }),
        response({ writer: [{ id: 'missing', material: 'Missing.', knowledge: '' }] }),
        response({ retire: [{ id: 'project', reason: 'Resolved.', evidence: [1] }], writer: [{ id: 'project', material: 'Stale.', knowledge: '' }] }),
    ]) assert.throws(() => mergeDurable(state, r, [0, 1]));
    assert.deepEqual(state, original);
});

test('complete references survive; oversized durable inputs fail closed', () => {
    const reference = { description: 'Opening setting. '.repeat(35) + 'Scope crosses regions and seasons.', persona: 'Neri and Edda are one person.' };
    const built = durablePrompt({ state: start(), reference, messages: [], broad: false });
    assert.deepEqual(JSON.parse(built.prompt).source_reference, reference);
    assert.throws(() => durablePrompt({ state: start(), reference: { description: 'Too large. '.repeat(6000) }, messages: [], broad: false }, 4000), /exceeds/);
});

test('citations may reference supplied historical excerpts but not unsupplied indices in their range', () => {
    const built = durablePrompt({ state: start(), reference: {}, messages: [{ index: 30, content: 'Latest.' }], broad: true,
        historical: { story_evidence: { timeline: [{ range: [0, 20], excerpts: [{ index: 4, content: 'Actual excerpt.' }] }] } } });
    assert.deepEqual(built.indices.sort((a,b) => a-b), [4, 30]);
    const next = mergeDurable(start(), response({ ongoing: [{ id: 'project', accepted: [{ text: 'An earlier accepted change.', evidence: [4] }] }] }), built.indices);
    assert.equal(next.ongoing[0].accepted.length, 1);
});

test('explicit scope changes can replace scope without discarding ongoing material', () => {
    const state = start(); state.scope = 'Travel forever.';
    const after = mergeDurable(state, response({ scope: 'User now wants to settle here; travel remains possible, not compulsory.' }), [0]);
    assert.match(after.scope, /settle/); assert.deepEqual(after.ongoing, state.ongoing);
});
