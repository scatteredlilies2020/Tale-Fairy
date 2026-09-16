// One bounded, unrerolled IC rollout. Never reads or writes a live ST chat.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { touringCase } from './single-pass-planner-cases.mjs';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { presetSnapshot, presetWriterInput } from './writer-preset-prototype.mjs';
import { developmentState } from './development-maintenance-prototype.mjs';
import { injectSeamlessPreparation, acceptedWindow, IC_DRIVER_SYSTEM, icDriverIssues,
    SEAMLESS_MEMORY_SYSTEM, seamlessMemorySchema, updateSeamlessMemory } from './seamless-planning-prototype.mjs';
import { SUBJECT_RENEWAL_SYSTEM, renewalInput, renewalWitnesses, applyDevelopmentReview } from './development-renewal-prototype.mjs';
import { validatedStaging } from './development-validation-prototype.mjs';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { estimateTokenCount } from '../extension/token-budget.js';

for (const key of ['TF_ST_ROOT', 'TF_EVAL_OUTPUT', 'TF_PREPARATION']) if (!process.env[key]) throw Error(`Missing ${key}`);
const live = process.argv.includes('--live');
const output = path.resolve(process.env.TF_EVAL_OUTPUT);
for (const root of [process.env.TF_ST_ROOT, fileURLToPath(new URL('..', import.meta.url))]) {
    const base = path.resolve(root).toLowerCase();
    if (output.toLowerCase() === base || output.toLowerCase().startsWith(base + path.sep)) throw Error('External output required');
}
if (fs.existsSync(output)) throw Error('Fresh output required');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const preset = presetSnapshot(read(path.join(process.env.TF_ST_ROOT, 'data/default-user/settings.json')));
const fixture = touringCase(), reference = fixture.bootstrap;
let state = developmentState(read(process.env.TF_PREPARATION), fixture.notebook.items);
const messages = fixture.messages.map((m, index) => ({ index, role: m.is_user ? 'user' : 'assistant', content: m.mes }));
const planner = live ? isolatedProvider(process.env.TF_ST_ROOT) : null;
const writer = live ? isolatedProvider(process.env.TF_ST_ROOT, { mode: 'low', temperature: preset.temperature }) : null;
if (live && (writer.configuration.model !== preset.model || preset.reasoning !== 'low')) throw Error('Writer configuration changed');
fs.mkdirSync(output, { recursive: true });
const saveJson = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
saveJson('preset.json', preset); saveJson('source.json', reference); saveJson('initial-state.json', state);
fs.mkdirSync(path.join(output, 'protocol-snapshot'));
for (const file of ['evaluate-seamless-play.mjs', 'seamless-planning-prototype.mjs', 'writer-preset-prototype.mjs',
    'development-memory-prototype.mjs', 'development-maintenance-prototype.mjs', 'development-renewal-prototype.mjs',
    'development-review-prototype.mjs', 'development-validation-prototype.mjs', 'isolated-planner-provider.mjs']) {
    fs.copyFileSync(new URL(file, import.meta.url), path.join(output, 'protocol-snapshot', file));
}
const report = { started: new Date().toISOString(), live, planner: planner?.configuration, writer: writer?.configuration,
    protocol: '12 sequential writer turns, simulated IC player between turns. Initial four fixture messages only: no staged closure, arrival, time jump or coding-user complaint. Player sees source and accepted scene only, never private plans or assessment. Existing broad preparation, full repertoire plus finite-episode policy, unmodified static enabled writer preset; same model/temperature/Low reasoning, custom rather than native ST transport, no runtime extensions. Memory after turns 3/6/9/12; scheduled broad subject review after 6/12 regardless of review_needed. First four plus last twelve complete accepted messages per request, full transcript retained on disk, all derived observations retained. Not a solved long-run retrieval policy. One contract repair per planner call, no semantic rerolls. Stop on invalid IC output or provider failure.',
    acceptance: ['Delivery resolves through actual IC actions, no meta closure', 'Local records retire only on accepted completion',
        'At least one independent subject develops beyond an offer/entrance', 'Private participation is not made into public commitment',
        'Broader preparation survives local completion and review adapts to actual choices', 'No forced player actions or private-to-past leakage',
        'Assess how much middle/later play actually occurs; short proof is not months of reliability'], runs: [], repairs: [] };
