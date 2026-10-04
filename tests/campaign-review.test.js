import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignReviewedCount, campaignCheckpoint, verifiedClosedSubjects } from '../extension/campaign-review.js';
import { emptyCampaign, EVENT_POINTS_FORMAT, validCampaignState } from '../extension/campaign-planner.js';
import { workingPlanProjection, WORKING_PLAN_VERSION } from '../extension/working-plan.js';
import { originalUnderstanding } from './helpers/rp-fixtures.js';

const messages = Array.from({ length: 20 }, (_, index) => ({ is_user: index % 2 === 1, mes: `Accepted ${index}` }));
const context = { chatId: 'chat', referenceHash: 'reference', messages, fingerprint: JSON.stringify };
function preparation(count, revision = 1) {
    const plan = { direction: 'Open travel.', threads: 'Shared work.', consequences: [], developments: [] };
    return { ...workingPlanProjection(plan), revision, archive: [], workingPlanVersion: WORKING_PLAN_VERSION,
        preparationFormat: EVENT_POINTS_FORMAT, workingPlan: plan, planEvidence: {}, selectedMaterial: [],
        source: { chatId: context.chatId, referenceHash: context.referenceHash,
            messageCount: count, fingerprint: JSON.stringify(messages.slice(0, count)) } };
}
function archived(state) {
    const { revision, source, workingPlan, planEvidence, selectedMaterial } = state;
    return { revision, source, workingPlan, planEvidence, selectedMaterial, replaced: true, transitions: [] };
}

test('complete archived checkpoints survive rewinds and nested rebuilds without restoring plans', () => {
    const prior = preparation(8), later = preparation(16, 2);
    assert.equal(validCampaignState(prior), true);
    later.archive.push(archived(prior));
    const state = { ...emptyCampaign(), archive: [{ preparation: later, rebuild: true }] };
    const before = structuredClone(state);
    assert.equal(campaignReviewedCount(state, context), 16);
    assert.equal(campaignReviewedCount(state, { ...context, messages: messages.slice(0, 12) }), 8);
    const edited = structuredClone(messages); edited[12].mes = 'A changed branch.';
    assert.equal(campaignReviewedCount(state, { ...context, messages: edited }), 8);
    edited[4].mes = 'An earlier change.';
    assert.equal(campaignReviewedCount(state, { ...context, messages: edited }), 0);
    assert.deepEqual(state, before);
});

test('RP analysis upgrades retain old and new review checkpoints without replaying the backlog', () => {
    const old = preparation(8), current = preparation(16, 2);
    current.workingPlan.rpUnderstanding = originalUnderstanding();
    current.archive.push(archived(old));
    assert.equal(validCampaignState(current), true);
    assert.equal(campaignReviewedCount(current, context), 16);
    assert.equal(campaignReviewedCount(current, { ...context, messages: messages.slice(0, 12) }), 8);
    const rebuilt = { ...emptyCampaign(), archive: [{ preparation: current, rebuild: true }] };
    assert.equal(campaignReviewedCount(rebuilt, context), 16);
    assert.equal(campaignReviewedCount(rebuilt, { ...context, messages: messages.slice(0, 12) }), 8);
});

test('coverage requires a complete valid preparation and matching chat, reference and exact prefix', () => {
    const prior = preparation(8), state = { ...emptyCampaign(), archive: [archived(prior)] };
    for (const patch of [{ chatId: 'different' }, { referenceHash: 'changed' }]) {
        assert.equal(campaignReviewedCount(state, { ...context, ...patch }), 0);
    }
    for (const source of [{ ...prior.source, fingerprint: 'tampered' }, { ...prior.source, messageCount: 21 },
        { ...prior.source, messageCount: 1.5 }]) {
        assert.equal(campaignReviewedCount({ ...state, archive: [{ ...archived(prior), source }] }, context), 0);
    }
    assert.equal(campaignReviewedCount({ ...state, archive: [{ source: prior.source, retirement: { id: 'old' } }] }, context), 0);
    const broken = archived(prior); broken.workingPlan = { ...prior.workingPlan, direction: 7 };
    assert.equal(campaignReviewedCount({ ...state, archive: [broken] }, context), 0);
});

test('newer invalid snapshots do not mask older valid ones and repeated prefixes are hashed once', () => {
    const prior = preparation(8), broken = preparation(16, 2);
    broken.planEvidence = null;
    broken.archive = [archived(prior), archived(prior)];
    const calls = [];
    assert.equal(campaignReviewedCount(broken, { ...context, fingerprint: rows => {
        calls.push(rows.length); return JSON.stringify(rows);
    } }), 8);
    assert.deepEqual(calls, [16, 8]);
});

test('a valid active preparation keeps its own review boundary even with later archived branches', () => {
    const active = preparation(8);
    active.archive = [{ preparation: preparation(16, 2), rebuild: true }];
    assert.equal(campaignReviewedCount(active, context), 8);
});

test('checkpoint recovery returns the newest exact preparation without rewriting its source or live revision', () => {
    const early = preparation(8), newer = preparation(12, 2), latest = preparation(12, 3), discarded = preparation(20, 4);
    discarded.archive = [archived(latest), archived(early), archived(newer)];
    const before = structuredClone(discarded), prefix = { ...context, messages: messages.slice(0, 16) };
    const checkpoint = campaignCheckpoint(discarded, prefix);
    assert.equal(checkpoint.revision, 3);
    assert.deepEqual(checkpoint.source, latest.source);
    assert.deepEqual(checkpoint.workingPlan, latest.workingPlan);
    assert.equal(validCampaignState(checkpoint), true);
    assert.deepEqual(discarded, before);
    assert.equal(campaignCheckpoint(discarded, { ...prefix, referenceHash: 'changed' }), null);
});

test('closure guards follow accepted prefixes rather than discarded assistant outcomes, including rebuild archives', () => {
    const accepted = preparation(8), discarded = preparation(16, 2);
    accepted.archive.push({ transitions: [
        { id: 'closed', disposition: 'closed', source: accepted.source },
        { id: 'changed', disposition: 'changed', source: accepted.source },
        { id: 'paused', disposition: 'paused', source: accepted.source },
        { id: 'unverified', disposition: 'closed' },
    ] });
    discarded.archive = [{ preparation: accepted, rebuild: true }, { transitions: [
        { id: 'discarded-closure', disposition: 'closed', source: discarded.source },
    ] }];
    const state = { ...emptyCampaign(), archive: [{ preparation: discarded, rebuild: true },
        null, { preparation: { archive: {} } }, { transitions: {} }, { transitions: [null] }] };
    assert.deepEqual(verifiedClosedSubjects(state, context).sort(), ['changed', 'closed', 'discarded-closure']);
    assert.deepEqual(verifiedClosedSubjects(state, { ...context, messages: messages.slice(0, 12) }).sort(), ['changed', 'closed']);
    const edited = structuredClone(messages); edited[12].mes = 'A different outcome.';
    assert.deepEqual(verifiedClosedSubjects(state, { ...context, messages: edited }).sort(), ['changed', 'closed']);
    assert.deepEqual(verifiedClosedSubjects(state, { ...context, referenceHash: 'changed' }), []);
});
