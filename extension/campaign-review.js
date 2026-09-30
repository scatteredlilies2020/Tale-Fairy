import { campaignUsable, validCampaignState, EVENT_POINTS_FORMAT } from './campaign-planner.js?v=0.14.36&working-plan=1&rp-understanding=1';
import { WORKING_PLAN_VERSION, workingPlanProjection } from './working-plan.js?rp-understanding=1';

// Review coverage is not writer freshness or permission to restore old facts.
// A rewind/rebuild can invalidate the active plan while an older, fully verified
// prefix still proves that its player contributions were already reviewed.
export function campaignReviewedCount(state, context) {
    let reviewed = 0;
    const pending = [state], seen = new Set(), hashes = new Map();
    const fingerprint = messages => {
        if (!hashes.has(messages.length)) hashes.set(messages.length, context.fingerprint(messages));
        return hashes.get(messages.length);
    };
    if (campaignUsable(state, { ...context, fingerprint }) && validCampaignState(state)) return state.source.messageCount;
    while (pending.length) {
        const candidate = pending.pop();
        if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) continue;
        seen.add(candidate);
        for (const entry of Array.isArray(candidate.archive) ? candidate.archive : []) {
            if (entry?.preparation) pending.push(entry.preparation); // Full rebuild archive.
            if (entry?.legacyPreparation) pending.push({ ...entry.legacyPreparation, archive: [] });
            if (entry?.workingPlan && entry.replaced === true) {
                try {
                    pending.push({ ...entry, ...workingPlanProjection(entry.workingPlan), archive: [],
                        workingPlanVersion: WORKING_PLAN_VERSION, preparationFormat: EVENT_POINTS_FORMAT });
                } catch { /* Unknown/incomplete archive records cannot establish coverage. */ }
            }
        }
        if (candidate.source?.messageCount > reviewed
            && campaignUsable(candidate, { ...context, fingerprint }) && validCampaignState(candidate)) {
            reviewed = candidate.source.messageCount;
        }
    }
    return reviewed;
}
