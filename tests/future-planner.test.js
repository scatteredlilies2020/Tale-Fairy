import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as f from '../extension/future-planner.js';
import { createFutureHost, serializeActivePlanner } from '../extension/future-host.js';
import { emptyCampaign, campaignPayload } from '../extension/campaign-planner.js';
import { directorInput, directorPass, DIRECTOR_SYSTEM } from '../extension/story-director.js';
import { CampaignSession } from '../extension/campaign-session.js';

const fingerprint = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const card = (id = 'f1-convoys', category = 'Original') => ({ id, category, title: 'The Missing Winter Convoys',
    premise: 'Three medicine convoys vanished; rival border clinics need supplies before winter closes the pass.',
    pressures: [{ label: 'Winter', pressure: 'Closing roads and dwindling clinic stocks increase the cost of delay.' }],
    favors: 'Unexplained losses continue and the clinics seek outside help.',
    prevents: 'Reliable deliveries resume, or other groups resolve the disappearances.',
    timing: 'A possible next Chapter as the current village crisis settles, not a fixed date.',
    transition: 'A clinic request can reach the village during the aftermath.', outlook: 'Plausible, not guaranteed.' });
const base = () => ({ enabled: true, chatId: 'chat', referenceHash: 'ref', requestSignature: 'settings',
    state: emptyCampaign(), messages: [{ is_user: false, mes: 'The Hyuga Affair has ended in a negotiated settlement.' },
        { is_user: true, mes: 'I return to ordinary village work.' }], reference: { premise: 'Alternate-canon village RP.' },
    evidence: [], playerNames: ['Player'], inputBudget: 10000 });
const common = s => directorInput({ state: s.state, reference: s.reference,
    messages: s.messages.map((m, index) => ({ index, role: m.is_user ? 'user' : 'assistant', content: m.mes })),
    futurePlanning: true, previousUsable: s.state.revision > 0 });
const source = s => ({ chatId: s.chatId, referenceHash: s.referenceHash,
    messageCount: s.messages.length, fingerprint: fingerprint(s.messages) });
const reply = cards => ({ text: JSON.stringify({ upsert: cards, retain: [], retire: [] }), finishReason: 'stop' });
function pure(state = f.emptyFuture(), options = f.futureOptions(), mode = 'update') {
    const s = { ...base(), state, receipts: [], futureOptions: options, futureMode: mode };
    return { s, input: f.futureInput(common(base()), s, fingerprint), source: source(s) };
}
function harness(generate = async () => reply([card()])) {
    const b = base(), metadata = { unrelated: { keep: true } }, settings = { futureEnabled: true, futureInterval: 4 };
    const calls = [], writes = [], ack = [], cancel = []; let jobs = null;
    const api = { readBase: () => structuredClone(b), metadata: () => metadata, settings: () => settings, fingerprint,
        write: p => { writes.push(structuredClone(p)); Object.assign(metadata, p); }, persist: async () => {},
        render() {}, status() {}, buildCommon: common, lock: async (_id, task) => task(),
        jobs: async () => jobs, ackJob: async id => ack.push(id), cancelJob: async id => cancel.push(id),
        generate: async (...args) => { calls.push(args); return generate(...args); } };
    return { host: createFutureHost(api), api, b, metadata, settings, calls, writes, ack, cancel, setJobs: value => { jobs = value; } };
}
const turn = h => h.b.messages.push({ is_user: false, mes: `A new accepted development ${h.b.messages.length}.` });
const until = async fn => { for (let i = 0; i < 100 && !fn(); i++) await new Promise(resolve => setImmediate(resolve)); assert.ok(fn(), 'expected work to start'); };
const novel = id => ({ ...card(id), title: 'The Clockmakers’ Exhibition',
    premise: 'Retired clockmakers invite young apprentices to create competing mechanical gardens for a public exhibition.' });
async function planned(state, cards, { capacity = 10, includeCanon = true, mode = 'update', retain = [], retire = [], order } = {}) {
    const p = pure(state, { capacity, includeCanon }, mode);
    return f.futurePass({ state: p.s.state, input: p.input, source: p.source,
        generate: async () => ({ text: JSON.stringify({ upsert: cards, retain, retire, ...(order === undefined ? {} : { order }) }), finishReason: 'stop' }) });
}

