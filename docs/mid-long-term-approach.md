# Mid/long-term planning: implementation direction

## Diagnosis

This is not primarily a shortage of future slots. The installed planner can
protect a “wider” record that is still another consequence of the same town's
problem. Its budget fitter also cut away the original journey scope while
retaining generated local framing. Merely adding more instructions or storage
did not make the isolated writer experience the prepared future material.

The later prototype exposed a second problem: a task combining accepted-memory
maintenance with new authorship kept generating prohibitions against completing
NPC work. Separating those responsibilities produced a changed musical duet
and a later physical stagecraft experiment. This diagnoses the tested combined
prototype, not proof that the installed contract has exactly the same defect.

## Route

1. **Source authority:** retain complete source rules; fail an impossible budget
   rather than silently turning a journey into the latest town's story.
2. **Durable wider subjects:** prepare substantive independent interests,
   practices, relationships and situations, including how they can change.
   They are possibilities, not an itinerary, quota or assertions of past events.
   Routine local maintenance cannot overwrite or retire them.
3. **Current creative handoff:** author concrete playable material appropriate
   to actual progress. Supply NPC invention and an observable result, not
   another invitation to start. This output is ephemeral; it cannot edit memory.
4. **Accepted memory:** separately record what accepted play actually changed.
   A request, intention or partial test is not completion. Close finite local
   work on its result, without requiring an OOC “this arc is over.”
5. **Infrequent broad review:** preserve compatible unused subjects; revise
   futures around acquired capabilities and real choices. Ending an entrance
   episode is not ending its subject. Supply complete older evidence witnesses,
   validate citations and reject stale transactions. Archive superseded designs
   without rewriting accepted observations.

Do not combine all five responsibilities in one overloaded completion merely
to call it single-pass. The proposed normal creative path uses one TF authoring
call before the writer; memory and broad review are separate, less frequent
operations. That scheduling policy still needs production integration and
measurement. More calls on every turn is not the recommendation.

## Evidence and scope of delivery

The detailed record is in `multi-horizon-evaluation-2026-09-17.md`.
The initial twelve-turn seamless run **failed** middle/later uptake despite
preserving all wider subjects. Subsequent disclosed continuations achieved
NPC-led introduction, a performed changed duet, later lantern development, and
a completed private moth reveal after the revised preparation was applied.
The player used ordinary IC dialogue and their own activities, not OOC arc
closure. Weeks/summer were explicitly supplied in IC duration messages: this
does not prove autonomous time progression. The unmodified enabled static
writer preset was retained; these were isolated requests, not native ST runs.

The corrected broad review passed its first response, updated Jo's future
design, retained two unused subjects and preserved accepted observations.
It still contained a stale location in an optional retention rationale. That
rationale is not accepted memory. Review semantics are not guaranteed by JSON
validation; the earlier premature local retirement also remains a known defect.

**Production code changes in this work are limited to source preservation and
complete `oneOf` schema instructions.** The responsibility-separated route is
an isolated prototype under `scripts/`, not an installed planning replacement.
No live ST chat, settings, preset or extension installation is modified.

Before enabling a replacement: integrate bounded witness retrieval, accepted
reply/swipe semantics, restart persistence and review scheduling; test the
original fantasy setting as well as the touring fixture with the final route.
Earlier fantasy tests failed; they are not converted into passes by the touring
result. Short successful samples demonstrate feasibility, not months of reliable
play, universal creativity or a finished full masque.

## Reproduce without touching ST

The scripts read provider configuration from `TF_ST_ROOT`; credentials are used
privately, never included in saved requests. Outputs must be fresh directories
outside the repository and ST. Live calls consume provider capacity.

- `evaluate-seamless-play.mjs`: fixed initial touring fixture, twelve writer
  rounds with an IC simulator, memory and review. This is the disclosed baseline,
  **not** the final authoring route.
- `continue-seamless-play.mjs --author`: one ordinary IC continuation, one
  creative-only handoff and one writer reply, using `TF_PARENT`, `TF_PLAYER_FILE`
  and `TF_EVAL_OUTPUT`. It preserves durable state unchanged.
- `review-seamless-play.mjs`: one transactional review of `TF_PARENT`, including
  old witnesses, with results in `TF_EVAL_OUTPUT`.

Each parent contains `state.json`, `source.json`, `preset.json` and
`accepted-conversation.json`. Raw transcripts and failed attempts stay external.
One contract repair is allowed; there are no hidden semantic rerolls.
