import { conservativeTokenCount } from './token-budget.js?story-budget=1';
import { plannerMessages, PLANNER_OUTPUT_MODE } from './output-negotiation.js?v=0.14.22';

export const WRITER_CONTEXT_TOKEN_LIMIT = 1000;
const envelopes = new WeakMap();

// The active story pass sends prompt-only JSON, including schema shorthand in
// a separate message. Count that real envelope, not just the variable payload.
// A small reserve covers message framing not represented by the JSON strings.
export function storyInputTokens(prompt, system, schema) {
    let envelope = envelopes.get(schema);
    if (!envelope || envelope.system !== system) {
        envelope = { system, tokens: conservativeTokenCount(JSON.stringify(plannerMessages(system, '', schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY))) + 64 };
        envelopes.set(schema, envelope);
    }
    // Separately count the escaped prompt string. Counting its quotes again is
    // conservative and avoids rescanning the static contract for every memory
    // candidate or smaller conversation window during local fitting.
    return envelope.tokens + conservativeTokenCount(JSON.stringify(prompt));
}

export async function verifyStoryInputBudget(prompt, system, schema, limit, tokenCounter) {
    if (!Number.isFinite(limit) || limit <= 0) throw Error('Planner input budget must be a finite positive token count.');
    let tokens = storyInputTokens(prompt, system, schema);
    if (typeof tokenCounter === 'function') {
        try {
            const measured = Number(await tokenCounter(JSON.stringify(plannerMessages(system, prompt, schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY)), 0));
            if (Number.isFinite(measured) && measured > 0) tokens = Math.max(tokens, Math.ceil(measured) + 64);
        } catch { /* An unavailable tokenizer never disables the local guard. */ }
    }
    if (tokens > limit) throw Error(`Planner input ${tokens} exceeds ${limit} tokens including request framing; no provider request sent. Reduce source size or raise the input ceiling.`);
    return tokens;
}

export function storyContextJson(value) {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function storyContextPayload(material, authored) {
    if (!material.length && !authored.length) return '';
    return `<tale-fairy-context>\n${storyContextJson({
        ...(material.length ? { possible_developments: material } : {}),
        ...(authored.length ? { author_instructions: authored } : {}),
    })}\n</tale-fairy-context>`;
}

export function fitStoryContext(material, authored) {
    const selected = [];
    let payload = storyContextPayload(selected, authored);
    const authorTokens = conservativeTokenCount(payload);
    for (const entry of material) {
        const candidate = storyContextPayload([...selected, entry], authored);
        // Never clip a sentence, separate a prerequisite from its possibility,
        // or split an integrated horizon packet. Saved preparation is untouched.
        if (conservativeTokenCount(candidate) <= WRITER_CONTEXT_TOKEN_LIMIT) {
            selected.push(entry);
            payload = candidate;
        }
    }
    return { payload, tokens: conservativeTokenCount(payload), limit: WRITER_CONTEXT_TOKEN_LIMIT,
        omitted: material.length - selected.length, authorTokens,
        authorOverflow: authorTokens > WRITER_CONTEXT_TOKEN_LIMIT };
}
