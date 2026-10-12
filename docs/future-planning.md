# Private future Chapters

## Two owners, not two competing story directors

- **Current guide** owns the world frame, one active Chapter, connected present Arcs/Subplots and selected writer guidance.
- **Future planner** owns a separate, private outlook of up to **6 (default), 10, or 15** provisional Chapters. Capacity is a ceiling, not a quota. It cannot write current cards, advance time, inject writer context or establish historical events.
- **Writer and player** still determine actual play. Preparation is not accepted history. Player actions, decisions and outcomes remain open.

Chapter is Tale Fairy's broad story unit, including what a franchise calls an arc or saga, or a meaningful phase of a simulation. Future planning does not create unattached lower-level Arcs. A dormant current Arc remains unfinished current business, not a slot in a future itinerary.

| Action | Current call | Future call |
| --- | --- | --- |
| First Guide / automatic setup | Yes | Yes, when future planning is enabled |
| Ordinary Guide now | Yes | Only when due or not yet attempted |
| Automatic review event | If current review is due | If future review is due, independently |
| Update future plans | No | Develop/reassess the outlook; coalesces with an already-running future call |
| Reroll future plans | No | Replace Original prospects; coalesces with an already-running future call |
| Full rebuild | Fresh call | Fresh call when enabled; independent partial success |
| Delete guide state | No; clears generated state | No; clears generated state |
| Stop | Stops/cancels pending current work | Stops/cancels pending future work |

First/rebuild calls share the same accepted transcript, references and available memory snapshot. Neither waits for the other's answer. Direct API and connection-profile requests can run in parallel. The active SillyTavern connection uses shared generation settings, so Tale Fairy serializes its planner requests; queued time does not consume the response timeout. The next regular review can use the newly saved outlook. There is **no extra integration, repair or critic AI call**.

## Deliberate but provisional cards

Each card stores a stable id, title and exactly one category:

- **Canon:** canonical, canon-adjacent or canon-derived/adapted material. Divergence does not relabel a surviving card Original.
- **Original:** an invented Chapter, including possibilities growing from this RP's consequences.

Each card is a brief sketch: its title and Canon/Original category, a one-sentence premise, and two or three short notes about the most useful conditions or timing. The planner aims for 40–70 words per card and leaves unused fields empty instead of filling every section. Existing storage fields remain compatible, but the notes are a total across pressures, favors, prevents/transforms, timing, transition and outlook. Detail expands when a Chapter becomes current. Empty outlooks and fewer than six cards are valid.

The private outlook uses the same responsive card layout as current stories. Saved verbose cards immediately show a short preview and at most three notes, with complete text available under **Full notes**. Opening or refreshing the board does not rewrite storage or call a model. The next future planning pass can condense older prose while retaining identity, category and important conditions.

Renderer checks cover escaped model text, complete disclosure of older notes, preserved disclosure state, adopted-card filtering and corrupt outlooks. An earlier compact-card check with the configured model produced three future Chapters with one-sentence premises and three notes each; unused fields stayed empty and passed production validation. That check did not evaluate the new causal/ordering contract and is not a guarantee of exact wording or length.

For example, an Original **The Missing Winter Convoys** could propose three medicine shipments disappearing before mountain passes close; clinics compete over dwindling stocks while a profiteering official diverts cargo. Continuing losses favor the Chapter; restored supply or another group's intervention could prevent or transform it. A clinic request during the current crisis's aftermath offers a transition, not a forced player assignment. This is an illustrative proposal, not established facts about any campaign.

A later Canon event can remain on the horizon with relevant causes and uncertain timing. If this RP removes those causes, the planner should weaken, transform or retire the prospect—not invent substitute causes merely to recreate the same event. Different supported causes can still make a similar event plausible. Independent Original Chapters have their own substance rather than existing solely to set up canon. Alternatives need not all happen or converge.

