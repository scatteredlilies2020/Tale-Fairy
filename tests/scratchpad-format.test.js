import test from 'node:test';
import assert from 'node:assert/strict';
import { formatHiddenMotives } from '../extension/scratchpad-format.js';

test('hidden motive blocks retain line breaks without splitting text into characters', () => {
    const text = formatHiddenMotives({
        status: 'focused',
        audit: 'Strongest explanation retained.',
        items: [{
            explanation: 'Valid expedited review.',
            likelihood: 'established',
            actor: 'Correspondence Division',
            currentRelevance: 'supports-beat',
            disclosure: 'signaled',
            mechanism: 'Standard expedited queue.',
            evidence: ['Authenticated seal', 'Valid routing'],
            counterevidence: ['Timing unexplained'],
        }],
    });

    assert.equal(text, [
        'Board status: focused · Strongest explanation retained.',
        '1. Valid expedited review. [established]',
        'Actor: Correspondence Division · Relevance: supports-beat · Disclosure: signaled',
        'Mechanism: Standard expedited queue.',
        'Evidence: Authenticated seal; Valid routing',
        'Counterevidence: Timing unexplained',
    ].join('\n'));
    assert.doesNotMatch(text, /1\n\.\n/);
});

test('hidden motive text stays absent until analyzed items exist', () => {
    assert.equal(formatHiddenMotives({ items: [] }), '');
    assert.equal(formatHiddenMotives({ items: [{}] }, false), '');
});
