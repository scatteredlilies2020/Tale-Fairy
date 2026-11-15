import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkPlannerContext, readingSources, READING_SCHEMA, READING_SYSTEM } from '../extension/planner-chunks.js';
import { storyInputTokens } from '../extension/story-budget.js';
import { DIRECTOR_SCHEMA, DIRECTOR_SYSTEM } from '../extension/story-director.js';
import { FUTURE_SCHEMA, FUTURE_SYSTEM } from '../extension/future-planner.js';

const source = () => ({
    source_reference: { character: { description: 'Royal history. '.repeat(14000) + 'LAST CHARACTER DETAIL' },
        worldBooks: [{ lore: 'Trade rules. '.repeat(4000) + 'LAST LORE DETAIL' }],
        authorInstructions: ['Keep every signed value from -10 through +10 available.'] },
    story_summary: { provider: 'continuity-memory', text: 'Accepted history. '.repeat(10000) + 'LAST HISTORY DETAIL' },
    explicit_instruction: 'Keep the princess in the capital.',
    accepted_messages: [{ index: 7, role: 'user', spans: [{ id: '7:0', text: 'I decline the coronation.' }] }],
    previous_preparation: { nodes: [{ id: 'r1-accession', effects: ['Royal pressure +2'] }] },
});
const schema = { name: 'test_planner', value: { type: 'object' } };
const notes = text => ({ text: JSON.stringify({ notes: text }), finishReason: 'stop' });
const settings = { system: 'Plan from the supplied context.', schema, contextLimit: 4096, outputTokens: 1000 };

test('fitting context keeps identical bytes and buys no reading request', async () => {
    const prompt = JSON.stringify({ accepted_messages: ['Hello'], story_summary: { text: 'Short history' } });
    assert.equal(await chunkPlannerContext({ ...settings, prompt, generate: () => assert.fail('Unexpected paid reading') }), prompt);
});

test('source selection keeps all protected fields and never mutates stored inputs', () => {
    const input = source(), before = structuredClone(input);
    const { fixed, sources } = readingSources(input);
    assert.deepEqual(input, before);
    assert.deepEqual(fixed.source_reference, { authorInstructions: input.source_reference.authorInstructions });
    assert.deepEqual(fixed.accepted_messages, input.accepted_messages);
    assert.deepEqual(fixed.previous_preparation, input.previous_preparation);
    assert.equal(fixed.explicit_instruction, input.explicit_instruction);
    assert.equal(sources.length, 3);
});

for (const [name, contract, system] of [['current', DIRECTOR_SCHEMA, DIRECTOR_SYSTEM], ['future', FUTURE_SCHEMA, FUTURE_SYSTEM]]) {
    test(`${name} planner reads every oversized source byte in bounded, maximally filled calls`, async () => {
        const input = source(), original = JSON.stringify(input), fragments = [], calls = [];
        assert.ok(storyInputTokens(original, system, contract) > 64225);
        const result = JSON.parse(await chunkPlannerContext({ prompt: original, system, schema: contract, contextLimit: 32768, outputTokens: 3000,
            generate: async (prompt, readingSystem, readingSchema, options) => {
                assert.equal(readingSystem, READING_SYSTEM);
                assert.equal(readingSchema.name, READING_SCHEMA.name);
                const tokens = storyInputTokens(prompt, readingSystem, readingSchema);
                assert.ok(tokens + options.responseTokens + 512 <= 32768);
                calls.push(tokens);
                fragments.push(...JSON.parse(prompt).fragments);
                return notes('Source-labelled history and lore; proposals are not accepted events.');
            } }));
        assert.ok(calls.length >= 3);
        // All but the final reading fill the usable window, not small fixed chunks.
        for (const tokens of calls.slice(0, -1)) assert.ok(tokens > 32768 - 2048 - 512 - 32, String(tokens));
        for (const document of readingSources(input).sources) {
            let offset = 0, reconstructed = '';
            for (const fragment of fragments.filter(f => f.source === document.source)) {
                assert.equal(fragment.offset, offset);
                reconstructed += fragment.text; offset += fragment.text.length;
            }
            assert.equal(reconstructed, document.text);
        }
        assert.ok(storyInputTokens(JSON.stringify(result), system, contract) + 3000 + 512 <= 32768);
        assert.deepEqual(result.accepted_messages, input.accepted_messages);
        assert.deepEqual(result.previous_preparation, input.previous_preparation);
        assert.deepEqual(result.source_reference.authorInstructions, input.source_reference.authorInstructions);
        assert.equal(result.explicit_instruction, input.explicit_instruction);
        assert.match(result.context_reading.provenance, /lossy/);
        assert.equal(JSON.stringify(input), original);
    });
}

