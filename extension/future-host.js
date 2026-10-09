import { CampaignSession } from './campaign-session.js?future-chapters=1&chapter-labels=1&server-jobs=1&portable-frame=1&world-frame=1&creative-planning=1&present-future=1&player-cards=1&story-cards=1&ensemble-pressure=1&concise-arcs=1&story-structure=1&story-director=1&relaxed-conditions=1&concise-prompts=1&autonomous-life=1&future-entry=1&story-life=1&story-lifecycle=1&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&persistent-entry=1';
import { campaignJobMeta, campaignJobMatches, recoverCampaignJob } from './campaign-jobs.js?future-chapters=1&server-jobs=1';
import { campaignUsable } from './campaign-planner.js?chapter-labels=1&portable-frame=1&world-frame=1&creative-planning=1&present-future=1&player-cards=1&story-cards=1&ensemble-pressure=1&concise-arcs=1&story-structure=1&relaxed-conditions=1&concise-prompts=1&autonomous-life=1&future-entry=1&story-life=1&story-lifecycle=1&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&persistent-entry=1';
import { FUTURE_KEY, FUTURE_ATTEMPT_KEY, PLANNING_EPOCH_KEY, FUTURE_SCHEMA, FUTURE_OUTPUT_LIMIT,
    emptyFuture, validFuture, futureDue, futureInput, futurePass, futureReceipts } from './future-planner.js?future-chapters=1&chapter-labels=1&portable-frame=1&world-frame=1&creative-planning=1&present-future=1&player-cards=1&story-cards=1&ensemble-pressure=1&concise-arcs=1&story-structure=1&relaxed-conditions=1&concise-prompts=1&autonomous-life=1&future-entry=1&story-life=1&story-lifecycle=1&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&persistent-entry=1&chapter-scope=2&future-cards=1';

