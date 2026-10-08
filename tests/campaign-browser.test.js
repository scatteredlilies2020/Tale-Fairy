import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVELOPMENT_CONTRACT, STORY_GOAL_CONTRACT, STORY_GOALS_CONTRACT } from '../extension/story-budget.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { generationHarness } from './helpers/generation-harness.js';
import { defaultState, defaultPlannerState, loadPlannerState, saveState, STATE_KEY } from '../extension/state.js';
import { buildStoryEvidence } from '../extension/analysis.js';
import { storyInput, storyPassWithRecovery, STORY_SCHEMA, STORY_SYSTEM } from '../extension/bounded-story.js';
import { HORIZON_SCHEMA, SCENE_SCHEMA, preparationInput, preparationPass, PREPARATION_SCHEMA, PREPARATION_SYSTEM } from '../extension/story-preparation.js';
import { DIRECTOR_SCHEMA } from '../extension/story-director.js';
import { CampaignSession } from '../extension/campaign-session.js';
import { campaignEvidenceMessages, campaignReviewWindow } from '../extension/campaign-evidence.js';
import { completionText } from '../extension/completion-response.js';
import { readEvidenceProviders, evidenceRevisionKey, registerEvidenceProvider } from '../extension/evidence-providers.js';
import { readCampaignContinuity } from '../extension/campaign-continuity.js';
import { materialHorizons } from '../extension/selected-material.js';
import { storyInputTokens } from '../extension/story-budget.js';
import { originalUnderstanding } from './helpers/rp-fixtures.js';
import { extractTaleFairyContext, ensureGuidanceInChat, chatHasCurrentGuidance } from '../extension/request-injection.js';
import { legacyPlotInputKey, GENERATION_CONTEXT_KEY, generationContextEntries } from '../extension/generation-context.js';
import { campaignPayload, campaignPayloadBudget, contractedCampaignPayload, objectiveGuidancePayload, legacyCampaignPayload, validCampaignState } from '../extension/campaign-planner.js';

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
const design = { plan: { rpUnderstanding: originalUnderstanding({ setting: 'Original ensemble RP', experiences: 'Music and shared authorship.' }), direction: 'A changing body of original work.',
    goal: [{ subjectId: 'r1-music', scope: 'near-term', aim: 'Give the ensemble a new piece to try together.', reachedWhen: 'The contrasting arrangements have been played and compared.' }],
    threads: 'PRIVATE an ensemble explores music and life between engagements. No established franchise.',
    consequences: [], developments: [{ id: 'r1-music', kind: 'arc', owner: 'Jo', control: 'npc', trajectoryIds: [],
        question: 'Compose a piece worth keeping.', initiative: 'Jo works on contrasting arrangements.',
        resolution: 'The ensemble adopts or shelves this piece.', beyond: 'Other pieces and shared authorship remain possible.',
        access: { route: 'contact', basis: 'PRIVATE the ensemble is together after the show.' } }] },
    progression: { upsert: [], retire: [] }, exits: [], observations: [],
    selected_material: [{ subjectIds: ['r1-music'], available: 'An original tune has potential for contrasting arrangements.',
        developing: 'Different arrangements could change whose contribution the group values across later sessions.',
        lasting: 'The repertoire could support shared authorship and distinct musical identities.' }] };
const writerDesign = () => design.selected_material.map(materialHorizons);

const workshopReply = () => ({ storyLife: { scope: 'open', premise: 'Shared neighborhood life.', currentEpisode: 'Practicing music.', continuingLife: 'Music, meals and friendships.', horizonIds: [] }, rpUnderstanding: structuredClone(design.plan.rpUnderstanding), throughline: [], progression: { upsert: [{
    id: 'r1-kitchen', connection: 'independent', focus: 'A neighborhood supper book', owner: 'Community cooks', basis: 'Proposed neighborhood activity.',
    drive: 'Share family recipes.', experience: 'At the back-street kitchen, cooks test a supper menu and swap handwritten recipe cards.',
    next: { when: 'Cooks compare their trials', change: 'A shared supper menu takes shape.' },
    later: { when: 'Neighbors contribute their own recipes', change: 'A locally illustrated recipe book connects different households.' },
}], retire: [] } });
const sceneReply = () => {
    const value = structuredClone(design); delete value.progression; delete value.plan.rpUnderstanding;
    value.selected_material = [];
    value.outlook = { action: 'clear', reason: 'No selected future in this host-lifecycle fixture.', material: [] };
    value.initiative_review = { action: 'withdraw', reason: 'Quiet host-lifecycle fixture.', material: [], evidence: [] };
    value.plan.openings = []; value.plan.futureEntryVersion = 1; return value;
};
const envelope = value => ({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] });

test('legacy split browser runs the workshop then scene selection and commits both only once', async () => {
    let finish;
    const h = browser(async ({ prompt, spec }) => {
        if (spec.schema.name === HORIZON_SCHEMA.name) {
            assert.equal(JSON.parse(prompt).previous_plan, undefined);
            return envelope(workshopReply());
        }
        assert.equal(spec.schema.name, SCENE_SCHEMA.name);
        assert.equal(spec.schema.value.properties.progression, undefined);
        assert.equal(spec.schema.value.properties.plan.properties.rpUnderstanding, undefined);
        assert.equal(JSON.parse(prompt).prepared_horizon.trajectories[0].id, 'r1-kitchen');
        return new Promise(resolve => { finish = resolve; });
    }, defaultState(), { split: true });
    const work = h.scope.analyzeCampaignNow(); await settle();
    assert.equal(h.requests.length, 2);
    assert.equal(h.state().campaignPreparation?.revision || 0, 0);
    assert.equal(h.prepare().payload, '');
    finish(envelope(sceneReply())); await work;
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.deepEqual(h.state().campaignPreparation.workingPlan.trajectories, workshopReply().progression.upsert);
    assert.deepEqual(Array.from(h.context.chatMetadata.taleFairyCampaignAttempt.stages), ['horizon', 'scene']);
    assert.match(h.statuses.join('\n'), /wider story possibilities/);
    assert.match(h.statuses.join('\n'), /selecting material/);
    assert.doesNotMatch(h.prepare().payload, /recipe|rpUnderstanding|progression|r1-kitchen/);
    h.scope.campaignSession = null;
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2, 'one reservation survives reload for the whole pipeline');
});

test('legacy split browser source change between workshop and scene prevents the second send', async () => {
    const h = browser(async () => {
        h.context.chat[0].mes = 'An edited branch of the story.';
        return envelope(workshopReply());
    }, defaultState(), { split: true });
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1);
    assert.equal(h.state().campaignPreparation?.revision || 0, 0);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'failed');
});

test('legacy split browser repairs the scene without regenerating the wider preparation', async () => {
    let scenes = 0;
    const h = browser(async ({ spec }) => spec.schema.name === HORIZON_SCHEMA.name ? envelope(workshopReply())
        : ++scenes === 1 ? { choices: [{ message: { content: '{bad' }, finish_reason: 'stop' }] } : envelope(sceneReply()), defaultState(), { split: true });
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 3);
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.deepEqual(Array.from(h.context.chatMetadata.taleFairyCampaignAttempt.stages), ['horizon', 'scene', 'scene']);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'complete');
    assert.deepEqual(h.state().campaignPreparation.workingPlan.trajectories, workshopReply().progression.upsert);
});

function multiDesign() {
    const value = structuredClone(design);
    value.plan.goal.push(
        { subjectId: 'r1-music', scope: 'long-term', aim: 'Build a repertoire reflecting everyone\'s music.', reachedWhen: 'The ensemble shares a full set of original pieces.' },
        { subjectId: 'r1-tea', scope: 'side-thread', aim: 'Share tea and the baker\'s new cake.', reachedWhen: 'The tea break ends or is declined.' },
    );
    value.plan.developments.push({ id: 'r1-tea', kind: 'side', owner: 'Baker', control: 'npc', trajectoryIds: [],
        question: 'Which new cake is worth keeping?', initiative: 'The baker brings cake to the club.',
        resolution: 'The tea break ends.', beyond: 'Seasonal baking and friendship.',
        access: { route: 'local', basis: 'The baker visits this rehearsal.' } });
    value.selected_material[0].subjectIds.push('r1-tea');
    value.selected_material[0].available = 'At rehearsal, Jo brings two arrangements; the visiting baker sets out cake for the break.';
    return value;
}

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
        value.plan.goal[0].subjectId = value.plan.developments[0].id;
        value.selected_material[0].subjectIds = [value.plan.developments[0].id];
    }
    return { choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] };
}

function browser(send = async args => plannedResponse(args), initialState = defaultState(), { split = false, director = false } = {}) {
    const h = generationHarness([{ is_user: false, name: 'Mara', mes: 'The show ended.' }, { is_user: true, name: 'Neri', mes: 'I help pack.' }],
        initialState);
    const requests = [], shared = new Map();
    Object.assign(h.settings, { maxPromptTokens: 14000, fullReviewInterval: 3, analysisSource: 'direct', analysisModel: 'test', analysisReasoningMode: 'low' });
    // Historical contracts exercise their explicitly selected lifecycle. New
    // director tests use the same imports and one-request policy as the host.
    if (!director) {
        Object.assign(h.scope, split ? { ownedInput: preparationInput, ownedPass: preparationPass,
            OWNED_SCHEMA: PREPARATION_SCHEMA, OWNED_SYSTEM: PREPARATION_SYSTEM, PLANNER_OUTPUT_LIMIT: 3000 }
            : { ownedInput: storyInput, ownedPass: storyPassWithRecovery,
                OWNED_SCHEMA: STORY_SCHEMA, OWNED_SYSTEM: STORY_SYSTEM, PLANNER_OUTPUT_LIMIT: 3000 });
        h.scope.CampaignSession = class extends CampaignSession {
            constructor(options) { super({ ...options, evidenceRestart: true }); }
        };
    }
    Object.assign(h.scope, { buildStoryEvidence, campaignEvidenceMessages, campaignReviewWindow, completionText, readCampaignContinuity, readEvidenceProviders, evidenceRevisionKey,
        loadState: loadPlannerState, defaultState: defaultPlannerState,
        plannerStorage: () => ({ getItem: key => shared.get(key), setItem: (key, value) => shared.set(key, value), removeItem: key => shared.delete(key) }),
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

const directorReply = prompt => {
    const prefix = JSON.parse(prompt).new_id_prefix;
    const id = `${prefix}kitchen`;
    return { direction: 'Explore music, friendships and neighborhood life.', reviewAfter: 12, upsert: [{ id,
        kind: 'thread', parentId: '', status: 'proposed', links: [], title: 'An open neighborhood supper', owner: 'Community cooks',
        description: 'Shared cooking and a communal recipe book connect neighboring households.' }],
    retain: [], retire: [], select: [{ id, title: 'An open neighborhood supper', context: [],
        description: 'Neighbors exchange recipes and develop friendships over shared suppers.', development: '' }] };
};

// Keep a retained story rather than introducing it again on every review.
const retainedDirectorReply = prompt => {
    const input = JSON.parse(prompt), raw = directorReply(prompt);
    const retained = input.previous_preparation.nodes[0];
    if (retained) { raw.upsert = []; raw.select[0].id = retained.id; }
    return raw;
};
const ensembleDirectorReply = prompt => {
    const raw = retainedDirectorReply(prompt);
    const previous = JSON.parse(prompt).previous_preparation.foundation;
    raw.foundation = { reminder: previous ? '' : 'Independent communities, livelihoods and relationships sustain a broad ensemble; quiet scenes need no forced interruption.',
        changeReason: '', scratchpad: 'PRIVATE divergence: proposed harbor politics are not witnessed history.' };
    for (const card of [...raw.upsert, ...raw.select]) card.endsWhen = 'The current shared project is completed or set aside.';
    return raw;
};

test('creative director commits its plan when Continuity Memory updates during a paid response', async () => {
    let finish;
    const h = browser(({ prompt }) => h.requests.length === 1
        ? new Promise(resolve => { finish = () => resolve(envelope(directorReply(prompt))); }) : envelope(directorReply(prompt)),
        defaultState(), { director: true });
    const snapshot = memorySnapshot();
    h.settings.continuityIntegration = true;
    h.scope.continuityMemoryBridge = { version: 2, getContextSnapshot: () => snapshot };
    const work = h.scope.analyzeCampaignNow();
    await settle();
    assert.equal(h.requests.length, 1);
    assert.match(h.requests[0].prompt, /Private Chronicle/);
    snapshot.revision++;
    snapshot.prompt = 'New memory background, published during planning.';
    finish(); await work;
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'complete');
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.evidenceRestarts, undefined);
    assert.match(h.prepare().payload, /shared suppers/);
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1, 'memory publication cannot cause another request');
    appendPlay(h, 12);
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2);
    assert.match(h.requests[1].prompt, /New memory background/);
});

