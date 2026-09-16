import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { CAMPAIGN_PREPARATION_SYSTEM } from './campaign-preparation-prototype.mjs';
import { PREPARATION_SCHEMA, validatePreparation } from './development-preparation-prototype.mjs';
import { extractJson } from '../extension/analysis.js';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { estimateTokenCount } from '../extension/token-budget.js';
import { HORIZON_SYSTEM, HORIZON_SCHEMA, horizonInput, acceptHorizon } from './horizon-preparation-prototype.mjs';
import { FOCUSED_SYSTEM } from './focused-preparation-prototype.mjs';

const live = process.argv.includes('--live');
const mode = process.env.TF_PREP_MODE || 'campaign';
if (!['campaign', 'horizon', 'focused'].includes(mode)) throw Error('Invalid preparation mode.');
const premiseOnly = mode !== 'campaign';
const system = mode === 'focused' ? FOCUSED_SYSTEM : premiseOnly ? HORIZON_SYSTEM : CAMPAIGN_PREPARATION_SYSTEM;
const schema = premiseOnly ? HORIZON_SCHEMA : PREPARATION_SCHEMA;
if (!process.env.TF_EVAL_OUTPUT || !process.env.TF_DRAFTS) throw Error('Explicit output and source required.');
const output = path.resolve(process.env.TF_EVAL_OUTPUT), repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
for (const p of [repo, process.env.TF_ST_ROOT].filter(Boolean).map(p => path.resolve(p).toLowerCase())) if (output.toLowerCase() === p || output.toLowerCase().startsWith(p + path.sep)) throw Error('Isolated output required.');
if (fs.existsSync(output)) throw Error('Fresh output required.');
const cases = (process.env.TF_CASES || 'frozen-real,touring,closed').split(',');
if (cases.length > 4 || cases.some(c => !['frozen-real', 'touring', 'life', 'closed'].includes(c))) throw Error('Invalid cases.');
fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(path.join(output, 'protocol-snapshot'));
for (const f of ['focused-preparation-prototype.mjs', 'campaign-preparation-prototype.mjs', 'horizon-preparation-prototype.mjs', 'evaluate-campaign-preparation.mjs', 'development-preparation-prototype.mjs', 'isolated-planner-provider.mjs']) fs.copyFileSync(new URL(f, import.meta.url), path.join(output, 'protocol-snapshot', f));
const provider = live ? isolatedProvider(process.env.TF_ST_ROOT) : null;
const report = { started: new Date().toISOString(), live, configuration: provider?.configuration, protocol: 'Same complete saved v3 source input; preparation task revised to restore genre breadth and ask for later transformations rather than only craft projects. First completion per case; no AI repair. Sequential calls, stop on 429 without immediate retries.', runs: [] };
report.mode = mode;
if (mode === 'horizon') report.protocol = 'Premise-first preparation: full original reference, opening and explicit instructions, without recent-episode transcript. Later situations designed first; host-owned scope pointer. Full original source saved separately for later compatibility/writer use. Changes both input and task, not a one-variable ablation. First completion per case, no AI repair. Sequential calls, 30-second gap, stop on 429.';
if (mode === 'focused') report.protocol = 'Task simplification screen: one subject, ordinary three-change array, concise task and source-last message order. Premise-only invention, full source saved for downstream compatibility. Several variables change; not a causal ablation. First completion only, no repair. Sequential 30s gap, stop on 429.';
const save = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); save();
for (const name of cases) {
    const full = fs.readFileSync(path.join(process.env.TF_DRAFTS, `${name}-input.json`), 'utf8');
    const prompt = premiseOnly ? horizonInput(JSON.parse(full)) : full;
    const conversation = plannerMessages(system, prompt, schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY);
    if (mode === 'focused') conversation.splice(1, 2, { role: 'user', content: `${conversation[2].content}\n\nAuthoritative source and task context:\n${prompt}` });
    const run = { name, inputTokens: estimateTokenCount(system + JSON.stringify(schema) + prompt), attempts: [] }; report.runs.push(run); save();
    fs.writeFileSync(path.join(output, `${name}-input.json`), full);
    fs.writeFileSync(path.join(output, `${name}-request-input.json`), prompt);
    fs.writeFileSync(path.join(output, `${name}-request.json`), JSON.stringify(conversation, null, 2));
    try {
        if (run.inputTokens > 24000) throw Error('Full input exceeds budget.');
        if (!provider) continue;
        let result;
        for (let attempt = 1; attempt <= 2; attempt++) {
            const entry = { attempt }, start = Date.now(); run.attempts.push(entry); save();
            try { result = await provider.generate(conversation, 7500); entry.elapsedMs = Date.now() - start; entry.usage = result.usage; entry.finishReason = result.finishReason; save(); break; }
            catch (e) { entry.elapsedMs = Date.now() - start; entry.error = e.status ? `HTTP ${e.status}` : 'Transport failed'; save(); if (attempt === 2 || ![502, 503, 504].includes(e.status)) throw e; await new Promise(r => setTimeout(r, 30000)); }
        }
        fs.writeFileSync(path.join(output, `${name}-output.txt`), result.text);
        if (result.finishReason === 'length') throw Error('Incomplete output.');
        const p = (premiseOnly ? acceptHorizon : validatePreparation)(extractJson(result.text));
        fs.writeFileSync(path.join(output, `${name}-preparation.json`), JSON.stringify(p, null, 2)); run.valid = true; run.ids = p.developments.map(d => d.id);
    } catch (e) { run.error = e.status ? `HTTP ${e.status}` : 'Validation/transport failure; inspect saved response.'; if (e.status === 429) { save(); console.log(JSON.stringify(run)); break; } }
    save(); console.log(JSON.stringify(run));
    if (provider && cases.at(-1) !== name) await new Promise(r => setTimeout(r, 30000));
}
report.ended = new Date().toISOString(); save();
