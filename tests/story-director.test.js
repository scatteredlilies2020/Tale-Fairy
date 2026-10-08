import test from 'node:test';
import assert from 'node:assert/strict';
import { directorInput, directorPass, DIRECTOR_SYSTEM, DIRECTOR_SCHEMA, parseDirectorResponse } from '../extension/story-director.js';
import { emptyCampaign, validCampaignState, campaignPayload, campaignPayloadBudget, campaignMaterialUsable, campaignWriterUsable, check } from '../extension/campaign-planner.js';
import { storyInputTokens } from '../extension/story-budget.js';
import { validateStoryStructure, storyReviewInterval } from '../extension/story-structure.js';

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
const response = () => ({ direction: 'Explore village friendships, shared interests and nearby communities.', reviewAfter: 12,
    upsert: [proposal()], retire: [], select: [selected()] });
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
    assert.ok(storyInputTokens('', DIRECTOR_SYSTEM, DIRECTOR_SCHEMA) < 2600, 'contract remains compact including headroom guidance');
});

test('ordinary reviews preserve unused stories and renew the public selection from scratch', async () => {
    const first = await run();
    const result = await run(first.state, { ...response(), upsert: [], select: [] });
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
    const result = await run(first.state, { ...raw, upsert: [update] });
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

test('closed and dormant stories stay private; retirement withdraws descendants without changing prior state', async () => {
    const raw = response();
    raw.upsert = [proposal('r1-kitchen', { parentId: 'r1-food', status: 'active' }), proposal('r1-food', { kind: 'arc', status: 'active' })];
    raw.select = [selected('r1-kitchen', { context: [{ kind: 'arc', title: 'Cooking together' }] })];
    const first = await run(emptyCampaign(), raw);
    assert.equal(first.accepted, true, first.error);
    const retired = await run(first.state, { ...response(), upsert: [], retire: ['r1-food'], select: raw.select });
    assert.equal(retired.accepted, true, retired.error);
    assert.ok(nodes(retired).every(node => node.status === 'retired'));
    assert.deepEqual(selections(retired), []);
    assert.equal(nodes(first)[0].status, 'active');
    for (const status of ['resolved', 'dormant']) {
        const result = await run(emptyCampaign(), { ...response(), upsert: [proposal('r1-kitchen', { status })] });
        assert.equal(result.accepted, true, result.error); assert.deepEqual(selections(result), []);
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
    assert.ok(nodes(valid).every(node => node.status === 'resolved'));
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
