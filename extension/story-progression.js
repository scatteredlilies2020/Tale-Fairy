// Private causal preparation. Local scene plans are replaced; these longer
// trajectories survive until explicitly revised or retired. Neither is history.
const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const list = (items, maxItems) => ({ type: 'array', maxItems, items });
const stage = object({ when: text(110), change: text(140) });
export const TRAJECTORIES_SCHEMA = list(object({
    id: text(80), focus: text(120), owner: text(80), basis: text(140), drive: text(100),
    next: stage, later: stage,
}), 3);
export const PROGRESSION_PATCH_SCHEMA = object({
    upsert: structuredClone(TRAJECTORIES_SCHEMA),
    retire: list(object({ id: text(80), reason: text(140) }), 3),
});

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
