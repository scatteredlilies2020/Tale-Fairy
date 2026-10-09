import test from 'node:test';
import assert from 'node:assert/strict';
import { directorInput, directorPass, DIRECTOR_SYSTEM, DIRECTOR_SCHEMA, parseDirectorResponse, recentCardNames, continuityStorySummary } from '../extension/story-director.js';
import { emptyCampaign, validCampaignState, campaignPayload, campaignPayloadBudget, campaignMaterialUsable, campaignWriterUsable, check } from '../extension/campaign-planner.js';
import { storyInputTokens, fitStoryInputBudget } from '../extension/story-budget.js';
import { validateStoryStructure, ongoingStoryNodes, storyReviewInterval } from '../extension/story-structure.js';
import { planTokens } from '../extension/working-plan.js';

const reference = { premise: 'An open RP about village life, friendships and discovering nearby communities.' };
const messages = [{ index: 0, role: 'assistant', name: 'Jo', content: 'Jo closes the rehearsal room after the show.' },
    { index: 1, role: 'user', name: 'Ren', content: 'I help pack and ask about the neighborhood.' }];
const source = { chatId: 'story', referenceHash: 'reference', fingerprint: 'accepted', messageCount: 2 };
const proposal = (id = 'r1-kitchen', extra = {}) => ({ id, kind: 'thread', parentId: '', status: 'proposed',
    title: 'A neighborhood supper book', owner: 'Community cooks', interpretation: 'Shared cooking can connect unfamiliar households.',
    stakes: 'Family recipes and a sense of belonging.', expectation: 'Recipe trials, shared suppers and a communal recipe book.', links: [], ...extra });
const selected = (id = 'r1-kitchen', extra = {}) => ({ id, title: 'Neighborhood cooking', context: [],
    interpretation: 'Shared meals can build ties without erasing different tastes.', stakes: 'Belonging and family traditions.',
    expectation: 'Cooking, recipe exchanges and friendships developing across visits.', development: 'A communal recipe book gives the cooks a shared project.', ...extra });
const response = () => ({ reviewAfter: 12,
    upsert: [proposal()], retain: [], retire: [], select: [selected()] });
async function run(state = emptyCampaign(), raw = response(), extra = {}) {
    const input = directorInput({ reference, state, messages, playerNames: ['Ren'], previousUsable: state.revision > 0, ...extra });
    let requests = 0;
    const result = await directorPass({ state, input, source, generate: async (_prompt, system, schema, meta) => {
        requests++;
        assert.equal(system, DIRECTOR_SYSTEM); assert.equal(schema, DIRECTOR_SCHEMA); assert.equal(meta.stage, 'director');
        return typeof raw === 'string' ? { text: raw } : { text: JSON.stringify(raw), finishReason: 'stop' };
    } });
    assert.equal(requests, 1);
    return { ...result, input };
}
const nodes = result => result.state.workingPlan.storyStructure.nodes;
const selections = result => result.state.workingPlan.storyStructure.selection;

test('one request saves story context, not next-turn scripts, private state or a memory ledger', async () => {
    const result = await run();
    assert.equal(result.accepted, true, result.error);
    assert.equal(validCampaignState(result.state), true);
    assert.equal(result.state.revision, 1);
    assert.deepEqual(result.state.workingPlan.consequences, []);
    assert.deepEqual(result.state.planEvidence, {});
    const payload = campaignPayload(result.state);
    assert.match(payload, /Current play takes precedence\. Ignore completed, declined or contradicted developments\./);
    assert.match(payload, /story_context.*interpretation.*stakes.*expectation/);
    assert.match(payload, /recipe book/);
    assert.doesNotMatch(payload, /If |when|next|later|action|r1-kitchen|Community cooks|upsert|parentId|status|reviewAfter|possible_developments/);
    assert.doesNotMatch(DIRECTOR_SYSTEM, /\u2014/);
    assert.ok(storyInputTokens('', DIRECTOR_SYSTEM, DIRECTOR_SCHEMA) < 5000, 'portable contract leaves input headroom including future handoff, genre calibration, hierarchy, Chapter persistence and time-skip closure');
});

test('phase-free preparation keeps a stable world frame and valid writer guidance', async () => {
    const raw = { ...response(), foundation: {
        reminder: 'Village friendships, shared interests and neighboring communities offer continuing discoveries.',
        changeReason: '', scratchpad: '',
    } };
    assert.equal(Object.hasOwn(DIRECTOR_SCHEMA.value.properties, 'direction'), false);
    assert.equal(DIRECTOR_SCHEMA.value.required.includes('direction'), false);
    const result = await run(emptyCampaign(), raw);
    assert.equal(result.accepted, true, result.error);
    assert.equal(validCampaignState(result.state), true);
    assert.deepEqual(result.plannerNotices, []);
    assert.equal(result.state.workingPlan.storyStructure.foundation.reminder, raw.foundation.reminder);
    assert.equal(result.state.workingPlan.direction, raw.foundation.reminder);
    assert.equal(result.state.workingPlan.threads, raw.foundation.reminder);
    assert.ok(campaignPayload(result.state).includes(raw.foundation.reminder));
    assert.match(campaignPayload(result.state), /recipe book/);
});

