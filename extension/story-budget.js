import { conservativeTokenCount } from './token-budget.js?story-budget=1';
import { plannerMessages, PLANNER_OUTPUT_MODE } from './output-negotiation.js?v=0.14.22';
import { compactProgressPayload, compactMessagePayload } from './planner-compaction.js';

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

async function measureStoryInput(prompt, system, schema, tokenCounter) {
    let tokens = storyInputTokens(prompt, system, schema);
    if (typeof tokenCounter === 'function') {
        try {
            const measured = Number(await tokenCounter(JSON.stringify(plannerMessages(system, prompt, schema, PLANNER_OUTPUT_MODE.PROMPT_ONLY)), 0));
            if (Number.isFinite(measured) && measured > 0) tokens = Math.max(tokens, Math.ceil(measured) + 64);
        } catch { /* An unavailable tokenizer never disables the local guard. */ }
    }
    return tokens;
}

function checkInputLimit(tokens, limit) {
    if (!Number.isFinite(limit) || limit <= 0) throw Error('Planner input budget must be a finite positive token count.');
    if (tokens > limit) throw Error(`Planner input ${tokens} exceeds ${limit} tokens including request framing; no provider request sent. Required context cannot fit without revising its content; saved preparation is intact.`);
}

export async function verifyStoryInputBudget(prompt, system, schema, limit, tokenCounter) {
    checkInputLimit(0, limit);
    const tokens = await measureStoryInput(prompt, system, schema, tokenCounter);
    checkInputLimit(tokens, limit);
    return tokens;
}

// The active tokenizer may find an overrun after local assembly. Refit the
// exact outgoing prompt with the same lossless encodings before rejecting it.
// No generation call, changed evidence addresses, or provider retry is needed.
export async function fitStoryInputBudget(prompt, system, schema, limit, tokenCounter) {
    checkInputLimit(0, limit);
    let tokens = await measureStoryInput(prompt, system, schema, tokenCounter);
    if (tokens > limit) {
        let payload;
        try { payload = JSON.parse(prompt); } catch { /* Legacy non-JSON prompt: guard only. */ }
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
            for (const compact of [compactProgressPayload, compactMessagePayload]) {
                if (tokens <= limit) break;
                const candidate = compact(payload);
                if (candidate === payload) continue;
                const candidatePrompt = JSON.stringify(candidate);
                const candidateTokens = await measureStoryInput(candidatePrompt, system, schema, tokenCounter);
                if (candidateTokens < tokens) { payload = candidate; prompt = candidatePrompt; tokens = candidateTokens; }
            }
        }
    }
    checkInputLimit(tokens, limit);
    return { prompt, tokens };
}

export function storyContextJson(value) {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

export const DEVELOPMENT_CONTRACT = 'Selected material is intended story development, not a menu of chance-triggered hooks. Bring NPC/world activity into observable play when its stated circumstances fit; do not wait for the player to request activation. Until then, carry it forward without forced travel, time skips or unrelated interruptions. Could/might wording does not add a random activation gate. Player participation and outcomes remain open. Preparation is not already-accepted history; current play and explicit user choices take precedence.';

export function storyContextPayload(material, authored, { followThrough = true } = {}) {
    if (!material.length && !authored.length) return '';
    return `<tale-fairy-context>\n${storyContextJson({
        ...(material.length ? { ...(followThrough ? { development_contract: DEVELOPMENT_CONTRACT } : {}), possible_developments: material } : {}),
        ...(authored.length ? { author_instructions: authored } : {}),
    })}\n</tale-fairy-context>`;
}

export function fitStoryContext(material, authored, options) {
    const selected = [];
    let payload = storyContextPayload(selected, authored, options);
    const authorTokens = conservativeTokenCount(payload);
    for (const entry of material) {
        const candidate = storyContextPayload([...selected, entry], authored, options);
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
