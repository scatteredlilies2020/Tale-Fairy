import test from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTOR_SYSTEM, DIRECTOR_SCHEMA, directorInput, directorPass } from '../extension/story-director.js';
import { STORY_TERMINOLOGY, STORY_STRUCTURE_SCHEMA, storyWriterMaterial, validateStoryStructure } from '../extension/story-structure.js';
import { emptyCampaign, campaignPayload, check, validCampaignState } from '../extension/campaign-planner.js';
import { generationContextEntries } from '../extension/generation-context.js';
import { storyCardsHtml } from '../extension/story-cards.js';

const nodes = [
    ['r1-affair', 'saga', '', 'The Hyuga Affair'],
    ['r1-talks', 'arc', 'r1-affair', 'Negotiations'],
    ['r1-heirs', 'thread', 'r1-talks', 'Heirs and loyalties'],
].map(([id, kind, parentId, title]) => ({ id, kind, parentId, title, status: 'active', owner: 'Village and clan',
    interpretation: 'Village peace and clan security pull on personal loyalties.', stakes: '', expectation: '', links: [], effects: [], endsWhen: '' }));
const selection = nodes.map((node, index) => ({ id: node.id, title: node.title,
    context: nodes.slice(0, index).map(({ kind, title }) => ({ kind, title })),
    interpretation: node.interpretation, stakes: '', expectation: '', development: '', endsWhen: '' }));
const legacyPlan = () => ({ storyStructure: { version: 1, reviewAfter: 12, nodes: structuredClone(nodes), selection: structuredClone(selection) } });
const pass = (state, raw) => directorPass({ state,
    input: directorInput({ state, messages: [], reference: { premise: 'Naruto diplomatic sandbox RP.' }, playerNames: [], requireSagaHierarchy: true }),
    source: { chatId: 'labels', messageCount: 0, referenceHash: 'ref', fingerprint: 'fp' },
    generate: async () => ({ text: JSON.stringify(raw), finishReason: 'stop' }),
});
const reply = (upsert = nodes) => ({ reviewAfter: 12, upsert, retain: nodes.map(node => node.id), retire: [], select: selection,
    foundation: { reminder: 'A Naruto diplomatic sandbox RP.', scratchpad: '', changeReason: '' } });

