import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as schedule from '../extension/planner-scheduler.js';
import * as budgets from '../extension/planner-budgets.js';
import * as role from '../extension/injection-role.js';
import { normalizeReasoningMode } from '../extension/reasoning-policy.js';
import { futureInterval, futureCapacity } from '../extension/future-planner.js';
import { normalizePlannerContext } from '../extension/planner-capacity.js';

const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
function settingsHarness(stored = {}) {
    const scope = vm.createContext({ ...schedule, ...budgets, ...role, normalizeReasoningMode, normalizePlannerContext, futureInterval, futureCapacity,
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
        assert.equal(scope.getSettings().contextSettingsVersion, 16);
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

test('new future defaults and deliberately chosen canon/capacity settings survive reload', () => {
    const fresh = settingsHarness().getSettings();
    assert.equal(fresh.futureCanon, true); assert.equal(fresh.futureCapacity, 6);
    for (const capacity of [6, 10, 15]) {
        const saved = settingsHarness({ futureCanon: false, futureCapacity: String(capacity) }).getSettings();
        assert.equal(saved.futureCanon, false); assert.equal(saved.futureCapacity, capacity);
        assert.equal(settingsHarness(saved).getSettings().futureCapacity, capacity);
    }
    assert.equal(settingsHarness({ futureCapacity: 999 }).getSettings().futureCapacity, 999);
});

test('safer planning defaults migrate once and later deliberate choices survive', () => {
    const fresh = settingsHarness().getSettings();
    assert.equal(fresh.plannerContextTokens, 32768);
    assert.equal(fresh.analysisReasoningMode, 'low');
    const migrated = settingsHarness({ contextSettingsVersion: 15, futureCapacity: 10, analysisReasoningMode: 'auto' }).getSettings();
    assert.equal(migrated.futureCapacity, 6);
    assert.equal(migrated.analysisReasoningMode, 'low');
    migrated.futureCapacity = 10;
    migrated.analysisReasoningMode = 'auto';
    migrated.plannerContextTokens = 65536;
    const restored = settingsHarness(migrated).getSettings();
    assert.equal(restored.futureCapacity, 10);
    assert.equal(restored.analysisReasoningMode, 'auto');
    assert.equal(restored.plannerContextTokens, 65536);
    const custom = settingsHarness({ contextSettingsVersion: 15, futureCapacity: 15, analysisReasoningMode: 'high' }).getSettings();
    assert.equal(custom.futureCapacity, 15);
    assert.equal(custom.analysisReasoningMode, 'high');
});

test('resource targets and review intervals are independently adjustable and survive reload', () => {
    const values = { contextSettingsVersion: 16, automaticPlanning: false, earlyReviews: true,
        maxPromptTokens: 25000, summaryContextTokens: 5000, writerContextTokens: 8000,
        setupOutputTokens: 4000, reviewOutputTokens: 2500, futureCardTokens: 400,
        futureCapacity: 20, fullReviewInterval: 80, futureInterval: 500 };
    const settings = settingsHarness(values).getSettings();
    const restored = settingsHarness(settings).getSettings();
    for (const [key, value] of Object.entries(values)) assert.equal(restored[key], value, key);
    assert.equal(settingsHarness().getSettings().earlyReviews, false);
});
