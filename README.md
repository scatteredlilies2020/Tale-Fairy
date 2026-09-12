# Tale Fairy

Tale Fairy is a standalone SillyTavern extension that runs a **private active-world simulation**, not a prose writer or plot script. It tracks causal state across actors, relationships, institutions, systems, resources, and environments while the roleplay model creatively realizes each scene from the full conversation.

Its default behavior is **autonomous Game Master play**: the user is a player, not the world's director. Watching, listening, or waiting is a complete action. NPCs and established situations can develop, resolve, or leave the scene without requiring player commands or making the player responsible for every problem. The writing model remains responsible for realizing these developments; Tale Fairy supplies the GM rules and relevant world context, not a fixed event script.

The permanent story injection is three concise, genre-neutral rules: autonomous world behavior, meaningful change, and player/viewpoint boundaries. Every reply should make a lasting difference even during rest or inactivity, without requiring interruption or conflict. Detailed repetition, disengagement, availability, and pacing checks stay in the private planner audit. Fresh context adds only relevant conditions, optional openings, and short development/scene limits rather than repeating the general rules.

Agency is mutual. NPCs may refuse, end a conversation, leave, or return to their duties according to personality, relationships, commitments, and circumstances. Players may disengage too, without replacement hooks forcing them back. Existing opposition can matter, but disengagement is neither guaranteed success nor an excuse for invented punishment. Quiet scenes, viewpoint limits, and meaningful opportunities for player intervention remain protected. This is autonomy within generated replies, not unattended automatic message generation.

## What it does

- Maintains broad world state privately, but injects only **1–6 currently relevant underlying conditions**—normally 1–3 on routine updates, more only when useful. Each clean line describes what a subject wants, believes, knows, can do, is constrained by, or is under pressure from.
- Leaves concrete actions, events, dialogue, revelations, consequences, scene routes, and outcomes to the main roleplay model. Tale Fairy supplies causes, not a predetermined next beat.
- Withholds internal IDs, confidence, relevance reasoning, evidence, rankings, and future plans from the roleplay prompt. Tentative reconstructions stay Scratchpad-only instead of being presented as facts.
- Distinguishes open, limited, and private knowledge. Private motivations may shape believable behavior without forcing the roleplay model to reveal them.
- Keeps hundreds of dormant characters or systems out of active context. Compact descriptions, lore, summaries, continuity evidence, and factual records allow relevant ones to be retrieved and reconstructed later.
- Does not treat a mentioned condition as resolved or an unmentioned pressure as escalated. Salience changes only through new evidence, elapsed time, changed dependencies, or a real causal-state change.
- Tracks selected off-screen actors, groups, institutions, systems, environments, places, and situations as **deferred debt rather than continuous ticks**. It settles broad plausible change only when a subject becomes relevant again, material time explicitly advances, or a dependency changes; settled facts are append-only, and undelivered pressure is never a scheduled event.
- Scales certainty and detail by distance. Nearby state may be specific; distant state stays broad; remote or long-unobserved state remains incomplete, possibly outdated, and never grants the player automatic omniscience.
- Stays one step ahead through a private **horizon radar** and **hidden-motive board**. These remain optional hypotheses—not event queues, promises, canon, or provider instructions.
- Runs planning after accepted assistant responses and on initialization, scene/time pivots, corrections, and manual reevaluation. Planning is background-only: roleplay generation never waits. Permanent, fact-free GM rules remain when analysis is missing or stale; only fresh dynamic world facts are eligible for injection. Disabling Tale Fairy removes both layers. Quiet/tool requests and player impersonation do not receive GM rules.
- Reuses the exact pre-reply plot context for both Regenerate and swipe. A rolling history of 12 input snapshots survives reloads and supports deleting back to a matching input. Discarded prose never becomes canon.
- Re-infers the active scale as play changes and tracks the causal unit natural to it: people, relationships, households, communities, towns, organizations, institutions, resources, infrastructure, environments, regions, countries, societies, ecosystems, or wider forces. It can zoom between these without imposing one genre's mechanics on another.
- Treats an under-specified setting as open simulation space. It can generate compatible people, places, routines, services, customs, opportunities, problems, rumors, discoveries, challenges, and opposition when the current activity makes them relevant, while keeping consequential inventions private and tentative until evidence or on-screen manifestation establishes them.
- Models resistance through goals, scarcity, rules, tradeoffs, uncertainty, environments, institutions, or opposing actors and groups. Enemies are optional rather than assumed; allies, neutral parties, cooperation, recovery, ordinary routines, and uneventful periods remain equally valid world states.
- Respects scene scale: quiet activity may continue without interruption, outside pressure may remain silent or subtextual, and setting-native challenge may be social, intellectual, bureaucratic, material, emotional, environmental, physical, or absent. Rare derailments require a supported cause already converging; elapsed time or novelty alone never forces one.
- Keeps every response self-propelling at the scene's natural scale. Staying in the same scene or activity still produces observable task-native progress, changed circumstances, or meaningful NPC/world action while leaving the player's response open.
- Preserves player agency: it never authors the player's dialogue, choices, thoughts, feelings, consent, or uncertain result.
- Retains accepted NPC departures, refusals, commitments, and boundaries in existing actor records. Omitted updates and empty unknown fields do not erase them; supported returns or changed willingness update them explicitly. The private reply audit flags player-dependent stalling, forced engagement, reset availability, and overridden intervention opportunities without adding a separate AI call.
- Treats explicit user text and OOC corrections as higher authority than summaries, lore, retained state, or inference.
- Places the dynamic block inside the provider-bound latest user content without modifying saved chat, and records the exact verified block in the Planner Scratchpad.
- Uses a selectable injection role across all chat-message paths: **User** by default, with **System** and **Assistant** available when a provider expects them.
- Stores compact chat-local state, supports active/profile/custom/OpenRouter planner connections, and can continue server-backed planner jobs through a browser reload when the bundled plugin is installed.
- Uses bounded recent turns, summaries, World Info, character/scenario fields, a narrative ledger, and optional read-only Continuity evidence. Continuity is supporting evidence, never a dependency or authority.

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

