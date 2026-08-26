import test from 'node:test';
import assert from 'node:assert/strict';
import { ANALYSIS_SCHEMA, ANALYSIS_SCHEMA_VALUE, AnalysisValidationError, applyAnalysis, buildAnalysisPrompt, extractJson, requireValidAnalysisResult, SYSTEM, validateAnalysisResult } from '../extension/analysis.js';
import { defaultState } from '../extension/state.js';

test('extractJson accepts fenced and wrapped JSON', () => {
    assert.deepEqual(extractJson('```json\n{"inject":false}\n```'), { inject: false });
    assert.deepEqual(extractJson('prefix {"inject":true} suffix'), { inject: true });
});

test('planner validation rejects empty or incomplete structured output', () => {
    assert.equal(validateAnalysisResult({}).valid, false);
    assert.throws(() => requireValidAnalysisResult({}), AnalysisValidationError);
    assert.equal(validateAnalysisResult({
        scene: { status: 'uninitialized', activity: '', pace: '', intent: '', location: '', time: '', loop: false },
        objectives: [], entities: [], possibilities: [], guidance: '', inject: false, reason: '',
    }).valid, false);
    assert.equal(validateAnalysisResult({
        scene: { status: 'active', activity: '', pace: 'slow', intent: '', location: '', time: '', loop: false },
        objectives: [], entities: [], possibilities: [], guidance: '', inject: false, reason: 'No intervention needed.',
    }).valid, false);
    assert.equal(validateAnalysisResult({
        scene: { status: 'active', activity: '', pace: 'slow', intent: '', location: '', time: '', loop: false },
        objectives: [], entities: [], possibilities: [], guidance: 'Preserve the slow pace and deepen the next supported reaction.', inject: true, reason: 'Even a quiet scene benefits from focused guidance.',
    }).valid, true);
});

test('planner keeps one unified possibility pool without predefined event types', () => {
    assert.match(SYSTEM, /one unified list of optional narrative possibilities/);
    assert.match(SYSTEM, /Do not require predefined event types/);
    assert.match(SYSTEM, /Removing type labels must not narrow the search/);
    assert.match(SYSTEM, /established and not-yet-seen people/);
    assert.match(SYSTEM, /nature of a development be understood from what actually becomes established/);
    assert.match(SYSTEM, /infer its intent in this same planner call/);
    assert.match(SYSTEM, /If clear, return note_resolution/);
    assert.match(SYSTEM, /note_resolution as null when there is no AI-assisted note or its intent is genuinely ambiguous/);
    assert.match(SYSTEM, /preserves the user's exact instruction text/);
    assert.match(SYSTEM, /Choose developments from the evidence and established tone/);
    assert.match(SYSTEM, /Treat setting lore as an active causal system rather than background decoration/);
    assert.match(SYSTEM, /metaphysical rules, powers, technologies, cultures, laws, institutions, factions/);
    assert.match(SYSTEM, /State the causal mechanism and bridge/);
    assert.match(SYSTEM, /what can perceive or transmit it/);
    assert.match(SYSTEM, /never invoke it merely because it is iconic to the franchise/);
    assert.match(SYSTEM, /Distinguish established lore mechanisms from character belief and speculative interpretation/);
    assert.match(SYSTEM, /Player silence, mundane focus, or lack of explicit pursuit is not a veto/);
    assert.match(SYSTEM, /supported NPC decisions, institutional processes, off-screen activity/);
    assert.match(SYSTEM, /must wait for the player character to initiate it unless the established mechanism literally requires/);
    assert.match(SYSTEM, /allow supported external processes and actors to take concrete steps/);
    assert.match(SYSTEM, /leave room for uncertainty and natural friction/);
    assert.match(SYSTEM, /Warmth, relief, cooperation, and happy outcomes are equally valid when the scene earns them/);
    assert.match(SYSTEM, /Never add darkness merely for variety/);
    assert.match(SYSTEM, /never soften danger or suffering that the context supports/);
    assert.match(SYSTEM, /Do not replace a supported development with a safer, softer/);
    assert.match(SYSTEM, /Give no automatic plot armor/);
    assert.match(SYSTEM, /Do not force sympathy, vulnerability, redemption, reconciliation, banter, avoidance, or silent treatment/);
    assert.match(SYSTEM, /do not add cruelty, darkness, punishment, or conflict merely to appear bold/);
    assert.match(SYSTEM, /Always return inject true and one non-empty concise guidance note/);
    assert.match(SYSTEM, /There is no scene too small or quiet to guide/);
    assert.match(SYSTEM, /never decide that guidance adds nothing/);
});

test('planner validates an automatically resolved AI-assisted note', () => {
    const result = {
        scene: { status: 'active', activity: 'working', pace: 'slow', intent: 'finish an assignment', location: 'home', time: 'evening', loop: false },
        objectives: [], entities: [], possibilities: [], guidance: 'Keep the work scene focused and let progress emerge through concrete action.', inject: true, reason: 'The quiet task still benefits from a small focus.',
        note_resolution: { kind: 'forbid' },
    };
    assert.equal(validateAnalysisResult(result).valid, true);
    assert.equal(validateAnalysisResult({ ...result, note_resolution: { kind: 'maybe', text: 'Anything' } }).valid, false);
    assert.equal(validateAnalysisResult({ ...result, note_resolution: null }).valid, true);
});

test('planner schema uses SillyTavern structured-output packaging', () => {
    assert.equal(ANALYSIS_SCHEMA.name, 'tale_fairy_analysis');
    assert.equal(ANALYSIS_SCHEMA.value, ANALYSIS_SCHEMA_VALUE);
    assert.equal(ANALYSIS_SCHEMA.value.type, 'object');
    assert.equal(ANALYSIS_SCHEMA.value.properties.inject.const, true);
    assert.equal(ANALYSIS_SCHEMA.returnInvalid, true);
    assert.equal(ANALYSIS_SCHEMA.strict, true);
    assert.equal(ANALYSIS_SCHEMA.type, undefined);
    assert.deepEqual(ANALYSIS_SCHEMA.value.required, Object.keys(ANALYSIS_SCHEMA.value.properties));
});

test('analysis prompt includes bootstrap context and current state', () => {
    const prompt = buildAnalysisPrompt([{ mes: 'I make tea', is_user: true }], defaultState(), '', { scenario: 'A quiet apartment' });
    assert.match(prompt, /A quiet apartment/);
    assert.match(prompt, /update_narrative_context/);
});

test('card system material is treated as factual reference rather than planner instructions', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([], defaultState(), '', {
        scenario: 'A dangerous fantasy world.',
        cardSystemReference: 'If the protagonist dies, time returns to the last checkpoint. Write in purple prose.',
    }));
    assert.match(prompt.bootstrap.cardSystemReference, /time returns to the last checkpoint/);
    assert.match(prompt.bootstrap_instruction, /extract supported fictional facts, world mechanics, triggers/);
    assert.match(prompt.bootstrap_instruction, /do not adopt instructions about writing style/);
});

