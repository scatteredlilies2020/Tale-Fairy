# Story workshop — 0.15.0

## Why change the architecture

Earlier releases added scope analysis, goals, mid/long-term fields and durable
progression. Those improve representation, but a single request still had to
invent wider possibilities, maintain the current scene and select writer
guidance inside one plan budget. In an entrenched saved plan, the recent scene
and its local maintenance repeatedly became the entire future. A different
sentence in `later` is not proof of a different experience.

The active host now uses `extension/story-preparation.js`, not
`storyPassWithRecovery`. The latter remains for compatibility and historical
regressions. There is no franchise-specific rule, topic quota or keyword quality
validator in the new pipeline.

## Two responsibilities, one transaction

1. **Story workshop.** Source premise, durable wider preparation, and accepted
   changes since the verified review are its inputs. It never receives the local
   task list, local goals, previous writer packet or archived drafts. The usual
   reviewed scene tail is excluded even when it would fit. A manual review keeps
   the latest exchange; without verified coverage, no supplied play is omitted.
   All unreviewed accepted messages are preserved, not summarized or clipped.

   The workshop prepares up to three concrete possible future episodes. Each has
   a particular playable experience, NPC/world interest, intermediate development
   and distinct farther possibility with causal conditions. These are invented
   possibilities, not accepted history. Patches preserve omitted trajectories;
   revising or retiring them is explicit. Older trajectories without the new
   `experience` field remain readable; new/revised trajectories require it.

2. **Scene selection.** The rolling local context, local plan and newly prepared
   horizon go to a separate request. Its schema cannot return or edit the wider
   analysis or progression. It maintains local work, validates witnessed outcomes,
   evaluates access and selects story substance. Inaccessible preparation stays
   private; quiet play can select nothing. Local work can continue independently
   of retiring an old chore-shaped horizon.

3. **Atomic save.** The shared validator merges the workshop patch with the local
   result. Nothing is committed between stages. A failure, cancellation or stale
   source leaves the entire previous preparation intact. Source/reference/settings/
   state/evidence checks run before every provider send and at commit. The existing
   reservation, reload deduplication, accepted-span witnesses, reply freshness and
   player-ownership protections remain in force.

Normal cost is **two provider requests**. The transaction has **one shared repair
credit**, so three is the hard ceiling. A scene correction never repeats the
workshop. Transport failures are not retried automatically. Valid oversized work
is retained without a shortening request. Per-field safety ceilings are saved-
state ceilings, not the older tiny drafting allowances. Trajectory prose ceilings
were also expanded to allow complete paragraphs; the total soft target, three-
trajectory capacity and provider output allowance still bound the workload.

Separate soft targets: 10,000 input tokens **per stage**, 1,400 tokens for wider
preparation including analysis, 900 for local preparation, and 600 for the selected
packet. Each provider call retains the 3,000-token output allowance. Actual model
context limits still apply. The inspector exposes private experiences; progress
distinguishes the two stages from a correction. Author notes and the writer's
preset retain their existing roles. No new writer instructions are serialized.

## Verification and qualitative evaluation

Unit and active-host tests cover isolation of contexts, read-only horizon handoff,
unchanged progression, explicit refusal/retirement, empty horizons, unreviewed
player text, exact sent-span witnesses, ownership, saved-state round trips,
atomic failure, source edits between stages, reload deduplication, stage reporting
and the shared request ceiling. Historical wire fixtures are explicitly labelled
as legacy; they do not pretend to test the new two-stage schema.
The complete test suite passes 1,097 tests. Syntax checks and `git diff --check`
also pass.

Opt-in evaluation: `TF_ST_ROOT=... node scripts/evaluate-story-progression.mjs --live`.
`TF_CASE` selects `journey`, `music`, `closed`, `touring` or `ecosystem`.
`TF_FROZEN` accepts an existing `evaluate-campaign-pass.mjs --freeze --saved-plan`
snapshot, verifies its source prefix and starts from that saved plan instead of
an empty state. Results go to fresh OS temporary directories. This reads the
configured provider but never changes the live chat or settings.

Development trials on 2026-10-04 used gpt-6-sol, temperature 0.8, low reasoning:

- A frozen 521-message franchise chat started with a saved revision-77 plan
  narrowed to gate repair and a practice-floor seam. The first separated-pass
  trial still produced generic topic categories. A second trial with a distinct
  context lens remained too local. Neither was treated as a quality success.
- Explicitly assigning future-episode preparation produced more substantive
  possibilities, but the next trial failed local admission on the old small
  field ceilings. Nothing would have committed. The active schema was then
  separated from those legacy drafting limits.
- The resulting saved-plan trial succeeded in two calls: an animal-handlers'
  shore-flight day, a neighborhood printshop open house with a civic-notice
  disagreement, and a qualifier-night sporting occasion. The two narrow old
  trajectories were explicitly retired, while local unfinished work remained.
  The selected packet stayed with accessible island activity rather than dumping
  the unrelated printshop into the current greeting.
- The journey probe produced three distinct northern settlements: a floating
  supper with a practical soup spell, a wind/sound route map, and a communal
  glasshouse exchange. The music probe produced sound-inspired melody sketches,
  snack-making and a shared bass-pattern activity, without a mandatory concert.
  Each used its one correction allowance and then succeeded. Some local/wider
  drafts exceeded their soft targets and were retained intact.
- The closed-evening probe succeeded in two calls with no trajectories. A touring
  probe then exposed another arbitrary prose-limit failure: a complete future
  development exceeded the old 140-character ceiling after correction. Rather
  than repeatedly asking the model to abbreviate valid substance, the final
  trajectory schema uses larger safety ceilings and the existing total soft
  target. Replaying every captured first response from these development trials
  against the final shape passed without any field-length correction. This replay
  checks shape only, not semantic validity or creative quality.
- A fresh saved-plan run with the final code succeeded in two calls. Its prepared
  episodes were a supporters' night developing into a post-match supper and a
  mixed-team relief exhibition, and a threatened evening ferry developing into
  a passenger-count trial and a concrete route decision. Both old repair-shaped
  trajectories were retired; unfinished local work was retained. The immediate
  writer packet still concerned the current animal greeting. This demonstrates
  broader private preparation, not that an unrelated future episode was enacted.
- A fresh touring run with the final code succeeded in two calls at each of three
  stages. It prepared a floating theatre festival, a composer's songbook and a
  shared hill-fair stage. A quiet tea exchange left all three trajectories exactly
  unchanged. An explicit preference for private music revised only the songbook:
  its public debut became recurring private playing, while the other two futures
  remained intact. The horizon exceeded its soft target and was retained without
  a shortening request.

These are small qualitative probes, not a creativity guarantee. The saved-chat
freeze includes its resolved static card/persona and saved preparation, not a
reproduction of live World Info/Continuity injection or every browser-only input.
No live RP reply was generated. Good preparation still needs evaluation over
actual play; schema validity alone is not evidence that the storytelling problem
is solved.
