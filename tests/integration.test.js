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

test('manifest and detached plugin identify the current-beat release', () => {
    assert.equal(manifest.version, '0.11.120');
    assert.equal(manifest.js, 'extension/index.js?v=0.11.120');
    assert.equal(manifest.css, 'extension/style.css?v=0.11.120');
    assert.match(manifest.description, /lightweight current-beat director/i);
    assert.equal(pluginPackage.version, manifest.version);
    assert.match(pluginSource, /const VERSION = '0\.11\.120'/);
    assert.match(source, /const RUNTIME_VERSION = '0\.11\.120'/);
});

test('extension loads v120 analysis, state, and request-injection modules', () => {
    assert.match(source, /from '\.\/analysis\.js\?v=0\.11\.120'/);
    assert.match(source, /from '\.\/state\.js\?v=0\.11\.120'/);
    assert.match(source, /from '\.\/request-injection\.js\?v=0\.11\.120'/);
    assert.match(stateSource, /from '\.\/beat-director\.js\?v=0\.11\.120'/);
});

test('obsolete pacing selector is absent while active guidance preserves user-controlled pacing', () => {
    assert.doesNotMatch(template, /data-setting="pacing"|Scene pacing/);
    assert.doesNotMatch(source, /updatePacing|data-setting="pacing"/);
    assert.match(directorSource, /USER-CONTROLLED PACING/);
    assert.match(directorSource, /latest user\/OOC turn sets the maximum time, activity, and player progress/i);
});

test('current-beat analysis replaces future agenda planning at the wire boundary', () => {
    assert.match(analysisSource, /contract_version=3/);
    assert.match(analysisSource, /current-beat director/);
    assert.match(analysisSource, /Never plan a future route/);
    assert.match(analysisSource, /Categories are narrative functions, not a creativity menu/);
    assert.match(analysisSource, /countries, societies, and worlds/);
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
});

test('replacement generation archives the semantic beat rather than rotating concrete routes', () => {
    assert.match(source, /const archived = replacement \? state\.lastRequestVerification : null/);
    assert.match(source, /archived\?\.beatDirective/);
    assert.match(source, /sceneProfile: archivedUsable \? archived\.sceneProfile/);
    assert.match(source, /beatDirective: archivedUsable \? archived\.beatDirective/);
    assert.match(directorSource, /keep the semantic beat if still valid but realize it differently/i);
    assert.doesNotMatch(source, /\(previousIndex \+ 1\) % candidates\.length/);
});

test('rapid-fire turns do not wait for a new planner call', () => {
    assert.match(directorSource, /TALE FAIRY — LIVE BEAT POLICY/);
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

test('scratchpad exposes only scene, current beat, factual continuity, and verification', () => {
    assert.match(template, />Current beat</);
    assert.match(template, /semantic operation and impact envelope/i);
    assert.match(template, /Relevant unresolved processes/);
    assert.match(template, /never delivery promises or scheduled future events/i);
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
