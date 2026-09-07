import assert from 'node:assert/strict';
import test from 'node:test';
import { completionText } from '../extension/completion-response.js';

test('reads ordinary chat completion text and content blocks', () => {
    assert.equal(completionText({ choices: [{ message: { content: 'answer' } }] }), 'answer');
    assert.equal(completionText({ choices: [{ message: { content: [{ type: 'text', text: 'one' }, { type: 'output_text', text: { value: ' two' } }] } }] }), 'one two');
});

test('falls through empty content to another final-output field', () => {
    assert.equal(completionText({ choices: [{ message: { content: '' }, text: 'fallback' }] }), 'fallback');
});

test('reads structured tool arguments and Responses API output', () => {
    const argumentsJson = '{"contract_version":2}';
    assert.equal(completionText({ choices: [{ message: { content: '', tool_calls: [{ function: { arguments: argumentsJson } }] } }] }), argumentsJson);
    assert.equal(completionText({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'response' }] }] }), 'response');
});

test('reads a direct causal-context v8 structured result', () => {
    const result = { contract_version: 8, current: {}, context: {}, response_audit: {} };
    assert.equal(completionText(result), JSON.stringify(result));
});

test('retains support for direct horizon-aware v7 structured results in flight', () => {
    const result = { contract_version: 7, current: {}, beat: {}, response_audit: {}, horizon: {} };
    assert.equal(completionText(result), JSON.stringify(result));
});

test('reads a direct compact v10 causal result', () => {
    const result = { contract_version: 10, current: {}, context: {}, thread_updates: [], hidden_motives: {}, actor_updates: [] };
    assert.equal(completionText(result), JSON.stringify(result));
});

test('unwraps common proxy containers', () => {
    assert.equal(completionText({ data: { response: { choices: [{ message: { content: 'nested' } }] } } }), 'nested');
});

test('never treats hidden reasoning as the final answer', () => {
    assert.equal(completionText({ choices: [{ message: { content: '', reasoning_content: '{"private":true}' } }], output: [{ type: 'reasoning', text: 'private' }] }), '');
});
