import test from 'node:test';
import assert from 'node:assert/strict';
import { injectRepertoire } from '../scripts/development-repertoire-request.mjs';

test('complete private futures use production near-user slot, distinct from accepted progress', () => {
    const state = { scope: 'Travel and discovery', developments: [{ id: 'map', substance: 'Living map', independence: 'Unrelated to local mystery', encounter: 'At a later opportunity', changes: [
        { when: 'If learned', experience: 'Map a walk', after: 'A personal map' },
        { when: 'After later practice', experience: 'A different use', after: 'Conditional future only' },
    ] }], observations: [{ id: 'map', text: 'Declined public work.', evidence: [4] }], invalidated: [] };
    const conversation = [{ role: 'system', content: 'Preset' }, { role: 'user', content: 'What happens here?' }];
    const before = structuredClone({ state, conversation }), request = structuredClone(conversation);
    injectRepertoire(request, state);
    const text = request.at(-1).content;
    const packet = JSON.parse(text.match(/<tale-fairy-context>\n([^]*?)\n<\/tale-fairy-context>/)[1]);
    assert.deepEqual(packet.repertoire.developments, state.developments);
    assert.deepEqual(packet.accepted_observations, state.observations);
    assert.match(packet.provenance, /NOT ACCEPTED HISTORY/);
    assert.ok(text.endsWith('What happens here?'));
    assert.deepEqual({ state, conversation }, before);
    const once = structuredClone(request); injectRepertoire(request, state); assert.deepEqual(request, once);
});
