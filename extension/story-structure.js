// Creative organization, not accepted history. Selected cards carry author knowledge.
export const STORY_STRUCTURE_VERSION = 1;
const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
const emptyText = maxLength => ({ ...text(maxLength), minLength: 0 });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const kinds = { type: 'string', enum: ['saga', 'arc', 'thread'] };
export const STORY_NODE_SCHEMA = object({
    id: text(80), kind: kinds, parentId: emptyText(80),
    status: { type: 'string', enum: ['proposed', 'active', 'dormant', 'resolved', 'retired'] },
    // Preserve complete legacy proposals on migration; public context has its own limits.
    title: text(240), owner: text(160), interpretation: text(1000), stakes: emptyText(600), expectation: emptyText(1201),
    links: { type: 'array', uniqueItems: true, items: text(80) },
});
export const STORY_SELECTION_SCHEMA = object({
    id: text(80), title: text(160),
    context: { type: 'array', items: object({ kind: kinds, title: text(160) }) },
    interpretation: text(800), stakes: emptyText(600), expectation: emptyText(800), development: emptyText(700),
});
// Optional on disk: older maps and authenticated swipe packets stay unchanged.
// An end condition recognizes closure; it does not prescribe its outcome.
STORY_NODE_SCHEMA.properties.endsWhen = emptyText(240);
STORY_SELECTION_SCHEMA.properties.endsWhen = emptyText(240);
// Optional on disk for old maps/swipes. A selected card carries its effects once,
// directly from the node, rather than asking the planner to repeat them in select.
export const STORY_EFFECTS_SCHEMA = { type: 'array', maxItems: 3, items: object({
    label: text(56), pressure: text(200),
}) };
STORY_NODE_SCHEMA.properties.effects = STORY_EFFECTS_SCHEMA;
export const STORY_FOUNDATION_SCHEMA = object({
    reminder: text(600), changeReason: emptyText(240), scratchpad: emptyText(1000),
});
export const STORY_FOUNDATION_RESPONSE_SCHEMA = structuredClone(STORY_FOUNDATION_SCHEMA);
STORY_FOUNDATION_RESPONSE_SCHEMA.properties.reminder.minLength = 0;
// New responses need one explanation. Keep the historical storage fields so
// saved maps and authenticated regeneration packets remain readable.
function conciseSchema(schema, limit) {
    const properties = structuredClone(schema.properties);
    for (const key of ['interpretation', 'stakes', 'expectation']) delete properties[key];
    return object({ ...properties, description: text(limit) });
}
export const STORY_NODE_RESPONSE_SCHEMA = conciseSchema(STORY_NODE_SCHEMA, 480);
export const STORY_SELECTION_RESPONSE_SCHEMA = conciseSchema(STORY_SELECTION_SCHEMA, 480);
STORY_SELECTION_RESPONSE_SCHEMA.properties.development.maxLength = 280;

export function storeStoryDescription(record, schema, check, at) {
    if (!record || typeof record !== 'object' || !Object.hasOwn(record, 'description')) return record;
    check(record, schema, at);
    const { description, ...rest } = record;
    return { ...rest, interpretation: description, stakes: '', expectation: '' };
}

export function storyNodeForPlanner(node) {
    if (node.stakes || node.expectation) return node; // Preserve complete historical preparation.
    const { interpretation, stakes: _stakes, expectation: _expectation, ...rest } = node;
    return { ...rest, description: interpretation };
}
export const STORY_STRUCTURE_SCHEMA = object({
    version: { type: 'integer', enum: [STORY_STRUCTURE_VERSION] },
    reviewAfter: { type: 'integer', minimum: 4, enum: Array.from({ length: 17 }, (_, i) => i + 4) },
    nodes: { type: 'array', items: STORY_NODE_SCHEMA }, selection: { type: 'array', items: STORY_SELECTION_SCHEMA },
});
STORY_STRUCTURE_SCHEMA.properties.foundation = STORY_FOUNDATION_SCHEMA;

export function mergeStoryFoundation(previous, supplied, check, notices) {
    // Legacy replies remain readable; omission cannot erase an existing basis.
    if (supplied === undefined) return previous ? structuredClone(previous) : undefined;
    check(supplied, STORY_FOUNDATION_RESPONSE_SCHEMA, '$.foundation');
    const next = structuredClone(supplied);
    if (!next.reminder.trim()) next.reminder = previous?.reminder || '';
    if (previous && next.reminder !== previous.reminder && !next.changeReason.trim()) {
        next.reminder = previous.reminder;
        notices.push('RP orientation retained: changing it requires a premise, role, lasting circumstance or author-direction reason.');
    }
    check(next, STORY_FOUNDATION_SCHEMA, '$.foundation');
    return next;
}
const terminal = node => ['resolved', 'retired'].includes(node.status);
const rank = { saga: 0, arc: 1, thread: 2 };

