# Tale Fairy

Tale Fairy is a standalone SillyTavern extension that acts as a **background creative Game Master**, preparing a playable middle and future while the roleplay model writes the story. It combines a persistent private notebook with selective factual world awareness—not a full world simulation, a prose generator, or a fixed event script.

## What changes in 0.14.22 (testing)

Preparation now concentrates detail in motives, relationships, independent initiatives and conditional consequences. Writer entries retain enough of that substance to support interaction while leaving incidental props, dialogue and encounter order open. Quiet pleasures, work and relationships receive the same attention as conflict, within the RP's scope. Observations, interpretations and proposed secrets remain distinct. There is no per-reply clue quota.

The planner system and field descriptions share this mandate. Writer material targets 400–700 characters within the existing storage and injection limits. During future evaluations, selected unused choreography can be revised while accepted events are preserved. Reload SillyTavern to load the updated extension, then use **Guide now / Re-evaluate** for a fresh selection immediately, or wait for the next normal evaluation. Existing selections and retry history are not rewritten by the update.

Verification: the full offline test suite passes on Node 24, including routine/review budget fitting, field-description serialization, and a complete quiet situation reaching chat/text requests. One isolated replay through the configured planner failed at the transport/provider step before usable output; the source chat remained unchanged. This is a prompt change; model compliance and creative quality still need observation in actual play. See [the preparation contract](docs/creative-preparation.md).

## What changes in 0.14.21

**Wider planner attention and separately authored writer material.** The notebook working view reserves space for current relevance and rotating wider review. At the 12-record limit, six records serve each purpose. Smaller notebooks share the space too. Final prompt fitting preserves a complete local and wider witness where available; an impossible protected budget reports a limit instead of silently dropping both. The Scratchpad reports the final local/wider counts.

New and revised plans describe their causal `family` and `dependency`. These group different leads serving the same problem, rather than treating different IDs or genres as independent plots. Wider review uses those labels and a saved rotation cursor; it does not activate proposals, advance fictional time or force a subplot. Legacy unclassified material remains available. Labels are model-generated, not semantic proof of independence.

The planner now returns `prepared.writer`: up to three separately authored, concrete story developments connected to focused notebook records. Those entries—not the notebook's premise/middle/future or approach—go to the writer. They can supply encounters, NPC initiatives, activities, opportunities and changing circumstances across adventure, slice of life, life and country simulations. The private planner asks for affirmative story content, not writing rules, invented hesitation or mandatory tension. The preset still controls presentation. An empty selection is valid; it does not delete the notebook.

Reload after updating. Existing contract-14 notebooks are preserved and request a background refresh for the new writer selection. Older/in-flight responses without that field remain valid private preparation but add no writer material. Recognized historical notebook projections are omitted from the outgoing retry view; stored snapshots and quoted source excerpts remain unchanged. No extra critic, generated repair loop or per-swipe planner has been added. Dormant consolidation preserves dependency text and cannot combine different declared families.

**Verification:** 522 offline tests pass on Node 24, including the reproduced 24-record attention trap, repeated review rotation, provider-measured budget fitting, writer privacy, migration and real generation/retry assembly. These are engineering checks, not a claim that creative quality or single-arc fixation is permanently solved. No new live-model acceptance run was performed. See [the updated contract](docs/creative-preparation.md) and [the comparison protocol](docs/attention-evaluation.md).

## What changes in 0.14.20

**Writer packets use plain labels and story material.** Current scene, latest contribution, possible developments, timing and knowledge fields replace the repetitive framing disclaimers. Settings help, tooltips and Scratchpad explanations are shorter too. The RP approach remains private. Explicitly saved pacing preferences remain brief.

Cached retry/swipe packets receive the same label cleanup locally. Saved notebooks and snapshots remain intact. Update and reload the extension to activate the change.

## What changes in 0.14.19

**The RP approach is private planner input, not writer context.** It remains saved and visible in the notebook, and helps Tale Fairy develop, preserve and select possibilities. Fresh writer packets omit it entirely. Old retry/swipe packets also omit their approach field locally without modifying saved snapshots, plot quotations or development records. An approach-only notebook adds no preparation block.

The planner is instructed not to copy approach instructions into writer-facing developments: those fields describe possible story content, not how to narrate it. Field exclusion is deterministic; model compliance inside generated development prose still needs live evaluation. Update and reload the extension to activate the change; no rebuild or deletion of your approach is required.

