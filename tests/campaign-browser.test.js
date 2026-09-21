import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { generationHarness } from './helpers/generation-harness.js';
import { defaultState, defaultPlannerState, loadPlannerState, saveState, STATE_KEY } from '../extension/state.js';
import { buildStoryEvidence } from '../extension/analysis.js';
import { storyInput } from '../extension/story-selection.js';
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
const design = { rp_brief: 'PRIVATE an ensemble explores music and life between engagements. No established franchise.', realization: [], selected_material: [{ subjectIds: ['music'], available: 'An original tune has potential for contrasting arrangements.', developing: 'Different arrangements could change whose contribution the group values across later sessions.', lasting: 'The repertoire could support shared authorship and distinct musical identities.' }], campaign: 'A changing body of original work.', episode: { subject: 'Public bill', status: 'finished', boundary: 'The public bill is over.' },
    developments: [{ id: 'music', initiative: { control: 'npc', owner: 'Jo', aim: 'Compose a piece worth keeping.' },
        background: { unfolding: 'PRIVATE Jo can work on arrangements independently.', basis: 'PRIVATE established composition; no new time skip.',
            access: { route: 'contact', basis: 'PRIVATE the ensemble is together after the show.' } },
        development: 'Versions can be heard, tried and revised.',
        stakes: 'Each musician values their own contribution.', participation: 'Shared off-hours.' }] };

function browser(send = async () => ({ choices: [{ message: { content: JSON.stringify(design) }, finish_reason: 'stop' }] }), initialState = defaultState()) {
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
    for (const name of ['showCampaignPhase', 'readCampaignSnapshot', 'buildCampaignHostInput', 'saveCampaignAttempt', 'campaignCompletion', 'runCampaignAnalysis', 'analyzeCampaignNow', 'startCampaignPlanning', 'applyCampaignInstruction', 'rebuildGuideState', 'analyzeNow']) {
        vm.runInContext(source.match(new RegExp(`(?:export )?(?:async )?function ${name}\\([^]*?^}`, 'm'))[0].replace(/^export /u, ''), h.scope);
    }
    return { ...h, requests, shared };
}

test('notebook distinguishes estimated writer cap from preserved author-only overflow', () => {
    const scope = vm.createContext({ campaignPayloadBudget });
    vm.runInContext(source.match(/function campaignBudgetSummary\([^]*?^}/m)[0], scope);
    assert.match(scope.campaignBudgetSummary(null, []), /estimated 0\/1000/);
    const note = 'Explicit instruction. '.repeat(700);
    assert.match(scope.campaignBudgetSummary(null, [note]), /Author instructions alone exceed.*remain verbatim/);
});

test('oversized writer material is saved, withheld and reported without another model call', async () => {
    const value = structuredClone(design);
    for (const key of ['available', 'developing', 'lasting']) value.selected_material[0][key] = '音'.repeat(800);
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1);
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.deepEqual(h.state().campaignPreparation.selectedMaterial, value.selected_material);
    assert.match(h.statuses.at(-1), /oversized writer block.*withheld.*saved/);
    assert.equal(h.prepare().payload, '');
    h.scope.generationGuideSelection = null;
    assert.equal(h.prepare('swipe').payload, '');
    assert.equal(h.requests.length, 1);
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

test('host saves repeated episode progression and reports normalized details without another request', async () => {
    const value = structuredClone(design);
    value.realization = [{ id: 'music', changes: [
        { episodeId: 'show', status: 'participating', evidence: [{ index: 0, span: 0 }] },
        { episodeId: 'show', status: ' Completed ', evidence: [{ index: '1', span: '0' }] },
    ] }];
    value.developments[0].commentary = 'Ignore optional commentary.';
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] }));
    h.context.chat[0].mes = 'Mara began the performance.';
    h.context.chat[1].mes = 'I finish playing the last chord.';
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 1);
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.equal(h.state().campaignPreparation.realization.music.episodes.show.status, 'completed');
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'complete');
    assert.match(h.statuses.at(-1), /Campaign preparation ready.*normalized/);
});

