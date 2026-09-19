// Isolated, resumable one-shot planning and writer evaluation. No ST writes.
// Run --freeze first, --plan to prepare/review, --write for one writer turn.
// --say 'ordinary IC reply' appends only to this external evaluation branch.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { touringCase, closedCase, workshopCase, relationshipCase, ecosystemCase, backgroundCase } from './single-pass-planner-cases.mjs';
import { appendFixtureStage } from './fixture-progression.mjs';
import { isolatedProvider } from './isolated-planner-provider.mjs';
import { isolatedWriterProvider, isolatedWriterPreparation } from './isolated-writer-provider.mjs';
import { presetSnapshot, presetWriterInput, presetWithoutPsycheField, resolvedPlannerReference, acceptedStoryEvidence } from './writer-preset-prototype.mjs';
import { buildStoryEvidence } from '../extension/analysis.js';
import { estimateTokenCount } from '../extension/token-budget.js';
import { plannerOutputTokenBudget } from '../extension/reasoning-policy.js';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { ensureGuidanceInChat } from '../extension/request-injection.js';
import { campaignInput, campaignPayload, campaignUsable, emptyCampaign } from '../extension/campaign-planner.js';
import { campaignEvidenceMessages, campaignReviewWindow } from '../extension/campaign-evidence.js';
import { CampaignRuntime } from '../extension/campaign-runtime.js';
import { STORY_SCHEMA as OWNED_SCHEMA, storyInput as ownedInput, storyPass as ownedPass, needsEventReframe } from '../extension/story-selection.js';

const args = process.argv.slice(2), root = process.env.TF_ST_ROOT, output = path.resolve(process.env.TF_EVAL_OUTPUT || '');
if (args.includes('--fixture-stage') && args.some(arg => ['--freeze', '--say', '--write', '--revalidate-plan'].includes(arg))) throw Error('Fixture progression cannot mix with freezing, writer play or revalidation');
if (args.includes('--saved-plan') && (!args.includes('--freeze') || process.env.TF_CASE !== 'real'
    || process.env.TF_BRANCH || process.env.TF_FROZEN)) throw Error('--saved-plan requires a fresh real-chat freeze');
if (args.includes('--raw-source-names') && args.includes('--resolved-source-names')) throw Error('Choose raw or resolved source names, not both');
if (args.includes('--revalidate-plan') && args.some(arg => ['--plan', '--write', '--say', '--live', '--freeze'].includes(arg))) throw Error('Offline validation cannot generate, freeze or append play');
const repo = fileURLToPath(new URL('..', import.meta.url));
if (!root || !process.env.TF_EVAL_OUTPUT) throw Error('TF_ST_ROOT and external TF_EVAL_OUTPUT required');
for (const base of [root, repo].map(p => path.resolve(p))) if (output === base || output.startsWith(base + path.sep)) throw Error('External artifact directory required');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const hash = v => crypto.createHash('sha256').update(typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v)).digest('hex');
const write = (p, value) => fs.writeFileSync(path.join(output, p), JSON.stringify(value, null, 2));
const settingsBytes = fs.readFileSync(path.join(root, 'data/default-user/settings.json'));
const settings = JSON.parse(settingsBytes);

function card(file) {
    const bytes = fs.readFileSync(file);
    for (let offset = 8; offset + 12 <= bytes.length;) {
        const size = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
        const value = bytes.subarray(offset + 8, offset + 8 + size); offset += size + 12;
        if (type !== 'tEXt' || value.toString('ascii', 0, 6) !== 'chara\0') continue;
        const parsed = JSON.parse(Buffer.from(value.subarray(6).toString(), 'base64').toString('utf8'));
        return parsed.data || parsed;
    }
    throw Error('Character metadata missing');
}

