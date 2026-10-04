// Bounded creative state, not a second continuity database. Historical evidence
// and replaced plans belong in local archives, never in this request snapshot.
import { conservativeTokenCount } from './token-budget.js';
import { TRAJECTORIES_SCHEMA, validateTrajectories, THROUGHLINE_SCHEMA, validateThroughline, STORY_LIFE_SCHEMA, validateStoryLife } from './story-progression.js?story-progression=1&story-workshop=1&story-throughline=1&story-life=1';
import { OUTLOOK_SCHEMA, validateOutlook, validateOutlookSelection } from './story-outlook.js?story-outlook=1&story-throughline=1&story-life=1&future-entry=1';

export const WORKING_PLAN_VERSION = 1;
// Historical export names are retained for callers; these are sizing targets,
// not validity checks. Schema, evidence and ownership checks remain mandatory.
export const PLANNER_INPUT_LIMIT = 10000;
export const WORKING_PLAN_LIMIT = 1200;
export const SELECTED_PACKET_LIMIT = 600;
export const PLANNER_OUTPUT_LIMIT = 3000;
export const RP_UNDERSTANDING_LIMIT = 300;
export const planTokens = value => conservativeTokenCount(JSON.stringify(value));
export function plannerInputLimit(value = PLANNER_INPUT_LIMIT) {
    if (!Number.isFinite(value) || value <= 0) throw Error('Planner input budget must be a finite positive token count.');
    return Math.min(PLANNER_INPUT_LIMIT, Math.floor(value));
}

const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const list = (items, maxItems) => ({ type: 'array', maxItems, items });
const choice = values => ({ type: 'string', enum: values });
export const RP_UNDERSTANDING_SCHEMA = object({
    basis: choice(['original', 'franchise', 'mixed', 'unclear']),
    setting: text(120),
    canonIntent: choice(['follow', 'flexible', 'alternate', 'unspecified', 'not-applicable']),
    divergence: choice(['none-established', 'local', 'major', 'unclear', 'not-applicable']),
    anchors: text(200),
    departures: text(200),
    storyScope: text(150),
    experiences: text(180),
    independentSource: text(150),
    uncertainty: text(160),
});
// Older saved analyses lack these two fields. Keep them readable until the next
// provider pass supplies a complete story map; new responses require both.
RP_UNDERSTANDING_SCHEMA.required = RP_UNDERSTANDING_SCHEMA.required
    .filter(key => key !== 'storyScope' && key !== 'independentSource');
