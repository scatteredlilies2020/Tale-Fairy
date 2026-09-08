import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_INJECTION_ROLE, INJECTION_ROLES, normalizeInjectionRole } from '../extension/injection-role.js';

test('injection role defaults to user and permits only the three supported roles', () => {
    assert.equal(DEFAULT_INJECTION_ROLE, 'user');
    assert.deepEqual(INJECTION_ROLES, ['user', 'system', 'assistant']);
    for (const role of INJECTION_ROLES) assert.equal(normalizeInjectionRole(role), role);
    for (const invalid of [undefined, null, '', 'developer', 'SYSTEM']) {
        assert.equal(normalizeInjectionRole(invalid), 'user');
    }
});
