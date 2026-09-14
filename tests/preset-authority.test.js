import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPromptPayload, defaultState } from '../extension/state.js';
import { ensureGuidanceInChat, TALE_FAIRY_AUTHORITY } from '../extension/request-injection.js';
import { canRetainSuccessfulPlan, createSafetyFallbackState } from '../extension/fallback-direction.js';

test('static GM authority follows preset system messages without elevating notebook text', () => {
    const payload = buildPromptPayload(defaultState());
    for (const role of ['user', 'assistant', 'system']) {
        const chat = [{ role: 'system', content: 'Keep HELD NPCs inactive. Use HTML.' },
            { role: 'user', content: 'I listen. OOC: keep the scene peaceful.' },
            { role: 'assistant', content: 'Prefill' }];
        ensureGuidanceInChat(chat, payload, { role, depth: 1, inlineLatestUser: role === 'user' });
        const before = structuredClone(chat);
        assert.equal(ensureGuidanceInChat(chat, payload, { role, depth: 1, inlineLatestUser: role === 'user' }), false);
        assert.deepEqual(chat, before);
        const authority = chat.findIndex(message => message.content === TALE_FAIRY_AUTHORITY);
        assert.ok(authority > 0);
        assert.equal(chat[authority].role, 'system');
        assert.match(chat[0].content, /Use HTML/);
        assert.match(JSON.stringify(chat), /keep the scene peaceful/);
        assert.equal(chat.at(-1).content, 'Prefill');
        assert.match(TALE_FAIRY_AUTHORITY, /Explicit current user\/OOC directions/);
        assert.match(TALE_FAIRY_AUTHORITY, /player agency and provider safety/);
        assert.match(TALE_FAIRY_AUTHORITY, /conditional GM proposals/);
        assert.match(TALE_FAIRY_AUTHORITY, /not every NPC reply/);
        assert.doesNotMatch(TALE_FAIRY_AUTHORITY, /peaceful|Prefill/);
        ensureGuidanceInChat(chat, '');
        assert.doesNotMatch(JSON.stringify(chat), /tale-fairy-/);
        assert.equal(chat.at(-1).content, 'Prefill');
    }
});

test('disabled and non-story requests remove stale multimodal authority without deleting attachments', () => {
    for (const type of ['quiet', 'impersonate', 'normal']) {
        const chat = [{ role: 'system', content: [{ type: 'text', text: TALE_FAIRY_AUTHORITY }, { type: 'image_url', image_url: { url: 'kept' } }] }, { role: 'user', content: 'kept' }];
        ensureGuidanceInChat(chat, buildPromptPayload(defaultState(), { generationType: type, enabled: false }));
        assert.doesNotMatch(JSON.stringify(chat), /tale-fairy-/);
        assert.match(JSON.stringify(chat), /image_url/);
    }
});

test('failed refresh retains only an exact-source, same-input, successful current plan', () => {
    const proof = { chatId: 'story', fingerprint: 'snapshot', messageCount: 10, inputsKey: 'card+lore+notes' };
    const state = { ...defaultState(), sourceChatId: proof.chatId, lastAnalysisFingerprint: proof.fingerprint,
        sourceMessageCount: proof.messageCount, lastAnalyzedAt: 100, analysisModel: { plotInputsKey: proof.inputsKey },
        causalContext: { conditions: [{ id: 'witness', confidence: 'established', subject: 'Courier', condition: 'already departed' }] } };
    const before = structuredClone(state);
    assert.equal(canRetainSuccessfulPlan(state, proof), true);
    assert.deepEqual(state, before);
    for (const changed of [{ chatId: 'other' }, { fingerprint: 'edited' }, { messageCount: 11 }, { inputsKey: 'changed' }, { inputsKey: '' }]) {
        assert.equal(canRetainSuccessfulPlan(state, { ...proof, ...changed }), false);
    }
    assert.equal(canRetainSuccessfulPlan({ ...state, causalContext: { conditions: [{ id: 'guess', confidence: 'tentative' }] } }, proof), false);
    const fallback = createSafetyFallbackState(state, { chatId: proof.chatId, fingerprint: proof.fingerprint, messages: Array.from({ length: 10 }, () => ({ mes: 'Observed scene' })) });
    assert.equal(canRetainSuccessfulPlan(fallback, proof), false);
});
