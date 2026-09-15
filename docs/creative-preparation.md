# Creative preparation contract — 0.14.13

## Purpose

Prepare a working GM notebook: material for the middle of the RP, what could grow beyond it, and how the world could feel alive. Do not simulate everything, prescribe an ending, or reduce preparation to a next-reply correction. The planner can invent compatible material without prior mention. The writer decides how and whether to realize it in the actual exchange.

This is a prompt-and-state design, not a creativity guarantee. Both the routine and broad planner use the same creative mandate in a single generated response. Neither a debate transcript nor a second critic call is required.

## Three separate layers

1. **Factual reference:** actual conversation, saved continuity, and optional summaries. The new planner does not generate a second scene recap or overwrite factual memory. Source freshness still matters; proposals never establish history.
2. **Persistent preparation:** `preparedWorld` in per-chat state. `approach` contains provisional story-specific aims grounded in references and explicit preferences, not general writing rules or a replacement preset; the working view supplies up to 12 records; `focus` selects up to three for the writer. A private source proof binds the board to its source prefix and author/card/lore input key.
3. **Writer packet:** permanent agency rules, saved pacing preference, grounded plot anchor and compatible conditional preparation. The selected packet is frozen for request verification; a newer compatible pre-reply plan can serve subsequent requests and retries. Legacy/fallback factual slices remain supported, but new preparation does not generate them.

The source text in plot anchors is still bounded transcript evidence, not newly generated prose. The creative notebook asks the model to distill meaning rather than copy repetitive narration. Unselected notebook entries and source hashes are not injected.

## Planner output and lifecycle

All new planner requests use contract 14: `{contract_version, prepared: {approach, updates, status_changes?, focus}}`, with optional author-note classification. There is one compact response shape and one generation on every tier. No generated recap, overview, factual memory, actor forms, scene classifications, scratchpad reasoning, offscreen boards or reply audits. Extraneous recap fields from earlier experimental responses are discarded rather than injected. Legacy parsers remain for saved/detached compatibility, not as additional planner work.

The first contract-14 result archives legacy proposals in `legacyPreparedWorld` rather than feeding obsolete immediate tasks back into the replacement. Existing factual memory is fallible evidence and user notes remain intact. This archive is preserved in chat state; it is not injected. Runtime state remains version 59 with a separate `plannerContract` marker.

Each update needs a stable `id`, `premise` and playable `middle`. Optional future and knowledge notes are omitted when absent. The model-facing schema requires nonblank text whenever these fields are supplied. Missing status safely defaults to `prepared`; invalid supplied statuses are rejected. New preparation is always a proposal, never factual evidence based on a model-supplied origin label. The full `approach` is returned each time; empty explicitly clears it. There is no generated reasoning field.

| Field | Meaning |
| --- | --- |
| `id` | Stable identifier for deliberate updates, not a story fact. |
| `premise` | Concrete material the GM may use. |
| `middle` | Motives, processes, playable intermediate developments and alternative continuations. |
| `future` | What could grow beyond the middle, not a guaranteed endpoint. |
| `knowledge` | GM secrets, relevant boundaries and what characters can discover. |
| `status` | `prepared`, `active`, `dormant`, `resolved`, or `retired`. |

Updates are deltas, normally zero to two. A major pivot may exceed the twelve-operation writing target so retiring old directions does not prevent adding a new one. Omitted records persist; an empty focus selects no records but does not erase them. Order focus by importance: only fitting whole records are injected. Active requires actual transcript uptake, not mere injection. Dormant records are not selected for injection. Status changes use `status_changes: [{id,status}]` and preserve the existing prose; resolved/retired changes remove the proposal; accepted consequences remain in actual story history and external continuity. Unknown nonterminal status IDs and conflicting operations are rejected; advisory focus is filtered to available records. Saved notebooks have no record-count cap. A bounded working view retrieves focused, relevant, active and recent records without deleting the rest. Legacy engine/entry/hold/invalidation/intervention fields are cleared on replacement records. Introductions are the writer's job. Existing factual memory is preserved, not maintained by this job.

