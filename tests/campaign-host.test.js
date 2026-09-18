import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { emptyCampaign, mergeCampaign, campaignPayload, validCampaignState, CAMPAIGN_MARKER } from '../extension/campaign-planner.js';
import { CampaignRuntime } from '../extension/campaign-runtime.js';
import * as injection from '../extension/request-injection.js';
import { defaultState, saveState, loadState, buildPromptPayload, guidanceSnapshot, isDirectionCurrent } from '../extension/state.js';
import { generationContextEntries, GENERATION_CONTEXT_KEY, legacyPlotInputKey, plotInputKey } from '../extension/generation-context.js';
import { generationHarness } from './helpers/generation-harness.js';

const messages = () => [{ is_user: false, name: 'Mara', mes: 'The public bill is finished.' },
    { is_user: true, name: 'Neri', mes: 'I join the next journey.' }];
const design = {
    campaign: 'Changing venues let the company develop its own work and working relationships.',
    episode: { subject: 'Public engagement', status: 'finished', boundary: 'No remaining obligation. PRIVATE OLD LEAD.' },
    developments: [{ id: 'music', premise: 'Jo has an original musical sketch.',
        progression: 'Changing rhythms alter the piece and what it can express. '.repeat(25),
        outcomes: 'An original work can be heard, revised, performed or kept private.', access: 'An ordinary shared off-night.' }],
};
function attach(h) {
    const state = { ...h.state(), plannerContract: 15 };
    const source = { chatId: 'story', messageCount: h.context.chat.length,
        fingerprint: h.scope.campaignFingerprint(h.context.chat),
        referenceHash: plotInputKey('story', [], h.scope.generationInputs(h.context, state)) };
    state.campaignPreparation = mergeCampaign(emptyCampaign(), design, { basisRevision: 0, source, evidenceIndices: [0, 1] });
    h.context.chatMetadata = saveState(h.context.chatMetadata, state);
    return state;
}

test('campaign preparation round-trips through actual metadata without clipping its middle or archive', () => {
    const h = generationHarness(messages());
    const state = attach(h);
    const original = state.campaignPreparation;
    state.campaignPreparation = mergeCampaign(original, { ...design, episode: { ...design.episode, subject: 'Next engagement', status: 'open' } },
        { basisRevision: 1, source: original.source, evidenceIndices: [0, 1] });
    const metadata = JSON.parse(JSON.stringify(saveState({ unrelated: { intact: true } }, state)));
    assert.deepEqual(loadState(metadata).campaignPreparation, state.campaignPreparation);
    assert.equal(loadState(metadata).plannerContract, 15);
    assert.deepEqual(metadata.unrelated, { intact: true });
    assert.equal(state.campaignPreparation.archive[0].episode.boundary, design.episode.boundary);
    assert.equal(isDirectionCurrent(state, h.context.chat, 'story'), false);
});

test('actual generation uses the complete campaign, without old scene directives or closed leads', () => {
    const h = generationHarness(messages());
    const state = attach(h);
    const selection = h.prepare();
    assert.equal(selection.preparedUsable, true);
    assert.equal(selection.usable, false);
    assert.equal(selection.payload, campaignPayload(state.campaignPreparation));
    assert.ok(selection.payload.includes(design.developments[0].progression));
    assert.doesNotMatch(selection.payload, /PRIVATE OLD LEAD|<plot-anchor>|<prepared-world>|CAUSAL ROLE/);
    assert.equal(guidanceSnapshot(state, selection).preparedContextIncluded, true);
    assert.equal(guidanceSnapshot(state, selection).dynamicContextIncluded, false);
    assert.equal(h.calls.length, 0);
    assert.equal(generationContextEntries(h.context.chatMetadata[GENERATION_CONTEXT_KEY]).length, 1);
});

