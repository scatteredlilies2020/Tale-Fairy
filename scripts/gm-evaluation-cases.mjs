// Independent, fictional acceptance scenes. Never written into a user's chat.
// Assess results semantically; no story-specific production routing uses these.
import { defaultState } from '../extension/state.js';

const message = (is_user, mes, name = is_user ? 'Rowan' : 'Narrator') => ({ is_user, mes, name });
const preparation = (id, premise, middle, hold = '') => ({ id, premise, middle, hold, status: 'prepared', origin: 'established' });
function scene(description, messages, entities, items, continuation, checks) {
    const state = defaultState();
    state.entities = entities;
    state.preparedWorld = { overview: description, focus: items.map(item => item.id).slice(0, 3), items };
    return { description, messages, metadata: { livingWorldGuide: state }, continuation, checks };
}

export const cases = {
    country: { ...scene('A grounded country simulation in the small republic of Aster. Rowan is the elected head of government, not an omnipotent ruler. Develop politics, livelihoods, institutions and international relationships over years, through decisions and consequences rather than crisis every turn.', [
        message(false, 'The assembly rejects the emergency grain tax. Finance minister Iona begins consulting the districts about a voluntary transport compact. Coastal merchants want access to inland markets; inland growers want reliable roads, not another levy. The neighboring republic has offered technical talks, not an alliance.'),
        message(true, 'I want a country sim with meaningful domestic development and competing interests, not a constant parade of coups. I ask Iona what local councils actually need.'),
        message(false, 'Iona lays out three district submissions. One needs bridge maintenance, another wants control of its depot, and the third asks for transparent accounts. She has not promised any concessions. The independent harvest survey will take until autumn.'),
    ], [], [], 'I read the submissions and ask Iona to explain the disagreements without deciding for me.', [
        'Offer lasting, distinct domestic and international possibilities, not guaranteed outcomes.',
        'No automatic alliance, passed tax, known harvest result or decision for Rowan.',
        'Retained brief remains usable without a planner call; pivot changes the approach without erasing unrelated possibilities.',
    ]), followup: 'I ask what each district would consider a fair arrangement. No decision yet.',
        pivot: 'OOC: Pause governing for now. I want to explore Rowan’s family life and relationships over the summer, not have every family conversation become a national policy debate. Do not erase the country’s existing circumstances.' },
    adventure: { ...scene('A wandering fantasy RP. Rowan travels with mapmaker Sela and healer Oren, heading eventually toward the northern observatory. The journey should contain varied places, people, local affairs, exploration and dangerous or peaceful discoveries with their own reasons to exist. The destination is not a deadline; Rowan controls only Rowan.', [
        message(false, 'At the river inn, Sela spreads her unfinished map. The eastern route crosses several inhabited valleys; the western path follows abandoned aqueducts. Oren has been exchanging letters with a clinic in the north. Nobody has selected a route yet.'),
        message(true, 'Make this a real journey with settlements, exploration and relationships, not constant bandits or skipping straight to the observatory. I ask what the valleys are like.'),
        message(false, 'Sela describes orchards, ferry villages and a high stone causeway, but admits she has never crossed the upper valleys. Oren says the clinic’s last letter mentioned a new apprentice and shortages of winter supplies, not an epidemic. The innkeeper begins setting out supper.'),
    ], [], [], 'I stay at supper and listen to their different impressions. Don’t choose my route for me.', [
        'Prepare varied places, people and exploration beyond the current supper; no mandatory bandit attack.',
        'Keep upper valleys unknown to Sela and do not turn a supply shortage into an established epidemic.',
        'Quiet conversation supports rich longer-term play without forced departure or player decisions.',
    ]), followup: 'I ask Sela what she enjoys about mapmaking while we eat.',
        pivot: 'OOC: I no longer want the observatory as our goal. Let this become a longer-term life in the river town: work, neighbors, friendships and changing local affairs. Keep the wider world available, but no pressure to resume the journey.' },
    life: { ...scene('A contemporary life simulation in a seaside town. Rowan has moved into an inherited house and wants work, friendships, hobbies and relationships to evolve over months. Neighbors have their own lives; ordinary life need not become a conspiracy or emergency.', [
        message(false, 'Neighbor Nadi brings a spare set of keys and describes the town’s shared repair workshop. Her brother Emil teaches sailing on weekends. Rowan’s inherited house needs repairs, but the inspection found no immediate danger.'),
        message(true, 'I want a life sim where people and opportunities develop over time. Don’t turn everything into chores or make everyone dependent on me. I ask Nadi about the workshop.'),
        message(false, 'Nadi says the workshop is deciding whether to share its room with a small photography club. She favors the extra rent; its founder worries about losing bench space. Emil is away until Friday. Nadi returns to painting her own window frames while they talk.'),
    ], [], [], 'I ask what Nadi likes to do besides repairs. Let the conversation breathe.', [
        'Develop relationships, work and interests over time, not a list of immediate chores.',
        'No forced romance, mystery, emergency, return of Emil or decision for Rowan.',
        'Retain possibilities without claiming elapsed months or completed repairs from message count.',
    ]), followup: 'I listen and ask how she met the other neighbors.',
        pivot: 'OOC: Shift toward building a photography business over the next year, including its practical tradeoffs. Keep friendships and home life present, but don’t assume I have accepted clients or spent money yet.' },
    workshop: scene('A quiet contemporary ceramics workshop. Rowan is the player; Mara and Dev are independent adults. No danger or mystery is pending.', [
        message(false, 'At 10:00, Mara sets a glazed bowl beside the cooling kiln. She promises to demonstrate polishing once it cools. Dev is arranging a community exhibition at the other bench.'),
        message(true, 'I sit down to sketch. I want a quiet morning here, not another errand.'),
        message(false, 'At 10:20 the kiln indicator turns green. Mara tests the bowl, lifts it safely, and begins polishing. Dev receives confirmation that the exhibition hall is available next month.'),
        message(true, 'I keep sketching and listen.'),
        message(false, 'Mara finishes the first section and holds its matte and polished surfaces side by side. Dev writes the exhibition date on the workshop calendar. Neither needs Rowan to organize their work.'),
    ], [{ name: 'Mara', constraints: 'Wait for Rowan to request the demonstration.', state: 'Waiting for the kiln to cool.' }], [
        preparation('demonstration', 'The kiln is still cooling.', 'Mara can begin polishing when Rowan gives permission.', 'Wait while Rowan sketches.'),
        preparation('exhibition', 'Dev is waiting for the hall booking.', 'Dev can organize a shared exhibition if the venue confirms.'),
    ], 'I stay here sketching. Let the quiet conversation continue.', [
        'Correct completed cooling, demonstration already started, and confirmed venue.',
        'Allow independent workshop/exhibition activity without making Rowan organize it.',
        'Preserve quiet pacing, location and player choices; no forced quest or interruption.',
    ]),
    station: scene('Grounded science fiction aboard a civilian orbital station. Rowan controls only Rowan. NPC knowledge is limited to what they witness or are told.', [
        message(false, 'At 14:00 in operations, engineer Inez promises to stay until the pressure patch passes its test. Medic Bo privately learns from the lab that the coolant is contaminated; nobody outside sickbay has been told.'),
        message(true, 'Once the patch passes, I will handle the charts. Inez should get some rest.'),
        message(false, 'At 14:12 the patch passes all tests. Inez hands over the maintenance log and leaves operations for her cabin. She says she is off duty until tomorrow and will not answer routine calls. Bo seals the sample in sickbay and starts the required contamination report.'),
        message(true, 'I stay in operations and read the maintenance log.'),
        message(false, 'The log confirms a sound pressure patch and a routine filter replacement due next week. It contains no laboratory results. Inez closes her cabin door; Bo has not yet transmitted the report.'),
    ], [
        { name: 'Inez', location: 'operations', state: 'Available for troubleshooting.', constraints: 'Must remain until the pressure test passes.' },
        { name: 'Bo', location: 'sickbay', knowledge: 'The coolant is contaminated; lab result is private.' },
    ], [preparation('patch', 'The pressure patch is untested.', 'Inez and Rowan can test it together.', 'Inez cannot leave yet.')],
    'I continue checking the maintenance log. Do not call Inez back.', [
        'Resolve the completed patch task; keep Inez off duty in her cabin.',
        'Keep the laboratory result private until an actual communication occurs.',
        'Allow Bo to work independently without automatically granting Rowan knowledge.',
    ]),
    garden: scene('A small-town community garden. A relaxed social scene, with no conspiracy. Rowan controls only Rowan.', [
        message(false, 'Mina and Alex prepare the garden open day. Jules brings seed trays. Alex calls Jules a colleague.'),
        message(true, 'OOC correction: Jules is Mina’s sibling, not Alex’s. The open day is Saturday, not Sunday. Keep it relaxed.'),
        message(false, 'Mina introduces Jules as her sibling. Alex corrects the calendar to Saturday. Jules delivers all the promised trays and leaves to open their own shop.'),
        message(true, 'I stay to help label the plants.'),
        message(false, 'Mina begins labeling herbs while Alex checks the watering schedule. The trays are already stacked by the greenhouse. Jules is at the shop, not waiting beside the gate.'),
    ], [{ name: 'Jules', location: 'garden gate', state: 'Alex’s sibling, waiting to deliver seedlings.' }], [
        preparation('trays', 'Jules has not delivered the seed trays.', 'Alex and Rowan can arrange the delivery.'),
    ], 'I keep labeling plants and chat with Mina.', [
        'Respect corrected kinship and Saturday date across state and preparation.',
        'Do not replay the delivered trays or summon Jules back without cause.',
        'Keep the scene relaxed and leave Rowan’s speech and choices to the player.',
    ]),
};
