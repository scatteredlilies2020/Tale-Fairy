# Creative preparation contract — 0.14.6

## Purpose

Prepare a working GM notebook: material for the middle of the RP, what could grow beyond it, and how the world could feel alive. Do not simulate everything, prescribe an ending, or reduce preparation to a next-reply correction. The planner can invent compatible material without prior mention. The writer decides how and whether to realize it in the actual exchange.

This is a prompt-and-state design, not a creativity guarantee. Both the routine and broad planner use the same creative mandate in a single generated response. Neither a debate transcript nor a second critic call is required.

## Three separate layers

1. **Factual continuity:** existing scene, actors, ledger, conditions and optional memory evidence. Source freshness still matters. Conditional inventions must not enter these fields as accepted facts.
2. **Persistent preparation:** `preparedWorld` in per-chat state. `overview` holds the wider trajectory and constraints; `items` holds up to 12 records; `focus` selects up to three for the writer. A private source proof binds the board to its source prefix and author/card/lore input key.
3. **Writer packet:** permanent agency rules, saved pacing preference, grounded plot anchor, fresh factual slice when available, and compatible conditional preparation. The selected packet is frozen for request verification; a newer compatible pre-reply plan can serve subsequent requests and retries.

The source text in plot anchors is still bounded transcript evidence, not newly generated prose. The creative notebook asks the model to distill meaning rather than copy repetitive narration. Unselected notebook entries and source hashes are not injected.

## Planner output and lifecycle

Both native schemas add `prepared: { overview, updates, focus }` while retaining their existing contract versions 12/13. Runtime state migrates to version 59; older saved/detached results without this field remain readable and do not fabricate or delete preparation. New native requests require it. It is validated whenever present.

Each update is a complete bounded record:

| Field | Meaning |
| --- | --- |
| `id` | Stable identifier for deliberate updates, not a story fact. |
| `premise` | Concrete material the GM may use. |
| `engine` | Motives, resources or processes that make it work. |
| `middle` | Playable intermediate developments and alternative continuations. |
| `future` | What could grow beyond the middle, not a guaranteed endpoint. |
| `entry` | Recognizable opportunity to introduce it. |
| `hold` | Optional evidenced obstacle or unmet prerequisite; blank by default. It cannot contradict a fitting entry. |
| `invalidates` | Contradictions or failed dependencies that rule it out. |
| `intervention` | Where the player must have room to react before contested consequences. |
| `knowledge` | GM secrets versus what characters know or can discover. |
| `origin` | `established` premise, `inferred` premise, or `invented` creation. No label establishes a future outcome. |
| `status` | `prepared`, `active`, `dormant`, `resolved`, or `retired`. |

Updates are deltas, maximum four per call. Omitted records persist. Blank overview preserves the previous overview; an empty focus selects no records but does not erase them. Active requires actual transcript uptake, not mere injection. Dormant records are not selected for injection. Resolved/retired updates remove the proposal; manifested consequences must already be retained in factual memory. Unknown focus IDs and capacity overflow are rejected, not silently repaired by deleting other ideas.

The bounded prompt builder compacts retained records into a working index before sacrificing current evidence. Stored records remain intact. Routine/review input defaults are 6,000/14,000 tokens including system and schema; base output caps are 4,096/6,144. Initialization and explicit rebuild use the configured total input ceiling (default 16,000) and an 8,192 base output cap. Routine thinking is off; broad passes add the selected reasoning allowance. Actual provider usage varies. Full notebook and default-envelope tests protect the basic budget contract, not unbounded history recall.

## Pacing and realization

Adaptive, Linger, Natural and Advance are saved per chat. Latest explicit user instructions override the preference. No English-only keyword gate controls creative entry. A preference change updates packet dependencies; an already compatible notebook can survive that preference-only change, while the active planner is refreshed.

Duration, progress and outside interruption are independent. Linger does not require padding or freeze NPC agency; Advance does not allow skipping player choices. Travel is an opportunity for a causally fitting encounter, not automatic permission to timeskip or finish an ambush. Scene-fit classifications are provisional rather than permanent prohibitions. Plans have no turn-based activation countdown.

Example, illustrative rather than a tested model output:

> Wider direction: Explore distinct local experiences along a long journey, not a jump to its endpoint.
>
> Possible development: A mill town buys warmth from a buried creature. Its millers need winter fuel; the creature is learning to bargain.
>
> Middle: Meet the carriers, discover the heating works, and investigate a different fuel source or negotiate continued supply. Either path can change local relationships.
>
> Beyond: A regional trade may form—or neighboring towns may reject this dependency.
>
> Entry: Arrival at a settlement on the chosen route, if the geography fits. It awaits arrival at that settlement; local activity can continue during the present camp conversation.
>
> Boundaries: Introduce observable clues, not automatic knowledge. Leave room to investigate or refuse. Drop it if accepted events or user constraints contradict it.

This material can remain unused across many exchanges. A possible town is not a compulsory stop; its process supplies several experiences rather than one scripted resolution.

## Background work and safety

- Generation never awaits a planner. Ordinary appended messages retain the running job and coalesce one latest follow-up.
- Local prefix hashing permits preparation to remain usable across any number of ordinary appended turns. It does not semantically prove every entry still fits; the writer must check current entry/hold/invalidation conditions.
- A late append-compatible result updates only preparation, not newer factual scene state, audits or scheduling. Older same-source completion timestamps cannot displace a newer prepared result.
- An edited/deleted/swiped source or changed relevant input fails compatibility. Conditional status is not permission to import a discarded branch. Retries reuse the latest compatible pre-reply packet and rollback-safe factual snapshot. A newer completed same-source analysis can update the next request, while an in-flight selection remains frozen.
- Invalid output does not trigger a second generated correction. Local JSON cleanup and strict validation remain. Unsupported provider options can be negotiated before a result exists; ordinary connection failures do not start an automatic retry chain.
- Provider/reply verification records factual and prepared inclusion separately. The preview explains preparation-only packets instead of claiming stale facts are fresh.

Continuity Memory and generic summaries remain optional evidence. A local source-prefix comparison is not a full-chat AI scan. Missing older facts remain a real limitation; proposals are not a substitute for remembering accepted history.

## Verification boundary

Offline tests cover both schemas and application paths, lifecycle, migration, prompt budgets, append/edit compatibility, late completion, source isolation, frozen in-flight selections and revised pre-reply packets, single-generation failure behavior, pacing persistence and policy separation. The live creative/agency scenarios are in [story-evaluation.md](story-evaluation.md). Passing structural tests does not prove a model produces varied long-term material or that a mobile host renders the controls correctly.