if (args.includes('--freeze')) {
    if (fs.existsSync(output)) throw Error('Freeze requires a fresh directory');
    const name = process.env.TF_CASE || 'touring';
    const branch = process.env.TF_BRANCH;
    if (branch && process.env.TF_FROZEN) throw Error('Choose an initial frozen fixture or a progressed branch, not both');
    let fixture, importedPlan;
    if (branch) {
        fixture = read(path.join(branch, 'fixture.json'));
    } else if (process.env.TF_FROZEN) {
        fixture = read(path.join(process.env.TF_FROZEN, 'fixture.json'));
    } else if (name === 'real') {
        const sourceFile = process.env.TF_CHAT;
        if (!sourceFile) throw Error('TF_CHAT required');
        const bytes = fs.readFileSync(sourceFile), rows = bytes.toString('utf8').trim().split('\n').map(JSON.parse);
        const metadata = rows.shift().chat_metadata, characterName = path.basename(path.dirname(sourceFile));
        const data = card(path.join(root, 'data/default-user/characters', characterName + '.png'));
        const reference = Object.fromEntries(['description', 'personality', 'scenario'].map(k => [k, data[k] || '']));
        reference.persona = settings.power_user.persona_description || '';
        if (data.system_prompt) reference.cardSystemReference = data.system_prompt;
        fixture = { name, reference, characterName, userName: rows.findLast(m => m.is_user)?.name || 'Elizabeth',
            messages: rows.map((m, index) => ({ index, role: m.is_user ? 'user' : 'assistant', content: m.mes })),
            historical: buildStoryEvidence(rows), sourceFile, sourceHash: hash(bytes), legacyNotebook: metadata.livingWorldGuide?.preparedWorld };
        if (args.includes('--saved-plan')) {
            const preparation = metadata.livingWorldGuide?.campaignPreparation;
            const hostMessages = rows.map(m => ({ mes: m.mes || '', is_user: Boolean(m.is_user), name: m.name || '' }));
            if (!campaignUsable(preparation, { chatId: path.basename(sourceFile, '.jsonl'),
                referenceHash: preparation?.source?.referenceHash, messages: hostMessages, fingerprint: hash })) {
                throw Error('Saved plan does not match the live accepted source prefix');
            }
            importedPlan = structuredClone(preparation);
        }
    } else {
        const f = { touring: touringCase, closed: closedCase, workshop: workshopCase,
            relationship: relationshipCase, ecosystem: ecosystemCase, background: backgroundCase }[name]?.();
        if (!f) throw Error('Unknown case');
        fixture = { name, reference: f.bootstrap, characterName: 'Storyteller', userName: ['relationship', 'background'].includes(name) ? 'Alex' : 'Neri',
            messages: f.messages.map((m, index) => ({ index, role: m.is_user ? 'user' : 'assistant', content: m.mes })),
            stages: f.stages.map(stage => ({ name: stage.name,
                append: stage.append.map(m => ({ role: m.is_user ? 'user' : 'assistant', content: m.mes })) })),
            historical: {}, legacyNotebook: f.notebook };
    }
    let startingMessages = branch ? read(path.join(branch, 'conversation.json')) : fixture.messages;
    if (process.env.TF_MESSAGE_COUNT !== undefined) {
        const count = Number(process.env.TF_MESSAGE_COUNT);
        if (!branch || !Number.isSafeInteger(count) || count < 1 || count > startingMessages.length) throw Error('Fork prefix must be a nonempty existing accepted prefix');
        if (count < fixture.messages.length) throw Error('Fork prefix predates the frozen historical evidence; create a new source fixture');
        startingMessages = startingMessages.slice(0, count);
    }
    const startingState = branch ? read(process.env.TF_BASE_STATE || path.join(branch, 'state.json'))
        : importedPlan ? { ...importedPlan, source: { chatId: fixture.name, referenceHash: hash(fixture.reference),
            messageCount: importedPlan.source.messageCount,
            fingerprint: hash(startingMessages.slice(0, importedPlan.source.messageCount)) } } : emptyCampaign();
    if (startingState.revision && !campaignUsable(startingState, { chatId: fixture.name, referenceHash: hash(fixture.reference), messages: startingMessages, fingerprint: hash })) throw Error('Fork preparation does not match the accepted source prefix');
    fs.mkdirSync(output, { recursive: true });
    const presetSource = branch || process.env.TF_FROZEN;
    write('fixture.json', fixture); write('preset.json', presetSource ? read(path.join(presetSource, 'preset.json')) : presetSnapshot(settings));
    write('conversation.json', startingMessages); write('state.json', startingState);
    write('report.json', { started: new Date().toISOString(), sourceSettingsHash: hash(settingsBytes),
        ...(importedPlan ? { importedPlan: { originalSource: importedPlan.source, revision: importedPlan.revision,
            note: 'Verified saved text prefix, then rebound hashes to the isolated fixture. Static reference only; live World Info and Continuity are not reproduced. Live plan is not edited.' } } : {}),
        ...(branch ? { fork: { branch, baseState: process.env.TF_BASE_STATE || path.join(branch, 'state.json'), revision: startingState.revision, messages: startingMessages.length, fingerprint: hash(startingMessages) } } : {}),
        protocol: 'One AI request per TF pass; no retries, repairs, critics or staging. Planning and writing are explicit separate steps. Manually supplied IC replies see only accepted prose. Source is frozen; all output is an isolated branch. The initial legacy notebook is archived in the fixture and not a source of established facts. The current configured writer preset is retained. No runtime World Info or Continuity injection is reproduced; historical evidence comes from production transcript extraction. Evidence windows contain complete messages and complete retained preparation, with omitted ranges disclosed. No live ST mutation.', runs: [] });
    console.log(JSON.stringify({ frozen: fixture.name, messages: startingMessages.length, revision: startingState.revision, output }));
    process.exit(0);
}

