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
    assert.equal(manifest.version, '0.11.131');
    assert.equal(manifest.js, 'extension/index.js?v=0.11.131');
    assert.equal(manifest.css, 'extension/style.css?v=0.11.131');
    assert.match(manifest.description, /always-on adaptive story director/i);
    assert.equal(pluginPackage.version, manifest.version);
    assert.match(pluginSource, /const VERSION = '0\.11\.131'/);
    assert.match(source, /const RUNTIME_VERSION = '0\.11\.131'/);
});

test('extension loads v131 adaptive-director modules', () => {
    assert.match(source, /from '\.\/analysis\.js\?v=0\.11\.131'/);
    assert.match(source, /from '\.\/state\.js\?v=0\.11\.131'/);
    assert.match(source, /from '\.\/request-injection\.js\?v=0\.11\.131'/);
    assert.match(source, /from '\.\/director-sampling\.js\?v=0\.11\.131'/);
    assert.match(stateSource, /from '\.\/beat-director\.js\?v=0\.11\.131'/);
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
    assert.match(source, /Proof fingerprint:/);
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
    assert.match(source, /INCLUDED — exact context verified in the outbound request/);
});

test('obsolete pacing selector and pacing ceiling are absent while player agency is protected', () => {
    assert.doesNotMatch(template, /data-setting="pacing"|Scene pacing/);
    assert.doesNotMatch(source, /updatePacing|data-setting="pacing"/);
    assert.doesNotMatch(directorSource, /USER-CONTROLLED PACING|maximum time, activity, and player progress/i);
    assert.match(directorSource, /Scene progression and transitions are allowed/i);
    assert.match(directorSource, /Never invent the player character/i);
});

test('adaptive analysis uses freeform direction rather than an event taxonomy', () => {
    assert.match(analysisSource, /contract_version=3/);
    assert.match(analysisSource, /adaptive narrative director/i);
    assert.match(analysisSource, /not an event taxonomy/i);
    assert.match(analysisSource, /other context-compatible movement/i);
    assert.match(analysisSource, /countries, societies, and worlds/i);
    assert.match(analysisSource, /operation.*other/);
    assert.match(stateSource, /export const STATE_VERSION = 46/);
    assert.match(stateSource, /beatContractUpgrade/);
});

test('provider injection uses the analyzed beat or a non-blocking live policy', () => {
    assert.match(stateSource, /formatBeatContract/);
    assert.match(stateSource, /formatFreshBeatFallback/);
    assert.match(source, /buildPromptPayload\(state/);
    assert.match(source, /sceneProfile: generationGuideSelection\.sceneProfile/);
    assert.match(source, /beatDirective: generationGuideSelection\.beatDirective/);
    assert.match(source, /ensureGuidanceInChat/);
    assert.match(source, /ensureGuidanceInText/);
    assert.match(source, /CHAT_COMPLETION_PROMPT_READY/);
    assert.match(source, /GENERATE_AFTER_COMBINE_PROMPTS/);
    assert.match(source, /extractTaleFairyContext\(request\)/);
});

test('replacement generation archives semantic direction and the exact weighted sample', () => {
    assert.match(source, /const archived = replacement \? state\.lastRequestVerification : null/);
    assert.match(source, /archived\?\.beatDirective/);
    assert.match(source, /sceneProfile: archivedUsable \? archived\.sceneProfile/);
    assert.match(source, /beatDirective: archivedUsable \? archived\.beatDirective/);
    assert.match(source, /archived\?\.directorSample/);
    assert.match(source, /archived\?\.directorSeed/);
    assert.match(directorSource, /reuse this weighted sample and directorial purpose/i);
    assert.doesNotMatch(source, /\(previousIndex \+ 1\) % candidates\.length/);
});

test('rapid-fire turns do not wait for a new planner call', () => {
    assert.match(directorSource, /TALE FAIRY — LIVE ADAPTIVE DIRECTOR/);
    assert.match(schedulerSource, /replacement response reuses the archived semantic beat and never spends a planner call/i);
    assert.match(source, /void analyzeNow\(/);
    assert.doesNotMatch(directorSource, /delivery debt|release condition|event queue/i);
});

test('planner output is lightweight while retaining structured-output negotiation', () => {
    assert.match(source, /const PLANNER_RESPONSE_TOKENS = 4096/);
    assert.match(source, /mode === PLANNER_OUTPUT_MODE\.JSON_SCHEMA \? \{ json_schema: ANALYSIS_SCHEMA \} : \{\}/);
    assert.match(source, /plannerMessages\(PLANNER_SYSTEM_PROMPT, prompt, ANALYSIS_SCHEMA, mode\)/);
    assert.match(source, /PLANNER_MAX_AUTO_RETRIES = 2/);
});

test('scratchpad exposes adaptive direction without misleading dormant triggers', () => {
    assert.match(template, /Last provider-bound injection \(exact\)/);
    assert.ok(template.indexOf('Last provider-bound injection (exact)') < template.indexOf('<h5>Current scene</h5>'));
    assert.match(template, />Adaptive direction</);
    assert.match(template, /weighted creative appetite/i);
    assert.match(template, />Continuity evidence</);
    assert.match(template, /never dormant triggers, delivery promises, or a scheduled event queue/i);
    assert.doesNotMatch(source, /\[\$\{item\.status \|\| 'dormant'\}\]/);
    assert.doesNotMatch(template, /Conditional pathways|Plan horizons|Private idea bank|Private causal events|Durable directions/);
    assert.match(source, /function renderBoard/);
    assert.match(source, /state\.sceneProfile/);
    assert.match(source, /state\.beatDirective/);
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