export function storyAncestors(node, rows) {
    const result = [], seen = new Set([node.id]);
    while (node.parentId) {
        if (seen.has(node.parentId)) throw Error('Cyclic story hierarchy');
        seen.add(node.parentId);
        node = rows.get(node.parentId);
        if (!node) throw Error('Story parent is unavailable');
        result.unshift(node);
    }
    return result;
}

function invalidGraph(rows) {
    const invalid = new Set();
    for (const node of rows.values()) {
        try {
            const ancestors = storyAncestors(node, rows);
            if (ancestors.some(parent => rank[parent.kind] > rank[node.kind])) throw Error('Invalid hierarchy order');
            if (!terminal(node) && node.status !== 'dormant' && ancestors.some(terminal)) throw Error('Closed parent has an active child');
            if (node.links.some(id => id === node.id || !rows.has(id))) throw Error('Invalid story link');
        } catch { invalid.add(node.id); }
    }
    return invalid;
}

export function validateStoryStructure(structure, check) {
    check(structure, STORY_STRUCTURE_SCHEMA, '$.storyStructure');
    const rows = new Map(structure.nodes.map(node => [node.id, node]));
    if (rows.size !== structure.nodes.length) throw Error('Duplicate story id');
    // A card can concern a player character. Its organizing label does not
    // authorize the writer to choose that character's actions or outcomes.
    if (invalidGraph(rows).size) throw Error('Invalid story hierarchy or links');
    const selected = new Set();
    for (const entry of structure.selection) {
        if (selected.has(entry.id)) throw Error('Duplicate selected story');
        selected.add(entry.id);
        const node = rows.get(entry.id);
        if (!node || !['proposed', 'active'].includes(node.status)) throw Error('Selected story is unavailable');
        const ancestors = storyAncestors(node, rows);
        if (ancestors.some(parent => terminal(parent) || parent.status === 'dormant')) throw Error('Selected story has an inactive parent');
        if (entry.context.length !== ancestors.length || entry.context.some((part, i) => part.kind !== ancestors[i].kind)) {
            throw Error('Public story context must match its hierarchy');
        }
    }
}

export function previousStoryNodes(plan = {}) {
    if (plan.storyStructure?.version === STORY_STRUCTURE_VERSION) return structuredClone(plan.storyStructure.nodes);
    // Read old proposals without treating their invented stages as events.
    return (plan.trajectories || []).map(row => ({ id: row.id, kind: 'thread', parentId: '', status: 'proposed',
        title: row.focus, owner: row.owner, interpretation: row.experience || row.drive,
        stakes: 'Consequences remain open.', expectation: [row.next?.change, row.later?.change].filter(Boolean).join(' '), links: [] }));
}

export function mergeStoryNodes(previous, upsert, retire, { check, newIdPrefix, notices, rejectedIds }) {
    const old = new Map(previous.map(node => [node.id, structuredClone(node)])), rows = new Map(old), updates = new Set();
    const counts = new Map();
    for (const node of upsert) if (typeof node?.id === 'string') counts.set(node.id, (counts.get(node.id) || 0) + 1);
    for (const supplied of upsert) {
        let node = supplied;
        try {
            // Omission retains effects; [] deliberately clears them. Do not mutate
            // input, archived maps or authenticated historical packets.
            if (supplied && typeof supplied === 'object' && !Array.isArray(supplied) && !Object.hasOwn(supplied, 'effects')) {
                const effects = old.get(supplied.id)?.effects;
                if (effects !== undefined || Object.hasOwn(supplied, 'description')) {
                    node = { ...supplied, effects: structuredClone(effects ?? []) };
                }
            }
            node = storeStoryDescription(node, STORY_NODE_RESPONSE_SCHEMA, check, '$.upsert[]');
            check(node, STORY_NODE_SCHEMA, '$.upsert[]');
            if (counts.get(node.id) !== 1) throw Error('Duplicate story update');
            if (!old.has(node.id) && !node.id.startsWith(newIdPrefix)) throw Error('New story requires the supplied id prefix');
            rows.set(node.id, structuredClone(node)); updates.add(node.id);
        } catch (error) {
            if (typeof node?.id === 'string') rejectedIds.add(node.id);
            notices.push(`Story withheld: ${error.message}`);
        }
    }
    // Resolve the whole graph after updates, so parents and links can arrive in any order.
    // Roll back only broken updates and their dependents, preserving valid siblings.
    while (invalidGraph(rows).size) {
        const invalid = invalidGraph(rows);
        let changed = false;
        for (const id of invalid) {
            const affected = new Set([id]);
            try { for (const parent of storyAncestors(rows.get(id), rows)) affected.add(parent.id); } catch { /* Broken path itself is rejected. */ }
            for (const candidate of affected) if (updates.has(candidate)) {
                if (old.has(candidate)) rows.set(candidate, old.get(candidate)); else rows.delete(candidate);
                updates.delete(candidate); rejectedIds.add(candidate); changed = true;
                notices.push('Story withheld: invalid hierarchy or links');
            }
        }
        if (!changed) throw Error('Saved story hierarchy is invalid');
    }
    const withdrawals = new Set();
    for (const id of retire) {
        if (typeof id !== 'string' || !rows.has(id) || updates.has(id) || withdrawals.has(id)) {
            notices.push('Unsupported or conflicting withdrawal ignored'); continue;
        }
        withdrawals.add(id);
        for (const node of rows.values()) if (node.id === id || storyAncestors(node, rows).some(parent => parent.id === id)) {
            node.status = 'retired';
        }
    }
    return [...rows.values()];
}

