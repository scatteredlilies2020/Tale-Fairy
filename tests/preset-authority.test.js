import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPromptPayload, defaultState } from '../extension/state.js';
import { ensureGuidanceInChat, ensureGuidanceInText } from '../extension/request-injection.js';
import { canRetainSuccessfulPlan, createSafetyFallbackState } from '../extension/fallback-direction.js';
import { TALE_FAIRY_CONTEXT_GUIDE, refreshGameMasterContract } from '../extension/game-master.js';
import { formatPacingPreference, PREPARATION_CONTEXT_LABEL } from '../extension/prepared-world.js';

const LEGACY_AUTHORITY = '<tale-fairy-authority>Old preset override.</tale-fairy-authority>';
const LEGACY_CONTRACT = 'GAME MASTER RESPONSIBILITY: Old policy.\nCAUSAL ROLE: Old role.\nPLAYER BOUNDARY: Old boundary.';

test('old retry framing is migrated without rewriting story quotations or notebook prose', () => {
    for (const newline of ['\n', '\r\n']) for (const mode of ['Adaptive', 'Linger', 'Natural', 'Advance']) {
        const plot = `<plot-anchor>\nA quoted document:\n${LEGACY_CONTRACT}\nPACING PREFERENCE: Linger: Quoted, not a saved preference.\nDEVELOPMENT: Subtle, within the current activity.\n<prepared-world>\nCONDITIONAL GM PREPARATION, NOT TRANSCRIPT FACTS OR A REQUIRED NEXT BEAT. Quoted.\n</prepared-world>\n</plot-anchor>`.replaceAll('\n', newline);
        const notebook = 'RP APPROACH (editable guidance, not new canon or player preferences): Keep this saved prose.\nPossible development (invented premise; prepared): The mill may reopen.\nPlayable middle: Workers seek fuel and negotiate shares.\nDEVELOPMENT: Subtle, within the current activity.\nKnowledge boundary: Only Mira has the letter.'.replaceAll('\n', newline);
        const source = [`<tale-fairy-context>\n<living-world-guide>\n${LEGACY_CONTRACT}`.replaceAll('\n', newline),
            `PACING PREFERENCE: ${mode}: Old preference. Old universal behavior rules.`, plot,
            'RELEVANT UNDERLYING CONDITIONS — causal context, not required events or predetermined outcomes. Use what fits; the writing model chooses every concrete action.',
            'Private conditions — express through behavior unless disclosure becomes natural in-world:',
            '- Mira: promised to wait until dawn. Known to: Mira; others need an in-world learning route.',
            'DEVELOPMENT: Subtle, within the current activity.',
            'SCENE FIT (provisional; latest user intent wins): Old outside-pressure rules.',
            '<prepared-world>',
            'CONDITIONAL GM PREPARATION, NOT TRANSCRIPT FACTS OR A REQUIRED NEXT BEAT. Eating, rest or silence alone do not suspend NPC activity.',
            notebook, '</prepared-world>', '</living-world-guide>', '</tale-fairy-context>',
        ].join(newline);
        const updated = refreshGameMasterContract(source);
        assert.ok(updated.includes(TALE_FAIRY_CONTEXT_GUIDE));
        assert.ok(updated.includes(plot), 'source excerpts are byte-for-byte unchanged');
        assert.ok(updated.includes(notebook), 'saved proposal prose is byte-for-byte unchanged');
        assert.ok(updated.includes(PREPARATION_CONTEXT_LABEL));
        assert.match(updated, /Mira: promised to wait until dawn\. Known to: Mira/);
        const framing = updated.replace(plot, '').replace(notebook, '');
        assert.doesNotMatch(framing, /GAME MASTER RESPONSIBILITY|PLAYER BOUNDARY|DEVELOPMENT:|SCENE FIT|Old universal|suspend NPC activity|express through behavior/);
        if (mode === 'Adaptive') assert.doesNotMatch(framing, /PACING PREFERENCE/);
        else assert.ok(framing.includes(formatPacingPreference(mode.toLowerCase())));
        assert.equal(refreshGameMasterContract(updated), updated);
        assert.equal(buildPromptPayload(defaultState(), { cachedPayload: source }), updated);
        assert.equal(buildPromptPayload(defaultState(), { cachedPayload: source, enabled: false }), '');
    }
});

