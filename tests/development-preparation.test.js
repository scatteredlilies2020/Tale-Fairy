import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePreparation, preparationInput, PREPARATION_SCHEMA, PREPARATION_CONTEXT_LIMIT } from '../scripts/development-preparation-prototype.mjs';
import { developmentState, maintainDevelopments, maintenanceInput, writerPreparation, maintenanceSchema } from '../scripts/development-maintenance-prototype.mjs';
const proposal = () => ({ scope: 'Open-ended journeys, not a delivery investigation.', developments: [{ id: 'music', substance: 'A traveling ensemble makes a round with audible space for each musician.', independence: 'The work exists independently of the costume delivery.', encounter: 'When speaking to these musicians or attending a chosen practice.', changes: [{ when: 'If a private reading occurs.', experience: 'A split rhythm lets the drum answer the melody.', after: 'A revised score records what the players chose to retain.' }, { when: 'If the ensemble later returns to it.', experience: 'A second arrangement uses the retained answer as its opening.', after: 'A different version exists without requiring a public booking.' }] }] });
const response = o => ({ observations: [], invalidate: [], retire: [], select: [], review_needed: '', ...o });

test('revised background bounds preserve whole text and remain exact schema limits', () => {
    const p = proposal();
    for (const key of ['independence', 'encounter']) {
        p.developments[0][key] = 'x'.repeat(PREPARATION_CONTEXT_LIMIT);
        assert.equal(PREPARATION_SCHEMA.value.properties.developments.items.properties[key].maxLength, PREPARATION_CONTEXT_LIMIT);
    }
    assert.deepEqual(validatePreparation(p), p);
    for (const key of ['independence', 'encounter']) {
        const invalid = structuredClone(p); invalid.developments[0][key] += 'x';
        assert.throws(() => validatePreparation(invalid));
    }
});

test('preparation requires concrete nonempty middle fields, rejects extras, and permits closed scope', () => {
    assert.deepEqual(validatePreparation(proposal()), proposal());
    for (const modify of [p => p.developments[0].changes.pop(), p => p.developments[0].changes[0].after = '', p => p.writer = [], p => p.developments.push(p.developments[0])]) {
        const p = proposal(); modify(p); assert.throws(() => validatePreparation(p));
    }
    assert.deepEqual(validatePreparation({ scope: 'This meal only.', developments: [] }).developments, []);
});

test('preparation removes generated scene framing, not source history or existing stored designs', () => {
    const historical = { legacy_framing: { approach: 'Make every future about delivery.' }, witnesses: [{ index: 3, content: 'Accepted scope.' }] };
    const input = preparationInput({ reference: { description: 'Scope ending '.repeat(30) }, messages: [], historical, existing: proposal().developments });
    const p = JSON.parse(input.prompt);
    assert.equal(p.legacy_framing, undefined); assert.deepEqual(p.witnesses, historical.witnesses); assert.deepEqual(p.existing_preparation, proposal().developments);
    assert.throws(() => preparationInput({ reference: 'a'.repeat(100000), messages: [] }, 1000), /exceeds/);
});

test('twelve routine updates preserve complete proposals and do not advance private state', () => {
    let state = developmentState(proposal()); const before = structuredClone(state);
    for (let i = 0; i < 12; i++) state = maintainDevelopments(state, response(), [i]);
    assert.deepEqual(state, before);
    assert.deepEqual(JSON.parse(maintenanceInput({ state, reference: {}, messages: [] }).prompt).notebook.developments, proposal().developments);
});

test('accepted revisions append while local closure archives only the local episode', () => {
    const state = developmentState(proposal(), [{ id: 'delivery', premise: 'Costumes missing.' }]);
    const next = maintainDevelopments(state, response({ observations: [{ id: 'music', text: 'The rhythm was revised; no public booking.', evidence: [4] }], retire: [{ id: 'delivery', reason: 'Misdelivery resolved and fee settled.', evidence: [4] }] }), [4]);
    assert.deepEqual(next.developments, state.developments); assert.equal(next.local.length, 0); assert.equal(next.archive.length, 1); assert.equal(next.observations.length, 1); assert.equal(state.local.length, 1);
});

test('invalidated branches cannot be selected while unrelated branches stay available', () => {
    let state = developmentState(proposal());
    state = maintainDevelopments(state, response({ invalidate: [{ id: 'music', changes: [0], reason: 'This particular version explicitly abandoned.', evidence: [2] }] }), [2]);
    assert.throws(() => maintainDevelopments(state, response({ select: [{ id: 'music', changes: [0], reason: 'Try anyway.', evidence: [2] }] }), [2]));
    const next = maintainDevelopments(state, response({ select: [{ id: 'music', changes: [1], reason: 'The retained revision is being discussed.', evidence: [3] }] }), [3]);
    assert.deepEqual(writerPreparation(next)[0].conditional_options, [proposal().developments[0].changes[1]]);
});

test('routine cannot rewrite scope or designs, cite missing evidence or select retired IDs', () => {
    const state = developmentState(proposal()); const original = structuredClone(state);
    for (const r of [response({ scope: 'All about dinner.' }), response({ developments: [] }), response({ observations: [{ id: 'music', text: 'Invented.', evidence: [99] }] }), response({ select: [{ id: 'music', changes: [99], reason: 'No.', evidence: [0] }] }), response({ retire: [{ id: 'music', reason: 'Ended.', evidence: [0] }], select: [{ id: 'music', changes: [], reason: 'No.', evidence: [0] }] })]) assert.throws(() => maintainDevelopments(state, r, [0]));
    assert.deepEqual(state, original);
});

test('writer sees selected private material, not whole future, rationale or fabricated knowledge fields', () => {
    const state = maintainDevelopments(developmentState(proposal()), response({ select: [{ id: 'music', changes: [], reason: 'This rationale is not story history.', evidence: [0] }] }), [0]);
    const packet = writerPreparation(state);
    assert.match(packet[0].provenance, /NOT ACCEPTED/); assert.equal(packet[0].reason, undefined); assert.deepEqual(packet[0].conditional_options, []); assert.deepEqual(packet[0].accepted_observations, []);
    assert.throws(() => maintenanceInput({ state, reference: 'huge'.repeat(50000), messages: [] }, 1000), /exceeds/);
});

test('request schema enumerates existing IDs instead of inviting invented observation IDs', () => {
    const schema = maintenanceSchema(developmentState(proposal(), [{ id: 'delivery' }]));
    assert.deepEqual(schema.value.properties.observations.items.properties.id.enum, ['music']);
    assert.deepEqual(schema.value.properties.retire.items.properties.id.enum, ['music', 'delivery']);
    assert.equal(maintenanceSchema(developmentState({ scope: 'Closed meal.', developments: [] })).value.properties.select.maxItems, 0);
});