test('Continuity Memory publications only provide context for the next creative review', async () => {
    const h = browser(undefined, defaultPlannerState(), { director: true });
    let subscriber, triggers = 0;
    const snapshot = memorySnapshot();
    Object.assign(h.scope, { continuityUnsubscribe: null, continuityReplacementRevision: 0,
        analyzeCampaignNow: () => { triggers++; },
        continuityMemoryBridge: { version: 2, getContextSnapshot: () => snapshot,
            subscribe: callback => { subscriber = callback; return () => {}; } } });
    h.settings.continuityIntegration = true;
    vm.runInContext(source.match(/function bindContinuityBridge\([^]*?^}/m)[0], h.scope);
    h.scope.bindContinuityBridge();
    subscriber(snapshot);
    snapshot.revision++; snapshot.prompt = 'Latest story background.';
    subscriber(snapshot);
    assert.equal(triggers, 0);
    assert.match(h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot()).prompt, /Latest story background/);
});

test('player-centered cards survive planning, dependent selections, reload and writer injection', async () => {
    const h = browser(async ({ prompt }) => {
        const raw = ensembleDirectorReply(prompt), prefix = JSON.parse(prompt).new_id_prefix;
        const template = raw.upsert[0];
        raw.upsert = [
            { ...template, id: `${prefix}life`, kind: 'saga', owner: 'Neri', title: 'Neri and the neighborhood' },
            { ...template, id: `${prefix}music`, kind: 'arc', parentId: `${prefix}life`, owner: 'Neri', title: 'Music and friendship' },
            { ...template, id: `${prefix}supper`, parentId: `${prefix}music`, owner: 'Mara', title: 'Shared supper',
                links: [`${prefix}life`], effects: [{ label: 'Shared invitations', pressure: 'Neighbors offer company and music without deciding Neri’s response.' }] },
        ];
        raw.select = raw.upsert.map((node, index) => ({ ...raw.select[0], id: node.id, title: node.title,
            context: raw.upsert.slice(0, index).map(parent => ({ kind: parent.kind, title: parent.title })) }));
        return envelope(raw);
    }, defaultState(), { director: true });
    h.settings.fullReviewInterval = 12;
    await h.scope.analyzeCampaignNow({ manual: true });
    const structure = h.state().campaignPreparation.workingPlan.storyStructure;
    assert.equal(structure.nodes.length, 3);
    assert.equal(structure.selection.length, 3);
    assert.equal(h.requests.length, 1);
    assert.doesNotMatch(h.statuses.join('\n'), /withheld|unavailable|Player cannot own/);
    const packet = h.prepare().payload;
    assert.match(packet, /Shared invitations/);
    assert.doesNotMatch(packet, /"owner":/);
    h.context.chatMetadata = JSON.parse(JSON.stringify(h.context.chatMetadata));
    h.scope.campaignSession = null;
    assert.equal(h.prepare().payload, packet);
    const request = [{ role: 'user', content: 'I listen to the neighbors.' }];
    ensureGuidanceInChat(request, packet, { role: 'user', depth: 0, inlineLatestUser: true });
    assert.equal(chatHasCurrentGuidance(request, packet), true);
});

const appendPlay = (h, count = 1) => {
    for (let i = 0; i < count; i++) h.context.chat.push({ is_user: false, name: 'Mara', mes: `Quiet conversation ${h.context.chat.length}.` });
};

test('host sends the stable orientation even without cards, never private notes, and preserves it on reload', async () => {
    const h = browser(async ({ prompt }) => envelope({ ...ensembleDirectorReply(prompt), select: [] }), defaultState(), { director: true });
    h.settings.fullReviewInterval = 12;
    await h.scope.analyzeCampaignNow();
    const before = h.prepare().payload;
    assert.match(before, /rp_orientation.*Independent communities/);
    assert.doesNotMatch(before, /PRIVATE|scratchpad|changeReason|story_context/);
    assert.equal(h.requests.length, 1);
    h.context.chatMetadata = JSON.parse(JSON.stringify(h.context.chatMetadata));
    h.scope.campaignSession = null;
    assert.equal(h.prepare().payload, before);
    appendPlay(h, 11);
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2);
    assert.match(JSON.parse(h.requests[1].prompt).previous_preparation.foundation.scratchpad, /PRIVATE divergence/);
    assert.equal(h.prepare().payload, before, 'a quiet refresh retains the reminder verbatim');
});

test('host expires orientation after a failed review; a cached packet or reload cannot keep it alive', async () => {
    let fail = false;
    const h = browser(async ({ prompt }) => { if (fail) throw Error('offline'); return envelope(ensembleDirectorReply(prompt)); }, defaultState(), { director: true });
    h.settings.fullReviewInterval = 12;
    await h.scope.analyzeCampaignNow();
    assert.match(h.prepare().payload, /rp_orientation/);
    fail = true; appendPlay(h, 11);
    await h.scope.analyzeCampaignNow();
    assert.match(h.prepare().payload, /rp_orientation/);
    appendPlay(h);
    assert.equal(h.prepare().payload, '');
    h.context.chatMetadata = JSON.parse(JSON.stringify(h.context.chatMetadata)); h.scope.campaignSession = null;
    assert.equal(h.prepare().payload, '');
    assert.match(h.state().campaignPreparation.workingPlan.storyStructure.foundation.scratchpad, /PRIVATE divergence/);
});

test('host blocks old orientation immediately on OOC changes and full rebuild clears its private basis', async () => {
    let fail = false;
    const h = browser(async ({ prompt }) => { if (fail) throw Error('offline'); return envelope(ensembleDirectorReply(prompt)); }, defaultState(), { director: true });
    await h.scope.analyzeCampaignNow();
    assert.match(h.prepare().payload, /rp_orientation/);
    h.context.chat.push({ is_user: true, name: 'Neri', mes: 'OOC: Shift to an intimate two-person RP.' });
    assert.equal(h.prepare().payload, '');
    fail = true;
    await h.scope.rebuildGuideState();
    assert.equal(h.prepare().payload, '');
    assert.doesNotMatch(JSON.stringify(h.state().campaignPreparation), /PRIVATE divergence|Independent communities/);
});

test('notebook separates stable public interpretation, private scratchpad and card endings', () => {
    const scope = vm.createContext({});
    vm.runInContext(source.match(/function workingPlanSummary\([^]*?^}/m)[0], scope);
    const raw = ensembleDirectorReply(JSON.stringify({ new_id_prefix: 'r1-', previous_preparation: { nodes: [] } }));
    const summary = scope.workingPlanSummary({ workingPlan: { direction: raw.direction,
        storyStructure: { foundation: raw.foundation, reviewAfter: 12, nodes: raw.upsert.map(node => ({ ...node, interpretation: node.description })), selection: raw.select } } });
    assert.match(summary, /RP ORIENTATION \(public/);
    assert.match(summary, /DIVERGENCE \/ PROGRESSION NOTES \(private/);
    assert.match(summary, /Can end when: The current shared project/);
});

test('story map reviews on a wider horizon and retains private stories across quiet play and reload', async () => {
    const h = browser(async ({ prompt }) => envelope(retainedDirectorReply(prompt)), defaultState(), { director: true });
    h.settings.fullReviewInterval = 12;
    await h.scope.analyzeCampaignNow();
    const nodes = structuredClone(h.state().campaignPreparation.workingPlan.storyStructure.nodes);
    for (let i = 0; i < 10; i++) {
        appendPlay(h); await h.scope.analyzeCampaignNow();
        assert.equal(h.requests.length, 1);
        assert.match(h.prepare().payload, /neighborhood supper/);
    }
    h.context.chatMetadata = JSON.parse(JSON.stringify(h.context.chatMetadata)); h.scope.campaignSession = null;
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1, 'reload spends no request');
    appendPlay(h); await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2, 'refresh begins one reply before public guidance expires');
    assert.equal(h.state().campaignPreparation.revision, 2);
    assert.deepEqual(h.state().campaignPreparation.workingPlan.storyStructure.nodes, nodes);
    assert.equal(JSON.parse(h.requests[1].prompt).previous_preparation.nodes[0].id, nodes[0].id);
});

test('host persists card effects without per-turn calls and stops them when the review closes the card', async () => {
    const effect = { label: 'Shared kitchen', pressure: 'Neighbors have practical reasons to trade recipes and help with preparations.' };
    const h = browser(async ({ prompt }) => {
        const raw = ensembleDirectorReply(prompt);
        for (const node of raw.upsert) node.effects = [effect];
        if (h.requests.length === 3) {
            raw.upsert = [{ ...JSON.parse(prompt).previous_preparation.nodes[0], status: 'resolved' }];
            raw.select = [];
        }
        return envelope(raw);
    }, defaultState(), { director: true });
    h.settings.fullReviewInterval = 12;
    await h.scope.analyzeCampaignNow();
    const packet = h.prepare().payload;
    assert.match(packet, /Shared kitchen/);
    assert.match(packet, /author-level pressures/);
    for (let i = 0; i < 10; i++) {
        appendPlay(h); await h.scope.analyzeCampaignNow();
        assert.equal(h.prepare().payload, packet);
        assert.equal(h.requests.length, 1, 'ordinary turns reuse the prepared effects');
    }
    h.context.chatMetadata = JSON.parse(JSON.stringify(h.context.chatMetadata)); h.scope.campaignSession = null;
    assert.equal(h.prepare().payload, packet);
    appendPlay(h); await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2, 'one periodic refresh');
    assert.equal(h.prepare().payload, packet, 'an omitted update retains the effects verbatim');
    assert.deepEqual(JSON.parse(h.requests[1].prompt).previous_preparation.nodes[0].effects, [effect]);
    appendPlay(h, 10);
    h.context.chat.push({ is_user: false, name: 'Mara', mes: 'The supper project is finished; the neighbors clear away the final preparations.' });
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 3);
    assert.deepEqual(h.state().campaignPreparation.workingPlan.storyStructure.nodes, []);
    assert.equal(h.state().campaignPreparation.archive.at(-1).workingPlan.storyStructure.nodes[0].status, 'proposed');
    assert.doesNotMatch(h.prepare().payload, /Shared kitchen|"effects"/);
    assert.match(h.prepare().payload, /rp_orientation/);
});

test('accepted writer signal schedules one early review without deciding closure itself', async () => {
    const h = browser(async ({ prompt }) => {
        const raw = ensembleDirectorReply(prompt);
        for (const node of raw.upsert) node.effects = [{ label: 'Shared kitchen', pressure: 'Neighbors exchange practical help.' }];
        return envelope(raw);
    }, defaultState(), { director: true });
    h.settings.fullReviewInterval = 20;
    await h.scope.analyzeCampaignNow();
    assert.match(h.prepare().payload, /review_signal/);
    h.context.chat.push({ is_user: false, name: 'Mara', mes: 'The group settles its immediate arrangements.\n<!--tf-review-->' });
    assert.equal(h.prepare().payload, '', 'old guidance is withheld pending the signaled review');
    assert.equal(h.state().campaignPreparation.workingPlan.storyStructure.nodes[0].status, 'proposed', 'signal alone cannot resolve anything');
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2);
    assert.match(h.prepare().payload, /Shared kitchen/, 'the reviewer can retain an open concern');
    h.context.chatMetadata = JSON.parse(JSON.stringify(h.context.chatMetadata)); h.scope.campaignSession = null;
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2, 'reload does not replay an already reviewed signal');
    appendPlay(h); await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2, 'no per-turn evaluator or signal polling call');
});

test('AI review horizon can shorten the configured maximum without next-turn polling', async () => {
    const h = browser(async ({ prompt }) => envelope({ ...retainedDirectorReply(prompt), reviewAfter: 4 }), defaultState(), { director: true });
    h.settings.fullReviewInterval = 20;
    await h.scope.analyzeCampaignNow();
    appendPlay(h, 2); await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1);
    appendPlay(h); await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2);
    assert.equal(h.state().campaignPreparation.workingPlan.storyStructure.reviewAfter, 4);
});

