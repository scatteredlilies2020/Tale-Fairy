import test from 'node:test';
import assert from 'node:assert/strict';
import { conservativeTokenCount, estimateTokenCount } from '../extension/token-budget.js';
import { fitStoryContext, storyContextPayload, storyInputTokens, verifyStoryInputBudget, WRITER_CONTEXT_TOKEN_LIMIT } from '../extension/story-budget.js';
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
