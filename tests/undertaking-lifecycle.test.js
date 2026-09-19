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
    playable: [{ episodeId, when: 'If a shared practice occurs.', direction: 'REPEATED INTRODUCTION', middle: 'Different preferences could change the arrangement.', future: 'If shared work continues, a distinct repertoire could develop.' },
        { episodeId: 'new-arrangement', when: 'If another shared session occurs.', direction: 'Explore how a counterline could change the shared musical identity.', middle: 'Changing contributions could open different forms across later collaborations.', future: 'If the musicians keep working together, their repertoire could develop a recognizable shared voice or diverging styles.' }] });
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

test('ongoing participation adds exact witnesses without undoing achieved partial progress', () => {
    const previous = mergeRealization({}, [entry('partial')], { subjects: ['music'], messages, source });
    const newer = { index: 1, role: 'assistant', name: 'Jo', content: 'Jo and Sef continue trying the revised rhythm in private.' };
    const update = { id: 'music', changes: [{ episodeId: 'duet', status: 'participating',
        evidence: [{ index: 1, quote: newer.content }] }], playable: [] };
    const options = { subjects: ['music'], messages: [...messages, newer], source: { ...source, messageCount: 2 } };
    const next = mergeRealization(previous, [update], options);
    assert.equal(next.music.episodes.duet.status, 'partial');
    assert.deepEqual(next.music.episodes.duet.witnesses.map(w => w.quote), [messages[0].content, newer.content]);
    assert.equal(previous.music.episodes.duet.witnesses.length, 1, 'the prior state is not mutated');
    assert.deepEqual(mergeRealization(next, [update], options), next, 'an echoed continuation is idempotent');

    const restart = structuredClone(update); restart.changes[0].status = 'introduced';
    assert.throws(() => mergeRealization(next, [restart], options), /restart or regress/);
    const invented = structuredClone(update); invented.changes[0].evidence[0].quote = 'They performed in public.';
    assert.throws(() => mergeRealization(next, [invented], options), /exact supplied/);
});

test('continuations keep the achieved witness and bounded latest evidence; closed episodes stay closed', () => {
    let state = mergeRealization({}, [entry('partial')], { subjects: ['music'], messages, source });
    const all = [...messages];
    for (let index = 1; index <= 8; index++) {
        const content = `Private reading number ${index} is in progress.`;
        all.push({ index, role: 'assistant', content });
        const update = { id: 'music', changes: [{ episodeId: 'duet', status: 'participating', evidence: [{ index, quote: content }] }], playable: [] };
        state = mergeRealization(state, [update], { subjects: ['music'], messages: all, source: { ...source, messageCount: all.length } });
        assert.equal(state.music.episodes.duet.status, 'partial');
        assert.equal(state.music.episodes.duet.witnesses[0].quote, messages[0].content);
        assert.equal(state.music.episodes.duet.witnesses.at(-1).quote, content);
        assert.ok(state.music.episodes.duet.witnesses.length <= 4);
    }
    const completed = mergeRealization({}, [entry()], { subjects: ['music'], messages, source });
    const update = { id: 'music', changes: [{ episodeId: 'duet', status: 'participating', evidence: [{ index: 8, quote: all.at(-1).content }] }] };
    assert.throws(() => mergeRealization(completed, [update], { subjects: ['music'], messages: all, source: { ...source, messageCount: all.length } }), /restart or regress/);
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
    invented.changes[0].evidence[0].quote = first.state.realization.music.playable[0].direction;
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
    const update = body([{ id: 'music', selection: 'keep' }]);
    update.developments = [{ ...subject, development: 'The repertoire can support private sessions as well as later collaborations.' }];
    const result = await plan(first.state, update);
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.state.developments[0].progression, update.developments[0].development);
    assert.deepEqual(result.state.realization, first.state.realization);
    assert.equal(campaignPayload(result.state), campaignPayload(first.state));
});