test('reload and appended exchanges retain compatible campaign preparation; edits and references invalidate it', () => {
    const h = generationHarness(messages());
    attach(h);
    const original = h.prepare().payload;
    h.context.chatMetadata = JSON.parse(JSON.stringify(h.context.chatMetadata));
    h.scope.generationGuideSelection = null;
    assert.equal(h.prepare().payload, original);
    h.context.chat.push({ is_user: false, mes: 'They leave town.' }, { is_user: true, mes: 'I help make camp.' });
    h.scope.generationGuideSelection = null;
    assert.equal(h.prepare().payload, original);
    h.context.card = { persona: 'Changed source rules.' };
    h.scope.generationGuideSelection = null;
    assert.equal(h.prepare().payload, '');
    h.context.card = {};
    h.context.chat[0].mes = 'The show has not happened.';
    h.scope.generationGuideSelection = null;
    assert.equal(h.prepare().payload, '');
    assert.equal(h.calls.length, 0);
});

test('swipes never repair a campaign and cannot retain discarded-response preparation', async () => {
    const h = generationHarness(messages());
    attach(h);
    h.prepare();
    h.context.chat.push({ is_user: false, mes: 'A discarded response.' });
    h.scope.deferReplacementPlanning(h.context);
    assert.equal(h.state().plannerContract, 15);
    assert.equal(h.prepare('swipe').preparedUsable, true);
    await h.scope.repairDeferredReplacementPlan();
    assert.equal(h.calls.length, 0);

    // A plan made from the discarded response has no right to supply retry facts.
    const other = generationHarness([...messages(), { is_user: false, mes: 'Discarded invention.' }]);
    attach(other);
    other.scope.deferReplacementPlanning(other.context);
    assert.equal(other.state().plannerContract, 15, 'preserve invalid data for inspection, not a legacy fallback');
    assert.equal(other.prepare('swipe').payload, '');
    await other.scope.repairDeferredReplacementPlan();
    assert.equal(other.calls.length, 0);
});

for (const type of ['normal', 'swipe', 'regenerate']) test(`${type} keeps preparation across World Info budget changes and reloads`, async () => {
    const h = generationHarness(messages());
    let budget = 20, cap = 0;
    const settings = () => ({ world_info_depth: 2, world_info_budget: budget, world_info_budget_cap: cap });
    h.scope.getWorldInfoSettings = settings;
    attach(h);
    const original = h.prepare().payload;
    assert.ok(original);
    budget = 25;
    cap = 4096;
    await h.emit('WORLDINFO_SETTINGS_UPDATED');
    assert.equal(h.prepare().payload, original);
    if (type !== 'normal') h.context.chat.push({ is_user: false, mes: 'Discarded wording.' });
    const reopened = generationHarness(structuredClone(h.context.chat), h.state(), structuredClone(h.context.chatMetadata));
    reopened.scope.getWorldInfoSettings = settings;
    await reopened.emit('GENERATION_STARTED', type);
    assert.equal(reopened.prepare(type).payload, original);
    assert.equal(reopened.prepare(type).preparedUsable, true);
    const request = [{ role: 'user', content: 'I listen.' }];
    injection.ensureGuidanceInChat(request, reopened.prepare(type).payload, { role: 'user', depth: 1 });
    assert.equal(injection.extractTaleFairyContext({ messages: request }), original);
    assert.equal(h.calls.length + reopened.calls.length, 0);
});

test('budget tolerance does not admit changed lore, instructions, cards, or accepted source', () => {
    for (const change of [
        h => { h.scope.worldInfoCache.set('Story', { entries: { 1: { content: 'Changed fact.' } } }); },
        h => { h.scope.selected_world_info = ['Other']; },
        h => { h.context.chatMetadata.note_prompt = 'New author instruction.'; },
        h => { h.context.card = { description: 'Changed character.' }; },
        h => { h.context.chat[0].mes = 'Changed accepted history.'; },
        h => { h.scope.getWorldInfoSettings = () => ({ world_info_depth: 8, world_info_budget: 25 }); },
    ]) {
        const h = generationHarness(messages());
        h.scope.selected_world_info = ['Story'];
        h.scope.worldInfoCache.set('Story', { entries: { 1: { content: 'Original fact.' } } });
        h.scope.getWorldInfoSettings = () => ({ world_info_depth: 2, world_info_budget: 20 });
        attach(h);
        assert.ok(h.prepare().payload);
        h.scope.getWorldInfoSettings = () => ({ world_info_depth: 2, world_info_budget: 25 });
        change(h);
        h.scope.generationGuideSelection = null;
        assert.equal(h.prepare().payload, '');
    }
});