for (const change of [
    { is_user: true, name: 'Neri', mes: 'OOC: The supper idea is declined. Follow the harbor story.' },
    { is_user: false, name: 'Mara', mes: '***\nAt the harbor, the morning shift begins.' },
]) test(`story map withholds cached guidance immediately after ${change.is_user ? 'explicit direction' : 'a scene boundary'}`, async () => {
    const h = browser(async ({ prompt }) => h.requests.length === 1 ? envelope(directorReply(prompt))
        : envelope({ ...retainedDirectorReply(prompt), upsert: [], retire: [JSON.parse(prompt).previous_preparation.nodes[0].id], select: [] }), defaultState(), { director: true });
    h.settings.fullReviewInterval = 12;
    await h.scope.analyzeCampaignNow();
    assert.match(h.prepare().payload, /neighborhood supper/);
    h.context.chat.push(change);
    assert.equal(h.prepare().payload, '', 'new direction takes priority before a paid review finishes');
    h.context.chatMetadata = JSON.parse(JSON.stringify(h.context.chatMetadata)); h.scope.campaignSession = null;
    assert.equal(h.prepare().payload, '', 'reload cannot restore the old packet');
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2, 'explicit changes bypass the long cadence');
    assert.deepEqual(h.state().campaignPreparation.workingPlan.storyStructure.nodes, []);
    assert.equal(h.prepare().payload, '');
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2, 'the accepted change is reviewed once');
});

test('failed story-map reviews keep private state but expired public guidance stays absent after reload and retry', async () => {
    let fail = false;
    const h = browser(async ({ prompt }) => { if (fail) throw Error('provider unavailable'); return envelope(retainedDirectorReply(prompt)); }, defaultState(), { director: true });
    h.settings.fullReviewInterval = 12;
    await h.scope.analyzeCampaignNow();
    const before = structuredClone(h.state().campaignPreparation);
    h.prepare(); fail = true; appendPlay(h, 11);
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2);
    assert.match(h.prepare().payload, /neighborhood supper/, 'the remaining safety horizon is still available');
    h.scope.campaignSession = null;
    h.context.chatMetadata = JSON.parse(JSON.stringify(h.context.chatMetadata));
    await h.scope.analyzeCampaignNow();
    h.context.chat.push({ is_user: true, name: 'Neri', mes: 'We keep talking.' });
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2, 'neither reload nor user-only input retries a failed request');
    appendPlay(h);
    assert.equal(h.prepare().payload, '', 'public guidance expires even when the provider is unavailable');
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 3, 'new accepted assistant play permits one recovery attempt');
    assert.deepEqual(h.state().campaignPreparation, before);
    h.scope.campaignSession = null;
    assert.equal(h.prepare().payload, '');
    assert.equal(h.prepare('regenerate').payload.includes('neighborhood supper'), true, 'retry uses its actual pre-reply source, still inside the horizon');
    appendPlay(h);
    assert.equal(h.prepare('regenerate').payload, '', 'a retry beyond that horizon cannot resurrect the cached packet');
    fail = false; await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 4);
    assert.equal(h.state().campaignPreparation.revision, 2);
    assert.match(h.prepare().payload, /neighborhood supper/);
});

test('reference changes offer only private story-map reconsideration and reserve new ids', async () => {
    const h = browser(async ({ prompt }) => envelope(directorReply(prompt)), defaultState(), { director: true });
    await h.scope.analyzeCampaignNow();
    const old = structuredClone(h.state().campaignPreparation);
    h.context.card = { scenario: 'The harbor community, not the earlier concert premise.' };
    assert.equal(h.prepare().payload, '');
    await h.scope.analyzeCampaignNow();
    const input = JSON.parse(h.requests[1].prompt);
    assert.deepEqual(input.previous_preparation.nodes, []);
    assert.equal(input.reconsider_horizon.nodes[0].id, old.workingPlan.storyStructure.nodes[0].id);
    assert.equal(input.reconsider_horizon.nodes[0].description, old.workingPlan.storyStructure.nodes[0].interpretation);
    assert.equal(input.reconsider_horizon.nodes[0].stakes, undefined);
    assert.equal(input.reconsider_horizon.selection, undefined);
    assert.equal(input.coverage.reviewed_before, 0);
    assert.equal(input.new_id_prefix, 'r2-');
    assert.equal(h.state().campaignPreparation.workingPlan.storyStructure.nodes[0].id, 'r2-kitchen');
    assert.equal(validCampaignState(h.state().campaignPreparation), true);
});

test('regeneration replans from accepted chat while archived story maps stay passive', async () => {
    const h = browser(async ({ prompt }) => {
        const raw = retainedDirectorReply(prompt);
        if (prompt.includes('DISCARDED_ONLY_SECRET')) raw.direction = 'DISCARDED_ONLY_SECRET';
        return envelope(raw);
    }, defaultState(), { director: true });
    await h.scope.analyzeCampaignNow();
    const before = structuredClone(h.state().campaignPreparation.workingPlan);
    h.context.chat.push({ is_user: false, name: 'Mara', mes: 'DISCARDED_ONLY_SECRET' });
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.state().campaignPreparation.revision, 2);
    h.scope.deferReplacementPlanning(h.context);
    assert.equal(h.prepare('regenerate').payload, '', 'a source-invalid live map cannot restore archived guidance');
    await h.scope.repairDeferredReplacementPlan();
    assert.equal(h.requests.length, 3, 'replacement reviews accepted chat instead of restoring an archive');
    const input = JSON.parse(h.requests[2].prompt);
    assert.deepEqual(input.previous_preparation.nodes, []);
    assert.equal(input.reconsider_horizon, undefined);
    assert.doesNotMatch(h.requests[2].prompt, /DISCARDED_ONLY_SECRET/);
    assert.deepEqual(h.state().campaignPreparation.archive[0].workingPlan, before);
    assert.doesNotMatch(h.prepare('regenerate').payload, /DISCARDED_ONLY_SECRET/);
});

test('legacy proposals migrate whole and their old planning state remains archived', async () => {
    const legacy = browser(async ({ spec }) => {
        if (spec.schema.name === HORIZON_SCHEMA.name) {
            const raw = workshopReply(), node = raw.progression.upsert[0];
            node.focus = 'x'.repeat(240); node.experience = 'y'.repeat(1000);
            node.next.change = 'a'.repeat(600); node.later.change = 'b'.repeat(600);
            return envelope(raw);
        }
        return envelope(sceneReply());
    }, defaultState(), { split: true });
    await legacy.scope.analyzeCampaignNow();
    const old = structuredClone(legacy.state().campaignPreparation);
    assert.equal(old.revision, 1);
    const h = browser(async ({ prompt }) => envelope(retainedDirectorReply(prompt)), legacy.state(), { director: true });
    h.context.chatMetadata = structuredClone(legacy.context.chatMetadata);
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1);
    const saved = h.state().campaignPreparation;
    assert.equal(saved.revision, 2, h.statuses.join('\n'));
    assert.equal(validCampaignState(saved), true);
    assert.equal(saved.workingPlan.storyStructure.nodes[0].title, 'x'.repeat(240));
    assert.equal(saved.workingPlan.storyStructure.nodes[0].interpretation, 'y'.repeat(1000));
    assert.equal(saved.workingPlan.storyStructure.nodes[0].expectation, `${'a'.repeat(600)} ${'b'.repeat(600)}`);
    assert.deepEqual(saved.archive.at(-1).workingPlan, old.workingPlan);
    assert.match(h.prepare().payload, /neighborhood supper/);
    assert.doesNotMatch(h.prepare().payload, /xxx|yyy|aaa|bbb|trajectory|initiative|If /);
});

test('story-map inspector shows private organization and separates the actual writer preview', async () => {
    const h = browser(async ({ prompt }) => envelope(directorReply(prompt)), defaultState(), { director: true });
    await h.scope.analyzeCampaignNow();
    const scope = vm.createContext({});
    vm.runInContext(source.match(/function workingPlanSummary\([^]*?^}/m)[0], scope);
    const summary = scope.workingPlanSummary(h.state().campaignPreparation);
    assert.match(summary, /PRIVATE STORY MAP/);
    assert.match(summary, /Shared cooking and a communal recipe book connect neighboring households\./);
    assert.doesNotMatch(summary, /Interpretation:|Stakes:|Expectation:|Owner:/);
    assert.match(summary, /PUBLIC CONTEXT.*actual writer packet/);
    assert.match(summary, /REVIEW HORIZON.*12 accepted AI replies/);
    assert.match(summary, /Expired guidance is withheld/);
    assert.doesNotMatch(summary, /stage [12]|STORY GOALS|PRIVATE PROGRESSION|Reached when/);
});

test('active story director uses one compact request, retains the selected model controls and commits writer material', async () => {
    const h = browser(async ({ prompt }) => envelope(directorReply(prompt)), defaultState(), { director: true });
    await h.scope.analyzeNow({ force: true });
    assert.equal(h.requests.length, 1);
    const request = h.requests[0], prompt = JSON.parse(request.prompt);
    assert.equal(request.spec.singleShot, true);
    assert.equal(request.spec.schema.name, DIRECTOR_SCHEMA.name);
    assert.equal(request.spec.responseTokens, 3000);
    assert.equal(request.spec.reasoningMode, undefined);
    assert.equal(h.settings.analysisModel, 'test');
    assert.equal(h.settings.analysisReasoningMode, 'low');
    assert.equal(prompt.previous_plan, undefined);
    assert.deepEqual(Array.from(prompt.previous_preparation.nodes), []);
    assert.equal(prompt.rpUnderstanding, undefined);
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.equal(validCampaignState(h.state().campaignPreparation), true);
    assert.match(h.prepare().payload, /neighborhood supper/);
    assert.doesNotMatch(h.prepare().payload, /Creative proposal|r1-kitchen|rpUnderstanding/);
    assert.deepEqual(Array.from(h.context.chatMetadata.taleFairyCampaignAttempt.stages), ['director']);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'complete');
});

test('active director withholds an unavailable selection and still saves useful preparation after one request', async () => {
    const h = browser(async ({ prompt }) => {
        const raw = directorReply(prompt); raw.select.unshift({ ...raw.select[0], id: 'retired-possibility' });
        return envelope(raw);
    }, defaultState(), { director: true });
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'complete');
    assert.match(h.prepare().payload, /neighborhood supper/);
    assert.doesNotMatch(h.prepare().payload, /retired-possibility/);
    assert.match(h.statuses.join('\n'), /Selection withheld/);
    assert.match(h.statuses.join('\n'), /Preparation saved with withheld material/);
    assert.doesNotMatch(h.statuses.join('\n'), /Campaign preparation ready/);
});

test('active director accepts the omitted empty fields reported by ordinary planner providers', async () => {
    const h = browser(async ({ prompt }) => {
        const raw = directorReply(prompt);
        delete raw.upsert[0].parentId; delete raw.upsert[0].links; delete raw.select[0].development;
        return envelope(raw);
    }, defaultState(), { director: true });
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1);
    assert.equal(h.state().campaignPreparation.workingPlan.storyStructure.nodes.length, 1);
    assert.match(h.prepare().payload, /neighborhood supper/);
    assert.match(h.statuses.join('\n'), /Campaign preparation ready/);
    assert.doesNotMatch(h.statuses.join('\n'), /Story withheld|Selection withheld/);
});

test('active director reads existing memory once as private context without summarizing or writing it', async () => {
    const memory = memorySnapshot(), before = structuredClone(memory);
    const h = browser(async ({ prompt }) => envelope(directorReply(prompt)), defaultState(), { director: true });
    h.scope.continuityMemoryBridge = { version: 2, getContextSnapshot: () => memory };
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1);
    assert.match(h.requests[0].prompt, /Private Chronicle/);
    assert.doesNotMatch(h.prepare().payload, /Private Chronicle|memory-music|external_evidence/);
    assert.deepEqual(memory, before);
    assert.deepEqual(h.state().campaignPreparation.planEvidence, {});
});

test('active director keeps the previous writer packet during refresh and ignores a late response after Stop', async () => {
    let release;
    const h = browser(async ({ prompt }) => h.requests.length === 1 ? envelope(directorReply(prompt))
        : new Promise(resolve => { release = () => resolve(envelope(directorReply(prompt))); }), defaultState(), { director: true });
    await h.scope.analyzeCampaignNow();
    const previous = h.prepare().payload, revision = h.state().campaignPreparation.revision;
    const pending = h.scope.analyzeCampaignNow({ manual: true });
    await settle(); await settle();
    assert.equal(h.requests.length, 2);
    assert.equal(h.prepare().payload, previous);
    h.scope.campaignSession.stop();
    await pending;
    release(); await settle();
    assert.equal(h.state().campaignPreparation.revision, revision);
    assert.equal(h.prepare().payload, previous);
    assert.equal(h.requests.length, 2);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'stopped');
});

