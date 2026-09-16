// One manually supplied ordinary IC action, no automatic player-model calls.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { presetWriterInput } from './writer-preset-prototype.mjs';
import { acceptedWindow, injectSeamlessPreparation, icDriverIssues } from './seamless-planning-prototype.mjs';
import { estimateTokenCount } from '../extension/token-budget.js';
import { ENACTMENT_SYSTEM, stageDevelopments, stagedWriterMaterial } from './development-enactment-prototype.mjs';
import { stagingSchema } from './development-staging-prototype.mjs';
import { seamlessMemorySchema, EPISODE_POLICY, AUTHOR_SYSTEM, AUTHOR_SCHEMA, validateAuthoredReply } from './seamless-planning-prototype.mjs';
import { validatedStaging } from './development-validation-prototype.mjs';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { ensureGuidanceInChat } from '../extension/request-injection.js';
for (const key of ['TF_ST_ROOT', 'TF_PARENT', 'TF_EVAL_OUTPUT', 'TF_PLAYER_FILE']) if (!process.env[key]) throw Error(`Missing ${key}`);
const read = name => JSON.parse(fs.readFileSync(path.join(process.env.TF_PARENT, name), 'utf8').replace(/^\uFEFF/, ''));
const output = path.resolve(process.env.TF_EVAL_OUTPUT);
for (const root of [process.env.TF_ST_ROOT, fileURLToPath(new URL('..', import.meta.url))]) {
    const base = path.resolve(root).toLowerCase();
    if (output.toLowerCase() === base || output.toLowerCase().startsWith(base + path.sep)) throw Error('External output required');
}
if (fs.existsSync(output)) throw Error('Fresh output required');
const messages = read('accepted-conversation.json'), preset = read('preset.json'), reference = read('source.json');
let state = read('state.json');
const player = fs.readFileSync(process.env.TF_PLAYER_FILE, 'utf8').trim();
if (messages.at(-1).role !== 'assistant' || icDriverIssues(player).length) throw Error('Invalid IC continuation');
messages.push({ index: messages.length, role: 'user', content: player });
const provider = isolatedProvider(process.env.TF_ST_ROOT, { mode: 'low', temperature: preset.temperature });
if (provider.configuration.model !== preset.model || preset.reasoning !== 'low') throw Error('Writer mismatch');
fs.mkdirSync(output, { recursive: true });
const save = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
for (const [name, value] of Object.entries({ state, preset, source: reference })) save(name + '.json', value);
fs.copyFileSync(new URL('seamless-planning-prototype.mjs', import.meta.url), path.join(output, 'seamless-policy-snapshot.mjs'));
save('accepted-conversation.json', messages);
const stage = process.argv.includes('--stage');
const author = process.argv.includes('--author');
if (stage && author) throw Error('Choose one planning responsibility');
const report = { started: new Date().toISOString(), parent: process.env.TF_PARENT, stage,
    protocol: 'Single continuation with manually authored IC action and unchanged static writer preset. With --stage, one combined accepted-memory/ephemeral-enactment call replaces memory-only; writer receives only the current authored packet, not every unused proposal. Local retirement only; wider designs remain verbatim. One contract repair max, no semantic reroll. No broad review in this call. Earlier branch remains unchanged.' };
