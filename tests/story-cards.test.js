import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storyCardCases, cardCaseReply } from '../scripts/story-card-cases.mjs';
import { evaluateCardCase } from '../scripts/evaluate-story-cards.mjs';
import { directorInput, directorPass, DIRECTOR_SYSTEM, DIRECTOR_SCHEMA } from '../extension/story-director.js';
import { emptyCampaign, campaignPayload, campaignPayloadBudget, check } from '../extension/campaign-planner.js';
import { mergeStoryNodes, storyWriterMaterial, writerReviewSignal, storyChangeSignal, STORY_NODE_SCHEMA, STORY_NODE_RESPONSE_SCHEMA } from '../extension/story-structure.js';
import { storyCardsHtml, renderStoryCards } from '../extension/story-cards.js';
import { fitStoryContext, WRITER_CONTEXT_TOKEN_LIMIT } from '../extension/story-budget.js';
import { conservativeTokenCount } from '../extension/token-budget.js';

const decode = packet => JSON.parse(packet.replace(/<\/?tale-fairy-context>/g, ''));
const fixture = storyCardCases[0];
const stored = raw => { const { description, ...rest } = raw; return { ...rest, interpretation: description, stakes: '', expectation: '' }; };
function merge(previous, upsert, retire = []) {
    const notices = [], rejectedIds = new Set();
    const nodes = mergeStoryNodes(previous, upsert, retire, { check, playerNames: fixture.players, newIdPrefix: 'r1-', notices, rejectedIds });
    return { nodes, notices, rejectedIds };
}

for (const example of storyCardCases) test(`card lifecycle and exact writer transport: ${example.title}`, async () => {
    const report = await evaluateCardCase(example);
    assert.equal(report.calls, 3, 'one request per explicit review, no extra extraction or repair');
    const [first, quiet, closed] = report.stages;
    for (const stage of report.stages) {
        assert.equal(stage.omitted, 0);
        assert.deepEqual(stage.notices, []);
        assert.ok(stage.writerTokens <= WRITER_CONTEXT_TOKEN_LIMIT - 500, 'ordinary examples leave real headroom');
    }
    assert.equal(first.writerPacket, quiet.writerPacket);
    assert.deepEqual(first.plan.storyStructure.nodes, quiet.plan.storyStructure.nodes);
    const packet = decode(first.writerPacket);
    assert.equal(packet.rp_orientation, example.reminder);
    assert.equal(packet.story_context.length, example.cards.length);
    for (const [i, card] of example.cards.entries()) {
        assert.equal(packet.story_context[i].title, card.title);
        assert.deepEqual(packet.story_context[i].effects, card.effects);
        assert.equal(packet.story_context[i].status, card.status);
    }
    assert.match(packet.effect_basis, /author-level pressures/);
    assert.match(packet.review_signal, /<!--tf-review-->/);
    assert.doesNotMatch(first.writerPacket, /"(?:scratchpad|changeReason|owner|links|parentId)":/);
    const after = decode(closed.writerPacket);
    assert.equal(after.rp_orientation, packet.rp_orientation);
    assert.ok(after.story_context.every(card => card.kind === 'chapter'));
    for (const node of closed.plan.storyStructure.nodes.filter(node => ['resolved', 'dormant'].includes(node.status))) {
        for (const effect of node.effects) assert.ok(!closed.writerPacket.includes(effect.pressure));
    }
    const html = storyCardsHtml(closed.plan);
    assert.doesNotMatch(html, /Closed stories|tf-status-resolved|data-disclosure="closed"/);
    if (closed.plan.storyStructure.nodes.some(node => node.status === 'dormant')) assert.match(html, /Future possibilities/);
});