const fixture = read(path.join(output, 'fixture.json')), preset = read(path.join(output, 'preset.json'));
let messages = read(path.join(output, 'conversation.json')), state = read(path.join(output, 'state.json'));
const report = read(path.join(output, 'report.json'));
const save = () => { write('state.json', state); write('conversation.json', messages); write('report.json', report); };
if (args.includes('--fixture-stage')) {
    const stage = args[args.indexOf('--fixture-stage') + 1];
    messages = appendFixtureStage(fixture, messages, stage);
    report.syntheticProgression = [...(report.syntheticProgression || []), { stage, messageCount: messages.length,
        fingerprint: hash(messages), note: 'Fixed synthetic accepted play, not a writer completion or live RP event.' }];
    save();
}
if (args.includes('--say')) {
    const speech = args[args.indexOf('--say') + 1];
    if (!speech || speech.startsWith('--') || messages.at(-1)?.role !== 'assistant') throw Error('Expected IC user reply after an assistant');
    messages.push({ index: messages.length, role: 'user', content: speech }); save();
}
const historical = args.includes('--frozen-history') ? fixture.historical : acceptedStoryEvidence(messages, fixture);
const historicalProjection = args.includes('--frozen-history') ? 'Initial frozen historical evidence (legacy comparison)'
    : 'Production bounded extraction rebuilt from the complete current accepted prefix; not runtime Continuity or World Info';