test('capacity choices normalize to 10 by default and reserve output headroom without a fill quota', async () => {
    for (const invalid of [undefined, null, '', 'bad', 7, 11, 16]) assert.equal(f.futureCapacity(invalid), 10);
    assert.deepEqual(f.futureOptions(), { capacity: 10, includeCanon: true });
    for (const [capacity, tokens] of [[6, 3000], [10, 4500], [15, 6000]]) {
        assert.equal(f.futureCapacity(String(capacity)), capacity);
        const cards = Array.from({ length: capacity }, (_, i) => card(`f1-${i}`));
        const h = harness(async () => reply(cards)); h.settings.futureCapacity = capacity;
        assert.equal((await h.host.run()).accepted, true);
        assert.equal(h.metadata[f.FUTURE_KEY].cards.length, capacity);
        assert.equal(h.calls[0][3].responseTokens, tokens);
        assert.equal(JSON.parse(h.calls[0][0]).planning_options.capacity, capacity);
        const over = await planned(undefined, [...cards, card('f1-excess')], { capacity });
        assert.equal(over.accepted, false, 'reject rather than silently trim a paid result');
        assert.equal((await planned(undefined, [], { capacity })).accepted, true, 'empty is valid');
    }
});

test('canon retains identity through omission, adaptation and reroll, and requires explicit retirement', async () => {
    const canon = { ...card('f1-canon', 'Canon'), title: 'A conditional canon event' };
    const first = await planned(undefined, [canon, card()]);
    const omitted = await planned(first.state, []);
    assert.deepEqual(omitted.state.cards, [canon]);
    const adapted = { ...canon, premise: 'A surviving negotiator turns the anticipated confrontation into a contested peace summit.',
        favors: 'New allies seek an agreement.', prevents: 'The factions settle independently.', timing: 'When the RP makes room.',
        transition: 'Negotiators pursue their own invitation.' };
    const rerolled = await planned(first.state, [adapted, novel('f2-new')], { mode: 'reroll' });
    assert.equal(rerolled.accepted, true, rerolled.error);
    assert.deepEqual(rerolled.state.cards[0], adapted);
    assert.equal(first.state.cards[0].premise, canon.premise, 'input state stays immutable');
    const retired = await planned(rerolled.state, [], { retire: [canon.id] });
    assert.equal(retired.accepted, true, retired.error);
    assert.equal(retired.state.cards.length, 0);
    assert.ok(retired.state.withdrawn.some(c => c.id === canon.id));
});

test('canon-off keeps saved canon inactive and re-enabling reassesses the same identities', async () => {
    const canon = card('f1-canon', 'Canon');
    const first = await planned(undefined, [canon, card()]);
    const off = pure(first.state, { capacity: 10, includeCanon: false });
    assert.deepEqual(JSON.parse(off.input.prompt).previous_future, [card()]);
    assert.deepEqual(f.futureForDirector(first.state, off.s, fingerprint, [], off.s.futureOptions), [card()]);
    const bad = await planned(first.state, [card('f2-newcanon', 'Canon')], { includeCanon: false });
    assert.equal(bad.accepted, false); assert.equal(bad.state, first.state);
    const reroll = await planned(first.state, [novel('f2-new')], { includeCanon: false, mode: 'reroll' });
    assert.equal(reroll.accepted, true, reroll.error);
    assert.deepEqual(reroll.state.parkedCanon, [canon]);
    assert.ok(!reroll.state.withdrawn.some(c => c.id === canon.id));
    const next = pure(reroll.state);
    assert.ok(JSON.parse(next.input.prompt).previous_future.some(c => c.id === canon.id));
    assert.ok(!f.futureForDirector(reroll.state, next.s, fingerprint).some(c => c.id === canon.id), 'parked cards await reassessment');
    const restored = await planned(reroll.state, [], { retain: ['f2-new'] });
    assert.equal(restored.accepted, true, restored.error);
    assert.deepEqual(restored.state.parkedCanon, []);
    assert.ok(restored.state.cards.some(c => c.id === canon.id));
});

test('lowering capacity parks overflow canon without losing it or feeding it to the current guide', async () => {
    const cards = Array.from({ length: 15 }, (_, i) => ({ ...card(`f1-${i}`, 'Canon'), title: `Canon possibility ${i}` }));
    const first = await planned(undefined, cards, { capacity: 15 });
    const smaller = await planned(first.state, [], { capacity: 6 });
    assert.equal(smaller.accepted, true, smaller.error);
    assert.equal(smaller.state.cards.length, 6);
    assert.equal(smaller.state.parkedCanon.length, 9);
    const p = pure(smaller.state);
    assert.equal(f.futureForDirector(smaller.state, p.s, fingerprint, [], { capacity: 15, includeCanon: true }).length, 6);
    const restored = await planned(smaller.state, [], { capacity: 15 });
    assert.equal(restored.accepted, true, restored.error);
    assert.deepEqual(restored.state.cards, cards);
    assert.deepEqual(restored.state.parkedCanon, []);
    assert.equal(f.validFuture({ ...restored.state, parkedCanon: [card('f1-extra', 'Canon')] }), false);
    assert.equal(f.validFuture({ ...smaller.state, parkedCanon: [card()] }), false);
});

