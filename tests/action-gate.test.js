import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ACTION_GATE_SCHEMA,
    applyActionGateResult,
    buildActionGatePrompt,
    normalizeActionGateResult,
    validateActionGateResult,
} from '../extension/action-gate.js';

const prepared = {
    operation: 'complicate the current attempt',
    target: 'the assignment',
    requiredEffect: 'Reveal a manageable obstacle that requires a concrete adjustment.',
    inject: true,
    injectReason: 'The quiet activity benefits from movement.',
    contentClass: 'obstacle',
    scope: 'institutional',
    intensity: 'moderate',
    quantity: 'group',
    relativePower: 'peer',
    plotWeight: 'connective',
    duration: 'scene',
    resolutionCeiling: 'partial',
    preserve: ['the calm tone'],
    forbid: ['unrelated danger'],
    basis: 'The assignment is already underway.',
};

test('action gate prompt is compact and gives Keep, Adapt, and Regenerate distinct jobs', () => {
    const prompt = buildActionGatePrompt({
        mode: 'fun',
        scenePromise: 'A grounded study session.',
        situation: 'The character is working on an assignment.',
        activity: 'Studying.',
        previousAssistant: 'The page waits under the desk lamp.',
        latestUserAction: 'I close the book and call my classmate.',
        beatDirective: prepared,
    });
    assert.match(prompt, /- keep:/);
    assert.match(prompt, /- adapt:/);
    assert.match(prompt, /- regenerate:/);
    assert.match(prompt, /"mode":"fun"/);
    assert.match(prompt, /I close the book and call my classmate/);
    assert.match(prompt, /complicate the current attempt/);
    assert.ok(prompt.length < 5000);
    assert.equal(ACTION_GATE_SCHEMA.value.properties.decision.enum.length, 3);
});

test('action gate rejects malformed or incomplete decisions', () => {
    assert.equal(validateActionGateResult({ decision: 'discard', operation: 'x', required_effect: 'y', reason: 'z' }).valid, false);
    assert.equal(validateActionGateResult({ decision: 'adapt', operation: '', required_effect: 'y', reason: 'z' }).valid, false);
    assert.equal(validateActionGateResult({ decision: 'keep', operation: 'x', required_effect: 'y', reason: 'z', extra: true }).valid, false);
    assert.equal(normalizeActionGateResult({ decision: 'adapt', operation: 'follow the call', required_effect: 'Make the call alter the immediate options.', reason: 'The user changed activity.' }).decision, 'adapt');
});

test('Keep preserves the exact prepared semantic direction and scale', () => {
    const result = applyActionGateResult(prepared, {
        decision: 'keep',
        operation: prepared.operation,
        required_effect: prepared.requiredEffect,
        reason: 'It still fits.',
    });
    assert.equal(result.operation, prepared.operation);
    assert.equal(result.requiredEffect, prepared.requiredEffect);
    assert.equal(result.contentClass, 'obstacle');
    assert.equal(result.scope, 'institutional');
    assert.deepEqual(result.preserve, ['the calm tone']);
});

for (const decision of ['adapt', 'regenerate']) {
    test(`${decision} replaces the immediate direction without leaking stale scale classifiers`, () => {
        const result = applyActionGateResult(prepared, {
            decision,
            operation: 'follow the newly initiated call',
            required_effect: 'Make the call produce a perceptible, context-fitting change in the immediate situation.',
            reason: 'The user redirected the activity.',
        });
        assert.equal(result.operation, 'follow the newly initiated call');
        assert.equal(result.inject, true);
        assert.equal(result.contentClass, 'none');
        assert.equal(result.scope, 'personal');
        assert.equal(result.intensity, 'none');
        assert.deepEqual(result.preserve, []);
        assert.deepEqual(result.forbid, []);
    });
}
