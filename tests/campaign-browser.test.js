import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVELOPMENT_CONTRACT } from '../extension/story-budget.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { generationHarness } from './helpers/generation-harness.js';
import { defaultState, defaultPlannerState, loadPlannerState, saveState, STATE_KEY } from '../extension/state.js';
import { buildStoryEvidence } from '../extension/analysis.js';
import { storyInput } from '../extension/bounded-story.js';
import { campaignEvidenceMessages, campaignReviewWindow } from '../extension/campaign-evidence.js';
import { completionText } from '../extension/completion-response.js';
import { readEvidenceProviders, evidenceRevisionKey, registerEvidenceProvider } from '../extension/evidence-providers.js';
import { readCampaignContinuity } from '../extension/campaign-continuity.js';
import { materialHorizons } from '../extension/selected-material.js';
import { extractTaleFairyContext } from '../extension/request-injection.js';
import { legacyPlotInputKey, GENERATION_CONTEXT_KEY, generationContextEntries } from '../extension/generation-context.js';
import { campaignPayload, campaignPayloadBudget, objectiveGuidancePayload, legacyCampaignPayload } from '../extension/campaign-planner.js';

const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
test('notebook presents integrated horizons once and distinguishes quiet from legacy selection', () => {
    const scope = vm.createContext({});
    vm.runInContext(source.match(/function campaignSelectionSummary\([^]*?^}/m)[0], scope);
    const entry = { subjectIds: ['music', 'travel'], available: 'Shared resources.', developing: 'Recurring exchange.', lasting: 'Wider relationships.' };
    const summary = scope.campaignSelectionSummary({ selectedMaterial: [entry] });
    assert.equal(summary, 'SELECTED STORY HORIZONS\nAvailable circumstances: Shared resources.\nMid-term possibilities: Recurring exchange.\nLong-term possibilities: Wider relationships.');
    assert.doesNotMatch(summary, /subjectIds|music|travel|injected/);
    assert.match(scope.campaignSelectionSummary({ selectedMaterial: [] }), /No additional development selected/);
    assert.equal(scope.campaignSelectionSummary({}), '');
    assert.match(source, /campaignSelectionSummary\(preparation\),/);
});

test('notebook labels background as private and provisional, separate from selected horizons', () => {
    const scope = vm.createContext({});
    vm.runInContext(source.match(/function campaignBackgroundSummary\([^]*?^}/m)[0], scope);
    assert.equal(scope.campaignBackgroundSummary(), '');
    assert.equal(scope.campaignBackgroundSummary({ unfolding: 'Repairs could continue.', basis: 'Two days passed.',
        access: { route: 'none', basis: 'No local contact.' } }),
    'Private background (provisional): Repairs could continue.\nGrounding / time: Two days passed.\nAccess · none: No local contact.');
});

const settle = () => new Promise(resolve => setImmediate(resolve));
const memorySnapshot = () => ({ chatId: 'story', status: 'current', revision: 1,
    coverage: { throughMessageIndex: 0, signature: 'current-chat-signature' },
    prompt: 'Private Chronicle: the prior engagement ended.', planningEvidence: [{ id: 'memory-music',
        text: 'Jo is still composing; no new engagement was accepted.', category: 'states', canonicalStatus: 'current',
        sourceRange: { chatKey: 'character:0:chat:story', from: 0, to: 0 } }] });
const design = { plan: { direction: 'A changing body of original work.',
    threads: 'PRIVATE an ensemble explores music and life between engagements. No established franchise.',
    consequences: [], developments: [{ id: 'r1-music', kind: 'arc', owner: 'Jo', control: 'npc',
        question: 'Compose a piece worth keeping.', initiative: 'Jo works on contrasting arrangements.',
        resolution: 'The ensemble adopts or shelves this piece.', beyond: 'Other pieces and shared authorship remain possible.',
        access: { route: 'contact', basis: 'PRIVATE the ensemble is together after the show.' } }] },
    exits: [], observations: [],
    selected_material: [{ subjectIds: ['r1-music'], available: 'An original tune has potential for contrasting arrangements.',
        developing: 'Different arrangements could change whose contribution the group values across later sessions.',
        lasting: 'The repertoire could support shared authorship and distinct musical identities.' }] };

// Construct authentic legacy metadata for compatibility tests, not a malformed
// new state with its required mirrors removed.
function legacyPreparation(preparation) {
    const result = structuredClone(preparation);
    delete result.workingPlanVersion; delete result.workingPlan; delete result.planEvidence;
    result.realization = Object.fromEntries(result.developments.map(d => [d.id, { episodes: {}, playable: [] }]));
    return result;
}

function plannedResponse({ prompt }) {
    const input = JSON.parse(prompt), value = structuredClone(design);
    // Rebuilds discard drafts, not the monotonically increasing revision/id space.
    if (!input.previous_plan.developments.length) {
        value.plan.developments[0].id = `${input.new_id_prefix}music`;
        value.selected_material[0].subjectIds = [value.plan.developments[0].id];
    }
    return { choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] };
}

function browser(send = async args => plannedResponse(args), initialState = defaultState()) {
    const h = generationHarness([{ is_user: false, name: 'Mara', mes: 'The show ended.' }, { is_user: true, name: 'Neri', mes: 'I help pack.' }],
        initialState);
    const requests = [], shared = new Map();
    Object.assign(h.settings, { maxPromptTokens: 14000, fullReviewInterval: 3, analysisSource: 'direct', analysisModel: 'test', analysisReasoningMode: 'low' });
    Object.assign(h.scope, { buildStoryEvidence, campaignEvidenceMessages, campaignReviewWindow, completionText, readCampaignContinuity, readEvidenceProviders, evidenceRevisionKey,
        loadState: loadPlannerState, defaultState: defaultPlannerState,
        plannerStorage: () => ({ getItem: key => shared.get(key), setItem: (key, value) => shared.set(key, value) }),
        withPlannerTabLock: (_id, task) => task(),
        requestAnalysisOnce: async (prompt, signal, meta, spec) => {
            requests.push({ prompt, signal, meta, spec });
            return spec.parseResponse(await send({ prompt, signal, meta, spec }));
        },
    });
    for (const name of ['emptyGuidancePreview', 'showCampaignPhase', 'readCampaignSnapshot', 'buildCampaignHostInput', 'saveCampaignAttempt', 'campaignCompletion', 'runCampaignAnalysis', 'analyzeCampaignNow', 'startCampaignPlanning', 'applyCampaignInstruction', 'rebuildGuideState', 'analyzeNow']) {
        vm.runInContext(source.match(new RegExp(`(?:export )?(?:async )?function ${name}\\([^]*?^}`, 'm'))[0].replace(/^export /u, ''), h.scope);
    }
    return { ...h, requests, shared };
}

function emptyPreview(h) {
    const state = h.state();
    const options = h.scope.guideSelectionOptions(state, h.context);
    assert.equal(h.scope.buildPromptPayload(state, { ...options, enabled: h.settings.enabled, generationType: h.scope.activeGenerationType }), '');
    return h.scope.emptyGuidancePreview(state, options, h.context);
}

test('empty writer preview explains expired guidance and the rejected refresh', async () => {
    let response = structuredClone(design);
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(response) }, finish_reason: 'stop' }] }));
    h.settings.fullReviewInterval = 12;
    await h.scope.analyzeCampaignNow({ manual: true });
    for (let i = 0; i < 4; i++) h.context.chat.push({ is_user: false, name: 'Mara', mes: `Later exchange ${i}.` });
    response.plan.developments[0].initiative = '音'.repeat(400);
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.state().campaignPreparation.revision, 1);
    const preview = emptyPreview(h);
    assert.match(preview, /refresh after 4 assistant replies/);
    assert.match(preview, /Latest planning attempt failed: Working plan exceeds 1200 tokens/);
    assert.doesNotMatch(preview, /Awaiting current context|Preparing context/);
    assert.match(preview, /Use Guide now/);

    h.context.chat[0].mes = 'The original scene was edited.';
    assert.match(emptyPreview(h), /does not match the current story context/);
    h.context.chatMetadata.taleFairyCampaignAttempt.chatId = 'another-chat';
    assert.doesNotMatch(emptyPreview(h), /Latest planning attempt failed/);
});

test('empty writer preview distinguishes quiet selection, missing preparation and active campaign planning', async () => {
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify({ ...design, selected_material: [] }) }, finish_reason: 'stop' }] }));
    assert.match(emptyPreview(h), /No completed preparation is available/);
    h.scope.campaignHostWork = { chatId: 'story' };
    assert.equal(emptyPreview(h), 'Preparing context in the background.');
    h.scope.campaignHostWork = null;
    h.scope.campaignSession = { pending: Promise.resolve() };
    assert.equal(emptyPreview(h), 'Preparing context in the background.');
    h.scope.campaignSession = null;
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(emptyPreview(h), 'Planning complete. No additional story development selected for this request.');
    h.settings.enabled = false;
    assert.equal(emptyPreview(h), 'Injection inactive for this request.');
});

test('notebook distinguishes estimated writer cap from preserved author-only overflow', () => {
    const scope = vm.createContext({ campaignPayloadBudget });
    vm.runInContext(source.match(/function campaignBudgetSummary\([^]*?^}/m)[0], scope);
    assert.match(scope.campaignBudgetSummary(null, []), /estimated 0\/1000/);
    const note = 'Explicit instruction. '.repeat(700);
    assert.match(scope.campaignBudgetSummary(null, [note]), /Author instructions alone exceed.*remain verbatim/);
});

