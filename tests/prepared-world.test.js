import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PREPARED_SCHEMA, PREPARED_LIMIT, defaultPreparedWorld, validatePrepared, mergePreparedWorld,
    normalizePreparedWorld, stampPreparedWorld, preparedWorldUsable, preparedWorldForPrompt,
    formatPreparedWorld, formatPacingPreference, compactPreparedForPrompt } from '../extension/prepared-world.js';
import { defaultState, normalizeState, saveState, fingerprintMessages, buildPromptPayload, guidanceSnapshot } from '../extension/state.js';
import { plotInputKey, generationPreviewDescription } from '../extension/generation-context.js';
import { SYSTEM, INCREMENTAL_SYSTEM, ANALYSIS_SCHEMA, INCREMENTAL_ANALYSIS_SCHEMA,
    ANALYSIS_OUTPUT_CONTRACT, INCREMENTAL_ANALYSIS_OUTPUT_CONTRACT, buildAnalysisPrompt } from '../extension/analysis.js';
import { estimateTokenCount } from '../extension/token-budget.js';
import { fitPromptToBudget } from '../extension/prompt-budget.js';
import { generationHarness } from './helpers/generation-harness.js';

const record = (id = 'mill-town') => ({ id, status: 'prepared', origin: 'invented',
    premise: 'A mill town trades warmth from a buried creature; its roads still welcome travelers.',
    engine: 'The millers need winter fuel; the creature needs food and is learning to bargain.',
    middle: 'Meet the carriers, explore the old heating works, then negotiate supply or find another heat source. Either route leaves the town changed.',
    future: 'A regional fuel trade could grow, or neighboring settlements could reject dependence on the creature.',
    entry: 'On reaching a settlement along the chosen route, if its geography still fits.',
    hold: 'Keep dormant during the current camp conversation; do not manufacture a departure.',
    invalidates: 'Do not use if the town or heat source contradicts accepted events or user constraints.',
    intervention: 'Offer observable signs and room to investigate or refuse before any contestable harm.',
    knowledge: 'GM secret: the heat source is alive. Travelers learn through evidence, not narrator-granted knowledge.',
});
const delta = (items = [record()]) => ({ overview: 'Fill the long journey with distinct local experiences and evolving relationships; no leap to its endpoint.', updates: items, focus: [items[0].id] });
const messages = () => [{ is_user: false, mes: 'The travelers rest beside their campfire.' }, { is_user: true, mes: 'I ask about yesterday. Stay here for now.' }];

test('omitted optional preparation notes preserve existing boundaries; explicit blank clears', () => {
    const original = record();
    const prior = mergePreparedWorld(null, delta([original]));
    const { engine, hold, knowledge, ...update } = { ...original, middle: 'The millers begin a new negotiation.' };
    assert.deepEqual(validatePrepared(delta([update])), []);
    const next = mergePreparedWorld(prior, delta([update]));
    assert.equal(next.items[0].engine, engine);
    assert.equal(next.items[0].hold, hold);
    assert.equal(next.items[0].knowledge, knowledge);
    assert.equal(mergePreparedWorld(next, delta([{ ...update, hold: '' }])).items[0].hold, '');
    assert.equal(mergePreparedWorld(null, delta([update])).items[0].engine, '');
    for (const value of [null, [], 123]) assert.ok(validatePrepared(delta([{ ...update, engine: value }])).length);
    assert.equal(prior.items[0].middle, original.middle);
});

