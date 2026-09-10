export const OFFSCREEN_KINDS = Object.freeze([
    'actor', 'relationship', 'group', 'community', 'institution',
    'system', 'resource', 'environment', 'place', 'situation',
]);
const KINDS = new Set(OFFSCREEN_KINDS);
const REACH = new Set(['present', 'near', 'distant', 'remote']);
const MOTION = new Set(['static', 'drifting', 'building', 'accelerating', 'resolving']);
const CONFIDENCES = new Set(['established', 'strong', 'tentative']);

// Distance decides resolution, not importance. News from a remote world arrives
// as a few broad strokes because that is all anyone there could actually know;
// someone in the next room is reported specifically.
const RESOLUTION = Object.freeze({
    present: 'specific and concrete',
    near: 'specific',
    distant: 'broad strokes',
    remote: 'rumour-level and possibly already out of date',
});

const RESOLUTION_SENTENCES = Object.freeze({ present: 3, near: 3, distant: 2, remote: 1 });

function text(value, limit = 240) {
    return String(value ?? '').trim().replace(/\s+/gu, ' ').slice(0, limit);
}

function choice(value, allowed, fallback) {
    const candidate = String(value ?? '').trim().toLowerCase();
    return allowed.has(candidate) ? candidate : fallback;
}

function integer(value, min, max, fallback = 0) {
    const candidate = Math.trunc(Number(value));
    return Number.isFinite(candidate) ? Math.max(min, Math.min(max, candidate)) : fallback;
}

export function defaultOffscreenWorld() {
    return { subjects: [], archive: [], elapsed: '', settledThrough: 0, audit: '' };
}

export function normalizeOffscreenSubject(value = {}) {
    return {
        id: text(value.id, 80),
        kind: choice(value.kind, KINDS, 'situation'),
        subject: text(value.subject, 120),
        reach: choice(value.reach, REACH, 'distant'),
        motion: choice(value.motion, MOTION, 'drifting'),
        // What it was already doing. Drift develops this; it never replaces it.
        trajectory: text(value.trajectory ?? value.direction, 240),
        // Settled history. Once written this is fact and is never re-rolled.
        settled: text(value.settled ?? value.happened, 400),
        // Durable witnesses are local storage, not an ever-growing prompt.
        history: [...new Set((Array.isArray(value.history) ? value.history : [])
            .map(item => text(item, 400)).filter(Boolean))],
        confidence: choice(value.confidence, CONFIDENCES, 'tentative'),
        lastSeenTurn: integer(value.lastSeenTurn ?? value.last_seen_turn, 0, 100000, 0),
        // Owed but undelivered consequence. It may become relevant through a
        // supported causal route, but is never due merely because time passed.
        owed: text(value.owed, 240),
        carriedBy: text(value.carriedBy ?? value.carried_by, 160),
    };
}

export function normalizeOffscreenWorld(value = {}) {
    const subjects = [];
    const seenIds = new Set();
    for (const raw of Array.isArray(value.subjects) ? value.subjects : []) {
        const item = normalizeOffscreenSubject(raw);
        const id = item.id.toLocaleLowerCase();
        if (!id || !item.subject || !item.trajectory || seenIds.has(id)) continue;
        seenIds.add(id);
        subjects.push(item);
        if (subjects.length >= 12) break;
    }
    return {
        subjects,
        archive: (Array.isArray(value.archive) ? value.archive : [])
            .map(normalizeOffscreenSubject)
            .filter(item => {
                const id = item.id.toLocaleLowerCase();
                if (!id || !item.subject || !item.trajectory || seenIds.has(id)) return false;
                seenIds.add(id);
                return true;
            }),
        elapsed: text(value.elapsed, 120),
        settledThrough: integer(value.settledThrough ?? value.settled_through, 0, 100000, 0),
        audit: text(value.audit, 300),
    };
}

function mergeSettledHistory(previous, proposed) {
    const before = text(previous, 400);
    const after = text(proposed, 400);
    if (!before) return after;
    if (!after || before.includes(after)) return before;
    if (after.includes(before)) return after;
    // A provider may summarize old history rather than copy it verbatim. Keep
    // the previous settled fact intact and append the new settlement so an old
    // outcome can never be silently re-rolled.
    const combined = `${before} ${after}`;
    // The compact view must retain the newest state. The durable journal below
    // preserves older witnesses instead of truncating the new development.
    return combined.length <= 400 ? combined : after;
}

/**
 * Accept refreshed subjects (including delta-only passes) while making history and its
 * observation clock monotonic for subjects that keep the same stable id.
 */
