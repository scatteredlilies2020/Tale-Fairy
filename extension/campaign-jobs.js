// Recovery replays validation, never generation. Store only the original pass
// input and guards; the provider request/credentials remain private to the server.
export function campaignJobMeta(snapshot, attempt, input, fingerprint) {
    return { chatId: snapshot.chatId, runKey: attempt.runKey, campaign: {
        version: 1, input: structuredClone(input),
        source: { chatId: snapshot.chatId, referenceHash: snapshot.referenceHash,
            messageCount: snapshot.messages.length, fingerprint: fingerprint(snapshot.messages) },
        stateFingerprint: fingerprint(snapshot.state), requestSignature: snapshot.requestSignature || '',
    } };
}

export function campaignJobMatches(job, latest, fingerprint) {
    const saved = job.meta?.campaign, source = saved?.source;
    return Boolean(saved?.version === 1 && source && latest.enabled
        && job.chatId === latest.chatId && source.chatId === latest.chatId
        && latest.attempt?.runKey === job.runKey && latest.attempt.status !== 'stopped'
        && source.referenceHash === latest.referenceHash
        && saved.requestSignature === (latest.requestSignature || '')
        && saved.stateFingerprint === fingerprint(latest.state)
        && Number.isInteger(source.messageCount) && source.messageCount > 0
        && latest.messages.length >= source.messageCount
        && source.fingerprint === fingerprint(latest.messages.slice(0, source.messageCount)));
}

export async function recoverCampaignJob(job, { read, fingerprint, runPass, commit }) {
    if (job.status !== 'complete' || !campaignJobMatches(job, read(), fingerprint)) {
        return { accepted: false, skipped: 'detached-source-changed' };
    }
    const saved = job.meta.campaign;
    let reads = 0;
    const result = await runPass({ state: structuredClone(read().state), input: structuredClone(saved.input),
        source: saved.source, generate: async () => {
            // A future multi-stage planner must not reuse one response twice.
            if (++reads !== 1) throw Error('Detached recovery supports one director response only.');
            return { text: job.text, finishReason: 'stop' };
        } });
    if (!result.accepted) return result;
    if (!campaignJobMatches(job, read(), fingerprint)
        || commit(result.state, { stateFingerprint: saved.stateFingerprint, source: saved.source,
            futureDecisions: result.futureDecisions, reassessFuture: result.reassessFuture }) !== true) {
        return { accepted: false, skipped: 'detached-commit-conflict' };
    }
    return result;
}