test('oversized writer material stays rejected after one automatic correction', async () => {
    const value = structuredClone(design);
    for (const key of ['available', 'developing', 'lasting']) value.selected_material[0][key] = '音'.repeat(800);
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2);
    assert.equal(h.state().campaignPreparation, null);
    assert.match(h.statuses.at(-1), /600 tokens/);
    assert.equal(h.prepare().payload, '');
});

test('host ignores whole lorebooks without changing source books or fingerprints', async () => {
    const h = browser();
    h.settings.maxPromptTokens = 16000;
    const entries = Object.fromEntries(Array.from({ length: 37 }, (_, uid) => [uid, {
        uid, key: ['Harbor'], content: `District ${uid}: boats and homes remain available.`,
        extensions: { editorOnly: 'unused setting '.repeat(300) },
    }]));
    const book = { entries, originalData: { entries } };
    const before = structuredClone(book);
    h.scope.selected_world_info = ['City'];
    h.scope.worldInfoCache.set('City', book);
    const referenceHash = h.scope.readCampaignSnapshot().referenceHash;
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 1);
    assert.equal(h.state().campaignPreparation.revision, 1);
    const payload = JSON.parse(h.requests[0].prompt);
    assert.equal(payload.source_reference.worldBooks, undefined);
    assert.doesNotMatch(h.requests[0].prompt, /District 0|unused setting/);
    assert.deepEqual(book, before);
    assert.equal(h.scope.readCampaignSnapshot().referenceHash, referenceHash);
    delete h.context.chatMetadata[GENERATION_CONTEXT_KEY];
    h.scope.generationGuideSelection = null;
    h.prepare();
    assert.equal(h.statuses.at(-1), 'Plot preparation ready for this request');
});

test('host saves a witnessed consequence without an episode ledger or another request', async () => {
    const value = structuredClone(design);
    value.plan.consequences = [{ id: 'show', text: 'The show ended.' }];
    value.observations = [{ id: 'show', evidence: [{ index: 0, span: 0 }] }];
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 1);
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.equal(h.state().campaignPreparation.planEvidence.show.witnesses[0].quote, 'The show ended.');
    assert.equal(h.state().campaignPreparation.realization, undefined);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'complete');
});

test('initial budget failure reports no plan and generation does not retain a preparing label', async () => {
    const h = browser();
    h.context.chat.push({ is_user: true, name: 'Neri', mes: 'Protected player contribution. '.repeat(10000) });
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 0);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'failed');
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.requestCount, 0);
    assert.match(h.statuses.at(-1), /^No preparation available · Planner input .* exceeds/);
    assert.doesNotMatch(h.statuses.at(-1), /Previous preparation retained/);
    h.prepare();
    assert.match(h.statuses.at(-1), /No plot preparation available|Scene context ready/);
    assert.doesNotMatch(h.statuses.at(-1), /Preparing/);
});

for (const reset of [false, true]) test(`rewound long chat reuses only verified archived review coverage (old rebuild=${reset})`, async () => {
    const h = browser();
    await h.scope.analyzeCampaignNow();
    const checkpoint = legacyPreparation(h.state().campaignPreparation);
    for (let index = 2; index < 413; index++) h.context.chat.push({ is_user: index % 2 === 1, name: index % 2 ? 'Neri' : 'Mara',
        mes: index % 2 ? `Choice ${index}. ` + 'An accepted player contribution. '.repeat(30) : `Accepted scene ${index}.` });
    checkpoint.source = { ...checkpoint.source, messageCount: 397,
        fingerprint: h.scope.campaignFingerprint(h.context.chat.slice(0, 397)) };
    const state = h.state(), future = structuredClone(state.campaignPreparation);
    future.revision = 50;
    future.source = { ...future.source, messageCount: 413, fingerprint: h.scope.campaignFingerprint(h.context.chat) };
    future.archive = [{ revision: checkpoint.revision, source: checkpoint.source, legacyPreparation: checkpoint, replaced: true }];
    state.campaignPreparation = reset ? { ...h.scope.emptyCampaign(), archive: [{ preparation: future, rebuild: true }] } : future;
    h.context.chatMetadata = saveState(h.context.chatMetadata, state);
    h.context.chat.length = 407;
    h.context.chat[401].mes = 'I change my mind: no investigation, and no permission requirement.';
    const before = structuredClone(h.context.chatMetadata);
    const snapshot = h.scope.readCampaignSnapshot();
    assert.throws(() => storyInput({ reference: snapshot.reference, state: snapshot.state,
        messages: campaignEvidenceMessages(campaignReviewWindow(snapshot.messages.map((m, index) => ({ index,
            role: m.is_user ? 'user' : 'assistant', name: m.name, content: m.mes })), 2), { narrative: true }) }), /exceeds 8000/);
    const built = h.scope.buildCampaignHostInput(snapshot), payload = JSON.parse(built.prompt);
    assert.ok(built.inputTokens <= 8000);
    assert.equal(payload.coverage.reviewed_before, 397);
    assert.equal(payload.new_id_prefix, 'r51-');
    assert.equal(payload.rebuild, true);
    assert.match(payload.coverage.review_boundary, /not restored/);
    for (let index = 397; index < 407; index += 2) assert.ok(built.evidenceMessages.some(m => m.index === index
        && m.content === h.context.chat[index].mes), `new/edited contribution ${index} stays whole`);
    assert.deepEqual(structuredClone(h.context.chatMetadata), before);
    h.context.chat[1].mes = 'An edit before every saved checkpoint.';
    assert.equal(h.scope.campaignReviewedCount(snapshot.state, { ...h.scope.readCampaignSnapshot(), fingerprint: h.scope.campaignFingerprint }), 0);
    assert.throws(() => h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot()), /exceeds 8000/);
});

test('rebuild preserves the original plan on preflight and provider failure; only success archives/replaces it', async () => {
    let fail = false;
    const h = browser(async args => { if (fail) throw Error('Provider offline'); return plannedResponse(args); });
    await h.scope.analyzeCampaignNow();
    const before = structuredClone(h.state().campaignPreparation);
    fail = true;
    await h.scope.rebuildGuideState();
    assert.deepEqual(h.state().campaignPreparation, before);
    assert.equal(h.requests.length, 2);
    assert.deepEqual(JSON.parse(h.requests[1].prompt).previous_plan.developments, []);
    assert.equal(JSON.parse(h.requests[1].prompt).coverage.reviewed_before, 2);
    h.context.chat.push({ is_user: true, name: 'Neri', mes: 'Required new contribution. '.repeat(10000) });
    await h.scope.rebuildGuideState();
    assert.deepEqual(h.state().campaignPreparation, before);
    assert.equal(h.requests.length, 2);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.requestCount, 0);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'failed');
    assert.match(h.statuses.at(-1), /Previous preparation retained/);
    h.context.chat.pop(); fail = false;
    await h.scope.rebuildGuideState();
    assert.equal(h.requests.length, 3);
    assert.equal(h.state().campaignPreparation.revision, before.revision + 1);
    assert.deepEqual(h.state().campaignPreparation.archive[0].preparation, before);
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 3, 'successful rebuild does not schedule an immediate ordinary duplicate');
});

test('host requires a complete bounded snapshot and preserves unfinished initiative on failure', async () => {
    const value = structuredClone(design);
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow({ manual: true });
    const previous = structuredClone(h.state().campaignPreparation);
    delete value.plan.developments[0].initiative;
    value.selected_material[0].available = 'A revised tune is available for shared practice.';
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 3);
    assert.deepEqual(h.state().campaignPreparation, previous);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'failed');
    assert.doesNotMatch(h.prepare().payload, /revised tune/);
});

test('host rejects an incomplete new development atomically', async () => {
    const value = structuredClone(design);
    const incomplete = { ...structuredClone(value.plan.developments[0]), id: 'r1-new' };
    delete incomplete.initiative;
    value.plan.developments.push(incomplete);
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2);
    assert.equal(h.state().campaignPreparation, null);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'failed');
    assert.match(h.statuses.at(-1), /missing initiative/);
});

test('host rejects unavailable consequence witnesses and leaves prior preparation intact', async () => {
    for (const hasPrevious of [false, true]) {
        const value = structuredClone(design);
        const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] }));
        if (hasPrevious) await h.scope.analyzeCampaignNow();
        const before = structuredClone(h.state().campaignPreparation);
        value.plan.consequences = [{ id: 'show', text: 'The show ended.' }];
        value.observations = [{ id: 'show', evidence: [{ index: 0, span: 999 }] }];
        await h.scope.analyzeCampaignNow({ manual: true });
        assert.equal(h.requests.length, hasPrevious ? 3 : 2);
        assert.deepEqual(h.state().campaignPreparation, before);
        assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'failed');
    }
});

test('player ownership is rejected at the host boundary', async () => {
    const value = structuredClone(design);
    value.plan.developments[0].owner = 'Neri';
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2);
    assert.equal(h.state().campaignPreparation, null);
    assert.match(h.statuses.at(-1), /Player cannot own/);
});

test('uncached lorebooks never block or trigger a book load in active planning', async () => {
    const h = browser();
    h.scope.selected_world_info = ['Not cached'];
    h.scope.loadWorldInfo = async () => { throw Error('Planner must not load books'); };
    await h.scope.startCampaignPlanning();
    assert.equal(h.requests.length, 1);
    assert.equal(h.state().campaignPreparation.rpBrief, design.plan.threads);
    assert.doesNotMatch(h.requests[0].prompt, /worldBooks/);
    assert.doesNotMatch(h.prepare().payload, /PRIVATE|rpBrief|rp_brief/);
});

