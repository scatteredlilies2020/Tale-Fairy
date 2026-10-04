// Opt-in, isolated evaluation of the ACTIVE two-stage contract. Synthetic source
// or a verified --saved-plan freeze; never writes to SillyTavern or a chat.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { touringCase, closedCase, ecosystemCase } from './single-pass-planner-cases.mjs';
import { journeyCase, musicClubCase } from './story-activity-cases.mjs';
import { preparationInput as storyInput, preparationPass as storyPassWithRecovery, PLANNER_OUTPUT_LIMIT } from '../extension/story-preparation.js';
import { campaignEvidenceMessages, campaignReviewWindow } from '../extension/campaign-evidence.js';
import { emptyCampaign, campaignPayload } from '../extension/campaign-planner.js';
import { campaignCheckpoint, campaignReconsideration } from '../extension/campaign-review.js';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';

if (!process.argv.includes('--live')) throw Error('Explicit --live and TF_ST_ROOT are required for provider calls.');
const root = process.env.TF_ST_ROOT;
if (!root) throw Error('TF_ST_ROOT is required.');
const name = process.env.TF_CASE || 'touring';
const frozen = process.env.TF_FROZEN ? JSON.parse(fs.readFileSync(path.join(process.env.TF_FROZEN, 'fixture.json'))) : null;
const fixture = frozen ? { bootstrap: frozen.reference } : { touring: touringCase, closed: closedCase, ecosystem: ecosystemCase,
    journey: journeyCase, music: musicClubCase }[name]?.();
if (!fixture) throw Error('TF_CASE must be touring, closed, ecosystem, journey, or music.');
const settings = JSON.parse(fs.readFileSync(path.join(root, 'data/default-user/settings.json')));
const configuredMode = settings.extension_settings?.['living-world-guide']?.analysisReasoningMode;
const mode = ['off', 'low', 'high'].includes(configuredMode) ? configuredMode : 'off';
const provider = isolatedProvider(root, { mode });
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'tale-fairy-progression-'));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const convert = rows => rows.map((m, index) => ({ index, role: m.is_user ? 'user' : 'assistant',
    ...(m.is_user ? { name: 'Neri' } : {}), content: m.mes }));
let messages = frozen ? JSON.parse(fs.readFileSync(path.join(process.env.TF_FROZEN, 'conversation.json'))) : convert(fixture.messages);
let state = frozen ? JSON.parse(fs.readFileSync(path.join(process.env.TF_FROZEN, 'state.json'))) : emptyCampaign();
if (frozen && state.source.fingerprint !== hash(messages.slice(0, state.source.messageCount))) throw Error('Frozen state/source mismatch');
if (!frozen && name === 'touring') messages = convert([...fixture.messages,
    ...fixture.stages[1].append, ...fixture.stages[2].append]);
