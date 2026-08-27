import test from 'node:test';
import assert from 'node:assert/strict';
import { ANALYSIS_SCHEMA, ANALYSIS_SCHEMA_VALUE, AnalysisValidationError, MODE_INSTRUCTIONS, applyAnalysis, buildAnalysisPrompt, extractJson, requireValidAnalysisResult, SYSTEM, validateAnalysisResult } from '../extension/analysis.js';
import { defaultState } from '../extension/state.js';

const activeBeat = { id: 'tea-talk', objective: 'Let the tea conversation reveal a useful tension.', next_action: 'Have Mara answer plainly and expose one concrete concern.', completion: 'Mara has stated the concern and the other character can react.', lifecycle: 'replace', reason: 'The latest question opens this beat.' };
const planHorizons = {
    items: [
        { id: 'reply', direction: 'Answer the immediate question.', timeframe: 'this reply', stability: 'fluid', conditions: [], change: 'replace', reason: 'Immediate user action.' },
        { id: 'turns', direction: 'Let the concern affect the conversation.', timeframe: 'next 2–4 turns', stability: 'adaptive', conditions: ['The conversation continues.'], change: 'replace', reason: 'Natural follow-through.' },
        { id: 'scene', direction: 'End the tea scene with a changed understanding.', timeframe: 'current scene', stability: 'adaptive', conditions: [], change: 'replace', reason: 'Scene direction.' },
        { id: 'arc', direction: 'Revisit the underlying obligation later.', timeframe: 'current arc', stability: 'stable', conditions: ['The obligation remains unresolved.'], change: 'replace', reason: 'Longer consequence.' },
        { id: 'later-arcs', direction: 'Let changing loyalties reshape how the obligation matters.', timeframe: 'later or multiple arcs', stability: 'stable', conditions: ['The relationship continues.'], change: 'replace', reason: 'Distant relationship direction.' },
        { id: 'distant-arc', direction: 'Keep the obligation available as one evolving long-term pressure.', timeframe: 'later arcs / open-ended', stability: 'slow', conditions: ['It has not become irrelevant.'], change: 'replace', reason: 'Provisional distant trajectory.' },
    ],
    deviation: { level: 'none', reason: 'Initial plan.' },
};
const requiredPlanning = { story_frame: { frame: 'grounded', confidence: 'high', basis: 'ordinary scene' }, active_beat: activeBeat, plan_horizons: planHorizons, canon_constraints: [], note_resolution: null, ledger: 'Tea conversation is active.', narrative_events: [] };

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
        ...requiredPlanning,
        scene: { status: 'active', activity: '', pace: 'slow', intent: '', location: '', time: '', loop: false },
        objectives: [], entities: [], possibilities: [], guidance: '', inject: false, reason: 'No intervention needed.',
    }).valid, false);
    assert.equal(validateAnalysisResult({
        ...requiredPlanning,
        scene: { status: 'active', activity: '', pace: 'slow', intent: '', location: '', time: '', loop: false },
        objectives: [], entities: [], possibilities: [], guidance: 'Preserve the slow pace and deepen the next supported reaction.', inject: true, reason: 'Even a quiet scene benefits from focused guidance.',
    }).valid, true);
});

