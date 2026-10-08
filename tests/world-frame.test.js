import test from 'node:test';
import assert from 'node:assert/strict';
import { worldFrameCases } from '../scripts/world-frame-cases.mjs';
import { liveCardPass } from '../scripts/evaluate-live-story-cards.mjs';
import { directorInput, DIRECTOR_SYSTEM, DIRECTOR_SCHEMA } from '../extension/story-director.js';
import { emptyCampaign } from '../extension/campaign-planner.js';
import { plannerMessages, PLANNER_OUTPUT_MODE } from '../extension/output-negotiation.js';

const reply = (reminder, changeReason = '') => ({ text: JSON.stringify({ reviewAfter: 12,
    foundation: { reminder, changeReason, scratchpad: '' }, upsert: [], retain: [], retire: [], select: [],
}), finishReason: 'stop' });

test('genre calibration is in the production director and the trailing response contract', () => {
    for (const pattern of [/direct RP brief, not a lore survey/, /plain declarative prose/,
        /concrete setting mechanisms and causal links/, /Explicit RP premise and author direction determine genre and stakes/,
        /franchise tone is a default, not a veto/, /not one recent scene to redefine it/,
        /light RP without danger/, /Apply this calibration to cards and effects too/,
        /explicit K-On murder-mystery premise/, /passive lore surveys, mismatch the RP's genre/]) {
        assert.match(DIRECTOR_SYSTEM, pattern);
    }
    const messages = plannerMessages(DIRECTOR_SYSTEM, '{}', DIRECTOR_SCHEMA, PLANNER_OUTPUT_MODE.PROMPT_ONLY);
    assert.ok(messages[0].content.endsWith(DIRECTOR_SCHEMA.description));
    assert.match(DIRECTOR_SCHEMA.description, /Match stakes to this RP, not franchise stereotypes/);
    assert.match(DIRECTOR_SCHEMA.description, /maximum 600/);
});

for (const fixture of worldFrameCases) test(`${fixture.id}: a concise genre-specific frame reaches the writer without scene cards`, async () => {
    assert.ok(fixture.reminder.length >= 350 && fixture.reminder.length <= 600);
    const pass = await liveCardPass(fixture, emptyCampaign(), [], async messages => {
        assert.ok(messages[0].content.includes(fixture.premise));
        return reply(fixture.reminder);
    });
    assert.equal(pass.accepted, true, pass.error);
    assert.equal(pass.validState, true);
    assert.equal(pass.calls, 1);
    assert.deepEqual(pass.notices, []);
    assert.equal(pass.orientationOmitted, false);
    assert.ok(pass.writerPacket.includes(fixture.reminder));
    assert.equal(pass.state.workingPlan.storyStructure.nodes.length, 0);
});

test('one disturbing scene preserves the light premise; an explicit genre change can revise it with a reason', async () => {
    const light = worldFrameCases.find(x => x.id === 'k-on-light');
    const mystery = worldFrameCases.find(x => x.id === 'k-on-mystery');
    const first = await liveCardPass(light, emptyCampaign(), [], async () => reply(light.reminder));
    const messages = [{ index: 0, role: 'user', content: 'Someone mentions a murder reported in the newspaper. We finish our tea.' }];
    const retained = await liveCardPass(light, first.state, messages, async request => {
        assert.ok(request[0].content.includes(light.premise));
        assert.ok(request[0].content.includes(messages[0].content));
        return reply('');
    });
    assert.equal(retained.accepted, true, retained.error);
    assert.equal(retained.state.workingPlan.storyStructure.foundation.reminder, light.reminder);

    const instruction = 'Change the lasting premise to a K-On murder mystery; ordinary club life still matters.';
    const input = directorInput({ reference: { premise: light.premise, authorInstructions: [instruction] },
        state: retained.state, previousUsable: true, messages });
    assert.ok(input.prompt.includes(instruction), 'explicit genre direction reaches the planner alongside the old premise');
    const changed = await liveCardPass(mystery, retained.state, messages, async () =>
        reply(mystery.reminder, 'Explicit author direction changes light club life to a murder-mystery RP.'));
    assert.equal(changed.accepted, true, changed.error);
    assert.equal(changed.state.workingPlan.storyStructure.foundation.reminder, mystery.reminder);
    assert.equal(changed.state.archive.at(-1).workingPlan.storyStructure.foundation.reminder, light.reminder);
});

test('a passive inherited frame can be corrected without resetting saved preparation', async () => {
    const fixture = worldFrameCases[0];
    const old = 'Institutions, traditions and personal loyalties pull society in competing directions.';
    const first = await liveCardPass(fixture, emptyCampaign(), [], async () => reply(old));
    const corrected = await liveCardPass(fixture, first.state, [], async () =>
        reply(fixture.reminder, 'Replace an abstract social summary with the same RP scope expressed through missions, advancement and village life.'));
    assert.equal(corrected.accepted, true, corrected.error);
    assert.equal(corrected.state.workingPlan.storyStructure.foundation.reminder, fixture.reminder);
    assert.equal(corrected.state.archive.at(-1).workingPlan.storyStructure.foundation.reminder, old);
});
