// Bounded creative state, not a second continuity database. Historical evidence
// and replaced plans belong in local archives, never in this request snapshot.
import { conservativeTokenCount } from './token-budget.js';

export const WORKING_PLAN_VERSION = 1;
export const PLANNER_INPUT_LIMIT = 8000;
export const WORKING_PLAN_LIMIT = 1200;
export const SELECTED_PACKET_LIMIT = 600;
export const PLANNER_OUTPUT_LIMIT = 3000;
export const planTokens = value => conservativeTokenCount(JSON.stringify(value));
export function plannerInputLimit(value = PLANNER_INPUT_LIMIT) {
    if (!Number.isFinite(value) || value <= 0) throw Error('Planner input budget must be a finite positive token count.');
    return Math.min(PLANNER_INPUT_LIMIT, Math.floor(value));
}

const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const list = (items, maxItems) => ({ type: 'array', maxItems, items });
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

export function validateWorkingPlan(plan, check, playerNames = []) {
    check(plan, WORKING_PLAN_SCHEMA, '$.plan');
    for (const rows of [plan.developments, plan.consequences]) {
        if (new Set(rows.map(row => row.id)).size !== rows.length) throw Error('Duplicate working-plan id');
    }
    const players = new Set(playerNames.map(name => name.trim().toLocaleLowerCase()));
    if (plan.developments.some(row => players.has(row.owner.trim().toLocaleLowerCase()))) throw Error('Player cannot own a planned initiative');
    if (planTokens(plan) > WORKING_PLAN_LIMIT) throw Error(`Working plan exceeds ${WORKING_PLAN_LIMIT} tokens; saved preparation is intact.`);
}

// Compatibility projection for the existing writer, inspector and persistence
// guards. This is not another prompt or another provider response.
export function workingPlanProjection(plan) {
    return {
        campaign: plan.direction,
        episode: { subject: 'Current working plan', status: plan.developments.some(d => d.kind === 'arc') ? 'open' : 'finished',
            boundary: plan.developments.filter(d => d.kind === 'arc').map(d => d.question).join('; ') || 'No foreground undertaking; quiet play and other directions remain available.' },
        rpBrief: plan.threads,
        developments: plan.developments.map(d => ({ id: d.id,
            initiative: { owner: d.owner, control: d.control, aim: d.question },
            premise: [{ event: d.initiative, opens: d.beyond }],
            progression: d.initiative, outcomes: d.resolution, access: d.access.basis })),
        background: plan.developments.map(d => ({ subjectId: d.id, unfolding: d.initiative,
            basis: 'Creative preparation, not accepted history. Actual circumstances govern enactment.', access: structuredClone(d.access) })),
    };
}

export function validateWorkingState(state, check) {
    if (state.workingPlanVersion !== WORKING_PLAN_VERSION) throw Error('Unknown working-plan version');
    validateWorkingPlan(state.workingPlan, check);
    for (const [key, value] of Object.entries(workingPlanProjection(state.workingPlan))) {
        if (JSON.stringify(state[key]) !== JSON.stringify(value)) throw Error(`Working-plan projection mismatch: ${key}`);
    }
    if (planTokens(state.selectedMaterial) > SELECTED_PACKET_LIMIT) throw Error('Selected packet exceeds its token limit');
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
