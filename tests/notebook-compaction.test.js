import test from 'node:test';
import assert from 'node:assert/strict';
import { stageNotebookCompactions, finalizeNotebookCompactions, writeNotebookArchive } from '../extension/notebook-compaction.js';
import { normalizePreparedWorld, preparedWorldForPrompt } from '../extension/prepared-world.js';
import { mergeWorldPlan } from '../extension/world-planner.js';
import { defaultState, normalizeState, fingerprintMessages } from '../extension/state.js';
import { generationHarness } from './helpers/generation-harness.js';

const record = id => ({ id, status: 'dormant', origin: 'invented', premise: 'A dormant trade proposal. '.repeat(12), middle: 'Negotiate transport and test local cooperation. '.repeat(10), knowledge: 'The harvest is unknown.', hold: 'Requires travel to the district.' });
const board = () => normalizePreparedWorld({ items: [record('a'), record('b')], focus: [] });
const request = (ids = ['a', 'b'], id = 'a') => ({ ids, replacement: { id, premise: 'District trade possibilities.', middle: 'Negotiate transport or trial local cooperation.' } });
function archiveServer() {
    const files = new Map();
    let uploads = 0;
    const fetchFn = async (url, options = {}) => {
        if (url === '/api/files/upload') {
            const { name, data } = JSON.parse(options.body);
            uploads++;
            files.set(`/user/files/${name}`, Buffer.from(data, 'base64').toString('utf8'));
            return Response.json({ path: `user/files/${name}` });
        }
        return new Response(files.get(url) || '', { status: files.has(url) ? 200 : 404 });
    };
    return { files, fetchFn, uploads: () => uploads, write: payload => writeNotebookArchive(payload, { fetchFn }) };
}

test('planner consolidation archives exact originals before reducing active stored records', async () => {
    const original = board();
    const staged = mergeWorldPlan(original, { contract_version: 14, prepared: { updates: [], focus: [], consolidations: [request()] } });
    assert.deepEqual(staged.items, original.items);
    assert.equal(staged.compactions.length, 1);
    const server = archiveServer();
    const compacted = await finalizeNotebookCompactions(staged, server.write);
    assert.equal(compacted.items.length, 1);
    assert.ok(JSON.stringify(compacted).length < JSON.stringify(original).length);
    assert.equal(compacted.items[0].knowledge, original.items[0].knowledge);
    assert.equal(compacted.items[0].hold, original.items[0].hold);
    const archived = JSON.parse([...server.files.values()][0]);
    assert.deepEqual(archived.records, original.items);
    assert.equal(compacted.archives.length, 1);
    assert.equal(compacted.compactions, undefined);
    const reloaded = normalizeState(JSON.parse(JSON.stringify({ ...defaultState(), preparedWorld: compacted }))).preparedWorld;
    assert.deepEqual(reloaded.archives, compacted.archives);
    assert.equal(reloaded.items.length, 1);
    assert.equal(preparedWorldForPrompt(compacted).archives, undefined);
    await server.write(archived);
    assert.equal(server.uploads(), 1, 'identical archives are reused');
    // The summary itself can participate in the next rolling consolidation.
    reloaded.items.push(...normalizePreparedWorld({ items: [record('c')] }).items);
    const rolled = await finalizeNotebookCompactions(stageNotebookCompactions(reloaded, [request(['a', 'c'])]), server.write);
    assert.equal(rolled.items.length, 1);
    assert.equal(rolled.archives.length, 2);
});

test('failed or corrupted archive verification retains every active original', async () => {
    for (const writer of [async () => { throw new Error('disk full'); }, async () => ({ file: 'invalid' }),
        payload => writeNotebookArchive(payload, { fetchFn: async () => new Response('corrupt', { status: 200 }) })]) {
        const original = board();
        const result = await finalizeNotebookCompactions(stageNotebookCompactions(original, [request()]), writer);
        assert.deepEqual(result.items, original.items);
        assert.ok(result.compactionError);
        assert.equal(result.compactions, undefined);
    }
    let reads = 0;
    const original = board();
    const result = await finalizeNotebookCompactions(stageNotebookCompactions(original, [request()]), payload => writeNotebookArchive(payload, {
        fetchFn: async url => url === '/api/files/upload' ? Response.json({}) : new Response(++reads === 1 ? '' : 'corrupt', { status: reads === 1 ? 404 : 200 }),
    }));
    assert.deepEqual(result.items, original.items);
    assert.match(result.compactionError, /read-back/);
});

