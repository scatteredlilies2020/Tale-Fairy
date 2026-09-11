import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { GAME_MASTER_CONTRACT, PLANNER_AGENCY_RULE, ACTOR_AGENCY_RULE, AGENCY_AUDIT_RULE, isStoryGeneration } from '../extension/game-master.js';
import { buildPromptPayload, defaultState, fingerprintMessages, generationRetrySource, guidanceSnapshot, isDirectionCurrent, isGuidanceUsable, isReplacementVerificationCurrent, loadState, saveState } from '../extension/state.js';
import { hasUsableCausalContext } from '../extension/causal-context.js';
import { SYSTEM, INCREMENTAL_SYSTEM, ANALYSIS_OUTPUT_CONTRACT, INCREMENTAL_ANALYSIS_OUTPUT_CONTRACT, buildAnalysisPrompt } from '../extension/analysis.js';
import { ensureGuidanceInChat, ensureGuidanceInText, extractTaleFairyContext, chatHasCurrentGuidance, textHasCurrentGuidance, requestContainsMarker } from '../extension/request-injection.js';
import { estimateTokenCount } from '../extension/token-budget.js';

const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
function runtimeFunction(name) {
    const pattern = new RegExp(`(?:export )?(?:async )?function ${name}\\([^]*?^}`, 'm');
    const match = source.match(pattern);
    assert.ok(match, `Missing runtime seam: ${name}`);
    return match[0].replace(/^export /u, '');
}

function stateWithFacts() {
    const state = defaultState();
    state.scene.status = 'The merchant has left for her delivery.';
    state.causalContext = { inject: true, conditions: [{
        id: 'merchant', kind: 'actor', subject: 'The merchant', condition: 'is away making a delivery',
        disclosure: 'open', confidence: 'established', relevance: 'Her shop is closed.',
    }] };
    return state;
}

test('permanent rules are lean, genre-neutral, and require meaningful change even during inactivity', () => {
    const payload = buildPromptPayload(defaultState());
    assert.ok(payload.includes(GAME_MASTER_CONTRACT));
    for (const rule of [
        /without awaiting player direction/,
        /freedom to engage or disengage/,
        /Every reply changes the current situation meaningfully, even during rest or inactivity/,
        /lasting change in circumstances, understanding, relationships, or possibilities/,
        /not repetitive description/,
        /quiet progress needs no interruption or new conflict/,
        /Leave room for meaningful player decisions/,
        /Never author the player character's choices/,
        /within viewpoint knowledge/,
        /time passage proportionate to the player's action/,
        /Explicit user\/OOC instructions and established facts take priority/,
    ]) assert.match(payload, rule);
    assert.equal(payload.match(/GAME MASTER RESPONSIBILITY/g)?.length, 1);
    assert.ok(GAME_MASTER_CONTRACT.split(/\s+/u).length <= 160, 'Permanent rules must stay concise');
    assert.ok(estimateTokenCount(GAME_MASTER_CONTRACT) < 320, 'Permanent policy must remain bounded');
    assert.doesNotMatch(payload, /fleeing|enemy|combat|replacement hooks|punishment|reset availability|world-stall/i);
});

test('detailed behavior checks stay in the private planner rather than the story injection', () => {
    const payload = buildPromptPayload(stateWithFacts(), { guidanceUsable: true });
    for (const detail of [/replacement hooks/, /rigid compulsory availability/, /unsupported time skips/, /sleep, rest, or routine/, /decorative motion/]) {
        assert.match(AGENCY_AUDIT_RULE, detail);
        assert.doesNotMatch(payload, detail);
    }
    assert.ok(!payload.includes(PLANNER_AGENCY_RULE));
    assert.ok(!payload.includes(ACTOR_AGENCY_RULE));
    assert.ok(!payload.includes(AGENCY_AUDIT_RULE));
});

test('fresh facts augment rules; unavailable facts never leak through a rules-only snapshot', () => {
    const state = stateWithFacts();
    const stale = guidanceSnapshot(state);
    assert.equal(stale.dynamicContextIncluded, false);
    assert.deepEqual(stale.causalContext.conditions, []);
    assert.equal(stale.sceneProfile.promise, '');
    const fresh = buildPromptPayload(state, { guidanceUsable: true });
    assert.match(fresh, /The merchant is away making a delivery/);
    assert.equal(fresh.match(/GAME MASTER RESPONSIBILITY/g)?.length, 1);
    assert.doesNotMatch(buildPromptPayload(state), /merchant|delivery/);
});

