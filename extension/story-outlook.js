// A selected future is not the local scene's next task. Its authored, public
// possibilities persist independently; every review must renew their access.
const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const OUTLOOK_SCHEMA = { type: 'array', maxItems: 1, items: object({
    trajectoryId: text(80), developing: text(900), lasting: text(900),
}) };
export const OUTLOOK_REVIEW_SCHEMA = object({
    action: { type: 'string', enum: ['keep', 'replace', 'clear'] },
    reason: text(300), material: OUTLOOK_SCHEMA,
});

export function outlookRoute(plan, outlook) {
    const opening = plan.openings?.find(row => row.trajectoryId === outlook.trajectoryId && row.access.route !== 'none');
    if (opening) return { id: opening.trajectoryId, circumstance: opening.circumstance, access: opening.access };
    const local = plan.developments.find(row => row.trajectoryIds?.includes(outlook.trajectoryId) && row.access.route !== 'none');
    return local ? { id: local.id, access: local.access } : null;
}

export function validateOutlook(plan, check) {
    if (plan.outlook === undefined) return; // Historical saved plans.
    check(plan.outlook, OUTLOOK_SCHEMA, '$.plan.outlook');
    for (const outlook of plan.outlook) {
        if (!plan.trajectories?.some(row => row.id === outlook.trajectoryId && row.experience)) {
            throw Error('Selected outlook requires a retained substantive trajectory');
        }
        if (outlook.developing.trim().toLocaleLowerCase() === outlook.lasting.trim().toLocaleLowerCase()) {
            throw Error('Selected outlook needs distinct intermediate and farther possibilities');
        }
        if (!outlookRoute(plan, outlook)) throw Error('Selected outlook needs a renewed accessible opening or linked local development; revise access or explicitly clear it');
    }
}

export function reviewOutlook(previous, plan, review, check) {
    check(review, OUTLOOK_REVIEW_SCHEMA, '$.outlook');
    if (review.action === 'replace') {
        if (review.material.length !== 1) throw Error('Replacing the outlook requires one complete future');
        plan.outlook = structuredClone(review.material);
    } else {
        if (review.material.length) throw Error('Only replace can author outlook material');
        plan.outlook = review.action === 'clear' ? [] : structuredClone(previous.outlook || []);
        if (review.action === 'keep') {
            if (!plan.outlook.length) throw Error('No previous outlook to keep; replace or clear');
            const id = plan.outlook[0].trajectoryId;
            if (JSON.stringify(previous.trajectories?.find(row => row.id === id)) !== JSON.stringify(plan.trajectories?.find(row => row.id === id))) {
                throw Error('Prepared trajectory changed or retired; replace or clear its selected outlook');
            }
        }
    }
    validateOutlook(plan, check);
    return plan.outlook;
}

export function composeOutlookMaterial(current, plan) {
    const outlook = plan.outlook?.[0];
    if (!outlook) return structuredClone(current);
    const route = outlookRoute(plan, outlook);
    if (!route) throw Error('Selected outlook has no accessible route');
    const entry = current[0];
    if (!route.circumstance && !entry?.subjectIds.includes(route.id)) {
        throw Error('A locally tracked outlook needs its entry and prerequisites in selected current material');
    }
    return [{ subjectIds: [...new Set([...(entry?.subjectIds || []), route.id])],
        // Access bases and local initiatives are private reasoning. Only the
        // explicitly authored surface crosses into the writer packet.
        available: [entry?.available, route.circumstance].filter(Boolean).join('\n\n'),
        developing: outlook.developing, lasting: outlook.lasting }];
}

export function validateOutlookSelection(plan, material) {
    if (plan.outlook === undefined) return;
    const outlook = plan.outlook[0], entry = material?.[0];
    if (outlook) {
        const route = outlookRoute(plan, outlook);
        if (!entry?.subjectIds.includes(route?.id) || entry.developing !== outlook.developing || entry.lasting !== outlook.lasting) {
            throw Error('Writer horizons must match the selected outlook and its renewed route');
        }
    } else if (entry?.developing || entry?.lasting) throw Error('Current circumstances cannot substitute for a cleared outlook');
}
