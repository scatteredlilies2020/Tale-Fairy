// Private, provisional world-side developments. Never an accepted-event ledger
// or a turn-based simulator: the planner assesses fictional time and causality.
const text = (maxLength, description) => ({ type: 'string', minLength: 1, maxLength, description });
export const BACKGROUND_SCHEMA = { type: 'array', maxItems: 4,
    description: 'Complete private snapshot: exactly one record per retained/new enduring subject, including inaccessible ones. Not narration or canon.',
    items: { type: 'object', additionalProperties: false,
        required: ['subjectId', 'unfolding', 'basis', 'access'], properties: {
            subjectId: text(80, 'Exact enduring subject id.'),
            unfolding: text(700, 'Invent specific compatible NPC/world activity, intentions or possible discoveries. Provisional preparation, not an unseen accomplished fact or player action. More than routines continuing or results remaining unknown.'),
            basis: text(500, 'Explain consistency with established capabilities, interests, causes and fictional time; invented possibilities need no prior enactment. Unknown prerequisites remain conditional; message count is not elapsed time.'),
            access: { type: 'object', additionalProperties: false, required: ['route', 'basis'], properties: {
                route: { type: 'string', enum: ['none', 'direct', 'local', 'contact', 'information', 'investigation'],
                    description: 'Plausible access through current people, places, interests or plans, not full private knowledge. Proposed opportunities need not already be enacted. none for unreachable or unrelated private activity; direct includes nonhuman processes.' },
                basis: text(500, 'Name the existing bridge and proposed discoverable surface, or explain why none can reach play. Required contact, travel or discovery stays conditional; do not claim it already happened or reveal secrets.'),
            } },
        } },
};

export function validateBackground(background, subjects, check) {
    check(background, BACKGROUND_SCHEMA, '$.background');
    const ids = new Set(background.map(entry => entry.subjectId));
    if (ids.size !== background.length || ids.size !== subjects.length
        || subjects.some(subject => !ids.has(subject.id))) {
        throw Error('Background requires exactly one record per retained subject');
    }
}
