import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCampaign, campaignPayload, validCampaignState } from '../extension/campaign-planner.js';
import { ownedInput, ownedPass } from '../extension/event-planning.js';
import { mergeRealization, playableSituation, needsPlayableReview } from '../extension/undertaking-lifecycle.js';
import { loadPlannerState, saveState, defaultPlannerState } from '../extension/state.js';
const source = { chatId: 'test', referenceHash: 'card', messageCount: 1, fingerprint: 'accepted' };
const messages = [{ index: 0, role: 'assistant', name: 'Jo', content: 'Jo played the duet through its final chord. The altered bass line held.' }];
const subject = { id: 'music', development: 'A shared repertoire can develop across private sessions and public collaborations.',
    initiative: { owner: 'Jo', control: 'npc', aim: 'Make arrangements that can change with other musicians.' },
    plot_points: [{ event: 'OLD INVITATION', opens: 'PRIVATE FUTURE' }], stakes: 'Different musical voices find shared forms.', participation: 'Optional sessions.' };
const body = realization => ({ campaign: 'A repertoire grows.', episode: { subject: 'Booking', status: 'finished', boundary: 'The booking ended.' }, developments: [subject], realization });
const entry = (status = 'completed', episodeId = 'duet') => ({ id: 'music', changes: [{ episodeId, status, evidence: [{ index: 0, quote: messages[0].content }] }],
    playable: [{ episodeId, when: 'During a shared practice.', situation: 'REPEATED INTRODUCTION', resolution: { owner: 'npc', actors: ['Jo'], endpoint: 'Jo finishes playing and records the arrangement.' } },
        { episodeId: 'new-arrangement', when: 'If another shared session occurs.', situation: 'Jo plays a counterline against the altered bass, letting the two rhythms resolve together; a workable new ending can emerge.', resolution: { owner: 'npc', actors: ['Jo'], endpoint: 'Jo finishes the new ending, records the usable counterline, and leaves both charts available for another shared session.' } }] });
const plan = async (state, data, evidence = messages) => ownedPass({ state,
    input: ownedInput({ state, reference: {}, messages: evidence }), source,
    generate: async () => ({ text: JSON.stringify(data) }) });

test('completed episode stops being injected while its subject and substantive changed experience survive', async () => {
    const result = await plan(emptyCampaign(), body([entry()]));
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.state.developments[0].id, 'music');
    assert.equal(result.state.realization.music.episodes.duet.status, 'completed');
    const packet = campaignPayload(result.state, ['Keep this author instruction.']);
    assert.match(packet, /counterline/);
    assert.doesNotMatch(packet, /REPEATED|OLD INVITATION|PRIVATE FUTURE|witnesses|accepted_progress|final chord/);
    assert.match(packet, /Keep this author instruction/);
    assert.equal(validCampaignState(result.state), true);
});

test('introduced, participation and partial progress remain open; declining only the booking preserves music', async () => {
    for (const status of ['introduced', 'participating', 'partial', 'declined', 'transformed']) {
        const result = await plan(emptyCampaign(), body([entry(status, 'booking')]));
        assert.equal(result.accepted, true, result.error);
        assert.equal(result.state.developments.length, 1);
        assert.equal(campaignPayload(result.state).includes('REPEATED'), !['declined', 'transformed'].includes(status));
    }
});

test('empty playable is valid and omission retains unused undertaking and its progress across reload', async () => {
    const first = await plan(emptyCampaign(), body([{ id: 'music', changes: [], playable: [] }]));
    assert.equal(first.accepted, true, first.error);
    const saved = saveState({}, { ...defaultPlannerState(), campaignPreparation: first.state });
    const reloaded = loadPlannerState(JSON.parse(JSON.stringify(saved))).campaignPreparation;
    const result = await plan(reloaded, { ...body([]), developments: [] });
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(result.state.developments, first.state.developments);
    assert.deepEqual(result.state.realization, first.state.realization);
    assert.equal(campaignPayload(result.state), '');
});

test('invented, memory-only and absent message witnesses cannot complete anything and do not retry', async () => {
    for (const evidence of [[{ index: 9, quote: messages[0].content }], [{ index: 0, quote: 'A future collaboration occurred.' }]]) {
        const bad = entry(); bad.changes[0].evidence = evidence;
        let calls = 0;
        const state = emptyCampaign();
        const result = await ownedPass({ state, input: ownedInput({ state, reference: {}, messages }), source,
            generate: async () => { calls++; return { text: JSON.stringify(body([bad])) }; } });
        assert.equal(result.accepted, false);
        assert.equal(result.state, state);
        assert.equal(calls, 1);
        assert.match(result.error, /witness/);
    }
});

