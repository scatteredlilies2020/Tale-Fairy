import test from 'node:test';
import assert from 'node:assert/strict';
import { storyInput, STORY_SYSTEM, STORY_SCHEMA } from '../extension/bounded-story.js';
import { storyInputTokens, fitStoryInputBudget } from '../extension/story-budget.js';
import { emptyCampaign } from '../extension/campaign-planner.js';
import { fitPlannerContext, optionalPlannerContexts } from '../extension/planner-context.js';

const prose = (size, text = 'People travel among distinct towns. Their choices change local relationships. ') => text.repeat(Math.ceil(size / text.length)).slice(0, size);
const reference = { description: prose(1607), personality: prose(535), scenario: prose(915), persona: prose(115) };
const messages = [
    { index: 0, role: 'assistant', content: prose(2501) },
    { index: 1, role: 'user', content: prose(52) },
    { index: 409, role: 'user', content: prose(180) },
    { index: 410, role: 'assistant', content: prose(2200) },
    { index: 411, role: 'user', content: 'I decline the old investigation and keep travelling. No promised meeting or forced detour.' },
    { index: 412, role: 'assistant', content: prose(4055) + '\n<status>' + prose(1214) + '</status>' },
];
const state = { ...emptyCampaign(), revision: 52, workingPlanVersion: 1, workingPlan: {
    direction: prose(280), threads: prose(220), consequences: [], developments: [
        { id: 'r52-travel', kind: 'arc', owner: 'Townspeople', control: 'world', question: prose(180),
            initiative: prose(300), resolution: prose(180), beyond: prose(180), access: { route: 'local', basis: prose(120) } },
    ],
} };
const args = { reference, state, messages, previousUsable: true, reviewedMessageCount: 411 };

test('past card names yield before memory, current plans and recent RP', () => {
    const payload = { recent_card_names: ['A previous idea'], previous_preparation: { nodes: ['Current and future plans'] },
        accepted_messages: messages, external_evidence: [{ content: 'Summary context.' }], coverage: { reviewed_before: 0 } };
    const first = [...optionalPlannerContexts(payload)][0];
    assert.equal(first.recent_card_names, undefined);
    assert.deepEqual(first.previous_preparation, payload.previous_preparation);
    assert.deepEqual(first.accepted_messages, messages);
    assert.deepEqual(first.external_evidence, payload.external_evidence);
    const measure = value => JSON.stringify(value).length;
    const fitted = fitPlannerContext(payload, measure, measure(payload) - 1);
    assert.deepEqual(fitted, first);
});

test('reconsidered old proposals yield before fresh references, trusted preparation and accepted choices', () => {
    const payload = { source_reference: reference, previous_horizon: { trajectories: [] },
        reconsider_horizon: { trajectories: [{ focus: prose(1000) }] }, accepted_messages: messages,
        external_evidence: [{ content: 'Recall.' }], coverage: { reviewed_before: 0 } };
    const first = [...optionalPlannerContexts(payload)][0];
    assert.equal(first.reconsider_horizon, undefined);
    assert.equal(first.coverage.omitted_reconsider_horizon, true);
    assert.deepEqual(first.accepted_messages, messages);
    assert.deepEqual(first.source_reference, reference);
    assert.deepEqual(first.previous_horizon, payload.previous_horizon);
    assert.deepEqual(first.external_evidence, payload.external_evidence);
});

for (const target of [8000, 10000]) test(`long-form RP input automatically fits the complete ${target}-token envelope`, () => {
    const fixture = structuredClone(args);
    if (target === 10000) fixture.messages[3].content = prose(6000);
    const before = structuredClone(fixture);
    const full = storyInput({ ...fixture, reviewedMessageCount: 0 }, target);
    assert.ok(full.inputTokens > target, 'fixture must expose the old mandatory-opening overflow');
    const fitted = storyInput(fixture, target), payload = JSON.parse(fitted.prompt);
    assert.ok(fitted.inputTokens <= target, `${fitted.inputTokens}/${target}`);
    assert.equal(fitted.inputTokens, storyInputTokens(fitted.prompt, STORY_SYSTEM, STORY_SCHEMA));
    assert.ok(payload.coverage.omitted_reviewed_messages > 0);
    assert.deepEqual(payload.source_reference, reference);
    assert.deepEqual(payload.previous_plan, state.workingPlan);
    assert.deepEqual(fitted.evidenceMessages.filter(m => m.index >= 411), messages.slice(-2));
    assert.ok(fitted.evidenceMessages.at(-1).content.includes('<status>'));
    assert.deepEqual(fixture, before, 'fitting cannot alter saved state or source');
});