test('legacy responses preserve saved mixed order instead of promoting later Canon', async () => {
    const original = { ...card(), timing: 'An opportunity in the coming weeks.' };
    const canon = { ...card('f1-canon', 'Canon'), timing: 'Possibly years later, if its causes survive.' };
    const first = await planned(undefined, [original, canon]);
    assert.deepEqual(first.state.cards, [original, canon]);
    const next = await planned(first.state, [], { retain: [original.id] });
    assert.equal(next.accepted, true, next.error);
    assert.deepEqual(next.state.cards, [original, canon]);
    const reloaded = JSON.parse(JSON.stringify(next.state));
    const p = pure(reloaded);
    assert.deepEqual(f.futureForDirector(reloaded, p.s, fingerprint), [original, canon]);
});

test('explicit order interleaves categories, retained and changed prospects without rewriting their notes', async () => {
    const original = card(), canon = card('f1-canon', 'Canon');
    const first = await planned(undefined, [canon, original]);
    const changed = { ...canon, prevents: 'Its causes may disappear; no substitute crisis is needed.' };
    const added = novel('f2-new');
    const next = await planned(first.state, [changed, added], { retain: [original.id], order: [added.id, canon.id, original.id] });
    assert.equal(next.accepted, true, next.error);
    assert.deepEqual(next.state.cards, [added, changed, original]);
    const p = pure(next.state);
    assert.deepEqual(f.futureForDirector(next.state, p.s, fingerprint), next.state.cards);
    assert.deepEqual(f.futureForDirector(next.state, p.s, fingerprint, [], { capacity: 6, includeCanon: false }), [added, original]);
    assert.deepEqual(first.state.cards, [canon, original]);
});

test('saved Canon does not monopolize active capacity and held prospects remain reassessable', async () => {
    const canon = Array.from({ length: 15 }, (_, i) => ({ ...card(`f1-${i}`, 'Canon'), title: `Canon ${i}` }));
    const first = await planned(undefined, canon, { capacity: 15 });
    const added = novel('f2-new');
    const next = await planned(first.state, [added], { capacity: 6, order: [added.id, canon[14].id] });
    assert.equal(next.accepted, true, next.error);
    assert.deepEqual(next.state.cards, [added, canon[14]]);
    assert.deepEqual(next.state.parkedCanon, canon.slice(0, 14));
    assert.deepEqual(next.state.withdrawn, []);
    const p = pure(next.state, { capacity: 6, includeCanon: true });
    assert.equal(JSON.parse(p.input.prompt).previous_future.length, 16, 'all saved prospects available to reassess');
    assert.deepEqual(JSON.parse(p.input.prompt).inactive_canon_ids, canon.slice(0, 14).map(c => c.id));
    assert.deepEqual(f.futureForDirector(next.state, p.s, fingerprint), next.state.cards);
    const swapped = await planned(next.state, [], { capacity: 6, retain: [added.id], order: [canon[0].id, added.id] });
    assert.equal(swapped.accepted, true, swapped.error);
    assert.deepEqual(swapped.state.cards, [canon[0], added]);
    assert.equal(swapped.state.parkedCanon.length, 14);
    const inactive = await planned(swapped.state, [], { capacity: 6, order: [] });
    assert.equal(inactive.accepted, true, inactive.error);
    assert.deepEqual(inactive.state.cards, []);
    assert.equal(inactive.state.parkedCanon.length, 15);
    const restored = await planned(inactive.state, [], { order: [canon[7].id] });
    assert.equal(restored.accepted, true, restored.error);
    assert.deepEqual(restored.state.cards, [canon[7]]);
});

test('a full active and inactive outlook can be reassessed and explicitly retired in one response', async () => {
    const canon = Array.from({ length: 15 }, (_, i) => card(`f1-c${i}`, 'Canon'));
    const first = await planned(undefined, canon, { capacity: 15 });
    const originals = Array.from({ length: 15 }, (_, i) => card(`f2-o${i}`));
    const full = await planned(first.state, originals, { capacity: 15, order: originals.map(c => c.id) });
    assert.equal(full.accepted, true, full.error);
    assert.equal(full.state.cards.length, 15); assert.equal(full.state.parkedCanon.length, 15);
    const over = await planned(full.state, [card('f3-extra', 'Canon')], { order: ['f3-extra'] });
    assert.equal(over.accepted, false, 'saved Canon remains bounded even with spare active slots');
    const empty = await planned(full.state, [], { order: [], retire: [...originals, ...canon].map(c => c.id) });
    assert.equal(empty.accepted, true, empty.error);
    assert.deepEqual(empty.state.cards, []); assert.deepEqual(empty.state.parkedCanon, []);
    assert.equal(empty.state.withdrawn.length, 30);
});

