const TYPES = new Set(['challenge', 'opportunity', 'discovery', 'encounter', 'quest-hook']);
const SCOPES = new Set(['scene', 'days', 'arc']);
const PERSISTENCE = new Set(['transient', 'local', 'ongoing']);
const STATUSES = new Set(['available', 'engaged', 'retired']);
const ORIGINS = new Set(['established', 'inferred', 'original']);
const MAX_SITUATIONS = 6;

const text = (value, limit) => String(value ?? '').trim().replace(/\s+/gu, ' ').slice(0, limit);
const pick = (value, set, fallback) => set.has(String(value ?? '').trim().toLowerCase()) ? String(value).trim().toLowerCase() : fallback;

export const SITUATION_TYPES = Object.freeze([...TYPES]);

export function defaultSituationBoard() {
    return { items: [], lastSelectedId: '' };
}

export function normalizeSituation(value = {}) {
    const status = pick(value.status, STATUSES, 'available');
    return {
        id: text(value.id, 80),
        type: pick(value.type, TYPES, 'opportunity'),
        premise: text(value.premise, 260),
        cause: text(value.cause, 220),
        entry: text(value.entry, 220),
        scope: pick(value.scope, SCOPES, 'scene'),
        persistence: pick(value.persistence, PERSISTENCE, 'local'),
        status,
        origin: pick(value.origin, ORIGINS, 'inferred'),
        updatedAtTurn: Math.max(0, Number(value.updatedAtTurn ?? value.updated_at_turn) || 0),
    };
}

export function normalizeSituationBoard(value = {}) {
    const items = (Array.isArray(value.items) ? value.items : [])
        .slice(0, MAX_SITUATIONS)
        .map(normalizeSituation)
        .filter(item => item.id && item.premise && item.cause && item.entry && item.status !== 'retired');
    return {
        items,
        lastSelectedId: text(value.lastSelectedId ?? value.last_selected_id, 80),
    };
}

export function mergeSituationUpdates(previous, updates, { currentTurn = 0, full = false } = {}) {
    const prior = normalizeSituationBoard(previous);
    const byId = new Map(prior.items.map(item => [item.id.toLowerCase(), item]));
    if (full) byId.clear();
    for (const raw of Array.isArray(updates) ? updates : []) {
        const update = normalizeSituation(raw);
        const id = update.id.toLowerCase();
        if (!id) continue;
        if (raw?.op === 'retire' || update.status === 'retired') {
            byId.delete(id);
            continue;
        }
        const existing = byId.get(id);
        byId.set(id, { ...(existing || {}), ...update, updatedAtTurn: Math.max(currentTurn, update.updatedAtTurn) });
    }
    return {
        items: [...byId.values()].filter(item => item.status !== 'retired').slice(0, MAX_SITUATIONS),
        lastSelectedId: prior.lastSelectedId,
    };
}

function lower(value) { return String(value ?? '').toLocaleLowerCase(); }

export function selectSituationalOpenings(board, { scene = {}, sceneProfile = {}, latestUserAction = '', explicitInstruction = '' } = {}) {
    const normalized = normalizeSituationBoard(board);
    const instruction = lower(`${latestUserAction} ${explicitInstruction}`);
    const closed = String(sceneProfile.intrusion || '').toLowerCase() === 'closed';
    const quiet = String(sceneProfile.pressure || '').toLowerCase() === 'none'
        && ['none', 'incidental'].includes(String(sceneProfile.noveltyCeiling || '').toLowerCase());
    const userCloses = /\b(?:stay|remain|quiet|no interruption|do not interrupt|skip|just rest|keep it calm)\b/iu.test(instruction);
    if (userCloses) return [];
    const haystack = lower([scene.activity, scene.location, scene.status, sceneProfile.promise, latestUserAction].join(' '));
    const scored = normalized.items.filter(item => item.status === 'available' || item.status === 'engaged').map(item => {
        let score = item.status === 'engaged' ? 5 : 0;
        const relevant = haystack && (lower(item.entry).split(/\W+/u).some(word => word.length > 3 && haystack.includes(word)) || lower(item.premise).split(/\W+/u).some(word => word.length > 4 && haystack.includes(word)));
        // Relevance comes from the scene as well as the player's words. No
        // action-verb whitelist: observation need not explicitly unlock it.
        // Quiet closed scenes still cannot receive unrelated/new encounters.
        if (closed && quiet && item.status !== 'engaged'
            && (!relevant || item.type === 'encounter' || item.origin === 'original')) return { item, score: -Infinity };
        if (relevant) score += 3;
        if (item.scope === 'scene') score += 2;
        if (item.id === normalized.lastSelectedId) score -= 3;
        if (quiet && item.type === 'encounter') score -= 2;
        return { item, score };
    }).sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
    return scored.length && scored[0].score > 0 ? [scored[0].item] : [];
}

export function situationForProvider(item) {
    const value = normalizeSituation(item);
    if (!value.id || !value.premise || !value.entry || value.status === 'retired') return null;
    return { premise: value.premise, entry: value.entry };
}

export function retireManifestedSituations(board, messages = []) {
    const transcript = messages.filter(message => !message?.is_user).map(message => String(message?.mes || '')).join('\n').toLocaleLowerCase();
    const normalized = normalizeSituationBoard(board);
    return {
        ...normalized,
        items: normalized.items.filter(item => {
            const premise = item.premise.toLocaleLowerCase();
            return !premise || premise.length < 24 || !transcript.includes(premise);
        }),
    };
}

export const MAX_SITUATIONS_COUNT = MAX_SITUATIONS;