const source = () => ({ chatId: fixture.name, referenceHash: hash(fixture.reference), messageCount: messages.length, fingerprint: hash(messages) });
const window = count => {
    const indexes = new Set([0, 1, ...messages.slice(-count).map(m => m.index)]);
    return messages.filter(m => indexes.has(m.index));
};
const nextId = kind => `${String(report.runs.length + 1).padStart(3, '0')}-${kind}`;
function newRun(kind) {
    const protocol = Object.fromEntries(['../extension/campaign-planner.js', '../extension/owned-development.js', '../extension/event-planning.js', '../extension/story-selection.js', '../extension/accepted-witnesses.js', '../extension/selected-material.js', '../extension/background-progress.js', '../extension/undertaking-lifecycle.js', '../extension/campaign-evidence.js', '../extension/campaign-runtime.js', 'evaluate-campaign-pass.mjs', 'fixture-progression.mjs', 'single-pass-planner-cases.mjs', 'writer-preset-prototype.mjs', 'isolated-planner-provider.mjs', 'isolated-writer-provider.mjs']
        .map(p => [p, fs.readFileSync(new URL(p, import.meta.url), 'utf8')]));
    const id = nextId(kind), run = { id, kind, started: new Date().toISOString(), calls: 0,
        ...(process.env.TF_EVAL_NOTE ? { evaluationNote: process.env.TF_EVAL_NOTE } : {}),
        sourceMessageCount: messages.length, sourceFingerprint: hash(messages), historicalProjection, currentSettingsHash: hash(settingsBytes),
        protocolHash: hash(protocol), protocolHashBasis: 'saved-source-bundle' };
    report.runs.push(run);
    write(id + '-protocol.json', protocol);
    save(); return run;
}
async function oneRequest(run, conversation, generate) {
    write(run.id + '-request.json', conversation);
    if (!args.includes('--live')) { run.dry = true; save(); return null; }
    run.calls++; save(); const start = Date.now();
    try {
        const result = await generate(conversation);
        Object.assign(run, { elapsedMs: Date.now() - start, usage: result.usage, finishReason: result.finishReason,
            reportedModel: result.reportedModel ?? null });
        fs.writeFileSync(path.join(output, run.id + '-raw.txt'), result.text); save(); return result;
    } catch (error) {
        Object.assign(run, { elapsedMs: Date.now() - start, accepted: false, ended: new Date().toISOString(),
            ...(error.diagnostic ? { diagnostic: error.diagnostic } : {}),
            error: error.status ? `HTTP ${error.status}` : `Transport ${error.name}; details withheld` });
        save(); throw Error(run.error);
    }
}

// Offline regression check of the exact already-paid-for response. Preserve
// the original failure and record a separate zero-call validation checkpoint.
if (args.includes('--revalidate-plan')) {
    const id = args[args.indexOf('--revalidate-plan') + 1];
    const prior = report.runs.find(run => run.id === id);
    if (!prior?.ended || prior.kind !== 'planner' || prior.calls !== 1 || prior.accepted
        || prior.finishReason !== 'stop' || prior.planningContract !== OWNED_SCHEMA.name
        || prior.sourceMessageCount !== messages.length) throw Error('Expected a terminal rejected plot pass on this exact prefix');
    const originalFingerprint = prior.sourceFingerprint || (report.fork?.messages === prior.sourceMessageCount ? report.fork.fingerprint : null);
    if (!originalFingerprint || originalFingerprint !== hash(messages)) throw Error('Complete accepted prefix changed; recorded output cannot be reused');
    const indices = new Set(prior.evidence);
    const reference = resolvedPlannerReference(fixture.reference, fixture);
    const input = ownedInput({ reference, state, playerNames: [fixture.userName], reviewedMessageCount: state.source?.messageCount || 0,
        messages: campaignEvidenceMessages(messages.filter(m => indices.has(m.index)), { narrative: true }),
        historical: { ...historical, opening: undefined } }, prior.inputBudget);
    const request = read(path.join(output, id + '-request.json'));
    if (request.find(message => message.role === 'user')?.content !== input.prompt) throw Error('Source or prior preparation changed; recorded output cannot be reused');
    const run = newRun('validation');
    run.revalidates = id;
    run.evaluationNote = 'Deterministic validation of unchanged recorded output after a parser fix; zero AI calls, original failure preserved.';
    const result = await ownedPass({ state, input, source: source(), generate: async () => ({
        text: fs.readFileSync(path.join(output, id + '-raw.txt'), 'utf8'), finishReason: prior.finishReason }) });
    run.accepted = result.accepted;
    if (result.error) run.validationError = result.error;
    if (result.accepted) { state = result.state; write(run.id + '-state.json', state); }
    run.ended = new Date().toISOString(); save(); console.log(JSON.stringify(run));
}

