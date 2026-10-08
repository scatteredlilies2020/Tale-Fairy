// Opt-in real-model smoke test. Synthetic premises only; never reads live chats.
// Run initial first, then follow-through against the saved, model-generated plans.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { storyCardCases } from './story-card-cases.mjs';
import { directorInput, directorPass, PLANNER_OUTPUT_LIMIT } from '../extension/story-director.js';
import { emptyCampaign, campaignPayloadBudget, validCampaignState } from '../extension/campaign-planner.js';
import { fitStoryInputBudget } from '../extension/story-budget.js';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { ensureGuidanceInChat, chatHasCurrentGuidance } from '../extension/request-injection.js';
import { writerReviewSignal } from '../extension/story-structure.js';
import { completionText } from '../extension/completion-response.js';
import { writerFailureDetails } from './isolated-writer-provider.mjs';

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function liveCardPass(fixture, state, messages, generate) {
    const input = directorInput({ reference: { premise: fixture.premise }, state, messages, requireSagaHierarchy: fixture.requireSagaHierarchy === true,
        playerNames: fixture.players, previousUsable: state.revision > 0 });
    const source = { chatId: `live-smoke-${fixture.id}`, referenceHash: hash(fixture.premise),
        fingerprint: hash(messages), messageCount: messages.length };
    let request, response, calls = 0;
    const result = await directorPass({ state, input, source, generate: async (prompt, system, schema) => {
        const fitted = await fitStoryInputBudget(prompt, system, schema, input.inputLimit, undefined, { softTarget: true });
        request = plannerMessages(system, fitted.prompt, schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY);
        calls++;
        response = await generate(request, PLANNER_OUTPUT_LIMIT);
        return { ...response, plannerInputTokens: fitted.tokens };
    } });
    const budget = campaignPayloadBudget(result.state);
    return { calls, accepted: result.accepted, error: result.error || null,
        notices: result.plannerNotices || [], adjustments: result.responseAdjustments || [],
        validState: validCampaignState(result.state), request, response, state: result.state,
        writerPacket: budget.payload, writerTokens: budget.tokens, omitted: budget.omitted,
        orientationOmitted: budget.orientationOmitted || false };
}

export function smokeWriterMessages(fixture, packet, user) {
    const messages = [{ role: 'system', content: 'You are the writer for an interactive ensemble RP. Continue the scene in about 250 words. The player controls their named characters; write the world and other characters, leaving player decisions open. Use supplied author preparation as possibilities, not enacted facts. Keep author-only information separate from character knowledge. Return the continuation, not commentary about planning.' },
        { role: 'system', content: fixture.premise }, { role: 'user', content: user }];
    ensureGuidanceInChat(messages, packet, { role: 'user', depth: 0, inlineLatestUser: true });
    if (!chatHasCurrentGuidance(messages, packet)) throw Error('Writer packet did not reach the outgoing conversation.');
    return messages;
}

const followups = {
    'star-wars': 'Lio stays in the safe refuge common room over tea, listening to the other residents. Continue this quiet interval.',
    'k-on': 'The school festival performance has now finished successfully. Nao and Emi are backstage as the last applause fades; the instruments are packed. Continue the immediate aftermath.',
    original: 'Iven waits at a public landing on one island while Mae is visiting a small observatory on another. Let us see what people around them are occupied with; leave their responses to me.',
};

