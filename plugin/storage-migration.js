import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { setImmediate as yieldIO } from 'node:timers/promises';
import { compactGenerationContextCache, compactGenerationPacket, generationCachePackets,
    generationContextEntries, GENERATION_CONTEXT_KEY } from '../extension/generation-context.js';
import { CHAT_MAINTENANCE_VERSION, upgradeChatMetadata, inspectChatMetadata } from '../extension/chat-maintenance.js';
import { STATE_KEY } from '../extension/state.js';

export const STORAGE_MIGRATION = 'shared-plans-v1';
const MAX_PASSES = 3;
const MAX_HEADER_BYTES = 128 * 1024 * 1024;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const fileStamp = file => {
    const stat = fs.statSync(file);
    return `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.ino}`;
};

// Compare every packet, including previously unauthenticated legacy retries.
// Authentication must neither improve nor regress as a side effect of packing.
export function verifiedCompactCache(cache) {
    if (cache == null) return cache;
    if (!record(cache)) throw Error('Invalid retry cache; original retained.');
    if (Object.hasOwn(cache, 'encoding') && cache.encoding !== STORAGE_MIGRATION) {
        throw Error('Unsupported retry encoding; original retained.');
    }
    const before = generationCachePackets(cache);
    if (before.some(item => !record(item))) throw Error('Invalid retry references; original retained.');
    const next = compactGenerationContextCache(cache);
    const expected = before.map(compactGenerationPacket);
    if (!isDeepStrictEqual(generationCachePackets(next), expected)
        || !isDeepStrictEqual(generationContextEntries(next), generationContextEntries(cache).map(compactGenerationPacket))) {
        throw Error('Retry round-trip verification failed; original retained.');
    }
    return next;
}

function compactMetadata(metadata, maintenance) {
    if (!record(metadata)) return metadata;
    let next = maintenance ? upgradeChatMetadata(metadata) : metadata;
    if (Object.hasOwn(metadata, GENERATION_CONTEXT_KEY)) {
        const cache = verifiedCompactCache(metadata[GENERATION_CONTEXT_KEY]);
        if (cache !== metadata[GENERATION_CONTEXT_KEY]) next = { ...next, [GENERATION_CONTEXT_KEY]: cache };
    }
    return next;
}

function compactHeader(header, legacyGroup, maintenance) {
    const metadata = compactMetadata(header.chat_metadata, maintenance);
    let next = metadata === header.chat_metadata ? header : { ...header, chat_metadata: metadata };
    if (legacyGroup && record(header.past_metadata)) {
        const past = Object.fromEntries(Object.entries(header.past_metadata).map(([key, value]) => [key, compactMetadata(value, maintenance)]));
        if (Object.keys(past).some(key => past[key] !== header.past_metadata[key])) next = { ...next, past_metadata: past };
    }
    return next;
}

function metadataRecords(header, legacyGroup) {
    return [['chat_metadata', header.chat_metadata], ...(legacyGroup && record(header.past_metadata)
        ? Object.entries(header.past_metadata).map(([key, value]) => [`past_metadata/${key}`, value]) : [])].filter(([, value]) => record(value));
}

function repairCounts(before, after, legacyGroup) {
    const old = new Map(metadataRecords(before, legacyGroup));
    const counts = { retryCaches: 0, stateUpgrades: 0 };
    for (const [key, metadata] of metadataRecords(after, legacyGroup)) {
        if (old.get(key)?.[GENERATION_CONTEXT_KEY] !== metadata[GENERATION_CONTEXT_KEY]) counts.retryCaches++;
        if (old.get(key)?.[STATE_KEY] !== metadata[STATE_KEY]) counts.stateUpgrades++;
    }
    return counts;
}

function inside(root, file) {
    const relative = path.relative(root, file);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw Error('Storage path escapes user directory.');
}

