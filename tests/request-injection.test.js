import assert from 'node:assert/strict';
import test from 'node:test';
import { chatHasCurrentGuidance, ensureGuidanceInChat, ensureGuidanceInText, textHasCurrentGuidance } from '../extension/request-injection.js';

const policy = '<tale-fairy-narrative-policy>Keep the scene grounded.</tale-fairy-narrative-policy>';
const oldGuide = '<living-world-guide>Old direction.</living-world-guide>';
const guide = '<living-world-guide>Current scene direction.</living-world-guide>';
const payload = `${policy}\n${guide}`;

test('adds current guidance to an assembled chat request at the configured depth', () => {
    const chat = Array.from({ length: 5 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `message ${index}` }));
    assert.equal(ensureGuidanceInChat(chat, payload, { role: 'system', depth: 3 }), true);
    assert.equal(chat.length, 6);
    assert.equal(chat[2].role, 'system');
    assert.equal(chat[2].content, payload);
    assert.equal(chatHasCurrentGuidance(chat, payload), true);
    assert.equal(ensureGuidanceInChat(chat, payload, { role: 'system', depth: 3 }), false);
});

test('replaces stale guidance without duplicating an existing narrative policy', () => {
    const chat = [{ role: 'user', content: `${policy}\n${oldGuide}` }, { role: 'assistant', content: 'reply' }];
    assert.equal(ensureGuidanceInChat(chat, payload, { role: 'user', depth: 0 }), true);
    const combined = chat.map(message => message.content).join('\n');
    assert.doesNotMatch(combined, /Old direction/);
    assert.equal(combined.match(/<tale-fairy-narrative-policy>/g)?.length, 1);
    assert.equal(combined.match(/<living-world-guide>/g)?.length, 1);
    assert.equal(chat.at(-1).content, guide);
});

test('repairs text-completion prompts and recognizes the current guide', () => {
    const repaired = ensureGuidanceInText(`story\n${policy}\n${oldGuide}`, payload);
    assert.equal(textHasCurrentGuidance(repaired, payload), true);
    assert.doesNotMatch(repaired, /Old direction/);
    assert.equal(repaired.match(/<tale-fairy-narrative-policy>/g)?.length, 1);
    assert.equal(ensureGuidanceInText(repaired, payload), repaired);
});
