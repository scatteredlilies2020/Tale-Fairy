# Tale Fairy

Tale Fairy is an AI story director for SillyTavern. It maintains a stable interpretation of what keeps the RP moving, plus lightweight saga, arc and thread cards. It supports large, multi-character AI-Dungeon-like sandboxes as well as intimate one-to-one RP, in original, canon or mixed worlds.

## Goals

- Develop the RP's particular interests, relationships and world, not a generic quest loop.
- Let several stories coexist without forcing convergence or player participation.
- Introduce fitting developments or good or bad interruptions. Quiet scenes need no escalation.
- Share useful author knowledge with the writer while distinguishing preparation from accepted history.
- Leave prose, pacing and execution to the writer. Presets stand alone.

## How preparation works

Each review uses **one planner request**. The AI reads the premise, characters, accepted play and available memory. It maintains a private story map and renews the public selection. It does not summarize the conversation, write memory, audit the writer or generate story replies.

The map uses three flexible scales:

- **Saga:** related arcs spanning a larger story.
- **Arc:** a sustained story question.
- **Thread:** a particular concern or developing strand.

No level is mandatory. Arcs can nest; threads can stand alone. Links connect stories without merging them. Several stories can be active. The AI creates, revises, groups, pauses, resolves and withdraws them. Unchanged records remain private across focus changes. Resolution follows accepted play; withdrawing a proposal does not claim it happened.

Open-ended RP keeps its future scope open. The overall orientation comes from the premise and explicit author instructions, rather than treating the current scene, genre or incident as the whole story. Reviews reconsider inherited descriptions. Independent concerns can have separate roots; ordinary props and conversational details need no dedicated story or elaborate significance.

The **RP orientation** is a short public reminder of recurring sources of movement across the world and ensemble: independent interests, relationships, livelihoods, discoveries, opportunities and appropriate tensions. It is not centered on one protagonist. A meal, respite or viewpoint change does not redefine the whole RP. Ordinary reviews retain the reminder verbatim; changing it requires a stated basis such as author direction, a corrected interpretation, changed roles or lasting circumstances. This is a structural stability check, not automatic verification of the model's reasoning. The current phase is stored separately. Author instructions can adjust interpretation, pressure and foreground/background emphasis.

Constant pressure means room for meaningful development, not constant interruption, conflict or escalation. The writer interprets the reminder and chooses concrete events, timing and execution. Quiet scenes remain valid; no encounter quota or convergence of unrelated stories is imposed. TF asks what changed, what still fits, and what is now a plausible meaningful progression rather than merely repeating existing concerns. Original settings support compatible new people, places and situations; canon is a fallible reference, never a required destination.

Each story card gets a concise description plus up to three **effects**: a short label and a concrete ongoing pressure. For example, *Diplomatic strain* makes border assignments and Hyuga protection politically sensitive. Effects shape the world while leaving specific events open. A recognizable **endsWhen** boundary lets a concern finish; ongoing currents may leave it empty. The player controls all their characters' actions, choices, thoughts and outcomes.

The **Story Board** is a responsive card view: a persistent world frame above broad currents (internally `saga`), arcs and threads. Cards display status, parent context, influences, effects, links and ending boundaries. Several broad currents can coexist. Dormant and closed cards fold away; diagnostics and exact writer guidance remain accessible. Status labels accompany colors. Opening the board changes no state and makes no model call.

Selected cards carry their ongoing effects to the writer on ordinary turns, within the same freshness and 1,000-token budget as the orientation. Effects are stored once on their card, not duplicated in planner selection output. Omitted cards/effects survive a review; an explicit empty effects list clears them. Resolved, retired and dormant cards are not selected. Older preparation and saved swipes remain readable. The board distinguishes selection from verified sending; the writer preview remains authoritative if budgets or source changes withhold material.

The writer shares TF's **author-level knowledge**, including useful hidden motives and plausible secret involvement. A proposed Sith intermediary can influence patronage and trade without a public revelation or an identity-tracking ledger. Creative proposals are not completed events; characters discover secrets through play. The planner reads implied institutions, incentives and customs, not just named facts. Depth can mean K-on's music, school traditions and affectionate relationships as readily as political intrigue, without prescribing prose style.