test('active director never sends a correction for malformed output or restarts a paid request for a memory publication', async () => {
    const bad = browser(async () => envelope('{broken'), defaultState(), { director: true });
    await bad.scope.analyzeCampaignNow();
    assert.equal(bad.requests.length, 1);
    assert.equal(bad.context.chatMetadata.taleFairyCampaignAttempt.status, 'failed');
    const memory = memorySnapshot();
    const h = browser(async ({ prompt }) => {
        memory.revision++; memory.prompt += ' A corrected detail.';
        return envelope(directorReply(prompt));
    }, defaultState(), { director: true });
    h.scope.continuityMemoryBridge = { version: 2, getContextSnapshot: () => memory };
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'complete');
    assert.equal(h.state().campaignPreparation?.revision || 0, 1);
});

function splitResponse({ prompt, spec }) {
    const input = JSON.parse(prompt);
    if (spec.schema.name === HORIZON_SCHEMA.name) {
        const value = workshopReply();
        if (input.previous_horizon.trajectories.length) value.progression.upsert = [];
        else value.progression.upsert[0].id = `${input.new_id_prefix}kitchen`;
        return envelope(value);
    }
    const value = sceneReply();
    const id = input.previous_plan.developments[0]?.id || `${input.new_id_prefix}music`;
    value.plan.developments[0].id = id;
    value.plan.goal[0].subjectId = id;
    if (prompt.includes('DISCARDED_ONLY_SECRET')) value.plan.direction = 'DISCARDED_ONLY_SECRET';
    return envelope(value);
}

test('active host reconsiders reference-invalidated futures without restoring facts or coverage', async () => {
    const h = browser(splitResponse, defaultState(), { split: true });
    await h.scope.analyzeCampaignNow();
    const old = h.state().campaignPreparation;
    assert.equal(old.revision, 1);
    h.context.card = { scenario: 'Newly clarified music-club premise.' };
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 4);
    const workshop = JSON.parse(h.requests[2].prompt), selection = JSON.parse(h.requests[3].prompt);
    assert.deepEqual(workshop.reconsider_horizon.trajectories, old.workingPlan.trajectories);
    assert.deepEqual(Object.keys(workshop.reconsider_horizon).sort(), ['rpUnderstanding', 'storyLife', 'throughline', 'trajectories']);
    assert.deepEqual(workshop.previous_horizon.trajectories, []);
    assert.equal(workshop.coverage.reviewed_before, 0);
    assert.deepEqual(selection.previous_plan.developments, []);
    assert.deepEqual(selection.previous_plan.consequences || [], []);
    assert.deepEqual(selection.previous_outlook, []);
    assert.equal(selection.reconsider_horizon, undefined);
    assert.equal(h.state().campaignPreparation.revision, 2);
    assert.equal(h.state().campaignPreparation.workingPlan.trajectories[0].id, 'r2-kitchen');
    assert.notEqual(h.state().campaignPreparation.source.referenceHash, old.source.referenceHash);
    assert.equal(validCampaignState(h.state().campaignPreparation), true);
});

function outlookResponse(args) {
        const response = splitResponse(args);
        if (args.spec.schema.name === HORIZON_SCHEMA.name) return response;
        const input = JSON.parse(args.prompt), value = JSON.parse(response.choices[0].message.content);
        const id = input.prepared_horizon.trajectories[0].id;
        value.plan.openings = [{ trajectoryId: id, futureEntry: { prerequisite: 'If the ensemble later visits the neighborhood kitchen,', possibility: 'the cooks have handwritten supper cards to compare.' }, circumstance: 'If the ensemble visits the neighborhood kitchen, the cooks have handwritten supper cards to compare.',
            access: { route: 'local', basis: 'PRIVATE route reasoning: a later visit to the nearby kitchen.' } }];
        value.plan.goal.push({ subjectId: id, scope: 'long-term', aim: 'Share the neighborhood recipes.', reachedWhen: 'The neighbors exchange their illustrated supper book.' });
        value.outlook = input.previous_outlook.length ? { action: 'keep', reason: 'Quiet packing does not change the supper-book possibility.', material: [] }
            : { action: 'replace', reason: 'Select a reachable multi-scene experience.', material: [{ trajectoryId: id,
                developing: 'If they cook together, neighbors can compare the supper menu and trade handwritten recipes.',
                lasting: 'If neighbors contribute recipes and drawings over later visits, a shared illustrated supper book connects the households.' }] };
        return envelope(value);
}

test('active host keeps a selected outlook through quiet updates, reload and pre-reply recovery', async () => {
    const h = browser(outlookResponse, defaultState(), { split: true });
    await h.scope.analyzeCampaignNow();
    assert.equal(h.state().campaignPreparation.revision, 1);
    const outlook = structuredClone(h.state().campaignPreparation.workingPlan.outlook);
    assert.match(h.prepare().payload, /illustrated supper book/);
    assert.doesNotMatch(h.prepare().payload, /PRIVATE route|Quiet packing|outlook|trajectoryId/);
    h.context.chat.push({ is_user: true, name: 'Neri', mes: 'I take my time packing.' });
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.deepEqual(h.state().campaignPreparation.workingPlan.outlook, outlook);
    h.context.chatMetadata = JSON.parse(JSON.stringify(h.context.chatMetadata));
    h.scope.campaignSession = null;
    const beforeReply = h.prepare().payload;
    h.context.chat.push({ is_user: false, name: 'Mara', mes: 'A quiet moment together.' });
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.deepEqual(h.state().campaignPreparation.workingPlan.outlook, outlook);
    h.scope.deferReplacementPlanning(h.context);
    assert.equal(h.prepare('regenerate').payload, beforeReply);
    await h.scope.repairDeferredReplacementPlan();
    assert.equal(h.requests.length, 6, 'matching future-bearing checkpoint needs no replacement repair');
});

for (const withInitiative of [false, true]) test(`conditional futures ${withInitiative ? 'with' : 'without'} initiative persist across twelve replies, failed refreshes, reload, preview and regenerate`, async () => {
    let fail = false;
    const h = browser(args => {
        if (fail) throw Error('provider unavailable');
        const reply = outlookResponse(args);
        if (withInitiative && args.spec.schema.name === SCENE_SCHEMA.name) {
            const value = JSON.parse(reply.choices[0].message.content);
            value.initiative_review = { action: 'replace', reason: 'PRIVATE choose a modest recurring experience.', evidence: [],
                material: [{ id: 'r1-supper', trajectoryId: 'r1-kitchen', owner: 'Community cooks',
                    prerequisite: 'On a later visit to the kitchen, before this meal has begun,',
                    action: 'The cooks begin a shared supper and pass around their handwritten recipe cards.' }] };
            return envelope(value);
        }
        return reply;
    }, defaultState(), { split: true });
    await h.scope.analyzeCampaignNow();
    const saved = structuredClone(h.state().campaignPreparation);
    const original = h.prepare().payload;
    assert.match(original, /available_circumstances/);
    if (withInitiative) {
        assert.match(original, /next_world_initiative/);
        assert.match(original, /cooks begin a shared supper/);
        assert.doesNotMatch(original, /r1-supper|PRIVATE choose|initiative_review|initiativeReceipt/);
    }
    fail = true;
    for (let i = 0; i < 12; i++) {
        h.context.chat.push({ is_user: true, name: 'Neri', mes: 'I keep talking here.' },
            { is_user: false, name: 'Mara', mes: `Accepted later play ${i}.` });
        await h.scope.analyzeCampaignNow();
        assert.equal(h.prepare().payload, original);
    }
    const packet = h.prepare();
    assert.equal(packet.preparedUsable, true);
    assert.equal(packet.horizonsOnly, false);
    assert.match(packet.payload, /available_circumstances.*If the ensemble later visits the neighborhood kitchen/);
    assert.match(packet.payload, /mid_term_possibilities.*handwritten recipes/);
    assert.match(packet.payload, /long_term_possibilities.*illustrated supper book/);
    assert.doesNotMatch(packet.payload, /contrasting arrangements|PRIVATE|goal|trajectoryId/);
    h.scope.generationGuideSelection = null;
    assert.equal(h.scope.buildPromptPayload(h.state(), h.scope.guideSelectionOptions(h.state())), packet.payload,
        'preview uses the same scoped material without a frozen generation');
    assert.deepEqual(h.state().campaignPreparation, saved, 'projection never rewrites saved preparation');
    h.context.chatMetadata = JSON.parse(JSON.stringify(h.context.chatMetadata));
    h.scope.campaignSession = null;
    assert.equal(h.prepare().payload, packet.payload);
    h.context.chat.push({ is_user: false, name: 'Mara', mes: 'Another accepted response.' });
    h.scope.deferReplacementPlanning(h.context);
    const calls = h.requests.length;
    assert.equal(h.prepare('regenerate').payload, packet.payload);
    assert.equal(h.requests.length, calls, 'preview, reload and cache replay spend no provider calls');
});

for (const change of ['edit', 'reference', 'clear', 'legacy']) test(`retained future packet rejects ${change}`, async () => {
    const h = browser(outlookResponse, defaultState(), { split: true });
    await h.scope.analyzeCampaignNow();
    for (let i = 0; i < 3; i++) h.context.chat.push({ is_user: false, name: 'Mara', mes: `Later play ${i}` });
    if (change === 'edit') h.context.chat[0].mes = 'An edited branch.';
    if (change === 'reference') h.context.card = { scenario: 'A different premise.' };
    if (['clear', 'legacy'].includes(change)) {
        const state = h.state();
        if (change === 'clear') {
            state.campaignPreparation.workingPlan.outlook = [];
            state.campaignPreparation.selectedMaterial = [];
        } else {
            delete state.campaignPreparation.workingPlan.outlook;
            delete state.campaignPreparation.workingPlan.futureEntryVersion;
            for (const opening of state.campaignPreparation.workingPlan.openings) delete opening.futureEntry;
        }
        assert.equal(validCampaignState(state.campaignPreparation), true);
        h.context.chatMetadata = saveState(h.context.chatMetadata, state);
    }
    assert.equal(h.prepare().payload, '');
});

test('legacy scene packets still expire when their lifetime shortens, without reviving on reload', async () => {
    const h = browser(outlookResponse, defaultState(), { split: true });
    h.settings.fullReviewInterval = 4;
    await h.scope.analyzeCampaignNow();
    const state = h.state();
    delete state.campaignPreparation.workingPlan.futureEntryVersion;
    for (const opening of state.campaignPreparation.workingPlan.openings) delete opening.futureEntry;
    assert.equal(validCampaignState(state.campaignPreparation), true);
    h.context.chatMetadata = saveState(h.context.chatMetadata, state);
    for (let i = 0; i < 3; i++) h.context.chat.push({ is_user: false, name: 'Mara', mes: `Later play ${i}` });
    assert.match(h.prepare().payload, /available_circumstances/);
    h.settings.fullReviewInterval = 3;
    const packet = h.prepare();
    assert.equal(packet.horizonsOnly, true);
    assert.doesNotMatch(packet.payload, /available_circumstances/);
    assert.match(packet.payload, /illustrated supper book/);
    h.context.chatMetadata = JSON.parse(JSON.stringify(h.context.chatMetadata));
    assert.equal(h.prepare().payload, packet.payload);
    const cache = h.context.chatMetadata[GENERATION_CONTEXT_KEY];
    const scoped = structuredClone(cache.entries.at(-1));
    scoped.selection.horizonsOnly = true;
    scoped.payload = packet.payload;
    assert.equal(generationContextEntries({ entries: [scoped] }).length, 1);
    scoped.payload = campaignPayload(scoped.plannerState.campaignPreparation);
    assert.equal(generationContextEntries({ entries: [scoped] }).length, 0, 'a horizon-only flag cannot authenticate a full packet');
});

test('a saved horizon-only packet authenticates and restores its conditional entry under current policy', async () => {
    const h = browser(outlookResponse, defaultState(), { split: true });
    await h.scope.analyzeCampaignNow();
    for (let i = 0; i < 8; i++) h.context.chat.push({ is_user: false, name: 'Mara', mes: `Later accepted play ${i}.` });
    const original = h.prepare().payload;
    const packet = structuredClone(h.context.chatMetadata[GENERATION_CONTEXT_KEY].entries.at(-1));
    packet.selection.horizonsOnly = true;
    packet.payload = campaignPayload(packet.plannerState.campaignPreparation, [], { horizonsOnly: true });
    assert.equal(generationContextEntries({ entries: [packet] }).length, 1);
    h.context.chatMetadata[GENERATION_CONTEXT_KEY] = JSON.parse(JSON.stringify({ entries: [packet] }));
    const calls = h.requests.length;
    assert.equal(h.prepare().payload, original);
    assert.equal(h.prepare().horizonsOnly, false);
    assert.equal(h.requests.length, calls);
});

