import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createStorageMigrationManager, verifiedCompactCache, publicStorageMigration } from '../plugin/storage-migration.js';
import { createStorageMigrationClient, storageMigrationLabel } from '../extension/storage-migration.js';
import { generationCachePackets, compactGenerationPacket, generationContextEntries } from '../extension/generation-context.js';
import { emptyCampaign, mergeCampaign, campaignPayload, campaignAuthorInstructions } from '../extension/campaign-planner.js';
import { defaultState, STATE_VERSION } from '../extension/state.js';
import { init } from '../plugin/index.js';

function fixture() {
    const preparation = mergeCampaign(emptyCampaign(), {
        campaign: 'An ensemble makes music.', episode: { subject: 'A recital', status: 'open', boundary: 'When the recital settles.' },
        developments: [{ id: 'music', premise: 'Jo has a new piece.', progression: 'Explore different rhythms. '.repeat(50), outcomes: 'An original performance.', access: 'A shared evening.' }],
    }, { basisRevision: 0, source: { chatId: 'story', messageCount: 2, fingerprint: 'source', referenceHash: 'ref' }, evidenceIndices: [0, 1] });
    const state = { ...defaultState(), plannerContract: 15, campaignPreparation: preparation };
    const packet = { version: 1, chatId: 'story', inputKey: 'one', payload: campaignPayload(preparation, campaignAuthorInstructions(state)),
        selection: { inputKey: 'one', preparedUsable: true, campaignPreparation: preparation }, plannerState: state };
    return { chat_metadata: { integrity: 'keep', livingWorldGuide: { ...state, campaignPreparation: { ...preparation, archive: [{ retained: true }] } },
        taleFairyGenerationContext: { version: 1, entries: [packet, { ...packet, inputKey: 'two' }] },
        continuityMemory: { untouched: true }, custom: { nested: '$taleFairyPlan' } }, user_name: 'Player', character_name: 'Cast' };
}

function workspace(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tale-fairy-migration-'));
    // Only this disposable fixture root is removed, never real user storage.
    t.after(() => fs.rmSync(root, { recursive: true }));
    const dirs = { root, chats: path.join(root, 'chats'), groupChats: path.join(root, 'group chats'), groups: path.join(root, 'groups') };
    for (const dir of [dirs.chats, dirs.groupChats, dirs.groups]) fs.mkdirSync(dir);
    return dirs;
}

function writeChat(dirs, name, header = fixture(), body = '\n{"mes":"Unchanged body 🎶","custom":  3}\n') {
    const file = path.join(dirs.chats, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(header) + body);
    return file;
}

function header(file) { return JSON.parse(fs.readFileSync(file, 'utf8').split('\n')[0].replace(/^\uFEFF/u, '')); }