A compact **private scratchpad** distinguishes relevant established changes from tentative canon dependencies and uncertain future implications. It is not a growing history ledger or a canonical event schedule. It never reaches the writer. The director's broader view does not give characters unsupported knowledge; invented preparation is not established history.

Reviews normally span **12 accepted AI replies**. The AI can choose a horizon from **4 to 20**, capped by the user's review setting. Refresh begins one reply before expiry. Explicit OOC directions and scene boundaries prompt earlier review and immediately withhold old public guidance. Transcript edits and reference changes invalidate it too. Ordinary dialogue is interpreted by the next AI review, not a keyword classifier. Current play takes precedence over preparation.

New-format selected cards also ask the writer to append a standalone hidden HTML comment, `<!--tf-review-->`, when play finishes or materially changes a card or world frame. The local detector requests one early review; it cannot resolve cards by itself. It ignores user messages, quoted/embedded markers and fenced examples. After the review covers that reply, the signal is consumed by the normal source boundary and is not replayed on reload. This is an advisory model signal, not guaranteed semantic detection. Periodic review remains the fallback when the writer omits it or no new-format card is selected. The marker may be visible in raw message/source editors; it is an HTML comment in the rendered story.

Planning stays in the background. A failed or pending review preserves the private map, but public guidance (including the orientation) expires at its horizon. Persistent interpretation does not mean bypassing freshness or transcript checks. Reloads and caches cannot extend it. Failure retries require new accepted AI play, not a timer or user-only input. Regeneration uses a verified pre-reply source without treating discarded replies as premises.

**Guide now / Re-evaluate** updates existing preparation. **Full rebuild** first deletes Tale Fairy's generated plans, archives, legacy notebook and cached guidance, then builds fresh from the chat and current references. It preserves pacing and author instructions. If the request fails or is stopped, the old preparation stays deleted. **Delete guide state** clears the notebook without starting a new request.

Complete JSON punctuation errors are repaired locally. Invalid updates, broken hierarchy and unavailable selections are withheld without discarding valid siblings. There are no automatic model correction calls or paid memory-refresh restarts. Requests stop after **60 seconds**. Targets are 10,000 input tokens and about 900 response tokens; output is capped at 2,200 tokens. The orientation and cards share the 1,000-token writer budget; entries are withheld whole rather than clipped. Explicit author instructions take precedence and are never silently shortened; author-only overflow is reported.

Existing preparations and author instructions remain readable. The next successful review carries retained proposals into the story map and archives the old plan. Author instructions remain verbatim. No memory rescan or preset edit is needed. Notes under `docs/` describe historical versions.

## Standalone examples and checks

See [exact example writer packets](docs/ensemble-pressure-examples.md) for seven synthetic RPs: Naruto ensemble/divergence, Naruto civilians, reflective original travel, Star Wars respite/intrigue, an original multi-region sandbox, intimate original RP, and original factions within a canon setting. These are hand-authored planner fixtures run through production validation and serialization, not measured model creativity or a live ST session. They require no SillyTavern installation or API keys.

`node --test` runs the regression suite. `scripts/evaluate-ensemble-pressure.mjs` writes the full synthetic planner requests, sample responses and exact outgoing writer packets to an external directory specified by `TF_EVAL_OUTPUT`.

For the card UI and effects, run `scripts/evaluate-story-cards.mjs` with `TF_CARD_OUTPUT` set to an external output directory. It generates an interactive `story-cards.html` preview, `writer-packets.md`, and six JSON reports: Naruto, Star Wars, K-on, Baki, Frieren and an original island setting. Each covers initial preparation, an unchanged quiet review, and an arc closing while broader currents persist. These are authored alternate-RP premises, not canon claims or live model-quality measurements. The preview uses the production card renderer and stylesheet; exact packets use production validation and serialization. Host regression tests separately verify ordinary-turn reuse, reload persistence, periodic review and removal of resolved effects.

## Install

In SillyTavern, install `https://github.com/scatteredlilies2020/Tale-Fairy` from **Extensions > Install Extension**, then reload SillyTavern.
