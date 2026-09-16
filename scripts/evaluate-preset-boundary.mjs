import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { presetSnapshot, presetWriterInput } from './writer-preset-prototype.mjs';
import { injectRepertoire } from './development-repertoire-request.mjs';
import { RENEWAL_SYSTEM, renewalInput, applyDevelopmentReview } from './development-renewal-prototype.mjs';
import { validatedStaging } from './development-validation-prototype.mjs';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { estimateTokenCount } from '../extension/token-budget.js';

const live = process.argv.includes('--live');
for (const key of ['TF_EVAL_OUTPUT', 'TF_ST_ROOT', 'TF_SOURCE', 'TF_STATE', 'TF_CONVERSATION', 'TF_PROBES']) if (!process.env[key]) throw Error(`Missing ${key}`);
const output = path.resolve(process.env.TF_EVAL_OUTPUT);
for (const base of [process.env.TF_ST_ROOT, fileURLToPath(new URL('..', import.meta.url))].map(p => path.resolve(p).toLowerCase())) if (output.toLowerCase() === base || output.toLowerCase().startsWith(base + path.sep)) throw Error('Isolated output required');
if (fs.existsSync(output)) throw Error('Fresh output required');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const settings = read(path.join(process.env.TF_ST_ROOT, 'data/default-user/settings.json'));
const preset = presetSnapshot(settings);
if (preset.source !== 'deepseek' || preset.reasoning !== 'low' || preset.context !== 60000) throw Error('Inspected writer configuration changed');
const source = read(process.env.TF_SOURCE), originalState = read(process.env.TF_STATE);
const { source_reference: reference, accepted_messages, existing_preparation, ...history } = source;
const messages = read(process.env.TF_CONVERSATION).filter(m => m.index <= 23);
if (messages.length !== 24 || messages.at(-1).role !== 'assistant') throw Error('Expected unchanged month-later prefix through accepted index 23');
const probes = read(process.env.TF_PROBES).prompts;
const planner = live ? isolatedProvider(process.env.TF_ST_ROOT) : null;
const writer = live ? isolatedProvider(process.env.TF_ST_ROOT, { mode: 'low', temperature: preset.temperature }) : null;
if (live && writer.configuration.model !== preset.model) throw Error('Writer model mismatch');
fs.mkdirSync(output, { recursive: true });
const saveJson = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
saveJson('preset.json', preset); saveJson('accepted-prefix.json', messages); saveJson('original-state.json', originalState);
fs.mkdirSync(path.join(output, 'protocol-snapshot'));
for (const file of ['evaluate-preset-boundary.mjs', 'writer-preset-prototype.mjs', 'isolated-planner-provider.mjs', 'development-renewal-prototype.mjs', 'development-review-prototype.mjs', 'development-validation-prototype.mjs', 'development-repertoire-request.mjs']) fs.copyFileSync(new URL(file, import.meta.url), path.join(output, 'protocol-snapshot', file));
const report = { started: new Date().toISOString(), live, planner: planner?.configuration, writer: writer?.configuration,
    protocol: 'Scheduled broad review at accepted month/departure boundary, regardless of model review_needed. Same preserved prefix for three exploratory writer samples: old preparation + unchanged preset; renewed preparation + unchanged preset; renewed preparation + explicit scope compatibility. No semantic rerolls. Continuation follows the clarified branch regardless of quality. Not a full ST clone: static enabled preset text with verified depth/order, frozen reference/history; runtime world-info, continuity and native DeepSeek transport absent. Full inputs guarded at verified writer context minus output reserve, not the old 24k prototype cap. This does not establish scalable retrieval.',
    presetHash: crypto.createHash('sha256').update(JSON.stringify(preset)).digest('hex'), sourcePaths: ['TF_SOURCE','TF_STATE','TF_CONVERSATION','TF_PROBES'].map(k => [k, process.env[k]]),
    acceptance: ['Honor elapsed time and changed starting location', 'Enact concrete changed work/situation rather than only recap or invitation', 'Preserve player agency and original named-spell/era/persona constraints', 'Do not revive declined escort or old bridge investigation', 'Keep unrelated meal unrelated', 'Review adapts future to learning Sillage and leaving without the original map'],
    continuationProbes: [probes[10], probes[8], probes[6], probes[7]], runs: [] };
const save = () => saveJson('report.json', report); save();
let nextAt = 0;
async function generate(id, request, tokens, provider) {
    const inputTokens = estimateTokenCount(JSON.stringify(request));
    const limit = preset.context - tokens - (provider === writer ? 16384 : 0);
    if (inputTokens > limit) throw Error(`Complete request ${inputTokens} exceeds explicit ${limit} input allowance`);
    saveJson(`${id}-messages.json`, request);
    const run = { id, inputTokens, limit, attempts: [] }; report.runs.push(run); save();
    if (!provider) return null;
    for (let attempt = 0; attempt < 3; attempt++) {
        if (nextAt > Date.now()) await new Promise(r => setTimeout(r, nextAt - Date.now()));
        nextAt = Date.now() + 25000;
        const entry = { attempt: attempt + 1 }, start = Date.now(); run.attempts.push(entry); save();
        try {
            const response = await provider.generate(request, tokens);
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
try {
    const review = renewalInput({ state: originalState, reference, history, messages });
    const checked = await validatedStaging({ conversation: plannerMessages(RENEWAL_SYSTEM, review.prompt, review.schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY), schema: review.schema,
        generate: (request, attempt) => generate(`renewal${attempt ? '-repair' : ''}`, request, 6500, planner),
        validate: value => applyDevelopmentReview(originalState, value, review.indices) });
    saveJson('renewal-validation.json', checked.attempts);
    if (live && !checked.value) throw Error('Scheduled renewal rejected');
    const renewed = checked.value ?? originalState; saveJson('renewed-state.json', renewed);
    let continuation;
    for (const variant of ['original', 'renewed', 'clarified']) {
        const state = variant === 'original' ? originalState : renewed;
        const branch = [...messages, { index: 24, role: 'user', content: probes[9] }];
        const request = presetWriterInput({ preset, reference, history, messages: branch, clarified: variant === 'clarified' });
        injectRepertoire(request, state);
        const raw = await generate(`${variant}-writer`, request, preset.maxOutput, writer);
        if (raw) branch.push({ index: 25, role: 'assistant', content: raw });
        saveJson(`${variant}-conversation.json`, branch);
        if (variant === 'clarified') continuation = branch;
    }
    if (live) for (const [round, prompt] of report.continuationProbes.entries()) {
        continuation.push({ index: continuation.length, role: 'user', content: prompt });
        const request = presetWriterInput({ preset, reference, history, messages: continuation, clarified: true });
        injectRepertoire(request, renewed);
        const raw = await generate(`continuation-${round}-writer`, request, preset.maxOutput, writer);
        continuation.push({ index: continuation.length, role: 'assistant', content: raw });
        saveJson('continued-conversation.json', continuation);
    }
} catch (error) { report.error = error.message; console.log(JSON.stringify({ error: report.error })); }
report.ended = new Date().toISOString(); save();