test('planner keeps a causal possibility pool and adaptive multi-horizon plan', () => {
    assert.match(SYSTEM, /one unified possibility pool rather than categories/);
    assert.match(SYSTEM, /source, route into the scene, timing, and reason/);
    assert.match(SYSTEM, /iconic franchise elements, and unsupported speculation are not scheduled events/);
    assert.match(SYSTEM, /classify it in this call as suggest, correct, establish, or forbid/);
    assert.match(SYSTEM, /return null only when genuinely ambiguous/);
    assert.match(SYSTEM, /never rewrite the user's text/);
    assert.match(SYSTEM, /Lore is an active causal system/);
    assert.match(SYSTEM, /Player silence is not a veto/);
    assert.match(SYSTEM, /six to ten additional concise plan_horizons\.items ordered from the next few turns to a distant story horizon/);
    assert.match(SYSTEM, /some later arc or meaningful future time/);
    assert.match(SYSTEM, /Everything in the plan remains changeable/);
    assert.match(SYSTEM, /Every horizon also retains some effect with a strict distance gradient/);
    assert.match(SYSTEM, /distant directions provide only a subtle background pull/);
    assert.match(SYSTEM, /stable and slow directions can adjust after accumulated minor deviation/);
    assert.match(SYSTEM, /not a story ending, final resolution, or predetermined outcome/);
    assert.match(SYSTEM, /Do not replace a supported development with a safer, softer/);
    assert.match(SYSTEM, /Give no automatic plot armor/);
    assert.match(SYSTEM, /Do not force sympathy, vulnerability, redemption, reconciliation, banter, avoidance, or silent treatment/);
    assert.match(SYSTEM, /do not add cruelty, darkness, punishment, or conflict merely to appear bold/);
    assert.match(SYSTEM, /Every scene can have a useful beat, including quiet scenes/);
});

test('planner validates an automatically resolved AI-assisted note', () => {
    const result = {
        ...requiredPlanning,
        scene: { status: 'active', activity: 'working', pace: 'slow', intent: 'finish an assignment', location: 'home', time: 'evening', loop: false },
        objectives: [], entities: [], possibilities: [], guidance: 'Keep the work scene focused and let progress emerge through concrete action.', inject: true, reason: 'The quiet task still benefits from a small focus.',
        note_resolution: { kind: 'forbid' },
    };
    assert.equal(validateAnalysisResult(result).valid, true);
    assert.equal(validateAnalysisResult({ ...result, note_resolution: { kind: 'maybe', text: 'Anything' } }).valid, false);
    assert.equal(validateAnalysisResult({ ...result, note_resolution: null }).valid, true);
});

test('planner requires a distant but open-ended highest horizon', () => {
    const result = {
        ...requiredPlanning,
        scene: { status: 'active', activity: 'talking', pace: 'slow', intent: 'understand', location: 'home', time: 'evening', loop: false },
        objectives: [], entities: [], possibilities: [], guidance: 'Keep the present conversation specific.', inject: true, reason: 'A live direction is useful.',
    };
    const fixedLike = { ...result, plan_horizons: { ...planHorizons, items: planHorizons.items.map((item, index) => index === planHorizons.items.length - 1 ? { ...item, stability: 'stable' } : item) } };
    assert.equal(validateAnalysisResult(result).valid, true);
    assert.equal(validateAnalysisResult(fixedLike).valid, false);
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

test('planner preserves explicit extreme canon without normalizing it to setting averages', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: '[OOC: Lucia has a Midichlorian count off the charts, among the highest in history.]', is_user: true }], defaultState()));
    assert.match(prompt.extreme_canon_instruction, /facts remain authoritative even when extreme, unique, unprecedented/);
    assert.match(prompt.extreme_canon_instruction, /averages are context, not ceilings/);
    assert.match(prompt.extreme_canon_instruction, /Unspecified details remain creative space/);
    assert.match(prompt.extreme_canon_instruction, /complete current durable constraints until the user explicitly corrects them/);
    const next = applyAnalysis(defaultState(), { canon_constraints: ['Lucia is among the highest in history; exact count is unspecified.'] }, []);
    assert.deepEqual(next.canonConstraints, ['Lucia is among the highest in history; exact count is unspecified.']);
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

test('analysis prompt carries a provider-independent variation nonce', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: 'I make tea', is_user: true }], defaultState(), '', {}, { variationNonce: 12345 }));
    assert.equal(prompt.planner_variation_nonce, 12345);
    assert.match(prompt.planner_variation_instruction, /ordinary prompt nonce/);
});

