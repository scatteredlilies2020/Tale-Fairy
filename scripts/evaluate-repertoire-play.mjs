import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { developmentState, maintainDevelopments, maintenanceInput, maintenanceSchema, MAINTENANCE_SYSTEM } from './development-maintenance-prototype.mjs';
import { storytellerInput } from './development-storyteller-prototype.mjs';
import { injectRepertoire } from './development-repertoire-request.mjs';
import { validatedStaging } from './development-validation-prototype.mjs';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { estimateTokenCount } from '../extension/token-budget.js';
import { touringCase } from './single-pass-planner-cases.mjs';
import { MEMORY_SYSTEM, memorySchema, updateMemory } from './development-memory-prototype.mjs';
import { RENEWAL_SYSTEM, renewalInput, applyDevelopmentReview } from './development-renewal-prototype.mjs';

const live = process.argv.includes('--live');
for (const key of ['TF_EVAL_OUTPUT', 'TF_DRAFTS', 'TF_PROBES', 'TF_CASE']) if (!process.env[key]) throw Error(`Missing ${key}`);
const output = path.resolve(process.env.TF_EVAL_OUTPUT), repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
for (const p of [repo, process.env.TF_ST_ROOT].filter(Boolean).map(p => path.resolve(p).toLowerCase())) if (output.toLowerCase() === p || output.toLowerCase().startsWith(p + path.sep)) throw Error('Isolated output required.');
if (fs.existsSync(output)) throw Error('Fresh output required.');
const name = process.env.TF_CASE;
const source = JSON.parse(fs.readFileSync(path.join(process.env.TF_DRAFTS, `${name}-input.json`)));
const preparation = JSON.parse(fs.readFileSync(path.join(process.env.TF_DRAFTS, `${name}-preparation.json`)));
const probeReport = JSON.parse(fs.readFileSync(process.env.TF_PROBES, 'utf8').replace(/^\uFEFF/, ''));
if (probeReport.name !== name || !Array.isArray(probeReport.prompts)) throw Error('Wrong probe source');
const prompts = probeReport.prompts;
const { source_reference: reference, accepted_messages, existing_preparation, ...history } = source;
const fixture = name === 'touring' ? touringCase() : null;
let state = developmentState(preparation, fixture?.notebook.items ?? []), messages = fixture
    ? [...fixture.messages, ...fixture.stages[1].append, ...fixture.stages[2].append, ...fixture.stages[3].append]
    : structuredClone(accepted_messages);
let firstRound = 0, recoveredWriter = false;
if (process.env.TF_RECOVER_ACCEPTED_WRITER) {
    const prior = path.resolve(process.env.TF_RECOVER_ACCEPTED_WRITER);
    const previous = JSON.parse(fs.readFileSync(path.join(prior, 'report.json')));
    if (previous.name !== name || previous.error !== 'Maintenance rejected after bounded repair' || JSON.stringify(previous.prompts) !== JSON.stringify(prompts)) throw Error('Only failed-maintenance writer recovery supported');
    const checkpoints = fs.readdirSync(prior).map(f => /^round-(\d+)-state\.json$/.exec(f)).filter(Boolean).map(m => Number(m[1]));
    if (!checkpoints.length) throw Error('Missing recovery checkpoint');
    const last = Math.max(...checkpoints); firstRound = last + 1;
    state = JSON.parse(fs.readFileSync(path.join(prior, `round-${last}-state.json`)));
    messages = JSON.parse(fs.readFileSync(path.join(prior, 'accepted-conversation.json')));
    if (messages.at(-1)?.role !== 'assistant' || JSON.stringify(state.developments) !== JSON.stringify(preparation.developments)) throw Error('Recovery source mismatch');
    const raw = fs.readFileSync(path.join(prior, `round-${firstRound}-writer-output.txt`), 'utf8');
    if (!raw.trim() || !previous.runs.find(r => r.id === `round-${firstRound}-writer`)?.attempts.some(a => a.finishReason === 'stop')) throw Error('No complete accepted writer to recover');
    if (prompts[firstRound]) messages.push({ index: messages.length, role: 'user', content: prompts[firstRound] });
    messages.push({ index: messages.length, role: 'assistant', content: raw }); recoveredWriter = true;
}
const provider = live ? isolatedProvider(process.env.TF_ST_ROOT) : null;
fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(path.join(output, 'protocol-snapshot'));
const files = ['evaluate-repertoire-play.mjs', 'development-memory-prototype.mjs', 'development-renewal-prototype.mjs', 'development-review-prototype.mjs', 'development-repertoire-request.mjs', 'development-validation-prototype.mjs', 'development-storyteller-prototype.mjs', 'development-maintenance-prototype.mjs', 'development-preparation-prototype.mjs', 'isolated-planner-provider.mjs', 'single-pass-planner-cases.mjs'];
for (const file of files) fs.copyFileSync(new URL(file, import.meta.url), path.join(output, 'protocol-snapshot', file));
for (const file of ['request-injection.js', 'injection-role.js', 'output-negotiation.js']) fs.copyFileSync(new URL(`../extension/${file}`, import.meta.url), path.join(output, 'protocol-snapshot', `extension-${file}`));
const report = { name, started: new Date().toISOString(), live, configuration: provider?.configuration, prompts, preparationPath: process.env.TF_DRAFTS, probeSource: process.env.TF_PROBES,
    protocol: 'Complete unchanged broad repertoire at production near-user injection slot. No scene-staging author or selector. Routine accepted-memory maintenance after rounds 0, 3, 6 and final; cannot rewrite proposals. One deterministic-validation repair maximum, logged separately, no semantic rerolls. Fictional time and attention supplied by fixed user probes, not discoveries or outcomes. Synthetic writer policy/planner model, not full ST preset. No ST writes. No initial local notebook imported; explicit branch closure is user supplied, not a demonstrated model resolution.',
    protocolHash: crypto.createHash('sha256').update(files.map(f => fs.readFileSync(new URL(f, import.meta.url))).join('\n')).digest('hex'), runs: [] };
