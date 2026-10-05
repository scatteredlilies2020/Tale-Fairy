# Tale Fairy

Tale Fairy is an AI story director for SillyTavern. It organizes the RP's sagas, arcs and threads, then gives the writing AI concise interpretations, stakes and expectations. It supports original worlds and franchise settings.

## Goals

- Develop the RP's particular interests, relationships and world, not a generic quest loop.
- Let several stories coexist without forcing convergence or player participation.
- Introduce fitting developments or good or bad interruptions. Quiet scenes need no escalation.
- Keep private preparation separate from public writer context and accepted history.
- Leave prose, pacing and execution to the writer. Presets stand alone.

## How preparation works

Each review uses **one planner request**. The AI reads the premise, characters, accepted play and available memory. It maintains a private story map and renews the public selection. It does not summarize the conversation, write memory, audit the writer or generate story replies.

The map uses three flexible scales:

- **Saga:** related arcs spanning a larger story.
- **Arc:** a sustained story question.
- **Thread:** a particular concern or developing strand.

No level is mandatory. Arcs can nest; threads can stand alone. Links connect stories without merging them. Several stories can be active. The AI creates, revises, groups, pauses, resolves and withdraws them. Unchanged records remain private across focus changes. Resolution follows accepted play; withdrawing a proposal does not claim it happened.

The writer receives selected stories' public titles, hierarchy, interpretations, stakes and expectations. A selection can include a fitting development or interruption. It is not a next-turn script or a conditional command beginning with “If”. The packet tells the writer to ignore completed, declined or contradicted developments. Private owners, motives, links and unselected stories stay private. There is no fixed selection quota; quiet play can receive none. The player retains their actions, choices, thoughts and outcomes.

Reviews normally span **12 accepted AI replies**. The AI can choose a horizon from **4 to 20**, capped by the user's review setting. Refresh begins one reply before expiry. Explicit OOC directions and scene boundaries prompt earlier review and immediately withhold old public guidance. Transcript edits and reference changes invalidate it too. Ordinary dialogue is interpreted by the next AI review, not a keyword classifier. Current play takes precedence over preparation.

Planning stays in the background. A failed or pending review preserves the private map, but public guidance expires at its horizon. Reloads and caches cannot extend it. Failure retries require new accepted AI play, not a timer or user-only input. Regeneration uses a verified pre-reply source without treating discarded replies as premises.

Complete JSON punctuation errors are repaired locally. Invalid updates, broken hierarchy and unavailable selections are withheld without discarding valid siblings. There are no automatic model correction calls or paid memory-refresh restarts. Requests stop after **60 seconds**. Targets are 10,000 input tokens and about 900 response tokens; output is capped at 2,200 tokens. Writer context is capped at 1,000 tokens; entries are withheld whole rather than clipped.

Existing preparations and author instructions remain readable. The next successful review carries retained proposals into the story map and archives the old plan. Author instructions remain verbatim. No memory rescan or preset edit is needed. Notes under `docs/` describe historical versions.

## Install

In SillyTavern, install `https://github.com/scatteredlilies2020/Tale-Fairy` from **Extensions > Install Extension**, then reload SillyTavern.
