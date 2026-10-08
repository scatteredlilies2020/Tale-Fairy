// Synthetic RP premises and hand-authored planner fixtures, NOT model outputs.
// The evaluator also supports real provider responses using these same premises.
export const ensemblePressureCases = [
    {
        id: 'naruto-ensemble', title: 'Naruto: Rin alive, multiple viewpoints',
        premise: 'An expansive alternate Naruto RP in the years after the Kyūbi attack. Shinobi missions, training, chakra arts, clan traditions and relationships between villages support varied adventures and competing loyalties. Civilian livelihoods, relationships, travel and discovery have their own place. The user controls Rin and an original civilian, Sora, across separate viewpoints. Rin is alive. Ninja teams, village leaders and civilian households have independent concerns; not every story intersects. Only the supplied changes are established; canonical consequences must be reconsidered rather than forced.',
        playerNames: ['Rin', 'Sora'],
        accepted: 'A training session ended. Elsewhere, Sora finished helping at a market stall. Both scenes are quiet; no new mission has been assigned.',
        user: 'Stay with the evening conversations for now, without abandoning the wider world.',
        reminder: 'Post-Kyūbi Naruto: keep developing missions, training and chakra discoveries across shinobi villages. Let mission economies, rank, clan traditions and village rivalries create obligations, ambitions and competing loyalties. Give teams, institutions and civilian communities independent pursuits; trade, family bonds, travel and discovery generate stories alongside ninja affairs.',
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
        reminder: 'Develop neighborhood life through shopkeeping, friendships, family ambitions and community occasions. Let local associations, differing traditions and independent interests create opportunities for collaboration and disagreement. Shinobi institutions influence village policy and public life in the background.',
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
        reminder: 'Carry a reflective journey through different towns and valleys, encountering people with lives of their own. Let local customs, livelihoods, histories and magical traditions generate small requests, discoveries and relationships. Keep the road opening onto unfamiliar places while shared experiences deepen companionship and unhurried rest remains part of the journey.',
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
        reminder: 'Develop independent stories of recovery, relief work and political maneuvering across a wartime Star Wars setting. Let faction interests and practical needs test cooperation and trust. Give refuges and communities ordinary pursuits and relationships, allowing respite and wider obligations to develop at their own pace.',
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
        reminder: 'Develop discovery, travel and local ambitions across independent floating-island communities. Let weather, regional institutions and differing local knowledge create route choices, practical challenges and unfamiliar opportunities. Give scholarship, livelihoods and everyday relationships room to develop around distinct regional traditions and priorities.',
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
        reminder: 'Develop a quiet friendship through seasonal garden work, small discoveries and differing tastes. Let ordinary pleasures, shared projects and comfortable silences create opportunities to know one another. Give changing seasons and everyday ambitions room to shape the shared garden.',
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
        reminder: 'Develop trade, inventions and relationships among the local and visiting communities of a neutral Star Wars port. Let its institutions and cooperative ambitions create opportunities for collaboration, while outside political interests test commerce and diplomacy. Give local projects and discoveries their own momentum.',
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
