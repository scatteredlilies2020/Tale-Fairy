import test from 'node:test';
import assert from 'node:assert/strict';
import { compactPlannerPayload, compactProgressPayload, compactMessagePayload } from '../extension/planner-compaction.js';
import { storyInput, STORY_SYSTEM, STORY_SCHEMA } from '../extension/story-selection.js';
import { fitStoryInputBudget, storyInputTokens } from '../extension/story-budget.js';
import { emptyCampaign, EVENT_POINTS_FORMAT } from '../extension/campaign-planner.js';
import { EVENT_PLANNING_SCOPE, STORY_MATERIAL_VERSION } from '../extension/event-planning.js';

function ledger() {
    return Object.fromEntries(Array.from({ length: 4 }, (_, subject) => [`subject_${subject}`, { episodes:
        Object.fromEntries(Array.from({ length: 8 }, (_, episode) => [`experience_${episode}`, {
            status: episode % 2 ? 'partial' : 'completed',
            source: { chatId: 'A long running story with an enduring cast', referenceHash: 'a'.repeat(64),
                messageCount: episode + 1, fingerprint: String(episode).repeat(64) },
            witnesses: [{ index: episode, role: 'user', name: 'Player', quote: `Experience ${episode}: I refuse further obligations. 條件 remains unchanged.\n"No."` },
                { index: episode, role: 'assistant', name: 'Cast', quote: `Experience ${episode}: The ceremony ended; the wider undertaking is unfinished.` }],
        }])) } ]));
}

function records(table) {
    return table.records || table.rows.map(row => Object.fromEntries(table.columns.map((key, index) => [key, row[index]])));
}
function unpack(payload) {
    const result = structuredClone(payload), progress = result.accepted_progress;
    if (progress?.encoding) {
        const sources = records(progress.sources).map(source => ({ ...progress.sources.defaults, ...source }));
        const witnesses = records(progress.witnesses);
        result.accepted_progress = {};
        for (const [subject, episodeId, status, source, refs] of progress.episodes) {
            const entry = result.accepted_progress[progress.subjects[subject]] ||= { episodes: {} };
            entry.episodes[episodeId] = { status, source: sources[source], witnesses: refs.map(ref => witnesses[ref]) };
        }
    }
    if (result.accepted_message_encoding) {
        result.accepted_messages = result.accepted_messages.map(message => ({ ...message,
            spans: message.spans.map(([span, text]) => ({ span, text })) }));
        delete result.accepted_message_encoding;
    }
    return result;
}
const measure = value => storyInputTokens(JSON.stringify(value), STORY_SYSTEM, STORY_SCHEMA);

test('ledger compaction round-trips every episode, status, provenance field and exact witness', () => {
    const payload = { accepted_progress: ledger(), previous_preparation: { campaign: 'Keep all private aims.' } };
    const before = structuredClone(payload);
    const compact = compactProgressPayload(payload);
    assert.deepEqual(unpack(compact), payload);
    assert.deepEqual(payload, before);
    assert.equal(compact.accepted_progress.episodes.length, 32);
    assert.equal(compact.accepted_progress.witnesses.rows.length, 16, 'same-index differing quotes remain distinct');
    assert.equal(compact.accepted_progress.sources.rows.length, 8, 'different source fingerprints remain distinct');
    assert.ok(measure(compact) < measure(payload) - 1500);
    assert.deepEqual(compactProgressPayload(compact), compact, 'idempotent');
});

test('unknown ledger fields and heterogeneous witness records remain intact', () => {
    const progress = ledger();
    progress.subject_0.episodes.experience_0.futureField = 'Do not discard me.';
    const payload = { accepted_progress: progress };
    assert.equal(compactProgressPayload(payload), payload);
    delete progress.subject_0.episodes.experience_0.futureField;
    progress.subject_0.episodes.experience_0.witnesses[0].futureField = 'Keep witness provenance.';
    assert.deepEqual(unpack(compactProgressPayload(payload)), payload);
    assert.equal(compactPlannerPayload(payload, measure, measure(payload)), payload);
});

test('message compaction preserves exact text, span numbers, speakers and explicit omissions', () => {
    const payload = { accepted_messages: [{ index: 37, role: 'user', name: 'Player', omitted: 'Earlier panel.', spans: [
        { span: 0, text: 'Only if invited, I may join.\n🧑🏽‍🎤 "No agreement yet."' },
        { span: 4, text: '<span>Conditions and whitespace remain exact.  </span>' },
    ] }] };
    const compact = compactMessagePayload(payload);
    assert.deepEqual(unpack(compact), payload);
    assert.deepEqual(compactMessagePayload(compact), compact);
    payload.accepted_messages[0].spans[0].futureField = true;
    assert.equal(compactMessagePayload(payload), payload);
    for (const spans of [[null], [{ text: 'Missing address.' }], [[0, 'Already compacted.']]]) {
        const unknown = { accepted_messages: [{ index: 0, spans }] };
        assert.equal(compactMessagePayload(unknown), unknown);
    }
});

function inputArgs() {
    return { state: { ...emptyCampaign(), preparationFormat: EVENT_POINTS_FORMAT, planningScope: EVENT_PLANNING_SCOPE,
        storyMaterialVersion: STORY_MATERIAL_VERSION, realization: Object.fromEntries(Object.entries(ledger())
            .map(([id, entry]) => [id, { ...entry, playable: [] }])) },
    reference: { persona: 'The player chooses participation. No invitation has been accepted.' },
    historical: { openThreads: [{ index: 0, role: 'user', content: 'The old undertaking is unfinished.' }] },
    messages: [{ index: 9, role: 'user', content: 'I keep my freedom to decline.' }] };
}

test('overflow fits before history shedding and leaves storage and evidence validation inputs unchanged', () => {
    const args = inputArgs(), before = structuredClone(args);
    const full = storyInput(args, 100000);
    const limit = full.inputTokens - 1500;
    const fitted = storyInput(args, limit);
    assert.ok(fitted.inputTokens <= limit);
    assert.equal(fitted.inputTokens, measure(JSON.parse(fitted.prompt)));
    assert.deepEqual(unpack(JSON.parse(fitted.prompt)), JSON.parse(full.prompt));
    assert.deepEqual(fitted.verifiedProgress, full.verifiedProgress);
    assert.deepEqual(fitted.evidenceMessages, args.messages);
    assert.deepEqual(args, before);
    assert.throws(() => storyInput(args, 100), /no provider request sent/);
});

test('preflight refits when the active tokenizer counts more than local admission', async () => {
    const full = storyInput(inputArgs(), 100000);
    const limit = full.inputTokens;
    const counter = envelope => {
        const payload = JSON.parse(JSON.parse(envelope)[1].content);
        return measure(payload) + 1000;
    };
    const fitted = await fitStoryInputBudget(full.prompt, STORY_SYSTEM, STORY_SCHEMA, limit, counter);
    assert.ok(fitted.tokens <= limit);
    assert.deepEqual(unpack(JSON.parse(fitted.prompt)), JSON.parse(full.prompt));
    await assert.rejects(fitStoryInputBudget(full.prompt, STORY_SYSTEM, STORY_SCHEMA, limit, async () => limit + 1), /no provider request sent/);
    for (const unavailable of [undefined, async () => NaN, async () => { throw Error('offline'); }]) {
        const guarded = await fitStoryInputBudget(full.prompt, STORY_SYSTEM, STORY_SCHEMA, limit - 1500, unavailable);
        assert.ok(guarded.tokens <= limit - 1500);
    }
});