export function mergeOffscreenWorld(previous, proposed, { currentTurn = 0 } = {}) {
    const before = normalizeOffscreenWorld(previous);
    const after = normalizeOffscreenWorld(proposed);
    const turn = integer(currentTurn, 0, 100000, 0);
    const previousById = new Map([...before.archive, ...before.subjects].map(item => [item.id.toLocaleLowerCase(), item]));
    const refreshed = after.subjects.map(item => {
        const prior = previousById.get(item.id.toLocaleLowerCase());
        if (!prior) return { ...item, history: item.settled ? [item.settled] : [], lastSeenTurn: Math.min(item.lastSeenTurn, turn) };
        return {
            ...item,
            settled: mergeSettledHistory(prior.settled, item.settled),
            history: [...new Set([
                ...(prior.history.length ? prior.history : [prior.settled]),
                ...(item.settled !== prior.settled ? [item.settled] : []),
            ].filter(Boolean))],
            lastSeenTurn: Math.max(prior.lastSeenTurn, Math.min(item.lastSeenTurn, turn)),
        };
    });
    const refreshedIds = new Set(refreshed.map(item => item.id.toLocaleLowerCase()));
    const unresolvedOmissions = before.subjects.filter(item => !refreshedIds.has(item.id.toLocaleLowerCase())
        && (item.motion !== 'static' || Boolean(item.owed)));
    // Omissions are not evidence that a live trajectory ceased to exist. Preserve unresolved
    // debt in spare active slots or in the durable archive.
    // The planner's currently relevant selection wins active slots. Omission
    // changes attention, never history or whether an unresolved debt exists.
    const subjects = [...refreshed, ...unresolvedOmissions].slice(0, 12);
    const activeIds = new Set(subjects.map(item => item.id.toLocaleLowerCase()));
    const archive = [...previousById.values()].filter(item => !activeIds.has(item.id.toLocaleLowerCase()));
    return {
        ...after,
        subjects,
        archive,
        settledThrough: Math.max(before.settledThrough, Math.min(after.settledThrough, turn)),
    };
}

/** Bounded retrieval view; never serialize the entire durable journal to AI. */
export function offscreenWorldForPrompt(value, query = '') {
    const world = normalizeOffscreenWorld(value);
    const stopwords = new Set(['the', 'and', 'that', 'this', 'with', 'from', 'for', 'was', 'were', 'are', 'has', 'have', 'had', 'her', 'his', 'their', 'they', 'them', 'she', 'who', 'what', 'when', 'where', 'there', 'then', 'into', 'about', 'but', 'not']);
    const tokens = value => [...new Set(String(value).toLocaleLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) || [])].filter(term => !stopwords.has(term));
    const terms = new Set(tokens(query));
    const scoreText = value => tokens(value).reduce((total, term) => total + (terms.has(term) ? 1 : 0), 0);
    const compact = ({ history, ...item }) => {
        // Select one witness in a single pass rather than allocating and
        // sorting the whole journal. Newest wins ties; no query needs no scan.
        let relevant;
        let bestScore = 0;
        if (terms.size) for (let index = history.length - 1; index >= 0; index--) {
            const score = scoreText(history[index]);
            if (score > bestScore) { relevant = history[index]; bestScore = score; }
            if (bestScore === terms.size) break;
        }
        const witnesses = [...new Set([relevant, ...history.slice(-1)].filter(fact => fact && !item.settled.includes(fact)))].slice(0, 2);
        return { ...item, ...(witnesses.length ? { settledWitnesses: witnesses } : {}) };
    };
    return {
        subjects: world.subjects.map(item => ({ item, score: 4 * scoreText(item.subject) + scoreText(item.trajectory) }))
            .sort((a, b) => b.score - a.score).map(entry => compact(entry.item)),
        archive: world.archive.map(item => ({ item, score: scoreText(item.subject) }))
            .filter(entry => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 2)
            .map(entry => compact(entry.item)),
        elapsed: world.elapsed, settledThrough: world.settledThrough, audit: world.audit,
    };
}

export function subjectsOwingDrift(value, currentTurn = 0) {
    const turn = integer(currentTurn, 0, 100000, 0);
    return normalizeOffscreenWorld(value).subjects
        .filter(item => item.motion !== 'static' && item.lastSeenTurn < turn)
        .sort((a, b) => (turn - b.lastSeenTurn) - (turn - a.lastSeenTurn));
}

/**
 * Debt owed by each tracked subject, expressed as a planner request rather than
 * a schedule. Nothing runs in the background; the gap is only paid when the
 * subject becomes relevant again or the player skips time.
 */
export function formatDriftRequest(value, { currentTurn = 0, elapsed = '' } = {}) {
    const world = normalizeOffscreenWorld(value);
    const owing = subjectsOwingDrift(world, currentTurn);
    if (!owing.length) return '';
    const span = text(elapsed || world.elapsed, 120);
    const lines = owing.slice(0, 8).map(item => {
        const gap = Math.max(0, integer(currentTurn, 0, 100000, 0) - item.lastSeenTurn);
        const detail = `${RESOLUTION[item.reach]}, at most ${RESOLUTION_SENTENCES[item.reach]} sentence(s)`;
        const settled = item.settled ? ` Already settled: ${item.settled}.` : '';
        const owed = item.owed ? ` Plausible undelivered consequence: ${item.owed}${item.carriedBy ? ` via ${item.carriedBy}` : ''}.` : '';
        return `- ${item.subject} (${item.kind}, ${item.reach}, ${item.motion}; unobserved ${gap} planner turn(s)) — was: ${item.trajectory}.${settled}${owed} If settled now, use ${detail}.`;
    });
    return [
        `OFF-SCREEN DEBT CANDIDATES${span ? ` — ${span} has passed` : ''}. These subjects were not observed. Settle only a subject made relevant again by the newest exchange, an explicit material time skip, or a changed causal dependency; otherwise preserve it without advancing its clock.`,
        ...lines,
        'When settling, develop only what was already in motion and append the result to settled history. "Nothing much changed" is common and fully acceptable. Elapsed time permits change but never requires drama.',
        'Resolution follows distance, not importance. Remote subjects stay vague, incomplete, and possibly outdated; after more than about fourteen days without reliable contact, use remote resolution unless a trustworthy nearer witness exists. Never re-decide anything already settled, and never turn owed pressure into a scheduled arrival.',
    ].join('\n');
}
