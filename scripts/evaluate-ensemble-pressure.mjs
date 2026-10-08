// Exact production planner/writer packet checks using synthetic RP only.
// Default: hand-authored fixtures, NOT a creative-quality/model benchmark.
// No SillyTavern installation, provider connection or credentials required.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensemblePressureCases, fixtureDirectorReply } from './ensemble-pressure-cases.mjs';
import { directorInput, directorPass, PLANNER_OUTPUT_LIMIT } from '../extension/story-director.js';
import { emptyCampaign, campaignPayloadBudget, validCampaignState } from '../extension/campaign-planner.js';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { fitStoryInputBudget } from '../extension/story-budget.js';

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function evaluateEnsembleCase(fixture, { generate } = {}) {
    const reference = { premise: fixture.premise };
    const messages = [{ index: 0, role: 'assistant', content: fixture.accepted },
        { index: 1, role: 'user', name: fixture.playerNames[0], content: fixture.user }];
    const source = { chatId: fixture.id, referenceHash: hash(reference), fingerprint: hash(messages), messageCount: messages.length };
    const state = emptyCampaign();
    const input = directorInput({ reference, state, messages, playerNames: fixture.playerNames });
    let request, response, calls = 0;
    const result = await directorPass({ state, input, source, generate: async (prompt, system, schema) => {
        calls++;
        const fitted = await fitStoryInputBudget(prompt, system, schema, input.inputLimit, undefined, { softTarget: true });
        request = plannerMessages(system, fitted.prompt, schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY);
        response = generate ? await generate(request, PLANNER_OUTPUT_LIMIT) : {
            text: JSON.stringify(fixtureDirectorReply(fixture, { prefix: input.newIdPrefix })), finishReason: 'stop',
        };
        return { ...response, plannerInputTokens: fitted.tokens };
    } });
    const budget = campaignPayloadBudget(result.state);
    return {
        id: fixture.id, title: fixture.title, mode: generate ? 'live-planner' : 'hand-authored-fixture',
        limitation: 'Synthetic premise; no live chat or writer generation. Fixture mode verifies transport and lifecycle, not model creativity.',
        calls, accepted: result.accepted, error: result.error || null, notices: result.plannerNotices || [],
        validState: validCampaignState(result.state), plannerRequest: request, plannerResponse: response,
        privateFoundation: result.state.workingPlan?.storyStructure?.foundation,
        writerPacket: budget.payload, writerTokens: budget.tokens, omitted: budget.omitted,
        orientationOmitted: budget.orientationOmitted || false,
    };
}

export function exampleMarkdown(reports) {
    return '# Ensemble pressure: exact writer packets\n\n'
        + 'Generated through the production director validator and writer serializer. '
        + 'These are **hand-authored planner fixtures, not captured live model outputs**. '
        + 'They verify what is sent, privacy boundaries and budgets; they do not prove creative improvement. '
        + 'No SillyTavern installation, connection or credentials were used.\n\n'
        + reports.map(report => `## ${report.title}\n\nAccepted: ${report.accepted}; requests: ${report.calls}; estimated writer tokens: ${report.writerTokens}; omitted cards: ${report.omitted}.\n\n`
            + '```text\n' + report.writerPacket + '\n```\n').join('\n');
}

async function main() {
    if (!process.env.TF_EVAL_OUTPUT) throw Error('External TF_EVAL_OUTPUT directory required.');
    const output = path.resolve(process.env.TF_EVAL_OUTPUT);
    for (const base of [fileURLToPath(new URL('..', import.meta.url))]) {
        const relative = path.relative(path.resolve(base), output);
        if (!relative || !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) throw Error('Output must be outside the repository.');
    }
    fs.mkdirSync(output, { recursive: true });
    const reports = [];
    for (const fixture of ensemblePressureCases) {
        const report = await evaluateEnsembleCase(fixture);
        reports.push(report);
        fs.writeFileSync(path.join(output, `${fixture.id}.json`), JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ id: report.id, mode: report.mode, accepted: report.accepted, calls: report.calls,
            writerTokens: report.writerTokens, omitted: report.omitted, notices: report.notices.length }));
    }
    fs.writeFileSync(path.join(output, 'writer-packets.md'), exampleMarkdown(reports));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