function safePath(root, file) {
    inside(root, file);
    let current = root;
    for (const component of ['', ...path.relative(root, file).split(path.sep).filter(Boolean)]) {
        if (component) current = path.join(current, component);
        try {
            if (fs.lstatSync(current).isSymbolicLink()) throw Error('Linked storage path was not followed.');
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
}

function locations(directories) {
    if (typeof directories?.root !== 'string' || !directories.root.trim()) throw Error('Authenticated user storage is unavailable.');
    // ST's authenticated directory map may be relative to its server cwd when
    // dataRoot is the default ./data. Request bodies never reach this function.
    const root = path.resolve(directories.root);
    safePath(root, root);
    if (!fs.statSync(root).isDirectory()) throw Error('Authenticated user storage is not a directory.');
    const roots = [['chats', directories.chats || path.join(root, 'chats')],
        ['groupChats', directories.groupChats || path.join(root, 'group chats')],
        ['groups', directories.groups || path.join(root, 'groups')]]
        .map(([kind, directory]) => ({ kind, directory: path.resolve(directory) }));
    for (const { directory } of roots) { inside(root, directory); safePath(root, directory); }
    const state = path.join(root, 'tale-fairy', 'storage-migrations', STORAGE_MIGRATION);
    safePath(root, state);
    // A completion receipt only applies to exactly this user and these roots.
    const scope = hash(JSON.stringify(roots));
    return { root, roots, state, scope, receipt: path.join(state, 'status.json') };
}

function atomicWrite(file, bytes, expected) {
    const temporary = `${file}.tf-${crypto.randomUUID()}.tmp`;
    let created = false;
    try {
        const fd = fs.openSync(temporary, 'wx');
        created = true;
        try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        if (expected && !fs.readFileSync(file).equals(expected)) throw Error('Chat changed during migration; original retained.');
        fs.renameSync(temporary, file);
        created = false;
        if (!fs.readFileSync(file).equals(Buffer.from(bytes))) throw Error('Saved-file verification failed; recovery backup retained.');
    } finally {
        if (created) fs.unlinkSync(temporary);
    }
}

function readHeader(file, legacyGroup) {
    if (legacyGroup) return { header: JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/u, '')) };
    const fd = fs.openSync(file, 'r');
    const chunks = [];
    let length = 0;
    try {
        while (length <= MAX_HEADER_BYTES) {
            const buffer = Buffer.alloc(64 * 1024);
            const size = fs.readSync(fd, buffer, 0, buffer.length, null);
            if (!size) break;
            const end = buffer.subarray(0, size).indexOf(10);
            const part = buffer.subarray(0, end < 0 ? size : end);
            chunks.push(part); length += part.length;
            if (end >= 0) break;
        }
        if (length > MAX_HEADER_BYTES) throw Error('Chat header exceeds safe migration size; original retained.');
        const line = Buffer.concat(chunks);
        return { line, header: JSON.parse(line.toString('utf8').replace(/^\uFEFF/u, '')) };
    } finally { fs.closeSync(fd); }
}

function inventory(config) {
    const files = [], issues = [];
    function walk(directory, legacyGroup) {
        try {
            safePath(config.root, directory);
            if (!fs.existsSync(directory)) return;
            for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
                const file = path.join(directory, entry.name);
                if (entry.isSymbolicLink()) { issues.push({ file: path.relative(config.root, file), error: 'Linked storage path was not followed.' }); continue; }
                if (entry.isDirectory()) walk(file, legacyGroup);
                else if (entry.isFile() && path.extname(file).toLowerCase() === (legacyGroup ? '.json' : '.jsonl')) files.push({ file, legacyGroup });
            }
        } catch (error) { issues.push({ file: path.relative(config.root, directory), error: error.message }); }
    }
    for (const { kind, directory } of config.roots) walk(directory, kind === 'groups');
    return { files, issues };
}

// Locate values in already-validated JSON without reserializing unrelated
// metadata (including whitespace, -0 and integers beyond JS's safe range).
function skipSpace(text, start) {
    while (/\s/u.test(text[start] || '') && start < text.length) start++;
    return start;
}

function stringEnd(text, start) {
    for (let index = start + 1; index < text.length; index++) {
        if (text[index] === '\\') index++;
        else if (text[index] === '"') return index + 1;
    }
    throw Error('Invalid JSON string; original retained.');
}

