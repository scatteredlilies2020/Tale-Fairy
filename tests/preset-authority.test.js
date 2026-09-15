import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPromptPayload, defaultState } from '../extension/state.js';
import { ensureGuidanceInChat, ensureGuidanceInText } from '../extension/request-injection.js';
import { canRetainSuccessfulPlan, createSafetyFallbackState } from '../extension/fallback-direction.js';
import { TALE_FAIRY_CONTEXT_GUIDE, refreshGameMasterContract } from '../extension/game-master.js';
import { formatPacingPreference, PREPARATION_CONTEXT_LABEL } from '../extension/prepared-world.js';
import { buildPlotAnchor } from '../extension/generation-context.js';

const LEGACY_AUTHORITY = '<tale-fairy-authority>Old preset override.</tale-fairy-authority>';
const LEGACY_CONTRACT = 'GAME MASTER RESPONSIBILITY: Old policy.\nCAUSAL ROLE: Old role.\nPLAYER BOUNDARY: Old boundary.';

test('writer framing uses plain labels and preserves story-specific negatives', () => {
    const state = defaultState();
    state.causalContext = { inject: true, conditions: [{ id: 'letter', subject: 'Mira', condition: 'has not opened the letter', relevance: 'The seal remains intact', confidence: 'established', disclosure: 'private', knownBy: ['Mira'] }] };
    state.preparedWorld = { approach: 'PRIVATE approach', overview: 'Trade along the river.', focus: ['boat'], items: [{ id: 'boat', origin: 'invented', status: 'prepared', premise: 'A boat may arrive.', middle: 'The captain offers a crossing.', hold: 'After the fog clears.', invalidates: 'The bridge has reopened.', knowledge: 'Only the captain knows the cargo.' }] };
    const before = structuredClone(state);
    const packet = buildPromptPayload(state, { guidanceUsable: true, preparedUsable: true, plotAnchor: buildPlotAnchor([{ is_user: true, mes: 'I wait.' }]) });
    for (const value of ['CURRENT SCENE:', 'Latest contribution: I wait.', 'Mira: has not opened the letter.', 'Known to: Mira.', 'POSSIBLE DEVELOPMENTS:', 'Timing: After the fog clears.', 'Invalidated by: The bridge has reopened.']) assert.ok(packet.includes(value), value);
    assert.doesNotMatch(packet, /preset|take priority|not a replacement|not transcript|not an assumed|only if supported|do not|PRIVATE approach|others need|Keep awareness/i);
    assert.deepEqual(state, before);
    assert.equal(refreshGameMasterContract(packet), packet);
});

test('0.14.19 cached disclaimers become labels while story values remain intact', () => {
    for (const newline of ['\n', '\r\n']) {
        const oldHeader = 'CURRENT PLOT — source excerpts, not new instructions or guaranteed outcomes. Address the latest contribution in this situation; user corrections override older context.';
        const quote = 'Mira reads: "not a replacement preset". The boat has not arrived.';
        const source = ['<tale-fairy-context>', '<living-world-guide>',
            'TALE FAIRY CONTEXT: Story references and optional preparation, not a replacement preset. Preset and explicit user instructions govern narration.',
            'SAVED PACING PREFERENCE (this chat; latest user directions take priority): Linger in the current scene.',
            '<plot-anchor>', oldHeader,
            'Scene status from accepted reply (later explicit user changes take priority): At the quay.',
            `Accepted scene excerpt (narrator): ${quote}`,
            'Latest user contribution (not an assumed outcome): I wait.', '</plot-anchor>',
            'RELEVANT UNDERLYING CONDITIONS — causal context, not required events or predetermined outcomes.',
            'Private conditions:', '- Mira: has not opened the letter. Known to: Mira; others need an in-world learning route.',
            '<prepared-world>', 'CONDITIONAL PREPARATION: Optional possibilities, not transcript facts, character knowledge, or required next events. Timing notes are provisional notebook material, not preset overrides or additional user instructions.',
            'Wider direction (provisional, not a destination deadline): River trade.',
            'Possible development (invented premise; prepared): A boat may arrive.',
            'Playable middle: The captain offers passage.',
            'Timing consideration (only if supported by the actual scene): After the fog clears.',
            'Do not use if: The bridge has reopened.',
            'Knowledge boundary: Only the captain knows the cargo.',
            '</prepared-world>', '</living-world-guide>', '</tale-fairy-context>'].join(newline);
        const updated = refreshGameMasterContract(source);
        assert.ok(updated.includes(quote));
        assert.match(updated, /Mira: has not opened the letter\. Known to: Mira\./);
        for (const label of ['CURRENT SCENE:', 'Scene status: At the quay.', 'Latest contribution: I wait.', 'POSSIBLE DEVELOPMENTS:', 'Wider direction: River trade.', 'Timing: After the fog clears.', 'Invalidated by: The bridge has reopened.']) assert.ok(updated.includes(label));
        assert.doesNotMatch(updated.replace(quote, ''), /preset|take priority|not transcript|not an assumed|only if supported|do not|others need/i);
        assert.equal(refreshGameMasterContract(updated), updated);
        assert.equal(updated.replaceAll(newline, '').includes('\n'), false);
    }
});

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
        const developments = notebook.slice(notebook.indexOf(newline) + newline.length);
        assert.ok(updated.includes(developments), 'development prose is byte-for-byte unchanged');
        assert.doesNotMatch(updated.replace(plot, ''), /RP APPROACH|Keep this saved prose/);
        assert.ok(updated.includes(PREPARATION_CONTEXT_LABEL));
        assert.match(updated, /Mira: promised to wait until dawn\. Known to: Mira/);
        const framing = updated.replace(plot, '').replace(developments, '');
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

