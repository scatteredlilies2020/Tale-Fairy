import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { touringCase } from './single-pass-planner-cases.mjs';
import { developmentState, maintainDevelopments, maintenanceInput, writerPreparation, maintenanceSchema, MAINTENANCE_SYSTEM } from './development-maintenance-prototype.mjs';
import { PREPARATION_SYSTEM, PREPARATION_SCHEMA, preparationInput, validatePreparation } from './development-preparation-prototype.mjs';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { extractJson } from '../extension/analysis.js';

const live = process.argv.includes('--live');
if (!process.env.TF_EVAL_OUTPUT || !process.env.TF_PREPARATION) throw Error('Explicit preparation and output required.');
const output = path.resolve(process.env.TF_EVAL_OUTPUT), repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
for (const p of [repo, process.env.TF_ST_ROOT].filter(Boolean).map(p => path.resolve(p).toLowerCase())) if (output.toLowerCase() === p || output.toLowerCase().startsWith(p + path.sep)) throw Error('Isolated output required.');
if (fs.existsSync(output)) throw Error('Fresh output required.');
fs.mkdirSync(output, { recursive: true });
const provider = live ? isolatedProvider(process.env.TF_ST_ROOT, { mode: process.env.TF_REASONING || 'off' }) : null;
const fixture = touringCase(), preparation = JSON.parse(fs.readFileSync(process.env.TF_PREPARATION));
let state = developmentState(preparation, fixture.notebook.items), messages = [...fixture.messages];
const report = { started: new Date().toISOString(), live, configuration: provider?.configuration,
    protocol: 'Previously generated unedited proposals. Fixed accepted touring sequence from baseline, not proof of AI-invented events. Routine ownership and writer samples; broad re-review observes all preserved designs. No AI repair; transient retries logged.',
    protocolHash: crypto.createHash('sha256').update(['evaluate-development-lifecycle.mjs', 'development-maintenance-prototype.mjs', 'development-preparation-prototype.mjs', 'isolated-planner-provider.mjs'].map(p => fs.readFileSync(new URL(p, import.meta.url))).join('\n')).digest('hex'), runs: [] };
const save = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
save();
async function generate(id, conversation, tokens) {
    const run = { id, attempts: [] }; report.runs.push(run); save();
    fs.writeFileSync(path.join(output, `${id}-messages.json`), JSON.stringify(conversation, null, 2));
    if (!provider) return null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        const entry = { attempt }, started = Date.now(); run.attempts.push(entry); save();
        try {
            const r = await provider.generate(conversation, tokens); entry.elapsedMs = Date.now() - started; entry.usage = r.usage; entry.finishReason = r.finishReason;
            fs.writeFileSync(path.join(output, `${id}-output.txt`), r.text); save(); return r.text;
        } catch (e) {
            entry.elapsedMs = Date.now() - started; entry.error = e.status ? `HTTP ${e.status}` : 'Transport failed'; save();
            if (attempt === 3 || ![429, 502, 503, 504].includes(e.status)) throw Error(entry.error);
            await new Promise(r => setTimeout(r, attempt * 5000));
        }
    }
}
try {
    for (const stage of fixture.stages) {
        messages.push(...stage.append);
        const built = maintenanceInput({ state, reference: fixture.bootstrap, messages });
        fs.writeFileSync(path.join(output, `${stage.name}-before.json`), JSON.stringify(state, null, 2));
        const raw = await generate(stage.name, plannerMessages(MAINTENANCE_SYSTEM, built.prompt, maintenanceSchema(state), PLANNER_OUTPUT_MODE.PROMPT_ONLY), 2500);
        if (raw) {
            state = maintainDevelopments(state, extractJson(raw), built.indices);
            const run = report.runs.at(-1); run.valid = true; run.inputTokens = built.inputTokens; run.selected = state.selected.map(s => s.id); run.observations = state.observations.length; run.remainingLocal = state.local.map(r => r.id); save();
            fs.writeFileSync(path.join(output, `${stage.name}-after.json`), JSON.stringify(state, null, 2));
            console.log(JSON.stringify({ stage: stage.name, selected: run.selected, observations: run.observations, remainingLocal: run.remainingLocal }));
        }
        if (['chosen-transition', 'unrelated-pressure', 'later-review'].includes(stage.name)) {
            // Writer outputs are samples only; do not silently append them to
            // this fixed accepted sequence. A separate emergent test is needed.
            const writerSystem = 'Continue the roleplay directly from the final user message, at most 500 words. The source defines the setting and player agency. Private preparation is optional creative material, NOT accepted history or character knowledge. Only manifest what fits the present place, time and actions. Do not replay completed events, force the player\'s choices or skip ahead. Do not mention planning. Let independent NPC interests have specific substance. Respect refusals and revisions in accepted play over original private designs.';
            const input = JSON.stringify({ source: fixture.bootstrap, accepted_messages: messages, private_preparation: writerPreparation(state) });
            await generate(`${stage.name}-writer`, [{ role: 'system', content: writerSystem }, { role: 'user', content: input }], 1800);
        }
    }
    // Non-destructive review probe: assess returned proposals for whether the
    // old designs and accepted revisions survived. Not merged over originals.
    const built = preparationInput({ reference: fixture.bootstrap, messages, existing: state.developments,
        historical: { accepted_development_observations: state.observations, invalidated_proposals: state.invalidated }, instruction: 'Review this repertoire after the accepted changes. Preserve useful substance, revise contradicted parts, and do not restart the work or retell the costume incident. Return a coherent updated repertoire; do not add material merely to fill slots.' });
    const raw = await generate('broad-rereview', plannerMessages(PREPARATION_SYSTEM, built.prompt, PREPARATION_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY), 7000);
    if (raw) { validatePreparation(extractJson(raw)); report.runs.at(-1).valid = true; save(); }
} catch (e) { report.error = /^HTTP \d+$|^Transport failed$/.test(e.message) ? e.message : 'Lifecycle validation failed; inspect saved raw output.'; console.log(JSON.stringify({ error: report.error })); }
report.ended = new Date().toISOString(); save();
