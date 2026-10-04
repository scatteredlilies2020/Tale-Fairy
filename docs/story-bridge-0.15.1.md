# Playable openings and source-safe recovery — 0.15.1

## The remaining bottlenecks

Separating future preparation from scene selection improved private horizons,
but did not guarantee that any wider possibility reached the writer. Four
unfinished local tasks could still occupy the entire selectable repertoire.
In the inspected saved chat, island routines dominated selection despite richer
private episodes. Regeneration also invalidated the post-response preparation,
leaving a blank packet even when earlier preparation could safely be recovered.

## Independent space for entry into future episodes

The scene plan now has `openings`, with room for zero to two proposed entry
situations independent of the four local developments. Each opening links one
retained trajectory to a concrete circumstance and access conditions. It can
be selected directly by trajectory id; a bare private trajectory cannot.

The selector can invent a fitting route into a prepared experience: nearby NPC
activity, a voluntary shared occasion, information, an encounter, or a later
destination. The route need not already appear in accepted prose. Distance,
knowledge, timing, refusal and participation remain prerequisites. Opening
proposals are reconsidered each pass rather than counted as unfinished promises;
withdrawing one needs no fictional closure and does not erase its trajectory.
An undertaking that actually develops can be tracked in the local ledger.

Projection, validation and save/load support four local subjects plus two
openings. Unknown/duplicate/private opening selections are rejected. The writer
still gets only selected observable circumstances and conditional mid/long-term
story substance, not private goals, ids, workshop instructions or all horizons.
There is no mandatory interruption, opening quota, franchise rule or keyword
quality filter. Empty openings and selection remain valid.

Older stored plans are readable without `openings`; the active scene contract
requires the field. The legacy bounded draft contract remains unchanged.

## Recovery follows the accepted branch

- A checkpoint must be a complete valid preparation with the same chat,
  reference/settings hash and exact accepted source prefix. Archived rebuilds
  are searched too. Invalid post-response plans are never rebound to a shorter
  source or used as creative premises.
- Writer reuse additionally obeys the existing reply-age limit. Recovering a
  writer checkpoint does not rewind the live revision or replace saved metadata.
- New preparation starts from the verified checkpoint, or an empty draft if
  none exists, while retaining the live revision for ids and atomic commit.
  Consequence evidence and past closure guards must also match accepted prefixes;
  a discarded reply cannot close an undertaking on the restored branch.
- Missing pre-reply preparation reserves one automatic repair per exact input
  in metadata before provider work. Rapid swipes share it. Failure, stop and
  reload do not create retry loops. A manual review remains available.
- A successful repair uses the ordinary two-stage transaction: normally two
  calls, three at most including one correction. Generation does not wait, and
  its frozen packet is not modified mid-request. A later request can use the
  completed preparation. Source edits, chat changes and cancellation still
  prevent stale commits.

Browser cache markers cover every transitive importer of changed modules.

## Verification and qualitative probes

Automated regressions cover full local capacity plus both openings, selected
material and persistence, private/unknown/duplicate references, quiet withdrawal,
exact-prefix checkpoint selection, accepted versus discarded closures, active
split-pass recovery, rapid swipes, reload reservations, provider failure, source
edits between stages and frozen in-flight writer packets. Existing cadence,
ownership, evidence, budget and atomic-save tests remain in the full suite.
The complete suite passes 1,109 tests; syntax checks and `git diff --check` pass.

Read-only isolated provider trials on 2026-10-04 used the configured gpt-6-sol,
temperature 0.8 and low reasoning. Every following initial run was accepted in
two calls with no correction:

- A saved-plan 521-message snapshot selected an animal-handling opening with
  a possible island circuit and later harbor supply flight, rather than selecting
  only the incumbent island routine.
- A fresh 526-message pre-reply snapshot recovered verified revision 77, not
  the discarded-response revision 78. It selected a conditional bison-pen
  grooming visit, a later wool-spinning circle, and a possible coat-making
  activity whose expansion creates a concrete supply disagreement. Four local
  subjects remained; two openings fitted alongside them.
- A travel case selected a reachable hill-town archive: an inn notice leads to
  conflicting old-path accounts, a possible survey walk, and discovery of a
  maintained spring whose caretakers have reasons to keep it off public maps.
- A school music case selected melody scraps that can be tried together, revisited
  as contrasting arrangements, and developed into a shared musical guessing game.
  Snack-making and record-shop experiences were prepared separately.
- A bounded evening kept no trajectories or openings. Its packet stayed with
  the shared meal and conversation, not a compulsory new adventure.

Some drafts exceeded the soft sizing targets and were retained without extra
shortening calls. In the fresh saved-chat probe, the scene input was approximately
11,840 tokens against the 10,000-token target; the selected packet was 336 tokens.
These runs demonstrate that prepared future substance can reach writer context,
not that actual RP replies will reliably enact it. The live chat and settings
were not modified, and no live story reply was generated. Frozen cases cannot
reproduce every browser-only World Info or continuity input. Longer actual-play
evaluation is still needed; schema success is not a creativity guarantee.

To freeze the accepted pre-reply prefix for this check, the existing evaluation
script accepts `--freeze --saved-plan --pre-reply-checkpoint` with `TF_CASE=real`.
It reads a verified earlier checkpoint rather than silently rebinding a stale
one. Pass the resulting directory as `TF_FROZEN` to the opt-in
`evaluate-story-progression.mjs --live` runner. Results use fresh temporary
directories and never write to the installed chat.
