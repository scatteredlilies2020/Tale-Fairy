import fs from 'node:fs';
import { injectStagedPreparation } from './development-request-prototype.mjs';
import { validatedStaging } from './development-validation-prototype.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { touringCase } from './single-pass-planner-cases.mjs';
import { developmentState, maintainDevelopments, maintenanceInput, maintenanceSchema, MAINTENANCE_SYSTEM } from './development-maintenance-prototype.mjs';
import { storytellerInput } from './development-storyteller-prototype.mjs';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { extractJson } from '../extension/analysis.js';
import { STAGING_SYSTEM, stagingInput, stageDevelopments, stagedWriterMaterial } from './development-staging-prototype.mjs';
import { estimateTokenCount } from '../extension/token-budget.js';
import { ENACTMENT_SYSTEM, enactmentInput } from './development-enactment-prototype.mjs';

const live = process.argv.includes('--live');
const name = process.env.TF_CASE;
const handoff = process.env.TF_HANDOFF || 'full';
const probe = process.env.TF_PROBE || 'personal';
if (!['personal', 'journey'].includes(probe) || (probe === 'journey' && name !== 'frozen-real')) throw Error('Invalid probe.');
if (!['full', 'staged', 'enacted'].includes(handoff)) throw Error('Invalid handoff.');
const requestIntervalMs = Number(process.env.TF_REQUEST_INTERVAL_MS ?? 25000);
if (!Number.isInteger(requestIntervalMs) || requestIntervalMs < 25000 || requestIntervalMs > 120000) throw Error('Invalid isolated request interval.');
if (!['touring', 'frozen-real'].includes(name) || !process.env.TF_EVAL_OUTPUT || !process.env.TF_DRAFTS) throw Error('Explicit case, drafts and output required.');
const output = path.resolve(process.env.TF_EVAL_OUTPUT), repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
for (const p of [repo, process.env.TF_ST_ROOT].filter(Boolean).map(p => path.resolve(p).toLowerCase())) if (output.toLowerCase() === p || output.toLowerCase().startsWith(p + path.sep)) throw Error('Isolated output required.');
if (fs.existsSync(output)) throw Error('Fresh output required.');
fs.mkdirSync(output, { recursive: true });
const provider = live ? isolatedProvider(process.env.TF_ST_ROOT) : null;
const source = JSON.parse(fs.readFileSync(path.join(process.env.TF_DRAFTS, `${name}-input.json`)));
const preparation = JSON.parse(fs.readFileSync(path.join(process.env.TF_DRAFTS, `${name}-preparation.json`)));
const fixture = touringCase();
let state = developmentState(preparation, name === 'touring' ? fixture.notebook.items : []);
let messages = name === 'touring' ? [...fixture.messages, ...fixture.stages[1].append, ...fixture.stages[2].append, ...fixture.stages[3].append] : [...source.accepted_messages];
const { source_reference: reference, accepted_messages, existing_preparation, explicit_user_instruction, ...history } = source;
const prompts = probe === 'journey' ? [
    null,
    'For this isolated story branch, the bridge and weigh-house job is finished, with no remaining obligation or hidden continuation. A week of ordinary travel has passed. I ask the party what they would like to explore next. I am up for the journey, not more of that finished case.',
    'That interests me. I go with them to take a closer look, without deciding the discovery or outcome in advance.',
    'I explore what we have reached and ask Frieren to show how it actually works. I want to get beyond the entrance or invitation, leaving my own reaction open.',
    'I try the approach they suggest and stay for the result. Let us play out the attempt; the others can make their own choices.',
    'I do not want to settle here or take on a permanent obligation. Let us finish what we can here and continue our journey, without inventing another hidden reason we must stay.',
    'After leaving, a month passes in ordinary travel. I ask what that experience has changed for the others, and what different possibility it has opened up. We are not returning to the old commission.',
    'I take up that new possibility with them. I would like to experience the changed circumstances, not just be promised something later.',
    'At dinner our cooking pot cracks. I ask what we can make with the equipment we have left. This mishap need not be connected to anything bigger.',
    'A season later, farther along the journey, I ask where their ongoing interests have led and what there is to experience now. I have not committed to an itinerary or a permanent role.',
    'I would like to experience some of that with them. Let this episode reach a genuine resting point rather than stopping at another offer, while leaving my own decisions and reactions to me.',
] : name === 'touring' ? [
    null,
    'I listen to what Jo has to share, then ask to try a little of it together in private. No public booking; I leave the musical decisions to the musicians.',
    'I would rather not turn this into a public performance or a trip to find help. What can we actually try differently with what we have here? I am happy to watch them experiment.',
    'Two days later, we are still in Mere. The guesthouse oven breaks. I ask the cook what we can make without it; the others need not abandon their own plans over dinner.',
    'After the meal, I ask Jo what she decided to keep or change in her own work. I would like to hear the changed version, not organize anything.',
    'A month passes on ordinary spring travels, with informal practice when people want it and no public booking of the new work. Tonight we share a camp. I ask what people have been making for themselves, and whether there is something they want to show.',
    'I ask Mara about her own interests for a while. I am curious, but I am not volunteering for another job or choosing our next destination.',
    'Later that evening I ask Jo to show where her work has arrived. I would like to experience a little of it as it is now, without deciding its eventual audience or future for her.',
] : [
    null,
    'For this isolated story branch, skip past the resolved bridge and weigh-house episode: the party has completed that job, there is no remaining obligation or hidden continuation of it, and a week of ordinary travel has passed. At camp I ask what the others have been interested in for themselves, apart from our commission and that finished job.',
    'I would like to see an actual attempt at that, not just hear a promise. I watch, leaving their choices to them.',
    'I do not want to turn this interest into an errand or a new route commitment. What can they try differently with what is available here? I leave them room to experiment.',
    'Three weeks pass on the journey. At tonight\'s camp, I ask what has changed in their own work since that first attempt. I would like to see something of it.',
    'The pot for dinner has cracked. I ask what we can make with the ingredients and equipment we have left. We need not connect this mishap to anything bigger.',
    'A month later, the party is resting in another town, with no return to the bridge business and no new itinerary chosen. I ask what people have kept working on for themselves, and what they would enjoy sharing today.',
    'I would like to experience some of that in its changed form. I am not asking for another assignment, reward, or mystery, and I leave my own reaction open.',
];
let firstRound = 0;
if (process.env.TF_RESUME) {
    const prior = path.resolve(process.env.TF_RESUME), previous = JSON.parse(fs.readFileSync(path.join(prior, 'report.json')));
    if (previous.name !== name || previous.handoff !== handoff || previous.error !== 'HTTP 429' || JSON.stringify(previous.prompts) !== JSON.stringify(prompts)) throw Error('Only an unchanged rate-limited protocol may resume.');
    const rounds = fs.readdirSync(prior).map(f => /^round-(\d+)-state\.json$/.exec(f)).filter(Boolean).map(m => Number(m[1]));
    if (!rounds.length) throw Error('No completed checkpoint.');
    const last = Math.max(...rounds);
    state = JSON.parse(fs.readFileSync(path.join(prior, `round-${last}-state.json`)));
    messages = JSON.parse(fs.readFileSync(path.join(prior, 'accepted-conversation.json')));
    if (JSON.stringify(state.developments) !== JSON.stringify(preparation.developments) || messages.at(-1)?.role !== 'assistant') throw Error('Checkpoint/source mismatch.');
    firstRound = last + 1;
}
const files = ['evaluate-emergent-development.mjs', 'development-validation-prototype.mjs', 'development-request-prototype.mjs', 'development-storyteller-prototype.mjs', 'development-staging-prototype.mjs', 'development-enactment-prototype.mjs', 'development-maintenance-prototype.mjs', 'development-preparation-prototype.mjs', 'isolated-planner-provider.mjs', 'single-pass-planner-cases.mjs'];
fs.mkdirSync(path.join(output, 'protocol-snapshot'));
for (const f of files) fs.copyFileSync(new URL(f, import.meta.url), path.join(output, 'protocol-snapshot', f));
const report = { name, handoff, firstRound, resumedFrom: process.env.TF_RESUME || null, started: new Date().toISOString(), live, configuration: provider?.configuration, protocol: 'Unedited saved preparation. Eight actual generated replies feed the next round. Fixed user probes supply attention, refusal and elapsed time, not creative contents or outcomes. Full mode supplies all preparation and updates maintenance three times. Staged/enacted modes stage concrete unaccepted material before each reply, while preserving all preparation; enacted explicitly separates evidence-based memory from new NPC authorship. Invalid maintenance is rejected, logged, and leaves durable state intact with no stale staging. Native conversation roles. No live ST chat/settings writes, no completion rerolls. Stop on 429; at most two logged transient retries for 502/503/504. Explicit resumes use the last completed checkpoint, never a new sample of a completed reply.', preparationPath: process.env.TF_DRAFTS, prompts, protocolHash: crypto.createHash('sha256').update(files.map(f => fs.readFileSync(new URL(f, import.meta.url))).join('\n')).digest('hex'), runs: [] };
report.requestIntervalMs = requestIntervalMs;
report.validationPolicy = 'One complete replacement allowed after deterministic contract rejection only. Original raw output and exact errors retained; never counted as first-pass validity. No semantic rerolls. Stop evaluation after exhausted staging repair rather than scoring an unguided writer as prepared play.';
report.probe = probe;
report.requestAdapter = 'Production ensureGuidanceInChat, user role at depth 1 embedded in latest user message, matching inspected ST settings. Writer preset remains a test fixture, not a full ST clone.';
if (probe === 'journey') report.protocol += ' Journey probe uses eleven fixed user turns including voluntary exploration, episode departure, fictional month/season transitions and an unrelated meal. It does not supply discoveries, NPC decisions or success outcomes. Preparation and probe differ from the personal-interest runs, so this is a scenario acceptance test, not an isolated causal comparison.';
const save = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); save();
// Shared provider capacity belongs to the user too. Pace starts and allow a
// full cooldown on an explicit rate-limit resume, rather than burst retries.
let nextRequestAt = Date.now() + (process.env.TF_RESUME ? 60000 : 0);
async function generate(id, conversation, tokens) {
    const run = { id, attempts: [] }; report.runs.push(run); save();
    fs.writeFileSync(path.join(output, `${id}-messages.json`), JSON.stringify(conversation, null, 2));
    if (!provider) return null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        const delay = nextRequestAt - Date.now();
        if (delay > 0) await new Promise(r => setTimeout(r, delay));
        nextRequestAt = Date.now() + requestIntervalMs;
        const entry = { attempt }, start = Date.now(); run.attempts.push(entry); save();
        try {
            const r = await provider.generate(conversation, tokens); entry.elapsedMs = Date.now() - start; entry.usage = r.usage; entry.finishReason = r.finishReason;
            fs.writeFileSync(path.join(output, `${id}-output.txt`), r.text); save();
            if (r.finishReason === 'length' || !r.text.trim()) throw Error('Incomplete completion.');
            return r.text;
        } catch (e) { entry.elapsedMs = Date.now() - start; entry.error = e.status ? `HTTP ${e.status}` : 'Generation failed'; save(); if (attempt === 3 || ![502, 503, 504].includes(e.status)) throw Error(entry.error); await new Promise(r => setTimeout(r, attempt * 30000)); }
    }
}
try {
    for (let i = firstRound; i < prompts.length; i++) {
        if (prompts[i]) messages.push({ role: 'user', content: prompts[i] });
        messages = messages.map((m, index) => ({ index, role: m.role ?? (m.is_user ? 'user' : 'assistant'), content: m.content ?? m.mes }));
        if (handoff !== 'full') {
            const built = (handoff === 'enacted' ? enactmentInput : stagingInput)({ state, reference, history, messages });
            state = { ...state, staged: [], selected: [] };
            const checked = await validatedStaging({
                conversation: plannerMessages(handoff === 'enacted' ? ENACTMENT_SYSTEM : STAGING_SYSTEM, built.prompt, built.schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY),
                schema: built.schema,
                generate: (request, attempt) => generate(`round-${i}-staging${attempt ? '-repair' : ''}`, request, 3200),
                validate: parsed => stageDevelopments(state, parsed, built.indices),
            });
            fs.writeFileSync(path.join(output, `round-${i}-validation.json`), JSON.stringify(checked.attempts, null, 2));
            report.runs.at(-1).valid = Boolean(checked.value);
            if (live && !checked.value) throw Error('Staging rejected after bounded repair.');
            if (checked.value) state = checked.value;
        }
        const built = storytellerInput({ reference, history, state: handoff !== 'full' ? { ...state, developments: [] } : state, messages });
        if (handoff !== 'full') {
            injectStagedPreparation(built.conversation, state);
            built.inputTokens = estimateTokenCount(JSON.stringify(built.conversation));
            if (built.inputTokens > 24000) throw Error('Complete staged writer context exceeds budget.');
        }
        const raw = await generate(`round-${i}-writer`, built.conversation, 2000);
        if (raw) { messages.push({ index: messages.length, role: 'assistant', content: raw }); report.runs.at(-1).inputTokens = built.inputTokens; }
        if (handoff === 'full' && [0, 4, 7].includes(i)) {
            const built = maintenanceInput({ state, reference, messages }, 24000);
            const raw = await generate(`round-${i}-maintenance`, plannerMessages(MAINTENANCE_SYSTEM, built.prompt, maintenanceSchema(state), PLANNER_OUTPUT_MODE.PROMPT_ONLY), 3000);
            if (raw) {
                try { state = maintainDevelopments(state, extractJson(raw), built.indices); report.runs.at(-1).valid = true; }
                catch { report.runs.at(-1).valid = false; report.runs.at(-1).rejected = 'Invalid maintenance rejected; durable state retained.'; }
            }
        }
        fs.writeFileSync(path.join(output, `round-${i}-state.json`), JSON.stringify(state, null, 2));
        fs.writeFileSync(path.join(output, 'accepted-conversation.json'), JSON.stringify(messages, null, 2));
        save(); console.log(JSON.stringify({ name, round: i, remainingLocal: state.local.length, observations: state.observations.length }));
    }
} catch (e) { report.error = /^HTTP \d+$|^Generation failed$/.test(e.message) ? e.message : 'Protocol failure; inspect saved response.'; console.log(JSON.stringify({ name, error: report.error })); }
report.ended = new Date().toISOString(); save();
