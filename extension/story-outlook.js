// A selected future is not the local scene's next task. Its authored, public
// possibilities persist independently; every review must renew their access.
const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
export const OUTLOOK_SCHEMA = { type: 'array', maxItems: 2, items: object({
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
    if (new Set(plan.outlook.map(row => row.trajectoryId)).size !== plan.outlook.length) throw Error('Duplicate selected outlook');
    for (const outlook of plan.outlook) {
        if (!plan.trajectories?.some(row => row.id === outlook.trajectoryId && row.experience)) {
            throw Error(`Selected outlook requires a retained substantive trajectory: ${outlook.trajectoryId} is unavailable; choose from ${(plan.trajectories || []).filter(row => row.experience).map(row => row.id).join(', ') || '(none)'}, or clear`);
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
        if (!review.material.length) throw Error('Replacing the outlook requires one or two complete futures');
        plan.outlook = structuredClone(review.material);
    } else {
        if (review.material.length) throw Error('Only replace can author outlook material');
        plan.outlook = review.action === 'clear' ? [] : structuredClone(previous.outlook || []);
        if (review.action === 'keep') {
            if (!plan.outlook.length) throw Error('No previous outlook to keep; replace or clear');
            for (const { trajectoryId: id } of plan.outlook) {
                if (JSON.stringify(previous.trajectories?.find(row => row.id === id)) !== JSON.stringify(plan.trajectories?.find(row => row.id === id))) {
                    throw Error('Prepared trajectory changed or retired; replace or clear its selected outlook');
                }
            }
        }
    }
    validateOutlook(plan, check);
    return plan.outlook;
}

export function composeOutlookMaterial(current, plan) {
    if (!plan.outlook?.length) return structuredClone(current);
    const routes = plan.outlook.map(outlook => outlookRoute(plan, outlook));
    if (routes.some(route => !route)) throw Error('Selected outlook has no accessible route');
    const entry = current[0];
    if (routes.some(route => !route.circumstance && !entry?.subjectIds.includes(route.id))) {
        throw Error('A locally tracked outlook needs its entry and prerequisites in selected current material');
    }
    return [{ subjectIds: [...new Set([...(entry?.subjectIds || []), ...routes.map(route => route.id)])],
        // Access bases and local initiatives are private reasoning. Only the
        // explicitly authored surface crosses into the writer packet.
        available: [...new Set([entry?.available, ...routes.map(route => route.circumstance)].filter(Boolean))].join('\n\n'),
        ...outlookHorizons(plan) }];
}

// Keep single-future serialization identical for historical saved packets.
export const outlookHorizons = plan => ({
    developing: (plan.outlook || []).map(row => row.developing).join('\n\n'),
    lasting: (plan.outlook || []).map(row => row.lasting).join('\n\n'),
});

export function validateOutlookSelection(plan, material) {
    if (plan.outlook === undefined) return;
    const entry = material?.[0];
    if (plan.outlook.length) {
        const horizons = outlookHorizons(plan);
        if (plan.outlook.some(outlook => !entry?.subjectIds.includes(outlookRoute(plan, outlook)?.id))
            || entry.developing !== horizons.developing || entry.lasting !== horizons.lasting) {
            throw Error('Writer horizons must match the selected outlook and its renewed route');
        }
    } else if (entry?.developing || entry?.lasting) throw Error('Current circumstances cannot substitute for a cleared outlook');
}
