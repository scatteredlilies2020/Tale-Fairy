# Tale Fairy

Tale Fairy is a SillyTavern extension that prepares continuing story life from the RP's premise, characters, and relevant past: arcs, independent episodes, and ordinary recurring experiences. It keeps unused possibilities private and gives the writing AI fitting NPC/world activity and possible developments. It supports original worlds and franchise settings, including changes made during play.

## Goals

- Turn what the RP is about into fresh places, activities and projects: everyday life, relationships, travel, discoveries, conflict, or quiet moments when appropriate, not a generic quest loop. This planning stays internal; the writer receives story material, not instructions to generate it.
- Keep meaningful past events and plausible NPC or world activity in view without forcing old threads to continue forever.
- Let longer stories and independent side activities coexist with open player choices. The user's preset owns writing style and pacing.
- Keep private progression across scene changes: NPC/world interests, intermediate changes, longer-range possibilities, and the conditions connecting them. Local plans can change without erasing this preparation; trajectories change or retire explicitly. Only accessible story material reaches the writer.
- Stay lightweight and optional. Tale Fairy is not a historical memory system and does not write story replies on its own.

## How preparation works

Each review uses **one planner request** to update a compact library of future possibilities and select fitting NPC/world activity. It reads the RP premise, characters, accepted play and existing memory. It does not generate a conversation summary, rebuild historical memory, audit the writer or maintain another consequence ledger.

Possibilities describe an interesting experience and distinct nearer and farther developments. They can be independent beginnings, continuing stories or recurring ordinary life. Unchanged possibilities remain available across scene changes; the planner explicitly revises or withdraws them when appropriate. There is no requirement to add ideas on every review, escalate conflict or tie everything to the latest incident.

The director selects up to two possibilities with a plausible encounter route. The writer receives a brief forthcoming NPC/world action, a broad prerequisite only where needed, and public later possibilities. Private proposals and access reasoning remain private. Incidental details, dialogue, execution, prose and pacing belong to the writer and its preset. Player participation and outcomes remain open. Quiet play can receive no additional material.

Complete JSON punctuation errors are repaired locally. An invalid optional proposal or unavailable selection is withheld without discarding independent valid preparation. There are no automatic model correction calls or paid memory-refresh restarts. A provider request stops after **60 seconds** and preserves previous source-valid preparation. Cancellation, accepted-source checks, player ownership, reference checks and the writer context budget remain enforced.

Planning runs in the background. Source-valid selected possibilities remain usable while a review is pending or fails. Newer accepted play takes precedence: completed, declined or contradicted activity should not repeat. Source edits and changed references still invalidate old guidance. Regeneration can reuse a verified earlier packet without turning discarded replies into premises.

Existing preparations and author instructions remain readable. On the next successful review, old detailed planning state is archived and the active plan uses the compact director format. No memory rescan is needed. Earlier architecture and evaluation notes under `docs/` describe historical versions.

## Install

In SillyTavern, install `https://github.com/scatteredlilies2020/Tale-Fairy` from **Extensions > Install Extension**, then reload SillyTavern.
