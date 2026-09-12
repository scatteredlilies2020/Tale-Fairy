import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
test('actual reply confirmation updates proof synchronously and defers disk I/O', async () => {
    let finishSave;
    let saveCalls = 0;
    const timers = [];
    const pending = { chatId: 'story', injectionDecision: 'inject', reusedContext: true };
    const context = {
        chat: [{ mes: 'Reply.' }], chatMetadata: {}, getCurrentChatId: () => 'story',
        updateChatMetadata(value) { this.chatMetadata = value; },
        saveMetadata() { saveCalls++; return new Promise(resolve => { finishSave = resolve; }); },
    };
    const statuses = [];
    const scope = {
        currentContext: () => context, loadState: value => value, saveState: (_meta, state) => state,
        pendingRequestVerification: pending, newestProviderBoundVerification: () => pending,
        cachedProviderBoundVerification: () => null, returnedReplyMatchesVerification: () => true,
        messagesFromChat: value => value, cacheProviderBoundVerification() {}, renderBoard() {},
        renderAnalysisActivity: value => statuses.push(value),
        setTimeout: callback => timers.push(callback), console, EXTENSION_ID: 'test',
    };
    vm.createContext(scope);
    for (const name of ['confirmReturnedReplyUsedGuidance', 'scheduleVerificationPersistence']) {
        vm.runInContext(source.match(new RegExp(`(?:async )?function ${name}\\([^]*?^}`, 'm'))[0], scope);
    }
    assert.equal(scope.confirmReturnedReplyUsedGuidance(), true);
    assert.equal(context.chatMetadata.lastRequestVerification.status, 'confirmed');
    assert.equal(saveCalls, 0);
    assert.equal(timers.length, 1);
    timers.shift()();
    assert.equal(saveCalls, 1);
    const newerProof = scope.pendingRequestVerification = { chatId: 'story', requestId: 'newer' };
    const statusCount = statuses.length;
    finishSave();
    await Promise.resolve();
    assert.equal(scope.pendingRequestVerification, newerProof);
    assert.equal(statuses.length, statusCount, 'the old save does not repaint the newer generation');
});
