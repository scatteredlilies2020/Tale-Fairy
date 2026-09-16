import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptedWindow, seamlessMemorySchema, updateSeamlessMemory, injectSeamlessPreparation, icDriverIssues, validateAuthoredReply } from '../scripts/seamless-planning-prototype.mjs';
test('seamless window keeps complete opening/recent messages without mutation or evidence renumbering', () => {
    const messages = Array.from({ length: 20 }, (_, index) => ({ index, role: 'user', content: 'complete '.repeat(100) }));
    const window = acceptedWindow(messages, 3, 2);
    assert.deepEqual(window.map(m => m.index), [0, 1, 17, 18, 19]);
    assert.equal(window[0].content, messages[0].content);
    window[0].content = 'change'; assert.notEqual(messages[0].content, 'change');
});
test('routine cannot retire enduring subjects; local completion needs no OOC', () => {
    const state = { scope: 'Source', developments: [{ id: 'music' }], local: [{ id: 'delivery' }] };
    assert.deepEqual(seamlessMemorySchema(state).value.properties.retire.items.properties.id.enum, ['delivery']);
    assert.throws(() => updateSeamlessMemory(state, { retire: [{ id: 'music' }] }, []), /only local/);
    assert.deepEqual(icDriverIssues('I carry the recovered trunk to Mara. "Here we are."'), []);
    assert.ok(icDriverIssues('OOC: this arc is over.').length);
});
test('empty repertoire still conveys accepted local closure', () => {
    const state = { scope: 'Source remains authoritative.', developments: [], observations: [], invalidated: [], local: [], archive: [{ lane: 'local', record: { id: 'delivery' }, retirement: { reason: 'Trunks delivered', evidence: [5] } }] };
    const chat = [{ role: 'user', content: 'I sit down.' }]; injectSeamlessPreparation(chat, state);
    assert.match(chat[0].content, /Trunks delivered/); assert.ok(chat[0].content.endsWith('I sit down.'));
});
test('creative handoff cannot carry accepted-memory operations or generated prohibitions', () => {
    const value = { material: 'Jo plays a new answering phrase.' };
    const copy = validateAuthoredReply(value);
    assert.deepEqual(copy, value); assert.notEqual(copy, value);
    for (const extra of ['observations', 'retire', 'do_not_assume', 'developments']) {
        assert.throws(() => validateAuthoredReply({ ...value, [extra]: [] }), /Invalid/);
    }
    assert.throws(() => validateAuthoredReply({ material: ' ' }), /Invalid/);
    assert.throws(() => validateAuthoredReply({ material: 'x'.repeat(4001) }), /Invalid/);
});
