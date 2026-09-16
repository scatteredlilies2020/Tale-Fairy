import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('ST bootstrap retains complete card authority on routine and broad passes', () => {
    const source = fs.readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
    const fn = source.match(/^function bootstrapContext\([^]*?^}/m)?.[0];
    assert.ok(fn);
    const tail = 'The journey includes dungeons; every spell must have a name.';
    const fields = Object.fromEntries(['description', 'personality', 'scenario', 'persona', 'system']
        .map(key => [key, `${key}: ${'Source detail. '.repeat(300)}${tail}`]));
    const context = { chatMetadata: { scenario: 'Author scenario. '.repeat(300) + tail, note_prompt: 'Author note.' } };
    const scope = { getCharacterCardFields: () => fields };
    vm.createContext(scope);
    vm.runInContext(fn, scope);
    const before = structuredClone({ fields, context });
    for (const broad of [false, true]) {
        const result = scope.bootstrapContext(context, { broad });
        for (const key of ['description', 'personality', 'persona']) assert.equal(result[key], fields[key]);
        assert.equal(result.cardSystemReference, fields.system);
        assert.equal(result.scenario, context.chatMetadata.scenario);
        assert.equal(result.authorNote, broad ? context.chatMetadata.note_prompt : undefined);
    }
    assert.deepEqual({ fields, context }, before);
});