test('the lasting approach round-trips, survives legacy deltas and can be explicitly cleared', () => {
    const approach = 'Develop trade, relationships and exploration across the journey, not only its current mystery.';
    const board = mergePreparedWorld(null, { ...delta(), approach });
    assert.equal(normalizeState(JSON.parse(JSON.stringify({ ...defaultState(), preparedWorld: board }))).preparedWorld.approach, approach);
    assert.equal(mergePreparedWorld(board, delta()).approach, approach);
    assert.equal(mergePreparedWorld(board, { ...delta(), approach: '' }).approach, '');
    assert.match(formatPreparedWorld(board), /RP APPROACH/);
    assert.equal(compactPreparedForPrompt(board).approach, approach);
    assert.ok(validatePrepared({ ...delta(), approach: {} }).length);
    assert.ok(validatePrepared({ ...delta(), approach: 'x'.repeat(2401) }).length);
});
function attach(h, board = mergePreparedWorld(null, delta()), source = h.context.chat) {
    const state = h.state();
    const inputsKey = plotInputKey('story', [], h.scope.generationInputs(h.context, state));
    state.preparedWorld = stampPreparedWorld(board, { chatId: 'story', inputsKey, messageCount: source.length, fingerprint: fingerprintMessages(source) });
    h.context.chatMetadata = saveState(h.context.chatMetadata, state);
    return { chatId: 'story', inputsKey, messageCount: source.length, fingerprint: fingerprintMessages(source) };
}

test('preparation has a bounded native schema and rejects malformed lifecycle data', () => {
    assert.equal(PREPARED_SCHEMA.properties.updates.maxItems, 4);
    assert.deepEqual(validatePrepared(delta()), []);
    for (const invalid of [null, [], { ...delta(), updates: 'oops' }, delta([{ ...record(), id: {} }]),
        delta([{ ...record(), premise: '' }]), delta([{ ...record(), origin: 'canon' }]),
        { ...delta(), focus: ['x', 'x'] }, delta([record(), record()])]) {
        assert.ok(validatePrepared(invalid).length);
    }
});

test('a usable plan survives prose overruns and blank optional notes without losing its ending', () => {
    const overview = `${'The journey has several possible continuations. '.repeat(22)}Respect the latest user direction.`;
    const item = { ...record(), engine: '', entry: '', intervention: '', knowledge: '', invalidates: '',
        middle: `${'Explore the town and follow its changing relationships. '.repeat(9)}Let the user decide whether to stay.` };
    const value = { overview, updates: [item], focus: [item.id] };
    assert.ok(overview.length > 900);
    assert.ok(item.middle.length > 440);
    assert.deepEqual(validatePrepared(value), []);
    const saved = normalizeState({ ...defaultState(), preparedWorld: mergePreparedWorld(null, value) });
    assert.equal(saved.preparedWorld.overview, overview);
    assert.equal(saved.preparedWorld.items[0].middle, item.middle);
    const prompt = buildPromptPayload(saved, { preparedUsable: true });
    assert.ok(prompt.includes(overview));
    assert.ok(prompt.includes(item.middle));
    assert.doesNotMatch(prompt, /Do not use if:|Player intervention:|Knowledge boundary:|Driving process:|Entry:/);
    for (const bad of [{ ...value, overview: {} }, { ...value, overview: 'x'.repeat(3601) },
        { ...value, updates: [{ ...item, middle: { code: true } }] }]) {
        assert.ok(validatePrepared(bad).length);
    }
});

test('deltas retain unused material beyond the working limit and retire only explicitly', () => {
    let board = mergePreparedWorld(null, delta());
    board = mergePreparedWorld(board, { overview: '', updates: [record('bridge')], focus: ['bridge'] });
    assert.equal(board.items.length, 2);
    assert.match(board.overview, /long journey/);
    assert.equal(mergePreparedWorld(board, undefined).items.length, 2, 'legacy output is not a deletion');
    board = mergePreparedWorld(board, { overview: '', updates: [{ ...record(), status: 'resolved' }], focus: ['bridge'] });
    assert.deepEqual(board.items.map(x => x.id), ['bridge']);
    assert.throws(() => mergePreparedWorld(board, { overview: '', updates: [], focus: ['missing'] }), /unavailable/);
    for (let i = 1; i < PREPARED_LIMIT; i++) board = mergePreparedWorld(board, { overview: '', updates: [record(`thread-${i}`)], focus: [] });
    const expanded = mergePreparedWorld(board, { overview: '', updates: [record('overflow')], focus: ['overflow'] });
    assert.equal(expanded.items.length, PREPARED_LIMIT + 1);
    assert.deepEqual(normalizePreparedWorld(JSON.parse(JSON.stringify(expanded))), expanded);
    assert.deepEqual(expanded.items.slice(0, -1), board.items);
    assert.equal(board.items.length, PREPARED_LIMIT);
});