test('a pending refresh leaves the full conditional packet immediately usable and Stop preserves it', async () => {
    let pending = false, release;
    const h = browser(async args => {
        if (pending && args.spec.schema.name === HORIZON_SCHEMA.name) await new Promise(resolve => { release = resolve; });
        return outlookResponse(args);
    }, defaultState(), { split: true });
    await h.scope.analyzeCampaignNow();
    const saved = structuredClone(h.state().campaignPreparation), original = h.prepare().payload;
    for (let i = 0; i < 6; i++) h.context.chat.push({ is_user: false, name: 'Mara', mes: 'Accepted local play continues.' });
    pending = true;
    const work = h.scope.analyzeCampaignNow();
    await settle();
    assert.equal(typeof release, 'function');
    assert.equal(h.prepare().payload, original);
    h.scope.interruptAnalysis('Stop the pending review.', 'Stopped');
    await work;
    release();
    await settle();
    assert.deepEqual(h.state().campaignPreparation, saved);
    assert.equal(h.prepare().payload, original);
    assert.equal(h.requests.length, 3);
});

for (const change of ['progress', 'refusal', 'lost-access', 'closure']) test(`successful review updates retained selection for ${change}`, async () => {
    let changed = false;
    const h = browser(args => {
        const response = outlookResponse(args);
        if (!changed || args.spec.schema.name === HORIZON_SCHEMA.name) return response;
        const value = JSON.parse(response.choices[0].message.content);
        if (change === 'progress') {
            value.plan.openings[0].futureEntry = { prerequisite: 'After the first shared cooking visit,',
                possibility: 'the neighbors can compare the recipe pages they have contributed.' };
            value.outlook = { action: 'replace', reason: 'The first shared visit is finished.', material: [{
                trajectoryId: value.plan.openings[0].trajectoryId,
                developing: 'The contributed recipes can be tested and annotated together.',
                lasting: 'Later visits can complete an illustrated book with the tested recipes.',
            }] };
        } else {
            value.plan.openings = [];
            value.plan.goal = value.plan.goal.filter(row => row.subjectId !== 'r1-kitchen');
            value.outlook = { action: 'clear', reason: `Accepted play establishes ${change}.`, material: [] };
        }
        return envelope(value);
    }, defaultState(), { split: true });
    await h.scope.analyzeCampaignNow();
    const original = h.prepare().payload;
    for (let i = 0; i < 6; i++) h.context.chat.push({ is_user: false, name: 'Mara', mes: 'Accepted local play continues.' });
    assert.equal(h.prepare().payload, original);
    h.context.chat.push({ is_user: true, name: 'Neri', mes: `The shared future has changed through ${change}.` });
    changed = true;
    await h.scope.analyzeCampaignNow();
    const packet = h.prepare().payload;
    assert.notEqual(packet, original);
    if (change === 'progress') {
        assert.match(packet, /After the first shared cooking visit/);
        assert.doesNotMatch(packet, /If the ensemble later visits|handwritten supper cards/);
    } else assert.equal(packet, '');
});

test('replacement recovers a source-valid archived packet without rolling back the live revision or spending calls', async () => {
    const h = browser(splitResponse, defaultState(), { split: true });
    await h.scope.analyzeCampaignNow();
    const prior = h.prepare().payload;
    h.context.chat.push({ is_user: false, name: 'Mara', mes: 'DISCARDED_ONLY_SECRET' });
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.state().campaignPreparation.revision, 2);
    h.scope.deferReplacementPlanning(h.context);
    assert.equal(h.prepare('regenerate').payload, prior);
    await h.scope.repairDeferredReplacementPlan();
    assert.equal(h.requests.length, 4);
    assert.equal(h.state().campaignPreparation.revision, 2, 'writer recovery does not overwrite the authoritative revision');
});

test('missing pre-reply preparation rebuilds once from accepted play while rapid swipes stay nonblocking and frozen', async () => {
    let finish;
    const h = browser(args => h.requests.length === 4 ? new Promise(resolve => { finish = () => resolve(outlookResponse(args)); })
        : outlookResponse(args), defaultState(), { split: true });
    h.context.chat.push({ is_user: false, name: 'Mara', mes: 'DISCARDED_ONLY_SECRET' });
    await h.scope.analyzeCampaignNow();
    h.scope.deferReplacementPlanning(h.context);
    const frozen = h.prepare('regenerate');
    assert.equal(frozen.payload, '');
    const work = h.scope.repairDeferredReplacementPlan(); await settle();
    assert.equal(h.requests.length, 4, 'one two-stage replacement transaction');
    for (const request of h.requests.slice(2)) assert.doesNotMatch(request.prompt, /DISCARDED_ONLY_SECRET/);
    assert.equal(JSON.parse(h.requests[2].prompt).new_id_prefix, 'r2-');
    h.context.chat.at(-1).mes = 'A different unaccepted swipe.';
    h.scope.deferReplacementPlanning(h.context);
    await h.scope.repairDeferredReplacementPlan();
    assert.equal(h.requests.length, 4);
    assert.equal(h.requests.at(-1).signal.aborted, false);
    finish(); await work;
    assert.equal(h.state().campaignPreparation.revision, 2);
    assert.equal(h.state().campaignPreparation.source.messageCount, 2);
    assert.equal(frozen.payload, '', 'in-flight writer selection is immutable');
    assert.ok(h.prepare('swipe').payload);
    assert.doesNotMatch(h.prepare('swipe').payload, /DISCARDED_ONLY_SECRET/);
    h.scope.campaignSession = null;
    await h.scope.repairDeferredReplacementPlan();
    assert.equal(h.requests.length, 4, 'reload does not start another pass');
});

test('failed pre-reply repair reserves its source through reload, and an edited source rejects late work', async () => {
    for (const failure of ['offline', 'edited']) {
        const h = browser(args => {
            if (h.requests.length === 3) {
                if (failure === 'offline') throw Error('offline');
                h.context.chat[0].mes = 'Edited accepted premise';
            }
            return splitResponse(args);
        }, defaultState(), { split: true });
        h.context.chat.push({ is_user: false, name: 'Mara', mes: 'DISCARDED_ONLY_SECRET' });
        await h.scope.analyzeCampaignNow();
        h.scope.deferReplacementPlanning(h.context);
        await h.scope.repairDeferredReplacementPlan();
        assert.equal(h.requests.length, 3);
        assert.equal(h.state().campaignPreparation.revision, 1);
        assert.equal(h.prepare('regenerate').payload, '');
        if (failure === 'offline') {
            h.scope.campaignSession = null;
            h.context.chatMetadata = JSON.parse(JSON.stringify(h.context.chatMetadata));
            h.scope.deferReplacementPlanning(h.context);
            await h.scope.repairDeferredReplacementPlan();
            assert.equal(h.requests.length, 3);
        }
    }
});

// Handwritten output fixtures test the actual host input/commit/writer path,
// not a claim that a live model generated or understood these opportunities.
const opportunityCases = [
    {
        name: 'combat opportunity in a martial RP',
        scenario: 'A martial-arts adventure with rival schools, duels, training and freely chosen challenges.',
        past: 'The tournament ended; the visiting school stayed for friendly exhibitions.',
        current: 'I watch from the practice-yard gate.',
        direction: 'Explore rival schools, martial skill and relationships through chosen encounters.',
        threads: 'Develop skill and connections beyond the finished tournament.',
        owner: 'Visiting school captain', question: 'What does the visiting style offer?',
        initiative: 'The captain demonstrates a staff form and offers a friendly spar.',
        resolution: 'The exhibition ends, whether or not anyone accepts a spar.',
        beyond: 'Other schools offer contrasting techniques and friendships.',
        basis: 'The school is holding a public exhibition in this yard.',
        available: 'The visiting captain demonstrates a staff form in the yard and offers a friendly spar; acceptance stays open.',
    },
    {
        name: 'music-club invitation',
        scenario: 'An ordinary school music club: friendship, music and everyday pleasures. No battles.',
        past: 'The club finished its concert; Hana learned a new cake recipe.',
        current: 'I put my guitar case beside the practice chair.',
        direction: 'Friendship through music, school life and shared pleasures.',
        threads: 'Develop the club sound and enjoy time together.',
        owner: 'Hana', question: 'What can the club enjoy between songs?',
        initiative: 'Hana brings her new cake to practice and offers slices.',
        resolution: 'The break ends or the cake is put aside.',
        beyond: 'Members can exchange recipes on another day.',
        basis: 'The club is together in the practice room.',
        available: 'Hana opens a cake box on the practice-room table and offers slices between songs.',
    },
    {
        name: 'journey opportunity beyond the current rest',
        scenario: 'A freely paced journey through towns and countryside, with discoveries and local encounters.',
        past: 'The river crossing reopened; the party chose the northern road.',
        current: 'I sit under the tree and rest my feet.',
        direction: 'Travel among distinct communities, encounters and discoveries.',
        threads: 'Learn how the northern towns live.',
        owner: 'Map seller', question: 'What stories do the northern road maps preserve?',
        initiative: 'A map seller displays older routes in the next town.',
        resolution: 'The stall closes; no visit is required.',
        beyond: 'Map annotations offer optional routes to other settlements.',
        basis: 'A town on the chosen road; available if they later enter its market.',
        available: 'If they later enter the next town market, a seller displays hand-annotated maps of old northern routes.',
    },
    {
        name: 'Korra-era city opportunity respects a departure from canon',
        understanding: { basis: 'franchise', setting: 'Korra-era city RP after a negotiated truce', canonIntent: 'unspecified', divergence: 'major',
            anchors: 'City life, sport and friendships.', departures: 'The truce replaces faction conflict; the hall reopened.',
            storyScope: 'Urban civic life after the established truce.', experiences: 'Shared civic projects and relationships.',
            independentSource: 'Community volunteers organize hall activities beyond the cafe.',
            uncertainty: 'Future canon events are not established.' },
        scenario: 'Avatar: Korra-era city RP with civic life, sport and friendships. In this version the factions negotiated a truce.',
        past: 'The council ratified the truce; the neighborhood reopened its community hall.',
        current: 'I finish my noodles by the window.',
        direction: 'Explore city life and relationships after the negotiated truce.',
        threads: 'Neighbors rebuild shared civic and social life.',
        owner: 'Community hall volunteers', question: 'What can neighbors create together?',
        initiative: 'Volunteers display an open music-workshop notice in the cafe.',
        resolution: 'The workshop takes place or is cancelled.',
        beyond: 'Future shared projects remain voluntary.',
        basis: 'A public notice in this cafe, not knowledge of private plans.',
        available: 'Volunteers pin a notice for a music workshop at the reopened community hall beside the cafe window.',
    },
    // All Naruto details here are supplied RP premises, not claims of verified
    // franchise lore. The expected outputs are authored, not model-generated.
    {
        name: 'Naruto following canon with no established departure',
        scenario: 'Naruto RP. Follow canon where compatible with player choice. Card baseline: village training and team missions; current era has an open mission board.',
        past: 'The instructor opened the training yard. No departure from the supplied baseline is established.',
        current: 'I arrive at the yard.',
        understanding: { basis: 'franchise', setting: 'Naruto; village training era supplied by card', canonIntent: 'follow', divergence: 'none-established',
            anchors: 'The village trains teams and posts missions.', departures: 'None established; this does not verify all canon.',
            storyScope: 'Village team life and missions in the supplied era.', experiences: 'Training, missions and team relationships.',
            independentSource: 'The mission board receives work beyond this training yard.', uncertainty: 'Exact canon chronology remains unspecified.' },
        direction: 'Village training, missions and relationships with open participation.', threads: 'Develop team skills.',
        owner: 'Instructor', question: 'What can the team practice?', initiative: 'The instructor lays out a team exercise.',
        resolution: 'The practice concludes or is passed over.', beyond: 'Mission work remains available.',
        basis: 'An open exercise in this yard.', available: 'The instructor lays out a team exercise in the open yard; participation is optional.',
    },
    {
        name: 'Naruto small local change while still following canon',
        scenario: 'Naruto RP. Follow canon where possible. Card baseline: village training and team missions. Our established departure is a different mentor for this team, not a different village system.',
        past: 'The team accepted a different mentor, who teaches through tracking exercises.', current: 'I arrive at our training yard.',
        understanding: { basis: 'franchise', setting: 'Naruto; village training era supplied by card', canonIntent: 'follow', divergence: 'local',
            anchors: 'Village institutions and missions still apply.', departures: 'Changed mentor affects team training, not unrelated village premises.',
            storyScope: 'Team life under the new mentor; village work remains.', experiences: 'Tracking practice, team bonds and missions.',
            independentSource: 'Village mission staff continue posting assignments.', uncertainty: 'Other canon details remain provisional.' },
        direction: 'Village missions and team growth under the changed mentor.', threads: 'Learn the new mentor approach.',
        owner: 'New mentor', question: 'How does this team follow a trail?', initiative: 'The new mentor sets a tracking course.',
        resolution: 'The course concludes or is declined.', beyond: 'Tracking can matter on later missions.',
        basis: 'The new mentor is in this yard.', available: 'The new mentor lays a tracking course in the yard instead of restoring the former training arrangement.',
    },
    {
        name: 'Naruto major causal change despite canon-following preference',
        scenario: 'Naruto RP. Initially follow canon. Our RP now established a lasting alliance replacing the hostile village relationship in our baseline; account for it rather than undoing it.',
        past: 'The villages ratified the alliance and opened joint training to their teams.', current: 'I stop beside the training noticeboard.',
        understanding: { basis: 'franchise', setting: 'Naruto; alliance continuity established in this RP', canonIntent: 'follow', divergence: 'major',
            anchors: 'Team training and village identities remain.', departures: 'Alliance removes hostile prerequisites; future inter-village events must adapt.',
            storyScope: 'Team and inter-village life under the established alliance.', experiences: 'Joint training, cultural exchange and new missions.',
            independentSource: 'Allied instructors arrange sessions independently of the team.', uncertainty: 'Do not assume later canon conflicts still occur.' },
        direction: 'Explore team life and inter-village opportunities after the alliance.', threads: 'Build relationships across villages.',
        owner: 'Joint instructors', question: 'What can allied teams learn together?', initiative: 'Instructors post a joint training session.',
        resolution: 'The session ends or passes without attendance.', beyond: 'Shared missions may grow from the alliance.',
        basis: 'Public notice here after the alliance.', available: 'Joint instructors post an open training session for allied teams; no former hostility is reinstated.',
    },
    {
        name: 'original world with familiar names is not assigned a franchise',
        scenario: 'Entirely original floating-island RP. A gardener named Naruto grows musical plants. No ninja setting or borrowed franchise rules.',
        past: 'The garden reopened for a seed exchange.', current: 'I approach the greenhouse.',
        understanding: originalUnderstanding({ setting: 'Original floating islands and musical gardens', anchors: 'Plants make music; familiar names do not imply borrowed lore.',
            experiences: 'Seed exchanges, garden music and island visits.', uncertainty: 'Unspecified island customs remain open.' }),
        direction: 'Explore musical gardens and island communities.', threads: 'Exchange growing techniques.',
        owner: 'Greenhouse volunteers', question: 'What sounds can new plants make?', initiative: 'Volunteers arrange a seed exchange.',
        resolution: 'The exchange closes.', beyond: 'Other islands grow different musical plants.',
        basis: 'The greenhouse is open here.', available: 'Volunteers display musical seed varieties in the greenhouse for the open exchange.',
    },
];

