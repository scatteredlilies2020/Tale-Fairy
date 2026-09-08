import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../extension/index.js', import.meta.url), 'utf8');
const stateSource = await readFile(new URL('../extension/state.js', import.meta.url), 'utf8');
const analysisSource = await readFile(new URL('../extension/analysis.js', import.meta.url), 'utf8');
const offscreenSource = await readFile(new URL('../extension/offscreen-world.js', import.meta.url), 'utf8');
const causalSource = await readFile(new URL('../extension/causal-context.js', import.meta.url), 'utf8');
const schedulerSource = await readFile(new URL('../extension/planner-scheduler.js', import.meta.url), 'utf8');
const fallbackSource = await readFile(new URL('../extension/fallback-direction.js', import.meta.url), 'utf8');
const template = await readFile(new URL('../extension/settings.html', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const pluginPackage = JSON.parse(await readFile(new URL('../plugin/package.json', import.meta.url), 'utf8'));
const pluginSource = await readFile(new URL('../plugin/index.js', import.meta.url), 'utf8');

test('manifest, browser runtime, and detached plugin share the release version', () => {
    assert.equal(manifest.version, '0.13.3');
    assert.equal(manifest.js, 'extension/index.js?v=0.13.3');
    assert.equal(manifest.css, 'extension/style.css?v=0.13.3');
    assert.equal(pluginPackage.version, manifest.version);
    assert.match(pluginSource, /const VERSION = '0\.13\.3'/);
    assert.match(source, /const RUNTIME_VERSION = '0\.13\.3'/);
});

test('roleplay injection never migrates the user default into a system message', () => {
    assert.match(source, /injectionRole:\s*DEFAULT_INJECTION_ROLE/);
    assert.doesNotMatch(source, /injectionRole\s*===\s*['"]user['"][^\n]*injectionRole\s*=\s*['"]system['"]/);
    assert.match(template, /<option value="user">User \(default\)<\/option>/);
    assert.match(template, /<option value="system">System<\/option>/);
    assert.match(template, /<option value="assistant">Assistant<\/option>/);
});

test('runtime uses causal context and deferred world state without prescriptive beat-director dependency', () => {
    assert.match(source, /from '\.\/causal-context\.js\?v=0\.13\.3'/);
    assert.match(stateSource, /from '\.\/causal-context\.js\?v=0\.13\.3'/);
    assert.doesNotMatch(source, /beat-director/);
    assert.doesNotMatch(stateSource, /beat-director/);
    assert.match(stateSource, /export const STATE_VERSION = 58/);
    assert.match(stateSource, /offscreenWorld/);
    assert.match(stateSource, /delete state\.beatDirective/);
});

test('planner contracts return active world conditions rather than future branches', () => {
    assert.match(analysisSource, /contract_version=9/);
    assert.match(analysisSource, /contract_version=11/);
    assert.match(analysisSource, /private active-world simulator/i);
    assert.match(analysisSource, /underlying conditions|present causal state/i);
    assert.match(analysisSource, /Never prescribe a future action, scene, event, dialogue, reveal, discovery, consequence, or outcome/i);
    assert.match(analysisSource, /Do not assume expressed means resolved|Do not equate mention with resolution/i);
    assert.match(analysisSource, /deferred debt, not continuous ticking/i);
    assert.match(offscreenSource, /scheduled arrival/i);
    assert.doesNotMatch(analysisSource, /one primary.*two.*alternatives/i);
});

test('provider context exposes only clean relevant conditions', () => {
    assert.match(causalSource, /RELEVANT UNDERLYING CONDITIONS/);
    assert.match(causalSource, /causal context, not required events or predetermined outcomes/i);
    assert.match(causalSource, /confidence !== 'tentative'/);
    assert.doesNotMatch(causalSource, /branchIndex|weighted random choice|NEXT-STEP EFFECT/);
    assert.match(stateSource, /formatCausalContext/);
    assert.match(stateSource, /if \(!enabled \|\| !guidanceUsable\) return ''/);
});

test('generation archives and reuses the same causal slice for regeneration', () => {
    assert.match(source, /causalContext: generationGuideSelection\.causalContext/);
    assert.match(source, /causalContext: \(archivedUsable \|\| archivedSkipped\) \? archived\.causalContext/);
    assert.doesNotMatch(source, /branchIndex|selectBeatBranchIndex/);
    const interceptor = source.slice(source.indexOf('export async function livingWorldGuideGenerateInterceptor'), source.indexOf('globalThis.livingWorldGuideGenerateInterceptor'));
    assert.doesNotMatch(interceptor, /await |analyzeNow\(/);
});

test('scratchpad rendering derives its request preview from defined live state', () => {
    assert.match(source, /const preparedSelection = generationGuideSelection\?\.chatId === chatId \? generationGuideSelection : null/);
    assert.doesNotMatch(source, /\bactiveSelection\b/);
});

test('missing or failed planning never invents provider facts', () => {
    assert.match(fallbackSource, /causalContext/);
    assert.match(fallbackSource, /next\.causalContext = clean\.causalContext/);
    assert.match(fallbackSource, /next\.lastInject = false/);
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
    assert.match(pluginSource, /\[2, 3, 4, 5, 6, 7, 8, 9, 10, 11\]\.includes\(value\.contract_version\)/);
});

test('planner token budgets, retries, and nonblocking behavior remain compatible', () => {
    assert.match(source, /recentContextTokens: 6000/);
    assert.match(source, /maxPromptTokens: 16000/);
    assert.match(source, /const INCREMENTAL_MAX_PROMPT_TOKENS = 4200/);
    assert.match(source, /const REBUILD_RESPONSE_TOKENS = 16384/);
    assert.match(source, /PLANNER_MAX_AUTO_RETRIES = 2/);
    assert.match(source, /No Tale Fairy work is awaited and no verification failure can[\s\S]*reject the provider request/);
    assert.match(source, /Generation will continue without Tale Fairy blocking it/);
});

test('settings describe private simulation and causal injection without branch controls', () => {
    assert.match(template, /active world simulation|world simulation/i);
    assert.match(template, /causal context|underlying conditions/i);
    assert.doesNotMatch(template, /one primary NPC\/world response and two redirect-safe alternatives/i);
    assert.doesNotMatch(template, /one compatible external branch/i);
    assert.doesNotMatch(template, /data-setting="pacing"|Scene pacing/);
});

test('Continuity remains optional one-way evidence rather than an authority dependency', () => {
    assert.match(template, /Reads Continuity's existing snapshot as one optional summary provider/i);
    const binding = source.slice(source.indexOf('function bindContinuityBridge'), source.indexOf('// The generation interceptor runs'));
    assert.match(binding, /bridge\.subscribe\(snapshot/);
    assert.match(binding, /reconcileStateWithContinuity/);
    assert.doesNotMatch(binding, /bridge\.(?:publish|mutate|retrieve|write|update)\s*\(/);
});
