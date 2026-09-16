// Evaluation-only premise-first preparation. The host, not generated prose,
// owns RP scope. The routine compatibility pass still receives full history.
import { PREPARATION_SCHEMA, validatePreparation } from './development-preparation-prototype.mjs';

export const HORIZON_SCHEMA = { ...PREPARATION_SCHEMA, name: 'horizon_preparation', value: {
    type: 'object', additionalProperties: false, required: ['developments'],
    properties: { developments: PREPARATION_SCHEMA.value.properties.developments },
} };

export const HORIZON_SYSTEM = `Prepare the MIDDLE AND LATER LIFE of this roleplay from its original premise, not its most recent episode. You are a story designer, not a quest giver or a next-reply writer. This separate input deliberately contains source authority and the opening, not hundreds of turns of the current local problem. Full accepted history will be checked separately before anything is used. Your proposals establish no accepted events.

First imagine several genuinely DIFFERENT later situations this cast could inhabit after meaningful play: something they have learned changes how they explore, a relationship or shared undertaking changes what they can do together, a changing place or tradition supports a different kind of return. Use the full genre: danger, discovery, dungeons, ordinary pleasures and companionship when the premise supports them. The future must not be only chores, mysterious invitations, institutions requesting help, or hobbies isolated from the wider journey. An episode can end; the larger story does not need a secret continuation of it. Do not design an omniscient antagonist that forces the party onto a destined route.

For an open-ended premise invent 2–3 substantial, independent trajectories. For an explicitly closed one-evening experience return an empty array. Develop the later transformation FIRST, then work backward to a substantial middle and a compatible beginning. In each development's changes array, put the distant transformed situation FIRST, a middle situation SECOND, and an opening situation LAST. This is design order, NOT a required play order. Their when fields must state actual access, prior accepted changes and elapsed fictional time required. No clocks advance just because the user refuses. No outcome is guaranteed by a prerequisite: experience is material to PLAY, after is conditional on what actually happens.

Every middle must offer a different experience from the opening, not the same proposal, another clue or a slightly improved performance. Every later situation must arise from accumulated changes but be worth playing itself, not a reward paragraph, a yearly status update, a larger version of the first job, or another copy of it in a different town. Give the subject enough actual contents to support those changes: distinctive workings, people, locations, creative forms, discoveries, competing interpretations or ways of using what was learned. Name invented spells now when the source requires spell names. Don't merely promise a future writer will invent this material.

The substance field designs the recurring subject, its particular contents and what can change about it. Independence says what drives it independently of any current local job. Encounter describes optional, source-compatible access, never an already accepted arrival or player commitment. Do not rewrite established characters' biographies or invent earlier player actions. NPCs may have compatible interests and act on them; the user alone decides the user's actions, feelings and commitments. New material can have definite contents without dictating its encounter or ending. Allow a trajectory to remain unused or change direction; don't redirect every refusal back onto the same track.

Output only the supplied schema. You do not write or infer the RP's scope; the source owns it. No current-scene plan, no mandatory itinerary, no claim these proposals have already happened.`;

export function horizonInput(source) {
    if (!source?.source_reference) throw Error('Source reference required.');
    return JSON.stringify({ source_reference: source.source_reference,
        explicit_user_instruction: source.explicit_user_instruction || '',
        accepted_opening: source.story_evidence?.opening || source.accepted_messages?.[0] || null,
        constraints: source.constraints || {},
        context_boundary: 'Premise-first invention only. This omits the current episode, not from storage or later compatibility checks. Do not assume the opening is still the current scene or funding. No proposed encounter has occurred.',
    });
}

export function acceptHorizon(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'developments')) throw Error('Invalid horizon root.');
    // A fixed pointer avoids quietly replacing source authority with a generated
    // preference such as "favor quiet local craft". Full source travels separately.
    return validatePreparation({ scope: 'Use the complete original source reference and explicit user instructions. The accepted opening establishes initial context only; later accepted events govern current state. No generated narrowing of RP scope is authoritative.', developments: value.developments });
}
