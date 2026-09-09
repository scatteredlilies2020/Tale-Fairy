import assert from 'node:assert/strict';
import test from 'node:test';

import { alignmentPromptFromMeta, transcriptHeadFromPrompt } from '../extension/detached-meta.js';
import { createSafetyFallbackState } from '../extension/fallback-direction.js';
import { defaultState, fingerprintMessages, isGuidanceUsable } from '../extension/state.js';

test('detached metadata retains the authoritative transcript head for recovery validation', () => {
    const head = { authoritative_assistant_status: 'Time = 01:10 PM\nLocation = South alcove' };
    assert.deepEqual(transcriptHeadFromPrompt(JSON.stringify({ transcript_head: head })), head);
    assert.deepEqual(JSON.parse(alignmentPromptFromMeta({ transcriptHead: head })).transcript_head, head);
});

test('planner failure infers a minimal in-medias-res causal slice from transcript status', () => {
    const messages = [{ mes: 'latest assistant', is_user: false }];
    const fingerprint = fingerprintMessages(messages);
    const head = { authoritative_assistant_status: 'Time & Weather = Time: 01:10 PM\nLocation = East Refectory south alcove\nCurrent Beat = Nim approves the private supporting-case draft.' };
    const state = createSafetyFallbackState(defaultState(), {
        transcriptHead: head, messages, chatId: 'chat-1', fingerprint, turnCount: 1, seed: 7, now: 10, reason: 'invalid planner output',
    });
    assert.equal(state.scene.time, 'Time: 01:10 PM');
    assert.equal(state.scene.location, 'East Refectory south alcove');
    assert.match(state.scene.activity, /supporting-case draft/i);
    assert.equal(state.causalContext.conditions.length, 2);
    assert.match(state.causalContext.conditions[0].condition, /supporting-case draft/i);
    assert.equal(state.causalContext.conditions[0].confidence, 'established');
    assert.equal(state.causalContext.conditions[1].subject, 'East Refectory south alcove');
    assert.equal(state.lastInject, true);
    assert.equal(isGuidanceUsable(state, messages, 'chat-1'), true);
});

test('a headerless first exchange still represents an ongoing world', () => {
    const messages = [{ mes: 'The tavern door opens on an argument already underway.', is_user: false }];
    const fingerprint = fingerprintMessages(messages);
    const state = createSafetyFallbackState(defaultState(), {
        messages, chatId: 'chat-1', fingerprint, turnCount: 1, reason: 'planner timed out',
    });
    assert.equal(state.causalContext.conditions.length, 1);
    assert.equal(state.causalContext.conditions[0].id, 'fallback-ongoing-world');
    assert.match(state.causalContext.conditions[0].condition, /already in progress/i);
    assert.equal(state.lastInject, true);
    assert.equal(isGuidanceUsable(state, messages, 'chat-1'), true);
});
