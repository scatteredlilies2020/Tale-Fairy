// Synthetic RP premises and hand-authored planner fixtures, NOT model outputs.
// The evaluator also supports real provider responses using these same premises.
export const ensemblePressureCases = [
    {
        id: 'naruto-ensemble', title: 'Naruto: Rin alive, multiple viewpoints',
        premise: 'An expansive alternate Naruto RP. The user controls Rin and an original civilian, Sora, across separate viewpoints. Rin is alive. Ninja teams, village leaders and civilian households have independent concerns; not every story intersects. Only the supplied changes are established; canonical consequences must be reconsidered rather than forced.',
        playerNames: ['Rin', 'Sora'],
        accepted: 'A training session ended. Elsewhere, Sora finished helping at a market stall. Both scenes are quiet; no new mission has been assigned.',
        user: 'Stay with the evening conversations for now, without abandoning the wider world.',
        reminder: 'Ninja duties, village interests, rivalries and personal bonds sustain an ensemble world alongside civilian livelihoods. Different groups can develop independently. Quiet scenes fit within these pressures; Rin surviving means canon is a reference, not a required future. Invent compatible possibilities without funneling every concern toward Rin or Sora.',
        scratchpad: 'Established: Rin is alive; Rin and Sora are player-controlled. Canon reference: any event depending on a different fate needs reconsideration. Uncertain: downstream consequences are not established. Possibility: team readjustment, not a scheduled mission.',
        card: { kind: 'arc', title: 'Finding a workable team rhythm', owner: 'Village training staff',
            description: 'Encourage changing teamwork and differing expectations about duty, without prescribing the next assignment or anyone\'s decision.',
            endsWhen: 'The immediate teamwork difficulty is settled or the arrangement is abandoned.' },
    },
    {
        id: 'naruto-civilians', title: 'Naruto: civilian foreground, ninja background',
        premise: 'An open Naruto-setting RP mainly follows civilian households, shops and friendships. The user controls a tailor Aya and her adult brother Jun. Ninja institutions exist in the background. Neither player character is a ninja, and the RP is not seeking to turn them into one.',
        playerNames: ['Aya', 'Jun'], accepted: 'Aya closed her shop; Jun met a neighbor over tea. A community noticeboard has space for a local event, but no event has been chosen.',
        user: 'Continue the neighborhood scene.',
        reminder: 'Civilian livelihoods, friendships, household ambitions and community occasions provide the foreground movement. Ninja affairs may affect the village in the background but need not become missions for these characters. Independent neighbors can bring compatible new interests and opportunities; everyday quiet does not require danger.',
        scratchpad: 'Established: Aya and Jun are civilians controlled by the player. No mission or crisis is established. Proposed: neighbors might organize a shared occasion; its form and participation remain open.',
        card: { kind: 'thread', title: 'A neighborhood occasion', owner: 'Neighborhood association',
            description: 'Encourage local acquaintances and shared interests around a possible community occasion, rather than a mission or obligation.',
            endsWhen: 'The occasion concludes or the idea is set aside.' },
    },
    {
        id: 'frieren-like-travel', title: 'Frieren-like travel in an original world',
        premise: 'An original fantasy world with a Frieren-like reflective journey, not franchise canon. The user alternates between two travelers, Neri and Tal. Settlements and other travelers have their own lives. Discovery, unfamiliar customs and slowly changing companionship matter; neither constant combat nor mandatory meetings are wanted.',
        playerNames: ['Neri', 'Tal'], accepted: 'The travelers reached a wayside inn and set their packs down. The route continues through several inhabited valleys; none of their customs has yet been described.',
        user: 'Let them rest and talk over supper.',
        reminder: 'Travel sustains encounters with unfamiliar communities, customs, landscapes and people, alongside changing companionship. Each place can have independent interests worth discovering. Rest and reflection belong to the journey; keep room for new experiences without forcing departures, introductions or combat on a timetable.',
        scratchpad: 'Original setting: no external canon events to reproduce. Established: the travelers are resting. The valleys beyond are open to compatible invention; unvisited places and proposed encounters are not witnessed history.',
        card: { kind: 'arc', title: 'Passing through unfamiliar valleys', owner: 'Valley communities',
            description: 'Encourage distinctive local lives and discoveries along the wider journey, leaving routes, encounters and participation open.',
            endsWhen: 'This stretch of the journey is left behind or no longer pursued.' },
    },
    {
        id: 'star-wars-respite', title: 'Star Wars: respite within war and politics',
        premise: 'An ensemble Star Wars RP with original characters and user-specified alternate events. The user controls rescued civilian Lio and politically involved envoy Sen on separate viewpoints. War displaced Lio; Sen is negotiating access to relief supplies. The refuge is currently safe. Recovery should not erase the political setting, nor justify an attack on every quiet scene.',
        playerNames: ['Lio', 'Sen'], accepted: 'Lio was rescued and given a room in a safe refuge. Sen received confirmation that relief discussions would continue; no deal or betrayal has happened.',
        user: 'Spend some time on an ordinary meal and getting comfortable.',
        reminder: 'Recovery, personal bonds, relief work and competing political interests coexist in a wartime ensemble. A safe interval allows genuine respite without erasing wider obligations and intrigue. Factions can pursue independent concerns, but not every development involves Lio or Sen; no attack, betrayal or canon event is required.',
        scratchpad: 'Established: rescue succeeded and the refuge is presently safe; relief talks are ongoing. Unknown: their outcome and other factions\' next actions. No canonical incident or secret betrayal is established by these notes.',
        card: { kind: 'arc', title: 'Terms of relief access', owner: 'Relief negotiators',
            description: 'Encourage competing interests, trust and practical consequences around relief access, without specifying a deal, betrayal or interruption of recovery.',
            endsWhen: 'The immediate access question is settled or negotiations are abandoned.' },
    },
    {
        id: 'original-sandbox', title: 'Original large sandbox with independent regions',
        premise: 'A large original AI-Dungeon-like sandbox of floating islands. The player switches between courier Iven, scholar Mae and farmer Oru in different regions. No single protagonist, universal quest or mandatory convergence. Weather routes, local institutions, discoveries and ordinary relationships can create appropriate movement. Invent new people and places consistent with the premise.',
        playerNames: ['Iven', 'Mae', 'Oru'], accepted: 'Iven reached a rest station. Mae finished reading a familiar map. Oru shared a meal with neighbors. No emergency or connection between the scenes is established.',
        user: 'Move the spotlight between these lives when useful, without controlling my characters.',
        reminder: 'Independent island communities, routes, scholarship, livelihoods and relationships sustain this broad sandbox. The spotlight can shift without shrinking the world to one protagonist or merging unrelated concerns. Invent fitting people, places and opportunities; discoveries and everyday ambitions can create movement without a universal crisis.',
        scratchpad: 'Original setting: no canon plot. Established: three separate viewpoints, no common emergency. Proposed concerns remain independent; do not manufacture links or completed off-screen developments.',
        card: { kind: 'thread', title: 'An incomplete picture of the routes', owner: 'Island mapmakers',
            description: 'Encourage discovery and differing local knowledge about island routes, without assigning a quest or connecting all player characters.',
            endsWhen: 'The current mapping question is answered, superseded or abandoned.' },
    },
    {
        id: 'original-intimate', title: 'Original one-to-one quiet relationship RP',
        premise: 'An original, intentionally intimate RP about the user-controlled Eli and NPC neighbor Mara restoring a small shared garden. Ordinary life and a slowly developing friendship are the focus. Do not add a political saga, travel requirement, rotating cast or constant problems to manufacture movement.',
        playerNames: ['Eli'], accepted: 'Mara and Eli finished clearing one bed and sat together in the shade. Neither has decided what to plant.',
        user: 'I enjoy the quiet with her.',
        reminder: 'Shared work, small discoveries and a changing friendship provide movement at an intimate scale. Comfortable silence and ordinary pleasures are valid; let interests and relationships develop without compulsory new characters, conflict or a wider saga. Preserve Eli\'s choices and the open future of the relationship.',
        scratchpad: 'Original setting. Established: one garden bed is clear; planting is undecided. No relationship outcome or player commitment should be inferred.',
        card: { kind: 'thread', title: 'Making the garden their own', owner: 'Mara',
            description: 'Encourage shared interests and different ideas about the garden while leaving participation, planting choices and the relationship open.',
            endsWhen: 'This garden project is completed, set aside or substantially replaced.' },
    },
    {
        id: 'mixed-original-canon', title: 'Mixed canon setting with original factions',
        premise: 'An alternate Star Wars setting centered on an original neutral port and its own fictional trade cooperative. The user controls mechanic Ves and visiting diplomat Arin. Supplied original institutions are authoritative; outside canon may inform compatible background, not overrule the port\'s established neutrality. Several independent social and political stories are possible.',
        playerNames: ['Ves', 'Arin'], accepted: 'The cooperative repaired a shared shuttle and reaffirmed its neutral charter. Arin attended an informal reception. No embargo or faction takeover has occurred.',
        user: 'Explore life in the port, not just famous canon characters.',
        reminder: 'The neutral port\'s own institutions, trade, inventions and relationships sustain an ensemble of local and visiting lives. Outside political interests remain relevant background without replacing original material with famous canon plots. Invent compatible opportunities and acquaintances; preserve neutrality as established unless play actually changes it.',
        scratchpad: 'Established original material: neutral charter, repaired shuttle, cooperative. Canon is a tentative background reference, not evidence of an embargo or takeover. Possible disagreements remain proposals, not events.',
        card: { kind: 'arc', title: 'Cooperation without allegiance', owner: 'Port cooperative',
            description: 'Encourage varied interests and working relationships within the neutral charter, without guaranteeing a faction conflict or prescribing political choices.',
            endsWhen: 'The current cooperation question is settled or ceases to matter.' },
    },
];

export function fixtureDirectorReply(fixture, { prefix = 'r1-', previous } = {}) {
    const id = previous?.nodes?.[0]?.id || `${prefix}concern`;
    const { title, kind, owner, description, endsWhen } = fixture.card;
    return {
        direction: 'Current quiet scene within the continuing RP.', reviewAfter: 12,
        foundation: { reminder: previous?.foundation ? '' : fixture.reminder, changeReason: '', scratchpad: fixture.scratchpad },
        upsert: previous?.nodes?.length ? [] : [{ id, kind, parentId: '', status: 'proposed', title, owner, description, endsWhen, links: [] }],
        retire: [], select: [{ id, title, context: [], description, development: '', endsWhen }],
    };
}