test('bulk converts unopened chats, preserves body bytes and all non-cache metadata, verifies backups and stops at zero', async t => {
    const dirs = workspace(t), source = fixture();
    const file = writeChat(dirs, 'Cast/old.jsonl', source);
    const original = fs.readFileSync(file);
    const clean = writeChat(dirs, 'unrelated.jsonl', { chat_metadata: { other: [1, 2, 3] } });
    const cleanStat = fs.statSync(clean).mtimeMs;
    const bom = path.join(dirs.groupChats, 'group.jsonl');
    fs.writeFileSync(bom, '\uFEFF' + JSON.stringify(source) + '\r\n{"mes":"Exact  body"}\r\n');
    const manager = createStorageMigrationManager();
    const job = manager.start(dirs);
    assert.equal(manager.start(dirs), job, 'multiple tabs join one server run');
    const result = await job.done;
    assert.equal(result.status, 'complete');
    assert.equal(result.remaining, 0);
    assert.equal(result.converted, 2);
    assert.equal(result.checked, 3);
    assert.equal(result.pass, 2, 'a separate full verification pass follows conversion');
    assert.equal(result.issues.length, 0);
    const saved = header(file);
    assert.equal(saved.chat_metadata.taleFairyGenerationContext.encoding, 'shared-plans-v1');
    const { taleFairyGenerationContext: _, ...rest } = saved.chat_metadata;
    const { taleFairyGenerationContext: before, ...expected } = source.chat_metadata;
    assert.deepEqual(rest, expected);
    assert.deepEqual(generationCachePackets(saved.chat_metadata.taleFairyGenerationContext), before.entries.map(compactGenerationPacket));
    assert.deepEqual(generationContextEntries(saved.chat_metadata.taleFairyGenerationContext), generationContextEntries(before));
    const migrated = fs.readFileSync(file);
    assert.deepEqual(migrated.subarray(migrated.indexOf(10)), original.subarray(original.indexOf(10)));
    assert.equal(fs.statSync(clean).mtimeMs, cleanStat);
    assert.ok(fs.readFileSync(bom, 'utf8').startsWith('\uFEFF'));
    assert.ok(fs.readFileSync(bom, 'utf8').endsWith('\r\n{"mes":"Exact  body"}\r\n'));
    const backup = result.files.find(item => item.file.endsWith('old.jsonl')).backup;
    assert.deepEqual(gunzipSync(fs.readFileSync(path.join(dirs.root, backup))), original);
    assert.ok(result.afterBytes < result.beforeBytes);
    assert.equal(manager.start(dirs).state, result);
    // Prove a fresh process does not traverse chat storage after completion.
    fs.writeFileSync(path.join(dirs.chats, 'not-yet-imported.jsonl'), '{invalid');
    const restored = await createStorageMigrationManager().start(dirs).done;
    assert.deepEqual(restored, result);
    assert.equal((await manager.start(dirs, { retry: true }).done).status, 'attention', 'only an explicit recheck resumes a completed scan');
});

test('legacy group current and past chat metadata are included without changing other settings', async t => {
    const dirs = workspace(t), source = fixture();
    const file = path.join(dirs.groups, 'legacy.json');
    fs.writeFileSync(file, JSON.stringify({ name: 'Group', chat_metadata: source.chat_metadata, past_metadata: { old: source.chat_metadata }, members: ['Cast.png'] }));
    const result = await createStorageMigrationManager().start(dirs).done;
    assert.equal(result.status, 'complete');
    const saved = JSON.parse(fs.readFileSync(file));
    assert.equal(saved.chat_metadata.taleFairyGenerationContext.encoding, 'shared-plans-v1');
    assert.equal(saved.past_metadata.old.taleFairyGenerationContext.encoding, 'shared-plans-v1');
    assert.deepEqual(saved.members, ['Cast.png']);
});

test('conversion replaces only cache spans, preserving raw metadata numbers, duplicate keys and formatting', async t => {
    const dirs = workspace(t), source = fixture();
    const oldCache = source.chat_metadata.taleFairyGenerationContext;
    const prefix = '\uFEFF{ "chat_metadata" : {"ignored":1}, "chat_metadata" : { "continuityMemory":{"number":90071992547409931234, "negative":-0, "text":"escaped \\\" key, } ["}, "taleFairyGenerationContext" : ';
    const suffix = ', "other": [  1, 2 ] }, "extra": true }\r\n{"mes":"Exact body"}';
    const file = path.join(dirs.chats, 'raw.jsonl');
    fs.writeFileSync(file, prefix + JSON.stringify(oldCache) + suffix);
    const result = await createStorageMigrationManager().start(dirs).done;
    assert.equal(result.status, 'complete');
    const packed = header(file).chat_metadata.taleFairyGenerationContext;
    assert.equal(fs.readFileSync(file, 'utf8'), prefix + JSON.stringify(packed) + suffix);
});

test('small, singleton, legacy and already-packed caches are not endlessly considered stale', async t => {
    const dirs = workspace(t);
    const tiny = { version: 1, entries: [{ version: 1, selection: {}, payload: '', plannerState: { plannerContract: 15, campaignPreparation: { tiny: true } } }] };
    writeChat(dirs, 'tiny.jsonl', { chat_metadata: { taleFairyGenerationContext: tiny } });
    const legacy = { version: 1, selection: {}, payload: '', plannerState: { plannerContract: 3 } };
    writeChat(dirs, 'legacy.jsonl', { chat_metadata: { taleFairyGenerationContext: legacy } });
    writeChat(dirs, 'packed.jsonl', { chat_metadata: { taleFairyGenerationContext: verifiedCompactCache(fixture().chat_metadata.taleFairyGenerationContext) } });
    const result = await createStorageMigrationManager().start(dirs).done;
    assert.equal(result.status, 'complete');
    assert.equal(result.converted, 0);
    assert.equal(result.pass, 1);
    assert.equal(result.remaining, 0);
});