test('legacy scene snapshots do not enter new preparation or its next review', async () => {
    const stale = 'Rin honors her dead at the Memorial Stone before a hospital shift, with a sealed envelope unopened.';
    const raw = { ...response(), direction: stale, foundation: {
        reminder: 'Village relationships and independent pursuits sustain the wider RP.', changeReason: '', scratchpad: '',
    } };
    const first = await run(emptyCampaign(), raw);
    assert.equal(first.accepted, true, first.error);
    assert.ok(!JSON.stringify(first.state).includes(stale), 'older response fields are ignored');

    // Simulate an existing on-disk plan; preserve it intact in the archive.
    const legacy = structuredClone(first.state);
    legacy.workingPlan.direction = legacy.workingPlan.threads = legacy.campaign = legacy.rpBrief = stale;
    assert.equal(validCampaignState(legacy), true);
    assert.ok(!campaignPayload(legacy).includes(stale));
    const result = await run(legacy, { ...raw, upsert: [], foundation: { ...raw.foundation, reminder: '' } });
    assert.equal(result.accepted, true, result.error);
    assert.ok(!result.input.prompt.includes(stale), 'old scene snapshots cannot anchor a review');
    assert.equal(Object.hasOwn(JSON.parse(result.input.prompt).previous_preparation, 'direction'), false);
    assert.equal(result.state.workingPlan.direction, raw.foundation.reminder);
    assert.equal(result.state.workingPlan.threads, raw.foundation.reminder);
    assert.deepEqual(result.state.archive.at(-1).workingPlan, legacy.workingPlan);
    const next = directorInput({ reference, state: result.state, messages, playerNames: ['Ren'], previousUsable: true });
    assert.ok(!next.prompt.includes(stale));
    assert.ok(!campaignPayload(result.state).includes(stale));
    assert.deepEqual(nodes(result), nodes(first));
});

test('ordinary reviews explicitly retain useful unused stories and renew the public selection', async () => {
    const first = await run();
    const result = await run(first.state, { ...response(), upsert: [], retain: ['r1-kitchen'], select: [] });
    assert.equal(result.accepted, true, result.error);
    assert.equal(validCampaignState(result.state), true);
    assert.deepEqual(nodes(result), nodes(first));
    assert.deepEqual(selections(result), []);
    assert.equal(campaignPayload(result.state), '');
    const prompt = JSON.parse(result.input.prompt);
    assert.equal(prompt.previous_preparation.nodes[0].id, 'r1-kitchen');
    assert.equal(prompt.previous_plan, undefined);
    assert.doesNotMatch(result.input.prompt, /planEvidence|selectedMaterial|story_context|initiative_review|observations/);
});

test('reviews drop omitted concerns, retain future possibilities and use only names from past cards', async () => {
    const first = await run(emptyCampaign(), { ...response(), upsert: [
        proposal('r1-world', { kind: 'saga', status: 'active', title: 'Independent village interests' }),
        proposal('r1-current', { parentId: 'r1-world', status: 'active', title: 'A continuing partnership' }),
        proposal('r1-future', { parentId: 'r1-world', status: 'dormant', title: 'An opportunity beyond the valley' }),
        proposal('r1-obsolete', { status: 'active', title: 'An obsolete invitation' }),
    ], select: [] });
    assert.equal(first.accepted, true, first.error);
    const state = structuredClone(first.state);
    state.workingPlan.storyStructure.nodes.push(proposal('r1-completed', { status: 'resolved', title: 'COMPLETED_CARD_SECRET' }));
    state.archive.push({ ...structuredClone(first.state), workingPlan: { ...first.state.workingPlan, direction: 'ARCHIVE_ONLY_SECRET' } });
    assert.equal(validCampaignState(state), true);
    const archived = structuredClone(state.archive);
    const result = await run(state, { ...response(), upsert: [], retain: ['r1-future'],
        select: [selected('r1-current', { context: [{ kind: 'saga', title: 'Independent village interests' }] })] });
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(result.plannerNotices, []);
    assert.deepEqual(nodes(result).map(node => node.id), ['r1-current', 'r1-future']);
    assert.ok(nodes(result).every(node => node.parentId === ''));
    assert.deepEqual(selections(result)[0].context, []);
    assert.doesNotMatch(result.input.prompt, /ARCHIVE_ONLY_SECRET/);
    assert.deepEqual(JSON.parse(result.input.prompt).recent_card_names, ['COMPLETED_CARD_SECRET']);
    assert.ok(!JSON.stringify(JSON.parse(result.input.prompt).previous_preparation).includes('COMPLETED_CARD_SECRET'));
    assert.deepEqual(result.state.archive.slice(0, archived.length), archived);
    const next = await run(result.state, { ...response(), upsert: [], retain: [], select: [] });
    assert.equal(next.accepted, true, next.error);
    assert.deepEqual(nodes(next), []);
    assert.doesNotMatch(next.input.prompt, /ARCHIVE_ONLY_SECRET/);
    assert.doesNotMatch(JSON.stringify(JSON.parse(next.input.prompt).previous_preparation), /obsolete invitation|COMPLETED_CARD_SECRET/);
    assert.ok(next.state.archive.length > result.state.archive.length, 'snapshots remain saved');
});

