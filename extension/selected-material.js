// One integrated horizon packet, not one miniature plot per tracked subject.
const text = description => ({ type: 'string', minLength: 1, maxLength: 900, description });
export const SELECTED_MATERIAL_SCHEMA = { type: 'array', maxItems: 1,
    description: 'Zero or one integrated whole-story guidance packet, not one event or one subject. Several independent possibilities can coexist in its horizons.',
    items: { type: 'object', additionalProperties: false,
        required: ['subjectIds', 'available', 'developing', 'lasting'], properties: {
            subjectIds: { type: 'array', minItems: 1, maxItems: 4, uniqueItems: true,
                items: { type: 'string', minLength: 1, maxLength: 80 },
                description: 'Nonempty exact development ids with background.access.route other than none. EXCLUDE inaccessible subjects, even long-term contributors. Never [].' },
            available: text('Optional opportunities and relevant conditions across the RP, not a task recap or claims of completed work. Capability or delegation is not completion. Keep unestablished prerequisites conditional.'),
            developing: text('Concrete proposed subject matter for shared activities, relationships or world processes: what people could actually work on, discover or experience. Add substance beyond generic improvement, rapport or using strengths. Not the procedure for resolving the latest tasks.'),
            lasting: text('Open long-term possibilities beyond the present scene. Not alternative favorable/adverse outcomes, guaranteed endings or a next task.'),
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
    mid_term_possibilities: entry.developing, long_term_possibilities: entry.lasting });

export function selectedMaterialPacket(state) {
    // Hidden ownership and causes are not narrator context. Only the authored,
    // discoverable surface and its open possibilities cross this boundary.
    const accessible = state.background === undefined ? null
        : new Set(state.background.filter(entry => entry.access.route !== 'none').map(entry => entry.subjectId));
    return state.selectedMaterial.filter(entry => !accessible || entry.subjectIds.every(id => accessible.has(id)))
        .map(materialHorizons);
}