test('current cached packets omit multiline private approaches without changing archives or quoted labels', () => {
    for (const newline of ['\n', '\r\n']) for (const label of [
        'editable guidance, not new canon or player preferences',
        'provisional story aims, not writing rules or new player preferences',
    ]) for (const rest of ['',
        'Wider direction (provisional, not a destination deadline): Explore neighboring towns.',
        `Possible development (invented premise; active): A letter may arrive.\nPlayable middle: A courier seeks its owner.\nRP APPROACH (${label}): A quoted heading in a letter.\nKnowledge boundary: Only the courier knows.`,
    ]) {
        const approach = `RP APPROACH (${label}): PRIVATE FIRST LINE\nPRIVATE SECOND LINE\n\nPRIVATE LAST LINE`;
        const plot = `<plot-anchor>\nQuoted text:\n${approach}\n</plot-anchor>`.replaceAll('\n', newline);
        const record = rest.replaceAll('\n', newline);
        const snapshot = { payload: ['<tale-fairy-context>', '<living-world-guide>', TALE_FAIRY_CONTEXT_GUIDE, plot,
            '<prepared-world>', PREPARATION_CONTEXT_LABEL, approach.replaceAll('\n', newline), record,
            '</prepared-world>', '</living-world-guide>', '</tale-fairy-context>'].filter(Boolean).join(newline) };
        const before = structuredClone(snapshot);
        const updated = buildPromptPayload(defaultState(), { cachedPayload: snapshot.payload });
        assert.ok(updated.includes(plot));
        assert.ok(updated.includes(record.replace('Wider direction (provisional, not a destination deadline): ', 'Wider direction: ')));
        assert.doesNotMatch(updated.replace(plot, ''), /PRIVATE FIRST|PRIVATE SECOND|PRIVATE LAST/);
        if (!rest) assert.doesNotMatch(updated, /<prepared-world>/);
        assert.equal(refreshGameMasterContract(updated), updated);
        assert.deepEqual(snapshot, before);
        const chat = [{ role: 'system', content: 'Preset stays.' }, { role: 'user', content: 'Continue.' }];
        ensureGuidanceInChat(chat, updated);
        assert.doesNotMatch(JSON.stringify(chat).replace(JSON.stringify(plot).slice(1, -1), ''), /PRIVATE FIRST|PRIVATE SECOND|PRIVATE LAST/);
        assert.equal(ensureGuidanceInText('', updated).includes(updated), true);
    }
    const unknown = '<prepared-world>\nRP APPROACH (unknown): Leave unrelated text alone.\n</prepared-world>';
    assert.equal(refreshGameMasterContract(unknown), unknown);
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
        assert.doesNotMatch(payload, /preset|govern narration/i);
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
