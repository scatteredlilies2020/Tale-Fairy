import test from 'node:test';
import assert from 'node:assert/strict';
import { injectStagedPreparation } from '../scripts/development-request-prototype.mjs';

test('isolated staged writer uses the actual near-user injection path without changing stored history', () => {
    const accepted = [{ role: 'system', content: 'Writer preset.' }, { role: 'assistant', content: 'Earlier scene.' }, { role: 'user', content: 'Show the changed work.' }];
    const state = { developments: [{ id: 'music' }], observations: [], staged: [{ id: 'music', use_now: 'Jo plays the changed lantern passage.', do_not_assume: 'No user reaction supplied.', evidence: [2] }] };
    const before = structuredClone({ accepted, state }), request = structuredClone(accepted);
    injectStagedPreparation(request, state);
    assert.equal(request.length, accepted.length);
    assert.deepEqual(request.slice(0, -1), accepted.slice(0, -1));
    assert.match(request.at(-1).content, /<tale-fairy-context>[\s\S]*Jo plays/);
    assert.ok(request.at(-1).content.endsWith('Show the changed work.'));
    assert.doesNotMatch(request.at(-1).content, /"evidence"/);
    const once = structuredClone(request); injectStagedPreparation(request, state);
    assert.deepEqual(request, once);
    assert.deepEqual({ accepted, state }, before);
});

test('empty staging adds no context to an unrelated scene', () => {
    const request = [{ role: 'user', content: 'What can we cook?' }], before = structuredClone(request);
    injectStagedPreparation(request, { staged: [] });
    assert.deepEqual(request, before);
});
