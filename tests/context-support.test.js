import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalysisPrompt, SYSTEM, INCREMENTAL_SYSTEM, ANALYSIS_OUTPUT_CONTRACT, INCREMENTAL_ANALYSIS_OUTPUT_CONTRACT, ANALYSIS_SCHEMA, INCREMENTAL_ANALYSIS_SCHEMA } from '../extension/analysis.js';
import { defaultState, normalizeState, stateForPrompt } from '../extension/state.js';
import { fitPromptToBudget, plannerEvidenceAudit } from '../extension/prompt-budget.js';
import { plannerBudgets, normalizeInputBudget } from '../extension/planner-budgets.js';
import { compactSummarySources } from '../extension/summary-context.js';
import { relevantExcerpt } from '../extension/evidence-selection.js';
import { estimateTokenCount } from '../extension/token-budget.js';

const actor = name => ({ name, state: 'Departed for her night shift.', location: 'clinic', relevance: 'active', perspective: 'Values independence.', motivation: 'Keep her promise to patients.', knowledge: 'Knows the clinic.', constraints: 'Unwilling to return before finishing work.', agenda: 'Finish her work and go home.' });
const sources = Array.from({ length: 8 }, (_, i) => ({ label: `Record ${i}`, kind: 'summary', priority: 2, text: `Record ${i}. ${'The garden is calm. '.repeat(50)}Mira refused the invitation and left for her night shift. ${'The garden is calm. '.repeat(50)}` }));
const envelope = review => review
    ? `${SYSTEM}\n\n${ANALYSIS_OUTPUT_CONTRACT}\n${JSON.stringify(ANALYSIS_SCHEMA)}`
    : `${INCREMENTAL_SYSTEM}\n\n${INCREMENTAL_ANALYSIS_OUTPUT_CONTRACT}\n${JSON.stringify(INCREMENTAL_ANALYSIS_SCHEMA)}`;

test('tier budgets are configurable and respect the saved total ceiling', () => {
    assert.deepEqual(plannerBudgets(), { tier: 'routine', input: 10000, recent: 3000, summary: 1200 });
    assert.deepEqual(plannerBudgets({}, { fullContextPass: true }), { tier: 'review', input: 14000, recent: 4500, summary: 2400 });
    assert.deepEqual(plannerBudgets({}, { bootstrapScan: true }), { tier: 'rebuild', input: 16000, recent: 6000, summary: 4000 });
    assert.equal(plannerBudgets({ routineInputTokens: 13000 }).input, 13000);
    assert.equal(plannerBudgets({ maxPromptTokens: 9000, reviewInputTokens: 18000 }, { fullContextPass: true }).input, 9000);
    assert.equal(plannerBudgets({ recentContextTokens: 1000, summaryContextTokens: 1000 }).recent, 1000);
    assert.equal(normalizeInputBudget(-1), 9000);
    assert.equal(normalizeInputBudget(40000), 30000);
});

test('queried summary pools preserve whole middle facts instead of many scraps', () => {
    const pool = compactSummarySources(sources, 600, { query: 'Mira clinic' });
    assert.ok(pool.length <= 3);
    assert.ok(pool.every(item => item.text.includes('Mira refused the invitation and left for her night shift.')));
    assert.ok(pool.reduce((sum, item) => sum + item.includedTokens, 0) <= 600);
    const excerpt = relevantExcerpt('Ordinary routine. '.repeat(50) + 'Mira did not consent to return. ' + 'Ordinary routine. '.repeat(50), 60, 'Mira');
    assert.match(excerpt, /Mira did not consent to return\./);
    assert.ok(estimateTokenCount(excerpt) <= 60);
    const scenic = compactSummarySources(sources, 600, { query: 'Mira remains in the garden. The garden is calm.' });
    assert.ok(scenic.every(item => item.text.includes('Mira refused the invitation and left for her night shift.')));
    const pronoun = relevantExcerpt('Ordinary routine. '.repeat(60) + 'Mira received the invitation. She refused to join. ' + 'Ordinary routine. '.repeat(60), 60, 'Mira');
    assert.match(pronoun, /Mira received the invitation\./);
    assert.match(pronoun, /She refused to join\./);
    assert.equal(relevantExcerpt('Long record.', 0, 'record'), '');
});

test('active actor selection reaches past the last five stored NPCs without mutating storage', () => {
    const state = defaultState();
    state.entities = [actor('Mira'), ...Array.from({ length: 10 }, (_, i) => actor(`Other${i}`))];
    const before = JSON.stringify(state);
    const result = stateForPrompt(state, { query: 'I observe Mira.' });
    assert.equal(result.entities[0].name, 'Mira');
    assert.match(result.entities[0].constraints, /Unwilling to return/);
    assert.equal(JSON.stringify(state), before);
});

