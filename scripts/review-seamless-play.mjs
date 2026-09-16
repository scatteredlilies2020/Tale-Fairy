// One isolated broad transaction after accepted play; no writer reroll.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { acceptedWindow } from './seamless-planning-prototype.mjs';
import { SUBJECT_RENEWAL_SYSTEM, renewalInput, renewalWitnesses, applyDevelopmentReview } from './development-renewal-prototype.mjs';
import { validatedStaging } from './development-validation-prototype.mjs';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { estimateTokenCount } from '../extension/token-budget.js';
for (const key of ['TF_ST_ROOT', 'TF_PARENT', 'TF_EVAL_OUTPUT']) if (!process.env[key]) throw Error(`Missing ${key}`);
const output = path.resolve(process.env.TF_EVAL_OUTPUT);
for (const root of [process.env.TF_ST_ROOT, fileURLToPath(new URL('..', import.meta.url))]) {
    const base = path.resolve(root).toLowerCase();
    if (output.toLowerCase() === base || output.toLowerCase().startsWith(base + path.sep)) throw Error('External output required');
}
if (fs.existsSync(output)) throw Error('Fresh output required');
const read = name => JSON.parse(fs.readFileSync(path.join(process.env.TF_PARENT, name), 'utf8'));
const state = read('state.json'), reference = read('source.json'), messages = read('accepted-conversation.json');
const review = renewalInput({ state, reference, history: {}, messages: renewalWitnesses(state, messages, acceptedWindow(messages)) });
const provider = isolatedProvider(process.env.TF_ST_ROOT);
fs.mkdirSync(output, { recursive: true });
const save = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
save('original-state.json', state);
const report = { started: new Date().toISOString(), parent: process.env.TF_PARENT, runs: [],
    protocol: 'Scheduled review of every durable subject against accepted IC play; no coding feedback, OOC closure or invented historical referent. One contract repair max. No semantic reroll. Whole-record transaction with stale-basis validation and unchanged accepted observations.' };
try {
    const checked = await validatedStaging({ conversation: plannerMessages(SUBJECT_RENEWAL_SYSTEM, review.prompt, review.schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY), schema: review.schema,
        generate: async (request, attempt) => {
            const tokens = estimateTokenCount(JSON.stringify(request));
            if (tokens > 36000) throw Error('Review input exceeds allowance');
            save(`request-${attempt}.json`, request);
            if (attempt) await new Promise(r => setTimeout(r, 25000));
            const result = await provider.generate(request, 6500);
            report.runs.push({ attempt, inputTokens: tokens, usage: result.usage, finishReason: result.finishReason });
            fs.writeFileSync(path.join(output, `output-${attempt}.txt`), result.text);
            if (result.finishReason === 'length') throw Error('Incomplete review');
            return result.text;
        }, validate: value => applyDevelopmentReview(state, value, review.indices) });
    report.validation = checked.attempts;
    if (!checked.value) throw Error('Review rejected');
    save('renewed-state.json', checked.value);
} catch (error) { report.error = error.status ? `HTTP ${error.status}` : error.message; process.exitCode = 1; }
report.ended = new Date().toISOString(); save('report.json', report);
console.log(JSON.stringify({ complete: !report.error, error: report.error }));