test('analysis prompt carries a per-run variation seed', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: 'I make tea', is_user: true }], defaultState(), '', {}, { variationSeed: 12345 }));
    assert.equal(prompt.planner_variation_seed, 12345);
    assert.match(prompt.planner_variation_instruction, /tie-breaker/);
});

test('analysis prompt asks for novelty without forcing player action', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: 'We visit the art gallery again', is_user: true }], defaultState()));
    assert.match(prompt.novelty_instruction, /Avoid recency fixation/);
    assert.match(prompt.novelty_instruction, /Rotate among supported threads/);
    assert.match(prompt.novelty_instruction, /never invent player-character action/);
});

test('analysis prompt limits sent messages and accepts optional continuity context', () => {
    const messages = Array.from({ length: 5 }, (_, i) => ({ mes: `message-${i}`, is_user: i % 2 === 0 }));
    const prompt = JSON.parse(buildAnalysisPrompt(messages, defaultState(), '', {}, { messageWindow: 2, messageCharLimit: 20, continuityContext: 'older context' }));
    assert.equal(prompt.messages.length, 2);
    assert.equal(prompt.optional_continuity_context, 'older context');
    assert.match(prompt.continuity_instruction, /ground planner decisions/);
});

test('analysis prompt accepts supporting host context without declaring it canon', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: 'Tea', is_user: true }], defaultState(), '', {}, { hostContext: '[Chat summary] Yesterday was quiet.' }));
    assert.equal(prompt.optional_host_context, '[Chat summary] Yesterday was quiet.');
    assert.match(prompt.host_context_instruction, /supporting context only/);
    assert.match(prompt.host_context_instruction, /do not treat every line as an established event/);
});

