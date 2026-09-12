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
function harness(results) {
    const requests = [];
    const scope = {
        ...reasoning, ...output, AnalysisValidationError, claimPlannerRecoveryRepair,
        plannerStorage: () => null, AbortController, DOMException, console: { warn() {} },
        EXTENSION_ID: 'test', detachedPlannerReady: Promise.resolve(), detachedPlannerEnabled: false,
        PLANNER_SYSTEM_PROMPT: 'planner', INCREMENTAL_RESPONSE_TOKENS: Number(source.match(/const INCREMENTAL_RESPONSE_TOKENS = (\d+)/)[1]),
        ANALYSIS_SCHEMA: { value: { type: 'object' } }, plannerOutputModeCache: new Map(),
        analysisModelOptions: () => ({ provider: 'custom', model: 'generic', url: 'https://example.invalid' }),
        plannerTemperature: () => 0.7, normalizePlannerTemperature: value => value,
        currentContext: () => ({ getRequestHeaders: () => ({}) }),
        fetch: async (url, options) => {
            requests.push(JSON.parse(options.body));
            const result = results[Math.min(requests.length - 1, results.length - 1)];
            return { ok: true, json: async () => result };
        },
    };
    vm.createContext(scope);
    vm.runInContext(take('async function negotiatePlannerOutput(', 'function isolatePlannerGenerationData(')
        + take('async function requestAnalysisOnce(', 'async function requestAnalysis('), scope);
    const parseResponse = result => {
        if (!result.valid) throw new AnalysisValidationError('Invalid actor', ['actor_updates[2].knowledge must be a string']);
        return result;
    };
    return { requests, run: (spec = {}) => scope.requestAnalysisOnce('current evidence', new AbortController().signal, null, {
        reasoningMode: 'off', parseResponse, ...spec,
    }) };
}

test('normal evaluation makes exactly one model request', async () => {
    const h = harness([{ valid: true }]);
    assert.equal((await h.run()).valid, true);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].max_tokens, 4096);
});

test('invalid output gets exactly one focused correction and retains current evidence', async () => {
    const h = harness([{ valid: false }, { valid: true }]);
    assert.equal((await h.run()).valid, true);
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[1].messages[1].content, 'current evidence');
    assert.match(h.requests[1].messages.at(-1).content, /actor_updates\[2\].knowledge must be a string/);
});

test('two invalid responses do not cascade into more output-mode model calls', async () => {
    const h = harness([{ valid: false }]);
    await assert.rejects(h.run(), AnalysisValidationError);
    assert.equal(h.requests.length, 2);
});

test('recovery sends its correction immediately and cannot start another repair', async () => {
    const h = harness([{ valid: false }]);
    await assert.rejects(h.run({ repairInstruction: 'Correct retained response.', allowValidationRepair: false }), AnalysisValidationError);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].messages.at(-1).content, 'Correct retained response.');
});
