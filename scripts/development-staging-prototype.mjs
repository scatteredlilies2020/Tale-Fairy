// Evaluation-only: preparation stays durable; scene staging is disposable and
// explicitly unaccepted. The host never promotes staging into history.
import { MAINTENANCE_SYSTEM, maintenanceSchema, maintainDevelopments } from './development-maintenance-prototype.mjs';
import { estimateTokenCount } from '../extension/token-budget.js';

export const STAGING_SYSTEM = MAINTENANCE_SYSTEM.replace(/Select zero,[\s\S]*?manufactured hooks\./, `Stage zero, one or two existing developments for the current reply. Instead of selecting future branch indices, supply use_now: concrete private material the storyteller can actually bring into this interaction, and do_not_assume: boundaries/prerequisites that must not be skipped. Cite accepted messages for the opportunity, not as proof your new fiction already happened. An introduction of compatible new NPC work is permitted now even though it wasn't previously mentioned: make that an actual introduction, not a fake shared memory. Use the specific prepared subject, not a generic hint about 'something of my own'. When the player has asked to hear, see or try it, stage an actual fragment, demonstration or exchange, not another invitation to begin later. After interaction, stage a meaningfully changed form using the accepted outcome, rather than repeating the original entry. Do not force the user to engage, assume their reaction, introduce inaccessible locations, or move time forward. If the current scene concerns an unrelated problem, stage nothing unless a subject is genuinely useful now. No obligation to use every stored subject. This staging is ephemeral new authoring material, never an accepted observation.`).replace('observations, invalidate and select refer only', 'observations, invalidate and stage refer only').replace('Do not record general scene facts as new developments.', 'Do not record general scene facts as new developments. Only append observations that add something not already recorded; missing mentions do not establish negative facts.') + '\nReturn stage instead of select. Each stage contains exactly id, use_now, do_not_assume and evidence. Keep explanations concise enough for the schema.';

export function stagingSchema(state) {
    const schema = maintenanceSchema(state);
    schema.name = 'development_staging';
    schema.description = 'Accepted maintenance plus ephemeral concrete authoring material; staging never becomes history.';
    schema.value.required = schema.value.required.map(k => k === 'select' ? 'stage' : k);
    const id = schema.value.properties.select.items.properties.id;
    delete schema.value.properties.select;
    schema.value.properties.stage = { type: 'array', maxItems: state.developments.length ? 2 : 0, items: { type: 'object', additionalProperties: false, required: ['id', 'use_now', 'do_not_assume', 'evidence'], properties: {
        id, use_now: { type: 'string', minLength: 1, maxLength: 1400 }, do_not_assume: { type: 'string', minLength: 1, maxLength: 700 }, evidence: { type: 'array', minItems: 1, items: { type: 'integer', minimum: 0 } },
    } } };
    return schema;
}

export function stagingInput({ state, reference, messages, history = {} }, maxTokens = 24000) {
    const accepted = messages.map((m, i) => ({ index: m.index ?? i, role: m.role ?? (m.is_user ? 'user' : 'assistant'), content: m.content ?? m.mes }));
    const prompt = JSON.stringify({ source_reference: reference, accepted_historical_context: history, notebook: { scope: state.scope, developments: state.developments, local: state.local, observations: state.observations, invalidated: state.invalidated }, accepted_messages: accepted });
    const schema = stagingSchema(state), inputTokens = estimateTokenCount(STAGING_SYSTEM + JSON.stringify(schema) + prompt);
    if (inputTokens > maxTokens) throw Error('Complete staging input exceeds budget.');
    return { prompt, inputTokens, schema, indices: accepted.map(m => m.index) };
}

export function stageDevelopments(state, response, indices) {
    if (!response || !Object.hasOwn(response, 'stage') || Object.hasOwn(response, 'select') || !Array.isArray(response.stage) || response.stage.length > 2) throw Error('Invalid staging root.');
    const { stage, ...maintenance } = response;
    if (new Set(stage.map(s => s.id)).size !== stage.length) throw Error('Duplicate staging.');
    for (const s of stage) {
        if (!s || Object.keys(s).length !== 4 || !['id', 'use_now', 'do_not_assume', 'evidence'].every(k => Object.hasOwn(s, k)) || typeof s.use_now !== 'string' || !s.use_now.trim() || s.use_now.length > 1400 || typeof s.do_not_assume !== 'string' || !s.do_not_assume.trim() || s.do_not_assume.length > 700) throw Error('Invalid staged material.');
    }
    const next = maintainDevelopments(state, { ...maintenance, select: stage.map(s => ({ id: s.id, changes: [], reason: 'Ephemeral authoring material, not accepted history.', evidence: s.evidence })) }, indices);
    next.staged = structuredClone(stage);
    return next;
}

export function stagedWriterMaterial(state) {
    return (state.staged ?? []).map(s => {
        const d = state.developments.find(d => d.id === s.id);
        if (!d) throw Error('Stale staged material.');
        return { provenance: 'NEW AUTHORING MATERIAL FOR THIS REPLY; NOT ACCEPTED HISTORY OR PLAYER KNOWLEDGE', id: d.id, use_now: s.use_now, do_not_assume: s.do_not_assume, accepted_observations: state.observations.filter(o => o.id === d.id) };
    });
}