// Only this owner writes future state. Current planning and future planning may
// finish in either order; their revisions and compare-and-swap guards differ.
export function createFutureHost(api) {
    let session, pending, collecting = false, stopRevision = 0;
    const read = (base = api.readBase()) => {
        const metadata = api.metadata(), saved = metadata[FUTURE_KEY];
        const state = validFuture(saved) ? saved : emptyFuture();
        let attempt = metadata[FUTURE_ATTEMPT_KEY];
        const shared = api.sharedAttempt?.(base.chatId);
        if (shared?.chatId === base.chatId && (!attempt || shared.at >= attempt.at)) attempt = shared;
        const snapshot = { ...base, baseState: base.state, state, attempt,
            enabled: base.enabled && api.settings().futureEnabled !== false,
            requestSignature: api.fingerprint({ base: base.requestSignature, schema: FUTURE_SCHEMA,
                epoch: metadata[PLANNING_EPOCH_KEY] || '' }) };
        snapshot.receipts = futureReceipts(metadata, snapshot, api.fingerprint);
        const reassessment = metadata.taleFairyFutureReassessment;
        snapshot.reassessmentCount = reassessment && campaignUsable(reassessment, { ...snapshot, fingerprint: api.fingerprint })
            ? reassessment.source.messageCount : 0;
        return snapshot;
    };
    const saveAttempt = async attempt => {
        if (api.readBase().chatId !== attempt.chatId) throw Error('Chat changed before future attempt reservation');
        api.write({ [FUTURE_ATTEMPT_KEY]: attempt });
        api.saveSharedAttempt?.(attempt);
        api.render();
        await api.persist();
    };
    const commit = (state, { stateFingerprint }) => {
        const latest = read();
        if (!latest.enabled || !validFuture(state) || state.revision !== latest.state.revision + 1
            || api.fingerprint(latest.state) !== stateFingerprint
            || !campaignUsable(state, { ...latest, fingerprint: api.fingerprint })) return false;
        // A current review may have adopted a candidate while this call ran.
        // Filter receipts at commit, without invalidating the paid future pass.
        const excluded = new Set(latest.receipts.map(r => r.id));
        api.write({ [FUTURE_KEY]: { ...state, cards: state.cards.filter(c => !excluded.has(c.id)) } });
        void api.persist().catch(() => {});
        api.render();
        return true;
    };
    const recover = async ({ preflight = false, locked = false } = {}) => {
        if (collecting || session?.pending || pending && !preflight) return { active: true, recovered: false };
        const original = read();
        if (!original.enabled || !original.chatId) return { active: false, recovered: false };
        if (!preflight && !locked) {
            try { return await api.lock(original.chatId, () => read().chatId === original.chatId
                ? recover({ locked: true }) : { active: false, recovered: false }); }
            catch { return { active: true, recovered: false }; }
        }
        const recoveringStop = stopRevision;
        collecting = true;
        try {
            const jobs = await api.jobs(original.chatId);
            if (jobs === null) return { active: false, recovered: false }; // No compatible server.
            for (const job of jobs.filter(j => j.meta?.campaign?.kind === 'future')) {
                const latest = read();
                if (recoveringStop !== stopRevision || latest.chatId !== original.chatId || !latest.enabled) return { active: false, recovered: false };
                if (!campaignJobMatches(job, latest, api.fingerprint)) {
                    if (['queued', 'processing', 'retry_wait'].includes(job.status)) await api.cancelJob(job.id);
                    await api.ackJob(job.id); continue;
                }
                if (['queued', 'processing', 'retry_wait'].includes(job.status)) return { active: true, recovered: false };
                const guardedRead = () => recoveringStop === stopRevision ? read() : { ...read(), enabled: false };
                const result = job.status === 'complete'
                    ? await recoverCampaignJob(job, { read: guardedRead, fingerprint: api.fingerprint, runPass: futurePass, commit })
                    : { accepted: false, error: job.error || 'Future server job failed' };
                if (recoveringStop === stopRevision && read().attempt?.status !== 'stopped'
                    && read().attempt?.runKey === job.runKey && read().chatId === original.chatId) {
                    await saveAttempt({ ...read().attempt, status: result.accepted ? 'complete' : 'failed', error: result.error || result.skipped || '' });
                }
                await api.ackJob(job.id);
                return { active: false, recovered: true };
            }
            return { active: false, recovered: false };
        } catch (error) {
            // Unknown server status is not permission to buy another request.
            api.status?.(`Future recovery unavailable: ${error.message}`);
            return { active: true, recovered: false };
        } finally { collecting = false; }
    };
    const run = ({ manual = false, baseSnapshot } = {}) => {
        if (pending) return pending;
        const initial = read(baseSnapshot);
        const startingStop = stopRevision;
        if (!initial.enabled || !initial.chatId || !initial.messages.length || initial.replacement
            || !manual && !futureDue(initial, api.fingerprint, api.settings().futureInterval)) return Promise.resolve({ accepted: false, skipped: 'not-due' });
        pending = api.lock(initial.chatId, async () => {
            const recovered = await recover({ preflight: true });
            if (recovered.active || recovered.recovered) return { accepted: false, skipped: 'server-job-handled' };
            if (startingStop !== stopRevision || read().chatId !== initial.chatId || read().requestSignature !== initial.requestSignature) return { accepted: false, skipped: 'source-changed' };
            session ||= new CampaignSession({ read, fingerprint: api.fingerprint, saveAttempt, commit, guardEvidence: false,
                isDue: s => futureDue(s, api.fingerprint, api.settings().futureInterval), runPass: futurePass,
                generateGate: api.generateGate,
                prepare: s => futureInput(api.buildCommon({ ...s, state: s.baseState }), s, api.fingerprint),
                onProgress: message => api.status?.(message),
                generate: (prompt, system, schema, { signal, snapshot, attempt, input }) => {
                    const meta = campaignJobMeta(snapshot, attempt, input, api.fingerprint);
                    meta.campaign.kind = 'future';
                    return api.generate(prompt, signal, meta, { singleShot: true, gatedActive: true, systemPrompt: system, schema,
                        responseTokens: FUTURE_OUTPUT_LIMIT, label: 'future Chapters', cacheNamespace: 'future-chapters-v1' });
                } });
            // Use the shared accepted snapshot even when current planning has
            // already saved; its state is deliberately not a future CAS guard.
            const result = await session.request({ manual, snapshot: { ...initial, attempt: read().attempt } });
            if (result.accepted) await api.ackRun?.(read().attempt?.runKey, initial.chatId);
            return result;
        }).catch(error => ({ accepted: false, error: error.message })).finally(() => { pending = null; api.render(); });
        return pending;
    };
    return { run, recover, read, commit, get pending() { return pending; },
        stop(reason, options) { stopRevision++; session?.stop(reason, options); },
    };
}

let activeTail = Promise.resolve();
// ST's active generateRaw mutates shared host generation settings. Direct and
// connection-profile requests run in parallel; this route must serialize.
export function serializeActivePlanner(task) {
    const run = () => globalThis.navigator?.locks?.request
        ? globalThis.navigator.locks.request('tale-fairy:active-transport', { mode: 'exclusive' }, task) : task();
    const work = activeTail.catch(() => {}).then(run);
    activeTail = work.catch(() => {});
    return work;
}