test('progress-only updates preserve evidence but withhold unreviewed remaining options automatically', async () => {
    for (const status of ['partial', 'completed']) {
        const first = await plan(emptyCampaign(), body([{ id: 'music', changes: [], playable: entry().playable }]));
        const change = entry(status); delete change.playable;
        const result = await plan(first.state, { ...body([change]), developments: [] });
        assert.equal(result.accepted, true, result.error);
        assert.equal(result.state.realization.music.episodes.duet.status, status);
        assert.doesNotMatch(campaignPayload(result.state), /REPEATED/);
        assert.equal(campaignPayload(result.state), '');
        assert.equal(result.state.realization.music.needsPlayableReview, true);
        assert.deepEqual(result.state.archive.findLast(a => a.realization).realization, first.state.realization);
        assert.equal(validCampaignState(result.state), true);
        const input = JSON.parse(ownedInput({ state: result.state, reference: {}, messages }).prompt);
        assert.equal(input.previous_preparation.playable_review_required_ids.includes('music'), true);
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
    const explicit = entry('partial'); explicit.playable[0].direction = 'CURRENT REMAINDER';
    const first = await plan(emptyCampaign(), body([explicit]));
    const echo = entry('partial'); delete echo.playable; echo.selection = 'keep';
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

test('guidance requires a substantive middle and future, without forcing an endpoint', async () => {
    const previous = await plan(emptyCampaign(), body([{ id: 'music', playable: entry().playable }]));
    for (const key of ['direction', 'middle', 'future']) {
        const incomplete = structuredClone(entry().playable);
        delete incomplete[0][key];
        let calls = 0;
        const result = await ownedPass({ state: previous.state, input: ownedInput({ state: previous.state, reference: {}, messages }), source,
            generate: async () => { calls++; return { text: JSON.stringify({ ...body([{ id: 'music', playable: incomplete }]), developments: [] }) }; } });
        assert.equal(result.accepted, false);
        assert.match(result.error, new RegExp(key));
        assert.equal(result.state, previous.state);
        assert.equal(calls, 1);
    }
});

test('mid- and long-term guidance reaches the writer and survives reload without becoming progress', async () => {
    const first = await plan(emptyCampaign(), body([{ id: 'music', playable: entry().playable }]));
    assert.equal(first.accepted, true, first.error);
    const saved = saveState({}, { ...defaultPlannerState(), campaignPreparation: first.state });
    const reloaded = loadPlannerState(JSON.parse(JSON.stringify(saved))).campaignPreparation;
    const packet = JSON.parse(campaignPayload(reloaded).replace(/<\/?tale-fairy-context>/g, '').trim());
    assert.equal(packet.long_term_direction, undefined, 'the whole campaign remains private');
    assert.deepEqual(packet.possible_developments, entry().playable.map(p => ({
        source: subject.initiative.owner, when: p.when, premise: p.direction,
        developing_conditions: p.middle, possible_consequences: p.future,
    })));
    assert.deepEqual(reloaded.realization.music.episodes, {});
    const input = JSON.parse(ownedInput({ state: reloaded, reference: {}, messages }).prompt);
    assert.deepEqual(input.accepted_progress, {});
    assert.match(JSON.stringify(input.previous_preparation.playable), /shared musical identity/);
    assert.doesNotMatch(campaignPayload(reloaded), /episodeId|witnesses|resolution|reply_limit|writing_style|maximum replies/);
});

test('new guidance rejects scene scripts, guaranteed resolutions and writer controls', async () => {
    for (const extra of [
        { situation: 'Jo taps twice and hands over the score.' },
        { resolution: { owner: 'npc', actors: ['Jo'], endpoint: 'Jo completes it.' } },
        { resolution: { owner: 'player', endpoint: 'User accepts.' } },
        { writing_style: 'cinematic' }, { max_replies: 2 },
    ]) {
        const result = await plan(emptyCampaign(), body([{ id: 'music', playable: [{ ...entry().playable[0], ...extra }] }]));
        assert.equal(result.accepted, false);
        assert.match(result.error, /unexpected/);
    }
});

test('guidance preserves conditional player involvement without deciding the answer', async () => {
    const playable = [{ ...entry().playable[0],
        when: 'If User elects to collaborate; no commitment is established.',
        direction: 'Explore whether different musical preferences can support a shared repertoire.' }];
    const result = await plan(emptyCampaign(), body([{ id: 'music', playable }]));
    assert.equal(result.accepted, true, result.error);
    assert.match(campaignPayload(result.state), /If User elects/);
    assert.doesNotMatch(campaignPayload(result.state), /player_decision|npc_resolution/);
    assert.deepEqual(result.state.realization.music.episodes, {});
});

test('legacy scene scripts are private immediately and upgraded without losing witnessed progress', async () => {
    const first = await plan(emptyCampaign(), body([entry()]));
    const legacy = structuredClone(first.state);
    legacy.realization.music.playable = [{ episodeId: 'new-arrangement', when: 'At noon.',
        situation: 'SCRIPTED GESTURES AND PROP MOVEMENTS',
        resolution: { owner: 'npc', actors: ['Jo'], endpoint: 'PREDETERMINED RESULT' } }];
    const before = structuredClone(legacy);
    assert.equal(validCampaignState(legacy), true);
    assert.equal(needsPlayableReview(legacy.realization.music), true);
    const payload = JSON.parse(ownedInput({ state: legacy, reference: {}, messages }).prompt);
    assert.deepEqual(payload.previous_preparation.playable_review_required_ids, ['music']);
    assert.equal(payload.previous_preparation.reframe_required, false, 'guidance upgrade must not reset the whole campaign');
    assert.deepEqual(payload.previous_preparation.playable.music, []);
    assert.deepEqual(payload.previous_preparation.legacy_guidance_episode_ids.music, ['new-arrangement']);
    assert.equal(payload.previous_preparation.developments[0].plot_points, undefined);
    assert.doesNotMatch(campaignPayload(legacy), /SCRIPTED|PREDETERMINED|At noon/);
    assert.match(campaignPayload(legacy), /shared repertoire/);
    const unchanged = await plan(legacy, { ...body([]), developments: [] });
    assert.equal(unchanged.accepted, true, unchanged.error);
    assert.equal(campaignPayload(unchanged.state), '', 'unreviewed legacy scripts are withheld automatically');
    assert.deepEqual(unchanged.state.developments, legacy.developments);
    assert.deepEqual(unchanged.state.archive.findLast(a => a.realization).realization, legacy.realization);
    const upgraded = await plan(legacy, { ...body([{ id: 'music', playable: [entry().playable[1]] }]), developments: [] });
    assert.equal(upgraded.accepted, true, upgraded.error);
    assert.deepEqual(upgraded.state.realization.music.episodes, legacy.realization.music.episodes);
    assert.deepEqual(upgraded.state.developments, legacy.developments);
    assert.ok(upgraded.state.archive.some(a => a.realization?.music.playable[0]?.situation === 'SCRIPTED GESTURES AND PROP MOVEMENTS'));
    assert.deepEqual(legacy, before);
});

test('progress-only completion can close a legacy situation without inventing successor guidance', async () => {
    const first = await plan(emptyCampaign(), body([{ id: 'music', playable: entry().playable }]));
    const legacy = structuredClone(first.state);
    legacy.realization.music.playable = [{ episodeId: 'duet', when: 'At noon.', situation: 'OLD SCRIPT' }];
    const completed = entry(); delete completed.playable;
    const result = await plan(legacy, { ...body([completed]), developments: [] });
    assert.equal(result.accepted, true, result.error);
    assert.equal(campaignPayload(result.state), '');
    assert.equal(result.state.developments[0].id, 'music');
});

test('descriptive NPC objectives remain valid without matching names to predetermined results', async () => {
    const raw = body([{ id: 'music', playable: [entry().playable[1]] }]);
    raw.developments[0] = { ...subject, initiative: { ...subject.initiative,
        owner: 'the village choirmaster and the visiting accompanist' } };
    const result = await plan(emptyCampaign(), raw);
    assert.equal(result.accepted, true, result.error);
    assert.match(campaignPayload(result.state), /village choirmaster/);
    assert.deepEqual(result.state.realization.music.episodes, {});
});

test('NPC collaborators can contribute to a direction without prewriting their actions', async () => {
    const playable = [{ ...entry().playable[1],
        middle: 'Mara and Jo have different ideas about harmony; collaboration could change either approach across later sessions.' }];
    const result = await plan(emptyCampaign(), body([{ id: 'music', playable }]));
    assert.equal(result.accepted, true, result.error);
    assert.equal(result.state.developments[0].initiative.owner, 'Jo');
    assert.match(campaignPayload(result.state), /Mara and Jo/);
    assert.deepEqual(result.state.realization.music.episodes, {});
});
