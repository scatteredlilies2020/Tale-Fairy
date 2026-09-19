# Whole-story guidance horizons — 0.14.34

**Release gate passed:** 817 deterministic tests and 17/17 accepted live planner
reviews on the fixed release bundle. Manual inspection of the actual serialized
packets supports release for open mid-/long-term guidance and automatic selection
maintenance; it is not a guarantee of flawless model grounding.
See [the complete gate, limitations and decision](background-discovery-2026-09-19.md#release-gate-result).

## Contract

The normal single planning response separates:

1. **Selected horizons**: one integrated set of available circumstances,
   medium-term possibilities and longer-term possibilities for the writer.
2. **Private preparation**: enduring NPC/world aims, including dormant aims.
3. **Private background**: independent NPC/world developments, grounded in
   fictional time/conditions and assessed for present discoverability.
4. **Accepted progress**: finite experiences supported by message witnesses.

The packet can support several independent activities; one packet does **not**
mean one event, one scene or one forced storyline. It avoids the former template
of a miniature beginning/middle/ending under every owner. Connected aims can
contribute together without repeating their shared process as separate requests.

Only these selected horizons and the user's verbatim author instructions enter
the writer request. Private campaign notes, stakes, subject ids, citations and
unselected aims do not. No new preset, writing-style or pacing instruction is
added. The model supplies circumstances; the writer and player choose execution.

Each private subject update includes its own background, even when no material
is selected. Omitted aims remain dormant; omission does not retire them or retain
their old injected material. Its `unfolding` and `basis` remain provisional preparation;
they never enter the accepted-event ledger. `access` is a presently plausible
route through observation, locality, contact, information or investigation.
This means access to a trace or conditional opportunity, not knowledge of the
whole private process; an existing announcement does not require repeated news.
`none` excludes that subject from the entire selected packet. An open route is
permission to select, not an obligation. The planner authors background before
selection; runtime validation requires fresh background for every selected
contributor and rejects inconsistent references atomically. Unchanged aims are
not re-archived. Legacy unreviewed background defaults to private/inaccessible,
never a fabricated world event. Storage keeps the old aim/evidence representation
and archives changed background separately.

This is not Story Engine's deterministic clock or outcome resolver. Fictional
time and causal applicability are assessed by the existing planner. Reply count
does not advance processes, hidden causes do not become character knowledge,
and no narration is generated to force a discovery. Removing automatic owner
serialization also avoids leaking private actors through a `source` field.

## Automatic maintenance and safety

- Every successful review returns a complete selection snapshot. There is no
  implicit carry-over or `keep` bypass. Useful material can remain without novelty.
- Previous selected prose and the old local scene are withheld from subsequent
  planning input. Durable aims, private background and witnessed progress remain;
  latest accepted play supplies current circumstances. Static premises precede
  current play so outdated initial conditions are not the last story evidence.
- An explicit empty snapshot withdraws the selection, not the durable aims or
  accepted progress. Closed one-scene play need not acquire a longer campaign.
- Subject references must exist after updates and retirement. Missing snapshots,
  unknown references, invalid fields and truncation fail atomically.
- The existing exact-witness transaction still validates progress and whole-subject
  retirement. Final progress and retirement can occur in one transaction: the
  subject leaves active preparation while its final witnesses survive privately.
  Retirement takes precedence over an overlapping private update; retiring ids
  cannot contribute to selected material. Invalid evidence rolls back both.
  The planner cites numbered spans of supplied accepted messages; the application
  resolves their exact source text into the existing witness ledger, avoiding
  brittle copying of formatted tables. Missing addresses fail, never fuzzy-match.
  Continued participation after partial accomplishment preserves that achieved
  milestone and its witness rather than undoing it or blocking fresh selection.
  Proposals cannot establish events or player commitments.
- Old per-subject selections are archived after a successful review. Existing
  subject identities and witnessed episodes survive. Scope resets withhold old
  drafts and archive them only on success.
- No classifier, critic, response repair, additional model call, automatic retry,
  new timer or changed planner setting is introduced.
- Normal generation, regeneration and swipes use the authenticated selection
  snapshot; rejected updates cannot partially replace it.

Updating requires a page reload to load the new code. Selection is regenerated
by the normal automatic planning cycle, not by rewriting a saved RP on disk.
Until a successful review, compatible previous preparation remains available.

## Verification boundary

Deterministic tests cover serialization, migration, source edits, evidence,
transactional rejection, metadata, cache authentication and retry paths. These
prove implementation properties, **not creative quality**.

Live planner evaluations use the configured model and settings, frozen saved RP
or fixed synthetic accepted play, and one ordinary request per review. They
inspect the serialized writer packet. They do not invoke the RP writer, reproduce
browser World Info/Continuity assembly, or prove actual use by a returned reply.

The research log records failures as well as accepted output:
[evaluation record](open-material-evaluation-2026-09-19.md).
The subsequent discoverability experiment, failed gates and final release gate are recorded in
[background/discovery evaluation](background-discovery-2026-09-19.md).