test('creative context carries plans without a continuity proof or historical fact ledger', async () => {
    const first = await run();
    const input = directorInput({ reference, state: first.state, messages, previousUsable: true, reviewedMessageCount: 2 });
    const context = JSON.parse(input.prompt);
    assert.match(DIRECTOR_SYSTEM, /creative story director/);
    assert.match(DIRECTOR_SYSTEM, /Continuity Memory handles recall/);
    assert.match(context.coverage.context_use, /creative background/);
    assert.equal(context.coverage.omitted_context, undefined);
    assert.equal(context.coverage.review_boundary, undefined);
    assert.doesNotMatch(input.prompt, /prove new outcomes|observations|planEvidence/);
    assert.match(context.previous_preparation.nodes[0].interpretation, /Shared cooking/);
});

const cmStory = text => ({ provider: 'continuity-memory', status: 'current',
    summary: `<continuity>\nMemory constraints:\nCM_PRIVATE_CONSTRAINT\nRelevant details:\nCM_PRIVATE_FACT\nStory so far:\n${text}\n</continuity>`,
    records: [{ id: 'cm-record', text: 'CM_PRIVATE_RECORD' }] });

test('public CM Story so far is read whole, separately from memory instructions and records', () => {
    const text = 'Premise: village life.\nMajor developments: a shared project ended.\nState at covered boundary: neighbors are home.\nOpen matters: new musical interests.';
    const memory = cmStory(text), before = structuredClone(memory);
    assert.equal(continuityStorySummary(memory), text);
    assert.equal(continuityStorySummary({ ...memory, summary: memory.summary.replaceAll('\n', '\r\n') }), text.replaceAll('\n', '\r\n'));
    assert.equal(continuityStorySummary({ ...memory, summary: 'Story so far:\n'+text }), text);
    for (const status of ['off', 'unavailable', 'stale']) assert.equal(continuityStorySummary({ ...memory, status }), '');
    assert.equal(continuityStorySummary({ status: 'current', summary: 'Ordinary retrieved memory without a story section.' }), '');
    assert.deepEqual(memory, before);
});

test('first guide and full rebuild keep the complete checked CM summary even above the usual recall allowance', async () => {
    const text = 'Premise: shared village life.\nMajor developments: '+ 'Earlier pursuits changed relationships without ending the wider RP. '.repeat(120)
        +'\nState at covered boundary: the neighbors are home.\nOpen matters: a new tune could develop.';
    const memory = cmStory(text), first = await run();
    for (const [state, flags] of [[emptyCampaign(), {}], [first.state, { resetPlan: true, previousUsable: true }]]) {
        const input = directorInput({ reference, state, messages, continuity: memory, evidence: [memory],
            continuityEnabled: true, continuityTokens: 0, ...flags }, 3000);
        const payload = JSON.parse(input.prompt);
        assert.equal(payload.story_summary.text, text);
        assert.equal(payload.story_summary.provider, 'continuity-memory');
        assert.ok(planTokens(text) > 1000);
        assert.ok(input.inputOverTarget > 0, 'whole summary remains available above the soft target');
        assert.deepEqual(payload.previous_preparation, { nodes: [] });
        assert.equal(payload.recent_card_names, undefined);
        assert.equal(payload.external_evidence, undefined);
        assert.doesNotMatch(input.prompt, /CM_PRIVATE_CONSTRAINT|CM_PRIVATE_FACT|CM_PRIVATE_RECORD/);
        assert.equal(input.continuity.status, 'included');
        assert.deepEqual(input.evidence.providers, ['continuity-memory']);
        assert.deepEqual(input.indices, [0, 1]);
    }
});

test('unchecked CM support excludes its summary and recall while regular reviews retain bounded context', async () => {
    const text = 'CM_STORY_SECRET: The neighbors have ongoing interests.', memory = cmStory(text);
    const first = await run();
    for (const state of [emptyCampaign(), first.state]) {
        const input = directorInput({ reference, state, messages, previousUsable: state.revision > 0,
            continuity: memory, evidence: [memory], continuityEnabled: false });
        assert.equal(JSON.parse(input.prompt).story_summary, undefined);
        assert.doesNotMatch(input.prompt, /CM_STORY_SECRET|CM_PRIVATE_RECORD/);
        assert.notEqual(input.continuity.status, 'included');
    }
    const review = directorInput({ reference, state: first.state, messages, previousUsable: true,
        continuity: memory, evidence: [memory], continuityEnabled: true });
    assert.equal(JSON.parse(review.prompt).story_summary, undefined, 'complete summary is for fresh preparation');
    assert.ok(JSON.parse(review.prompt).external_evidence.length, 'ordinary reviews keep their bounded background');
    const missing = directorInput({ reference, state: emptyCampaign(), messages, continuityEnabled: true,
        continuity: { status: 'unavailable' } });
    assert.deepEqual(JSON.parse(missing.prompt).accepted_messages, JSON.parse(directorInput({ reference, state: emptyCampaign(), messages }).prompt).accepted_messages);
});