export const WORKING_PLAN_SCHEMA = object({
    direction: text(600),
    threads: text(600),
    consequences: list(object({ id: text(64), text: text(400) }), 4),
    developments: list(object({
        id: text(80), kind: { type: 'string', enum: ['arc', 'side', 'emerging'] },
        owner: text(160), control: { type: 'string', enum: ['npc', 'world'] },
        question: text(280), initiative: text(400), resolution: text(350), beyond: text(350),
        access: object({ route: { type: 'string', enum: ['none', 'direct', 'local', 'contact', 'information', 'investigation'] }, basis: text(300) }),
    }), 4),
});
// Older saved plans remain valid without analysis. New provider responses require
// it explicitly; no fabricated default or destructive state migration is needed.
WORKING_PLAN_SCHEMA.properties = { rpUnderstanding: RP_UNDERSTANDING_SCHEMA, ...WORKING_PLAN_SCHEMA.properties };
// Optional on disk for older preparations; every new planner response chooses
// writer-owned goals, or explicitly leaves room for unsteered play.
WORKING_PLAN_SCHEMA.properties.goal = list(object({
    subjectId: text(80), aim: text(240), reachedWhen: text(180),
}), 4);
// Scope is optional only for historical single-goal preparation. New responses
// distinguish longer direction, nearer goals and independent side threads.
WORKING_PLAN_SCHEMA.properties.goal.items.properties.scope = choice(['long-term', 'near-term', 'side-thread']);
// Optional only on historical preparations. The routine pass merges progression
// patches before validating the complete saved plan.
WORKING_PLAN_SCHEMA.properties.trajectories = TRAJECTORIES_SCHEMA;
WORKING_PLAN_SCHEMA.properties.throughline = THROUGHLINE_SCHEMA;
WORKING_PLAN_SCHEMA.properties.storyLife = STORY_LIFE_SCHEMA;
WORKING_PLAN_SCHEMA.properties.developments.items.properties.trajectoryIds = list(text(80), 3);
// Present routes into wider preparation have their own capacity. They are
// offers, not accepted undertakings, and are reconsidered rather than carried
// as unfinished work. Optional on disk for pre-bridge preparations.
WORKING_PLAN_SCHEMA.properties.openings = list(object({
    trajectoryId: text(80),
    circumstance: text(700),
    access: structuredClone(WORKING_PLAN_SCHEMA.properties.developments.items.properties.access),
}), 2);
// Additive versioning keeps historical plans and regeneration packets readable.
// Current scene grounding and access reasoning never supply the new surface.
WORKING_PLAN_SCHEMA.properties.futureEntryVersion = { type: 'integer', enum: [1] };
WORKING_PLAN_SCHEMA.properties.openings.items.properties.futureEntry = object({
    prerequisite: { ...text(300), description: 'Only the fictional time, place or participation condition needed to encounter this future. Eventual access does not mean it happens now.' },
    possibility: { ...text(700), description: 'Concrete forthcoming encounter, undertaking or changed circumstance added beyond accepted play. Not current status, unfinished immediate work, access reasoning or writer instructions.' },
});
WORKING_PLAN_SCHEMA.properties.outlook = OUTLOOK_SCHEMA;

export function playableDevelopments(plan) {
    return [...plan.developments, ...(plan.openings || []).map(opening => {
        const trajectory = plan.trajectories?.find(row => row.id === opening.trajectoryId);
        if (!trajectory) throw Error('Opening requires a retained trajectory');
        return { id: trajectory.id, kind: 'emerging', owner: trajectory.owner, control: 'world',
            question: trajectory.focus, initiative: opening.circumstance,
            resolution: trajectory.next.when, beyond: trajectory.next.change, access: opening.access };
    })];
}

export function validateWorkingPlan(plan, check, playerNames = []) {
    check(plan, WORKING_PLAN_SCHEMA, '$.plan');
    if (plan.rpUnderstanding) {
        const rp = plan.rpUnderstanding;
        if (rp.basis === 'original' && (rp.canonIntent !== 'not-applicable' || rp.divergence !== 'not-applicable')) {
            throw Error('Original RP has no external canon policy or divergence');
        }
        if (rp.basis !== 'original' && (rp.canonIntent === 'not-applicable' || rp.divergence === 'not-applicable')) {
            throw Error('Non-original or unclear RP must state canon uncertainty rather than not-applicable');
        }
    }
    for (const rows of [plan.developments, plan.consequences]) {
        if (new Set(rows.map(row => row.id)).size !== rows.length) throw Error('Duplicate working-plan id');
    }
    const openings = plan.openings || [];
    if (plan.futureEntryVersion === 1 && openings.some(row => !row.futureEntry
        || !row.futureEntry.prerequisite.trim() || !row.futureEntry.possibility.trim())) {
        throw Error('Versioned openings require a separate, nonempty future entry');
    }
    const openingIds = openings.map(row => row.trajectoryId);
    if (new Set(openingIds).size !== openings.length
        || plan.developments.some(row => openingIds.includes(row.id))) throw Error('Duplicate playable subject id');
    const playable = playableDevelopments(plan);
    if (plan.goal?.some(goal => !playable.some(d => d.id === goal.subjectId))) {
        throw Error('Story goal requires a retained development');
    }
    if (plan.goal?.length > 1 && plan.goal.some(goal => !goal.scope)) throw Error('Multiple story goals require scope');
    const goals = plan.goal || [];
    if (new Set(goals.map(goal => JSON.stringify([goal.subjectId, goal.scope]))).size !== goals.length) {
        throw Error('Duplicate story goal for the same development and scope');
    }
    const players = new Set(playerNames.map(name => name.trim().toLocaleLowerCase()));
    if (plan.developments.some(row => players.has(row.owner.trim().toLocaleLowerCase()))) throw Error('Player cannot own a planned initiative');
    validateTrajectories(plan.trajectories || [], check, playerNames);
    validateThroughline(plan, check);
    validateStoryLife(plan, check);
    const trajectories = new Set((plan.trajectories || []).map(row => row.id));
    for (const row of plan.developments) {
        const ids = row.trajectoryIds || [];
        if (new Set(ids).size !== ids.length || ids.some(id => !trajectories.has(id))) {
            throw Error('Development links require distinct retained trajectories');
        }
    }
    validateOutlook(plan, check);
}