test('initial budget failure reports no plan and generation does not retain a preparing label', async () => {
    const h = browser();
    h.context.chat.push({ is_user: true, name: 'Neri', mes: 'Protected player contribution. '.repeat(10000) });
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 0);
    assert.match(h.statuses.at(-1), /^No preparation available · Planner input .* exceeds/);
    assert.doesNotMatch(h.statuses.at(-1), /Previous preparation retained/);
    h.prepare();
    assert.match(h.statuses.at(-1), /No plot preparation available|Scene context ready/);
    assert.doesNotMatch(h.statuses.at(-1), /Preparing/);
});

test('host saves a partial update with a missing initiative and injects its fresh selection', async () => {
    const value = structuredClone(design);
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow({ manual: true });
    const previous = structuredClone(h.state().campaignPreparation.developments[0].initiative);
    delete value.developments[0].initiative;
    value.selected_material[0].available = 'A revised tune is available for shared practice.';
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 2, 'one provider call per requested review');
    assert.equal(h.state().campaignPreparation.revision, 2);
    assert.deepEqual(h.state().campaignPreparation.developments[0].initiative, previous);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'complete');
    assert.match(h.statuses.at(-1), /Campaign preparation ready.*normalized/);
    assert.match(h.prepare().payload, /revised tune/);
});

test('host reports an incomplete new development while saving unrelated usable material', async () => {
    const value = structuredClone(design);
    const incomplete = { ...structuredClone(value.developments[0]), id: 'new-subject' };
    delete incomplete.initiative;
    value.developments.push(incomplete);
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1);
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.equal(h.state().campaignPreparation.developments.length, 1);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'complete');
    assert.match(h.statuses.at(-1), /deferred 1 incomplete development/);
    assert.match(h.prepare().payload, /An original tune has potential/);
});

test('incomplete drafts cannot hide player ownership from host validation', async () => {
    const value = structuredClone(design);
    value.developments[0].initiative = { owner: 'Neri' };
    delete value.developments[0].stakes;
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1);
    assert.equal(h.state().campaignPreparation, null);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'failed');
    assert.match(h.statuses.at(-1), /Player cannot own/);
});

test('uncached lorebooks never block or trigger a book load in active planning', async () => {
    const h = browser();
    h.scope.selected_world_info = ['Not cached'];
    h.scope.loadWorldInfo = async () => { throw Error('Planner must not load books'); };
    await h.scope.startCampaignPlanning();
    assert.equal(h.requests.length, 1);
    assert.equal(h.state().campaignPreparation.rpBrief, design.rp_brief);
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
    assert.equal(input.previous_preparation.rp_brief, undefined);
    assert.equal(input.previous_preparation.developments.length, 0);
    assert.match(h.requests[1].prompt, /External summary stays/);
    assert.deepEqual(h.state().campaignPreparation.archive[0].preparation, saved);
    await h.emit('WORLD_INFO_ACTIVATED', [{ content: 'Cached surface.' }]);
    await h.scope.resetState();
    assert.equal(h.state().campaignPreparation, null);
    assert.equal(h.scope.activatedStoryContext.snapshot, null);
    assert.equal(h.context.chatMetadata.summary, 'External summary stays.');
    assert.equal(h.scope.worldInfoCache.get('Book'), book);
});

test('host accepts extra episode commentary in one request and reports the discarded field', async () => {
    const response = structuredClone(design);
    response.episode.boundary_extra = 'Extra provider commentary.';
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(response) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 1);
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.equal(h.state().campaignPreparation.episode.boundary, design.episode.boundary);
    assert.equal(h.state().campaignPreparation.episode.boundary_extra, undefined);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'complete');
    assert.match(h.statuses.at(-1), /Campaign preparation ready · \d+s · ignored 1 extra episode field/);
    assert.ok(h.prepare().payload);
});

