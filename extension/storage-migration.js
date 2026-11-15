// Poll only a running storage job. Neither status checks nor conversion use AI.
export function createStorageMigrationClient({ api, onChange, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
    let pending = null;
    return function checkStorage({ retry = false, maintenance = false } = {}) {
        if (pending) return pending;
        pending = (async () => {
            try {
                let response = await api('/storage-migration', { method: 'POST', body: JSON.stringify({ retry, ...(maintenance ? { maintenance: true } : {}) }) });
                for (let polls = 0; ; polls++) {
                    const migration = response?.migration;
                    if (!migration || !['running', 'complete', 'attention'].includes(migration.status)) throw Error('Invalid storage migration status.');
                    if (maintenance && migration.maintenance !== 1) throw Error('The server did not run the expanded maintenance checks. Restart ST after updating, then scan again.');
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
    if (state.maintenance && ['complete', 'attention'].includes(state.status)) {
        const saved = (state.beforeBytes || 0) - (state.afterBytes || 0);
        const size = `${(Math.abs(saved) / 1048576).toFixed(2)} MiB ${saved >= 0 ? 'saved' : 'added by state upgrades'}`;
        return `Stopped · ${state.checked || 0} files checked · ${state.repairs?.stateUpgrades || 0} state upgrades · ${state.repairs?.retryCaches || 0} retry caches compressed · ${size} · ${state.remaining ?? 'unknown'} safe repairs pending · ${state.guideCount || 0} need Guide now · ${state.reviewCount || 0} need review · ${state.issueCount || 0} file issues.`;
    }
    if (state.status === 'complete') return `Complete · ${state.checked} files checked · ${state.converted} converted · 0 stale · stopped.`;
    if (state.status === 'attention') return `Stopped · ${state.issueCount || 0} file issue(s) · ${state.remaining ?? 'unknown'} stale. Check server storage-migration status.json, then use Scan, repair & compress to retry.`;
    if (state.status === 'unavailable') return `Unavailable · ${state.error || 'Update the server plugin and restart ST.'}`;
    return `${state.maintenance ? 'Scanning, repairing & compressing' : 'Checking all chat storage'} · pass ${state.pass || 1} · ${state.checked || 0} checked · ${state.converted || 0} converted…`;
}

export function storageMaintenanceDetails(state) {
    if (!state?.maintenance) return 'The manual scan also checks older state/plan formats, weighted activities, retry integrity and future plans. No AI requests.';
    const names = { 'legacy-state': 'older/pending planner state', 'legacy-plan': 'older plan format',
        'unweighted-activities': 'story records missing weights/scopes', 'invalid-plan': 'invalid saved plans',
        'unsupported-state': 'unsupported state versions', 'invalid-future': 'invalid future plans', 'rejected-retries': 'unauthenticated retry packets (retained)' };
    const findings = Object.entries(state.findings || {}).filter(([, count]) => count).map(([code, count]) => `${names[code] || code}: ${count}`);
    return [findings.length ? findings.join(' · ') : 'No content findings recorded.',
        'Guide/review counts are metadata records, not AI jobs. Open affected chats and use Guide now for story conversions; invalid futures need Future Update/review. Details and original recovery copies are in tale-fairy/storage-migrations/shared-plans-v1/. No AI was called.'].join(' ');
}
