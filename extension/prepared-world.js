import { estimateTokenCount } from './token-budget.js?v=0.11.96';

// Creative preparation is not historical memory. Never promote a proposal to
// fact merely because it was saved, injected, or left unobserved for many turns.
export const PREPARED_LIMIT = 12;
const limits = { id: 80, premise: 320, engine: 240, middle: 440, future: 260,
    entry: 240, hold: 180, invalidates: 220, intervention: 220, knowledge: 180 };
const statuses = ['prepared', 'active', 'dormant', 'resolved', 'retired'];
const origins = ['established', 'inferred', 'invented'];
const fields = Object.keys(limits);
// Schema lengths are writing targets. Preserve modest prose overruns intact
// instead of losing the whole plan or cutting off its final constraints.
const overviewStorageLimit = 3600;
const storageLimit = key => key === 'id' ? limits.id : limits[key] * 4;
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

export const PREPARED_RULE = `Prepare a creative playable middle AND future, not variants of the latest topic. First distinguish the wider story premise and durable commitments from the immediate scene. overview preserves that wider direction and meaningful alternatives; it is not a recap or an itinerary for the next reply. A future label such as another clue, the next stop or eventual victory is not a playable middle. Prepare experiences with decisions, changing relationships/resources and consequences that can support later experiences. Multiple witnesses, books or locations serving the same investigation are one development family, not independent variety. In initialization and broad reviews, use the available context to consider independent people, places or processes whose motives do not depend on that family. For initialization and broad reviews in an open-ended RP, ensure the notebook contains at least one concrete development beyond the current activity that would still have its own motive and playable middle if the current investigation/problem disappeared. Retain one if it exists; otherwise use an update slot to invent a compatible one. Moving the same problem to a new town, witness or carrier does not meet this test. Lack of prior mention is not an obstacle to a labeled invention. These preparations may remain private or await travel; they do not force an interruption. Respect an explicit user restriction to a closed scenario. Avoid genre checklists. Focus is only what the writer may use now; keep broader preparation even when it is not ready to enter this scene. Invent compatible places, people, challenges, encounters, projects, secrets and independent developments without prior mention. Develop concrete intermediate experiences, changes and alternative continuations before distant possibilities. Quiet scenes must not narrow preparation. Give new possibilities independent motives instead of tying every encounter to one investigation. Follow the RP's scale and constraints without genre quotas.
prepared={overview,updates,focus} is a persistent notebook separate from factual memory. overview holds wider trajectory and alternatives; blank preserves. Align factual time, place and identities across all records with the latest transcript. A named group member is not an additional person. updates use stable ids; omitted records survive. Keep at most twelve live records; explicitly resolve/retire. Only premise and middle need prose; other notes may be blank. Never invent restrictions to fill fields. Leave hold blank unless an evidenced obstacle or unmet prerequisite needs it. Entry and hold must agree: eating, conversation, rest, indoors or player silence alone cannot block a fitting entry. A distant encounter may await travel without freezing local activity.
Fields: engine=motives/process; middle=playable branches; future=possible continuations; entry=introduction opportunity; hold=evidenced timing constraint; invalidates=known contradiction; intervention=room to react; knowledge=GM secrets versus discovery. origin distinguishes evidenced, inferred and invented premises. Active requires transcript uptake, not injection. Preserve manifested consequences when revising unused ideas. focus selects up to three ids for the writer; unfocused records remain private.
Unlike factual context.conditions and actor_updates, prepared MAY propose concrete NPC/world actions and events. They are conditional possibilities, not history, player choices or a beat queue. Reconcile entries, holds and retained claims against the latest exchange before returning them. Scene duration, meaningful development and interruption are independent; long scenes can deepen without ending. Latest explicit user pacing overrides saved preference in any language. Never tick fictional time by message count. Summaries and Continuity are optional. Return preparation plus current facts in one call, no critic or model repair.`;

