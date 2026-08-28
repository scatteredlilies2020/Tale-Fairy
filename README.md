# Tale Fairy

Tale Fairy is a standalone SillyTavern extension that supplies an **adaptive narrative plan**, not prose. It maintains several story directions across different timeframes, revises them after each completed response, and gives the roleplay model compact immediate routes for the next turn.

## What it does

- Replans in the background after each completed assistant response. The next roleplay request never waits for the planner and never makes an extra AI call; sending a new turn cancels any unfinished background pass so the roleplay request takes priority.
- Prepares two or three contrasting conditional routes, then lets the roleplay model match them against the latest user action in its normal generation call. If none fits, it may discard them and make its own grounded move.
- Archives the route set actually sent to the provider. Regenerates and swipes rotate the preferred route for materially different developments while retaining continuity; if no aligned archive exists, a compact generic motion/variety fallback is still injected.
- Maintains up to ten durable story threads plus six to ten ordered planning horizons, from the current reply through later arcs or meaningful distant timeframes—without assuming an ending.
- Everything remains changeable. Short horizons move freely; increasingly distant horizons change more gradually as deviations accumulate, while explicit user pivots always win.
- Gives every horizon a nonzero but decreasing influence: near directions can shape the reply, middle directions bias setup, and distant directions remain a subtle background pull until events bring them closer.
- Builds distant horizons forward from the current roleplay trajectory instead of keeping a backlog of old scenes. A historical element returns only when a live actor, process, obligation, new fact, or elapsed-time consequence gives it a realistic route back into relevance.
- Keeps one to five editable conditional pathways beneath the immediate routes, activating, revising, or retiring them as actual events and user direction demand.
- Uses one planner pass through the active SillyTavern connection, a connection profile, a custom OpenAI-compatible endpoint, or OpenRouter.
- Direct OpenAI-compatible and OpenRouter configurations can securely fetch available models through SillyTavern and select them from a dropdown, with manual model IDs retained as a fallback.
- Uses ordinary temperature-1 sampling for every planner path. A fresh variation nonce is included as normal prompt text; no provider seed parameter is required.
- Stores its compact state in chat metadata, so exported/copied chats carry it with them.
- Automatically performs a bounded planner upgrade when the active chat contains legacy Tale Fairy state, verifies that the new state was actually saved, and retries transient provider failures up to three times.
- Keeps relevant entities, possibilities, compact Director Notes, and recent beat history alongside the multi-horizon plan.
- Treats user text and OOC corrections as higher priority than canon or inference.
- Keeps narrative pacing under the user's control in every mode. Declared actions, direct questions, and choices receive procedural follow-through without special “advance” wording, while their outcomes may still be surprising, difficult, funny, or bold when causally supported; slow pacing develops meaningful beats instead of artificial waits.
- Offers deliberately distinct **Light**, **Balanced**, and **Fun** intervention modes: Light applies minimal pressure, Balanced intervenes moderately, and Fun actively brings a bold, consequential scenario onstage when supported—without rushing or slowing the user's timeline or dictating the player character's response.
- Keeps one unified set of plausible narrative possibilities. Their nature is not predefined; what they become is determined by what the roleplay actually establishes. They are optional and never scheduled just because a scene is quiet.
- Searches broadly across the causal world rather than a fixed event menu, so removing labels does not exclude unseen people, changing pressures, consequences, opportunities, or unexpected developments when they have a believable route into the story.
- Includes manual **Guide now** (rebuilds all guide state from the current chat and context), **Delete guide state** (clears saved and pending planner state), and one AI-assisted instruction field that can become a suggestion, correction, canon detail, or hard exclusion.
- Uses layered context instead of relying on a fixed tail: a portable narrative ledger, a configurable recent raw window (12 messages by default), and bootstrap samples from early/middle chat history on the first run. Full-chat fingerprints stay local and are used only to detect edits or stale imported state.
- Reuses available host context as supporting evidence: chat or message summaries, other active extension context, activated World Info, and the character/scenario fields already supplied by SillyTavern. Tale Fairy excludes its own prompt and handles Continuity separately so neither is duplicated.
- Uses context-conscious defaults: 12 recent messages at 700 characters each, a hard 12,000-character planner-request budget, and compact state collections. The 4,096-token response ceiling leaves reasoning models enough room for the complete structured plan; normal concise outputs stop well before it. Hidden thinking/stat blocks are removed from planner excerpts. When necessary, optional context, redundant planner state, and older excerpts are compacted first so the complete latest turn, the live plan, and relevant user/OOC directives receive priority.
- Keeps a small internal list of separate narrative events alongside the ledger. These are produced by the same planner request, are not separately generated, and are never injected as a raw event list into the roleplay prompt.
- Director Notes can show a compact event-status view on demand; this is for inspection only and is separate from the guidance injected into the main RP model.
- The Planner Scratchpad records the exact dynamic guide found in the final provider payload. After the provider returns an assistant reply, it persists the request as **Confirmed**, along with its provider, model, placement, and timestamps.
- Uses Continuity Memory context when available through a read-only bridge. It accepts only a current snapshot for the active chat, trims it before planning, and never triggers extraction or writes memory. The integration remains optional and can be disabled.

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

This is not a memory database and does not replace Continuity Memory. It is a lightweight, chat-local planning and world-direction layer. The Continuity bridge is one-way and read-only.

## License

Copyright (C) 2026 [ScatteredLilies2020](https://github.com/scatteredlilies2020).

Tale Fairy is free software licensed under the [GNU Affero General Public License v3.0](LICENSE).
