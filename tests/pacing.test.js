import assert from 'node:assert/strict';
import test from 'node:test';
import { consumeAdvanceOverride, defaultPacingState, inferPacing, isReleaseSignal, normalizePacingState } from '../extension/pacing.js';

test('specific ongoing activity selects linger and persists without handholding', () => {
    const reading = inferPacing('I continue reading page 42.', defaultPacingState(), 3);
    assert.equal(reading.effective, 'linger');
    assert.equal(inferPacing('I study the passage in silence.', reading, 4).effective, 'linger');
});

test('explicit release overrides lingering but negated release does not', () => {
    const linger = inferPacing('Keep reading.', defaultPacingState(), 1);
    assert.equal(inferPacing('I leave and check my messages.', linger, 2).effective, 'advance');
    assert.equal(isReleaseSignal("Don't leave or advance yet; continue reading."), false);
});

test('advance is not inferred forever and manual advance can be consumed', () => {
    const advance = inferPacing('Go ahead to the next scene.', defaultPacingState(), 1);
    assert.equal(advance.effective, 'advance');
    assert.equal(inferPacing('I look around.', advance, 2).effective, 'natural');
    assert.equal(consumeAdvanceOverride(normalizePacingState({ mode: 'advance' })).mode, 'auto');
});
