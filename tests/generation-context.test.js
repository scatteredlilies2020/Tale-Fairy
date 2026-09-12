import test from 'node:test';
import assert from 'node:assert/strict';
import { generationHarness } from './helpers/generation-harness.js';
import { buildPlotAnchor, cachedGenerationContext, GENERATION_CACHE_LIMIT, GENERATION_CONTEXT_KEY, generationContextEntries, plotCardInputs, plotInputKey, plotWorldNames, REPLACEMENT_PENDING_KEY } from '../extension/generation-context.js';
import { buildPromptPayload, defaultState, fingerprintMessages, saveState } from '../extension/state.js';
import { createSafetyFallbackState } from '../extension/fallback-direction.js';

const input = () => [{ is_user: false, name: 'Mira', mes: 'Mira guards the sealed letter. She promised not to deliver it until dawn.' }, { is_user: true, mes: 'I ask Mira who sent the letter.' }];

for (const type of ['swipe', 'regenerate']) test(`${type} reuses exact pre-reply context across host events, stops, and repeated attempts`, async () => {
    const h = generationHarness(input());
    const original = h.prepare('normal').payload;
    h.context.chat.push({ is_user: false, mes: 'Discarded: the letter bursts into flame.' });
    for (let attempt = 0; attempt < 3; attempt++) {
        if (type === 'swipe') await h.emit('MESSAGE_SWIPED', h.context.chat.length - 1);
        await h.emit('GENERATION_STARTED', type);
        if (type === 'regenerate') {
            h.context.chat.pop();
            await h.emit('MESSAGE_DELETED');
        }
        assert.equal(h.prepare(type).payload, original);
        assert.equal(h.scope.generationGuideSelection.reused, true);
        if (type === 'swipe') h.context.chat.pop();
        h.context.chat.push({ is_user: false, mes: `Replacement ${attempt} invents a dragon.` });
        await h.emit('MESSAGE_SWIPED');
        await h.emit('MESSAGE_UPDATED');
        await h.emit('MESSAGE_RECEIVED');
        await h.emit('GENERATION_STOPPED');
        await h.emit('GENERATION_ENDED');
        await h.flush();
        assert.equal(h.calls.length, 0);
        assert.equal(h.state().plannerSchedule.turnsSinceFullReview, 0);
        assert.doesNotMatch(h.prepare(type).payload, /bursts into flame|dragon/);
    }
    // The next real input resumes ahead-of-time planning from the selected reply.
    h.context.chat.push({ is_user: true, mes: 'I ask about that dragon.' });
    await h.emit('MESSAGE_SENT');
    assert.equal(h.calls.length, 1);
    assert.match(h.calls[0].messages.at(-2).mes, /Replacement 2/);
    assert.equal(h.context.chatMetadata[REPLACEMENT_PENDING_KEY], null);
});

test('ordinary accepted replies still plan ahead; dry-run generation does not cancel work', async () => {
    const h = generationHarness(input());
    h.prepare();
    const revision = h.scope.analysisStopSequence;
    await h.emit('GENERATION_STARTED', 'regenerate', {}, true);
    assert.equal(h.scope.analysisStopSequence, revision);
    h.context.chat.push({ is_user: false, mes: 'Mira points to the seal.' });
    await h.emit('MESSAGE_RECEIVED');
    assert.equal(h.calls.length, 1);
});

test('Continue releases replacement deferral, without rebuilding', async () => {
    const h = generationHarness(input());
    h.prepare();
    h.context.chat.push({ is_user: false, mes: 'Mira pauses.' });
    await h.emit('GENERATION_STARTED', 'regenerate');
    await h.emit('GENERATION_STARTED', 'continue');
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].rebuild, false);
});

test('history survives reload and deletion back to an earlier input without reevaluation', async () => {
    const h = generationHarness(input());
    const first = h.prepare().payload;
    h.context.chat.push({ is_user: false, mes: 'Mira shows the seal.' }, { is_user: true, mes: 'I inspect the seal.' });
    const second = h.prepare().payload;
    assert.notEqual(first, second);
    const restored = generationHarness(structuredClone(h.context.chat), h.state(), JSON.parse(JSON.stringify(h.context.chatMetadata)));
    restored.context.chat.splice(2);
    await restored.emit('MESSAGE_DELETED');
    await restored.emit('GENERATION_STARTED', 'normal');
    assert.equal(restored.prepare().payload, first);
    await restored.flush();
    assert.equal(restored.calls.length, 0);
    assert.equal(generationContextEntries(restored.context.chatMetadata[GENERATION_CONTEXT_KEY]).length, 2);
});

