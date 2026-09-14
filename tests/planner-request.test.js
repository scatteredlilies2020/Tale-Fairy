import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { AnalysisValidationError } from '../extension/analysis.js';
import * as reasoning from '../extension/reasoning-policy.js';
import * as output from '../extension/output-negotiation.js';
import { claimPlannerRecoveryRepair } from '../extension/planner-lifecycle.js';

const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
const take = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
function harness(results, { route = 'direct', configured = 'low', activeEffort = 'medium', profile = { preset: 'Planner' }, model = 'generic', url = 'https://example.invalid' } = {}) {
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
        ...reasoning, ...output, AnalysisValidationError, claimPlannerRecoveryRepair,
        plannerStorage: () => null, AbortController, DOMException, console: { warn() {} },
        EXTENSION_ID: 'test', detachedPlannerReady: Promise.resolve(), detachedPlannerEnabled: false,
        PLANNER_SYSTEM_PROMPT: 'planner', INCREMENTAL_SYSTEM_PROMPT: 'routine',
        ANALYSIS_SCHEMA: { value: { type: 'object' } }, INCREMENTAL_ANALYSIS_SCHEMA: { value: { type: 'object' } },
        plannerOutputModeCache: new Map(), parseAnalysisResponse: parseResponse,
        analysisModelOptions: () => route === 'profile' ? { profileId: 'selected' }
            : route === 'active' ? { active: true } : { provider: 'custom', model, url },
        getSettings: () => ({ analysisReasoningMode: configured }),
        openai_setting_names: { Planner: 0 }, openai_settings: [{ reasoning_effort: 'high' }],
        oai_settings: { reasoning_effort: activeEffort },
        plannerTemperature: () => 0.7, normalizePlannerTemperature: value => value,
        currentContext: () => ({ getRequestHeaders: () => ({}), mainApi: 'openai', chatCompletionSettings: { chat_completion_source: 'custom' } }),
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
        run: (spec = {}) => scope.requestAnalysisOnce('current evidence', new AbortController().signal, null, { parseResponse, ...spec }),
        runPass: (meta = {}, recovery = null) => scope.requestAnalysis('current evidence', new AbortController().signal, meta, recovery),
    };
}

test('normal evaluation makes exactly one model request', async () => {
    const h = harness([{ valid: true }]);
    assert.equal((await h.run()).valid, true);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].max_tokens, 12288);
});

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
    test(`${route}: routine disables optional thinking and broader tiers honor selected reasoning`, async () => {
        for (const configured of ['low', 'high', 'auto']) {
            for (const { meta, budget, recovery } of tiers) {
                const expected = !meta.fullContextPass ? 'none' : configured === 'auto' ? (route === 'profile' ? 'high' : 'medium') : configured;
                const h = harness(body => {
                    assert.equal(body.include_reasoning, expected !== 'none');
                    assert.equal(body.reasoning_effort, expected);
                    assert.equal(JSON.parse(body.custom_include_body).reasoning_effort, expected);
                    return { valid: true };
                }, { route, configured });
                assert.equal((await h.runPass(meta, recovery)).valid, true);
                assert.equal(h.requests.length, 1, 'supported controls need one request');
                const reserve = { none: 0, low: 8192, medium: 16384, high: 32768 }[expected];
                assert.equal(h.requests[0].max_tokens, budget + reserve);
            }
        }
    });
}

test('Auto leaves provider defaults alone when no profile or active effort is configured', async () => {
    for (const route of ['direct', 'profile', 'active']) {
        for (const { meta } of tiers.filter(tier => tier.meta.fullContextPass)) {
            const h = harness([{ valid: true }], { route, configured: 'auto', activeEffort: '', profile: {} });
            await h.runPass(meta);
            assert.ok(!h.requests[0].reasoning_effort);
            assert.equal(h.requests[0].include_reasoning, undefined);
            assert.equal(h.requests.length, 1);
        }
    }
});

test('Auto uses an explicit profile effort before its preset or the active model', async () => {
    const h = harness([{ valid: true }], { route: 'profile', configured: 'auto', profile: { reasoning_effort: 'low', preset: 'Planner' } });
    await h.runPass({ fullContextPass: true });
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

test('DeepSeek routine updates disable thinking and bound output even with review reasoning Low', async () => {
    const h = harness([{ valid: true }], { model: 'deepseek-v4-pro', configured: 'low' });
    await h.runPass();
    assert.deepEqual(JSON.parse(h.requests[0].custom_include_body), { thinking: { type: 'disabled' } });
    assert.equal(h.requests[0].max_tokens, 4096);
    assert.equal(h.requests.length, 1);
});

test('every route reserves reasoning space after Auto inheritance and provider translation', async () => {
    for (const route of ['direct', 'profile', 'active']) {
        for (const [configured, expected] of [['off', 6144], ['low', 14336], ['medium', 38912], ['auto', 38912]]) {
            const h = harness([{ valid: true }], { route, configured, activeEffort: 'high', model: 'deepseek-v4.1-flash' });
            await h.runPass({ fullContextPass: true });
            assert.equal(h.requests.length, 1);
            assert.equal(h.requests[0].max_tokens, expected, `${route}: ${configured}`);
        }
    }
});


test('routine transports send the compact response shape without native schema overhead', async () => {
    for (const route of ['direct', 'profile', 'active']) {
        const h = harness([{ valid: true }], { route });
        await h.runPass();
        const sent = h.requests[0];
        assert.equal(h.requests.length, 1);
        assert.match(JSON.stringify(sent.messages), /Response shape/);
        assert.ok(!sent.json_schema);
        assert.ok(!sent.response_format);
        assert.equal(sent.max_tokens, 4096);
    }
});
