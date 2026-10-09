# Private future Chapters (0.20.0)

## Two owners, not two competing story directors

- **Current guide** owns the world frame, one active Chapter, connected present Arcs/Subplots and selected writer guidance.
- **Future planner** owns a separate, private outlook of at most six provisional Chapters. It cannot write current cards, advance time, inject writer context or establish historical events.
- **Writer and player** still determine actual play. Preparation is not accepted history. Player actions, decisions and outcomes remain open.

Chapter is Tale Fairy's broad story unit, including what a franchise calls an arc or saga. Future planning does not create unattached lower-level Arcs. A dormant current Arc remains unfinished current business, not a slot in a future itinerary.

| Action | Current call | Future call |
| --- | --- | --- |
| First Guide / automatic setup | Yes | Yes, when future planning is enabled |
| Ordinary Guide now | Yes | Only when due or not yet attempted |
| Automatic review event | If current review is due | If future review is due, independently |
| Plan future now | No | Yes; coalesces with an already-running future call |
| Full rebuild | Fresh call | Fresh call when enabled; independent partial success |
| Delete guide state | No; clears generated state | No; clears generated state |
| Stop | Stops/cancels pending current work | Stops/cancels pending future work |

First/rebuild calls share the same accepted transcript, references and available memory snapshot. Neither waits for the other's answer. Direct API and connection-profile requests can run in parallel. The active SillyTavern connection uses shared generation settings, so Tale Fairy serializes its planner requests; queued time does not consume the response timeout. The next regular review can use the newly saved outlook. There is **no extra integration, repair or critic AI call**.

## Deliberate but provisional cards

Each card stores a stable id, title and exactly one category:

- **Canon:** canonical, canon-adjacent or canon-derived/adapted material. Divergence does not relabel a surviving card Original.
- **Original:** an invented Chapter, including possibilities growing from this RP's consequences.

Fields are compact prose: **premise**, up to three **pressures**, **favors**, **prevents/transforms**, **timing**, **transition**, and **outlook**. These describe causal circumstances, not executable triggers, numeric probability scores or mandatory checklists. Empty outlooks and fewer than six cards are valid. Changed or omitted candidates can leave the outlook without implying that their events happened.

For example, an Original **The Missing Winter Convoys** could propose three medicine shipments disappearing before mountain passes close; clinics compete over dwindling stocks while a profiteering official diverts cargo. Continuing losses favor the Chapter; restored supply or another group's intervention could prevent or transform it. A clinic request during the current crisis's aftermath offers a transition, not a forced player assignment. This is an illustrative proposal, not established facts about any campaign.

A later Canon event can remain on the horizon with its necessary political or personal causes and uncertain timing. If this RP removes those causes, the planner should weaken, transform or retire the prospect—not invent substitute causes to recreate the same event. Independent Original Chapters can occupy intervening years without existing solely to set up canon. Alternatives need not all happen or converge.

Transitions may arise from consequences, previously introduced pressures, independent world activity, travel, respite or accepted time changes. A new Chapter can be entirely different from the last. Current reviews may seed only fitting pressures, avoid duplicating existing ones, and adopt a candidate only into the actual active Chapter. Adoption expands current detail and reconnects substantial surviving Arcs. A source-bound receipt then withholds the adopted future id from subsequent outlook use. No result automatically makes a candidate live merely because a reply count or date has been reached.

## Two different clocks

The automatic future interval defaults to **40 accepted AI replies**, configurable **4–200**. It counts accepted transcript replies, not provider attempts, reloads or fictional years. The setting changes future scheduling, not current review horizons.

Earlier future review can follow:

- an explicit user line beginning `Time skip:` (optionally a Markdown heading);
- a current review's `reassessFuture: true`, intended for material changes in long-range causes or fictional time;
- changed accepted source/references/planner configuration.

Natural-language time changes without the explicit prefix are interpreted by the current guide; they are not all recognized by a deterministic time parser. Passing a prospective event window requests reassessment, never confirmation that a major event occurred offscreen. Ordinary activity explicitly named in a skip can be implicit; major outcomes and player choices cannot.

Failure reserves its source: an unchanged reload or user-only message does not buy another attempt. New accepted AI play allows automatic recovery; manual planning can explicitly retry. Stop suppresses early signals for that reservation, while ordinary future cadence remains available after further play.

## Beginning, middle and late campaigns

Both calls start at the actual supplied present. A beginning scene can imply a living world with a past; neither planner needs to simulate every prior chapter. Supplied premise, accepted play and available memory ground inference. Inference may supply plausible pressures, not invented past player actions.

With Continuity support enabled, every future pass can read the entire published **Story so far**, not just the ordinary optional recall allowance. The current guide reads it whole on fresh setup/rebuild and otherwise uses bounded recall. Missing or disabled memory does not block planning. Tale Fairy does not independently retrieve or verify franchise chronology; a Canon label is not a factual accuracy guarantee. Supply important lore, dates and RP departures in references/author instructions or memory.

## Save, cost and compatibility safeguards

- Separate future state, attempt reservations and revisions; future saves merge only their own metadata fields. Manual future planning does not update current cards, regeneration snapshots or writer caches.
- Source-prefix, chat, reference, request-signature, revision and reset-epoch checks reject obsolete results after edits, swipes, changed settings, chat switches or rebuilds. Accepted appends need not waste an in-progress paid call.
- Separate per-chat Web Locks where available, persisted/shared attempt reservations and compatible server job deduplication reduce duplicate requests. Recovery revalidates the saved response rather than regenerating it.
- Full rebuild/delete clears both owners and their adoption receipts. Rebuild starts fresh even if one call fails; ordinary failures keep previous valid preparation. Corrupt future storage is withheld and can be replaced with **Plan future now**.
- Strict response schema, stable identities, six-card ceiling, complete-JSON validation and truncation rejection. Complete punctuation mistakes may be repaired locally, never truncated drafts. Canon-to-Original relabeling of a retained identity is rejected.
- Future calls have a 3,000-token response allowance and a roughly 1,200–1,800-token prose target, not a quota. Current input includes bounded future cards with their conditions intact before fitting older chat, avoiding starvation in long campaigns. Input is a **soft target**; complete required background may exceed it. Writer limits are unchanged because the outlook itself never enters the writer packet.
- Adoption/withdrawal exclusion hints are bounded (32 receipts and 32 withdrawn-name hints), not an unlimited historical ledger. Semantic duplicate detection and causal judgment remain model responsibilities; ids alone cannot detect a renamed duplicate.
- Existing maps and immutable old writer packets remain readable. No migration rewrites chat. New future fields are additive, and current responses without future decisions still validate.

Install/update the repository's server `plugin` alongside the extension, **restart SillyTavern, then reload the browser** for browser-independent future recovery (`futureJobs: 1`). Without that capability, future planning falls back to a browser-bound request rather than sending an incompatible job. Compatible server jobs can finish while the browser is closed, with bounded retries only for temporary failures before output; they do not survive a SillyTavern server restart. Recovery polling never buys new planning on its own.

These safeguards constrain storage, ownership, transport, cost and what is exposed to the writer. They do not prove an AI's canon knowledge, inference quality, semantic deduplication or respect for narrative nuance. Inspect the private outlook and supply explicit author direction when needed.
