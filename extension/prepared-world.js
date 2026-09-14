// Creative preparation is not historical memory. Never promote a proposal to
// fact merely because it was saved, injected, or left unobserved for many turns.
export const PREPARED_LIMIT = 12;
const limits = { id: 80, premise: 320, engine: 240, middle: 440, future: 260,
    entry: 240, hold: 180, invalidates: 220, intervention: 220, knowledge: 180 };
const statuses = ['prepared', 'active', 'dormant', 'resolved', 'retired'];
const origins = ['established', 'inferred', 'invented'];
const fields = Object.keys(limits);
const string = maxLength => ({ type: 'string', maxLength });
export const PREPARED_SCHEMA = {
    type: 'object', additionalProperties: false,
    properties: {
        overview: string(900),
        updates: { type: 'array', maxItems: 4, items: {
            type: 'object', additionalProperties: false,
            properties: { ...Object.fromEntries(fields.map(key => [key, string(limits[key])])),
                status: { type: 'string', enum: statuses }, origin: { type: 'string', enum: origins } },
            required: [...fields, 'status', 'origin'],
        } },
        focus: { type: 'array', maxItems: 3, items: string(80) },
    }, required: ['overview', 'updates', 'focus'],
};

export const PREPARED_RULE = `Prepare a creative playable middle AND future, not variants of the latest topic. Invent compatible places, people, challenges, encounters, projects, secrets and independent developments without prior mention. Infer this RP's scale, canon deviations, motivations and constraints; no genre checklist or route quota. Contrast different possibilities in this one call; return selected material, not deliberation. A distant label is not long-term planning: middle needs concrete intermediate experiences, changing circumstances and alternative continuations, not a jump to the endpoint. Quiet scenes must not narrow preparation.
prepared={overview,updates,focus} is a persistent notebook separate from factual memory. overview: wider trajectory, constraints, alternatives; blank preserves. updates: up to four new/changed records, stable ids; omitted records survive. At most twelve live records; explicitly resolve/retire instead of silently replacing them. No compulsory refresh. Fields: premise; engine (motives/resources/process); middle (playable developments/branches); future (what could grow beyond, not a promised ending); entry (recognizable introduction opportunity); hold (when dormant); invalidates (contradictions/dependencies); intervention (player reaction before contestable consequences); knowledge (GM secrets versus character discovery). origin: established=evidenced premise, inferred=deduction, invented=creation. status: prepared, active, dormant, resolved, retired. Active requires transcript uptake, not injection. Preserve manifested consequences as facts when revising unused ideas. focus: up to three retained/updated ids useful for the writer, not activation commands; consider wider material as well as this scene. Unfocused records stay private.
Unlike factual context.conditions and actor_updates, prepared MAY propose concrete NPC/world actions and events. They are conditional possibilities, not history, player choices or a beat queue. Check entry/hold/contradictions against the latest exchange. Scene duration, meaningful development and interruption are independent: a long scene can deepen without ending; travel can contain a motivated encounter without skipping the journey or resolving an ambush before reaction. Latest explicit user pacing overrides saved preference in any language. Never tick fictional time by message count. Distill available evidence; exact wording only when needed. Summaries and Continuity are optional. Return preparation plus current facts in one call, no critic or model repair.`;

export function validatePrepared(value) {
    const errors = [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) return ['prepared must be an object'];
    if (typeof value.overview !== 'string' || value.overview.length > 900) errors.push('prepared.overview must be a string up to 900 characters');
    if (!Array.isArray(value.updates) || value.updates.length > 4) errors.push('prepared.updates must contain at most four records');
    const ids = new Set();
    for (const item of Array.isArray(value.updates) ? value.updates : []) {
        if (!item || typeof item !== 'object') { errors.push('prepared record must be an object'); continue; }
        for (const key of fields) if (typeof item[key] !== 'string' || item[key].length > limits[key]) errors.push(`prepared.${key} must be a bounded string`);
        if (typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id)) errors.push('prepared ids must be nonempty and unique');
        ids.add(item.id);
        if (!statuses.includes(item.status) || !origins.includes(item.origin)) errors.push('prepared status/origin is invalid');
        if (!['retired', 'resolved'].includes(item.status) && ['premise', 'engine', 'middle', 'entry', 'invalidates', 'intervention', 'knowledge'].some(key => typeof item[key] !== 'string' || !item[key].trim())) errors.push('live prepared records need usable content and boundaries');
    }
    if (!Array.isArray(value.focus) || value.focus.length > 3 || value.focus.some(id => typeof id !== 'string' || !id.trim() || id.length > 80) || new Set(value.focus).size !== value.focus.length) errors.push('prepared.focus must contain up to three unique ids');
    return errors;
}

export function defaultPreparedWorld() { return { overview: '', items: [], focus: [], source: null }; }

export function normalizePreparedWorld(value) {
    const safe = defaultPreparedWorld();
    if (!value || typeof value !== 'object') return safe;
    safe.overview = typeof value.overview === 'string' ? value.overview.slice(0, 900) : '';
    safe.items = (Array.isArray(value.items) ? value.items : []).filter(item =>
        validatePrepared({ overview: '', updates: [item], focus: [] }).length === 0).slice(-PREPARED_LIMIT);
    safe.focus = (Array.isArray(value.focus) ? value.focus : []).filter(id => safe.items.some(item => item.id === id)).slice(0, 3);
    if (value.source && typeof value.source === 'object') safe.source = {
        chatId: String(value.source.chatId || ''), fingerprint: String(value.source.fingerprint || ''),
        messageCount: Math.max(0, Number(value.source.messageCount) || 0),
        inputsKey: String(value.source.inputsKey || ''),
        startedAt: Math.max(0, Number(value.source.startedAt) || 0),
    };
    return safe;
}