test('host summaries and observed activated lore share optional budget in the single pass', async () => {
    const h = browser();
    h.context.extensionPrompts = { summary: { value: 'A previous journey ended.' },
        lore: { value: 'OVERSIZED OPTIONAL SOURCE '.repeat(10000) },
        style: { value: 'PRESET STYLE' }, test: { value: 'OLD TF PLOT' } };
    h.settings.summaryContextTokens = 1000;
    await h.emit('GENERATION_STARTED', 'normal', {}, false);
    await h.emit('WORLD_INFO_ACTIVATED', [{ content: 'The inn has a spare room.' }]);
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1);
    const input = JSON.parse(h.requests[0].prompt);
    const recall = input.external_evidence.find(item => item.provider === 'host-story-context');
    assert.ok(recall);
    assert.equal(recall.confidence, 'lower-confidence-context');
    assert.match(JSON.stringify(recall), /previous journey ended|inn has a spare room/);
    assert.doesNotMatch(h.requests[0].prompt, /OVERSIZED OPTIONAL SOURCE|PRESET STYLE|OLD TF PLOT/);
    assert.equal(h.context.extensionPrompts.summary.value, 'A previous journey ended.');
    h.context.chatMetadata.taleFairyEvidence = 'off';
    assert.equal(h.scope.readCampaignSnapshot().evidence.length, 0);
});

test('host activation cache clears before an empty generation and ignores non-story requests', async () => {
    const h = browser();
    const records = () => h.scope.readCampaignSnapshot().evidence.find(item => item.provider === 'host-story-context')?.records || [];
    await h.emit('GENERATION_STARTED', 'normal', {}, false);
    await h.emit('WORLD_INFO_ACTIVATED', [{ content: 'Only this branch.' }]);
    assert.equal(records().length, 1);
    await h.emit('GENERATION_STARTED', 'normal', {}, true);
    assert.equal(records().length, 1, 'dry runs do not destroy observed input');
    await h.emit('GENERATION_STARTED', 'normal', {}, false);
    assert.equal(records().length, 0, 'no activation event cannot reuse last generation');
    await h.emit('GENERATION_STARTED', 'quiet', {}, false);
    await h.emit('WORLD_INFO_ACTIVATED', [{ content: 'Non-story generation.' }]);
    assert.equal(records().length, 0);
    await h.emit('GENERATION_STARTED', 'normal', {}, false);
    await h.emit('WORLD_INFO_ACTIVATED', [{ content: 'Before an edit.' }]);
    await h.emit('WORLDINFO_UPDATED');
    assert.equal(records().length, 0);
});

test('notebook omits absent horizons and labels the RP brief private', () => {
    const scope = vm.createContext({});
    vm.runInContext(source.match(/function campaignSelectionSummary\([^]*?^}/m)[0], scope);
    assert.equal(scope.campaignSelectionSummary({ selectedMaterial: [{ subjectIds: ['music'], available: 'A room is available.' }] }),
        'SELECTED STORY HORIZONS\nAvailable circumstances: A room is available.');
    assert.match(source, /RP OPERATING BRIEF \(private\)/);
});

test('rebuild replaces the private brief; delete removes it without touching host summaries or lore', async () => {
    const h = browser();
    h.context.chatMetadata.summary = 'External summary stays.';
    const book = { entries: { 0: { content: 'Unmodified source.' } } };
    h.scope.worldInfoCache.set('Book', book);
    await h.scope.analyzeCampaignNow();
    const saved = h.state().campaignPreparation;
    await h.scope.rebuildGuideState();
    assert.equal(h.requests.length, 2);
    const input = JSON.parse(h.requests[1].prompt);
    assert.equal(input.previous_plan.threads, undefined);
    assert.equal(input.previous_plan.developments.length, 0);
    assert.match(h.requests[1].prompt, /External summary stays/);
    assert.deepEqual(h.state().campaignPreparation.archive[0].preparation, saved);
    await h.emit('WORLD_INFO_ACTIVATED', [{ content: 'Cached surface.' }]);
    await h.scope.resetState();
    assert.equal(h.state().campaignPreparation, null);
    assert.equal(h.scope.activatedStoryContext.snapshot, null);
    assert.equal(h.context.chatMetadata.summary, 'External summary stays.');
    assert.equal(h.scope.worldInfoCache.get('Book'), book);
});

test('host rejects unknown snapshot fields without silently reinterpreting them', async () => {
    const response = structuredClone(design);
    response.plan.ending = 'A prescribed ending.';
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(response) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 2);
    assert.equal(h.state().campaignPreparation, null);
    assert.match(h.statuses.at(-1), /unexpected ending/);
});

test('host keeps multiple arcs then closes finite work with witnessed events', async () => {
    const wider = structuredClone(design);
    wider.plan.developments.push({ ...structuredClone(wider.plan.developments[0]), id: 'r2-travel', kind: 'emerging',
        question: 'Which regional exchanges can form?', initiative: 'Carriers establish a route between neighboring communities.' });
    wider.selected_material[0] = { subjectIds: ['r2-travel'], available: 'Open regional routes.' };
    const closing = structuredClone(wider);
    closing.plan.developments.shift();
    closing.exits = [{ id: 'r1-music', disposition: 'closed', reason: 'The finite production ended.', evidence: [{ index: 3, span: 0 }] }];
    const replies = [design, wider, closing];
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(replies.shift()) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow({ manual: true });
    h.context.chat.push({ is_user: true, name: 'Neri', mes: 'We arrive in the next town.' });
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.state().campaignPreparation.revision, 2);
    assert.equal(h.state().campaignPreparation.developments.length, 2);
    h.context.chat.push({ is_user: true, name: 'Neri', mes: 'The final performance is finished.' });
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 3);
    const saved = h.state().campaignPreparation;
    assert.equal(saved.revision, 3);
    assert.deepEqual(saved.developments.map(entry => entry.id), ['r2-travel']);
    assert.equal(saved.archive.at(-1).transitions[0].witnesses[0].quote, 'The final performance is finished.');
    assert.equal(saved.workingPlan.threads, design.plan.threads);
    const payload = h.prepare().payload;
    assert.match(payload, /Open regional routes/);
    h.context.chatMetadata = JSON.parse(JSON.stringify(h.context.chatMetadata));
    h.scope.generationGuideSelection = null;
    assert.equal(h.prepare().payload, payload);
});

test('shared selection survives actual metadata, cache authentication and retries without duplicating private subjects', async () => {
    const grouped = structuredClone(design);
    grouped.plan.developments.push({ ...structuredClone(grouped.plan.developments[0]), id: 'r1-exchange', owner: 'Sef',
        initiative: 'Exchange private arrangements with fellow musicians.' });
    grouped.selected_material[0].subjectIds.push('r1-exchange');
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(grouped) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow();
    const selected = h.prepare();
    const decoded = JSON.parse(selected.payload.replace(/<\/?tale-fairy-context>/g, '').trim());
    assert.equal(decoded.possible_developments.length, 1);
    assert.equal(decoded.possible_developments[0].source, undefined);
    assert.doesNotMatch(selected.payload, /PRIVATE|Jo|Sef|unfolding|basis|route/);
    assert.equal(h.state().campaignPreparation.developments.length, 2);
    assert.equal(h.requests.length, 1);
    const metadata = JSON.parse(JSON.stringify(h.context.chatMetadata));
    assert.equal(generationContextEntries(metadata[GENERATION_CONTEXT_KEY]).length, 1);
    for (const type of ['normal', 'regenerate', 'swipe']) {
        const reopened = browser(undefined, h.state());
        reopened.context.chatMetadata = structuredClone(metadata);
        if (type !== 'normal') reopened.context.chat.push({ is_user: false, mes: 'Discarded musical ending.' });
        assert.equal(reopened.prepare(type).payload, selected.payload);
        assert.equal(reopened.requests.length, 0);
    }
    const tampered = structuredClone(metadata[GENERATION_CONTEXT_KEY]);
    tampered.entries[0].plannerState.campaignPreparation.selectedMaterial[0].available = 'Altered proposal.';
    assert.equal(generationContextEntries(tampered).length, 0, 'changed selected content cannot authenticate the original packet');
});

test('two malformed snapshots preserve the prior preparation atomically', async () => {
    const invalid = structuredClone(design); delete invalid.selected_material;
    invalid.plan.developments[0].initiative = 'A private update that must not commit.';
    const replies = [design, invalid, invalid];
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(replies.shift()) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow({ manual: true });
    const before = structuredClone(h.state().campaignPreparation);
    const payload = h.prepare().payload;
    h.context.chat.push({ is_user: true, mes: 'I ask about the wider season.' });
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 3);
    assert.deepEqual(h.state().campaignPreparation, before);
    assert.equal(h.prepare().payload, payload);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'failed');
    assert.equal(h.calls.length, 0);
});