test('default complete envelopes retain realistic latest exchanges and actor boundaries', async () => {
    const state = defaultState();
    state.entities = [actor('Mira'), ...Array.from({ length: 4 }, (_, i) => actor(`Other${i}`))];
    const before = JSON.stringify(state);
    for (const length of [600, 1200, 1800, 2600]) for (const review of [false, true]) {
        const messages = [{ is_user: true, name: 'Ari', mes: 'I observe Mira.' }, { is_user: false, name: 'Narrator', mes: `Mira remains at the clinic. ${'The garden is calm. '.repeat(length / 5)}` }];
        const budgets = plannerBudgets({}, { fullContextPass: review });
        const fixedEnvelope = envelope(review);
        const prompt = await fitPromptToBudget({ fixedEnvelope, tokenBudget: budgets.input,
            buildPrompt: effectivePromptTokens => buildAnalysisPrompt(messages, state, '', {}, {
                incremental: !review, maxPromptTokens: budgets.input, effectivePromptTokens,
                recentContextTokens: budgets.recent, summaryContextTokens: budgets.summary,
                summarySources: compactSummarySources(sources, budgets.summary, { query: 'Mira' }),
            }),
        });
        const p = JSON.parse(prompt);
        assert.ok(estimateTokenCount(`${fixedEnvelope}\n${prompt}`) <= budgets.input);
        assert.equal(p.messages.find(item => item.index === 0).content, messages[0].mes);
        assert.equal(p.messages.find(item => item.index === 1).content, messages[1].mes.trim());
        assert.match(p.current.entities.find(item => item.name === 'Mira').constraints, /Unwilling to return/);
    }
    assert.equal(JSON.stringify(state), before);
});

test('small raw budgets reserve both roles even with a very long assistant reply', () => {
    const messages = [{ is_user: true, name: 'Ari', mes: 'I observe, but do not follow Mira.' }, { is_user: false, mes: 'The garden is calm. '.repeat(2000) }];
    const p = JSON.parse(buildAnalysisPrompt(messages, defaultState(), '', {}, { incremental: true, recentContextTokens: 1000, maxPromptTokens: 9000 }));
    assert.equal(p.messages.length, 2);
    assert.equal(p.messages[0].content, messages[0].mes);
    assert.ok(p.messages.reduce((sum, item) => sum + estimateTokenCount(item.content) + 24, 0) <= 1000);
});

test('active planner retrieves relevant older ordinary dialogue with indexed provenance', () => {
    const history = [
        { is_user: false, name: 'Mira', mes: 'Ordinary routine. '.repeat(70) + 'Mira refused the invitation and departed for the clinic shift. ' + 'Ordinary routine. '.repeat(70) },
        ...Array.from({ length: 30 }, (_, i) => ({ is_user: i % 2 === 0, name: 'Other', mes: 'The garden remains quiet. '.repeat(50) })),
        { is_user: true, name: 'Ari', mes: 'I observe Mira at the clinic.' },
        { is_user: false, name: 'Narrator', mes: 'The clinic door is closed. Mira is working inside.' },
    ];
    const p = JSON.parse(buildAnalysisPrompt(history, defaultState(), '', {}, { incremental: true, recentContextTokens: 1000, maxPromptTokens: 10000 }));
    const witness = p.historical_evidence.find(item => item.index === 0);
    assert.equal(witness.role, 'assistant');
    assert.equal(witness.name, 'Mira');
    assert.match(witness.content, /Mira refused the invitation and departed for the clinic shift\./);
    assert.ok(p.historical_evidence.length <= 2);
    const distant = [history[0], ...Array.from({ length: 450 }, () => ({ is_user: false, mes: 'Unrelated events.' })), ...history.slice(1)];
    const bounded = JSON.parse(buildAnalysisPrompt(distant, defaultState(), '', {}, { incremental: true, recentContextTokens: 1000, maxPromptTokens: 10000 }));
    assert.ok(!(bounded.historical_evidence || []).some(item => item.index === 0));
});

test('evidence audit counts the final prompt and survives state persistence', () => {
    const candidates = compactSummarySources(sources, 1200);
    const prompt = JSON.stringify({ summary_sources: [{ label: candidates[0].label, kind: 'summary', text: 'Mira left.' }], current: { entities: [actor('Mira')] }, messages: [{ content: 'I observe.' }], historical_evidence: [{ index: 0, content: 'Mira declined.' }] });
    const audit = plannerEvidenceAudit(prompt, candidates, { fixedEnvelope: 'system', tokenBudget: 10000, tier: 'routine' });
    assert.equal(audit.count, 1);
    assert.equal(audit.candidateCount, 8);
    assert.equal(audit.droppedLabels.length, 7);
    assert.equal(audit.includedTokens, estimateTokenCount('Mira left.'));
    assert.equal(audit.inputTokens, estimateTokenCount(`system\n${prompt}`));
    const saved = normalizeState({ ...defaultState(), summaryEvidence: { ...audit, scannedAt: 1 } }).summaryEvidence;
    assert.equal(saved.inputBudget, 10000);
    assert.equal(saved.historyCount, 1);
    assert.equal(saved.actorCount, 1);
    assert.equal(saved.droppedLabels.length, 7);
});