for (const example of opportunityCases)
for (const correction of [false, true]) test(`${example.name}: ${correction ? 'corrected' : 'normal'} host pass keeps RP basis and commits an optional experience`, async () => {
    const value = { plan: { rpUnderstanding: example.understanding || originalUnderstanding({ setting: example.name, experiences: example.direction }), direction: example.direction, threads: example.threads, consequences: [],
        goal: [{ subjectId: 'r1-opportunity', scope: 'near-term', aim: example.initiative, reachedWhen: example.resolution }],
        developments: [{ id: 'r1-opportunity', kind: 'side', owner: example.owner, control: 'npc', trajectoryIds: [],
            question: example.question, initiative: example.initiative, resolution: example.resolution,
            beyond: example.beyond, access: { route: 'local', basis: example.basis } }] },
        progression: { upsert: [], retire: [] }, exits: [], observations: [], selected_material: [{ subjectIds: ['r1-opportunity'], available: example.available,
            developing: example.beyond, lasting: example.direction }] };
    let calls = 0;
    const h = browser(async ({ prompt, spec }) => {
        calls++;
        const input = JSON.parse(prompt);
        assert.equal(input.source_reference.scenario, example.scenario);
        assert.ok(prompt.includes(example.past), 'Relevant supplied past is not replaced by generic genre advice.');
        assert.ok(prompt.includes(example.current));
        assert.match(spec.systemPrompt, /Infer expected experiences from the supplied setting/);
        assert.match(spec.systemPrompt, /each when is a causal dependency/);
        assert.match(spec.systemPrompt, /accepted messages alone establish their enactment/);
        assert.match(spec.systemPrompt, /canonIntent reflects the user's stated preference/);
        assert.match(spec.systemPrompt, /Reconsider dependent possibilities when their premises change/);
        assert.ok(spec.schema.value.properties.plan.required.includes('rpUnderstanding'));
        assert.ok(storyInputTokens(prompt, spec.systemPrompt, spec.schema) <= 8000);
        if (correction && calls === 1) return { choices: [{ message: { content: '{"plan":' }, finish_reason: 'stop' }] };
        return { choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] };
    });
    h.context.card = { scenario: example.scenario };
    h.context.chat.splice(0, h.context.chat.length,
        { is_user: false, name: 'Narrator', mes: example.past },
        { is_user: true, name: 'Neri', mes: example.current });
    const untouched = structuredClone(h.context.chat);
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(calls, correction ? 2 : 1);
    const saved = h.state().campaignPreparation;
    assert.equal(saved?.revision, 1, h.statuses.join('\n'));
    assert.deepEqual(saved.workingPlan, { ...value.plan, trajectories: [] });
    assert.deepEqual(saved.workingPlan.consequences, [], 'A proposed opportunity is not promoted to accepted history.');
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'complete');
    assert.ok(h.prepare().payload.includes(example.available), 'Opportunity survives the real host commit and writer selection.');
    assert.ok(!h.prepare().payload.includes(value.plan.rpUnderstanding.uncertainty), 'Private provisional analysis is not injected as a fact.');
    assert.ok(!h.prepare().payload.includes(value.plan.rpUnderstanding.storyScope), 'Private story scope is not a writer directive.');
    assert.ok(!h.prepare().payload.includes(value.plan.rpUnderstanding.independentSource), 'Off-scene activity stays private until selected.');
    assert.deepEqual(h.context.chat, untouched, 'Planning does not enact participation, travel or time passage.');
    const nextInput = h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot());
    assert.equal(JSON.parse(nextInput.prompt).previous_plan.direction, example.direction,
        'The broader experience scope, not just current activity, carries to subsequent planning.');
    assert.deepEqual(JSON.parse(nextInput.prompt).previous_plan.rpUnderstanding, value.plan.rpUnderstanding);
    assert.deepEqual(JSON.parse(nextInput.prompt).previous_plan.goal, value.plan.goal);
    assert.ok(h.prepare().payload.includes(example.beyond));
    assert.ok(h.prepare().payload.includes(example.direction));
    assert.doesNotMatch(h.prepare().payload, /story_goal|development_contract/);
});

test('notebook exposes RP understanding and uncertainty without claiming verified canon', () => {
    const scope = vm.createContext({});
    vm.runInContext(source.match(/function workingPlanSummary\([^]*?^}/m)[0], scope);
    for (const example of opportunityCases.filter(e => e.understanding)) {
        const summary = scope.workingPlanSummary({ workingPlan: { ...design.plan, rpUnderstanding: example.understanding }, archive: [] });
        assert.match(summary, /private · provisional, not verified canon/);
        assert.match(summary, /PRIVATE STORY GOALS \(not sent to the writer\)/);
        assert.ok(summary.includes(design.plan.goal[0].aim));
        assert.ok(summary.includes(design.plan.goal[0].reachedWhen));
        for (const value of Object.values(example.understanding)) assert.ok(summary.includes(value));
    }
    const old = structuredClone(design.plan); delete old.rpUnderstanding;
    assert.match(scope.workingPlanSummary({ workingPlan: old, archive: [] }), /Not yet analyzed; added on the next planning pass/);
    delete old.goal;
    assert.match(scope.workingPlanSummary({ workingPlan: old, archive: [] }), /STORY GOALS · Chosen on the next planning pass/);
    assert.match(source, /workingPlanSummary\(preparation\),/);
    assert.match(source, /element\.textContent = content/);
});

test('host saves, reloads and selects coexisting goals without assigning them all to every reply', async () => {
    const value = multiDesign();
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] }));
    const untouched = structuredClone(h.context.chat);
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.state().campaignPreparation?.revision, 1, h.statuses.join('\n'));
    const first = JSON.parse(h.prepare().payload.replace(/<\/?tale-fairy-context>/g, ''));
    assert.deepEqual(first.possible_developments[0], materialHorizons(value.selected_material[0]));
    assert.deepEqual(h.context.chat, untouched, 'Selecting several goals enacts none of them.');

    value.selected_material = [{ subjectIds: ['r1-tea'], available: 'During the club break, the baker cuts two cakes to compare.',
        developing: 'The baker experiments with cakes for later club gatherings.',
        lasting: 'A regular tea break could make the bakery part of the ensemble’s shared life.' }];
    h.context.chat.push({ is_user: true, name: 'Neri', mes: 'I take a seat for the break.' });
    await h.scope.analyzeCampaignNow({ manual: true });
    const saved = h.state().campaignPreparation;
    assert.equal(saved.revision, 2, h.statuses.join('\n'));
    assert.deepEqual(saved.workingPlan.goal, value.plan.goal);
    assert.deepEqual(saved.archive.at(-1).workingPlan.goal, value.plan.goal);
    const nextInput = JSON.parse(h.requests.at(-1).prompt);
    assert.deepEqual(nextInput.previous_plan.goal, value.plan.goal);
    const wire = h.prepare().payload;
    assert.match(wire, /baker experiments/);
    assert.doesNotMatch(wire, /Build a repertoire|Give the ensemble|PRIVATE|subjectId/);
    const reload = browser(undefined, loadPlannerState(JSON.parse(JSON.stringify(h.context.chatMetadata))));
    reload.context.chat = structuredClone(h.context.chat);
    reload.context.chatMetadata = structuredClone(h.context.chatMetadata);
    assert.equal(reload.prepare().payload, wire);
    assert.equal(reload.requests.length, 0);

    const scope = vm.createContext({});
    vm.runInContext(source.match(/function workingPlanSummary\([^]*?^}/m)[0], scope);
    const summary = scope.workingPlanSummary(saved);
    for (const goal of value.plan.goal) {
        assert.ok(summary.includes(goal.aim));
        assert.ok(summary.includes(goal.reachedWhen));
    }
    assert.match(summary, /near-term · held for later/);
    assert.match(summary, /long-term · held for later/);
    assert.match(summary, /side-thread · selected/);
});

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
    delete response.plan.developments[0].initiative;
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.state().campaignPreparation.revision, 1);
    const preview = emptyPreview(h);
    assert.match(preview, /refresh after 4 assistant replies/);
    assert.match(preview, /Latest planning attempt failed:.*missing initiative/);
    assert.doesNotMatch(preview, /Awaiting current context|Preparing context/);
    assert.match(preview, /Use Guide now/);

    h.context.chat[0].mes = 'The original scene was edited.';
    assert.match(emptyPreview(h), /does not match the current story context/);
    h.context.chatMetadata.taleFairyCampaignAttempt.chatId = 'another-chat';
    assert.doesNotMatch(emptyPreview(h), /Latest planning attempt failed/);
});

test('empty writer preview distinguishes quiet selection, missing preparation and active campaign planning', async () => {
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify({ ...design, plan: { ...design.plan, goal: [] }, selected_material: [] }) }, finish_reason: 'stop' }] }));
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
    assert.match(scope.campaignBudgetSummary(null, []), /estimated 0\/2400/);
    const note = 'Explicit instruction. '.repeat(700);
    assert.match(scope.campaignBudgetSummary(null, [note]), /Author instructions alone exceed.*remain verbatim/);
});

for (const [size, requests, outcome] of [[400, 2, 'unsuccessful'], [800, 1, 'input-limited']]) {
test(`valid oversized writer material survives ${outcome} shortening without bypassing the writer budget`, async () => {
    const value = structuredClone(design);
    for (const key of ['available', 'developing', 'lasting']) value.selected_material[0][key] = '音'.repeat(size);
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, requests);
    assert.deepEqual(h.state().campaignPreparation.selectedMaterial, value.selected_material);
    assert.match(h.statuses.at(-1), /600 token target; kept intact/);
    assert.equal(h.prepare().payload, '');
});
}

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

