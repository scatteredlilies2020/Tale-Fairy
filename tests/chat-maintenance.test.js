import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { inspectChatMetadata, upgradeChatMetadata } from '../extension/chat-maintenance.js';
import { defaultState, STATE_VERSION } from '../extension/state.js';
import { emptyCampaign } from '../extension/campaign-planner.js';
import { directorInput, directorPass } from '../extension/story-director.js';
import { compactGenerationContextCache, GENERATION_CONTEXT_KEY } from '../extension/generation-context.js';
import { emptyFuture } from '../extension/future-planner.js';
import { storageMaintenanceDetails } from '../extension/storage-migration.js';

async function storyMetadata() {
    const state = emptyCampaign();
    const effects = Array.from({ length: 21 }, (_, i) => ({ label: `Activity ${i}`, weight: i - 10,
        scope: 'Related activities in this setting', pressure: 'Established opportunities influence relevant play.' }));
    const raw = { reviewAfter: 12, foundation: { reminder: 'An open-ended fantasy household RP.', effects: [effects[12]], changeReason: '', scratchpad: '' },
        upsert: [{ id: 'r1-house', kind: 'saga', parentId: '', status: 'active', title: 'Household life', owner: 'The household',
            description: 'Relationships and ordinary interests can evolve.', effects, endsWhen: '', links: [] }],
        retain: [], retire: [], select: [], effectUpdates: [], bridges: [] };
    const input = directorInput({ state, reference: { premise: 'An open-ended fantasy RP.' },
        messages: [{ index: 0, role: 'user', content: 'I meet the household.' }] });
    const result = await directorPass({ state, input, source: { chatId: 'story', messageCount: 1, referenceHash: 'r', fingerprint: 'f' },
        generate: async () => ({ text: JSON.stringify(raw), finishReason: 'stop' }) });
    assert.equal(result.accepted, true, result.error);
    return { livingWorldGuide: { ...defaultState(), plannerContract: 15, campaignPreparation: result.state }, taleFairyFuture: emptyFuture() };
}

test('all 21 integer weights are already current and maintenance never rewrites a valid story', async () => {
    const metadata = await storyMetadata(), original = structuredClone(metadata);
    const report = inspectChatMetadata(metadata);
    assert.deepEqual(report.findings, []);
    assert.equal(report.checks.activityRecords, 2);
    assert.equal(report.checks.futurePlans, 1);
    assert.equal(upgradeChatMetadata(metadata), metadata);
    assert.deepEqual(metadata, original);
});

test('maintenance flags missing or empty World Frame activities without guessing a repair or changing history', async () => {
    for (const kind of ['empty', 'missing-effects', 'missing-foundation']) {
        const metadata = await storyMetadata();
        const structure = metadata.livingWorldGuide.campaignPreparation.workingPlan.storyStructure;
        if (kind === 'empty') structure.foundation.effects = [];
        if (kind === 'missing-effects') delete structure.foundation.effects;
        if (kind === 'missing-foundation') delete structure.foundation;
        const before = structuredClone(metadata);
        const report = inspectChatMetadata(metadata);
        assert.equal(report.needsGuide, true, kind);
        assert.equal(report.findings.find(item => item.code === 'empty-world-activities').count, 1);
        assert.equal(upgradeChatMetadata(metadata), metadata);
        assert.deepEqual(metadata, before);
    }
    assert.match(storageMaintenanceDetails({ maintenance: 1, findings: { 'empty-world-activities': 1 } }), /World Frames missing weighted activities: 1/);
});

test('weighted audit covers foundation and offscreen/dormant/proposed records, not terminal history', async () => {
    const metadata = await storyMetadata();
    const structure = metadata.livingWorldGuide.campaignPreparation.workingPlan.storyStructure;
    const legacy = { label: 'Shared exploration', pressure: 'Learning together can open possibilities.' };
    structure.foundation.effects = [legacy];
    structure.nodes[0].effects = [legacy];
    for (const status of ['dormant', 'proposed', 'closed']) structure.nodes.push({ ...structure.nodes[0], id: `r1-${status}`, status });
    const original = structuredClone(metadata);
    const report = inspectChatMetadata(metadata);
    assert.equal(report.findings.find(item => item.code === 'unweighted-activities').count, 4);
    assert.equal(report.needsGuide, true);
    assert.equal(upgradeChatMetadata(metadata), metadata, 'no guessed weights or scope');
    assert.deepEqual(metadata, original);
});

test('invalid weights, damaged plans, futures and retry trust are reported without mutation', async () => {
    const metadata = await storyMetadata();
    metadata.livingWorldGuide.campaignPreparation.workingPlan.storyStructure.nodes[0].effects[0].weight = 11;
    metadata.taleFairyFuture = { version: 1, revision: 2, cards: [{ id: 'broken' }] };
    metadata.taleFairyGenerationContext = { version: 1, entries: [{ version: 1, payload: 'untrusted', selection: {}, plannerState: {} }] };
    const original = structuredClone(metadata);
    const report = inspectChatMetadata(metadata);
    assert.equal(report.needsGuide, true);
    assert.equal(report.needsReview, true);
    assert.deepEqual(report.findings.map(item => item.code), ['invalid-plan', 'invalid-future', 'rejected-retries']);
    assert.deepEqual(metadata, original);
});

