// Opt-in saved-provider review smoke test. Four synthetic cases; no chat access.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { liveCardPass } from './evaluate-live-story-cards.mjs';
import { arcFocusCases, seedArcFocus } from './arc-focus-cases.mjs';
import { DIRECTOR_SYSTEM, DIRECTOR_SCHEMA, validateSagaHierarchy } from '../extension/story-director.js';

async function main() {
    if (!process.argv.includes('--live')) throw Error('Explicit --live required.');
    if (!process.env.TF_EVAL_OUTPUT) throw Error('External TF_EVAL_OUTPUT required.');
    const root = fileURLToPath(new URL('..', import.meta.url));
    const output = path.resolve(process.env.TF_EVAL_OUTPUT), relative = path.relative(root, output);
    if (!relative || !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) throw Error('Output must be outside the repository.');
    fs.mkdirSync(output); // New directory only; never overwrite a report.
    const provider = isolatedProvider(process.env.TF_ST_ROOT, { mode: process.env.TF_EVAL_REASONING || 'off' });
    const protocolHash = createHash('sha256').update(JSON.stringify([DIRECTOR_SYSTEM, DIRECTOR_SCHEMA, arcFocusCases, { requireSagaHierarchy: true }])).digest('hex');
    let calls = 0;
    const generate = (messages, maxTokens) => {
        if (++calls > arcFocusCases.length) throw Error('Request cap reached.');
        return provider.generate(messages, maxTokens);
    };
    for (const fixture of arcFocusCases) {
        const report = { id: fixture.id, configuration: provider.configuration, protocolHash, review: fixture.review,
            limitation: 'Single synthetic review through production planner and writer-packet functions. Structural checks do not establish semantic quality; inspect full responses for renamed filler and invented outcomes. Not a live UI or writer test.' };
        try {
            report.pass = await liveCardPass({ ...fixture, requireSagaHierarchy: true }, await seedArcFocus(fixture), fixture.messages, generate);
            const pass = report.pass, nodes = pass.state.workingPlan?.storyStructure?.nodes || [];
            let connectedHierarchy = true;
            try { validateSagaHierarchy(nodes); } catch { connectedHierarchy = false; }
            report.checks = { accepted: pass.accepted, validState: pass.validState, oneCall: pass.calls === 1,
                connectedHierarchy,
                noNotices: pass.notices.length === 0, frameIncluded: !pass.orientationOmitted,
                keptSubstantial: fixture.keep.every(id => nodes.some(node => node.id === id)),
                droppedFiller: fixture.drop.every(id => !nodes.some(node => node.id === id)),
                withinBudget: pass.writerTokens < 2400 && pass.omitted === 0 };
            if (Object.values(report.checks).some(value => !value)) process.exitCode = 1;
            console.log(JSON.stringify({ id: fixture.id, checks: report.checks,
                cards: nodes.map(({ id, kind, title }) => ({ id, kind, title })) }));
            if (!pass.response) throw Error('No completed response.');
        } catch {
            report.error = 'Evaluation failed; sensitive details withheld. No automatic retry.';
            process.exitCode = 1;
        }
        fs.writeFileSync(path.join(output, `${fixture.id}.json`), JSON.stringify(report, null, 2), { flag: 'wx' });
        if (report.error) throw Error(report.error);
    }
    console.log(JSON.stringify({ calls, output }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(() => { console.error('Arc-focus evaluation stopped; sensitive details withheld.'); process.exitCode = 1; });
}