// Exercise the real host lock wrapper. Grants and releases are asynchronous in
// browsers; an immediate stub conceals the page-local acquisition/handoff race.
function browserLocks(h, { grant = Promise.resolve(), release = Promise.resolve(), heldElsewhere = false } = {}) {
    let held = heldElsewhere, requests = 0;
    h.scope.EXTENSION_ID = 'living-world-guide';
    h.scope.navigator = { locks: { request: async (name, options, callback) => {
        requests++;
        assert.equal(options.ifAvailable, true);
        await grant;
        if (held) return callback(null);
        held = true;
        try { const result = await callback({ name }); await release; return result; }
        finally { held = false; }
    } } };
    vm.runInContext(source.match(/class PlannerBusyInAnotherTabError[^]*?^}/m)[0], h.scope);
    vm.runInContext(source.match(/async function withPlannerTabLock\([^]*?^}/m)[0], h.scope);
    return { get requests() { return requests; }, get held() { return held; } };
}

test('same-page triggers before the asynchronous lock grant spend only one request and show no other-page error', async () => {
    const h = browser();
    let grant;
    const locks = browserLocks(h, { grant: new Promise(resolve => { grant = resolve; }) });
    const first = h.scope.analyzeCampaignNow({ manual: true });
    const second = h.scope.analyzeCampaignNow({ manual: true });
    await settle();
    grant();
    await Promise.all([first, second]);
    assert.equal(locks.requests, 1);
    assert.equal(h.requests.length, 1);
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.ok(!h.statuses.some(status => /another.*page|save failed/.test(status)), h.statuses.join('\n'));
});

test('same-page trigger during lock release joins the complete host lifecycle', async () => {
    const h = browser();
    let release;
    const locks = browserLocks(h, { release: new Promise(resolve => { release = resolve; }) });
    const first = h.scope.analyzeCampaignNow({ manual: true });
    await settle(); await settle();
    assert.equal(h.scope.campaignSession.pending, null);
    assert.equal(locks.held, true);
    const second = h.scope.analyzeCampaignNow();
    await settle();
    release();
    await Promise.all([first, second]);
    assert.equal(locks.requests, 1);
    assert.equal(h.requests.length, 1);
    assert.ok(!h.statuses.some(status => /another.*page|save failed/.test(status)), h.statuses.join('\n'));
});

test('a genuinely busy other page is not a save failure and sends no request', async () => {
    const h = browser();
    await h.scope.analyzeCampaignNow({ manual: true });
    const before = structuredClone(h.state());
    const payload = h.prepare().payload;
    browserLocks(h, { heldElsewhere: true });
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 1, 'no additional request while another page holds the lock');
    assert.deepEqual(h.state(), before);
    assert.match(h.statuses.at(-1), /another.*page/i);
    assert.doesNotMatch(h.statuses.at(-1), /save failed/i);
    assert.equal(h.prepare().payload, payload);
});

test('Stop before lock grant prevents generation and cannot be overwritten by a late busy error', async () => {
    for (const heldElsewhere of [false, true]) {
        const h = browser();
        let grant;
        browserLocks(h, { grant: new Promise(resolve => { grant = resolve; }), heldElsewhere });
        const running = h.scope.analyzeCampaignNow({ manual: true });
        await settle();
        h.scope.interruptAnalysis('User stopped', 'Stopped');
        grant();
        await running;
        assert.equal(h.requests.length, 0);
        assert.equal(h.statuses.at(-1), 'Stopped');
        assert.equal(h.scope.campaignHostWork, null);
    }
});

test('manual intent during preflight promotes an otherwise not-due pass without a second lock request', async () => {
    const h = browser();
    await h.scope.analyzeCampaignNow({ manual: true });
    let grant;
    const locks = browserLocks(h, { grant: new Promise(resolve => { grant = resolve; }) });
    const automatic = h.scope.analyzeCampaignNow();
    await settle();
    const manual = h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(automatic, manual);
    grant();
    await manual;
    assert.equal(locks.requests, 1);
    assert.equal(h.requests.length, 2, 'initial plan plus one explicitly requested review');
});

test('rebuild and author-note replacement wait for lock release before starting their own pass', async () => {
    for (const action of ['rebuild', 'note']) {
        const h = browser();
        let release;
        const locks = browserLocks(h, { release: new Promise(resolve => { release = resolve; }) });
        const running = h.scope.analyzeCampaignNow({ manual: true });
        await settle(); await settle();
        assert.equal(h.scope.campaignSession.pending, null);
        assert.equal(locks.held, true);
        const replacement = action === 'rebuild' ? h.scope.startCampaignPlanning({ rebuild: true })
            : h.scope.applyCampaignInstruction('Keep the journey open.');
        await settle();
        assert.equal(h.requests.length, 1);
        assert.equal(locks.requests, 1);
        release();
        await Promise.all([running, replacement]);
        assert.equal(h.requests.length, 2);
        assert.equal(locks.requests, 2);
        assert.ok(!h.statuses.some(status => /another.*page|save failed/.test(status)), h.statuses.join('\n'));
        if (action === 'note') assert.equal(h.state().campaignInstructions[0].text, 'Keep the journey open.');
        else assert.ok(h.state().campaignPreparation.archive.some(entry => entry.rebuild));
    }
});

test('an interrupted preflight is not reused by a later manual request', async () => {
    const h = browser();
    let grant;
    const locks = browserLocks(h, { grant: new Promise(resolve => { grant = resolve; }) });
    const first = h.scope.analyzeCampaignNow({ manual: true });
    await settle();
    h.scope.interruptAnalysis('User stopped', 'Stopped');
    const next = h.scope.analyzeCampaignNow({ manual: true });
    assert.notEqual(first, next);
    grant();
    await Promise.all([first, next]);
    assert.equal(locks.requests, 2);
    assert.equal(h.requests.length, 1, 'stopped preflight sends nothing; replacement sends once');
    assert.match(h.statuses.at(-1), /^Campaign preparation ready · \d+s$/);
    assert.equal(h.scope.campaignHostWork, null);
});

test('chat changes and disabling during lock acquisition send no request and preserve the new status', async () => {
    for (const action of ['switch', 'disable']) {
        const h = browser();
        let grant;
        browserLocks(h, { grant: new Promise(resolve => { grant = resolve; }) });
        const pending = h.scope.analyzeCampaignNow();
        await settle();
        h.scope.interruptAnalysis('Context changed', 'Stopped');
        if (action === 'switch') h.context.getCurrentChatId = () => 'next-chat';
        else h.settings.enabled = false;
        grant();
        await pending;
        assert.equal(h.requests.length, 0);
        assert.equal(h.statuses.at(-1), 'Stopped');
        assert.equal(h.scope.campaignHostWork, null);
    }
});

test('preflight errors release page-local work and leave a later manual pass usable', async () => {
    const h = browser();
    h.scope.warmPlotWorldInputs = async () => { throw Error('World inputs unavailable'); };
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 0);
    assert.equal(h.scope.campaignHostWork, null);
    assert.match(h.statuses.at(-1), /Campaign preparation failed.*World inputs unavailable/);
    assert.doesNotMatch(h.statuses.at(-1), /save failed/);
    h.scope.warmPlotWorldInputs = async () => {};
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 1);
    assert.match(h.statuses.at(-1), /^Campaign preparation ready · \d+s$/);
});

test('planner prompt changes invalidate attempt identity without changing accepted-source identity', () => {
    const h = browser();
    const before = h.scope.readCampaignSnapshot();
    h.scope.OWNED_SYSTEM += '\nUpdated planning instructions.';
    const after = h.scope.readCampaignSnapshot();
    assert.notEqual(after.requestSignature, before.requestSignature);
    assert.equal(after.referenceHash, before.referenceHash);
    assert.deepEqual(after.messages, before.messages);
    assert.equal(h.requests.length, 0);
});

test('budget changes during a paid planning pass preserve its commit and normal review cadence', async () => {
    let release;
    const h = browser(async () => {
        await new Promise(resolve => { release = resolve; });
        return { choices: [{ message: { content: JSON.stringify(design) }, finish_reason: 'stop' }] };
    });
    let budget = 20;
    h.scope.getWorldInfoSettings = () => ({ world_info_depth: 2, world_info_budget: budget, world_info_budget_cap: 0 });
    const running = h.scope.analyzeCampaignNow();
    await settle(); await settle();
    budget = 25;
    release();
    await running;
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.ok(h.prepare().payload);
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1, 'budget changes must not spend another planner call');
});

test('upgrade respects an existing legacy shared-storage planner reservation', async () => {
    const h = browser();
    h.scope.getWorldInfoSettings = () => ({ world_info_depth: 2, world_info_budget: 20, world_info_budget_cap: 0 });
    await h.scope.analyzeCampaignNow();
    const current = h.scope.readCampaignSnapshot();
    const legacy = { ...current.attempt, key: 'legacy-runtime-key',
        referenceHash: legacyPlotInputKey('story', [], h.scope.generationInputs(h.context, h.state())) };
    const state = h.state();
    state.campaignPreparation.source.referenceHash = legacy.referenceHash;
    h.context.chatMetadata = saveState({ ...h.context.chatMetadata, taleFairyCampaignAttempt: legacy }, state);
    const storage = h.scope.plannerStorage();
    storage.setItem('taleFairyCampaignAttempt:story', JSON.stringify(legacy));
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1);
    assert.equal(h.scope.readCampaignSnapshot().attempt.referenceHash, current.referenceHash);
    h.scope.getWorldInfoSettings = () => ({ world_info_depth: 2, world_info_budget: 25, world_info_budget_cap: 4096 });
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1, 'the old shared copy cannot undo a proven metadata migration');
});

