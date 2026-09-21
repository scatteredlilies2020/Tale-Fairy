// One integrated horizon packet, not one miniature plot per tracked subject.
const text = description => ({ type: 'string', minLength: 1, maxLength: 900, description });
export const SELECTED_MATERIAL_SCHEMA = { type: 'array', maxItems: 1,
    description: 'Zero or one plot packet. Story substance only; no mood, tone, pacing or prose directives. Include only useful horizons.',
    items: { type: 'object', additionalProperties: false,
        required: ['subjectIds', 'available'], properties: {
            subjectIds: { type: 'array', minItems: 1, maxItems: 4, uniqueItems: true,
                items: { type: 'string', minLength: 1, maxLength: 80 },
                description: 'Exact contributing subject ids. Exclude inaccessible subjects from every horizon.' },
            available: text('Relevant circumstances or opportunities, not a task recap. Unestablished prerequisites remain conditional.'),
            developing: text('Optional changes beyond this scene, not staged scenes or writing directions. Omit when unsupported or redundant.'),
            lasting: text('Optional long-term possibilities. No guaranteed ending or success/failure branches. Omit when unsupported or redundant.'),
        } },
};

export function validateSelectedMaterial(material, subjects, check, background) {
    check(material, SELECTED_MATERIAL_SCHEMA, '$.selected_material');
    const retained = new Set(subjects.map(subject => subject.id));
    if (material.some(entry => entry.subjectIds.some(id => !retained.has(id)))) {
        throw Error('Selected material references an unknown or retired subject');
    }
    if (background !== undefined) {
        const accessible = new Set(background.filter(entry => entry.access.route !== 'none').map(entry => entry.subjectId));
        if (material.some(entry => entry.subjectIds.some(id => !accessible.has(id)))) {
            throw Error('Selected material requires a currently plausible discovery route');
        }
    }
}

export const materialHorizons = entry => ({ available_circumstances: entry.available,
    ...(entry.developing ? { mid_term_possibilities: entry.developing } : {}),
    ...(entry.lasting ? { long_term_possibilities: entry.lasting } : {}) });

export function selectedMaterialPacket(state) {
    // Hidden ownership and causes are not narrator context. Only the authored,
    // discoverable surface and its open possibilities cross this boundary.
    const accessible = state.background === undefined ? null
        : new Set(state.background.filter(entry => entry.access.route !== 'none').map(entry => entry.subjectId));
    return state.selectedMaterial.filter(entry => !accessible || entry.subjectIds.every(id => accessible.has(id)))
        .map(materialHorizons);
}
