import assert from 'node:assert/strict';
import test from 'node:test';
import { chatHasCurrentGuidance, ensureGuidanceInChat, ensureGuidanceInText, extractTaleFairyContext, requestContainsMarker, textHasCurrentGuidance } from '../extension/request-injection.js';
import { buildPromptPayload, defaultState } from '../extension/state.js';

const policy = '<tale-fairy-narrative-policy>Keep the scene grounded.</tale-fairy-narrative-policy>';
const oldGuide = '<living-world-guide>Old direction.</living-world-guide>';
const guide = '<living-world-guide>Current scene direction.</living-world-guide>';
const oldNotes = '<tale-fairy-user-notes>Stale note.</tale-fairy-user-notes>';
const oldCanon = '<user-established-canon>Stale canon.</user-established-canon>';
const payload = `<tale-fairy-context>${policy}\n${guide}</tale-fairy-context>`;

test('identifies only request-local internal planner prompts', () => {
    const marker = 'Tale Fairy internal planner marker';
    assert.equal(requestContainsMarker({ messages: [{ role: 'system', content: marker }] }, marker), true);
    assert.equal(requestContainsMarker({ prompt: [{ role: 'user', content: [{ type: 'text', text: marker }] }] }, marker), true);
    assert.equal(requestContainsMarker({ messages: [{ role: 'system', content: 'normal roleplay' }] }, marker), false);
    assert.equal(requestContainsMarker({ messages: [{ role: 'user', content: 'normal roleplay' }] }, ''), false);
});

test('extracts the exact Tale Fairy context from serialized provider request shapes', () => {
    assert.equal(extractTaleFairyContext({ messages: [{ role: 'user', content: `Before\n${payload}\nAfter` }] }), payload);
    assert.equal(extractTaleFairyContext({ prompt: `Prompt\n${payload}` }), payload);
    assert.equal(extractTaleFairyContext({ messages: [{ content: [{ type: 'text', text: payload }] }] }), payload);
    assert.equal(extractTaleFairyContext({ messages: [{ content: 'ordinary roleplay' }] }), '');
});

test('prefers the complete context envelope over a nested guide', () => {
    assert.equal(extractTaleFairyContext({ prompt: `${payload}\n${guide}` }), payload);
});

test('adds current guidance to an assembled chat request at the configured depth', () => {
    const chat = Array.from({ length: 5 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `message ${index}` }));
    assert.equal(ensureGuidanceInChat(chat, payload, { role: 'system', depth: 3 }), true);
    assert.equal(chat.length, 6);
    assert.equal(chat[2].role, 'system');
    assert.equal(chat[2].content, payload);
    assert.equal(chatHasCurrentGuidance(chat, payload), true);
    assert.equal(ensureGuidanceInChat(chat, payload, { role: 'system', depth: 3 }), false);
});

test('atomically replaces legacy guidance and policy blocks', () => {
    const chat = [{ role: 'user', content: `${oldNotes}\n${oldCanon}\n${policy}\n${oldGuide}` }, { role: 'assistant', content: 'reply' }];
    assert.equal(ensureGuidanceInChat(chat, payload, { role: 'user', depth: 0 }), true);
    const combined = chat.map(message => message.content).join('\n');
    assert.doesNotMatch(combined, /Old direction|Stale note|Stale canon/);
    assert.equal(combined.match(/<tale-fairy-context>/g)?.length, 1);
    assert.equal(combined.match(/<tale-fairy-narrative-policy>/g)?.length, 1);
    assert.equal(combined.match(/<living-world-guide>/g)?.length, 1);
    assert.equal(chat.at(-1).content, payload);
});

test('removes duplicate legacy fragments even when the current context is already present', () => {
    const chat = [{ role: 'system', content: payload }, { role: 'user', content: `${oldNotes}\n${oldGuide}` }];
    assert.equal(ensureGuidanceInChat(chat, payload, { role: 'system', depth: 1 }), true);
    const combined = chat.map(message => message.content).join('\n');
    assert.doesNotMatch(combined, /Old direction|Stale note/);
    assert.equal(combined.match(/<tale-fairy-context>/g)?.length, 1);
    assert.equal(ensureGuidanceInChat(chat, payload, { role: 'system', depth: 1 }), false);
});

test('moves guidance inside the latest user content before the actual turn', () => {
    const chat = [
        { role: 'system', content: payload },
        { role: 'assistant', content: 'Are you ready?' },
        { role: 'user', content: 'I open the door.' },
    ];
    assert.equal(ensureGuidanceInChat(chat, payload, { role: 'user', depth: 1, inlineLatestUser: true }), true);
    assert.equal(chat.length, 2);
    assert.equal(chat.at(-1).role, 'user');
    assert.equal(chat.at(-1).content, `${payload}\nI open the door.`);
    assert.equal(chat.filter(message => message.role === 'system').length, 0);
    assert.equal(ensureGuidanceInChat(chat, payload, { role: 'user', depth: 1, inlineLatestUser: true }), false);
    assert.equal(chat.at(-1).content.match(/<tale-fairy-context>/g)?.length, 1);
});