test('reading notes consolidate recursively when all first-pass notes cannot fit the final call', async () => {
    let consolidations = 0, calls = 0;
    const result = await chunkPlannerContext({ ...settings, prompt: JSON.stringify({ story_summary: { text: 'History. '.repeat(16000) } }),
        generate: async (prompt, system, contract, { responseTokens }) => {
            calls++;
            assert.ok(storyInputTokens(prompt, system, contract) + responseTokens + 512 <= settings.contextLimit);
            if (JSON.parse(prompt).fragments.some(f => f.source.startsWith('Background reading'))) consolidations++;
            return notes('History remains separate from provisional proposals. '.repeat(15));
        } });
    assert.ok(consolidations > 0);
    assert.ok(calls > consolidations);
    assert.ok(storyInputTokens(result, settings.system, schema) + 1000 + 512 <= settings.contextLimit);
});

test('oversized protected instructions/messages/saved plans stop before any reading request', async () => {
    for (const field of ['explicit_instruction', 'accepted_messages', 'previous_preparation']) {
        await assert.rejects(chunkPlannerContext({ ...settings,
            prompt: JSON.stringify({ [field]: 'Protected. '.repeat(3000), story_summary: { text: 'Background. '.repeat(3000) } }),
            generate: () => assert.fail('Protected context must be checked before paying for readings') }), /protected context.*No context-reading request sent/);
    }
});

for (const result of [notes(''), { text: '{bad JSON', finishReason: 'stop' }, { text: '{"notes":"cut"}', finishReason: 'length' },
    { text: '{"notes":"invented","plan":{}}', finishReason: 'stop' }]) {
    test(`invalid/truncated intermediate notes stop immediately (${result.text.slice(0, 24)})`, async () => {
        let calls = 0;
        await assert.rejects(chunkPlannerContext({ ...settings, prompt: JSON.stringify({ story_summary: { text: 'History. '.repeat(5000) } }),
            generate: async () => { calls++; return result; } }));
        assert.equal(calls, 1);
    });
}

test('Stop during a reading prevents every later reading and final plan', async () => {
    const controller = new AbortController();
    let calls = 0;
    await assert.rejects(chunkPlannerContext({ ...settings, signal: controller.signal,
        prompt: JSON.stringify({ story_summary: { text: 'History. '.repeat(5000) } }),
        generate: async () => { calls++; controller.abort(); return notes('Late notes'); } }), { name: 'AbortError' });
    assert.equal(calls, 1);
});

test('non-shrinking consolidation fails instead of buying an infinite loop', async () => {
    let calls = 0;
    await assert.rejects(chunkPlannerContext({ ...settings, prompt: JSON.stringify({ story_summary: { text: 'History. '.repeat(5000) } }),
        generate: async () => { calls++; return notes('Never shrinks. '.repeat(1000)); } }), /did not shrink/);
    assert.ok(calls < 100);
});

test('astral characters are never split between source fragments', async () => {
    const fragments = [];
    const prompt = JSON.stringify({ story_summary: { text: '👸🏽 '.repeat(2500) } });
    await chunkPlannerContext({ ...settings, prompt, generate: async body => {
        fragments.push(...JSON.parse(body).fragments); return notes('A princess.');
    } });
    assert.ok(fragments.length > 1);
    for (const f of fragments) {
        assert.doesNotMatch(f.text, /^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u);
    }
    assert.equal(fragments.map(f => f.text).join(''), JSON.stringify(JSON.parse(prompt).story_summary));
});