test('unknown/damaged storage and malformed chat files stay untouched and cannot produce a complete receipt', async t => {
    const dirs = workspace(t);
    const unknown = fixture(); unknown.chat_metadata.taleFairyGenerationContext.encoding = 'future-format';
    const file = writeChat(dirs, 'unknown.jsonl', unknown), before = fs.readFileSync(file);
    const damaged = verifiedCompactCache(fixture().chat_metadata.taleFairyGenerationContext);
    damaged.entries[0].plannerState.campaignPreparation.$taleFairyPlan = 999;
    assert.throws(() => verifiedCompactCache(damaged), /Invalid retry references/);
    fs.writeFileSync(path.join(dirs.chats, 'malformed.jsonl'), '{broken\n{"mes":"retained"}');
    const manager = createStorageMigrationManager(), result = await manager.start(dirs).done;
    assert.equal(result.status, 'attention');
    assert.equal(result.issues.length, 2);
    assert.deepEqual(fs.readFileSync(file), before);
    assert.deepEqual(await createStorageMigrationManager().start(dirs).done, result, 'errors stop too; no infinite automatic retries');
});

test('changed files are never overwritten and repeated changes stop after bounded verification passes', async t => {
    const dirs = workspace(t), file = writeChat(dirs, 'busy.jsonl');
    let changes = 0;
    const result = await createStorageMigrationManager().start(dirs, { beforeConvert: () => {
        const latest = header(file); latest.chat_metadata.concurrentEdit = ++changes; writeChat(dirs, 'busy.jsonl', latest);
    } }).done;
    assert.equal(result.status, 'attention');
    assert.equal(result.remaining, 1);
    assert.equal(result.pass, 3);
    assert.equal(result.converted, 0);
    assert.equal(header(file).chat_metadata.concurrentEdit, changes);
    assert.equal(header(file).chat_metadata.taleFairyGenerationContext.encoding, undefined);
});

test('an invalid preexisting recovery backup blocks conversion without changing the chat', async t => {
    const dirs = workspace(t), file = writeChat(dirs, 'old.jsonl');
    const original = fs.readFileSync(file);
    const backups = path.join(dirs.root, 'tale-fairy/storage-migrations/shared-plans-v1/backups');
    fs.mkdirSync(backups, { recursive: true });
    const backup = path.join(backups, `${crypto.createHash('sha256').update(original).digest('hex')}.gz`);
    fs.writeFileSync(backup, 'invalid compressed backup');
    const result = await createStorageMigrationManager().start(dirs).done;
    assert.equal(result.status, 'attention');
    assert.equal(result.remaining, 1);
    assert.equal(result.converted, 0);
    assert.ok(result.issues.length > 0, 'conversion errors survive the final read-only pass');
    assert.deepEqual(fs.readFileSync(file), original);
    assert.equal(fs.readFileSync(backup, 'utf8'), 'invalid compressed backup');
    assert.equal(fs.readdirSync(path.dirname(file)).some(name => name.endsWith('.tmp')), false);
});

test('an older chat imported during verification cannot produce a zero-stale receipt', async t => {
    const dirs = workspace(t);
    writeChat(dirs, 'first.jsonl');
    const manager = createStorageMigrationManager();
    let scheduled = false;
    const job = manager.start(dirs, { beforeConvert: () => {
        if (scheduled) return;
        scheduled = true;
        setImmediate(function importDuringVerification() {
            if (job.state.pass < 2) return setImmediate(importDuringVerification);
            writeChat(dirs, 'imported.jsonl');
        });
    } });
    const result = await job.done;
    assert.equal(result.status, 'attention');
    assert.equal(result.pass, 3);
    assert.equal(result.remaining, 1);
    assert.equal(header(path.join(dirs.chats, 'imported.jsonl')).chat_metadata.taleFairyGenerationContext.encoding, undefined);
    const retried = await manager.start(dirs, { retry: true }).done;
    assert.equal(retried.status, 'complete');
    assert.equal(retried.remaining, 0);
});