export function storyWriterMaterial(plan) {
    const structure = plan?.storyStructure;
    if (structure?.version !== STORY_STRUCTURE_VERSION) return [];
    const rows = new Map(structure.nodes.map(node => [node.id, node]));
    return structure.selection.filter(({ id }) => {
        const node = rows.get(id);
        return node && ['proposed', 'active'].includes(node.status)
            && storyAncestors(node, rows).every(parent => ['proposed', 'active'].includes(parent.status));
    }).map(({ id, context, title, interpretation, stakes, expectation, development, endsWhen }) => ({
        kind: rows.get(id).kind, title, ...(context.length ? { context } : {}),
        // Gate new wire fields on the optional field so legacy swipe hashes stay stable.
        ...(rows.get(id).effects !== undefined ? { status: rows.get(id).status,
            ...(rows.get(id).effects.length ? { effects: structuredClone(rows.get(id).effects) } : {}) } : {}),
        ...(stakes || expectation ? { interpretation, stakes, expectation } : { description: interpretation }),
        ...(development.trim() ? { development } : {}),
        ...(endsWhen?.trim() ? { ends_when: endsWhen } : {}),
    }));
}

export function storyReviewInterval(value = 12, state) {
    const configured = Math.min(20, Math.max(4, Math.floor(Number(value) || 12)));
    return Math.min(configured, state?.workingPlan?.storyStructure?.reviewAfter || configured);
}

// A writer may request review, but cannot close cards or establish outcomes by
// signal alone. Require a standalone final comment outside quoted/code examples.
export function writerReviewSignal(content = '') {
    const lines = String(content).trimEnd().split(/\r?\n/);
    if (!/^ {0,3}<!--tf-review-->\s*$/.test(lines.at(-1) || '')) return false;
    let fence = null;
    for (const line of lines.slice(0, -1)) {
        const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (!match) continue;
        if (!fence) fence = { char: match[1][0], size: match[1].length };
        else if (match[1][0] === fence.char && match[1].length >= fence.size && !match[2].trim()) fence = null;
    }
    return !fence;
}

// Explicit direction, scene boundaries and accepted writer signals invalidate
// guidance immediately. Ordinary dialogue is not classified by keywords.
export function storyChangeSignal(messages = []) {
    return messages.some(message => {
        const content = String(message.mes ?? message.content ?? '');
        const user = message.is_user ?? message.role === 'user';
        return user ? /(?:^|\n)\s*(?:#+\s*)?(?:\[?OOC\b|\(OOC\b|\/director\b|Correction:|Retcon:|(?:New )?Scene:|Time skip:)/i.test(content)
            : /(?:^|\n)\s*\*\*\*\s*(?:\n|$)/.test(content)
                || ((message.is_user === false || message.role === 'assistant') && writerReviewSignal(content));
    });
}

export function storyGuidanceFresh(state, messages, interval) {
    const newer = messages.slice(state.source.messageCount);
    return !storyChangeSignal(newer) && newer.filter(message => !(message.is_user ?? message.role === 'user')).length < storyReviewInterval(interval, state);
}
