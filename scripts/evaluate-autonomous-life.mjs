// Opt-in writer-in-the-loop comparison. Synthetic chats only; no ST mutations.
// --live spends provider calls. Without it, writes a request plan without keys.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { journeyCase, musicClubCase } from './story-activity-cases.mjs';
import { emptyCampaign, campaignPayloadBudget, validCampaignState } from '../extension/campaign-planner.js';
import { preparationInput, preparationPass, PLANNER_OUTPUT_LIMIT } from '../extension/story-preparation.js';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { fitStoryInputBudget } from '../extension/story-budget.js';

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const turnCount = value => {
    if (!Number.isSafeInteger(value) || value < 1 || value > 12) throw Error('Turns must be an integer from 1 to 12');
    return value;
};
const writerSystem = 'Continue this roleplay as the surrounding world and non-player characters. The user controls Neri; do not supply their decisions, speech or actions. Respect established events and the supplied premise. Return only the story reply.';

export async function runAutonomousLoop({ fixture, turns = 6, planner, writer, assisted = true, record = () => {} }) {
    turnCount(turns);
    const reference = fixture.bootstrap;
    const messages = fixture.messages.map((row, index) => ({ index, role: row.is_user ? 'user' : 'assistant',
        ...(row.is_user ? { name: 'Neri' } : {}), content: row.mes }));
    let state = emptyCampaign();
    const reports = [];
    for (let turn = 0; turn < turns; turn++) {
        const report = { turn, assisted, planningCalls: [], acceptedBefore: structuredClone(messages) };
        let packet = '';
        if (assisted) {
            const source = { chatId: 'isolated-autonomous-life', referenceHash: hash(reference), fingerprint: hash(messages), messageCount: messages.length };
            const input = preparationInput({ reference, state, messages, playerNames: ['Neri'], previousUsable: Boolean(state.revision),
                reviewedMessageCount: state.source?.messageCount || 0, verifiedPlanEvidence: state.planEvidence || {} });
            const result = await preparationPass({ state, input, source, generate: async (prompt, system, schema, metadata) => {
                if (report.planningCalls.length >= 3) throw Error('Planning request cap exceeded');
                const fitted = await fitStoryInputBudget(prompt, system, schema, input.inputLimit, undefined, { softTarget: true });
                const request = plannerMessages(system, fitted.prompt, schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY);
                const call = { stage: metadata.stage, request }; report.planningCalls.push(call);
                const response = await planner(request, PLANNER_OUTPUT_LIMIT, { ...metadata, prompt: fitted.prompt });
                call.response = response;
                return { ...response, plannerPrompt: fitted.prompt, plannerInputTokens: fitted.tokens };
            } });
            report.planningAccepted = result.accepted;
            report.planningError = result.error;
            if (result.accepted) state = result.state;
            if (state.revision && !validCampaignState(state)) throw Error('Invalid saved preparation');
            // A failed review leaves the previous source-compatible proposal in
            // play, just like the production append-only refresh lifecycle.
            const budget = campaignPayloadBudget(state);
            packet = budget.payload;
            report.plan = structuredClone(state.workingPlan);
            report.writerBudget = { tokens: budget.tokens, omitted: budget.omitted };
        }
        const request = [{ role: 'system', content: `${writerSystem}\nPremise: ${JSON.stringify(reference)}` },
            ...(packet ? [{ role: 'system', content: packet }] : []),
            ...messages.map(({ role, content }) => ({ role, content }))];
        report.writerRequest = request;
        const response = await writer(request, 1200);
        if (!response.text?.trim() || ['length', 'max_tokens', 'max_output_tokens'].includes(response.finishReason)) {
            throw Error('Writer reply missing or truncated; not accepted into the synthetic story');
        }
        report.writerResponse = response;
        messages.push({ index: messages.length, role: 'assistant', content: response.text });
        reports.push(report); await record(report);
        // Participation without supplying a plot or accepting a specific offer.
        if (turn + 1 < turns) messages.push({ index: messages.length, role: 'user', name: 'Neri', content: 'I take in what is happening around me.' });
    }
    return { reports, messages, state };
}

async function main() {
    const live = process.argv.includes('--live');
    const turns = turnCount(Number(process.env.TF_TURNS || 6));
    if (!process.env.TF_EVAL_OUTPUT) throw Error('External TF_EVAL_OUTPUT directory required');
    const output = path.resolve(process.env.TF_EVAL_OUTPUT);
    const repo = fileURLToPath(new URL('..', import.meta.url));
    for (const base of [repo, process.env.TF_ST_ROOT].filter(Boolean).map(p => path.resolve(p))) {
        const rel = path.relative(base, output);
        if (!rel || !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel)) throw Error('Artifact directory must be outside repo and ST');
    }
    const cases = { journey: journeyCase, music: musicClubCase };
    const name = process.env.TF_CASE;
    if (name && !cases[name]) throw Error('TF_CASE must be journey or music');
    fs.mkdirSync(output, { recursive: true });
    const summary = { live, turns, cases: name ? [name] : Object.keys(cases),
        maximumProviderCalls: (name ? 1 : 2) * turns * 5,
        limitation: 'Same configured planner model is used as a substitute writer with a minimal fixed preset, not the live ST writer. Synthetic passive-user replies and static references. No automatic score or claim of creative improvement; inspect prose and compare both arms.' };
    if (!live) {
        summary.fixtures = Object.fromEntries(summary.cases.map(key => [key, cases[key]() ]));
    } else {
        const provider = isolatedProvider(process.env.TF_ST_ROOT);
        summary.provider = provider.configuration;
        for (const key of summary.cases) for (const assisted of [false, true]) {
            const label = `${key}-${assisted ? 'assisted' : 'writer-only'}`;
            const result = await runAutonomousLoop({ fixture: cases[key](), turns, assisted,
                planner: (...args) => provider.generate(...args), writer: (...args) => provider.generate(...args),
                record: report => fs.writeFileSync(path.join(output, `${label}-${report.turn}.json`), JSON.stringify(report, null, 2)) });
            fs.writeFileSync(path.join(output, `${label}-conversation.json`), JSON.stringify(result.messages, null, 2));
        }
    }
    fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ live, turns, cases: summary.cases, maximumProviderCalls: summary.maximumProviderCalls, output }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(() => { console.error('Isolated evaluation failed; provider details withheld. Check configuration and per-turn artifacts.'); process.exitCode = 1; });
}
