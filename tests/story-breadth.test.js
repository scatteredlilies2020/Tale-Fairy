import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAnalysisPrompt, buildWorldPlannerPrompt, WORLD_PLANNER_SYSTEM, WORLD_PLANNER_SCHEMA, buildStoryEvidence, storyEvidenceQuery, SYSTEM, ANALYSIS_OUTPUT_CONTRACT, ANALYSIS_SCHEMA } from '../extension/analysis.js';
import { collectSummarySources } from '../extension/summary-context.js';
import { readContinuityBridge } from '../extension/continuity.js';
import { defaultState, fingerprintMessages } from '../extension/state.js';
import { fitPromptToBudget, plannerEvidenceAudit } from '../extension/prompt-budget.js';
import { plannerBudgetEnvelope } from '../extension/output-negotiation.js';
import { preparedWorldUsable, stampPreparedWorld } from '../extension/prepared-world.js';
import { estimateTokenCount } from '../extension/token-budget.js';

// These regressions verify evidence delivery and constraints; live creative quality is evaluated separately.
const bootstrap = { scenario: 'A long journey of discovery and friendship through independent communities; the current village is one stop.', persona: 'Ari is a traveller, not an investigator by profession.' };
function longChat() {
    const messages = Array.from({ length: 160 }, (_, index) => ({ is_user: index % 2 === 0, name: index % 2 === 0 ? 'Ari' : 'Narrator', mes: 'The garrison clerk studies the ledger beside the locked drawer. '.repeat(12) }));
    messages[0].mes = 'OOC: The journey will explore independent communities and relationships, not one conspiracy. Do not rush to the destination.';
    messages[19].mes = 'The embassy petition about the coastal academy remains pending under reference EM-73.';
    messages[54].mes = 'The agreement to help Luma restore the observatory remains outstanding.';
    messages[89].mes = 'The planned journey to the glass islands awaits the summer ferry.';
    messages.at(-2).mes = 'I listen to the clerk, but do not open the drawer.';
    messages.at(-1).mes = 'The clerk says the drawer remains locked. Luma is now at the observatory, not in this village.';
    return messages;
}

async function sourcePool(messages, storyEvidence) {
    const bridge = readContinuityBridge({ chatId: 'story' }, { version: 2, getContextSnapshot: () => ({
        chatId: 'story', status: 'current', prompt: 'Recursive Chronicle: The coastal academy supported the original journey. Luma intends to restore her observatory independently.',
        planningEvidence: [{ id: 'papers', category: 'states', text: 'The garrison ledger is being studied.', canonicalStatus: 'current' }],
    }) });
    return collectSummarySources({ chat: messages, extensionPrompts: {
        another_summary: { value: 'Summary: The glass islands have an independent ferry cooperative and seasonal festivals.' },
        continuity_memory_context: { value: 'A mirrored garrison ledger summary must not displace the bridge.' },
        'living-world-guide_context': { value: 'Old planner conjecture must not become evidence.' },
    }, chatMetadata: { session_recap: 'The embassy petition is still unanswered; the academy has its own interests.' },
    getWorldInfoPrompt: async () => ({ worldInfoString: 'The village garrison employs local clerks.' }),
    }, messages, {
        broad: true, query: storyEvidenceQuery(storyEvidence, bootstrap), tokenBudget: 4000,
        continuityContext: bridge.text, continuityEvidence: bridge.planningEvidence, continuitySummary: bridge.summaryText,
        referenceSources: [{ kind: 'character-reference', label: 'Scenario', priority: 0, text: bootstrap.scenario },
            { kind: 'world-info-reference', label: 'Distant lore', priority: 1, text: 'The summer ferry connects independent glassmakers on the islands.' }],
    });
}