## What changes in 0.14.18

**The preset owns narrative behavior.** Tale Fairy no longer inserts a separate system-authority message or a permanent GM/player-control contract. Its writer packet contains a short interpretation label, source excerpts, usable factual conditions and conditional developments. Generic NPC-autonomy, viewpoint, interruption, novelty and scene-fit rules are no longer added to the writer prompt.

Default pacing is **Follow preset** (the existing `auto` setting), which adds no pacing instruction. Linger, Natural and Advance send only a brief saved per-chat preference. The legacy Light/Balanced/Fun narrative-mode control is removed. The planner's internal instructions still govern notebook maintenance and preparation; the generated RP approach is now restricted to story-specific aims supported by references and explicit preferences, not general writing rules or a replacement preset. Existing approach text remains saved and provisional; the next successful planner update is instructed to revise unsupported mandates. This is prompt guidance, not deterministic semantic filtering of saved prose.

Cached regeneration/swipe packets migrate recognized old application framing locally, without editing archived facts, quotations or notebook prose and without another model call. Stale authority blocks are removed from chat and text requests. Disabling the extension and non-story requests still remove Tale Fairy context. Offline tests verify these boundaries; live narrative quality and model compliance remain unverified.

## What changes in 0.14.17

The planner can now consolidate overlapping dormant, invented proposals into one shorter stored development. This replaces active notebook records, rather than merely adding a summary to the prompt. Active or focused plans, established material, author instructions and exact prerequisite/knowledge boundaries remain protected. Invalid or non-shrinking consolidations are skipped; this does not impose a notebook capacity or require extra model calls.

Before replacing records, Tale Fairy writes their complete originals to a separate content-addressed JSON file in SillyTavern's user files and reads it back to verify it. Archive failures leave the original notebook intact. The notebook panel shows archive counts and download links. Summaries can be consolidated again on later planner passes. Reload the browser to activate this behavior; it runs when the planner supplies a valid consolidation, without a manual rescan.

Archives remain part of your data: include user files when backing up or moving a chat. This reduces active notebook data, not necessarily total disk usage. Historical regeneration snapshots remain intact for reproducibility; author instructions are never replaced with generated summaries.

## What changes in 0.14.16

Author notes retain all saved entries and complete text, including through reloads and rebuilds. Oversized optional summary/approach fields and oversized individual developments are omitted with a recovery notice while complete neighboring updates survive; their previous saved versions remain intact. Malformed data and conflicting operations still fail atomically. The 12-operation schema limit is a writing target; complete larger batches are accepted without deleting other records. Tight prompts shed whole optional planner fields before failing, mark those omissions explicitly, and preserve exact user notes. If the protected input itself exceeds the configured budget, planning reports that limit without deleting instructions or exceeding the budget. These changes do not restore text already discarded by older versions.

## What changes in 0.14.13

First-request prompts now explain field purpose, operation routing, nesting and focus uniqueness at the response boundary. Unchanged approach text can be omitted. Requested prose limits use the same existing storage caps as validation, with concise writing targets stated separately. Complete notebook fields accidentally returned at the root are retained rather than silently ignored; conflicting edits still fail before saving. The priority is keeping usable generated content without extra model requests.

## What changes in 0.14.12

Planner acceptance now handles presentation differences consistently before merging: focus is a bounded selection from the resulting notebook, optional missing fields preserve stored content, string lists retain their complete prose, and identical repeated operations collapse. A complete notebook survives a cutoff in trailing optional fields. The prompt reports available notebook slots. Conflicting edits, invalid status targets, unfinished prose, and capacity overflow still fail without modifying saved content. Fallback status displays the actual rejection reason. Existing failed inputs get one fresh attempt after upgrading.

## What changes in 0.14.11

Tight prompt budgets no longer mix incomplete notebook rows with complete records. Omitted records appear in a separate lookup index, preventing the planner from copying input-only placeholders into content updates. Missing or null core prose is handled like blank prose: preserve the saved record, omit its incomplete replacement, and keep complete neighboring updates. Invalid types and conflicting operations still fail validation. Upgrading permits one fresh replacement attempt for an already-failed current input.

## What changes in 0.14.10

Content updates require a complete nonblank premise and playable middle. Status changes and removals use a separate `status_changes` list of existing IDs, preserving content without rewriting it. Optional future/knowledge notes are omitted when absent. The prompt-only response shape now includes the nonblank constraints, and planner input omits empty legacy fields. Unchanged records stay out of both update lists.