test('empty preparations are not stale; unknown/future state is never downgraded; pending story work survives normalization', () => {
    const metadata = { livingWorldGuide: { ...defaultState(), plannerContract: 15, campaignPreparation: emptyCampaign() } };
    assert.deepEqual(inspectChatMetadata(metadata).findings, []);
    for (const state of [{ version: STATE_VERSION + 1 }, { version: STATE_VERSION, plannerContract: 16 }, 'damaged', { plannerContract: 15 }]) {
        const value = { livingWorldGuide: state };
        assert.equal(upgradeChatMetadata(value), value);
        assert.equal(inspectChatMetadata(value).findings[0].code, 'unsupported-state');
    }
    metadata.livingWorldGuide.version = 58;
    const next = upgradeChatMetadata(metadata);
    assert.equal(next.livingWorldGuide.version, STATE_VERSION);
    assert.equal(next.livingWorldGuide.canonBootstrapPending, true);
    assert.equal(upgradeChatMetadata(next), next);
    assert.equal(inspectChatMetadata(next).needsGuide, true);
});

const source = fs.readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
function browserHarness({ planning = false, change = null, result = null } = {}) {
    const context = { chatMetadata: { livingWorldGuide: { ...defaultState(), version: 58, plannerContract: 14 } },
        getCurrentChatId: () => 'active', saveMetadata: async () => { saved++; }, updateChatMetadata: value => { context.chatMetadata = value; mirrored++; } };
    let saved = 0, mirrored = 0, calls = 0, options;
    const scope = vm.createContext({ detachedPlannerReady: Promise.resolve(), storageMaintenanceAvailable: true, storageMaintenancePending: false,
        storageMigrationState: null, analysisPromise: planning, campaignHostWork: null, campaignSession: null, futureHost: null,
        renderStorageMigration() {}, currentContext: () => context,
        checkAllChatStorage: async value => { calls++; options = value; change?.(context); return result || { maintenance: 1, status: 'attention', issueCount: 0, remaining: 0 }; },
        upgradeChatMetadata, compactGenerationContextCache, GENERATION_CONTEXT_KEY, updatePrompt() {}, loadState: value => value.livingWorldGuide, renderBoard() {} });
    vm.runInContext(source.match(/async function runChatMaintenance\([^]*?^}/m)[0], scope);
    return { scope, context, counts: () => ({ saved, mirrored, calls, options }) };
}

test('one maintenance click flushes current metadata and mirrors verified repairs without an extra stale save or AI job', async () => {
    const h = browserHarness();
    await h.scope.runChatMaintenance();
    assert.equal(h.counts().calls, 1);
    assert.equal(h.counts().saved, 1, 'only the preflight flush saves; server owns backed-up repairs');
    assert.equal(h.counts().mirrored, 1);
    assert.equal(h.counts().options.maintenance, true);
    assert.equal(h.context.chatMetadata.livingWorldGuide.version, STATE_VERSION);
    assert.equal(h.scope.storageMaintenancePending, false);
});

test('maintenance does not race already-active planning or double clicks', async () => {
    const h = browserHarness({ planning: true });
    await h.scope.runChatMaintenance();
    assert.equal(h.counts().calls, 0);
    assert.match(h.scope.storageMigrationState.error, /active planning/);
    const second = browserHarness();
    await Promise.all([second.scope.runChatMaintenance(), second.scope.runChatMaintenance()]);
    assert.equal(second.counts().calls, 1);
});

test('maintenance never mirrors an uncertain result, concurrent browser edit or different chat', async () => {
    for (const options of [{ result: { maintenance: 1, issueCount: 1, remaining: 0 } },
        { change: context => { context.chatMetadata.userEdit = true; } },
        { change: context => { context.getCurrentChatId = () => 'different'; } }]) {
        const h = browserHarness(options);
        await h.scope.runChatMaintenance();
        assert.equal(h.counts().mirrored, 0);
        assert.equal(h.context.chatMetadata.livingWorldGuide.version, 58);
    }
});

test('maintenance details distinguish required story work from safe repairs and preserve actionable diagnostics', () => {
    const details = storageMaintenanceDetails({ maintenance: 1, findings: { 'unweighted-activities': 3, 'rejected-retries': 2 } });
    assert.match(details, /missing weights\/scopes: 3/);
    assert.match(details, /unauthenticated retry packets \(retained\): 2/);
    assert.match(details, /No AI was called/);
    assert.match(source, /storageMaintenanceAvailable = health\?\.storageMaintenance === 1/);
    assert.match(source, /void checkAllChatStorage\(\)/, 'startup still only resumes the existing receipt');
});