for (const example of storyCardCases) test(`comfortable writer headroom preserves notes and richer cards: ${example.id}`, async () => {
    const report = await evaluateCardCase(example);
    const first = decode(report.stages[0].writerPacket);
    const notes = ['Keep the current player choices and established relationships central to their own scenes. '.repeat(8)];
    assert.ok(conservativeTokenCount(notes[0]) >= 250);
    const cards = first.story_context.map(card => ({ ...card,
        development: `${card.development || ''} Existing commitments continue to affect access, trust and available choices.` }));
    const before = structuredClone(cards);
    const budget = fitStoryContext(cards, notes, { storyStructure: true, orientation: first.rp_orientation });
    const packet = decode(budget.payload);
    assert.equal(budget.omitted, 0);
    assert.equal(budget.orientationOmitted, false);
    assert.equal(budget.authorOverflow, false);
    assert.ok(budget.tokens <= WRITER_CONTEXT_TOKEN_LIMIT - 100, 'variation and notes still leave spare capacity');
    assert.equal(packet.rp_orientation, first.rp_orientation);
    assert.deepEqual(packet.story_context, cards);
    assert.deepEqual(packet.author_instructions, notes);
    assert.deepEqual(cards, before);
    assert.deepEqual(fitStoryContext(cards, notes, { storyStructure: true, orientation: first.rp_orientation }), budget);
});

test('effects are stored once, omission retains, [] clears, and archives are untouched', () => {
    const raw = cardCaseReply(fixture).upsert, initial = merge([], raw).nodes;
    const before = JSON.stringify(initial);
    const changed = { ...raw[1], description: 'The immediate negotiations develop.' }; delete changed.effects;
    const retained = merge(initial, [changed]);
    assert.deepEqual(retained.notices, []);
    assert.deepEqual(retained.nodes[1].effects, initial[1].effects);
    assert.equal(JSON.stringify(initial), before);
    assert.equal(changed.effects, undefined);
    const cleared = merge(retained.nodes, [{ ...changed, effects: [] }]);
    assert.deepEqual(cleared.nodes[1].effects, []);
    assert.deepEqual(cleared.nodes[0].effects, initial[0].effects);
    const legacyUpdate = stored(changed);
    assert.deepEqual(merge(initial, [legacyUpdate]).nodes[1].effects, initial[1].effects);
    assert.ok(!DIRECTOR_SCHEMA.value.properties.select.items.properties.effects, 'selection does not duplicate effects');
    assert.ok(STORY_NODE_RESPONSE_SCHEMA.required.includes('effects'));
    assert.ok(!STORY_NODE_SCHEMA.required.includes('effects'), 'old saved cards remain valid');
});

test('malformed or oversized effects cannot erase good cards or dependent writer selections', async () => {
    const raw = cardCaseReply(fixture);
    for (const effects of [null, 'buff', [{ label: '', pressure: 'x' }], [{ label: 'X', pressure: '' }],
        [{ label: 'x'.repeat(57), pressure: 'x' }], [{ label: 'X', pressure: 'x'.repeat(201) }],
        Array.from({ length: 4 }, () => ({ label: 'X', pressure: 'x' })), [{ label: 'X', pressure: 'x', score: 3 }]]) {
        const previous = raw.upsert.map(stored);
        const next = merge(previous, [{ ...raw.upsert[0], effects }]);
        assert.deepEqual(next.nodes, previous);
        assert.ok(next.rejectedIds.has(raw.upsert[0].id));
        assert.equal(next.notices.length, 1);
    }
    const state = emptyCampaign();
    const input = directorInput({ reference: { premise: fixture.premise }, messages: [], state, playerNames: fixture.players });
    raw.upsert[0].effects = [{ label: 'Invalid', pressure: '' }];
    const result = await directorPass({ state, input, source: { chatId: 'cards', messageCount: 0, referenceHash: 'ref', fingerprint: 'f' },
        generate: async () => ({ text: JSON.stringify(raw) }) });
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.state.workingPlan.storyStructure.selection.length, 0, 'bad parent invalidates dependent selection');
});

