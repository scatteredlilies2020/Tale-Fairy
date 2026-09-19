// Deterministic, explicitly synthetic accepted play for isolated evaluations.
// Never append a fixture stage to a real chat or a generated writer trajectory.
export function appendFixtureStage(fixture, messages, stageName) {
    if (fixture.name === 'real' || !Array.isArray(fixture.stages)) throw Error('Synthetic staged fixture required');
    const matches = fixture.stages.filter(stage => stage.name === stageName);
    if (matches.length !== 1 || !matches[0].append.length) throw Error('Unique nonempty fixture stage required');
    const index = fixture.stages.indexOf(matches[0]);
    const numbered = rows => rows.map((row, index) => ({ ...row, index }));
    const expected = numbered([...fixture.messages, ...fixture.stages.slice(0, index).flatMap(stage => stage.append)]);
    const canonical = rows => rows.map(({ index, role, content }) => ({ index, role, content }));
    if (JSON.stringify(canonical(messages)) !== JSON.stringify(canonical(expected))) {
        throw Error('Fixture stage requires the exact preceding synthetic transcript; no skipping, replay or writer substitution');
    }
    return numbered([...expected, ...matches[0].append]);
}
