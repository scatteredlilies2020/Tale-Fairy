import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivatedStoryContext, readHostStoryEvidence } from '../extension/rp-context.js';
import { fitEvidenceProviders } from '../extension/evidence-providers.js';

const context = () => ({ getCurrentChatId: () => 'rp', characterId: 1,
    chat: [{ is_user: true, mes: 'We stop for the night.' }], chatMetadata: {}, extensionPrompts: {} });

test('reads exposed summaries without invoking lore activation, extraction or private stores', () => {
    const c = context();
    c.getWorldInfoPrompt = () => { throw Error('Must not activate lore'); };
    c.extensionPrompts = { summary: { value: 'A prior journey ended.' }, style: { value: 'Write ornate prose.' },
        mystery: { value: 'Summary: the bridge closed.' }, continuity_memory: { value: 'Unverified CM mirror.' },
        living_world_guide_context: { value: 'TF OLD PLAN' }, summary_reasoning: { value: 'PRIVATE THOUGHT' },
        summary_secret: { value: 'SECRET' }, story_summary_style: { value: 'Summary: STYLE PRESET' },
        summary_mood: { value: 'MOOD PRESET' }, other: { value: '<tale-fairy-context>OLD PLAN</tale-fairy-context>' } };
    c.chatMetadata = { recap: 'The party split.', privateStore: { summary: 'UNEXPOSED' },
        summary: { status: 'stale', text: 'STALE' }, taleFairyGenerationContext: { summary: 'TF CACHE' } };
    c.chat[0].extra = { summary: 'The traveler chose rest.', reasoning_summary: 'HIDDEN' };
    const before = structuredClone({ prompts: c.extensionPrompts, metadata: c.chatMetadata, chat: c.chat });
    const evidence = readHostStoryEvidence(c);
    assert.equal(evidence.status, 'context');
    assert.equal(evidence.confidence, 'lower-confidence-context');
    assert.equal(evidence.records.length, 4);
    assert.doesNotMatch(JSON.stringify(evidence), /ornate|Unverified|OLD PLAN|PRIVATE|SECRET|UNEXPOSED|STALE|TF CACHE|HIDDEN|PRESET/);
    assert.deepEqual({ prompts: c.extensionPrompts, metadata: c.chatMetadata, chat: c.chat }, before);
});

test('host context removes TF blocks and exact duplicates, without merging similar claims', () => {
    const c = context();
    c.extensionPrompts = { summary: { value: 'The bridge is open.<tale-fairy-context>OLD PLOT</tale-fairy-context>' } };
    c.chatMetadata = { recap: 'The bridge is open.', summary: 'The bridge may open.' };
    assert.deepEqual(readHostStoryEvidence(c).records.map(r => r.text), ['The bridge is open.', 'The bridge may open.']);
    assert.deepEqual(readHostStoryEvidence(c, { exclude: ['The bridge is open.'] }).records.map(r => r.text), ['The bridge may open.']);
});

test('activated lore stays branch-bound and lasts only through the resulting reply', () => {
    const activated = new ActivatedStoryContext(), c = context();
    activated.capture(c, [{ content: 'The inn is open.' }, { disable: true, content: 'DISABLED' }]);
    assert.equal(activated.read(c).length, 1);
    c.chat.push({ is_user: false, mes: 'The innkeeper has a spare room.' });
    assert.equal(activated.read(c).length, 1);
    c.chat.push({ is_user: true, mes: 'We leave town.' });
    assert.deepEqual(activated.read(c), []);
    c.chat.splice(1);
    c.chat[0].mes = 'A different branch.';
    assert.deepEqual(activated.read(c), []);
    activated.capture(c, [{ content: 'NEW' }]);
    c.characterId = 2;
    assert.deepEqual(activated.read(c), []);
    c.characterId = 1;
    c.getCurrentChatId = () => 'other';
    assert.deepEqual(activated.read(c), []);
    activated.clear();
    assert.equal(activated.snapshot, null);
});

test('rolling message summaries use the latest exposed text per key rather than old versions', () => {
    const c = context();
    c.chat[0].extra = { summary: 'OLD SUMMARY', reasoning_summary: 'PRIVATE' };
    c.chat.push({ mes: 'A reply.', extra: { summary: 'LATEST SUMMARY', travel_recap: 'The journey ended.' } });
    assert.deepEqual(readHostStoryEvidence(c).records.map(r => r.text), ['LATEST SUMMARY', 'The journey ended.']);
});

test('optional evidence shares a budget, omits whole oversized sources and deduplicates exact text', () => {
    const c = context();
    c.extensionPrompts = { summary: { value: 'The bridge is open.' }, lore: { value: 'UNUSED '.repeat(10000) } };
    const cm = { provider: 'continuity-memory', status: 'current', summary: 'The bridge is open.', records: [] };
    const evidence = fitEvidenceProviders([cm, readHostStoryEvidence(c)], 500, () => true);
    assert.equal(JSON.stringify(evidence).split('The bridge is open.').length, 2);
    assert.doesNotMatch(JSON.stringify(evidence), /UNUSED/);
    assert.deepEqual(fitEvidenceProviders([cm], 0, () => true), []);
    assert.deepEqual(fitEvidenceProviders([cm], 500, () => false), []);
});