The planner returns structured JSON. If a provider rejects native JSON schema, the extension retries with an exact-shape JSON prompt, and invalid structured output receives one focused repair pass. The transcript begins observation, not the world: even a new chat is treated as in medias res. If background planning still fails, Tale Fairy immediately supplies a minimal causal slice grounded in the authoritative transcript status rather than presenting an empty world. **Stop analysis** cancels background planning.

Actor updates are partial changes, not complete biographies: unknown/unchanged descriptions may be blank. Missing/null descriptions are treated as unchanged, and lists of strings are joined without inventing facts. Invalid identities, malformed facts, and stale transcript results are still rejected. A normal evaluation uses one model call; content validation can add one corrective call, not repeated output-format attempts. Provider capability/connection failures can still trigger separate retries. Recovered invalid results defer to successful or running attempts and receive at most one correction per chat snapshot across reloads; terminal failures are acknowledged so they do not repeatedly resurface.

Browser-independent planning requires the bundled `plugin` directory to be installed as a SillyTavern server plugin and SillyTavern to be restarted. For a source checkout installed at `public/scripts/extensions/third-party/Tale-Fairy`, link `plugins/tale-fairy` to Tale Fairy's `plugin` directory. The extension checks `/api/plugins/tale-fairy/health` at startup and falls back to ordinary in-page requests when the server plugin is unavailable.

Before the provider request is sent, Tale Fairy atomically replaces stale Tale Fairy material and verifies that the assembled payload contains exactly the current context. If SillyTavern's normal extension-prompt path omitted it, Tale Fairy repairs the request in place. The `<tale-fairy-context>` block includes a `<plot-anchor>` for story generations: actual accepted-scene and user-contribution excerpts, supplemented by relevant unresolved threads and actor constraints only when their saved state is current. Planner failure uses these local sources, not generic filler or invented plot developments. Empty chats can use a supplied opening scenario; with no evidence at all, Tale Fairy explicitly says no plot facts are available. Quiet, impersonation, and disabled requests remain excluded.