save('report.json', report);
try {
    let authored;
    if (author) {
        report.protocol = 'One creative-only TF handoff plus writer. No accepted-memory operations or generated boundary field in the creative call; no durable state changes. Full private preparation and accepted window supplied to author; only current authored material supplied to writer. Manually supplied IC action. One contract repair maximum, no semantic rerolls.';
        const planner = isolatedProvider(process.env.TF_ST_ROOT);
        const checked = await validatedStaging({ conversation: plannerMessages(AUTHOR_SYSTEM, JSON.stringify({ source_reference: reference,
            private_designs: state.developments, accepted_observations: state.observations, invalidated_options: state.invalidated,
            accepted_messages: acceptedWindow(messages) }), AUTHOR_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY), schema: AUTHOR_SCHEMA,
        generate: async (request, attempt) => {
            if (estimateTokenCount(JSON.stringify(request)) > 36000) throw Error('Author input exceeds allowance');
            save(`author-${attempt}-request.json`, request);
            const result = await planner.generate(request, 1800);
            fs.writeFileSync(path.join(output, `author-${attempt}-output.txt`), result.text);
            if (result.finishReason === 'length') throw Error('Incomplete author output');
            return result.text;
        }, validate: validateAuthoredReply });
        report.validation = checked.attempts;
        if (!checked.value) throw Error('Author packet rejected');
        authored = checked.value;
        await new Promise(r => setTimeout(r, 25000));
    }
    if (stage) {
        const planner = isolatedProvider(process.env.TF_ST_ROOT), evidence = acceptedWindow(messages), indices = evidence.map(m => m.index);
        const schema = stagingSchema(state);
        schema.value.properties.retire = seamlessMemorySchema(state).value.properties.retire;
        const planningRequest = plannerMessages(ENACTMENT_SYSTEM + '\n' + EPISODE_POLICY + '\nRetire LOCAL records only. Preserve all wider subjects. Keep use_now comfortably below 1400 characters and boundaries below 700. If the player undertakes an activity over a stated duration, stage material appropriate to that duration, not another replay of its entrance. Design a specific changed form and an observable present use, not only a retrospective claim of progress. This may author plausible new NPC work during the requested period, never fabricated past player choices or mandatory public commitments. Boundaries must not forbid NPCs creating new passages, mechanisms or decisions now merely because the transcript has not already recorded them.',
            JSON.stringify({ source_reference: reference, notebook: state, accepted_messages: evidence }), schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY);
        const checked = await validatedStaging({ conversation: planningRequest, schema, generate: async (request, attempt) => {
            if (estimateTokenCount(JSON.stringify(request)) > 36000) throw Error('Planner input exceeds allowance');
            save(`planner-${attempt}-request.json`, request);
            const result = await planner.generate(request, 5000);
            fs.writeFileSync(path.join(output, `planner-${attempt}-output.txt`), result.text);
            if (result.finishReason === 'length') throw Error('Incomplete planner output');
            return result.text;
        }, validate: value => {
            if (value.retire.some(r => !state.local.some(d => d.id === r.id))) throw Error('Local retirement only');
            return stageDevelopments(state, value, indices);
        } });
        report.validation = checked.attempts;
        if (!checked.value) throw Error('Staging rejected');
        state = checked.value; save('state.json', state);
        await new Promise(r => setTimeout(r, 25000));
    }
    const request = presetWriterInput({ preset, reference, history: {}, messages: acceptedWindow(messages), userName: 'Neri' });
    if (author) ensureGuidanceInChat(request, '<tale-fairy-context>\n' + JSON.stringify({ provenance: 'NEW FICTION FOR THIS REPLY, NOT ACCEPTED HISTORY OR PLAYER ACTION', next_reply_material: authored.material }) + '\n</tale-fairy-context>', { role: 'user', depth: 1, inlineLatestUser: true });
    else if (stage) ensureGuidanceInChat(request, '<tale-fairy-context>\n' + JSON.stringify({ episode_policy: EPISODE_POLICY,
        scope: state.scope, next_reply_material: stagedWriterMaterial(state),
        retired_local: state.archive.filter(a => a.lane === 'local').map(a => ({ id: a.record.id, assessment: a.retirement })) }) + '\n</tale-fairy-context>', { role: 'user', depth: 1, inlineLatestUser: true });
    else injectSeamlessPreparation(request, state);
    report.inputTokens = estimateTokenCount(JSON.stringify(request));
    if (report.inputTokens > preset.context - preset.maxOutput - 16384) throw Error('Input exceeds allowance');
    save('request.json', request);
    const result = await provider.generate(request, preset.maxOutput);
    fs.writeFileSync(path.join(output, 'writer-output.txt'), result.text);
    Object.assign(report, { usage: result.usage, finishReason: result.finishReason });
    if (!result.text.trim() || result.finishReason === 'length') throw Error('Incomplete completion');
    messages.push({ index: messages.length, role: 'assistant', content: result.text }); save('accepted-conversation.json', messages);
} catch (error) { report.error = error.status ? `HTTP ${error.status}` : 'Generation failed'; process.exitCode = 1; }
report.ended = new Date().toISOString(); save('report.json', report);
console.log(JSON.stringify({ complete: !report.error, error: report.error }));