test('future renewals read the complete available CM story at any stage without enabling unchecked memory', async () => {
    const text = 'Campaign past: ' + 'The treaty changed regional obligations. '.repeat(200), memory = cmStory(text);
    const first = await run();
    for (const enabled of [true, false]) {
        const input = directorInput({ reference, state: first.state, messages, previousUsable: true,
            futurePlanning: true, continuityEnabled: enabled, continuityTokens: 0, continuity: memory, evidence: [memory] }, 3000);
        assert.equal(JSON.parse(input.prompt).story_summary?.text, enabled ? text.trim() : undefined);
        assert.doesNotMatch(input.prompt, /CM_PRIVATE_CONSTRAINT|CM_PRIVATE_FACT|CM_PRIVATE_RECORD/);
    }
});

test('final request fitting preserves the entire fresh CM summary and latest player choice', async () => {
    const text = 'Major developments: '+ 'Neighbors developed different interests across their travels. '.repeat(100)
        +'\nState at covered boundary: back home.\nOpen matters: a new shared project.';
    const input = directorInput({ reference, state: emptyCampaign(), messages, continuityEnabled: true, continuity: cmStory(text) }, 3000);
    const fitted = await fitStoryInputBudget(input.prompt, DIRECTOR_SYSTEM, DIRECTOR_SCHEMA, 3000, () => 8000, { softTarget: true });
    const sent = JSON.parse(fitted.prompt);
    assert.equal(sent.story_summary.text, text);
    assert.deepEqual(sent.accepted_messages, JSON.parse(input.prompt).accepted_messages);
    assert.deepEqual(sent.source_reference, JSON.parse(input.prompt).source_reference);
    assert.equal(fitted.tokens, 8064);
    assert.ok(fitted.overTarget > 0);
});

test('recent names are unique, capped and exclude live cards and all archived details', async () => {
    const first = await run(), state = structuredClone(first.state);
    state.archive = Array.from({ length: 16 }, (_, i) => ({ workingPlan: { storyStructure: { nodes: [
        proposal(`old-${i}`, { title: `Earlier idea ${i}`, owner: 'ARCHIVED_OWNER_SECRET',
            interpretation: 'ARCHIVED_DESCRIPTION_SECRET', effects: [{ label: 'ARCHIVED_EFFECT_SECRET', pressure: 'Private old pressure.' }] }),
        proposal('r1-kitchen', { title: 'Old name of a live card' }),
    ] } } }));
    const expected = Array.from({ length: 12 }, (_, i) => `Earlier idea ${15 - i}`);
    const before = structuredClone(state);
    assert.deepEqual(recentCardNames(state), expected);
    const input = directorInput({ reference, state, messages, previousUsable: true });
    assert.deepEqual(JSON.parse(input.prompt).recent_card_names, expected);
    assert.doesNotMatch(input.prompt, /ARCHIVED_OWNER_SECRET|ARCHIVED_DESCRIPTION_SECRET|ARCHIVED_EFFECT_SECRET|old-15|Old name of a live card/);
    assert.deepEqual(state, before);
    const packet = campaignPayload(state);
    assert.match(packet, /recipe book/);
    assert.doesNotMatch(packet, /Earlier idea|recent_card_names/);
    state.archive.push({ workingPlan: { storyStructure: { nodes: [proposal('duplicate', { title: 'earlier IDEA 15' })] } } });
    const names = recentCardNames(state);
    assert.equal(names[0], 'earlier IDEA 15');
    assert.equal(names.filter(name => name.toLowerCase() === 'earlier idea 15').length, 1);
});

test('name hints stay within a token cap and do not return on source-invalid review or rebuild', async () => {
    const first = await run(), state = structuredClone(first.state);
    state.archive = [{ workingPlan: { storyStructure: { nodes: Array.from({ length: 12 }, (_, i) =>
        proposal(`old-${i}`, { title: `${i}: ${'long former idea '.repeat(14)}` })) } } }];
    const names = recentCardNames(state);
    assert.ok(names.length > 0 && names.length < 12);
    assert.ok(planTokens(names) <= 240);
    for (const flags of [{ previousUsable: false }, { previousUsable: true, resetPlan: true }]) {
        const input = directorInput({ reference, state, messages, ...flags });
        assert.equal(JSON.parse(input.prompt).recent_card_names, undefined);
    }
});