test('closed episodes cannot regress or restart, including an attempt to relabel a completion as introduction', async () => {
    const first = await plan(emptyCampaign(), body([entry()]));
    const next = await plan(first.state, body([entry('introduced')]));
    assert.equal(next.accepted, false);
    assert.equal(next.state, first.state);
    assert.match(next.error, /restart or regress/);
});

test('progress advancement requires new accepted evidence; storing preparation does not advance time or status', () => {
    const partial = mergeRealization({}, [entry('partial')], { subjects: ['music'], messages, source });
    assert.throws(() => mergeRealization(partial, [entry()], { subjects: ['music'], messages, source }), /newly accepted/);
    assert.deepEqual(mergeRealization(partial, [], { subjects: ['music'], messages, source }), partial);
});

test('real host input requires realization for new subjects, even if the model returns valid old JSON', async () => {
    const missing = body([]); delete missing.realization;
    const result = await plan(emptyCampaign(), missing);
    assert.equal(result.accepted, false);
    assert.match(result.error, /requires a playable/);
    const empty = await plan(emptyCampaign(), body([]));
    assert.equal(empty.accepted, false);
    assert.match(empty.error, /changed subject/);
});

test('new contract needs no duplicate legacy event authorship; only actual writer situation is published', async () => {
    const raw = body([entry()]); delete raw.developments[0].plot_points;
    const result = await plan(emptyCampaign(), raw);
    assert.equal(result.accepted, true, result.error);
    assert.match(campaignPayload(result.state), /counterline/);
    assert.doesNotMatch(campaignPayload(result.state), /maintained in realization|PRIVATE|witness/);
});

test('whole-subject retirement needs explicit scope and exact witnesses, and closed subject ids cannot be recreated', async () => {
    const first = await plan(emptyCampaign(), body([entry()]));
    const retired = { ...body([]), developments: [], retire: [{ id: 'music', reason: 'The entire undertaking ended.', evidence: [0] }] };
    const invalid = await plan(first.state, retired);
    assert.equal(invalid.accepted, false);
    assert.match(invalid.error, /missing scope/);
    const evidence = [{ index: 0, role: 'user', content: 'I am ending this entire musical undertaking.' }];
    retired.retire[0].scope = 'whole-subject';
    retired.retire[0].witnesses = [{ index: 0, quote: evidence[0].content }];
    const ended = await plan(first.state, retired, evidence);
    assert.equal(ended.accepted, true, ended.error);
    assert.equal(ended.state.developments.length, 0);
    const restart = await plan(ended.state, body([entry()]));
    assert.equal(restart.accepted, false);
    assert.match(restart.error, /Retired subjects cannot restart/);
});

test('current creative material can change without rewriting the durable undertaking', async () => {
    const first = await plan(emptyCampaign(), body([{ id: 'music', changes: [], playable: [] }]));
    const next = await plan(first.state, { ...body([entry()]), developments: [] });
    assert.equal(next.accepted, true, next.error);
    assert.deepEqual(next.state.developments, first.state.developments);
    assert.match(campaignPayload(next.state), /counterline/);
    assert.ok(next.state.archive.some(a => a.realization), 'previous preparation remains archived');
});

test('unchanged reviews do not grow duplicate progress archives or recursively nest observation history', async () => {
    const first = await plan(emptyCampaign(), body([entry()]));
    const next = await plan(first.state, { ...body([entry()]), developments: [] });
    assert.equal(next.accepted, true, next.error);
    assert.deepEqual(next.state.realization, first.state.realization);
    assert.equal(next.state.archive.length, first.state.archive.length);
    assert.ok(!next.state.realization.music.episodes.duet.history);
});


test('later review keeps authored future situations out of accepted progress and cannot cite them as facts', async () => {
    const first = await plan(emptyCampaign(), body([entry()]));
    const input = ownedInput({ state: first.state, reference: {}, messages });
    const payload = JSON.parse(input.prompt);
    assert.deepEqual(payload.accepted_progress.music, { episodes: first.state.realization.music.episodes });
    assert.doesNotMatch(JSON.stringify(payload.accepted_progress), /counterline|playable/);
    assert.deepEqual(payload.previous_preparation.playable.music, first.state.realization.music.playable);
    const invented = entry('completed', 'new-arrangement');
    invented.changes[0].evidence[0].quote = first.state.realization.music.playable[0].situation;
    const next = await ownedPass({ state: first.state, input, source,
        generate: async () => ({ text: JSON.stringify(body([invented])) }) });
    assert.equal(next.accepted, false);
    assert.match(next.error, /witness/);
    assert.equal(next.state, first.state);
});