const save = () => { saveJson('report.json', report); saveJson('accepted-conversation.json', messages); saveJson('state.json', state); };
save(); let nextAt = 0;
async function generate(id, request, maxOutput, provider) {
    const inputTokens = estimateTokenCount(JSON.stringify(request));
    const limit = preset.context - maxOutput - (provider === writer ? 16384 : 0);
    if (inputTokens > limit) throw Error(`Input ${inputTokens} exceeds ${limit}`);
    saveJson(`${id}-messages.json`, request);
    const run = { id, inputTokens, attempts: [] }; report.runs.push(run); save();
    if (!provider) return null;
    for (let attempt = 0; attempt < 3; attempt++) {
        if (nextAt > Date.now()) await new Promise(r => setTimeout(r, nextAt - Date.now()));
        nextAt = Date.now() + 25000;
        const entry = { attempt: attempt + 1 }, start = Date.now(); run.attempts.push(entry); save();
        try {
            const response = await provider.generate(request, maxOutput);
            Object.assign(entry, { elapsedMs: Date.now() - start, usage: response.usage, finishReason: response.finishReason });
            fs.writeFileSync(path.join(output, `${id}-output.txt`), response.text); save();
            if (!response.text.trim() || response.finishReason === 'length') throw Error('Incomplete completion');
            console.log(JSON.stringify({ id, complete: true })); return response.text;
        } catch (error) {
            entry.error = error.status ? `HTTP ${error.status}` : 'Generation failed'; save();
            if (attempt === 2 || ![502,503,504].includes(error.status)) throw Error(entry.error);
            await new Promise(r => setTimeout(r, (attempt + 1) * 30000));
        }
    }
}
async function structured(id, system, prompt, schema, validate) {
    const checked = await validatedStaging({ conversation: plannerMessages(system, prompt, schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY), schema,
        generate: (request, attempt) => generate(id + (attempt ? '-repair' : ''), request, 6500, planner), validate });
    report.repairs.push({ id, attempts: checked.attempts }); save();
    if (live && !checked.value) throw Error(`${id} rejected`);
    return checked.value;
}
try {
    for (let round = 1; round <= 12; round++) {
        const window = acceptedWindow(messages);
        const request = presetWriterInput({ preset, reference, history: {}, messages: window, userName: 'Neri' });
        injectSeamlessPreparation(request, state);
        const text = await generate(`round-${round}-writer`, request, preset.maxOutput, writer);
        if (!live) break;
        messages.push({ index: messages.length, role: 'assistant', content: text }); save();
        if (round % 3 === 0) {
            const evidence = acceptedWindow(messages), indices = evidence.map(m => m.index);
            state = await structured(`round-${round}-memory`, SEAMLESS_MEMORY_SYSTEM,
                JSON.stringify({ source_reference: reference, notebook: state, accepted_messages: evidence }), seamlessMemorySchema(state),
                value => updateSeamlessMemory(state, value, indices)); save();
        }
        if (round % 6 === 0) {
            const review = renewalInput({ state, reference, history: {}, messages: renewalWitnesses(state, messages, acceptedWindow(messages)) });
            state = await structured(`round-${round}-review`, SUBJECT_RENEWAL_SYSTEM, review.prompt, review.schema,
                value => applyDevelopmentReview(state, value, review.indices)); save();
        }
        saveJson(`round-${round}-state.json`, state);
        if (round < 12) {
            const driverRequest = [{ role: 'system', content: IC_DRIVER_SYSTEM + '\nSource: ' + JSON.stringify(reference) },
                { role: 'user', content: JSON.stringify({ accepted_scene: acceptedWindow(messages) }) }];
            const reply = await generate(`round-${round}-player`, driverRequest, 500, planner);
            const issues = icDriverIssues(reply); if (issues.length) throw Error(issues.join('; '));
            messages.push({ index: messages.length, role: 'user', content: reply }); save();
        }
    }
} catch (error) { report.error = error.message; console.log(JSON.stringify({ error: report.error })); }
report.ended = new Date().toISOString(); save();
if (report.error) process.exitCode = 1;
