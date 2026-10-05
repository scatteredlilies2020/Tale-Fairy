import { campaignUsable, validCampaignState, EVENT_POINTS_FORMAT } from './campaign-planner.js?v=0.14.36&working-plan=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1';
import { WORKING_PLAN_VERSION, workingPlanProjection } from './working-plan.js?rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-life=1&future-entry=1&autonomous-life=1&relaxed-conditions=1&rp-departures=1';

// Review coverage is not writer freshness or permission to restore old facts.
// A rewind/rebuild can invalidate the active plan while an older, fully verified
// prefix still proves that its player contributions were already reviewed.
export function campaignReviewedCount(state, context) {
    return campaignCheckpoint(state, context)?.source.messageCount || 0;
}

// Recover actual preparation only after validating its entire shape AND exact
// source prefix. Never rebind an invalid post-response plan to a shorter source.
// Freshness is a separate writer check; stale checkpoints can seed a new review.
export function campaignCheckpoint(state, context) {
    return findCheckpoint(state, context, false);
}

// Reference changes invalidate guidance, facts and coverage, but need not erase
// compatible ideas. Only exact same-chat accepted prefixes can supply proposals.
// The workshop must explicitly re-author these against the new references.
export function campaignReconsideration(state, context) {
    if (context.rebuild) return null;
    const candidate = findCheckpoint(state, context, true);
    if (!candidate?.workingPlan || candidate.source.referenceHash === context.referenceHash) return null;
    const { rpUnderstanding, throughline, storyLife, trajectories } = candidate.workingPlan;
    return structuredClone({ ...(rpUnderstanding ? { rpUnderstanding } : {}),
        ...(throughline ? { throughline } : {}), ...(storyLife ? { storyLife } : {}), trajectories: trajectories || [] });
}

function findCheckpoint(state, context, reconsider) {
    let best = null;
    const pending = [state], seen = new Set(), hashes = new Map();
    const fingerprint = messages => {
        if (!hashes.has(messages.length)) hashes.set(messages.length, context.fingerprint(messages));
        return hashes.get(messages.length);
    };
    const usable = candidate => campaignUsable(candidate, { ...context, fingerprint,
        ...(reconsider ? { referenceHash: candidate?.source?.referenceHash } : {}) }) && validCampaignState(candidate);
    if (usable(state)) return state;
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
        if ((!best || candidate.source?.messageCount > best.source.messageCount
            || candidate.source?.messageCount === best.source.messageCount && candidate.revision > best.revision)
            && usable(candidate)) {
            best = candidate;
        }
    }
    return best;
}

export function verifiedClosedSubjects(state, context) {
    const pending = [state], seen = new Set(), closed = new Set(), hashes = new Map();
    const fingerprint = messages => {
        if (!hashes.has(messages.length)) hashes.set(messages.length, context.fingerprint(messages));
        return hashes.get(messages.length);
    };
    while (pending.length) {
        const item = pending.pop();
        if (!item || seen.has(item)) continue;
        seen.add(item);
        for (const entry of Array.isArray(item.archive) ? item.archive : []) {
            if (entry?.preparation) pending.push(entry.preparation);
            for (const exit of Array.isArray(entry?.transitions) ? entry.transitions : []) {
                if (typeof exit?.id === 'string' && ['closed', 'changed'].includes(exit.disposition)
                    && campaignUsable({ source: exit.source }, { ...context, fingerprint })) closed.add(exit.id);
            }
        }
    }
    return [...closed];
}
