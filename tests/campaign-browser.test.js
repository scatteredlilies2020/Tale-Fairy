import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { generationHarness } from './helpers/generation-harness.js';
import { defaultState, defaultPlannerState, loadPlannerState, saveState, STATE_KEY } from '../extension/state.js';
import { buildStoryEvidence } from '../extension/analysis.js';
import { campaignEvidenceMessages, campaignReviewWindow } from '../extension/campaign-evidence.js';
import { completionText } from '../extension/completion-response.js';
import { extractTaleFairyContext } from '../extension/request-injection.js';

const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
const design = { campaign: 'A changing body of original work.', episode: { subject: 'Public bill', status: 'finished', boundary: 'The public bill is over.' },
    developments: [{ id: 'music', initiative: { control: 'npc', owner: 'Jo', aim: 'Compose a piece worth keeping.' },
        plot_points: [{ event: 'An original tune changes when another musician offers a contrasting arrangement.', opens: 'They could perform competing versions or work out a shared arrangement.' }], development: 'Versions can be heard, tried and revised.',
        stakes: 'Each musician values their own contribution.', participation: 'Shared off-hours.' }] };

function browser(send = async () => ({ choices: [{ message: { content: JSON.stringify(design) }, finish_reason: 'stop' }] }), initialState = defaultState()) {
    const h = generationHarness([{ is_user: false, name: 'Mara', mes: 'The show ended.' }, { is_user: true, name: 'Neri', mes: 'I help pack.' }],
        initialState);
    const requests = [], shared = new Map();
    Object.assign(h.settings, { maxPromptTokens: 14000, fullReviewInterval: 3, analysisSource: 'direct', analysisModel: 'test', analysisReasoningMode: 'low' });
    Object.assign(h.scope, { buildStoryEvidence, campaignEvidenceMessages, campaignReviewWindow, completionText,
        loadState: loadPlannerState, defaultState: defaultPlannerState,
        plannerStorage: () => ({ getItem: key => shared.get(key), setItem: (key, value) => shared.set(key, value) }),
        withPlannerTabLock: (_id, task) => task(),
        requestAnalysisOnce: async (prompt, signal, meta, spec) => {
            requests.push({ prompt, signal, meta, spec });
            return spec.parseResponse(await send({ prompt, signal, meta, spec }));
        },
    });
    for (const name of ['readCampaignSnapshot', 'buildCampaignHostInput', 'saveCampaignAttempt', 'campaignCompletion', 'analyzeCampaignNow', 'startCampaignPlanning', 'applyCampaignInstruction', 'rebuildGuideState', 'analyzeNow']) {
        vm.runInContext(source.match(new RegExp(`(?:export )?(?:async )?function ${name}\\([^]*?^}`, 'm'))[0].replace(/^export /u, ''), h.scope);
    }
    return { ...h, requests, shared };
}

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

test('actual campaign entry builds evidence, uses single-shot transport and commits usable preparation', async () => {
    const h = browser();
    await h.scope.analyzeNow({ force: true });
    assert.equal(h.requests.length, 1);
    const request = h.requests[0];
    assert.equal(request.spec.singleShot, true);
    assert.equal(request.spec.schema.name, 'tale_fairy_event_opportunities_v1');
    assert.equal(request.spec.reasoningMode, undefined, 'honor saved reasoning instead of legacy forced Off');
    assert.equal(request.meta, null, 'no legacy detached recovery contract');
    const input = JSON.parse(request.prompt);
    assert.equal(input.accepted_messages.at(-1).content, 'I help pack.');
    assert.ok(input.source_reference);
    assert.deepEqual(input.player_control.names, ['Neri']);
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.equal(h.state().campaignPreparation.developments[0].initiative.owner, 'Jo');
    assert.match(h.prepare().payload, /An original tune changes/);
    assert.deepEqual(JSON.parse(h.prepare().payload.replace(/<\/?tale-fairy-context>/g, '').trim()),
        { proposed_events: design.developments[0].plot_points.map(point => point.event) }, 'actual host injects events, not a writing preset');
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'complete');
});