## What changes in 0.14.9

Blank live notebook updates are omitted individually while valid updates and existing saved records survive. Tale Fairy reports that incomplete updates were omitted; it does not invent missing developments or make a second model correction pass. Other invalid fields still fail validation. A fallback left by the previous repair policy gets one fresh attempt on reload, with the attempt marker saved before generation.

## What changes in 0.14.8

A replacement reply with missing or failed planner context starts one background attempt from its pre-reply input. Generation start, Stop, end, and reload share the same saved attempt guard. Stopping the story preserves a compatible running planner; Tale Fairy's own Stop analysis still cancels it. Retained preparation no longer disguises a failed fallback as a completed evaluation. Model instructions explicitly require complete premise and middle text for live record updates; invalid output still falls back safely without a correction loop.

## What changes in 0.14.7

Empty-state initialization, Full Rebuild and broad reviews now collect a chronological map across the accepted transcript and retrieve older unresolved-thread candidates before selecting summaries. They consider supplied character/scenario/author-note references and enabled entries from the chat's selected lore books, including entries not activated by the latest dialogue. References are planning evidence: availability does not establish an event, override an edited fact or grant character knowledge. Routine updates retain their smaller input tier.

Broad source selection reserves representation across available source kinds and reads across longer summaries, rather than ranking every passage solely against the latest exchange. Continuity Memory remains optional: its exported planning records and broader prompt/chronicle are considered together, with mirrored copies deduplicated. Other extension summaries, chat recaps, message summaries and active World Info still participate. This uses sources exposed by the host and memory bridge, not an unrestricted search of another extension's database. Stale or foreign Continuity snapshots remain excluded.

The preparation contract keeps the wider direction separate from scene recaps. Several leads in one investigation are not independent developments; reviews consider other motivated people, places and processes with playable middles and later consequences. The lasting approach retains the wider RP purpose across routine updates. For open-ended play, broad passes must retain or prepare at least one development that would still make sense without the current problem. Explicitly closed scenarios remain respected. This does not force its introduction, a genre mix or a second generated critic pass.

A protected opening excerpt preserves the original setup/era alongside the chronological map; later explicit corrections remain authoritative. Input fitting preserves chronological coverage and source-family witnesses within the existing configured ceilings. The Scratchpad reports the included timeline periods, transcript span and older-thread candidates. Coverage is selective, not every word of every source; source extraction and prompt rules cannot guarantee live narrative quality. Rebuild still clears the prior notebook while preserving notes and pacing, and initialization works with an empty transcript using supplied setting references.

## Preparation-only planner (introduced in 0.14.6)

**Narrative quality remains under evaluation.** The 0.14.6 actual-chat replays showed overly scene-specific guidance and continuity/agency errors. Version 0.14.7 integrates broader evidence into that replacement planner; offline coverage does not establish that prose quality is solved. See [the broader-context checks and their scope](docs/breadth-check.md).

The planner now produces an **RP-specific approach and durable directions**, not a bundle of next-reply corrections. The approach describes how this particular RP can be worthwhile across scenes; directions supply motives, playable developments and alternative futures. It derives these from the actual RP and user preferences—there is no adventure-only event menu. See [the contract](docs/creative-preparation.md) and [current test results and limitations](docs/quality-check-0.14.6.md).

One compact contract serves routine updates, reviews and rebuilds. **Planner reasoning stays Off** (Low compatibility fallback only when required by the provider), with no critic or AI repair pass. The story writer's settings are unchanged. New requests do not ask for actor forms, audits, scene classifications or reasoning scratchpads. Existing saved data remains readable; the first replacement result archives old proposals rather than recycling their restrictions.

Historical behavior: 0.14.6 added a separate GM system message claiming priority over conflicting preset behavior. **Removed in 0.14.18:** Tale Fairy now provides context and optional preparation, not a higher-priority narrative policy.

Failed refreshes preserve an already successful plan only for the exact same transcript, chat and card/lore/author inputs. Otherwise the grounded local fallback remains. Visible HTML story content and paragraph/row boundaries survive evidence cleanup. Direct observations take priority over fallible notebook claims, and tight budgets reduce repeated interpretations before discarding recent evidence. Budget-evicted turns remain eligible for generic historical retrieval; no scene-specific trigger decides what is true. Legacy actor data remains readable, but new preparation does not generate actor deltas or duplicate factual recaps.

