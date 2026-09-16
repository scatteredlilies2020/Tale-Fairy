// Opt-in, evaluation-only. Direct calls to the existing custom planner provider,
// never the running ST server. Credential stays in memory; no source file writes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { touringCase, closedCase } from './single-pass-planner-cases.mjs';
import { SINGLE_PASS_SYSTEM, prototypeSchema, buildPrototypePrompt, mergePrototype } from './single-pass-planner-prototype.mjs';
import { WORLD_PLANNER_SYSTEM, WORLD_PLANNER_SCHEMA, normalizeWorldPlan, validateWorldPlan, mergeWorldPlan } from '../extension/world-planner.js';
import { buildWorldPlannerPrompt, extractJson } from '../extension/analysis.js';
import { defaultState } from '../extension/state.js';
import { fitPromptToBudget, plannerEvidenceAudit } from '../extension/prompt-budget.js';
import { plannerBudgetEnvelope, plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { completionText } from '../extension/completion-response.js';
import { buildReasoningRequest } from '../extension/reasoning-policy.js';

const args = process.argv.slice(2), live = args.includes('--live');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const output = path.resolve(process.env.TF_EVAL_OUTPUT || path.join(os.tmpdir(), `tf-single-pass-${Date.now()}`));
const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
if (output === repo || output.startsWith(repo + path.sep)) throw Error('Keep generated/private evaluation artifacts outside the repository.');
if (fs.existsSync(path.join(output, 'report.json'))) throw Error('Output already has a report; choose a fresh directory.');
fs.mkdirSync(output, { recursive: true });
const cases = [touringCase(), closedCase()];
if (process.env.TF_SCOPE_SNAPSHOT) {
    const snapshot = path.resolve(process.env.TF_SCOPE_SNAPSHOT);
    const frozenPayload = JSON.parse(fs.readFileSync(path.join(snapshot, 'review-saved-input.json')));
    const reference = JSON.parse(fs.readFileSync(path.join(snapshot, 'source-reference.json')));
    // The user's explicit current preference, not a fabricated accepted event.
    frozenPayload.user_instruction = 'I care less about this particular arc and am playing it out to see it finish. Mid-to-long-term planning matters more than extending this arc.';
    cases.unshift({ name: 'frozen-real', frozenPayload, notebook: reference.savedNotebook, messages: [], stages: [{ name: 'review', broad: true, append: [] }] });
}
const selected = process.env.TF_CASE ? cases.filter(c => c.name === process.env.TF_CASE) : cases;
if (!selected.length) throw Error('Unknown evaluation case.');
const plannedCalls = selected.reduce((n, c) => n + c.stages.length * 2, 0);
if (plannedCalls > 18) throw Error('This bounded evaluation permits at most 18 calls.');
const protocolFiles = ['scripts/evaluate-single-pass.mjs', 'scripts/single-pass-planner-prototype.mjs', 'scripts/single-pass-planner-cases.mjs', 'extension/world-planner.js', 'extension/analysis.js', 'extension/prepared-world.js'];
const report = {
    protocolHash: digest(protocolFiles.map(p => fs.readFileSync(path.join(repo, p))).join('\n')),
    started: new Date().toISOString(), live, plannedCalls, transport: 'Direct existing custom planner provider; no ST server requests.',
    criteria: ['Substantive intermediate states across episodes, not future hooks only.', 'Causal independence and creative range, judged from content not family labels.', 'Preserve then revise enduring preparation from accepted events.', 'Allow current episode to close without compulsory sequel.', 'Current writer packet stays relevant without exposing all future material.', 'Identity, agency, era and knowledge fidelity.', 'Respect a deliberately closed scenario.'],
    limitations: ['Fixed synthetic accepted continuations, not model-written play or exact browser capture.', 'One sample per arm/stage; stochastic outcomes, not statistical proof.', 'Candidate changes system, reference fitting and routine scope ownership together.', 'Short sequence with five routine runs between two reviews, not a full 12-run interval.', 'No story writer generation; writer-packet quality is inspected directly.', 'No automatic semantic grader or extra AI judging calls.'],
    runs: [],
};
let connection, key, settingsPath, settingsHash;
if (live) {
    if (!process.env.TF_ST_ROOT) throw Error('Live opt-in requires TF_ST_ROOT.');
    settingsPath = path.join(process.env.TF_ST_ROOT, 'data/default-user/settings.json');
    const bytes = fs.readFileSync(settingsPath); settingsHash = digest(bytes);
    const settings = JSON.parse(bytes), tf = settings.extension_settings?.['living-world-guide'];
    if (tf?.analysisProvider !== 'custom') throw Error('Direct isolated harness supports only the configured custom planner route.');
    const endpoint = new URL(`${tf.analysisUrl.replace(/\/$/, '')}/chat/completions`);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname);
    if (!(endpoint.protocol === 'https:' || endpoint.protocol === 'http:' && loopback) || endpoint.username || endpoint.password) throw Error('Expected HTTPS provider or existing loopback proxy without URL credentials.');
    if (loopback && endpoint.port === '8000') throw Error('Do not use the running SillyTavern server.');
    const secrets = JSON.parse(fs.readFileSync(path.join(process.env.TF_ST_ROOT, 'data/default-user/secrets.json')));
    const entries = secrets.api_key_custom;
    key = Array.isArray(entries) ? entries.find(s => tf.analysisSecretId ? s.id === tf.analysisSecretId : s.active)?.value : undefined;
    if (!key) throw Error('Configured custom planner credential unavailable.');
    const reasoning = buildReasoningRequest({ mode: 'off', source: tf.analysisProvider, model: tf.analysisModel, url: tf.analysisUrl });
    connection = { endpoint, model: tf.analysisModel, temperature: tf.analysisTemperature, extra: JSON.parse(reasoning.payload.custom_include_body || '{}') };
    report.model = connection.model; report.temperature = connection.temperature; report.reasoning = 'off';
}
const save = () => {
    report.completed = new Date().toISOString();
    if (settingsPath) report.settingsChangedExternallyDuringRun = digest(fs.readFileSync(settingsPath)) !== settingsHash;
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
};
save();
async function generate(system, prompt, schema, broad) {
    const response = await fetch(connection.endpoint, {
        method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: connection.model, temperature: connection.temperature, max_tokens: broad ? 6144 : 4096, stream: false,
            messages: plannerMessages(system, prompt, schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY), ...connection.extra }),
        signal: AbortSignal.timeout(240000),
    });
    if (!response.ok) throw Error(`HTTP ${response.status}; response detail withheld.`);
    const data = await response.json();
    if (data.error) throw Error('Provider returned an error; detail withheld.');
    return { text: completionText(data), usage: data.usage, finishReason: data.choices?.[0]?.finish_reason };
}

