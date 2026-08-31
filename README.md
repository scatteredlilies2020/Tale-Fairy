# Tale Fairy

Tale Fairy is a standalone SillyTavern extension that acts as an **adaptive authorial story controller**, not a prose writer. It maintains story direction and causal depth across different layers and timeframes, while the roleplay model realizes each scene from the full conversation.

## What it does

- Keeps a persistent private **Author Board** for overall story identity, the active arc, character and relationship arcs, setups, off-screen processes, current scene purpose, required developments, exit gates, and upcoming milestones. It is generic rather than tied to any franchise or genre.
- Uses a deterministic conductor on every roleplay response. The conductor turns the Author Board into one compact contract—pace, scene purpose, required development, allowed movement, forbidden movement, private background handling, and release conditions—so ordinary direction does not depend on another model call correctly reinterpreting the whole story.
- Wakes the AI planner only for initialization, explicit scene/time pivots, corrections, detected payoffs, manual reevaluation, or periodic maintenance after six accepted assistant responses. Regenerates and swipes reuse the same authorial obligation and never spend a planner call or consume another beat. The next roleplay request never waits for maintenance planning. The bundled server plugin owns model requests, so an active pass can continue through a browser reload or closure and be recovered later. Transient planner or network failures receive at most two automatic retries; timeouts stop rather than silently starting another multi-minute request.
- Separates authorial purpose from scene realization: Tale Fairy chooses the relevant narrative function, causal source, and impact scale; the roleplay model chooses the exact event, NPC behavior, dialogue, outcome, and prose.
- Tracks nested layers from immediate action through local activity, situation, wider world, and durable open-ended trajectory. A hundred turns of homework can remain one routine academy activity inside a much larger life.
- Privately challenges its preferred route against the strongest materially different supported alternative, then shows only a concise decision audit in the Planner Scratchpad—not hidden chain-of-thought.
- Automatically infers whether the user is lingering, moving naturally, or advancing. A per-chat **Scene pacing** control can lock **Linger**, return to **Auto** or **Natural**, or request **Advance once**; lingering persists until the user actually releases the activity.
- Separates durable overall story identity from the current scene's local function. A quiet breakfast or board game can remain a slice-of-life scene inside a larger war, survival, political, mystery, or metaphysical arc without redefining the whole story.
- Uses causal tempo only to control story-state progression: hold, seed, advance, converge, payoff, redirect, or recover. It never directs prose rhythm, mood, dialogue style, sentence form, verbosity, or descriptive texture.
- Tracks a primary future setup privately with its current causal step, remaining conditions, earliest window, and disclosure state. Hidden developments can progress offscreen; only a conditionally valid clue, consequence, or payoff can reach the roleplay request.
- Privately archives and evaluates the full route set, but sends the roleplay model only a compact layered authorial frame, a factual one-line inventory of established open threads, one conditional narrative function, and the active conductor contract. The inventory keeps independent routes—such as a filed letter, institutional decision, appointment, journey, or relationship commitment—available without forcing dormant business into the current scene. Alternatives stay inside Tale Fairy. Each request receives a concrete beat function: deepen the authorized activity, advance a supported process, show a ready reaction or consequence, introduce a causally supported element, or pay off something due. Calm remains calm when no current situation, selected horizon, or due event supports an intrusion. Regenerates and swipes retry the realization under the same required development, reuse only pre-response canon, and reject treating discarded prose as established history.
- Places that route inside the provider-bound latest user content, before the user's actual turn. This avoids a late interleaved system message and keeps the default portable across chat-completion providers; the saved chat itself is never modified.
- Maintains up to ten durable story threads plus six to ten ordered planning horizons, from the current reply through later arcs or meaningful distant timeframes—without assuming an ending.
- Everything remains changeable. Short horizons move freely; increasingly distant horizons change more gradually as deviations accumulate, while explicit user pivots always win.
- Gives every horizon a nonzero but decreasing influence: near directions can shape the reply, middle directions bias setup, and distant directions remain a subtle background pull until events bring them closer.
- Builds distant horizons forward from the current roleplay trajectory instead of keeping a backlog of old scenes. A historical element returns only when a live actor, process, obligation, new fact, or elapsed-time consequence gives it a realistic route back into relevance.
- Keeps one to five editable conditional pathways beneath the immediate routes, activating, revising, or retiring them as actual events and user direction demand.
- Uses one planner pass through the active SillyTavern connection, a connection profile, a custom OpenAI-compatible endpoint, or OpenRouter. Detachment preserves SillyTavern's fully assembled request, including Gemini, GLM, text-completion, and other supported provider payloads.
- Direct OpenAI-compatible and OpenRouter configurations can securely fetch available models through SillyTavern and select them from a dropdown, with manual model IDs retained as a fallback.
- Gives the planner its own adjustable 0–2 temperature with a synchronized slider and typed value. It applies to every planner path without changing the roleplay model's temperature. A fresh variation nonce is included as normal prompt text; no provider seed parameter is required.
- Stores its compact state in chat metadata, so exported/copied chats carry it with them.
- Automatically performs a bounded planner upgrade when the active chat contains legacy Tale Fairy state, verifies that the new state was actually saved, and retries transient provider failures up to three times.
- Keeps relevant entities, possibilities, compact Director Notes, and recent beat history alongside the multi-horizon plan.
- Maintains an omniscient authorial model of relevant characters, factions, institutions, and world processes, including their distinct perspectives, motivations, knowledge, constraints, and agendas. This is a causal world view for planning—not permission to reveal private information to the player before the narrative supports it.
- Infers a familiar franchise, historical, or mythological baseline when evidence supports one, then gives the roleplay's established facts priority. It records narrative-supplied variant rules, distinctive continuity signatures, actual departures from the baseline, changing forces, and trajectory evidence without assuming that an inferred canon outcome must occur.
- Recovers durable unfinished business through generic evidence and lifecycle semantics—correspondence, pending decisions, investigations, missions, commitments, journeys, and other inferred processes—rather than named characters, worlds, or one-off scenario rules. Independent routes remain available together instead of one remembered hook consuming the future plan.
- Maintains a compact private causal state for consequential off-screen developments. It distinguishes confirmed events, selected simulations, evidence-based inferences, and unresolved possibilities, then carries their causes and downstream effects across planner passes without treating planner knowledge as player knowledge.
- Supports life, slice-of-life, country, nation, political, historical, and grand-strategy simulations. Personal simulations retain routines and relationships; large-scale simulations retain independent actors, institutions, governance, economy, public opinion, diplomacy, security, technology, infrastructure, environment, and delayed interacting consequences instead of collapsing into one scene or predetermined path.
- Can surface only a consequence or partial clue—such as a child returning from school with a black eye—while keeping the off-screen cause unspoken until an in-world reveal makes it knowable. This information boundary affects narrative coherence, never prose style.
- Treats user text and OOC corrections as higher priority than canon or inference.
- Keeps narrative pacing under the user's control in every mode. A declared action sets the maximum immediate player progress: heading to a destination permits travel and arrival, not completing the activity there or jumping to the next task. Supported NPC and world developments still unfold inside that boundary without artificial permission checks.
- Offers deliberately distinct **Light**, **Balanced**, and **Fun** intervention modes: Light applies minimal pressure, Balanced intervenes moderately, and Fun actively brings a bold, consequential scenario onstage when supported—without rushing or slowing the user's timeline or dictating the player character's response.
- Keeps one unified set of plausible narrative possibilities. Their nature is not predefined; what they become is determined by what the roleplay actually establishes. They are optional and never scheduled just because a scene is quiet.
- Searches broadly across the causal world rather than a fixed event menu, so removing labels does not exclude unseen people, changing pressures, consequences, opportunities, or unexpected developments when they have a believable route into the story.
- Includes a context-aware **Guide now / Re-evaluate** action (retains accumulated canon, notes, and long-range planning), an explicit **Full rebuild** (discards guide state and reconstructs it from accessible chat and context), **Delete guide state**, and one AI-assisted instruction field that can become a suggestion, correction, canon detail, or hard exclusion.
- Uses layered context instead of relying on a fixed tail: a portable narrative ledger, a configurable recent raw window (12 messages by default), and bootstrap samples from early/middle chat history on the first run. Full-chat fingerprints stay local and are used only to detect edits or stale imported state.
- Reuses available host context as supporting evidence: chat or message summaries, other active extension context, activated World Info, and the character/scenario fields already supplied by SillyTavern. Tale Fairy excludes its own prompt and handles Continuity separately so neither is duplicated.
- Uses context-conscious defaults: 4,000 tokens of recent raw context, 4,000 tokens of summary evidence, a hard 12,000-token completed planner prompt, and compact state collections. Tale Fairy budgets and compacts context in tokens, then verifies the finished prompt with SillyTavern's active tokenizer when available. World Info activation also receives a newest-first 12,000-token raw window instead of rescanning an unlimited transcript; summaries and message metadata are still discovered across the complete chat. A 6,144-token completion ceiling bounds both visible JSON and any hidden reasoning counted by the provider. The server gives a single provider request up to ten minutes; closing or reloading the browser does not end it, while **Stop analysis** still cancels it explicitly. The UI reports its current phase and elapsed time, and a browser-wide chat lock prevents duplicate pages from submitting the same planner job. Hidden thinking/stat blocks are removed from planner excerpts. When necessary, optional context, redundant planner state, and older excerpts are compacted first so the complete latest turn, the live plan, and relevant user/OOC directives receive priority.
- Keeps a small internal list of causal narrative events alongside the ledger. These are produced by the same planner request, retained with visibility and confidence, are not separately generated, and are never injected as a raw event list into the roleplay prompt.
- Director Notes can show a compact event-status view on demand; this is for inspection only and is separate from the guidance injected into the main RP model.
- The Planner Scratchpad records the exact dynamic guide found in the final provider payload. After the provider returns an assistant reply, it persists the request as **Confirmed**, along with its provider, model, placement, and timestamps.
- Functions independently using raw turns, relevance-selected history, lore, in-text recaps, injected summaries, host context, and its own compact causal state. An optional read-only Continuity snapshot can be consumed as just one unprivileged summary source; same-chat snapshots remain usable while Continuity refreshes after the latest raw turn, and route-aware Chronicle trimming preserves current recall, unresolved records from the omitted middle, and the chronological spine. Continuity is never required or treated as the continuity authority.

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