## Creative GM design (introduced in 0.14.0)

Earlier versions deliberately restricted writer guidance to present causes and kept future ideas private. This version also permits **concrete conditional developments**: invented places, people, encounters, projects, challenges, secrets and independent processes. They need not already appear in the conversation, but must fit its constraints. The aim is useful material beyond the newest topic, not merely a distant ending attached to a near-term suggestion.

- **A persistent preparation notebook.** An RP-specific approach and persistent developments without a record-count cap. Planner input selects up to 12 focused, relevant, active or recently edited records; other developments remain saved and can return when relevant. Normally zero to two records change; major pivots can revise more without discarding untouched directions. Each records a premise, motives/playable middle, possible future and relevant boundaries—not next-reply entry instructions. Omitted records survive; resolution/retirement is explicit. Injection alone never makes an idea active or canonical.
- **A rolling planner summary.** The existing planner call carries forward a compact private summary of wider possibilities, unresolved dependencies and knowledge boundaries, updating it from supplied records and new evidence. Full records stay saved for retrieval. The summary appears in the notebook panel and goes to future planner calls; only selected detailed plans go to the writer. Existing notebooks build their first summary from the material available to the next successful update. No extra summarizer call is required.
- **Selective writer material.** Up to three separately authored developments are injected alongside grounded local context. The approach, notebook middles/futures, unselected records, internal IDs and source proofs stay private. The writer realizes this material through its preset and the actual exchange; injection does not turn a proposal into a proven past event or player decision.
- **Optional per-chat pacing preference.** Follow preset injects no pacing instruction. Linger, Natural and Advance supply a brief preference; they do not add universal scene-management rules. Latest explicit user intent takes priority.
- **One generated planner result per update.** The response contains only preparation, not a factual recap, scratchpad or replacement memory. There is no separate critic or second AI correction pass for invalid output, and no automatic connection-failure retry chain. Local parsing and validation remain. A provider rejecting an unsupported request option can be retried with compatible options before it produces a result; this is not another creative pass.
- **Nonblocking, append-tolerant planning.** Story generation never waits. Ordinary new messages do not cancel an in-flight plan; there is one running job and one coalesced latest follow-up. Compatible preparation stays available across appended turns. A late result can refresh the notebook without replacing newer factual scene state. The writer must still check whether it fits; source compatibility is not proof of semantic freshness.
- **Safe branching and retries.** Edits, deletions, swipes and changed author/card/lore inputs require source compatibility checks. Regenerate/swipe reuse frozen pre-reply packets rather than incorporating discarded prose or launching a planner per swipe. A compatible notebook alone never makes old factual scene state current. An uncached retry can use grounded local context, with the existing one-time background recovery path where applicable.
- **Optional memory support.** Bounded recent dialogue, compact factual memory, available summaries and World Info support planning. Continuity Memory is an optional read-only source. Other summaries can be used through the generic summary collection already supported by Tale Fairy; this is not a promise of a bespoke integration with every memory extension. Ordinary updates do not send the entire chat to an AI. Local prefix comparison checks source safety without a model call.

The notebook is future preparation, **not a replacement for historical memory**. Manifested consequences belong in actual story history or external memory. Long-forgotten facts cannot be guaranteed if they are absent from all retained evidence. Full rebuild replaces preparation using accessible reference material; author notes and pacing survive. Bounded summary retrieval remains input support rather than continuous world ticking.

## Preset ownership and limits

Writing style, viewpoint, player control, NPC autonomy and general pacing belong to your preset and explicit instructions. Tale Fairy does not replace those choices. Its preparation supplies possible situations and dependencies, not established player actions or automatic story progression. It does not generate unattended story messages.

The writer receives minimal context framing and a grounded plot anchor when evidence exists, plus any explicit saved pacing preference. Stale factual conditions are withheld; compatible conditional preparation may still be used. Disabling Tale Fairy, quiet/tool requests and player impersonation exclude the story injection.

Planning quality still depends on the selected model. The contract asks for distinct ideas, meaningful intermediate developments and longer continuations, but neither prompts nor schema validation guarantee creativity or canon accuracy. See [the evaluation scenarios](docs/story-evaluation.md) and [the preparation contract](docs/creative-preparation.md).

## Install

In SillyTavern, open **Extensions**, select **Install Extension**, and use:

