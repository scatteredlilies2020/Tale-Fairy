# Tale Fairy

Tale Fairy is a standalone SillyTavern extension that quietly supplies **narrative context**, not prose. It helps a roleplay preserve slow scenes, avoid repeating the same beat forever, and keep a small set of relevant off-screen possibilities alive.

## What it does

- Produces current guidance before every generated roleplay reply, then refreshes its ledger in the background.
- Starts planning as soon as the user message is committed, allowing Tale Fairy to prepare independently alongside earlier generation work such as Continuity Memory; the roleplay request waits only for both prerequisites to finish.
- Waits until current non-empty guidance is available. Temporary planner failures retry automatically; **Stop** cancels both the wait and the pending reply.
- Uses one optional planner request through the active SillyTavern connection, a connection profile, a custom OpenAI-compatible endpoint, or OpenRouter.
- Direct OpenAI-compatible and OpenRouter configurations can securely fetch available models through SillyTavern and select them from a dropdown, with manual model IDs retained as a fallback.
- Gives every planner run a fresh random variation seed. Regenerate and swipe runs force a new planner pass even when the chat text is unchanged; supported providers receive the same seed in the request, while the seed in the planner payload also varies providers that ignore the API parameter.
- Stores its compact state in chat metadata, so exported/copied chats carry it with them.
- Keeps up to three optional objectives, relevant entities, possibilities, and concise Director Notes.
- Treats user text and OOC corrections as higher priority than canon or inference.
- Offers **Light**, **Balanced**, and **Fun** modes. Fun considers more varied possibilities while staying faithful to the scene's demonstrated tone; it does not force events.
- Keeps one unified set of plausible narrative possibilities. Their nature is not predefined; what they become is determined by what the roleplay actually establishes. They are optional and never scheduled just because a scene is quiet.
- Searches broadly across the causal world rather than a fixed event menu, so removing labels does not exclude unseen people, changing pressures, consequences, opportunities, or unexpected developments when they have a believable route into the story.
- Includes manual **Guide now** (initializes or rebuilds from chat), **Delete guide state**, and one AI-assisted instruction field that can become a suggestion, correction, canon detail, or hard exclusion.
- Uses layered context instead of relying on a fixed tail: a portable narrative ledger, a configurable recent raw window (24 messages by default), and bootstrap samples from early/middle chat history on the first run. Full-chat fingerprints stay local and are used only to detect edits or stale imported state.
- Reuses available host context as supporting evidence: chat or message summaries, other active extension context, activated World Info, and the character/scenario fields already supplied by SillyTavern. Tale Fairy excludes its own prompt and handles Continuity separately so neither is duplicated.
- The planner context budget is a soft target. Optional context is compacted first, while selected recent messages and relevant user/OOC material are retained when they are the only available source for the current scene.
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

The planner returns structured JSON. If a provider rejects native JSON schema, the extension retries with an exact-shape JSON prompt. Planner failures and timeouts enter a bounded-backoff retry loop; roleplay resumes automatically when guidance succeeds, or the user can press **Stop** to cancel the pending analysis and reply.

Before the provider request is sent, Tale Fairy verifies that the assembled payload contains the current dynamic guide. If SillyTavern's normal extension-prompt path omitted it, Tale Fairy repairs the request in place. The exact `<living-world-guide>` block is therefore visible in Prompt Inspector for the roleplay request.

## Scope

This is not a memory database and does not replace Continuity Memory. It is a lightweight, chat-local world simulation layer. The Continuity bridge is one-way and read-only.

## License

Copyright (C) 2026 [ScatteredLilies2020](https://github.com/scatteredlilies2020).

Tale Fairy is free software licensed under the [GNU Affero General Public License v3.0](LICENSE).
