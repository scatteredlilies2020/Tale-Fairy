import test from 'node:test';
import assert from 'node:assert/strict';
import { compactPlannerReference, compactPlannerHistory } from '../extension/planner-reference.js';
import { storyInput, STORY_SYSTEM, STORY_SCHEMA } from '../extension/story-selection.js';
import { emptyCampaign } from '../extension/campaign-planner.js';
import { estimateTokenCount } from '../extension/token-budget.js';

test('planner projection preserves complete lore and source identity without import/editor duplication', () => {
    const reference = { persona: 'My character controls the bridge.', worldBooks: [{ name: 'Canon', data: {
        name: 'Canon', originalData: { entries: [{ content: 'OUTDATED imported lore' }] },
        entries: { 3: { uid: 3, key: ['Bridge'], keysecondary: ['river'], comment: 'Ownership',
            content: 'The bridge is privately owned.\nA toll is optional.', constant: true, disable: false,
            position: 4, extensions: { display_index: 8, depth: 4, probability: 100 } },
        4: { uid: 4, content: 'Disabled, superseded fact.', disable: true } },
    } }] };
    const original = structuredClone(reference);
    const result = compactPlannerReference(reference);
    assert.deepEqual(result.worldBooks[0], { name: 'Canon', data: { name: 'Canon', entries: [{
        id: 3, keys: ['Bridge'], secondary_keys: ['river'], title: 'Ownership', constant: true,
        content: reference.worldBooks[0].data.entries[3].content,
    }] } });
    assert.equal(result.persona, reference.persona);
    assert.deepEqual(reference, original);
    assert.deepEqual(compactPlannerReference(result), result, 'projection is idempotent');
});

test('array lorebooks retain enabled content; unknown source formats pass through intact', () => {
    const custom = { name: 'Custom', data: { entries: { mechanics: { rule: 'No tolls.' } }, originalData: 'Only source' } };
    const reference = { worldBooks: [custom, { name: 'Imported', data: { entries: [
        { id: 7, keys: ['River'], secondary_keys: ['boat'], name: 'Routes', content: 'Boat travel is possible.', enabled: true },
        { content: 'Disabled source.', enabled: false },
    ] } }] };
    const result = compactPlannerReference(reference);
    assert.deepEqual(result.worldBooks[0], custom);
    assert.deepEqual(result.worldBooks[1].data.entries, [{ id: 7, keys: ['River'], secondary_keys: ['boat'], title: 'Routes', content: 'Boat travel is possible.' }]);
});

test('historical deduplication preserves absent, modified and omitted-panel evidence', () => {
    const historical = { messageCount: 10, timeline: [{ range: [0, 9], excerpts: [
        { index: 0, role: 'assistant', content: 'The bridge is open.' },
        { index: 2, role: 'assistant', content: 'The former owner died.' },
        { index: 4, role: 'assistant', content: 'Time = noon' },
        { index: 6, role: 'user', content: 'I refuse.' },
    ] }], openThreads: [{ index: 8, role: 'user', content: 'I keep the boat.' }] };
    const original = structuredClone(historical);
    const result = compactPlannerHistory(historical, [
        { index: 0, role: 'assistant', content: 'The bridge\n is open. Boats pass below.' },
        { index: 4, role: 'assistant', content: 'Narrative without its old generated panel.' },
        { index: 6, role: 'user', content: 'I accept.' },
        { index: 8, role: 'user', content: 'I keep the boat.' },
    ]);
    assert.deepEqual(result.timeline[0].excerpts.map(e => e.index), [2, 4, 6]);
    assert.deepEqual(result.openThreads, []);
    assert.deepEqual(historical, original);
});

test('large import metadata fits the actual story protocol without deleting lore or player text', () => {
    const entries = Object.fromEntries(Array.from({ length: 37 }, (_, uid) => [uid, {
        uid, key: ['Harbor'], content: `District ${uid}: ` + 'Boats and homes remain available. '.repeat(8),
        extensions: { editorOnly: 'unused setting '.repeat(300) },
    }]));
    const reference = { worldBooks: [{ name: 'City', data: { entries, originalData: { entries } } }] };
    const messages = [{ index: 0, role: 'user', content: 'I refuse the offer and stay at the harbor.' }];
    assert.ok(estimateTokenCount(JSON.stringify(reference)) > 30000);
    const input = storyInput({ reference, state: emptyCampaign(), messages }, 16000);
    const payload = JSON.parse(input.prompt);
    assert.ok(input.inputTokens <= 16000);
    assert.deepEqual(payload.source_reference.worldBooks[0].data.entries.map(e => e.content), Object.values(entries).map(e => e.content));
    assert.equal(payload.accepted_messages[0].spans[0].text, messages[0].content);
    assert.equal(input.inputTokens, estimateTokenCount(STORY_SYSTEM + JSON.stringify(STORY_SCHEMA) + input.prompt));
});

test('genuinely oversized lore fails with section costs instead of silently truncating canon', () => {
    const reference = { worldBooks: [{ name: 'Canon', data: { entries: { 0: {
        content: 'Every one of these words is lore. '.repeat(4000),
    } } } }] };
    assert.throws(() => storyInput({ reference, state: emptyCampaign(), messages: [] }, 16000),
        /Planner input \d+ exceeds 16000 tokens \(lore\/card \d+; messages \d+\)/);
});
