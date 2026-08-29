# Tale Fairy

Tale Fairy is a standalone SillyTavern extension that acts as an **adaptive authorial story controller**, not a prose writer. It maintains story direction and causal depth across different layers and timeframes, while the roleplay model realizes each scene from the full conversation.

## What it does

- Replans in the background after each completed assistant response. The next roleplay request never waits for the planner and never makes an extra AI call; sending a new turn cancels any unfinished background pass so the roleplay request takes priority.
- Separates authorial purpose from scene realization: Tale Fairy chooses the relevant narrative function, causal source, and impact scale; the roleplay model chooses the exact event, NPC behavior, dialogue, outcome, and prose.
- Tracks nested layers from immediate action through local activity, situation, wider world, and durable open-ended trajectory. A hundred turns of homework can remain one routine academy activity inside a much larger life.
- Automatically classifies the latest turn's temporal scope. The user can linger inside one moment or breeze through an entire declared activity without prompts, permission checkpoints, or manufactured obstacles.
- Separates durable overall story identity from the current scene's local function. A quiet breakfast or board game can remain a slice-of-life scene inside a larger war, survival, political, mystery, or metaphysical arc without redefining the whole story.
- Uses causal tempo only to control story-state progression: hold, seed, advance, converge, payoff, redirect, or recover. It never directs prose rhythm, mood, dialogue style, sentence form, verbosity, or descriptive texture.
- Tracks a primary future setup privately with its current causal step, remaining conditions, earliest window, and disclosure state. Hidden developments can progress offscreen; only a conditionally valid clue, consequence, or payoff can reach the roleplay request.
- Privately archives and evaluates the full route set, but sends the roleplay model only a compact layered authorial frame plus one conditional narrative function and impact envelope. Alternatives stay inside Tale Fairy. Regenerates and swipes rotate to distinct functions, reuse only pre-response canon, and reject replaying the discarded realization; if no aligned archive exists, a compact generic continuity fallback is injected.
- Places that route inside the provider-bound latest user content, before the user's actual turn. This avoids a late interleaved system message and keeps the default portable across chat-completion providers; the saved chat itself is never modified.
- Maintains up to ten durable story threads plus six to ten ordered planning horizons, from the current reply through later arcs or meaningful distant timeframes—without assuming an ending.
- Everything remains changeable. Short horizons move freely; increasingly distant horizons change more gradually as deviations accumulate, while explicit user pivots always win.
- Gives every horizon a nonzero but decreasing influence: near directions can shape the reply, middle directions bias setup, and distant directions remain a subtle background pull until events bring them closer.
- Builds distant horizons forward from the current roleplay trajectory instead of keeping a backlog of old scenes. A historical element returns only when a live actor, process, obligation, new fact, or elapsed-time consequence gives it a realistic route back into relevance.
- Keeps one to five editable conditional pathways beneath the immediate routes, activating, revising, or retiring them as actual events and user direction demand.
- Uses one planner pass through the active SillyTavern connection, a connection profile, a custom OpenAI-compatible endpoint, or OpenRouter.
- Direct OpenAI-compatible and OpenRouter configurations can securely fetch available models through SillyTavern and select them from a dropdown, with manual model IDs retained as a fallback.
- Gives the planner its own adjustable 0–2 temperature with a synchronized slider and typed value. It applies to every planner path without changing the roleplay model's temperature. A fresh variation nonce is included as normal prompt text; no provider seed parameter is required.
- Stores its compact state in chat metadata, so exported/copied chats carry it with them.
- Automatically performs a bounded planner upgrade when the active chat contains legacy Tale Fairy state, verifies that the new state was actually saved, and retries transient provider failures up to three times.
- Keeps relevant entities, possibilities, compact Director Notes, and recent beat history alongside the multi-horizon plan.
- Maintains a compact private causal state for consequential off-screen developments. It distinguishes confirmed events, selected simulations, evidence-based inferences, and unresolved possibilities, then carries their causes and downstream effects across planner passes without treating planner knowledge as player knowledge.
- Can surface only a consequence or partial clue—such as a child returning from school with a black eye—while keeping the off-screen cause unspoken until an in-world reveal makes it knowable. This information boundary affects narrative coherence, never prose style.
- Treats user text and OOC corrections as higher priority than canon or inference.
- Keeps narrative pacing under the user's control in every mode. A declared action sets the maximum immediate player progress: heading to a destination permits travel and arrival, not completing the activity there or jumping to the next task. Supported NPC and world developments still unfold inside that boundary without artificial permission checks.
- Offers deliberately distinct **Light**, **Balanced**, and **Fun** intervention modes: Light applies minimal pressure, Balanced intervenes moderately, and Fun actively brings a bold, consequential scenario onstage when supported—without rushing or slowing the user's timeline or dictating the player character's response.
- Keeps one unified set of plausible narrative possibilities. Their nature is not predefined; what they become is determined by what the roleplay actually establishes. They are optional and never scheduled just because a scene is quiet.
- Searches broadly across the causal world rather than a fixed event menu, so removing labels does not exclude unseen people, changing pressures, consequences, opportunities, or unexpected developments when they have a believable route into the story.
- Includes a context-aware **Guide now / Re-evaluate** action (retains accumulated canon, notes, and long-range planning), an explicit **Full rebuild** (discards guide state and reconstructs it from accessible chat and context), **Delete guide state**, and one AI-assisted instruction field that can become a suggestion, correction, canon detail, or hard exclusion.
- Uses layered context instead of relying on a fixed tail: a portable narrative ledger, a configurable recent raw window (12 messages by default), and bootstrap samples from early/middle chat history on the first run. Full-chat fingerprints stay local and are used only to detect edits or stale imported state.
- Reuses available host context as supporting evidence: chat or message summaries, other active extension context, activated World Info, and the character/scenario fields already supplied by SillyTavern. Tale Fairy excludes its own prompt and handles Continuity separately so neither is duplicated.
- Uses context-conscious defaults: 12 recent messages at 700 characters each, a hard 12,000-character planner-request budget, and compact state collections. A 32,768-token completion ceiling accommodates providers that count hidden reasoning against the request while the planner is explicitly constrained to concise JSON of roughly 6,000 visible tokens or fewer. Planner requests time out after four minutes. Hidden thinking/stat blocks are removed from planner excerpts. When necessary, optional context, redundant planner state, and older excerpts are compacted first so the complete latest turn, the live plan, and relevant user/OOC directives receive priority.
- Keeps a small internal list of causal narrative events alongside the ledger. These are produced by the same planner request, retained with visibility and confidence, are not separately generated, and are never injected as a raw event list into the roleplay prompt.
- Director Notes can show a compact event-status view on demand; this is for inspection only and is separate from the guidance injected into the main RP model.
- The Planner Scratchpad records the exact dynamic guide found in the final provider payload. After the provider returns an assistant reply, it persists the request as **Confirmed**, along with its provider, model, placement, and timestamps.
- Functions independently using raw turns, relevance-selected history, lore, in-text recaps, injected summaries, host context, and its own compact causal state. An optional read-only Continuity snapshot can be consumed as just one unprivileged summary source; it is never required or treated as the continuity authority.

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

Before the provider request is sent, Tale Fairy atomically replaces stale Tale Fairy material and verifies that the assembled payload contains exactly the current dynamic context. If SillyTavern's normal extension-prompt path omitted it, Tale Fairy repairs the request in place. The `<tale-fairy-context>` and inner `<living-world-guide>` blocks are therefore visible in Prompt Inspector for the roleplay request.

## Scope

This is a lightweight, chat-local planning and causal world-direction layer with enough retained working continuity to function independently. It consumes available summaries and context regardless of their source. The optional Continuity bridge is merely one-way input compatibility, not a dependency or division of responsibility.

## License

Copyright (C) 2026 [ScatteredLilies2020](https://github.com/scatteredlilies2020).

Tale Fairy is free software licensed under the [GNU Affero General Public License v3.0](LICENSE).
