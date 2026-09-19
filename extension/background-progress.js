// Private, provisional world-side developments. Never an accepted-event ledger
// or a turn-based simulator: the planner assesses fictional time and causality.
const text = (maxLength, description) => ({ type: 'string', minLength: 1, maxLength, description });
export const BACKGROUND_SCHEMA = { type: 'array', maxItems: 4,
    description: 'Complete private snapshot: exactly one record per retained/new enduring subject, including inaccessible ones. Not narration or canon.',
    items: { type: 'object', additionalProperties: false,
        required: ['subjectId', 'unfolding', 'basis', 'access'], properties: {
            subjectId: text(80, 'Exact enduring subject id.'),
            unfolding: text(700, 'NPC/world activity or process that can develop independently. A provisional possibility, not an unseen accomplished fact or player action.'),
            basis: text(500, 'Source-grounded cause and fictional time or conditions supporting this stage. If time or prerequisites are unknown, retain the conditional stage; message count is not elapsed time.'),
            access: { type: 'object', additionalProperties: false, required: ['route', 'basis'], properties: {
                route: { type: 'string', enum: ['none', 'direct', 'local', 'contact', 'information', 'investigation'],
                    description: 'Access to a currently available trace or opportunity, not full private knowledge. information needs an existing relevant report or announcement, not just a channel for future news. none if no surface is available. direct includes nonhuman processes.' },
                basis: text(500, 'The accessible surface and its knowledge limits, or why none can reach current play. Do not invent a contact, trip, discovery or time jump to open access.'),
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
