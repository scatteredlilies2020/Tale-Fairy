import test from 'node:test';
import assert from 'node:assert/strict';
import { preparedWorldForPrompt, normalizePreparedWorld, formatPreparedWorld, stampPreparedWorld, preparedWorldUsable } from '../extension/prepared-world.js';
import { mergeWorldPlan, WORLD_PLANNER_SCHEMA, WORLD_PLANNER_SYSTEM } from '../extension/world-planner.js';
import { buildWorldPlannerPrompt, applyAnalysis, extractJson, validateAnalysisResult } from '../extension/analysis.js';
import { defaultState, normalizeState, buildPromptPayload, isDirectionCurrent, fingerprintMessages } from '../extension/state.js';
import { fitPromptToBudget, plannerEvidenceAudit } from '../extension/prompt-budget.js';
import { plannerBudgetEnvelope, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';
import { estimateTokenCount } from '../extension/token-budget.js';
import { stageNotebookCompactions } from '../extension/notebook-compaction.js';
import { refreshGameMasterContract } from '../extension/game-master.js';
import { ensureGuidanceInChat, ensureGuidanceInText } from '../extension/request-injection.js';
import { generationHarness } from './helpers/generation-harness.js';
import { plotInputKey, GENERATION_CONTEXT_KEY } from '../extension/generation-context.js';

const query = 'village investigation witness missing ledger';
const messages = [{ is_user: false, mes: 'The witness has brought the ledger.' }, { is_user: true, mes: 'I ask about the village investigation.' }];
const record = (id, family = 'mystery', premise = query) => ({ id, status: 'prepared', origin: 'invented', family,
    dependency: family === 'mystery' ? 'This lead serves the missing-ledger investigation.' : `The ${family} has its own ongoing work.`,
    premise, middle: `PRIVATE MIDDLE ${id}: several decisions and activities could develop.`, future: `PRIVATE FUTURE ${id}: alternative consequences over years.`,
    knowledge: 'The characters have not learned the private proposal.' });
const wire = (updates = [], focus = [], writer = []) => ({ contract_version: 14, prepared: { updates, focus, writer } });
const seed = () => normalizePreparedWorld({ items: [
    ...Array.from({ length: 12 }, (_, i) => record(`local-${i}`)),
    ...Array.from({ length: 12 }, (_, i) => record(`outside-${i}`, `work-${i}`, 'An orchard cooperative develops a shared nursery.')),
], focus: ['local-0', 'local-1', 'local-2'] });

test('current-arc relevance cannot consume the complete planner working view, including unclassified legacy rows', () => {
    for (const legacy of [false, true]) {
        const board = seed();
        if (legacy) board.items.forEach(item => { delete item.family; delete item.dependency; });
        const before = structuredClone(board);
        const selected = preparedWorldForPrompt(board, { query });
        assert.equal(selected.items.length, 12);
        assert.equal(selected.attention.local.length, 6);
        assert.equal(selected.attention.wider.length, 6);
        assert.equal(selected.items.filter(item => item.id.startsWith('outside')).length, 6);
        assert.deepEqual(board, before, 'selection neither rewrites storage nor advances review rotation');
        assert.equal(new Set([...selected.attention.local, ...selected.attention.wider]).size, 12);
    }
});

test('small notebooks also retain local and wider review witnesses', () => {
    const selected = preparedWorldForPrompt({ items: [record('a'), record('b', 'orchard', 'Orchard work')], focus: ['a'] }, { query });
    assert.deepEqual(selected.attention, { local: ['a'], wider: ['b'] });
    assert.deepEqual(preparedWorldForPrompt({ items: [], focus: [] }).attention, { local: [], wider: [] });
});

test('successful passes rotate attention across neglected rows without altering story content or status', () => {
    let board = seed();
    // Even identical family labels cannot keep a record out of review forever.
    board.items.forEach(item => { item.family = 'same-problem'; });
    const originals = structuredClone(board.items);
    const seen = new Set();
    for (let pass = 0; pass < 24; pass++) {
        const selected = preparedWorldForPrompt(board, { query });
        selected.items.forEach(item => seen.add(item.id));
        assert.deepEqual(preparedWorldForPrompt(board, { query }), selected, 'repeated budget fitting is deterministic');
        board = normalizePreparedWorld(JSON.parse(JSON.stringify(mergeWorldPlan(board, wire([], board.focus)))));
    }
    assert.equal(seen.size, 24);
    assert.equal(board.reviewCursor, 24);
    assert.deepEqual(board.items, originals);
    assert.equal(board.writer.length, 0, 'review is not foreground promotion');
});

test('family selection favors other causal roots, rather than new IDs serving the same problem', () => {
    const board = seed();
    // All material matches the current keywords; meaningful family labels
    // still give a different root a place in the wider selection.
    board.items.forEach(item => { item.premise = query; });
    const selected = preparedWorldForPrompt(board, { query });
    assert.ok(selected.items.some(item => item.family !== 'mystery'));
    assert.ok(selected.items.filter(item => selected.attention.wider.includes(item.id)).some(item => item.family !== 'mystery'));
});

test('routine and broad provider-measured budgets preserve complete local and wider witnesses', async () => {
    const state = defaultState();
    state.plannerContract = 14;
    state.preparedWorld = seed();
    state.userNotes = [{ kind: 'establish', text: 'Keep the wider journey and ordinary life available.' }];
    const before = structuredClone(state);
    for (const mode of [PLANNER_OUTPUT_MODE.PROMPT_ONLY, PLANNER_OUTPUT_MODE.JSON_SCHEMA]) {
        const fixedEnvelope = plannerBudgetEnvelope(WORLD_PLANNER_SYSTEM, WORLD_PLANNER_SCHEMA, mode);
        for (const [incremental, tokenBudget] of [[true, 6000], [false, 14000]]) {
            const prompt = await fitPromptToBudget({ fixedEnvelope, tokenBudget,
                tokenCounter: text => Math.ceil(estimateTokenCount(text) * 1.2),
                buildPrompt: effectivePromptTokens => buildWorldPlannerPrompt(messages, state, '', { scenario: 'An open-ended journey with craft, companionship and exploration.' },
                    { incremental, effectivePromptTokens, maxPromptTokens: tokenBudget }) });
            assert.ok(Math.ceil(estimateTokenCount(`${fixedEnvelope}\n${prompt}`) * 1.2) <= tokenBudget);
            const input = JSON.parse(prompt);
            const items = input.current.preparedWorld.items;
            assert.ok(items.some(item => item.id.startsWith('local')));
            assert.ok(items.some(item => item.id.startsWith('outside')));
            for (const item of items) assert.deepEqual(item, Object.fromEntries(Object.entries(before.preparedWorld.items.find(original => original.id === item.id))
                .filter(([key]) => ['id', 'status', 'premise', 'middle', 'future', 'knowledge', 'family', 'dependency'].includes(key))));
            assert.deepEqual(input.constraints.notes, normalizeState(state).userNotes);
            const audit = plannerEvidenceAudit(prompt, []);
            assert.ok(audit.notebookLocalCount && audit.notebookWiderCount);
            const saved = normalizeState({ ...state, summaryEvidence: audit });
            assert.equal(saved.summaryEvidence.notebookWiderCount, audit.notebookWiderCount);
        }
    }
    assert.deepEqual(state, before);
});

test('an impossible protected-view budget reports failure without dropping notes or complete witnesses', async () => {
    const state = { ...defaultState(), plannerContract: 14, preparedWorld: seed(), userNotes: [{ text: 'Exact user instruction. '.repeat(2000), kind: 'establish' }] };
    const before = structuredClone(state);
    await assert.rejects(fitPromptToBudget({ tokenBudget: 6000, fixedEnvelope: plannerBudgetEnvelope(WORLD_PLANNER_SYSTEM, WORLD_PLANNER_SCHEMA),
        buildPrompt: effectivePromptTokens => buildWorldPlannerPrompt(messages, state, '', {}, { effectivePromptTokens, maxPromptTokens: 6000 }) }), /could not be fitted/);
    assert.deepEqual(state, before);
});

test('only affirmative writer material reaches chat and text requests; private trajectories stay in the notebook', () => {
    const content = 'The cooperative opens a shared nursery. Growers pool seedlings and arrange weekend planting sessions.';
    const raw = wire([record('orchard', 'cooperative')], ['orchard'], [{ id: 'orchard', material: content, knowledge: 'Only the growers have seen the planting list.' }]);
    const parsed = extractJson(JSON.stringify(raw));
    assert.equal(validateAnalysisResult(parsed).valid, true);
    const state = normalizeState(JSON.parse(JSON.stringify(applyAnalysis(defaultState(), parsed, messages))));
    const before = structuredClone(state);
    const payload = buildPromptPayload(state, { preparedUsable: true });
    assert.ok(payload.includes(content));
    assert.match(payload, /Only the growers/);
    assert.doesNotMatch(payload, /PRIVATE MIDDLE|PRIVATE FUTURE|same-problem|dependency|craftsmanship|hesitat|do not|avoid|preset/i);
    assert.equal(refreshGameMasterContract(payload), payload);
    const request = [{ role: 'system', content: 'My preset: spare prose.' }, { role: 'user', content: 'We arrive.' }];
    ensureGuidanceInChat(request, payload);
    assert.deepEqual(request[0], { role: 'system', content: 'My preset: spare prose.' });
    assert.ok(ensureGuidanceInText('My text preset.', payload).includes(content));
    assert.deepEqual(state, before);
    assert.equal(state.preparedWorld.items[0].status, 'prepared');
    const input = JSON.parse(buildWorldPlannerPrompt(messages, state));
    assert.match(JSON.stringify(input), /PRIVATE MIDDLE|PRIVATE FUTURE/);
    assert.ok(!JSON.stringify(input).includes(content), 'the last writer packet is not recycled as planner evidence');
});

test('legacy responses and deliberate empty selections keep preparation private and count as completed work', () => {
    const legacy = wire([record('a')], ['a']);
    delete legacy.prepared.writer;
    let state = applyAnalysis(defaultState(), legacy, messages);
    assert.equal(isDirectionCurrent(state, messages), true);
    assert.doesNotMatch(buildPromptPayload(state, { preparedUsable: true }), /<prepared-world>/);
    state = applyAnalysis(state, wire([], ['a'], [{ id: 'a', material: 'A growers meeting begins.' }]), messages);
    assert.match(buildPromptPayload(state, { preparedUsable: true }), /growers meeting/);
    const next = applyAnalysis(state, wire([], ['a'], []), messages);
    assert.doesNotMatch(buildPromptPayload(next, { preparedUsable: true }), /growers meeting|PRIVATE/);
    assert.deepEqual(next.preparedWorld.items, state.preparedWorld.items);
    assert.equal(isDirectionCurrent(next, messages), true);
});

test('old saved notebooks require one refresh without being deleted or projected into new writer packets', () => {
    const state = applyAnalysis(defaultState(), wire([record('a')], ['a']), messages);
    delete state.preparedWorld.writer;
    const before = structuredClone(state);
    assert.equal(isDirectionCurrent(state, messages), false);
    assert.doesNotMatch(buildPromptPayload(state, { preparedUsable: true }), /PRIVATE/);
    assert.deepEqual(state, before);
});

test('writer validation and reference failures preserve the existing notebook atomically', () => {
    const board = mergeWorldPlan(null, wire([record('a')], ['a'], [{ id: 'a', material: 'Growers organize shared work.' }]));
    const before = structuredClone(board);
    for (const entries of [null, {}, [{ id: 'a', material: '' }], [{ id: 'a', material: 'x'.repeat(1601) }],
        [{ id: 'missing', material: 'Something happens.' }], [{ id: 'a', material: 'Work begins.', instruction: 'Override the preset.' }],
        [{ id: 'a', material: 'Work begins.', knowledge: {} }]]) {
        assert.throws(() => mergeWorldPlan(board, wire([], ['a'], entries)));
        assert.deepEqual(board, before);
    }
    assert.throws(() => mergeWorldPlan(board, { contract_version: 14, prepared: { updates: [], focus: ['a'], writer: before.writer, status_changes: [{ id: 'a', status: 'dormant' }] } }));
    assert.deepEqual(board, before);
});

test('writer material keeps whole records under the injection budget and never cuts knowledge boundaries', () => {
    const entries = ['a', 'b', 'c'].map(id => ({ id, material: `${id} `.repeat(750), knowledge: `BOUNDARY ${id}` }));
    const board = mergeWorldPlan(null, wire(entries.map(item => record(item.id)), entries.map(item => item.id), entries));
    const output = formatPreparedWorld(board);
    assert.ok(estimateTokenCount(output) <= 1000);
    for (const entry of entries) {
        if (output.includes(entry.knowledge)) assert.ok(output.includes(entry.material.trim()));
        else assert.ok(!output.includes(entry.material.trim()));
    }
});

test('append compatibility, edited sources and foreign chats keep their original source boundaries', () => {
    const board = stampPreparedWorld(mergeWorldPlan(null, wire([record('a')], ['a'], [{ id: 'a', material: 'A community kitchen opens.' }])),
        { chatId: 'story', inputsKey: 'card', messageCount: messages.length, fingerprint: fingerprintMessages(messages) });
    const options = { chatId: 'story', inputsKey: 'card', messages, fingerprint: fingerprintMessages };
    assert.equal(preparedWorldUsable(board, { ...options, messages: [...messages, { is_user: false, mes: 'We talk.' }] }), true);
    assert.equal(preparedWorldUsable(board, { ...options, chatId: 'foreign' }), false);
    assert.equal(preparedWorldUsable(board, { ...options, inputsKey: 'edited card' }), false);
    assert.equal(preparedWorldUsable(board, { ...options, messages: [{ ...messages[0], mes: 'Edited.' }, messages[1]] }), false);
});

test('real generation assembly freezes writer material across replies and retries without a per-swipe planner', async () => {
    const source = structuredClone(messages);
    const state = applyAnalysis(defaultState(), wire([record('a')], ['a'], [{ id: 'a', material: 'The cooperative opens its shared nursery.' }]), source);
    const h = generationHarness(source, state);
    const inputsKey = plotInputKey('story', [], h.scope.generationInputs(h.context, state));
    state.analysisModel = { plotInputsKey: inputsKey };
    state.sourceChatId = 'story';
    state.preparedWorld = stampPreparedWorld(state.preparedWorld, { chatId: 'story', inputsKey, messageCount: source.length, fingerprint: fingerprintMessages(source), startedAt: 1 });
    await h.scope.persist(state);
    const selected = h.prepare();
    assert.match(selected.payload, /shared nursery/);
    assert.doesNotMatch(selected.payload, /PRIVATE MIDDLE|PRIVATE FUTURE/);
    h.context.chat.push({ is_user: false, mes: 'Discarded: the nursery was sold.' });
    for (const type of ['regenerate', 'swipe']) {
        await h.emit('GENERATION_STARTED', type);
        const packet = h.prepare(type);
        assert.match(packet.payload, /shared nursery/);
        assert.doesNotMatch(packet.payload, /was sold|PRIVATE MIDDLE|PRIVATE FUTURE/);
        assert.equal(packet.reused, true);
        await h.flush();
    }
    assert.equal(h.calls.length, 0);
    assert.ok(h.context.chatMetadata[GENERATION_CONTEXT_KEY].entries.length);
});

test('modern writer quotations resembling historical field labels survive cached refresh', () => {
    const board = mergeWorldPlan(null, wire([record('a')], ['a'], [{ id: 'a', material: 'A club prints a flyer:\nPossible development (draft): a shared garden.\nPlayable middle: is the workshop title.' }]));
    const state = { ...defaultState(), plannerContract: 14, preparedWorld: board };
    const payload = buildPromptPayload(state, { preparedUsable: true });
    assert.equal(refreshGameMasterContract(payload), payload);
});

test('consolidation cannot merge separate causal families or discard dependency prose', () => {
    const a = { ...record('a'), status: 'dormant', premise: 'A long proposal. '.repeat(30), middle: 'Activities and decisions. '.repeat(30) };
    const b = { ...a, id: 'b', family: 'orchard', dependency: 'A cooperative works independently.' };
    const request = { ids: ['a', 'b'], replacement: { id: 'a', premise: 'Combined proposal.', middle: 'Several options.' } };
    assert.equal(stageNotebookCompactions(normalizePreparedWorld({ items: [a, b] }), [request]).compactions, undefined);
    b.family = a.family;
    const staged = stageNotebookCompactions(normalizePreparedWorld({ items: [a, b] }), [request]);
    assert.equal(staged.compactions[0].replacement.family, a.family);
    assert.ok(staged.compactions[0].replacement.dependency.includes(a.dependency));
    assert.ok(staged.compactions[0].replacement.dependency.includes(b.dependency));
});