test('disabled, quiet, and impersonation requests contain no GM rules', () => {
    const state = stateWithFacts();
    for (const generationType of ['quiet', 'impersonate', 'tool-analysis']) {
        assert.equal(isStoryGeneration(generationType), false);
        assert.equal(buildPromptPayload(state, { generationType, guidanceUsable: true }), '');
    }
    for (const generationType of ['', 'normal', 'swipe', 'regenerate', 'continue']) {
        assert.ok(buildPromptPayload(defaultState(), { generationType }).includes(GAME_MASTER_CONTRACT));
    }
    assert.equal(buildPromptPayload(state, { enabled: false, guidanceUsable: true }), '');
});

test('both planner passes retain agency and actor memory instructions in their fixed envelopes', () => {
    for (const system of [SYSTEM, INCREMENTAL_SYSTEM]) {
        assert.ok(system.includes(PLANNER_AGENCY_RULE));
        assert.ok(system.includes(ACTOR_AGENCY_RULE));
    }
    for (const contract of [ANALYSIS_OUTPUT_CONTRACT, INCREMENTAL_ANALYSIS_OUTPUT_CONTRACT]) {
        assert.ok(contract.includes(AGENCY_AUDIT_RULE));
    }
    const prompt = buildAnalysisPrompt([{ is_user: true, mes: 'I observe.' }], defaultState(), '', {}, { incremental: true, maxPromptTokens: 6000, effectivePromptTokens: 1000 });
    assert.ok(JSON.parse(prompt).messages.some(item => item.content === 'I observe.'));
    // Small prompts may shed repeated rules, but cannot remove their fixed
    // system/output counterparts or require a special observation keyword.
    assert.doesNotMatch(source, /latestUserAction\.match\([^\n]*observe/);
});

test('rules-only replacement stays rules-only despite newly available planner facts', () => {
    const messages = [{ is_user: true, mes: 'I observe.' }, { is_user: false, mes: 'The merchant closes her shop.' }];
    const state = stateWithFacts();
    const archived = {
        status: 'confirmed', injectionDecision: 'inject', dynamicContextIncluded: false,
        guidanceBlock: buildPromptPayload(defaultState()), chatId: 'story',
        sourceFingerprint: fingerprintMessages(messages.slice(0, 1)), responseMessageCount: 2,
        ...guidanceSnapshot(state),
    };
    state.lastRequestVerification = archived;
    const sandbox = {
        currentContext: () => ({ chat: messages, getCurrentChatId: () => 'story' }),
        messagesFromChat: value => value, generationRetrySource, isReplacementVerificationCurrent,
        hasUsableCausalContext, isDirectionCurrent: () => true, isGuidanceUsable: () => true,
        selectSituationalOpenings: () => [], sampleDirectorSignals: () => ({}), generationGuideSelection: null,
    };
    vm.runInNewContext(runtimeFunction('prepareGenerationGuide'), sandbox);
    sandbox.prepareGenerationGuide(state, 'swipe');
    assert.equal(sandbox.generationGuideSelection.usable, false);
    assert.equal(buildPromptPayload(state, { guidanceUsable: sandbox.generationGuideSelection.usable }), archived.guidanceBlock);
    const saved = loadState(JSON.parse(JSON.stringify(saveState({}, state))));
    assert.equal(saved.lastRequestVerification.dynamicContextIncluded, false);
    assert.deepEqual(saved.lastRequestVerification.causalContext.conditions, []);
});

test('a fresh archived causal slice is reused, not facts from discarded prose', () => {
    const messages = [{ is_user: true, mes: 'I observe.' }, { is_user: false, mes: 'Discarded prose.' }];
    const state = stateWithFacts();
    state.lastRequestVerification = {
        status: 'confirmed', injectionDecision: 'inject', guidanceBlock: 'verified', chatId: 'story',
        sourceFingerprint: fingerprintMessages(messages.slice(0, 1)), responseMessageCount: 2,
        ...guidanceSnapshot(state, { guidanceUsable: true }),
    };
    state.causalContext = { ...state.causalContext, conditions: [{ ...state.causalContext.conditions[0], condition: 'has returned in discarded prose' }] };
    const sandbox = {
        currentContext: () => ({ chat: messages, getCurrentChatId: () => 'story' }),
        messagesFromChat: value => value, generationRetrySource, isReplacementVerificationCurrent,
        hasUsableCausalContext, isDirectionCurrent, isGuidanceUsable,
        selectSituationalOpenings: () => [], sampleDirectorSignals: () => ({}), generationGuideSelection: null,
    };
    vm.runInNewContext(runtimeFunction('prepareGenerationGuide'), sandbox);
    sandbox.prepareGenerationGuide(state, 'regenerate');
    assert.equal(sandbox.generationGuideSelection.usable, true);
    const payload = buildPromptPayload(state, { guidanceUsable: true, ...sandbox.generationGuideSelection });
    assert.match(payload, /away making a delivery/);
    assert.doesNotMatch(payload, /returned in discarded prose/);
});

test('request verification archives rules-only scope rather than stale state', () => {
    const state = stateWithFacts();
    let metadata = saveState({}, state);
    const context = {
        chat: [{ is_user: true, mes: 'I observe.' }], getCurrentChatId: () => 'story',
        get chatMetadata() { return metadata; }, updateChatMetadata: value => { metadata = value; },
    };
    const sandbox = {
        extractTaleFairyContext, currentContext: () => context, messagesFromChat: value => value,
        getSettings: () => ({ injectionPosition: 'at-depth', injectionRole: 'user', injectionDepth: 1 }),
        loadState, saveState, guidanceSnapshot, guideSelectionOptions: () => ({ guidanceUsable: false }),
        generationRetrySource, fingerprintMessages, generationGuideSelection: null, pendingRequestVerification: null,
        RUNTIME_VERSION: 'test', verificationFingerprint: () => 'proof', sampleDirectorSignals: () => ({}),
        cacheProviderBoundVerification: () => {}, renderBoard: () => {}, scheduleVerificationPersistence: () => {},
    };
    vm.runInNewContext(runtimeFunction('rememberVerifiedRequest'), sandbox);
    const payload = buildPromptPayload(state);
    sandbox.rememberVerifiedRequest(payload);
    const archived = loadState(metadata).lastRequestVerification;
    assert.equal(archived.guidanceBlock, payload);
    assert.equal(archived.dynamicContextIncluded, false);
    assert.deepEqual(archived.causalContext.conditions, []);
});

test('normal to quiet to normal interceptor clears host prompts without AI calls', async () => {
    let payload = '';
    const sandbox = {
        activeGenerationType: '', currentContext: () => ({ chatMetadata: {} }),
        getSettings: () => ({ enabled: true }), loadState, isStoryGeneration,
        updatePrompt: state => { payload = buildPromptPayload(state, { generationType: sandbox.activeGenerationType }); },
        prepareAuthorContract: state => state, prepareGenerationGuide: () => {}, renderBoard: () => {},
    };
    vm.runInNewContext(runtimeFunction('livingWorldGuideGenerateInterceptor'), sandbox);
    for (const type of ['normal', 'quiet', 'impersonate', 'normal']) {
        await sandbox.livingWorldGuideGenerateInterceptor([], 0, () => {}, type);
        assert.equal(Boolean(payload), isStoryGeneration(type));
    }
});

test('final request hooks remove GM material from quiet/impersonation and leave planner requests alone', () => {
    const stale = buildPromptPayload(stateWithFacts(), { guidanceUsable: true });
    const marker = source.match(/const INTERNAL_PLANNER_MARKER = '([^']+)'/)[1];
    let proofs = 0;
    const sandbox = {
        activeGenerationType: 'normal', currentGuidancePayload: type => buildPromptPayload(defaultState(), { generationType: type }),
        containsPlannerMarker: value => requestContainsMarker(value, marker),
        requestInjectionOptions: () => ({ role: 'user', depth: 1, inlineLatestUser: true }),
        ensureGuidanceInChat, ensureGuidanceInText, chatHasCurrentGuidance, textHasCurrentGuidance, extractTaleFairyContext,
        rememberVerifiedRequest: () => { proofs++; }, recordRuntimeStage: () => {}, renderAnalysisActivity: () => {},
        currentContext: () => ({ mainApi: 'test' }), reportNonBlockingInjectionFailure: message => assert.fail(message),
    };
    vm.runInNewContext(['ensureChatCompletionRequestGuidance', 'ensureProviderChatRequestGuidance', 'ensureTextCompletionRequestGuidance'].map(runtimeFunction).join('\n'), sandbox);
    for (const type of ['quiet', 'impersonate']) {
        const chat = [{ role: 'user', content: `${stale}\nI observe.` }];
        sandbox.ensureChatCompletionRequestGuidance({ type, chat });
        assert.doesNotMatch(JSON.stringify(chat), /tale-fairy-context/);
        const request = { type, messages: [{ role: 'user', content: `${stale}\nI observe.` }] };
        sandbox.ensureProviderChatRequestGuidance(request);
        assert.doesNotMatch(JSON.stringify(request), /tale-fairy-context/);
        const textRequest = { type, prompt: `${stale}\nI observe.` };
        sandbox.ensureTextCompletionRequestGuidance(textRequest);
        assert.doesNotMatch(textRequest.prompt, /tale-fairy-context/);
    }
    const planner = { type: 'normal', messages: [{ role: 'system', content: marker }, { role: 'user', content: 'Return JSON.' }] };
    const original = JSON.stringify(planner);
    sandbox.ensureProviderChatRequestGuidance(planner);
    assert.equal(JSON.stringify(planner), original);
    assert.equal(proofs, 0);
    const story = { type: 'normal', messages: [{ role: 'user', content: 'I observe.' }] };
    sandbox.ensureProviderChatRequestGuidance(story);
    sandbox.ensureProviderChatRequestGuidance(story);
    assert.equal(JSON.stringify(story).match(/GAME MASTER RESPONSIBILITY/g)?.length, 1);
    assert.equal(proofs, 2);
});

