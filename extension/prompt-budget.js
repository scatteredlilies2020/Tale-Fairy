import { estimateTokenCount } from './token-budget.js?v=0.13.9';
import { summarySourceAudit } from './summary-context.js?v=0.14.16';

export function plannerEvidenceAudit(prompt, candidates, { fixedEnvelope = '', tokenBudget = 0, tier = '' } = {}) {
    const payload = JSON.parse(prompt);
    const included = summarySourceAudit(payload.summary_sources);
    const candidate = summarySourceAudit(candidates);
    return {
        ...included, candidateCount: candidate.count, candidateTokens: candidate.includedTokens,
        droppedLabels: candidate.labels.filter(label => !included.labels.includes(label)),
        inputTokens: estimateTokenCount(`${fixedEnvelope}\n${prompt}`), inputBudget: tokenBudget, tier,
        recentTokens: (payload.messages || []).reduce((sum, message) => sum + estimateTokenCount(message.content), 0),
        historyCount: payload.historical_evidence?.length || 0,
        storyMessageCount: payload.story_evidence?.timeline?.at(-1)?.range?.[1] + 1 || 0,
        timelineEpochCount: payload.story_evidence?.timeline?.length || 0,
        openThreadCount: payload.story_evidence?.open_threads?.length || 0,
        actorCount: payload.current?.entities?.length || 0,
    };
}

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
    throw new Error(`Planner context is ${total} tokens and could not be fitted within the ${tokenBudget}-token limit. Increase the planner input budget or explicitly revise the saved instructions; no saved notes were removed.`);
}
