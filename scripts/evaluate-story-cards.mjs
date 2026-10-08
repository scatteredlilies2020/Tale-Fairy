// Offline structural evaluation. The planner replies and accepted play are
// authored fixtures, not measured LLM creativity. No ST or credentials needed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { storyCardCases, cardCaseReply } from './story-card-cases.mjs';
import { directorInput, directorPass } from '../extension/story-director.js';
import { emptyCampaign, campaignPayloadBudget, validCampaignState } from '../extension/campaign-planner.js';
import { storyCardsHtml } from '../extension/story-cards.js';
import { WRITER_CONTEXT_TOKEN_LIMIT } from '../extension/story-budget.js';

export async function evaluateCardCase(fixture) {
    let state = emptyCampaign(), calls = 0;
    const stages = [];
    const messages = [{ index: 0, role: 'assistant', content: fixture.premise }];
    async function pass(name, raw) {
        const input = directorInput({ reference: { premise: fixture.premise }, state, messages,
            playerNames: fixture.players, previousUsable: state.revision > 0 });
        const source = { chatId: fixture.id, referenceHash: fixture.id, fingerprint: `${fixture.id}-${messages.length}`, messageCount: messages.length };
        const result = await directorPass({ state, input, source, generate: async () => {
            calls++; return { text: JSON.stringify(raw), finishReason: 'stop' };
        } });
        if (!result.accepted || !validCampaignState(result.state)) throw Error(`${fixture.id}/${name}: ${result.error}`);
        state = result.state;
        const budget = campaignPayloadBudget(state);
        stages.push({ name, plannerInput: input.prompt, sampleReply: raw, notices: result.plannerNotices,
            writerPacket: budget.payload, writerTokens: budget.tokens, omitted: budget.omitted,
            plan: structuredClone(state.workingPlan) });
    }
    const initial = cardCaseReply(fixture);
    await pass('Initial board', initial);
    // A quiet review preserves both the stable frame and omitted card effects.
    messages.push({ index: 1, role: 'assistant', content: 'A quiet interval passes. Existing world conditions and open concerns remain unchanged.' });
    await pass('Quiet review', { ...initial, foundation: { ...initial.foundation, reminder: '' }, upsert: [] });
    const ending = initial.upsert.find(node => node.kind === 'arc');
    const parked = initial.upsert.find(node => node.kind === 'thread');
    const changed = structuredClone(initial);
    changed.foundation.reminder = '';
    changed.upsert = [{ ...ending, status: 'resolved' }, ...(parked ? [{ ...parked, status: 'dormant' }] : [])];
    changed.select = initial.select.filter(entry => !changed.upsert.some(node => node.id === entry.id));
    messages.push({ index: 2, role: 'assistant', content: `The immediate concern "${ending.title}" is settled in play. ${parked ? `"${parked.title}" is set aside for now.` : ''} Wider currents remain open.` });
    await pass('After an arc ends', changed);
    return { id: fixture.id, title: fixture.title, mode: 'authored-fixtures', calls, stages,
        limitation: 'Production validation, persistence and rendering; no live planner or writer generation.' };
}

