// Explicit maintenance uses the same state migrations as the live reader.
// Story interpretation and authenticated historical retries are never rewritten.
import { STATE_KEY, STATE_VERSION, loadPlannerState } from './state.js?v=0.14.23&token-budget=1&rp-plot=1&follow-through=1&working-plan=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1&player-cards=1&present-future=1&creative-planning=1&world-frame=1&portable-frame=1&chapter-labels=1&future-controls=1&writer-target=2&writer-fit=1&continuous-guidance=2&resource-policy=1&causal-effects=1&world-initiative=1&world-frame-activities=1';
import { validCampaignState } from './campaign-planner.js?v=0.14.36&token-budget=1&rp-plot=1&follow-through=1&working-plan=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1&player-cards=1&present-future=1&creative-planning=1&world-frame=1&portable-frame=1&chapter-labels=1&future-controls=1&writer-target=2&writer-fit=1&continuous-guidance=2&resource-policy=1&causal-effects=1&world-initiative=1&weighted-influences=2&future-bridges=1&world-frame-activities=1';
import { WORKING_PLAN_VERSION } from './working-plan.js?rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-life=1&future-entry=1&autonomous-life=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1&player-cards=1&present-future=1&world-frame=1&chapter-labels=1&resource-policy=1&world-frame-activities=1';
import { FUTURE_KEY, validFuture } from './future-planner.js?v=0.20.0&future-chapters=1&chapter-labels=1&portable-frame=1&world-frame=1&creative-planning=1&present-future=1&player-cards=1&story-cards=1&ensemble-pressure=1&concise-arcs=1&story-structure=1&relaxed-conditions=1&concise-prompts=1&autonomous-life=1&future-entry=1&story-life=1&story-lifecycle=1&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&persistent-entry=1&chapter-scope=2&future-cards=1&future-controls=1&causal-futures=1&context-guard=1&writer-target=2&writer-fit=1&resource-policy=1&future-notes=1&fork-sdk=1&causal-effects=1&world-initiative=1&weighted-influences=2&future-bridges=1&world-frame-activities=1';
import { hasLegacyEffects } from './story-structure.js?story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1&player-cards=1&present-future=1&world-frame=1&chapter-labels=1&resource-policy=1&weighted-influences=2&future-bridges=1&chat-maintenance=1&world-frame-activities=1';
import { GENERATION_CONTEXT_KEY, generationCachePackets, generationContextEntries } from './generation-context.js?v=0.14.34&token-budget=1&rp-plot=1&follow-through=1&working-plan=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1&player-cards=1&present-future=1&creative-planning=1&world-frame=1&portable-frame=1&chapter-labels=1&future-controls=1&writer-target=2&writer-fit=1&continuous-guidance=2&compact-cache=1&resource-policy=1&causal-effects=1&world-initiative=1&weighted-influences=2&future-bridges=1&shared-plans=1&world-frame-activities=1';

export const CHAT_MAINTENANCE_VERSION = 1;
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const supportedState = state => record(state) && Number.isSafeInteger(state.version)
    && state.version > 0 && state.version <= STATE_VERSION
    && (state.plannerContract === undefined || (Number.isSafeInteger(state.plannerContract)
        && state.plannerContract >= 0 && state.plannerContract <= 15));

export function upgradeChatMetadata(metadata) {
    const state = metadata?.[STATE_KEY];
    if (!supportedState(state) || (state.version === STATE_VERSION && state.plannerContract === 15)) return metadata;
    // Version normalization is not successful story regeneration. Retain a
    // pending marker until a real Guide/Rebuild replaces the old preparation.
    const next = { ...loadPlannerState(metadata), canonBootstrapPending: true };
    return { ...metadata, [STATE_KEY]: next };
}

export function inspectChatMetadata(metadata) {
    const checks = { metadata: 1, states: 0, plans: 0, activityRecords: 0, retryCaches: 0, futurePlans: 0 };
    const findings = [];
    const add = (code, action, count = 1) => findings.push({ code, action, count });
    const state = metadata?.[STATE_KEY];
    if (state != null) {
        checks.states++;
        if (!supportedState(state)) add('unsupported-state', 'review');
        else if (state.version < STATE_VERSION || state.plannerContract !== 15 || state.canonBootstrapPending === true) add('legacy-state', 'guide');
        const plan = state?.campaignPreparation;
        if (plan != null) {
            checks.plans++;
            const empty = record(plan) && plan.revision === 0 && !plan.campaign && !plan.workingPlan
                && Array.isArray(plan.developments) && !plan.developments.length && Array.isArray(plan.archive) && !plan.archive.length;
            if (!empty && !validCampaignState(plan)) add('invalid-plan', 'guide');
            if (!empty && (!plan?.workingPlan?.storyStructure || plan.workingPlanVersion !== WORKING_PLAN_VERSION)) add('legacy-plan', 'guide');
            const structure = plan?.workingPlan?.storyStructure;
            if (!empty && structure && (!Array.isArray(structure.foundation?.effects) || !structure.foundation.effects.length)) add('empty-world-activities', 'guide');
            const nodes = Array.isArray(structure?.nodes) ? structure.nodes : [];
            const records = [structure?.foundation, ...nodes.filter(node => ['active', 'proposed', 'dormant'].includes(node?.status))].filter(record);
            checks.activityRecords += records.length;
            const missing = records.filter(hasLegacyEffects).length;
            if (missing) add('unweighted-activities', 'guide', missing);
        }
    }
    if (metadata?.[FUTURE_KEY] != null) {
        checks.futurePlans++;
        if (!validFuture(metadata[FUTURE_KEY])) add('invalid-future', 'review');
    }
    const cache = metadata?.[GENERATION_CONTEXT_KEY];
    if (cache != null) {
        checks.retryCaches++;
        // Check each packet independently: the runtime's last-N retention limit
        // is not corruption. Never "repair" an unauthenticated retry into trust.
        const rejected = generationCachePackets(cache).filter(packet =>
            !generationContextEntries({ version: 1, entries: [packet] }).length).length;
        if (rejected) add('rejected-retries', 'review', rejected);
    }
    return { checks, findings, needsGuide: findings.some(item => item.action === 'guide'), needsReview: findings.some(item => item.action === 'review') };
}