test('saved notebook survives normalization without promoting inventions or injecting private records', () => {
    const board = mergePreparedWorld(null, delta([record(), record('private-id')]));
    const state = normalizeState({ ...defaultState(), preparedWorld: board, pacing: { mode: 'linger' } });
    assert.equal(state.preparedWorld.items[0].status, 'prepared');
    assert.equal(state.preparedWorld.items[0].origin, 'invented');
    assert.equal(state.pacing.mode, 'linger');
    assert.deepEqual(normalizeState({ version: 58 }).preparedWorld, defaultPreparedWorld());
    const out = formatPreparedWorld(state.preparedWorld);
    assert.match(out, /CONDITIONAL GM PREPARATION, NOT TRANSCRIPT FACTS/);
    assert.match(out, /Playable middle:/);
    assert.match(out, /Beyond it:/);
    assert.doesNotMatch(out, /private-id|mill-town|inputsKey|fingerprint/);
    assert.match(out, /no obligation to use one/i);
    const dormant = mergePreparedWorld(board, { overview: '', updates: [{ ...record(), status: 'dormant' }], focus: ['mill-town'] });
    assert.doesNotMatch(formatPreparedWorld(dormant), /Driving process:/);
    assert.equal('source' in preparedWorldForPrompt(stampPreparedWorld(board, { chatId: 'story' })), false);
});

test('conditional preparation survives many appended turns but not branch or input changes', () => {
    const h = generationHarness(messages());
    const proof = attach(h);
    for (let i = 0; i < 40; i++) h.context.chat.push({ is_user: i % 2 === 0, mes: `Accepted camp conversation ${i}.` });
    const options = { ...proof, messages: h.context.chat, fingerprint: fingerprintMessages };
    assert.equal(preparedWorldUsable(h.state().preparedWorld, options), true);
    assert.equal(preparedWorldUsable(h.state().preparedWorld, { ...options, chatId: 'other' }), false);
    assert.equal(preparedWorldUsable(h.state().preparedWorld, { ...options, inputsKey: 'changed author/card/lore' }), false);
    assert.equal(preparedWorldUsable(h.state().preparedWorld, { ...options, inputsKey: 'changed author/card/lore', forReplanning: true }), true);
    assert.equal(preparedWorldUsable(h.state().preparedWorld, { ...options, chatId: 'other', forReplanning: true }), false);
    assert.equal(preparedWorldUsable(h.state().preparedWorld, { ...options, messages: h.context.chat.slice(0, 1) }), false);
    h.context.chat[0].mes = 'Replacement branch: the camp never existed.';
    assert.equal(preparedWorldUsable(h.state().preparedWorld, options), false);
    assert.equal(preparedWorldUsable(h.state().preparedWorld, { ...options, forReplanning: true }), false);
});

test('late background preparation cannot roll back newer factual scene state', async () => {
    const h = generationHarness(messages());
    const proof = attach(h);
    const incoming = h.state();
    incoming.scene.status = 'Outdated camp scene';
    incoming.plannerContract = 14;
    incoming.contextLedger = 'Outdated ledger';
    incoming.preparedWorld = stampPreparedWorld(mergePreparedWorld(incoming.preparedWorld, { ...delta([record('new-region')]), approach: 'Keep relationships and exploration alive across regions.' }), proof);
    for (let i = 0; i < 10; i++) h.context.chat.push({ is_user: i % 2 === 0, mes: `Later exchange ${i}.` });
    const current = h.state();
    current.scene.status = 'Current bridge scene'; current.contextLedger = 'The accepted bridge events';
    h.context.chatMetadata = saveState(h.context.chatMetadata, current);
    await h.scope.persist(incoming, proof);
    assert.equal(h.state().scene.status, 'Current bridge scene');
    assert.equal(h.state().contextLedger, 'The accepted bridge events');
    assert.ok(h.state().preparedWorld.items.some(x => x.id === 'new-region'));
    assert.equal(h.state().preparedWorld.approach, incoming.preparedWorld.approach);
    assert.equal(h.state().plannerContract, 14, 'a delayed first brief is not mistaken for legacy material on the next call');
    h.context.card = { scenario: 'A different world' };
    await assert.rejects(h.scope.persist(incoming, proof), /changed/);
});