test('invalid UTF-8 outside the retry cache is never normalized by conversion', async t => {
    const dirs = workspace(t), source = fixture();
    const original = Buffer.concat([Buffer.from('{"unrelated":"'), Buffer.from([0xFF]),
        Buffer.from('","chat_metadata":' + JSON.stringify(source.chat_metadata) + '}\n{"mes":"retained"}')]);
    const file = path.join(dirs.chats, 'invalid-utf8.jsonl');
    fs.writeFileSync(file, original);
    const result = await createStorageMigrationManager().start(dirs).done;
    assert.equal(result.status, 'attention');
    assert.equal(result.converted, 0);
    assert.deepEqual(fs.readFileSync(file), original);
    assert.match(result.issues[0].error, /Invalid UTF-8/);
});

test('an interrupted receipt resumes; completion reports only aggregates and future receipts remain untouched', async t => {
    const dirs = workspace(t), file = writeChat(dirs, 'old.jsonl');
    const manager = createStorageMigrationManager();
    const job = manager.start(dirs);
    const statusFile = path.join(dirs.root, 'tale-fairy/storage-migrations/shared-plans-v1/status.json');
    const initial = JSON.parse(fs.readFileSync(statusFile));
    assert.equal(initial.status, 'running');
    const first = await job.done;
    fs.writeFileSync(statusFile, JSON.stringify(initial));
    const resumed = await createStorageMigrationManager().start(dirs).done;
    assert.equal(resumed.status, 'complete');
    assert.equal(resumed.converted, 0);
    assert.equal(header(file).chat_metadata.taleFairyGenerationContext.encoding, 'shared-plans-v1');
    assert.equal(publicStorageMigration(first).files, undefined);
    assert.equal(publicStorageMigration(first).issueCount, 0);
});

test('user-root containment rejects external chat directories', t => {
    const dirs = workspace(t);
    assert.throws(() => createStorageMigrationManager().start({ ...dirs, chats: path.dirname(dirs.root) }), /escapes user/);
});

test('ST default relative authenticated directory maps resolve against the server cwd', async t => {
    const dirs = workspace(t), file = writeChat(dirs, 'mine.jsonl');
    const relative = Object.fromEntries(Object.entries(dirs).map(([key, value]) => [key, path.relative(process.cwd(), value)]));
    assert.equal(path.isAbsolute(relative.root), false);
    const result = await createStorageMigrationManager().start(relative).done;
    assert.equal(result.status, 'complete');
    assert.equal(header(file).chat_metadata.taleFairyGenerationContext.encoding, 'shared-plans-v1');
});

test('bulk endpoints use authenticated user paths and status GET never starts work', async t => {
    const dirs = workspace(t), other = workspace(t), routes = new Map();
    writeChat(dirs, 'mine.jsonl'); writeChat(other, 'other.jsonl');
    await init({ get: (p, fn) => routes.set(`GET ${p}`, fn), post: (p, fn) => routes.set(`POST ${p}`, fn), delete() {} });
    const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });
    const req = { user: { directories: dirs }, body: { directories: other, root: other.root } };
    const read = response(); routes.get('GET /storage-migration')(req, read);
    assert.equal(read.value.migration, null);
    const health = response(); routes.get('GET /health')(req, health);
    assert.equal(health.value.storageMaintenance, 1);
    const start = response(); routes.get('POST /storage-migration')(req, start);
    assert.equal(start.value.migration.status, 'running');
    let done;
    for (let count = 0; count < 100; count++) {
        const res = response(); routes.get('GET /storage-migration')(req, res); done = res.value.migration;
        if (done.status !== 'running') break;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(done.status, 'complete');
    const manual = response();
    routes.get('POST /storage-migration')({ ...req, body: { ...req.body, retry: true, maintenance: true } }, manual);
    assert.equal(manual.value.migration.maintenance, 1);
    for (let count = 0; count < 100; count++) {
        const res = response(); routes.get('GET /storage-migration')(req, res); done = res.value.migration;
        if (done.status !== 'running') break;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(done.guideCount, 1);
    assert.equal(done.findings['legacy-plan'], 1);
    assert.equal(header(path.join(other.chats, 'other.jsonl')).chat_metadata.taleFairyGenerationContext.encoding, undefined);
    const unauthorized = response(); routes.get('POST /storage-migration')({ body: { root: dirs.root } }, unauthorized);
    assert.equal(unauthorized.code, 500);
});

