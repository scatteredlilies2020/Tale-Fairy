# Tale Fairy

Tale Fairy is a standalone SillyTavern extension that runs a **private active-world simulation**, not a prose writer or plot script. It tracks causal state across actors, relationships, institutions, systems, resources, and environments while the roleplay model creatively realizes each scene from the full conversation.

## What it does

- Maintains broad world state privately, but injects only **1–6 currently relevant underlying conditions**—normally 3–6 when supported. Each clean line describes what a subject wants, believes, knows, can do, is constrained by, or is under pressure from.
- Leaves concrete actions, events, dialogue, revelations, consequences, scene routes, and outcomes to the main roleplay model. Tale Fairy supplies causes, not a predetermined next beat.
- Withholds internal IDs, confidence, relevance reasoning, evidence, rankings, and future plans from the roleplay prompt. Tentative reconstructions stay Scratchpad-only instead of being presented as facts.
- Distinguishes open, limited, and private knowledge. Private motivations may shape believable behavior without forcing the roleplay model to reveal them.
- Keeps hundreds of dormant characters or systems out of active context. Compact descriptions, lore, summaries, continuity evidence, and factual records allow relevant ones to be retrieved and reconstructed later.
- Does not treat a mentioned condition as resolved or an unmentioned pressure as escalated. Salience changes only through new evidence, elapsed time, changed dependencies, or a real causal-state change.
- Tracks selected off-screen actors, groups, institutions, systems, environments, places, and situations as **deferred debt rather than continuous ticks**. It settles broad plausible change only when a subject becomes relevant again, material time explicitly advances, or a dependency changes; settled facts are append-only, and undelivered pressure is never a scheduled event.
- Scales certainty and detail by distance. Nearby state may be specific; distant state stays broad; remote or long-unobserved state remains incomplete, possibly outdated, and never grants the player automatic omniscience.
- Stays one step ahead through a private **horizon radar** and **hidden-motive board**. These remain optional hypotheses—not event queues, promises, canon, or provider instructions.
- Runs planning after accepted assistant responses and on initialization, scene/time pivots, corrections, and manual reevaluation. Planning is background-only: roleplay generation never waits, and missing or stale analysis simply means no Tale Fairy injection.
- Reuses the same causal slice for regenerations/swipes, allowing the writing model to produce a different realization without changing the underlying world state. Discarded prose never becomes canon.
- Applies generically to life sims, country sims, political or institutional play, slice of life, fantasy, battlefield scenes, and other scales by tracking the causal unit natural to the current context.
- Respects scene scale: quiet activity may linger, outside pressure may remain silent or subtextual, and setting-native challenge may be social, intellectual, bureaucratic, material, emotional, environmental, physical, or absent. Rare derailments require a supported cause already converging; elapsed time or novelty alone never forces one.
- Preserves player agency: it never authors the player's dialogue, choices, thoughts, feelings, consent, or uncertain result.
- Treats explicit user text and OOC corrections as higher authority than summaries, lore, retained state, or inference.
- Places the dynamic block inside the provider-bound latest user content without modifying saved chat, and records the exact verified block in the Planner Scratchpad.
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

The planner returns structured JSON. If a provider rejects native JSON schema, the extension retries with an exact-shape JSON prompt. Background planner failure never strands or delays the roleplay reply; Tale Fairy simply injects nothing until a fresh result is ready. **Stop analysis** cancels background planning.

Browser-independent planning requires the bundled `plugin` directory to be installed as a SillyTavern server plugin and SillyTavern to be restarted. For a source checkout installed at `public/scripts/extensions/third-party/Tale-Fairy`, link `plugins/tale-fairy` to Tale Fairy's `plugin` directory. The extension checks `/api/plugins/tale-fairy/health` at startup and falls back to ordinary in-page requests when the server plugin is unavailable.

Before the provider request is sent, Tale Fairy atomically replaces stale Tale Fairy material and verifies that the assembled payload contains exactly the current dynamic context. If SillyTavern's normal extension-prompt path omitted it, Tale Fairy repairs the request in place. The `<tale-fairy-context>` and inner `<living-world-guide>` blocks are therefore visible in Prompt Inspector for the roleplay request.

## Scope

This is a lightweight, chat-local active-world simulation and causal-context layer with enough retained working continuity to function independently. It consumes available summaries and context regardless of their source. The optional Continuity bridge is merely one-way input compatibility, not a dependency or division of responsibility.

## License

Copyright (C) 2026 [ScatteredLilies2020](https://github.com/scatteredlilies2020).

Tale Fairy is free software licensed under the [GNU Affero General Public License v3.0](LICENSE).
