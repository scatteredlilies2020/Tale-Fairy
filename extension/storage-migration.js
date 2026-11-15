// Poll only a running storage job. Neither status checks nor conversion use AI.
export function createStorageMigrationClient({ api, onChange, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
    let pending = null;
    return function checkStorage({ retry = false } = {}) {
        if (pending) return pending;
        pending = (async () => {
            try {
                let response = await api('/storage-migration', { method: 'POST', body: JSON.stringify({ retry }) });
                for (let polls = 0; ; polls++) {
                    const migration = response?.migration;
                    if (!migration || !['running', 'complete', 'attention'].includes(migration.status)) throw Error('Invalid storage migration status.');
                    onChange(migration);
                    if (migration.status !== 'running') return migration;
                    // A broken status endpoint must not create an endless timer.
                    if (polls >= 900) throw Error('Storage status wait ended; the server continues independently. Check storage again to collect its result.');
                    await sleep(2000);
                    response = await api('/storage-migration');
                }
            } catch (error) {
                onChange({ status: 'unavailable', error: error.message });
                return null;
            } finally { pending = null; }
        })();
        return pending;
    };
}

export function storageMigrationLabel(state) {
    if (!state) return 'Waiting for server storage check.';
    if (state.status === 'complete') return `Complete · ${state.checked} files checked · ${state.converted} converted · 0 stale · stopped.`;
    if (state.status === 'attention') return `Stopped · ${state.issueCount || 0} file issue(s) · ${state.remaining ?? 'unknown'} stale. Check server storage-migration status.json, then use Check all chat storage to retry.`;
    if (state.status === 'unavailable') return `Unavailable · ${state.error || 'Update the server plugin and restart ST.'}`;
    return `Checking all chat storage · pass ${state.pass || 1} · ${state.checked || 0} checked · ${state.converted || 0} converted…`;
}