test('client stops polling immediately at zero-stale completion and joins simultaneous checks', async () => {
    const calls = [], changes = []; let sleeps = 0;
    const check = createStorageMigrationClient({ api: async (route, options) => {
        calls.push([route, options?.method || 'GET']);
        return { migration: calls.length === 1 ? { status: 'running' } : { status: 'complete', checked: 5, converted: 2, remaining: 0 } };
    }, sleep: async () => { sleeps++; }, onChange: value => changes.push(value) });
    const first = check(); assert.equal(check(), first);
    assert.equal((await first).remaining, 0);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls.map(item => item[1]), ['POST', 'GET']);
    assert.equal(sleeps, 1);
    assert.equal(changes.length, 2);
    assert.match(storageMigrationLabel(changes.at(-1)), /0 stale · stopped/);
});

test('completed receipt, attention and network failure do not arm another client timer', async () => {
    for (const status of ['complete', 'attention', 'network-error']) {
        let calls = 0, sleeps = 0;
        const check = createStorageMigrationClient({ api: async () => { calls++; if (status === 'network-error') throw Error('Offline'); return { migration: { status } }; },
            sleep: async () => { sleeps++; }, onChange() {} });
        await check();
        assert.equal(calls, 1); assert.equal(sleeps, 0);
    }
});

test('a stuck status endpoint cannot poll forever', async () => {
    let calls = 0, sleeps = 0, last;
    const check = createStorageMigrationClient({ api: async () => { calls++; return { migration: { status: 'running' } }; },
        sleep: async () => { sleeps++; }, onChange: value => { last = value; } });
    assert.equal(await check(), null);
    assert.equal(calls, 901);
    assert.equal(sleeps, 900);
    assert.equal(last.status, 'unavailable');
    assert.match(last.error, /server continues independently/);
});

test('explicit maintenance upgrades old state and packs retries with exact backups and a separate final audit', async t => {
    const dirs = workspace(t), source = fixture();
    source.chat_metadata.livingWorldGuide.version = 41;
    source.chat_metadata.livingWorldGuide.plannerContract = 14;
    source.chat_metadata.livingWorldGuide.beatDirective = { retired: true };
    const file = writeChat(dirs, 'legacy-state.jsonl', source), original = fs.readFileSync(file);
    const manager = createStorageMigrationManager();
    const result = await manager.start(dirs, { retry: true, maintenance: true }).done;
    assert.equal(result.maintenance, 1);
    assert.equal(result.pass, 2);
    assert.equal(result.remaining, 0);
    assert.equal(result.issues.length, 0);
    assert.deepEqual(result.repairs, { retryCaches: 1, stateUpgrades: 1 });
    assert.equal(result.guideCount, 1, 'normalization is not story regeneration');
    assert.equal(result.status, 'attention', 'content needing Guide cannot be reported all clean');
    assert.equal(result.findingCounts['legacy-state'], 1);
    assert.equal(result.findingCounts['legacy-plan'], 1);
    assert.equal(result.checks.metadata, 1, 'verification passes do not double count findings');
    const saved = header(file).chat_metadata;
    assert.equal(saved.livingWorldGuide.version, STATE_VERSION);
    assert.equal(saved.livingWorldGuide.plannerContract, 15);
    assert.equal(saved.livingWorldGuide.canonBootstrapPending, true);
    assert.equal(Object.hasOwn(saved.livingWorldGuide, 'beatDirective'), false);
    assert.deepEqual(saved.livingWorldGuide.campaignPreparation, source.chat_metadata.livingWorldGuide.campaignPreparation, 'live preparation and archive are never clipped');
    assert.deepEqual(saved.continuityMemory, source.chat_metadata.continuityMemory);
    assert.deepEqual(generationContextEntries(saved.taleFairyGenerationContext), generationContextEntries(source.chat_metadata.taleFairyGenerationContext));
    assert.deepEqual(gunzipSync(fs.readFileSync(path.join(dirs.root, result.files[0].backup))), original);
    const mtime = fs.statSync(file).mtimeMs;
    const statusFile = path.join(dirs.root, 'tale-fairy/storage-migrations/shared-plans-v1/status.json');
    const receiptTime = fs.statSync(statusFile).mtimeMs;
    assert.deepEqual(await createStorageMigrationManager().start(dirs).done, result, 'content attention stops on reopen too');
    assert.equal(fs.statSync(statusFile).mtimeMs, receiptTime);
    const again = await manager.start(dirs, { retry: true, maintenance: true }).done;
    assert.equal(again.converted, 0);
    assert.equal(again.pass, 1);
    assert.equal(fs.statSync(file).mtimeMs, mtime);
    assert.equal(again.guideCount, 1);
    const report = publicStorageMigration(result);
    assert.equal(report.findings['legacy-plan'], 1);
    assert.equal(JSON.stringify(report).includes('legacy-state.jsonl'), false);
    assert.equal(Object.hasOwn(report, 'files'), false);
});