function legacyBudgetPlan(h, budget = 20) {
    h.scope.getWorldInfoSettings = () => ({ world_info_depth: 2, world_info_budget: budget, world_info_budget_cap: 0 });
    attach(h);
    const payload = h.prepare().payload;
    const metadata = structuredClone(h.context.chatMetadata);
    const inputs = h.scope.generationInputs(h.context, h.state());
    const referenceHash = legacyPlotInputKey('story', [], inputs);
    const source = metadata.livingWorldGuide.campaignPreparation.source;
    source.referenceHash = referenceHash;
    metadata.taleFairyCampaignAttempt = { ...source, assistantCount: 1, status: 'complete', key: 'old-runtime-key' };
    const packet = metadata[GENERATION_CONTEXT_KEY].entries[0];
    packet.inputKey = legacyPlotInputKey('story', h.context.chat, inputs);
    packet.selection.inputKey = packet.inputKey;
    packet.selection.campaignPreparation.source.referenceHash = referenceHash;
    packet.plannerState.campaignPreparation.source.referenceHash = referenceHash;
    return { metadata, payload };
}

test('upgrade preserves a proven legacy campaign and retry packet before later budget changes', async () => {
    const h = generationHarness(messages());
    const { metadata, payload } = legacyBudgetPlan(h);
    const original = JSON.stringify(metadata);
    const reopened = generationHarness([...messages(), { is_user: false, mes: 'Discarded reply.' }], metadata.livingWorldGuide, metadata);
    reopened.scope.getWorldInfoSettings = h.scope.getWorldInfoSettings;
    await reopened.emit('GENERATION_STARTED', 'swipe');
    const packet = reopened.prepare('swipe');
    assert.equal(packet.payload, payload);
    assert.equal(packet.reused, true);
    assert.notEqual(reopened.state().campaignPreparation.source.referenceHash, metadata.livingWorldGuide.campaignPreparation.source.referenceHash);
    assert.equal(reopened.context.chatMetadata.taleFairyCampaignAttempt.referenceHash, reopened.state().campaignPreparation.source.referenceHash);
    assert.equal(JSON.stringify(metadata), original, 'never mutate the old snapshot or its story material');
    const migrated = JSON.stringify(reopened.context.chatMetadata);
    assert.equal(reopened.scope.migrateCampaignReferences(), false, 'migration is idempotent');
    assert.equal(JSON.stringify(reopened.context.chatMetadata), migrated);
    reopened.scope.getWorldInfoSettings = () => ({ world_info_depth: 2, world_info_budget: 25, world_info_budget_cap: 8192 });
    await reopened.emit('WORLDINFO_SETTINGS_UPDATED');
    assert.equal(reopened.prepare('swipe').payload, payload);
    assert.equal(reopened.calls.length, 0);
});

test('upgrade never guesses an unmatched old budget or bypasses changed source/reference checks', async () => {
    for (const change of [
        h => { h.scope.getWorldInfoSettings = () => ({ world_info_depth: 2, world_info_budget: 25, world_info_budget_cap: 0 }); },
        h => { h.context.card = { description: 'A different character.' }; },
        h => { h.context.chatMetadata.note_prompt = 'Different author instructions.'; },
        h => { h.context.chat[0].mes = 'Different accepted history.'; },
    ]) {
        const h = generationHarness(messages());
        const { metadata } = legacyBudgetPlan(h);
        const reopened = generationHarness([...messages(), { is_user: false, mes: 'Discarded reply.' }], metadata.livingWorldGuide, metadata);
        reopened.scope.getWorldInfoSettings = h.scope.getWorldInfoSettings;
        change(reopened);
        await reopened.emit('GENERATION_STARTED', 'swipe');
        assert.equal(reopened.prepare('swipe').payload, '');
        assert.equal(reopened.calls.length, 0);
    }
});

