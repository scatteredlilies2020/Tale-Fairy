import { CampaignRuntime } from './campaign-runtime.js?v=0.14.36&token-budget=1&rp-plot=1&follow-through=1&working-plan=1&review-checkpoint=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1&player-cards=1&present-future=1&creative-planning=1&world-frame=1&portable-frame=1&chapter-labels=1&future-chapters=1&future-controls=1&writer-target=2&writer-fit=1&resource-policy=1';
import { campaignReviewInterval, campaignRefreshInterval } from './campaign-planner.js?v=0.14.36&token-budget=1&rp-plot=1&working-plan=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1&player-cards=1&present-future=1&creative-planning=1&world-frame=1&portable-frame=1&chapter-labels=1&future-controls=1&writer-target=2&writer-fit=1&resource-policy=1';
import { boundedPlannerResponse, PLANNER_RESPONSE_TIMEOUT_MS } from './planner-progress.js?v=1&review-checkpoint=1&story-workshop=1&request-policy=2&story-director=1&planner-timeout=1&server-jobs=1&pending-recovery=1';
import { storyReviewInterval, storyChangeSignal } from './story-structure.js?story-structure=1&concise-arcs=1&ensemble-pressure=1&story-cards=1&player-cards=1&present-future=1&world-frame=1&chapter-labels=1&resource-policy=1';

export const CAMPAIGN_ATTEMPT_KEY = 'taleFairyCampaignAttempt';
const turns = messages => messages.filter(message => !message.is_user).length;

// Event-driven scheduling, not a timer or a critic loop. A persisted attempt
// reserves one source before sending, including across reloads and failures.
export class CampaignSession {
    constructor({ read, prepare, generate, commit, fingerprint, saveAttempt, interval = () => 12, runPass,
        onProgress = () => {}, timeoutMs = PLANNER_RESPONSE_TIMEOUT_MS, evidenceRestart = false, guardEvidence = true, isDue,
        generateGate = task => task(), earlyReviews = () => false }) {
        Object.assign(this, { read, fingerprint, saveAttempt, interval, isDue, earlyReviews });
        this.controller = null;
        this.pending = null;
        this.runtime = new CampaignRuntime({ read, fingerprint, guardEvidence, ...(runPass ? { runPass } : {}),
            prepare: async snapshot => {
                onProgress('Building planner context');
                const input = await prepare(snapshot);
                this.attemptInput = input;
                this.attemptUsesEvidence = guardEvidence && (input.evidence?.status === 'included' || input.continuity?.status === 'included');
                this.controller.signal.throwIfAborted();
                return input;
            },
            onAttempt: async (snapshot, key) => {
                onProgress('Recording planner attempt');
                const prior = this.attempt;
                const runKey = prior?.runKey || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
                this.attempt = { key, runKey, chatId: snapshot.chatId, referenceHash: snapshot.referenceHash,
                    fingerprint: fingerprint(snapshot.messages), messageCount: snapshot.messages.length,
                    assistantCount: turns(snapshot.messages), requestSignature: snapshot.requestSignature || '',
                    at: prior?.at || Date.now(), status: 'started', requestCount: prior?.requestCount || 0,
                    ...(prior ? { stages: prior.stages || [], evidenceRestarts: 1 } : {}) };
                this.attemptSnapshot = snapshot;
                this.attemptStateFingerprint = fingerprint(snapshot.state);
                await saveAttempt(this.attempt);
                this.controller.signal.throwIfAborted();
            },
            generate: async (prompt, system, schema, correction = {}) => {
                const guard = () => {
                    this.controller.signal.throwIfAborted();
                    const latest = read(), original = this.attemptSnapshot;
                    const changed = this.sourceChange(latest);
                    if (changed) throw Error(`Planner source changed (${changed}); saved preparation is intact.`);
                    if (this.attemptUsesEvidence && latest.messages.length === original.messages.length
                        && latest.evidenceKey !== original.evidenceKey) {
                        this.evidenceChanged = true;
                        throw Error('Planner memory changed during preparation; saved preparation is intact.');
                    }
                };
                guard();
                this.attempt = { ...this.attempt, requestCount: this.attempt.requestCount + 1,
                    ...(correction.stage ? { stage: correction.stage, stages: [...(this.attempt.stages || []), correction.stage] } : {}),
                    ...(correction.recoveryReason ? { recoveryReason: String(correction.recoveryReason).slice(0, 1000) } : {}) };
                await saveAttempt(this.attempt);
                guard();
                onProgress(correction.stage === 'writer-fit' ? `Fitting complete writer context within quota · request ${this.attempt.requestCount}`
                    : correction.recoveryReason ? `Correcting planner response automatically · request ${this.attempt.requestCount}`
                    : correction.stage === 'director' ? 'Updating story map and public context'
                    : correction.stage === 'horizon' ? 'Preparing wider story possibilities · stage 1 of 2'
                    : correction.stage === 'scene' ? 'Preparing current scene and selecting material · stage 2 of 2' : 'Preparing planner request');
                // Queue time for the host's shared active route must not consume
                // the next request's response timeout. Recheck after the grant.
                const result = await generateGate(() => {
                    guard();
                    return boundedPlannerResponse(() => generate(prompt, system, schema,
                        { signal: this.controller.signal, snapshot: this.attemptSnapshot, attempt: this.attempt, input: correction.input || this.attemptInput }), this.controller, timeoutMs);
                });
                onProgress('Validating planner response');
                return result;
            },
            commit: (state, guard) => {
                onProgress('Saving planner preparation');
                return !this.controller.signal.aborted
                    && !this.sourceChange(this.read()) && commit(state, guard);
            },
        });
        this.run = async () => {
            this.evidenceChanged = false;
            let result = await this.runtime.request({ manual: true, snapshot: this.initialSnapshot });
            // One rebase, not a retry loop. A changed memory snapshot discards
            // BOTH drafts. The fresh pass can finish its stages and corrections
            // regardless of how many requests the discarded drafts used.
            if (evidenceRestart && !result.accepted && (this.evidenceChanged || result.evidenceChanged)
                && !this.controller.signal.aborted && !this.sourceChange(this.read())) {
                onProgress('Memory updated · rebuilding preparation from fresh context');
                this.evidenceChanged = false;
                result = { ...await this.runtime.request({ manual: true }), evidenceRestart: true };
            }
            return result;
        };
    }