test('maintenance is opt-in and an existing completed storage receipt does not trigger expanded work on startup', async t => {
    const dirs = workspace(t), source = fixture();
    source.chat_metadata.livingWorldGuide.version = 58;
    const file = writeChat(dirs, 'import.jsonl', source);
    const manager = createStorageMigrationManager();
    const old = await manager.start(dirs).done;
    assert.equal(old.status, 'complete');
    assert.equal(header(file).chat_metadata.livingWorldGuide.version, 58);
    assert.deepEqual(await createStorageMigrationManager().start(dirs).done, old);
    assert.equal(old.maintenance, undefined);
    const next = await manager.start(dirs, { retry: true, maintenance: true }).done;
    assert.equal(next.maintenance, 1);
    assert.equal(next.repairs.stateUpgrades, 1);
});

test('expanded maintenance covers legacy group current/past metadata and does not downgrade unsupported state', async t => {
    const dirs = workspace(t), source = fixture();
    source.chat_metadata.livingWorldGuide.version = 58;
    const future = structuredClone(source.chat_metadata);
    future.livingWorldGuide.version = 999;
    future.livingWorldGuide.plannerContract = 99;
    const file = path.join(dirs.groups, 'group.json');
    fs.writeFileSync(file, JSON.stringify({ chat_metadata: source.chat_metadata, past_metadata: { old: source.chat_metadata, future } }));
    const result = await createStorageMigrationManager().start(dirs, { maintenance: true }).done;
    assert.equal(result.remaining, 0);
    assert.equal(result.checks.metadata, 3);
    assert.equal(result.repairs.stateUpgrades, 2);
    assert.equal(result.repairs.retryCaches, 3);
    assert.equal(result.findingCounts['unsupported-state'], 1);
    const saved = JSON.parse(fs.readFileSync(file));
    assert.deepEqual(saved.past_metadata.future.livingWorldGuide, future.livingWorldGuide);
    assert.equal(saved.past_metadata.old.livingWorldGuide.version, STATE_VERSION);
});

test('state upgrades replace only Tale Fairy values, retaining raw unrelated headers and every message byte', async t => {
    const dirs = workspace(t), state = fixture().chat_metadata.livingWorldGuide;
    state.version = 58;
    const prefix = '\uFEFF{ "chat_metadata" : {"ignored":1}, "chat_metadata" : { "continuityMemory":{"number":90071992547409931234,"zero":-0}, "livingWorldGuide" : ';
    const suffix = ', "other": [  1, 2 ] }, "extra": true }\r\n{"mes":"Exact body"}\r\n';
    const file = path.join(dirs.chats, 'raw-state.jsonl');
    fs.writeFileSync(file, prefix + JSON.stringify(state) + suffix);
    const result = await createStorageMigrationManager().start(dirs, { maintenance: true }).done;
    assert.equal(result.repairs.stateUpgrades, 1);
    assert.equal(fs.readFileSync(file, 'utf8'), prefix + JSON.stringify(header(file).chat_metadata.livingWorldGuide) + suffix);
});