test('reviewed omissions need explicit coverage; latest exchange and unreviewed choices are never candidates', () => {
    const payload = { source_reference: reference, accepted_messages: messages,
        external_evidence: [{ content: 'Optional recall.' }], coverage: { reviewed_before: 411, reviewed_context_optional: true } };
    const candidates = [...optionalPlannerContexts(payload)];
    assert.equal(candidates[0].external_evidence, undefined);
    assert.deepEqual(candidates[0].accepted_messages, messages);
    assert.deepEqual(candidates.at(-1).accepted_messages, messages.slice(-2));
    for (const coverage of [{}, { reviewed_before: 411 }, { reviewed_before: 0, reviewed_context_optional: true }]) {
        const values = [...optionalPlannerContexts({ ...payload, external_evidence: undefined, coverage })];
        assert.deepEqual(values, []);
    }
    const reviewed = [...optionalPlannerContexts({ ...payload, coverage: { ...payload.coverage, reviewed_before: 413 } })];
    assert.deepEqual(reviewed.at(-1).accepted_messages, messages.slice(-2), 'manual replan still sees latest exchange');
});

test('optional prior story map yields before evidence or reviewed play when fitting', () => {
    const payload = { source_reference: reference, previous_plan: { direction: 'Protected plan.' },
        prior_story_map: { storyScope: 'Places beyond this scene.', independentSource: 'Townspeople plan a fair.' },
        accepted_messages: messages, external_evidence: [{ content: 'Optional recall.' }],
        coverage: { reviewed_before: 411, reviewed_context_optional: true } };
    const candidates = [...optionalPlannerContexts(payload)];
    assert.equal(candidates[0].prior_story_map, undefined);
    assert.ok(candidates[0].external_evidence);
    assert.deepEqual(candidates[0].accepted_messages, messages);
    assert.deepEqual(candidates[0].source_reference, reference);
    assert.deepEqual(candidates[0].previous_plan, payload.previous_plan);
    assert.equal(candidates[0].coverage.omitted_prior_story_map, true);
    assert.equal(candidates[1].external_evidence, undefined);
    const measure = value => JSON.stringify(value).length;
    const fitted = fitPlannerContext(payload, measure, measure(payload) - 10);
    assert.equal(fitted.prior_story_map, undefined);
    assert.deepEqual(fitted.source_reference, reference);
    assert.deepEqual(fitted.previous_plan, payload.previous_plan);
    assert.deepEqual(fitted.accepted_messages, messages);
});

test('explicitly protected orientation messages survive all optional context fitting', () => {
    const payload = { accepted_messages: messages, coverage: { reviewed_before: 411,
        reviewed_context_optional: true, protected_message_indices: [0, 1] } };
    const candidates = [...optionalPlannerContexts(payload)];
    assert.deepEqual(candidates.at(-1).accepted_messages.map(m => m.index), [0, 1, 411, 412]);
    assert.deepEqual(payload.accepted_messages, messages);
});

test('active tokenizer refits optional context against the actual outgoing envelope', async () => {
    const prepared = storyInput(args), payload = JSON.parse(prepared.prompt);
    let measurements = 0;
    const fitted = await fitStoryInputBudget(prepared.prompt, STORY_SYSTEM, STORY_SCHEMA, 10000, async envelope => {
        measurements++;
        const sent = JSON.parse(JSON.parse(envelope).find(m => m.role === 'user').content);
        return sent.accepted_messages.some(m => m.index < 411) ? 10500 : 9300;
    }, { softTarget: true });
    assert.ok(measurements > 1);
    assert.equal(fitted.tokens, 9364);
    assert.equal(fitted.overTarget, 0);
    const sent = JSON.parse(fitted.prompt);
    assert.deepEqual(sent.accepted_messages.map(m => m.index), [411, 412]);
    assert.deepEqual(sent.source_reference, payload.source_reference);
    assert.deepEqual(sent.previous_plan, payload.previous_plan);
});

test('irreducible protected input remains whole and its over-target size is reported honestly', async () => {
    const prepared = storyInput({ ...args, reviewedMessageCount: 0 }, 4000);
    const fitted = await fitStoryInputBudget(prepared.prompt, STORY_SYSTEM, STORY_SCHEMA, 4000, undefined, { softTarget: true });
    assert.ok(fitted.tokens > 4000);
    assert.equal(fitted.overTarget, fitted.tokens - 4000);
    assert.deepEqual(JSON.parse(fitted.prompt).accepted_messages.map(m => m.index), messages.map(m => m.index));
    assert.deepEqual(JSON.parse(fitted.prompt).source_reference, reference);
});
