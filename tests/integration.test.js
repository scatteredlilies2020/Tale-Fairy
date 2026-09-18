import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../extension/index.js', import.meta.url), 'utf8');
const stateSource = await readFile(new URL('../extension/state.js', import.meta.url), 'utf8');
const analysisSource = await readFile(new URL('../extension/analysis.js', import.meta.url), 'utf8');
const offscreenSource = await readFile(new URL('../extension/offscreen-world.js', import.meta.url), 'utf8');
const causalSource = await readFile(new URL('../extension/causal-context.js', import.meta.url), 'utf8');
const gmSource = await readFile(new URL('../extension/game-master.js', import.meta.url), 'utf8');
const schedulerSource = await readFile(new URL('../extension/planner-scheduler.js', import.meta.url), 'utf8');
const fallbackSource = await readFile(new URL('../extension/fallback-direction.js', import.meta.url), 'utf8');
const template = await readFile(new URL('../extension/settings.html', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const pluginPackage = JSON.parse(await readFile(new URL('../plugin/package.json', import.meta.url), 'utf8'));
const pluginSource = await readFile(new URL('../plugin/index.js', import.meta.url), 'utf8');

test('settings explanations stay concise', () => {
    const explanations = [...template.matchAll(/<small>([\s\S]*?)<\/small>/gu)].map(match => match[1]);
    assert.ok(explanations.length > 20);
    for (const explanation of explanations) {
        assert.ok(explanation.trim().split(/\s+/u).length <= 40, explanation);
        assert.doesNotMatch(explanation, /not a competing|not history|never injected|without making enemies/i);
    }
});

test('manifest, browser runtime, and detached plugin share the release version', () => {
    assert.equal(manifest.version, '0.14.30');
    assert.equal(manifest.js, 'extension/index.js?v=0.14.30');
    assert.equal(manifest.css, 'extension/style.css?v=0.14.30');
    assert.equal(pluginPackage.version, manifest.version);
    assert.match(pluginSource, /const VERSION = '0\.14\.30'/);
    assert.match(source, /const RUNTIME_VERSION = '0\.14\.30'/);
});

test('planner input proof travels through normal saves and detached recovery', () => {
    assert.match(source, /analysisSelection\.plotInputsKey = plotInputKey\(chatId, \[\], generationInputs\(context, current\)\)/);
    assert.match(source, /next\.analysisModel = analysisSelection/);
    assert.match(source, /next\.analysisModel = meta\.analysisSelection/);
    assert.match(pluginSource, /analysisSelection: suppliedMeta\.analysisSelection/);
});

test('planner and story context have separate visible status indicators', () => {
    assert.match(template, /Planner: <span data-role="analysis-status">/);
    assert.match(template, /Story context: <span data-role="injection-status">/);
    assert.match(template, /No request verified on this page/);
});

test('removed narrative mode has no dangling settings bindings', () => {
    assert.doesNotMatch(template, /data-setting="mode"/);
    assert.doesNotMatch(source, /data-setting="mode"/);
    assert.match(template, /Follow preset \(default\)/);
});

test('live and recovered planner results bound diagnostic prose before strict validation', () => {
    const parser = source.slice(source.indexOf('function parseAnalysisResponse('), source.indexOf('async function acknowledgeDetachedPlannerJob('));
    assert.match(parser, /normalizeAnalysisDiagnostics\(abstractIncrementalVisibleBranches\(rawResult\)\)/);
    assert.ok(parser.indexOf('normalizeAnalysisDiagnostics(') < parser.indexOf('validateAnalysisResult('));
    assert.match(parser, /transcriptHeadAlignmentErrors\(result, prompt\)/);
    assert.match(source, /parseAnalysisResponse\(job.text, alignmentPromptFromMeta\(meta\)\)/);
    assert.match(source, /parseAnalysisResponse\(value, prompt\)/);
    assert.match(source, /missingAnalysis \|\| 'No generated story frame yet\.'/);
    assert.match(source, /missingAnalysis \|\| 'No generated lore model yet\.'/);
});

test('roleplay injection never migrates the user default into a system message', () => {
    assert.match(source, /injectionRole:\s*DEFAULT_INJECTION_ROLE/);
    assert.doesNotMatch(source, /injectionRole\s*===\s*['"]user['"][^\n]*injectionRole\s*=\s*['"]system['"]/);
    assert.match(template, /<option value="user">User \(default\)<\/option>/);
    assert.match(template, /<option value="system">System<\/option>/);
    assert.match(template, /<option value="assistant">Assistant<\/option>/);
});

test('runtime uses causal context and deferred world state without prescriptive beat-director dependency', () => {
    assert.match(source, /from '\.\/causal-context\.js\?v=0\.14\.22'/);
    assert.match(stateSource, /from '\.\/causal-context\.js\?v=0\.14\.22'/);
    assert.doesNotMatch(source, /beat-director/);
    assert.doesNotMatch(stateSource, /beat-director/);
    assert.match(stateSource, /export const STATE_VERSION = 59/);
    assert.match(stateSource, /offscreenWorld/);
    assert.match(stateSource, /delete state\.beatDirective/);
});

test('planner contracts return active world conditions rather than future branches', () => {
    assert.match(analysisSource, /contract_version=12/);
    assert.match(analysisSource, /contract_version=13/);
    assert.match(analysisSource, /private creative GM/i);
    assert.match(analysisSource, /present causes only/i);
    assert.match(analysisSource, /world and updates contain factual state only/i);
    assert.match(analysisSource, /Explicit user\/OOC constraints and manifested consequences outrank proposals/i);
    assert.match(analysisSource, /deferred debt, not continuous ticking/i);
    assert.match(analysisSource, /Broad preparation may remain dormant/i);
    assert.match(analysisSource, /Keep unused possibilities/i);
    assert.match(offscreenSource, /scheduled arrival/i);
    assert.match(analysisSource, /transcript begins observation, not the world/i);
    assert.match(analysisSource, /Adapt to the RP/i);
    assert.match(analysisSource, /communities, settlements, organizations, institutions, resources, economies, infrastructure/i);
    assert.doesNotMatch(analysisSource, /one primary.*two.*alternatives/i);
});

test('provider context exposes only clean relevant conditions', () => {
    assert.match(causalSource, /RELEVANT UNDERLYING CONDITIONS/);
    assert.match(causalSource, /RELEVANT UNDERLYING CONDITIONS:/);
    assert.match(gmSource, /TALE FAIRY CONTEXT:'/);
    assert.doesNotMatch(gmSource, /Notebook proposals are not established history/i);
    assert.doesNotMatch(gmSource, /SELF-PROPELLING MOVEMENT|Every reply changes the current situation/i);
    assert.doesNotMatch(causalSource, /question|interrogat/i);
    assert.match(causalSource, /confidence !== 'tentative'/);
    assert.doesNotMatch(causalSource, /branchIndex|weighted random choice|NEXT-STEP EFFECT/);
    assert.match(stateSource, /formatCausalContext/);
    assert.match(stateSource, /if \(!enabled \|\| !isStoryGeneration\(generationType\)\) return ''/);
    assert.match(stateSource, /formatPacingPreference\(s\.pacing\.mode\)/);
});

test('generation archives and reuses the same causal slice for regeneration', () => {
    assert.match(source, /guidanceSnapshot\(state, guideSelectionOptions\(state, context\)\)/);
    assert.match(source, /payload, reused: true/);
    assert.doesNotMatch(source, /branchIndex|selectBeatBranchIndex/);
    const interceptor = source.slice(source.indexOf('export async function livingWorldGuideGenerateInterceptor'), source.indexOf('globalThis.livingWorldGuideGenerateInterceptor'));
    assert.doesNotMatch(interceptor, /await |analyzeNow\(/);
});

test('scratchpad rendering derives its request preview from defined live state', () => {
    assert.match(source, /const preparedSelection = generationGuideSelection\?\.chatId === chatId \? generationGuideSelection : null/);
    assert.doesNotMatch(source, /\bactiveSelection\b/);
});

test('failed planning supplies only transcript-grounded fallback conditions', () => {
    assert.match(fallbackSource, /causalContext/);
    assert.match(fallbackSource, /fallbackCausalConditions/);
    assert.match(fallbackSource, /authoritative transcript status/);
    assert.match(fallbackSource, /next\.lastInject = true/);
    assert.match(analysisSource, /beginning of observation, not the birth of the world/);
    assert.match(source, /allowValidationRepair: false/);
    assert.match(schedulerSource, /causalContext/);
});

test('SillyTavern interception and detached planner compatibility remain intact', () => {
    assert.equal(manifest.loading_order, 65);
    assert.equal(manifest.generate_interceptor, 'livingWorldGuideGenerateInterceptor');
    assert.match(source, /globalThis\.livingWorldGuideGenerateInterceptor\s*=\s*livingWorldGuideGenerateInterceptor/);
    assert.match(source, /CHAT_COMPLETION_PROMPT_READY/);
    assert.match(source, /GENERATE_AFTER_COMBINE_PROMPTS/);
    assert.match(source, /ensureGuidanceInChat/);
    assert.match(source, /ensureGuidanceInText/);
    assert.match(source, /X-Tale-Fairy-Job-Id/);
    assert.match(pluginSource, /router\.post\('\/planner-jobs\/generate'/);
    assert.match(pluginSource, /\[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14\]\.includes\(value\.contract_version\)/);
});

test('planner token budgets, retries, and nonblocking behavior remain compatible', () => {
    assert.match(source, /recentContextTokens: 6000/);
    assert.match(source, /maxPromptTokens: 16000/);
    assert.match(source, /plannerBudgets\(s, \{ bootstrapScan, fullContextPass \}\)/);
    assert.match(source, /routineInputTokens = normalizeInputBudget/);
    assert.match(source, /reviewInputTokens = normalizeInputBudget/);
    assert.match(template, /data-setting="routine-budget"/);
    assert.match(template, /data-setting="review-budget"/);
    assert.ok(source.indexOf('lastSummaryAudit = plannerEvidenceAudit(plannerPrompt') > source.indexOf('const plannerPrompt = await buildTokenBudgetedAnalysisPrompt'));
    assert.match(source, /const INCREMENTAL_RESPONSE_TOKENS = 4096/);
    assert.match(source, /const REVIEW_RESPONSE_TOKENS = 6144/);
    assert.match(source, /bootstrapScan \? REBUILD_RESPONSE_TOKENS : REVIEW_RESPONSE_TOKENS/);
    const requestTier = source.slice(source.indexOf('async function requestAnalysis('), source.indexOf('export async function analyzeNow('));
    assert.match(requestTier, /reasoningMode: 'off'/, 'replacement disables optional thinking');
    assert.match(source, /cacheNamespace: 'analysis-world-v14'/);

    assert.match(source, /fullReview: fullContextPass && \[8, 9, 12, 14\]\.includes\(result\.contract_version\)/);
    assert.match(source, /fullReview: meta\.fullContextPass === true && \[8, 9, 12, 14\]\.includes\(result\.contract_version\)/);
    assert.match(source, /const REBUILD_RESPONSE_TOKENS = 8192/);
    assert.match(source, /PLANNER_MAX_AUTO_RETRIES = 0/);
    assert.match(source, /No Tale Fairy work is awaited and no verification failure can[\s\S]*reject the provider request/);
    assert.match(source, /Generation will continue without Tale Fairy blocking it/);
});

test('settings describe private simulation and causal injection without branch controls', () => {
    assert.match(template, /World and future preparation/i);
    assert.match(template, /causal context|underlying conditions/i);
    assert.match(template, /prepares story context and possible developments at the current scale/i);
    assert.doesNotMatch(template, /competing GM policy|not history or mandatory|adapts its causal units/i);
    assert.doesNotMatch(template, /one primary NPC\/world response and two redirect-safe alternatives/i);
    assert.doesNotMatch(template, /one compatible external branch/i);
    assert.match(template, /data-setting="pacing"/);
});

test('Continuity remains optional one-way evidence rather than an authority dependency', () => {
    assert.match(template, /Reads Continuity's current same-chat snapshot privately for planning/i);
    const binding = source.slice(source.indexOf('function bindContinuityBridge'), source.indexOf('// The generation interceptor runs'));
    assert.match(binding, /bridge\.subscribe\(snapshot/);
    assert.match(binding, /reconcileStateWithContinuity/);
    assert.doesNotMatch(binding, /bridge\.(?:publish|mutate|retrieve|write|update)\s*\(/);
    assert.match(source, /Evidence availability for next planning pass/);
    assert.match(source, /const continuityStatus = campaign \? campaignRecall\.map/);
});