```text
https://github.com/scatteredlilies2020/Tale-Fairy
```

Alternatively, copy this folder into SillyTavern's `public/scripts/extensions/third-party/` directory. Reload SillyTavern and enable **Tale Fairy** in Extensions.

## Provider setup

- **Active connection**: uses the model already selected in SillyTavern.
- **Connection profile**: uses a saved Connection Manager profile without rewriting its prompt.
- **Custom / proxy** and **OpenRouter**: enter the model and URL, then optionally save the key with SillyTavern's secret storage. The key is not written to chat metadata.

The planner returns structured JSON. If a provider rejects native JSON schema, the extension retries with an exact-shape JSON prompt, but invalid generated output is rejected without another AI correction pass. The transcript begins observation, not the world: even a new chat is treated as in medias res. If background planning still fails, Tale Fairy immediately supplies a minimal causal slice grounded in the authoritative transcript status rather than presenting an empty world. **Stop analysis** cancels background planning.

Legacy actor updates remain readable, but contract 14 no longer generates them. Malformed facts and stale factual results remain rejected. An evaluation uses one generated result; invalid output does not trigger generated correction or automatic connection retries. Unsupported provider options may receive a compatibility retry. Recovered invalid results defer to successful or running attempts; terminal failures are acknowledged so they do not repeatedly resurface.

Browser-independent planning requires the bundled `plugin` directory to be installed as a SillyTavern server plugin and SillyTavern to be restarted. For a source checkout installed at `public/scripts/extensions/third-party/Tale-Fairy`, link `plugins/tale-fairy` to Tale Fairy's `plugin` directory. The extension checks `/api/plugins/tale-fairy/health` at startup and falls back to ordinary in-page requests when the server plugin is unavailable.

Before the provider request is sent, Tale Fairy atomically replaces stale Tale Fairy material and verifies that the assembled payload contains exactly the current context. If SillyTavern's normal extension-prompt path omitted it, Tale Fairy repairs the request in place. The `<tale-fairy-context>` block includes a `<plot-anchor>` for story generations: actual accepted-scene and user-contribution excerpts, supplemented by relevant unresolved threads and actor constraints only when their saved state is current. Planner failure uses these local sources, not generic filler or invented plot developments. Empty chats can use a supplied opening scenario; with no evidence at all, Tale Fairy explicitly says no plot facts are available. Quiet, impersonation, and disabled requests remain excluded.

The last 12 pre-reply packets are cached separately from the selection frozen for an in-flight request. Both **swipe** and **Regenerate** reuse source-compatible saved guidance for an unchanged input, with **zero new planner calls**; selecting an older swipe or deleting back to a cached input also defers automatic evaluation. A new user turn or Continue resumes planning from the selected reply. Normal new replies still plan ahead in the background. Surrounding message whitespace and Windows/Unix line endings do not invalidate reuse. Same-content editor notifications, unrelated character/lore updates, and re-expansion of unchanged card time/random macros do not invalidate it either. Tale Fairy compares actual card/persona/author-note content, its notes/mode, World Info scan settings, and the contents of books available to this chat (global, chat, persona, character, and group-member books). Explicit card/lore/author-note variable references are tracked without including unrelated counters. Real wording, number, negation, paragraph, or relevant input changes still invalidate matching; similar wording is not treated as proof of identical story facts. An uncached retry constructs a grounded local anchor without another planner call. Explicit reset/rebuild clears this history. No additional budget settings are required.

Since **0.13.15**, a cached fallback can be upgraded by an already-completed planner result for the same accepted transcript and compatible inputs. This makes **zero new model calls**; subsequent retries reuse it until a newer completed plan for the same pre-reply source becomes available. Real plans record their card/lore/input dependencies so older cache entries cannot permanently block a fresh plan after an input change. Stale plans, plans from another chat, and facts from discarded replies remain excluded. Cached selections refresh their formatting and source anchors locally; other cache history is retained.

Since **0.13.16**, ready planner results enter the retry history immediately when saved, before planning ahead can replace them—even if no story request has used them yet. Restoring pre-reply state and setting its retry marker is one atomic metadata update, matching SillyTavern's snapshot-based context API. Reloading loads the chat's selected lore books before checking compatibility. Unchanged inputs reuse real saved plans; actual card/lore changes still require a fresh plan.

