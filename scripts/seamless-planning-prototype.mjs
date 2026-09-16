import { ensureGuidanceInChat } from '../extension/request-injection.js';
import { validatePreparation } from './development-preparation-prototype.mjs';
import { MEMORY_SYSTEM, memorySchema, updateMemory } from './development-memory-prototype.mjs';

export const EPISODE_POLICY = [
    'Let a bounded situation have a finite resolution. Resolve established practical obstacles through plausible actions and consequences; do not automatically add a hidden layer, replacement obstacle or new obligation just to keep its topic alive. A solved delivery, completed attempt or secured rescue can be complete without the player announcing that the arc is over. Do not predetermine success, skip a live danger or make player choices.',
    'NPCs may carry through their own agreed actions without another invitation or player confirmation at each substep. Once a requested activity is underway, show its substance and feasible outcome before replacing it with another offer. Stop for a genuine player response, not every pending NPC action.',
    'Use the ordinary scope of an undertaken action, not its smallest physical motion. Routine NPC unpacking, drying clothes or setting up their work need not become a chain of permission questions. Preserve meaningful uncertainty and player choices, but do not manufacture decisions about every latch, cloth or count. When the practical task permits a lull, present companions can pursue their own interests in the same scene. They need not wait for the player to ask about a private future subject by name. Use its concrete substance now where compatible; prerequisites for a later conditional change do not prohibit earlier contact with the subject. This is not permission to skip danger, force elapsed time, travel or player participation.',
    'Wider private subjects are not extensions of this local problem. They may remain independent and unused, appear through the ongoing lives of people and places at compatible opportunities, and change through actual participation or refusal. Do not force an exit or teleport to preparation. In-character actions and established consequences, not OOC declarations about arcs or horizons, govern progress. Preserve source genre and agency. Private design is not accepted history. Ending an access episode does not automatically end an enduring subject.',
].join('\n');

export function seamlessMemorySchema(state) {
    const schema = memorySchema(state), ids = state.local.map(d => d.id);
    schema.value.properties.retire.maxItems = ids.length;
    if (ids.length) schema.value.properties.retire.items.properties.id = { type: 'string', enum: ids };
    return schema;
}
export const SEAMLESS_MEMORY_SYSTEM = MEMORY_SYSTEM + '\nThis routine owns LOCAL retirement only. Do not retire a wider development: request broad review if its whole subject ends or changes. A local episode closes through accepted in-world outcomes; an OOC declaration is neither needed nor expected. Distinguish completion from a pause. Preserve participation boundaries and changed capabilities as accepted observations. Declining one event does not reject an entire interest.';
export function updateSeamlessMemory(state, response, indices) {
    if (response.retire?.some(r => !state.local.some(d => d.id === r.id))) throw Error('Routine may retire only local episodes');
    return updateMemory(state, response, indices);
}
export function injectSeamlessPreparation(conversation, state) {
    const data = { provenance: 'PRIVATE FUTURE DESIGN, NOT ACCEPTED HISTORY OR AN ITINERARY',
        episode_policy: EPISODE_POLICY, repertoire: validatePreparation({ scope: state.scope, developments: state.developments }),
        accepted_observations: state.observations, invalidated_options: state.invalidated,
        local_record_status: { open: state.local.map(d => ({ id: d.id, premise: d.premise })),
            retired: state.archive.filter(a => a.lane === 'local').map(a => ({ id: a.record.id, assessment: a.retirement })) },
    };
    ensureGuidanceInChat(conversation, '<tale-fairy-context>\n' + JSON.stringify(data) + '\n</tale-fairy-context>', { role: 'user', depth: 1, inlineLatestUser: true });
    return conversation;
}
// Full messages, not prefix clipping. The complete log stays on disk. Derived
// observations supplement this disclosed window; not lossless long-run memory.
export function acceptedWindow(messages, recent = 12, opening = 4) {
    if (!Number.isInteger(recent) || recent < 1 || !Number.isInteger(opening) || opening < 0) throw Error('Invalid window');
    return messages.filter((_, i) => i < opening || i >= messages.length - recent).map(m => structuredClone(m));
}
export const IC_DRIVER_SYSTEM = [
    'You are a simulated player in an isolated RP, not its narrator or planner. Control Neri, born Edda: one person, a performer and stage carpenter traveling with Mara, Jo and Sef. Enjoy their company, seeing places and trying their work; prefer trying uncertain performances privately before promising a public booking. Be cooperative and curious, not an investigator by default.',
    'React to the accepted scene in 1-3 short sentences of first-person actions or quoted dialogue. Only ordinary in-character speech and your own actions. No OOC, authorial/pacing instructions, talk of arcs, plot, future planning, tests, hidden obligations or meaningful phases. Do not declare NPC actions, discoveries, outcomes, global time jumps or problem closure.',
    'Let NPCs invent their own creative material. If offered options, choose one concretely rather than asking the narrator to choose. Participate in an already requested activity or watch its result instead of asking to begin again. You may naturally finish your own work, rest, travel with the company or spend an ordinary period practicing when circumstances permit; do not skip unresolved interaction. Vary responses. Only output the next player message.',
].join('\n');
export function icDriverIssues(text) {
    const issues = [];
    if (typeof text !== 'string' || !text.trim() || text.length > 1400) issues.push('Expected a short player reply');
    if (/\b(OOC|mid.to.long|story arc|this arc|the plot|long.term planning|meaningful phase|isolated (?:test|branch))\b/i.test(text)) issues.push('Forbidden meta direction');
    return issues;
}

// A creative handoff is not a memory audit. It cannot mutate durable records.
export const AUTHOR_SYSTEM = `Author concrete NEW playable material for the upcoming storyteller reply. This is creative work only: do not maintain memory, select evidence, recap progress, or write a list of permissions and prohibitions. Source and accepted conversation constrain continuity and player agency; private designs offer substantive invention, not past events.
Use a compatible private subject to make the current experience actually develop. Write its particular new passage, mechanism, discovery, changed interaction or consequence, with an observable result. An NPC can create, try, decide, perform and complete work now without the transcript having already recorded that act. Let the NPCs supply the creative work: do not hand every compositional or practical decision back to the player. Respect a genuine refusal; do not force player action, emotion, commitment, public booking, travel or unrequested elapsed time.
If a subject has already been introduced, do not replay its entrance or replace development with another promise that the rest will come later. Use the time, practice and changes actually available. A draft may be imperfect and still contain something substantial to experience. Show the changed form working, rather than another discussion of whether it could exist. NPC participation can happen now, but their prior agreement cannot be invented as history. Leave a genuine player response open after the material has done something. Return only material: concise usable new fiction, not instructions telling another model to invent the substance. This output remains ephemeral and unaccepted until a resulting writer reply is accepted.`;
export const AUTHOR_SCHEMA = { name: 'current_authoring', value: { type: 'object', additionalProperties: false,
    required: ['material'], properties: { material: { type: 'string', minLength: 1, maxLength: 4000 } } } };
export function validateAuthoredReply(value) {
    if (!value || Object.keys(value).length !== 1 || typeof value.material !== 'string' || !value.material.trim() || value.material.length > 4000) throw Error('Invalid current authoring packet');
    return { material: value.material };
}