test('legacy packets are byte-stable until a new-format update, including stored public titles', () => {
    const node = stored(cardCaseReply(fixture).upsert[0]); delete node.effects;
    const entry = { id: node.id, title: 'Public title', context: [], interpretation: 'Old explanation', stakes: '', expectation: '', development: '', endsWhen: '' };
    const plan = { direction: 'Legacy', storyStructure: { version: 1, reviewAfter: 12, nodes: [node], selection: [entry] } };
    const material = storyWriterMaterial(plan);
    assert.deepEqual(material, [{ kind: 'saga', title: 'Public title', description: 'Old explanation' }]);
    assert.equal(campaignPayload({ workingPlan: plan }), '<tale-fairy-context>\n{"preparation_basis":"Story expectations, not established events or player obligations. Current play takes precedence. Ignore completed, declined or contradicted developments.","story_context":[{"kind":"saga","title":"Public title","description":"Old explanation"}]}\n</tale-fairy-context>');
    check(node, STORY_NODE_SCHEMA, '$.node');
});

test('retirement stops descendant effects without mutating the old map', () => {
    const raw = cardCaseReply(fixture), previous = raw.upsert.map(stored);
    const result = merge(previous, [], [previous[0].id]);
    assert.ok(result.nodes.every(node => node.status === 'retired'));
    assert.equal(previous[0].status, 'active');
    const selection = raw.select.map(stored);
    const map = { version: 1, nodes: result.nodes, selection };
    assert.deepEqual(storyWriterMaterial({ storyStructure: map }), []);
    const paused = structuredClone(previous); paused[0].status = 'dormant';
    assert.deepEqual(storyWriterMaterial({ storyStructure: { ...map, nodes: paused } }), []);
    const html = storyCardsHtml({ storyStructure: { ...map, nodes: paused } });
    assert.match(html, /Possible influences · inactive/);
    assert.doesNotMatch(html, /Ongoing effects|Writer selection/);
});

test('effects count toward the same hard writer budget and are never clipped', async () => {
    const report = await evaluateCardCase(storyCardCases[1]);
    const plan = report.stages[0].plan;
    const original = JSON.stringify(plan);
    const budget = campaignPayloadBudget({ workingPlan: plan }, ['Author direction: ' + 'Keep the setting consistent. '.repeat(140)]);
    assert.ok(budget.omitted > 0);
    assert.equal(JSON.stringify(plan), original);
    const packet = decode(budget.payload);
    for (const card of packet.story_context || []) {
        assert.deepEqual(card.effects, plan.storyStructure.nodes.find(node => node.title === card.title).effects);
    }
});

test('setting substance supports secret author knowledge, original invention and playful depth', () => {
    for (const text of ["god's-eye view", 'institutions', 'incentives', 'customs', 'relationships', 'independent lives',
        'Depth can be playful', 'Infer and invent boldly', 'hidden motives', 'Original worlds support invention',
        'character knowledge follows play']) assert.ok(DIRECTOR_SYSTEM.includes(text), text);
    assert.doesNotMatch(DIRECTOR_SYSTEM, /Redact private motives/);
});

