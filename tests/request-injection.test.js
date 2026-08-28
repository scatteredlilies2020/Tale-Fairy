import assert from 'node:assert/strict';
import test from 'node:test';
import { chatHasCurrentGuidance, ensureGuidanceInChat, ensureGuidanceInText, requestContainsMarker, textHasCurrentGuidance } from '../extension/request-injection.js';
import { buildPromptPayload, defaultState } from '../extension/state.js';

const policy = '<tale-fairy-narrative-policy>Keep the scene grounded.</tale-fairy-narrative-policy>';
const oldGuide = '<living-world-guide>Old direction.</living-world-guide>';
const guide = '<living-world-guide>Current scene direction.</living-world-guide>';
const oldNotes = '<tale-fairy-user-notes>Stale note.</tale-fairy-user-notes>';
const oldCanon = '<user-established-canon>Stale canon.</user-established-canon>';
const payload = `<tale-fairy-context>${policy}\n${guide}</tale-fairy-context>`;

test('identifies only request-local internal planner prompts', () => {
    const marker = 'Tale Fairy internal planner marker';
    assert.equal(requestContainsMarker({ messages: [{ role: 'system', content: marker }] }, marker), true);
    assert.equal(requestContainsMarker({ prompt: [{ role: 'user', content: [{ type: 'text', text: marker }] }] }, marker), true);
    assert.equal(requestContainsMarker({ messages: [{ role: 'system', content: 'normal roleplay' }] }, marker), false);
    assert.equal(requestContainsMarker({ messages: [{ role: 'user', content: 'normal roleplay' }] }, ''), false);
});

test('adds current guidance to an assembled chat request at the configured depth', () => {
    const chat = Array.from({ length: 5 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `message ${index}` }));
    assert.equal(ensureGuidanceInChat(chat, payload, { role: 'system', depth: 3 }), true);
    assert.equal(chat.length, 6);
    assert.equal(chat[2].role, 'system');
    assert.equal(chat[2].content, payload);
    assert.equal(chatHasCurrentGuidance(chat, payload), true);
    assert.equal(ensureGuidanceInChat(chat, payload, { role: 'system', depth: 3 }), false);
});

test('atomically replaces legacy guidance and policy blocks', () => {
    const chat = [{ role: 'user', content: `${oldNotes}\n${oldCanon}\n${policy}\n${oldGuide}` }, { role: 'assistant', content: 'reply' }];
    assert.equal(ensureGuidanceInChat(chat, payload, { role: 'user', depth: 0 }), true);
    const combined = chat.map(message => message.content).join('\n');
    assert.doesNotMatch(combined, /Old direction|Stale note|Stale canon/);
    assert.equal(combined.match(/<tale-fairy-context>/g)?.length, 1);
    assert.equal(combined.match(/<tale-fairy-narrative-policy>/g)?.length, 1);
    assert.equal(combined.match(/<living-world-guide>/g)?.length, 1);
    assert.equal(chat.at(-1).content, payload);
});

test('removes duplicate legacy fragments even when the current context is already present', () => {
    const chat = [{ role: 'system', content: payload }, { role: 'user', content: `${oldNotes}\n${oldGuide}` }];
    assert.equal(ensureGuidanceInChat(chat, payload, { role: 'system', depth: 1 }), true);
    const combined = chat.map(message => message.content).join('\n');
    assert.doesNotMatch(combined, /Old direction|Stale note/);
    assert.equal(combined.match(/<tale-fairy-context>/g)?.length, 1);
    assert.equal(ensureGuidanceInChat(chat, payload, { role: 'system', depth: 1 }), false);
});

test('repairs text-completion prompts and recognizes the current guide', () => {
    const repaired = ensureGuidanceInText(`story\n${policy}\n${oldGuide}`, payload);
    assert.equal(textHasCurrentGuidance(repaired, payload), true);
    assert.doesNotMatch(repaired, /Old direction/);
    assert.equal(repaired.match(/<tale-fairy-context>/g)?.length, 1);
    assert.equal(repaired.match(/<tale-fairy-narrative-policy>/g)?.length, 1);
    assert.equal(ensureGuidanceInText(repaired, payload), repaired);
});

test('provider-bound request receives only the selected route while alternatives remain private', () => {
    const routes = [
        { id: 'reveal', direction: 'Vekk gives the concrete war update now.', use_when: 'The user remains present or asks about the war.', drop_when: 'The user leaves or forbids the topic.', response_bias: 'State the news through dialogue and let it alter the room.', world_delta: 'The actual military situation becomes known.', origin: 'inferred', basis: 'Vekk has the report and intended to speak privately.', strength: 'strong', source_pathways: ['war-news'] },
        { id: 'interruption', direction: 'An urgent contradiction reaches Vekk before he can finish.', use_when: 'The channel remains open and outside contact is possible.', drop_when: 'The user isolates the room or time advances past it.', response_bias: 'Use a specific interruption with an immediate consequence.', world_delta: 'New evidence forces Vekk to revise part of the report.', origin: 'original', basis: 'The war is active and information remains unstable.', strength: 'moderate', source_pathways: ['war-news'] },
    ];
    const prompt = buildPromptPayload({ ...defaultState(), nextGuides: routes }, { guidanceUsable: true, guideCandidates: routes, guideIndex: 1, regeneration: true });
    const chat = [{ role: 'user', content: 'Tell me what happened.' }];

    assert.equal(ensureGuidanceInChat(chat, prompt, { role: 'system', depth: 0 }), true);
    assert.equal(chatHasCurrentGuidance(chat, prompt), true);
    assert.match(chat.at(-1).content, /SELECTED IMMEDIATE ROUTE 2/);
    assert.doesNotMatch(chat.at(-1).content, /ALTERNATIVE ROUTE 1|Vekk gives the concrete war update now/);
    assert.equal(chat.map(message => String(message.content)).join('\n').match(/<tale-fairy-context>/g)?.length, 1);
    assert.ok(prompt.length < 4800, `expected compact payload, got ${prompt.length} characters`);
});
