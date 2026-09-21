import { CampaignRuntime } from './campaign-runtime.js?v=0.14.36&token-budget=1&rp-plot=1';
import { campaignReviewInterval } from './campaign-planner.js?v=0.14.36&token-budget=1&rp-plot=1';

export const CAMPAIGN_ATTEMPT_KEY = 'taleFairyCampaignAttempt';
const turns = messages => messages.filter(message => !message.is_user).length;

// Event-driven scheduling, not a timer or a critic loop. A persisted attempt
// reserves one source before sending, including across reloads and failures.
export class CampaignSession {
    constructor({ read, prepare, generate, commit, fingerprint, saveAttempt, interval = () => 8, runPass }) {
        Object.assign(this, { read, fingerprint, saveAttempt, interval });
        this.controller = null;
        this.pending = null;
        this.runtime = new CampaignRuntime({ read, fingerprint, ...(runPass ? { runPass } : {}),
            prepare: async snapshot => {
                const input = await prepare(snapshot);
                this.controller.signal.throwIfAborted();
                return input;
            },
            onAttempt: async (snapshot, key) => {
                const runKey = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
                this.attempt = { key, runKey, chatId: snapshot.chatId, referenceHash: snapshot.referenceHash,
                    fingerprint: fingerprint(snapshot.messages), messageCount: snapshot.messages.length,
                    assistantCount: turns(snapshot.messages), requestSignature: snapshot.requestSignature || '',
                    at: Date.now(), status: 'started' };
                this.attemptSnapshot = snapshot;
                await saveAttempt(this.attempt);
                this.controller.signal.throwIfAborted();
            },
            generate: (prompt, system, schema) => {
                this.controller.signal.throwIfAborted();
                return generate(prompt, system, schema, { signal: this.controller.signal, snapshot: this.attemptSnapshot, attempt: this.attempt });
            },
            commit: (state, guard) => !this.controller.signal.aborted
                && this.read().attempt?.runKey === this.attempt?.runKey && commit(state, guard),
        });
    }

    request({ manual = false } = {}) {
        if (this.pending) return this.pending;
        const snapshot = this.read();
        const previous = snapshot.attempt;
        if (!snapshot.enabled || !snapshot.chatId || !snapshot.messages.length || snapshot.replacement && !manual) {
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
            const dueAfter = previous.status === 'failed' ? 1 : campaignReviewInterval(this.interval());
            if (key === previous.key || unchangedBasis && turns(snapshot.messages) - previous.assistantCount < dueAfter) {
                return Promise.resolve({ accepted: false, state: snapshot.state, skipped: 'not-due' });
            }
        }
        this.controller = new AbortController();
        this.attempt = null;
        const controller = this.controller;
        // Session policy above owns persisted deduplication. This invocation is
        // a distinct approved pass, never a fallback for a failed model response.
        this.pending = this.runtime.request({ manual: true }).then(async result => {
            const latest = this.read();
            if (this.attempt && latest.attempt?.runKey === this.attempt.runKey && latest.chatId === snapshot.chatId) {
                await this.saveAttempt({ ...latest.attempt,
                    status: controller.signal.aborted ? 'stopped' : result.accepted ? 'complete' : 'failed' });
            }
            return result;
        }).finally(() => { this.pending = null; this.controller = null; this.attemptSnapshot = null; this.attempt = null; });
        return this.pending;
    }

    stop(reason = 'Campaign planning stopped.') {
        this.controller?.abort(new DOMException(reason, 'AbortError'));
    }
}
