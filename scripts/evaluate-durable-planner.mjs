// Opt-in isolated evaluation. Transport retries are recorded; no AI repair.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { durableState, durablePrompt, mergeDurable, DURABLE_SCHEMA, DURABLE_SYSTEM } from './durable-planner-prototype.mjs';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { touringCase, closedCase } from './single-pass-planner-cases.mjs';
import { cases as gmCases } from './gm-evaluation-cases.mjs';
import { extractJson } from '../extension/analysis.js';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';

const live = process.argv.includes('--live');
const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = path.resolve(process.env.TF_EVAL_OUTPUT || path.join(os.tmpdir(), `tf-durable-${Date.now()}`));
for (const forbidden of [repo, process.env.TF_ST_ROOT].filter(Boolean).map(p => path.resolve(p))) {
    if (output.toLowerCase() === forbidden.toLowerCase() || output.toLowerCase().startsWith((forbidden + path.sep).toLowerCase())) throw Error('Artifacts must be outside repository and ST.');
}
if (fs.existsSync(path.join(output, 'report.json'))) throw Error('Choose a fresh artifact directory.');
fs.mkdirSync(output, { recursive: true });
const requested = (process.env.TF_CASES || 'frozen-real,touring,closed,life').split(',');
const repeats = Number(process.env.TF_REPEATS || 1);
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 3) throw Error('Repeat limit 1–3.');
const provider = live ? isolatedProvider(process.env.TF_ST_ROOT, { mode: process.env.TF_REASONING || 'off' }) : null;
const report = { started: new Date().toISOString(), live, configuration: provider?.configuration, runs: [],
    protocolHash: crypto.createHash('sha256').update(['scripts/durable-planner-prototype.mjs', 'scripts/evaluate-durable-planner.mjs', 'scripts/isolated-planner-provider.mjs'].map(p => fs.readFileSync(path.join(repo, p))).join('\n')).digest('hex'),
    protocol: 'Same configured planner, one successful completion per step. At most two logged transport retries for 429/502/503/504; no response repair. Failed sequence stops, independent cases continue. Complete ongoing record input; overflow fails closed. Synthetic events are fixed, not writer generated.',
};
const save = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
save();

for (const name of requested) {
    for (let trial = 1; trial <= repeats; trial++) {
        let fixture, state, reference, messages, instruction = '', historical = {}, stages;
        if (name === 'frozen-real') {
            const frozen = JSON.parse(fs.readFileSync(path.join(process.env.TF_SCOPE_SNAPSHOT, 'review-saved-input.json')));
            reference = frozen.rp_reference; messages = frozen.messages;
            state = durableState(frozen.current.preparedWorld.items);
            historical = { story_evidence: frozen.story_evidence, historical_evidence: frozen.historical_evidence, summary_sources: frozen.summary_sources, constraints: frozen.constraints,
                legacy_framing: { approach: frozen.current.preparedWorld.approach, summary: frozen.current.preparedWorld.summary } };
            instruction = 'I care less about this particular arc and am playing it out to see it finish. Mid-to-long-term planning matters more than extending this arc.';
            stages = [{ name: 'review', broad: true, append: [] }];
        } else if (name === 'life') {
            fixture = gmCases.life; reference = { description: fixture.description, persona: 'The player controls Rowan. Everyone else has independent agency.' };
            messages = fixture.messages; state = durableState(); stages = [{ name: 'review', broad: true, append: [] }];
        } else {
            fixture = name === 'touring' ? touringCase() : name === 'closed' ? closedCase() : null;
            if (!fixture) throw Error('Unknown case.');
            state = durableState(fixture.notebook.items); reference = fixture.bootstrap; messages = structuredClone(fixture.messages); stages = process.env.TF_INITIAL_ONLY === '1' ? fixture.stages.slice(0, 1) : fixture.stages;
        }
        fs.writeFileSync(path.join(output, `${name}-${trial}-fixture.json`), JSON.stringify({ reference, messages, instruction, historical, stages }, null, 2));
        for (const stage of stages) {
            messages.push(...stage.append);
            const id = `${name}-${trial}-${stage.name}`, run = { id, broad: stage.broad, attempts: [] }; report.runs.push(run); save();
            try {
                const built = durablePrompt({ state, reference, messages, broad: stage.broad, instruction, historical }, stage.broad ? 14000 : 10000);
                run.inputTokens = built.inputTokens;
                fs.writeFileSync(path.join(output, `${id}-input.json`), built.prompt);
                fs.writeFileSync(path.join(output, `${id}-before.json`), JSON.stringify(state, null, 2));
                if (live) {
                    let result;
                    for (let attempt = 1; attempt <= 3; attempt++) {
                        const started = Date.now(), entry = { attempt }; run.attempts.push(entry); save();
                        try { result = await provider.generate(plannerMessages(DURABLE_SYSTEM, built.prompt, DURABLE_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY), stage.broad ? 6144 : 4096); entry.elapsedMs = Date.now() - started; entry.usage = result.usage; save(); break; }
                        catch (error) { entry.elapsedMs = Date.now() - started; entry.error = error.status ? `HTTP ${error.status}` : 'Transport failed'; save(); if (attempt === 3 || ![429, 502, 503, 504].includes(error.status)) throw Error(entry.error); await new Promise(resolve => setTimeout(resolve, attempt * 5000)); }
                    }
                    fs.writeFileSync(path.join(output, `${id}-output.txt`), result.text);
                    const parsed = extractJson(result.text);
                    state = mergeDurable(state, parsed, built.indices);
                    fs.writeFileSync(path.join(output, `${id}-after.json`), JSON.stringify(state, null, 2));
                    run.valid = true; run.ongoing = state.ongoing.map(r => r.id); run.episodes = state.episodes.map(r => r.id); run.legacy = state.legacy.map(r => r.id); run.archived = state.archive.map(r => r.record.id); run.writer = state.writer.map(r => r.id);
                }
                save(); console.log(JSON.stringify({ id, valid: run.valid, inputTokens: run.inputTokens, ongoing: run.ongoing, episodes: run.episodes, legacy: run.legacy }));
            } catch (error) {
                run.error = /^HTTP \d+$|^Complete durable input/.test(error.message) ? error.message : 'Validation, fitting or transport failure; inspect saved response.';
                save(); console.log(JSON.stringify({ id, error: run.error })); break;
            }
        }
    }
}
report.ended = new Date().toISOString(); save(); console.log(JSON.stringify({ output, complete: true }));