test('state migration retains raw live preparation/archive and unknown unchanged state values', async t => {
    const dirs = workspace(t), state = fixture().chat_metadata.livingWorldGuide;
    state.version = 58;
    const rawPlan = JSON.stringify(state.campaignPreparation).replace('"retained":true', '"retained":true,"large":90071992547409931234,"zero":-0');
    const rawState = JSON.stringify({ ...state, campaignPreparation: 'PLAN_SENTINEL' })
        .replace('"PLAN_SENTINEL"', rawPlan).replace(/}$/, ',"unknownExtra":{"n":90071992547409931234,"n":-0}}');
    const file = path.join(dirs.chats, 'raw-plan.jsonl');
    fs.writeFileSync(file, '{"chat_metadata":{"livingWorldGuide":' + rawState + '}}\n{"mes":"untouched"}');
    const result = await createStorageMigrationManager().start(dirs, { maintenance: true }).done;
    assert.equal(result.repairs.stateUpgrades, 1);
    const raw = fs.readFileSync(file, 'utf8');
    assert.ok(raw.includes('"campaignPreparation":' + rawPlan));
    assert.ok(raw.includes('"unknownExtra":{"n":90071992547409931234,"n":-0}'));
});

test('damaged retries block the whole file repair without losing original legacy state', async t => {
    const dirs = workspace(t), source = fixture();
    source.chat_metadata.livingWorldGuide.version = 58;
    source.chat_metadata.taleFairyGenerationContext.encoding = 'future-format';
    const file = writeChat(dirs, 'bad.jsonl', source), original = fs.readFileSync(file);
    const result = await createStorageMigrationManager().start(dirs, { maintenance: true }).done;
    assert.equal(result.status, 'attention');
    assert.equal(result.issues.length, 1);
    assert.equal(result.converted, 0);
    assert.deepEqual(fs.readFileSync(file), original);
});

test('interrupted explicit maintenance resumes its suite, while a running storage-only job cannot masquerade as maintenance', async t => {
    const dirs = workspace(t);
    writeChat(dirs, 'old.jsonl');
    const manager = createStorageMigrationManager();
    const old = manager.start(dirs);
    assert.throws(() => manager.start(dirs, { retry: true, maintenance: true }), /storage-only conversion is running/);
    await old.done;
    const result = await manager.start(dirs, { retry: true, maintenance: true }).done;
    const statusFile = path.join(dirs.root, 'tale-fairy/storage-migrations/shared-plans-v1/status.json');
    fs.writeFileSync(statusFile, JSON.stringify({ ...result, status: 'running', completedAt: null }));
    const resumed = await createStorageMigrationManager().start(dirs).done;
    assert.equal(resumed.maintenance, 1);
    assert.equal(resumed.checks.metadata, 1);
    assert.notEqual(resumed.status, 'running');
});

test('manual client sends expanded intent, refuses old server results and stops for content attention', async () => {
    let body, last, sleeps = 0;
    const check = createStorageMigrationClient({ api: async (_route, options) => {
        body = JSON.parse(options.body);
        return { migration: { maintenance: 1, status: 'attention', remaining: 0, guideCount: 2 } };
    }, sleep: async () => { sleeps++; }, onChange: state => { last = state; } });
    await check({ retry: true, maintenance: true });
    assert.deepEqual(body, { retry: true, maintenance: true });
    assert.equal(last.status, 'attention');
    assert.equal(sleeps, 0);
    assert.match(storageMigrationLabel(last), /0 safe repairs pending · 2 need Guide now/);
    const old = createStorageMigrationClient({ api: async () => ({ migration: { status: 'complete' } }), onChange: state => { last = state; } });
    assert.equal(await old({ retry: true, maintenance: true }), null);
    assert.equal(last.status, 'unavailable');
    assert.match(last.error, /did not run the expanded/);
});