test('keeps an already embedded guide with its real user turn through later request hooks', () => {
    const chat = [
        { role: 'user', content: `${payload}\nI open the door.` },
        { role: 'user', content: 'Synthetic provider suffix.' },
    ];
    assert.equal(ensureGuidanceInChat(chat, payload, { inlineLatestUser: true }), false);
    assert.equal(chat[0].content, `${payload}\nI open the door.`);
    assert.equal(chat[1].content, 'Synthetic provider suffix.');
});

test('prepends guidance to multimodal user content without changing its blocks', () => {
    const image = { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } };
    const chat = [{ role: 'user', content: [{ type: 'text', text: 'Look at this.' }, image] }];
    ensureGuidanceInChat(chat, payload, { inlineLatestUser: true });
    assert.equal(chat.length, 1);
    assert.deepEqual(chat[0].content.slice(1), [{ type: 'text', text: 'Look at this.' }, image]);
    assert.equal(chat[0].content[0].text, payload);
});

test('does not normalize unrelated provider message content while relocating guidance', () => {
    const formatted = '\n  Preserve exact card formatting.  \n';
    const chat = [
        { role: 'system', content: formatted },
        { role: 'user', content: payload },
        { role: 'user', content: 'Act now.' },
    ];
    ensureGuidanceInChat(chat, payload, { inlineLatestUser: true });
    assert.equal(chat[0].content, formatted);
    assert.equal(chat.at(-1).content, `${payload}\nAct now.`);
});

test('repairs text-completion prompts and recognizes the current guide', () => {
    const repaired = ensureGuidanceInText(`story\n${policy}\n${oldGuide}`, payload);
    assert.equal(textHasCurrentGuidance(repaired, payload), true);
    assert.doesNotMatch(repaired, /Old direction/);
    assert.equal(repaired.match(/<tale-fairy-context>/g)?.length, 1);
    assert.equal(repaired.match(/<tale-fairy-narrative-policy>/g)?.length, 1);
    assert.equal(repaired.startsWith(payload), true);
    assert.equal(ensureGuidanceInText(repaired, payload), repaired);
});

test('removes stale Tale Fairy guidance when no analyzed beat is available', () => {
    const chat = [
        { role: 'system', content: payload },
        { role: 'user', content: `${oldGuide}\nContinue.` },
    ];
    assert.equal(ensureGuidanceInChat(chat, '', { role: 'system', depth: 1 }), true);
    assert.deepEqual(chat, [{ role: 'user', content: 'Continue.' }]);
    assert.equal(ensureGuidanceInChat(chat, '', { role: 'system', depth: 1 }), false);

    const cleaned = ensureGuidanceInText(`Story setup\n${payload}\nContinue.`, '');
    assert.equal(cleaned, 'Story setup\nContinue.');
    assert.doesNotMatch(cleaned, /tale-fairy|living-world-guide/i);
});

test('stale cleanup preserves non-text multimodal blocks', () => {
    const image = { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } };
    const chat = [{ role: 'user', content: [{ type: 'text', text: payload }, image] }];
    assert.equal(ensureGuidanceInChat(chat, ''), true);
    assert.deepEqual(chat, [{ role: 'user', content: [{ type: 'text', text: '' }, image] }]);
});

test('provider-bound request receives only abstract flow and scale on regeneration', () => {
    const state = {
        ...defaultState(),
        sceneProfile: { promise: 'A tense report is being discussed.', phase: 'developing', emotionalDirection: 'intensify', pressure: 'active', intrusion: 'open', noveltyCeiling: 'moderate' },
        beatDirective: { operation: 'complicate', target: 'the report discussion', requiredEffect: 'Add a credible difficulty that changes how the current information is understood.', contentClass: 'information', scope: 'social', intensity: 'moderate', quantity: 'single', relativePower: 'peer', plotWeight: 'supporting', duration: 'beat', resolutionCeiling: 'partial', preserve: ['user authority'], forbid: ['a predetermined incident'], basis: 'The information is already unstable.' },
    };
    const prompt = buildPromptPayload(state, { guidanceUsable: true, regeneration: true });
    const chat = [{ role: 'user', content: 'Tell me what happened.' }];

    assert.equal(ensureGuidanceInChat(chat, prompt, { role: 'user', depth: 1, inlineLatestUser: true }), true);
    assert.equal(chatHasCurrentGuidance(chat, prompt), true);
    assert.equal(chat.length, 1);
    assert.equal(chat.at(-1).role, 'user');
    assert.match(chat.at(-1).content, /ANALYZED BEAT: movement=complicate.*scope=social.*intensity=moderate/i);
    assert.doesNotMatch(chat.at(-1).content, /PRESERVE:|DO NOT:/);
    assert.doesNotMatch(chat.at(-1).content, /Infer every concrete action|Treat explicit user\/OOC|For this regeneration|Do not expose/i);
    assert.doesNotMatch(chat.at(-1).content, /Add a credible difficulty|the report discussion|A tense report|The information is already unstable|WEIGHTED DIRECTOR SAMPLE|Vekk|war update|urgent contradiction/i);
    assert.match(chat.at(-1).content, /Tell me what happened\.$/);
    assert.doesNotMatch(chat.at(-1).content, /GROUNDING:|EXECUTION:/);
    assert.equal(chat.map(message => String(message.content)).join('\n').match(/<tale-fairy-context>/g)?.length, 1);
    assert.ok(prompt.length < 4000, `expected bounded director payload, got ${prompt.length} characters`);
});
