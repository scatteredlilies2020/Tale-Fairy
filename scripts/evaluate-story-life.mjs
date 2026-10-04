// Run the production two-stage planner against an existing isolated freeze.
// Never generate a writer reply or write SillyTavern state. See --freeze in
// evaluate-campaign-pass.mjs; artifacts and private input stay outside the repo.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { campaignUsable, campaignPayload, campaignPayloadBudget, validCampaignState } from '../extension/campaign-planner.js';
import { preparationInput, preparationPass, PLANNER_OUTPUT_LIMIT } from '../extension/story-preparation.js';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { fitStoryInputBudget } from '../extension/story-budget.js';

const root = process.env.TF_ST_ROOT, directory = process.env.TF_EVAL_OUTPUT;
if (!root || !directory) throw Error('TF_ST_ROOT and external TF_EVAL_OUTPUT are required');
const output = path.resolve(directory), repo = fileURLToPath(new URL('..', import.meta.url));
for (const base of [root, repo].map(p => path.resolve(p))) {
    if (output === base || output.startsWith(base + path.sep)) throw Error('External artifact directory required');
}
const read = name => JSON.parse(fs.readFileSync(path.join(output, name), 'utf8'));
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const fixture = read('fixture.json'), messages = read('conversation.json'), state = read('state.json');
const stateBefore = JSON.stringify(state);
const source = { chatId: fixture.name, referenceHash: hash(fixture.reference), messageCount: messages.length, fingerprint: hash(messages) };
const previousUsable = campaignUsable(state, { ...source, messages, fingerprint: hash });
if (state.revision && !previousUsable) throw Error('Frozen preparation does not match its accepted prefix');
const input = preparationInput({ reference: fixture.reference, state, messages,
    playerNames: [fixture.userName], previousUsable,
    reviewedMessageCount: previousUsable ? state.source.messageCount : 0 });
const tracked = [path.join(root, 'data/default-user/settings.json'), fixture.sourceFile].filter(Boolean);
const before = tracked.map(file => ({ file, hash: hash(fs.readFileSync(file)) }));
const label = `story-life-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const write = (name, value) => fs.writeFileSync(path.join(output, `${label}-${name}.json`), JSON.stringify(value, null, 2));
write('input', input);
if (!process.argv.includes('--live')) {
    console.log(JSON.stringify({ dry: true, previousUsable, inputTokens: input.inputTokens, output, label }));
    process.exit(0);
}
const provider = isolatedProvider(root, { mode: process.env.TF_REASONING || 'off' });
const calls = [], started = Date.now();
const result = await preparationPass({ state, input, source, generate: async (prompt, system, schema, metadata) => {
    const fitted = await fitStoryInputBudget(prompt, system, schema, input.inputLimit, undefined, { softTarget: true });
    const request = plannerMessages(system, fitted.prompt, schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY);
    const number = calls.length + 1, time = Date.now();
    write(`request-${number}`, request);
    console.log(JSON.stringify({ call: number, stage: metadata.stage, repair: Boolean(metadata.recoveryReason) }));
    const response = await provider.generate(request, PLANNER_OUTPUT_LIMIT);
    write(`response-${number}`, response);
    calls.push({ stage: metadata.stage, repair: Boolean(metadata.recoveryReason), milliseconds: Date.now() - time,
        inputTokens: fitted.tokens, finishReason: response.finishReason, usage: response.usage });
    return { ...response, plannerInputTokens: fitted.tokens, plannerPrompt: fitted.prompt };
} });
if (JSON.stringify(state) !== stateBefore) throw Error('Planner mutated the input snapshot');
const sourceChecks = before.map(({ file, hash: prior }) => ({ file, unchanged: hash(fs.readFileSync(file)) === prior }));
const sourceUnchanged = sourceChecks.every(check => check.unchanged);
const report = { accepted: result.accepted, error: result.error, recovery: result.recovery,
    provider: provider.configuration, calls, milliseconds: Date.now() - started,
    sourceUnchanged, sourceChecks, valid: result.accepted && validCampaignState(result.state),
    writerBudget: result.accepted ? campaignPayloadBudget(result.state) : null,
    limitation: 'Static frozen card/persona references, not live World Info or Continuity injection. No story reply generated; live plan unchanged.' };
write('result', result); write('report', report);
if (result.accepted) fs.writeFileSync(path.join(output, `${label}-writer-context.txt`), campaignPayload(result.state));
const { payload: _privateWriterText, ...writerBudget } = report.writerBudget || {};
console.log(JSON.stringify({ ...report, writerBudget, output, label }));
if (!result.accepted || !report.valid || !sourceUnchanged) process.exitCode = 1;
