// Synthetic accepted transcripts, fixed before generation. No real chat text.
import { defaultPreparedWorld } from '../extension/prepared-world.js';
const assistant = mes => ({ name: 'Narrator', is_user: false, mes });
const user = mes => ({ name: 'Neri', is_user: true, mes });
const pair = (a, u) => [assistant(a), user(u)];
const record = (id, premise, middle) => ({ id, premise, middle, status: 'active', origin: 'invented', family: 'costume_delivery', dependency: 'Depends on the current missing costume shipment.', future: '', knowledge: 'The shipment is missing; criminal intent has not been established.' });

export function touringCase() {
    const notebook = defaultPreparedWorld();
    notebook.approach = 'Develop the missing costume shipment and its network of carriers, witnesses and commercial consequences in Bracken. Let the wider theatrical world emerge through this delivery problem.';
    notebook.summary = 'The company is looking for its costumes in Bracken before tonight\'s show. The warehouse, carrier and theatre manager all matter to solving the missing shipment.';
    notebook.items = [
        record('warehouse_search', 'The touring company\'s costumes have not arrived at Bracken theatre.', 'The warehouse keeper can compare delivery labels while the stage manager looks for a usable backup. A misdelivery and a deliberate diversion remain possibilities.'),
        record('carrier_questions', 'A carrier remembers dropping trunks behind a hall.', 'His route and the theatre order may identify the correct delivery without establishing theft.'),
        record('theatre_deadline', 'The theatre manager needs to know whether tonight\'s show can use its costumes.', 'A delay could change the evening programme; no postponement has been decided.'),
    ];
    notebook.focus = ['warehouse_search', 'carrier_questions', 'theatre_deadline'];
    const bootstrap = {
        description: 'An open-ended, low-magic RP following a small traveling theatre company through several regions and seasons. Ensemble companionship, performance, craft, unfamiliar audiences, ordinary pleasures and changing artistic ambitions are all part of its life. It is not a detective series. The troupe can revisit places and people; neither a fixed tour nor a predetermined artistic destination is required.',
        persona: 'The user controls Neri, born Edda: these are names of ONE person, a performer and stage carpenter. Only the user decides Neri\'s choices, feelings, dialogue and commitments.',
        scenario: 'Early spring. Company leader Mara loves familiar comic pieces. Musician Jo usually arranges other people\'s work; drummer Sef likes informal music but dislikes public solos. They are companions, not enemies by default.',
    };
    const messages = [
        ...pair('At the start of the spring travels, the company leaves its winter rooms. Jo says, "Someday I\'d like to write something of my own, not just arrange other people\'s tunes." Mara is cleaning a much-mended comic mask. No one has settled the itinerary.', 'I am happy to travel with them. Let\'s see what this season brings.'),
        ...pair('In Bracken, the trunks of costumes have not reached the theatre. The carrier may have delivered them to the wrong hall. The warehouse keeper brings out the delivery labels; no theft is established.', 'Let\'s compare the labels carefully before accusing anyone.'),
    ];
    const stages = [
        { name: 'initial-review', broad: true, append: [] },
        { name: 'local-pressure', broad: false, append: pair('The keeper finds two similar hall names on separate labels. The carrier waits while Mara checks the costume list. Nobody has opened the second hall yet.', 'Which address is actually on our order? I check it with Mara.') },
        { name: 'episode-closed', broad: false, append: pair('The costumes are intact at the other hall. It was an address mix-up, not theft. The carrier apologizes, the agreed delivery fee is settled, and the troupe finishes the evening performance. The company has no remaining obligation to investigate the shipment.', 'Good, that is settled. I sit with Jo and Sef after the show and ask what they enjoyed playing. Tomorrow I would like to travel with the company to Mere.') },
        { name: 'chosen-transition', broad: false, append: pair('The next morning, following Neri\'s agreed choice to travel, the company arrives at the river settlement of Mere. Jo hums a short unfinished phrase while they unpack at a guesthouse; she says it is hers but has not decided what to make of it. Nobody in Mere is connected to the costume error.', 'Could we make some room for trying new things while we are here? I ask Jo whether she wants to play me the phrase.') },
        { name: 'accepted-development', broad: false, append: pair('Jo plays Neri a rough duet she has been working on. Sef declines a public premiere but agrees to a private read-through. Mara offers the rehearsal room without promising a public slot. Jo says she wants to work with Sef rather than replace him. No public performance is booked.', 'Let\'s keep the first reading private, then. I help set up the room, and leave the musical choices to them.') },
        { name: 'unrelated-pressure', broad: false, append: pair('After that private reading, Jo has revised the rhythm to leave Sef more room. They agree to try it again when willing; neither has accepted a public booking. Downstairs, the guesthouse oven breaks and the cook wonders how to feed tonight\'s guests. The oven problem has no connection to their music.', 'I ask the cook what we can prepare without the oven. We do not need to cancel everyone\'s other plans over dinner.') },
        { name: 'later-review', broad: true, append: pair('Dinner was served cold and nobody was stranded. Two days later the company is still in Mere. Jo and Sef have kept their revised duet; the private experiment has not become a public booking. Mara asks what the company would like to make room for as the spring travels continue. Neither an itinerary nor a later show is settled.', 'I would like us to leave room for people\'s own work, and for seeing places rather than just rushing between jobs. What possibilities do the others see?') },
    ];
    return { name: 'touring', bootstrap, notebook, messages, stages, note: '' };
}