test('a plan from an older source cannot replace a newer prepared notebook', async () => {
    const h = generationHarness(messages());
    const proof = attach(h);
    const incoming = h.state();
    h.context.chat.push({ is_user: false, mes: 'They reached the bridge.' }, { is_user: true, mes: 'I cross.' });
    attach(h, mergePreparedWorld(null, delta([record('newer')])), h.context.chat);
    await h.scope.persist(incoming, proof);
    assert.equal(h.state().preparedWorld.items[0].id, 'newer');
});

test('preparation-only retry packets never revive stale facts and stay frozen', () => {
    const h = generationHarness(messages()); attach(h, mergePreparedWorld(null, { ...delta(), approach: 'OLD APPROACH to preserve for this retry.' }));
    const old = h.state(); old.contextLedger = 'STALE FACT DO NOT RESTORE'; old.scene.status = 'STALE FACT DO NOT RESTORE';
    h.context.chatMetadata = saveState(h.context.chatMetadata, old);
    h.context.chat.push({ is_user: false, mes: 'More conversation.' }, { is_user: true, mes: 'I keep listening.' });
    const selected = h.prepare();
    assert.equal(selected.preparedUsable, true);
    assert.match(selected.payload, /<prepared-world>/);
    assert.match(selected.payload, /OLD APPROACH/);
    const packet = h.scope.buildGenerationPacket(h.state(), h.context.chat, h.context, 'normal', false);
    assert.doesNotMatch(JSON.stringify(packet.plannerState), /STALE FACT DO NOT RESTORE/);
    const frozen = selected.payload;
    attach(h, mergePreparedWorld(null, { ...delta([record('later-idea')]), approach: 'NEW APPROACH for a later request.' }));
    assert.equal(h.scope.generationGuideSelection.payload, frozen, 'late completion cannot rewrite an in-flight selection');
});

test('older same-source jobs cannot overwrite newer preparation', async () => {
    const h = generationHarness(messages());
    const proof = attach(h);
    const incoming = h.state();
    const newer = h.state();
    newer.preparedWorld = stampPreparedWorld(mergePreparedWorld(null, delta([record('newer')])), { ...proof, startedAt: 200 });
    h.context.chatMetadata = saveState(h.context.chatMetadata, newer);
    await h.scope.persist(incoming, { ...proof, startedAt: 100 });
    assert.equal(h.state().preparedWorld.items[0].id, 'newer');
});

test('rebuild clears preparation but preserves the user pacing preference and notes', () => {
    const h = generationHarness(messages()); attach(h);
    const prior = h.state(); prior.pacing.mode = 'linger';
    const rebuilt = h.scope.rebuildState(prior);
    assert.equal(rebuilt.pacing.mode, 'linger');
    assert.deepEqual(rebuilt.userNotes, prior.userNotes);
    assert.deepEqual(rebuilt.preparedWorld, defaultPreparedWorld());
    assert.equal(prior.preparedWorld.items.length, 1);
});

test('rapid ordinary exchanges coalesce without cancelling the active source', async () => {
    const h = generationHarness(messages());
    h.scope.analysisPromise = new Promise(() => {});
    h.scope.activeAnalysisIntent = { chatId: 'story', allowOneAssistantAppend: false };
    h.scope.analysisRequestFingerprint = fingerprintMessages(h.context.chat);
    h.scope.activeAnalysisMessageCount = h.context.chat.length;
    const revision = h.scope.generationRevision;
    for (let i = 0; i < 8; i++) {
        h.context.chat.push({ is_user: false, mes: `Camp conversation ${i}` }); await h.emit('MESSAGE_RECEIVED');
        h.context.chat.push({ is_user: true, mes: `Continue talking ${i}` }); await h.emit('MESSAGE_SENT');
    }
    await h.flush();
    assert.equal(h.scope.generationRevision, revision);
    assert.ok(h.scope.queuedAnalysisIntent);
    assert.equal(h.calls.length, 0, 'no concurrent per-message planner calls');
    h.context.chat[0].mes = 'Edited source';
    assert.equal(h.scope.runningSourceHasOnlyAppends(), false);
});