test('initial protected input above target still produces a plan without a false failure label', async () => {
    const h = browser();
    h.context.chat.push({ is_user: true, name: 'Neri', mes: 'Protected player contribution. '.repeat(10000) });
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 1);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'complete');
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.requestCount, 1);
    assert.match(h.statuses.at(-1), /input .*10000 token target; kept intact/);
    assert.equal(JSON.parse(h.requests[0].prompt).accepted_messages.at(-1).spans.map(s => Array.isArray(s) ? s[1] : s.text).join(''), h.context.chat.at(-1).mes);
    h.prepare();
    assert.match(h.statuses.at(-1), /Plot preparation ready|Cached conditional preparation ready/);
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
    assert.ok(storyInput({ reference: snapshot.reference, state: snapshot.state,
        messages: campaignEvidenceMessages(campaignReviewWindow(snapshot.messages.map((m, index) => ({ index,
            role: m.is_user ? 'user' : 'assistant', name: m.name, content: m.mes })), 2), { narrative: true }) }).inputOverTarget > 0);
    const built = h.scope.buildCampaignHostInput(snapshot), payload = JSON.parse(built.prompt);
    assert.ok(built.inputTokens <= 10000);
    assert.equal(payload.coverage.reviewed_before, 397);
    assert.equal(payload.new_id_prefix, 'r51-');
    assert.equal(payload.rebuild, true);
    assert.match(payload.coverage.review_boundary, /not restored/);
    for (let index = 397; index < 407; index += 2) assert.ok(built.evidenceMessages.some(m => m.index === index
        && m.content === h.context.chat[index].mes), `new/edited contribution ${index} stays whole`);
    assert.deepEqual(structuredClone(h.context.chatMetadata), before);
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 2, 'recovery sends one planner request');
    assert.equal(h.state().campaignPreparation.revision, 51, 'recovered revision reaches the host commit');
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'complete');
    assert.match(h.statuses.at(-1), /Campaign preparation ready/);
    h.scope.generationGuideSelection = null;
    assert.ok(h.prepare().payload.includes(design.selected_material[0].available));
    h.context.chat[1].mes = 'An edit before every saved checkpoint.';
    assert.equal(h.scope.campaignReviewedCount(snapshot.state, { ...h.scope.readCampaignSnapshot(), fingerprint: h.scope.campaignFingerprint }), 0);
    const edited = h.scope.buildCampaignHostInput(h.scope.readCampaignSnapshot());
    assert.equal(JSON.parse(edited.prompt).coverage.reviewed_before, 0);
    assert.ok(edited.inputOverTarget > 0);
    assert.ok(edited.evidenceMessages.some(m => m.index === 1 && m.content === h.context.chat[1].mes));
});

test('a rejected host commit is reported as unsaved work, not an unnecessary planning pass', async () => {
    const h = browser();
    h.scope.commitCampaignPreparation = () => false;
    await h.scope.analyzeCampaignNow({ manual: true });
    assert.equal(h.requests.length, 1);
    assert.equal(h.state().campaignPreparation?.revision || 0, 0);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'failed');
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.skipped, 'commit-conflict');
    assert.match(h.statuses.at(-1), /Planning result not saved.*commit-conflict/);
    assert.doesNotMatch(h.statuses.at(-1), /No new planning pass needed/);
});

test('full rebuild deletes preparation before requesting and stays empty on failure, including above target', async () => {
    let fail = false;
    const h = browser(async ({ prompt }) => { if (fail) throw Error('Provider offline'); return envelope(directorReply(prompt)); }, defaultState(), { director: true });
    await h.scope.analyzeCampaignNow();
    h.prepare();
    fail = true;
    await h.scope.rebuildGuideState();
    assert.equal(h.state().campaignPreparation, null);
    assert.equal(h.state().canonBootstrapPending, true);
    assert.equal(h.context.chatMetadata[GENERATION_CONTEXT_KEY], null);
    assert.equal(h.requests.length, 2);
    assert.deepEqual(JSON.parse(h.requests[1].prompt).previous_preparation.nodes, []);
    assert.equal(JSON.parse(h.requests[1].prompt).coverage.reviewed_before, 0);
    h.context.chat.push({ is_user: true, name: 'Neri', mes: 'Required new contribution. '.repeat(10000) });
    await h.scope.rebuildGuideState();
    assert.equal(h.state().campaignPreparation, null);
    assert.equal(h.requests.length, 3);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.requestCount, 1);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'failed');
    assert.match(h.statuses.at(-1), /No preparation available/);
    h.context.chat.pop(); fail = false;
    await h.scope.rebuildGuideState();
    assert.equal(h.requests.length, 4);
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.deepEqual(h.state().campaignPreparation.archive, []);
    assert.equal(h.state().canonBootstrapPending, false);
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 4, 'successful rebuild does not schedule an immediate ordinary duplicate');
});

test('full rebuild clears archives, legacy data and retry caches before sending while keeping author preferences', async () => {
    let rejectRebuild;
    const h = browser(async ({ prompt }) => h.requests.length === 3
        ? new Promise((_resolve, reject) => { rejectRebuild = reject; })
        : envelope(retainedDirectorReply(prompt)), defaultState(), { director: true });
    await h.scope.analyzeCampaignNow();
    await h.scope.reevaluateGuideState();
    assert.equal(h.state().campaignPreparation.archive.length, 1);
    const previous = h.state();
    previous.contextLedger = 'OBSOLETE LEDGER';
    previous.preparedWorld.approach = 'OBSOLETE NOTEBOOK';
    previous.legacyPreparedWorld = structuredClone(previous.preparedWorld);
    previous.lastRequestVerification = { chatId: 'story', guidanceBlock: 'OBSOLETE VERIFICATION' };
    previous.userNotes = [{ kind: 'suggest', text: 'Keep the voyage open.', at: 1 }];
    previous.campaignInstructions = [{ text: 'Allow quiet friendships.', at: 2 }];
    previous.pacing.mode = 'linger';
    h.context.chatMetadata = saveState({ ...h.context.chatMetadata, summary: 'External recall.' }, previous);
    h.settings.lastProviderBoundVerification = { chatId: 'story', guidanceBlock: 'OBSOLETE VERIFICATION' };
    h.scope.pendingRequestVerification = h.settings.lastProviderBoundVerification;
    h.prepare();
    const rebuilding = h.scope.rebuildGuideState();
    await settle(); await settle();
    assert.equal(h.requests.length, 3);
    const cleared = h.state();
    assert.equal(cleared.campaignPreparation, null);
    assert.equal(cleared.legacyPreparedWorld, null);
    assert.equal(cleared.contextLedger, '');
    assert.equal(cleared.lastRequestVerification, null);
    assert.equal(h.scope.pendingRequestVerification, null);
    assert.equal(h.settings.lastProviderBoundVerification, undefined);
    assert.equal(h.context.chatMetadata[GENERATION_CONTEXT_KEY], null);
    assert.deepEqual(cleared.userNotes, previous.userNotes);
    assert.deepEqual(cleared.campaignInstructions, previous.campaignInstructions);
    assert.equal(cleared.pacing.mode, previous.pacing.mode);
    assert.equal(h.context.chatMetadata.summary, 'External recall.');
    const prompt = JSON.parse(h.requests[2].prompt);
    assert.deepEqual(prompt.previous_preparation, { nodes: [] });
    assert.equal(prompt.coverage.reviewed_before, 0);
    assert.doesNotMatch(h.requests[2].prompt, /OBSOLETE/);
    rejectRebuild(Error('Provider offline'));
    await rebuilding;
    h.context.chatMetadata = JSON.parse(JSON.stringify(h.context.chatMetadata));
    h.scope.campaignSession = null;
    assert.doesNotMatch(h.prepare('regenerate').payload, /neighborhood supper|OBSOLETE/);
    await h.scope.refreshCurrentPlanIfNeeded();
    assert.equal(h.requests.length, 3, 'reload keeps the failed rebuild empty without retrying');
    await h.scope.reevaluateGuideState();
    assert.equal(h.requests.length, 4);
    assert.deepEqual(JSON.parse(h.requests[3].prompt).previous_preparation.nodes, []);
    assert.deepEqual(h.state().campaignPreparation.archive, []);
    assert.equal(h.state().canonBootstrapPending, false);
});

test('stopping a full rebuild leaves the deleted notebook empty', async () => {
    const h = browser(async ({ prompt, signal }) => h.requests.length === 1 ? envelope(directorReply(prompt))
        : new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
    defaultState(), { director: true });
    await h.scope.analyzeCampaignNow();
    const rebuilding = h.scope.rebuildGuideState();
    await settle(); await settle();
    assert.equal(h.requests.length, 2);
    assert.equal(h.state().campaignPreparation, null);
    h.scope.interruptAnalysis('User stopped rebuild.', 'Stopped');
    await rebuilding;
    assert.equal(h.state().campaignPreparation, null);
    assert.equal(h.state().canonBootstrapPending, true);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'stopped');
    assert.doesNotMatch(h.prepare().payload, /neighborhood supper/);
});

test('Guide now retains the previous map and retry history when the provider fails', async () => {
    let fail = false;
    const h = browser(async ({ prompt }) => {
        if (fail) throw Error('Provider offline');
        return envelope(retainedDirectorReply(prompt));
    }, defaultState(), { director: true });
    await h.scope.analyzeCampaignNow();
    h.prepare();
    const previous = structuredClone(h.state().campaignPreparation);
    const cache = structuredClone(h.context.chatMetadata[GENERATION_CONTEXT_KEY]);
    fail = true;
    await h.scope.reevaluateGuideState();
    assert.deepEqual(h.state().campaignPreparation, previous);
    assert.deepEqual(structuredClone(h.context.chatMetadata[GENERATION_CONTEXT_KEY]), cache);
    assert.equal(JSON.parse(h.requests[1].prompt).previous_preparation.nodes.length, 1);
    assert.match(h.statuses.at(-1), /Previous preparation retained/);
    assert.match(h.prepare().payload, /neighborhood supper/);
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
    const h = browser(async ({ prompt }) => envelope(directorReply(prompt)), defaultState(), { director: true });
    h.context.chatMetadata.summary = 'External summary stays.';
    const book = { entries: { 0: { content: 'Unmodified source.' } } };
    h.scope.worldInfoCache.set('Book', book);
    await h.scope.analyzeCampaignNow();
    await h.scope.rebuildGuideState();
    assert.equal(h.requests.length, 2);
    const input = JSON.parse(h.requests[1].prompt);
    assert.equal(Object.hasOwn(input.previous_preparation, 'direction'), false);
    assert.deepEqual(input.previous_preparation.nodes, []);
    assert.match(h.requests[1].prompt, /External summary stays/);
    assert.deepEqual(h.state().campaignPreparation.archive, []);
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
    wider.selected_material[0] = { subjectIds: ['r2-travel'], available: 'Carriers survey open regional routes.',
        developing: 'Carriers can establish stops between neighboring communities.',
        lasting: 'Regular routes could support lasting regional exchange.' };
    wider.plan.goal = [{ subjectId: 'r2-travel', scope: 'long-term', aim: 'Open regional exchanges.', reachedWhen: 'The carriers establish their first exchange.' }];
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
    assert.match(payload, /open regional routes/i);
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
        const h = browser(async ({ prompt }) => envelope(directorReply(prompt)), defaultState(), { director: true });
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
        else assert.deepEqual(h.state().campaignPreparation.archive, []);
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

test('same-source memory correction discards both drafts and rebases once', async () => {
    let finish;
    const h = browser(args => h.requests.length === 1 ? new Promise(resolve => { finish = resolve; })
        : splitResponse(args), defaultState(), { split: true });
    const snapshot = memorySnapshot();
    h.scope.continuityMemoryBridge = { version: 2, getContextSnapshot: () => snapshot };
    const work = h.scope.analyzeCampaignNow();
    await settle();
    assert.equal(h.requests.length, 1);
    snapshot.prompt = 'Correction: the engagement was never accepted.';
    snapshot.revision++;
    finish(envelope(workshopReply()));
    await work;
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.equal(h.requests.length, 3);
    assert.match(h.requests[1].prompt, /Correction: the engagement was never accepted/);
    assert.match(h.requests[2].prompt, /Correction: the engagement was never accepted/);
    assert.deepEqual(Array.from(h.context.chatMetadata.taleFairyCampaignAttempt.stages), ['horizon', 'horizon', 'scene']);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.requestCount, 3);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.evidenceRestarts, 1);
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 3, 'no same-source retry after the bounded rebase');
});

