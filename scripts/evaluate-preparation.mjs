// Fixed screening cases copied from prior private fixtures; no live ST reads
// except connection configuration/credential through the isolated provider.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { PREPARATION_SYSTEM, PREPARATION_SCHEMA, preparationInput, validatePreparation } from './development-preparation-prototype.mjs';
import { extractJson } from '../extension/analysis.js';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';

const live = process.argv.includes('--live');
const root = fileURLToPath(new URL('..', import.meta.url));
if (!process.env.TF_EVAL_OUTPUT || !process.env.TF_FIXTURES) throw Error('Explicit output and frozen fixtures required.');
const output = path.resolve(process.env.TF_EVAL_OUTPUT);
for (const p of [root, process.env.TF_ST_ROOT].filter(Boolean).map(p => path.resolve(p).toLowerCase())) if (output.toLowerCase() === p || output.toLowerCase().startsWith(p + path.sep)) throw Error('Output must be outside repository and ST.');
if (fs.existsSync(output)) throw Error('Choose a fresh output directory.');
fs.mkdirSync(output, { recursive: true });
const provider = live ? isolatedProvider(process.env.TF_ST_ROOT, { mode: process.env.TF_REASONING || 'off' }) : null;
const cases = (process.env.TF_CASES || 'frozen-real,touring,closed,life').split(',');
if (cases.length > 4 || cases.some(c => !['frozen-real', 'touring', 'closed', 'life'].includes(c))) throw Error('Invalid screening cases.');
const report = { started: new Date().toISOString(), live, configuration: provider?.configuration, protocol: 'Dedicated preparation; unchanged accepted source/history, no generated local frame or scene-selection job. One completion per case; at most two logged transient transport retries. No semantic repair or selective reroll.',
    protocolHash: crypto.createHash('sha256').update(['development-preparation-prototype.mjs', 'evaluate-preparation.mjs', 'isolated-planner-provider.mjs'].map(p => fs.readFileSync(new URL(p, import.meta.url))).join('\n')).digest('hex'), runs: [] };
const save = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
save();
for (const name of cases) {
    const fixture = JSON.parse(fs.readFileSync(path.join(process.env.TF_FIXTURES, `${name}-1-fixture.json`)));
    const built = preparationInput(fixture);
    const run = { name, inputTokens: built.inputTokens, attempts: [] }; report.runs.push(run); save();
    fs.writeFileSync(path.join(output, `${name}-input.json`), built.prompt);
    try {
        if (provider) {
            let result;
            for (let attempt = 1; attempt <= 3; attempt++) {
                const entry = { attempt }, start = Date.now(); run.attempts.push(entry); save();
                try { result = await provider.generate(plannerMessages(PREPARATION_SYSTEM, built.prompt, PREPARATION_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY), 7000); entry.elapsedMs = Date.now() - start; entry.usage = result.usage; entry.finishReason = result.finishReason; save(); break; }
                catch (e) { entry.elapsedMs = Date.now() - start; entry.error = e.status ? `HTTP ${e.status}` : 'Transport failed'; save(); if (attempt === 3 || ![429, 502, 503, 504].includes(e.status)) throw Error(entry.error); await new Promise(r => setTimeout(r, attempt * 5000)); }
            }
            fs.writeFileSync(path.join(output, `${name}-output.txt`), result.text);
            const value = validatePreparation(extractJson(result.text));
            fs.writeFileSync(path.join(output, `${name}-preparation.json`), JSON.stringify(value, null, 2));
            run.valid = true; run.developments = value.developments.map(d => d.id);
        }
    } catch (e) { run.error = /^HTTP \d+$|^Transport failed$/.test(e.message) ? e.message : 'Preparation validation failed; raw output retained.'; }
    save(); console.log(JSON.stringify(run));
}
report.ended = new Date().toISOString(); save();
