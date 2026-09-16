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
    assert.ok(WORLD_PLANNER_SYSTEM.split(/\s+/u).length < 750);
    assert.match(WORLD_PLANNER_SYSTEM, /These instructions govern private preparation only/);
    assert.match(WORLD_PLANNER_SYSTEM, /Do not generate general writing rules/);
    assert.match(WORLD_PLANNER_SYSTEM, /Revisit an existing approach/);
    assert.match(WORLD_PLANNER_SYSTEM, /Private planner guidance, never injected into the writer/);
    assert.match(WORLD_PLANNER_SYSTEM, /Do not copy approach instructions into premise, middle, future, knowledge/);
    assert.match(WORLD_PLANNER_SCHEMA.value.properties.prepared.properties.approach.description, /not general writing rules/);
    assert.deepEqual(Object.keys(WORLD_PLANNER_SCHEMA.value.properties).sort(), ['contract_version', 'note_resolution', 'prepared']);
    assert.deepEqual(Object.keys(WORLD_PLANNER_SCHEMA.value.properties.prepared.properties).sort(), ['approach', 'consolidations', 'focus', 'status_changes', 'summary', 'updates', 'writer']);
});
const direction = (id = 'compact', changes = {}) => ({ id, status: 'prepared',
    premise: 'Districts may develop a lasting federation through mutual winter aid.',
    middle: 'Iona seeks local backing; growers want guaranteed transport, while poorer districts want representation. Local trials could earn trust or reveal unequal burdens.',
    future: 'A shared council, competing regional compacts, or a narrower aid agreement may emerge over successive seasons.',
    entry: 'District delegates or local projects can bring the differing interests into play.',
    knowledge: 'No agreement or harvest outcome is established yet.', ...changes });
const writer = () => [{ id: 'compact', material: 'Iona organizes a winter-aid trial. Growers offer carts in exchange for transport guarantees.', knowledge: 'Only Iona has the district responses.' }];
const plan = (changes = {}) => ({ contract_version: 14, memory: 'The emergency tax was rejected. Iona has begun asking districts about voluntary cooperation.',
    context: [{ subject: 'Iona', condition: 'is seeking district views, not waiting for Rowan to direct her', knowledge: 'The winter harvest remains unknown.' }],
    prepared: { approach: 'Make governing consequential through district interests, limited resources and relationships that change through enacted policy. Leave Rowan free to negotiate, withdraw or prioritize family; no preordained federation.', overview: 'Local winter aid could grow into durable political cooperation, or reveal limits to federation.', updates: [direction()], focus: ['compact'], writer: writer() }, ...changes });
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
    assert.doesNotMatch(payload, /successive seasons|<prepared-world>/, 'legacy response has no separately authored writer material');
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
    assert.match(payload, /Iona organizes a winter-aid trial/);
    assert.doesNotMatch(payload, /competing regional compacts|Playable middle:|Beyond it:/);
    assert.doesNotMatch(payload, /Make governing consequential/);
    assert.match(payload, /Only Iona has the district responses/);
    assert.doesNotMatch(payload, /SCENE FIT/);
    const request = [{ role: 'system', content: 'Use literary prose.' }, { role: 'user', content: 'I listen.' }];
    ensureGuidanceInChat(request, payload, { role: 'user', depth: 1, inlineLatestUser: true });
    assert.match(JSON.stringify(request), /Iona organizes a winter-aid trial/);
    assert.deepEqual(request.filter(item => item.role === 'system'), [{ role: 'system', content: 'Use literary prose.' }]);
    assert.doesNotMatch(JSON.stringify(request), /tale-fairy-authority/);
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
    assert.match(payload, /Iona organizes a winter-aid trial/);
    assert.doesNotMatch(payload, /successive seasons/);
    assert.doesNotMatch(payload, /Make governing consequential/);
    assert.match(payload, /POSSIBLE DEVELOPMENTS:/);
    assert.doesNotMatch(payload, /is seeking district views/);
    assert.equal(state.preparedWorld.items[0].status, 'prepared');
});

