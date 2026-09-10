import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSituationBoard, mergeSituationUpdates, normalizeSituationBoard, retireManifestedSituations, selectSituationalOpenings } from '../extension/situations.js?v=0.13.6';
import { formatCausalContext } from '../extension/causal-context.js?v=0.13.6';

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
});

test('manifested premise retires the candidate without creating resolution debt', () => {
    const board = mergeSituationUpdates(defaultSituationBoard(), [item('manifest')]);
    const retained = retireManifestedSituations(board, [{ is_user: false, mes: 'A local resource is temporarily available.' }]);
    assert.deepEqual(retained.items, []);
});