The optional `prepared.summary` is a rolling private planner baseline: create it when absent, preserve omitted older possibilities and unresolved dependencies, and replace it when new evidence or deliberate revisions change them. Omission/null preserves it; an explicit empty string clears it. It is saved with the notebook and its source proof, displayed in the notebook panel, and supplied to subsequent planner calls; it is never injected into the writer. The writing target is 1,200 characters with a 3,600-character schema maximum. Oversized generated summary/approach text is omitted without clipping; the prior saved value survives and complete neighboring developments still apply. Oversized individual developments are likewise omitted as whole records. Recovery is reported, while malformed types and conflicting operations still fail. Author notes keep their complete text and all entries; prompt fitting never drops older notes to make room. Whole optional planner fields can be omitted from a tight prompt, with `omitted_fields` telling the planner to preserve them unless deliberately replacing them. A protected input too large for the configured budget still reports an error rather than losing instructions. Full records remain available for retrieval, since a summary is not lossless or proof of complete archive coverage. The first summary for an existing notebook covers only supplied material, and expands as other records are retrieved. This uses the existing planner call and branch/retry protections.

The bounded prompt builder compacts retained records into a working index before sacrificing current evidence. Stored records remain intact. Routine/review input defaults are 6,000/14,000 tokens including system and shape; base output caps are 4,096/6,144 (8,192 for rebuild). Planner reasoning is Off on every tier. Only a provider that requires thinking receives a Low compatibility fallback. The writer's reasoning settings are untouched. No model repair or critic chain is used. Full notebook and default-envelope tests protect the basic budget contract, not unbounded history recall.

## Broad source evidence

Initialization (including an empty transcript), Full Rebuild and broad reviews collect supplied card/scenario/persona/author-note material, enabled entries from selected lore books, current Continuity planning records plus its exported chronicle, and available summaries from other providers. The active contract-14 prompt receives a protected opening, a chronological transcript map and unresolved-thread candidates. Later corrections and accepted observations take priority over fallible summaries and lore from another era.

Prompt fitting retains representatives of available source kinds and compresses broader evidence within the configured total ceiling. Routine updates retain their smaller evidence path. This is selective coverage, not an unlimited source dump. Open-ended broad passes ask for an independently motivated development that still makes sense without the current local problem; explicit closed scenarios and player choices remain respected.

## Pacing and realization

Follow preset (the existing `auto` value), Linger, Natural and Advance are saved per chat. Follow preset adds no writer pacing instruction; other choices add only a short saved preference, subordinate to latest explicit user directions. The legacy Light/Balanced/Fun narrative-mode control is removed. No English-only keyword gate controls creative entry. A preference change updates packet dependencies; an already compatible notebook can survive that preference-only change, while the active planner is refreshed.

The preset and explicit user instructions govern narrative behavior, viewpoint, player control and NPC autonomy. Tale Fairy supplies facts and optional preparation, not a separate system-authority message, permanent GM contract or scene-fit policy. Private planning instructions govern preparation only. Existing generated approach text remains saved and labeled provisional; future planner updates are instructed to revise or clear unsupported mandates rather than treating them as user preferences. Plans have no turn-based activation countdown.

Example, illustrative rather than a tested model output:

> Wider direction: Explore distinct local experiences along a long journey, not a jump to its endpoint.
>
> Possible development: A mill town buys warmth from a buried creature. Its millers need winter fuel; the creature is learning to bargain.
>
> Middle: Meet the carriers, discover the heating works, and investigate a different fuel source or negotiate continued supply. Either path can change local relationships.
>
> Beyond: A regional trade may form—or neighboring towns may reject this dependency.
>
> Boundaries: Introduce observable clues, not automatic knowledge. Leave room to investigate or refuse. Drop it if accepted events or user constraints contradict it.

This material can remain unused across many exchanges. A possible town is not a compulsory stop; its process supplies several experiences rather than one scripted resolution.