async function main() {
    if (!process.argv.includes('--live')) throw Error('Explicit --live required; no request sent.');
    const root = fileURLToPath(new URL('..', import.meta.url));
    if (!process.env.TF_EVAL_OUTPUT) throw Error('External TF_EVAL_OUTPUT required.');
    const output = path.resolve(process.env.TF_EVAL_OUTPUT), relative = path.relative(root, output);
    if (!relative || !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) throw Error('Output must be outside the repository.');
    const endpoint = new URL(process.env.TF_EVAL_API_URL || '');
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw Error('Expected credential-free HTTPS endpoint.');
    const model = process.env.TF_EVAL_MODEL, key = process.env.TF_EVAL_API_KEY;
    delete process.env.TF_EVAL_API_KEY;
    if (!key || !model) throw Error('Existing provider credential and model required; no request sent.');
    // Explicit saved routes only. No automatic retries or provider/model fallback.
    const zai = endpoint.href === 'https://api.z.ai/api/paas/v4/chat/completions' && model === 'glm-5.3';
    const openrouter = endpoint.href === 'https://openrouter.ai/api/v1/chat/completions' && model === 'deepseek/deepseek-v4-pro';
    if (!zai && !openrouter) throw Error('Unsupported evaluation route.');
    const phase = process.env.TF_EVAL_PHASE || 'initial';
    if (!['initial', 'follow-through'].includes(phase)) throw Error('Unknown phase.');
    const ids = (process.env.TF_EVAL_CASES || (phase === 'initial' ? storyCardCases.map(x => x.id).join(',') : Object.keys(followups).join(','))).split(',');
    if (new Set(ids).size !== ids.length || ids.some(id => !storyCardCases.some(x => x.id === id) || phase === 'follow-through' && !followups[id])) throw Error('Unknown or repeated case.');
    const protocolHash = hash(['extension/story-director.js', 'extension/story-structure.js', 'extension/story-budget.js',
        'scripts/evaluate-live-story-cards.mjs', 'scripts/story-card-cases.mjs'].map(file => fs.readFileSync(path.join(root, file), 'utf8')));
    const configuration = { model, reasoning: 'disabled', temperature: 0.8, plannerOutputLimit: PLANNER_OUTPUT_LIMIT };
    fs.mkdirSync(output, { recursive: true });
    let totalCalls = 0;
    const generate = async (messages, maxTokens) => {
        if (++totalCalls > 9) throw Error('Per-run request cap reached.');
        const started = Date.now();
        const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(180000),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({ model, messages, max_tokens: maxTokens, stream: false, temperature: 0.8,
                ...(zai ? { thinking: { type: 'disabled' } } : { reasoning: { effort: 'none', exclude: true } }) }) });
        if (!response.ok) {
            const diagnostic = writerFailureDetails(await response.text(), [key]);
            throw Error(`Provider HTTP ${response.status}; category ${diagnostic.category}`);
        }
        const data = await response.json();
        if (data.error) throw Error('Provider returned an error; details withheld.');
        return { text: completionText(data), usage: data.usage, elapsedMs: Date.now() - started,
            finishReason: data.choices?.[0]?.finish_reason, reportedModel: data.model || null };
    };
    for (const id of ids) {
        const fixture = storyCardCases.find(x => x.id === id), file = path.join(output, `${id}-${phase}.json`);
        if (fs.existsSync(file)) throw Error('Report already exists; choose a new directory/case. No overwrite.');
        const report = { id, phase, mode: 'live-model', configuration, protocolHash, started: new Date().toISOString(),
            limitation: 'Synthetic premises with direct saved-provider inference and production planner/injection functions. Not a live ST UI/preset test, long-run benchmark or writer-only comparison.' };
        try {
            let state = emptyCampaign(), messages = [];
            if (phase === 'follow-through') {
                const prior = JSON.parse(fs.readFileSync(path.join(output, `${id}-initial.json`), 'utf8'));
                if (prior.protocolHash !== protocolHash || !prior.pass?.accepted) throw Error('Missing or mismatched accepted initial plan.');
                state = prior.pass.state;
                const packet = campaignPayloadBudget(state).payload;
                report.writerRequest = smokeWriterMessages(fixture, packet, followups[id]);
                report.writerPacketIncluded = chatHasCurrentGuidance(report.writerRequest, packet);
                report.writer = await generate(report.writerRequest, 1200);
                report.writerSignal = writerReviewSignal(report.writer.text);
                if (!report.writer.text || report.writer.finishReason !== 'stop') throw Error('Writer response empty or incomplete.');
                messages = [{ index: 0, role: 'user', content: followups[id] }, { index: 1, role: 'assistant', content: report.writer.text }];
                report.beforeReminder = state.workingPlan.storyStructure.foundation.reminder;
                report.beforeNodes = state.workingPlan.storyStructure.nodes;
            }
            report.pass = await liveCardPass(fixture, state, messages, generate);
            if (phase === 'follow-through') report.reminderRetained = report.beforeReminder === report.pass.state.workingPlan.storyStructure.foundation.reminder;
            console.log(JSON.stringify({ id, phase, accepted: report.pass.accepted, error: report.pass.error, notices: report.pass.notices,
                writerTokens: report.pass.writerTokens, elapsedMs: report.pass.response?.elapsedMs,
                writerSignal: report.writerSignal, reminderRetained: report.reminderRetained }));
            if (!report.pass.accepted || report.pass.notices.length || report.pass.orientationOmitted) process.exitCode = 1;
        } catch (error) {
            report.error = /^Provider HTTP|Missing or mismatched|Writer response/.test(error.message) ? error.message : 'Live test failed; transport details withheld.';
            console.log(JSON.stringify({ id, phase, error: report.error }));
            process.exitCode = 1;
        }
        fs.writeFileSync(file, JSON.stringify(report, null, 2));
        if (report.error || !report.pass?.response) break; // Do not spend through transport failures.
    }
    console.log(JSON.stringify({ totalCalls, output }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(() => { console.error('Live test setup failed; sensitive details withheld.'); process.exitCode = 1; });
}
