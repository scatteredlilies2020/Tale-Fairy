import test from 'node:test';
import assert from 'node:assert/strict';
import { leadingGeneratedStatusSummary, sceneStatus } from '../extension/transcript-status.js';
import { buildAnalysisPrompt, INCREMENTAL_SYSTEM, INCREMENTAL_ANALYSIS_OUTPUT_CONTRACT, INCREMENTAL_ANALYSIS_SCHEMA } from '../extension/analysis.js';
import { buildPlotAnchor } from '../extension/generation-context.js';
import { defaultState } from '../extension/state.js';
import { fitPromptToBudget } from '../extension/prompt-budget.js';

const panel = '<stat>\n```\nTime & Weather = Date: 04.19.0490 | Time: 10:50 AM; late morning\nLocation = Tur Bridge village | miller\'s common room\nCurrent Beat = The party begins a hot meal\nPsyche = Mira | examine the report\nIlan | finish his meal\nNora | listen\nCharacters = Mira | mage | Ilan | soldier\n```\n</stat>';
const body = 'Mira says the two soldiers and the warden were deceived. Ilan is one of those soldiers. They continue their meal.';

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
    assert.match(anchor, /Scene status from accepted reply/);
    assert.match(anchor, /10:50 AM/);
    assert.match(anchor, /miller's common room/);
    assert.match(anchor, /later explicit user changes take priority/);
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
