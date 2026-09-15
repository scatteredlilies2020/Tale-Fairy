import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as analysis from '../extension/analysis.js';
import { completionText } from '../extension/completion-response.js';
import { WORLD_PLANNER_SYSTEM, WORLD_PLANNER_SCHEMA, validateWorldPlan } from '../extension/world-planner.js';
import { defaultState, normalizeState, applyPlannerAuthorLayer, isDirectionCurrent, isGuidanceUsable, buildPromptPayload, fingerprintMessages } from '../extension/state.js';
import { preparedWorldUsable, stampPreparedWorld } from '../extension/prepared-world.js';
import { plannerPassDecision } from '../extension/planner-scheduler.js';
import { canRetainSuccessfulPlan } from '../extension/fallback-direction.js';
import { ensureGuidanceInChat } from '../extension/request-injection.js';
import { fitPromptToBudget } from '../extension/prompt-budget.js';
import { plannerBudgetEnvelope, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';

const messages = [{ is_user: true, name: 'Rowan', mes: 'I remain in the council chamber and listen.' },
    { is_user: false, mes: 'The council rejects the emergency tax. Iona begins asking the districts about a voluntary compact. The winter harvest is not known yet.' }];

test('replacement instructions stay compact and do not reintroduce generated reporting fields', () => {
    assert.ok(WORLD_PLANNER_SYSTEM.split(/\s+/u).length < 650);
    assert.deepEqual(Object.keys(WORLD_PLANNER_SCHEMA.value.properties).sort(), ['contract_version', 'note_resolution', 'prepared']);
    assert.deepEqual(Object.keys(WORLD_PLANNER_SCHEMA.value.properties.prepared.properties).sort(), ['approach', 'focus', 'status_changes', 'updates']);
});
const direction = (id = 'compact', changes = {}) => ({ id, status: 'prepared',
    premise: 'Districts may develop a lasting federation through mutual winter aid.',
    middle: 'Iona seeks local backing; growers want guaranteed transport, while poorer districts want representation. Local trials could earn trust or reveal unequal burdens.',
    future: 'A shared council, competing regional compacts, or a narrower aid agreement may emerge over successive seasons.',
    entry: 'District delegates or local projects can bring the differing interests into play.',
    knowledge: 'No agreement or harvest outcome is established yet.', ...changes });
const plan = (changes = {}) => ({ contract_version: 14, memory: 'The emergency tax was rejected. Iona has begun asking districts about voluntary cooperation.',
    context: [{ subject: 'Iona', condition: 'is seeking district views, not waiting for Rowan to direct her', knowledge: 'The winter harvest remains unknown.' }],
    prepared: { approach: 'Make governing consequential through district interests, limited resources and relationships that change through enacted policy. Leave Rowan free to negotiate, withdraw or prioritize family; no preordained federation.', overview: 'Local winter aid could grow into durable political cooperation, or reveal limits to federation.', updates: [direction()], focus: ['compact'] }, ...changes });
const runtime = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
const parserSource = runtime.slice(runtime.indexOf('function parseAnalysisResponse('), runtime.indexOf('async function acknowledgeDetachedPlannerJob('));
const names = ['extractJson', 'normalizeAnalysisActorUpdates', 'normalizeAnalysisDiagnostics', 'abstractIncrementalVisibleBranches', 'validateAnalysisResult', 'transcriptHeadAlignmentErrors', 'AnalysisValidationError'];
const parseRuntime = new Function(...names, 'completionText', `${parserSource}; return parseAnalysisResponse;`)(...names.map(name => analysis[name]), completionText);
const ready = state => ({ ...state, sourceChatId: 'story', analysisModel: { plotInputsKey: 'inputs' }, preparedWorld: stampPreparedWorld(state.preparedWorld,
    { chatId: 'story', fingerprint: fingerprintMessages(messages), messageCount: messages.length, inputsKey: 'inputs' }) });

test('preparation-only response applies without recap fields and preserves existing continuity', () => {
    const wire = { contract_version: 14, prepared: { approach: plan().prepared.approach, updates: [direction()], focus: ['compact'] } };
    const parsed = parseRuntime({ choices: [{ message: { content: JSON.stringify(wire) } }] });
    const original = defaultState();
    original.contextLedger = 'A historical commitment remains.';
    original.plannerMemory = 'An existing factual memory remains.';
    const state = analysis.applyAnalysis(original, parsed, messages);
    assert.equal(state.contextLedger, original.contextLedger);
    assert.equal(state.plannerMemory, original.plannerMemory);
    assert.equal(state.preparedWorld.overview, '');
    assert.deepEqual(state.causalContext.conditions, []);
    const payload = buildPromptPayload(state, { guidanceUsable: true, preparedUsable: true });
    assert.match(payload, /successive seasons/);
    assert.doesNotMatch(payload, /historical commitment|factual memory/);
});

test('new wire contract runs through production parser, persistence and actual request injection', () => {
    const value = parseRuntime({ choices: [{ message: { content: JSON.stringify(plan()) } }] });
    let state = ready(analysis.applyAnalysis(defaultState(), value, messages));
    state = normalizeState(JSON.parse(JSON.stringify(state)));
    assert.equal(state.plannerContract, 14);
    assert.equal(state.plannerMemory, '', 'preparation does not generate another factual memory');
    assert.equal(isDirectionCurrent(state, messages, 'story'), true, 'fresh notebook is not mistaken for uninitialized legacy state');
    assert.equal(isGuidanceUsable(state, messages, 'story'), false, 'no factual recap to inject');
    const payload = buildPromptPayload(state, { guidanceUsable: true, preparedUsable: true });
    assert.match(payload, /competing regional compacts/);
    assert.match(payload, /Make governing consequential/);
    assert.match(payload, /No agreement or harvest outcome is established yet/);
    assert.doesNotMatch(payload, /SCENE FIT/);
    const request = [{ role: 'system', content: 'Use literary prose.' }, { role: 'user', content: 'I listen.' }];
    ensureGuidanceInChat(request, payload, { role: 'user', depth: 1, inlineLatestUser: true });
    assert.match(JSON.stringify(request), /competing regional compacts/);
    assert.ok(request.some(item => item.role === 'system' && item.content.includes('<tale-fairy-authority>')));
});

test('raw, wrapped and content-block world contracts survive transport extraction', () => {
    for (const response of [plan(), { data: plan() }, { choices: [{ message: { content: [plan()] } }] }]) {
        assert.equal(JSON.parse(completionText(response)).contract_version, 14);
        assert.equal(parseRuntime(response).contract_version, 14);
    }
});

test('lasting directions survive forty appended messages without presenting stale current facts', () => {
    const state = ready(analysis.applyAnalysis(defaultState(), plan(), messages));
    const later = [...messages, ...Array.from({ length: 40 }, (_, i) => ({ is_user: i % 2 === 0, mes: `Ordinary conversation ${i}.` }))];
    assert.equal(isGuidanceUsable(state, later, 'story'), false);
    const usable = preparedWorldUsable(state.preparedWorld, { chatId: 'story', inputsKey: 'inputs', messages: later, fingerprint: fingerprintMessages });
    assert.equal(usable, true);
    const payload = buildPromptPayload(state, { guidanceUsable: false, preparedUsable: usable });
    assert.match(payload, /successive seasons/);
    assert.match(payload, /Make governing consequential/);
    assert.match(payload, /NOT TRANSCRIPT FACTS OR A REQUIRED NEXT BEAT/);
    assert.doesNotMatch(payload, /is seeking district views/);
    assert.equal(state.preparedWorld.items[0].status, 'prepared');
});

test('redirecting the RP shelves affected directions without erasing unrelated long-term material', () => {
    const original = plan();
    original.prepared.updates.push(direction('family', { premise: 'A family could restore its abandoned orchard.', middle: 'Relatives debate shared work and inheritance.', future: 'Restoration could support the next generation.' }));
    let state = analysis.applyAnalysis(defaultState(), original, messages);
    const later = [...messages, { is_user: true, mes: 'Leave national politics aside. I spend the summer with my family.' }];
    state = analysis.applyAnalysis(state, plan({ memory: '', context: [], prepared: { approach: 'Develop family life through shared work and conflicting hopes across generations, without turning every disagreement into a crisis.', overview: 'Family ties and the orchard can develop across the summer.', updates: [direction('compact', { status: 'dormant' })], focus: ['family'] } }), later);
    assert.equal(state.preparedWorld.items.length, 2);
    assert.equal(state.preparedWorld.items.find(item => item.id === 'compact').status, 'dormant');
    assert.equal(state.plannerMemory, '');
    const payload = buildPromptPayload(state, { preparedUsable: true });
    assert.match(payload, /abandoned orchard/);
    assert.doesNotMatch(payload, /growers want guaranteed transport/);
    assert.match(payload, /Develop family life/);
    assert.doesNotMatch(payload, /Make governing consequential/);
    state = analysis.applyAnalysis(state, plan({ memory: 'The orchard restoration was completed.', context: [], prepared: { approach: state.preparedWorld.approach, overview: '', updates: [direction('family', { status: 'resolved' })], focus: [] } }), later);
    assert.deepEqual(state.preparedWorld.items.map(item => item.id), ['compact']);
    assert.equal(state.plannerMemory, '', 'directions do not overwrite factual memory');
});

test('an empty current slice is a valid successful notebook, not a failed plan or repeated initialization', () => {
    let state = ready(analysis.applyAnalysis(defaultState(), plan({ context: [] }), messages));
    state = applyPlannerAuthorLayer(state, { fullReview: true, turnCount: 12, messages });
    assert.equal(isDirectionCurrent(state, messages, 'story'), true, 'no repeated refresh merely because no recap was generated');
    assert.equal(plannerPassDecision({ state, messages }).fullContextPass, false);
    assert.equal(state.plannerSchedule.lastFullReviewTurn, 12);
    assert.equal(canRetainSuccessfulPlan(state, { chatId: 'story', fingerprint: fingerprintMessages(messages), messageCount: messages.length, inputsKey: 'inputs' }), true);
    assert.equal(canRetainSuccessfulPlan(state, { chatId: 'story', fingerprint: 'edited', messageCount: messages.length, inputsKey: 'inputs' }), false);
});

test('source edits and foreign chats cannot reuse a direction packet as verified', () => {
    const state = ready(analysis.applyAnalysis(defaultState(), plan(), messages));
    const check = (chatId, source) => preparedWorldUsable(state.preparedWorld, { chatId, inputsKey: 'inputs', messages: source, fingerprint: fingerprintMessages });
    assert.equal(check('other', messages), false);
    assert.equal(check('story', [{ ...messages[0], mes: 'Retconned scene.' }, messages[1]]), false);
});

test('migration archives obsolete proposals instead of making the new planner perpetuate them', () => {
    const old = defaultState();
    old.userNotes = [{ text: 'Keep player decisions open.', kind: 'forbid' }];
    old.entities = [{ name: 'Iona', constraints: 'Wait for player permission.' }];
    old.preparedWorld.items = [{ ...direction(), origin: 'invented', hold: 'Wait for permission.', engine: 'Old restriction.' }];
    const next = analysis.applyAnalysis(old, plan(), messages);
    assert.equal(next.preparedWorld.items[0].hold, '');
    assert.equal(next.preparedWorld.items[0].engine, '');
    assert.equal(next.preparedWorld.items[0].entry, '', 'replacement directions do not retain next-reply entry choreography');
    assert.equal(WORLD_PLANNER_SCHEMA.value.properties.prepared.properties.updates.items.properties.entry, undefined);
    assert.equal(normalizeState(JSON.parse(JSON.stringify(next))).legacyPreparedWorld.items[0].hold, 'Wait for permission.');
    const input = JSON.parse(analysis.buildWorldPlannerPrompt(messages, old));
    assert.deepEqual(input.current.preparedWorld.items, []);
    assert.doesNotMatch(JSON.stringify(input.current), /Wait for permission/);
    assert.equal(next.userNotes[0].text, old.userNotes[0].text);
    const payload = buildPromptPayload(next, { guidanceUsable: true, preparedUsable: true });
    assert.doesNotMatch(payload, /Wait for player permission|Old restriction/);
});

test('a fitted six-thousand-token prompt includes complete memory and marks old proposal migration', async () => {
    const state = defaultState();
    state.contextLedger = 'A promise from years ago remains unfulfilled.';
    const fixedEnvelope = plannerBudgetEnvelope(WORLD_PLANNER_SYSTEM, WORLD_PLANNER_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY);
    const prompt = await fitPromptToBudget({ fixedEnvelope, tokenBudget: 6000,
        buildPrompt: effectivePromptTokens => analysis.buildWorldPlannerPrompt(messages, state, '', {}, { effectivePromptTokens, maxPromptTokens: 6000 }) });
    const value = JSON.parse(prompt);
    assert.equal(value.current.memory, state.contextLedger);
    assert.match(value.current.migration, /may be wrong/);
    assert.equal(value.messages.at(-1).content, messages.at(-1).mes);
    assert.equal(value.current.entities, undefined);
});

test('reject malformed notes; obsolete recaps cannot become writer facts', () => {
    assert.equal(validateWorldPlan(plan({ note_resolution: { kind: 'override-everything' } })).valid, false);
    assert.equal(validateWorldPlan({ contract_version: 14, prepared: {} }).valid, false);
    const value = plan({ context: [{ subject: 'Iona', condition: 'The districts remain autonomous. '.repeat(12), knowledge: 'None agreed to federal authority.' }] });
    assert.equal(validateWorldPlan(value).valid, true);
    const state = analysis.applyAnalysis(defaultState(), value, messages);
    assert.deepEqual(state.causalContext.conditions, []);
    assert.doesNotMatch(buildPromptPayload(state, { guidanceUsable: true, preparedUsable: true }), /The districts remain autonomous/);
});

test('missing status defaults to a proposal, never an established or active event', () => {
    const item = direction();
    delete item.status;
    item.origin = 'established';
    const value = plan({ prepared: { ...plan().prepared, updates: [item] } });
    assert.equal(validateWorldPlan(value).valid, true);
    const state = analysis.applyAnalysis(defaultState(), value, messages);
    assert.equal(state.preparedWorld.items[0].status, 'prepared');
    assert.equal(state.preparedWorld.items[0].origin, 'invented');
    item.status = 'nonsense';
    assert.equal(validateWorldPlan(value).valid, false);
});

test('an explicit null optional author note is equivalent to omission', () => {
    const value = plan({ note_resolution: null });
    assert.equal(validateWorldPlan(value).valid, true);
    assert.equal(parseRuntime({ choices: [{ message: { content: JSON.stringify(value) } }] }).note_resolution, undefined);
    assert.equal(validateWorldPlan(plan({ note_resolution: { kind: 'invalid' } })).valid, false);
});

test('generated contract is preparation only and retains wider RP reference and player ownership', () => {
    const keys = Object.keys(WORLD_PLANNER_SCHEMA.value.properties);
    assert.ok(keys.includes('prepared'));
    assert.ok(!keys.includes('memory') && !keys.includes('context'));
    assert.equal(WORLD_PLANNER_SCHEMA.value.properties.prepared.properties.overview, undefined);
    const payload = JSON.parse(analysis.buildWorldPlannerPrompt(messages, defaultState(), '', { description: 'A journey with changing places, people and discoveries.' }));
    assert.match(payload.rp_reference.description, /changing places/);
    assert.equal(payload.player_controlled, 'Rowan');
    assert.ok(Object.keys(payload).indexOf('rp_reference') < Object.keys(payload).indexOf('current'));
});

test('a wide pivot can update five records atomically without discarding retirements', () => {
    const initial = plan({ prepared: { ...plan().prepared, updates: ['a', 'b', 'c', 'd'].map(id => direction(id)), focus: ['a'] } });
    const state = analysis.applyAnalysis(defaultState(), initial, messages);
    const pivot = plan({ prepared: { approach: 'Build relationships over the summer.', overview: 'Family and community.',
        updates: [...['a', 'b', 'c', 'd'].map(id => direction(id, { status: 'retired' })), direction('home')], focus: ['home'] } });
    assert.equal(validateWorldPlan(pivot).valid, true);
    assert.deepEqual(analysis.applyAnalysis(state, pivot, messages).preparedWorld.items.map(item => item.id), ['home']);
    pivot.prepared.updates = Array.from({ length: 13 }, (_, i) => direction(String(i)));
    assert.equal(validateWorldPlan(pivot).valid, false);
});


test('blank prepared placeholders do not discard valid updates or overwrite saved developments', () => {
    const original = analysis.applyAnalysis(defaultState(), parseRuntime(plan()), messages);
    const saved = structuredClone(original.preparedWorld.items[0]);
    const wire = plan({ prepared: { approach: plan().prepared.approach, updates: [
        direction('compact', { premise: '', middle: '', status: 'dormant' }),
        direction('unfinished-new', { middle: '' }),
        direction('new-opportunity'),
    ], focus: ['compact', 'unfinished-new', 'new-opportunity'] } });
    const result = parseRuntime({ choices: [{ message: { content: JSON.stringify(wire) } }] });
    assert.equal(result._taleFairyRecovery.omitted.length, 2);
    assert.deepEqual(result.prepared.updates.map(item => item.id), ['new-opportunity']);
    const updated = analysis.applyAnalysis(original, result, messages);
    assert.deepEqual(updated.preparedWorld.items.find(item => item.id === 'compact'), saved);
    assert.ok(updated.preparedWorld.items.some(item => item.id === 'new-opportunity'));
    assert.ok(!updated.preparedWorld.items.some(item => item.id === 'unfinished-new'));
    assert.deepEqual(updated.preparedWorld.focus, ['new-opportunity']);
    assert.equal(original.preparedWorld.items.length, 1, 'input state is unchanged');
});

test('blank removals still remove records and other malformed updates remain rejected', () => {
    const original = analysis.applyAnalysis(defaultState(), parseRuntime(plan()), messages);
    const removal = parseRuntime(plan({ prepared: { approach: '', updates: [direction('compact', { premise: '', middle: '', status: 'retired' })], focus: [] } }));
    assert.equal(analysis.applyAnalysis(original, removal, messages).preparedWorld.items.length, 0);
    for (const updates of [
        [direction('bad', { premise: '', middle: {}, status: 'prepared' })],
        [direction('bad', { premise: '', middle: '', status: 'unknown' })],
        [direction('same'), direction('same', { middle: '' })],
        Array.from({ length: 13 }, (_, i) => direction(`item-${i}`, { middle: '' })),
    ]) assert.throws(() => parseRuntime(plan({ prepared: { approach: '', updates, focus: [] } })));
});


test('status-only changes preserve complete content and remove records without empty update forms', () => {
    const original = analysis.applyAnalysis(defaultState(), parseRuntime(plan({ prepared: {
        ...plan().prepared, updates: [direction('compact'), direction('orchard')], focus: ['compact'],
    } })), messages);
    const before = structuredClone(original.preparedWorld.items);
    const result = parseRuntime({ contract_version: 14, prepared: { approach: original.preparedWorld.approach,
        updates: [], status_changes: [{ id: 'compact', status: 'dormant' }, { id: 'orchard', status: 'resolved' }], focus: [],
    } });
    assert.equal(result._taleFairyRecovery, undefined);
    const next = analysis.applyAnalysis(original, result, messages);
    assert.deepEqual(next.preparedWorld.items, [{ ...before[0], status: 'dormant' }]);
    assert.deepEqual(original.preparedWorld.items, before);
});

test('minimal complete updates omit optional notes, while malformed status changes fail atomically', () => {
    const wire = { contract_version: 14, prepared: { approach: plan().prepared.approach,
        updates: [{ id: 'compact', status: 'prepared', premise: direction().premise, middle: direction().middle }], focus: ['compact'],
    } };
    const original = analysis.applyAnalysis(defaultState(), parseRuntime(wire), messages);
    assert.equal(original.preparedWorld.items[0].middle, direction().middle);
    for (const changes of [[{ id: 'absent', status: 'active' }], [{ id: 'compact', status: 'invalid' }],
        [{ id: 'compact', status: 'active' }, { id: 'compact', status: 'dormant' }],
        [{ id: 'compact', status: 'active', premise: '' }]]) {
        const attempt = { contract_version: 14, prepared: { approach: '', updates: [], status_changes: changes, focus: [] } };
        assert.throws(() => analysis.applyAnalysis(original, parseRuntime(attempt), messages));
        assert.equal(original.preparedWorld.items[0].status, 'prepared');
    }
    assert.throws(() => parseRuntime({ ...wire, prepared: { ...wire.prepared, status_changes: [{ id: 'compact', status: 'active' }] } }));
});

test('planner input exposes complete wire content without empty legacy fields to copy', () => {
    const state = analysis.applyAnalysis(defaultState(), parseRuntime(plan()), messages);
    const input = JSON.parse(analysis.buildWorldPlannerPrompt(messages, state, '', {}, { maxPromptTokens: 30000 }));
    const item = input.current.preparedWorld.items[0];
    assert.equal(item.middle, direction().middle);
    assert.ok(Object.values(item).every(value => typeof value === 'string' && value.trim()));
    assert.equal(item.engine, undefined);
    assert.equal(item.hold, undefined);
});

test('tight notebook budgets keep complete records separate from retained lookup tuples', () => {
    const state = analysis.applyAnalysis(defaultState(), parseRuntime(plan({ prepared: {
        approach: plan().prepared.approach,
        updates: Array.from({ length: 12 }, (_, i) => direction(`direction-${i}`, {
            premise: 'A regional trade dispute opens several routes. '.repeat(6),
            middle: 'Merchants negotiate tolls; rival carriers offer passage and expose competing interests. '.repeat(7),
            future: 'Cooperation or competition can reshape the route. '.repeat(5),
        })), focus: ['direction-0'],
    } })), messages);
    const before = structuredClone(state);
    for (const effectivePromptTokens of [800, 1600, 2400]) {
        const prompt = analysis.buildWorldPlannerPrompt(messages, state, '', {}, { incremental: true, maxPromptTokens: 6000, effectivePromptTokens });
        const board = JSON.parse(prompt).current.preparedWorld;
        assert.ok(board.retained_index.length > 0, 'fixture must exercise budget compaction');
        for (const item of board.items) {
            assert.equal(typeof item.middle, 'string');
            assert.ok(item.middle.trim());
            assert.equal(item.omitted_details_remain_stored, undefined);
        }
        assert.equal(new Set([...board.items.map(item => item.id), ...board.retained_index.map(tuple => tuple[0])]).size, 12);
        for (const tuple of board.retained_index) assert.ok(Array.isArray(tuple) && tuple.length >= 2);
        assert.doesNotMatch(prompt, /omitted_details_remain_stored/);
    }
    assert.deepEqual(state, before, 'prompt compaction never edits stored prose');
});

test('copied partial rows cannot discard valid peers or replace complete saved records', () => {
    const original = analysis.applyAnalysis(defaultState(), parseRuntime(plan({ prepared: {
        ...plan().prepared, updates: [direction('compact'), direction('orchard')], focus: ['compact'],
    } })), messages);
    const before = structuredClone(original.preparedWorld.items);
    const partials = [
        { id: 'compact', premise: 'A revised premise without developments.', future: 'A later possibility.', status: 'active', omitted_details_remain_stored: true },
        { id: 'orchard', premise: 'A different incomplete replacement.', middle: null, status: 'dormant' },
        { id: 'missing-new', status: 'prepared' },
    ];
    const result = parseRuntime(plan({ prepared: {
        approach: original.preparedWorld.approach, updates: [...partials, direction('new-complete')], focus: ['compact', 'missing-new', 'new-complete'],
    } }));
    assert.equal(result._taleFairyRecovery.omitted.length, 3);
    const next = analysis.applyAnalysis(original, result, messages);
    assert.deepEqual(next.preparedWorld.items.filter(item => item.id !== 'new-complete'), before);
    assert.ok(next.preparedWorld.items.find(item => item.id === 'new-complete'));
    assert.deepEqual(next.preparedWorld.focus, ['new-complete']);
    assert.deepEqual(original.preparedWorld.items, before);
});
