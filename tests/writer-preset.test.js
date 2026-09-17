import test from 'node:test';
import assert from 'node:assert/strict';
import { presetSnapshot, presetWriterInput, presetWithoutPsycheField, resolvedPlannerReference, acceptedStoryEvidence, SCOPE_COMPATIBILITY } from '../scripts/writer-preset-prototype.mjs';
import { buildStoryEvidence } from '../extension/analysis.js';
test('preset snapshot uses order enablement, keeps only safe fields and reproduces depth-one role ordering', () => {
    const prompts = [
        { identifier: 'charDescription', role: 'system', content: '', injection_position: 0 },
        { identifier: 'chatHistory' },
        { identifier: 'scope', role: 'user', content: 'Scope {{user}}', injection_position: 1, injection_depth: 1, injection_order: 100, enabled: false },
        { identifier: 'stat', role: 'system', content: 'Stat', injection_position: 1, injection_depth: 1, injection_order: 100 },
    ];
    const settings = { secret: 'do not copy', oai_settings: { prompts, prompt_order: [{ character_id: 100001, order: prompts.map(p => ({ identifier: p.identifier, enabled: true })) }] } };
    const preset = presetSnapshot(settings), before = JSON.stringify(preset);
    const built = presetWriterInput({ preset, reference: { description: 'Card' }, history: {}, messages: [{ role: 'assistant', content: 'Past' }, { role: 'user', content: 'Now' }] });
    assert.deepEqual(built.slice(1).map(m => [m.role, m.content]), [['system', 'Card'], ['assistant', 'Past'], ['user', 'Scope Elizabeth'], ['system', 'Stat'], ['user', 'Now']]);
    assert.ok(!JSON.stringify(preset).includes('do not copy'));
    const changed = presetWriterInput({ preset, reference: {}, history: {}, messages: [{ role: 'user', content: 'Now' }], clarified: true });
    assert.equal(changed.at(-2).content, SCOPE_COMPATIBILITY);
    assert.equal(JSON.stringify(preset), before);
});

test('isolated Psyche ablation changes exactly one template line without mutating source or other fields', () => {
    const preset = { model: 'unchanged', prompts: [{ identifier: 'chatHistory' },
        { content: 'Keep all other rules.\nPsyche = drives and restraints\nCharacters = people\n', role: 'system' }] };
    const before = structuredClone(preset), result = presetWithoutPsycheField(preset);
    assert.deepEqual(preset, before);
    assert.deepEqual(result, { model: 'unchanged', prompts: [{ identifier: 'chatHistory' },
        { content: 'Keep all other rules.\nCharacters = people\n', role: 'system' }] });
    assert.throws(() => presetWithoutPsycheField(result), /exactly one/);
    assert.throws(() => presetWithoutPsycheField({ prompts: [{ content: 'Psyche = first\nPsyche = second' }] }), /exactly one/);
});

test('planner name projection preserves source, expands names literally once and invents no other macro values', () => {
    const reference = { persona: 'User is {{USER}}: omniscient.', description: '{{char}} sees {{user}}.',
        scenario: 'Keep {{time}} visible.', cardSystemReference: '{{Char}}', extra: ['{{user}}'] };
    const before = structuredClone(reference);
    const result = resolvedPlannerReference(reference, { userName: '$&{{char}}', characterName: 'Storyteller' });
    assert.deepEqual(reference, before);
    assert.deepEqual(result, { persona: 'User is $&{{char}}: omniscient.', description: 'Storyteller sees $&{{char}}.',
        scenario: 'Keep {{time}} visible.', cardSystemReference: 'Storyteller', extra: ['{{user}}'] });
    assert.throws(() => resolvedPlannerReference(reference, { userName: 'Neri' }), /explicit frozen names/);
});

test('evaluation history matches production extraction for the current prefix without leaking later messages', () => {
    const names = { userName: 'Neri', characterName: 'Storyteller' };
    const messages = [{ index: 0, role: 'assistant', content: 'The company arrives.' },
        { index: 1, role: 'user', content: 'I decline the old contract and leave.' },
        { index: 2, role: 'assistant', content: 'The performance finishes and everyone packs.' }];
    const before = structuredClone(messages);
    const result = acceptedStoryEvidence(messages, names);
    assert.deepEqual(result, buildStoryEvidence(messages.map(m => ({ mes: m.content,
        is_user: m.role === 'user', name: m.role === 'user' ? 'Neri' : 'Storyteller' }))));
    assert.equal(result.messageCount, 3);
    const earlier = acceptedStoryEvidence(messages.slice(0, 1), names);
    assert.equal(earlier.messageCount, 1);
    assert.ok(!JSON.stringify(earlier).includes('performance finishes'));
    assert.deepEqual(messages, before);
    assert.throws(() => acceptedStoryEvidence(messages.slice(1), names), /complete indexed/);
    assert.throws(() => acceptedStoryEvidence([{ index: 0, role: 'system', content: 'Not transcript' }], names), /complete indexed/);
});
