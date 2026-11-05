// Observe cached public metadata only. Late extension loading and unavailable /
// stale publications must update the board without starting either planner.
export function createContinuityAvailabilityMonitor({ read, onChange }) {
    let previous;
    return () => {
        let value;
        try {
            const { chatId, enabled, bridge } = read();
            const snapshot = enabled ? bridge?.getContextSnapshot?.() : null;
            value = JSON.stringify([chatId, enabled, bridge?.version, snapshot?.chatId,
                snapshot?.status, snapshot?.revision, snapshot?.coverage?.signature]);
        } catch { value = 'unavailable'; }
        if (value === previous) return;
        previous = value;
        onChange();
    };
}
