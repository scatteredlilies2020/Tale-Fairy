import test from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTOR_SYSTEM, directorInput, directorPass } from '../extension/story-director.js';
import { emptyCampaign, campaignPayload, validCampaignState } from '../extension/campaign-planner.js';
import { storyCardsHtml } from '../extension/story-cards.js';
import { storyChangeSignal, storyGuidanceFresh } from '../extension/story-structure.js';

const node = (id, kind, parentId, title, endsWhen, pressure) => ({ id, kind, parentId, title, endsWhen, status: 'active',
    owner: 'The club', description: 'School music and relationships develop through club life.', links: [],
    effects: [{ label: 'Ongoing concern', pressure }] });
const cards = [
    node('r1-term', 'saga', '', 'The autumn term', 'The autumn term ends.', 'Autumn classes frame club commitments.'),
    node('r1-festival', 'arc', 'r1-term', 'Preparing the October festival', 'The October festival window passes.', 'Festival preparation competes for rehearsal time.'),
    node('r1-song', 'thread', 'r1-festival', 'Choosing the festival song', 'The festival program closes.', 'Choosing the festival song exposes different tastes.'),
    node('r1-friends', 'arc', 'r1-term', 'A changing friendship', 'The friends establish a new understanding.', 'Their unresolved disagreement affects collaboration.'),
];
const selection = nodes => nodes.map(card => ({ id: card.id, title: card.title, context: [], description: card.description, endsWhen: card.endsWhen, development: '' }));
const raw = (upsert, retain = [], select = selection(upsert.filter(card => card.status === 'active'))) => ({
    reviewAfter: 12, foundation: { reminder: 'A light music club RP built around rehearsals, school events and friendships.', scratchpad: '', changeReason: '' },
    upsert, retain, retire: [], select,
});
async function run(state, messages, response) {
    let calls = 0;
    const input = directorInput({ state, messages, reference: { premise: 'Light music club RP; the player controls their club member.' }, playerNames: [], requireSagaHierarchy: true });
    const result = await directorPass({ state, input,
        source: { chatId: 'time-skip', messageCount: messages.length, referenceHash: 'ref', fingerprint: 'fp' },
        generate: async prompt => {
            calls++;
            for (const message of messages) assert.ok(prompt.includes(message.content));
            return { text: JSON.stringify(response), finishReason: 'stop' };
        },
    });
    assert.equal(calls, 1);
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(result.plannerNotices, []);
    assert.ok(validCampaignState(result.state));
    return result.state;
}

test('closure guidance recognizes implied endings without equating elapsed time with success or resolution', () => {
    for (const rule of [/review every Chapter, Arc and Subplot for explicit or clearly implied closure/,
        /passed festival window or ended school term/, /without inventing participation or success/,
        /Do not keep expired preparation active or replay skipped routine steps/,
        /Infer ordinary completion only when the skip supports it/,
        /preserve meaningful unresolved stories and unchosen player outcomes/,
        /replace it in the same review and reconnect surviving Arcs/,
        /Resolve stories ended explicitly or by clear implication of accepted play/]) assert.match(DIRECTOR_SYSTEM, rule);
});

test('a substantial skip can close all expired levels, replace the Chapter and reconnect a surviving story', async () => {
    const before = await run(emptyCampaign(), [], raw(cards)), snapshot = structuredClone(before);
    const nextChapter = node('r2-winter', 'saga', '', 'The winter term', 'The winter term ends.', 'New classes and club time shape the winter term.');
    const survivor = { ...cards[3], parentId: nextChapter.id, links: [cards[1].id] };
    const closed = cards.slice(0, 3).map(card => ({ ...card, status: 'resolved' }));
    const next = await run(before, [{ role: 'user', content: 'Time skip: It is January. The autumn term and October festival window are behind us. The disagreement is still unresolved.' }],
        raw([...closed, nextChapter, survivor], [], [...selection(cards), ...selection([nextChapter, survivor]).filter(card => card.id !== survivor.id)]));
    const map = next.workingPlan.storyStructure;
    assert.deepEqual(map.nodes.map(card => card.id), [survivor.id, nextChapter.id]);
    assert.equal(map.nodes.filter(card => card.kind === 'saga' && card.status === 'active').length, 1);
    assert.equal(map.nodes.find(card => card.id === survivor.id).parentId, nextChapter.id);
    assert.deepEqual(map.nodes.find(card => card.id === survivor.id).links, []);
    const payload = campaignPayload(next), html = storyCardsHtml(next.workingPlan);
    for (const card of closed) {
        assert.ok(!payload.includes(card.title));
        assert.ok(!payload.includes(card.effects[0].pressure));
        assert.ok(!html.includes(card.title));
    }
    assert.ok(payload.includes(survivor.effects[0].pressure));
    assert.match(payload, /"kind":"chapter","title":"The winter term"/);
    assert.deepEqual(before, snapshot);
    assert.deepEqual(next.archive.at(-1).workingPlan, snapshot.workingPlan, 'closure never retroactively rewrites prior preparation');
});

test('an explicit smaller resolution closes the Subplot without closing its Arc or Chapter', async () => {
    const before = await run(emptyCampaign(), [], raw(cards));
    const next = await run(before, [{ role: 'user', content: 'We have chosen the song and submitted the program. Next week we continue rehearsing for the festival.' }],
        raw([{ ...cards[2], status: 'resolved' }], [], selection(cards)));
    assert.deepEqual(next.workingPlan.storyStructure.nodes.map(card => card.id), [cards[0].id, cards[1].id, cards[3].id]);
    assert.doesNotMatch(campaignPayload(next), /Choosing the festival song/);
    assert.match(campaignPayload(next), /Preparing the October festival/);
});

test('elapsed time alone need not close a substantial unresolved story or fabricate an outcome', async () => {
    const ongoing = [node('r1-year', 'saga', '', 'Life in the club', '', 'Music and friendships shape school life.'),
        { ...cards[3], parentId: 'r1-year' }];
    const before = await run(emptyCampaign(), [], raw(ongoing)), snapshot = structuredClone(before);
    const next = await run(before, [{ role: 'user', content: 'Time skip: Three months later, I return to the club.' }],
        raw([], [], []));
    assert.deepEqual(next.workingPlan.storyStructure.nodes, snapshot.workingPlan.storyStructure.nodes);
    assert.match(next.workingPlan.storyStructure.nodes.find(card => card.id === cards[3].id).effects[0].pressure, /unresolved disagreement/);
    assert.deepEqual(before, snapshot);
});

test('explicit time-skip direction invalidates old guidance before review; the signal itself does not close cards', async () => {
    const state = await run(emptyCampaign(), [], raw(cards)), before = structuredClone(state);
    const messages = [{ role: 'user', content: 'Time skip: It is January, after the autumn term.' }];
    assert.equal(storyChangeSignal(messages), true);
    assert.equal(storyGuidanceFresh(state, messages, 12), false);
    assert.deepEqual(state, before);
});