for (const builder of [buildAnalysisPrompt, buildWorldPlannerPrompt])
for (const rebuild of [false, true]) test(`${builder.name}: ${rebuild ? 'rebuild' : 'first empty-state analysis'} keeps history, Continuity chronicle, other summaries and lore in the final bounded prompt`, async () => {
    const messages = longChat();
    const before = JSON.stringify(messages);
    const storyEvidence = buildStoryEvidence(messages);
    const sources = await sourcePool(messages, storyEvidence);
    for (const mode of ['prompt-only', 'json-schema']) {
        const fixedEnvelope = builder === buildWorldPlannerPrompt
            ? plannerBudgetEnvelope(WORLD_PLANNER_SYSTEM, WORLD_PLANNER_SCHEMA, mode)
            : plannerBudgetEnvelope(`${SYSTEM}\n${ANALYSIS_OUTPUT_CONTRACT}`, ANALYSIS_SCHEMA, mode);
        const prompt = await fitPromptToBudget({ fixedEnvelope, tokenBudget: 16000,
            buildPrompt: effectivePromptTokens => builder(messages, defaultState(), '', bootstrap, {
                bootstrapScan: true, fullRebuild: rebuild, incremental: false, storyEvidence,
                maxPromptTokens: 16000, effectivePromptTokens, recentContextTokens: 12000, summaryContextTokens: 4000, summarySources: sources,
            }),
        });
        const p = JSON.parse(prompt);
        assert.ok(estimateTokenCount(`${fixedEnvelope}\n${prompt}`) <= 16000);
        assert.equal(p.story_evidence.timeline[0].range[0], 0);
        assert.equal(p.story_evidence.timeline.at(-1).range[1], messages.length - 1);
        assert.match(p.preparation_brief, /if the current investigation\/problem vanished/);
        const historical = JSON.stringify(p.story_evidence);
        assert.match(historical, /EM-73/);
        assert.match(historical, /observatory/);
        assert.match(historical, /glass islands/);
        assert.match(historical, /independent communities/);
        assert.match(p.messages.find(item => item.index === messages.length - 2).content, /do not open the drawer/);
        assert.match(p.messages.find(item => item.index === messages.length - 1).content, /not in this village/);
        const included = p.summary_sources;
        for (const kind of ['continuity-memory', 'extension-summary', 'chat-summary', 'world-info-reference', 'character-reference']) {
            assert.ok(included.some(item => item.kind === kind), `Missing ${kind} in ${mode}`);
        }
        assert.match(included.find(item => item.kind === 'continuity-memory').text, /coastal academy/);
        assert.match(included.find(item => item.kind === 'extension-summary').text, /ferry cooperative/);
        assert.doesNotMatch(prompt, /Old planner conjecture|mirrored garrison ledger summary/);
        assert.equal(plannerEvidenceAudit(prompt, sources).storyMessageCount, messages.length);
    }
    assert.equal(JSON.stringify(messages), before);
});

for (const builder of [buildAnalysisPrompt, buildWorldPlannerPrompt]) test(`${builder.name}: empty transcript initialization retains supplied setting and summary evidence without inventing history`, async () => {
    const messages = [];
    const storyEvidence = buildStoryEvidence(messages);
    const sources = await sourcePool(messages, storyEvidence);
    const p = JSON.parse(builder(messages, defaultState(), '', bootstrap, { bootstrapScan: true, summarySources: sources, storyEvidence }));
    assert.deepEqual(p.story_evidence.timeline, []);
    assert.deepEqual(p.story_evidence.open_threads, []);
    assert.match((p.rp_reference || p.bootstrap).scenario, /long journey/);
    assert.match(p.story_evidence.instruction, /never fabricate a past/);
    assert.ok(p.summary_sources.some(item => item.kind === 'world-info'));
});

test('later cancellations and changed branches do not revive old unresolved candidates', () => {
    const messages = longChat();
    messages.push({ is_user: true, mes: 'OOC: The embassy petition about the coastal academy EM-73 is cancelled.' });
    const evidence = buildStoryEvidence(messages);
    assert.ok(!evidence.openThreads.some(item => item.content.includes('EM-73')));
    assert.match(JSON.stringify(evidence.timeline), /cancelled/);
    const edited = messages.map(item => ({ ...item, mes: item.mes.replaceAll('EM-73', 'NEW-81').replaceAll('coastal academy', 'mountain school') }));
    assert.doesNotMatch(JSON.stringify(buildStoryEvidence(edited)), /EM-73|coastal academy/);
});

test('routine deltas do not acquire a whole-history scan or disturb the existing notebook', () => {
    const state = defaultState();
    const before = JSON.stringify(state);
    const p = JSON.parse(buildAnalysisPrompt(longChat(), state, '', bootstrap, { incremental: true, maxPromptTokens: 6000 }));
    assert.equal(p.story_evidence, undefined);
    assert.equal(JSON.stringify(state), before);
});

