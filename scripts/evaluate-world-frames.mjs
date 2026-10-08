// Opt-in saved-provider smoke test. Synthetic RP only; no chat reads or writes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { liveCardPass } from './evaluate-live-story-cards.mjs';
import { worldFrameCases } from './world-frame-cases.mjs';
import { emptyCampaign } from '../extension/campaign-planner.js';
import { DIRECTOR_SYSTEM, DIRECTOR_SCHEMA } from '../extension/story-director.js';

async function main() {
    if (!process.argv.includes('--live')) throw Error('Explicit --live required.');
    if (!process.env.TF_EVAL_OUTPUT) throw Error('External TF_EVAL_OUTPUT required.');
    const root = fileURLToPath(new URL('..', import.meta.url));
    const output = path.resolve(process.env.TF_EVAL_OUTPUT), relative = path.relative(root, output);
    if (!relative || !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) throw Error('Output must be outside the repository.');
    // mkdir without recursive prevents overwriting prior results, before any paid call.
    fs.mkdirSync(output);
    const provider = isolatedProvider(process.env.TF_ST_ROOT, { mode: process.env.TF_EVAL_REASONING || 'off' });
    const protocolHash = createHash('sha256').update(JSON.stringify([DIRECTOR_SYSTEM, DIRECTOR_SCHEMA, worldFrameCases])).digest('hex');
    let calls = 0;
    const generate = async (messages, maxTokens) => {
        if (++calls > 10) throw Error('Request cap reached.');
        return provider.generate(messages, maxTokens);
    };
    const states = new Map();
    async function run(id, fixture, state = emptyCampaign(), messages = [], expectation) {
        const report = { id, configuration: provider.configuration, protocolHash,
            limitation: 'One saved-provider sample through production planner/writer-packet functions. Synthetic RP, not a live browser or writer test. Genre quality still needs human review.' };
        try {
            report.pass = await liveCardPass(fixture, state, messages, generate);
            const pass = report.pass;
            report.reminder = pass.state.workingPlan.storyStructure.foundation.reminder;
            report.checks = {
                accepted: pass.accepted, validState: pass.validState, oneCall: pass.calls === 1,
                concise: report.reminder.length > 0 && report.reminder.length <= 600,
                noNotices: pass.notices.length === 0, frameIncluded: !pass.orientationOmitted && pass.writerPacket.includes(report.reminder),
                expectedUpdate: !expectation || expectation(report.reminder),
            };
            if (Object.values(report.checks).some(value => !value)) process.exitCode = 1;
            console.log(JSON.stringify({ id, checks: report.checks, reminder: report.reminder }));
            if (!pass.response) throw Error('No completed provider response.');
            states.set(id, pass.state);
        } catch {
            report.error = 'Evaluation failed; transport details withheld. No automatic retry.';
            process.exitCode = 1;
        }
        fs.writeFileSync(path.join(output, `${id}.json`), JSON.stringify(report, null, 2), { flag: 'wx' });
        if (report.error) throw Error(report.error); // Stop spending through transport failures.
    }
    for (const fixture of worldFrameCases) await run(fixture.id, fixture);

    const light = worldFrameCases.find(x => x.id === 'k-on-light');
    const mystery = worldFrameCases.find(x => x.id === 'k-on-mystery');
    const lightState = states.get(light.id);
    const lightReminder = lightState.workingPlan.storyStructure.foundation.reminder;
    const scene = [{ index: 0, role: 'user', content: 'Someone mentions a murder reported in the newspaper. We finish our tea.' }];
    await run('k-on-single-dark-scene', light, lightState, scene, frame => frame === lightReminder);
    await run('k-on-explicit-genre-change', mystery, lightState,
        [{ index: 0, role: 'user', content: 'OOC: Change the lasting premise to a K-On murder mystery. Ordinary club life still matters; no fixed culprit.' }],
        frame => frame !== lightReminder);

    const naruto = worldFrameCases.find(x => x.id === 'naruto');
    const passive = 'Across Naruto’s shinobi lands, villages commission missions, train successors, practice medicine and negotiate with rivals while civilians build livelihoods through trade, craft and travel. Mission income, clan inheritance, bloodline ambitions and the military value of chakra pull institutions and personal loyalties in competing directions. Memorial customs, festivals and everyday care sustain bonds across generations despite the losses of shinobi service.';
    const inherited = await liveCardPass(naruto, emptyCampaign(), [], async () => ({ finishReason: 'stop', text: JSON.stringify({
        reviewAfter: 12, foundation: { reminder: passive, scratchpad: '', changeReason: '' },
        upsert: [], retain: [], retire: [], select: [],
    }) }));
    if (!inherited.accepted) throw Error('Invalid inherited fixture.');
    await run('naruto-inherited-frame', naruto, inherited.state, [], frame => frame !== passive);
    console.log(JSON.stringify({ calls, output }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(() => { console.error('World-frame evaluation stopped; sensitive details withheld.'); process.exitCode = 1; });
}