test('malformed saved campaign is preserved for inspection but never injected', () => {
    const h = generationHarness(messages());
    const state = attach(h);
    state.campaignPreparation.developments[0].progression = null;
    const saved = saveState({}, state);
    const loaded = loadState(JSON.parse(JSON.stringify(saved)));
    assert.deepEqual(loaded.campaignPreparation, state.campaignPreparation);
    assert.equal(validCampaignState(loaded.campaignPreparation), false);
    assert.equal(buildPromptPayload(loaded, { preparedUsable: true }), '');
    assert.equal(guidanceSnapshot(loaded, { preparedUsable: true }).preparedContextIncluded, false);
    assert.equal(buildPromptPayload(defaultState(), { enabled: false }), '');
});

test('provider and text hooks verify campaign-only payloads and exclude internal planner requests', () => {
    const h = generationHarness(messages());
    attach(h);
    const payload = h.prepare().payload, proofs = [];
    const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
    const scope = { ...injection, currentGuidancePayload: () => payload, activeGenerationType: 'normal',
        containsPlannerMarker: value => injection.requestContainsMarker(value, CAMPAIGN_MARKER),
        requestInjectionOptions: () => ({ role: 'user', depth: 1, inlineLatestUser: true }),
        rememberVerifiedRequest: value => proofs.push(value), currentContext: () => ({ mainApi: 'test' }),
        recordRuntimeStage() {}, renderInjectionActivity() {}, reportNonBlockingInjectionFailure: message => assert.fail(message) };
    vm.createContext(scope);
    for (const name of ['ensureProviderChatRequestGuidance', 'ensureTextCompletionRequestGuidance']) {
        vm.runInContext(source.match(new RegExp(`function ${name}\\([^]*?^}`, 'm'))[0], scope);
    }
    const request = { messages: [{ role: 'user', content: 'I listen.' }] };
    scope.ensureProviderChatRequestGuidance(request);
    scope.ensureProviderChatRequestGuidance(request);
    assert.equal(injection.extractTaleFairyContext(request), payload);
    assert.equal(JSON.stringify(request).split('<tale-fairy-context>').length, 2, 'only one injected block');
    scope.ensureTextCompletionRequestGuidance({ prompt: 'I listen.' });
    assert.deepEqual(proofs, [payload, payload, payload]);
    const planner = { messages: [{ role: 'system', content: CAMPAIGN_MARKER }] };
    const original = JSON.stringify(planner);
    scope.ensureProviderChatRequestGuidance(planner);
    assert.equal(JSON.stringify(planner), original);
    assert.equal(proofs.length, 3);
});