test('card renderer escapes every model-authored surface and labels status without relying on color', () => {
    const attack = '<img src=x onerror="alert(1)">';
    const node = stored(cardCaseReply(fixture).upsert[0]);
    Object.assign(node, { id: attack, kind: attack, title: attack, owner: attack, interpretation: attack, endsWhen: attack,
        stakes: attack, links: [], effects: [{ label: attack, pressure: attack }] });
    const html = storyCardsHtml({ direction: attack, storyStructure: { foundation: { reminder: attack, scratchpad: attack, changeReason: attack }, nodes: [node], selection: [{ id: attack }] } });
    assert.ok(!html.includes('<img'));
    assert.ok(!html.includes('<script'));
    assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
    assert.match(html, /tf-card-status">Active/);
    assert.match(html, /Writer selection/);
    assert.match(html, /tf-card-kind">Subplot/);
    assert.equal(storyCardsHtml(null), '');
});

test('saved current-phase summaries disappear from the board while ongoing cards remain', () => {
    const phase = 'Rin honors her dead at the Memorial Stone before a hospital shift; the envelope remains unopened.';
    const plan = { direction: phase, storyStructure: { foundation: {
        reminder: fixture.reminder, scratchpad: '', changeReason: '',
    }, nodes: cardCaseReply(fixture).upsert.map(stored), selection: [] } };
    const before = structuredClone(plan);
    const html = storyCardsHtml(plan);
    assert.doesNotMatch(html, /Current phase|Memorial Stone|envelope remains unopened/);
    assert.ok(html.includes(fixture.reminder));
    for (const node of plan.storyStructure.nodes) assert.ok(html.includes(node.title));
    assert.deepEqual(plan, before, 'opening a saved board requires no state migration or model request');
});

test('legacy closed cards stay off the board while future possibilities survive', () => {
    const [root, child] = cardCaseReply(fixture).upsert.map(stored);
    root.status = 'resolved'; root.title = 'COMPLETED_CARD_SECRET';
    child.status = 'dormant'; child.title = 'A future possibility'; child.links = [root.id];
    const plan = { storyStructure: { nodes: [root, child], selection: [] } }, before = structuredClone(plan);
    const html = storyCardsHtml(plan);
    assert.doesNotMatch(html, /COMPLETED_CARD_SECRET|Closed stories|Connected to|tf-card-path/);
    assert.match(html, /Future possibilities|A future possibility/);
    assert.deepEqual(plan, before);
});

test('renderer keeps disclosure state on refresh and does not churn unchanged DOM', async () => {
    const plan = (await evaluateCardCase(fixture)).stages[2].plan;
    const details = [{ dataset: { disclosure: 'dormant' }, open: true }, { dataset: { disclosure: 'notes' }, open: false }];
    let writes = 0, html = '';
    const container = { hidden: true, querySelectorAll: selector => selector.includes('[open]') ? details.filter(d => d.open) : details,
        set innerHTML(value) { writes++; html = value; details.forEach(d => d.open = false); }, get innerHTML() { return html; } };
    renderStoryCards(container, plan);
    assert.equal(container.hidden, false);
    assert.equal(details[0].open, true);
    renderStoryCards(container, structuredClone(plan));
    assert.equal(writes, 1);
    renderStoryCards(container, plan, { fresh: false, omitted: 1 });
    assert.equal(writes, 2);
    assert.equal(details[0].open, true);
    assert.match(html, /Review needed/);
    assert.match(html, /budget omits/);
    renderStoryCards(container, null);
    assert.equal(container.hidden, true);
});

test('host renders the real board with source readiness and budget information, preserving the legacy inspector', () => {
    const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
    const template = readFileSync(new URL('../extension/settings.html', import.meta.url), 'utf8');
    assert.match(source, /renderStoryCards\(board\.querySelector\('\[data-role="story-cards"\]'\), cardPlan/);
    assert.match(source, /fresh: cardView && preparedReady/);
    assert.match(source, /omitted: cardBudget.omitted/);
    for (const role of ['story-cards', 'story-card-diagnostics', 'story-card-diagnostics-text', 'scratchpad-prepared', 'scratchpad-request-verification']) assert.ok(template.includes(`data-role="${role}"`));
    assert.match(template, /Show\/Hide Story Board/);
});

test('writer review signals require a final standalone comment outside code or quotations', () => {
    for (const value of ['The agreement is signed.\n<!--tf-review-->', 'The agreement is signed.\r\n<!--tf-review-->\r\n',
        '```\nA code example.\n```\n<!--tf-review-->']) {
        assert.equal(writerReviewSignal(value), true);
        assert.equal(storyChangeSignal([{ role: 'assistant', content: value }]), true);
        assert.equal(storyChangeSignal([{ role: 'user', content: value }]), false);
        assert.equal(storyChangeSignal([{ role: 'system', content: value }]), false);
    }
    for (const value of ['Ordinary dialogue about endings.', 'The words <!--tf-review--> are quoted.',
        '> <!--tf-review-->', '    <!--tf-review-->', '\t<!--tf-review-->', '```html\n<!--tf-review-->', '~~~\n<!--tf-review-->',
        '<!--tf-review-->\nThe scene continues.', '<!--tf-review:resolved-->']) assert.equal(writerReviewSignal(value), false, value);
});