Transitions may arise from consequences, previously introduced pressures, independent world activity, travel, respite or accepted time changes. A new Chapter can be entirely different from the last. Current reviews may seed only fitting pressures, avoid duplicating existing ones, and adopt a candidate only into the actual active Chapter. Adoption expands current detail and reconnects substantial surviving Arcs. A source-bound receipt then withholds the adopted future id from subsequent outlook use. No result automatically makes a candidate live merely because a reply count or date has been reached.

## Update, reroll and canon controls

**Update future plans** and **Reroll future plans** sit together in one action group. Update retains useful prospects and develops them against accepted play. Reroll requests new Original central situations and causal foundations, not renamed versions. It supplies randomized creative lenses across focus, context, drivers, activity, scale and connections, alongside recent replaced ideas explicitly marked as proposals, never history. Lenses are optional and setting-relative, not prescribed events, human motives for non-agent processes, or a demand to change genre.

The local reroll guard rejects reused Original identities, normalized duplicate titles, and lexically near-identical premises, including duplicates within the new response. Failure keeps the complete prior outlook; there is no paid novelty-repair call. The last 24 replaced Original title/premise pairs are saved, with the most recent 12 plus the current Originals shown in the reroll prompt. This is bounded anti-repetition context, not a semantic novelty guarantee or a campaign history.

**Include canon-based future Chapters** defaults on. Checked, prospects can be Canon (including adjacent/adapted) or Original. Unchecked, only Original prospects are generated and passed to the current guide; saved Canon prospects remain inactive, and canon may still inform world background. Existing current stories are not retroactively deleted or rewritten.

Canon identities persist across updates and rerolls, even if omitted from a response. The planner can revise participants, motives, causes, circumstances, timing and transitions while retaining identity and category. It must explicitly retire a canon prospect when substantial divergence makes its core situation unsuitable. Preservation is not priority: unselected saved Canon cards remain inactive instead of crowding out Original possibilities. Lowering capacity also allows overflow Canon cards to be held without deletion. With canon enabled, Update can reassess all saved Canon cards; capacity need not increase to exchange an active and inactive prospect. Held cards remain visible with an Inactive label and do not reach the current guide before reassessment. Original omissions can discard preparation without asserting resolution.

## Causal possibilities, not a compulsory route

Both planners use the same causal guidance, matching the premise, tone, scale, time horizon and established rules. It applies to intimate or ensemble RP, cozy or dangerous fiction, counterfactual worlds, and simulations with nonhuman processes. Supplied facts and mechanisms constrain factual simulations; a possible future is not a verified forecast or an accepted result.

- A cause may open several alternatives; different routes may converge on a similar situation.
- Canon and Original developments can affect one another in either direction. Neither category must serve the other.
- Some developments are independent, simultaneous or entirely different from what preceded them. Connections need support, not an invented grand chain.
- Successful prevention can genuinely remove an event. Stability, recovery, growth and ordinary opportunities do not require substitute crises or escalating stakes.
- Established conditions, uncertain inferences and proposed possibilities remain distinct. A proposed causal connection establishes neither endpoint as history.

For the user's hypothetical good-queen Riliane RP, reform might avert revolution; unresolved corruption might independently sustain grievances; a separate development could change later prospects. None of these paths is compulsory or a claim about franchise lore. In other settings, a restored wetland might recover through different ecological mechanisms, a workshop might face a new supply constraint after resolving another, or a quiet relationship might develop without any crisis. Explicit genre and simulation constraints still govern what is plausible.

The existing favors/prevents/transition/outlook notes carry only useful causal connections and alternatives. There is no exhaustive branching tree, mandatory dependency graph, probability score or extra model call. A changed route can preserve the same prospect id; a genuinely different central situation deserves a different id. Reassessment updates or removes links when their causes change.