## Background work and safety

- Generation never awaits a planner. Ordinary appended messages retain the running job and coalesce one latest follow-up.
- Local prefix hashing permits preparation to remain usable across any number of ordinary appended turns. It does not semantically prove every entry still fits; the writer must check current events and user directions. The approach and selected whole records share a 1,000-estimated-token injection budget.
- A late append-compatible result updates preparation and its contract/archive bookkeeping, not newer factual memory, scene state or scheduling. Older same-source completion timestamps cannot displace a newer prepared result.
- An edited/deleted/swiped source or changed relevant input fails compatibility. Conditional status is not permission to import a discarded branch. Retries reuse the latest compatible pre-reply packet and rollback-safe factual snapshot. A newer completed same-source analysis can update the next request, while an in-flight selection remains frozen.
- Invalid output does not trigger a second generated correction. Local JSON cleanup and strict validation remain. Unsupported provider options can be negotiated before a result exists; ordinary connection failures do not start an automatic retry chain.
- Provider/reply verification records factual and prepared inclusion separately. The preview explains preparation-only packets instead of claiming stale facts are fresh.

Continuity Memory and generic summaries remain optional evidence. A local source-prefix comparison is not a full-chat AI scan. Missing older facts remain a real limitation; proposals are not a substitute for remembering accepted history.

## Verification boundary

Offline tests cover both schemas and application paths, lifecycle, migration, prompt budgets, append/edit compatibility, late completion, source isolation, frozen in-flight selections and revised pre-reply packets, single-generation failure behavior, pacing persistence and policy separation. The live creative/agency scenarios are in [story-evaluation.md](story-evaluation.md). Passing structural tests does not prove a model produces varied long-term material or that a mobile host renders the controls correctly.

When input budgets require compaction, `items` contains only complete retained records. `retained_index` contains lookup tuples `[id, status, premise label]` (or `[id, status]` at tighter budgets), never update-shaped partial objects. These references preserve access to retained IDs for focus/status changes without suggesting incomplete replacements. Missing/null premise or middle uses the same isolated omission recovery as blank core text; stored prose is never borrowed to fill a replacement or overwritten by one.


## Response acceptance

The v14 live and detached paths share normalization, validation, and content merging. The wire schema continues to request complete records; compatibility handling does not invent missing prose or silently evict stored records.

| Response issue | Acceptance policy |
| --- | --- |
| Excess, duplicate, blank, malformed, or unavailable focus IDs | Keep the first three unique available references after content/status changes; preserve every notebook record. |
| Missing/null optional notes or operation arrays | No-op for omitted operations; no invented notes. Missing/null approach preserves the prior approach; explicit empty text clears it. |
| Lists of prose strings | Join every supplied string in order; mixed/object values remain invalid. |
| Exact `{id,status}` in the content-update array | Route to status changes and validate its existing target; any prose field keeps it a content replacement. |
| Identical repeated operations | Apply once, regardless of field order. Replaying an already completed removal is a no-op. Conflicting operations still fail. |
| Blank/missing core prose | Omit that incomplete replacement and preserve its saved record and complete neighbors. |
| Cutoff after a fully closed prepared object | Accept the complete notebook; omit unfinished trailing fields. A cutoff inside its prose still fails. |
| Invalid IDs/status targets, conflicting edits, oversized prose, or notebook overflow | Reject atomically; keep saved state unchanged and expose the rejection reason. |

The regression matrix exercises presentation variants through both response envelopes and checks saved-content invariants, rejection atomicity, capacity, truncation, compaction, and migration. These cases supplement the existing generation cancellation and reconnect tests.


First-response guidance preserves schema descriptions and unique-item constraints in prompt-only transports. Writing targets are distinguished from the unchanged storage limits; omitting an unchanged approach avoids both repetition and conflicting length instructions. Root-level notebook fields are moved into the prepared notebook; identical operations deduplicate and incompatible edits remain rejected. Acceptance tests check retained generated records, not merely whether an empty remainder validates.