test('a misquoted extra citation cannot veto progress with an independent exact witness', async () => {
    const change = entry();
    change.changes[0].evidence.push({ index: 0, quote: 'An unsupported paraphrase.' });
    const result = await plan(emptyCampaign(), body([change]));
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.state.realization.music.episodes.duet.status, 'completed');
    assert.deepEqual(result.state.realization.music.episodes.duet.witnesses.map(w => w.quote), [messages[0].content]);
    assert.deepEqual(result.warnings, [{ subjectId: 'music', episodeId: 'duet', index: 0, reason: 'quote-not-found' }]);
    assert.doesNotMatch(campaignPayload(result.state), /unsupported|paraphrase|witness/);
});

test('discarded new citations cannot advance an old witnessed milestone', () => {
    const previous = mergeRealization({}, [entry('partial')], { subjects: ['music'], messages, source });
    const change = entry();
    change.changes[0].evidence.push({ index: 1, quote: 'The future idea was performed.' });
    const supplied = [...messages, { index: 1, role: 'user', content: 'I listen.' }];
    assert.throws(() => mergeRealization(previous, [change], { subjects: ['music'], messages: supplied,
        source: { ...source, messageCount: 2 } }), /newly accepted/);
});


test('durable preparation can change without reauthoring an unaffected playable situation', async () => {
    const first = await plan(emptyCampaign(), body([entry()]));
    const update = body([]);
    update.developments = [{ ...subject, development: 'The repertoire can support private sessions as well as later collaborations.' }];
    const result = await plan(first.state, update);
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.state.developments[0].progression, update.developments[0].development);
    assert.deepEqual(result.state.realization, first.state.realization);
    assert.equal(campaignPayload(result.state), campaignPayload(first.state));
});


test('progress-only updates close or withhold consumed situations without discarding unrelated options', async () => {
    for (const status of ['partial', 'completed']) {
        const first = await plan(emptyCampaign(), body([{ id: 'music', changes: [], playable: entry().playable }]));
        const change = entry(status); delete change.playable;
        const result = await plan(first.state, { ...body([change]), developments: [] });
        assert.equal(result.accepted, true, result.error);
        assert.equal(result.state.realization.music.episodes.duet.status, status);
        assert.doesNotMatch(campaignPayload(result.state), /REPEATED/);
        assert.match(campaignPayload(result.state), /counterline/);
        assert.equal(result.state.realization.music.needsPlayableReview, status === 'partial' ? true : undefined);
        assert.equal(validCampaignState(result.state), true);
        const input = JSON.parse(ownedInput({ state: result.state, reference: {}, messages }).prompt);
        assert.equal(input.previous_preparation.playable_review_required_ids.includes('music'), status === 'partial');
        const next = await plan(result.state, { ...body([{ id: 'music', changes: [], playable: [] }]), developments: [] });
        assert.equal(next.accepted, true, next.error);
        assert.equal(next.state.realization.music.needsPlayableReview, undefined);
        assert.equal(campaignPayload(next.state), '');
    }
});

test('new subjects cannot silently omit their initial writer review', async () => {
    const change = entry(); delete change.playable;
    const result = await plan(emptyCampaign(), body([change]));
    assert.equal(result.accepted, false);
    assert.match(result.error, /explicit playable review/);
});


test('echoing unchanged partial evidence does not consume a freshly reviewed remainder', async () => {
    const explicit = entry('partial'); explicit.playable[0].situation = 'CURRENT REMAINDER';
    const first = await plan(emptyCampaign(), body([explicit]));
    const echo = entry('partial'); delete echo.playable;
    const next = await plan(first.state, { ...body([echo]), developments: [] });
    assert.equal(next.accepted, true, next.error);
    assert.match(campaignPayload(next.state), /CURRENT REMAINDER/);
    assert.equal(next.state.realization.music.needsPlayableReview, undefined);
});


test('writer-only preparation claims no progress when the changes list is omitted', async () => {
    const result = await plan(emptyCampaign(), body([{ id: 'music', playable: entry().playable }]));
    assert.equal(result.accepted, true, result.error);
    assert.deepEqual(result.state.realization.music.episodes, {});
    assert.match(campaignPayload(result.state), /counterline/);
    assert.equal(validCampaignState(result.state), true);
});


