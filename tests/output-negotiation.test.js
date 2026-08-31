import assert from 'node:assert/strict';
import test from 'node:test';
import { customOutputPayload, negotiateOutputModes, plannerMessages, plannerPrompt, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';

const schema = { value: { type: 'object', required: ['contract_version'] } };

test('strict schema mode keeps the schema in native request metadata only', () => {
    assert.deepEqual(plannerMessages('system', 'prompt', schema, PLANNER_OUTPUT_MODE.JSON_SCHEMA), [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'prompt' },
    ]);
    assert.equal(plannerPrompt('prompt', schema, PLANNER_OUTPUT_MODE.JSON_SCHEMA), 'prompt');
});

test('compatibility modes give the model the complete schema in its prompt', () => {
    const messages = plannerMessages('system', 'prompt', schema, PLANNER_OUTPUT_MODE.JSON_OBJECT);
    assert.equal(messages.length, 3);
    assert.match(messages[2].content, /JSON schema for the response/);
    assert.match(messages[2].content, /contract_version/);
    assert.match(plannerPrompt('prompt', schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY), /contract_version/);
});

test('JSON-object mode preserves reasoning controls while changing only response format', () => {
    const payload = customOutputPayload({
        include_reasoning: true,
        custom_include_body: JSON.stringify({ reasoning_effort: 'low' }),
    }, PLANNER_OUTPUT_MODE.JSON_OBJECT);
    assert.equal(payload.include_reasoning, true);
    assert.deepEqual(JSON.parse(payload.custom_include_body), {
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
    });
});

test('plain and strict modes do not inject provider-specific response controls', () => {
    const payload = { custom_include_body: JSON.stringify({ thinking: { type: 'enabled' } }) };
    assert.deepEqual(customOutputPayload(payload, PLANNER_OUTPUT_MODE.JSON_SCHEMA), payload);
    assert.deepEqual(customOutputPayload(payload, PLANNER_OUTPUT_MODE.PROMPT_ONLY), payload);
});

test('negotiation falls through invalid output and caches the working capability', async () => {
    const cache = new Map();
    const calls = [];
    const fallback = new Error('wrong shape');
    const options = {
        modes: [PLANNER_OUTPUT_MODE.JSON_SCHEMA, PLANNER_OUTPUT_MODE.JSON_OBJECT, PLANNER_OUTPUT_MODE.PROMPT_ONLY],
        canFallback: error => error === fallback,
        cache,
        cacheKey: 'provider:model',
    };
    const result = await negotiateOutputModes({
        ...options,
        run: async mode => {
            calls.push(mode);
            if (mode === PLANNER_OUTPUT_MODE.JSON_SCHEMA) throw fallback;
            return 'valid';
        },
    });
    assert.equal(result, 'valid');
    assert.deepEqual(calls, [PLANNER_OUTPUT_MODE.JSON_SCHEMA, PLANNER_OUTPUT_MODE.JSON_OBJECT]);
    assert.equal(cache.get('provider:model'), PLANNER_OUTPUT_MODE.JSON_OBJECT);

    calls.length = 0;
    await negotiateOutputModes({ ...options, run: async mode => { calls.push(mode); return 'cached'; } });
    assert.deepEqual(calls, [PLANNER_OUTPUT_MODE.JSON_OBJECT]);
});

test('negotiation never masks non-compatible failures', async () => {
    const permanent = new Error('authentication failed');
    await assert.rejects(negotiateOutputModes({
        run: async () => { throw permanent; },
        modes: [PLANNER_OUTPUT_MODE.JSON_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY],
        canFallback: () => false,
    }), permanent);
});