const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function cardPreviewHtml(reports) {
    const css = fs.readFileSync(new URL('../extension/style.css', import.meta.url), 'utf8');
    return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Tale Fairy · Story cards</title><style>${css}
    :root { color-scheme: dark; --SmartThemeBorderColor: #394452; }
    * { box-sizing: border-box; } body { margin:0; background:#131a20; color:#e6ebe9; font:15px/1.5 system-ui,sans-serif; }
    main { max-width:1060px; margin:0 auto; padding:32px 24px 50px; } h1 { font-size:30px; letter-spacing:-.04em; margin:6px 0; }
    h2 { font-size:18px; margin:24px 0 12px; } .eyebrow { font-size:11px; letter-spacing:.2em; color:#9bc7bc; text-transform:uppercase; }
    .intro { max-width:720px; color:#b3bec5; margin:0 0 20px; } nav { display:flex; flex-wrap:wrap; gap:7px; margin:14px 0; }
    button { font:inherit; padding:7px 12px; color:inherit; background:#202b34; border:1px solid #455461; border-radius:7px; cursor:pointer; }
    button[aria-pressed=true] { background:#334f4a; border-color:#8fc6ba; } button:focus-visible { outline:2px solid #8fc6ba; outline-offset:3px; }
    .preview-meta { color:#b3bec5; font-size:12px; margin:14px 0; } pre { white-space:pre-wrap; overflow-wrap:anywhere; font-size:12px; background:#0e151b; padding:16px; border-radius:8px; }
    [hidden] { display:none!important; } .lifecycle { border-top:1px solid #394452; margin-top:28px; padding-top:14px; } .lifecycle > summary { cursor:pointer; }
    .preview-workspace { width:100%; max-width:100%; } .preview-workspace.narrow { width:340px; }
    @media(max-width:500px) {main{padding:20px 14px}h1{font-size:26px}}
    </style><main><div class="eyebrow">Tale Fairy / author’s board</div><h1>A world that keeps moving.</h1>
    <p class="intro">Persistent world interpretation. Concurrent story cards. Concrete pressures, with room for the writer to surprise you.</p>
    <nav aria-label="RP examples">${reports.map((report, i) => `<button type="button" data-case="${i}" aria-pressed="${i === 0}">${escape(report.id === 'k-on' ? 'K-on' : report.id === 'star-wars' ? 'Star Wars' : report.id[0].toUpperCase() + report.id.slice(1))}</button>`).join('')}</nav>
    <p class="preview-meta">Authored examples through the real validator, serializer, card renderer and stylesheet. Not captured model output.</p>
    <button type="button" id="drawer-toggle" aria-pressed="false">Narrow drawer preview</button>
    <div id="living-world-guide-settings" class="living-world-guide-panel is-expanded preview-workspace">
    ${reports.map((report, i) => `<div data-example="${i}" ${i ? 'hidden' : ''}><h2>${escape(report.title)}</h2>
        <div class="living-world-guide-board"><section><div data-role="story-cards">${storyCardsHtml(report.stages[0].plan)}</div></section></div>
        <p class="preview-meta">${report.stages[0].writerTokens} / ${WRITER_CONTEXT_TOKEN_LIMIT.toLocaleString('en-US')} estimated writer tokens · ${report.stages[0].omitted} cards omitted · quiet review retains the same packet</p>
        <details class="tf-story-diagnostics"><summary>Exact writer packet</summary><pre>${escape(report.stages[0].writerPacket)}</pre></details>
        <details class="lifecycle"><summary>After an arc ends · see status changes</summary><div class="living-world-guide-board"><section><div data-role="story-cards">${storyCardsHtml(report.stages[2].plan)}</div></section></div>
        <details class="tf-story-diagnostics"><summary>Updated writer packet</summary><pre>${escape(report.stages[2].writerPacket)}</pre></details></details></div>`).join('')}
    </div></main><script>document.querySelectorAll('[data-case]').forEach(button => button.addEventListener('click', () => {
        document.querySelectorAll('[data-case]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        document.querySelectorAll('[data-example]').forEach(item => item.hidden = item.dataset.example !== button.dataset.case);
    }));
    document.querySelector('#drawer-toggle').addEventListener('click', event => {
        const narrow = document.querySelector('.preview-workspace').classList.toggle('narrow');
        event.currentTarget.setAttribute('aria-pressed', String(narrow));
    });</script></html>`;
}

async function main() {
    if (!process.env.TF_CARD_OUTPUT) throw Error('Set TF_CARD_OUTPUT to an output directory outside the repository.');
    const output = path.resolve(process.env.TF_CARD_OUTPUT), root = fileURLToPath(new URL('..', import.meta.url));
    const relative = path.relative(root, output);
    if (!relative || !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) throw Error('Output must be outside the repository.');
    fs.mkdirSync(output, { recursive: true });
    const reports = [];
    for (const fixture of storyCardCases) {
        const report = await evaluateCardCase(fixture); reports.push(report);
        fs.writeFileSync(path.join(output, `${report.id}.json`), JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ id: report.id, calls: report.calls, stages: report.stages.map(({ name, writerTokens, omitted, notices }) => ({ name, writerTokens, omitted, notices })) }));
    }
    fs.writeFileSync(path.join(output, 'story-cards.html'), cardPreviewHtml(reports));
    fs.writeFileSync(path.join(output, 'writer-packets.md'), '# Story card examples\n\nAuthored fixtures through production code; not live model outputs.\n\n'
        + reports.map(report => `## ${report.title}\n\n` + report.stages.map(stage => `### ${stage.name}\n\n${stage.writerTokens} estimated tokens; ${stage.omitted} omitted.\n\n\`\`\`text\n${stage.writerPacket}\n\`\`\`\n`).join('\n')).join('\n'));
    if (reports.some(report => report.stages.some(stage => stage.omitted || stage.notices.length))) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