test('rules-only injection replaces stale material exactly once across chat roles and text', () => {
    const stale = buildPromptPayload(stateWithFacts(), { guidanceUsable: true });
    const rules = buildPromptPayload(defaultState());
    for (const role of ['user', 'system', 'assistant']) {
        const chat = [{ role: 'user', content: `${stale}\nI observe.` }];
        const options = { role, depth: 1, inlineLatestUser: role === 'user' };
        ensureGuidanceInChat(chat, rules, options);
        ensureGuidanceInChat(chat, rules, options);
        assert.equal(chatHasCurrentGuidance(chat, rules), true);
        assert.equal(JSON.stringify(chat).match(/GAME MASTER RESPONSIBILITY/g)?.length, 1);
        assert.doesNotMatch(JSON.stringify(chat), /merchant|delivery/);
        ensureGuidanceInChat(chat, '', options);
        assert.doesNotMatch(JSON.stringify(chat), /tale-fairy-context/);
        assert.match(JSON.stringify(chat), /I observe/);
    }
    let text = ensureGuidanceInText(`${stale}\nI observe.`, rules);
    text = ensureGuidanceInText(text, rules);
    assert.equal(textHasCurrentGuidance(text, rules), true);
    assert.doesNotMatch(text, /merchant|delivery/);
    assert.equal(text.match(/GAME MASTER RESPONSIBILITY/g)?.length, 1);
});

