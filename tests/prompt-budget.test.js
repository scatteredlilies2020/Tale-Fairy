import test from 'node:test';
import assert from 'node:assert/strict';
import { fitPromptToBudget } from '../extension/prompt-budget.js';
import { estimateTokenCount, truncateToTokenBudget } from '../extension/token-budget.js';

test('budget fitting measures the complete envelope and uses a real tokenizer when available', async () => {
    const fixedEnvelope = 'system schema '.repeat(250);
    const prompt = await fitPromptToBudget({ fixedEnvelope, tokenBudget: 2200,
        buildPrompt: available => truncateToTokenBudget('story '.repeat(3000), available),
        tokenCounter: async input => Math.ceil(estimateTokenCount(input) * 1.1),
    });
    assert.ok(Math.ceil(estimateTokenCount(`${fixedEnvelope}\n${prompt}`) * 1.1) <= 2200);
});

test('missing, invalid and failing tokenizers cannot bypass the budget guard', async () => {
    for (const tokenCounter of [undefined, async () => NaN, async () => 0, async () => { throw Error('offline'); }]) {
        await assert.rejects(fitPromptToBudget({ fixedEnvelope: 'policy '.repeat(5000), tokenBudget: 1000,
            buildPrompt: () => 'story', tokenCounter,
        }), /could not be fitted/);
    }
});
