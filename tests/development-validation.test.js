import test from 'node:test';
import assert from 'node:assert/strict';
import { contractIssues, validatedStaging } from '../scripts/development-validation-prototype.mjs';

const schema = { value: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string', minLength: 1, maxLength: 10 } } } };
test('contract feedback names exact path and character limit without trimming data', () => {
    const value = { text: 'x'.repeat(11) };
    assert.match(contractIssues(value, schema.value)[0], /\$\.text: 11 characters exceeds maximum 10/);
    assert.equal(value.text.length, 11);
});

test('exclusive review alternatives expose nested replacement errors', () => {
    const variant = { oneOf: [
        { type: 'object', required: ['action'], properties: { action: { const: 'retain' } }, additionalProperties: false },
        { type: 'object', required: ['action', 'text'], properties: { action: { const: 'replace' }, text: schema.value.properties.text }, additionalProperties: false },
    ] };
    assert.deepEqual(contractIssues({ action: 'retain' }, variant), []);
    assert.match(contractIssues({ action: 'replace', text: 'x'.repeat(11) }, variant).join(';'), /11 characters/);
    assert.match(contractIssues('retain', { const: 'replace' }).join(';'), /expected/);
});
test('staging repair retains rejected response and original request, accepts one replacement', async () => {
    const conversation = [{ role: 'user', content: 'Full source' }], requests = [];
    const result = await validatedStaging({ conversation, schema, generate: async request => {
        requests.push(request); return requests.length === 1 ? JSON.stringify({ text: 'x'.repeat(11) }) : '{"text":"valid"}';
    }, validate: value => structuredClone(value) });
    assert.deepEqual(result.attempts.map(a => a.valid), [false, true]);
    assert.equal(result.value.text, 'valid');
    assert.equal(requests[1][1].role, 'assistant');
    assert.match(requests[1][2].content, /complete replacement/);
    assert.equal(conversation.length, 1);
});
test('failed repair is bounded, never validated or returned as accepted state', async () => {
    let calls = 0, validations = 0;
    const result = await validatedStaging({ conversation: [], schema, generate: async () => { calls++; return '{}'; }, validate: () => { validations++; } });
    assert.equal(calls, 2); assert.equal(validations, 0); assert.equal(result.value, null);
    assert.deepEqual(result.attempts.map(a => a.valid), [false, false]);
});
test('domain validation failures also get one repair, no successful-output rerolls', async () => {
    let calls = 0;
    const result = await validatedStaging({ conversation: [], schema, generate: async () => { calls++; return '{"text":"valid"}'; }, validate: value => {
        if (calls === 1) throw Error('Invalid evidence index'); return value;
    } });
    assert.equal(calls, 2); assert.deepEqual(result.attempts[0].errors, ['Invalid evidence index']);
    assert.equal(result.value.text, 'valid');
});