test('actual single-pass planner reads CM privately, once per scheduled pass, without feeding it back', async () => {
    const h = browser();
    const snapshot = memorySnapshot(), before = structuredClone(snapshot);
    h.scope.continuityMemoryBridge = { version: 2, getContextSnapshot: () => snapshot };
    await h.scope.analyzeCampaignNow();
    const input = JSON.parse(h.requests[0].prompt);
    assert.equal(input.external_evidence[0].summary, snapshot.prompt);
    assert.equal(input.external_evidence[0].records[0].id, 'memory-music');
    assert.doesNotMatch(h.prepare().payload, /Private Chronicle|memory-music|continuity_memory/);
    assert.deepEqual(snapshot, before);
    snapshot.revision++;
    snapshot.prompt += ' A late memory publication.';
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1, 'CM publication must not buy a second pass for the same source');
});

test('campaign snapshot honors the CM toggle, stale identity and replacement isolation', () => {
    const h = browser();
    const snapshot = memorySnapshot();
    h.scope.continuityMemoryBridge = { version: 2, getContextSnapshot: () => snapshot };
    const initial = h.scope.readCampaignSnapshot();
    h.settings.continuityIntegration = false;
    const disabled = h.scope.readCampaignSnapshot();
    assert.notEqual(disabled.requestSignature, initial.requestSignature);
    assert.equal(disabled.referenceHash, initial.referenceHash);
    assert.equal(disabled.continuity.status, 'off');
    h.settings.continuityIntegration = true;
    snapshot.status = 'stale';
    assert.equal(h.scope.readCampaignSnapshot().continuity.status, 'stale');
    snapshot.status = 'current';
    h.scope.replacementPlanningDeferred = () => true;
    h.context.chatMetadata[h.scope.REPLACEMENT_PENDING_KEY] = { messageCount: 1 };
    const replacement = h.scope.readCampaignSnapshot();
    assert.equal(replacement.continuity.status, 'replacement');
    assert.ok(!JSON.parse(h.scope.buildCampaignHostInput(replacement).prompt).external_evidence);
});

test('same-source memory corrections during a paid pass cannot commit outdated recall', async () => {
    let finish;
    const h = browser(() => new Promise(resolve => { finish = resolve; }));
    const snapshot = memorySnapshot();
    h.scope.continuityMemoryBridge = { version: 2, getContextSnapshot: () => snapshot };
    const work = h.scope.analyzeCampaignNow();
    await settle();
    assert.equal(h.requests.length, 1);
    snapshot.prompt = 'Correction: the engagement was never accepted.';
    snapshot.revision++;
    finish({ choices: [{ message: { content: JSON.stringify(design) }, finish_reason: 'stop' }] });
    await work;
    assert.equal(h.state().campaignPreparation?.revision || 0, 0);
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1, 'no hidden corrective retry');
});

test('memory changes during input preparation spend no request', async () => {
    const h = browser();
    const snapshot = memorySnapshot();
    h.scope.continuityMemoryBridge = { version: 2, getContextSnapshot: () => snapshot };
    const prepare = h.scope.buildCampaignHostInput;
    h.scope.buildCampaignHostInput = source => {
        const input = prepare(source);
        snapshot.prompt = 'Corrected before sending.';
        return input;
    };
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 0);
    assert.equal(h.state().campaignPreparation?.revision || 0, 0);
});

test('accepted appends making CM stale do not discard already-paid-for planning', async () => {
    let finish;
    const h = browser(() => new Promise(resolve => { finish = resolve; }));
    const snapshot = memorySnapshot();
    h.scope.continuityMemoryBridge = { version: 2, getContextSnapshot: () => snapshot };
    const work = h.scope.analyzeCampaignNow();
    await settle();
    h.context.chat.push({ is_user: false, name: 'Mara', mes: 'The others finish packing.' });
    snapshot.status = 'stale';
    finish({ choices: [{ message: { content: JSON.stringify(design) }, finish_reason: 'stop' }] });
    await work;
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.equal(h.requests.length, 1);
});

test('CM publication captures accepted source synchronously and uses campaign cadence, not legacy reconciliation', async () => {
    const h = browser(undefined, defaultPlannerState());
    let subscriber;
    const snapshot = memorySnapshot();
    Object.assign(h.scope, { continuityUnsubscribe: null, continuityReplacementRevision: 0,
        reconcileStateWithContinuity: () => { throw Error('campaign must not mutate the legacy notebook'); },
        continuityMemoryBridge: { version: 2, getContextSnapshot: () => snapshot,
            subscribe: callback => { subscriber = callback; return () => {}; } } });
    h.settings.continuityIntegration = true;
    vm.runInContext(source.match(/function bindContinuityBridge\([^]*?^}/m)[0], h.scope);
    h.scope.bindContinuityBridge();
    subscriber(snapshot);
    await settle();
    assert.equal(h.requests.length, 1);
    snapshot.revision++;
    subscriber(snapshot);
    await settle();
    assert.equal(h.requests.length, 1, 'publication cannot bypass the saved attempt');
    h.context.chat.push({ is_user: false, mes: 'Another accepted reply.' });
    snapshot.status = 'stale';
    const input = JSON.parse(h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot()).prompt);
    assert.equal(input.external_evidence[0].freshness, 'verified-accepted-prefix');
    h.context.chat[0].mes = 'A changed earlier branch.';
    assert.ok(!JSON.parse(h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot()).prompt).external_evidence);
});

test('actual campaign entry builds evidence, uses single-shot transport and commits usable preparation', async () => {
    const h = browser();
    await h.scope.analyzeNow({ force: true });
    assert.equal(h.requests.length, 1);
    const request = h.requests[0];
    assert.equal(request.spec.singleShot, true);
    assert.equal(request.spec.schema.name, 'tale_fairy_working_plan_v1');
    assert.equal(request.spec.responseTokens, 3000);
    assert.equal(request.spec.reasoningMode, undefined, 'honor saved reasoning instead of legacy forced Off');
    assert.equal(request.meta, null, 'no legacy detached recovery contract');
    const input = JSON.parse(request.prompt);
    assert.deepEqual(input.accepted_messages.at(-1).spans, [{ span: 0, text: 'I help pack.' }]);
    assert.ok(input.source_reference);
    assert.deepEqual(input.player_names, ['Neri']);
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.equal(h.state().campaignPreparation.developments[0].initiative.owner, 'Jo');
    assert.match(h.prepare().payload, /An original tune has potential/);
    assert.deepEqual(JSON.parse(h.prepare().payload.replace(/<\/?tale-fairy-context>/g, '').trim()),
        { development_contract: DEVELOPMENT_CONTRACT, possible_developments: design.selected_material.map(materialHorizons) }, 'actual host injects discoverable material, not private ownership or a whole future plan');
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'complete');
});

test('reload and retry authenticate old scene packets but inject only story material without a planning call', async () => {
    const h = browser();
    await h.scope.analyzeNow({ force: true });
    const legacy = structuredClone(h.state());
    legacy.campaignPreparation = legacyPreparation(legacy.campaignPreparation);
    delete legacy.campaignPreparation.selectedMaterial;
    delete legacy.campaignPreparation.background;
    legacy.campaignPreparation.realization['r1-music'].playable = [{ episodeId: 'arrangement', when: 'At noon.',
        situation: 'OLD SCRIPTED ENTRANCE', resolution: { owner: 'npc', actors: ['Jo'], endpoint: 'FIXED ENDING' } }];
    const packet = h.scope.buildGenerationPacket(legacy, h.context.chat, h.context);
    packet.payload = legacyCampaignPayload(legacy.campaignPreparation);
    assert.match(packet.payload, /OLD SCRIPTED ENTRANCE/);
    const cache = { version: 1, entries: [packet] };
    assert.equal(generationContextEntries(cache).length, 1);
    assert.equal(generationContextEntries({ ...cache, entries: [{ ...packet, payload: packet.payload + 'tampered' }] }).length, 0);
    const metadata = saveState({ ...h.context.chatMetadata, [GENERATION_CONTEXT_KEY]: cache }, legacy);
    const before = structuredClone(metadata);
    for (const type of ['normal', 'regenerate', 'swipe']) {
        const reopened = browser(undefined, legacy);
        reopened.context.chatMetadata = structuredClone(metadata);
        if (type !== 'normal') reopened.context.chat.push({ is_user: false, name: 'Mara', mes: 'Discarded response.' });
        const selected = reopened.prepare(type);
        assert.equal(selected.reused, true, type);
        assert.equal(selected.payload, campaignPayload(legacy.campaignPreparation));
        assert.match(selected.payload, /possible_developments/);
        assert.doesNotMatch(selected.payload, /OLD SCRIPTED|FIXED ENDING|At noon/);
        assert.deepEqual(reopened.context.chatMetadata, before, 'formatting never rewrites saved progress or packet archives');
        assert.equal(reopened.requests.length, 0);
        reopened.context.chat[0].mes = 'A different accepted opening.';
        assert.doesNotMatch(reopened.prepare(type).payload, /Compose a piece worth keeping|OLD SCRIPTED|FIXED ENDING/,
            'edited source cannot reuse incompatible archived objectives either');
    }
});

