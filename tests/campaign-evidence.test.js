import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campaignEvidenceText, campaignEvidenceMessages, campaignReviewWindow, compactCampaignSpeakers } from '../extension/campaign-evidence.js';

test('shared speaker labels round-trip losslessly without changing text or mixed attribution', () => {
    const messages = Array.from({ length: 10 }, (_, index) => ({ index, role: index % 2 ? 'user' : 'assistant',
        name: index % 2 ? 'Elizabeth' : index === 0 ? 'Narrator' : 'Other narrator', content: `Literal name: Elizabeth ${index}.` }));
    const before = structuredClone(messages);
    const compact = compactCampaignSpeakers(messages);
    assert.deepEqual(compact.defaults, { user: 'Elizabeth' });
    assert.deepEqual(compact.messages.map(m => ({ ...m, ...(Object.hasOwn(compact.defaults, m.role)
        ? { name: compact.defaults[m.role] } : {}) })), messages);
    assert.deepEqual(messages, before);
    messages[1].name = '';
    assert.deepEqual(compactCampaignSpeakers(messages).defaults, {}, 'an unnamed speaker must not gain an inferred name');
});

test('shrinking a review preserves every unreviewed user message whole, ordered and once', () => {
    const messages = Array.from({ length: 40 }, (_, index) => ({ index, role: index % 2 ? 'user' : 'assistant',
        content: `<span style="color:red">I decline investigation ${index}.</span>` }));
    const before = structuredClone(messages);
    const selected = campaignReviewWindow(messages, 2, 20);
    assert.deepEqual(selected.map(m => m.index), [0, 1, 21, 23, 25, 27, 29, 31, 33, 35, 37, 38, 39]);
    assert.deepEqual(campaignEvidenceMessages(selected, { narrative: true }).filter(m => m.role === 'user'),
        messages.filter(m => m.role === 'user' && (m.index === 1 || m.index >= 20)));
    assert.deepEqual(messages, before);
    assert.deepEqual(campaignReviewWindow(messages, 2).filter(m => m.role === 'user'), messages.filter(m => m.role === 'user'));
    for (const reviewed of [-1, 41, 1.5, NaN]) assert.throws(() => campaignReviewWindow(messages, 2, reviewed), /valid window/);
    assert.throws(() => campaignReviewWindow(messages.slice(1), 2), /indexed prefix/);
    assert.throws(() => campaignReviewWindow(messages, 0), /valid window/);
});

test('presentation removal preserves all text, statuses, tables and semantic markup', () => {
    const source = '<stat>Time = 12:00</stat>\nKira keeps the house. <div style="color:red"><table class="card"><tr><td width="10">Relation</td><td>No kin</td></tr></table><s>Little</s> Guild</div>';
    assert.equal(campaignEvidenceText(source), '<stat>Time = 12:00</stat>\nKira keeps the house. <div><table><tr><td width="10">Relation</td><td>No kin</td></tr></table><s>Little</s> Guild</div>');
});

test('unknown tags, attributed information, images, code comparisons and source are unchanged', () => {
    const source = '<portal destination="north">open</portal><img alt="seal" src="x"><span title="false seal">seal</span><td data-clue="3">?</td> 3 < 4; <div style="x > y">text</div>';
    const messages = [{ index: 7, role: 'assistant', content: source }], before = structuredClone(messages);
    assert.equal(campaignEvidenceMessages(messages)[0].content, source.replace('<div style="x > y">', '<div>'));
    assert.deepEqual(messages, before);
    const tricky = '<td title="clue: style=red and class=lost" colspan="2" style="color:red">two cells</td>';
    assert.equal(campaignEvidenceText(tricky), '<td title="clue: style=red and class=lost" colspan="2">two cells</td>');
});

test('narrative selection discloses omitted older panels and preserves newest panel and user text', () => {
    const panel = '<stat>Time = noon\nLocation = hall\nCurrent Beat = talking</stat>\n';
    const messages = [{ index: 0, role: 'assistant', content: panel + 'The keeper is Kira.' },
        { index: 1, role: 'user', content: panel + '<span style="color:red">User-authored text.</span>' },
        { index: 2, role: 'assistant', content: panel + 'Current response.' }];
    const result = campaignEvidenceMessages(messages, { narrative: true });
    assert.equal(result[0].content, 'The keeper is Kira.'); assert.ok(result[0].omitted);
    assert.deepEqual(result[1], messages[1]); assert.deepEqual(result[2], messages[2]);
    assert.equal(campaignEvidenceMessages([{ index: 0, role: 'assistant', content: '<stat>unique clue</stat> prose' }, messages[2]], { narrative: true })[0].content, '<stat>unique clue</stat> prose');
});
