// Evaluation-only transactional ownership for infrequent broad reviews.
// Proposals may change; accepted observations never come from this operation.
import crypto from 'node:crypto';
import { validatePreparation } from './development-preparation-prototype.mjs';

export function reviewBasis(state) {
    // Includes accepted progress/invalidations: an in-flight review may not
    // overwrite a newer user refusal or another accepted change.
    const { selected, staged, ...durable } = state;
    return crypto.createHash('sha256').update(JSON.stringify(durable)).digest('hex');
}

export function applyDevelopmentReview(state, response, suppliedIndices) {
    const object = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
    const text = (v, max) => typeof v === 'string' && v.trim().length && v.length <= max;
    if (!object(response, ['basis', 'decisions', 'additions']) || response.basis !== reviewBasis(state) || !Array.isArray(response.decisions) || !Array.isArray(response.additions)) throw Error('Invalid or stale review.');
    const ids = state.developments.map(d => d.id), chosen = response.decisions.map(d => d.id);
    if (chosen.length !== ids.length || new Set(chosen).size !== chosen.length || ids.some(id => !chosen.includes(id))) throw Error('Review must explicitly retain, replace or retire every existing development.');
    const evidence = e => Array.isArray(e) && e.length && e.every(i => Number.isInteger(i) && suppliedIndices.includes(i));
    const next = structuredClone(state);
    next.revisions ??= {};
    for (const decision of response.decisions) {
        if (decision.action === 'retain') {
            const keys = Object.hasOwn(decision, 'reason') ? ['id', 'action', 'reason'] : ['id', 'action'];
            if (!object(decision, keys) || (Object.hasOwn(decision, 'reason') && !text(decision.reason, 900))) throw Error('Invalid retention.');
            // Optional rationale is admissible metadata, never accepted history.
            continue;
        }
        const keys = decision.action === 'replace' ? ['id', 'action', 'reason', 'evidence', 'replacement'] : ['id', 'action', 'reason', 'evidence'];
        if (!['replace', 'retire'].includes(decision.action) || !object(decision, keys) || !text(decision.reason, 900)) throw Error('Invalid review decision.');
        if (!evidence(decision.evidence)) throw Error(`Invalid review evidence for ${decision.id}; cite only supplied message indices: ${suppliedIndices.join(', ')}.`);
        const prior = next.developments.find(d => d.id === decision.id);
        const version = next.revisions[prior.id] ?? 1;
        next.archive.push({ lane: 'developments', record: structuredClone(prior), version, invalidated: next.invalidated.filter(o => o.id === prior.id), review: { reason: decision.reason, evidence: [...decision.evidence], action: decision.action } });
        next.invalidated = next.invalidated.filter(o => o.id !== prior.id);
        if (decision.action === 'replace') {
            if (decision.replacement?.id !== prior.id) throw Error('Replacement must retain subject identity.');
            validatePreparation({ scope: next.scope, developments: [decision.replacement] });
            next.developments = next.developments.map(d => d.id === prior.id ? structuredClone(decision.replacement) : d);
            next.revisions[prior.id] = version + 1;
        } else next.developments = next.developments.filter(d => d.id !== prior.id);
    }
    const reserved = new Set([...state.developments, ...state.local, ...state.archive.map(a => a.record)].map(d => d.id));
    for (const d of response.additions) {
        if (!d || reserved.has(d.id)) throw Error('New development ID collides with existing ownership.');
        reserved.add(d.id); next.developments.push(structuredClone(d)); next.revisions[d.id] = 1;
    }
    validatePreparation({ scope: next.scope, developments: next.developments });
    // Review never writes accepted observations or changes authoritative scope.
    // Previously selected zero-based options refer to an old proposal version.
    next.selected = []; next.staged = []; next.reviewNeeded = '';
    return next;
}
