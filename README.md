# Tale Fairy

Tale Fairy is a standalone SillyTavern extension that supplies an **adaptive narrative plan**, not prose. It maintains several story directions across different timeframes, revises the immediate parts as the user acts, and gives the roleplay model one concrete live beat to perform now.

## What it does

- Starts planning from the complete latest user turn as soon as it is committed, in parallel with earlier generation work such as Continuity Memory.
- Makes the roleplay request wait for a fresh live beat, so guidance created before the latest user action is never reused. Regenerates and swipes deliberately request a new variation.
- Retries brief planner failures three times, then safely continues without a live beat rather than stranding the chat. **Stop** cancels both the analysis and pending reply.
- Maintains up to ten durable story threads plus six to ten ordered planning horizons, from the current reply through later arcs or meaningful distant timeframes—without assuming an ending.
- Everything remains changeable. Short horizons move freely; increasingly distant horizons change more gradually as deviations accumulate, while explicit user pivots always win.
- Gives every horizon a nonzero but decreasing influence: near directions can shape the reply, middle directions bias setup, and distant directions remain a subtle background pull until events bring them closer.
- Tracks one active beat with a concrete current action and observable completion condition. It keeps, advances, or replaces that beat as actual events and user direction demand.
- Uses one planner pass through the active SillyTavern connection, a connection profile, a custom OpenAI-compatible endpoint, or OpenRouter.
- Direct OpenAI-compatible and OpenRouter configurations can securely fetch available models through SillyTavern and select them from a dropdown, with manual model IDs retained as a fallback.
- Uses ordinary temperature-1 sampling for every planner path. A fresh variation nonce is included as normal prompt text rather than relying on provider seed support; regenerate and swipe still force a new planner pass when chat text is unchanged.
- Stores its compact state in chat metadata, so exported/copied chats carry it with them.
- Automatically performs one bounded planner pass when the active chat still contains legacy Tale Fairy state without live beats or horizons.
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

The planner returns structured JSON. If a provider rejects native JSON schema, the extension retries with an exact-shape JSON prompt. A pending reply makes up to three planner attempts with short backoff; it then continues without a live beat if the planner remains unavailable. The user can press **Stop** to cancel the pending analysis and reply.

Before the provider request is sent, Tale Fairy verifies that the assembled payload contains the current dynamic guide. If SillyTavern's normal extension-prompt path omitted it, Tale Fairy repairs the request in place. The exact `<living-world-guide>` block is therefore visible in Prompt Inspector for the roleplay request.

## Scope

This is not a memory database and does not replace Continuity Memory. It is a lightweight, chat-local planning and world-direction layer. The Continuity bridge is one-way and read-only.

## License

Copyright (C) 2026 [ScatteredLilies2020](https://github.com/scatteredlilies2020).

Tale Fairy is free software licensed under the [GNU Affero General Public License v3.0](LICENSE).