for (const scenario of selected) {
    const boards = Object.fromEntries(['baseline', 'candidate'].map(a => [a, structuredClone(scenario.notebook)]));
    const messages = structuredClone(scenario.messages);
    fs.writeFileSync(path.join(output, `${scenario.name}-fixture.json`), JSON.stringify(scenario, null, 2));
    for (const stage of scenario.stages) {
        messages.push(...stage.append);
        for (const arm of ['baseline', 'candidate']) {
            const name = `${scenario.name}-${stage.name}-${arm}`, started = Date.now();
            const run = { name, case: scenario.name, stage: stage.name, arm, broad: stage.broad, aiCalls: 0 };
            report.runs.push(run);
            try {
                const system = arm === 'candidate' ? SINGLE_PASS_SYSTEM : WORLD_PLANNER_SYSTEM;
                const schema = arm === 'candidate' ? prototypeSchema() : WORLD_PLANNER_SCHEMA;
                const fixedEnvelope = plannerBudgetEnvelope(system, schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY);
                const state = defaultState(); state.plannerContract = 14; state.preparedWorld = boards[arm];
                const options = { incremental: !stage.broad, maxPromptTokens: stage.broad ? 14000 : 6000, recentContextTokens: 6000, summaryContextTokens: 4000, messageTokenLimit: 700, historyCache: new Map() };
                const prompt = scenario.frozenPayload ? JSON.stringify(scenario.frozenPayload)
                    : arm === 'candidate' ? await buildPrototypePrompt(messages, state, scenario.note, scenario.bootstrap, options)
                        : await fitPromptToBudget({ fixedEnvelope, tokenBudget: options.maxPromptTokens, buildPrompt: effectivePromptTokens => buildWorldPlannerPrompt(messages, state, scenario.note, scenario.bootstrap, { ...options, effectivePromptTokens }) });
                run.input = plannerEvidenceAudit(prompt, [], { fixedEnvelope, tokenBudget: options.maxPromptTokens, tier: stage.broad ? 'review' : 'routine' });
                if (run.input.inputTokens > options.maxPromptTokens) throw Error('Input exceeds evaluation budget.');
                run.payloadHash = digest(prompt);
                fs.writeFileSync(path.join(output, `${name}-input.json`), prompt);
                fs.writeFileSync(path.join(output, `${name}-system.txt`), system);
                fs.writeFileSync(path.join(output, `${name}-before.json`), JSON.stringify(boards[arm], null, 2));
                if (live) {
                    run.aiCalls = 1;
                    const generated = await generate(system, prompt, schema, stage.broad);
                    fs.writeFileSync(path.join(output, `${name}-output.txt`), generated.text);
                    run.usage = generated.usage; run.finishReason = generated.finishReason;
                    const value = normalizeWorldPlan(extractJson(generated.text));
                    run.validation = validateWorldPlan(value);
                    if (!run.validation.valid) throw Error('Schema validation failed.');
                    const merged = arm === 'candidate' ? mergePrototype(boards[arm], value, { broad: stage.broad }) : { notebook: mergeWorldPlan(boards[arm], value), hostActions: [] };
                    run.hostActions = merged.hostActions;
                    run.changedIds = value.prepared.updates.map(r => r.id);
                    run.statusChanges = value.prepared.status_changes;
                    run.omittedIdsRetained = boards[arm].items.filter(r => !run.changedIds.includes(r.id) && !(run.statusChanges || []).some(s => s.id === r.id)).every(r => JSON.stringify(merged.notebook.items.find(i => i.id === r.id)) === JSON.stringify(r));
                    boards[arm] = merged.notebook;
                    run.storedIds = boards[arm].items.map(r => r.id); run.writerIds = boards[arm].writer?.map(r => r.id) || [];
                    fs.writeFileSync(path.join(output, `${name}-after.json`), JSON.stringify(boards[arm], null, 2));
                }
                run.elapsedMs = Date.now() - started; save();
                console.log(JSON.stringify({ name, aiCalls: run.aiCalls, valid: run.validation?.valid, inputTokens: run.input.inputTokens, outputTokens: run.usage?.completion_tokens, ids: run.storedIds, writer: run.writerIds, elapsedMs: run.elapsedMs }));
            } catch (error) {
                run.elapsedMs = Date.now() - started;
                run.failure = /^(HTTP \d+;|Provider returned|Schema validation|Input exceeds|Complete source)/.test(error.message) ? error.message : 'Request, fitting or merge failed; details withheld.';
                save(); console.log(JSON.stringify({ name, failure: run.failure }));
                process.exitCode = 1; process.exit(); // No repair call, retries or cherry-picked continuation.
            }
        }
    }
}
save();
console.log(JSON.stringify({ output, calls: report.runs.reduce((n, r) => n + r.aiCalls, 0), complete: true }));