function valueEnd(text, start) {
    if (text[start] === '"') return stringEnd(text, start);
    if (!['{', '['].includes(text[start])) {
        let end = start;
        while (end < text.length && !/[\s,}\]]/u.test(text[end])) end++;
        return end;
    }
    let depth = 0;
    for (let index = start; index < text.length; index++) {
        if (text[index] === '"') index = stringEnd(text, index) - 1;
        else if (text[index] === '{' || text[index] === '[') depth++;
        else if ((text[index] === '}' || text[index] === ']') && --depth === 0) return index + 1;
    }
    throw Error('Invalid JSON value; original retained.');
}

function propertySpan(text, start, key) {
    if (text[start] !== '{') throw Error('Invalid metadata object; original retained.');
    let index = skipSpace(text, start + 1), found;
    while (text[index] !== '}') {
        const end = stringEnd(text, index);
        const name = JSON.parse(text.slice(index, end));
        const valueStart = skipSpace(text, skipSpace(text, end) + 1);
        const valueStop = valueEnd(text, valueStart);
        if (name === key) found = { start: valueStart, end: valueStop };
        index = skipSpace(text, valueStop);
        if (text[index] === ',') index = skipSpace(text, index + 1);
    }
    if (!found) throw Error('Tale Fairy metadata field could not be located; original retained.');
    return found;
}

function replaceMetadataValues(text, before, after, legacyGroup) {
    const replacements = [];
    function replace(keys, value, previous) {
        let span = { start: skipSpace(text, 0) };
        for (const key of keys) span = propertySpan(text, span.start, key);
        let serialized = JSON.stringify(value);
        if (keys.at(-1) === STATE_KEY && record(previous) && record(value)) {
            // The normalizer clones the live preparation/archive. Preserve its
            // exact raw JSON, and every other unchanged root value, rather than
            // rounding historical numeric literals through JSON.stringify.
            const retained = [];
            for (const key of Object.keys(value)) if (Object.hasOwn(previous, key) && isDeepStrictEqual(previous[key], value[key])) {
                const old = propertySpan(text, span.start, key), next = propertySpan(serialized, 0, key);
                retained.push({ ...next, value: text.slice(old.start, old.end) });
            }
            for (const part of retained.sort((a, b) => b.start - a.start)) serialized = serialized.slice(0, part.start) + part.value + serialized.slice(part.end);
        }
        replacements.push({ ...span, value: serialized });
    }
    function replaceMetadata(keys, old, next) {
        if (old === next) return;
        for (const key of [GENERATION_CONTEXT_KEY, STATE_KEY]) if (old[key] !== next[key]) replace([...keys, key], next[key], old[key]);
    }
    replaceMetadata(['chat_metadata'], before.chat_metadata, after.chat_metadata);
    if (legacyGroup && before.past_metadata !== after.past_metadata) {
        for (const key of Object.keys(after.past_metadata)) {
            replaceMetadata(['past_metadata', key], before.past_metadata[key], after.past_metadata[key]);
        }
    }
    for (const span of replacements.sort((a, b) => b.start - a.start)) text = text.slice(0, span.start) + span.value + text.slice(span.end);
    if (!isDeepStrictEqual(JSON.parse(text.replace(/^\uFEFF/u, '')), after)) throw Error('Metadata preservation verification failed; original retained.');
    return Buffer.from(text);
}

