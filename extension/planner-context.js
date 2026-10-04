import { compactPlannerPayload } from './planner-compaction.js';

// Only the bounded planner opts into this policy, after the host verifies the
// review checkpoint against the complete source prefix. Never infer coverage
// from a tail window, or drop an unreviewed player contribution to make it fit.
export function* optionalPlannerContexts(payload) {
    if (payload.reconsider_horizon) {
        const { reconsider_horizon, ...rest } = payload;
        payload = { ...rest, coverage: { ...rest.coverage, omitted_reconsider_horizon: true } };
        yield payload;
    }
    if (payload.prior_story_map) {
        const { prior_story_map, ...rest } = payload;
        payload = { ...rest, coverage: { ...rest.coverage, omitted_prior_story_map: true } };
        yield payload;
    }
    if (payload.external_evidence) {
        const { external_evidence, ...rest } = payload;
        payload = { ...rest, coverage: { ...rest.coverage, omitted_external_evidence: true } };
        yield payload;
    }
    const coverage = payload.coverage;
    if (coverage?.reviewed_context_optional !== true || !Number.isSafeInteger(coverage.reviewed_before)
        || coverage.reviewed_before < 1 || !Array.isArray(payload.accepted_messages)) return;
    // Keep the latest exchange even if it was reviewed (manual replan/rebuild).
    const latest = new Set(['user', 'assistant'].map(role => payload.accepted_messages.findLast(m => m.role === role)?.index));
    const optional = payload.accepted_messages.filter(m => Number.isSafeInteger(m.index)
        && m.index >= 0 && m.index < coverage.reviewed_before && !latest.has(m.index))
        .sort((a, b) => a.index - b.index);
    for (const message of optional) {
        const messages = payload.accepted_messages.filter(m => m.index !== message.index);
        payload = { ...payload, accepted_messages: messages, coverage: { ...payload.coverage,
            supplied_messages: messages.length,
            omitted_reviewed_messages: (payload.coverage.omitted_reviewed_messages || 0) + 1 } };
        yield payload;
    }
}

// Measure the entire request for each candidate. Whole optional context yields
// to source, the saved plan and fresh choices, regardless of prompt/schema size.
// Exact surviving spans retain their addresses; nothing in storage is changed.
export function fitPlannerContext(payload, measure, limit) {
    let result = compactPlannerPayload(payload, measure, limit), tokens = measure(result);
    if (tokens <= limit) return result;
    for (const candidate of optionalPlannerContexts(result)) {
        const fitted = compactPlannerPayload(candidate, measure, limit), size = measure(fitted);
        if (size < tokens) { result = fitted; tokens = size; }
        if (tokens <= limit) break;
    }
    return result;
}
