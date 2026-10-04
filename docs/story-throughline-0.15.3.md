# Story throughline and reference-safe reconsideration — 0.15.3

## Diagnosis

Durable outlook text prevented routine rewriting, but did not ensure that the
workshop prepared the story the player was actually pursuing. Its instruction
to treat accepted play as constraints rather than the subject to continue
overcorrected toward independent episodes. In the inspected new-story case,
an active political investigation received three profession-centered side
futures, and the nearest medical opportunity displaced the developing story.

The earlier political preparation had not been explicitly retired: the reference
hash changed, so the strict checkpoint gate rejected it before the workshop.
The exact changed reference field was not established. Both the workshop's
orientation and the treatment of invalidated ideas needed attention.

## Changes

- `workingPlan.throughline` privately records the unfolding story, its grounding
  in the premise and choices, and one or two retained trajectory ids. It is
  required in new workshop responses, optional in historical saved plans.
  Empty is valid for unsteered or concluded play.
- The workshop develops these trajectories first, then independent breadth
  within the existing three-trajectory capacity. Each trajectory prepares an
  undertaking, a subsequent episode, and a farther experience enabled by changed
  relationships, knowledge, capabilities or circumstances. The instruction
  explicitly extends beyond completion of the first incident or activity.
- The scene stage cannot edit the throughline. If it provides access to a linked
  future, an independent future cannot displace that direction in the selected
  outlook. It can still add present circumstances, leave inaccessible futures
  private, or clear the outlook for a pause. The workshop can redirect the story
  when actual choices or refusals change it.
- Reference changes preserve strict guidance, fact and coverage invalidation.
  `campaignReconsideration` can recover only wider proposals from a valid exact
  same-chat source prefix. The workshop compares these with current references
  and re-authors compatible ideas under new ids. Local drafts, consequences,
  selected outlook and trusted review coverage are not restored. Explicit
  rebuilds and discarded branches cannot use this path.
- Reconsidered proposals are optional budget context and yield before fresh
  references or unreviewed choices. Private direction never becomes an injected
  writer instruction.

The two-stage atomic transaction, shared correction credit, three-request ceiling
and output targets are unchanged. Browser cache markers cover the changed modules
and their transitive importers. No franchise-specific selection rules, semantic
word filters, automatic story messages or extra provider stage were added.

## Verification

The full regression suite passes **1,138 tests**. New coverage includes private
direction save/load, routine persistence, read-only scene access, dangling and
duplicate links, main/side outlook selection, deliberate pause, strict source
prefix gates, archive recovery, changed references in the actual host lifecycle,
proposal-only budgeting, and the transitive browser cache graph.

Isolated live-provider checks used the configured gpt-6-sol planner, temperature
0.8 and low reasoning. No synthetic continuations were written to the live chat.

- **New-story opening:** the first two accepted messages produced rescue,
  treaty investigation and a later border prisoner exchange, rather than a
  profession-only side project. Early choices maintained the investigation.
- **Reference edit:** a synthetic meaning-preserving reference change caused
  strict invalidation, then new-id re-authoring of the investigation and family
  aftermath. The main direction survived without restoring old trusted facts.
  These three stages used 2 / 3 / 2 requests. The following continuation hit a
  provider HTTP 502; that transaction did not commit. A follow-up resumed from
  the last accepted checkpoint, not the failed draft. The continuation and two
  routine reviews retained the investigation, with unchanged future text on
  the quiet reviews. Explicit refusal redirected the throughline toward family
  relationships. These four stages completed with 3 / 2 / 2 / 2 requests.
- **Music club:** a shared musical phrase developed into later musical-postcard
  afternoons and an established friendship habit. Two routine reviews retained
  both future fields exactly. Explicit refusal redirected preparation toward
  private companionship. All four stages completed with two requests each.
- **Northward journey:** a stop among fen bridges developed into a community
  walking map, then a later encounter farther north with someone connected to
  a name in the companions' journal. The direction covered travel and memories
  beyond the opening location. Two quiet reviews retained the future text;
  refusal redirected preparation toward the existing companions. All four
  stages completed with two requests each.
- **Explicitly one-evening story:** preparation stayed within the family meal
  and reconciliation, rather than adding a campaign or external crisis. Two
  requests. This deliberately bounded premise appropriately has shorter range;
  the output still contained some optional-participation commentary.

The installed ST extension was also tested through its browser UI on the current
15-message story. The page loaded the 0.15.3 entry point and saved revision 3:
guesthouse inquiry, a later diplomatic evidence dispute, then changed delegation
access rules affecting protection and the medic's work. This replaced the
profession-only selected side future with the investigation the player pursued.
The request completed in 64 seconds with three calls; the shared correction
fixed missing accepted-message witnesses for a consequence. All 15 story messages
remained unchanged (matching before/after content hashes); no writer reply was
generated. Planning was initially off, temporarily enabled with permission, and
turned off again after the test.

This live preparation exceeded the soft targets: approximately 2,354 horizon
tokens versus 1,400, and 1,662 local-plan tokens versus 900. One stage used 10,253
input tokens versus the 10,000 target. The selected writer packet remained about
556 tokens. Valid preparation was retained rather than spending another request
on shortening; this result is not evidence that target sizes are always met.

These checks establish lifecycle behavior and sampled planning quality, not a
guarantee of satisfying long-running RP. Selection and episode substance still
depend on the model. Reference reconsideration can change or narrow an idea;
it is not exact-text persistence. The writer remains responsible for enacting
possibilities, and the user's preset still owns prose and pacing.

Run `scripts/evaluate-story-progression.mjs --live --continuity` with `TF_ST_ROOT`
and `TF_CASE=journey` or `music`. `TF_FROZEN` names a verified saved-plan freeze.
Add `--new-story` to evaluate its opening, early choices, a synthetic reference
edit and the remaining accepted conversation through the production checkpoint
and reconsideration gates. These opt-in runs use the configured provider and
save prompts, outputs and state only in fresh OS temporary directories.
