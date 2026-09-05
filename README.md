# Tale Fairy

Tale Fairy is a standalone SillyTavern extension that acts as an **adaptive authorial story controller**, not a prose writer. It maintains story direction and causal depth across different layers and timeframes, while the roleplay model realizes each scene from the full conversation.

## What it does

- Injects an adaptive forward-motion block into every normal roleplay request. The main roleplay instructions and context—not Tale Fairy—interpret the user action. Tale Fairy contributes only a compatible NPC/world response, consequence, opportunity, or next causal step.
- Uses real local weighted sampling for intervention size, novelty, and fortune after the AI chooses what movement the scene warrants. **Light** makes the required effect subtle but perceptible, **Balanced** makes it a clear meaningful change, and **Fun** gives fitting movement a bold or surprising expression without manufacturing conflict or escalation.
- Treats deepen, interrupt, challenge, opportunity, escalation, relief, resolution, redirection, and scene transition as examples rather than a closed event menu. A planner can return an entirely different fitting function through freeform direction.
- Calibrates stakes to the setting instead of equating movement with combat: a school scene might produce a difficult exam or severe reviewer, while an established battlefield or fantasy crisis can produce lethal danger.
- Does not interpret or control the user action. It cannot infer or alter the action's intent, target, manner, positioning, success, dialogue, thoughts, feelings, consent, decisions, compliance, or reaction. That entire layer belongs to the user text, established context, and main roleplay instructions.
- Sends a general, observable NPC/world next-step effect. It is external follow-through, not an outcome restriction: if it crosses into defining or modifying the user action, the writing model ignores it. All scale classifications, targets, evidence, and preserve/forbid constraints remain private planner context.
- Injects only fresh analyzed scene direction. If the planner result is missing or stale, Tale Fairy injects nothing and the roleplay request continues normally.
- Reuses the same analyzed follow-through and mode treatment for regenerations/swipes while leaving a different compatible realization open. Discarded prose never becomes canon.
- Runs its AI planner for initialization, explicit scene/time pivots, corrections, manual reevaluation, and immediately after every accepted assistant response. This successor planning is background-only: roleplay generation never waits for it, and an unavailable fresh direction means no Tale Fairy injection for that request.
- Prepares a conditional external-reaction set one turn ahead: one primary movement and two materially distinct redirect-safe alternatives. For each provider request, Tale Fairy makes one deterministic weighted-random branch choice and injects only that selected external direction; the full set remains visible in the Planner Scratchpad for inspection. The roleplay model resolves the user action without Tale Fairy and realizes only the selected compatible NPC/world follow-through. It ignores the selected direction if it would interpret, redirect, delay, narrow, weaken, or cap the action. Quiet listening, assignments, rest, and other routine scenes still receive context-native external movement rather than forced conflict or interruption. If planning is unavailable or stale, Tale Fairy safely contributes nothing, and a used or older set is never revived as a fallback.
- Keeps continuity threads, actors, lore, summaries, and causal state as evidence. They are not dormant triggers, delivery promises, or a scheduled event queue, and a new context-compatible cause is always available.
- Maintains a private **horizon radar** of up to four genuinely long-range trajectories. It distinguishes evidence-backed developments from original compatible speculation, checks that their causal engines differ, and records whether the present scene merely echoes, seeds, advances, or converges with them. These possibilities never enter the roleplay prompt as plot orders or become canon until play establishes them.
- Supports personal, slice-of-life, academic, workplace, political, institutional, national, historical, grand-strategy, battlefield, fantastical, and world-scale play using the causal unit natural to each scene.
- Treats explicit user text and OOC corrections as higher priority than canon, summaries, retained state, or planner inference. Familiar canon is a constraint and source of texture, never a forced future outcome.
- Places the dynamic block inside the provider-bound latest user content before the actual turn. The saved chat is not modified, and the Planner Scratchpad records the exact block found in the final provider payload.
- Stores compact state in chat metadata, supports active/profile/custom/OpenRouter planner connections, and can continue server-backed planner jobs through a browser reload when the bundled plugin is installed.
- Includes **Guide now / Re-evaluate**, **Full rebuild**, **Delete guide state**, and an AI-assisted note field for suggestions, corrections, canon details, and hard exclusions.
- Uses a bounded token-aware context layer built from recent raw turns, summaries, World Info, character/scenario fields, its narrative ledger, and an optional read-only Continuity snapshot. Continuity is supporting evidence, never a dependency or authority.

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

This is a lightweight, chat-local planning and causal world-direction layer with enough retained working continuity to function independently. It consumes available summaries and context regardless of their source. The optional Continuity bridge is merely one-way input compatibility, not a dependency or division of responsibility.

## License

Copyright (C) 2026 [ScatteredLilies2020](https://github.com/scatteredlilies2020).

Tale Fairy is free software licensed under the [GNU Affero General Public License v3.0](LICENSE).
