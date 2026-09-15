import { normalizePreparedWorld, validatePrepared } from './prepared-world.js?v=0.14.17';

const boundaries = ['engine', 'entry', 'hold', 'invalidates', 'intervention', 'knowledge'];
const recordBytes = value => new TextEncoder().encode(JSON.stringify(value)).length;

// Consolidation is explicit, never an age-based deletion. Only unfocused,
// already dormant proposals are eligible; live commitments remain individual.
export function stageNotebookCompactions(board, requests, previous = board) {
    if (!Array.isArray(requests) || !requests.length) return board;
    const used = new Set();
    const staged = [];
    for (const request of requests) {
        const ids = request?.ids;
        if (!Array.isArray(ids) || ids.length < 2 || ids.length > 12 || new Set(ids).size !== ids.length
            || ids.some(id => typeof id !== 'string' || used.has(id) || board.focus.includes(id) || previous.focus.includes(id))) continue;
        const records = ids.map(id => board.items.find(item => item.id === id));
        if (records.some(item => !item || item.status !== 'dormant' || item.origin !== 'invented'
            || JSON.stringify(item) !== JSON.stringify(previous.items.find(prior => prior.id === item.id)))) continue;
        if (!request.replacement || typeof request.replacement !== 'object' || Array.isArray(request.replacement)
            || Object.values(request.replacement).some(value => typeof value !== 'string')) continue;
        const replacement = { ...Object.fromEntries(boundaries.map(key => [key, ''])), future: '',
            ...request.replacement, status: 'dormant', origin: 'invented' };
        if (typeof replacement.id !== 'string' || (board.items.some(item => item.id === replacement.id) && !ids.includes(replacement.id))
            || used.has(replacement.id)) continue;
        // Preserve exact prerequisites and knowledge boundaries beside the
        // model-written summary. If they cannot fit, retain individual records.
        for (const key of boundaries) replacement[key] = [...new Set(records.map(item => item[key]).filter(Boolean))].join('\n') || replacement[key];
        if (validatePrepared({ overview: '', updates: [replacement], focus: [] }).length
            || recordBytes(replacement) >= records.reduce((sum, item) => sum + recordBytes(item), 0)) continue;
        staged.push({ records: structuredClone(records), replacement });
        ids.forEach(id => used.add(id));
        used.add(replacement.id);
    }
    return staged.length ? { ...board, compactions: staged } : board;
}

export async function finalizeNotebookCompactions(value, writeArchive) {
    const board = normalizePreparedWorld(value);
    const pending = board.compactions || [];
    delete board.compactions;
    if (!pending.length) return board;
    // Revalidate after source stamping/normalization and before archive I/O.
    if (pending.some(item => !item || !Array.isArray(item.records) || item.records.some(record => !record || typeof record.id !== 'string'))) return board;
    const checked = stageNotebookCompactions(board, pending.map(item => ({ ids: item.records.map(record => record.id), replacement: item.replacement })));
    if (checked.compactions?.length !== pending.length
        || pending.some(item => item.records.some(record => JSON.stringify(normalizePreparedWorld({ items: [record] }).items[0]) !== JSON.stringify(board.items.find(current => current.id === record.id))))) return board;
    const compacted = { ...board, items: [...board.items], archives: [...(board.archives || [])] };
    try {
        for (const item of checked.compactions) {
            const payload = { version: 1, source: board.source, records: item.records, replacement: item.replacement };
            const receipt = await writeArchive(payload);
            if (!receipt || !/^tale-fairy-archive-[a-f0-9]{64}\.json$/.test(receipt.file)
                || receipt.hash !== receipt.file.slice(19, -5)) throw new Error('Archive verification failed.');
            const ids = new Set(item.records.map(record => record.id));
            compacted.items = compacted.items.filter(record => !ids.has(record.id));
            compacted.items.push(item.replacement);
            if (!compacted.archives.some(archive => archive.file === receipt.file)) compacted.archives.push({
                file: receipt.file, hash: receipt.hash, count: item.records.length, replacementId: item.replacement.id,
            });
        }
        delete compacted.compactionError;
        return compacted;
    } catch (error) {
        // An orphaned immutable archive is harmless. Never save a half-applied
        // consolidation or remove detail when the archive could not be verified.
        return { ...board, compactionError: String(error.message || error).slice(0, 300) };
    }
}

export async function writeNotebookArchive(payload, { fetchFn = globalThis.fetch, headers = {}, hashFn } = {}) {
    const text = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(text);
    const hash = hashFn ? await hashFn(bytes) : [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid notebook archive hash.');
    const file = `tale-fairy-archive-${hash}.json`;
    const url = `/user/files/${file}`;
    const existing = await fetchFn(url, { cache: 'no-store' });
    if (existing.ok) {
        if (await existing.text() !== text) throw new Error('Existing notebook archive failed verification.');
        return { file, hash };
    }
    if (existing.status !== 404) throw new Error(`Could not read notebook archive (${existing.status}).`);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    const saved = await fetchFn('/api/files/upload', { method: 'POST', headers,
        body: JSON.stringify({ name: file, data: btoa(binary) }) });
    if (!saved.ok) throw new Error(`Could not save notebook archive (${saved.status}).`);
    const verified = await fetchFn(url, { cache: 'no-store' });
    if (!verified.ok || await verified.text() !== text) throw new Error('Notebook archive did not pass read-back verification.');
    return { file, hash };
}