test('analysis prompt asks for novelty without forcing player action', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: 'We visit the art gallery again', is_user: true }], defaultState()));
    assert.equal(prompt.messages.at(-1).content, 'We visit the art gallery again');
    assert.match(SYSTEM, /Avoid recency loops and arbitrary escalation/);
    assert.match(SYSTEM, /never invent the player's choices/);
});

test('planner modes provide materially distinct intervention policies', () => {
    const prompts = Object.fromEntries(['light', 'balanced', 'fun'].map(mode => {
        const state = { ...defaultState(), mode };
        return [mode, JSON.parse(buildAnalysisPrompt([{ mes: 'The room goes quiet.', is_user: false }], state))];
    }));
    assert.equal(prompts.light.mode_instruction, MODE_INSTRUCTIONS.light);
    assert.match(prompts.light.mode_instruction, /at most one active possibility/);
    assert.match(prompts.light.mode_instruction, /rather than redirect it/);
    assert.match(prompts.balanced.mode_instruction, /one to three distinct supported possibilities/);
    assert.match(prompts.balanced.mode_instruction, /moderate intervention/);
    assert.match(prompts.fun.mode_instruction, /Be bold, energetic/);
    assert.match(prompts.fun.mode_instruction, /three to six genuinely distinct supported possibilities/);
    assert.match(prompts.fun.mode_instruction, /decisively bring the strongest one onstage/);
    assert.match(prompts.fun.mode_instruction, /Do not merely hint or wait/);
    assert.notEqual(prompts.light.mode_instruction, prompts.balanced.mode_instruction);
    assert.notEqual(prompts.balanced.mode_instruction, prompts.fun.mode_instruction);
});

test('every planner mode leaves narrative pacing under user control', () => {
    for (const mode of ['light', 'balanced', 'fun']) {
        const prompt = JSON.parse(buildAnalysisPrompt([{ mes: 'I keep watching for a while.', is_user: true }], { ...defaultState(), mode }));
        assert.match(prompt.pacing_instruction, /Match the user’s demonstrated speed and granularity/);
        assert.match(prompt.pacing_instruction, /Complete declared actions, direct questions, and routine implied mechanics/);
        assert.match(prompt.pacing_instruction, /mode changes narrative pressure, not speed/);
        assert.match(prompt.pacing_instruction, /Explicit requests to advance or reach a milestone are binding minimum progress/);
        assert.match(prompt.pacing_instruction, /without inventing the player’s choices/);
        assert.match(prompt.pacing_instruction, /complete latest user turn/);
    }
    assert.match(MODE_INSTRUCTIONS.light, /must not artificially prolong a beat or slow a user/);
    assert.match(MODE_INSTRUCTIONS.balanced, /does not mean changing the user's narrative speed/);
    assert.match(MODE_INSTRUCTIONS.fun, /do not rush the user's timeline/);
});

test('analysis prompt maintains a lightweight world model', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: 'We are inside the Jedi Temple.', is_user: true }], defaultState()));
    assert.match(SYSTEM, /Maintain a compact causal world model from established evidence/);
    assert.match(SYSTEM, /relevant people, factions, locations, knowledge, motives/);
    assert.equal('world_model_instruction' in prompt, false);
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

test('canon bootstrap retains labeled OOC turns outside ordinary sampling points', () => {
    const messages = Array.from({ length: 60 }, (_, i) => ({ mes: `message-${i}`, is_user: i % 2 === 0 }));
    messages[22] = { mes: 'OOC: Lucia is off the charts and among the highest in history.', is_user: true };
    const prompt = JSON.parse(buildAnalysisPrompt(messages, defaultState(), '', {}, { messageWindow: 4, bootstrapScan: true }));
    assert.ok(prompt.messages.some(item => item.index === 22 && item.kind === 'directive' && /off the charts/.test(item.content)));
});