test('archived names use spare context without displacing memory, RP or future plans', async () => {
    const first = await run(), state = structuredClone(first.state);
    state.archive = [{ workingPlan: { storyStructure: { nodes: [proposal('old', { title: 'A former neighborhood project' })] } } }];
    const args = { reference, state, messages, previousUsable: true,
        evidence: [{ provider: 'continuity-memory', status: 'current', revision: 1,
            summary: 'Neighbors once worked together on a community garden.', records: [] }] };
    const baseline = directorInput({ ...args, state: { ...state, archive: [] } });
    const roomy = JSON.parse(directorInput(args).prompt);
    assert.deepEqual(roomy.recent_card_names, ['A former neighborhood project']);
    assert.ok(roomy.external_evidence.length);
    const tight = directorInput(args, baseline.inputTokens), context = JSON.parse(tight.prompt);
    assert.equal(context.recent_card_names, undefined);
    assert.deepEqual(context.external_evidence, roomy.external_evidence);
    assert.deepEqual(context.previous_preparation, roomy.previous_preparation);
    assert.deepEqual(context.accepted_messages, roomy.accepted_messages);
    assert.equal(tight.inputTokens, baseline.inputTokens);
});

test('closed parents and cross-links disappear while surviving future cards keep a valid hierarchy', () => {
    const previous = [proposal('r1-world', { kind: 'saga', status: 'active' }),
        proposal('r1-finished', { kind: 'arc', parentId: 'r1-world', status: 'resolved' }),
        proposal('r1-future', { parentId: 'r1-finished', status: 'dormant', links: ['r1-finished', 'r1-world'] }),
        proposal('r1-withdrawn', { status: 'retired' })];
    const before = structuredClone(previous), nodes = ongoingStoryNodes(previous);
    assert.deepEqual(nodes.map(node => node.id), ['r1-world', 'r1-future']);
    assert.equal(nodes[1].parentId, 'r1-world');
    assert.deepEqual(nodes[1].links, ['r1-world']);
    validateStoryStructure({ version: 1, reviewAfter: 12, nodes, selection: [] }, check);
    const detached = ongoingStoryNodes(previous, new Set(['r1-future']));
    assert.equal(detached[0].parentId, '');
    assert.deepEqual(detached[0].links, []);
    validateStoryStructure({ version: 1, reviewAfter: 12, nodes: detached, selection: [] }, check);
    assert.deepEqual(previous, before);
});

test('concise descriptions save, reach the writer and return to the next review without redundant categories', async () => {
    const raw = response();
    for (const record of [...raw.upsert, ...raw.select]) {
        delete record.interpretation; delete record.stakes; delete record.expectation;
        record.description = 'Neighbors share recipes and develop friendships through a communal cookbook.';
    }
    delete raw.select[0].development;
    const first = await run(emptyCampaign(), raw);
    assert.equal(first.accepted, true, first.error);
    assert.deepEqual(first.plannerNotices, []);
    assert.equal(validCampaignState(first.state), true);
    assert.match(campaignPayload(first.state), /description.*communal cookbook/);
    assert.doesNotMatch(campaignPayload(first.state), /"(?:interpretation|stakes|expectation|development)":/);
    const second = await run(first.state, { ...raw, upsert: [] });
    assert.equal(second.accepted, true, second.error);
    assert.deepEqual(nodes(second), nodes(first));
    const previous = JSON.parse(second.input.prompt).previous_preparation.nodes[0];
    assert.equal(previous.description, raw.upsert[0].description);
    assert.equal(previous.interpretation, undefined);
    assert.equal(previous.stakes, undefined);
    assert.equal(previous.expectation, undefined);
});

test('a concise update condenses an old explanation while the complete prior plan stays archived', async () => {
    const first = await run();
    const raw = response();
    for (const record of [...raw.upsert, ...raw.select]) {
        delete record.interpretation; delete record.stakes; delete record.expectation;
        record.description = 'Neighbors collect recipes together.';
    }
    raw.select[0].development = '';
    const result = await run(first.state, raw);
    assert.equal(result.accepted, true, result.error);
    assert.equal(nodes(result)[0].interpretation, raw.upsert[0].description);
    assert.equal(nodes(result)[0].stakes, '');
    assert.equal(nodes(result)[0].expectation, '');
    assert.deepEqual(result.state.archive.at(-1).workingPlan, first.state.workingPlan);
    assert.doesNotMatch(campaignPayload(result.state), /"(?:interpretation|stakes|expectation)":/);
});

test('invalid concise descriptions are withheld without losing valid neighboring stories', async () => {
    const raw = response();
    raw.upsert.push({ id: 'r1-invalid', kind: 'thread', parentId: '', status: 'active', title: 'Invalid',
        owner: 'Cooks', links: [], description: '' });
    raw.select.push({ id: 'r1-invalid', title: 'Invalid', context: [], description: 'Unavailable story.', development: '' });
    const result = await run(emptyCampaign(), raw);
    assert.equal(result.accepted, true, result.error);
    assert.equal(nodes(result).length, 1);
    assert.equal(selections(result).length, 1);
    assert.match(result.plannerNotices[0], /description.*nonblank/);
    assert.match(result.plannerNotices[1], /unavailable/);
});

