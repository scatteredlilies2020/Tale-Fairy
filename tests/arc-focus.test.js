import test from 'node:test';
import assert from 'node:assert/strict';
import { arcFocusCases, seedArcFocus } from '../scripts/arc-focus-cases.mjs';
import { liveCardPass } from '../scripts/evaluate-live-story-cards.mjs';
import { DIRECTOR_SYSTEM, DIRECTOR_SCHEMA } from '../extension/story-director.js';
import { STORY_NODE_RESPONSE_SCHEMA } from '../extension/story-structure.js';

test('production planner requires arc significance at creation, retention and selection, not a kind/title blacklist', () => {
    for (const rule of [/Plan around arcs/, /exactly one active root Chapter/, /a Subplot is a distinct substantial smaller storyline/,
        /No quota for Arcs or Subplots/, /Significance is relative to this RP/, /friendship can qualify without danger/,
        /new, retained and selected Arcs\/Subplots alike/, /Unfinished alone is insufficient/, /including inherited cards/,
        /not stale cards with only hypothetical future relevance/, /not indefinite storage/,
        /do not rename it an arc, park it as dormant/, /invent complications and grander stakes to justify keeping it/,
        /explicitly central rehabilitation story can qualify/, /Quiet play can keep just the Chapter/,
        /Respect the activity named/, /Bare elapsed time does not imply specific work/,
        /a difficult cure, diagnosis, return-to-duty clearance or a settled conflict/,
        /Drop incidental preparation without claiming its underlying problem is solved/]) assert.match(DIRECTOR_SYSTEM, rule);
    assert.match(DIRECTOR_SCHEMA.description, /Arcs\/Subplots: create, retain and select only substantial stories/);
    assert.deepEqual(STORY_NODE_RESPONSE_SCHEMA.properties.kind.enum, ['saga', 'arc', 'thread']);
});

for (const fixture of arcFocusCases) test(`${fixture.id}: review can prune filler while preserving substantial stories and the original archive`, async () => {
    const before = await seedArcFocus(fixture), snapshot = structuredClone(before);
    const kept = fixture.nodes.filter(x => fixture.keep.includes(x.id));
    const pass = await liveCardPass(fixture, before, fixture.messages, async request => {
        for (const message of fixture.messages) assert.ok(request[0].content.includes(message.content));
        for (const node of fixture.nodes) assert.ok(request[0].content.includes(node.title));
        return { finishReason: 'stop', text: JSON.stringify({ reviewAfter: 12,
            foundation: { reminder: '', changeReason: '', scratchpad: '' },
            upsert: [], retain: fixture.keep, retire: fixture.drop, select: kept.map(node => ({
                id: node.id, title: node.title, context: [], description: node.description, endsWhen: '', development: '',
            })),
        }) };
    });
    assert.equal(pass.accepted, true, pass.error);
    assert.equal(pass.validState, true);
    assert.equal(pass.calls, 1);
    assert.deepEqual(pass.notices, []);
    assert.deepEqual(pass.state.workingPlan.storyStructure.nodes.map(x => x.id), fixture.keep);
    assert.deepEqual(before, snapshot, 'review must not rewrite its source state');
    assert.deepEqual(pass.state.archive.at(-1).workingPlan, snapshot.workingPlan,
        'omission is not a fabricated resolution or alteration of earlier preparation');
    for (const node of fixture.nodes.filter(x => fixture.drop.includes(x.id))) {
        assert.ok(!pass.writerPacket.includes(node.title));
        assert.equal(pass.state.archive.at(-1).workingPlan.storyStructure.nodes.find(x => x.id === node.id).status, node.status);
    }
    for (const node of kept) assert.ok(pass.writerPacket.includes(node.title));
    assert.ok(pass.writerTokens < 2400);
    assert.equal(pass.orientationOmitted, false);
});

test('central medical arc is not banned by the same title used for an incidental patient', () => {
    const incidental = arcFocusCases[0].nodes.find(x => x.id === 'r1-arm');
    const central = arcFocusCases.at(-1).nodes[0];
    assert.equal(incidental.title, central.title);
    assert.ok(arcFocusCases[0].drop.includes(incidental.id));
    assert.ok(arcFocusCases.at(-1).keep.includes(central.id));
});