test('cache is bounded, isolated by chat, and changes with story/card/lore/author inputs', async () => {
    const h = generationHarness(input());
    for (let i = 0; i < GENERATION_CACHE_LIMIT + 4; i++) {
        h.context.chat.at(-1).mes = `I ask Mira about letter ${i}.`;
        h.prepare();
    }
    assert.equal(generationContextEntries(h.context.chatMetadata[GENERATION_CONTEXT_KEY]).length, GENERATION_CACHE_LIMIT);
    const packet = generationContextEntries(h.context.chatMetadata[GENERATION_CONTEXT_KEY]).at(-1);
    assert.equal(cachedGenerationContext(h.context.chatMetadata[GENERATION_CONTEXT_KEY], packet.inputKey, 'other'), null);
    for (const change of [
        () => { h.context.chat[0].mes = 'The letter is now open.'; },
        () => { h.context.card = { scenario: 'The letter has been destroyed.' }; },
        () => { h.context.chatMetadata.note_prompt = 'Keep the letter sealed.'; },
        async () => { h.scope.selected_world_info = ['Active lore']; h.scope.worldInfoCache.set('Active lore', { entries: {} }); await h.emit('WORLDINFO_UPDATED'); },
    ]) {
        await change();
        assert.notEqual(h.prepare().reused, true);
        assert.equal(h.prepare().reused, true);
    }
    assert.equal(plotInputKey('story', input(), { a: 1, b: 2 }), plotInputKey('story', input(), { b: 2, a: 1 }));
});

test('late planner saves cannot overwrite packet history and discarded actor facts never leak', () => {
    const h = generationHarness(input());
    const original = h.prepare().payload;
    h.context.chat.push({ is_user: false, mes: 'Discarded: Mira burns the letter.' });
    const late = defaultState();
    late.scene.status = 'Mira burns the letter.';
    late.entities = [{ name: 'Mira', motivation: 'Destroy all letters.' }];
    late.lastAnalysisFingerprint = fingerprintMessages(h.context.chat);
    late.sourceMessageCount = h.context.chat.length;
    h.context.updateChatMetadata(saveState(h.context.chatMetadata, late));
    assert.equal(h.prepare('regenerate').payload, original);
    // With no cache, fail safely to the same accepted source, not the late plan.
    delete h.context.chatMetadata[GENERATION_CONTEXT_KEY];
    const fallback = h.prepare('swipe').payload;
    assert.match(fallback, /who sent the letter/);
    assert.doesNotMatch(fallback, /burns the letter|Destroy all letters/);
});

test('retry restores pre-reply planner memory rather than inheriting discarded future facts', async () => {
    const initial = createSafetyFallbackState(defaultState(), {
        messages: input(), chatId: 'story', fingerprint: fingerprintMessages(input()),
    });
    initial.contextLedger = 'Mira still guards the sealed letter.';
    const h = generationHarness(input(), initial);
    h.prepare();
    h.context.chat.push({ is_user: false, mes: 'Discarded: Mira burns the letter.' });
    const future = createSafetyFallbackState(h.state(), {
        messages: h.context.chat, chatId: 'story', fingerprint: fingerprintMessages(h.context.chat),
    });
    future.contextLedger = 'The letter has burned.';
    h.context.updateChatMetadata(saveState(h.context.chatMetadata, future));
    await h.emit('GENERATION_STARTED', 'regenerate');
    assert.equal(h.state().contextLedger, initial.contextLedger);
    assert.equal(h.calls.length, 0);
    // An old chat without snapshots must also drop post-reply planner memory.
    delete h.context.chatMetadata[GENERATION_CONTEXT_KEY];
    h.context.updateChatMetadata(saveState(h.context.chatMetadata, future));
    await h.emit('GENERATION_STARTED', 'swipe');
    assert.equal(h.state().contextLedger, '');
    assert.doesNotMatch(h.prepare('swipe').payload, /has burned|burns the letter/);
});

test('changed character inputs with the same transcript cannot reuse prior actor memory', () => {
    const state = createSafetyFallbackState(defaultState(), {
        messages: input(), chatId: 'story', fingerprint: fingerprintMessages(input()),
    });
    state.entities = [{ name: 'Mira', motivation: 'Destroy all letters.' }];
    const h = generationHarness(input(), state);
    assert.match(h.prepare().payload, /Destroy all letters/);
    h.context.card = { scenario: 'Mira must preserve every letter.' };
    assert.doesNotMatch(h.prepare().payload, /Destroy all letters/);
});