test('typographical quotes and paragraph spacing retain the original accepted source span', async () => {
    const content = 'Jo says, “The duet is finished.”\n\nThe last chord fades.';
    const actual = [{ ...messages[0], content }];
    const update = entry();
    update.changes[0].evidence = [{ index: 0, quote: 'Jo says, "The duet is finished." The last chord fades.' }];
    const first = await plan(emptyCampaign(), body([update]), actual);
    assert.equal(first.accepted, true, first.error);
    assert.equal(first.state.realization.music.episodes.duet.witnesses[0].quote, content);
    update.changes[0].evidence[0].quote = content;
    const next = await plan(first.state, { ...body([update]), developments: [] }, actual);
    assert.equal(next.accepted, true, next.error);
    assert.equal(next.state.archive.length, first.state.archive.length);
});

test('citation typography handling never changes words, negation or the cited message', async () => {
    const actual = [{ ...messages[0], content: 'Jo says, “The duet is not finished.”' }];
    for (const evidence of [
        { index: 0, quote: 'Jo says, "The duet is finished."' },
        { index: 1, quote: 'Jo says, "The duet is not finished."' },
    ]) {
        const update = entry(); update.changes[0].evidence = [evidence];
        const result = await plan(emptyCampaign(), body([update]), actual);
        assert.equal(result.accepted, false);
        assert.match(result.error, /witness/);
    }
});

test('a newly authored introduction without a resolution fails once and preserves the preparation', async () => {
    const previous = await plan(emptyCampaign(), body([{ id: 'music', playable: entry().playable }]));
    const incomplete = structuredClone(entry().playable);
    delete incomplete[0].resolution;
    let calls = 0;
    const result = await ownedPass({ state: previous.state, input: ownedInput({ state: previous.state, reference: {}, messages }), source,
        generate: async () => { calls++; return { text: JSON.stringify({ ...body([{ id: 'music', playable: incomplete }]), developments: [] }) }; } });
    assert.equal(result.accepted, false);
    assert.match(result.error, /resolution/);
    assert.equal(result.state, previous.state);
    assert.equal(calls, 1);
});

test('NPC-owned resolution reaches the writer and survives reload without becoming witnessed progress', async () => {
    const first = await plan(emptyCampaign(), body([{ id: 'music', playable: entry().playable }]));
    assert.equal(first.accepted, true, first.error);
    const saved = saveState({}, { ...defaultPlannerState(), campaignPreparation: first.state });
    const reloaded = loadPlannerState(JSON.parse(JSON.stringify(saved))).campaignPreparation;
    const packet = JSON.parse(campaignPayload(reloaded).replace(/<\/?tale-fairy-context>/g, '').trim());
    assert.deepEqual(packet.playable_situations, entry().playable.map(playableSituation));
    assert.deepEqual(packet.playable_situations[0].npc_resolution, { actors: ['Jo'], result: 'Jo finishes playing and records the arrangement.' });
    assert.deepEqual(reloaded.realization.music.episodes, {});
    const input = JSON.parse(ownedInput({ state: reloaded, reference: {}, messages }).prompt);
    assert.deepEqual(input.accepted_progress, {});
    assert.match(JSON.stringify(input.previous_preparation.playable), /finishes playing/);
    assert.doesNotMatch(campaignPayload(reloaded), /episodeId|witnesses|reply_limit|writing_style|maximum replies|paragraph/);
});

test('NPC resolution cannot own the player, omit its actor, or disguise actors as a world result', async () => {
    const state = emptyCampaign();
    for (const resolution of [
        { owner: 'npc', actors: ['  USER  '], endpoint: 'User accepts the commitment.' },
        { owner: 'npc', endpoint: 'Someone decides.' },
        { owner: 'npc', actors: ['Jo', ' jo '], endpoint: 'Jo finishes.' },
        { owner: 'world', actors: ['User'], endpoint: 'User accepts the commitment.' },
    ]) {
        const playable = [{ ...entry().playable[0], resolution }];
        const result = await ownedPass({ state, input: ownedInput({ state, reference: {}, messages, playerNames: ['User'] }), source,
            generate: async () => ({ text: JSON.stringify(body([{ id: 'music', playable }])) }) });
        assert.equal(result.accepted, false, JSON.stringify(resolution));
        assert.equal(result.state, state);
    }
});

