# Broader conditions and lighter preparation

The workshop and scene selector now sketch what can begin or change while
leaving incidental props, gestures, dialogue and execution open. Future entries
and selected initiatives use broad encounter conditions only where needed.
Their `prerequisite` field can be empty; private trajectory stages can also have
an empty `when`. Both fields remain required strings, so an explicit absence of
a dependency is distinct from missing or malformed preparation.

Real distance, timing, participation, refusal and knowledge boundaries still
apply. Empty public conditions do not bypass private access validation or allow
player-owned initiatives. A possibility or action must still contain substance.
Writer composition omits an empty entry condition without adding a blank line,
and preserves supplied conditions verbatim.

The selector is asked to recognize the substance of an introduced initiative
even when incidental details differ. Introduction still needs exact spans from
new accepted messages. These spans quote the actual reply, not the proposal;
semantic correspondence remains the planner's judgment.

Existing plans and writer packets remain readable without migration. New
preparation schema names invalidate in-flight request contracts, and the
`relaxed-conditions=1` browser import marker reaches every transitive importer.
Reload SillyTavern to load the changes; the next successful review authors new
material. Existing saved proposals are not rewritten on disk.

Regression coverage exercises unconditional entries and initiatives through
both preparation stages, actual writer composition, save/load and retention,
and verifies that real conditions and inaccessible-route checks survive. Live
model storytelling quality has not been evaluated for this change.

Verified locally with Node 24.17.0: all 1,224 tests passed, all 22 changed
JavaScript files passed syntax checks, and `git diff --check` passed.
