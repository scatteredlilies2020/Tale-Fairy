import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { AnalysisValidationError, WORLD_PLANNER_SYSTEM, WORLD_PLANNER_SCHEMA } from '../extension/analysis.js';
import * as reasoning from '../extension/reasoning-policy.js';
import * as output from '../extension/output-negotiation.js';
import { claimPlannerRecoveryRepair } from '../extension/planner-lifecycle.js';
import { verifyStoryInputBudget } from '../extension/story-budget.js';

const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
const take = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
function harness(results, { route = 'direct', configured = 'low', activeEffort = 'medium', profile = { preset: 'Planner' }, model = 'generic', url = 'https://example.invalid', inputBudget = 16000, tokenCounter } = {}) {
    const requests = [];
    const listeners = new Map();
    const respond = body => {
        requests.push(structuredClone(body));
        const result = typeof results === 'function' ? results(body) : results[Math.min(requests.length - 1, results.length - 1)];
        if (result instanceof Error) throw result;
        return result;
    };
    const parseResponse = result => {
        if (!result.valid) throw new AnalysisValidationError('Invalid actor', ['actor_updates[2].knowledge must be a string']);
        return result;
    };
    const scope = {
        ...reasoning, ...output, AnalysisValidationError, claimPlannerRecoveryRepair, WORLD_PLANNER_SYSTEM, WORLD_PLANNER_SCHEMA, verifyStoryInputBudget,
        plannerStorage: () => null, AbortController, DOMException, console: { warn() {} },
        EXTENSION_ID: 'test', detachedPlannerReady: Promise.resolve(), detachedPlannerEnabled: false,
        PLANNER_SYSTEM_PROMPT: 'planner', INCREMENTAL_SYSTEM_PROMPT: 'routine',
        ANALYSIS_SCHEMA: { value: { type: 'object' } }, INCREMENTAL_ANALYSIS_SCHEMA: { value: { type: 'object' } },
        plannerOutputModeCache: new Map(), parseAnalysisResponse: parseResponse,
        analysisModelOptions: () => route === 'profile' ? { profileId: 'selected' }
            : route === 'active' ? { active: true } : { provider: 'custom', model, url },
        getSettings: () => ({ analysisReasoningMode: configured, maxPromptTokens: inputBudget }),
        openai_setting_names: { Planner: 0 }, openai_settings: [{ reasoning_effort: 'high' }],
        oai_settings: { reasoning_effort: activeEffort },
        plannerTemperature: () => 0.7, normalizePlannerTemperature: value => value,
        currentContext: () => ({ getRequestHeaders: () => ({}), getTokenCountAsync: tokenCounter, mainApi: 'openai', chatCompletionSettings: { chat_completion_source: 'custom' } }),
        fetch: async (_url, options) => ({ ok: true, json: async () => respond(JSON.parse(options.body)) }),
        ConnectionManagerRequestService: {
            getProfile: () => ({ model, 'api-url': url, ...profile }), validateProfile: () => ({ source: 'custom' }),
            sendRequest: async (_id, messages, max_tokens, _options, overrides) => respond({ messages, max_tokens, ...overrides }),
        },
        event_types: { CHAT_COMPLETION_SETTINGS_READY: 'settings' },
        eventSource: { on: (event, listener) => listeners.set(event, listener), removeListener: event => listeners.delete(event) },
        containsPlannerMarker: () => true,
        generateRaw: async options => {
            const data = { messages: [{ role: 'user', content: options.prompt }], chat_completion_source: 'custom', model,
                custom_url: url, reasoning_effort: activeEffort, max_tokens: 32000, temperature: 1 };
            listeners.get('settings')(data);
            return respond(data);
        },
    };
    for (const name of ['INCREMENTAL_RESPONSE_TOKENS', 'REBUILD_RESPONSE_TOKENS', 'REVIEW_RESPONSE_TOKENS']) {
        scope[name] = Number(source.match(new RegExp(`const ${name} = (\\d+)`))[1]);
    }
    vm.createContext(scope);
    vm.runInContext(take('function plannerReasoningMode(', 'function analysisErrorMessage(')
        + take('async function negotiatePlannerOutput(', 'function normalizeUserNote(')
        + take('async function requestAnalysisOnce(', 'export async function analyzeNow('), scope);
    return {
        requests,
        run: (spec = {}, signal = new AbortController().signal) => scope.requestAnalysisOnce('current evidence', signal, null, { parseResponse, ...spec }),
        runPass: (meta = {}, recovery = null) => scope.requestAnalysis('current evidence', new AbortController().signal, meta, recovery),
    };
}

test('oversized single-shot input is blocked before every provider route without a retry', async () => {
    for (const route of ['direct', 'profile', 'active']) {
        const h = harness([{ valid: true }], { route, inputBudget: 40 });
        await assert.rejects(h.run({ singleShot: true }), /exceeds.*no provider request sent/);
        assert.equal(h.requests.length, 0, route);
    }
});

