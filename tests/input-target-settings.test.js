import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as schedule from '../extension/planner-scheduler.js';
import * as budgets from '../extension/planner-budgets.js';
import * as role from '../extension/injection-role.js';
import { normalizeReasoningMode } from '../extension/reasoning-policy.js';

const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
function settingsHarness(stored = {}) {
    const scope = vm.createContext({ ...schedule, ...budgets, ...role, normalizeReasoningMode,
        extension_settings: { test: structuredClone(stored) }, EXTENSION_ID: 'test' });
    for (const name of ['INJECTION_POSITIONS', 'DEFAULT_SETTINGS']) {
        vm.runInContext(source.match(new RegExp(`const ${name} = [^\\n]+`))[0], scope);
    }
    vm.runInContext('let settings = null;', scope);
    for (const name of ['normalizePlannerTemperature', 'directSettingKeys', 'getSettings']) {
        vm.runInContext(source.match(new RegExp(`function ${name}\\([^]*?^}`, 'm'))[0], scope);
    }
    return scope;
}

test('fresh installs and the old 8k default get the 10k ingestion target', () => {
    for (const stored of [{}, { contextSettingsVersion: 13, maxPromptTokens: 8000 }]) {
        const scope = settingsHarness(stored);
        assert.equal(scope.getSettings().maxPromptTokens, 10000);
        assert.equal(scope.getSettings().contextSettingsVersion, 15);
    }
});

test('old forced immediate review settings migrate once; later choices remain deliberate', () => {
    const scope = settingsHarness({ contextSettingsVersion: 14, fullReviewInterval: 3 });
    assert.equal(scope.getSettings().fullReviewInterval, 12);
    scope.getSettings().fullReviewInterval = 4;
    assert.equal(settingsHarness(scope.getSettings()).getSettings().fullReviewInterval, 4);
    assert.equal(settingsHarness({ contextSettingsVersion: 14, fullReviewInterval: 18 }).getSettings().fullReviewInterval, 18);
});

test('custom smaller targets and later explicit 8k choices survive reload', () => {
    const scope = settingsHarness({ contextSettingsVersion: 13, maxPromptTokens: 6000, summaryContextTokens: 500 });
    assert.equal(scope.getSettings().maxPromptTokens, 6000);
    assert.equal(scope.getSettings().summaryContextTokens, 500);
    scope.getSettings().maxPromptTokens = 8000;
    assert.equal(scope.getSettings().maxPromptTokens, 8000);
    assert.equal(settingsHarness(scope.getSettings()).getSettings().maxPromptTokens, 8000);
});