    sourceChange(latest) {
        const original = this.attemptSnapshot;
        if (!original || !latest.enabled) return 'disabled';
        if (latest.chatId !== original.chatId) return 'chat';
        if (latest.referenceHash !== original.referenceHash) return 'references';
        if (latest.requestSignature !== original.requestSignature) return 'planner settings';
        if (latest.attempt?.runKey !== this.attempt?.runKey) return 'newer run';
        if (this.fingerprint(latest.state) !== this.attemptStateFingerprint) return 'saved plan';
        if (latest.messages.length < original.messages.length
            || this.fingerprint(latest.messages.slice(0, original.messages.length)) !== this.fingerprint(original.messages)) return 'accepted transcript';
        return '';
    }

    request({ manual = false, replacementRepair = false, snapshot: suppliedSnapshot } = {}) {
        if (this.pending) return this.pending;
        const snapshot = suppliedSnapshot || this.read();
        const previous = snapshot.attempt;
        if (!snapshot.enabled || !snapshot.chatId || !snapshot.messages.length
            || snapshot.replacement && !manual && !replacementRepair || replacementRepair && !snapshot.replacement) {
            return Promise.resolve({ accepted: false, state: snapshot.state, skipped: 'inactive-or-replacement' });
        }
        if (!manual && this.isDue && !this.isDue(snapshot)) {
            return Promise.resolve({ accepted: false, state: snapshot.state, skipped: 'not-due' });
        }
        if (!manual && !this.isDue && previous?.chatId === snapshot.chatId) {
            const key = this.runtime.key(snapshot);
            const structured = snapshot.state?.workingPlan?.storyStructure;
            const dueAfter = structured ? storyReviewInterval(this.interval(), snapshot.state) : previous.status === 'stopped'
                ? campaignReviewInterval(this.interval()) : campaignRefreshInterval(this.interval());
            const elapsed = turns(snapshot.messages) - previous.assistantCount;
            // All terminal outcomes reserve a full interval. Provider failures,
            // changed variables and repeated host notifications cannot create
            // a one-request-per-reply loop. Manual actions remain immediate.
            const earlyReview = this.earlyReviews() && previous.status === 'complete'
                && elapsed >= Math.min(4, dueAfter) && storyChangeSignal(snapshot.messages.slice(previous.messageCount));
            if (key === previous.key || !replacementRepair && (elapsed <= 0 || !earlyReview && elapsed < dueAfter)) {
                return Promise.resolve({ accepted: false, state: snapshot.state, skipped: 'not-due' });
            }
        }
        this.controller = new AbortController();
        this.initialSnapshot = snapshot;
        this.detached = false;
        this.attempt = null;
        const controller = this.controller;
        // Session policy above owns persisted deduplication. This invocation is
        // a distinct pass; runPass owns response correction for its stages.
        this.pending = this.run().then(async result => {
            const latest = this.read();
            if (this.attempt && latest.attempt?.runKey === this.attempt.runKey && latest.chatId === snapshot.chatId) {
                await this.saveAttempt({ ...latest.attempt,
                    status: this.detached ? 'pending' : controller.signal.aborted && controller.signal.reason?.name !== 'TimeoutError' ? 'stopped' : result.accepted ? 'complete' : 'failed',
                    finishedAt: Date.now(), durationMs: Math.max(0, Date.now() - this.attempt.at),
                    error: String(result.error || '').slice(0, 1000), skipped: result.skipped || '' });
            }
            return result;
        }).finally(() => { this.pending = null; this.controller = null; this.attemptSnapshot = null; this.attemptInput = null; this.attempt = null; });
        return this.pending;
    }

    stop(reason = 'Campaign planning stopped.', { detach = false } = {}) {
        this.detached = detach;
        this.controller?.abort(new DOMException(reason, 'AbortError'));
    }
}
