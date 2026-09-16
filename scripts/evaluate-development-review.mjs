import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { reviewBasis, applyDevelopmentReview } from './development-review-prototype.mjs';
import { PREPARATION_SCHEMA } from './development-preparation-prototype.mjs';
import { extractJson } from '../extension/analysis.js';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { estimateTokenCount } from '../extension/token-budget.js';

const live = process.argv.includes('--live');
if (!process.env.TF_EVAL_OUTPUT || !process.env.TF_SEQUENCE || !process.env.TF_SOURCE) throw Error('Explicit isolated input/output required.');
const output = path.resolve(process.env.TF_EVAL_OUTPUT), repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
for (const p of [repo, process.env.TF_ST_ROOT].filter(Boolean).map(p => path.resolve(p).toLowerCase())) if (output.toLowerCase() === p || output.toLowerCase().startsWith(p + path.sep)) throw Error('Isolated output required.');
if (fs.existsSync(output)) throw Error('Fresh output required.');
const sequence = path.resolve(process.env.TF_SEQUENCE);
const checkpoints = fs.readdirSync(sequence).map(f => /^round-(\d+)-state\.json$/.exec(f)).filter(Boolean).map(m => Number(m[1]));
const sequenceReport = JSON.parse(fs.readFileSync(path.join(sequence, 'report.json')));
if (!sequenceReport.ended || sequenceReport.error || !checkpoints.length) throw Error('Completed sequence required.');
const state = JSON.parse(fs.readFileSync(path.join(sequence, `round-${Math.max(...checkpoints)}-state.json`)));
const messages = JSON.parse(fs.readFileSync(path.join(sequence, 'accepted-conversation.json')));
const source = JSON.parse(fs.readFileSync(process.env.TF_SOURCE));
const { source_reference, accepted_messages, existing_preparation, ...history } = source;
const basis = reviewBasis(state), id = { type: 'string', enum: state.developments.map(d => d.id) };
const reason = { type: 'string', minLength: 1, maxLength: 900 }, evidence = { type: 'array', minItems: 1, items: { type: 'integer', minimum: 0 } };
const schema = { name: 'development_review', description: 'Explicit ownership decisions for every existing development. Accepted facts remain separately preserved.', value: {
    type: 'object', additionalProperties: false, required: ['basis', 'decisions', 'additions'], properties: {
        basis: { type: 'string', const: basis },
        decisions: { type: 'array', minItems: state.developments.length, maxItems: state.developments.length, items: { oneOf: [
            { type: 'object', additionalProperties: false, required: ['id', 'action'], properties: { id, action: { const: 'retain' }, reason } },
            { type: 'object', additionalProperties: false, required: ['id', 'action', 'reason', 'evidence'], properties: { id, action: { const: 'retire' }, reason, evidence } },
            { type: 'object', additionalProperties: false, required: ['id', 'action', 'reason', 'evidence', 'replacement'], properties: { id, action: { const: 'replace' }, reason, evidence, replacement: PREPARATION_SCHEMA.value.properties.developments.items } },
        ] } },
        additions: { type: 'array', maxItems: 4, items: PREPARATION_SCHEMA.value.properties.developments.items },
    },
} };
const system = `Review Tale Fairy's durable repertoire after actual generated play. This is an infrequent preparation review, not the next reply. All supplied accepted messages are authoritative; stored designs are private possibilities, not evidence of earlier events. Give an explicit retain, replace or retire decision for EVERY existing development. Retain unused but compatible material; don't erase or replace it simply because attention moved elsewhere. Replace a subject only when meaningful actual changes require a better future design. Keep its ID, useful specific material and open possibilities while respecting actual revisions/refusals. Retire only a genuinely ended or excluded subject with accepted evidence. You may add a useful independent development if there is room (at most four active total), but need not fill slots.

The middle and future should change because of play, not restart the same invitation or stretch the latest problem forever. Preserve genre breadth, concrete material and NPC initiative. Current accepted work need not secretly have been the originally proposed larger project: if there is a useful connection, propose it as a future creative possibility rather than falsely claiming it was established. New compatible designs are welcome; player actions/feelings/commitments remain the user's. Refusal of a public event is not abandonment of private work. Time advances only through the accepted fiction. Existing source facts and naming/identity constraints govern invention. Never write new accepted history or rewrite the RP scope. Use exact supplied basis and record IDs. Return JSON only.`;
const prompt = JSON.stringify({ basis, source_reference, accepted_historical_context: history, notebook: state, accepted_messages: messages });
const inputTokens = estimateTokenCount(system + JSON.stringify(schema) + prompt);
if (inputTokens > 24000) throw Error('Complete review exceeds budget.');
fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(path.join(output, 'protocol-snapshot'));
for (const f of ['evaluate-development-review.mjs', 'development-review-prototype.mjs', 'development-preparation-prototype.mjs', 'isolated-planner-provider.mjs']) fs.copyFileSync(new URL(f, import.meta.url), path.join(output, 'protocol-snapshot', f));
const provider = live ? isolatedProvider(process.env.TF_ST_ROOT) : null;
const conversation = plannerMessages(system, prompt, schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY);
fs.writeFileSync(path.join(output, 'request.json'), JSON.stringify(conversation, null, 2));
const report = { started: new Date().toISOString(), live, inputTokens, configuration: provider?.configuration, sequence, attempts: [], protocol: 'One live broad review of the full emergent conversation. Explicit ownership decisions, stale-basis guard, archived replacement versions; no output repair. At most one retry on 502/503/504, none on 429.' };
const save = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); save();
try {
    if (provider) {
        let r;
        for (let attempt = 1; attempt <= 2; attempt++) {
            const entry = { attempt }, start = Date.now(); report.attempts.push(entry); save();
            try { r = await provider.generate(conversation, 8000); entry.elapsedMs = Date.now() - start; entry.usage = r.usage; entry.finishReason = r.finishReason; break; }
            catch (e) { entry.elapsedMs = Date.now() - start; entry.error = e.status ? `HTTP ${e.status}` : 'Transport failed'; save(); if (attempt === 2 || ![502, 503, 504].includes(e.status)) throw e; await new Promise(r => setTimeout(r, 30000)); }
        }
        fs.writeFileSync(path.join(output, 'response.txt'), r.text);
        const decision = extractJson(r.text), next = applyDevelopmentReview(state, decision, messages.map(m => m.index));
        fs.writeFileSync(path.join(output, 'after.json'), JSON.stringify(next, null, 2));
        report.valid = true; report.decisions = decision.decisions.map(d => ({ id: d.id, action: d.action })); report.additions = decision.additions.map(d => d.id);
        report.acceptedObservationsPreserved = JSON.stringify(next.observations) === JSON.stringify(state.observations);
    }
} catch (e) { report.error = e.status ? `HTTP ${e.status}` : 'Validation/transport failure; inspect response.'; }
report.ended = new Date().toISOString(); save(); console.log(JSON.stringify(report));
