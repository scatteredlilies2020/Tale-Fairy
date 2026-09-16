import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { EDITOR_SYSTEM, EDITOR_SCHEMA, validateEditedPreparation } from './development-editor-prototype.mjs';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { extractJson } from '../extension/analysis.js';
import { estimateTokenCount } from '../extension/token-budget.js';
const live = process.argv.includes('--live');
if (!process.env.TF_EVAL_OUTPUT || !process.env.TF_DRAFTS) throw Error('Explicit drafts and output required.');
const output = path.resolve(process.env.TF_EVAL_OUTPUT), repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
for (const p of [repo, process.env.TF_ST_ROOT].filter(Boolean).map(p => path.resolve(p).toLowerCase())) if (output.toLowerCase() === p || output.toLowerCase().startsWith(p + path.sep)) throw Error('Isolated output required.');
if (fs.existsSync(output)) throw Error('Fresh output required.');
fs.mkdirSync(output, { recursive: true });
const cases = (process.env.TF_CASES || 'frozen-real,touring,life,closed').split(',');
if (cases.length > 4 || cases.some(c => !['frozen-real', 'touring', 'life', 'closed'].includes(c))) throw Error('Invalid cases.');
const provider = live ? isolatedProvider(process.env.TF_ST_ROOT, { mode: process.env.TF_REASONING || 'off' }) : null;
const report = { started: new Date().toISOString(), live, configuration: provider?.configuration,
    protocol: 'One editor completion following each saved, unedited v3 draft. Same general rubric for all cases; no case-specific feedback, reroll or output repair. At most two logged transient transport retries.',
    protocolHash: crypto.createHash('sha256').update(['development-editor-prototype.mjs', 'evaluate-development-editor.mjs', 'development-preparation-prototype.mjs', 'isolated-planner-provider.mjs'].map(p => fs.readFileSync(new URL(p, import.meta.url))).join('\n')).digest('hex'), runs: [] };
const save = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); save();
for (const name of cases) {
    const source = JSON.parse(fs.readFileSync(path.join(process.env.TF_DRAFTS, `${name}-input.json`)));
    const draft = JSON.parse(fs.readFileSync(path.join(process.env.TF_DRAFTS, `${name}-preparation.json`)));
    const prompt = JSON.stringify({ ...source, draft });
    const run = { name, inputTokens: estimateTokenCount(EDITOR_SYSTEM + JSON.stringify(EDITOR_SCHEMA) + prompt), attempts: [] }; report.runs.push(run); save();
    fs.writeFileSync(path.join(output, `${name}-input.json`), prompt);
    try {
        if (run.inputTokens > 24000) throw Error('Complete editor input exceeds budget.');
        if (provider) {
            let result;
            for (let attempt = 1; attempt <= 3; attempt++) {
                const entry = { attempt }, start = Date.now(); run.attempts.push(entry); save();
                try { result = await provider.generate(plannerMessages(EDITOR_SYSTEM, prompt, EDITOR_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY), 9000); entry.elapsedMs = Date.now() - start; entry.usage = result.usage; entry.finishReason = result.finishReason; save(); break; }
                catch (e) { entry.elapsedMs = Date.now() - start; entry.error = e.status ? `HTTP ${e.status}` : 'Transport failed'; save(); if (attempt === 3 || ![429, 502, 503, 504].includes(e.status)) throw Error(entry.error); await new Promise(r => setTimeout(r, attempt * 5000)); }
            }
            fs.writeFileSync(path.join(output, `${name}-output.txt`), result.text);
            const parsed = validateEditedPreparation(extractJson(result.text));
            fs.writeFileSync(path.join(output, `${name}-preparation.json`), JSON.stringify(parsed.preparation, null, 2));
            run.valid = true; run.developments = parsed.preparation.developments.map(d => d.id); run.audit = parsed.audit;
        }
    } catch (e) { run.error = /^HTTP \d+$|^Transport failed$/.test(e.message) ? e.message : 'Editor validation failed; inspect saved response.'; }
    save(); console.log(JSON.stringify({ name, valid: run.valid, error: run.error, developments: run.developments }));
}
report.ended = new Date().toISOString(); save();