test('invalid arrangements keep the complete prior outlook without another model call', async () => {
    const original = card(), canon = card('f1-canon', 'Canon');
    const first = await planned(undefined, [original, canon]);
    const cases = [
        { upsert: [], retain: [original.id], retire: [], order: [original.id, original.id] },
        { upsert: [], retain: [], retire: [], order: ['unknown'] },
        { upsert: [], retain: [], retire: [canon.id], order: [canon.id] },
        { upsert: [], retain: [original.id], retire: [], order: [canon.id] },
        { upsert: [novel('f2-new')], retain: [], retire: [], order: [canon.id] },
        { upsert: [card('f2-new', 'Canon')], retain: [], retire: [], order: [canon.id] },
        { upsert: [], retain: [], retire: [], order: [original.id] },
        { upsert: [], retain: [], retire: [], order: null },
    ];
    for (const raw of cases) {
        let calls = 0; const p = pure(first.state);
        const result = await f.futurePass({ state: first.state, input: p.input, source: p.source,
            generate: async () => { calls++; return { text: JSON.stringify(raw) }; } });
        assert.equal(result.accepted, false, JSON.stringify(raw));
        assert.equal(result.state, first.state);
        assert.equal(calls, 1);
    }
    const tooMany = Array.from({ length: 7 }, (_, i) => card(`f2-${i}`, i % 2 ? 'Canon' : 'Original'));
    const over = await planned(first.state, tooMany, { capacity: 6, order: tooMany.map(c => c.id) });
    assert.equal(over.accepted, false);
    assert.equal(over.state, first.state);
});

test('reroll separates prior ideas from history and uses varied creative axes, not random forced events', async () => {
    const first = await planned(undefined, [card(), card('f1-canon', 'Canon')]);
    const a = pure(first.state, f.futureOptions(), 'reroll'), b = pure(first.state, f.futureOptions(), 'reroll');
    const input = JSON.parse(a.input.prompt);
    assert.equal(input.planning_options.mode, 'reroll');
    assert.deepEqual(input.previous_future.map(c => c.id), ['f1-canon']);
    assert.deepEqual(input.recent_original_ideas, [{ title: card().title, premise: card().premise }]);
    assert.notEqual(input.variety_nonce, JSON.parse(b.input.prompt).variety_nonce);
    assert.deepEqual(Object.keys(input.creative_directions), ['focus', 'context', 'drivers', 'activity', 'scale', 'connections']);
    assert.notDeepEqual(f.futureCreativeDirections(() => 0), f.futureCreativeDirections(() => .999));
    const update = JSON.parse(pure(first.state).input.prompt);
    assert.equal(update.creative_directions, undefined); assert.equal(update.recent_original_ideas, undefined);
    assert.equal(update.previous_future.length, 2);
});

test('reroll rejects original retention, recycled ids, titles and near-identical premises without a repair call', async () => {
    const first = await planned(undefined, [card()]);
    for (const [cards, retain] of [[[], [card().id]], [[novel(card().id)], []],
        [[{ ...novel('f2-new'), title: 'THE missing WINTER convoys!' }], []],
        [[{ ...card('f2-new'), title: 'Renamed idea' }], []],
        [[{ ...card('f2-new'), title: 'New name', premise: card().premise + ' Everyone debates possible action.' }], []],
        [[novel('f2-one'), novel('f2-two')], []]]) {
        let calls = 0; const p = pure(first.state, f.futureOptions(), 'reroll');
        const result = await f.futurePass({ state: first.state, input: p.input, source: p.source, generate: async () => {
            calls++; return { text: JSON.stringify({ upsert: cards, retain, retire: [] }) };
        } });
        assert.equal(result.accepted, false); assert.equal(result.state, first.state); assert.equal(calls, 1);
    }
    assert.equal(f.similarFutureIdea({ title: '旧', premise: '山村の鍛冶職人たちが共同工房を開くために準備する' },
        { title: '新', premise: '山村の鍛冶職人たちが共同工房を開くために準備する。新しい話。' }), true);
    assert.equal((await planned(first.state, [novel('f2-new')], { mode: 'reroll' })).accepted, true);
});