test('a real player decision remains a decision rather than an autonomous NPC outcome', async () => {
    const playable = [{ ...entry().playable[0], resolution: { owner: 'player', endpoint: 'Whether User accepts the offered place in the duet remains undecided.' } }];
    const result = await plan(emptyCampaign(), body([{ id: 'music', playable }]));
    assert.equal(result.accepted, true, result.error);
    const packet = JSON.parse(campaignPayload(result.state).replace(/<\/?tale-fairy-context>/g, '').trim());
    assert.equal(packet.playable_situations[0].player_decision, playable[0].resolution.endpoint);
    assert.equal('npc_resolution' in packet.playable_situations[0], false);
    assert.deepEqual(result.state.realization.music.episodes, {});
});

test('world events have a bounded result without pretending an NPC owns them', async () => {
    const playable = [{ episodeId: 'rain', when: 'If the river rises during accepted rainfall.', situation: 'Water reaches the lower landing.',
        resolution: { owner: 'world', endpoint: 'The lowest steps are submerged; the upper landing remains usable.' } }];
    const result = await plan(emptyCampaign(), body([{ id: 'music', playable }]));
    assert.equal(result.accepted, true, result.error);
    const packet = campaignPayload(result.state);
    assert.match(packet, /world_result/);
    assert.doesNotMatch(packet, /npc_resolution|actors|player_decision/);
});

test('old saved situations remain readable and request a resolution review without deleting their subjects', async () => {
    const first = await plan(emptyCampaign(), body([{ id: 'music', playable: entry().playable }]));
    const legacy = structuredClone(first.state);
    for (const p of legacy.realization.music.playable) delete p.resolution;
    assert.equal(validCampaignState(legacy), true);
    assert.equal(needsPlayableReview(legacy.realization.music), true);
    const payload = JSON.parse(ownedInput({ state: legacy, reference: {}, messages }).prompt);
    assert.deepEqual(payload.previous_preparation.playable_review_required_ids, ['music']);
    assert.equal(payload.previous_preparation.reframe_required, false);
    assert.match(campaignPayload(legacy), /REPEATED INTRODUCTION/);
    const unchanged = await plan(legacy, { ...body([]), developments: [] });
    assert.equal(unchanged.accepted, true, unchanged.error);
    assert.deepEqual(unchanged.state.realization, legacy.realization);
    const completed = entry(); delete completed.playable;
    const progressOnly = await plan(legacy, { ...body([completed]), developments: [] });
    assert.equal(progressOnly.accepted, true, progressOnly.error);
    assert.doesNotMatch(campaignPayload(progressOnly.state), /REPEATED INTRODUCTION/);
    assert.equal(progressOnly.state.developments[0].id, 'music');
});

test('resolution schema rejects extra writing-style and turn-quota controls', async () => {
    for (const extra of [{ writing_style: 'cinematic' }, { max_replies: 2 }]) {
        const playable = [{ ...entry().playable[0], resolution: { ...entry().playable[0].resolution, ...extra } }];
        const result = await plan(emptyCampaign(), body([{ id: 'music', playable }]));
        assert.equal(result.accepted, false);
        assert.match(result.error, /unexpected|unknown|Unsupported|undeclared/i);
    }
});

test('descriptive NPC roles and shorter result names do not invalidate a complete plan', async () => {
    const raw = body([{ id: 'music', playable: [{ ...entry().playable[0],
        resolution: { owner: 'npc', actors: ['village choirmaster', 'accompanist'],
            endpoint: 'The choirmaster and accompanist finish the rehearsal and record the revised harmony.' } }] }]);
    raw.developments[0] = { ...subject, initiative: { ...subject.initiative,
        owner: 'the village choirmaster and the visiting accompanist leading the rehearsal' } };
    let calls = 0;
    const result = await ownedPass({ state: emptyCampaign(), input: ownedInput({ state: emptyCampaign(), reference: {}, messages }), source,
        generate: async () => { calls++; return { text: JSON.stringify(raw) }; } });
    assert.equal(result.accepted, true, result.error);
    assert.equal(calls, 1);
    assert.match(campaignPayload(result.state), /finish the rehearsal/);
    assert.deepEqual(result.state.realization.music.episodes, {});
});

test('another NPC can finish substantive work within an undertaking without owning the whole subject', async () => {
    const playable = [{ ...entry().playable[0], situation: 'Mara tests the revised harmony on the piano and writes out the corrected part.',
        resolution: { owner: 'npc', actors: ['Mara'], endpoint: 'Mara completes the piano arrangement and leaves the usable score for Jo.' } }];
    const result = await plan(emptyCampaign(), body([{ id: 'music', playable }]));
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.state.developments[0].initiative.owner, 'Jo');
    assert.match(campaignPayload(result.state), /Mara completes/);
    assert.deepEqual(result.state.realization.music.episodes, {});
});
