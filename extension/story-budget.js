import { conservativeTokenCount } from './token-budget.js?story-budget=1';
import { plannerMessages, PLANNER_OUTPUT_MODE } from './output-negotiation.js?v=0.14.22&concise-prompts=1&horizon-links=3';
import { compactProgressPayload, compactMessagePayload } from './planner-compaction.js';
import { optionalPlannerContexts } from './planner-context.js?soft-targets=1&story-map=1&story-goal=2&story-throughline=1&story-life=1&creative-planning=1';

// Capacity, not a fill target: leave room for richer cards and author notes.
export const WRITER_CONTEXT_TOKEN_LIMIT = 2400;
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
// exact outgoing prompt with lossless encodings, then whole optional context.
// The caller returns the sent prompt to evidence validation. No generation call,
// changed evidence addresses, or provider retry is needed.
export async function fitStoryInputBudget(prompt, system, schema, limit, tokenCounter, { softTarget = false } = {}) {
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
            if (tokens > limit) for (const candidate of optionalPlannerContexts(payload)) {
                let fitted = candidate, candidatePrompt = JSON.stringify(fitted);
                let candidateTokens = await measureStoryInput(candidatePrompt, system, schema, tokenCounter);
                for (const compact of [compactProgressPayload, compactMessagePayload]) {
                    if (candidateTokens <= limit) break;
                    const encoded = compact(fitted);
                    if (encoded === fitted) continue;
                    const encodedPrompt = JSON.stringify(encoded);
                    const encodedTokens = await measureStoryInput(encodedPrompt, system, schema, tokenCounter);
                    if (encodedTokens < candidateTokens) { fitted = encoded; candidatePrompt = encodedPrompt; candidateTokens = encodedTokens; }
                }
                if (candidateTokens < tokens) { prompt = candidatePrompt; tokens = candidateTokens; }
                if (tokens <= limit) break;
            }
        }
    }
    if (!softTarget) checkInputLimit(tokens, limit);
    return { prompt, tokens, overTarget: Math.max(0, tokens - limit) };
}

export function storyContextJson(value) {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

// Historical wire text is retained only to authenticate immutable saved swipes.
// New writer packets contain story material, not application-written directives.
export const DEVELOPMENT_CONTRACT = 'Selected material is intended story development, not a menu of chance-triggered hooks. Bring NPC/world activity into observable play when its stated circumstances fit; do not wait for the player to request activation. Until then, carry it forward without forced travel, time skips or unrelated interruptions. Could/might wording does not add a random activation gate. Player participation and outcomes remain open. Preparation is not already-accepted history; current play and explicit user choices take precedence.';

// Added only for goal-bearing preparations. Keep the old contract/serialization
// intact so historical swipe snapshots still authenticate without a reset.
export const STORY_GOAL_CONTRACT = 'Work toward story_goal through NPC/world activity, not merely the latest reaction. It is your narrative aim, not the player\'s obligation or a guaranteed ending. Let steps produce observable progress instead of repeated offers or new prerequisites. Quiet interaction may serve the goal; do not interrupt every reply or change the user\'s prose, tone or pacing. Check newer play first: if reached, declined or contradicted, stop pursuing it rather than replaying or forcing it. Otherwise carry it across replies while respecting access and player choice.';

export const STORY_GOALS_CONTRACT = 'story_goals are coexisting writer aims, not the player\'s obligations or guaranteed endings. Long-term direction, near-term goals and independent side threads need not converge. Advance what fits through observable NPC/world activity, not repeated offers or new prerequisites. Do not service every goal each reply, rotate on a timer, or derail quiet interaction. Respect access, player choice and the user\'s prose, tone and pacing. Check newer play: stop pursuing any goal reached, declined or contradicted; other unfinished goals may continue. A near-term completion need not end its wider direction or spawn a replacement. Unselected threads are not resolved, and preparation is not history.';

export const STORY_MOVEMENT_BASIS = 'Sustain appropriate movement across this RP, not a schedule of events: independent interests, relationships, discoveries and opportunities can develop without centering one protagonist. Quiet scenes need no interruption. Invent compatible substance; do not force convergence, escalation, player actions or outcomes. Broader awareness is not character knowledge; proposals and canon expectations are not established events.';

export function storyContextPayload(material, authored, { legacyContracts = false, followThrough = true, storyStructure = false, orientation = '' } = {}) {
    if (!material.length && !authored.length && !orientation) return '';
    return `<tale-fairy-context>\n${storyContextJson({
        ...(storyStructure && (material.length || orientation) ? { preparation_basis: 'Story expectations, not established events or player obligations. Current play takes precedence. Ignore completed, declined or contradicted developments.' } : {}),
        ...(storyStructure && material.some(entry => entry.effects?.length) ? {
            effect_basis: 'Effects are ongoing author-level pressures, including hidden influences, not mandatory events. Let them shape fitting opportunities across the world; characters discover secrets through play. Honor quiet moments and stop applying an effect when newer play ends or contradicts it.',
        } : {}),
        // New-format cards opt in; immutable historical packets keep their bytes.
        ...(storyStructure && material.some(entry => entry.status !== undefined) ? {
            review_signal: 'When play completes or materially changes a card or world frame, end with a separate line: <!--tf-review-->. Otherwise omit. This requests review, not an outcome.',
        } : {}),
        ...(orientation ? { rp_orientation: orientation, movement_basis: STORY_MOVEMENT_BASIS } : {}),
        ...(material.length ? { ...(legacyContracts && followThrough ? { development_contract: DEVELOPMENT_CONTRACT } : {}), [storyStructure ? 'story_context' : 'possible_developments']: material } : {}),
        ...(legacyContracts && material.some(entry => entry.story_goal) ? { story_goal_contract: STORY_GOAL_CONTRACT } : {}),
        ...(legacyContracts && material.some(entry => entry.story_goals?.length) ? { story_goals_contract: STORY_GOALS_CONTRACT } : {}),
        ...(authored.length ? { author_instructions: authored } : {}),
    })}\n</tale-fairy-context>`;
}

export function fitStoryContext(material, authored, options = {}) {
    const selected = [];
    const authorTokens = conservativeTokenCount(storyContextPayload([], authored, { ...options, orientation: '' }));
    let fittedOptions = options;
    let payload = storyContextPayload(selected, authored, fittedOptions);
    const orientationOmitted = Boolean(options.orientation && conservativeTokenCount(payload) > WRITER_CONTEXT_TOKEN_LIMIT);
    if (orientationOmitted) {
        fittedOptions = { ...options, orientation: '' };
        payload = storyContextPayload(selected, authored, fittedOptions);
    }
    for (const entry of material) {
        const candidate = storyContextPayload([...selected, entry], authored, fittedOptions);
        // Never clip a sentence, separate a prerequisite from its possibility,
        // or split an integrated horizon packet. Saved preparation is untouched.
        if (conservativeTokenCount(candidate) <= WRITER_CONTEXT_TOKEN_LIMIT) {
            selected.push(entry);
            payload = candidate;
        }
    }
    return { payload, tokens: conservativeTokenCount(payload), limit: WRITER_CONTEXT_TOKEN_LIMIT,
        omitted: material.length - selected.length, authorTokens,
        authorOverflow: authorTokens > WRITER_CONTEXT_TOKEN_LIMIT, orientationOmitted };
}