test('old boards immediately show Chapter, Arc and Subplot without editing titles or saved state', () => {
    const plan = legacyPlan(), before = structuredClone(plan);
    const html = storyCardsHtml(plan);
    assert.deepEqual([...html.matchAll(/tf-card-kind">([^<]+)/g)].map(match => match[1]), ['Chapter', 'Arc', 'Subplot']);
    for (const node of nodes) assert.ok(html.includes(node.title));
    assert.deepEqual(plan, before);
    assert.doesNotThrow(() => validateStoryStructure(plan.storyStructure, check));
});

test('planner uses the new hierarchy without forcing canonical arcs into larger umbrellas', () => {
    for (const rule of [/Chapter → Arc → Subplot/, /exactly one active root Chapter/, /Every Arc has that Chapter as parentId/,
        /every optional Subplot has an Arc as parentId/, /source-canon arc can be this RP's Chapter/,
        /do not invent a larger umbrella or rename existing titles/, /Quiet play can keep just the Chapter/,
        /No quota for Arcs or Subplots/, /"saga" for Chapter/, /"thread" for Subplot/]) assert.match(DIRECTOR_SYSTEM, rule);
    const schemas = [DIRECTOR_SCHEMA.value.properties.upsert.items.properties.kind,
        DIRECTOR_SCHEMA.value.properties.select.items.properties.context.items.properties.kind];
    for (const schema of schemas) {
        assert.deepEqual(schema.enum, ['saga', 'arc', 'thread']);
        assert.match(schema.description, /saga = Chapter.*thread = Subplot/);
    }
    assert.ok(!STORY_STRUCTURE_SCHEMA.required.includes('terminology'));
});

test('public kinds and ancestor paths adopt the labels only for new-format preparation', () => {
    const old = legacyPlan(), before = structuredClone(old);
    const legacy = storyWriterMaterial(old);
    assert.deepEqual(legacy.map(card => card.kind), ['saga', 'arc', 'thread']);
    assert.deepEqual(legacy[2].context, selection[2].context);
    const current = { storyStructure: { ...old.storyStructure, terminology: STORY_TERMINOLOGY } };
    const material = storyWriterMaterial(current);
    assert.deepEqual(material.map(card => card.kind), ['chapter', 'arc', 'subplot']);
    assert.deepEqual(material[2].context, [{ kind: 'chapter', title: nodes[0].title }, { kind: 'arc', title: nodes[1].title }]);
    assert.deepEqual(material.map(card => card.title), nodes.map(node => node.title));
    assert.deepEqual(old, before, 'public naming does not mutate stored kind codes or selection context');
    assert.doesNotThrow(() => validateStoryStructure(current.storyStructure, check));
});

test('successful review adopts writer labels while archived plans and authenticated old packets remain unchanged', async () => {
    const seeded = await pass(emptyCampaign(), reply());
    assert.equal(seeded.accepted, true, seeded.error);
    const state = structuredClone(seeded.state);
    delete state.workingPlan.storyStructure.terminology; // A saved pre-rename preparation, including effects.
    assert.ok(validCampaignState(state));
    const before = structuredClone(state), payload = campaignPayload(state);
    const packet = { version: 1, selection: { preparedUsable: true }, payload,
        plannerState: { plannerContract: 15, campaignPreparation: state } };
    assert.equal(generationContextEntries({ entries: [packet] }).length, 1);

    const reviewed = await pass(state, reply([]));
    assert.equal(reviewed.accepted, true, reviewed.error);
    assert.deepEqual(reviewed.plannerNotices, []);
    assert.ok(validCampaignState(reviewed.state));
    assert.equal(reviewed.state.workingPlan.storyStructure.terminology, STORY_TERMINOLOGY);
    assert.deepEqual(reviewed.state.workingPlan.storyStructure.nodes, before.workingPlan.storyStructure.nodes);
    assert.deepEqual(reviewed.state.archive.at(-1).workingPlan, before.workingPlan);
    assert.deepEqual(state, before);
    assert.equal(campaignPayload(state), payload);
    assert.equal(generationContextEntries({ entries: [packet] }).length, 1);
    assert.match(campaignPayload(reviewed.state), /"kind":"chapter"/);
    assert.match(campaignPayload(reviewed.state), /"kind":"subplot"/);
    assert.doesNotMatch(campaignPayload(reviewed.state), /"kind":"(?:saga|thread)"/);
});

test('failed review leaves old terminology, cards and writer packets intact', async () => {
    const seeded = await pass(emptyCampaign(), reply());
    assert.equal(seeded.accepted, true, seeded.error);
    const state = structuredClone(seeded.state);
    delete state.workingPlan.storyStructure.terminology;
    const before = structuredClone(state), payload = campaignPayload(state);
    const failed = await pass(state, { ...reply([]), retain: [], select: [] });
    assert.equal(failed.accepted, false);
    assert.match(failed.error, /one active root Chapter/);
    assert.deepEqual(failed.state, before);
    assert.equal(campaignPayload(failed.state), payload);
});

test('a premature aftermath Chapter can be corrected in place throughout the writer packet', async () => {
    const oldTitle = 'After the Hyuga Abduction Attempt';
    const oldNodes = structuredClone(nodes);
    Object.assign(oldNodes[0], { title: oldTitle, interpretation: 'Village life resumes after the abduction.',
        endsWhen: 'The aftermath settles.' });
    const oldSelection = structuredClone(selection);
    oldSelection[0].title = oldTitle;
    for (const entry of oldSelection.slice(1)) entry.context[0].title = oldTitle;
    const seeded = await pass(emptyCampaign(), { ...reply(oldNodes), select: oldSelection });
    assert.equal(seeded.accepted, true, seeded.error);
    const state = seeded.state, before = structuredClone(state);
    const corrected = { ...nodes[0], interpretation: 'The Hyuga Affair remains underway: the rescue is complete, but the diplomatic dispute and insider inquiry continue.',
        endsWhen: 'The diplomatic and internal-security crisis reaches a settlement or is superseded.' };
    const correctedSelection = structuredClone(selection);
    Object.assign(correctedSelection[0], { interpretation: corrected.interpretation, endsWhen: corrected.endsWhen });
    const messages = [{ role: 'user', content: 'The rescue is over, but the Hyuga Affair is ongoing. The delegation dispute and insider inquiry are unresolved while I work at the hospital.' }];
    const input = directorInput({ state, messages, previousUsable: true, requireSagaHierarchy: true,
        reference: { premise: 'Naruto diplomatic sandbox RP.' }, playerNames: [] });
    const reviewed = await directorPass({ state, input,
        source: { chatId: 'labels', messageCount: 1, referenceHash: 'ref', fingerprint: 'corrected' },
        generate: async prompt => {
            assert.ok(prompt.includes(messages[0].content));
            assert.ok(prompt.includes(oldTitle), 'review receives the misleading preparation to correct');
            return { text: JSON.stringify({ ...reply([corrected]), select: correctedSelection }), finishReason: 'stop' };
        },
    });
    assert.equal(reviewed.accepted, true, reviewed.error);
    assert.deepEqual(reviewed.plannerNotices, []);
    const map = reviewed.state.workingPlan.storyStructure;
    assert.deepEqual(map.nodes.map(node => node.id), nodes.map(node => node.id));
    assert.equal(map.nodes.filter(node => node.kind === 'saga' && node.status === 'active').length, 1);
    assert.deepEqual(map.nodes.slice(1), before.workingPlan.storyStructure.nodes.slice(1));
    const payload = campaignPayload(reviewed.state);
    assert.ok(!payload.includes(oldTitle));
    assert.ok(payload.includes(corrected.interpretation));
    assert.ok(payload.includes(corrected.endsWhen));
    assert.deepEqual(storyWriterMaterial(reviewed.state.workingPlan)[1].context,
        [{ kind: 'chapter', title: corrected.title }]);
    assert.deepEqual(state, before);
    assert.deepEqual(reviewed.state.archive.at(-1).workingPlan, before.workingPlan);
});

test('an established Chapter survives review with no child stories, effects or selected activity', async () => {
    const chapter = { ...nodes[0], interpretation: 'The Hyuga Affair is the established current Chapter.', endsWhen: '' };
    const seeded = await pass(emptyCampaign(), { ...reply([chapter]), retain: [], select: [] });
    assert.equal(seeded.accepted, true, seeded.error);
    const before = structuredClone(seeded.state);
    const messages = [{ role: 'user', content: 'I eat breakfast, water the plants and go to work. There are no new developments to report.' }];
    const input = directorInput({ state: seeded.state, messages, previousUsable: true, requireSagaHierarchy: true,
        reference: { premise: 'Naruto village-life RP during the Hyuga Affair.' }, playerNames: [] });
    const reviewed = await directorPass({ state: seeded.state, input,
        source: { chatId: 'labels', messageCount: 1, referenceHash: 'ref', fingerprint: 'quiet' },
        generate: async () => ({ text: JSON.stringify({ ...reply([]), retain: [chapter.id], select: [] }), finishReason: 'stop' }),
    });
    assert.equal(reviewed.accepted, true, reviewed.error);
    assert.deepEqual(reviewed.plannerNotices, []);
    assert.deepEqual(reviewed.state.workingPlan.storyStructure.nodes, before.workingPlan.storyStructure.nodes);
    assert.deepEqual(reviewed.state.workingPlan.storyStructure.selection, []);
    assert.deepEqual(seeded.state, before);
});
