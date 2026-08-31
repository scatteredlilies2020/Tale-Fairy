import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateTokenCount, truncateToTokenBudget } from '../extension/token-budget.js';

test('token estimator counts prose, punctuation, and non-Latin text', () => {
    assert.equal(estimateTokenCount(''), 0);
    assert.ok(estimateTokenCount('A short sentence, with punctuation.') >= 7);
    assert.equal(estimateTokenCount('故事繼續'), 4);
});

test('token truncation honors either edge of the requested budget', () => {
    const source = Array.from({ length: 100 }, (_, index) => `item-${index}`).join(' ');
    const head = truncateToTokenBudget(source, 30);
    const tail = truncateToTokenBudget(source, 30, { fromEnd: true });
    assert.ok(estimateTokenCount(head) <= 30);
    assert.ok(estimateTokenCount(tail) <= 30);
    assert.match(head, /^item-0/);
    assert.match(tail, /item-99$/);
});