test('writer policy, preview and verification distinguish preparation from fresh facts', () => {
    const state = defaultState(); state.preparedWorld = mergePreparedWorld(null, delta());
    const payload = buildPromptPayload(state, { preparedUsable: true });
    assert.match(payload, /<prepared-world>/);
    assert.doesNotMatch(payload, /RELEVANT UNDERLYING CONDITIONS/);
    assert.equal(guidanceSnapshot(state, { preparedUsable: true }).preparedContextIncluded, true);
    assert.match(generationPreviewDescription({ future: true }), /Conditional preparation/);
    for (const mode of ['auto', 'linger', 'natural', 'advance']) {
        assert.match(formatPacingPreference(mode), /Latest explicit user instructions override/);
        assert.match(formatPacingPreference(mode), /Scene duration, meaningful development and outside interruption are separate/);
    }
    assert.match(formatPacingPreference('linger'), /without padding or forced closure/);
    assert.match(formatPacingPreference('advance'), /without skipping live decisions/);
    assert.equal(buildPromptPayload(state, { preparedUsable: true, generationType: 'quiet' }), '');
});

test('full notebooks fit real default envelopes without deletion or losing the newest user instruction', async () => {
    const state = defaultState();
    state.preparedWorld = normalizePreparedWorld({ ...delta(), items: Array.from({ length: 12 }, (_, i) => record(`item-${i}`)), focus: ['item-0'] });
    const before = JSON.stringify(state);
    const runtime = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
    const marker = runtime.match(/const INTERNAL_PLANNER_MARKER = '([^']+)'/)[1];
    for (const routine of [true, false]) {
        const budget = routine ? 10000 : 14000;
        const fixedEnvelope = `${marker}\n${routine ? INCREMENTAL_SYSTEM : SYSTEM}\n${routine ? INCREMENTAL_ANALYSIS_OUTPUT_CONTRACT : ANALYSIS_OUTPUT_CONTRACT}\n${JSON.stringify(routine ? INCREMENTAL_ANALYSIS_SCHEMA : ANALYSIS_SCHEMA)}`;
        const prompt = await fitPromptToBudget({ fixedEnvelope, tokenBudget: budget,
            buildPrompt: effectivePromptTokens => buildAnalysisPrompt(messages(), state, '', {}, { incremental: routine, maxPromptTokens: budget, effectivePromptTokens }) });
        assert.ok(estimateTokenCount(`${fixedEnvelope}\n${prompt}`) <= budget);
        const parsed = JSON.parse(prompt);
        assert.equal(parsed.messages.at(-1).content, messages().at(-1).mes);
        assert.equal(parsed.current.preparedWorld.items.length, 12);
        assert.match(parsed.current.preparedWorld.overview, /long journey/);
    }
    assert.equal(JSON.stringify(state), before);
});


test('compact preparation keeps timing beside entry and the writer receives advisory timing', () => {
    const item = { ...record(), entry: 'Mira opens the book at the table.', hold: 'While the party eats at the table.' };
    const board = mergePreparedWorld(null, delta([item]));
    const compact = compactPreparedForPrompt(preparedWorldForPrompt(board));
    assert.equal(compact.items[0].entry, item.entry);
    assert.equal(compact.items[0].hold, item.hold);
    const packet = formatPreparedWorld(board);
    assert.match(packet, /use a fitting entry despite a conflicting inferred hold/);
    assert.match(packet, /Timing consideration \(only if supported by the actual scene\):/);
    assert.doesNotMatch(packet, /^Keep dormant:/m);
});


