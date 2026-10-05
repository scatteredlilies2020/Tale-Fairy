// Opt-in production-path evaluation with synthetic accepted play only. Artifacts
// stay outside the repo and SillyTavern; no writer reply or live state is saved.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { touringCase, relationshipCase, closedCase } from './single-pass-planner-cases.mjs';
import { journeyCase, musicClubCase } from './story-activity-cases.mjs';
import { emptyCampaign, campaignPayloadBudget, validCampaignState } from '../extension/campaign-planner.js';
import { preparationInput, preparationPass, PLANNER_OUTPUT_LIMIT } from '../extension/story-preparation.js';
import { campaignCheckpoint } from '../extension/campaign-review.js';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { fitStoryInputBudget } from '../extension/story-budget.js';

const root = process.env.TF_ST_ROOT, directory = process.env.TF_EVAL_OUTPUT;
if (!root || !directory) throw Error('TF_ST_ROOT and external TF_EVAL_OUTPUT required');
const output = path.resolve(directory), repo = fileURLToPath(new URL('..', import.meta.url));
for (const base of [root, repo].map(p => path.resolve(p))) {
    if (output === base || output.startsWith(base + path.sep)) throw Error('External artifact directory required');
}
fs.mkdirSync(output, { recursive: true });
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const cases = { journey: journeyCase, collaboration: musicClubCase, relationship: relationshipCase,
    incident: touringCase, bounded: closedCase };
const chosen = process.env.TF_CASE ? { [process.env.TF_CASE]: cases[process.env.TF_CASE] } : cases;
if (Object.values(chosen).some(value => !value)) throw Error('Unknown TF_CASE');
const samples = Number(process.env.TF_EVAL_SAMPLES || 2);
if (!Number.isInteger(samples) || samples < 1 || samples > 3) throw Error('One to three samples supported');
const live = process.argv.includes('--live');
const provider = live ? isolatedProvider(root, { mode: process.env.TF_REASONING || 'off' }) : null;
const settingsFile = path.join(root, 'data/default-user/settings.json');
const settingsBefore = hash(fs.readFileSync(settingsFile));
const reports = [];
const write = (name, value) => fs.writeFileSync(path.join(output, `${name}.json`), JSON.stringify(value, null, 2));

