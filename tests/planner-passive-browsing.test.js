import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { generationHarness } from './helpers/generation-harness.js';

const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');

test('rapid card browsing and page restoration never start current or future planning', async () => {
    const h = generationHarness([]);
    let collections = 0;
    Object.assign(h.scope, {
        activatedStoryContext: { clear() {} },
        scheduleFuturePlanning: () => assert.fail('Browsing started a future request'),
        recoverDetachedPlannerJobs: async () => { collections++; return { active: false, recovered: false }; },
    });
    h.scope.event_types.CHAT_CHANGED = 'CHAT_CHANGED';
    vm.runInContext(source.match(/eventSource\.on\(event_types\.CHAT_CHANGED, \(\) => \{[^]*?^\}\);/m)[0], h.scope);
    for (let i = 0; i < 30; i++) {
        h.context.getCurrentChatId = () => `random-card-${i}`;
        h.context.chatMetadata = {};
        h.context.chat = [{ is_user: false, mes: 'A new card greeting.' }];
        await h.emit('CHAT_CHANGED');
    }
    await h.flush();
    for (let i = 0; i < 3; i++) await h.scope.refreshCurrentPlanIfNeeded();
    assert.equal(h.calls.length, 0, 'no planner invocation while browsing or restoring');
    assert.ok(collections > 0, 'existing work remains collectable');
});

test('a displayed card greeting does not start automatic planning', async () => {
    const h = generationHarness([{ is_user: false, mes: 'Welcome to the card.' }]);
    vm.runInContext(source.match(/function analyzeCampaignNow\([^]*?^}/m)[0], h.scope);
    h.scope.runCampaignAnalysis = () => assert.fail('Greeting sent a planner request');
    await h.scope.analyzeCampaignNow();
    assert.equal(h.scope.campaignHostWork, null);
    assert.equal(h.calls.length, 0);
});

test('the host first_message event restores the board without invoking planning', async () => {
    const h = generationHarness([{ is_user: false, mes: 'Welcome to the card.' }]);
    h.scope.analyzeCampaignNow = () => assert.fail('first_message invoked planning');
    await h.emit('MESSAGE_RECEIVED', 0, 'first_message');
    assert.equal(h.calls.length, 0);
});

test('explicit Guide and actual user play still start planning after browsing', async () => {
    for (const manual of [false, true]) {
        const h = generationHarness([{ is_user: false, mes: 'Welcome to the card.' }]);
        vm.runInContext(source.match(/function analyzeCampaignNow\([^]*?^}/m)[0], h.scope);
        let runs = 0;
        Object.assign(h.scope, { runCampaignAnalysis: async () => { runs++; return h.state(); }, showCampaignPhase() {} });
        if (!manual) h.context.chat.push({ is_user: true, mes: 'I introduce myself.' }, { is_user: false, mes: 'They answer.' });
        await h.scope.analyzeCampaignNow({ manual });
        assert.equal(runs, 1);
    }
});

test('an actual continuation can start planning without a typed user message', async () => {
    const h = generationHarness([{ is_user: false, mes: 'Welcome.' }, { is_user: false, mes: 'The scene continues.' }]);
    vm.runInContext(source.match(/function analyzeCampaignNow\([^]*?^}/m)[0], h.scope);
    let runs = 0;
    Object.assign(h.scope, { runCampaignAnalysis: async () => { runs++; return h.state(); }, showCampaignPhase() {} });
    await h.scope.analyzeCampaignNow({ acceptedPlay: true });
    assert.equal(runs, 1);
});
