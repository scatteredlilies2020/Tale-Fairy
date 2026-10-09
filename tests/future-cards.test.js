import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { futureCardsHtml, renderFutureCards } from '../extension/future-cards.js';
import { validFuture } from '../extension/future-planner.js';

const card = () => ({ id: 'f1-winter', title: 'The Missing Winter Convoys', category: 'Original',
    premise: 'Medicine convoys disappear before snow closes the mountain pass.', pressures: [],
    timing: 'A possible winter Chapter.', favors: 'Clinics ask for help if shipments remain missing.',
    prevents: 'Restored deliveries could prevent the crisis.', transition: '', outlook: '' });
const saved = cards => ({ version: 1, revision: 1, cards });

test('future cards show a short premise and a few notes without changing saved preparation', () => {
    const state = saved([card(), { ...card(), id: 'f1-canon', title: 'A Canon Possibility', category: 'Canon' }]);
    const before = structuredClone(state);
    assert.equal(validFuture(state), true);
    const html = futureCardsHtml(state, { status: 'complete' });
    assert.equal((html.match(/<article /g) || []).length, 2);
    assert.equal((html.match(/<li>/g) || []).length, 6);
    for (const text of ['Original', 'Canon', card().title, card().premise, card().prevents]) assert.ok(html.includes(text));
    assert.doesNotMatch(html, /<pre|<details|Writer selection|Ongoing effects/);
    assert.deepEqual(state, before);
});

test('verbose saved cards have bounded previews and complete expandable notes', () => {
    const verbose = { ...card(), premise: 'A detailed proposed premise. '.repeat(18),
        favors: 'A condition that can sustain the possibility. '.repeat(8),
        pressures: [{ label: 'Supply', pressure: 'Clinic stocks are low.' }],
        transition: 'An independent clinic request.', outlook: 'Still conditional.' };
    assert.equal(validFuture(saved([verbose])), true);
    const html = futureCardsHtml(saved([verbose]));
    const preview = html.slice(0, html.indexOf('<details'));
    assert.equal((preview.match(/<li>/g) || []).length, 3);
    assert.ok(!preview.includes(verbose.premise));
    assert.ok(!preview.includes(verbose.favors));
    assert.match(preview, /…/);
    const full = html.slice(html.indexOf('<details'));
    for (const text of [verbose.premise, verbose.favors, verbose.transition, verbose.outlook, verbose.pressures[0].pressure]) {
        assert.ok(full.includes(text), text);
    }
    assert.match(full, /<summary>Full notes<\/summary>/);
});

test('all model text is escaped, including names, notes, ids and request errors', () => {
    const attack = '<img src=x onerror="alert(1)">';
    const hostile = Object.fromEntries(Object.keys(card()).map(key => [key, attack]));
    hostile.pressures = [{ label: attack, pressure: attack }];
    const html = futureCardsHtml(saved([hostile]), { status: attack, error: attack }, { stale: true });
    assert.doesNotMatch(html, /<img|<script/);
    assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
    assert.match(html, /Source changed/);
    assert.match(futureCardsHtml(null), /No future Chapters saved/);
    const invalid = futureCardsHtml({ cards: [null] }, { error: attack }, { invalid: true });
    assert.match(invalid, /invalid and withheld/);
    assert.doesNotMatch(invalid, /<article|<img/);
});

test('refresh preserves expanded full notes without rewriting unchanged markup', () => {
    const state = saved([{ ...card(), outlook: 'A fourth note.' }]);
    const details = [{ dataset: { disclosure: 'future-f1-winter' }, open: true }];
    let writes = 0;
    const container = { querySelectorAll: selector => selector.includes('[open]') ? details.filter(d => d.open) : details,
        set innerHTML(value) { writes++; details[0].open = false; this.html = value; } };
    renderFutureCards(container, state);
    renderFutureCards(container, structuredClone(state));
    assert.equal(writes, 1);
    renderFutureCards(container, state, { status: 'processing' });
    assert.equal(writes, 2);
    assert.equal(details[0].open, true);
});

test('host renders cards after excluding adopted prospects and withholds corrupt outlooks', () => {
    const source = readFileSync(new URL('../extension/index.js', import.meta.url), 'utf8');
    const state = saved([card(), { ...card(), id: 'f1-adopted', title: 'Already adopted' }]);
    const context = { chatMetadata: { future: state, attempt: { status: 'complete' } } };
    const target = { querySelectorAll: () => [] };
    const scope = { currentContext: () => context, FUTURE_KEY: 'future', FUTURE_ATTEMPT_KEY: 'attempt',
        document: { querySelector: selector => selector.includes('data-role="future-cards"') ? target : null },
        readCampaignSnapshot: () => ({}), futureReceipts: () => [{ id: 'f1-adopted' }],
        campaignFingerprint() {}, usableFuture: () => true, validFuture, renderFutureCards,
        futureHost: null, EXTENSION_ID: 'test' };
    vm.createContext(scope);
    vm.runInContext(source.match(/function renderFutureBoard\([^]*?^}/m)[0], scope);
    scope.renderFutureBoard();
    assert.match(target.innerHTML, /<article/);
    assert.ok(target.innerHTML.includes(card().title));
    assert.ok(!target.innerHTML.includes('Already adopted'));
    assert.equal(state.cards.length, 2);
    context.chatMetadata.future = { ...state, cards: [null] };
    scope.renderFutureBoard();
    assert.match(target.innerHTML, /invalid and withheld/);
    assert.doesNotMatch(target.innerHTML, /<article/);
});