test('tracker distinguishes preflight failure from waiting on a dispatched provider request', async () => {
    for (const route of ['direct', 'profile', 'active']) {
        const stages = [];
        const onProgress = stage => stages.push(stage);
        const blocked = harness([{ valid: true }], { route, inputBudget: 40 });
        await assert.rejects(blocked.run({ singleShot: true, onProgress }), /exceeds/);
        assert.deepEqual(stages, ['Checking planner connection and input']);
        stages.length = 0;
        const h = harness(() => {
            assert.ok(stages.some(stage => stage.startsWith('Waiting for planner response')));
            return { valid: true };
        }, { route });
        await h.run({ singleShot: true, onProgress });
        assert.equal(stages[0], 'Checking planner connection and input');
        assert.equal(h.requests.length, 1);
    }
});

test('active tokenizer overflow blocks generation, but another model never uses that tokenizer', async () => {
    let calls = 0;
    const tokenCounter = async () => { calls++; return 20000; };
    const active = harness([{ valid: true }], { route: 'active', tokenCounter });
    await assert.rejects(active.run({ singleShot: true }), /exceeds/);
    assert.equal(active.requests.length, 0);
    assert.equal(calls, 1);
    for (const route of ['direct', 'profile']) {
        const h = harness([{ valid: true }], { route, tokenCounter });
        assert.equal((await h.run({ singleShot: true })).valid, true);
        assert.equal(h.requests.length, 1);
    }
    assert.equal(calls, 1);
});

test('a stalled active tokenizer does not prevent cancellation or send a provider request', { timeout: 1000 }, async () => {
    let started;
    const tokenizing = new Promise(resolve => { started = resolve; });
    const h = harness([{ valid: true }], { route: 'active', tokenCounter: () => {
        started();
        return new Promise(() => {});
    } });
    const controller = new AbortController();
    const rejected = assert.rejects(h.run({ singleShot: true }, controller.signal), error => error.name === 'AbortError');
    await tokenizing;
    controller.abort();
    await rejected;
    assert.equal(h.requests.length, 0);
});

test('normal evaluation makes exactly one model request', async () => {
    const h = harness([{ valid: true }]);
    assert.equal((await h.run()).valid, true);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].max_tokens, 20480);
});

for (const route of ['direct', 'profile', 'active']) {
    test(`${route}: reasoning model sampling policy is shared with isolated evaluation`, async () => {
        const h = harness([{ valid: true }], { route, model: 'openai/gpt-5.6-terra' });
        assert.equal(reasoning.plannerModelRejectsTemperature('openai/gpt-5.6-terra'), true);
        await h.run({ singleShot: true });
        assert.equal(h.requests.length, 1);
        assert.equal(h.requests[0].temperature, undefined);
    });
    test(`${route}: explicit single-shot transport sends once without output negotiation`, async () => {
        const h = harness([{ valid: true }], { route, configured: 'low' });
        assert.equal((await h.run({ singleShot: true })).valid, true);
        assert.equal(h.requests.length, 1);
        const sent = h.requests[0];
        assert.match(JSON.stringify(sent.messages), /Response shape/);
        assert.equal(sent.json_schema, undefined);
        assert.equal(sent.response_format, undefined);
        assert.equal(sent.reasoning_effort, 'low', 'single-shot does not silently replace the saved reasoning mode');
    });

    test(`${route}: single-shot never retries compatibility, validation or transport errors`, async () => {
        const failures = [
            new Error('Unsupported parameter: temperature is not supported with this model.'),
            new Error('Reasoning is mandatory and cannot be disabled.'),
            new Error('Unsupported parameter: reasoning_effort.'),
            new Error('response_format json_schema is not supported.'),
            new Error('Connection timed out.'),
            new Error('Rate limit exceeded (429).'),
            { valid: false },
        ];
        for (const failure of failures) {
            // A second response would succeed, making accidental retries visible.
            const h = harness([failure, { valid: true }], { route, configured: 'off' });
            await assert.rejects(h.run({ singleShot: true, allowValidationRepair: true }));
            assert.equal(h.requests.length, 1, failure.message || 'invalid result');
        }
    });
}

test('invalid output fails after one generation without a model correction pass', async () => {
    const h = harness([{ valid: false }, { valid: true }]);
    await assert.rejects(h.run(), AnalysisValidationError);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].messages[1].content, 'current evidence');
});

test('legacy repair options cannot start a second pass or inject a correction', async () => {
    const h = harness([{ valid: false }]);
    await assert.rejects(h.run({ repairInstruction: 'Correct retained response.', allowValidationRepair: true }), AnalysisValidationError);
    assert.equal(h.requests.length, 1);
    assert.doesNotMatch(JSON.stringify(h.requests), /Correct retained response/);
});

const tiers = [
    { meta: {}, budget: 4096 },
    { meta: { fullContextPass: true }, budget: 6144 },
    { meta: { fullContextPass: true, rebuild: true }, budget: 8192 },
    { meta: {}, budget: 4096, recovery: { instruction: 'Correct retained response.' } },
];

