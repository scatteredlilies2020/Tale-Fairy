import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Exercise the actual browser controller without importing ST's browser globals.
const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
const controller = source.slice(source.indexOf('function directModelCacheKey('), source.indexOf('function continuityContextState('));
function harness() {
    const settings = { analysisSource: 'openrouter', analysisUrl: '', analysisSecretId: 'key-a', analysisModel: 'manual-model' };
    const select = { children: [], replaceChildren() { this.children = []; }, append(option) { this.children.push(option); } };
    const button = {};
    const status = {};
    const root = { querySelector: selector => selector.includes('model-list-status') ? status : selector.includes('fetch-models') ? button : select };
    const requests = [];
    const context = vm.createContext({
        URL, EXTENSION_ID: 'test', document: { createElement: () => ({}) },
        console: { warn() {} }, directModelCache: new Map(), directModelDiscovery: new Map(),
        getSettings: () => settings, currentContext: () => ({ getRequestHeaders: () => ({}) }),
        discoverDirectModels: options => new Promise((resolve, reject) => requests.push({ options, resolve, reject })),
    });
    vm.runInContext(controller, context);
    return { settings, select, button, status, requests, context,
        render: () => context.renderDirectModelOptions(root), fetch: () => context.fetchDirectModels(root) };
}

test('pending requests stay disabled across renders and duplicate clicks are ignored', async () => {
    const h = harness();
    const pending = h.fetch();
    h.render();
    assert.equal(h.button.disabled, true);
    assert.equal(h.status.textContent, 'Fetching models…');
    await h.fetch();
    assert.equal(h.requests.length, 1);
    h.requests[0].resolve([{ id: 'fetched-model' }]);
    await pending;
    assert.equal(h.button.disabled, false);
    assert.equal(h.select.value, 'manual-model');
    assert.ok(h.select.children.some(option => option.textContent === 'manual-model (saved/manual)'));
});

test('switching connection or key cannot cache or paint the previous request into the new connection', async () => {
    const h = harness();
    const oldKey = h.context.directModelCacheKey();
    const pending = h.fetch();
    h.settings.analysisSource = 'direct';
    h.settings.analysisUrl = 'https://proxy.example/v1';
    h.settings.analysisSecretId = 'key-b';
    h.render();
    h.requests[0].resolve([{ id: 'openrouter-model' }]);
    await pending;
    assert.equal(h.context.directModelCache.get(oldKey)[0].id, 'openrouter-model');
    assert.equal(h.context.directModelCache.has(h.context.directModelCacheKey()), false);
    assert.equal(h.status.textContent, 'No model list fetched yet.');
    h.settings.analysisSource = 'openrouter';
    h.settings.analysisUrl = '';
    assert.notEqual(h.context.directModelCacheKey(), oldKey);
    h.settings.analysisSecretId = 'key-a';
    h.render();
    assert.equal(h.status.textContent, '1 models loaded.');
});

test('errors persist across refreshes and failed refreshes keep the last good catalog', async () => {
    const h = harness();
    const first = h.fetch();
    h.requests[0].resolve([{ id: 'cached-model' }]);
    await first;
    const second = h.fetch();
    h.requests[1].reject(new Error('Network unavailable'));
    await second;
    h.render();
    assert.equal(h.status.textContent, 'Could not fetch models: Network unavailable');
    assert.equal(h.select.disabled, false);
    assert.ok(h.select.children.some(option => option.value === 'cached-model'));
});

test('reset invalidates in-flight results and invalid URLs do not issue requests', async () => {
    const h = harness();
    const pending = h.fetch();
    h.context.directModelDiscovery.clear();
    h.context.directModelCache.clear();
    h.requests[0].resolve([{ id: 'stale-model' }]);
    await pending;
    assert.equal(h.context.directModelCache.size, 0);
    h.settings.analysisUrl = 'file:///not-an-api';
    await h.fetch();
    h.render();
    assert.match(h.status.textContent, /valid HTTP\(S\) API URL/);
    assert.equal(h.requests.length, 1);
});
