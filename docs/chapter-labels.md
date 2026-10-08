# Chapter → Arc → Subplot — v0.19.4

- **Chapter:** the current broad period or situation; exactly one active root in each successful current-format review.
- **Arc:** a sustained storyline connected to that Chapter.
- **Subplot:** an optional substantial smaller storyline connected to an Arc, not a task, status or loose end.

The world frame remains above these cards as the lasting RP premise. A canonical anime arc may be our Chapter: the Hyuga Affair need not be wrapped in a larger invented conflict. Naming follows the RP's scope and genre, not book divisions or franchise terminology. Quiet play can keep only a Chapter; no Arc/Subplot quota, forced escalation or new filler is introduced. Existing card titles are preserved unless the story itself warrants a change.

## Compatibility

The board, settings, planner instructions and validation messages use the new labels. The stored/response kind codes remain `saga`, `arc` and `thread` for compatibility with saved maps, pending jobs and historical regeneration proofs. The response schema and planner explicitly map these codes to Chapter, Arc and Subplot.

Successful reviews mark their preparation with `terminology: "chapter-arc-subplot"`. Only these preparations serialize writer-facing kinds and ancestor context as `chapter`, `arc` and `subplot`. Older packets remain byte-stable until review, including authenticated swipes. Merely opening a board does not migrate data, rewrite titles or make a model call. Failed reviews leave the previous preparation intact. No full rebuild, chat edit or memory rescan is required.

Review triggers, pending server jobs, retries and cancellation behavior are unchanged from [v0.19.3](server-planning.md). Main and testing receive the same verified commit before the installed extension is fast-forwarded. Reload the browser to load the new labels; updating a running backend still requires a SillyTavern restart.

## Explicit and implied closure

Substantial time skips prompt the director to reconsider every level for closure. A festival window or school term clearly in the past can end its story without claiming the player attended, performed well or made a particular decision. Ordinary completion can be inferred when supported by the activity skip; routine steps need not be replayed. Elapsed time alone does not settle a conflict, cure a patient or make an unchosen commitment.

Ended cards and their effects leave the working board and writer selection; obsolete proposals can be withdrawn without claiming they happened. If a Chapter ends, the same successful review supplies its successor and reconnects substantial surviving Arcs. Old archives remain unchanged. This is model interpretation of accepted play and ending boundaries, not a fixed number-of-days rule. Explicit `Time skip:` directions already invalidate public guidance and request review; ordinary narrative time changes rely on the writer review signal or regular review.

## Checks

`tests/chapter-labels.test.js` exercises old-map rendering, prompt/schema terminology, writer kind/path translation, retained-node review, archive preservation, authenticated old packets and failed-review preservation. Existing hierarchy, filler, budget, generation and server-job tests remain in the full suite. These are deterministic regression tests, not a live model-quality measurement.

`tests/time-skip-closure.test.js` uses mocked responses to verify end-to-end closure of Chapters/Arcs/Subplots, Chapter replacement, survivor reconnection, effect removal, smaller explicit resolution, preservation of unresolved stories and immediate invalidation on explicit time-skip direction.

Release verification: all 1,439 tests passed. Two isolated checks with the configured planner model also passed using synthetic RP only: a January skip closed autumn/festival preparation, replaced the Chapter and preserved an unresolved friendship; a hospital-work skip removed incidental care preparation and a previously completed negotiation while preserving the unresolved forged-records investigation. Neither check read or modified the active chat. These are targeted model checks, not a guarantee about every time skip.