export function validatePrepared(value) {
    const errors = [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) return ['prepared must be an object'];
    if (typeof value.overview !== 'string' || value.overview.length > overviewStorageLimit) errors.push(`prepared.overview must be text up to ${overviewStorageLimit} characters`);
    if (!Array.isArray(value.updates) || value.updates.length > 4) errors.push('prepared.updates must contain at most four records');
    const ids = new Set();
    for (const item of Array.isArray(value.updates) ? value.updates : []) {
        if (!item || typeof item !== 'object') { errors.push('prepared record must be an object'); continue; }
        for (const key of fields) if (typeof item[key] !== 'string' || item[key].length > storageLimit(key)) errors.push(`prepared.${key} must be text up to ${storageLimit(key)} characters`);
        if (typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id)) errors.push('prepared ids must be nonempty and unique');
        ids.add(item.id);
        if (!statuses.includes(item.status) || !origins.includes(item.origin)) errors.push('prepared status/origin is invalid');
        if (!['retired', 'resolved'].includes(item.status) && ['premise', 'middle'].some(key => typeof item[key] !== 'string' || !item[key].trim())) errors.push('live prepared records need a premise and playable developments');
    }
    if (!Array.isArray(value.focus) || value.focus.length > 3 || value.focus.some(id => typeof id !== 'string' || !id.trim() || id.length > 80) || new Set(value.focus).size !== value.focus.length) errors.push('prepared.focus must contain up to three unique ids');
    return errors;
}

export function defaultPreparedWorld() { return { overview: '', items: [], focus: [], source: null }; }

export function normalizePreparedWorld(value) {
    const safe = defaultPreparedWorld();
    if (!value || typeof value !== 'object') return safe;
    safe.overview = typeof value.overview === 'string' ? value.overview.slice(0, overviewStorageLimit) : '';
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
    return Boolean(source?.fingerprint && source.messageCount >= 0 && source.messageCount <= messages.length
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
            premise: clip(item.premise, 110), engine: clip(item.engine, 100), middle: clip(item.middle, 130), future: clip(item.future, 130),
            entry: clip(item.entry, 90), hold: clip(item.hold, 90), invalidates: clip(item.invalidates, 80) })) };
}

const clean = value => String(value).replace(/[<>]/gu, '').trim();
export function formatPreparedWorld(value) {
    const board = normalizePreparedWorld(value);
    const selected = board.focus.map(id => board.items.find(item => item.id === id)).filter(item => item && item.status !== 'dormant');
    if (!board.overview && !selected.length) return '';
    const lines = ['<prepared-world>',
        board.overview ? `Wider direction (provisional, not a destination deadline): ${clean(board.overview)}` : '',
        ...selected.map(item => [
            `Possible development (${item.origin} premise; ${item.status}): ${clean(item.premise)}`,
            item.engine ? `Driving process: ${clean(item.engine)}` : '', `Playable middle: ${clean(item.middle)}`,
            item.future ? `Beyond it: ${clean(item.future)}` : '',
            item.entry ? `Entry: ${clean(item.entry)}` : '', item.hold ? `Timing consideration (only if supported by the actual scene): ${clean(item.hold)}` : '',
            item.invalidates ? `Do not use if: ${clean(item.invalidates)}` : '', item.intervention ? `Player intervention: ${clean(item.intervention)}` : '',
            item.knowledge ? `Knowledge boundary: ${clean(item.knowledge)}` : '',
        ].filter(Boolean).join('\n')),
        '</prepared-world>',
    ].filter(Boolean);
    // Select complete records, including their constraints and knowledge
    // boundaries. Never truncate a sentence into a different causal claim.
    // The full notebook survives privately for subsequent passes.
    const header = 'CONDITIONAL GM PREPARATION, NOT TRANSCRIPT FACTS OR A REQUIRED NEXT BEAT. Use only fitting, unused possibilities; latest facts and user constraints win. Preparation proves neither elapsed time nor character knowledge. Preserve player intervention. Entry and timing notes are provisional: use a fitting entry despite a conflicting inferred hold. Eating, rest or silence alone do not suspend NPC activity. No obligation to use one this reply.';
    const result = [lines[0], header];
    for (const line of lines.slice(1, -1)) {
        if (estimateTokenCount([...result, line, '</prepared-world>'].join('\n')) <= 1000) result.push(line);
    }
    return [...result, '</prepared-world>'].join('\n');
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
