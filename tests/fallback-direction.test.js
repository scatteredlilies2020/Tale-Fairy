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

test('planner failure produces a current one-response safety direction', () => {
    const messages = [{ mes: 'latest assistant', is_user: false }];
    const fingerprint = fingerprintMessages(messages);
    const head = { authoritative_assistant_status: 'Time & Weather = Time: 01:10 PM\nLocation = East Refectory south alcove\nCurrent Beat = Nim approves the private supporting-case draft.' };
    const state = createSafetyFallbackState(defaultState(), {
        transcriptHead: head, messages, chatId: 'chat-1', fingerprint, turnCount: 1, seed: 7, now: 10, reason: 'invalid planner output',
    });
    assert.equal(state.scene.time, 'Time: 01:10 PM');
    assert.equal(state.scene.location, 'East Refectory south alcove');
    assert.match(state.scene.activity, /supporting-case draft/i);
    assert.equal(state.beatDirective.alternatives.length, 2);
    assert.equal(state.lastInject, true);
    assert.equal(isGuidanceUsable(state, messages, 'chat-1'), true);
});