export function mergePreparedWorld(previous, delta) {
    const prior = normalizePreparedWorld(previous);
    // Old saved/detached contracts had no preparation; do not fabricate any.
    if (delta === undefined) return prior;
    const errors = validatePrepared(delta);
    if (errors.length) throw new Error(errors.join('; '));
    const items = new Map(prior.items.map(item => [item.id, item]));
    for (const item of delta.updates) {
        if (['resolved', 'retired'].includes(item.status)) items.delete(item.id);
        else items.set(item.id, { ...item });
    }
    if (items.size > PREPARED_LIMIT) throw new Error('Prepared notebook is full; retire or consolidate records explicitly.');
    if (delta.focus.some(id => !items.has(id))) throw new Error('Prepared focus refers to an unavailable record.');
    return { ...prior, overview: delta.overview.trim() || prior.overview, items: [...items.values()], focus: [...delta.focus] };
}

// Prefix proof permits any number of appended turns, never an edit, swipe,
// deletion, foreign chat or changed author/lore input. This checks text locally;
// it does not send the full transcript to the model.
export function unchangedSourcePrefix(source, messages, fingerprint) {
    return Boolean(source?.fingerprint && source.messageCount > 0 && source.messageCount <= messages.length
        && fingerprint(messages.slice(0, source.messageCount)) === source.fingerprint);
}

export function preparedWorldUsable(value, { chatId, inputsKey, messages, fingerprint }) {
    const board = normalizePreparedWorld(value);
    return Boolean(board.source?.chatId === chatId && board.source?.inputsKey === inputsKey && inputsKey
        && unchangedSourcePrefix(board.source, messages, fingerprint));
}

export function stampPreparedWorld(value, source) {
    return normalizePreparedWorld({ ...value, source });
}

// Keep the full notebook in storage, but retrieve a bounded working view.
// Full records can be supplied by the UI; prompt omissions never delete them.
export function preparedWorldForPrompt(value) {
    const { source, ...board } = normalizePreparedWorld(value);
    return { ...board, items: board.items.map(item => ({ ...item })) };
}

export function compactPreparedForPrompt(board = {}) {
    const clip = (value, length) => String(value || '').slice(0, length);
    return { overview: clip(board.overview, 500), focus: board.focus || [],
        retained: 'Compact index; omitted details remain stored. Update only deliberately; no omission deletes a record.',
        items: (board.items || []).map(item => ({ id: item.id, status: item.status, origin: item.origin,
            premise: clip(item.premise, 110), middle: clip(item.middle, 130), future: clip(item.future, 90),
            entry: clip(item.entry, 90), invalidates: clip(item.invalidates, 80) })) };
}

const clean = value => String(value).replace(/[<>]/gu, '').trim();
export function formatPreparedWorld(value) {
    const board = normalizePreparedWorld(value);
    const selected = board.focus.map(id => board.items.find(item => item.id === id)).filter(item => item && item.status !== 'dormant');
    if (!board.overview && !selected.length) return '';
    return ['<prepared-world>',
        'CONDITIONAL GM PREPARATION, NOT TRANSCRIPT FACTS OR A REQUIRED NEXT BEAT. Check against the latest actual exchange. Omit a contradicted, already used or premature element; do not discard unrelated possibilities. Do not replay events. Saved preparation never proves time passed or grants character knowledge. Proposals can guide concrete NPC/world action when their entry fits, without deciding the player response. No obligation to use one this reply.',
        board.overview ? `Wider direction (provisional, not a destination deadline): ${clean(board.overview)}` : '',
        ...selected.map(item => [
            `Possible development (${item.origin} premise; ${item.status}): ${clean(item.premise)}`,
            `Driving process: ${clean(item.engine)}`, `Playable middle: ${clean(item.middle)}`,
            item.future ? `Beyond it: ${clean(item.future)}` : '',
            `Entry: ${clean(item.entry)}`, item.hold ? `Keep dormant: ${clean(item.hold)}` : '',
            `Do not use if: ${clean(item.invalidates)}`, `Player intervention: ${clean(item.intervention)}`,
            `Knowledge boundary: ${clean(item.knowledge)}`,
        ].filter(Boolean).join('\n')),
        '</prepared-world>',
    ].filter(Boolean).join('\n');
}

export function formatPacingPreference(mode = 'auto') {
    const preference = {
        linger: 'Linger: favor depth within the current scene without padding or forced closure.',
        advance: 'Advance: favor meaningful forward movement and summarize uneventful stretches when permitted, without skipping live decisions.',
        natural: 'Natural: adapt duration to the interaction; neither prolong nor end scenes by default.',
        auto: 'Adaptive: infer pacing from the latest user intent and interaction, not turn counts.',
    }[mode] || 'Natural: adapt duration to the interaction.';
    return `PACING PREFERENCE: ${preference} Latest explicit user instructions override this saved preference. Scene duration, meaningful development and outside interruption are separate. Long scenes can change understanding, relationships or circumstances without ending. Quiet is valid; avoid repetitive padding. Travel can contain a motivated meeting or ambush, but neither travel nor silence automatically authorizes a time skip. Do not force an interruption to create progress; do allow a causally warranted interruption with a meaningful reaction window. Never narrate the player's reaction or resolve a contestable result before they can intervene.`;
}