test('background runtime commits through real metadata guards without overwriting appended play or UI state', async () => {
    const h = generationHarness(messages());
    attach(h);
    h.prepare();
    const frozenPayload = h.scope.generationGuideSelection.payload;
    let release, calls = 0;
    const runtime = new CampaignRuntime({ fingerprint: h.scope.campaignFingerprint,
        read: () => ({ state: h.state().campaignPreparation, messages: h.context.chat, chatId: 'story',
            referenceHash: plotInputKey('story', [], h.scope.generationInputs(h.context, h.state())) }),
        prepare: () => ({ prompt: '{}', indices: [0, 1] }),
        generate: () => { calls++; return new Promise(resolve => { release = resolve; }); },
        commit: h.scope.commitCampaignPreparation });
    const running = runtime.request();
    await Promise.resolve();
    h.context.chat.push({ is_user: false, mes: 'The party reaches camp.' });
    h.context.chatMetadata = saveState({ ...h.context.chatMetadata, unrelated: 'keep' }, { ...h.state(),
        lastReason: 'A UI save during planning', mode: 'fun' });
    release({ text: JSON.stringify({ ...design, developments: [{ ...design.developments[0], outcomes: 'The finished sketch can be heard.' }] }), finishReason: 'stop' });
    assert.equal((await running).accepted, true);
    assert.equal(calls, 1);
    assert.equal(h.state().campaignPreparation.revision, 2);
    assert.equal(h.state().mode, 'fun');
    assert.equal(h.context.chatMetadata.unrelated, 'keep');
    assert.equal(h.context.chat.at(-1).mes, 'The party reaches camp.');
    assert.equal(h.scope.generationGuideSelection.payload, frozenPayload, 'current writer request stays frozen');
    h.scope.generationGuideSelection = null;
    assert.match(h.prepare().payload, /The finished sketch can be heard/);
});

test('host commit independently rejects stale source, changed reference and competing preparation', () => {
    for (const change of ['source', 'reference', 'preparation', 'disabled']) {
        const h = generationHarness(messages());
        const state = attach(h), old = state.campaignPreparation;
        const incoming = mergeCampaign(old, design, { basisRevision: 1, source: old.source, evidenceIndices: [0, 1] });
        const guard = { stateFingerprint: h.scope.campaignFingerprint(old) };
        if (change === 'source') h.context.chat[0].mes = 'Edited';
        if (change === 'reference') h.context.card = { persona: 'Changed' };
        if (change === 'disabled') h.settings.enabled = false;
        if (change === 'preparation') h.context.chatMetadata = saveState(h.context.chatMetadata,
            { ...state, campaignPreparation: { ...old, campaign: 'A competing manual edit.' } });
        const before = JSON.stringify(h.context.chatMetadata);
        assert.equal(h.scope.commitCampaignPreparation(incoming, guard), false, change);
        assert.equal(JSON.stringify(h.context.chatMetadata), before);
    }
});

test('ready revisions replace older retry packets without changing a frozen in-flight selection', () => {
    const h = generationHarness(messages());
    const state = attach(h), old = state.campaignPreparation;
    const frozen = h.prepare().payload;
    const incoming = mergeCampaign(old, { ...design, campaign: 'A revised long-term design.' },
        { basisRevision: 1, source: old.source, evidenceIndices: [0, 1] });
    assert.equal(h.scope.commitCampaignPreparation(old, { stateFingerprint: h.scope.campaignFingerprint(old) }), false,
        'same-revision replay is not a newly completed pass');
    assert.equal(h.scope.commitCampaignPreparation(incoming, { stateFingerprint: h.scope.campaignFingerprint(old) }), true);
    assert.equal(h.scope.generationGuideSelection.payload, frozen);
    h.scope.generationGuideSelection = null;
    assert.match(h.prepare().payload, /A revised long-term design/);
    assert.equal(h.calls.length, 0);
});

test('campaign cache admits whole schema-bounded designs, not truncated or unrelated payloads', () => {
    const h = generationHarness(messages());
    const state = attach(h);
    state.campaignPreparation.developments = Array.from({ length: 4 }, (_, i) => ({ id: `subject-${i}`,
        premise: '"'.repeat(1600), progression: '"'.repeat(2400), outcomes: '"'.repeat(1600), access: '"'.repeat(900) }));
    h.context.chatMetadata = saveState(h.context.chatMetadata, state);
    const payload = h.prepare().payload;
    assert.ok(payload.length > 40000, 'escaped text remains valid without an arbitrary cache cutoff');
    const entries = generationContextEntries(h.context.chatMetadata[GENERATION_CONTEXT_KEY]);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].payload, payload);
    assert.equal(generationContextEntries({ entries: [{ ...entries[0], payload: '<tale-fairy-context>fabricated</tale-fairy-context>' }] }).length, 0);
});