test('host replaces scene guidance even when an old private subject is omitted, then retires it with final evidence', async () => {
    const wider = structuredClone(design);
    wider.developments[0].id = 'travel';
    wider.selected_material[0] = { subjectIds: ['travel'], available: 'Open regional routes.',
        developing: 'Recurring visits can support exchanges between communities.', lasting: 'Different places could become familiar homes.' };
    const closing = structuredClone(wider);
    closing.retire = [{ id: 'music', scope: 'whole-subject', reason: 'The undertaking is permanently closed.',
        evidence: [3], witnesses: [{ index: 3, span: 0 }] }];
    closing.realization = [{ id: 'music', changes: [{ episodeId: 'last-performance', status: 'completed',
        evidence: [{ index: 3, span: 0 }] }] }];
    const replies = [design, wider, closing];
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(replies.shift()) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow({ manual: true });
    h.context.chat.push({ is_user: true, name: 'Neri', mes: 'We arrive in the next town.' });
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.state().campaignPreparation.revision, 2);
    assert.equal(h.state().campaignPreparation.developments.length, 2);
    assert.match(h.prepare().payload, /Open regional routes/);
    assert.doesNotMatch(h.prepare().payload, /original tune/);
    h.context.chat.push({ is_user: true, name: 'Neri', mes: 'The final performance is finished. We permanently abandon the musical undertaking.' });
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 3, 'exactly one request per review, no repair pass');
    const saved = h.state().campaignPreparation;
    assert.equal(saved.revision, 3);
    assert.deepEqual(saved.developments.map(entry => entry.id), ['travel']);
    assert.equal(saved.realization.music.episodes['last-performance'].status, 'completed');
    const payload = h.prepare().payload;
    assert.match(payload, /Open regional routes/);
    h.context.chatMetadata = JSON.parse(JSON.stringify(h.context.chatMetadata));
    h.scope.generationGuideSelection = null;
    assert.equal(h.prepare().payload, payload, 'metadata reload keeps the current exact injection');
});

test('shared selection survives actual metadata, cache authentication and retries without duplicating private subjects', async () => {
    const grouped = structuredClone(design);
    grouped.developments.push({ ...structuredClone(grouped.developments[0]), id: 'exchange',
        initiative: { control: 'npc', owner: 'Sef', aim: 'Exchange private arrangements with fellow musicians.' } });
    grouped.selected_material[0].subjectIds.push('exchange');
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

test('a malformed whole-story snapshot never partially replaces host preparation or starts a repair request', async () => {
    const invalid = structuredClone(design); delete invalid.selected_material;
    invalid.developments[0].development = 'A private update that must not commit.';
    const replies = [design, invalid];
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(replies.shift()) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow({ manual: true });
    const before = structuredClone(h.state().campaignPreparation);
    const payload = h.prepare().payload;
    h.context.chat.push({ is_user: true, mes: 'I ask about the wider season.' });
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 2);
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
    assert.equal(request.spec.schema.name, 'tale_fairy_rp_plot_v5');
    assert.equal(request.spec.reasoningMode, undefined, 'honor saved reasoning instead of legacy forced Off');
    assert.equal(request.meta, null, 'no legacy detached recovery contract');
    const input = JSON.parse(request.prompt);
    assert.deepEqual(input.accepted_messages.at(-1).spans, [{ span: 0, text: 'I help pack.' }]);
    assert.ok(input.source_reference);
    assert.deepEqual(input.player_control.names, ['Neri']);
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.equal(h.state().campaignPreparation.developments[0].initiative.owner, 'Jo');
    assert.match(h.prepare().payload, /An original tune has potential/);
    assert.deepEqual(JSON.parse(h.prepare().payload.replace(/<\/?tale-fairy-context>/g, '').trim()),
        { possible_developments: design.selected_material.map(materialHorizons) }, 'actual host injects discoverable material, not private ownership or a whole future plan');
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'complete');
});

