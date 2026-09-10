import { estimateTokenCount } from './token-budget.js?v=0.13.6';

// Includes schema + system rules, not just the variable story payload. A broken
// provider tokenizer must never disable the local budget guard.
export async function fitPromptToBudget({ fixedEnvelope, tokenBudget, buildPrompt, tokenCounter }) {
    let available = Math.max(800, tokenBudget - estimateTokenCount(fixedEnvelope) - 16);
    let total = 0;
    for (let attempt = 0; attempt < 8; attempt++) {
        const prompt = buildPrompt(available);
        const input = `${fixedEnvelope}\n${prompt}`;
        total = estimateTokenCount(input);
        if (typeof tokenCounter === 'function') {
            try {
                const measured = Number(await tokenCounter(input, 0));
                if (Number.isFinite(measured) && measured > 0) total = measured;
            } catch { /* Use the model-neutral estimate when unavailable. */ }
        }
        if (total <= tokenBudget) return prompt;
        const smaller = Math.max(800, Math.min(available - 100, Math.floor(available * tokenBudget / total * 0.96)));
        if (smaller >= available) break;
        available = smaller;
    }
    throw new Error(`Planner context is ${total} tokens and could not be fitted within the ${tokenBudget}-token limit.`);
}