test('active, focused, changed, malformed and conflicting proposals cannot consolidate', () => {
    for (const mutate of [b => { b.items[0].status = 'active'; }, b => { b.focus = ['a']; }]) {
        const b = board(); mutate(b);
        assert.equal(stageNotebookCompactions(b, [request()]).compactions, undefined);
    }
    const prior = board(), changed = board(); changed.items[0].middle = 'Changed';
    assert.equal(stageNotebookCompactions(changed, [request()], prior).compactions, undefined);
    for (const r of [request(['a', 'missing']), request(['a', 'a']), { ...request(), replacement: { ...request().replacement, knowledge: {} } }]) {
        assert.equal(stageNotebookCompactions(board(), [r]).compactions, undefined);
    }
    const b = board(); b.items.push(record('c'));
    assert.equal(stageNotebookCompactions(b, [request(['a', 'b'], 'c')]).compactions, undefined);
});

test('multiple consolidations are all-or-none when a later archive fails', async () => {
    const original = normalizePreparedWorld({ items: ['a', 'b', 'c', 'd'].map(record) });
    const server = archiveServer(); let writes = 0;
    const result = await finalizeNotebookCompactions(stageNotebookCompactions(original, [request(), request(['c', 'd'], 'c')]), async payload => {
        if (++writes === 2) throw new Error('disk full');
        return server.write(payload);
    });
    assert.deepEqual(result.items, original.items);
    assert.equal(server.files.size, 1, 'an orphaned archive is safe');
});

test('persist rechecks chat edits after archive I/O before replacing metadata', async () => {
    const messages = [{ is_user: true, mes: 'We discuss trade.' }];
    const h = generationHarness(messages);
    const incoming = { ...h.state(), preparedWorld: stageNotebookCompactions(board(), [request()]) };
    const before = JSON.stringify(h.context.chatMetadata);
    const server = archiveServer();
    h.scope.writeNotebookArchive = async payload => { const receipt = await server.write(payload); h.context.chat[0].mes = 'Edited'; return receipt; };
    await assert.rejects(h.scope.persist(incoming, { chatId: 'story', messageCount: 1, fingerprint: fingerprintMessages(messages) }), /chat changed/);
    assert.equal(JSON.stringify(h.context.chatMetadata), before);
});

test('persist retains a newer planner result that arrives during archive I/O', async () => {
    const messages = [{ is_user: true, mes: 'We discuss trade.' }];
    const h = generationHarness(messages);
    const incoming = { ...h.state(), preparedWorld: stageNotebookCompactions(board(), [request()]) };
    const server = archiveServer();
    const newer = { ...h.state(), preparedWorld: normalizePreparedWorld({ items: [record('newer')], source: { startedAt: 200 } }) };
    h.scope.writeNotebookArchive = async payload => { const receipt = await server.write(payload); h.context.chatMetadata = h.scope.saveState(h.context.chatMetadata, newer); return receipt; };
    const result = await h.scope.persist(incoming, { chatId: 'story', messageCount: 1, fingerprint: fingerprintMessages(messages), startedAt: 100 });
    assert.equal(result.preparedWorld.items[0].id, 'newer');
    assert.equal(h.state().preparedWorld.items[0].id, 'newer');
});

test('consolidation preserves exact existing boundaries when the model proposes contradictory replacements', async () => {
    const original = board();
    const r = request(); r.replacement.knowledge = 'The harvest is known.'; r.replacement.hold = 'No travel required.';
    const server = archiveServer();
    const result = await finalizeNotebookCompactions(stageNotebookCompactions(original, [r]), server.write);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].knowledge, 'The harvest is unknown.');
    assert.equal(result.items[0].hold, 'Requires travel to the district.');
});
