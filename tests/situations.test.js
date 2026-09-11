import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSituationBoard, mergeSituationUpdates, normalizeSituationBoard, retireManifestedSituations, selectSituationalOpenings } from '../extension/situations.js?v=0.13.7';
import { formatCausalContext } from '../extension/causal-context.js?v=0.13.7';

const item = (id, extra = {}) => ({ id, type: 'opportunity', premise: 'A local resource is temporarily available.', cause: 'A recent ordinary change created the opening.', entry: 'someone checks the nearby records', scope: 'scene', persistence: 'local', status: 'available', origin: 'inferred', ...extra });

test('situation boards are bounded and normalize valid records', () => {
    const board = normalizeSituationBoard({ items: Array.from({ length: 10 }, (_, i) => item(`s${i}`)) });
    assert.equal(board.items.length, 6);
    assert.equal(board.items[0].id, 's0');
});

test('incremental situation updates preserve omissions and retire explicitly', () => {
    const first = mergeSituationUpdates(defaultSituationBoard(), [item('a'), item('b')], { full: false });
    const second = mergeSituationUpdates(first, [{ ...item('a'), premise: 'Updated premise.' }], { full: false });
    assert.equal(second.items.length, 2);
    assert.equal(second.items.find(x => x.id === 'a').premise, 'Updated premise.');
    const retired = mergeSituationUpdates(second, [{ op: 'retire', id: 'b' }], { full: false });
    assert.deepEqual(retired.items.map(x => x.id), ['a']);
});

test('quiet closed scenes suppress openings while engaged activity can select one', () => {
    const board = mergeSituationUpdates(defaultSituationBoard(), [item('harbor')]);
    const quiet = selectSituationalOpenings(board, { scene: { activity: 'resting', location: 'room' }, sceneProfile: { pressure: 'none', noveltyCeiling: 'incidental', intrusion: 'closed' } });
    assert.deepEqual(quiet, []);
    const active = selectSituationalOpenings(board, { scene: { activity: 'checking harbor records', location: 'harbor office' }, sceneProfile: { pressure: 'active', noveltyCeiling: 'context-native', intrusion: 'socially-open' } });
    assert.equal(active.length, 1);
    assert.equal(active[0].id, 'harbor');
});

test('provider formatting keeps openings optional and hides internal metadata', () => {
    const output = formatCausalContext({ inject: true, conditions: [{ id: 'c', kind: 'situation', subject: 'Harbor office', condition: 'keeps current manifests', disclosure: 'open', confidence: 'strong', relevance: 'current' }], optionalSituations: [{ premise: 'A delayed manifest has left one cargo entry unclaimed.', entry: 'someone checks records or asks about the delay' }] });
    assert.match(output, /OPTIONAL SITUATIONAL OPENINGS/);
    assert.match(output, /unclaimed/);
    assert.doesNotMatch(output, /confidence|relevance|situation-board/i);
    assert.match(output, /outcomes, player choices, consent, and consequences remain open/i);
    assert.match(output, /observation, NPC initiative, or an established causal process/);
    assert.doesNotMatch(output, /Use only if the latest action naturally engages one/);
});

test('scene relevance and ongoing activity do not require a player action-verb unlock', () => {
    const board = mergeSituationUpdates(defaultSituationBoard(), [item('records', {
        premise: 'The clerk is reconciling the nearby records.', origin: 'established', status: 'engaged',
    })]);
    const options = { scene: { activity: 'The clerk is working on records.', location: 'Office' }, sceneProfile: { pressure: 'none', noveltyCeiling: 'incidental', intrusion: 'closed' } };
    for (const latestUserAction of ['I observe.', 'I listen.', '...']) {
        assert.equal(selectSituationalOpenings(board, { ...options, latestUserAction })[0]?.id, 'records');
    }
    assert.deepEqual(selectSituationalOpenings(board, { ...options, latestUserAction: 'No interruption; just rest.' }), []);
    const unintroduced = mergeSituationUpdates(defaultSituationBoard(), [item('visitor', { type: 'encounter', origin: 'original', premise: 'An unexpected visitor interrupts the clerk at the office.' })]);
    assert.deepEqual(selectSituationalOpenings(unintroduced, { ...options, latestUserAction: 'I observe.' }), []);
});

test('manifested premise retires the candidate without creating resolution debt', () => {
    const board = mergeSituationUpdates(defaultSituationBoard(), [item('manifest')]);
    const retained = retireManifestedSituations(board, [{ is_user: false, mes: 'A local resource is temporarily available.' }]);
    assert.deepEqual(retained.items, []);
});