function convertFile(config, item, observed, nextHeader) {
    // No awaits in this critical section: normal ST saves run on this same
    // server event loop. Re-read before replacing and preserve every body byte.
    safePath(config.root, item.file);
    const original = fs.readFileSync(item.file);
    let next;
    if (item.legacyGroup) {
        if (!Buffer.from(original.toString('utf8')).equals(original)) throw Error('Invalid UTF-8 metadata; original retained.');
        if (!isDeepStrictEqual(JSON.parse(original.toString('utf8').replace(/^\uFEFF/u, '')), observed.header)) throw Error('Group changed during migration; original retained.');
        next = replaceMetadataValues(original.toString('utf8'), observed.header, nextHeader, true);
    } else {
        const end = original.indexOf(10);
        const line = end < 0 ? original : original.subarray(0, end);
        if (!Buffer.from(line.toString('utf8')).equals(line)) throw Error('Invalid UTF-8 metadata; original retained.');
        if (!line.equals(observed.line)) throw Error('Chat changed during migration; original retained.');
        next = Buffer.concat([replaceMetadataValues(line.toString('utf8'), observed.header, nextHeader, false),
            end < 0 ? Buffer.alloc(0) : original.subarray(end)]);
    }
    // A recoverable exact original, compressed so backups do not duplicate the
    // bloat we are removing. Reused on interrupted/repeated runs; never pruned.
    const backupDirectory = path.join(config.state, 'backups');
    safePath(config.root, backupDirectory);
    fs.mkdirSync(backupDirectory, { recursive: true });
    const backup = path.join(backupDirectory, `${hash(original)}.gz`);
    safePath(config.root, backup);
    if (!fs.existsSync(backup)) atomicWrite(backup, gzipSync(original));
    if (!gunzipSync(fs.readFileSync(backup)).equals(original)) throw Error('Recovery backup verification failed; original retained.');
    atomicWrite(item.file, next, original);
    return { beforeBytes: original.length, afterBytes: next.length, backup: path.relative(config.root, backup) };
}

function saveStatus(config, status) {
    safePath(config.root, config.state);
    fs.mkdirSync(config.state, { recursive: true });
    safePath(config.root, config.receipt);
    atomicWrite(config.receipt, JSON.stringify(status, null, 2));
}

function savedStatus(config) {
    safePath(config.root, config.receipt);
    if (!fs.existsSync(config.receipt)) return null;
    const value = JSON.parse(fs.readFileSync(config.receipt, 'utf8'));
    return value.migration === STORAGE_MIGRATION && value.scope === config.scope ? value : null;
}

export function publicStorageMigration(status) {
    if (!status) return null;
    const { migration, status: state, startedAt, completedAt, pass, checked, converted, remaining, beforeBytes, afterBytes } = status;
    return { migration, status: state, startedAt, completedAt, pass, checked, converted, remaining, beforeBytes, afterBytes,
        issueCount: status.issues?.length || 0, ...(status.maintenance ? { maintenance: status.maintenance, repairs: status.repairs,
            checks: status.checks, guideCount: status.guideCount, reviewCount: status.reviewCount, findings: status.findingCounts } : {}) };
}