test('later rerolls remember replaced originals with bounded history rather than an endless backlog', async () => {
    const first = await planned(undefined, [card()]);
    const second = await planned(first.state, [novel('f2-new')], { mode: 'reroll' });
    assert.equal(second.state.recentOriginals.length, 1);
    const recycled = await planned(second.state, [card('f3-recycled')], { mode: 'reroll' });
    assert.equal(recycled.accepted, false); assert.equal(recycled.state, second.state);
    const history = Array.from({ length: 24 }, (_, i) => ({ title: `Older idea ${i}`, premise: `An older distinct possibility ${i}.` }));
    const bounded = await planned({ ...first.state, recentOriginals: history }, [novel('f2-new')], { mode: 'reroll' });
    assert.equal(bounded.accepted, true, bounded.error);
    assert.equal(bounded.state.recentOriginals.length, 24);
    assert.equal(bounded.state.recentOriginals[0].title, 'Older idea 1');
    assert.equal(JSON.parse(pure(bounded.state, f.futureOptions(), 'reroll').input.prompt).recent_original_ideas.length, 13);
});

test('manual reroll coalesces clicks and recovers using the original mode and novelty guard', async () => {
    for (const duplicate of [false, true]) {
        let release; const h = harness(() => new Promise(resolve => { release = resolve; }));
        const first = await planned(undefined, [card(), card('f1-canon', 'Canon')]);
        h.metadata[f.FUTURE_KEY] = first.state;
        const pending = h.host.run({ manual: true, mode: 'reroll' });
        assert.equal(h.host.run({ manual: true }), pending);
        await until(() => release);
        const meta = h.calls[0][2];
        assert.equal(meta.campaign.input.mode, 'reroll');
        assert.equal(JSON.parse(h.calls[0][0]).planning_options.mode, 'reroll');
        h.host.stop('page hidden', { detach: true }); await pending;
        const response = reply([duplicate ? card('f2-new') : novel('f2-new')]);
        h.setJobs([{ id: 'reroll-job', chatId: h.b.chatId, runKey: meta.runKey, status: 'complete', meta, text: response.text }]);
        assert.equal((await createFutureHost(h.api).recover()).recovered, true);
        assert.equal(h.metadata[f.FUTURE_KEY].revision, duplicate ? 1 : 2);
        assert.equal(h.calls.length, 1, 'recovery never purchases another generation');
        assert.ok(h.metadata[f.FUTURE_KEY].cards.some(c => c.id === 'f1-canon'));
        release(response);
    }
});

test('future cards are concrete, bounded, conditional and private at any campaign starting point', async () => {
    for (const stage of ['The RP begins after the crisis.', 'Years of accepted adventures have passed.', 'The late campaign begins at a peace conference.']) {
        const p = pure(); p.s.messages[0].mes = stage; p.source = source(p.s);
        p.input = f.futureInput(common({ ...p.s, state: emptyCampaign() }), p.s, fingerprint);
        assert.ok(p.input.prompt.includes(stage));
        const result = await f.futurePass({ state: p.s.state, input: p.input, source: p.source, generate: async () => reply([card(), card('f1-canon', 'Canon')]) });
        assert.equal(result.accepted, true, result.error);
        assert.equal(f.validFuture(result.state), true);
        assert.equal(result.state.cards.length, 2);
        assert.doesNotMatch(campaignPayload(emptyCampaign()), /Winter|convoys|prevents|future/);
    }
    assert.match(f.FUTURE_SYSTEM, /Missing history stays uncertain/);
    assert.match(f.FUTURE_SYSTEM, /indispensable causes/);
    assert.match(f.FUTURE_SYSTEM, /not asserting the event happened offscreen/);
    assert.match(DIRECTOR_SYSTEM, /reconnect meaningful surviving Arcs/);
});

test('retain preserves identity; retired and omitted cards have bounded exclusion hints', async () => {
    const p = pure();
    const first = await f.futurePass({ state: p.s.state, input: p.input, source: p.source, generate: async () => reply([card(), card('f1-other')]) });
    const next = pure(first.state);
    const result = await f.futurePass({ state: first.state, input: next.input, source: p.source,
        generate: async () => ({ text: JSON.stringify({ upsert: [], retain: ['f1-convoys'], retire: ['f1-other'] }) }) });
    assert.deepEqual(result.state.cards, [card()]);
    const third = pure(result.state);
    assert.deepEqual(JSON.parse(third.input.prompt).adopted_or_retired, [{ id: 'f1-other', title: card().title }]);
    assert.match(third.input.newIdPrefix, /^f3-/);
});

