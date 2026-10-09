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
function pure(state = f.emptyFuture()) {
    const s = { ...base(), state, receipts: [] };
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
        reply([card('f2-new', 'Canon-adjacent')]), reply(Array.from({ length: 7 }, (_, i) => card(`f2-${i}`))),
        { ...reply([card('f2-new')]), finishReason: 'length' }, { text: '{"upsert":[' },
        { text: '{"upsert":[],"retain":["unknown"],"retire":[]}' },
        { text: '{"upsert":[],"retain":[],"retire":["unknown"]}' }]) {
        const r = await f.futurePass({ state: first.state, input: next.input, source: p.source, generate: async () => response });
        assert.equal(r.accepted, false); assert.equal(r.state, first.state);
    }
    const empty = await f.futurePass({ state: first.state, input: next.input, source: p.source, generate: async () => reply([]) });
    assert.equal(empty.accepted, true); assert.equal(empty.state.cards.length, 0);
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
    const cards = Array.from({ length: 6 }, (_, i) => card(`f1-${i}`, i % 2 ? 'Canon' : 'Original'));
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
        h => { h.b.referenceHash = 'changed premise'; }]) {
        let release; const h = harness(() => new Promise(resolve => { release = resolve; }));
        const work = h.host.run(); await until(() => release); change(h); release(reply([card()]));
        assert.equal((await work).accepted, false);
        assert.equal(h.metadata[f.FUTURE_KEY], undefined);
    }
});

test('current adoption is validated against supplied future cards and the actual active root', async () => {
    const b = base();
    const input = directorInput({ reference: b.reference, state: b.state, messages: [], futureCards: [card()], requireSagaHierarchy: true });
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