function transportHarness() {
    const marker = source.match(/const INTERNAL_PLANNER_MARKER = '([^']+)'/)[1];
    const settings = { enabled: true };
    const requests = [];
    const proofs = [];
    const sandbox = {
        URL, activeGenerationType: 'normal', generationGuideSelection: { chatId: 'story' },
        PLANNER_BACKEND_PATHS: new Set(['/api/backends/chat-completions/generate', '/api/backends/text-completions/generate']),
        currentContext: () => ({ getCurrentChatId: () => 'story', mainApi: 'test' }),
        getSettings: () => settings, isStoryGeneration,
        containsPlannerMarker: value => requestContainsMarker(value, marker),
        currentGuidancePayload: generationType => buildPromptPayload(defaultState(), { generationType, enabled: settings.enabled }),
        ensureGuidanceInChat, ensureGuidanceInText, extractTaleFairyContext,
        requestInjectionOptions: () => ({ role: 'user', depth: 1, inlineLatestUser: true }),
        plannerNativeFetch: async (input, init) => { requests.push({ input, init }); return 'provider-response'; },
        rememberVerifiedRequest: block => proofs.push(block), rememberSkippedRequest: () => assert.fail('Unexpected skip'),
        recordRuntimeStage: () => {}, renderAnalysisActivity: () => {}, queueMicrotask: callback => callback(),
        reportNonBlockingInjectionFailure: message => assert.fail(message),
    };
    vm.runInNewContext(runtimeFunction('installDetachedPlannerTransport'), sandbox);
    sandbox.installDetachedPlannerTransport();
    return { sandbox, settings, requests, proofs, marker };
}

