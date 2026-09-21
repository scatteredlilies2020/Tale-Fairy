import { check } from './campaign-planner.js?v=0.14.34&rp-plot=1';

// Reuse durable proposal fields under the same id. Background/access still
// needs a fresh assessment; an incomplete draft must not veto unrelated work.
export function reconcileDevelopments(raw, { state, schema, reusePrevious, playerNames = [] }) {
    const adjustments = [], deferredDevelopments = [];
    let withheldMaterial = 0;
    if (!Array.isArray(raw?.developments)) return { adjustments, deferredDevelopments, withheldMaterial };
    const partial = structuredClone(schema);
    const optional = rule => {
        if (rule.type === 'object') {
            rule.required = [];
            Object.values(rule.properties).forEach(optional);
        } else if (rule.type === 'array') optional(rule.items);
    };
    optional(partial);
    const names = new Set(playerNames.map(name => name.trim().toLocaleLowerCase()));
    const seen = new Set();
    const previous = new Map((reusePrevious ? state.developments : []).map(item => [item.id, {
        initiative: item.initiative, development: item.progression,
        stakes: item.outcomes, participation: item.access,
    }]));
    raw.developments = raw.developments.filter((subject, index) => {
        const path = `$.developments[${index}]`;
        // Do not hide explicit invalid values or player ownership just because
        // a different field is absent in this row.
        check(subject, partial, path);
        check(subject.id, schema.properties.id, `${path}.id`);
        if (seen.has(subject.id)) throw Error('Duplicate private subject update');
        seen.add(subject.id);
        if (typeof subject.initiative?.owner === 'string'
            && names.has(subject.initiative.owner.trim().toLocaleLowerCase())) throw Error('Player cannot own a planned initiative');
        const old = previous.get(subject.id);
        for (const key of ['initiative', 'development', 'stakes', 'participation']) {
            if (!Object.hasOwn(subject, key) && old?.[key] !== undefined) {
                subject[key] = structuredClone(old[key]);
                adjustments.push(`${path}.${key}`);
            }
        }
        // Never attach the former owner's aim to a newly named owner/control.
        if (subject.initiative && old?.initiative
            && ['owner', 'control'].every(key => !Object.hasOwn(subject.initiative, key)
                || subject.initiative[key] === old.initiative[key])) {
            for (const key of schema.properties.initiative.required) {
                if (!Object.hasOwn(subject.initiative, key) && old.initiative[key] !== undefined) {
                    subject.initiative[key] = structuredClone(old.initiative[key]);
                    adjustments.push(`${path}.initiative.${key}`);
                }
            }
        }
        check(subject, partial, path);
        const missing = [];
        const findMissing = (value, rule, at = '') => {
            if (rule.type !== 'object') return;
            for (const key of rule.required || []) {
                if (!Object.hasOwn(value, key)) missing.push(at + key);
            }
            for (const [key, child] of Object.entries(value)) {
                findMissing(child, rule.properties[key], `${at}${key}.`);
            }
        };
        findMissing(subject, schema);
        if (!missing.length) return true;
        deferredDevelopments.push({ id: subject.id, missingFields: missing });
        return false;
    });
    const deferred = new Set(deferredDevelopments.map(entry => entry.id));
    // Shared prose is indivisible: removing just an id would misattribute the
    // unverified material to someone else. Unrelated packets remain usable.
    if (Array.isArray(raw.selected_material)) {
        raw.selected_material = raw.selected_material.filter(entry => {
            if (!Array.isArray(entry?.subjectIds) || !entry.subjectIds.some(id => deferred.has(id))) return true;
            withheldMaterial++;
            return false;
        });
    }
    // New deferred proposals have no ledger. Existing subjects may still
    // receive independently witnessed progress when their draft is deferred.
    if (Array.isArray(raw.realization)) {
        const retained = new Set((reusePrevious ? state.developments : []).map(subject => subject.id));
        raw.realization = raw.realization.filter(entry => {
            if (!deferred.has(entry?.id) || retained.has(entry.id)) return true;
            adjustments.push(`$.realization:${entry.id}`);
            return false;
        });
    }
    return { adjustments, deferredDevelopments, withheldMaterial };
}
