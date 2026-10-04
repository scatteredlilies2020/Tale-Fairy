# Tale Fairy

Tale Fairy is a SillyTavern extension that prepares fitting story possibilities from the RP's premise, characters, and relevant past. It keeps planning goals private and gives the writing AI concrete near-, mid-, and longer-term possibilities rather than an objective checklist or new writing instructions. It supports original worlds and franchise settings, including changes made during play.

## Goals

- Turn what the RP is about into fresh places, activities and projects: everyday life, relationships, travel, discoveries, conflict, or quiet moments when appropriate, not a generic quest loop. This planning stays internal; the writer receives story material, not instructions to generate it.
- Keep meaningful past events and plausible NPC or world activity in view without forcing old threads to continue forever.
- Let long-term direction, near-term goals, and independent side threads coexist without scripted scenes or predetermined outcomes. Goals guide private selection, never control the player or become writer instructions; the user's preset owns writing style and pacing.
- Keep private progression across scene changes: NPC/world interests, intermediate changes, longer-range possibilities, and the conditions connecting them. Local plans can change without erasing this preparation; trajectories change or retire explicitly. Only accessible story material reaches the writer.
- Stay lightweight and optional. Tale Fairy is not a historical memory system and does not write story replies on its own.

## How preparation works

Two separate passes do different jobs. A **story workshop** prepares concrete future episodes from the RP's premise, with places, people, activities and conditional developments. A **scene selector** maintains current work and brings in only material that has a plausible route into play. It cannot shrink or overwrite the workshop's wider preparation.

Both stages save together. A review normally uses two planner requests, with at most one shared correction for invalid output. Wider preparation, local work and writer material have separate sizing targets. The writer receives selected story substance, not the private planning instructions. See [the architecture and evaluation notes](docs/story-workshop-0.15.0.md).

## Install

In SillyTavern, install `https://github.com/scatteredlilies2020/Tale-Fairy` from **Extensions > Install Extension**, then reload SillyTavern.