test('host review boundary follows the accepted preparation prefix and resets after an edit', async () => {
    const h = browser();
    await h.scope.analyzeCampaignNow({ manual: true });
    h.context.chat.push({ is_user: false, name: 'Mara', mes: 'The company leaves.' }, { is_user: true, name: 'Neri', mes: 'I ask about the next town.' });
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 2);
    const review = JSON.parse(h.requests[1].prompt).previous_preparation.review_scope;
    assert.equal(review.accepted_before, 2);
    assert.deepEqual(review.newly_reviewed_indices, [2, 3]);
    h.context.chat[0].mes = 'Corrected earlier source.';
    const rebuilt = JSON.parse(h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot()).prompt);
    assert.equal(rebuilt.previous_preparation.review_scope.accepted_before, 0);
    assert.deepEqual(rebuilt.previous_preparation.review_scope.newly_reviewed_indices, [0, 1, 2, 3]);
});

test('a planning-scope upgrade reconsiders earlier player choices and replaces the local plan in one call', async () => {
    const h = browser();
    await h.scope.analyzeCampaignNow();
    const state = h.state();
    for (let i = 0; i < 40; i++) h.context.chat.push(
        { is_user: false, name: 'Mara', mes: `Stop ${i}.` },
        { is_user: true, name: 'Neri', mes: `We choose region ${i}.` });
    state.campaignPreparation.source.messageCount = h.context.chat.length;
    state.campaignPreparation.source.fingerprint = h.scope.campaignFingerprint(h.context.chat);
    delete state.campaignPreparation.planningScope;
    h.context.chatMetadata = saveState(h.context.chatMetadata, state);
    h.context.chat.push({ is_user: false, name: 'Mara', mes: 'More local business.' });
    const built = h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot());
    const payload = JSON.parse(built.prompt);
    assert.equal(payload.previous_preparation.reframe_required, true);
    assert.deepEqual(payload.accepted_messages.filter(m => m.role === 'user').map(m => m.index),
        h.context.chat.flatMap((m, index) => m.is_user ? [index] : []), 'protect all earlier player choices during the one-time reframe');
    assert.deepEqual(payload.previous_preparation.developments, []);
    assert.equal(payload.previous_preparation.scope_reset, true);
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 2, 'one call for the initial plan and one for the scope upgrade');
    assert.equal(h.state().campaignPreparation.planningScope, 'independent-developments-v2');
    assert.equal(h.state().campaignPreparation.archive.filter(entry => entry.development).length, 1);
});

test('normal host review upgrades a v1 independent plan without a separate control or lost author notes', async () => {
    const h = browser();
    await h.scope.analyzeCampaignNow();
    const previous = structuredClone(h.state().campaignPreparation);
    previous.planningScope = 'independent-developments-v1';
    h.context.chatMetadata = saveState(h.context.chatMetadata, { ...h.state(), campaignPreparation: previous,
        campaignInstructions: [{ text: 'Keep the next journey open.' }] });
    await h.scope.analyzeNow({ force: true });
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[1].spec.singleShot, true);
    assert.equal(JSON.parse(h.requests[1].prompt).previous_preparation.scope_reset, true);
    const state = h.state();
    assert.equal(state.campaignPreparation.planningScope, 'independent-developments-v2');
    assert.deepEqual(state.campaignPreparation.archive.find(entry => entry.scopeReframe).development, previous.developments[0]);
    assert.deepEqual(state.campaignInstructions, [{ text: 'Keep the next journey open.' }]);
    const packet = JSON.parse(h.prepare().payload.replace(/<\/?tale-fairy-context>/g, '').trim());
    assert.deepEqual(Object.keys(packet), ['proposed_events', 'author_instructions']);
});

test('actual owned host review converts retained legacy subjects and archives their complete prior form', async () => {
    const h = browser();
    await h.scope.analyzeCampaignNow();
    const previous = structuredClone(h.state().campaignPreparation);
    delete previous.developments[0].initiative;
    delete previous.preparationFormat;
    previous.developments[0].premise = 'A retained legacy musical premise.';
    h.context.chatMetadata = saveState(h.context.chatMetadata, { ...h.state(), campaignPreparation: previous });
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 2, 'one call per distinct review');
    const input = JSON.parse(h.requests[1].prompt);
    assert.equal(input.previous_preparation.developments[0].premise, previous.developments[0].premise);
    assert.equal(input.previous_preparation.developments[0].initiative, undefined);
    const next = h.state().campaignPreparation;
    assert.equal(next.revision, 2);
    assert.equal(next.developments[0].initiative.owner, 'Jo');
    assert.deepEqual(next.archive.find(item => item.development)?.development, previous.developments[0]);
});

