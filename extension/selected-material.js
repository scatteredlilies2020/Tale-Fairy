// One integrated horizon packet, not one miniature plot per tracked subject.
const text = description => ({ type: 'string', minLength: 1, maxLength: 900, description });
export const SELECTED_MATERIAL_SCHEMA = { type: 'array', maxItems: 1,
    description: 'Zero or one integrated story possibility. Story substance only; no instructions, mood, tone, pacing or prose directives.',
    items: { type: 'object', additionalProperties: false,
        required: ['subjectIds', 'available'], properties: {
            subjectIds: { type: 'array', minItems: 1, maxItems: 4, uniqueItems: true,
                items: { type: 'string', minLength: 1, maxLength: 80 },
                description: 'Exact contributing subject ids. Exclude inaccessible subjects from every horizon.' },
            available: text('A concrete, observable NPC/world circumstance rather than a command, recap or maybe-hook. Any time, place or causal prerequisite is explicit. Not already-accepted history.'),
            developing: text('Concrete changes that could unfold across later scenes: independent NPC/world activity and its possible consequences. Not an ordered scene plan or a restatement of available.'),
            lasting: text('A specific wider possibility that can outlive the current scene, with a distinct relationship, discovery or consequence at stake. Not a generic option, guaranteed ending or success/failure branch.'),
        } },
};
// The active contract composes a fresh current circumstance with a separately
// renewed future entry. The old draft retains its smaller explicit allowance.
SELECTED_MATERIAL_SCHEMA.items.properties.available.maxLength = 1800;

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

function writerGoals(plan, entry) {
    const goals = plan?.goal?.filter(goal => entry.subjectIds.includes(goal.subjectId)) || [];
    if (!goals.length) return {};
    // Preserve the exact historical single-goal wire shape for saved swipes.
    const wire = goal => ({ aim: goal.aim, reached_when: goal.reachedWhen });
    if (goals.length === 1 && !goals[0].scope) return { story_goal: wire(goals[0]) };
    return { story_goals: goals.map(goal => ({ scope: goal.scope, ...wire(goal) })) };
}

export function selectedMaterialPacket(state, { legacyGoals = false } = {}) {
    // Hidden ownership and causes are not narrator context. Only the authored,
    // discoverable surface and its open possibilities cross this boundary.
    const accessible = state.background === undefined ? null
        : new Set(state.background.filter(entry => entry.access.route !== 'none').map(entry => entry.subjectId));
    return state.selectedMaterial.filter(entry => !accessible || entry.subjectIds.every(id => accessible.has(id)))
        .map(entry => ({
            ...(legacyGoals ? writerGoals(state.workingPlan, entry) : {}),
            ...materialHorizons(entry),
        }));
}
