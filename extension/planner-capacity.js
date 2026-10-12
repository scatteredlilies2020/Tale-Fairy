import { conservativeTokenCount } from './token-budget.js';
import { PLANNER_OUTPUT_MODE, schemaInstruction } from './output-negotiation.js?v=0.14.22&concise-prompts=1&horizon-links=3&portable-frame=1';

export const DEFAULT_PLANNER_CONTEXT = 32768;
export const PLANNER_CONTEXT_RESERVE = 512;

export function normalizePlannerContext(value) {
    return Math.max(4096, Math.min(2000000, Math.floor(Number(value) || DEFAULT_PLANNER_CONTEXT)));
}

export function plannerContextLimit(configured, providerLimit) {
    const limit = normalizePlannerContext(configured);
    const provider = Math.floor(Number(providerLimit));
    return Number.isFinite(provider) && provider > 0 ? Math.min(limit, provider) : limit;
}

export function plannerInputCapacity(target, visibleOutput, contextLimit) {
    const available = contextLimit - Math.max(128, Math.ceil(visibleOutput)) - PLANNER_CONTEXT_RESERVE;
    if (available < 1) throw Error('Planner context window cannot hold the requested output and request framing; no provider request sent.');
    return Math.min(target, available);
}

export function plannerOutputCapacity(requested, inputTokens, visibleOutput, contextLimit) {
    const available = Math.floor(contextLimit - inputTokens - PLANNER_CONTEXT_RESERVE);
    if (!Number.isFinite(available) || available < Math.max(128, Math.ceil(visibleOutput))) {
        throw Error(`Planner input ${inputTokens} plus output ${Math.max(128, Math.ceil(visibleOutput))} and reserve ${PLANNER_CONTEXT_RESERVE} exceed the ${contextLimit}-token planner context window; no provider request sent. Adjust Planner context window to the endpoint capacity or reduce required context.`);
    }
    return Math.min(Math.ceil(requested), available);
}

// Native structured output sends the full schema instead of its shorthand.
// Account for its larger representation before reserving output headroom.
export function plannerModeInputTokens(inputTokens, schema, mode) {
    if (mode !== PLANNER_OUTPUT_MODE.JSON_SCHEMA) return inputTokens;
    const extra = Math.max(0, conservativeTokenCount(JSON.stringify(schema))
        - conservativeTokenCount(JSON.stringify(schemaInstruction(schema))));
    return inputTokens + extra + 64;
}