if (args.includes('--plan')) {
    const run = newRun('planner');
    if (process.env.TF_EVAL_REASONING && args.includes('--writer-as-planner')) throw Error('Reasoning override supports the isolated saved-planner route only.');
    const provider = args.includes('--writer-as-planner') ? await isolatedWriterProvider(root, preset, fixture)
        : isolatedProvider(root, { mode: process.env.TF_EVAL_REASONING || settings.extension_settings['living-world-guide'].analysisReasoningMode });
    if (process.env.TF_EVAL_REASONING) run.reasoningDiagnostic = 'Explicit isolated override; saved settings unchanged.';
    run.configuration = provider.configuration;
    run.connection = args.includes('--writer-as-planner') ? 'saved-writer-diagnostic' : 'saved-planner';
    const narrative = args.includes('--narrative-evidence');
    const owned = args.includes('--owned-development');
    run.inputBudget = Number(settings.extension_settings['living-world-guide'].maxPromptTokens) || 14000;
    run.planningContract = owned ? OWNED_SCHEMA.name : 'campaign-v1';
    // The host resolves card/persona names before TF reads those fields.
    // Raw mode exists only to reproduce older isolated comparisons.
    const resolveNames = !args.includes('--raw-source-names');
    const reference = resolveNames ? resolvedPlannerReference(fixture.reference, fixture) : fixture.reference;
    run.referenceProjection = resolveNames ? 'Resolve only frozen user/char name macros in static source fields; other source text unchanged.' : 'Frozen raw reference';
    run.evidenceProjection = narrative ? 'remove style/class attributes and older recognized generated status panels (disclosed per message); retain latest panel and all narrative/table text; omit duplicate historical opening supplied whole'
        : args.includes('--text-evidence') ? 'remove-known-html-presentation-attributes; preserve all text and status' : 'verbatim';
    const reviewedCount = (!owned || !needsEventReframe(state)) && campaignUsable(state, { ...source(), messages, fingerprint: hash }) ? state.source.messageCount : 0;
    run.protectedUserIndices = messages.filter(m => m.role === 'user' && m.index >= reviewedCount).map(m => m.index);
    let input;
    for (const count of (narrative ? [32, 24, 20, 16, 12, 8, 4, 2] : [16, 12, 8, 4, 2])) {
        try {
            const selected = campaignReviewWindow(messages, count, reviewedCount);
            const evidence = narrative || args.includes('--text-evidence') ? campaignEvidenceMessages(selected, { narrative }) : selected;
            const selectedHistorical = narrative ? { ...historical, opening: undefined } : historical;
            input = (owned ? ownedInput : campaignInput)({ reference, state, messages: evidence,
                historical: selectedHistorical, playerNames: [fixture.userName], reviewedMessageCount: reviewedCount }, run.inputBudget);
            run.evidence = input.indices; run.inputTokens = input.inputTokens; break;
        } catch (e) { if (!e.message.includes('exceeds')) throw e; }
    }
    if (!input) throw Error('Complete source and retained preparation do not fit');
    const runtime = new CampaignRuntime({ fingerprint: hash,
        ...(owned ? { runPass: ownedPass } : {}),
        read: () => ({ state, messages, chatId: fixture.name, referenceHash: hash(fixture.reference), requestSignature: `${run.protocolHash}:${run.planningContract}:${run.referenceProjection}:${historicalProjection}` }),
        prepare: () => input,
        generate: async (prompt, system, schema) => {
            if (process.env.TF_EVAL_SYSTEM_FILE) {
                if (!owned || args.includes('--writer-as-planner')) throw Error('System diagnostic requires the owned saved-planner route');
                system = fs.readFileSync(process.env.TF_EVAL_SYSTEM_FILE, 'utf8');
                if (!system.trim()) throw Error('Empty planner system diagnostic');
                run.systemDiagnostic = { hash: hash(system), note: 'Isolated system-prompt replacement; runtime code and live settings unchanged. Input fitting still uses the production system estimate.' };
            }
            const conversation = plannerMessages(system, prompt, schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY);
            const raw = await oneRequest(run, conversation, c => provider.generate(c, args.includes('--writer-as-planner') ? 22384 : 6000));
            if (!raw) throw Error('Dry run'); return raw;
        },
        commit: (next, guard) => {
            if (hash(state) !== guard.stateFingerprint || !campaignUsable(next, { ...source(), messages, fingerprint: hash })) return false;
            state = next; return true;
        },
    });
    const result = await runtime.request({ manual: true });
    run.accepted = result.accepted;
    if (result.error) run.validationError = result.error;
    if (result.accepted) { state = result.state; write(run.id + '-state.json', state); }
    run.ended = new Date().toISOString(); save(); console.log(JSON.stringify(run));
}