export function createStorageMigrationManager() {
    const jobs = new Map();
    return {
        status(directories) {
            const config = locations(directories);
            return jobs.get(config.scope)?.state || savedStatus(config);
        },
        start(directories, { retry = false, maintenance = false, beforeConvert } = {}) {
            const config = locations(directories);
            const running = jobs.get(config.scope);
            if (running?.state.status === 'running') {
                if (maintenance && !running.state.maintenance) throw Error('A storage-only conversion is running. Wait for it to finish, then scan, repair & compress again.');
                return running;
            }
            const saved = running?.state || savedStatus(config);
            if (!retry && ['complete', 'attention'].includes(saved?.status)) return { state: saved, done: Promise.resolve(saved) };
            // Resume an interrupted explicit maintenance run, but never expand
            // a completed old receipt into an unsolicited startup sweep.
            maintenance ||= saved?.status === 'running' && saved.maintenance === CHAT_MAINTENANCE_VERSION;
            const state = { migration: STORAGE_MIGRATION, scope: config.scope, status: 'running', startedAt: new Date().toISOString(),
                completedAt: null, pass: 0, checked: 0, converted: 0, remaining: null, beforeBytes: 0, afterBytes: 0, issues: [], files: [] };
            if (maintenance) Object.assign(state, { maintenance: CHAT_MAINTENANCE_VERSION, repairs: { retryCaches: 0, stateUpgrades: 0 },
                checks: {}, guideCount: 0, reviewCount: 0, findingCounts: {}, findings: [] });
            const job = { state, done: null };
            jobs.set(config.scope, job);
            job.done = (async () => {
                const fileIssues = new Map();
                try {
                    saveStatus(config, state);
                    for (let pass = 1; pass <= MAX_PASSES; pass++) {
                        state.pass = pass;
                        const scan = inventory(config);
                        const stamps = new Map(), present = new Set(scan.files.map(item => item.file));
                        for (const file of fileIssues.keys()) if (!present.has(file)) fileIssues.delete(file);
                        state.checked = 0; state.remaining = 0; state.issues = [...scan.issues, ...fileIssues.values()];
                        if (maintenance) Object.assign(state, { checks: {}, guideCount: 0, reviewCount: 0, findingCounts: {}, findings: [] });
                        for (const item of scan.files) {
                            await yieldIO();
                            state.checked++;
                            try {
                                safePath(config.root, item.file);
                                stamps.set(item.file, fileStamp(item.file));
                                const observed = readHeader(item.file, item.legacyGroup);
                                const next = compactHeader(observed.header, item.legacyGroup, maintenance);
                                if (maintenance) for (const [location, metadata] of metadataRecords(observed.header, item.legacyGroup)) {
                                    const report = inspectChatMetadata(metadata);
                                    for (const [key, count] of Object.entries(report.checks)) state.checks[key] = (state.checks[key] || 0) + count;
                                    state.guideCount += Number(report.needsGuide);
                                    state.reviewCount += Number(report.needsReview);
                                    for (const finding of report.findings) {
                                        state.findingCounts[finding.code] = (state.findingCounts[finding.code] || 0) + finding.count;
                                        state.findings.push({ file: path.relative(config.root, item.file), location, ...finding });
                                    }
                                }
                                if (next === observed.header) { fileIssues.delete(item.file); continue; }
                                state.remaining++;
                                if (pass === MAX_PASSES) {
                                    if (!fileIssues.has(item.file)) fileIssues.set(item.file, { file: path.relative(config.root, item.file),
                                        error: 'Storage still needs conversion after bounded passes; original retained.' });
                                    continue;
                                }
                                await beforeConvert?.(item.file);
                                const sizes = convertFile(config, item, observed, next);
                                stamps.set(item.file, fileStamp(item.file));
                                fileIssues.delete(item.file);
                                state.converted++;
                                state.beforeBytes += sizes.beforeBytes;
                                state.afterBytes += sizes.afterBytes;
                                state.files.push({ file: path.relative(config.root, item.file), ...sizes });
                                if (maintenance) {
                                    const repairs = repairCounts(observed.header, next, item.legacyGroup);
                                    for (const [key, count] of Object.entries(repairs)) state.repairs[key] += count;
                                }
                            } catch (error) { fileIssues.set(item.file, { file: path.relative(config.root, item.file), error: error.message }); }
                            finally { state.issues = [...scan.issues, ...fileIssues.values()]; }
                        }
                        // Imports or saves during the pass require another full
                        // verification; a snapshot inventory alone is not proof.
                        const latest = inventory(config);
                        state.issues.push(...latest.issues.filter(issue => !state.issues.some(old => old.file === issue.file && old.error === issue.error)));
                        const changed = latest.files.length !== scan.files.length || latest.files.some(item => {
                            try { safePath(config.root, item.file); return stamps.get(item.file) !== fileStamp(item.file); }
                            catch { return true; }
                        });
                        if (changed) {
                            state.remaining = Math.max(1, state.remaining);
                            if (pass === MAX_PASSES) state.issues.push({ error: 'Storage changed during verification; use Scan, repair & compress to retry.' });
                        }
                        saveStatus(config, state);
                        // A fresh, full read-only pass must find no remaining
                        // conversions. Terminal receipts prevent startup loops.
                        if (!state.remaining) break;
                    }
                    state.status = !state.remaining && !state.issues.length && !state.guideCount && !state.reviewCount ? 'complete' : 'attention';
                } catch (error) {
                    state.status = 'attention';
                    state.issues.push({ error: error.message });
                }
                state.completedAt = new Date().toISOString();
                try { saveStatus(config, state); }
                catch (error) { state.status = 'attention'; state.issues.push({ error: `Completion receipt could not be saved: ${error.message}` }); }
                return state;
            })();
            return job;
        },
    };
}