test('plot anchor selects grounded relevant threads and actors, never irrelevant or resolved threads', () => {
    const state = defaultState();
    state.entities = [{ name: 'Mira', constraints: 'Promised to wait until dawn.' }, { name: 'Zog', motivation: 'Steal the crown.' }];
    state.continuityThreads = [
        { thread: 'Mira and the letter', state: 'Waiting for its recipient.', status: 'active', canonicalStatus: 'resolved' },
        { thread: 'Mira’s sealed letter', state: 'Sender remains unknown.', status: 'active' },
        { thread: 'The crown', state: 'Missing.', status: 'active' },
    ];
    const anchor = buildPlotAnchor(input(), { state, stateCurrent: true });
    assert.match(anchor, /Sender remains unknown/);
    assert.match(anchor, /Promised to wait until dawn/);
    assert.doesNotMatch(anchor, /crown|Waiting for its recipient/);
    assert.doesNotMatch(buildPlotAnchor(input(), { state, stateCurrent: false }), /Sender remains unknown/);
    assert.match(buildPlotAnchor([], { bootstrap: { scenario: 'A letter waits at the harbor.' } }), /letter waits at the harbor/);
    assert.match(buildPlotAnchor([]), /No plot facts/);
});

test('cached injection stays disabled for non-story calls and appears exactly once', () => {
    const h = generationHarness(input());
    const cachedPayload = h.prepare().payload;
    for (const generationType of ['quiet', 'impersonate', 'tool-analysis']) {
        assert.equal(buildPromptPayload(h.state(), { cachedPayload, generationType }), '');
    }
    assert.equal(buildPromptPayload(h.state(), { cachedPayload, enabled: false }), '');
    assert.equal(cachedPayload.match(/<plot-anchor>/gu).length, 1);
    assert.equal(cachedPayload.match(/GAME MASTER RESPONSIBILITY/gu).length, 1);
});

for (const type of ['swipe', 'regenerate']) test(`${type} tolerates surrounding whitespace and line endings through edit/update events`, async () => {
    const messages = input();
    messages[1].mes += '\nI wait for her answer.';
    const h = generationHarness(messages);
    const original = h.prepare().payload;
    h.context.chat.push({ is_user: false, mes: 'Discarded attempt.' });
    h.context.chat[1].mes = `  ${h.context.chat[1].mes.replaceAll('\n', '\r\n')}  \r\n`;
    await h.emit('MESSAGE_EDITED', 1);
    await h.emit('MESSAGE_UPDATED', 1);
    await h.flush();
    assert.equal(h.calls.length, 0);
    await h.emit('GENERATION_STARTED', type);
    if (type === 'regenerate') { h.context.chat.pop(); await h.emit('MESSAGE_DELETED'); }
    assert.equal(h.prepare(type).reused, true);
    assert.equal(h.prepare(type).payload, original);
    await h.flush();
    assert.equal(h.calls.length, 0);
});

test('same-content notifications and unrelated lore/character updates preserve the current packet', async () => {
    const h = generationHarness(input());
    h.scope.selected_world_info = ['Harbor'];
    h.scope.worldInfoCache.set('Harbor', { entries: { 1: { content: 'The harbor is closed.' } } });
    const original = h.prepare().payload;
    for (const event of ['WORLDINFO_UPDATED', 'WORLDINFO_SETTINGS_UPDATED', 'CHARACTER_EDITED', 'PERSONA_CHANGED', 'PERSONA_UPDATED']) {
        h.scope.worldInfoCache.set('Unrelated', { entries: { 1: { content: event } } });
        h.scope.world_info.charLore = [{ name: 'Other character', extraBooks: [event] }];
        await h.emit(event, 'Unrelated');
        assert.ok(h.scope.generationGuideSelection, event);
        assert.equal(h.prepare().reused, true, event);
        assert.equal(h.prepare().payload, original);
    }
    // Saving an identical relevant book also remains a hit.
    h.scope.worldInfoCache.set('Harbor', JSON.parse(JSON.stringify(h.scope.worldInfoCache.get('Harbor'))));
    await h.emit('WORLDINFO_UPDATED', 'Harbor');
    assert.equal(h.prepare().reused, true);
    // Actual available lore content and scan settings still invalidate.
    h.scope.worldInfoCache.set('Harbor', { entries: { 1: { content: 'The harbor is open.' } } });
    await h.emit('WORLDINFO_UPDATED', 'Harbor');
    assert.equal(h.scope.generationGuideSelection, null);
    assert.notEqual(h.prepare().reused, true);
    h.scope.getWorldInfoSettings = () => ({ world_info_depth: 8 });
    await h.emit('WORLDINFO_SETTINGS_UPDATED');
    assert.notEqual(h.prepare().reused, true);
});