The response's **order** is a bounded list of active final ids, interleaving categories by useful timing and relationships. It is presentation, not an activation queue or an instruction to manufacture prerequisites. The current guide can choose any fitting candidate or none. Every kept Original and every new card must appear; an unlisted previously saved Canon card stays inactive. Unknown, duplicate, retired or over-capacity ids are rejected without replacing the previous outlook. Legacy responses without order preserve surviving saved order and append new cards; they never promote Canon merely for its category. Excess saved Canon may be held, but Original/new-card overflow is rejected rather than silently lost. Reloading preserves saved order.

Scripted regression fixtures cover the hypothetical queen, quiet bookshop and relationship RP, science fiction, horror, counterfactual diplomacy, ecology, logistics and short sports practice. They verify prompt constraints, causal-note/order preservation, retirement, recovery and the exact private/current/writer boundaries. They do not prove a live model's causal reasoning or simulation accuracy. The current guide receives the compact shared causal rules; detailed outlook design remains in the separate future pass to preserve input headroom.

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
- Full rebuild/delete clears both owners and their adoption receipts. Rebuild starts fresh even if one call fails; ordinary failures keep previous valid preparation. Corrupt future storage is withheld and can be replaced with **Update future plans**.
- Strict response schema, stable identities, the selected capacity ceiling, complete-JSON validation and truncation rejection. Complete punctuation mistakes may be repaired locally, never truncated drafts. Canon-to-Original relabeling of a retained identity is rejected. Changing canon/capacity preferences invalidates in-flight results based on the old preferences, including a current review consuming the old outlook.
- Future response allowances are **3,000 / 4,500 / 6,000 tokens** at capacity **6 / 10 / 15**. Compact sketches aim for roughly 100–170 tokens per card; unused space is headroom, not a content target. Current input includes bounded future cards with their conditions intact before fitting older chat, avoiding starvation in long campaigns. Input is a **soft target**; complete required background may exceed it. Writer limits are unchanged because the outlook itself never enters the writer packet.
- Adoption/withdrawal exclusion hints are bounded (32 receipts and 32 withdrawn-name hints), not an unlimited historical ledger. Semantic duplicate detection and causal judgment remain model responsibilities beyond the reroll lexical guard.
- Saved Canon storage is bounded to 15 cards across active and inactive prospects, separate from the selected active capacity. A full saved Canon pool means withholding new Canon ideas, not retiring useful ones merely to free space. A complete reassessment may retire up to 30 existing active/inactive ids in one response.
- Existing maps and immutable old writer packets remain readable. No migration rewrites chat. New future fields are additive, and current responses without future decisions still validate.

Install/update the repository's server `plugin` alongside the extension, **restart SillyTavern, then reload the browser** for browser-independent future recovery (`futureJobs: 1`). Without that capability, future planning falls back to a browser-bound request rather than sending an incompatible job. Compatible server jobs can finish while the browser is closed, with bounded retries only for temporary failures before output; they do not survive a SillyTavern server restart. Recovery polling never buys new planning on its own.

These safeguards constrain storage, ownership, transport, cost and what is exposed to the writer. They do not prove an AI's canon knowledge, inference quality, semantic deduplication or respect for narrative nuance. Inspect the private outlook and supply explicit author direction when needed.

## Planner context capacity

The default outlook capacity is six Chapters and default reasoning is Low. Existing installs using the former ten-Chapter default or Auto reasoning migrate once; other custom selections remain unchanged. A later deliberate choice of ten Chapters or Auto is preserved.

**Total planner input target** is a fitting target. Complete source references, fresh play and a fresh Continuity Memory story summary can exceed it. **Planner context window** is the combined ceiling for input, output and reasoning, with a separate framing reserve. It defaults to 32,768 tokens; choose the actual capacity of your direct endpoint. A smaller context limit from the active ST connection or a selected profile preset takes precedence. Hidden reasoning headroom is capped to the remaining space. When complete required input and visible output cannot fit, Tale Fairy reports the local capacity error before sending a request. Ordinary failed reviews keep their saved preparation. Full rebuild still clears generated preparation first.
