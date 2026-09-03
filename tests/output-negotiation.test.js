import assert from 'node:assert/strict';
import test from 'node:test';
import { customOutputPayload, detachedPlannerFailure, isUnsupportedStructuredOutputError, negotiateOutputModes, plannerMessages, plannerOutputModes, plannerPrompt, plannerValidationRepairInstruction, PLANNER_OUTPUT_MODE, stripStructuredOutputControls } from '../extension/output-negotiation.js';

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

test('validation repair requests a complete replacement and preserves exact validator feedback', () => {
    const error = Object.assign(new Error('invalid'), {
        validationErrors: ['beat.alternatives[0].when leaked Vekk', 'beat.required_effect controlled the player'],
    });
    const repair = plannerValidationRepairInstruction(error);
    assert.match(repair, /complete replacement JSON object/i);
    assert.match(repair, /Vekk/);
    assert.match(repair, /controlled the player/);
    assert.equal(plannerMessages('system', 'prompt', schema, PLANNER_OUTPUT_MODE.JSON_SCHEMA, repair).at(-1).content, repair);
    assert.match(plannerPrompt('prompt', schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY, repair), /complete replacement JSON object/i);
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

test('prompt-only mode removes inherited structured-output controls at every request layer', () => {
    const payload = {
        response_format: { type: 'json_object' },
        json_schema: schema,
        jsonSchema: schema,
        include_reasoning: true,
        custom_include_body: JSON.stringify({
            reasoning_effort: 'low',
            response_format: { type: 'json_object' },
            json_schema: schema,
        }),
    };
    const result = stripStructuredOutputControls(payload);
    assert.equal(Object.hasOwn(result, 'response_format'), false);
    assert.equal(Object.hasOwn(result, 'json_schema'), false);
    assert.equal(Object.hasOwn(result, 'jsonSchema'), false);
    assert.equal(result.include_reasoning, true);
    assert.deepEqual(JSON.parse(result.custom_include_body), { reasoning_effort: 'low' });
});

test('custom prompt-only payload cannot retain a response format from reasoning metadata', () => {
    const result = customOutputPayload({
        custom_include_body: JSON.stringify({ response_format: { type: 'json_object' }, thinking: { type: 'enabled' } }),
    }, PLANNER_OUTPUT_MODE.PROMPT_ONLY);
    assert.deepEqual(JSON.parse(result.custom_include_body), { thinking: { type: 'enabled' } });
});

test('DeepSeek proxy response-format unavailability triggers prompt-only fallback', async () => {
    const proxyError = new Error('Chat completion request error: Bad Request {"error":{"message":"This response_format type is unavailable now","type":"invalid_request_error"}}');
    assert.equal(isUnsupportedStructuredOutputError(proxyError), true);

    const calls = [];
    const result = await negotiateOutputModes({
        run: async mode => {
            calls.push(mode);
            if (mode !== PLANNER_OUTPUT_MODE.PROMPT_ONLY) throw proxyError;
            return 'valid prompt JSON';
        },
        modes: [PLANNER_OUTPUT_MODE.JSON_SCHEMA, PLANNER_OUTPUT_MODE.JSON_OBJECT, PLANNER_OUTPUT_MODE.PROMPT_ONLY],
        canFallback: isUnsupportedStructuredOutputError,
    });

    assert.equal(result, 'valid prompt JSON');
    assert.deepEqual(calls, [PLANNER_OUTPUT_MODE.JSON_SCHEMA, PLANNER_OUTPUT_MODE.JSON_OBJECT, PLANNER_OUTPUT_MODE.PROMPT_ONLY]);
});

test('detached transport preserves the DeepSeek rejection hidden by SillyTavern', async () => {
    const response = new Response(JSON.stringify({
        error: 'Planner backend returned HTTP 400: {"error":{"message":"This response_format type is unavailable now","type":"invalid_request_error"}}',
    }), { status: 500, statusText: 'Internal Server Error' });
    const error = await detachedPlannerFailure(response);

    assert.equal(error.status, 500);
    assert.match(error.message, /response_format type is unavailable now/);
    assert.equal(isUnsupportedStructuredOutputError(error), true);
});

test('generic provider unavailability is not mistaken for structured-output rejection', () => {
    assert.equal(isUnsupportedStructuredOutputError(new Error('The model is unavailable now')), false);
});

test('direct DeepSeek routes never send an unsupported response format probe', () => {
    assert.deepEqual(plannerOutputModes({
        provider: 'custom',
        model: 'deepseek-v4-pro',
        url: 'http://127.0.0.1:17777/cute/deepseek',
    }), [PLANNER_OUTPUT_MODE.PROMPT_ONLY]);
});

test('other direct and profile routes retain negotiated output modes', () => {
    assert.deepEqual(plannerOutputModes({ provider: 'custom', model: 'glm-5' }), [
        PLANNER_OUTPUT_MODE.JSON_OBJECT,
        PLANNER_OUTPUT_MODE.PROMPT_ONLY,
    ]);
    assert.deepEqual(plannerOutputModes({ provider: 'custom', model: 'qwen3' }), [
        PLANNER_OUTPUT_MODE.JSON_SCHEMA,
        PLANNER_OUTPUT_MODE.JSON_OBJECT,
        PLANNER_OUTPUT_MODE.PROMPT_ONLY,
    ]);
    assert.deepEqual(plannerOutputModes({ provider: 'openrouter', model: 'deepseek/deepseek-r1' }), [
        PLANNER_OUTPUT_MODE.JSON_SCHEMA,
        PLANNER_OUTPUT_MODE.PROMPT_ONLY,
    ]);
});
