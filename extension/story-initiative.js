// One selected NPC/world move, not a player objective or proof of enactment.
import { SPAN_WITNESS_SCHEMA } from './accepted-witnesses.js?v=0.14.34&partial-evidence=1';

const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const INITIATIVE_SURFACE_SCHEMA = object({
    prerequisite: { ...text(300), minLength: 0, description: 'Broad encounter condition only where needed. Empty means no additional prerequisite; retain real timing, distance or participation dependencies.' },
    action: { ...text(500), description: 'NPC/world initiative in one brief sentence. Describe what begins or changes; leave incidental props, exact gestures, dialogue and execution open.' },
});
export const INITIATIVE_SCHEMA = { type: 'array', maxItems: 1, items: object({
    id: text(80), trajectoryId: text(80), owner: text(160), ...INITIATIVE_SURFACE_SCHEMA.properties,
}) };
export const INITIATIVE_REVIEW_SCHEMA = object({
    action: { type: 'string', enum: ['keep', 'replace', 'withdraw', 'introduced'] },
    reason: text(300), material: INITIATIVE_SCHEMA,
    evidence: { type: 'array', maxItems: 3, items: SPAN_WITNESS_SCHEMA },
});
export const INITIATIVE_RECEIPT_SCHEMA = { type: 'array', maxItems: 1, items: object({
    id: text(80), disposition: { type: 'string', enum: ['introduced', 'withdrawn'] }, reason: text(300),
    witnesses: { type: 'array', maxItems: 3, items: object({ index: { type: 'integer', minimum: 0 }, quote: text(1000) }) },
}) };

export const initiativeSurface = plan => {
    const entry = plan.initiative?.[0];
    return entry ? { prerequisite: entry.prerequisite, action: entry.action } : undefined;
};

export function validateInitiative(plan, check, playerNames = []) {
    if (plan.initiative === undefined) return; // Historical preparation.
    check(plan.initiative, INITIATIVE_SCHEMA, '$.plan.initiative');
    check(plan.initiativeReceipt || [], INITIATIVE_RECEIPT_SCHEMA, '$.plan.initiativeReceipt');
    for (const receipt of plan.initiativeReceipt || []) {
        if ((receipt.disposition === 'introduced') !== Boolean(receipt.witnesses.length)) {
            throw Error('Introduced initiative requires witnesses; withdrawal is not an event');
        }
    }
    const entry = plan.initiative[0];
    if (!entry) return;
    const trajectory = plan.trajectories?.find(row => row.id === entry.trajectoryId && row.experience);
    const opening = plan.openings?.find(row => row.trajectoryId === entry.trajectoryId);
    if (plan.futureEntryVersion !== 1 || !trajectory || !opening?.futureEntry || opening.access.route === 'none') {
        throw Error('Selected initiative requires a retained substantive trajectory and renewed public opening');
    }
    if (entry.owner !== trajectory.owner || playerNames.some(name => name.trim().toLocaleLowerCase() === entry.owner.trim().toLocaleLowerCase())) {
        throw Error('Selected initiative must belong to its NPC/world trajectory owner, never the player');
    }
    if (!entry.action.trim()) throw Error('Selected initiative needs a nonempty action');
    if (plan.initiativeReceipt?.some(receipt => receipt.id === entry.id)) throw Error('An ended initiative cannot be selected again');
}

export function reviewInitiative(previous, plan, review, { check, resolve, prefix, sourceCount = 0, playerNames = [] }) {
    check(review, INITIATIVE_REVIEW_SCHEMA, '$.initiative_review');
    const old = previous.initiative?.[0];
    plan.initiativeReceipt = structuredClone(previous.initiativeReceipt || []);
    if (review.action !== 'introduced' && review.evidence.length) throw Error('Only introduced initiatives can claim event evidence');
    if (review.action === 'keep') {
        if (!old || review.material.length) throw Error('Keep requires an existing initiative and empty material');
        plan.initiative = structuredClone(previous.initiative);
    } else {
        if (review.action === 'introduced') {
            if (!old || !review.evidence.length || review.evidence.some(ref => ref.index < sourceCount)) {
                throw Error('Introduction requires a previous initiative and newly accepted witnesses');
            }
            plan.initiativeReceipt = [{ id: old.id, disposition: 'introduced', reason: review.reason, witnesses: resolve(review.evidence) }];
        } else if (old && (review.action === 'withdraw' || review.material[0]?.id !== old.id)) {
            plan.initiativeReceipt = [{ id: old.id, disposition: 'withdrawn', reason: review.reason, witnesses: [] }];
        }
        if (review.action === 'withdraw' && review.material.length) throw Error('Withdrawal requires empty initiative material');
        if (review.action === 'replace' && !review.material.length) throw Error('Replace requires a selected initiative');
        plan.initiative = structuredClone(review.material);
        const next = plan.initiative[0];
        if (next) {
            if (next.id === old?.id) {
                if (review.action === 'introduced' || next.trajectoryId !== old.trajectoryId || next.owner !== old.owner) {
                    throw Error('An initiative id cannot restart or change its subject');
                }
            } else if (!next.id.startsWith(prefix)) throw Error('New initiative requires the supplied id prefix');
        }
    }
    validateInitiative(plan, check, playerNames);
}