test('analysis application keeps guidance bounded and records its injection decision', () => {
    const messages = [{ mes: 'I make tea', is_user: true }];
    const next = applyAnalysis(defaultState(), { scene: { status: 'active', activity: 'tea', pace: 'slow', intent: 'rest', location: 'kitchen', time: 'evening', loop: false }, objectives: [], entities: [], possibilities: [], guidance: 'x'.repeat(2000), inject: true, reason: 'A gentle reminder will preserve the established pace.' }, messages);
    assert.equal(next.guidance.length, 700);
    assert.equal(next.sourceMessageCount, 1);
    assert.equal(next.scene.activity, 'tea');
    assert.equal(next.lastInject, true);
    assert.match(next.lastReason, /established pace/);
});

test('active beat persists, adapts, and advances without rewriting distant horizons', () => {
    const messages = [{ mes: 'What does Mara say?', is_user: true }];
    const starting = {
        ...defaultState(),
        turnCount: 3,
        activeBeat: { id: 'tea-talk', objective: 'Surface Mara’s concern.', nextAction: 'Let Mara begin answering.', completion: 'The concern is stated.', lifecycle: 'replace', reason: 'A direct question.', startedAtTurn: 3, updatedAtTurn: 3 },
        planHorizons: { items: planHorizons.items.map(item => ({ ...item, change: 'keep' })), deviation: { level: 'none', reason: 'On plan.' } },
    };
    const attemptedHorizons = planHorizons.items.map((item, index) => index === planHorizons.items.length - 1
        ? { ...item, direction: 'Remove the obligation from every future direction.', change: 'replace' }
        : { ...item, change: 'keep' });
    const kept = applyAnalysis(starting, { active_beat: { ...activeBeat, lifecycle: 'keep' }, plan_horizons: { items: attemptedHorizons, deviation: { level: 'minor', reason: 'The wording changed, not the direction.' } } }, messages);
    assert.equal(kept.activeBeat.id, 'tea-talk');
    assert.equal(kept.activeBeat.startedAtTurn, 3);
    assert.equal(kept.beatHistory.length, 0);
    assert.equal(kept.planHorizons.items.at(-1).direction, 'Keep the obligation available as one evolving long-term pressure.');

    const majorPivot = applyAnalysis(kept, { plan_horizons: { items: attemptedHorizons, deviation: { level: 'major', reason: 'The user explicitly rejected the obligation.' } } }, messages);
    assert.equal(majorPivot.planHorizons.items.at(-1).direction, 'Remove the obligation from every future direction.');

    const advanced = applyAnalysis(kept, { active_beat: { ...activeBeat, id: 'reaction', objective: 'Let the answer change the relationship.', lifecycle: 'advance' } }, [...messages, { mes: 'Mara explains the concern.', is_user: false }]);
    assert.equal(advanced.activeBeat.id, 'reaction');
    assert.equal(advanced.beatHistory.at(-1).id, 'tea-talk');
    assert.equal(advanced.beatHistory.at(-1).lifecycle, 'advance');
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

test('planner prompt enforces its hard budget while retaining priority context', () => {
    const messages = Array.from({ length: 40 }, (_, i) => ({ mes: 'x'.repeat(2000) + i, is_user: i % 2 === 0 }));
    const prompt = buildAnalysisPrompt(messages, { ...defaultState(), contextLedger: 'y'.repeat(4000) }, 'z'.repeat(2000), { description: 'd'.repeat(3500) }, { messageWindow: 24, maxPromptChars: 10000, continuityContext: 'c'.repeat(6000), hostContext: 'h'.repeat(8000), bootstrapScan: true });
    const parsed = JSON.parse(prompt);
    assert.ok(prompt.length <= 10000);
    assert.ok(parsed.messages.filter(item => item.kind === 'recent').length >= 6);
    assert.ok(parsed.messages.some(item => item.kind === 'recent' && item.index === 39));
    assert.ok(parsed.messages.some(item => item.kind === 'anchor' && item.index === 0));
    assert.equal(parsed.messages.find(item => item.index === 39).content, messages[39].mes);
});

test('latest turn stays complete by compacting redundant state and older excerpts first', () => {
    const latest = 'latest-action '.repeat(210);
    const messages = [...Array.from({ length: 12 }, (_, index) => ({ mes: `older-${index} ${'x'.repeat(1200)}`, is_user: index % 2 === 0 })), { mes: latest, is_user: true }];
    const state = {
        ...defaultState(),
        objectives: Array.from({ length: 8 }, (_, index) => ({ title: `thread-${index}`, detail: 'detail '.repeat(60), status: 'open' })),
        entities: Array.from({ length: 6 }, (_, index) => ({ name: `entity-${index}`, state: 'state '.repeat(40), location: 'somewhere', relevance: 'relevant' })),
        possibilities: Array.from({ length: 6 }, () => ({ description: 'possibility '.repeat(30), conditions: ['condition '.repeat(20)], force: 'moderate' })),
        activeBeat,
        planHorizons,
        contextLedger: 'ledger '.repeat(400),
    };
    const prompt = buildAnalysisPrompt(messages, state, '', {}, { messageWindow: 12, messageCharLimit: 700, maxPromptChars: 12000, bootstrapScan: true });
    const parsed = JSON.parse(prompt);
    assert.ok(prompt.length <= 12000);
    assert.equal(parsed.messages.at(-1).content, latest.trim());
});

test('hard budget also compacts a fully populated long-running planner state', () => {
    const long = 'x'.repeat(1000);
    const state = {
        ...defaultState(),
        objectives: Array.from({ length: 10 }, (_, index) => ({ title: `thread-${index}`, detail: long, status: 'open', source: long })),
        entities: Array.from({ length: 8 }, (_, index) => ({ name: `entity-${index}`, state: long, location: long, relevance: long, confidence: 'high', window: long })),
        possibilities: Array.from({ length: 6 }, () => ({ description: long, conditions: [long, long, long], force: 'moderate' })),
        activeBeat: { id: 'active', objective: long, nextAction: long, completion: long, lifecycle: 'keep', reason: long },
        planHorizons: { items: Array.from({ length: 10 }, (_, index) => ({ id: `horizon-${index}`, direction: long, timeframe: long, stability: index === 9 ? 'slow' : 'adaptive', conditions: [long], change: 'adjust', reason: long })), deviation: { level: 'minor', reason: long } },
        canonConstraints: Array.from({ length: 12 }, () => long),
        userNotes: Array.from({ length: 12 }, () => ({ kind: 'establish', text: long, at: 1 })),
        contextLedger: long.repeat(3),
    };
    const messages = Array.from({ length: 80 }, (_, index) => ({ mes: long.repeat(4) + index, is_user: index % 2 === 0 }));
    const prompt = buildAnalysisPrompt(messages, state, long, { scenario: long }, { messageWindow: 80, messageCharLimit: 4000, maxPromptChars: 8000, continuityContext: long.repeat(6), hostContext: long.repeat(8), bootstrapScan: true });
    assert.ok(prompt.length <= 8000);
    assert.equal(JSON.parse(prompt).messages.at(-1).index, 79);
});

test('planner excerpts remove generated scaffolding and preserve both ends of long prose', () => {
    const long = `<stat>\`\`\`private tracker\`\`\`</stat>${'A'.repeat(2000)} crucial ending`;
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: long, is_user: false }], defaultState(), '', {}, { messageCharLimit: 300 }));
    assert.doesNotMatch(prompt.messages[0].content, /private tracker|<stat>/);
    assert.match(prompt.messages[0].content, /^A+/);
    assert.match(prompt.messages[0].content, /crucial ending$/);
});

test('empty optional context is omitted from the planner payload', () => {
    const prompt = JSON.parse(buildAnalysisPrompt([{ mes: 'Tea', is_user: true }], defaultState()));
    assert.equal('user_instruction' in prompt, false);
    assert.equal('bootstrap' in prompt, false);
    assert.equal('optional_continuity_context' in prompt, false);
    assert.equal('optional_host_context' in prompt, false);
});
