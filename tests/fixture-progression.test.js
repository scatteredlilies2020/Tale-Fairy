import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFixtureStage } from '../scripts/fixture-progression.mjs';

const message = (role, content) => ({ role, content });
const fixture = { name: 'synthetic', messages: [{ index: 0, ...message('user', 'Begin.') }],
    stages: [{ name: 'initial', append: [] },
        { name: 'local', append: [message('assistant', 'Local work.'), message('user', 'Continue.')] },
        { name: 'wider', append: [message('assistant', 'Local work ended.'), message('user', 'Travel.')] }] };

test('fixture progression appends exact fixed play in order without mutating source', () => {
    const before = structuredClone(fixture);
    const local = appendFixtureStage(fixture, fixture.messages, 'local');
    const wider = appendFixtureStage(fixture, local, 'wider');
    assert.equal(local.length, 3);
    assert.deepEqual(wider.map(m => m.index), [0, 1, 2, 3, 4]);
    assert.equal(wider.at(-1).content, 'Travel.');
    assert.deepEqual(fixture, before);
});

test('fixture progression rejects real play, skipped/replayed stages and changed prose', () => {
    assert.throws(() => appendFixtureStage({ ...fixture, name: 'real' }, fixture.messages, 'local'), /Synthetic/);
    assert.throws(() => appendFixtureStage(fixture, fixture.messages, 'initial'), /nonempty/);
    assert.throws(() => appendFixtureStage(fixture, fixture.messages, 'missing'), /nonempty/);
    assert.throws(() => appendFixtureStage(fixture, fixture.messages, 'wider'), /exact preceding/);
    const local = appendFixtureStage(fixture, fixture.messages, 'local');
    assert.throws(() => appendFixtureStage(fixture, local, 'local'), /exact preceding/);
    local[1].content = 'Uncontrolled writer output.';
    assert.throws(() => appendFixtureStage(fixture, local, 'wider'), /exact preceding/);
});