test('lore dependencies cover global, chat, persona, character, extra and group-member books', () => {
    const context = {
        characterId: 0, characters: [
            { avatar: 'Mira.png', data: { extensions: { world: 'Mira book' } } },
            { avatar: 'Zog.png', data: { extensions: { world: 'Zog book' } } },
        ],
        chatMetadata: { world_info: 'Chat book' }, powerUserSettings: { persona_description_lorebook: 'Persona book' },
    };
    const links = { charLore: [{ name: 'Mira', extraBooks: ['Mira extra'] }, { name: 'Unrelated', extraBooks: ['Not used'] }] };
    assert.deepEqual(plotWorldNames(context, links, ['Global']), ['Chat book', 'Global', 'Mira book', 'Mira extra', 'Persona book']);
    context.groupId = 'group'; context.groups = [{ id: 'group', members: ['Mira.png', 'Zog.png'] }];
    assert.ok(plotWorldNames(context, links).includes('Zog book'));
});

test('raw cards ignore expanded macros and cosmetic metadata but detect real card/persona changes', async () => {
    const h = generationHarness(input());
    h.context.characterId = 0;
    h.context.characters = [{ name: 'Mira', avatar: 'Mira.png', description: 'At {{time}}, Mira guards the letter.', data: {} }];
    h.context.powerUserSettings = { persona_description: 'A courier.' };
    h.scope.getCharacterCardFields = () => { throw new Error('Must not expand time/random macros for the cache key'); };
    h.prepare();
    h.context.characters[0].data.character_version = 'cosmetic update';
    await h.emit('CHARACTER_EDITED');
    assert.equal(h.prepare().reused, true);
    h.context.characters[0].description = 'Mira has lost the letter.';
    await h.emit('CHARACTER_EDITED');
    assert.notEqual(h.prepare().reused, true);
    h.context.powerUserSettings.persona_description = 'The letter sender.';
    await h.emit('PERSONA_UPDATED');
    assert.notEqual(h.prepare().reused, true);
    assert.equal(plotCardInputs(h.context).persona, 'The letter sender.');
});

test('whitespace matching never ignores negation, numbers, internal spacing or paragraph changes', async () => {
    const original = [{ is_user: true, mes: 'I do not deliver letter 12.\nMira waits.' }];
    const key = plotInputKey('story', original);
    for (const mes of ['I do deliver letter 12.\nMira waits.', 'I do not deliver letter 13.\nMira waits.',
        'I do not deliver letter 12. Mira waits.', 'I do not deliver  letter 12.\nMira waits.']) {
        assert.notEqual(plotInputKey('story', [{ is_user: true, mes }]), key);
    }
    const h = generationHarness(input()); h.prepare();
    h.context.chat.push({ is_user: false, mes: 'Discarded.' });
    h.context.chat[1].mes = 'I do not ask about the letter.';
    await h.emit('MESSAGE_EDITED', 1);
    await h.flush();
    assert.equal(h.calls.length, 1);
    assert.notEqual(h.prepare('regenerate').reused, true);
});

test('referenced plot variables invalidate reuse, unrelated counters do not', () => {
    const h = generationHarness(input());
    h.context.card = { description: 'Mira carries {{getvar::letter}} for {{getglobalvar::recipient}}.' };
    h.context.chatMetadata.variables = { letter: 'sealed', unrelated: 1 };
    h.scope.extension_settings.variables = { global: { recipient: 'the captain' } };
    h.prepare();
    h.context.chatMetadata.variables.unrelated++;
    assert.equal(h.prepare().reused, true);
    h.context.chatMetadata.variables.letter = 'opened';
    assert.notEqual(h.prepare().reused, true);
    h.scope.extension_settings.variables.global.recipient = 'the mayor';
    assert.notEqual(h.prepare().reused, true);
});

test('whitespace rollback rebinds restored memory without mutating the saved snapshot', async () => {
    const state = createSafetyFallbackState(defaultState(), { messages: input(), chatId: 'story', fingerprint: fingerprintMessages(input()) });
    state.contextLedger = 'Mira guards the letter.';
    const h = generationHarness(input(), state); h.prepare();
    const packet = generationContextEntries(h.context.chatMetadata[GENERATION_CONTEXT_KEY])[0];
    const before = JSON.stringify(packet);
    h.context.chat[1].mes += '  ';
    h.context.chat.push({ is_user: false, mes: 'Discarded.' });
    await h.emit('GENERATION_STARTED', 'swipe');
    assert.equal(h.state().contextLedger, state.contextLedger);
    assert.equal(h.state().lastAnalysisFingerprint, fingerprintMessages(h.context.chat.slice(0, -1)));
    assert.equal(JSON.stringify(packet), before);
});