test('0.14.32 packets authenticate exactly but reload and every retry rebuild only selected material', async () => {
    const h = browser();
    await h.scope.analyzeNow({ force: true });
    const old = structuredClone(h.state());
    old.campaignPreparation = legacyPreparation(old.campaignPreparation);
    delete old.campaignPreparation.storyMaterialVersion;
    delete old.campaignPreparation.selectedMaterial;
    delete old.campaignPreparation.background;
    old.campaignPreparation.realization['r1-music'].playable = [{ episodeId: 'arrangement', when: 'If the musicians choose to collaborate.', direction: design.selected_material[0].available, middle: design.selected_material[0].developing, future: design.selected_material[0].lasting }];
    const packet = h.scope.buildGenerationPacket(old, h.context.chat, h.context);
    packet.payload = objectiveGuidancePayload(old.campaignPreparation);
    assert.match(packet.payload, /long_term_direction|development_guidance/);
    assert.match(packet.payload, /Compose a piece worth keeping/);
    const cache = { version: 1, entries: [packet] };
    assert.equal(generationContextEntries(cache).length, 1);
    assert.equal(generationContextEntries({ ...cache, entries: [{ ...packet, payload: packet.payload + 'tampered' }] }).length, 0);
    const metadata = saveState({ ...h.context.chatMetadata, [GENERATION_CONTEXT_KEY]: cache }, old);
    const before = structuredClone(metadata);
    for (const type of ['normal', 'regenerate', 'swipe']) {
        const reopened = browser(undefined, old);
        reopened.context.chatMetadata = structuredClone(metadata);
        if (type !== 'normal') reopened.context.chat.push({ is_user: false, name: 'Mara', mes: 'Discarded response.' });
        const selected = reopened.prepare(type);
        assert.equal(selected.reused, true, type);
        assert.equal(selected.payload, campaignPayload(old.campaignPreparation));
        assert.match(selected.payload, /An original tune has potential/);
        assert.doesNotMatch(selected.payload, /long_term_direction|development_guidance|objective|Compose a piece worth keeping/);
        assert.deepEqual(reopened.context.chatMetadata, before);
        assert.equal(reopened.requests.length, 0);
        reopened.context.chat[0].mes = 'A different opening.';
        assert.doesNotMatch(reopened.prepare(type).payload, /An original tune has potential/);
    }
});

test('host review boundary follows the accepted preparation prefix and resets after an edit', async () => {
    const h = browser();
    await h.scope.analyzeCampaignNow({ manual: true });
    h.context.chat.push({ is_user: false, mes: 'The company leaves.' }, { is_user: true, mes: 'I ask about the next town.' });
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 2);
    const review = JSON.parse(h.requests[1].prompt).coverage;
    assert.equal(review.reviewed_before, 2);
    assert.equal(review.supplied_messages, 4);
    h.context.chat[0].mes = 'Corrected earlier source.';
    const rebuilt = JSON.parse(h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot()).prompt);
    assert.equal(rebuilt.coverage.reviewed_before, 0);
    assert.equal(rebuilt.rebuild, true);
});

test('legacy migration honors source-compatible reviewed coverage without replaying all history', async () => {
    const h = browser();
    await h.scope.analyzeCampaignNow();
    const state = h.state();
    state.campaignPreparation = legacyPreparation(state.campaignPreparation);
    for (let i = 0; i < 40; i++) h.context.chat.push(
        { is_user: false, name: 'Mara', mes: `Stop ${i}.` }, { is_user: true, name: 'Neri', mes: `We choose region ${i}.` });
    state.campaignPreparation.source.messageCount = h.context.chat.length;
    state.campaignPreparation.source.fingerprint = h.scope.campaignFingerprint(h.context.chat);
    h.context.chatMetadata = saveState(h.context.chatMetadata, state);
    h.context.chat.push({ is_user: false, mes: 'More local business.' });
    const payload = JSON.parse(h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot()).prompt);
    assert.equal(payload.previous_plan.migration, true);
    assert.equal(payload.coverage.reviewed_before, 82);
    assert.ok(payload.accepted_messages.length < h.context.chat.length);
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 2);
    assert.equal(h.state().campaignPreparation.workingPlanVersion, 1);
    assert.ok(h.state().campaignPreparation.archive.at(-1).legacyPreparation);
});

test('normal host review migrates legacy preparation without separate controls or lost author notes', async () => {
    const h = browser();
    await h.scope.analyzeCampaignNow();
    const previous = legacyPreparation(h.state().campaignPreparation);
    previous.planningScope = 'independent-developments-v1';
    h.context.chatMetadata = saveState(h.context.chatMetadata, { ...h.state(), campaignPreparation: previous,
        campaignInstructions: [{ text: 'Keep the next journey open.' }] });
    await h.scope.analyzeNow({ force: true });
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[1].spec.singleShot, true);
    assert.equal(JSON.parse(h.requests[1].prompt).previous_plan.migration, true);
    const state = h.state();
    assert.equal(state.campaignPreparation.workingPlanVersion, 1);
    assert.deepEqual(state.campaignPreparation.archive.at(-1).legacyPreparation.developments, previous.developments);
    assert.deepEqual(state.campaignInstructions, [{ text: 'Keep the next journey open.' }]);
});

test('actual host review converts unowned legacy subjects and archives their prior form', async () => {
    const h = browser();
    await h.scope.analyzeCampaignNow();
    const previous = legacyPreparation(h.state().campaignPreparation);
    delete previous.developments[0].initiative;
    delete previous.preparationFormat;
    previous.developments[0].premise = 'A retained legacy musical premise.';
    h.context.chatMetadata = saveState(h.context.chatMetadata, { ...h.state(), campaignPreparation: previous });
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 2);
    const input = JSON.parse(h.requests[1].prompt);
    assert.equal(input.previous_plan.developments[0].development, previous.developments[0].progression);
    assert.equal(input.previous_plan.developments[0].initiative, undefined);
    const state = h.state().campaignPreparation;
    assert.equal(state.revision, 2);
    assert.equal(state.developments[0].initiative.owner, 'Jo');
    assert.deepEqual(state.archive.at(-1).legacyPreparation.developments, previous.developments);
});

test('host archives old plot essays without replaying their prose', async () => {
    const h = browser();
    await h.scope.analyzeCampaignNow();
    const previous = legacyPreparation(h.state().campaignPreparation);
    previous.preparationFormat = 'plot-points-v1';
    previous.developments[0].premise = 'OLD ESSAY TEMPLATE';
    h.context.chatMetadata = saveState(h.context.chatMetadata, { ...h.state(), campaignPreparation: previous });
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 2);
    const input = JSON.parse(h.requests[1].prompt).previous_plan;
    assert.equal(input.migration, true);
    assert.deepEqual(input.developments[0].initiative, previous.developments[0].initiative);
    assert.equal(JSON.stringify(input).includes('OLD ESSAY TEMPLATE'), false);
    const state = h.state().campaignPreparation;
    assert.equal(state.workingPlanVersion, 1);
    assert.equal(state.archive.at(-1).legacyPreparation.developments[0].premise, 'OLD ESSAY TEMPLATE');
    assert.match(h.prepare().payload, /possible_developments/);
});

test('invalid player ownership exhausts one correction without committing or looping', async () => {
    const invalid = structuredClone(design);
    invalid.plan.developments[0].owner = 'Neri';
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(invalid) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2);
    assert.equal(h.state().campaignPreparation, null);
    assert.match(h.statuses.join('\n'), /Player cannot own/);
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2, 'failed unchanged source is not retried automatically');
});

test('actual host factors repeated speaker labels while preserving every initial player contribution', () => {
    const h = browser();
    for (let i = 0; i < 40; i++) h.context.chat.push(
        { is_user: true, name: 'Neri', mes: `I choose the north road ${i}.` },
        { is_user: false, name: 'Mara', mes: 'The road continues. '.repeat(300) });
    const input = h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot());
    const payload = JSON.parse(input.prompt);
    assert.equal(payload.default_speaker_name_by_role.user, 'Neri');
    const users = payload.accepted_messages.filter(m => m.role === 'user');
    assert.equal(users.length, 41);
    assert.ok(users.every(m => !Object.hasOwn(m, 'name') && m.spans.map(s => s.text).join('') === h.context.chat[m.index].mes));
    assert.deepEqual(payload.player_names, ['Neri']);
    assert.equal(h.requests.length, 0);
});

test('real received/end events share persisted cadence and never invoke reply repair', async () => {
    const h = browser();
    await h.scope.analyzeCampaignNow();
    for (let i = 0; i < 2; i++) {
        h.context.chat.push({ is_user: false, mes: `Accepted exchange ${i}.` });
        await h.emit('MESSAGE_RECEIVED'); await h.emit('GENERATION_ENDED'); await h.flush(); await settle();
    }
    assert.equal(h.requests.length, 1);
    h.context.chat.push({ is_user: false, mes: 'A later exchange.' });
    await h.emit('MESSAGE_RECEIVED'); await settle();
    if (h.scope.campaignSession.pending) await h.scope.campaignSession.pending;
    assert.equal(h.requests.length, 2);
    assert.equal(h.calls.length, 0, 'legacy analyzeNow mock and repair flow remain unused');
});