test('omitted empty story fields are filled locally without losing stories or public selections', async () => {
    const raw = response();
    delete raw.upsert[0].parentId;
    delete raw.upsert[0].links;
    delete raw.select[0].development;
    const result = await run(emptyCampaign(), raw);
    assert.equal(result.accepted, true, result.error);
    assert.equal(nodes(result).length, 1);
    assert.equal(nodes(result)[0].parentId, '');
    assert.deepEqual(nodes(result)[0].links, []);
    assert.equal(selections(result).length, 1);
    assert.equal(selections(result)[0].development, '');
    assert.deepEqual(result.plannerNotices, []);
    assert.equal(result.responseAdjustments.length, 3);
    assert.match(campaignPayload(result.state), /recipe exchanges/);
});

test('omitted relationships on updates preserve known parents and links', async () => {
    const raw = response();
    raw.upsert = [proposal('r1-food', { kind: 'arc' }),
        proposal('r1-kitchen', { parentId: 'r1-food', links: ['r1-food'] })];
    raw.select[0].context = [{ kind: 'arc', title: 'Cooking together' }];
    const first = await run(emptyCampaign(), raw);
    assert.equal(first.accepted, true, first.error);
    const update = proposal('r1-kitchen', { title: 'Shared cooking revisited' });
    delete update.parentId; delete update.links;
    const result = await run(first.state, { ...raw, upsert: [update], retain: ['r1-food'] });
    assert.equal(result.accepted, true, result.error);
    const changed = nodes(result).find(node => node.id === update.id);
    assert.equal(changed.parentId, 'r1-food');
    assert.deepEqual(changed.links, ['r1-food']);
    assert.equal(changed.title, update.title);
    assert.deepEqual(result.plannerNotices, []);
});

test('explicit invalid values and missing substantive fields are still withheld', async () => {
    for (const raw of [
        { ...response(), upsert: [proposal('r1-kitchen', { parentId: null })] },
        { ...response(), upsert: [proposal('r1-kitchen', { links: null })] },
        { ...response(), select: [selected('r1-kitchen', { development: null })] },
    ]) {
        const result = await run(emptyCampaign(), raw);
        assert.equal(result.accepted, true, result.error);
        assert.deepEqual(selections(result), []);
        assert.ok(result.plannerNotices.length);
    }
    const raw = response(); delete raw.upsert[0].stakes;
    const result = await run(emptyCampaign(), raw);
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(nodes(result), []);
    assert.match(result.plannerNotices[0], /missing stakes/);
});

test('several active arcs and threads share a saga without fixed levels or convergence', async () => {
    const raw = response();
    raw.upsert = [proposal('r1-kitchen', { parentId: 'r1-food', status: 'active', links: ['r1-music'] }),
        proposal('r1-food', { kind: 'arc', parentId: 'r1-life', status: 'active' }),
        proposal('r1-music', { kind: 'arc', parentId: 'r1-life', status: 'active', title: 'A changing village ensemble' }),
        proposal('r1-life', { kind: 'saga', status: 'active', title: 'Life across the valley' }),
        proposal('r1-garden', { status: 'active', title: 'An independent garden' })];
    raw.select = [selected('r1-kitchen', { context: [{ kind: 'saga', title: 'Valley life' }, { kind: 'arc', title: 'Shared food' }] }),
        selected('r1-music', { title: 'Village music', context: [{ kind: 'saga', title: 'Valley life' }] }),
        selected('r1-garden', { title: 'An independent garden' })];
    const result = await run(emptyCampaign(), raw);
    assert.equal(result.accepted, true, result.error);
    assert.equal(validCampaignState(result.state), true);
    assert.equal(nodes(result).length, 5);
    assert.equal(selections(result).length, 3, 'no old two-selection quota');
    assert.match(campaignPayload(result.state), /Valley life/);
    assert.doesNotMatch(campaignPayload(result.state), /Life across the valley|r1-life|parentId|links/);
    assert.equal(result.state.episode.status, 'open');
});

test('broken hierarchy and cross-links preserve valid siblings and player-centered cards', async () => {
    const raw = response();
    raw.upsert.push(proposal('r1-orphan', { parentId: 'missing' }), proposal('r1-a', { kind: 'arc', parentId: 'r1-b' }),
        proposal('r1-b', { kind: 'arc', parentId: 'r1-a' }), proposal('r1-player', { owner: 'Ren' }),
        proposal('r1-link', { links: ['missing'] }), proposal('unreserved-id'));
    raw.select.push(selected('r1-orphan'), selected('r1-player'));
    const result = await run(emptyCampaign(), raw);
    assert.equal(result.accepted, true, result.error);
    assert.equal(validCampaignState(result.state), true);
    assert.deepEqual(nodes(result).map(node => node.id), ['r1-kitchen', 'r1-player']);
    assert.deepEqual(selections(result).map(node => node.id), ['r1-kitchen', 'r1-player']);
});

