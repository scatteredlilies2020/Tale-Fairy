// Private causal preparation. Local scene plans are replaced; these longer
// trajectories survive until explicitly revised or retired. Neither is history.
const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const list = (items, maxItems) => ({ type: 'array', ...(maxItems === undefined ? {} : { maxItems }), items });
// Safety ceilings, not drafting targets. Concrete preparation needs room for
// complete conditions and substance; the workshop has its own total soft target.
const stage = object({
    when: { ...text(300), minLength: 0, description: 'Broad dependency if this experience needs one; otherwise empty. No exact activation cue or invented condition.' },
    change: text(600),
});
export const TRAJECTORIES_SCHEMA = list(object({
    id: text(80), focus: text(240), owner: text(160), basis: text(400), drive: text(300),
    next: stage, later: stage,
}));
// Three useful futures is a drafting target. Patches retain omitted proposals,
// so a merged horizon must not discard them or fail merely for exceeding it.
// Older saved trajectories remain readable. The separate horizon preparer
// requires this concrete playable substance on every new/revised possibility.
TRAJECTORIES_SCHEMA.items.properties.experience = text(1000);
// Creative relationship to the present, not a genre or a novelty quota.
TRAJECTORIES_SCHEMA.items.properties.connection = { type: 'string', enum: ['independent', 'continuation', 'recurrence'] };
export const PROGRESSION_PATCH_SCHEMA = object({
    upsert: structuredClone(TRAJECTORIES_SCHEMA),
    retire: list(object({ id: text(80), reason: text(400) })),
});

// A story's developing direction is separate from the optional episode shelf.
// Links make it operational without prescribing a player goal or an ending.
export const THROUGHLINE_SCHEMA = list(object({
    focus: text(320), basis: text(320), trajectoryIds: { ...list(text(80)), minItems: 1 },
}), 1);

// The RP's continuing life is not the latest incident enlarged into an arc.
// Optional on disk for older plans; required by the wider workshop.
export const STORY_LIFE_SCHEMA = object({
    scope: { type: 'string', enum: ['open', 'bounded', 'undetermined'] },
    premise: text(400), currentEpisode: text(300), continuingLife: text(700),
    horizonIds: list(text(80)),
});

export function validateStoryLife(plan, check) {
    if (plan.storyLife === undefined) return;
    check(plan.storyLife, STORY_LIFE_SCHEMA, '$.plan.storyLife');
    const ids = plan.storyLife.horizonIds;
    if (new Set(ids).size !== ids.length || ids.some(id => !plan.trajectories?.some(t => t.id === id && t.experience))) {
        throw Error('Story life requires distinct retained substantive horizonIds');
    }
}

export function validateThroughline(plan, check) {
    if (plan.throughline === undefined) return; // Historical saved plans.
    check(plan.throughline, THROUGHLINE_SCHEMA, '$.plan.throughline');
    for (const row of plan.throughline) {
        if (new Set(row.trajectoryIds).size !== row.trajectoryIds.length
            || row.trajectoryIds.some(id => !plan.trajectories?.some(t => t.id === id && t.experience))) {
            throw Error('Story throughline requires distinct retained substantive trajectories');
        }
    }
}

export function validateTrajectories(rows, check, playerNames = []) {
    check(rows, TRAJECTORIES_SCHEMA, '$.plan.trajectories');
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw Error('Duplicate progression id');
    const players = new Set(playerNames.map(name => name.trim().toLocaleLowerCase()));
    if (rows.some(row => players.has(row.owner.trim().toLocaleLowerCase()))) throw Error('Player cannot own a planned trajectory');
    if (rows.some(row => row.next.change.trim().toLocaleLowerCase() === row.later.change.trim().toLocaleLowerCase())) {
        throw Error('Progression needs distinct intermediate and longer-range changes');
    }
}

export function mergeProgression(previous, patch, prefix, check, playerNames = []) {
    check(patch, PROGRESSION_PATCH_SCHEMA, '$.progression');
    validateTrajectories(previous, check);
    validateTrajectories(patch.upsert, check, playerNames);
    const rows = new Map(previous.map(row => [row.id, structuredClone(row)]));
    const retired = new Set(patch.retire.map(row => row.id));
    if (retired.size !== patch.retire.length) throw Error('Duplicate progression retirement');
    for (const id of retired) {
        if (!rows.delete(id)) throw Error('Progression retirement requires a previous trajectory');
    }
    for (const row of patch.upsert) {
        if (retired.has(row.id)) throw Error('A trajectory cannot be updated and retired together');
        if (!rows.has(row.id) && !row.id.startsWith(prefix)) throw Error('New trajectory requires the supplied id prefix');
        rows.set(row.id, structuredClone(row));
    }
    const result = [...rows.values()];
    validateTrajectories(result, check, playerNames);
    return result;
}
