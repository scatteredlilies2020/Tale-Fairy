import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { FUTURE_CAUSAL_RULES } from '../extension/future-causality.js';
import { emptyFuture, futureInput, futurePass, futureForDirector, FUTURE_SYSTEM, FUTURE_SCHEMA } from '../extension/future-planner.js';
import { directorInput, DIRECTOR_SYSTEM } from '../extension/story-director.js';
import { emptyCampaign, campaignPayload } from '../extension/campaign-planner.js';

const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const prospect = (id, title, premise, notes = {}) => ({ id, title, premise, category: 'Original',
    pressures: [], favors: '', prevents: '', transition: '', timing: '', outlook: '', ...notes });

test('both planners share causal alternatives without forced convergence, canon destiny or anthropomorphism', () => {
    for (const system of [FUTURE_SYSTEM, DIRECTOR_SYSTEM]) {
        assert.ok(system.includes(FUTURE_CAUSAL_RULES));
        for (const clause of ['branch, converge, coexist or stay independent', 'neither has priority',
            'Supported different causes may yield a similar event', 'Prevention needs no replacement crisis',
            'not an activation queue', 'Possibilities are not history or verified predictions',
            'respect simulation mechanisms without inventing non-agent motives']) {
            assert.ok(system.includes(clause), clause);
        }
    }
    for (const clause of ['premise, tone, scale, time horizon and established rules',
        'hypothetical developments are not verified predictions or accepted results',
        'A proposed link is not evidence', 'Player choices and accepted outcomes remain open']) {
        assert.ok(FUTURE_SYSTEM.includes(clause), clause);
    }
    assert.match(FUTURE_SYSTEM, /do not add human motives to non-agent processes/);
    assert.match(FUTURE_SYSTEM, /Preservation is not priority/);
    assert.match(DIRECTOR_SYSTEM, /adopt any fitting prospect or none/);
    assert.doesNotMatch(FUTURE_SYSTEM, /anime arcs|Missing Winter Convoys/);
});

// Scripted fixtures exercise the real input/save/current-guide boundary, not a
// claim that a live model reliably reasons this way in every genre.
const fixtures = [
    ['cozy bookshop', 'Quiet bookshop RP; no obligatory crime or disaster.', 'The shelves are repaired; the reading circle is still optional.',
        'A shared reading season', 'Local readers could develop a shared reading circle.',
        'Interest could grow through existing friends or a public invitation.', 'Little interest may leave the shop peaceful without a replacement problem.'],
    ['intimate relationship', 'One-on-one relationship RP; player consent and choices remain open.', 'The pair discussed moving closer but made no decision.',
        'A changing everyday rhythm', 'Shared routines could bring closeness or clarify a desire for more space.',
        'Different conversations may lead to a similar arrangement.', 'Neither person must commit; independent interests can continue.'],
    ['science fiction exploration', 'Exploration of an uninhabited moon; no assumed alien factions.', 'A probe found an accessible ice layer; its composition is unknown.',
        'An ice-layer study', 'The crew could study the ice through surface sampling or remote sensing.',
        'Either route might reveal a useful research question.', 'Poor measurements may leave uncertainty rather than reveal a threat.'],
    ['horror', 'An explicitly supernatural horror RP with uncertain manifestations.', 'The house is sealed; no manifestation has been confirmed outside it.',
        'The sealed house revisited', 'Later evidence might support investigating whether the sealing endured.',
        'Only established supernatural rules can support another route.', 'An effective seal can truly end this danger; horror does not require its return.'],
    ['historical counterfactual', 'A counterfactual diplomatic simulation constrained by supplied treaty rules.', 'The envoys extended the truce; ratification remains undecided.',
        'A treaty ratification period', 'A longer truce may create opportunities for agreement or durable neutrality.',
        'Trade interests and independent negotiations may converge on peace.', 'Different national incentives may keep these paths separate.'],
    ['nonhuman ecology', 'Wetland simulation; use supplied ecological mechanisms, not intentional plants.', 'Water levels have stabilized; seed-bank viability is not established.',
        'A possible recovery phase', 'Wetland cover might recover from a viable seed bank or incoming dispersal.',
        'Supported recovery mechanisms could converge on similar vegetation.', 'Stable water alone does not establish regeneration or its eventual composition.'],
    ['logistics simulation', 'Factory logistics simulation; capacity and inventory facts constrain possibilities.', 'One supplier recovered; the transport bottleneck persists.',
        'A distribution adjustment', 'Transport changes might improve throughput even without new suppliers.',
        'Supplier recovery and routing changes can act independently or combine.', 'No capacity increase or demand surge is assumed to have happened.'],
    ['short sports practice', 'A single-afternoon sports practice RP; no compulsory tournament or injury.', 'The team completed its warm-up and has time for one optional exercise.',
        'A practice experiment', 'Players could explore passing or positioning during the remaining practice.',
        'Either exercise may support coordination through different skills.', 'They can finish peacefully instead; no time jump or crisis is required.'],
];