test('rejected updates retain private preparation but cannot publish dependent guidance', async () => {
    const first = await run();
    const raw = response(); raw.upsert[0].links = ['missing'];
    raw.select[0].development = 'Development from a rejected story update.';
    const result = await run(first.state, raw);
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(nodes(result), nodes(first));
    assert.deepEqual(selections(result), []);
    assert.match(result.plannerNotices[1], /rejected story/);
});

test('linked roots get their actual display path and dormant selections do not reactivate cards', async () => {
    const raw = response();
    raw.upsert = [proposal('r1-life', { kind: 'saga' }),
        proposal('r1-kitchen', { owner: 'Ren', links: ['r1-life'] }),
        proposal('r1-secret', { status: 'dormant', links: ['r1-life'] })];
    const linkedContext = [{ kind: 'saga', title: 'A linked concern, not a parent' }];
    raw.select = [selected('r1-life'), selected('r1-kitchen', { context: linkedContext }),
        selected('r1-secret', { context: linkedContext })];
    const result = await run(emptyCampaign(), raw);
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(result.plannerNotices, []);
    assert.deepEqual(selections(result).map(node => node.id), ['r1-life', 'r1-kitchen']);
    assert.deepEqual(selections(result)[1].context, []);
    assert.equal(nodes(result).find(node => node.id === 'r1-secret').status, 'dormant');
    assert.ok(result.responseAdjustments.includes('$.select[1].context'));
    assert.ok(result.responseAdjustments.includes('$.select[2]'));
    assert.equal(validCampaignState(result.state), true);
});

test('three detailed cards keep their effects and selected opportunities within the writer allowance', async () => {
    const description = 'Village routines connect hospital work, household responsibilities and changing relationships. Neighbors and colleagues have independent needs and interests; their proposals can develop over several scenes while the player decides how to respond.';
    const effects = [
        { label: 'Hospital demands', pressure: 'Staff shortages create competing requests from colleagues and recovering patients. The hospital can offer meaningful work and difficult priorities without choosing the player’s actions.' },
        { label: 'Village scrutiny', pressure: 'Officials compare testimony, medical reports and diplomatic claims. Their differing interests can affect access and resources while conclusions remain open to accepted play.' },
        { label: 'Personal ties', pressure: 'Friends, dependents and neighbors have plans of their own. Invitations and ordinary responsibilities can sustain quiet relationship development alongside wider village concerns.' },
    ];
    const development = 'A colleague can bring an unresolved practical concern into an ordinary conversation. Its timing and the player’s participation stay open, and it need not interrupt a quiet moment or force a new assignment.';
    const endsWhen = 'The participants settle or deliberately set aside this particular concern. Its outcome remains open; finishing it need not end the wider relationships, daily responsibilities or independent village activity.';
    const raw = response();
    raw.upsert = ['ward', 'records', 'household'].map(id => ({ id: `r1-${id}`, kind: 'thread', parentId: '', status: 'active',
        title: `Village ${id}`, owner: 'Ren', links: [], description, effects, endsWhen }));
    raw.select = raw.upsert.map(({ id, title }) => ({ id, title, context: [], description, development, endsWhen }));
    const result = await run(emptyCampaign(), raw);
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(result.plannerNotices, []);
    assert.equal(selections(result).length, 3);
    const budget = campaignPayloadBudget(result.state);
    assert.equal(budget.omitted, 0);
    assert.match(budget.payload, /Hospital demands/);
    assert.match(budget.payload, /Village household/);
});

test('closed stories leave the map; dormant possibilities remain without changing prior state', async () => {
    const raw = response();
    raw.upsert = [proposal('r1-kitchen', { parentId: 'r1-food', status: 'active' }), proposal('r1-food', { kind: 'arc', status: 'active' })];
    raw.select = [selected('r1-kitchen', { context: [{ kind: 'arc', title: 'Cooking together' }] })];
    const first = await run(emptyCampaign(), raw);
    assert.equal(first.accepted, true, first.error);
    const retired = await run(first.state, { ...response(), upsert: [], retire: ['r1-food'], select: raw.select });
    assert.equal(retired.accepted, true, retired.error);
    assert.deepEqual(nodes(retired), []);
    assert.deepEqual(selections(retired), []);
    assert.equal(nodes(first)[0].status, 'active');
    for (const status of ['resolved', 'dormant']) {
        const result = await run(emptyCampaign(), { ...response(), upsert: [proposal('r1-kitchen', { status })] });
        assert.equal(result.accepted, true, result.error); assert.deepEqual(selections(result), []);
        assert.equal(nodes(result).length, status === 'dormant' ? 1 : 0);
    }
});

