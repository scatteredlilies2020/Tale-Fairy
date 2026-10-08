import test from 'node:test';
import assert from 'node:assert/strict';
import { liveCardPass, smokeWriterMessages } from '../scripts/evaluate-live-story-cards.mjs';
import { storyCardCases, cardCaseReply } from '../scripts/story-card-cases.mjs';
import { emptyCampaign } from '../extension/campaign-planner.js';
import { chatHasCurrentGuidance } from '../extension/request-injection.js';

test('live smoke harness sends the production prompt, not the authored answer', async () => {
    const fixture = storyCardCases.find(x => x.id === 'star-wars');
    let calls = 0;
    const pass = await liveCardPass(fixture, emptyCampaign(), [], async (messages, limit) => {
        calls++;
        assert.equal(limit, 3000);
        const request = JSON.stringify(messages);
        assert.ok(request.includes(fixture.premise));
        assert.ok(!request.includes(fixture.reminder));
        assert.ok(!request.includes(fixture.cards[0].title));
        assert.ok(request.includes('effects'));
        return { text: JSON.stringify(cardCaseReply(fixture)), finishReason: 'stop' };
    });
    assert.equal(calls, 1);
    assert.equal(pass.accepted, true);
    assert.equal(pass.validState, true);
    assert.deepEqual(pass.notices, []);
    assert.ok(pass.writerTokens <= 1000);
    const messages = smokeWriterMessages(fixture, pass.writerPacket, 'Lio listens over tea.');
    assert.ok(chatHasCurrentGuidance(messages, pass.writerPacket));
    assert.equal(messages.filter(x => x.content.includes('<tale-fairy-context>')).length, 1);
    assert.ok(JSON.stringify(messages).includes('tf-review'));
    assert.ok(JSON.stringify(messages).includes('Hidden Sith hand'));
});

test('live smoke harness never retries a rejected or truncated model response', async () => {
    const fixture = storyCardCases[0], state = emptyCampaign();
    for (const response of [{ text: '{', finishReason: 'length' }, { text: '{}', finishReason: 'stop' }]) {
        let calls = 0;
        const pass = await liveCardPass(fixture, state, [], async () => { calls++; return response; });
        assert.equal(calls, 1);
        assert.equal(pass.accepted, false);
        assert.deepEqual(pass.state, state);
        assert.ok(pass.error);
    }
});

test('live smoke harness uses saved model state on review and preserves omitted cards', async () => {
    const fixture = storyCardCases.find(x => x.id === 'k-on');
    const reply = cardCaseReply(fixture);
    const initial = await liveCardPass(fixture, emptyCampaign(), [], async () => ({ text: JSON.stringify(reply), finishReason: 'stop' }));
    const review = await liveCardPass(fixture, initial.state, [{ index: 0, role: 'assistant', content: 'The club continues drinking tea.' }], async messages => {
        assert.ok(JSON.stringify(messages).includes('previous_preparation'));
        assert.ok(JSON.stringify(messages).includes(fixture.cards[0].title));
        return { text: JSON.stringify({ ...reply, upsert: [], foundation: { reminder: '', changeReason: '', scratchpad: '' } }), finishReason: 'stop' };
    });
    assert.equal(review.accepted, true);
    assert.equal(review.state.revision, 2);
    assert.equal(review.writerPacket, initial.writerPacket);
});