test('the approach still reaches the private planner but not the writer packet or request', () => {
    const state = ready(analysis.applyAnalysis(defaultState(), plan(), messages));
    const before = structuredClone(state);
    const input = JSON.parse(analysis.buildWorldPlannerPrompt(messages, state, '', {}, { incremental: true }));
    assert.equal(input.current.preparedWorld.approach, state.preparedWorld.approach);
    const payload = buildPromptPayload(state, { preparedUsable: true });
    const request = [{ role: 'system', content: 'Preset unchanged.' }, { role: 'user', content: 'I listen.' }];
    ensureGuidanceInChat(request, payload);
    assert.ok(!JSON.stringify(request).includes(state.preparedWorld.approach));
    assert.doesNotMatch(payload, /RP APPROACH/);
    assert.match(payload, /Iona organizes a winter-aid trial/);
    assert.deepEqual(state, before);
});

test('redirecting the RP shelves affected directions without erasing unrelated long-term material', () => {
    const original = plan();
    original.prepared.updates.push(direction('family', { premise: 'A family could restore its abandoned orchard.', middle: 'Relatives debate shared work and inheritance.', future: 'Restoration could support the next generation.' }));
    let state = analysis.applyAnalysis(defaultState(), original, messages);
    const later = [...messages, { is_user: true, mes: 'Leave national politics aside. I spend the summer with my family.' }];
    state = analysis.applyAnalysis(state, plan({ memory: '', context: [], prepared: { approach: 'Develop family life through shared work and conflicting hopes across generations, without turning every disagreement into a crisis.', overview: 'Family ties and the orchard can develop across the summer.', updates: [direction('compact', { status: 'dormant' })], focus: ['family'], writer: [{ id: 'family', material: 'Relatives organize work on the abandoned orchard.' }] } }), later);
    assert.equal(state.preparedWorld.items.length, 2);
    assert.equal(state.preparedWorld.items.find(item => item.id === 'compact').status, 'dormant');
    assert.equal(state.plannerMemory, '');
    const payload = buildPromptPayload(state, { preparedUsable: true });
    assert.match(payload, /abandoned orchard/);
    assert.doesNotMatch(payload, /growers want guaranteed transport/);
    assert.doesNotMatch(payload, /Develop family life/);
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
    const initial = plan({ prepared: { ...plan().prepared, writer: [], updates: ['a', 'b', 'c', 'd'].map(id => direction(id)), focus: ['a'] } });
    const state = analysis.applyAnalysis(defaultState(), initial, messages);
    const pivot = plan({ prepared: { approach: 'Build relationships over the summer.', overview: 'Family and community.',
        updates: [...['a', 'b', 'c', 'd'].map(id => direction(id, { status: 'retired' })), direction('home')], focus: ['home'] } });
    assert.equal(validateWorldPlan(pivot).valid, true);
    assert.deepEqual(analysis.applyAnalysis(state, pivot, messages).preparedWorld.items.map(item => item.id), ['home']);
    pivot.prepared.updates = Array.from({ length: 13 }, (_, i) => direction(String(i)));
    assert.equal(validateWorldPlan(pivot).valid, true);
    assert.equal(analysis.applyAnalysis(state, pivot, messages).preparedWorld.items.length, 17);
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
        { id: 'missing-new', status: 'prepared', premise: '' },
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

const focusVariants = [
    ['missing', 'compact', 'compact', 'orchard', 'harbor', 'hills'],
    [' ', null, {}, 9, ' compact ', 'orchard', 'harbor', 'hills'],
    ['x'.repeat(81), 'compact', 'orchard', 'harbor'],
    'compact', null, undefined, {}, [],
];
for (const [index, focus] of focusVariants.entries()) {
    for (const variant of ['standard', 'missing-optionals', 'null-optionals', 'prose-lists', 'repeated-identical']) {
        test(`response acceptance matrix: focus ${index}, ${variant}, live and detached`, () => {
            const original = analysis.applyAnalysis(defaultState(), parseRuntime(plan()), messages);
            const before = structuredClone(original);
            const updates = ['orchard', 'harbor', 'hills'].map(id => direction(id));
            const prepared = { approach: original.preparedWorld.approach, updates, focus };
            if (variant === 'missing-optionals') delete prepared.approach;
            if (variant === 'null-optionals') {
                prepared.approach = null;
                prepared.status_changes = null;
                for (const item of updates) { item.future = null; item.knowledge = null; }
            }
            if (variant === 'prose-lists') {
                for (const item of updates) item.middle = [item.middle, 'Preserve the final condition.'];
            }
            if (variant === 'repeated-identical') {
                updates.push(Object.fromEntries(Object.entries(updates[0]).reverse()));
                prepared.status_changes = [{ id: 'compact', status: 'active' }, { status: 'active', id: 'compact' }];
            }
            const wire = JSON.stringify({ contract_version: 14, prepared });
            const live = analysis.applyAnalysis(original, parseRuntime({ choices: [{ message: { content: wire } }] }), messages);
            const detached = analysis.applyAnalysis(original, parseRuntime(wire), messages);
            assert.deepEqual(live.preparedWorld, detached.preparedWorld);
            assert.equal(live.plannerContract, detached.plannerContract);
            assert.deepEqual(original, before, 'acceptance must not mutate its source');
            assert.equal(live.preparedWorld.items.length, 4, 'focus cannot prune the notebook');
            assert.equal(live.preparedWorld.approach, original.preparedWorld.approach, 'missing is not an explicit clear');
            assert.ok(live.preparedWorld.focus.length <= 3);
            assert.equal(new Set(live.preparedWorld.focus).size, live.preparedWorld.focus.length);
            assert.ok(live.preparedWorld.focus.every(id => live.preparedWorld.items.some(item => item.id === id)));
            if (index < 3) assert.deepEqual(live.preparedWorld.focus, ['compact', 'orchard', 'harbor'], 'filter unavailable references before capping');
            if (variant === 'prose-lists') assert.ok(live.preparedWorld.items.find(item => item.id === 'orchard').middle.endsWith('Preserve the final condition.'));
        });
    }
}

test('advisory focus cannot invalidate retirement or restore a removed record', () => {
    const original = analysis.applyAnalysis(defaultState(), parseRuntime(plan()), messages);
    const next = analysis.applyAnalysis(original, parseRuntime(plan({ prepared: {
        updates: [direction('orchard')], status_changes: [{ id: 'compact', status: 'retired' }], focus: ['compact', 'missing', 'orchard'],
    } })), messages);
    assert.deepEqual(next.preparedWorld.items.map(item => item.id), ['orchard']);
    assert.deepEqual(next.preparedWorld.focus, ['orchard']);
});

test('status-only and approach-only responses preserve omitted notebook content', () => {
    const original = analysis.applyAnalysis(defaultState(), parseRuntime(plan()), messages);
    const status = analysis.applyAnalysis(original, parseRuntime({ contract_version: 14, prepared: { status_changes: [{ id: 'compact', status: 'dormant' }] } }), messages);
    assert.equal(status.preparedWorld.items[0].middle, original.preparedWorld.items[0].middle);
    assert.equal(status.preparedWorld.approach, original.preparedWorld.approach);
    const cleared = analysis.applyAnalysis(original, parseRuntime({ contract_version: 14, prepared: { approach: '', updates: null } }), messages);
    assert.equal(cleared.preparedWorld.approach, '');
    assert.deepEqual(cleared.preparedWorld.items, original.preparedWorld.items);
});

const rejectedChanges = {
    'wrong update container': { updates: {} },
    'null record': { updates: [null] },
    'missing ID': { updates: [{ premise: 'A proposal.', middle: 'A complete process.', status: 'prepared' }] },
    'object prose': { updates: [direction('new', { middle: { plan: 'text' } })] },
    'mixed prose list': { updates: [direction('new', { middle: ['A process.', { claim: 'unsafe' }] })] },
    'invalid lifecycle': { updates: [direction('new', { status: 'canon' })] },
    'conflicting replacements': { updates: [direction('compact'), direction('compact', { middle: 'A contradictory replacement.' })] },
    'conflicting operation kinds': { updates: [direction('compact')], status_changes: [{ id: 'compact', status: 'retired' }] },
    'conflicting status operations': { updates: [], status_changes: [{ id: 'compact', status: 'active' }, { id: 'compact', status: 'retired' }] },
    'unavailable status target': { updates: [direction('valid')], status_changes: [{ id: 'missing', status: 'active' }] },
    'invalid optional prose': { updates: [direction('new', { knowledge: 123 })] },
    'invalid approach': { approach: {} },
};
for (const [label, change] of Object.entries(rejectedChanges)) test(`substantive rejection is atomic: ${label}`, () => {
    const original = analysis.applyAnalysis(defaultState(), parseRuntime(plan()), messages);
    const before = structuredClone(original);
    assert.throws(() => analysis.applyAnalysis(original, parseRuntime(plan({ prepared: { ...plan().prepared, ...change } })), messages));
    assert.deepEqual(original, before);
});

test('planner accepts the thirteenth record without evicting retained content', () => {
    const original = analysis.applyAnalysis(defaultState(), parseRuntime(plan({ prepared: {
        ...plan().prepared, writer: [], updates: Array.from({ length: 12 }, (_, i) => direction(`record-${i}`)), focus: ['record-0'],
    } })), messages);
    const before = structuredClone(original);
    const wire = plan({ prepared: { updates: [direction('new')], focus: ['new'] } });
    const expanded = normalizeState(JSON.parse(JSON.stringify(analysis.applyAnalysis(original, parseRuntime(wire), messages))));
    assert.equal(expanded.preparedWorld.items.length, 13);
    assert.deepEqual(expanded.preparedWorld.items.slice(0, 12), original.preparedWorld.items);
    assert.deepEqual(expanded.preparedWorld.focus, ['new']);
    assert.deepEqual(original, before);
    wire.prepared.status_changes = [{ id: 'record-11', status: 'retired' }];
    const next = analysis.applyAnalysis(original, parseRuntime(wire), messages);
    assert.equal(next.preparedWorld.items.length, 12);
    assert.ok(next.preparedWorld.items.some(item => item.id === 'new'));
});

test('cutoff recovery requires a completely closed notebook and preserves complete prose', () => {
    const wire = { contract_version: 14, prepared: { ...plan().prepared } };
    const complete = JSON.stringify(wire);
    for (const raw of [complete.slice(0, -1), complete.slice(0, -1) + ',"note_resolution":{"kind":"sug']) {
        const parsed = parseRuntime(raw);
        assert.ok(parsed._taleFairyRecovery);
        const next = analysis.applyAnalysis(defaultState(), parsed, messages);
        assert.equal(next.preparedWorld.items[0].middle, direction().middle);
    }
    const cutoff = complete.indexOf('middle') + 15;
    assert.throws(() => parseRuntime(complete.slice(0, cutoff)), /cut off/);
});


test('empty malformed envelopes cannot masquerade as successful no-change plans', () => {
    for (const prepared of [{}, { approach: null, updates: null }, { focus: {} }, null, []]) {
        assert.throws(() => parseRuntime({ contract_version: 14, prepared }));
    }
});

test('model sees selected and stored counts without a storage capacity', () => {
    const state = analysis.applyAnalysis(defaultState(), parseRuntime(plan()), messages);
    const input = JSON.parse(analysis.buildWorldPlannerPrompt(messages, state, '', {}, { incremental: true }));
    assert.deepEqual(input.notebook_view, { stored: 1, shown: 1, attention: { local: ['compact'], wider: [] } });
    assert.equal(input.notebook_capacity, undefined);
    state.plannerContract = 13;
    const migration = JSON.parse(analysis.buildWorldPlannerPrompt(messages, state, '', {}, { incremental: true }));
    assert.deepEqual(migration.notebook_view, { stored: 0, shown: 0, attention: { local: [], wider: [] } });
});


test('misplaced exact status operations preserve prose, focus, and complete content peers', () => {
    const original = analysis.applyAnalysis(defaultState(), parseRuntime(plan()), messages);
    const before = structuredClone(original);
    const result = parseRuntime(plan({ prepared: { updates: [direction('orchard'), { id: 'compact', status: 'active' }],
        status_changes: [{ id: 'compact', status: 'active' }], focus: ['compact', 'orchard'] } }));
    assert.equal(result._taleFairyRecovery, undefined);
    assert.equal(result.prepared.status_changes.length, 1);
    const next = analysis.applyAnalysis(original, result, messages);
    assert.deepEqual(next.preparedWorld.items.find(item => item.id === 'compact'), { ...original.preparedWorld.items[0], status: 'active' });
    assert.deepEqual(next.preparedWorld.focus, ['compact', 'orchard']);
    assert.equal(next.preparedWorld.items.length, 2);
    assert.deepEqual(original, before);
});

test('status-shaped records still reject unknown IDs, conflicts, and invalid lifecycle values', () => {
    const original = analysis.applyAnalysis(defaultState(), parseRuntime(plan()), messages);
    const before = structuredClone(original);
    for (const prepared of [
        { updates: [{ id: 'missing', status: 'active' }] },
        { updates: [{ id: 'compact', status: 'invented-status' }] },
        { updates: [{ id: 'compact', status: 'active' }], status_changes: [{ id: 'compact', status: 'retired' }] },
        { updates: [direction('compact'), { id: 'compact', status: 'active' }] },
    ]) assert.throws(() => analysis.applyAnalysis(original, parseRuntime({ contract_version: 14, prepared }), messages));
    assert.deepEqual(original, before);
});

test('partial content with a status cannot be mistaken for a status-only operation', () => {
    const original = analysis.applyAnalysis(defaultState(), parseRuntime(plan()), messages);
    const next = analysis.applyAnalysis(original, parseRuntime({ contract_version: 14, prepared: {
        updates: [{ id: 'compact', status: 'active', future: 'A changed outcome with missing core prose.' }, direction('orchard')], focus: ['orchard'],
    } }), messages);
    assert.deepEqual(next.preparedWorld.items.find(item => item.id === 'compact'), original.preparedWorld.items[0]);
});


test('replayed removals are idempotent without permitting activation of missing records', () => {
    const original = analysis.applyAnalysis(defaultState(), parseRuntime(plan()), messages);
    const delta = parseRuntime({ contract_version: 14, prepared: {
        updates: [direction('orchard')], status_changes: [{ id: 'compact', status: 'retired' }], focus: ['compact', 'orchard'],
    } });
    const first = analysis.applyAnalysis(original, delta, messages);
    const second = analysis.applyAnalysis(first, delta, messages);
    assert.deepEqual({ ...second.preparedWorld, reviewCursor: first.preparedWorld.reviewCursor }, first.preparedWorld);
    assert.equal(second.preparedWorld.reviewCursor, first.preparedWorld.reviewCursor + 1, 'review attention advances without changing story records');
    assert.throws(() => analysis.applyAnalysis(second, parseRuntime({ contract_version: 14, prepared: {
        status_changes: [{ id: 'compact', status: 'active' }],
    } }), messages), /unavailable/);
});


test('complete notebook fields at the wrong JSON level are preserved through parsing and saving', () => {
    for (const prepared of [undefined, { approach: plan().prepared.approach }, { updates: [direction('orchard')] }]) {
        const raw = { contract_version: 14, prepared, updates: [direction('compact')], focus: ['compact'] };
        const before = structuredClone(raw);
        const parsed = parseRuntime(raw);
        const next = analysis.applyAnalysis(defaultState(), parsed, messages);
        assert.ok(next.preparedWorld.items.some(item => item.id === 'compact'));
        if (prepared?.updates) assert.ok(next.preparedWorld.items.some(item => item.id === 'orchard'));
        assert.deepEqual(next.preparedWorld.focus, ['compact']);
        assert.equal(parsed.updates, undefined, 'canonical response has one notebook location');
        assert.deepEqual(raw, before);
    }
});

test('mixed nesting deduplicates identical content but does not hide conflicting edits', () => {
    const raw = { contract_version: 14, prepared: { updates: [direction('compact')], focus: ['compact'] }, updates: [direction('compact')], focus: ['compact'] };
    const next = analysis.applyAnalysis(defaultState(), parseRuntime(raw), messages);
    assert.equal(next.preparedWorld.items.length, 1);
    raw.updates = [direction('compact', { middle: 'A contradictory replacement.' })];
    assert.throws(() => parseRuntime(raw));
    assert.throws(() => parseRuntime({ contract_version: 14, prepared: { approach: 'A', updates: [] }, approach: 'B' }));
});


test('a thousand saved developments fit routine and review budgets without losing storage or latest instructions', async () => {
    const state = analysis.applyAnalysis(defaultState(), parseRuntime(plan()), messages);
    const template = state.preparedWorld.items[0];
    state.preparedWorld.items = Array.from({ length: 1000 }, (_, i) => ({ ...template, id: `record-${i}` }));
    state.preparedWorld.items[0].premise = 'The Zareph glassmakers await a visit.';
    state.preparedWorld.focus = ['record-1'];
    state.preparedWorld.summary = 'UNFINISHED POSSIBILITY: distant glassmakers might seek winter aid; no agreement has happened. '.repeat(30);
    const latest = [...messages, { is_user: true, mes: 'Return to the Zareph glassmakers. Let me choose how to approach them.' }];
    const before = structuredClone(state);
    const fixedEnvelope = plannerBudgetEnvelope(WORLD_PLANNER_SYSTEM, WORLD_PLANNER_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY);
    for (const [incremental, tokenBudget] of [[true, 6000], [false, 14000]]) {
        const prompt = await fitPromptToBudget({ fixedEnvelope, tokenBudget,
            buildPrompt: effectivePromptTokens => analysis.buildWorldPlannerPrompt(latest, state, '', {}, { incremental, effectivePromptTokens, maxPromptTokens: tokenBudget }) });
        const input = JSON.parse(prompt);
        assert.equal(input.notebook_view.stored, 1000);
        assert.equal(input.notebook_view.shown, input.current.preparedWorld.items.length);
        assert.ok(input.notebook_view.attention.local.length);
        assert.ok(input.notebook_view.attention.wider.length);
        assert.equal(input.current.preparedWorld.summary, state.preparedWorld.summary);
        assert.equal(input.messages.at(-1).content, latest.at(-1).mes);
        assert.match(JSON.stringify(input.current.preparedWorld), /record-0["\s,]/);
        assert.deepEqual(input.current.preparedWorld.focus, ['record-1']);
    }
    assert.deepEqual(state, before);
});


test('rolling summary survives planner updates and persistence, stays private, and can be explicitly cleared', () => {
    const summary = 'PRIVATE PLAN: Winter aid might grow into federation; representation remains unresolved. No agreement exists yet.';
    const wire = { contract_version: 14, prepared: { ...plan().prepared, summary } };
    const original = analysis.applyAnalysis(defaultState(), parseRuntime(wire), messages);
    const saved = normalizeState(JSON.parse(JSON.stringify(original)));
    assert.equal(saved.preparedWorld.summary, summary);
    assert.equal(JSON.parse(analysis.buildWorldPlannerPrompt(messages, saved)).current.preparedWorld.summary, summary);
    assert.doesNotMatch(buildPromptPayload(saved, { preparedUsable: true }), /PRIVATE PLAN/);
    assert.match(buildPromptPayload(saved, { preparedUsable: true }), /Iona organizes a winter-aid trial/);
    for (const extra of [{}, { summary: null }]) {
        const next = analysis.applyAnalysis(saved, parseRuntime({ contract_version: 14,
            prepared: { updates: [direction('new')], focus: ['new'], ...extra } }), messages);
        assert.equal(next.preparedWorld.summary, summary);
        assert.equal(next.preparedWorld.items.length, 2);
    }
    const revised = 'PRIVATE PLAN: Voluntary aid remains possible, but a federation is no longer being pursued.';
    for (const content of [JSON.stringify({ contract_version: 14, prepared: { summary: revised, updates: [], focus: ['compact'] } }),
        { choices: [{ message: { content: JSON.stringify({ contract_version: 14, summary: revised, prepared: { updates: [], focus: ['compact'] } }) } }] }]) {
        const next = analysis.applyAnalysis(saved, parseRuntime(content), messages);
        assert.equal(next.preparedWorld.summary, revised);
        assert.deepEqual(next.preparedWorld.items, saved.preparedWorld.items);
    }
    const cleared = analysis.applyAnalysis(saved, parseRuntime({ contract_version: 14,
        prepared: { summary: '', updates: [], focus: ['compact'] } }), messages);
    assert.equal(cleared.preparedWorld.summary, '');
    assert.deepEqual(cleared.preparedWorld.items, saved.preparedWorld.items);
    assert.equal(saved.preparedWorld.summary, summary);
});

test('bad or conflicting rolling summaries reject atomically without losing saved details', () => {
    const original = analysis.applyAnalysis(defaultState(), parseRuntime({ contract_version: 14,
        prepared: { ...plan().prepared, summary: 'Preserve this earlier conditional direction.' } }), messages);
    const before = structuredClone(original);
    for (const summary of [{ secret: 'invalid object' }, ['valid prose', 42]]) {
        assert.throws(() => analysis.applyAnalysis(original, parseRuntime({ contract_version: 14,
            prepared: { summary, updates: [direction('new')], focus: ['new'] } }), messages));
        assert.deepEqual(original, before);
    }
    assert.throws(() => parseRuntime({ contract_version: 14, summary: 'Conflicting root summary.',
        prepared: { summary: 'Nested summary.', updates: [], focus: [] } }), /Conflicting/);
});


test('oversized planner prose preserves saved fields and valid neighbors across live and detached parsing', () => {
    const original = analysis.applyAnalysis(defaultState(), parseRuntime({ contract_version: 14,
        prepared: { ...plan().prepared, summary: 'Saved summary remains intact.' } }), messages);
    const before = structuredClone(original);
    const wire = { contract_version: 14, prepared: {
        summary: 's'.repeat(3601), approach: 'a'.repeat(2401),
        updates: [direction('compact', { middle: 'm'.repeat(1761) }), direction('bad-new', { knowledge: 'k'.repeat(721) }), direction('good')],
        focus: ['compact', 'bad-new', 'good'],
    } };
    for (const content of [JSON.stringify(wire), { choices: [{ message: { content: JSON.stringify(wire) } }] }]) {
        const parsed = parseRuntime(content);
        assert.deepEqual(new Set(parsed._taleFairyRecovery.omitted), new Set(['prepared.summary', 'prepared.approach', 'prepared.updates:compact', 'prepared.updates:bad-new']));
        const next = analysis.applyAnalysis(original, parsed, messages);
        assert.equal(next.preparedWorld.summary, before.preparedWorld.summary);
        assert.equal(next.preparedWorld.approach, before.preparedWorld.approach);
        assert.deepEqual(next.preparedWorld.items[0], before.preparedWorld.items[0]);
        assert.deepEqual(next.preparedWorld.items.map(item => item.id), ['compact', 'good']);
        assert.deepEqual(next.preparedWorld.focus, ['good']);
    }
    assert.deepEqual(original, before);
    // Oversized prose must not hide a contradictory status change for its ID.
    wire.prepared.status_changes = [{ id: 'compact', status: 'retired' }];
    assert.throws(() => parseRuntime(wire));
});

test('large complete update and status batches stay atomic without a writing-target capacity error', () => {
    const wire = { contract_version: 14, prepared: { updates: Array.from({ length: 30 }, (_, i) => direction(`record-${i}`)), focus: ['record-29'] } };
    const initial = analysis.applyAnalysis(defaultState(), parseRuntime(wire), messages);
    assert.equal(initial.preparedWorld.items.length, 30);
    const next = analysis.applyAnalysis(initial, parseRuntime({ contract_version: 14, prepared: {
        updates: [direction('new')], status_changes: initial.preparedWorld.items.map(item => ({ id: item.id, status: 'retired' })), focus: ['new'],
    } }), messages);
    assert.deepEqual(next.preparedWorld.items.map(item => item.id), ['new']);
    wire.prepared.updates.push(direction('record-29', { premise: 'Conflicting replacement.' }));
    assert.throws(() => parseRuntime(wire));
    assert.equal(initial.preparedWorld.items.length, 30);
});

test('all author notes and long instructions survive saves, rebuilds and the planner prompt', () => {
    const notes = Array.from({ length: 30 }, (_, i) => ({ kind: 'forbid', text: `Exact user rule ${i}: leave my character decisions to me.`, at: i }));
    notes[0].text = 'Preserve every qualification. '.repeat(80) + 'NEVER REMOVE THIS ENDING.';
    const original = defaultState(); original.userNotes = notes;
    const saved = normalizeState(JSON.parse(JSON.stringify(original)));
    assert.deepEqual(saved.userNotes, notes);
    const instruction = 'Preserve this submitted note. '.repeat(70) + 'AND ITS FINAL RESTRICTION.';
    const input = JSON.parse(analysis.buildWorldPlannerPrompt(messages, saved, instruction, {}, { incremental: true }));
    assert.deepEqual(input.constraints.notes, notes);
    assert.equal(input.user_instruction, instruction);
    const applied = analysis.applyAnalysis(saved, parseRuntime(plan()), messages);
    assert.deepEqual(applied.userNotes, notes);
});

test('tight prompts omit whole optional planner fields while preserving exact notes and saved baselines', async () => {
    const state = analysis.applyAnalysis(defaultState(), parseRuntime(plan()), messages);
    state.preparedWorld.summary = 'A wider possible direction. '.repeat(130);
    state.preparedWorld.approach = 'Develop the wider setting. '.repeat(90);
    state.userNotes = [{ kind: 'forbid', text: 'Keep the exact instructions and their final qualification. '.repeat(200).trim(), at: 1 }];
    const before = structuredClone(state);
    const fixedEnvelope = plannerBudgetEnvelope(WORLD_PLANNER_SYSTEM, WORLD_PLANNER_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY);
    const prompt = await fitPromptToBudget({ fixedEnvelope, tokenBudget: 6000,
        buildPrompt: effectivePromptTokens => analysis.buildWorldPlannerPrompt(messages, state, '', {}, { incremental: true, effectivePromptTokens }) });
    const input = JSON.parse(prompt);
    assert.deepEqual(input.constraints.notes, state.userNotes);
    assert.ok(input.current.preparedWorld.omitted_fields?.length);
    for (const key of input.current.preparedWorld.omitted_fields) assert.equal(input.current.preparedWorld[key], '');
    assert.deepEqual(state, before);
});


test('an impossible prompt budget fails explicitly instead of clipping authoritative notes', async () => {
    const state = defaultState();
    state.userNotes = [{ kind: 'forbid', text: 'Keep every exact rule and exception. '.repeat(900).trim(), at: 1 }];
    const before = structuredClone(state);
    const fixedEnvelope = plannerBudgetEnvelope(WORLD_PLANNER_SYSTEM, WORLD_PLANNER_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY);
    await assert.rejects(fitPromptToBudget({ fixedEnvelope, tokenBudget: 6000,
        buildPrompt: effectivePromptTokens => analysis.buildWorldPlannerPrompt(messages, state, '', {}, { incremental: true, effectivePromptTokens }) }), /could not be fitted/);
    assert.deepEqual(state, before);
});