const stages = [{ name: 'initial', append: [] }];
const chatId = frozen ? state.source.chatId : `isolated-${name}`;
if (process.argv.includes('--new-story')) {
    if (!frozen || messages.length < 7) throw Error('--new-story requires a frozen conversation with at least seven messages.');
    const accepted = structuredClone(messages);
    messages = accepted.slice(0, 2); state = emptyCampaign();
    stages.push({ name: 'early-choices', append: accepted.slice(2, 6) },
        { name: 'reference-change', append: [], referenceChange: true },
        { name: 'continued-story', append: accepted.slice(6) });
}
// These are explicitly synthetic continuations of the isolated snapshot, not
// accepted turns written back to the user's chat. Repeated quiet changes expose
// the local-task drift that a single successful output cannot detect.
if (process.argv.includes('--continuity')) stages.push(
    { name: 'routine-1', append: [{ role: 'user', name: frozen?.userName || 'Neri', content: 'I take my time with what I am doing, enjoying being here with them.' }] },
    { name: 'routine-2', append: [{ role: 'assistant', content: 'A few quiet minutes pass together. No journey, new undertaking or invitation has been accepted.' },
        { role: 'user', name: frozen?.userName || 'Neri', content: 'I finish what I am doing and relax for a little while.' }] },
    { name: 'refusal', refuse: true, append: [] },
);
if (!frozen && name === 'touring' && !process.argv.includes('--initial-only')) stages.push(
    { name: 'quiet', append: [{ role: 'assistant', content: 'Jo sips her tea while Sef stretches his legs. They remain at the table after the show.' },
        { role: 'user', name: 'Neri', content: 'I finish my tea and enjoy the quiet with them.' }] },
    { name: 'changed-interest', append: [{ role: 'user', name: 'Neri', content: 'I would rather keep our original music private, instead of booking a public debut. We can enjoy making it together.' }] },
);
console.log(JSON.stringify({ case: name, output, configuration: provider.configuration }));
for (const stage of stages) {
    // An explicitly synthetic, meaning-preserving edit isolates invalidation
    // from story changes. The same production checkpoint/proposal gates apply.
    if (stage.referenceChange) fixture.bootstrap = { ...fixture.bootstrap,
        description: `${fixture.bootstrap.description || ''}\n` };
    if (stage.refuse) {
        const id = state.workingPlan?.outlook?.[0]?.trajectoryId;
        const focus = state.workingPlan?.trajectories?.find(row => row.id === id)?.focus;
        if (!focus) { console.log(JSON.stringify({ stage: stage.name, skipped: 'No selected outlook to refuse.' })); continue; }
        stage.append = [{ role: 'user', name: frozen?.userName || 'Neri', content: `I do not want to pursue ${focus}. Please drop that possibility. I would rather spend time privately with the people already here.` }];
    }
    messages.push(...stage.append.map((message, offset) => ({ ...message, index: messages.length + offset })));
    const source = { chatId, referenceHash: hash(fixture.bootstrap), fingerprint: hash(messages), messageCount: messages.length };
    const proof = { ...source, messages, fingerprint: hash };
    const checkpoint = campaignCheckpoint(state, proof);
    const reconsiderHorizon = checkpoint ? null : campaignReconsideration(state, proof);
    const planningState = { ...(checkpoint || emptyCampaign()), revision: state.revision, archive: state.archive };
    const reviewedMessageCount = checkpoint?.source?.messageCount || 0;
    const input = storyInput({ reference: fixture.bootstrap, state: planningState, reconsiderHorizon,
        messages: campaignEvidenceMessages(campaignReviewWindow(messages, 32, reviewedMessageCount), { narrative: true }),
        playerNames: frozen ? [frozen.userName] : ['Neri', 'Edda'], reviewedMessageCount,
        previousUsable: Boolean(checkpoint), verifiedPlanEvidence: frozen ? {} : checkpoint?.planEvidence || {} });
    const calls = [];
    const result = await storyPassWithRecovery({ state, source, input, generate: async (prompt, system, schema) => {
        if (calls.length >= 3) throw Error('Evaluation request limit exceeded');
        const response = await provider.generate(plannerMessages(system, prompt, schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY), PLANNER_OUTPUT_LIMIT);
        calls.push({ request: { prompt: JSON.parse(prompt), system, schema }, ...response }); return response;
    } });
    fs.writeFileSync(path.join(output, `${stage.name}.json`), JSON.stringify({ reference: fixture.bootstrap, messages,
        input: JSON.parse(input.prompt), calls, accepted: result.accepted, error: result.error,
        budget: result.budget, recovery: result.recovery, state: result.state,
        writer: result.accepted ? campaignPayload(result.state) : null }, null, 2));
    console.log(JSON.stringify({ stage: stage.name, accepted: result.accepted, error: result.error,
        calls: calls.length, budget: result.budget, recovery: result.recovery?.status,
        throughline: result.state.workingPlan?.throughline,
        outlook: result.state.workingPlan?.outlook, writer: result.accepted ? campaignPayload(result.state) : null }));
    if (!result.accepted) { process.exitCode = 1; break; }
    state = result.state;
}
