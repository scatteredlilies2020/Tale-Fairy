// Deliberately authored examples, not model output or assertions about exact canon.
// All named settings here are alternate RP premises, with player choices left open.
const effect = (label, pressure) => ({ label, pressure });
const card = (id, kind, title, owner, description, effects, endsWhen = '', parentId = '', status = 'active') =>
    ({ id, kind, title, owner, description, effects, endsWhen, parentId, status, links: [] });

export const storyCardCases = [
    {
        id: 'naruto', title: 'Naruto · A village under diplomatic strain',
        premise: 'Alternate Naruto ensemble. Cloud has demanded redress after a failed attempt against the Hyuga. Rin is alive. The user switches between Rin and a civilian shopkeeper. Settlement is unresolved. Village routines and politics coexist.',
        players: ['Rin', 'Aki'],
        reminder: 'Shinobi villages balance security, clan interests and civilian livelihoods. Missions, training, trade and friendships sustain separate lives; diplomacy changes their opportunities even during ordinary days.',
        direction: 'An unresolved diplomatic demand puts clan security and village peace in tension.',
        notes: 'Rin is alive in this RP; canon outcomes depending on her death are not established. The diplomatic settlement remains open.',
        cards: [
            card('relations', 'saga', 'Cloud–Konoha relations', 'Village leadership and border interests', 'Rival villages seek security and leverage while keeping the cost of war in view.',
                [effect('Diplomatic strain', 'Border assignments, intelligence sharing and merchant confidence become politically sensitive.')]),
            card('hyuga', 'arc', 'The Hyuga Affair', 'Hyuga leadership, Hokage and Cloud envoys', 'Clan protection and the village settlement pull on each other.',
                [effect('Unequal stakes', 'A settlement that reassures envoys can deepen resentment inside the clan.')],
                'The immediate demand is settled, withdrawn or displaced by a new situation.', 'relations'),
            card('trade', 'thread', 'Orders beyond the village gates', 'Carriers and local shopkeepers', 'Village businesses seek dependable customers and routes while rumors unsettle trade.',
                [effect('Cautious credit', 'Suppliers favor reliable local partners, opening favors and new working relationships.')],
                'Current delivery terms are settled or the orders are abandoned.', 'relations', 'proposed'),
        ],
    },
    {
        id: 'star-wars', title: 'Star Wars · The machinery behind the war',
        premise: 'Alternate late-Republic Star Wars. The Senate is corrupt and Sith influence operates behind galactic instability. The user controls rescued civilian Lio and envoy Sen. The refuge is safe. Relief access is being negotiated; its outcome is open.',
        players: ['Lio', 'Sen'],
        reminder: 'Jedi obligations, Sith ambition, Senate patronage and trade power shape a war-torn galaxy. Refuge, recovery and ordinary bonds coexist with independent political projects across worlds.',
        direction: 'Safe respite continues while control of reconstruction becomes political leverage.',
        notes: 'The rescue succeeded. A covert intermediary is a creative possibility, not an already witnessed meeting or fixed identity.',
        cards: [
            card('power', 'saga', 'Who benefits from reconstruction?', 'Senate patrons, commercial interests and Sith networks', 'Rebuilding worlds distributes loyalty as well as supplies.',
                [effect('Patronage economy', 'Approvals and contracts favor useful allies, making honest relief work depend on compromised institutions.'),
                    effect('Hidden Sith hand', 'A plausible covert intermediary can cultivate indebted officials and redirect trade; their identity and exposure remain open.')]),
            card('relief', 'arc', 'Terms of relief access', 'Relief organizers, Senate aides and trade delegates', 'Access negotiations reveal what each institution values and what it can quietly trade.',
                [effect('Competing obligations', 'Jedi protection, commercial privileges and local autonomy complicate offers of help.')],
                'The immediate access terms are settled or the effort changes course.', 'power'),
            card('refuge', 'thread', 'A place between departures', 'Refuge staff and displaced households', 'Meals, work and shared spaces let displaced lives reconnect.',
                [effect('Everyday reciprocity', 'Small favors create acquaintances and belonging while people decide what comes next.')],
                'This temporary household disperses or settles into a lasting arrangement.'),
        ],
    },
    {
        id: 'k-on', title: 'K-on · A small world with plenty in it',
        premise: 'K-on-inspired Japanese school ensemble. The user controls a club member and a classmate. A school festival performance is approaching. The club values music, tea, friendship and its place in school life; it is not a grim competition story.',
        players: ['Nao', 'Emi'],
        reminder: 'Music, tea, school traditions and affectionate friendships make ordinary days worth exploring. Club ambitions intersect with classmates, families and other clubs; their different enthusiasms sustain a warm, playful ensemble.',
        direction: 'The festival gives the club something to make together, alongside everyday school life.',
        notes: '',
        cards: [
            card('school', 'saga', 'A year that belongs to them', 'Club members, classmates and school traditions', 'Shared interests turn the school calendar into personal memories.',
                [effect('Shared enthusiasm', 'Songs, snacks and small club customs invite classmates into new friendships.')]),
            card('festival', 'arc', 'Their festival set', 'Light music club and festival committee', 'Choosing and practicing a set lets different tastes become a shared performance.',
                [effect('Rehearsal gravity', 'Room bookings and song choices bring other clubs, helpful classmates and competing tastes into view.')],
                'The festival performance is over or the club sets it aside.', 'school'),
            card('snacks', 'thread', 'Something homemade for club time', 'Club friends and family kitchens', 'Trying a recipe gives everyone something small to contribute.',
                [effect('A reason to gather', 'Recipe experiments and shared cleanup make room for little discoveries about one another.')],
                'The snack experiment is shared or set aside.', 'school', 'proposed'),
        ],
    },
    {
        id: 'baki', title: 'Baki · Reputation has weight',
        premise: 'Baki-inspired modern-Japan martial ensemble. The user controls a young martial artist and an unrelated gym medic. A private exhibition is being organized. Training cultures, status and physical limits matter, without prescribing the player\'s fights.',
        players: ['Jun', 'Rei'],
        reminder: 'Martial ambition, embodied skill and the search for worthy opponents shape this Japan. Dojos, trainers, patrons and ordinary livelihoods surround its fighters; reputation changes access and relationships.',
        direction: 'An exhibition draws different schools and independent ambitions into contact.',
        notes: '',
        cards: [
            card('status', 'saga', 'Strength and recognition', 'Dojo leaders, fighters and private patrons', 'Different traditions disagree about what counts as real strength.',
                [effect('Reputation opens doors', 'Convincing skill attracts introductions, scrutiny and rivals with distinct reasons to test themselves.')]),
            card('exhibition', 'arc', 'The private exhibition', 'Organizers and invited schools', 'A shared venue makes contrasting methods and ambitions tangible.',
                [effect('School pride', 'Selection and match arrangements expose rivalries among sponsors, teachers and students.')],
                'The exhibition concludes, is cancelled or loses its purpose.', 'status'),
            card('recovery', 'thread', 'The cost of training', 'Gym staff and independent trainees', 'Recovery work connects people whose ambitions outrun their routines.',
                [effect('Limits have consequences', 'Injuries and care obligations change access to training, trust and advice.')],
                'The current recovery work is finished or handed over.'),
        ],
    },
    {
        id: 'frieren', title: 'Frieren · Roads through other people’s lives',
        premise: 'A Frieren-inspired travel ensemble. The user controls a traveling mage and a separate town apprentice. The current town is peaceful. Long lifespans, small spells, local histories and the lives between great events matter.',
        players: ['Elen', 'Tavi'],
        reminder: 'Travel passes through communities with their own memories, trades and small ambitions. Magic, local customs and encounters reveal different relationships with time; peaceful stops can be as meaningful as distant danger.',
        direction: 'A peaceful stop offers local lives and small discoveries before the road continues.',
        notes: '',
        cards: [
            card('road', 'saga', 'Lives along the northern road', 'Towns, travelers and keepers of local knowledge', 'Routes connect independent communities without making their concerns identical.',
                [effect('Local reasons to linger', 'Unfamiliar customs, useful spells and people with unfinished interests make each stop distinct.')]),
            card('bell', 'arc', 'A bell nobody remembers tuning', 'Town artisans and the bell keeper', 'An ordinary repair opens different memories of the town and its old craft.',
                [effect('Living memory', 'Practical work brings younger apprentices and older residents into differing accounts of the same tradition.')],
                'The bell question is settled or the travelers leave it with the town.', 'road'),
            card('spell', 'thread', 'A spell for keeping letters dry', 'Postal workers and an itinerant spell collector', 'A modest piece of magic is valuable for reasons unrelated to battle.',
                [effect('Useful curiosity', 'Exchanging practical tricks can create acquaintances, favors and reasons to visit another place.')],
                'The current spell exchange is completed or declined.', 'road', 'proposed'),
        ],
    },
    {
        id: 'original', title: 'Original world · The floating archipelago',
        premise: 'An original floating-island sandbox with several viewpoints. The user controls courier Iven, scholar Mae and farmer Oru in different regions. Seasonal winds reshape safe routes. Water rights, trade and observatories are independent institutions, not one universal quest.',
        players: ['Iven', 'Mae', 'Oru'],
        reminder: 'Independent islands depend on changing winds, shared water and uneven knowledge. Routes, scholarship, livelihoods and local friendships create opportunities across an ensemble whose lives need not converge.',
        direction: 'Seasonal routes invite competing plans for trade and shared resources.',
        notes: 'Original setting. New institutions and characters should grow from its travel and resource conditions.',
        cards: [
            card('routes', 'saga', 'Who gets a reliable passage?', 'Courier cooperatives and wind observatories', 'Practical knowledge of the sky carries economic power.',
                [effect('Uneven access', 'Accurate route forecasts buy favors, attract new crews and shift which settlements can trade.')]),
            card('water', 'saga', 'A fair share of the clouds', 'Reservoir councils and farming communities', 'Communities negotiate what they owe one another when rain falls unevenly.',
                [effect('Interdependence', 'Water-sharing arrangements encourage hospitality, bargaining and technical ingenuity between islands.')]),
            card('charts', 'arc', 'The open-chart season', 'Independent mapmakers and courier cooperatives', 'Sharing navigation knowledge pits mutual access against the value of a private advantage.',
                [effect('Knowledge as currency', 'Chart contributions make unlikely working partners and give smaller settlements bargaining power.')],
                'This season\'s sharing arrangement is settled or abandoned.', 'routes'),
        ],
    },
];

export function cardCaseReply(fixture, prefix = 'r1-') {
    const upsert = fixture.cards.map(node => ({ ...structuredClone(node), id: prefix + node.id,
        parentId: node.parentId ? prefix + node.parentId : '', links: node.links.map(id => prefix + id) }));
    const rows = new Map(upsert.map(node => [node.id, node]));
    return { direction: fixture.direction, reviewAfter: 12,
        foundation: { reminder: fixture.reminder, changeReason: '', scratchpad: fixture.notes },
        upsert, retire: [], select: upsert.filter(node => ['proposed', 'active'].includes(node.status)).map(node => {
            const context = [];
            for (let parent = rows.get(node.parentId); parent; parent = rows.get(parent.parentId)) context.unshift({ kind: parent.kind, title: parent.title });
            return { id: node.id, title: node.title, context, description: node.description, endsWhen: node.endsWhen, development: '' };
        }) };
}
