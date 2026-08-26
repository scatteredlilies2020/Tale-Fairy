import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveInjectionPlacement } from '../extension/injection-placement.js';

const types = { NONE: -1, IN_PROMPT: 0, IN_CHAT: 1, BEFORE_PROMPT: 2 };
const roles = { SYSTEM: 0, USER: 1, ASSISTANT: 2 };

test('defaults Tale Fairy to user-role chat injection at depth two', () => {
    assert.deepEqual(resolveInjectionPlacement({ injectionPosition: 'at-depth', injectionDepth: 2, injectionRole: 'user' }, types, roles), {
        position: types.IN_CHAT,
        depth: 2,
        role: roles.USER,
    });
    assert.equal(resolveInjectionPlacement({ injectionPosition: 'at-depth', injectionDepth: 2 }, types, roles).role, roles.USER);
});

test('supports main and Prompt Manager fallbacks while clamping chat placement', () => {
    assert.equal(resolveInjectionPlacement({ injectionPosition: 'before-main' }, types, roles).position, types.BEFORE_PROMPT);
    assert.equal(resolveInjectionPlacement({ injectionPosition: 'after-main' }, types, roles).position, types.IN_PROMPT);
    assert.equal(resolveInjectionPlacement({ injectionPosition: 'before-jailbreak' }, types, roles).position, types.BEFORE_PROMPT);
    assert.equal(resolveInjectionPlacement({ injectionPosition: 'after-jailbreak' }, types, roles).position, types.IN_PROMPT);
    assert.deepEqual(resolveInjectionPlacement({ injectionPosition: 'at-depth', injectionDepth: 500, injectionRole: 'assistant' }, types, roles), {
        position: types.IN_CHAT,
        depth: 100,
        role: roles.ASSISTANT,
    });
});