for (const [name, premise, accepted, title, proposal, favors, prevents] of fixtures) {
    test(`causal future transport preserves ${name} constraints, alternatives and writer isolation`, async () => {
        const current = emptyCampaign(), before = structuredClone(current), writer = campaignPayload(current);
        const messages = [{ is_user: false, mes: accepted }], reference = { premise };
        const snapshot = { state: emptyFuture(), chatId: name, referenceHash: fingerprint(reference), messages,
            receipts: [], futureOptions: { capacity: 6, includeCanon: false } };
        const common = directorInput({ state: current, reference,
            messages: [{ index: 0, role: 'assistant', content: accepted }], futurePlanning: true });
        const input = futureInput(common, snapshot, fingerprint);
        const cards = [prospect('f1-development', title, proposal, { favors, prevents }),
            prospect('f1-independent', 'Independent continuity', 'Established activity can continue separately, if it remains fitting.',
                { transition: 'No causal connection to the other prospect is assumed.', outlook: 'Simultaneous development is possible, not required.' })];
        const order = [cards[1].id, cards[0].id]; let calls = 0;
        const result = await futurePass({ state: snapshot.state, input,
            source: { chatId: snapshot.chatId, referenceHash: snapshot.referenceHash, messageCount: 1, fingerprint: fingerprint(messages) },
            generate: async (prompt, system, schema) => {
                calls++;
                assert.ok(prompt.includes(premise)); assert.ok(prompt.includes(accepted));
                assert.equal(system, FUTURE_SYSTEM); assert.equal(schema, FUTURE_SCHEMA);
                return { text: JSON.stringify({ upsert: cards, retain: [], retire: [], order }), finishReason: 'stop' };
            } });
        assert.equal(result.accepted, true, result.error); assert.equal(calls, 1);
        const active = futureForDirector(result.state, snapshot, fingerprint, [], snapshot.futureOptions);
        assert.deepEqual(active, [cards[1], cards[0]]);
        const next = directorInput({ state: current, reference, messages: [], futureCards: active });
        assert.deepEqual(JSON.parse(next.prompt).private_future, active, 'notes and uncertainty reach only the current guide');
        assert.deepEqual(current, before); assert.equal(campaignPayload(current), writer);
        assert.ok(!writer.includes(title)); assert.ok(!writer.includes(favors));
    });
}

test('hypothetical Riliane routes can change causes, lead elsewhere or disappear without replacement', async () => {
    const current = emptyCampaign(), reference = { premise: 'Hypothetical good-queen Riliane RP; no fixed revolution or outcome.' };
    const messages = [{ is_user: false, mes: 'Riliane governs benevolently, but retained corrupt officials still divert relief.' }];
    let state = emptyFuture();
    const run = async (cards, retire = []) => {
        const snapshot = { state, chatId: 'queen', referenceHash: 'ref', messages, receipts: [],
            futureOptions: { capacity: 6, includeCanon: true } };
        const common = directorInput({ state: current, reference,
            messages: messages.map((m, index) => ({ index, role: 'assistant', content: m.mes })), futurePlanning: true });
        const result = await futurePass({ state, input: futureInput(common, snapshot, fingerprint),
            source: { chatId: 'queen', referenceHash: 'ref', messageCount: messages.length, fingerprint: fingerprint(messages) },
            generate: async () => ({ text: JSON.stringify({ upsert: cards, retain: [], retire, order: cards.map(c => c.id) }) }) });
        assert.equal(result.accepted, true, result.error); state = result.state;
    };
    const canon = prospect('f1-revolution', 'A possible Lucefenian Revolution', 'Unresolved grievances might sustain unrest despite benevolent royal intentions.',
        { category: 'Canon', favors: 'Officials continue diverting relief; this is a possible different causal route.',
            prevents: 'Effective reforms could remove the grievances; the revolution is not destined.' });
    await run([canon]);
    messages.push({ is_user: false, mes: 'The corrupt officials were removed and relief restored. Displaced patrons are discussing legal opposition.' });
    const changed = { ...canon, favors: '', prevents: 'The known grievance mechanism has been removed.',
        outlook: 'Reassess surviving support, not invented substitute causes.' };
    const distinct = prospect('f2-opposition', 'A new political association', 'Displaced patrons could seek lawful influence rather than revolutionary violence.',
        { transition: 'The reform aftermath could open a different political path.', prevents: 'The patrons might abandon the project.' });
    await run([distinct, changed]);
    assert.equal(state.cards[1].id, canon.id, 'a changed route can retain identity');
    assert.equal(state.cards[0].category, 'Original', 'a genuinely different situation has its own identity');
    messages.push({ is_user: false, mes: 'The settlement addressed the remaining grievances and the patrons abandoned their association.' });
    await run([], [canon.id, distinct.id]);
    assert.deepEqual(state.cards, []); assert.deepEqual(state.parkedCanon, []);
    assert.equal(state.withdrawn.length, 2, 'retirement is not confirmation that proposed events occurred');
    assert.equal(current.revision, 0, 'future proposals cannot rewrite current play');
});
