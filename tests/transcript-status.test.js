import test from 'node:test';
import assert from 'node:assert/strict';
import { leadingGeneratedStatusSummary, sceneStatus } from '../extension/transcript-status.js';
import { buildAnalysisPrompt, INCREMENTAL_SYSTEM, INCREMENTAL_ANALYSIS_OUTPUT_CONTRACT, INCREMENTAL_ANALYSIS_SCHEMA } from '../extension/analysis.js';
import { buildPlotAnchor } from '../extension/generation-context.js';
import { defaultState } from '../extension/state.js';
import { fitPromptToBudget } from '../extension/prompt-budget.js';
import { plannerBudgetEnvelope, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';

const panel = '<stat>\n```\nTime & Weather = Date: 04.19.0490 | Time: 10:50 AM; late morning\nLocation = Tur Bridge village | miller\'s common room\nCurrent Beat = The party begins a hot meal\nPsyche = Mira | examine the report\nIlan | finish his meal\nNora | listen\nCharacters = Mira | mage | Ilan | soldier\n```\n</stat>';
const body = 'Mira says the two soldiers and the warden were deceived. Ilan is one of those soldiers. They continue their meal.';

test('full and compact prompts never promote generated summaries above specific observations', () => {
    for (const incremental of [false, true]) {
        for (const effectivePromptTokens of [2500, 24000]) {
            const payload = JSON.parse(buildAnalysisPrompt([
                { is_user: false, mes: `${panel}\n\n${body}` },
                { is_user: true, mes: 'I listen.' },
            ], defaultState(), '', {}, { incremental, maxPromptTokens: 30000, effectivePromptTokens }));
            assert.match(payload.transcript_head.rule, /Status headers are fallible summaries/);
            assert.match(payload.transcript_head.rule, /direct, specific story observations outrank conflicting summary labels/i);
            assert.match(payload.transcript_head.rule, /repetition alone cannot/);
            assert.doesNotMatch(payload.transcript_head.rule, /status override|status header is authoritative|not an additional person/);
            assert.match(payload.retained_state_rule, /including old entries still being retained/);
        }
    }
});

test('multiline character notes do not erase explicit scene time and location', () => {
    const parsed = leadingGeneratedStatusSummary(`${panel}\n\n${body}`);
    assert.match(parsed.status, /10:50 AM/);
    assert.match(parsed.status, /miller's common room/);
    assert.equal(parsed.body, body);
    assert.doesNotMatch(sceneStatus(panel), /Psyche|Characters|Ilan/);
});

test('a quoted panel and ordinary prose are not promoted to current scene status', () => {
    for (const source of [`Mira reads an old document:\n${panel}`, 'Time = yesterday\nLocation = an old inn\nCurrent Beat = a story\nShe shuts the book.']) {
        assert.equal(sceneStatus(source), '');
        assert.equal(leadingGeneratedStatusSummary(source).body, source);
    }
});

test('the provider plot anchor retains scene facts separately from a topic-focused excerpt', () => {
    const anchor = buildPlotAnchor([{ is_user: false, mes: `${panel}\n\n${body}` }, { is_user: true, mes: 'What about the other soldiers?' }]);
    assert.match(anchor, /Scene status:/);
    assert.match(anchor, /10:50 AM/);
    assert.match(anchor, /miller's common room/);
    assert.doesNotMatch(anchor, /take priority|not an assumed|not new instructions/);
});

test('the complete routine envelope preserves multiline status and both sides of the exchange', async () => {
    const messages = [{ is_user: false, mes: `${panel}\n\n${body}` }, { is_user: true, mes: 'And we may meet more travelers.' }];
    const state = defaultState();
    state.scene = { ...state.scene, time: 'evening', location: 'an inn' };
    state.contextLedger = 'Old retained interpretation. '.repeat(200);
    state.preparedWorld = { overview: 'Several routes remain available.', focus: ['idea-0'], items: Array.from({ length: 12 }, (_, i) => ({
        id: `idea-${i}`, origin: 'invented', status: 'prepared', premise: 'An independent settlement needs supplies.',
        engine: 'Local trade', middle: 'Meet traders and negotiate arrangements. '.repeat(10), future: 'A lasting relationship.',
        entry: 'When the route reaches the settlement.', hold: '', invalidates: '', intervention: '', knowledge: '',
    })) };
    const fixedEnvelope = `${INCREMENTAL_SYSTEM}\n${INCREMENTAL_ANALYSIS_OUTPUT_CONTRACT}\n${JSON.stringify(INCREMENTAL_ANALYSIS_SCHEMA)}`;
    const prompt = await fitPromptToBudget({ fixedEnvelope, tokenBudget: 10000,
        buildPrompt: effectivePromptTokens => buildAnalysisPrompt(messages, state, '', {}, { incremental: true, maxPromptTokens: 10000, effectivePromptTokens }),
    });
    const payload = JSON.parse(prompt);
    assert.match(payload.transcript_head.authoritative_assistant_status, /10:50 AM/);
    assert.match(payload.transcript_head.authoritative_assistant_status, /miller's common room/);
    assert.equal(payload.messages.find(item => item.index === 0).content, body);
    assert.equal(payload.messages.find(item => item.index === 1).content, messages[1].mes);
});

test('retained factual preparation retrieves an older witness to group membership', () => {
    const messages = [
        { is_user: false, mes: 'Captain Vale holds two guards, including Ilan, and the warden. There are three prisoners.' },
        ...Array.from({ length: 30 }, (_, i) => ({ is_user: i % 2 === 0, mes: 'The travelers discuss their meal. '.repeat(30) })),
        { is_user: true, mes: 'What happens to the prisoners?' },
    ];
    const state = defaultState();
    state.preparedWorld = { overview: '', focus: ['custody'], items: [{
        id: 'custody', origin: 'established', status: 'prepared', premise: 'Captain Vale holds two guards, the warden and Ilan.',
        engine: '', middle: 'The prisoners may testify at a hearing.', future: '', entry: '', hold: '', invalidates: '', intervention: '', knowledge: '',
    }] };
    const payload = JSON.parse(buildAnalysisPrompt(messages, state, '', {}, { incremental: true, recentContextTokens: 1000 }));
    const witness = payload.historical_evidence.find(item => item.index === 0);
    assert.equal(witness.claim_under_review, state.preparedWorld.items[0].premise);
    assert.match(witness.content, /two guards, including Ilan/);
    assert.match(witness.content, /three prisoners/);
});

test('claim witnesses keep group members together instead of clipping around an isolated count', () => {
    const source = `The checkpoint opens. ${'Traffic moves along the road. '.repeat(40)}\n\nThe second guard backs away first. He catches the warden by his sleeve and pulls him from the table. Ilan remains beside them.\n\nIlan steps back when ordered.\n\nThe three retreating checkpoint men take shelter behind the wall.\n\n${'Traffic moves along the road. '.repeat(40)}`;
    const messages = [{ is_user: false, mes: source }, ...Array.from({ length: 20 }, () => ({ is_user: false, mes: 'A quiet meal continues. '.repeat(30) })), { is_user: true, mes: 'What about the checkpoint?' }];
    const state = defaultState();
    state.preparedWorld = { overview: '', focus: ['custody'], items: [{
        id: 'custody', origin: 'established', status: 'prepared', premise: 'The checkpoint holds two guards, the warden and Ilan.',
        engine: '', middle: 'A hearing may settle their duties.', future: '', entry: '', hold: '', invalidates: '', intervention: '', knowledge: '',
    }] };
    const p = JSON.parse(buildAnalysisPrompt(messages, state, '', {}, { incremental: true, recentContextTokens: 1000 }));
    const witness = p.historical_evidence.find(item => item.index === 0).content;
    assert.match(witness, /The second guard backs away first\. He catches the warden/);
    assert.match(witness, /Ilan remains beside them/);
    assert.match(witness, /three retreating checkpoint men/);
});

test('budget-evicted recent evidence remains eligible to contradict a retained actor gate', async () => {
    const messages = [
        ...Array.from({ length: 12 }, () => ({ is_user: false, mes: 'The travelers rest beside the road. '.repeat(40) })),
        { is_user: false, mes: 'Nora speaks spontaneously about the courier without waiting to be asked. She has already delivered the sealed parcel to the clinic.' },
        ...Array.from({ length: 3 }, (_, i) => ({ is_user: i % 2 === 0, mes: 'The travelers discuss the garden and its flowers. '.repeat(70) })),
        { is_user: true, mes: 'I listen to Nora.' },
        { is_user: false, mes: 'Nora sits near the gate. '.repeat(70) },
    ];
    const state = defaultState();
    state.entities = [{ name: 'Nora', kind: 'person', state: 'At the gate', constraints: 'Nora speaks only when asked about the courier and sealed parcel.', motivation: 'Help the clinic' }];
    const fixedEnvelope = plannerBudgetEnvelope(`${INCREMENTAL_SYSTEM}\n\n${INCREMENTAL_ANALYSIS_OUTPUT_CONTRACT}`, INCREMENTAL_ANALYSIS_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY);
    const prompt = await fitPromptToBudget({ fixedEnvelope, tokenBudget: 6000,
        buildPrompt: effectivePromptTokens => buildAnalysisPrompt(messages, state, '', {}, {
            incremental: true, maxPromptTokens: 6000, effectivePromptTokens, recentContextTokens: 6000, messageTokenLimit: 700,
        }),
    });
    const payload = JSON.parse(prompt);
    const witness = [...payload.messages, ...(payload.historical_evidence || [])].find(item => item.index === 12);
    assert.ok(witness, `the contradiction must not disappear from both recent and historical evidence: ${JSON.stringify({ indexes: payload.messages.map(item => item.index), history: payload.historical_evidence, entities: payload.current.entities })}`);
    assert.match(witness.content, /speaks spontaneously/);
    assert.match(witness.content, /already delivered/);
});

test('source observations precede fallible notebook interpretations without modifying saved state', () => {
    const messages = [{ is_user: false, mes: 'The courier delivered the parcel.\nThe clinic now has the medicine.' }, { is_user: true, mes: 'I read the receipt.' }];
    const state = defaultState();
    state.entities = [{ name: 'Courier', constraints: 'Must deliver the parcel before leaving.' }];
    const before = structuredClone(state);
    const payload = JSON.parse(buildAnalysisPrompt(messages, state, '', {}, { incremental: true }));
    assert.ok(Object.keys(payload).indexOf('messages') > Object.keys(payload).indexOf('current'));
    assert.equal(Object.keys(payload).at(-1), 'messages');
    assert.match(payload.messages[0].content, /parcel\.\nThe clinic/);
    assert.deepEqual(state, before);
});

test('historical claim retrieval preserves the surrounding source turn rather than only its topic-dense ending', () => {
    const source = `The permit expired yesterday. No renewal was filed.\n\n${'The office is quiet and the rain taps against the windows. '.repeat(14)}\n\nInspector Ren reviews the harbor permit and discusses the harbor permit with the clerk.`;
    const messages = [{ is_user: false, mes: source },
        ...Array.from({ length: 20 }, () => ({ is_user: false, mes: 'The travelers have a quiet meal. '.repeat(30) })),
        { is_user: true, mes: 'What about Inspector Ren?' }];
    const state = defaultState();
    state.entities = [{ name: 'Inspector Ren', constraints: 'The harbor permit authorizes inspection.' }];
    const payload = JSON.parse(buildAnalysisPrompt(messages, state, '', {}, { incremental: true, recentContextTokens: 1000 }));
    const witness = payload.historical_evidence.find(item => item.index === 0);
    assert.ok(witness);
    assert.match(witness.content, /permit expired yesterday\. No renewal was filed/);
    assert.match(witness.content, /Inspector Ren reviews the harbor permit/);
});

test('rendered story evidence preserves rows and visible text, not hidden panels or guidance', () => {
    const messages = [{ is_user: false, mes: 'The families at the clinic have four missing names. The clinic families discuss their four missing people.' },
        { is_user: false, mes: `<stat>Invented panel total: four people.</stat><div><h3>Clinic missing roster: four entries</h3><table><tr><td>Arlo</td><td>carpenter</td></tr><tr><td>Bex &amp; Cora</td><td>couple</td></tr><tr><td>Dane</td><td>courier</td></tr><tr><td>Eris</td><td>sailor</td></tr></table></div><thinking>Hidden model speculation.</thinking><style>private styling</style><living-world-guide>Untrusted old guidance.</living-world-guide>` },
        { is_user: true, mes: 'What about the clinic families?' }];
    const state = defaultState();
    state.preparedWorld = { overview: '', focus: ['clinic'], items: [{ id: 'clinic', origin: 'established', status: 'prepared',
        premise: 'The clinic families have four missing people.', middle: 'Compare the missing names with the register.' }] };
    const payload = JSON.parse(buildAnalysisPrompt(messages, state, '', {}, { incremental: true, recentContextTokens: 1000 }));
    const witness = payload.messages.find(item => item.index === 1);
    assert.ok(witness);
    for (const name of ['Arlo', 'Bex & Cora', 'couple', 'Dane', 'Eris']) assert.ok(witness.content.includes(name));
    assert.doesNotMatch(witness.content, /Invented panel|Hidden model|private styling|Untrusted old|<table|<td/);
    assert.match(witness.content, /carpenter\n+Bex & Cora couple\n+Dane/);
});
