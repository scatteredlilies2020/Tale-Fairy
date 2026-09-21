# Lean RP plotting

## Private preparation

The existing planner response now includes one `rp_brief`: a revisable description
of this RP's premise, recurring activities, source continuity, departures and
emerging direction. It is limited to 900 characters and instructed to stay under
150 words. It appears in the notebook and next planner input, never the writer
injection. It is a draft, not evidence or a new continuity ledger.

For an established fictional setting, the prompt uses relevant known canon as a
baseline. The RP's timeline, alternate premises and accepted play take precedence.
Unknowns remain unknown; neither missing history nor canonical events are forced
into play. There is no external canon lookup or franchise-specific template.

No activity tracker or new progress status is introduced. Existing witness and
access checks remain. Rest, departure, quiet activity, unresolved disengagement,
completed work and an independent next undertaking are valid plot possibilities.
The planner does not decide player actions, advance time or mandate a rotation.

## Partial planner updates

An existing subject can omit unchanged initiative, development, stakes or
participation fields. The reader retains those fields under the exact saved id.
Partial initiative objects retain missing fields only when any supplied owner
and control still match. Reframes and scope resets never reuse old fields.

Incomplete new drafts, or updates without a complete fresh background/access
assessment, are left out of that review while unrelated valid work saves.
Existing subjects remain stored. Shared writer prose that depends on a deferred
draft is withheld as a whole; its ids are never stripped while keeping its prose.
Witnessed progress for existing subjects still passes normal evidence checks.
The status reports deferred developments and withheld material. No extra model
call is made, and missing ownership or evidence is never invented.

Unsupported citation addresses are discarded individually. Progress without a
remaining exact witness is skipped, preserving the previous ledger. Retirement
without a witness matching its declared message indices is skipped, preserving
the subject. Independently supported claims and fresh planning can still save.
The status reports skipped claims; evidence is never guessed or borrowed from
another stage of an episode. This also handles absent or malformed citations.

Explicit invalid proposal values, player ownership and conflicting subject
updates still reject the transaction. The raw response is retained in the pass
result for diagnostics.

## Writer material, not a preset

The writer receives zero or one concise packet of available circumstances.
Mid- and long-term possibilities are optional, not required padding. The private
brief, subject IDs, background causes and witness records remain private.

All generated fields are instructed to exclude mood, tone, pacing and prose
directions. Intended effects must come from circumstances, events, choices or
consequences. For example: a room and hot supper are available; tomorrow's coach
leaves at dawn. Not: make the scene cozy, slow down, or use a reflective tone.
These are prompt constraints, not a semantic guarantee. Explicit saved author
instructions remain verbatim; the update does not rewrite them or the preset.

## Context and budgets

- Keep supplied card/persona/scenario references, accepted play and author notes.
- Read exposed summary text from host prompts, chat metadata and the latest
  message summary per key within the last 32 messages. Do not serialize private
  stores, reasoning or writing presets. Remove TF's own tagged context.
- Observe lore already activated by the host. Never load books, run activation
  or scan a lorebook independently. The temporary snapshot is chat/branch-bound,
  usable through the resulting reply, and cleared at the next story generation.
  After reload, lore becomes available when the host next activates it.
- CM and other evidence providers remain optional and read-only. CM keeps its
  existing freshness checks; exposed host summaries are lower-confidence recall,
  never accepted-event proof. Generic extension formats are not guaranteed.
- Bound the host source pool to 64 records. Deduplicate exact text, not similar
  claims. Sources share the existing optional summary budget; oversized sources
  are omitted whole. No extra AI compression or scan pass.
- Count the actual request envelope before sending. Required inputs that cannot
  fit fail locally. Writer context is limited to 1,000 conservatively estimated
  tokens, except explicitly preserved author-only overflow, which is reported.
  See [token safety and provider limitations](token-safety.md).

Each normal review rebuilds selection rather than copying old selected prose.
Existing saves remain readable. Full Rebuild starts fresh preparation from the
available context and archives the previous TF preparation as before. Delete
removes TF state and its temporary lore snapshot. Neither operation edits host
summaries, lorebooks or CM.

## Verification

Local check: **895/895 tests passed on Node 24.17.0**. All six changed or new
JavaScript files passed syntax checks; `git diff --check` passed.

Deterministic tests cover private brief persistence, optional horizons, prompt
boundaries, source deduplication, budgets, host activation, branch invalidation,
single-call planning, rebuild/delete isolation, legacy saved packets, partial
development updates, deferred drafts, unsupported citation isolation, stale-plan
refreshes and preserved ownership/evidence checks.

No live-provider or sustained RP-quality evaluation was performed. Whether a
model consistently supplies varied, useful developments still needs live play;
passing code tests does not establish that result.