test('ordinary received events automatically commit a quiet snapshot and later restore reviewed material without repair calls', async () => {
    const revised = structuredClone(design);
    revised.selected_material[0].available = 'A different musical collaboration is available.';
    const responses = [design, { ...design, selected_material: [] }, revised];
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(responses.shift()) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow();
    const first = structuredClone(h.state().campaignPreparation);
    assert.match(h.prepare().payload, /An original tune has potential/);
    async function acceptedReplies(label) {
        for (let i = 0; i < 3; i++) {
            h.context.chat.push({ is_user: false, mes: `${label} ${i}.` });
            await h.emit('MESSAGE_RECEIVED'); await h.emit('GENERATION_ENDED'); await h.flush(); await settle();
            if (h.scope.campaignSession.pending) await h.scope.campaignSession.pending;
        }
    }
    await acceptedReplies('The musicians have finished and left');
    assert.equal(h.requests.length, 2, 'one scheduled review, no correction or manual trigger');
    const quiet = structuredClone(h.state().campaignPreparation);
    assert.deepEqual(quiet.selectedMaterial, []);
    assert.equal(quiet.realization, undefined);
    assert.deepEqual(quiet.developments, first.developments);
    assert.equal(h.prepare().payload, '', 'old pre-review packet must not survive a committed review');
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2, 'withholding does not start an immediate retry loop');
    await acceptedReplies('Later shared interests develop');
    assert.equal(h.requests.length, 3);
    assert.match(h.prepare().payload, /different musical collaboration/);
    assert.doesNotMatch(h.prepare().payload, /An original tune has potential/);
    assert.equal(h.state().campaignPreparation.realization, undefined);
    assert.equal(h.calls.length, 0, 'no legacy repair path');
});

test('host budget shrinking keeps new choices and reconsiders all users after a source edit', async () => {
    const h = browser();
    h.context.chat.push({ is_user: false, mes: 'An earlier stop.' }, { is_user: true, mes: 'Earlier choice.' });
    await h.scope.analyzeCampaignNow();
    h.context.chat.push({ is_user: true, mes: '<span style="color:red">I decline that investigation.</span>' });
    for (let i = 0; i < 40; i++) h.context.chat.push({ is_user: false, mes: `Road ${i}. ` + 'Ordinary road scenery. '.repeat(900) });
    h.context.chat.push({ is_user: true, mes: 'We stay on the north road.' }, { is_user: false, mes: 'We arrive.' });
    const input = JSON.parse(h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot()).prompt);
    assert.ok(input.accepted_messages.some(m => m.index === 4 && m.spans[0].text === h.context.chat[4].mes));
    assert.ok(!input.accepted_messages.some(m => m.index === 5), 'older assistant prose omitted under pressure');
    assert.ok(!input.accepted_messages.some(m => m.index === 3), 'source-compatible reviewed contribution can be omitted');
    h.context.chat[3].mes = 'Edited earlier choice: no investigation.';
    const edited = JSON.parse(h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot()).prompt);
    assert.ok(edited.accepted_messages.some(m => m.index === 3 && m.spans[0].text === h.context.chat[3].mes));
});

test('oversized protected player contribution fails before spending a request and preserves preparation', async () => {
    const h = browser();
    await h.scope.analyzeCampaignNow();
    const before = structuredClone(h.state().campaignPreparation);
    h.context.chat.push({ is_user: true, mes: 'Required player contribution. '.repeat(10000) });
    for (let i = 0; i < 40; i++) h.context.chat.push({ is_user: false, mes: 'Later accepted prose.' });
    await h.scope.analyzeCampaignNow({ force: true });
    assert.equal(h.requests.length, 1, 'no second provider request');
    assert.deepEqual(h.state().campaignPreparation, before);
    assert.match(h.statuses.join('\n'), /exceeds/);
});

test('host shrinks old prose without replaying a growing extracted-history ledger', async () => {
    const h = browser();
    for (let i = 0; i < 40; i++) h.context.chat.push({ is_user: false,
        mes: `District ${i} traditions include ` + 'neighbors maintaining boats and exchanging supplies by the harbor '.repeat(80) });
    h.context.chat.push({ is_user: true, mes: 'I decline the offer and keep my boat.' }, { is_user: false, mes: 'The boat remains here.' });
    const before = structuredClone(h.context.chat);
    h.settings.maxPromptTokens = 8000;
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 1, h.statuses.join('\n'));
    assert.equal(h.state().campaignPreparation.revision, 1);
    const payload = JSON.parse(h.requests[0].prompt);
    assert.equal(payload.historical_evidence, undefined);
    assert.ok(payload.accepted_messages.length < h.context.chat.length);
    assert.ok(payload.accepted_messages.some(m => m.spans.some(s => s.text.includes('I decline the offer'))));
    assert.deepEqual(h.context.chat, before);
});

test('Stop interrupts actual campaign entry without a late commit or automatic retry', async () => {
    const h = browser(({ signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })));
    const running = h.scope.analyzeCampaignNow();
    await settle();
    assert.equal(h.requests.length, 1);
    h.scope.interruptAnalysis('Stopped by user', 'Stopped');
    await running;
    assert.equal(h.state().campaignPreparation, null);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'stopped');
    await h.scope.refreshCurrentPlanIfNeeded();
    assert.equal(h.requests.length, 1);
});

test('truncated provider envelopes cannot be accepted even when their JSON looks complete', async () => {
    for (const response of [{ choices: [{ message: { content: JSON.stringify(design) }, finish_reason: 'length' }] },
        { data: { status: 'incomplete', output_text: JSON.stringify(design) } },
        { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: JSON.stringify(design) }] } }] },
        { response: { result: { finish_reason: 'max_output_tokens', output_text: JSON.stringify(design) } } }]) {
        const h = browser(async () => response);
        await h.scope.analyzeCampaignNow();
        assert.equal(h.requests.length, 2);
        assert.equal(h.state().campaignPreparation, null);
        assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'failed');
    }
});

test('input preparation keeps source and retained designs whole or fails before sending', async () => {
    const h = browser();
    h.context.card = { persona: 'Unabridged source sentence. '.repeat(4000) };
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 0);
    assert.equal(h.state().campaignPreparation, null);
    assert.match(h.statuses.join('\n'), /exceeds/);
});

test('normal startup migrates legacy data automatically and Rebuild stays single-pass', async () => {
    const h = browser();
    const legacy = { ...defaultState(), contextLedger: 'Old factual ledger retained for inspection.',
        userNotes: [{ kind: 'forbid', text: 'No forced public solo.', at: 1 }] };
    h.context.chatMetadata = saveState({ unrelated: 'keep' }, legacy);
    const legacyPayload = h.prepare().payload;
    assert.doesNotMatch(legacyPayload, /<plot-anchor>/, 'old guidance cannot leak before the first new pass');
    await h.scope.refreshCurrentPlanIfNeeded();
    assert.equal(h.requests.length, 1);
    assert.equal(h.state().plannerContract, 15);
    assert.equal(h.state().contextLedger, legacy.contextLedger);
    assert.equal(h.context.chatMetadata.unrelated, 'keep');
    assert.doesNotMatch(h.prepare().payload, /<plot-anchor>/);
    const before = h.state().campaignPreparation;
    await h.scope.rebuildGuideState();
    assert.equal(h.requests.length, 2);
    assert.equal(h.state().plannerContract, 15);
    assert.equal(h.state().campaignPreparation.revision, before.revision + 1);
    assert.deepEqual(h.state().campaignPreparation.archive[0].preparation, before);
    assert.equal(JSON.parse(h.requests[1].prompt).previous_plan.developments.length, 0);
    assert.equal(h.state().userNotes[0].text, 'No forced public solo.');
});

test('the live entry defaults to event planning and has no separate mode control', () => {
    assert.match(source, /loadPlannerState as loadState/);
    assert.match(source, /defaultPlannerState as defaultState/);
    assert.doesNotMatch(source, /data-action="campaign"/);
    const html = readFileSync(new URL('../extension/settings.html', import.meta.url), 'utf8');
    assert.doesNotMatch(html, /data-action="campaign"|Try single-pass|Campaign mode/);
    assert.match(html, /data-action="guide"/);
    assert.match(html, /data-action="rebuild"/);
});

test('fresh chat startup and ordinary Guide now use one request each without a mode selection', async () => {
    const h = browser();
    h.context.chatMetadata = { unrelated: 'keep' };
    assert.equal(h.state().plannerContract, 15);
    await h.scope.refreshCurrentPlanIfNeeded();
    assert.equal(h.requests.length, 1);
    assert.equal(h.context.chatMetadata[STATE_KEY].plannerContract, 15);
    assert.equal(h.context.chatMetadata.unrelated, 'keep');
    await h.scope.reevaluateGuideState();
    assert.equal(h.requests.length, 2);
    assert.ok(h.requests.every(request => request.spec.singleShot));
});

test('failed automatic migration keeps the notebook and notes, suppresses legacy injection, and does not retry on reload', async () => {
    const legacy = { ...defaultState(), plannerContract: 14,
        userNotes: [{ text: 'Keep the voyage open-ended.', kind: 'suggest', at: 1 }] };
    legacy.preparedWorld.approach = 'OLD NOTEBOOK';
    const h = browser(async () => { throw Error('Provider unavailable'); }, legacy);
    const preserved = structuredClone(h.state().legacyPreparedWorld);
    await h.scope.refreshCurrentPlanIfNeeded();
    assert.equal(h.requests.length, 1);
    assert.equal(h.context.chatMetadata[STATE_KEY].plannerContract, 15);
    assert.deepEqual(h.state().legacyPreparedWorld, preserved);
    assert.deepEqual(h.state().preparedWorld, preserved);
    assert.equal(h.state().userNotes[0].text, 'Keep the voyage open-ended.');
    assert.doesNotMatch(h.prepare().payload, /OLD NOTEBOOK|plot-anchor|prepared-world/);
    h.context.chatMetadata = JSON.parse(JSON.stringify(h.context.chatMetadata));
    h.scope.campaignSession = null;
    await h.scope.refreshCurrentPlanIfNeeded();
    assert.equal(h.requests.length, 1);
});