if (fixture) report.protocol += ' Touring overrides the preceding actual-case local-state note: three original delivery records are imported, with fixed accepted closure/arrival only, no handwritten musical development.';
report.protocol += ' v16: memory-only routine omits unused selection output. Review is invoked on an accepted review_needed or at the final round, with one deterministic repair maximum. A review may change private designs transactionally, never accepted observations.';
report.resumedFrom = process.env.TF_RECOVER_ACCEPTED_WRITER ?? null;
report.firstRound = firstRound;
report.recoveredAcceptedWriter = recoveredWriter ? `Unchanged round-${firstRound} writer from prior failed-maintenance run; no writer reroll. New memory/review contract, not a same-protocol resume.` : null;
const save = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); save();
let nextRequestAt = Date.now();
async function generate(id, request, tokens) {
    const inputTokens = estimateTokenCount(JSON.stringify(request));
    if (inputTokens > 24000) throw Error('Complete request exceeds 24000 estimated tokens');
    fs.writeFileSync(path.join(output, `${id}-messages.json`), JSON.stringify(request, null, 2));
    const run = { id, inputTokens, attempts: [] }; report.runs.push(run); save();
    if (!provider) return null;
    for (let i = 0; i < 3; i++) {
        const delay = nextRequestAt - Date.now(); if (delay > 0) await new Promise(r => setTimeout(r, delay));
        nextRequestAt = Date.now() + 25000;
        const entry = { attempt: i + 1 }, started = Date.now(); run.attempts.push(entry); save();
        try {
            const response = await provider.generate(request, tokens);
            Object.assign(entry, { elapsedMs: Date.now() - started, usage: response.usage, finishReason: response.finishReason });
            fs.writeFileSync(path.join(output, `${id}-output.txt`), response.text); save();
            if (response.finishReason === 'length' || !response.text.trim()) throw Error('Incomplete completion');
            return response.text;
        } catch (error) {
            entry.elapsedMs = Date.now() - started; entry.error = error.status ? `HTTP ${error.status}` : 'Generation failed'; save();
            if (i === 2 || ![502, 503, 504].includes(error.status)) throw Error(entry.error);
            await new Promise(r => setTimeout(r, (i + 1) * 30000));
        }
    }
}
try {
    for (let round = firstRound; round < prompts.length; round++) {
        if (!recoveredWriter && prompts[round]) messages.push({ role: 'user', content: prompts[round] });
        messages = messages.map((m, index) => ({ index, role: m.role ?? (m.is_user ? 'user' : 'assistant'), content: m.content ?? m.mes }));
        if (!recoveredWriter) {
            const built = storytellerInput({ reference, history, state: { ...state, developments: [] }, messages });
            injectRepertoire(built.conversation, state);
            const raw = await generate(`round-${round}-writer`, built.conversation, 2000);
            if (raw) messages.push({ index: messages.length, role: 'assistant', content: raw });
        }
        recoveredWriter = false;
        fs.writeFileSync(path.join(output, 'accepted-conversation.json'), JSON.stringify(messages, null, 2));
        if ([0, 3, 6, prompts.length - 1].includes(round)) {
            const built = maintenanceInput({ state, reference, messages }, 24000), schema = memorySchema(state);
            const checked = await validatedStaging({ conversation: plannerMessages(MEMORY_SYSTEM, built.prompt, schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY), schema,
                generate: (request, attempt) => generate(`round-${round}-maintenance${attempt ? '-repair' : ''}`, request, 3200),
                validate: value => updateMemory(state, value, built.indices) });
            fs.writeFileSync(path.join(output, `round-${round}-validation.json`), JSON.stringify(checked.attempts, null, 2));
            if (live && !checked.value) throw Error('Maintenance rejected after bounded repair');
            if (checked.value) state = checked.value;
            if (state.reviewNeeded || round === prompts.length - 1) {
                const review = renewalInput({ state, reference, history, messages });
                fs.writeFileSync(path.join(output, `round-${round}-before-review.json`), JSON.stringify(state, null, 2));
                const renewed = await validatedStaging({ conversation: plannerMessages(RENEWAL_SYSTEM, review.prompt, review.schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY), schema: review.schema,
                    generate: (request, attempt) => generate(`round-${round}-review${attempt ? '-repair' : ''}`, request, 6500),
                    validate: value => applyDevelopmentReview(state, value, review.indices) });
                fs.writeFileSync(path.join(output, `round-${round}-review-validation.json`), JSON.stringify(renewed.attempts, null, 2));
                if (live && !renewed.value) throw Error('Review rejected after bounded repair');
                if (renewed.value) state = renewed.value;
            }
        }
        fs.writeFileSync(path.join(output, `round-${round}-state.json`), JSON.stringify(state, null, 2));
        fs.writeFileSync(path.join(output, 'accepted-conversation.json'), JSON.stringify(messages, null, 2));
        save(); console.log(JSON.stringify({ name, round, observations: state.observations.length }));
    }
} catch (error) { report.error = error.message; console.log(JSON.stringify({ error: report.error })); }
report.ended = new Date().toISOString(); save();
