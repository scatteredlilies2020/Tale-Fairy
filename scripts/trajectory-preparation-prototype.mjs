// Evaluation only: one complete trajectory per preparation task, explicit
// horizon fields rather than hoping prose instructions change array semantics.
import { acceptHorizon, horizonInput } from './horizon-preparation-prototype.mjs';
export { horizonInput };
const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
const phase = { type: 'object', additionalProperties: false, required: ['when', 'experience', 'after'], properties: {
    when: text(600), experience: text(1200), after: text(700),
} };
export const TRAJECTORY_SCHEMA = { name: 'one_trajectory', value: { type: 'object', additionalProperties: false, required: ['development'], properties: {
    development: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false,
        required: ['id', 'later', 'middle', 'beginning', 'subject', 'working', 'independence', 'encounter'], properties: {
            id: text(80), later: phase, middle: phase, beginning: phase,
            subject: text(900), working: text(1400), independence: text(700), encounter: text(700),
        },
    }] },
} } };
export const TRAJECTORY_SYSTEM = `Design ONE substantial continuing trajectory for this RP. Your only job is to supply a usable middle and later transformation, with a beginning that can lead into them. No current scene, no recap, no generic critique, no extra competing projects. The whole original premise is authoritative; a recent local episode is not the whole RP. For an explicitly closed one-evening experience return development:null.

Generate the later field first: a concrete DIFFERENT situation worth playing after accumulated experience. Then middle: an actual transition that changes what this cast can do, understand or experience together. Finally beginning: a self-contained playable entry that needs no prior offscreen adventure. Each phase has when (required accepted conditions/time), experience (actual contents still to be played), after (conditional durable differences depending on what happens). The middle cannot merely repeat the beginning or delay its solution; the later phase is not a reward, news summary, another larger copy of the first job or a mandatory ending. A phase may remain unused, end or take another direction. No automatic time jump or success on refusal.

Supply subject: the distinctive continuing subject, not a vague ambition. Supply working: your definite private authoring decisions about how its particular magic, places, practices or relationships actually work. Decide the interesting contents NOW. If an ancient spell is involved, give its original NAME and its actual effect, rule and limitation; 'a forgotten spell with an unknown purpose' is not preparation. A mystery can be unknown to characters while its designed contents are known to the storyteller. In a nonmagical story, be equally concrete about the work, people or discoveries instead of importing magic. Do not introduce unnamed spells elsewhere when the source requires names.

Use the premise's full genre. Adventure can include playable places, discoveries and dangers, not only a character's quiet hobby or people requesting help. A theatre journey can change its creative form, relationships and ways of traveling rather than only produce slightly different notes. New source-compatible people, objects, places and ideas are allowed; invented prior player actions or false existing-character biographies are not. Independence explains what drives this subject after any current local job finishes. Encounter is optional access, not a claim someone already arrived or agreed. NPCs have initiative; the player controls their own actions, emotions and commitments. No forced destiny, omniscient pursuer, permanent obligation or covertly rerouted refusal.

Private design is not accepted history. The host will check full accepted context before use. Return the schema, with substantial concrete content in every phase. Do not pad it with reasons why it would be interesting.`;

export function acceptTrajectory(value) {
    const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
    if (!exact(value, ['development'])) throw Error('Invalid trajectory root.');
    if (value.development === null) return acceptHorizon({ developments: [] });
    const d = value.development;
    if (!exact(d, ['id', 'later', 'middle', 'beginning', 'subject', 'working', 'independence', 'encounter'])) throw Error('Invalid trajectory fields.');
    for (const [key, max] of [['subject', 900], ['working', 1400], ['independence', 700], ['encounter', 700]]) if (typeof d[key] !== 'string' || !d[key].trim() || d[key].length > max) throw Error('Invalid concrete design.');
    return acceptHorizon({ developments: [{ id: d.id, substance: `${d.subject}\n\nPRIVATE WORKING: ${d.working}`, independence: d.independence, encounter: d.encounter, changes: [d.beginning, d.middle, d.later] }] });
}