if (args.includes('--write')) {
    if (messages.at(-1)?.role !== 'user') throw Error('Writer needs a latest user message');
    const run = newRun('writer');
    const substituteWriter = args.includes('--planner-as-writer');
    const provider = substituteWriter ? { ...isolatedProvider(root, { mode: preset.reasoning, temperature: preset.temperature }),
        prepare: await isolatedWriterPreparation(root, fixture) } : await isolatedWriterProvider(root, preset, fixture);
    if (substituteWriter && provider.configuration.model !== 'deepseek-v4.1-flash') throw Error('The approved isolated writer model has changed; no request sent.');
    if (substituteWriter) run.writerSubstitution = { original: preset.model, replacement: provider.configuration.model,
        scope: 'User-approved isolated writing through the saved planner connection; original writer preset and accepted history retained. No live settings changed.' };
    run.configuration = provider.configuration;
    let writerPreset = preset;
    if (args.includes('--without-psyche-field')) {
        writerPreset = presetWithoutPsycheField(preset);
        run.presetDiagnostic = 'Remove only the required pre-prose Psyche template line from an in-memory preset copy; all accepted history, other preset text and live settings remain unchanged.';
    }
    if (args.includes('--connected-scope-diagnostic')) {
        let replaced = 0;
        writerPreset = { ...writerPreset, prompts: writerPreset.prompts.map(prompt => {
            if (typeof prompt.content !== 'string') return { ...prompt };
            return { ...prompt, content: prompt.content.replace(/^- CURRENT:.*Keep HELD threads inactive[^\n]*(?:\n|$)/gm, () => {
                replaced++;
                return '- CURRENT: follow the chosen activity and its connected developments. NPCs can pursue their own aims within it; an earlier HELD summary is not a permanent ban when circumstances make a thread relevant. Preserve USER AGENCY and explicit pacing choices.\n';
            }) };
        }) };
        if (replaced !== 1) throw Error('Expected one held-thread gate; no diagnostic request sent.');
        run.presetDiagnostic = 'In-memory replacement of only the CURRENT/HELD instruction to test connected NPC development; all other preset lines, accepted history and live settings unchanged.';
    }
    const conversation = presetWriterInput({ preset: writerPreset, reference: fixture.reference, history: historical,
        messages: window(22), userName: fixture.userName, characterName: fixture.characterName });
    const usable = campaignUsable(state, { ...source(), messages, fingerprint: hash });
    if (usable && !args.includes('--control')) ensureGuidanceInChat(conversation, campaignPayload(state), { role: 'user', depth: 1, inlineLatestUser: true });
    run.guidanceIncluded = usable && !args.includes('--control');
    const processed = provider.prepare(conversation);
    run.inputTokens = estimateTokenCount(JSON.stringify(processed));
    run.outputReservation = substituteWriter ? plannerOutputTokenBudget(preset.maxOutput, preset.reasoning) : preset.maxOutput;
    if (run.inputTokens + run.outputReservation > preset.context) throw Error('Writer context overflow');
    const result = await oneRequest(run, processed, c => provider.generate(c, preset.maxOutput));
    if (result && result.text.trim() && result.finishReason !== 'length') {
        messages.push({ index: messages.length, role: 'assistant', content: result.text }); run.accepted = true;
    } else run.accepted = false;
    run.ended = new Date().toISOString(); save(); console.log(JSON.stringify(run));
}
