import { campaignPass, campaignPayload, campaignUsable, campaignMaterialUsable, campaignWriterUsable } from './campaign-planner.js?v=0.14.36&token-budget=1&rp-plot=1&follow-through=1&working-plan=1&rp-understanding=1&soft-targets=1&story-map=1&story-goal=2&story-horizons=1&story-progression=1&story-workshop=1&story-bridge=1&story-outlook=1&story-throughline=1&story-lifecycle=1&story-life=1&future-entry=1&persistent-entry=1&autonomous-life=1&concise-prompts=1&relaxed-conditions=1&rp-departures=1&horizon-links=3&story-structure=1&concise-arcs=1';

// Host-independent background pass lifecycle. The host supplies canonical
// source hashes, a ONE-REQUEST provider, and a synchronous compare-and-swap
// commit. Browser persistence, cross-tab locking and scheduling remain host
// responsibilities; this class never starts timers, retries or repair calls.
export class CampaignRuntime {
    constructor({ read, prepare, generate, commit, fingerprint, onAttempt = () => {}, runPass = campaignPass }) {
        Object.assign(this, { read, prepare, generate, commit, fingerprint, onAttempt, runPass });
        this.pending = null;
        this.lastAttemptKey = '';
    }

    key(snapshot) {
        return this.fingerprint({ chatId: snapshot.chatId, referenceHash: snapshot.referenceHash,
            messages: this.fingerprint(snapshot.messages), requestSignature: snapshot.requestSignature || '',
            evidenceKey: snapshot.evidenceKey || '' });
    }

    payload() {
        const current = this.read();
        const context = { ...current, fingerprint: this.fingerprint };
        return campaignWriterUsable(current.state, context)
            ? campaignPayload(current.state, [], { horizonsOnly: !campaignMaterialUsable(current.state, context) }) : '';
    }

    request({ manual = false } = {}) {
        // Appending another exchange does not discard an already-paid-for pass.
        // Edited sources are rejected at commit; a later trigger can plan them.
        if (this.pending) return this.pending;
        const snapshot = structuredClone(this.read());
        const key = this.key(snapshot);
        if (!manual && key === this.lastAttemptKey) {
            return Promise.resolve({ accepted: false, state: this.read().state, skipped: 'already-attempted' });
        }
        const stateFingerprint = this.fingerprint(snapshot.state);
        const preflight = () => {
            const latest = this.read();
            if (this.key(latest) === key) return null;
            return { accepted: false, state: latest.state, skipped: 'source-changed-before-request',
                evidenceChanged: latest.evidenceKey !== snapshot.evidenceKey };
        };
        const work = async () => {
            try {
                const recording = this.onAttempt(snapshot, key);
                if (recording?.then) await recording;
                const before = preflight();
                if (before) return before;
                this.lastAttemptKey = key;
                const input = await this.prepare(snapshot);
                const after = preflight();
                if (after) return after;
                const source = { chatId: snapshot.chatId, referenceHash: snapshot.referenceHash,
                    messageCount: snapshot.messages.length, fingerprint: this.fingerprint(snapshot.messages) };
                const result = await this.runPass({ state: snapshot.state, input, source, generate: this.generate });
                const latest = this.read();
                if (!result.accepted) return { ...result, state: latest.state };
                const evidenceKey = (input.evidence?.status === 'included' || input.continuity?.status === 'included') ? snapshot.evidenceKey : '';
                // A correction to the same chat snapshot invalidates a result
                // using the old recall. Ordinary appended play still does not
                // cancel paid-for work or create a memory-publication loop.
                if (evidenceKey && latest.messages.length === snapshot.messages.length && latest.evidenceKey !== evidenceKey) {
                    return { accepted: false, state: latest.state, skipped: 'memory-changed', evidenceChanged: true };
                }
                if (this.fingerprint(latest.state) !== stateFingerprint
                    || !campaignUsable(result.state, { ...latest, fingerprint: this.fingerprint })) {
                    return { accepted: false, state: latest.state, skipped: 'source-or-preparation-changed' };
                }
                // The host rechecks these guards when synchronously installing
                // metadata, before starting any asynchronous persistence work.
                const installed = this.commit(result.state, { stateFingerprint, source, evidenceKey });
                if (installed !== true) return { accepted: false, state: this.read().state, skipped: 'commit-conflict' };
                return result;
            } catch (error) {
                return { accepted: false, state: this.read().state, error: error.message };
            }
        };
        this.pending = work().finally(() => { this.pending = null; });
        return this.pending;
    }
}