For chats stranded by the older cache bug, reopening with no usable saved pre-reply plan starts **one background repair evaluation per input**, not a Full Rebuild or an evaluation per swipe. The attempt is recorded across reloads; a failed attempt can be retried explicitly with **Guide now**. Generation never waits, and rapid Regenerate/swipe requests do not cancel an active repair for that same source. Guide now also targets the pre-reply source after a retry. Repairs exclude the discarded reply and potentially newer global/Continuity summaries; accepted transcript recaps and lore remain available. Since 0.14.0, invalid output falls back locally without a generated correction or automatic connection retry chain. A completed repair becomes available for the next matching request without changing a request already sent.

Plot excerpts now use one coherent passage around the relevant scene, preserving neighboring qualifications rather than joining scattered fragments. With no keyword match, they favor the latest scene. Markdown presentation markers are removed, HTML whitespace/punctuation entities are decoded, and dates are not split at numeric periods. This remains source evidence, not an invented summary or a predicted story outcome.

The preview distinguishes scene-only context, background repair, planning deferred after a retry, and completed context cached for the next retry. It reports the packet actually selected for the current request, not a newer plan that finished afterward. Opening ST does not make an older plan current: a plan from before the last reply can still serve a retry, but its old factual scene slice cannot serve a new continuation. Since 0.14.0, separately source-compatible conditional preparation may still serve that continuation. The preview explains when a new user contribution or Continue will resume planning instead of implying that an evaluation just failed.

The 0.13.12 matching format starts a new cache history as replies are generated; older packets cannot prove the new content-based dependencies. A relevant book that was not loaded when a packet was created also requires a new packet once its content becomes available. Neither case triggers an AI rebuild on a retry.

Rapid retries keep plot injection active even while background planning is intentionally idle. In 0.13.13, reply verification saves no longer hold up the host's reply-completion handler, duplicate transcript notifications preserve active planning and its queued successor, and delayed cancellation requests cannot stop a newer planner run. New user input or Continue resumes planning; repeatedly replacing the same reply still costs zero new planner calls.

Since 0.13.14, **Planner** and **Story context** have separate status indicators. Context preparation, request dispatch, confirmation, and warnings never stop the planner's progress timer or change its controls. “Request sent” only records outgoing context, not a completed reply. The story-context indicator is page-local: refreshing or syncing saved history does not present an old request as newly verified.

## Scope

### Lightweight planning

Routine replies use **one background update**, not separate planning and critique calls. It returns private notebook changes plus a complete writer-material selection. Existing factual memory is preserved as input, not rewritten by this job; generated recap fields are discarded. Unchanged records remain saved. There is no mandatory reply audit or offscreen form. All tiers use one compact response shape and local validation. The writer receives at most 1,000 estimated tokens of separately authored material, including whole entries with their knowledge notes; grounded local context is separate.

| Pass | Default input target, including instructions and schema | Raw-context ceiling | Summary-pool ceiling | Base output allowance |
| --- | ---: | ---: | ---: | ---: |
| Routine update | 6,000 tokens, configurable | 3,000 | 1,200 | 4,096 |
| Bounded story review | 14,000 tokens, configurable | 4,500 | 2,400 | 6,144 |
| Initialization / explicit rebuild | Configured total ceiling (default 16,000) | Configured (default 6,000) | Configured (default 4,000) | 8,192 |

Every input target is capped by the saved total input ceiling. Lower raw/summary settings also cap each pass; final fitting may reduce evidence further. The untouched older routine default migrates to 6,000; custom allocations, the broad-review input budget and the total ceiling are preserved.

Since **0.13.17**, **Guide now / Re-evaluate** and missing retry-plan repairs use the lightweight routine tier—even if the fallback has no ledger. At defaults this means at most 6,000 input tokens and a 4,096-token output ceiling instead of silently switching to the larger initialization pass. Repeated identical clicks share the active request instead of cancelling and restarting it; actual input or provider-setting changes still replace it. Successful quick evaluations clear the manual request without resetting the broad-review clock. Safety fallbacks do not count as successful evaluations. Provider speed still determines wall-clock time; output budgets are ceilings, not promised response lengths.

Broader reviews run every **12 accepted assistant replies** by default (configurable from 3–20), or sooner for a detected correction, scene/time pivot, or submitted author note. Routine completions do not reset that clock. A review replaces that turn's routine pass; it is not an additional call or a full transcript rebuild. Initial automatic setup and explicit **Full Rebuild** retain the larger initialization budget. Provider compatibility retries can still require another request; invalid output does not trigger model repair. Story generation never waits for planning.

