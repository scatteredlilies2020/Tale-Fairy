import { CampaignRuntime } from './campaign-runtime.js?v=0.14.36&token-budget=1&rp-plot=1&follow-through=1&working-plan=1&review-checkpoint=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1';
import { campaignReviewInterval, campaignRefreshInterval } from './campaign-planner.js?v=0.14.36&token-budget=1&rp-plot=1&working-plan=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1';
import { boundedPlannerResponse, PLANNER_RESPONSE_TIMEOUT_MS } from './planner-progress.js?v=1&review-checkpoint=1&story-workshop=1&request-policy=2&story-director=1';
import { storyReviewInterval, storyChangeSignal } from './story-structure.js?story-structure=1&concise-arcs=1';

export const CAMPAIGN_ATTEMPT_KEY = 'taleFairyCampaignAttempt';
const turns = messages => messages.filter(message => !message.is_user).length;

// Event-driven scheduling, not a timer or a critic loop. A persisted attempt
// reserves one source before sending, including across reloads and failures.
export class CampaignSession {
    constructor({ read, prepare, generate, commit, fingerprint, saveAttempt, interval = () => 12, runPass,
        onProgress = () => {}, timeoutMs = PLANNER_RESPONSE_TIMEOUT_MS, evidenceRestart = false }) {
        Object.assign(this, { read, fingerprint, saveAttempt, interval });
        this.controller = null;
        this.pending = null;
        this.runtime = new CampaignRuntime({ read, fingerprint, ...(runPass ? { runPass } : {}),
            prepare: async snapshot => {
                onProgress('Building planner context');
                const input = await prepare(snapshot);
                this.attemptUsesEvidence = input.evidence?.status === 'included' || input.continuity?.status === 'included';
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
                onProgress(correction.recoveryReason ? `Correcting planner response automatically · request ${this.attempt.requestCount}`
                    : correction.stage === 'director' ? 'Updating story map and public context'
                    : correction.stage === 'horizon' ? 'Preparing wider story possibilities · stage 1 of 2'
                    : correction.stage === 'scene' ? 'Preparing current scene and selecting material · stage 2 of 2' : 'Preparing planner request');
                const result = await boundedPlannerResponse(() => generate(prompt, system, schema,
                    { signal: this.controller.signal, snapshot: this.attemptSnapshot, attempt: this.attempt }), this.controller, timeoutMs);
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
            let result = await this.runtime.request({ manual: true });
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

    request({ manual = false, replacementRepair = false } = {}) {
        if (this.pending) return this.pending;
        const snapshot = this.read();
        const previous = snapshot.attempt;
        if (!snapshot.enabled || !snapshot.chatId || !snapshot.messages.length
            || snapshot.replacement && !manual && !replacementRepair || replacementRepair && !snapshot.replacement) {
            return Promise.resolve({ accepted: false, state: snapshot.state, skipped: 'inactive-or-replacement' });
        }
        if (!manual && previous?.chatId === snapshot.chatId) {
            const key = this.runtime.key(snapshot);
            const unchangedBasis = previous.referenceHash === snapshot.referenceHash
                && previous.requestSignature === (snapshot.requestSignature || '')
                && previous.messageCount <= snapshot.messages.length
                && previous.fingerprint === this.fingerprint(snapshot.messages.slice(0, previous.messageCount));
            // A failure reserves this source, not the next full review cycle.
            // Recover only after new accepted assistant play; no same-source,
            // user-only, timer, or reload retry. Stop retains normal cadence.
            const structured = snapshot.state?.workingPlan?.storyStructure;
            const earlyReview = structured && previous.status !== 'failed' && previous.status !== 'stopped'
                && storyChangeSignal(snapshot.messages.slice(previous.messageCount));
            const dueAfter = previous.status === 'failed' ? 1 : structured ? Math.max(1, storyReviewInterval(this.interval(), snapshot.state) - 1) : previous.status === 'stopped'
                ? campaignReviewInterval(this.interval()) : campaignRefreshInterval(this.interval());
            if (key === previous.key || !replacementRepair && unchangedBasis && !earlyReview && turns(snapshot.messages) - previous.assistantCount < dueAfter) {
                return Promise.resolve({ accepted: false, state: snapshot.state, skipped: 'not-due' });
            }
        }
        this.controller = new AbortController();
        this.attempt = null;
        const controller = this.controller;
        // Session policy above owns persisted deduplication. This invocation is
        // a distinct pass; runPass owns response correction for its stages.
        this.pending = this.run().then(async result => {
            const latest = this.read();
            if (this.attempt && latest.attempt?.runKey === this.attempt.runKey && latest.chatId === snapshot.chatId) {
                await this.saveAttempt({ ...latest.attempt,
                    status: controller.signal.aborted && controller.signal.reason?.name !== 'TimeoutError' ? 'stopped' : result.accepted ? 'complete' : 'failed',
                    finishedAt: Date.now(), durationMs: Math.max(0, Date.now() - this.attempt.at),
                    error: String(result.error || '').slice(0, 1000), skipped: result.skipped || '' });
            }
            return result;
        }).finally(() => { this.pending = null; this.controller = null; this.attemptSnapshot = null; this.attempt = null; });
        return this.pending;
    }

    stop(reason = 'Campaign planning stopped.') {
        this.controller?.abort(new DOMException(reason, 'AbortError'));
    }
}
