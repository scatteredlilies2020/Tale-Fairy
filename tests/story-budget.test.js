import test from 'node:test';
import assert from 'node:assert/strict';
import { conservativeTokenCount, estimateTokenCount } from '../extension/token-budget.js';
import { fitStoryContext, storyContextPayload, storyInputTokens, verifyStoryInputBudget, WRITER_CONTEXT_TOKEN_LIMIT, DEVELOPMENT_CONTRACT, STORY_GOAL_CONTRACT, STORY_GOALS_CONTRACT } from '../extension/story-budget.js';
import { storyInput, STORY_SYSTEM, STORY_SCHEMA } from '../extension/story-selection.js';
import { emptyCampaign } from '../extension/campaign-planner.js';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';

test('conservative accounting covers unicode bytes, escaping, whitespace and long data', () => {
    for (const text of ['故事繼續', '🧑🏽‍🎤'.repeat(50), '\t '.repeat(200), '1234567890'.repeat(100), '<"\\\n'.repeat(100)]) {
        assert.ok(conservativeTokenCount(text) >= estimateTokenCount(text));
        assert.ok(conservativeTokenCount(text) >= text.length / 3);
    }
    assert.ok(conservativeTokenCount('故事繼續') >= 12);
    assert.ok(conservativeTokenCount('🎼') >= 4);
    assert.equal(conservativeTokenCount(''), 0);
});

test('story fitting includes real prompt-only schema, escaped messages and framing reserve', () => {
    const args = { state: emptyCampaign(), reference: {}, messages: [{ index: 0, role: 'user', content: 'Music and rest.' }] };
    const input = storyInput(args);
    assert.equal(input.inputTokens, storyInputTokens(input.prompt, STORY_SYSTEM, STORY_SCHEMA));
    const actual = JSON.stringify(plannerMessages(STORY_SYSTEM, input.prompt, STORY_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY));
    assert.ok(input.inputTokens >= conservativeTokenCount(actual) + 64);
    assert.equal(storyInput(args, input.inputTokens).inputTokens, input.inputTokens);
    const before = structuredClone(args);
    assert.throws(() => storyInput(args, input.inputTokens - 1), /exceeds/);
    for (const limit of [NaN, Infinity, -1, 0]) assert.throws(() => storyInput(args, limit), /finite positive/);
    assert.deepEqual(args, before);
});

test('writer fitting retains complete small packets with exact escaped instructions', () => {
    const material = [{ available_circumstances: 'Only if invited, a rehearsal could be shared.', long_term_possibilities: 'No collaboration is agreed.' }];
    const notes = ['Preserve <my instruction> exactly.'];
    const report = fitStoryContext(material, notes);
    assert.equal(report.payload, storyContextPayload(material, notes));
    assert.equal(report.omitted, 0);
    assert.equal(report.authorOverflow, false);
    assert.ok(report.tokens <= WRITER_CONTEXT_TOKEN_LIMIT);
    const decoded = JSON.parse(report.payload.replace(/<\/?tale-fairy-context>/g, ''));
    assert.deepEqual(decoded.author_instructions, notes);
    assert.doesNotMatch(report.payload, /<my instruction>/);
});

test('new writer packets contain story material without application-written contracts', () => {
    const material = [{ available_circumstances: 'If they visit the arena, Bolin could dispute an old match diagram.' }];
    const report = fitStoryContext(material, []);
    const decode = payload => JSON.parse(payload.replace(/<\/?tale-fairy-context>/g, ''));
    assert.deepEqual(decode(report.payload), { possible_developments: material },
        'legacy hedging is not rewritten as historical fact');
    assert.equal(report.tokens, conservativeTokenCount(report.payload));
    assert.ok(report.tokens <= report.limit);
    const historical = fitStoryContext(material, [], { legacyContracts: true });
    assert.equal(decode(historical.payload).development_contract, DEVELOPMENT_CONTRACT);
    const older = fitStoryContext(material, [], { legacyContracts: true, followThrough: false });
    assert.equal(decode(older.payload).development_contract, undefined);
    assert.ok(older.tokens < historical.tokens);
    assert.equal(fitStoryContext([], []).payload, '');
    assert.deepEqual(decode(fitStoryContext([], ['Rest tonight.']).payload), { author_instructions: ['Rest tonight.'] });
});

test('oversized integrated packets are omitted whole, not separated from their prerequisites', () => {
    const material = [
        { available_circumstances: 'Only after an invitation. '.repeat(400), long_term_possibilities: 'They may then collaborate.' },
        { available_circumstances: 'An independent small opportunity.' },
    ];
    const before = structuredClone(material);
    const report = fitStoryContext(material, []);
    assert.equal(report.omitted, 1);
    assert.match(report.payload, /independent small/);
    assert.doesNotMatch(report.payload, /invitation|collaborate/);
    assert.ok(report.tokens <= report.limit);
    assert.deepEqual(material, before);
});