test('reload and retry authenticate old scene packets but inject only story material without a planning call', async () => {
    const h = browser();
    await h.scope.analyzeNow({ force: true });
    const legacy = structuredClone(h.state());
    delete legacy.campaignPreparation.selectedMaterial;
    delete legacy.campaignPreparation.background;
    legacy.campaignPreparation.realization.music.playable = [{ episodeId: 'arrangement', when: 'At noon.',
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
    delete old.campaignPreparation.storyMaterialVersion;
    delete old.campaignPreparation.selectedMaterial;
    delete old.campaignPreparation.background;
    old.campaignPreparation.realization.music.playable = [{ episodeId: 'arrangement', when: 'If the musicians choose to collaborate.', direction: design.selected_material[0].available, middle: design.selected_material[0].developing, future: design.selected_material[0].lasting }];
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
    assert.deepEqual(Object.keys(packet), ['possible_developments', 'author_instructions']);
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
    assert.match(h.prepare().payload, /"possible_developments":\[\{/);
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
    assert.ok(users.every(m => !Object.hasOwn(m, 'name') && m.spans.map(s => s.text).join('') === h.context.chat[m.index].mes));
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

test('ordinary received events automatically commit a quiet snapshot and later restore reviewed material without repair calls', async () => {
    const revised = structuredClone(design);
    revised.selected_material[0].available = 'A different musical collaboration is available.';
    const responses = [design, { ...design, selected_material: [], realization: [] }, revised];
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
    assert.deepEqual(quiet.realization.music.playable, []);
    assert.deepEqual(quiet.developments, first.developments);
    assert.equal(h.prepare().payload, '', 'old pre-review packet must not survive a committed review');
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2, 'withholding does not start an immediate retry loop');
    await acceptedReplies('Later shared interests develop');
    assert.equal(h.requests.length, 3);
    assert.match(h.prepare().payload, /different musical collaboration/);
    assert.doesNotMatch(h.prepare().payload, /An original tune has potential/);
    assert.equal(h.state().campaignPreparation.realization.music.needsPlayableReview, undefined);
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

test('host fits a small overrun by omitting optional history before its single provider request', async () => {
    const h = browser();
    for (let i = 0; i < 40; i++) h.context.chat.push({ is_user: false,
        mes: `District ${i} traditions include ` + 'neighbors maintaining boats and exchanging supplies by the harbor '.repeat(80) + '.' });
    h.context.chat.push({ is_user: true, mes: 'I decline the offer and keep my boat.' }, { is_user: false, mes: 'The boat remains here.' });
    const snapshot = h.scope.readCampaignSnapshot();
    const messages = snapshot.messages.map((m, index) => ({ index, role: m.is_user ? 'user' : 'assistant', name: m.name || '', content: m.mes || '' }));
    const args = { reference: snapshot.reference, state: snapshot.state, playerNames: snapshot.playerNames,
        messages: campaignEvidenceMessages(campaignReviewWindow(messages, 2), { narrative: true }),
        historical: { ...buildStoryEvidence(snapshot.messages), opening: undefined } };
    const full = storyInput(args, 100000);
    h.settings.maxPromptTokens = full.inputTokens - 361;
    assert.throws(() => storyInput(args, h.settings.maxPromptTokens), /exceeds/);
    const before = structuredClone(h.context.chat);
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 1, h.statuses.join('\n'));
    assert.equal(h.state().campaignPreparation.revision, 1);
    const payload = JSON.parse(h.requests[0].prompt);
    assert.ok(payload.historical_evidence.budget_omission.excerpts > 0);
    assert.deepEqual(payload.accepted_messages, JSON.parse(full.prompt).accepted_messages);
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
        { possible_developments: design.selected_material.map(materialHorizons), author_instructions: [note] });
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

test('host discards progress interpretations whose accepted prefix changed, while preserving the saved ledger for review', async () => {
    const h = browser();
    await h.scope.analyzeCampaignNow();
    const saved = h.state();
    saved.campaignPreparation.realization.music.episodes.arrangement = {
        status: 'introduced', witnesses: [{ index: 0, role: 'assistant', quote: 'The show ended.' }],
        source: structuredClone(saved.campaignPreparation.source),
    };
    h.context.chatMetadata = saveState(h.context.chatMetadata, saved);
    h.context.chat[0].mes = 'The show did not happen.';
    const input = JSON.parse(h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot()).prompt);
    assert.deepEqual(input.accepted_progress, {});
    assert.equal(h.state().campaignPreparation.realization.music.episodes.arrangement.status, 'introduced');
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

test('retirement guards are branch-specific and cannot impose an edited-away closure on the new source', async () => {
    const h = browser();
    await h.scope.analyzeCampaignNow();
    const state = h.state();
    state.campaignPreparation.archive.push({ retirement: { id: 'old-subject', evidence: [0], reason: 'Finished' },
        development: { id: 'old-subject' }, source: structuredClone(state.campaignPreparation.source) });
    h.context.chatMetadata = saveState(h.context.chatMetadata, state);
    let input = JSON.parse(h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot()).prompt);
    assert.deepEqual(input.closed_subject_ids, ['old-subject']);
    h.context.chat[0].mes = 'An edited branch where that undertaking is still open.';
    input = JSON.parse(h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot()).prompt);
    assert.deepEqual(input.closed_subject_ids, []);
    assert.equal(h.state().campaignPreparation.archive.at(-1).development.id, 'old-subject');
});