test('broad source discovery works without Continuity and still respects the disabled integration', async () => {
    const sources = await collectSummarySources({ extensionPrompts: {
        continuity_memory_context: { value: 'A disabled memory snapshot must not appear.' },
        other_summary: { value: 'Summary: The university and ferry cooperative operate independently.' },
    } }, [], { broad: true, includeContinuity: false, continuityContext: 'A disabled memory snapshot must not appear.', tokenBudget: 1000 });
    assert.match(JSON.stringify(sources), /ferry cooperative/);
    assert.doesNotMatch(JSON.stringify(sources), /disabled memory snapshot/);
});

test('the additional Continuity chronicle cannot bypass chat identity or freshness checks', () => {
    for (const snapshot of [
        { chatId: 'another-story', status: 'current' },
        { chatId: 'story', status: 'stale' },
    ]) {
        const read = readContinuityBridge({ chatId: 'story' }, { version: 2, getContextSnapshot: () => ({
            ...snapshot, prompt: 'A discarded branch has an entirely different ending.',
            planningEvidence: [{ text: 'Discarded facts.' }],
        }) });
        assert.equal(read.text, '');
        assert.equal(read.summaryText, '');
        assert.deepEqual(read.planningEvidence, []);
    }
});

test('original era/setup survives long-chat compaction while later corrections remain authoritative', () => {
    const messages = longChat();
    messages[0].mes = 'Timeline: During the ten-year journey, before the tyrant is defeated. The expedition has just departed the capital. ' + 'The farewell crowd cheers. '.repeat(200);
    const p = JSON.parse(buildAnalysisPrompt(messages, defaultState(), '', bootstrap, { bootstrapScan: true, maxPromptTokens: 16000, effectivePromptTokens: 6500 }));
    assert.match(p.story_evidence.opening.content, /before the tyrant is defeated/);
    assert.match(p.story_evidence.instruction, /later explicit edits\/corrections/);
});

test('a notebook prepared from a truly empty transcript remains usable after the first append with matching setup', () => {
    const board = stampPreparedWorld({ overview: 'Explore independent communities.', items: [], focus: [] }, {
        chatId: 'story', inputsKey: 'setup', fingerprint: fingerprintMessages([]), messageCount: 0,
    });
    const options = { chatId: 'story', inputsKey: 'setup', messages: [{ mes: 'The journey begins.' }], fingerprint: fingerprintMessages };
    assert.equal(preparedWorldUsable(board, options), true);
    assert.equal(preparedWorldUsable(board, { ...options, inputsKey: 'changed-setup' }), false);
    assert.equal(preparedWorldUsable(board, { ...options, chatId: 'another-story' }), false);
});

// Exercise the runtime's own fitting wrapper, including a provider tokenizer
// that measures more tokens than the local estimate.
test('production budget wrapper delivers broader review evidence within the measured ceiling', async () => {
    const runtime = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
    const wrapper = runtime.match(/async function buildTokenBudgetedAnalysisPrompt\([^]*?^}/m)[0];
    const fixedEnvelope = plannerBudgetEnvelope(WORLD_PLANNER_SYSTEM, WORLD_PLANNER_SCHEMA, 'prompt-only');
    const measured = text => Math.ceil(estimateTokenCount(text) * 1.2);
    const build = new Function('currentContext', 'fitPromptToBudget', 'analysisBudgetEnvelope', 'buildWorldPlannerPrompt',
        `${wrapper}; return buildTokenBudgetedAnalysisPrompt;`)(
        () => ({ getTokenCountAsync: async text => measured(text) }), fitPromptToBudget, () => fixedEnvelope, buildWorldPlannerPrompt);
    const messages = longChat();
    const evidence = buildStoryEvidence(messages);
    const sources = await sourcePool(messages, evidence);
    const prompt = await build(messages, defaultState(), '', bootstrap, {
        incremental: false, bootstrapScan: false, maxPromptTokens: 14000,
        recentContextTokens: 4500, summaryContextTokens: 2400, summarySources: sources, storyEvidence: evidence,
    });
    const payload = JSON.parse(prompt);
    assert.equal(payload.task, 'review_wider_developments');
    assert.ok(measured(`${fixedEnvelope}\n${prompt}`) <= 14000);
    assert.equal(payload.story_evidence.timeline.at(-1).range[1], messages.length - 1);
    assert.match(JSON.stringify(payload.story_evidence), /EM-73/);
    for (const kind of ['continuity-memory', 'extension-summary', 'chat-summary', 'world-info-reference', 'character-reference']) {
        assert.ok(payload.summary_sources.some(source => source.kind === kind), `Missing ${kind}`);
    }
    assert.match(payload.messages.at(-1).content, /not in this village/);
});