test('brief future cards can leave unused note fields empty and survive the next review', async () => {
    const p = pure();
    const brief = { ...card(), pressures: [], timing: '', transition: '', outlook: '' };
    const first = await f.futurePass({ state: p.s.state, input: p.input, source: p.source, generate: async () => reply([brief]) });
    assert.equal(first.accepted, true, first.error);
    assert.equal(f.validFuture(first.state), true);
    const next = pure(first.state);
    const retained = await f.futurePass({ state: first.state, input: next.input, source: next.source,
        generate: async () => ({ text: JSON.stringify({ upsert: [], retain: [brief.id], retire: [] }), finishReason: 'stop' }) });
    assert.equal(retained.accepted, true, retained.error);
    assert.deepEqual(retained.state.cards, [brief]);
    for (const key of ['id', 'title', 'premise']) {
        assert.equal(f.validFuture({ ...first.state, cards: [{ ...brief, [key]: '' }] }), false, key);
    }
});

test('schema, unknown identities, truncation and lost Canon category fail without changing saved outlook', async () => {
    const p = pure();
    const first = await f.futurePass({ state: p.s.state, input: p.input, source: p.source, generate: async () => reply([card('f1-convoys', 'Canon')]) });
    const next = pure(first.state);
    for (const response of [reply([card('f1-convoys', 'Original')]), reply([card('old-invented')]),
        reply([card('f2-new', 'Canon-adjacent')]), reply(Array.from({ length: 11 }, (_, i) => card(`f2-${i}`))),
        { ...reply([card('f2-new')]), finishReason: 'length' }, { text: '{"upsert":[' },
        { text: '{"upsert":[],"retain":["unknown"],"retire":[]}' },
        { text: '{"upsert":[],"retain":[],"retire":["unknown"]}' }]) {
        const r = await f.futurePass({ state: first.state, input: next.input, source: p.source, generate: async () => response });
        assert.equal(r.accepted, false); assert.equal(r.state, first.state);
    }
    const empty = await f.futurePass({ state: first.state, input: next.input, source: p.source, generate: async () => reply([]) });
    assert.equal(empty.accepted, true); assert.equal(empty.state.cards.length, 1, 'omitted Canon persists until explicit retirement');
});

test('reply cadence is independent of RP years; failures and reloads do not cause same-source retries', async () => {
    const h = harness(); assert.equal((await h.host.run()).accepted, true);
    assert.equal(h.calls.length, 1);
    assert.equal((await h.host.run()).skipped, 'not-due');
    h.b.messages.push({ is_user: true, mes: 'I wait.' });
    assert.equal((await h.host.run()).skipped, 'not-due');
    for (let i = 0; i < 3; i++) turn(h);
    assert.equal((await h.host.run()).skipped, 'not-due');
    turn(h); assert.equal((await h.host.run()).accepted, true);
    assert.equal(h.calls.length, 2);
    h.b.messages.push({ is_user: true, mes: 'Time skip: two years of routine work pass.' });
    assert.equal((await h.host.run()).accepted, true);
    const fail = harness(async () => { throw Error('provider unavailable'); });
    assert.equal((await fail.host.run()).accepted, false);
    fail.b.messages.push({ is_user: true, mes: 'Time skip: three years.' });
    assert.equal((await fail.host.run()).skipped, 'not-due');
    const reloaded = createFutureHost(fail.api);
    assert.equal((await reloaded.run()).skipped, 'not-due');
    turn(fail); await reloaded.run(); assert.equal(fail.calls.length, 2);
    await reloaded.run({ manual: true }); assert.equal(fail.calls.length, 3);
    assert.equal(f.futureInterval(0), 40); assert.equal(f.futureInterval(500), 200); assert.equal(f.futureInterval(1), 4);
});

test('material reassessment runs once and cannot bypass an explicit stop or failed-source reservation', async () => {
    const h = harness(); await h.host.run();
    h.b.messages.push({ is_user: true, mes: 'The author changes the long-term direction.' });
    h.metadata.taleFairyFutureReassessment = { source: source(h.b) };
    assert.equal((await h.host.run()).accepted, true);
    assert.equal((await h.host.run()).skipped, 'not-due');
    h.metadata[f.FUTURE_ATTEMPT_KEY].status = 'stopped';
    h.b.messages.push({ is_user: true, mes: 'Time skip: one year.' });
    h.metadata.taleFairyFutureReassessment = { source: source(h.b) };
    assert.equal((await h.host.run()).skipped, 'not-due');
    assert.equal(h.calls.length, 2);
    assert.equal((await h.host.run({ manual: true })).accepted, true);
});