// Compatibility projection for the existing writer, inspector and persistence
// guards. This is not another prompt or another provider response.
export function workingPlanProjection(plan) {
    const playable = playableDevelopments(plan);
    return {
        campaign: plan.direction,
        episode: { subject: 'Current working plan', status: plan.developments.some(d => d.kind === 'arc') ? 'open' : 'finished',
            boundary: plan.developments.filter(d => d.kind === 'arc').map(d => d.question).join('; ') || 'No foreground undertaking; quiet play and other directions remain available.' },
        rpBrief: plan.threads,
        developments: playable.map(d => ({ id: d.id,
            initiative: { owner: d.owner, control: d.control, aim: d.question },
            premise: [{ event: d.initiative, opens: d.beyond }],
            progression: d.initiative, outcomes: d.resolution, access: d.access.basis })),
        background: playable.map(d => ({ subjectId: d.id, unfolding: d.initiative,
            basis: 'Creative preparation, not accepted history. Actual circumstances govern enactment.', access: structuredClone(d.access) })),
    };
}

export function validateWorkingState(state, check) {
    if (state.workingPlanVersion !== WORKING_PLAN_VERSION) throw Error('Unknown working-plan version');
    validateWorkingPlan(state.workingPlan, check);
    validateGoalSelection(state.workingPlan, state.selectedMaterial);
    for (const [key, value] of Object.entries(workingPlanProjection(state.workingPlan))) {
        if (JSON.stringify(state[key]) !== JSON.stringify(value)) throw Error(`Working-plan projection mismatch: ${key}`);
    }
    const evidence = state.planEvidence;
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)
        || Object.keys(evidence).length !== state.workingPlan.consequences.length) throw Error('Invalid plan evidence');
    for (const fact of state.workingPlan.consequences) {
        const record = Object.hasOwn(evidence, fact.id) ? evidence[fact.id] : null;
        if (record?.text !== fact.text || !record.source
            || !Number.isSafeInteger(record.source.messageCount) || record.source.messageCount < 0
            || !['chatId', 'referenceHash', 'fingerprint'].every(key => typeof record.source[key] === 'string' && record.source[key])
            || !Array.isArray(record.witnesses) || !record.witnesses.length || record.witnesses.length > 3
            || record.witnesses.some(w => !Number.isSafeInteger(w.index) || w.index < 0 || typeof w.quote !== 'string' || !w.quote.trim())) {
            throw Error('Working consequence needs saved witnesses');
        }
    }
}

export function validateGoalSelection(plan, material) {
    validateOutlookSelection(plan, material);
    if (plan.goal === undefined) return; // Historical preparation, not a new response.
    if (material?.length && !plan.goal.some(goal => material[0].subjectIds.includes(goal.subjectId))) {
        throw Error('Selected material must advance at least one chosen story goal');
    }
    // Historical single-goal states used a mandatory handoff. Scoped goals may
    // remain saved during deliberate rest even when a discovery route exists.
    if (!material?.length && plan.goal.some(goal => !goal.scope
        && playableDevelopments(plan).some(d => d.id === goal.subjectId && d.access.route !== 'none'))) {
        throw Error('An accessible story goal needs selected material for the writer');
    }
}