test('explicit author instructions and selected story material fit as one indivisible packet', () => {
    const entry = { story_goal: { aim: 'Share the new tune.', reached_when: 'Both arrangements have been heard.' },
        available_circumstances: 'At rehearsal, Jo brings contrasting arrangements.' };
    const notes = ['My writing style stays unchanged.'];
    const fitted = fitStoryContext([entry], notes);
    const decoded = JSON.parse(fitted.payload.replace(/<\/?tale-fairy-context>/g, ''));
    assert.equal(decoded.story_goal_contract, undefined);
    assert.deepEqual(decoded.possible_developments, [entry]);
    assert.deepEqual(decoded.author_instructions, notes);
    assert.ok(fitted.tokens <= fitted.limit);
    const large = { ...entry, available_circumstances: '界'.repeat(900) };
    const withheld = fitStoryContext([large], notes);
    assert.equal(withheld.omitted, 1);
    assert.doesNotMatch(withheld.payload, /story_goal|Share the new tune|At rehearsal/);
    assert.deepEqual(JSON.parse(withheld.payload.replace(/<\/?tale-fairy-context>/g, '')), { author_instructions: notes });
    assert.equal(fitStoryContext([], []).payload, '');
    const old = JSON.parse(fitStoryContext([entry], notes, { legacyContracts: true }).payload.replace(/<\/?tale-fairy-context>/g, ''));
    assert.equal(old.story_goal_contract, STORY_GOAL_CONTRACT);
});

test('historical multiple-goal packets remain authenticatable but new packets add no goal instructions', () => {
    const entry = { story_goals: [
        { scope: 'long-term', aim: 'Build a shared repertoire.', reached_when: 'The group presents an original set.' },
        { scope: 'near-term', aim: 'Try two arrangements.', reached_when: 'Both have been played.' },
        { scope: 'side-thread', aim: 'Share new cakes.', reached_when: 'The tea break finishes.' },
    ], available_circumstances: 'At the club, Jo brings arrangements and the baker brings cakes for the break.' };
    const before = structuredClone(entry), notes = ['Use my preferred writing style.'];
    const report = fitStoryContext([entry], notes);
    assert.equal(report.omitted, 0);
    assert.ok(report.tokens <= WRITER_CONTEXT_TOKEN_LIMIT);
    const wire = JSON.parse(report.payload.replace(/<\/?tale-fairy-context>/g, ''));
    assert.deepEqual(wire.possible_developments, [entry]);
    assert.equal(wire.story_goals_contract, undefined);
    assert.equal(wire.story_goal_contract, undefined);
    const historical = JSON.parse(fitStoryContext([entry], notes, { legacyContracts: true }).payload.replace(/<\/?tale-fairy-context>/g, ''));
    assert.equal(historical.story_goals_contract, STORY_GOALS_CONTRACT);
    const oversized = fitStoryContext([{ ...entry, available_circumstances: '界'.repeat(900) }], notes);
    assert.equal(oversized.omitted, 1);
    assert.deepEqual(JSON.parse(oversized.payload.replace(/<\/?tale-fairy-context>/g, '')), { author_instructions: notes });
    assert.deepEqual(entry, before);
});

test('aggregate writer budget includes JSON framing, unicode and author instructions', () => {
    const material = Array.from({ length: 20 }, (_, id) => ({ available_circumstances: `${id}: ${'活動 '.repeat(25)}` }));
    const notes = ['Do not change this instruction. '.repeat(8)];
    const report = fitStoryContext(material, notes);
    assert.ok(report.omitted > 0 && report.omitted < material.length);
    assert.equal(report.tokens, conservativeTokenCount(report.payload));
    assert.ok(report.tokens <= report.limit);
    assert.ok(report.payload.includes(notes[0]));
    const unicode = fitStoryContext([{ available_circumstances: '音'.repeat(900) }], []);
    assert.equal(unicode.payload, '');
    assert.equal(unicode.omitted, 1, 'a character bound alone is not a token bound');
});

test('author-only overflow is explicit and never silently deletes or clips saved instructions', () => {
    const notes = ['Explicit author instruction. '.repeat(500)];
    const report = fitStoryContext([{ available_circumstances: 'Optional story material.' }], notes);
    assert.equal(report.authorOverflow, true);
    assert.equal(report.omitted, 1);
    assert.ok(report.tokens > report.limit);
    assert.deepEqual(JSON.parse(report.payload.replace(/<\/?tale-fairy-context>/g, '')).author_instructions, notes);
});

test('native preflight may increase but never decrease the conservative budget', async () => {
    const count = storyInputTokens('{}', STORY_SYSTEM, STORY_SCHEMA);
    await assert.rejects(verifyStoryInputBudget('{}', STORY_SYSTEM, STORY_SCHEMA, count - 1, async () => 1), /no provider request sent/);
    await assert.rejects(verifyStoryInputBudget('{}', STORY_SYSTEM, STORY_SCHEMA, count, async () => count * 2), /exceeds/);
    for (const counter of [undefined, async () => NaN, async () => Infinity, async () => { throw Error('offline'); }]) {
        assert.equal(await verifyStoryInputBudget('{}', STORY_SYSTEM, STORY_SCHEMA, count, counter), count);
    }
});