test('corrupt saved outlook is withheld, renders safely and can be replaced by manual planning', async () => {
    const h = harness();
    for (const cards of [{ broken: true }, [null], [{ title: 'Broken card' }]]) {
        h.metadata[f.FUTURE_KEY] = { revision: 'bad', cards };
        assert.match(f.futureSummary(h.metadata[f.FUTURE_KEY]), /invalid and withheld/);
        assert.deepEqual(f.futureForDirector(h.metadata[f.FUTURE_KEY], h.b, fingerprint), []);
        assert.equal((await h.host.run({ manual: true })).accepted, true);
        assert.equal(h.metadata[f.FUTURE_KEY].revision, 1);
    }
});

test('bounded future cards have input space even in a long campaign and keep conditions whole', () => {
    const b = base();
    const cards = Array.from({ length: 15 }, (_, i) => card(`f1-${i}`, i % 2 ? 'Canon' : 'Original'));
    const messages = Array.from({ length: 100 }, (_, i) => ({ index: i, role: i % 2 ? 'user' : 'assistant',
        content: `Message ${i}: ` + 'Earlier experiences contribute to the campaign. '.repeat(30) }));
    const input = directorInput({ state: b.state, reference: b.reference, messages, futureCards: cards }, 10000);
    assert.deepEqual(JSON.parse(input.prompt).private_future, cards);
    assert.deepEqual(input.futureCards, cards);
    assert.match(input.prompt, /Message 99:/);
});

test('future save never overwrites concurrent current preparation or unrelated metadata', async () => {
    let release; const h = harness(() => new Promise(resolve => { release = resolve; }));
    const work = h.host.run(); assert.equal(h.host.run(), work);
    await until(() => release);
    h.b.state = { ...h.b.state, revision: 9, currentOnly: 'new current map' };
    h.metadata.currentOnly = 'new current map';
    release(reply([card()])); assert.equal((await work).accepted, true);
    assert.equal(h.metadata.currentOnly, 'new current map'); assert.deepEqual(h.metadata.unrelated, { keep: true });
    assert.equal(h.metadata[f.FUTURE_KEY].revision, 1);
    assert.ok(h.writes.every(p => Object.keys(p).every(k => [f.FUTURE_KEY, f.FUTURE_ATTEMPT_KEY].includes(k))));
});

test('adoption while future planning runs removes candidate at commit without losing paid result', async () => {
    let release; const h = harness(() => new Promise(resolve => { release = resolve; }));
    const work = h.host.run(); await until(() => release);
    h.metadata[f.FUTURE_RECEIPTS_KEY] = [{ id: 'f1-convoys', title: card().title, source: source(h.b) }];
    release(reply([card()])); assert.equal((await work).accepted, true);
    assert.equal(h.metadata[f.FUTURE_KEY].cards.length, 0);
});

test('edited/swiped source, chat switch, rebuild epoch, settings and disable reject late results', async () => {
    for (const change of [h => { h.b.messages[0].mes = 'A different accepted swipe.'; },
        h => { h.b.chatId = 'other'; }, h => { h.metadata[f.PLANNING_EPOCH_KEY] = 'new rebuild'; },
        h => { h.b.requestSignature = 'different model'; }, h => { h.settings.futureEnabled = false; },
        h => { h.b.referenceHash = 'changed premise'; }, h => { h.settings.futureCanon = false; },
        h => { h.settings.futureCapacity = 6; }]) {
        let release; const h = harness(() => new Promise(resolve => { release = resolve; }));
        const work = h.host.run(); await until(() => release); change(h); release(reply([card()]));
        assert.equal((await work).accepted, false);
        assert.equal(h.metadata[f.FUTURE_KEY], undefined);
    }
});

test('current adoption can choose a non-first prospect, validated against the actual active root', async () => {
    const b = base();
    const input = directorInput({ reference: b.reference, state: b.state, messages: [], futureCards: [novel('f1-unrelated'), card()], requireSagaHierarchy: true });
    const raw = { reviewAfter: 12, upsert: [{ id: 'r1-winter', kind: 'saga', parentId: '', status: 'active', links: [],
        title: 'The Missing Winter Convoys', owner: 'Border clinics', description: card().premise }], retain: [], retire: [], select: [],
        futureDecisions: [{ id: 'f1-convoys', action: 'adopt', chapterId: 'r1-winter', reason: 'Play now follows the clinic request.' }], reassessFuture: true };
    const run = () => directorPass({ state: b.state, input, source: source(b), generate: async () => ({ text: JSON.stringify(raw) }) });
    const r = await run(); assert.equal(r.accepted, true, r.error); assert.equal(r.futureDecisions.length, 1); assert.equal(r.reassessFuture, true);
    assert.doesNotMatch(campaignPayload(r.state), /f1-convoys|prevents|Favors|futureDecisions/);
    raw.futureDecisions[0].chapterId = 'unknown'; assert.equal((await run()).futureDecisions.length, 0);
    raw.futureDecisions[0].id = 'invented'; assert.equal((await run()).futureDecisions.length, 0);
});

