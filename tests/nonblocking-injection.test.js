import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isStoryGeneration } from '../extension/game-master.js';

const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
const payloadFunctions = source.slice(source.indexOf('function preparedGuidancePayload('),
    source.indexOf('function reconcileStateWithContinuity('));

test('provider verification reuses the frozen packet without rebuilding context', () => {
    const context = {
        storyGenerationInProgress: true, activeGenerationType: 'normal',
        generationGuideSelection: { chatId: 'chat-a', payload: '<tale-fairy-context>Ready</tale-fairy-context>' },
        getSettings: () => ({ enabled: true }), isStoryGeneration,
        currentContext: () => ({ getCurrentChatId: () => 'chat-a' }),
        loadState: () => assert.fail('Provider verification rebuilt state'),
        guideSelectionOptions: () => assert.fail('Provider verification rebuilt selection'),
        buildPromptPayload: () => assert.fail('Provider verification rebuilt payload'),
    };
    vm.runInNewContext(payloadFunctions, context);
    assert.equal(context.currentGuidancePayload(), context.generationGuideSelection.payload);
    assert.equal(context.currentGuidancePayload('swipe'), context.generationGuideSelection.payload);
    context.currentContext = () => ({ getCurrentChatId: () => 'chat-b' });
    assert.equal(context.preparedGuidancePayload(context.currentContext(), 'normal'), null);
    context.storyGenerationInProgress = false;
    assert.equal(context.preparedGuidancePayload({ getCurrentChatId: () => 'chat-a' }, 'normal'), null);
});

test('settings-board rendering defers during a reply and resumes when idle', () => {
    const start = source.indexOf('function renderBoard(');
    const end = source.indexOf('\nfunction ', start + 10);
    let renders = 0;
    const context = {
        storyGenerationInProgress: true, boardRenderPending: false,
        loadState: () => ({}), currentContext: () => ({ chatMetadata: {} }),
        renderFutureBoard: () => { renders++; }, renderCampaignAttempt: () => {},
        document: { querySelector: () => null }, EXTENSION_ID: 'tale-fairy',
    };
    vm.runInNewContext(source.slice(start, end), context);
    context.renderBoard();
    assert.equal(renders, 0);
    assert.equal(context.boardRenderPending, true);
    context.storyGenerationInProgress = false;
    context.renderBoard();
    assert.equal(renders, 1);
});