test('host reframes old plot essays from retained objectives in one call and archives their prose', async () => {
    const h = browser();
    await h.scope.analyzeCampaignNow();
    const previous = structuredClone(h.state().campaignPreparation);
    previous.preparationFormat = 'plot-points-v1';
    previous.developments[0].premise = 'OLD ESSAY TEMPLATE';
    h.context.chatMetadata = saveState(h.context.chatMetadata, { ...h.state(), campaignPreparation: previous });
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 2);
    const previousInput = JSON.parse(h.requests[1].prompt).previous_preparation;
    assert.equal(previousInput.reframe_required, true);
    assert.deepEqual(previousInput.developments[0].previous_objective, previous.developments[0].initiative);
    assert.equal(JSON.stringify(previousInput).includes('OLD ESSAY TEMPLATE'), false);
    const state = h.state().campaignPreparation;
    assert.equal(state.preparationFormat, 'event-opportunities-v1');
    assert.equal(state.archive.find(entry => entry.development?.premise === 'OLD ESSAY TEMPLATE').development.premise, 'OLD ESSAY TEMPLATE');
    assert.match(h.prepare().payload, /"proposed_events":\["/);
});

test('actual owned host rejects planned player ownership in one call without repair or commit', async () => {
    const invalid = structuredClone(design);
    invalid.developments[0].initiative.owner = 'Neri';
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(invalid) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1);
    assert.equal(h.state().campaignPreparation, null);
    assert.match(h.statuses.join('\n'), /Player cannot own/);
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1, 'failed unchanged source is not retried automatically');
});

test('actual host factors repeated speaker labels while preserving every initial player contribution', () => {
    const h = browser();
    for (let i = 0; i < 40; i++) h.context.chat.push(
        { is_user: true, name: 'Neri', mes: `I choose the north road ${i}.` },
        { is_user: false, name: 'Mara', mes: 'The road continues. '.repeat(600) });
    const input = h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot());
    const payload = JSON.parse(input.prompt);
    assert.equal(payload.default_speaker_name_by_role.user, 'Neri');
    const users = payload.accepted_messages.filter(m => m.role === 'user');
    assert.equal(users.length, 41);
    assert.ok(users.every(m => !Object.hasOwn(m, 'name') && m.content === h.context.chat[m.index].mes));
    assert.deepEqual(payload.player_control.names, ['Neri']);
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

test('host budget shrinking keeps new choices and reconsiders all users after a source edit', async () => {
    const h = browser();
    h.context.chat.push({ is_user: false, mes: 'An earlier stop.' }, { is_user: true, mes: 'Earlier choice.' });
    await h.scope.analyzeCampaignNow();
    h.context.chat.push({ is_user: true, mes: '<span style="color:red">I decline that investigation.</span>' });
    for (let i = 0; i < 40; i++) h.context.chat.push({ is_user: false, mes: `Road ${i}. ` + 'Ordinary road scenery. '.repeat(900) });
    h.context.chat.push({ is_user: true, mes: 'We stay on the north road.' }, { is_user: false, mes: 'We arrive.' });
    const input = JSON.parse(h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot()).prompt);
    assert.ok(input.accepted_messages.some(m => m.index === 4 && m.content === h.context.chat[4].mes));
    assert.ok(!input.accepted_messages.some(m => m.index === 5), 'older assistant prose omitted under pressure');
    assert.ok(!input.accepted_messages.some(m => m.index === 3), 'source-compatible reviewed contribution can be omitted');
    h.context.chat[3].mes = 'Edited earlier choice: no investigation.';
    const edited = JSON.parse(h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot()).prompt);
    assert.ok(edited.accepted_messages.some(m => m.index === 3 && m.content === h.context.chat[3].mes));
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
        assert.equal(h.requests.length, 1);
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
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.deepEqual(h.state().campaignPreparation.archive[0].preparation, before);
    assert.equal(JSON.parse(h.requests[1].prompt).previous_preparation.developments.length, 0);
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
        { proposed_events: design.developments[0].plot_points.map(point => point.event), author_instructions: [note] });
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