test('writer budget selects whole preparations with all their boundaries and keeps omitted records stored', () => {
    const items = ['first', 'second', 'third'].map(id => ({ ...record(id),
        premise: `Proposal ${id}: ` + record().premise,
        middle: record().middle.repeat(3),
        knowledge: `Only the keeper knows secret-${id}.`,
        invalidates: `Never use ${id} if the bridge has fallen.`,
    }));
    const board = mergePreparedWorld(null, { overview: '', updates: items, focus: items.map(item => item.id) });
    const before = JSON.stringify(board);
    const output = formatPreparedWorld(board);
    assert.ok(estimateTokenCount(output) <= 1000);
    assert.match(output, /Proposal first:/);
    const included = items.filter(item => output.includes(item.premise));
    assert.ok(included.length < items.length);
    for (const item of items) {
        if (included.includes(item)) {
            for (const key of ['middle', 'hold', 'invalidates', 'intervention', 'knowledge']) assert.ok(output.includes(item[key]));
        } else assert.ok(!output.includes(item.knowledge));
    }
    assert.equal(JSON.stringify(board), before);
});


test('large saved notebooks retrieve old relevant records and keep focused boundaries intact', () => {
    const items = Array.from({ length: 200 }, (_, i) => record(`record-${i}`));
    items[0].premise = 'The glassmakers of Zareph await a promised visit.';
    items[1].status = 'active';
    const board = normalizePreparedWorld({ items, focus: ['record-2'], overview: 'A long journey.' });
    const before = structuredClone(board);
    const view = preparedWorldForPrompt(board, { query: 'Return to Zareph and the glassmakers.' });
    assert.equal(view.items.length, PREPARED_LIMIT);
    for (const id of ['record-0', 'record-1', 'record-2', 'record-199']) {
        assert.deepEqual(view.items.find(item => item.id === id), board.items.find(item => item.id === id));
    }
    const revised = mergePreparedWorld(board, { overview: '', updates: [{ ...items[3], middle: 'A newly revised direction.' }], focus: board.focus });
    assert.ok(preparedWorldForPrompt(revised).items.some(item => item.id === 'record-3'));
    const retired = mergePreparedWorld(revised, { overview: '', updates: [], status_changes: [{ id: 'record-0', status: 'retired' }], focus: board.focus });
    assert.equal(retired.items.length, 199);
    assert.ok(!retired.items.some(item => item.id === 'record-0'));
    assert.deepEqual(board, before);
    const saved = normalizeState(JSON.parse(JSON.stringify({ ...defaultState(), preparedWorld: revised })));
    assert.deepEqual(saved.preparedWorld, revised);
});


test('rolling planner summary follows source guards, delayed saves and explicit rebuild', async () => {
    const h = generationHarness(messages());
    const proof = attach(h, mergePreparedWorld(null, { ...delta(), summary: 'PRIVATE BASELINE: a distant bargain remains possible.' }));
    const incoming = h.state();
    incoming.preparedWorld = stampPreparedWorld(mergePreparedWorld(incoming.preparedWorld,
        { ...delta(), summary: 'PRIVATE REVISION: the bargain depends on finding winter fuel.' }), proof);
    h.context.chat.push({ is_user: false, mes: 'Another accepted conversation.' });
    await h.scope.persist(incoming, proof);
    assert.equal(h.state().preparedWorld.summary, incoming.preparedWorld.summary);
    assert.doesNotMatch(h.prepare().payload, /PRIVATE BASELINE|PRIVATE REVISION/);
    assert.equal(h.scope.rebuildState(h.state()).preparedWorld.summary, '');
    h.context.chat[0].mes = 'A replacement story branch.';
    assert.equal(preparedWorldUsable(h.state().preparedWorld, { ...proof, messages: h.context.chat, fingerprint: fingerprintMessages }), false);
});


test('saving another author note preserves the first note, full prose and rebuild instructions', async () => {
    const state = defaultState();
    state.userNotes = Array.from({ length: 20 }, (_, i) => ({ kind: 'forbid', text: `Keep instruction ${i}.`, at: i }));
    const h = generationHarness(messages(), state);
    const note = 'A detailed exact instruction. '.repeat(100) + 'Keep this final exception.';
    await h.scope.persistClarifiedNote(note, 'forbid');
    assert.equal(h.state().userNotes.length, 21);
    assert.deepEqual(structuredClone(h.state().userNotes.slice(0, 20)), state.userNotes);
    assert.equal(h.state().userNotes.at(-1).text, note);
    assert.deepEqual(structuredClone(h.scope.rebuildState(h.state()).userNotes), structuredClone(h.state().userNotes));
});