test('final fetch boundary cannot re-add GM rules to non-story or disabled requests', async () => {
    const { sandbox, settings, requests, proofs } = transportHarness();
    const stale = buildPromptPayload(stateWithFacts(), { guidanceUsable: true });
    for (const type of ['quiet', 'impersonate', 'tool-analysis', 'normal', 'swipe', 'regenerate', 'continue']) {
        for (const textApi of [false, true]) {
            const body = textApi ? { type, prompt: `${stale}\nI observe.` } : { type, messages: [{ role: 'user', content: `${stale}\nI observe.` }] };
            const response = await sandbox.fetch(`/api/backends/${textApi ? 'text' : 'chat'}-completions/generate`, { body: JSON.stringify(body) });
            assert.equal(response, 'provider-response');
            const outbound = requests.at(-1).init.body;
            assert.equal(Boolean(extractTaleFairyContext(JSON.parse(outbound))), isStoryGeneration(type));
            assert.doesNotMatch(outbound, /merchant|delivery/);
            assert.match(outbound, /I observe/);
            if (isStoryGeneration(type)) assert.equal(outbound.match(/GAME MASTER RESPONSIBILITY/g)?.length, 1);
        }
    }
    assert.equal(proofs.length, 8, 'Only four story types across two APIs should be verified');
    settings.enabled = false;
    await sandbox.fetch('/api/backends/chat-completions/generate', { body: JSON.stringify({ type: 'normal', messages: [{ role: 'user', content: `${stale}\nI observe.` }] }) });
    assert.doesNotMatch(requests.at(-1).init.body, /tale-fairy-context/);
    assert.equal(proofs.length, 8);
});

test('final fetch uses generation scope for typeless requests without touching planner/unrelated requests', async () => {
    const { sandbox, requests, proofs, marker } = transportHarness();
    const url = '/api/backends/text-completions/generate';
    const init = { body: JSON.stringify({ prompt: 'I observe.' }) };
    for (const activeType of ['normal', 'quiet', 'impersonate']) {
        sandbox.activeGenerationType = activeType;
        await sandbox.fetch(url, init);
        assert.equal(Boolean(extractTaleFairyContext(JSON.parse(requests.at(-1).init.body))), isStoryGeneration(activeType));
    }
    sandbox.activeGenerationType = 'normal';
    sandbox.generationGuideSelection = null;
    await sandbox.fetch(url, init);
    assert.equal(requests.at(-1).init, init, 'No active selection means no inferred roleplay request');
    sandbox.generationGuideSelection = { chatId: 'another-chat' };
    await sandbox.fetch(url, init);
    assert.equal(requests.at(-1).init, init);
    sandbox.generationGuideSelection = { chatId: 'story' };
    const planner = { body: JSON.stringify({ type: 'normal', prompt: `${marker}\nReturn JSON.` }) };
    await sandbox.fetch(url, planner);
    assert.equal(requests.at(-1).init, planner);
    await sandbox.fetch('/api/unrelated', init);
    assert.equal(requests.at(-1).init, init);
    const malformed = { body: '{bad json' };
    await sandbox.fetch(url, malformed);
    assert.equal(requests.at(-1).init, malformed);
    assert.equal(proofs.length, 1);
});