for (const changedAt of [1, 2]) test(`memory update after request ${changedAt} leaves scene correction available in the rebuilt pass`, async () => {
    const snapshot = memorySnapshot();
    const h = browser(args => {
        assert.equal(h.state().campaignPreparation?.revision || 0, 0, 'no draft commits before the entire pass succeeds');
        if (h.requests.length === changedAt) {
            snapshot.prompt = 'Corrected memory for the rebuilt preparation.';
            snapshot.revision++;
        }
        if (h.requests.length === changedAt + 2) return { choices: [{ message: { content: '{bad' }, finish_reason: 'stop' }] };
        return splitResponse(args);
    }, defaultState(), { split: true });
    h.scope.continuityMemoryBridge = { version: 2, getContextSnapshot: () => snapshot };
    await h.scope.analyzeCampaignNow();
    const attempt = h.context.chatMetadata.taleFairyCampaignAttempt;
    assert.equal(h.requests.length, changedAt + 3);
    assert.equal(attempt.requestCount, h.requests.length);
    assert.equal(attempt.status, 'complete', attempt.error);
    assert.equal(attempt.evidenceRestarts, 1);
    assert.deepEqual(Array.from(attempt.stages), changedAt === 1
        ? ['horizon', 'horizon', 'scene', 'scene'] : ['horizon', 'scene', 'horizon', 'scene', 'scene']);
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.ok(h.requests.slice(changedAt).every(request => request.prompt.includes(snapshot.prompt)));
    assert.match(h.requests.at(-1).prompt, /response_correction/);
    assert.doesNotMatch(h.statuses.join('\n'), /request limit|request \d+ of \d+/i);
    h.scope.campaignSession = null;
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, changedAt + 3, 'a completed rebuild remains deduplicated after reload');
});

test('active browser can correct both stages and commit the complete preparation', async () => {
    const h = browser(args => h.requests.length === 1 || h.requests.length === 3
        ? { choices: [{ message: { content: '{bad' }, finish_reason: 'stop' }] } : splitResponse(args),
    defaultState(), { split: true });
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 4);
    assert.equal(h.state().campaignPreparation.revision, 1);
    const attempt = h.context.chatMetadata.taleFairyCampaignAttempt;
    assert.equal(attempt.status, 'complete', attempt.error);
    assert.deepEqual(Array.from(attempt.stages), ['horizon', 'horizon', 'scene', 'scene']);
    assert.deepEqual(JSON.parse(h.requests[2].prompt).prepared_horizon, JSON.parse(h.requests[3].prompt).prepared_horizon);
});

test('memory changes during input preparation spend no stale request and rebuild once', async () => {
    const h = browser(splitResponse, defaultState(), { split: true });
    const snapshot = memorySnapshot();
    h.scope.continuityMemoryBridge = { version: 2, getContextSnapshot: () => snapshot };
    const prepare = h.scope.buildCampaignHostInput;
    h.scope.buildCampaignHostInput = source => {
        const input = prepare(source);
        snapshot.prompt = 'Corrected before sending.';
        return input;
    };
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2);
    assert.ok(h.requests.every(request => request.prompt.includes('Corrected before sending.')));
    assert.equal(h.state().campaignPreparation.revision, 1);
});

test('identical memory republishing during each stage completes without a restart', async () => {
    const snapshot = memorySnapshot();
    const h = browser(args => {
        snapshot.revision++;
        return splitResponse(args);
    }, defaultState(), { split: true });
    h.scope.continuityMemoryBridge = { version: 2, getContextSnapshot: () => snapshot };
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2);
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.evidenceRestarts, undefined);
});

test('continuously changing memory during preflight rebuilds once, sends nothing, and preserves saved preparation', async () => {
    const h = browser(splitResponse, defaultState(), { split: true });
    const snapshot = memorySnapshot();
    h.scope.continuityMemoryBridge = { version: 2, getContextSnapshot: () => snapshot };
    const prepare = h.scope.buildCampaignHostInput;
    let builds = 0;
    h.scope.buildCampaignHostInput = source => {
        const input = prepare(source);
        snapshot.prompt = `Memory content changes during build ${++builds}.`;
        return input;
    };
    await h.scope.analyzeCampaignNow();
    assert.equal(builds, 2);
    assert.equal(h.requests.length, 0);
    assert.equal(h.state().campaignPreparation?.revision || 0, 0);
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'failed');
    await h.scope.analyzeCampaignNow();
    assert.equal(builds, 2, 'no automatic same-source loop');
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
    assert.equal(request.spec.schema.name, 'tale_fairy_story_progression_v6');
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
        { possible_developments: writerDesign() }, 'actual host injects story possibilities, not instructions, private goals or a whole future plan');
    assert.equal(h.context.chatMetadata.taleFairyCampaignAttempt.status, 'complete');
});

test('single-goal saved packets still authenticate byte-for-byte and upgrade on normal planning', async () => {
    const h = browser();
    await h.scope.analyzeNow({ force: true });
    const old = structuredClone(h.state());
    delete old.campaignPreparation.workingPlan.goal[0].scope;
    assert.equal(validCampaignState(old.campaignPreparation), true);
    const packet = h.scope.buildGenerationPacket(old, h.context.chat, h.context);
    assert.deepEqual(JSON.parse(packet.payload.replace(/<\/?tale-fairy-context>/g, '')),
        { possible_developments: writerDesign() });
    const expected = `<tale-fairy-context>\n${JSON.stringify({
        development_contract: DEVELOPMENT_CONTRACT,
        possible_developments: [{ story_goal: { aim: design.plan.goal[0].aim, reached_when: design.plan.goal[0].reachedWhen },
            ...materialHorizons(design.selected_material[0]) }],
        story_goal_contract: STORY_GOAL_CONTRACT,
    })}\n</tale-fairy-context>`;
    assert.equal(contractedCampaignPayload(old.campaignPreparation), expected);
    const cache = { version: 1, entries: [{ ...packet, payload: expected }] };
    assert.equal(generationContextEntries(cache).length, 1);
    const metadata = saveState({ ...h.context.chatMetadata, [GENERATION_CONTEXT_KEY]: cache }, old);
    for (const type of ['normal', 'regenerate', 'swipe']) {
        const reopened = browser(undefined, old);
        reopened.context.chatMetadata = structuredClone(metadata);
        if (type !== 'normal') reopened.context.chat.push({ is_user: false, name: 'Mara', mes: 'Discarded response.' });
        const selected = reopened.prepare(type);
        assert.equal(selected.reused, true, type);
        assert.equal(selected.payload, packet.payload, 'authenticated old bytes are rebuilt as material-only guidance');
        assert.equal(reopened.requests.length, 0);
        assert.deepEqual(reopened.context.chatMetadata, structuredClone(metadata));
    }
    const upgrade = browser(undefined, old);
    upgrade.context.chatMetadata = structuredClone(metadata);
    upgrade.context.chat.push({ is_user: true, name: 'Neri', mes: 'I look at the new score.' });
    await upgrade.scope.analyzeCampaignNow({ manual: true });
    assert.equal(upgrade.state().campaignPreparation.revision, old.campaignPreparation.revision + 1);
    assert.equal(upgrade.state().campaignPreparation.workingPlan.goal[0].scope, 'near-term');
    assert.equal(upgrade.state().campaignPreparation.archive.at(-1).workingPlan.goal[0].scope, undefined);
    assert.deepEqual(upgrade.state().campaignPreparation.workingPlan.developments, old.campaignPreparation.workingPlan.developments);
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
    assert.ok(users.every(m => !Object.hasOwn(m, 'name') && m.spans.map(s => Array.isArray(s) ? s[1] : s.text).join('') === h.context.chat[m.index].mes),
        'Lossless span tables and ordinary spans must both preserve whole player contributions.');
    assert.deepEqual(payload.player_names, ['Neri']);
    assert.equal(h.requests.length, 0);
});

test('real received/end events share persisted cadence and never invoke reply repair', async () => {
    const h = browser();
    await h.scope.analyzeCampaignNow();
    for (let i = 0; i < 1; i++) {
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
    const responses = [design, { ...design, plan: { ...design.plan, goal: [] }, selected_material: [] }, revised];
    const h = browser(async () => ({ choices: [{ message: { content: JSON.stringify(responses.shift()) }, finish_reason: 'stop' }] }));
    await h.scope.analyzeCampaignNow();
    const first = structuredClone(h.state().campaignPreparation);
    assert.match(h.prepare().payload, /An original tune has potential/);
    async function acceptedReplies(label) {
        for (let i = 0; i < 2; i++) {
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

test('oversized protected player contribution is sent whole and previous preparation is archived', async () => {
    const h = browser();
    await h.scope.analyzeCampaignNow();
    const before = structuredClone(h.state().campaignPreparation);
    h.context.chat.push({ is_user: true, mes: 'Required player contribution. '.repeat(10000) });
    for (let i = 0; i < 40; i++) h.context.chat.push({ is_user: false, mes: 'Later accepted prose.' });
    await h.scope.analyzeCampaignNow({ force: true });
    assert.equal(h.requests.length, 2, 'one new provider request');
    assert.equal(h.state().campaignPreparation.revision, before.revision + 1);
    assert.deepEqual(h.state().campaignPreparation.archive.at(-1).workingPlan, before.workingPlan);
    const message = JSON.parse(h.requests[1].prompt).accepted_messages.find(m => m.index === 2);
    assert.equal(message.spans.map(s => Array.isArray(s) ? s[1] : s.text).join(''), h.context.chat[2].mes);
    assert.match(h.statuses.join('\n'), /token target; kept intact/);
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
    assert.match(JSON.stringify(payload.accepted_messages), /I decline the offer/);
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

test('input preparation sends required source whole even when it alone exceeds the target', async () => {
    const h = browser();
    h.context.card = { persona: 'Unabridged source sentence. '.repeat(4000) };
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 1);
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.equal(JSON.parse(h.requests[0].prompt).source_reference.persona, h.context.card.persona);
    assert.match(h.statuses.join('\n'), /token target; kept intact/);
});

test('normal startup migrates legacy data automatically and Rebuild stays single-pass', async () => {
    const h = browser(async ({ prompt }) => envelope(directorReply(prompt)), defaultState(), { director: true });
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
    await h.scope.rebuildGuideState();
    assert.equal(h.requests.length, 2);
    assert.equal(h.state().plannerContract, 15);
    assert.equal(h.state().campaignPreparation.revision, 1);
    assert.deepEqual(h.state().campaignPreparation.archive, []);
    assert.deepEqual(JSON.parse(h.requests[1].prompt).previous_preparation.nodes, []);
    assert.equal(h.state().contextLedger, '');
    assert.equal(h.state().legacyPreparedWorld, null);
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
        { possible_developments: writerDesign(), author_instructions: [note] });
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
    assert.deepEqual(input.previous_plan.developments, []);
    assert.equal(input.previous_plan.consequences, undefined, 'no unverified branch supplies a prior plan');
    assert.equal(h.state().campaignPreparation.planEvidence.show.text, 'The show ended.');
    assert.equal(h.prepare().payload, '');
});


test('generic evidence correction rebuilds both stages instead of saving the in-flight draft', async () => {
    let finish;
    const h = browser(args => h.requests.length === 1 ? new Promise(resolve => { finish = resolve; })
        : splitResponse(args), defaultState(), { split: true });
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
        finish(envelope(workshopReply()));
        await work;
        assert.equal(h.requests.length, 3);
        assert.match(h.requests[1].prompt, /Corrected: only one proposed date/);
        assert.equal(h.state().campaignPreparation.revision, 1);
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
    assert.match(h.statuses.at(-1), kind === 'oversized' ? /shortened automatically/ : /corrected automatically/);
    assert.ok(renders > 0, 'preview refreshes after the host work clears');
    assert.match(h.prepare().payload, /An original tune/);
    h.scope.campaignSession = null;
    await h.scope.analyzeCampaignNow();
    assert.equal(h.requests.length, 2, 'reloaded attempt reservation covers both requests');
});

for (const validFirst of [false, true]) for (const mutation of ['edit', 'stop', 'switch', 'disable']) test(`automatic correction cancels before sending after ${mutation} (valid first=${validFirst})`, async () => {
    const h = browser(async () => {
        if (mutation === 'edit') h.context.chat[0].mes = 'Edited accepted story.';
        if (mutation === 'stop') h.scope.campaignSession.stop();
        if (mutation === 'switch') h.context.getCurrentChatId = () => 'different-story';
        if (mutation === 'disable') h.settings.enabled = false;
        const large = structuredClone(design);
        large.selected_material[0].available = '音'.repeat(500);
        return { choices: [{ message: { content: validFirst ? JSON.stringify(large) : '{"plan":' }, finish_reason: 'stop' }] };
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