test('disabled or chatless startup does not migrate stored metadata or spend a request', async () => {
    const h = browser();
    const before = structuredClone(h.context.chatMetadata);
    h.settings.enabled = false;
    await h.scope.refreshCurrentPlanIfNeeded();
    assert.deepEqual(h.context.chatMetadata, before);
    h.settings.enabled = true;
    h.context.getCurrentChatId = () => '';
    await h.scope.refreshCurrentPlanIfNeeded();
    assert.deepEqual(h.context.chatMetadata, before);
    assert.equal(h.requests.length, 0);
});

test('Stop or switching chats during automatic migration prevents a late planning call', async () => {
    for (const action of ['stop', 'switch']) {
        const h = browser();
        let release;
        h.scope.cancelDetachedPlannerJobs = () => new Promise(resolve => { release = resolve; });
        const pending = h.scope.refreshCurrentPlanIfNeeded();
        await settle();
        assert.equal(h.context.chatMetadata[STATE_KEY].plannerContract, 15);
        if (action === 'stop') h.scope.interruptAnalysis('Stop migration', 'Stopped');
        else h.context.getCurrentChatId = () => 'different-chat';
        release();
        await pending;
        assert.equal(h.requests.length, 0);
    }
});

test('Stop during migration persistence prevents the later model call', async () => {
    const h = browser();
    let release;
    h.context.saveMetadata = () => new Promise(resolve => { release = resolve; });
    const switching = h.scope.startCampaignPlanning();
    await settle();
    assert.equal(h.requests.length, 0);
    h.scope.interruptAnalysis('User stopped during save.', 'Stopped');
    release();
    await switching;
    assert.equal(h.requests.length, 0);
});

test('author instruction is retained verbatim and reaches writer and the single planning call without classification', async () => {
    const h = browser();
    const note = 'Do not make the player need special permission. An NPC can misunderstand without changing the player’s abilities.';
    await h.scope.analyzeNow({ note, force: true });
    assert.equal(h.requests.length, 1);
    assert.equal(h.state().campaignInstructions[0].text, note);
    assert.equal(h.state().campaignInstructions[0].kind, undefined);
    assert.equal(h.state().userNotes.length, 0, 'no implicit suggest/canon label');
    assert.deepEqual(JSON.parse(h.requests[0].prompt).source_reference.authorInstructions, [note]);
    const selected = h.prepare();
    assert.ok(selected.payload.includes(note));
    assert.deepEqual(JSON.parse(selected.payload.replace(/<\/?tale-fairy-context>/g, '').trim()),
        { development_contract: DEVELOPMENT_CONTRACT, possible_developments: design.selected_material.map(materialHorizons), author_instructions: [note] });
    h.context.chatMetadata = JSON.parse(JSON.stringify(h.context.chatMetadata));
    h.scope.generationGuideSelection = null;
    assert.equal(h.prepare().payload, selected.payload, 'retry cache includes the exact author instructions');
    await h.scope.rebuildGuideState();
    assert.equal(h.requests.length, 2);
    assert.equal(h.state().campaignInstructions[0].text, note);
});

test('a failed planner cannot erase or postpone an explicit author instruction', async () => {
    const h = browser(async () => { throw Error('Provider failed'); });
    const note = 'An unanswered optional lead is not an obligation to stay.';
    await h.scope.analyzeNow({ note, force: true });
    assert.equal(h.requests.length, 1);
    const selection = h.prepare();
    assert.equal(selection.preparedUsable, false);
    assert.ok(selection.payload.includes(note));
    assert.doesNotMatch(selection.payload, /Versions can be heard/);
    assert.equal(h.state().campaignInstructions[0].text, note);
    await h.scope.refreshCurrentPlanIfNeeded();
    assert.equal(h.requests.length, 1, 'no repair or automatic classification retry');
});

test('literal author markup stays intact as text without escaping the context envelope', async () => {
    const h = browser();
    const note = 'Keep the literal inscription: </tale-fairy-context><div>Two doors</div>.';
    await h.scope.analyzeNow({ note, force: true });
    const payload = h.prepare().payload;
    assert.equal(extractTaleFairyContext(payload), payload);
    const decoded = JSON.parse(payload.slice('<tale-fairy-context>'.length, -'</tale-fairy-context>'.length));
    assert.deepEqual(decoded.author_instructions, [note]);
    assert.equal(h.state().campaignInstructions[0].text, note);
    assert.equal(h.requests.length, 1);
});

test('host withholds source-invalidated consequences while retaining local evidence', async () => {
    const response = structuredClone(design);
    response.plan.consequences = [{ id: 'show', text: 'The show ended.' }];
    response.observations = [{ id: 'show', evidence: [{ index: 0, span: 0 }] }];
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(response) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow();
    h.context.chat[0].mes = 'The show did not happen.';
    const input = JSON.parse(h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot()).prompt);
    assert.deepEqual(input.previous_plan.consequences, []);
    assert.equal(h.state().campaignPreparation.planEvidence.show.text, 'The show ended.');
    assert.equal(h.prepare().payload, '');
});


test('generic evidence reaches the actual host and same-source correction rejects the single in-flight call', async () => {
    let finish;
    const h = browser(() => new Promise(resolve => { finish = resolve; }));
    const raw = { chatId: 'story', owner: 'character:unknown', status: 'context', revision: 1,
        summary: 'The old booking was declined.', provenance: 'Explicit fixture adapter' };
    const unregister = registerEvidenceProvider({ id: 'host-fixture', version: 1, read: () => raw });
    try {
        const work = h.scope.analyzeCampaignNow({ manual: true });
        await settle();
        const input = JSON.parse(h.requests[0].prompt);
        assert.equal(input.external_evidence[0].provider, 'host-fixture');
        assert.equal(input.external_evidence[0].confidence, 'lower-confidence-context');
        raw.summary = 'Corrected: only one proposed date was declined.'; raw.revision++;
        finish({ choices: [{ message: { content: JSON.stringify(design) }, finish_reason: 'stop' }] });
        await work;
        assert.equal(h.requests.length, 1);
        assert.equal(h.state().campaignPreparation?.revision || 0, 0);
        assert.doesNotMatch(h.prepare().payload, /booking|host-fixture/);
    } finally { unregister(); }
});

test('retirement archives remain local on both original and edited sources', async () => {
    const h = browser();
    await h.scope.analyzeCampaignNow();
    const state = h.state();
    state.campaignPreparation.archive.push({ retirement: { id: 'old-subject', evidence: [0], reason: 'Finished' },
        development: { id: 'old-subject' }, source: structuredClone(state.campaignPreparation.source) });
    h.context.chatMetadata = saveState(h.context.chatMetadata, state);
    let input = JSON.parse(h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot()).prompt);
    assert.equal(input.closed_subject_ids, undefined);
    h.context.chat[0].mes = 'An edited branch where that undertaking is still open.';
    input = JSON.parse(h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot()).prompt);
    assert.equal(input.closed_subject_ids, undefined);
    assert.equal(input.rebuild, true);
    assert.equal(h.state().campaignPreparation.archive.at(-1).development.id, 'old-subject');
});

for (const kind of ['oversized', 'malformed', 'truncated']) test(`${kind} host response automatically recovers, persists once and does not rerun on reload`, async () => {
    const oversized = structuredClone(design);
    oversized.plan.developments[0].initiative = '音'.repeat(400);
    let calls = 0;
    const h = browser(async () => ({ choices: [{ message: { content: ++calls === 1
        ? kind === 'malformed' ? '{"plan":' : JSON.stringify(kind === 'oversized' ? oversized : design)
        : JSON.stringify(design) }, finish_reason: calls === 1 && kind === 'truncated' ? 'length' : 'stop' }] }));
    let renders = 0;
    h.scope.renderBoard = () => { renders++; };
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2);
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.requestCount, 2);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'complete');
    assert.ok(h.context.chatMetadata.taleFairyCampaignAttempt.recoveryReason);
    assert.match(h.statuses.join('\n'), /Correcting planner response automatically/);
    assert.match(h.statuses.at(-1), /corrected automatically/);
    assert.ok(renders > 0, 'preview refreshes after the host work clears');
    assert.match(h.prepare().payload, /An original tune/);
    h.scope.campaignSession = null;
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2, 'reloaded attempt reservation covers both requests');
});

for (const mutation of ['edit', 'stop', 'switch', 'disable']) test(`automatic correction cancels before sending after ${mutation}`, async () => {
    const h = browser(async () => {
        if (mutation === 'edit') h.context.chat[0].mes = 'Edited accepted story.';
        if (mutation === 'stop') h.scope.campaignSession.stop();
        if (mutation === 'switch') h.context.getCurrentChatId = () => 'different-story';
        if (mutation === 'disable') h.settings.enabled = false;
        return { choices: [{ message: { content: '{"plan":' }, finish_reason: 'stop' }] };
    });
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1);
    assert.equal(h.state().campaignPreparation, null);
});

test('concurrent Guide clicks join an in-flight automatic correction', async () => {
    let release, calls = 0;
    const h = browser(async () => {
        if (++calls === 1) return { choices: [{ message: { content: 'invalid JSON' }, finish_reason: 'stop' }] };
        return new Promise(resolve => { release = () => resolve({ choices: [{ message: { content: JSON.stringify(design) }, finish_reason: 'stop' }] }); });
    });
    const pending = h.scope.analyzeCampaignNow();
    await settle();
    assert.equal(h.requests.length, 2);
    assert.equal(h.scope.analyzeCampaignNow({ manual: true }), pending);
    release();
    await pending;
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.equal(h.requests.length, 2);
});
