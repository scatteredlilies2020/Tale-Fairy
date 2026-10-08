// Synthetic review fixtures, not excerpts from a user's chat.
import { emptyCampaign } from '../extension/campaign-planner.js';
import { liveCardPass } from './evaluate-live-story-cards.mjs';
import { worldFrameCases } from './world-frame-cases.mjs';

const card = (id, kind, title, description, extra = {}) => ({ id: `r1-${id}`, kind, title, description,
    status: 'active', parentId: '', owner: 'The people involved', links: [], effects: [], endsWhen: '', ...extra });
const message = (role, content, index = 0) => ({ index, role, content });
const naruto = worldFrameCases.find(x => x.id === 'naruto');
const light = worldFrameCases.find(x => x.id === 'k-on-light');
const hospitalCards = [
    card('border', 'saga', 'Who Governs the Border?', 'Border communities seek a lasting voice in decisions about patrols, trade and mission contracts. Competing village policies can produce several independent negotiations and local campaigns.'),
    card('compact', 'arc', 'A Border Compact Worth Signing', 'Two villages dispute patrol access and compensation after a border incident. Negotiators must find terms that local communities and their commanders will honor.', { parentId: 'r1-border' }),
    card('records', 'thread', 'The Altered Mission Records', 'A records clerk is secretly tracing forged mission orders and deciding whom to trust with the evidence. The investigation could expose an official benefiting from border raids.', { parentId: 'r1-compact' }),
    card('arm', 'thread', 'A Healed Arm Without a Return to Duty', 'A briefly encountered patient still has poor chakra flow after a healed fracture. Routine rehabilitation, a consultation and a duty assessment remain pending.'),
    card('rounds', 'thread', 'A Medic Keeps Showing Up', 'Ordinary rounds and routine follow-ups let the medic continue caring for patients. Daily hospital work offers chances for compassion and mentorship.'),
];
const hospitalPremise = `${naruto.premise} The player also works as a medic. Current sustained stories concern a disputed border compact and forged mission orders. A recent hospital detour introduced an unnamed patient in one brief scene; medical cases are not the focus of this RP.`;

export const arcFocusCases = [
    { ...naruto, id: 'hospital-activity-skip', premise: hospitalPremise, nodes: hospitalCards,
        messages: [message('assistant', 'The compact remains contested. The records clerk has found a second altered order but has not chosen an ally.'),
            message('user', 'I spend the next week working my usual hospital shifts, then head back to the village council.', 1)],
        keep: ['r1-border', 'r1-compact', 'r1-records'], drop: ['r1-arm', 'r1-rounds'],
        review: 'Keep saga, diplomatic arc and substantial investigation subplot. Drop incidental rehabilitation and generic medic-duty cards, without claiming a cure or duty clearance or replacing them with inflated medical plots.' },
    { ...naruto, id: 'hospital-no-time-skip', premise: hospitalPremise, nodes: hospitalCards,
        messages: [message('assistant', 'After the brief ward visit, the patient still has difficulty channeling chakra. The border negotiations and altered-orders investigation remain unresolved.'),
            message('user', 'I sit under the tree outside the council hall for a quiet lunch.', 1)],
        keep: ['r1-border', 'r1-compact', 'r1-records'], drop: ['r1-arm', 'r1-rounds'],
        review: 'Prune filler even without a time skip; do not treat a quiet lunch as the end of substantial stories or manufacture new tension to fill the gap.' },
    { ...light, id: 'light-festival', nodes: [
        card('festival', 'arc', 'A Set List We Can Call Our Own', 'The club is preparing its first self-arranged festival set. Differing musical tastes and growing confidence shape rehearsals and the performance they want to share.'),
        card('song', 'thread', 'Sharing an Unfinished Song', 'A usually reserved club member is gradually opening up about an original song. Friendship and collaboration develop as she decides how much of this personal work to share.', { parentId: 'r1-festival' }),
        card('tea', 'thread', 'Tea for Thursday', 'The club has run low on tea and someone still needs to replenish it before the next practice.'),
        card('sound', 'thread', 'One More Sound Check', 'A borrowed cable needs to be returned after the ordinary rehearsal sound check.'),
        card('duo', 'thread', 'A Touring Duo Someday', 'Two former members once hoped to form a touring duo. One has moved abroad and quit music; they have no current shared plans. Perhaps a future reunion could revive the project.', { status: 'dormant' }),
    ], messages: [message('user', 'We spend the week on our usual club practices and chores. The festival is still ahead, and our friend has only shared the first verse of her song. The old duo idea has not been pursued since the other musician moved abroad and quit music; there are no current plans for it.')],
        keep: ['r1-festival', 'r1-song'], drop: ['r1-tea', 'r1-sound', 'r1-duo'],
        review: 'Retain the light festival arc and unfolding friendship subplot, not tea/cable errands or the stale dormant duo. Do not invent danger, a reunion or forced personal disclosures.' },
    { ...naruto, id: 'central-rehabilitation',
        premise: 'A character-focused Naruto medical drama about the player medic and a veteran working through a lasting arm injury. Rehabilitation, uncertain identity after service and the veteran deciding what work he wants are the central ongoing story, not a detour. The player controls the medic.',
        nodes: [card('recovery', 'arc', 'A Healed Arm Without a Return to Duty', 'The veteran and care team are exploring impaired chakra flow while he reconsiders his future. Conflicting goals for rehabilitation, work and independence develop over repeated visits; neither a diagnosis nor a duty plan has been agreed.')],
        messages: [message('assistant', 'The team still has no diagnosis. The veteran is undecided about returning to active duty.'),
            message('user', 'A week passes. I wait outside the consultation room.', 1)],
        keep: ['r1-recovery'], drop: [],
        review: 'Keep the central rehabilitation arc despite sharing the incidental-case title. Bare elapsed time cannot establish treatment, a diagnosis, a cure, clearance or the player committing to a plan.' },
];

export async function seedArcFocus(fixture) {
    const first = await liveCardPass(fixture, emptyCampaign(), [], async () => ({ finishReason: 'stop', text: JSON.stringify({
        reviewAfter: 12, foundation: { reminder: fixture.reminder, changeReason: '', scratchpad: '' },
        upsert: fixture.nodes, retain: [], retire: [], select: [],
    }) }));
    if (!first.accepted || !first.validState) throw Error('Invalid synthetic arc-focus seed.');
    return first.state;
}
