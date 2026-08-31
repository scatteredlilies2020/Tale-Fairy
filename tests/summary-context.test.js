import assert from 'node:assert/strict';
import test from 'node:test';
import { collectSummarySources, compactSummarySources, summarySourceAudit, worldInfoActivationContext } from '../extension/summary-context.js';
import { estimateTokenCount } from '../extension/token-budget.js';

test('summary discovery integrates continuity, extension prompts, metadata, message memory, recaps, and World Info', async () => {
    const context = {
        extensionPrompts: {
            continuity_memory_context: { value: 'Continuity Chronicle: The embassy request remains pending.' },
            another_world_state: { value: 'World state: The northern gate is sealed.' },
            harmless_behavior_prompt: { value: 'Always answer in rhyming couplets.' },
            'living-world-guide_context': { value: 'Tale Fairy must never ingest its own generated prompt.' },
        },
        chatMetadata: {
            session_recap: { summary: 'The healer learned Mira survived.' },
            unrelated_setting: 'not summary evidence',
        },
        chat: [
            { mes: 'Ordinary turn.', extra: { memory: 'Vekk owes Nim an answer by dawn.', hidden_reasoning: 'secret chain of thought' } },
            { mes: '[Story so far]\nThe crew left the capital but kept its charter.', extra: {} },
        ],
        maxContext: 12000,
        async getWorldInfoPrompt() {
            return { worldInfoString: 'World Info: Charter law permits one appeal.' };
        },
    };
    const sources = await collectSummarySources(context, context.chat, {
        continuityContext: 'Continuity Chronicle: The embassy request remains pending.',
        ownPromptKey: 'living-world-guide_context',
        tokenBudget: 2000,
    });
    const combined = sources.map(source => `${source.label}\n${source.text}`).join('\n');
    assert.match(combined, /embassy request remains pending/);
    assert.match(combined, /northern gate is sealed/);
    assert.match(combined, /healer learned Mira survived/);
    assert.match(combined, /Vekk owes Nim an answer/);
    assert.match(combined, /crew left the capital/);
    assert.match(combined, /Charter law permits one appeal/);
    assert.doesNotMatch(combined, /rhyming couplets|never ingest its own|secret chain of thought/);
    assert.equal(sources.filter(source => /embassy request remains pending/.test(source.text)).length, 1, 'the bridge and mirrored extension prompt are deduplicated');
});

test('summary compaction is token bounded, fair across sources, and keeps both ends', () => {
    const sources = compactSummarySources([
        { label: 'Continuity', kind: 'continuity-memory', priority: 0, text: `chronicle-start ${'large memory '.repeat(1000)} chronicle-end` },
        { label: 'World state', kind: 'world-state', priority: 1, text: `world-start ${'state '.repeat(500)} world-end` },
        { label: 'Small recap', kind: 'chat-summary', priority: 2, text: 'A compact but independent route remains open.' },
    ], 500);
    assert.equal(sources.length, 3);
    assert.ok(sources.every(source => source.text.length > 0));
    assert.match(sources[2].text, /independent route remains open/);
    assert.match(sources[1].text, /world-start/);
    assert.match(sources[1].text, /world-end/);
    const audit = summarySourceAudit(sources);
    assert.equal(audit.count, 3);
    assert.ok(audit.includedTokens <= 500);
    assert.ok(estimateTokenCount(JSON.stringify(sources.map(({ label, kind, text }) => ({ label, kind, text })))) <= 600);
});

test('extreme compaction retains a highest-priority summary witness', () => {
    const sources = compactSummarySources(Array.from({ length: 30 }, (_, index) => ({
        label: `Source ${index}`,
        kind: index ? 'summary' : 'continuity-memory',
        priority: index ? 3 : 0,
        text: `source-${index} ${'evidence '.repeat(80)}`,
    })), 120, { maxSources: 24 });
    assert.ok(sources.length >= 1);
    assert.equal(sources[0].kind, 'continuity-memory');
    assert.ok(sources.reduce((sum, source) => sum + source.includedTokens, 0) <= 120);
});

test('structured world-state objects are discovered without a provider-specific schema', async () => {
    const sources = await collectSummarySources({
        chatMetadata: {
            world_state: {
                location: 'The orbital archive',
                relationships: [{ actors: ['Mira', 'Sol'], status: 'estranged allies' }],
                hidden_reasoning: 'must not leak',
            },
        },
    }, [], { tokenBudget: 500 });
    const text = sources.map(source => source.text).join('\n');
    assert.match(text, /orbital archive/);
    assert.match(text, /estranged allies/);
    assert.doesNotMatch(text, /must not leak/);
});

test('disabled Continuity integration does not re-enter through extension-prompt discovery', async () => {
    const sources = await collectSummarySources({
        extensionPrompts: { continuity_memory_context: { value: 'Continuity Chronicle: private snapshot' } },
    }, [], { includeContinuity: false, tokenBudget: 500 });
    assert.equal(sources.length, 0);
});

test('World Info activation uses a newest-first token window rather than the entire raw chat', async () => {
    const messages = Array.from({ length: 80 }, (_, index) => ({
        mes: `turn-${index} ${`evidence-${index} `.repeat(80)}`,
        extra: index === 0 ? { session_summary: 'Old summary metadata is still discovered across the complete chat.' } : {},
    }));
    const activation = worldInfoActivationContext(messages, 1000);
    assert.ok(activation.length > 0 && activation.length < messages.length);
    assert.ok(activation.reduce((sum, text) => sum + estimateTokenCount(text), 0) <= 1000);
    assert.match(activation[0], /turn-79/);
    assert.doesNotMatch(activation.join('\n'), /turn-0\b/);

    let received = [];
    const sources = await collectSummarySources({
        chat: messages,
        async getWorldInfoPrompt(chat) {
            received = chat;
            return { worldInfoString: 'World Info: A token-bounded activation still found relevant lore.' };
        },
    }, messages, { tokenBudget: 1000, worldInfoActivationTokens: 1000 });
    assert.deepEqual(received, activation);
    assert.match(sources.map(source => source.text).join('\n'), /Old summary metadata is still discovered/);
});
