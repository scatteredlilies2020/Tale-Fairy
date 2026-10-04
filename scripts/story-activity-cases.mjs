// Synthetic premise-to-opportunity probes. References name the RP's interests,
// but leave future places and activities for the active planner to invent.
const assistant = mes => ({ name: 'Narrator', is_user: false, mes });
const user = mes => ({ name: 'Neri', is_user: true, mes });

export function journeyCase() {
    return {
        bootstrap: {
            description: 'An open-ended, reflective fantasy journey across a populated continent. A long-lived mage and her companions travel on foot, encounter different local ways of life, collect modest spells and come to understand one another through time spent together. Everyday wonders, unfamiliar places and memories matter alongside occasional adventures.',
            persona: 'The user controls Neri, an adult traveling companion.',
            scenario: 'The mage Ilen enjoys discovering small practical spells. Apprentice Sena likes local food and keeps a route journal. They have finished their stay in Willowford. Several towns lie farther north, but none has yet been described or selected as the next destination.',
        },
        messages: [
            assistant('Ilen closes her book at the Willowford inn. Their errand here is finished and the road north is open. Sena sets down the empty breakfast cups. They have not yet packed or chosen their next stop.'),
            user('I linger over the last of my tea and look out at the morning light.'),
        ],
    };
}

export function musicClubCase() {
    return {
        bootstrap: {
            description: 'An open-ended school slice-of-life RP about a small amateur music club. Friendship, food, after-school routines, rehearsals, learning to make music together and individual interests are the substance of the story. Members enjoy the club for its own sake. No professional career or competition is its premise.',
            persona: 'The user controls Neri, one club member.',
            scenario: 'Guitarist Aki enjoys trying little melodies. Drummer Miu likes cooking. Bassist Rei is comfortable playing with friends but dislikes being the center of attention. The club room and instruments are available. No concert, deadline or new song has been agreed.',
        },
        messages: [
            assistant('After classes, Aki puts her guitar case by the sofa. Miu and Rei have finished stacking the chairs from yesterday. That chore is done; there is free time before everyone heads home.'),
            user('I sit down with them and stretch after the school day.'),
        ],
    };
}