export function closedCase() {
    return {
        name: 'closed', notebook: defaultPreparedWorld(), note: '',
        bootstrap: { description: 'A deliberately closed, one-evening family RP. Stay within tonight\'s meal and reconciliation; do not propose a journey, sequel, new external crisis or campaign. Depth is welcome, escalation is not required.', persona: 'The user controls Neri, born Edda; one person, not siblings or an outside observer.', scenario: 'Neri and older sister Ada are cooking with their father Len. Ada has said she wants Len to listen rather than offer solutions. Len has acknowledged this. No estrangement is established.' },
        messages: pair('Len puts down his suggestions and asks Ada what she wanted him to understand. Ada says she misses meals together, not that she needs rescuing. The soup is ready; they have not yet sat down.', 'I carry the bowls to the table and let them talk.'),
        stages: [{ name: 'review', broad: true, append: [] }],
    };
}

export function workshopCase() {
    return {
        name: 'workshop', notebook: defaultPreparedWorld(), note: '',
        bootstrap: {
            description: 'An open-ended original coastal-town simulation across seasons. Neri runs a well-funded community workshop. Building useful things, local friendships, the sea, trade with neighboring towns and communal celebrations are all part of the RP. No fixed ending or mystery plot is required.',
            persona: 'The user controls Neri. Only the user decides their actions, commitments and feelings. The workshop already owns good tools and materials; it does not need permission to accept projects.',
            scenario: 'Early summer in Merehaven. Boatwright Mira works with Neri and enjoys practical experiments. Ivo runs the nearby kitchen and welcomes visitors. Clerk Pella handles orders independently. They are competent colleagues, not opponents by default.',
        },
        messages: [
            ...pair('The workshop has opened for the summer season. The harbor serves fishing boats and small ferries; people from nearby islands come to Merehaven for trade and visits. Mira is finishing ordinary repairs at her bench, while Ivo opens the kitchen doors to the quay.', 'I want the workshop to be useful, but I also want time to get to know the town and explore beyond it.'),
            ...pair('Pella finds that a supplier wrote twelve hinges on the invoice although ten were ordered and delivered. She has the original order beside her and can correct the invoice herself. Mira continues her repair; no customer is waiting on this discrepancy.', 'Let Pella settle the invoice. I walk down to the waterfront.'),
        ],
        stages: [{ name: 'initial-review', broad: true, append: [] }],
    };
}