test('fresh packets send only explicitly saved pacing preferences without mutating settings', () => {
    for (const mode of ['auto', 'linger', 'natural', 'advance']) {
        const state = defaultState();
        state.pacing.mode = mode;
        const before = structuredClone(state);
        const packet = buildPromptPayload(state);
        if (mode === 'auto') assert.doesNotMatch(packet, /PACING PREFERENCE/);
        else assert.ok(packet.includes(formatPacingPreference(mode)));
        assert.doesNotMatch(packet, /tale-fairy-authority|GAME MASTER RESPONSIBILITY|PLAYER BOUNDARY|NPCs decide|SCENE FIT|DEVELOPMENT:/);
        assert.deepEqual(state, before);
    }
});

test('context respects preset messages and configured placement without adding authority', () => {
    const payload = buildPromptPayload(defaultState());
    for (const role of ['user', 'assistant', 'system']) {
        const chat = [{ role: 'system', content: 'Keep HELD NPCs inactive. Use HTML.' },
            { role: 'user', content: 'I listen. OOC: keep the scene peaceful.' },
            { role: 'assistant', content: 'Prefill' }];
        ensureGuidanceInChat(chat, payload, { role, depth: 1, inlineLatestUser: role === 'user' });
        const before = structuredClone(chat);
        assert.equal(ensureGuidanceInChat(chat, payload, { role, depth: 1, inlineLatestUser: role === 'user' }), false);
        assert.deepEqual(chat, before);
        assert.doesNotMatch(JSON.stringify(chat), /tale-fairy-authority/);
        assert.equal(chat.filter(message => message.role === 'system').length, role === 'system' ? 2 : 1);
        assert.equal(chat[0].content, 'Keep HELD NPCs inactive. Use HTML.');
        assert.match(JSON.stringify(chat), /keep the scene peaceful/);
        assert.equal(chat.at(-1).content, 'Prefill');
        assert.match(payload, /Preset and explicit user instructions govern narration/);
        ensureGuidanceInChat(chat, '');
        assert.doesNotMatch(JSON.stringify(chat), /tale-fairy-/);
        assert.equal(chat.at(-1).content, 'Prefill');
    }
});

test('enabled, disabled and non-story requests remove stale multimodal authority without deleting attachments', () => {
    for (const type of ['quiet', 'impersonate', 'normal']) for (const enabled of [true, false]) {
        const chat = [{ role: 'system', content: [{ type: 'text', text: `Preset stays.\n${LEGACY_AUTHORITY}` }, { type: 'image_url', image_url: { url: 'kept' } }] }, { role: 'user', content: 'kept' }];
        const payload = buildPromptPayload(defaultState(), { generationType: type, enabled });
        ensureGuidanceInChat(chat, payload);
        assert.doesNotMatch(JSON.stringify(chat), /tale-fairy-authority/);
        assert.equal(chat[0].content[0].text, 'Preset stays.');
        assert.match(JSON.stringify(chat), /image_url/);
        assert.equal(ensureGuidanceInChat(chat, payload), false);
        const prompt = ensureGuidanceInText(`${LEGACY_AUTHORITY}\nPreset stays.`, payload);
        assert.doesNotMatch(prompt, /tale-fairy-authority/);
        assert.match(prompt, /Preset stays\./);
        assert.equal(ensureGuidanceInText(prompt, payload), prompt);
    }
});

test('failed refresh retains only an exact-source, same-input, successful current plan', () => {
    const proof = { chatId: 'story', fingerprint: 'snapshot', messageCount: 10, inputsKey: 'card+lore+notes' };
    const state = { ...defaultState(), sourceChatId: proof.chatId, lastAnalysisFingerprint: proof.fingerprint,
        sourceMessageCount: proof.messageCount, lastAnalyzedAt: 100, analysisModel: { plotInputsKey: proof.inputsKey },
        causalContext: { conditions: [{ id: 'witness', confidence: 'established', subject: 'Courier', condition: 'already departed' }] } };
    const before = structuredClone(state);
    assert.equal(canRetainSuccessfulPlan(state, proof), true);
    assert.deepEqual(state, before);
    for (const changed of [{ chatId: 'other' }, { fingerprint: 'edited' }, { messageCount: 11 }, { inputsKey: 'changed' }, { inputsKey: '' }]) {
        assert.equal(canRetainSuccessfulPlan(state, { ...proof, ...changed }), false);
    }
    assert.equal(canRetainSuccessfulPlan({ ...state, causalContext: { conditions: [{ id: 'guess', confidence: 'tentative' }] } }, proof), false);
    const fallback = createSafetyFallbackState(state, { chatId: proof.chatId, fingerprint: proof.fingerprint, messages: Array.from({ length: 10 }, () => ({ mes: 'Observed scene' })) });
    assert.equal(canRetainSuccessfulPlan(fallback, proof), false);
});