async function evaluate(name, create, sample) {
    const fixture = create(), userName = name === 'relationship' ? 'Alex' : 'Neri';
    const chatId = `synthetic-${name}-${sample}`, reference = fixture.bootstrap;
    let messages = fixture.messages.map((row, index) => ({ index, role: row.is_user ? 'user' : 'assistant',
        ...(row.is_user ? { name: userName } : {}), content: row.mes }));
    if (name === 'incident') messages.push(...fixture.stages[1].append.map((row, offset) => ({
        index: messages.length + offset, role: row.is_user ? 'user' : 'assistant',
        ...(row.is_user ? { name: userName } : {}), content: row.mes,
    })));
    let state = emptyCampaign();
    const stages = ['initial', 'routine', ...(sample === 1 ? [name === 'bounded' ? 'closure' : 'refusal'] : [])];
    for (const stage of stages) {
        const label = `${name}-${sample}-${stage}`;
        if (stage === 'routine') messages.push({ index: messages.length, role: 'user', name: userName,
            content: name === 'incident' ? 'I keep checking the address with Mara. I have not agreed to any new outing or undertaking.'
                : 'I take my time here with them. I have not agreed to a new outing, project or undertaking.' });
        if (stage === 'closure') messages.push({ index: messages.length, role: 'assistant',
            content: 'The family finishes the meal. Ada feels heard, Len has listened, and they say good night. This one-evening encounter is over.' },
        { index: messages.length + 1, role: 'user', name: userName, content: 'That is the end of this story. No sequel.' });
        if (stage === 'refusal') {
            const id = state.workingPlan?.outlook?.[0]?.trajectoryId;
            const focus = state.workingPlan?.trajectories?.find(row => row.id === id)?.focus;
            if (!focus) { reports.push({ case: name, sample, stage, skipped: 'No selected outlook to refuse.' }); continue; }
            messages.push({ index: messages.length, role: 'user', name: userName,
                content: `I do not want to pursue ${focus}. Drop that possibility; I would rather stay here with the people already present.` });
        }
        const source = { chatId, referenceHash: hash(reference), fingerprint: hash(messages), messageCount: messages.length };
        const proof = { ...source, messages, fingerprint: hash };
        const checkpoint = campaignCheckpoint(state, proof);
        const planning = checkpoint || emptyCampaign();
        const input = preparationInput({ reference, state: planning, messages, playerNames: [userName, ...(name === 'incident' || name === 'bounded' ? ['Edda'] : [])],
            previousUsable: Boolean(checkpoint), reviewedMessageCount: checkpoint?.source?.messageCount || 0,
            verifiedPlanEvidence: checkpoint?.planEvidence || {} });
        const before = JSON.stringify(planning);
        if (!live) { write(label, { input }); console.log(JSON.stringify({ case: name, sample, stage, dry: true, inputTokens: input.inputTokens })); break; }
        const calls = [], started = Date.now();
        let result;
        try {
            result = await preparationPass({ state: planning, input, source, generate: async (prompt, system, schema, metadata) => {
                const fitted = await fitStoryInputBudget(prompt, system, schema, input.inputLimit, undefined, { softTarget: true });
                const request = plannerMessages(system, fitted.prompt, schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY);
                const call = { stage: metadata.stage, repair: Boolean(metadata.recoveryReason), error: metadata.recoveryReason,
                    request, inputTokens: fitted.tokens };
                calls.push(call);
                const start = Date.now();
                const response = await provider.generate(request, PLANNER_OUTPUT_LIMIT);
                Object.assign(call, { response, milliseconds: Date.now() - start });
                return { ...response, plannerInputTokens: fitted.tokens, plannerPrompt: fitted.prompt };
            } });
        } catch (error) { result = { accepted: false, error: error.message, state: planning }; }
        if (JSON.stringify(planning) !== before) throw Error('Planner mutated its input snapshot');
        const packet = result.accepted ? campaignPayloadBudget(result.state) : null;
        const { payload, ...writerBudget } = packet || {};
        const report = { case: name, sample, stage, accepted: result.accepted, error: result.error,
            valid: result.accepted && validCampaignState(result.state), calls: calls.length,
            repairs: calls.filter(call => call.repair).length, milliseconds: Date.now() - started,
            writerBudget, budget: result.budget, recovery: result.recovery,
            horizonsPreserved: stage === 'routine' && result.accepted ? JSON.stringify(planning.workingPlan?.outlook) === JSON.stringify(result.state.workingPlan?.outlook) : undefined };
        reports.push(report);
        write(label, { report, reference, messages, calls, result, writer: payload });
        console.log(JSON.stringify(report));
        if (!result.accepted || !report.valid) break;
        state = result.state;
    }
}

// Only independent synthetic cases run concurrently; each story's updates stay sequential.
const jobs = Object.entries(chosen).flatMap(([name, create]) => Array.from({ length: samples }, (_, i) => ({ name, create, sample: i + 1 })));
let next = 0;
await Promise.all(Array.from({ length: Math.min(2, jobs.length) }, async () => {
    while (next < jobs.length) { const job = jobs[next++]; await evaluate(job.name, job.create, job.sample); }
}));
const summary = { live, provider: provider?.configuration, reports,
    settingsUnchanged: hash(fs.readFileSync(settingsFile)) === settingsBefore,
    limitation: 'Synthetic accepted play, static references, no live World Info/Continuity injection and no writer reply. Structural success does not prove prose quality or pacing.' };
write('summary', summary);
console.log(JSON.stringify({ complete: true, output, evaluated: reports.filter(row => !row.skipped).length,
    accepted: reports.filter(row => row.accepted).length, failed: reports.filter(row => row.accepted === false).length,
    settingsUnchanged: summary.settingsUnchanged }));
if (reports.some(row => row.accepted === false)) process.exitCode = 1;