The replacement forces **planner reasoning Off** on every tier without changing the saved story writer's settings. Routine output aims at 600–1,400 visible tokens; allowances are ceilings, not measured usage. Only providers requiring thinking receive a Low compatibility fallback. Invalid output never starts another model repair pass. Actual speed still depends on the provider; background execution avoids blocking chat, not provider latency.

The replacement prompt preserves compact factual memory and the newest exchange, reducing optional summaries and proposal detail first. Extremely long replies can still be excerpted. Token fitting includes the system instructions and response shape and falls back to a local estimate if the provider tokenizer fails. If mandatory content cannot fit, planning fails visibly rather than silently deleting retained memory.

Summary selection favors relevant whole passages, including facts in the middle of a recap, rather than dozens of tiny edge fragments. Routine passes use up to two bounded raw-history witnesses from up to 400 messages before the recent window. Initialization, rebuild and broad reviews additionally use the chronological map, protected opening and older open-thread candidates described above. These are indexed past observations, not current states; newer corrections win. All history selection remains bounded; summaries and retained memory complement the sampled raw evidence. Summary/recap discovery may still inspect the whole chat. The Scratchpad reports candidate versus included evidence and estimated input; the replacement does not send a separate actor board.

Legacy offscreen history remains stored for compatibility, not mandatory generated work. The replacement keeps factual continuity distinct from proposed developments. Knowledge notes preserve learning boundaries; private beliefs must not become objective truth or automatic player knowledge. This is an instruction and validation boundary, not a guarantee against model factual errors.

Versions 0.13.19–0.14.17 injected permanent NPC-initiative/player-boundary guidance, and 0.14.6 added explicit preset-behavior priority for chat completions. Version 0.14.18 removes that policy from fresh and recognized cached packets. Cache migration changes only application framing, preserving archived story material and requiring no extra planner requests.

Run `npm test` for offline regression checks. These verify budgets, state transitions, and injection boundaries—not the quality of live model prose. See [story evaluation](docs/story-evaluation.md) for a small paired quality check.

This is a lightweight, chat-local creative GM notebook and causal-context layer, not a complete world simulator or a guarantee of flawless recall. It consumes available summaries and context regardless of their source. The optional Continuity bridge is one-way input compatibility, not a dependency.

## License

Copyright (C) 2026 [ScatteredLilies2020](https://github.com/scatteredlilies2020).

Tale Fairy is free software licensed under the [GNU Affero General Public License v3.0](LICENSE).

Version 0.14.1 increases the routine and review output ceilings to fit creative preparation alongside the factual plan and audit. Incomplete planner responses are reported as cut off, instead of being repaired into partial objects that produce missing-field errors.

Version 0.14.2 also preserves modest preparation-prose overruns within bounded storage limits, including the ends of constraints. Optional process, entry, hold, invalidation, intervention and knowledge notes can be blank; the planner need not invent restrictions to fill them. Live ideas still need a premise and playable developments, and record identities and references remain validated.

Version 0.14.3 recovers complete preparation, scene context and causal conditions from a routine response cut off during later notes. Only fully closed top-level sections are used; unfinished sections are omitted. Missing actor, thread, motive and ledger updates preserve prior records, and an unfinished audit is marked unavailable. The UI reports recovered guidance. Responses cut off before their usable guidance is complete still fail, and a partial response cannot stand in for a full rebuild.

Version 0.14.4 preserves explicit time and location from status panels containing multiline character notes. These source facts stay visible in the planner input and writer plot anchor. Recent dialogue gets space before optional retained boards. Historical lookup checks factual preparation premises and current conditions against raw witnesses, including older group-membership evidence. It keeps adjoining sentences together and labels the retained claim being checked. Compact preparation retains timing notes beside entries so the planner can reconcile them; writer-facing timing notes are provisional, and an inferred hold cannot veto an otherwise fitting entry. The planner is instructed to preserve group membership and counts and prepare independent developments. These instructions improve the evidence and guidance; they do not constitute a semantic guarantee for every model output.

A newer completed analysis now refreshes cached guidance for the same compatible pre-reply source. Requests already in flight keep their selected packet; subsequent normal requests and retries can use the revision. Post-reply facts remain excluded from a retry. Condition formatting preserves proper names and full sentences instead of blindly lowercasing and joining them.
