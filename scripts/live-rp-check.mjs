// Opt-in, non-streaming replay through the user's existing SillyTavern server.
// Never saves a chat, changes settings, prints credentials, or uses a new provider.
// This reconstructs preset/card context; it is NOT a browser prompt-manager test.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import * as analysis from '../extension/analysis.js';
import { fitPromptToBudget, plannerEvidenceAudit } from '../extension/prompt-budget.js';
import { plannerBudgetEnvelope, plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { completionText } from '../extension/completion-response.js';
import { buildReasoningRequest, plannerOutputTokenBudget } from '../extension/reasoning-policy.js';
import * as newState from '../extension/state.js';
import { stampPreparedWorld, preparedWorldUsable } from '../extension/prepared-world.js';
import { ensureGuidanceInChat } from '../extension/request-injection.js';
import { cases } from './gm-evaluation-cases.mjs';
import { replayBootstrap } from './replay-context.mjs';
import { plannerBudgets } from '../extension/planner-budgets.js';

const args = process.argv.slice(2);
if (!args.includes('--live') || !process.env.TF_ST_ROOT || !process.env.TF_CHAT) {
    throw Error('Opt in with --live and TF_ST_ROOT / TF_CHAT. No request was sent.');
}
const root = process.env.TF_ST_ROOT;
const base = new URL(process.env.TF_ST_URL || 'http://127.0.0.1:8000');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw Error('Use the existing local SillyTavern server.');
const source = fs.readFileSync(process.env.TF_CHAT);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const sourceHash = digest(source);
let lines = source.toString('utf8').trim().split('\n').map(JSON.parse);
let metadata = lines.shift().chat_metadata;
const sourceNarrativeHash = digest(JSON.stringify(lines));
const scenario = process.env.TF_SCENARIO ? cases[process.env.TF_SCENARIO] : null;
if (process.env.TF_SCENARIO && !scenario) throw Error('Unknown acceptance scenario.');
if (scenario) { lines = structuredClone(scenario.messages); metadata = structuredClone(scenario.metadata); }
const settings = JSON.parse(fs.readFileSync(path.join(root, 'data/default-user/settings.json'), 'utf8'));
const tf = settings.extension_settings['living-world-guide'];
const oai = settings.oai_settings;
// Explicit diagnostic only: reuse the already configured writer connection for
// planning, with reasoning Off. Never change either saved connection/settings.
const compareWriterPlanner = args.includes('--writer-as-planner');
if (compareWriterPlanner && oai.chat_completion_source !== 'deepseek') throw Error('Writer-connection comparison currently supports only the configured DeepSeek route.');
const plannerConnection = compareWriterPlanner
    ? { chat_completion_source: oai.chat_completion_source, model: oai.deepseek_model, reverse_proxy: oai.reverse_proxy, proxy_password: oai.proxy_password }
    : { chat_completion_source: tf.analysisProvider, model: tf.analysisModel, custom_url: tf.analysisUrl, secret_id: tf.analysisSecretId };
const output = process.env.TF_EVAL_OUTPUT || path.join(os.tmpdir(), `tale-fairy-eval-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const installed = path.join(root, 'public/scripts/extensions/third-party/Tale-Fairy/extension');
const old = await import(pathToFileURL(path.join(installed, 'analysis.js')));
const oldState = await import(pathToFileURL(path.join(installed, 'state.js')));
const oldInjection = await import(pathToFileURL(path.join(installed, 'request-injection.js')));
const csrf = await fetch(new URL('/csrf-token', base));
if (!csrf.ok) throw Error(`Local session unavailable (${csrf.status}).`);
const cookies = csrf.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
const token = (await csrf.json()).token;
async function generate(body) {
    const started = Date.now();
    const response = await fetch(new URL('/api/backends/chat-completions/generate', base), {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token, Cookie: cookies },
        body: JSON.stringify(body), signal: AbortSignal.timeout(240000),
    });
    const data = await response.json();
    if (!response.ok || data.error) {
        const detail = JSON.stringify(data.error || data).toLowerCase();
        const category = ['thinking', 'reasoning', 'model', 'token', 'timeout', 'unauthorized', 'capacity', 'rate limit', 'messages']
            .filter(word => detail.includes(word)).join(', ') || 'unclassified';
        const error = Error('Configured provider request failed.');
        // Only an HTTP integer and allowlisted category words may reach reports.
        error.safeDiagnostic = `HTTP ${response.status}; categories: ${category}`;
        throw error;
    }
    return { text: completionText(data), usage: data.usage, elapsedMs: Date.now() - started };
}
function parser(api, text, prompt) {
    let value = api.extractJson(text);
    value = api.abstractIncrementalVisibleBranches(value);
    value = api.normalizeAnalysisActorUpdates(value);
    value = api.normalizeAnalysisDiagnostics(value);
    const check = api.validateAnalysisResult(value);
    check.errors.push(...api.transcriptHeadAlignmentErrors(value, prompt));
    check.valid = !check.errors.length;
    return { value, ...check };
}
function card() {
    const character = path.basename(path.dirname(process.env.TF_CHAT));
    const png = fs.readFileSync(path.join(root, 'data/default-user/characters', `${character}.png`));
    for (let offset = 8; offset + 12 <= png.length;) {
        const size = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
        const value = png.subarray(offset + 8, offset + 8 + size); offset += size + 12;
        if (type !== 'tEXt' || value.toString('ascii', 0, 6) !== 'chara\0') continue;
        const data = JSON.parse(Buffer.from(value.subarray(6).toString(), 'base64').toString('utf8'));
        return { character, data: data.data || data };
    }
    return { character, data: {} };
}
const character = scenario ? { character: 'Narrator', data: { description: scenario.description } } : card();
const user = [...lines].reverse().find(message => message.is_user)?.name || 'Player';
const substitute = text => String(text || '').replace(/\{\{char\}\}/gi, character.character).replace(/\{\{user\}\}/gi, user);
function writerMessages() {
    const order = oai.prompt_order.find(item => item.character_id === 100001)?.order || [];
    const messages = [];
    const markers = { charDescription: character.data.description, charPersonality: character.data.personality, scenario: character.data.scenario };
    for (const entry of order.filter(item => item.enabled)) {
        const prompt = oai.prompts.find(item => item.identifier === entry.identifier);
        const content = substitute(markers[entry.identifier] ?? prompt?.content);
        if (content) messages.push({ role: prompt?.role || 'system', content });
    }
    if (!messages.some(message => message.content.includes(substitute(character.data.description)))) {
        messages.push({ role: 'system', content: substitute(character.data.description) });
    }
    messages.push(...lines.slice(-18).map(message => ({ role: message.is_user ? 'user' : 'assistant', content: substitute(message.mes) })));
    return messages;
}
const report = { sourceHash, sourceNarrativeHash, sourceMessageCount: lines.length, reconstructedPrompt: true,
    replayCodeHash: digest(['live-rp-check.mjs', 'replay-context.mjs', 'gm-evaluation-cases.mjs'].map(file => fs.readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n')),
    candidateCodeHash: digest(['world-planner.js', 'analysis.js', 'state.js', 'prepared-world.js', 'game-master.js', 'request-injection.js'].map(file => fs.readFileSync(new URL(`../extension/${file}`, import.meta.url), 'utf8')).join('\n')),
    scenario: process.env.TF_SCENARIO || 'actual-chat', checks: scenario?.checks,
    limitation: 'Replay includes saved enabled preset text, card and last 18 messages, not exact browser macro/lore/prompt-manager assembly.',
    plannerModel: plannerConnection.model, plannerConnection: compareWriterPlanner ? 'saved-writer-diagnostic' : 'saved-planner', writerModel: oai.deepseek_model, runs: [] };
const incremental = process.env.TF_PASS !== 'review';
const tokenBudget = Math.max(6000, Math.min(30000, Number(process.env.TF_INPUT_TOKENS) || (incremental ? 6000 : 14000)));
const recentBudget = plannerBudgets({ ...tf, maxPromptTokens: tokenBudget, routineInputTokens: tokenBudget, reviewInputTokens: tokenBudget }, { fullContextPass: !incremental }).recent;
const reasoningMode = process.env.TF_VARIANT === 'baseline' ? process.env.TF_REASONING || 'off' : 'off';
report.reasoningMode = reasoningMode;
const savedReport = process.env.TF_PLAN_REPORT ? JSON.parse(fs.readFileSync(process.env.TF_PLAN_REPORT, 'utf8')) : null;
if (savedReport && (savedReport.sourceHash !== sourceHash || savedReport.scenario !== report.scenario)) throw Error('Saved plan does not match this source and acceptance scenario.');
const trials = Math.max(1, Math.min(3, Number(process.env.TF_TRIALS) || 1));
const originalLines = structuredClone(lines), originalMetadata = structuredClone(metadata);
for (let trial = 1; trial <= trials; trial++) {
    for (const [label, api, stateApi, injection] of [['baseline', old, oldState, oldInjection], ['candidate', analysis, newState, { ensureGuidanceInChat }]]
        .filter(([label]) => !process.env.TF_VARIANT || process.env.TF_VARIANT === label)) {
        lines = structuredClone(originalLines); metadata = structuredClone(originalMetadata);
        let retainedState;
        const stages = [{ name: 'initial', text: scenario?.continuation || 'I stay here and listen, letting them continue.' },
            ...(process.env.TF_SEQUENCE === '1' && label === 'candidate' ? [
                { name: 'retained', text: scenario?.followup || 'I continue listening. Let the conversation develop naturally.', reuse: true },
                { name: 'pivot', text: scenario?.pivot || 'OOC: Leave the investigation aside for now. Focus on ordinary companionship and daily life; do not turn those into another mystery.' },
            ] : [])];
        for (const stage of stages) {
        lines.push({ is_user: true, name: user, mes: stage.text });
        const system = label === 'candidate' ? api.WORLD_PLANNER_SYSTEM : incremental ? `${api.INCREMENTAL_SYSTEM}\n\n${api.INCREMENTAL_ANALYSIS_OUTPUT_CONTRACT}` : `${api.SYSTEM}\n\n${api.ANALYSIS_OUTPUT_CONTRACT}`;
        const schema = label === 'candidate' ? api.WORLD_PLANNER_SCHEMA : incremental ? api.INCREMENTAL_ANALYSIS_SCHEMA : api.ANALYSIS_SCHEMA;
        const mode = PLANNER_OUTPUT_MODE.PROMPT_ONLY;
        const fixedEnvelope = plannerBudgetEnvelope(system, schema, mode);
        const prompt = await fitPromptToBudget({ fixedEnvelope, tokenBudget,
            buildPrompt: effectivePromptTokens => (label === 'candidate' ? api.buildWorldPlannerPrompt : api.buildAnalysisPrompt)(lines, metadata.livingWorldGuide, '', replayBootstrap(scenario ? null : card(), scenario?.description), {
                incremental, maxPromptTokens: tokenBudget, effectivePromptTokens, recentContextTokens: label === 'baseline' && incremental ? 3000 : recentBudget, summaryContextTokens: incremental ? 1200 : 4000,
                messageTokenLimit: tf.messageTokenLimit, historyCache: new Map(),
            }),
        });
        if (args.includes('--inspect')) {
            const payload = JSON.parse(prompt);
            console.log(JSON.stringify({ label, bootstrapKeys: Object.keys(payload.rp_reference || payload.bootstrap || {}),
                ...(args.includes('--details') ? { rpReference: payload.rp_reference || payload.bootstrap } : {}),
                messages: args.includes('--details') ? payload.messages : payload.messages.map(item => item.index), witnesses: payload.historical_evidence }));
            continue;
        }
        const reused = savedReport?.runs.findLast(run => run.label === label && (run.stage || 'initial') === stage.name && run.trial === trial && run.planner.valid)?.planner;
        if (savedReport && !reused) throw Error('Saved report has no valid plan for this variant.');
        const started = Date.now();
        let result;
        try {
        result = stage.reuse && retainedState ? { text: '', elapsedMs: 0, retainedBrief: true } : reused ? { text: reused.text, elapsedMs: 0, reusedPlan: true } : await generate({ ...plannerConnection,
            max_tokens: plannerOutputTokenBudget(incremental ? 4096 : 6144, reasoningMode), stream: false,
            temperature: tf.analysisTemperature,
            ...buildReasoningRequest({ mode: reasoningMode, source: plannerConnection.chat_completion_source, model: plannerConnection.model, url: plannerConnection.custom_url || plannerConnection.reverse_proxy }).payload,
            messages: plannerMessages(system, prompt, schema, mode) });
        } catch (error) {
            const failure = { label, trial, stage: stage.name, planner: { valid: false, elapsedMs: Date.now() - started,
                errors: [error.name === 'TimeoutError' ? 'Planner request timed out.' : 'Planner transport/provider request failed; details omitted to protect credentials.'],
                ...(error.safeDiagnostic ? { diagnostic: error.safeDiagnostic } : {}) } };
            report.runs.push(failure);
            fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
            console.log(JSON.stringify(failure));
            break;
        }
        let parsed;
        try { parsed = result.retainedBrief ? { valid: true, errors: [] } : parser(api, result.text, prompt); } catch { parsed = { valid: false, errors: ['Could not parse planner response'] }; }
        const run = { label, trial, stage: stage.name, presetOnly: process.env.TF_PRESET_ONLY === '1', planner: { ...result, ...parsed }, evidence: plannerEvidenceAudit(prompt, [], { fixedEnvelope, tokenBudget, tier: incremental ? 'routine' : 'review' }),
            witnessIndexes: JSON.parse(prompt).historical_evidence?.map(item => item.index) || [],
            historicalEvidence: JSON.parse(prompt).historical_evidence || [] };
        console.log(JSON.stringify({ label, trial, phase: 'planner', valid: parsed.valid, errors: parsed.errors, elapsedMs: result.elapsedMs, evidence: run.evidence, witnesses: run.witnessIndexes }));
        report.runs.push(run);
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
        if (parsed.valid && !args.includes('--planner-only')) {
            try {
            const state = result.retainedBrief ? retainedState : api.applyAnalysis(metadata.livingWorldGuide, parsed.value, lines);
            if (!result.retainedBrief) {
                state.sourceChatId = 'replay';
                state.preparedWorld = stampPreparedWorld(state.preparedWorld, { chatId: 'replay', inputsKey: 'replay-inputs',
                    fingerprint: newState.fingerprintMessages(lines), messageCount: lines.length, startedAt: Date.now() });
            }
            const guidanceUsable = stateApi.isGuidanceUsable(state, lines, 'replay');
            const preparedUsable = preparedWorldUsable(state.preparedWorld, { chatId: 'replay', inputsKey: 'replay-inputs', messages: lines, fingerprint: newState.fingerprintMessages });
            const payload = stateApi.buildPromptPayload(state, { enabled: true, guidanceUsable, preparedUsable });
            run.packet = { guidanceUsable, preparedUsable, payload, preparedWorld: state.preparedWorld };
            const messages = writerMessages();
            if (!run.presetOnly) injection.ensureGuidanceInChat(messages, payload, { role: tf.injectionRole, depth: tf.injectionDepth, inlineLatestUser: true });
            run.writer = await generate({ chat_completion_source: oai.chat_completion_source, model: oai.deepseek_model,
                reverse_proxy: oai.reverse_proxy, proxy_password: oai.proxy_password,
                max_tokens: Math.min(6000, oai.openai_max_tokens || 6000), stream: false,
                temperature: oai.temp_openai, top_p: oai.top_p_openai,
                frequency_penalty: oai.freq_pen_openai, presence_penalty: oai.pres_pen_openai,
                include_reasoning: oai.show_thoughts, reasoning_effort: oai.reasoning_effort, messages });
            run.systemAuthority = messages.some(message => message.role === 'system' && message.content.includes('<tale-fairy-authority>'));
            lines.push({ is_user: false, name: character.character, mes: run.writer.text });
            retainedState = state; metadata.livingWorldGuide = state;
            console.log(JSON.stringify({ label, trial, phase: 'writer', elapsedMs: run.writer.elapsedMs, characters: run.writer.text.length, systemAuthority: run.systemAuthority }));
            } catch (error) {
                run.writerError = error.name === 'TimeoutError' ? 'Writer request timed out.' : 'Writer or packet application failed; provider details omitted to protect credentials.';
                if (error.safeDiagnostic) run.writerDiagnostic = error.safeDiagnostic;
                console.log(JSON.stringify({ label, trial, phase: 'writer', error: run.writerError }));
            }
        }
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
        if (!parsed.valid || run.writerError || args.includes('--planner-only')) break;
        }
    }
}
report.sourceUnchanged = sourceHash === digest(fs.readFileSync(process.env.TF_CHAT));
report.storyUnchanged = sourceNarrativeHash === digest(JSON.stringify(fs.readFileSync(process.env.TF_CHAT, 'utf8').trim().split('\n').slice(1).map(JSON.parse)));
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, sourceUnchanged: report.sourceUnchanged, storyUnchanged: report.storyUnchanged }));
if (!report.sourceUnchanged || !report.storyUnchanged || report.runs.some(run => !run.planner.valid || run.writerError)) process.exitCode = 1;
