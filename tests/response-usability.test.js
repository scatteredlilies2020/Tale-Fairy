import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAssistantReply } from '../extension/response-usability.js';

const assistant = mes => ({ mes, is_user: false });
const user = mes => ({ mes, is_user: true });

test('empty and placeholder replies are unusable', () => {
    for (const mes of ['', '...', 'loading', 'thinking...']) {
        assert.equal(classifyAssistantReply([user('Continue.'), assistant(mes)]).unusable, true, mes);
    }
});

test('provider errors and serialized JSON artifacts are unusable', () => {
    assert.equal(classifyAssistantReply([assistant('Generation failed: upstream timeout')]).unusable, true);
    assert.equal(classifyAssistantReply([assistant('{"text":"hello"}')]).unusable, true);
    assert.equal(classifyAssistantReply([assistant('[{"role":"assistant","content":"hello"}]')]).unusable, true);
    assert.equal(classifyAssistantReply([assistant('```json\n{"text":"hello"}\n```')]).unusable, true);
    assert.equal(classifyAssistantReply([assistant('undefined')]).unusable, true);
});

test('long exact duplicate assistant replies are unusable', () => {
    const reply = 'The lantern burns low while the room settles into a careful silence around them.';
    assert.equal(classifyAssistantReply([assistant(reply), user('Go on.'), assistant(reply)]).unusable, true);
});

test('ordinary short replies and normal prose remain usable', () => {
    assert.equal(classifyAssistantReply([assistant('Yes.')]).unusable, false);
    assert.equal(classifyAssistantReply([user('What happens next?'), assistant('Mira checks the latch and listens for footsteps beyond the door.')]).unusable, false);
    assert.equal(classifyAssistantReply([assistant('Okay.'), user('Continue.'), assistant('Okay.')]).unusable, false);
});

test('a chat without an assistant reply does not request repair', () => {
    assert.equal(classifyAssistantReply([user('Hello.')]).unusable, false);
    assert.equal(classifyAssistantReply([]).unusable, false);
});