test('server recovery replays one saved future result, not current work or a new model call', async () => {
    let release; const h = harness(() => new Promise(resolve => { release = resolve; }));
    const pending = h.host.run(); await until(() => release);
    const meta = h.calls[0][2];
    h.host.stop('page hidden', { detach: true }); await pending;
    h.setJobs([{ id: 'future-job', chatId: h.b.chatId, runKey: meta.runKey, status: 'complete', meta, text: reply([card()]).text }]);
    const reloaded = createFutureHost(h.api);
    assert.equal((await reloaded.recover()).recovered, true);
    assert.equal(h.metadata[f.FUTURE_KEY].revision, 1); assert.equal(h.calls.length, 1);
    assert.deepEqual(h.ack, ['future-job']);
    await reloaded.recover(); assert.equal(h.metadata[f.FUTURE_KEY].revision, 1);
    release(reply([card()]));
});

test('server recovery preserves explicit order and inactive Canon, rejecting invalid order without regeneration', async () => {
    for (const valid of [true, false]) {
        let release; const h = harness(() => new Promise(resolve => { release = resolve; }));
        const canon = card('f1-canon', 'Canon'), original = card();
        const first = await planned(undefined, [canon, original]);
        h.metadata[f.FUTURE_KEY] = first.state;
        const pending = h.host.run({ manual: true }); await until(() => release);
        const meta = h.calls[0][2];
        h.host.stop('page hidden', { detach: true }); await pending;
        const added = novel('f2-new');
        const response = { text: JSON.stringify({ upsert: [added], retain: [original.id], retire: [],
            order: valid ? [added.id, original.id] : ['unknown'] }) };
        h.setJobs([{ id: 'ordered-job', chatId: h.b.chatId, runKey: meta.runKey, status: 'complete', meta, text: response.text }]);
        const reloaded = createFutureHost(h.api);
        await reloaded.recover();
        const state = h.metadata[f.FUTURE_KEY];
        if (valid) {
            assert.equal(state.revision, 2);
            assert.deepEqual(state.cards, [added, original]);
            assert.deepEqual(state.parkedCanon, [canon]);
        } else assert.equal(state, first.state);
        await reloaded.recover();
        assert.equal(h.metadata[f.FUTURE_KEY], state);
        assert.equal(h.calls.length, 1);
        release(response);
    }
});

test('unknown server status blocks duplicate spending; active jobs recover instead of regenerating', async () => {
    const h = harness(); h.api.jobs = async () => { throw Error('offline'); };
    assert.equal((await h.host.run({ manual: true })).skipped, 'server-job-handled'); assert.equal(h.calls.length, 0);
    h.api.jobs = async () => [{ meta: { campaign: { kind: 'current' } } }];
    assert.equal((await h.host.run()).accepted, true);
});

test('Stop during server recovery prevents a late saved response from becoming current', async () => {
    let release;
    const h = harness(() => new Promise(resolve => { release = resolve; }));
    const pending = h.host.run(); await until(() => release);
    const meta = h.calls[0][2];
    h.host.stop('page hidden', { detach: true }); await pending;
    let list;
    h.api.jobs = () => new Promise(resolve => { list = resolve; });
    const reloaded = createFutureHost(h.api);
    const recovering = reloaded.recover(); await until(() => list);
    reloaded.stop('Explicit Stop');
    list([{ id: 'future-job', chatId: h.b.chatId, runKey: meta.runKey, status: 'complete', meta, text: reply([card()]).text }]);
    assert.equal((await recovering).recovered, false);
    assert.equal(h.metadata[f.FUTURE_KEY], undefined);
    assert.equal(h.calls.length, 1);
    release(reply([card()]));
});

test('active route queue is serialized and response timeout starts only after grant', async () => {
    let release; const first = serializeActivePlanner(() => new Promise(resolve => { release = resolve; }));
    await until(() => release);
    const b = { ...base(), state: f.emptyFuture() };
    const session = new CampaignSession({ read: () => b, fingerprint, saveAttempt: async a => { b.attempt = a; },
        prepare: s => f.futureInput(common(base()), s, fingerprint), runPass: f.futurePass, timeoutMs: 15,
        generateGate: serializeActivePlanner, generate: async () => reply([card()]), commit: state => { b.state = state; return true; } });
    const second = session.request({ manual: true });
    await new Promise(resolve => setTimeout(resolve, 35));
    assert.equal(b.state.revision, 0); release(); await first;
    assert.equal((await second).accepted, true);
});
