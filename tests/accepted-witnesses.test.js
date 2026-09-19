import test from 'node:test';
import assert from 'node:assert/strict';
import { witnessSpans, witnessMessages, resolveSpanWitnesses } from '../extension/accepted-witnesses.js';

test('numbered witnesses preserve source markup, table delimiters and speaker attribution', () => {
    const messages = [{ index: 42, role: 'assistant', name: 'Jo', content: 'The work is finished.\r\n\r\n| **Invoice** | Corrected |\n  “Exactly this.”  ' }];
    const before = structuredClone(messages);
    const supplied = witnessMessages(messages);
    assert.deepEqual(supplied, [{ index: 42, role: 'assistant', name: 'Jo', spans: [
        { span: 0, text: 'The work is finished.' }, { span: 1, text: '| **Invoice** | Corrected |' },
        { span: 2, text: '  “Exactly this.”  ' },
    ] }]);
    assert.deepEqual(resolveSpanWitnesses([{ index: 42, span: 1 }], messages), [{ index: 42, quote: '| **Invoice** | Corrected |' }]);
    assert.deepEqual(messages, before);
});

test('large paragraphs have bounded exact spans without truncating substantive text', () => {
    for (const content of ['A long sentence. '.repeat(500), 'x'.repeat(999) + '😀'.repeat(1000)]) {
        const spans = witnessSpans(content);
        assert.equal(spans.map(s => s.text).join(''), content);
        assert.ok(spans.every((s, index) => s.span === index && s.text.length <= 1001));
        assert.ok(spans.every(s => !/[\uD800-\uDBFF]$/u.test(s.text)), 'no split surrogate pairs');
        assert.ok(spans.every(s => content.includes(s.text)), 'every span is a contiguous exact source quote');
    }
});

test('witness ids cannot search another message, recall, prior plan or an absent span', () => {
    const messages = [{ index: 9, role: 'user', content: 'A supported observation.' }];
    for (const evidence of [[{ index: 0, span: 0 }], [{ index: 9, span: 1 }], [{ index: 9, span: -1 }]]) {
        assert.throws(() => resolveSpanWitnesses(evidence, messages), /exact supplied accepted-message span/);
    }
    assert.deepEqual(witnessSpans(' \n\r\n'), []);
});