The planner returns structured JSON. If a provider rejects native JSON schema, the extension retries with an exact-shape JSON prompt. Planner failure never strands or delays the roleplay reply; the generic guidance fallback remains available. **Stop analysis** cancels background planning.

Browser-independent planning requires the bundled `plugin` directory to be installed as a SillyTavern server plugin and SillyTavern to be restarted. For a source checkout installed at `public/scripts/extensions/third-party/Tale-Fairy`, link `plugins/tale-fairy` to Tale Fairy's `plugin` directory. The extension checks `/api/plugins/tale-fairy/health` at startup and falls back to ordinary in-page requests when the server plugin is unavailable.

Before the provider request is sent, Tale Fairy atomically replaces stale Tale Fairy material and verifies that the assembled payload contains exactly the current dynamic context. If SillyTavern's normal extension-prompt path omitted it, Tale Fairy repairs the request in place. The `<tale-fairy-context>` and inner `<living-world-guide>` blocks are therefore visible in Prompt Inspector for the roleplay request.

## Scope

This is a lightweight, chat-local planning and causal world-direction layer with enough retained working continuity to function independently. It consumes available summaries and context regardless of their source. The optional Continuity bridge is merely one-way input compatibility, not a dependency or division of responsibility.

## License

Copyright (C) 2026 [ScatteredLilies2020](https://github.com/scatteredlilies2020).

Tale Fairy is free software licensed under the [GNU Affero General Public License v3.0](LICENSE).