test('parent closure is rolled back unless active descendants are also closed or paused', async () => {
    const first = await run(emptyCampaign(), { ...response(), upsert: [proposal('r1-kitchen', { parentId: 'r1-food', status: 'active' }),
        proposal('r1-food', { kind: 'arc', status: 'active' })], select: [] });
    const invalid = await run(first.state, { ...response(), upsert: [proposal('r1-food', { kind: 'arc', status: 'resolved' })], select: [] });
    assert.equal(invalid.accepted, true, invalid.error);
    assert.equal(nodes(invalid).find(node => node.id === 'r1-food').status, 'active');
    const valid = await run(first.state, { ...response(), upsert: [proposal('r1-food', { kind: 'arc', status: 'resolved' }),
        proposal('r1-kitchen', { parentId: 'r1-food', status: 'resolved' })], select: [] });
    assert.equal(valid.accepted, true, valid.error);
    assert.deepEqual(nodes(valid), []);
});

test('duplicate selections and overflows are withheld while display hierarchy is corrected locally', async () => {
    const duplicate = await run(emptyCampaign(), { ...response(), select: [selected(), selected()] });
    assert.equal(duplicate.accepted, true, duplicate.error); assert.equal(selections(duplicate).length, 1);
    assert.match(duplicate.plannerNotices[0], /Duplicate/);
    const wrong = await run(emptyCampaign(), { ...response(), select: [selected('r1-kitchen', { context: [{ kind: 'saga', title: 'Invented parent' }] })] });
    assert.equal(wrong.accepted, true, wrong.error);
    assert.equal(selections(wrong).length, 1);
    assert.deepEqual(selections(wrong)[0].context, []);
    assert.deepEqual(wrong.plannerNotices, []);
    assert.ok(wrong.responseAdjustments.includes('$.select[0].context'));
    const oversized = await run(emptyCampaign(), { ...response(), select: [selected('r1-kitchen', {
        interpretation: '菜'.repeat(750), stakes: '旅'.repeat(550), expectation: '友'.repeat(750) })] });
    assert.equal(oversized.accepted, true, oversized.error);
    assert.deepEqual(selections(oversized), []); assert.equal(nodes(oversized).length, 1);
    assert.match(oversized.plannerNotices[0], /budget/);
    const result = await run();
    const budget = campaignPayloadBudget(result.state, ['author '.repeat(1200)]);
    assert.equal(budget.authorOverflow, true); assert.equal(budget.omitted, 1);
    assert.match(budget.payload, /author_instructions/); assert.doesNotMatch(budget.payload, /story_context/);
});

test('guidance expires at the wider horizon or immediately on explicit direction and scene changes', async () => {
    const result = await run();
    const context = { ...source, fingerprint: () => 'accepted', messages: [{ is_user: false, mes: 'Prior.' }, { is_user: true, mes: 'Prior input.' }] };
    const usable = messages => campaignWriterUsable(result.state, { ...context, messages }, 12);
    assert.equal(storyReviewInterval(20, result.state), 12);
    assert.equal(usable([...context.messages, ...Array.from({ length: 11 }, () => ({ is_user: false, mes: 'Ordinary conversation.' }))]), true);
    assert.equal(usable([...context.messages, ...Array.from({ length: 12 }, () => ({ is_user: false, mes: 'Ordinary conversation.' }))]), false);
    assert.equal(usable([...context.messages, { is_user: true, mes: 'OOC: Drop the cooking story.' }]), false);
    assert.equal(usable([...context.messages, { is_user: false, mes: '***\nA different scene.' }]), false);
    assert.equal(usable([...context.messages, { is_user: true, mes: '"If we cook, I want soup," Ren says.' }]), true);
    assert.equal(campaignMaterialUsable(result.state, { ...context, referenceHash: 'changed' }, 12), false);
    assert.equal(campaignWriterUsable(result.state, { ...context, fingerprint: () => 'edited' }, 12), false);
});

test('complete syntax mistakes repair locally; cutoff and invalid horizons preserve state without retry', async () => {
    const raw = JSON.stringify(response()).replace(',"retire"', ' "retire"');
    const repaired = await run(emptyCampaign(), raw);
    assert.equal(repaired.accepted, true, repaired.error);
    assert.deepEqual(parseDirectorResponse('```json\n{"ok":true,}\n```'), { ok: true });
    for (const invalid of [JSON.stringify(response()).slice(0, -8), { ...response(), reviewAfter: 1 }]) {
        const failed = await run(repaired.state, invalid);
        assert.equal(failed.accepted, false); assert.equal(failed.state, repaired.state);
    }
});

test('rebuilds reserve ids without retaining the old map or archives', async () => {
    const first = await run();
    const result = await run(first.state, { ...response(), upsert: [proposal('r2-fresh')], select: [selected('r2-fresh')] }, { resetPlan: true });
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(nodes(result).map(row => row.id), ['r2-fresh']);
    assert.deepEqual(result.state.archive, []);
    assert.deepEqual(JSON.parse(result.input.prompt).previous_preparation.nodes, []);
});

test('saved graph tampering fails validation without normalizing it away', async () => {
    const first = await run();
    const changed = structuredClone(first.state);
    changed.workingPlan.storyStructure.nodes[0].parentId = 'missing';
    assert.equal(validCampaignState(changed), false);
    assert.throws(() => validateStoryStructure(changed.workingPlan.storyStructure, check), /hierarchy/);
});
