import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../extension/index.js', import.meta.url), 'utf8');
const stateSource = await readFile(new URL('../extension/state.js', import.meta.url), 'utf8');
const analysisSource = await readFile(new URL('../extension/analysis.js', import.meta.url), 'utf8');
const directorSource = await readFile(new URL('../extension/beat-director.js', import.meta.url), 'utf8');
const schedulerSource = await readFile(new URL('../extension/planner-scheduler.js', import.meta.url), 'utf8');
const template = await readFile(new URL('../extension/settings.html', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const pluginPackage = JSON.parse(await readFile(new URL('../plugin/package.json', import.meta.url), 'utf8'));
const pluginSource = await readFile(new URL('../plugin/index.js', import.meta.url), 'utf8');

test('manifest and detached plugin identify the adaptive-director release', () => {
    assert.equal(manifest.version, '0.11.150');
    assert.equal(manifest.js, 'extension/index.js?v=0.11.150');
    assert.equal(manifest.css, 'extension/style.css?v=0.11.150');
    assert.match(manifest.description, /always-on adaptive story director/i);
    assert.equal(pluginPackage.version, manifest.version);
    assert.match(pluginSource, /const VERSION = '0\.11\.150'/);
    assert.match(source, /const RUNTIME_VERSION = '0\.11\.150'/);
});

test('extension loads v150 persistent-guidance-view modules', () => {
    assert.match(source, /from '\.\/analysis\.js\?v=0\.11\.150'/);
    assert.match(source, /from '\.\/state\.js\?v=0\.11\.150'/);
    assert.match(source, /from '\.\/request-injection\.js\?v=0\.11\.150'/);
    assert.match(source, /from '\.\/director-sampling\.js\?v=0\.11\.150'/);
    assert.match(stateSource, /from '\.\/beat-director\.js\?v=0\.11\.150'/);
});

test('long-form defaults reserve room for current turns, summaries, and thinking', () => {
    assert.match(source, /recentContextTokens: 6000/);
    assert.match(source, /maxPromptTokens: 16000/);
    assert.match(source, /summaryContextTokens: 4000/);
    assert.match(source, /contextSettingsVersion: 11/);
    assert.match(source, /recentContextTokens\) === 4000.*recentContextTokens = 6000/);
    assert.match(source, /maxPromptTokens\) === 12000.*maxPromptTokens = 16000/);
    assert.match(analysisSource, /DEFAULT_PROMPT_TOKEN_BUDGET = 16000/);
    assert.match(analysisSource, /Math\.min\(30000, Number\(options\.maxPromptTokens\)/);
    assert.match(template, /Summary retrieval pool \(tokens\)/);
    assert.match(template, /separately reserves up to 4,096 output\/thinking tokens/i);
});

test('depth one is the default and injection proof cannot block roleplay generation', () => {
    assert.match(source, /injectionDepth: 1/);
    assert.match(source, /injectionDepth\) === 2[\s\S]*settings\.injectionDepth = 1/);
    assert.match(template, /0 = newest edge; default 1/);
    assert.match(source, /verificationFingerprint\(guidanceBlock\)/);
    assert.match(source, /state\.lastRequestVerification = verification/);
    assert.doesNotMatch(source, /await rememberVerifiedRequest/);
    assert.match(source, /scheduleVerificationPersistence\(context\)/);
    assert.match(source, /Tale Fairy plans to inject this exact context/);
    assert.match(source, /savedState\.lastRequestVerification\?\.status === 'included'/);
    assert.match(source, /ensureGuidanceInChat\(request\.messages, payload/);
    assert.match(source, /request\.prompt = ensureGuidanceInText\(request\.prompt, payload\)/);
    assert.match(source, /outboundInit = \{ \.\.\.init, body: JSON\.stringify\(request\) \}/);
    assert.match(source, /guidanceBlock = extractTaleFairyContext\(JSON\.parse\(outboundInit\.body\)\)/);
    assert.match(source, /rememberVerifiedRequest\(guidanceBlock,[\s\S]*recordRuntimeStage\('provider-bound-proof-saved'/);
    assert.match(source, /s\.lastProviderBoundVerification = verification/);
    assert.match(source, /newestProviderBoundVerification\([\s\S]*cachedProviderBoundVerification\(chatId\)/);
    assert.match(source, /cacheProviderBoundVerification\(state\.lastRequestVerification\)/);
    assert.match(source, /const response = plannerNativeFetch\(input, outboundInit\);[\s\S]*queueMicrotask/);
    assert.ok(source.indexOf("recordRuntimeStage('provider-bound-proof-saved'") < source.indexOf('const response = plannerNativeFetch(input, outboundInit)'));
    assert.match(source, /No Tale Fairy work is awaited and no verification failure can[\s\S]*reject the provider request/);
    assert.match(source, /Passive injection verification failed without affecting generation/);
    assert.match(source, /Injection observed after network dispatch/);
    assert.doesNotMatch(source, /blocked this roleplay request because its context was missing/);
    assert.match(source, /taleFairyNativeFetch/);
    assert.match(source, /reportNonBlockingInjectionFailure/);
    assert.match(source, /Generation will continue without Tale Fairy blocking it/);
    assert.match(source, /Injection verified in the final provider payload/);
    assert.match(source, /recordRuntimeStage\('runtime-loaded'\)/);
    assert.match(source, /recordRuntimeStage\('generation-started'/);
    assert.match(source, /recordRuntimeStage\('final-provider-payload'/);
    assert.match(source, /recordRuntimeStage\('network-dispatched'/);
    assert.match(source, /s\.runtimeDiagnostics = \[\.\.\.\(Array\.isArray\(s\.runtimeDiagnostics\)/);
    assert.match(source, /recordRuntimeStage\('generation-ended'\)/);
    assert.match(source, /CURRENT GENERATION REQUEST/);
});

test('obsolete pacing selector and static provider boilerplate are absent', () => {
    assert.doesNotMatch(template, /data-setting="pacing"|Scene pacing/);
    assert.doesNotMatch(source, /updatePacing|data-setting="pacing"/);
    assert.doesNotMatch(directorSource, /USER-CONTROLLED PACING|maximum time, activity, and player progress/i);
    assert.doesNotMatch(directorSource, /Use the analyzed beat only|Never invent the player character/i);
    assert.match(analysisSource, /Never invent player dialogue, thoughts, feelings, consent, decisions/i);
});

test('adaptive analysis uses freeform direction rather than an event taxonomy', () => {
    assert.match(analysisSource, /contract_version=3/);
    assert.match(analysisSource, /adaptive narrative director/i);
    assert.match(analysisSource, /not an event taxonomy/i);
    assert.match(analysisSource, /other context-compatible movement/i);
    assert.match(analysisSource, /countries, societies, and worlds/i);
    assert.match(analysisSource, /operation: text\(80\)/);
    assert.doesNotMatch(analysisSource, /beat\.operation': \[/);
    assert.match(analysisSource, /sends only the freely chosen movement description and non-default abstract scale classifications downstream/i);
    assert.match(analysisSource, /required_effect, target, inject_reason, preserve, forbid, scene promise, basis, audit, response_audit, response pattern memory, retained evidence, canon records, and user-note records remain private/i);
    assert.match(stateSource, /export const STATE_VERSION = 49/);
    assert.match(stateSource, /beatContractUpgrade/);
});

test('provider injection uses only an analyzed beat and otherwise removes stale guidance', () => {
    assert.match(stateSource, /formatBeatContract/);
    assert.doesNotMatch(stateSource, /formatFreshBeatFallback/);
    assert.match(stateSource, /if \(!enabled \|\| !guidanceUsable\) return ''/);
    assert.match(source, /buildPromptPayload\(state/);
    assert.match(source, /sceneProfile: generationGuideSelection\.sceneProfile/);
    assert.match(source, /beatDirective: generationGuideSelection\.beatDirective/);
    assert.match(source, /ensureGuidanceInChat/);
    assert.match(source, /ensureGuidanceInText/);
    assert.match(source, /CHAT_COMPLETION_PROMPT_READY/);
    assert.match(source, /GENERATE_AFTER_COMBINE_PROMPTS/);
    assert.match(source, /guidanceBlock = extractTaleFairyContext\(JSON\.parse\(outboundInit\.body\)\)/);
    assert.match(source, /rememberSkippedRequest/);
    assert.match(source, /provider-bound-skip-saved/);
    assert.match(pluginSource, /\[2, 3\]\.includes\(value\.contract_version\)/);
});

test('replacement generation archives semantic direction and the exact weighted sample', () => {
    assert.match(source, /const archived = replacement \? state\.lastRequestVerification : null/);
    assert.match(source, /archived\?\.beatDirective/);
    assert.match(source, /sceneProfile: \(archivedUsable \|\| archivedSkipped\) \? archived\.sceneProfile/);
    assert.match(source, /beatDirective: \(archivedUsable \|\| archivedSkipped\) \? archived\.beatDirective/);
    assert.match(source, /archived\?\.directorSample/);
    assert.match(source, /archived\?\.directorSeed/);
    assert.match(source, /const replacementMessages = generationRetrySource\(messages, replacement\)/);
    assert.match(source, /const currentGuidanceUsable = isGuidanceUsable\(state, replacementMessages, chatId\)/);
    assert.match(source, /usable: archivedUsable \|\| currentGuidanceUsable/);
    assert.match(source, /isReplacementVerificationCurrent\(archived, messages, chatId\)/);
    assert.doesNotMatch(source, /currentBeatUsable|Boolean\(state\.lastInject/);
    assert.match(source, /generationRetrySource\(currentMessages, true\)/);
    assert.match(source, /Preparing exact regeneration direction/);
    assert.match(source, /allowOneAssistantAppend: currentMessages\.length === sourceMessages\.length \+ 1/);
    assert.doesNotMatch(directorSource, /For this regeneration|different realization|context-compatible development/i);
    assert.doesNotMatch(source, /\(previousIndex \+ 1\) % candidates\.length/);
});

test('rapid-fire turns consume guidance once and coalesce planner catch-up', () => {
    assert.doesNotMatch(directorSource, /NARRATIVE FLOW ONLY/);
    assert.match(schedulerSource, /replacement response reuses the archived semantic beat and never spends a planner call/i);
    assert.match(source, /function queueLatestAnalysis/);
    assert.match(source, /Planner active · latest turn queued/);
    assert.match(source, /decision\.shouldRun \|\| supersededIntent/);
    assert.match(source, /consumedCurrentGuide && !replacement/);
    assert.match(source, /revision !== generationRevision[\s\S]{0,160}acknowledgeDetachedPlannerRun/);
    assert.doesNotMatch(source, /MESSAGE_RECEIVED[\s\S]{0,180}cancelRunningAnalysis/);
    assert.doesNotMatch(directorSource, /delivery debt|release condition|event queue/i);
});

test('roleplay injection exposes abstract flow and scale, never private planner intent', () => {
    assert.doesNotMatch(stateSource, /<user-established-canon>|<tale-fairy-user-notes>/i);
    assert.doesNotMatch(directorSource, /PLANNER LEAN|WEIGHTED DIRECTOR SAMPLE|INTERVENTION_GUIDANCE|FORTUNE_GUIDANCE/i);
    assert.doesNotMatch(directorSource, /REQUIRED NARRATIVE EFFECT|CURRENT TARGET|SCENE PROMISE TO HONOR/);
    assert.match(directorSource, /PRIMARY NARRATIVE DIRECTION/);
    assert.match(directorSource, /This direction governs how the next response moves/);
    assert.doesNotMatch(directorSource, /movement=|content=|scope=|intensity=|plot weight=/i);
    assert.doesNotMatch(directorSource, /beat\.preserve|beat\.forbid/);
    assert.doesNotMatch(directorSource, /beat\.basis|scene\.basis/);
    assert.doesNotMatch(directorSource, /Treat explicit user\/OOC|Infer every concrete action|Do not expose/i);
    assert.match(source, /runtimeVersion: RUNTIME_VERSION/);
    assert.match(source, /item\?\.runtimeVersion === RUNTIME_VERSION/);
});

test('planner output is lightweight while retaining structured-output negotiation', () => {
    assert.match(source, /const PLANNER_RESPONSE_TOKENS = 16384/);
    assert.match(source, /mode === PLANNER_OUTPUT_MODE\.JSON_SCHEMA \? \{ json_schema: ANALYSIS_SCHEMA \} : \{\}/);
    assert.match(source, /plannerMessages\(PLANNER_SYSTEM_PROMPT, prompt, ANALYSIS_SCHEMA, mode\)/);
    assert.match(source, /PLANNER_MAX_AUTO_RETRIES = 2/);
});

test('scratchpad always shows upcoming or most recently used guidance without misleading dormant triggers', () => {
    assert.match(template, />Tale Fairy guidance</);
    assert.ok(template.indexOf('<h5>Tale Fairy guidance</h5>') < template.indexOf('<h5>Current scene</h5>'));
    assert.match(template, /upcoming exact direction when ready, otherwise the most recently used exact direction/i);
    assert.match(source, /const previewPayload = buildPromptPayload\(state, \{ enabled: getSettings\(\)\.enabled, \.\.\.previewOptions \}\)/);
    assert.match(source, /MOST RECENT USED DIRECTION/);
    assert.match(source, /historicalVerification\.guidanceBlock/);
    assert.match(source, /NEXT NORMAL GENERATION/);
    assert.match(source, /CURRENT REGENERATION REQUEST/);
    assert.match(template, />Adaptive direction</);
    assert.match(template, /Observed response effect \(private\)/);
    assert.match(template, /never injected and never triggers automatic regeneration/i);
    assert.match(template, /weighted creative appetite/i);
    assert.match(template, />Continuity evidence</);
    assert.match(template, /never dormant triggers, delivery promises, or a scheduled event queue/i);
    assert.match(template, /scratchpad-continuity-section" hidden/);
    assert.match(template, /scratchpad-entities-section" hidden/);
    assert.doesNotMatch(template, /Direction audit|No relevant continuity evidence|No generated entities or processes/);
    assert.match(source, /function scratchpadOptionalText/);
    assert.doesNotMatch(source, /\[\$\{item\.status \|\| 'dormant'\}\]/);
    assert.doesNotMatch(template, /Conditional pathways|Plan horizons|Private idea bank|Private causal events|Durable directions/);
    assert.match(source, /function renderBoard/);
    assert.match(source, /state\.sceneProfile/);
    assert.match(source, /state\.beatDirective/);
    assert.match(source, /state\.responseAudit/);
});

test('SillyTavern-compatible registration and detached planner transport remain intact', () => {
    assert.equal(manifest.loading_order, 65);
    assert.equal(manifest.generate_interceptor, 'livingWorldGuideGenerateInterceptor');
    assert.match(source, /globalThis\.livingWorldGuideGenerateInterceptor\s*=\s*livingWorldGuideGenerateInterceptor/);
    assert.match(source, /new MutationObserver\(attemptMount\)/);
    assert.match(source, /X-Tale-Fairy-Job-Id/);
    assert.match(source, /planner-jobs\/generate/);
    assert.match(pluginSource, /router\.post\('\/planner-jobs\/generate'/);
});

test('full rebuild and user-note controls preserve their safe lifecycle', () => {
    assert.match(source, /async function rebuildGuideState/);
    assert.match(source, /await resetState\(\{ rebuilding: true \}\)/);
    assert.match(source, /function stopAnalysis\(\)/);
    assert.match(source, /analysisAbortController\.abort/);
    assert.match(source, /note_resolution/);
    assert.match(template, /AI-assisted instruction/);
});