The last 12 pre-reply packets are cached separately from planner state so late background results cannot overwrite them. Both **swipe** and **Regenerate** reuse the exact packet for an unchanged input, with **zero new planner calls**; selecting an older swipe or deleting back to a cached input also defers automatic evaluation. A new user turn or Continue resumes planning from the selected reply. Normal new replies still plan ahead in the background. Message edits, character/scenario/persona/author-note changes, Tale Fairy notes/mode, and observed World Info changes invalidate matching; similar wording is not treated as proof of identical story facts. An uncached retry constructs a grounded local anchor without another planner call. Explicit reset/rebuild clears this history. No additional budget settings are required.

## Scope

### Lightweight planning

Routine replies use **one background update**, not separate planning and critique calls. The update returns changed offscreen subjects and motive hypotheses, a fresh causal slice, and a small audit of the newest reply. Unchanged records stay local. The audit checks meaningful task, relationship, understanding, or circumstance changes rather than counting gestures, plus autonomous initiative and mutual agency; rest, quiet scenes, and scene endings remain valid. The permanent GM block adds a bounded amount to roleplay input. Planner defaults now reserve more room for evidence alongside instructions and schema.

| Pass | Default input target, including instructions and schema | Raw-context ceiling | Summary-pool ceiling | Output ceiling |
| --- | ---: | ---: | ---: | ---: |
| Routine update | 10,000 tokens, configurable | 3,000 | 1,200 | 4,096 |
| Bounded story review | 14,000 tokens, configurable | 4,500 | 2,400 | 6,144 |
| Initialization / explicit rebuild | Configured total ceiling (default 16,000) | Configured (default 6,000) | Configured (default 4,000) | 16,384 |

Every input target is capped by the saved total input ceiling. Lower raw/summary settings also cap each pass; final fitting may reduce evidence further. These larger routine/review defaults can increase API input cost. Existing total-budget choices are preserved.

Broader reviews run every **12 accepted assistant replies** by default (configurable from 3–20), or sooner for a detected correction, scene/time pivot, or manual reevaluation. Routine completions do not reset that clock. A review replaces that turn's routine pass; it is not an additional call or a full transcript rebuild. Routine updates and bounded reviews request reasoning off where supported. Existing compatibility retries and invalid-output repair can still require another request. Story generation never waits for planning.

Repeated rules and legacy planner scaffolding are removed from tight prompts before recent story evidence. Both sides of the newest exchange receive reserved space. Relevant actors are selected across the saved NPC list, not merely from its newest entries; compact boundaries, commitments, motivations, and availability survive before optional boards. Extremely long replies can still be excerpted. Token fitting includes the schema and falls back to a local estimate if the provider tokenizer fails.

Summary selection favors relevant whole passages, including facts in the middle of a recap, rather than dozens of tiny edge fragments. Bounded raw-history retrieval adds up to two routine or four review witnesses from up to 400 messages before the recent window. These are indexed past observations, not current states; newer corrections win. Older history relies on summaries and retained state, and rebuilds additionally sample the transcript. Summary/recap discovery may still inspect the whole chat. The Scratchpad separates the candidate summary pool from final included sources, estimated total input, raw excerpt tokens, historical witnesses, actor count, and omitted source labels.

Offscreen history uses a durable local journal and archive, with only selected witnesses retrieved into prompts. New relevant subjects can enter a full active board without erasing older facts. Local saved history can grow with play, but it is not sent in full every turn. Knowledge conditions record evidenced knowers and learning routes; private beliefs are not promoted to objective truth or automatic player knowledge. Family relationships and proposal attribution are preserved instead of globally rewritten from the newest mention.

Run `npm test` for offline regression checks. These verify budgets, state transitions, and injection boundaries—not the quality of live model prose. See [story evaluation](docs/story-evaluation.md) for a small paired quality check.

This is a lightweight, chat-local active-world simulation and causal-context layer with enough retained working continuity to function independently. It consumes available summaries and context regardless of their source. The optional Continuity bridge is merely one-way input compatibility, not a dependency or division of responsibility.

## License

Copyright (C) 2026 [ScatteredLilies2020](https://github.com/scatteredlilies2020).

Tale Fairy is free software licensed under the [GNU Affero General Public License v3.0](LICENSE).
