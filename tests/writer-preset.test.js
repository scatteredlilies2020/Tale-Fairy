import test from 'node:test';
import assert from 'node:assert/strict';
import { presetSnapshot, presetWriterInput, SCOPE_COMPATIBILITY } from '../scripts/writer-preset-prototype.mjs';
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