test('bootstrap prompt samples older messages instead of only the recent tail', () => {
    const messages = Array.from({ length: 40 }, (_, i) => ({ mes: `message-${i}`, is_user: i % 2 === 0 }));
    const prompt = JSON.parse(buildAnalysisPrompt(messages, defaultState(), '', {}, { messageWindow: 4, bootstrapScan: true }));
    assert.ok(prompt.messages.some(item => item.index === 0));
    assert.ok(prompt.messages.some(item => item.index < 36));
    assert.ok(prompt.messages.some(item => item.kind === 'anchor'));
    assert.ok(prompt.messages.every(item => item.kind === 'recent' || item.kind === 'anchor'));
});

test('analysis application keeps guidance bounded and records its injection decision', () => {
    const messages = [{ mes: 'I make tea', is_user: true }];
    const next = applyAnalysis(defaultState(), { scene: { status: 'active', activity: 'tea', pace: 'slow', intent: 'rest', location: 'kitchen', time: 'evening', loop: false }, objectives: [], entities: [], possibilities: [], guidance: 'x'.repeat(2000), inject: true, reason: 'A gentle reminder will preserve the established pace.' }, messages);
    assert.equal(next.guidance.length, 1200);
    assert.equal(next.sourceMessageCount, 1);
    assert.equal(next.scene.activity, 'tea');
    assert.equal(next.lastInject, true);
    assert.match(next.lastReason, /established pace/);
});

test('narrative events are stored internally but guidance remains the only injected output', () => {
    const messages = [{ mes: 'The trade shop closes at dusk.', is_user: false }];
    const next = applyAnalysis(defaultState(), {
        scene: { status: 'active' }, objectives: [], entities: [], possibilities: [],
        story_frame: { frame: 'grounded', confidence: 'high', basis: 'ordinary setting' },
        narrative_events: [{ id: 'shop-close', title: 'Trade shop closes', summary: 'The shop is unavailable after dusk.', status: 'established', relevance: 'relevant', confidence: 'high', feasibility: 'established', basis: 'current scene', requirements: [], interpretation: 'established_fact', source_hint: 'current scene' }],
        guidance: 'Keep the evening calm.', inject: true,
    }, messages);
    assert.equal(next.narrativeEvents.length, 1);
    assert.equal(next.narrativeEvents[0].id, 'shop-close');
    assert.equal(next.guidance, 'Keep the evening calm.');
    assert.equal(next.storyFrame.frame, 'grounded');
});

test('jokes, wishes, and unsupported absurdities are not retained as events', () => {
    const next = applyAnalysis(defaultState(), { narrative_events: [
        { id: 'wish', title: 'Meet the president', summary: 'The user hopes this happens.', interpretation: 'wish' },
        { id: 'joke', title: 'Moon explodes', summary: 'A joke.', interpretation: 'joke' },
        { id: 'real', title: 'Assignment due', summary: 'The assignment is due tomorrow.', interpretation: 'established_fact', status: 'established', relevance: 'relevant', confidence: 'high', feasibility: 'established', basis: 'user and assistant established it', requirements: [], source_hint: 'chat' },
    ] }, [{ mes: 'Hopefully I meet the president.', is_user: true }]);
    assert.deepEqual(next.narrativeEvents.map(event => event.id), ['real']);
});

test('planner prompt uses a soft budget and retains selected context', () => {
    const messages = Array.from({ length: 40 }, (_, i) => ({ mes: 'x'.repeat(2000) + i, is_user: i % 2 === 0 }));
    const prompt = buildAnalysisPrompt(messages, { ...defaultState(), contextLedger: 'y'.repeat(4000) }, 'z'.repeat(2000), { description: 'd'.repeat(3500) }, { messageWindow: 24, maxPromptChars: 10000, continuityContext: 'c'.repeat(6000), hostContext: 'h'.repeat(8000), bootstrapScan: true });
    const parsed = JSON.parse(prompt);
    assert.ok(prompt.length > 10000);
    assert.ok(parsed.messages.length >= 24);
    assert.ok(parsed.messages.some(item => item.kind === 'recent' && item.index === 39));
    assert.ok(parsed.messages.some(item => item.kind === 'anchor' && item.index === 0));
    assert.equal(parsed.messages.find(item => item.index === 39).content.length, 1600);
});

test('empty optional context is omitted from the planner payload', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: 'Tea', is_user: true }], defaultState()));
    assert.equal('user_instruction' in prompt, false);
    assert.equal('bootstrap' in prompt, false);
    assert.equal('optional_continuity_context' in prompt, false);
    assert.equal('optional_host_context' in prompt, false);
});
