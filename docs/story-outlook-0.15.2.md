# Durable selected outlook — 0.15.2

## Why another good initial output was not enough

The workshop retained wider preparation, and openings made it selectable, but
the scene stage still rewrote all three writer horizons on every review. In the
inspected live chat, a substantive future selected at revision 79 had collapsed
to washing and supper by revision 80 while its private trajectory survived.
This was a lifecycle problem, not a shortage of franchise examples.

## Separate current selection from future selection

The scene contract now authors two independent contributions:

- `selected_material`: current observable circumstances, without its own
  `developing` or `lasting` fields.
- `outlook`: an explicit keep/replace/clear review of one retained trajectory's
  authored conditional intermediate and farther possibilities. The decision
  reason is private. Keeping copies those two horizons exactly; local routine
  updates cannot silently rewrite them.

The optional saved `workingPlan.outlook` contains the selected trajectory id and
its two authored horizons. A fresh accessible opening or linked local development
must support it on every review. Changed or retired trajectories require explicit
replacement or withdrawal. A locally tracked outlook requires its selected local
entry and prerequisites; bare private preparation is never writer context.

The host composes the current selection, the chosen opening's authored
circumstance, and the durable horizons into the existing one-packet writer
format. The scene prompt separates additional current material from that
automatically included opening to avoid restating the same entry twice. Private
access bases, initiatives, selection reasons, goals and other trajectories are
not automatically copied. Positive encounter and participation conditions belong
in authored writer fields; planner commentary about pressure or pacing does not.

This is persistence, not a scheduled plot. Accepted participation can advance
the outlook; refusal, changed premises, lost access or closure can withdraw it.
There is no obligatory replacement or interruption. A quiet or concluded story
can select current circumstances only, or nothing. No story/franchise keyword
rules or word-filter quality heuristics were added.

Existing plans without an outlook remain readable. New active scenes use
`tale_fairy_scene_v3`; the legacy bounded draft retains its former contract and
900-character available-field boundary. Saved composed circumstances can hold
up to 1,800 characters, accommodating a 900-character current surface and a
700-character opening. The 600-token packet target remains a soft target.

The two-stage atomic transaction and three-request ceiling are unchanged: two
normal requests and at most one shared invalid-output correction. No extra
provider stage or shortening call was added. Cache markers cover the changed
modules and their transitive importers.

## Verification

The full suite passes 1,125 tests. New regressions cover five routine updates,
exact horizon preservation, entry renewal, linked-local access, changed/retired
trajectories, explicit advancement and refusal, private-text exclusion,
save/load validation, and untrusted/rebuilt source. A host-lifecycle regression
also exercises active split preparation, metadata reload, post-response review
and source-safe regeneration with the selected outlook intact.

Isolated live-provider probes on 2026-10-04 used the saved gpt-6-sol planner,
temperature 0.8, low reasoning. Each continuity probe ran initial preparation,
two explicitly synthetic routine continuations, then refusal of the selected
possibility. All 12 transactions were accepted:

| Case | Substantive selected future | Routine updates | Refusal | Calls by stage |
| --- | --- | --- | --- | --- |
| Verified 528-message pre-reply chat snapshot | Harvest/preserves gathering, a later blind tasting, then competing proposals for sharing the chosen recipe beyond the household | Both retained the exact mid/far text while updating washhouse circumstances | Cleared the outlook; kept present companionship only | 2 / 2 / 2 / 2 |
| School music club | Listening from different rehearsal positions, later instrument/part variations, then comparing recordings over snacks | Both retained the exact mid/far text | Withdrew the declined listening project and prepared shared meal/recipe play | 2 / 2 / 3 / 2 |
| Traveling companions | A town's bread exchange, competing baking methods, then an autumn recipe exchange | Both retained the exact mid/far text | Withdrew that destination and selected a conditional terrace-garden visit | 2 / 2 / 2 / 3 |

The corrected music draft had proposed a changed consequence without accepted
message witnesses. The travel refusal corrected an overlong setting field. No
correction exceeded the shared request ceiling. Some workshop/local outputs
exceeded their soft sizing targets and were retained without extra calls.

After clarifying the current/entry separation, an additional travel probe used
only the selected opening for its current surface, without the duplicated entry
seen in the earlier run. A final closed-evening probe kept `outlook=[]` and a
current meal conversation only. Both needed two calls. The closed case still
contained a mild participation disclaimer; prompt separation reduces such
commentary but does not guarantee every generated sentence is ideal.

These are planner continuity and writer-context checks, not proof that actual
RP replies will enact a good long-running story. They use synthetic continuation
messages in isolated copies, never writes to the user's chat. Frozen references
cannot reproduce every browser-only input. Semantic quality, access plausibility
and appropriate selection still depend on the planner; validation does not prove
creativity. Persistence prevents inadvertent rewrite on keep, not every possible
bad replacement decision. Longer real-play assessment remains necessary.

Run `scripts/evaluate-story-progression.mjs --live --continuity` with `TF_ST_ROOT`
and `TF_CASE=journey` or `music`. `TF_FROZEN` can name an existing verified
saved-plan freeze for the real-chat case. These opt-in runs use the configured
provider and save prompts, outputs and state to a fresh OS temporary directory.
