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

The workshop keeps a private **continuing-life orientation**: the full RP premise, today's episode, and the relationships, pursuits, places and experiences that can sustain play beyond it. It separates these from an incident's aftermath or one occupational role. When establishing this orientation, it revisits the opening even if an older scene planner already reviewed it. A **story throughline** records a developing thread, not an exclusive agenda. Up to three prepared futures can develop across episodes; routine turns preserve useful ones, while choices and changed premises can redirect or retire them. Deliberately bounded stories can finish. This is preparation, not an assigned player objective or an ending.

Future episodes have their own **openings**: concrete encounters, activities or destinations that can become reachable now or at a natural transition. These do not compete with the four unfinished local tasks. Their entry conditions and specific later possibilities can reach the writer directly, while unselected futures stay private. Quiet play can leave this space empty.

The selected **outlook** also persists separately from the immediate scene and can contain up to two complementary futures. A routine action can update the present without rewriting the farther possibilities into the next chore. Each review renews their route into play and explicitly keeps, revises or withdraws the outlook as participation, circumstances and preferences change. Only its authored entry circumstances and conditional possibilities reach the writer; the current-action ledger is private, not another play-by-play recap. Selection reasons and access reasoning stay private too. NPC-owned work can proceed through those actors' resources; the player's mere presence is not a dependency.

Both stages save together. A review normally uses two planner requests, with a hard three-request ceiling shared by correction and recovery. If memory changes mid-pass, one fresh two-stage pass can replace the discarded drafts only when it fits that same budget. Repeated memory updates cannot start a retry loop. Wider preparation, local work and writer material have separate sizing targets. The writer receives selected story substance, not the private planning instructions. On regeneration, Tale Fairy can reuse a source-verified earlier plan; if none is usable, it attempts one nonblocking preparation for that exact pre-reply source. Repeated swipes do not repeatedly replan, and discarded replies never become the new plan's premises.

Reviews start one accepted reply before scene material expires. If a review fails or runs late, stale current-scene details are withheld while an explicitly selected, source-valid outlook can still supply its conditional mid- and long-term possibilities. Unselected/private futures, cleared outlooks and legacy scene prose cannot fill this fallback. Source edits and changed references still invalidate it.

Reference edits still invalidate old guidance and review coverage. Compatible wider ideas from an exact same-chat accepted prefix can be reconsidered privately against the new references, rather than silently forgotten. They must be authored anew; old facts, local plans and selections are not restored this way.

See the [continuing-life changes and evaluation](docs/story-life-0.16.0.md), [two-stage architecture](docs/story-workshop-0.15.0.md), [opening/recovery evaluation notes](docs/story-bridge-0.15.1.md), [durable outlook](docs/story-outlook-0.15.2.md), [story direction and reference-change evaluation](docs/story-throughline-0.15.3.md), and [refresh lifecycle](docs/story-lifecycle-0.15.4.md).

## Install

In SillyTavern, install `https://github.com/scatteredlilies2020/Tale-Fairy` from **Extensions > Install Extension**, then reload SillyTavern.
