import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { sha256 } from '../extension/sha256.js';

const oracle = input => createHash('sha256').update(input).digest('hex');

test('SHA-256 matches known vectors', () => {
    for (const [input, expected] of [
        ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
        ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
        ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
            '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
        ['a'.repeat(1_000_000), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'],
    ]) {
        assert.equal(sha256(input), expected);
    }
});

test('SHA-256 preserves UTF-8 story fingerprints', () => {
    for (const input of [
        'Tale Fairy', '故事 🧚 🌌', 'Cafe\u0301 and Café', '\0\0story\0',
        JSON.stringify({ chapter: '冬天 ❄️', actors: ['Alice', '林'], notes: 'Next scene\nA quiet evening.' }),
    ]) {
        const result = sha256(input);
        assert.equal(typeof result, 'string', 'fingerprints remain synchronous');
        assert.match(result, /^[a-f0-9]{64}$/u);
        assert.equal(result, oracle(input));
        assert.equal(sha256(new TextEncoder().encode(input)), result);
    }
});

test('SHA-256 handles padding boundaries and binary archives without changing their bytes', () => {
    let seed = 0x12345678;
    for (const length of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 255, 256, 1024, 4097]) {
        const data = new Uint8Array(length + 10);
        for (let i = 0; i < data.length; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            data[i] = seed >>> 24;
        }
        const original = data.slice();
        const input = data.subarray(5, 5 + length);
        assert.equal(sha256(input), oracle(input), `length ${length}`);
        assert.deepEqual(data, original);
    }
    const everyByte = Uint8Array.from({ length: 256 }, (_, i) => i);
    assert.equal(sha256(everyByte), oracle(everyByte));
});

test('SHA-256 works without host libraries, Node APIs, or secure-context Web Crypto', async () => {
    const source = await readFile(new URL('../extension/sha256.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /^import\s/mu);
    const sandbox = { TextEncoder, Uint8Array };
    vm.runInNewContext(source.replace('export function sha256', 'function sha256'), sandbox);
    assert.equal(sandbox.crypto, undefined);
    assert.equal(sandbox.sha256('abc'), sha256('abc'));
    assert.equal(vm.runInNewContext('sha256(new Uint8Array([0, 1, 255]))', sandbox), oracle(new Uint8Array([0, 1, 255])));
});

test('SHA-256 rejects unsupported input instead of creating misleading fingerprints', () => {
    for (const input of [undefined, null, 3, {}, [1, 2, 3]]) {
        assert.throws(() => sha256(input), TypeError);
    }
});
