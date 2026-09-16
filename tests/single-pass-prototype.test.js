import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrototypePrompt, mergePrototype, SINGLE_PASS_SYSTEM, prototypeSchema } from '../scripts/single-pass-planner-prototype.mjs';
import { touringCase, closedCase } from '../scripts/single-pass-planner-cases.mjs';
import { defaultState } from '../extension/state.js';
import { defaultPreparedWorld, normalizePreparedWorld } from '../extension/prepared-world.js';
import { normalizeWorldPlan, WORLD_PLANNER_SCHEMA } from '../extension/world-planner.js';
import { plannerBudgetEnvelope, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { estimateTokenCount } from '../extension/token-budget.js';

const wire = prepared => normalizeWorldPlan({ contract_version: 14, prepared: { updates: [], focus: [], writer: [], ...prepared } });
const stateFor = fixture => Object.assign(defaultState(), { plannerContract: 14, preparedWorld: structuredClone(fixture.notebook) });

test('candidate preserves complete source fields within the routine total envelope', async () => {
    const fixture = touringCase(), state = stateFor(fixture);
    fixture.bootstrap.description = 'Historical setting and tone. '.repeat(14) + 'The actual scope is travel across places and seasons, including companionship and artistic work.';
    state.preparedWorld.approach = 'Local delivery investigation. '.repeat(55);
    state.preparedWorld.summary = 'Several delivery witnesses remain locally relevant. '.repeat(30);
    const before = structuredClone(state), referenceBefore = structuredClone(fixture.bootstrap);
    const prompt = await buildPrototypePrompt(fixture.messages, state, '', fixture.bootstrap,
        { incremental: true, maxPromptTokens: 6000, recentContextTokens: 6000 });
    assert.deepEqual(JSON.parse(prompt).rp_reference, referenceBefore);
    const envelope = plannerBudgetEnvelope(SINGLE_PASS_SYSTEM, prototypeSchema(), PLANNER_OUTPUT_MODE.PROMPT_ONLY);
    assert.ok(estimateTokenCount(`${envelope}\n${prompt}`) <= 6000);
    assert.deepEqual(state, before);
    assert.deepEqual(fixture.bootstrap, referenceBefore);
});

test('oversized source fails closed rather than silently deleting its scope', async () => {
    const fixture = touringCase();
    await assert.rejects(buildPrototypePrompt(fixture.messages, stateFor(fixture), '', { description: 'Full source. '.repeat(6000) },
        { incremental: true, maxPromptTokens: 6000 }), /Complete source reference cannot fit/);
});

test('routine scope write is ignored without mutating the model output or previous state', () => {
    const prior = touringCase().notebook;
    const value = wire({ approach: 'Everything is about tonight\'s missing costumes.' });
    const before = structuredClone(prior), valueBefore = structuredClone(value);
    const result = mergePrototype(prior, value, { broad: false });
    assert.equal(result.notebook.approach, prior.approach);
    assert.equal(result.hostActions.length, 1);
    assert.deepEqual(prior, before);
    assert.deepEqual(value, valueBefore);
});

test('broad review can correct a locally captured scope', () => {
    const result = mergePrototype(touringCase().notebook, wire({ approach: 'An open-ended touring ensemble across encounters and seasons.' }), { broad: true });
    assert.equal(result.notebook.approach, 'An open-ended touring ensemble across encounters and seasons.');
    assert.deepEqual(result.hostActions, []);
});

test('twelve routine omissions preserve complete preparation without fictional advancement', () => {
    let board = normalizePreparedWorld(touringCase().notebook);
    const original = structuredClone(board.items);
    for (let i = 0; i < 12; i++) board = mergePrototype(board, wire({}), { broad: false }).notebook;
    assert.deepEqual(board.items, original);
    assert.equal(board.reviewCursor, 12);
    assert.deepEqual(board.focus, []);
    assert.deepEqual(board.writer, []);
});

test('persistence does not prevent accepted progress or resolution', () => {
    const prior = touringCase().notebook;
    const update = { ...prior.items[0], premise: 'The costumes were delivered to the wrong hall.', middle: 'The keeper and carrier can arrange collection; no criminal conspiracy is established.' };
    const result = mergePrototype(prior, wire({ updates: [update], status_changes: [{ id: 'carrier_questions', status: 'resolved' }], focus: ['warehouse_search'], writer: [{ id: 'warehouse_search', material: 'The carrier can bring the intact costumes from the other hall. The keeper has identified the address mistake.' }] }), { broad: false });
    assert.equal(result.notebook.items.find(i => i.id === update.id).middle, update.middle);
    assert.ok(!result.notebook.items.some(i => i.id === 'carrier_questions'));
    assert.equal(result.notebook.writer.length, 1);
    assert.equal(result.notebook.items.find(i => i.id === 'theatre_deadline').middle, prior.items[2].middle);
});

test('current writer selection remains validated in the same response', () => {
    assert.throws(() => mergePrototype(defaultPreparedWorld(), wire({ focus: ['missing'], writer: [{ id: 'missing', material: 'Not available.' }] }), { broad: true }));
});

test('prototype schema is a private clone; fixtures cover both open and closed scope', () => {
    const before = structuredClone(WORLD_PLANNER_SCHEMA);
    const schema = prototypeSchema(); schema.description = 'changed';
    assert.deepEqual(WORLD_PLANNER_SCHEMA, before);
    assert.equal(touringCase().stages.filter(s => !s.broad).length, 5);
    assert.match(closedCase().bootstrap.description, /deliberately closed/);
});
