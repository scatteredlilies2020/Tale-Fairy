import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { RENEWAL_SYSTEM, SUBJECT_RENEWAL_SYSTEM, renewalInput, applyDevelopmentReview } from './development-renewal-prototype.mjs';
import { bindHistoricalInstruction } from './historical-instruction-prototype.mjs';
import { validatedStaging } from './development-validation-prototype.mjs';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { estimateTokenCount } from '../extension/token-budget.js';

for (const key of ['TF_EVAL_OUTPUT', 'TF_ST_ROOT', 'TF_ACTUAL_SOURCE', 'TF_ACTUAL_STATE', 'TF_ACTUAL_MESSAGES', 'TF_TOURING_SOURCE', 'TF_TOURING_STATE', 'TF_TOURING_MESSAGES']) if (!process.env[key]) throw Error(`Missing ${key}`);
const live = process.argv.includes('--live'), output = path.resolve(process.env.TF_EVAL_OUTPUT);
for (const base of [process.env.TF_ST_ROOT, fileURLToPath(new URL('..', import.meta.url))].map(p => path.resolve(p).toLowerCase())) if (output.toLowerCase() === base || output.toLowerCase().startsWith(base + path.sep)) throw Error('Isolated output required');
if (fs.existsSync(output)) throw Error('Fresh output required');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const cases = Object.fromEntries(['ACTUAL', 'TOURING'].map(name => {
    const { source_reference: reference, accepted_messages, existing_preparation, ...history } = read(process.env[`TF_${name}_SOURCE`]);
    const messages = read(process.env[`TF_${name}_MESSAGES`]).filter(m => name === 'TOURING' || m.index <= 23);
    return [name.toLowerCase(), { reference, history: name === 'ACTUAL' ? bindHistoricalInstruction(history, {
        referent: 'The original bridge/weigh-house investigation, before the isolated branch introduced cartography. Not the later independent mapmaking subject or all future arcs.', recordedBefore: 12,
    }) : history, state: read(process.env[`TF_${name}_STATE`]), messages }];
}));
const arms = [{ name: 'actual-scoped', case: 'actual', system: RENEWAL_SYSTEM }, { name: 'actual-subject', case: 'actual', system: SUBJECT_RENEWAL_SYSTEM }, { name: 'touring-subject', case: 'touring', system: SUBJECT_RENEWAL_SYSTEM }];
const provider = live ? isolatedProvider(process.env.TF_ST_ROOT) : null;
fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(path.join(output, 'protocol-snapshot'));
for (const file of ['evaluate-subject-renewal.mjs', 'development-renewal-prototype.mjs', 'historical-instruction-prototype.mjs', 'development-review-prototype.mjs', 'development-validation-prototype.mjs', 'isolated-planner-provider.mjs']) fs.copyFileSync(new URL(file, import.meta.url), path.join(output, 'protocol-snapshot', file));
const json = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
const report = { live, started: new Date().toISOString(), configuration: provider?.configuration,
    protocol: 'Three predefined arms, no semantic rerolls. First adds a verified historical-instruction referent to the v17 baseline review; second additionally distinguishes access episode from enduring subject. Third tests that subject review against the unchanged generated touring continuation. One deterministic validation repair maximum. No writer call or ST write. Complete input guard 36k estimates is an explicit isolated broad-review budget, not a production retrieval solution.',
    acceptance: ['Actual: distinguish declining valley escort from learning Sillage and continuing independent interests', 'Actual: future must work without owning Lisbeth map or completing her survey', 'Touring: incorporate enacted flute/lantern/shadow work without pretending the original full masque happened', 'Touring: preserve compatible unused subjects and private/public participation boundary', 'All: no invented accepted history, forced itinerary or source/agency violations'], runs: [] };
const save = () => json('report.json', report); save();
let nextAt = 0;
async function generate(id, request) {
    const inputTokens = estimateTokenCount(JSON.stringify(request));
    if (inputTokens > 36000) throw Error('Complete review input exceeds explicit 36000 estimate');
    json(`${id}-messages.json`, request); const run = { id, inputTokens, attempts: [] }; report.runs.push(run); save();
    if (!provider) return null;
    for (let i = 0; i < 3; i++) {
        if (nextAt > Date.now()) await new Promise(r => setTimeout(r, nextAt - Date.now())); nextAt = Date.now() + 25000;
        const entry = { attempt: i + 1 }, start = Date.now(); run.attempts.push(entry); save();
        try {
            const response = await provider.generate(request, 7000);
            Object.assign(entry, { elapsedMs: Date.now() - start, usage: response.usage, finishReason: response.finishReason });
            fs.writeFileSync(path.join(output, `${id}-output.txt`), response.text); save();
            if (!response.text.trim() || response.finishReason === 'length') throw Error('Incomplete completion');
            console.log(JSON.stringify({ id, complete: true })); return response.text;
        } catch (error) {
            entry.error = error.status ? `HTTP ${error.status}` : 'Generation failed'; save();
            if (i === 2 || ![502,503,504].includes(error.status)) throw Error(entry.error);
            await new Promise(r => setTimeout(r, (i + 1) * 30000));
        }
    }
}
try {
    for (const arm of arms) {
        const input = cases[arm.case], review = renewalInput(input); json(`${arm.name}-input.json`, input);
        const checked = await validatedStaging({ conversation: plannerMessages(arm.system, review.prompt, review.schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY), schema: review.schema,
            generate: (request, attempt) => generate(`${arm.name}${attempt ? '-repair' : ''}`, request), validate: value => applyDevelopmentReview(input.state, value, review.indices) });
        json(`${arm.name}-validation.json`, checked.attempts);
        if (checked.value) json(`${arm.name}-state.json`, checked.value);
        else if (live) report.runs.push({ id: `${arm.name}-validation`, error: 'Both attempts rejected; other predefined arms still run' });
        save();
    }
} catch (error) { report.error = error.message; console.log(JSON.stringify({ error: report.error })); }
report.ended = new Date().toISOString(); save();