for (const route of ['direct', 'profile', 'active']) {
    test(`${route}: the replacement disables reasoning in every tier regardless of legacy selection`, async () => {
        for (const configured of ['low', 'high', 'auto']) {
            for (const { meta, budget, recovery } of tiers) {
                const expected = 'none';
                const h = harness(body => {
                    assert.equal(body.include_reasoning, expected !== 'none');
                    assert.equal(body.reasoning_effort, expected);
                    assert.equal(JSON.parse(body.custom_include_body).reasoning_effort, expected);
                    return { valid: true };
                }, { route, configured });
                assert.equal((await h.runPass(meta, recovery)).valid, true);
                assert.equal(h.requests.length, 1, 'supported controls need one request');
                const reserve = { none: 0, low: 16384, medium: 16384, high: 32768 }[expected];
                assert.equal(h.requests[0].max_tokens, budget + reserve);
            }
        }
    });
}

test('Auto leaves provider defaults alone when no profile or active effort is configured', async () => {
    for (const route of ['direct', 'profile', 'active']) {
        for (const { meta } of tiers.filter(tier => tier.meta.fullContextPass)) {
            const h = harness([{ valid: true }], { route, configured: 'auto', activeEffort: '', profile: {} });
            await h.run();
            assert.ok(!h.requests[0].reasoning_effort);
            assert.equal(h.requests[0].include_reasoning, undefined);
            assert.equal(h.requests.length, 1);
        }
    }
});

test('Auto uses an explicit profile effort before its preset or the active model', async () => {
    const h = harness([{ valid: true }], { route: 'profile', configured: 'auto', profile: { reasoning_effort: 'low', preset: 'Planner' } });
    await h.run();
    assert.equal(h.requests[0].reasoning_effort, 'low');
    assert.equal(h.requests.length, 1);
});

test('explicit Off also disables thinking in broader tiers', async () => {
    for (const route of ['direct', 'profile', 'active']) {
        for (const { meta } of tiers) {
            const h = harness([{ valid: true }], { route, configured: 'off' });
            await h.runPass(meta);
            assert.equal(h.requests[0].reasoning_effort, 'none');
            assert.equal(h.requests[0].include_reasoning, false);
            assert.equal(h.requests.length, 1);
        }
    }
});

test('custom mandatory-reasoning retries actually remove disable controls from the sent body', async () => {
    for (const route of ['direct', 'profile']) {
        for (const model of ['generic', 'vllm-model']) {
            const h = harness(body => {
                const custom = JSON.parse(body.custom_include_body);
                if (custom.reasoning_effort === 'none' || custom.chat_template_kwargs?.enable_thinking === false) {
                    return new Error('Reasoning is mandatory and cannot be disabled.');
                }
                assert.equal(body.reasoning_effort, 'low');
                assert.equal(custom.reasoning_effort, 'low');
                return { valid: true };
            }, { route, configured: 'off', model });
            assert.equal((await h.runPass()).valid, true);
            assert.equal(h.requests.length, 2, 'one compatibility retry only');
        }
    }
});

test('a continuing mandatory-reasoning rejection does not create a retry loop', async () => {
    const h = harness([new Error('Reasoning is mandatory.')], { configured: 'off' });
    await assert.rejects(h.runPass(), /Reasoning is mandatory/);
    assert.equal(h.requests.length, 2);
});

test('DeepSeek replacement disables optional thinking without reasoning reserve', async () => {
    const h = harness([{ valid: true }], { model: 'deepseek-v4-pro', configured: 'low' });
    await h.runPass();
    assert.deepEqual(JSON.parse(h.requests[0].custom_include_body), { thinking: { type: 'disabled' } });
    assert.equal(h.requests[0].max_tokens, 4096);
    assert.equal(h.requests.length, 1);
});

test('every route reserves reasoning space after Auto inheritance and provider translation', async () => {
    for (const route of ['direct', 'profile', 'active']) {
        for (const [configured, expected] of [['off', 6144], ['low', 22528], ['medium', 38912], ['auto', 38912]]) {
            const h = harness([{ valid: true }], { route, configured, activeEffort: 'high', model: 'deepseek-v4.1-flash' });
            await h.run({ responseTokens: 6144 });
            assert.equal(h.requests.length, 1);
            assert.equal(h.requests[0].max_tokens, expected, `${route}: ${configured}`);
        }
    }
});


test('routine transports send the compact response shape without native schema overhead', async () => {
    for (const route of ['direct', 'profile', 'active']) {
        const h = harness([{ valid: true }], { route, configured: 'off' });
        await h.runPass();
        const sent = h.requests[0];
        assert.equal(h.requests.length, 1);
        assert.match(JSON.stringify(sent.messages), /Response shape/);
        assert.ok(!sent.json_schema);
        assert.ok(!sent.response_format);
        assert.equal(sent.max_tokens, 4096);
    }
});
