# Mid-to-long-term planning diagnosis — 2026-09-16

Status: diagnosis and isolated task-contract experiment; no runtime change, installation, chat edit, settings edit, or commit.

## Acceptance target

The user wants Tale Fairy to prepare meaningful middle and longer-term play, not merely make the latest scene more elaborate. Continuing a local arc is not evidence of wanting more of that arc: the user explicitly says they are playing it out to see it finish. A successful planner must let an episode conclude while retaining substantial, causally independent possibilities for later play. Do not force departure, prescribe an ending, or replace every resolved problem with another lead in the same mystery.

## Method and boundaries

- Source: the latest saved Frieren chat, using the notebook's 328-message accepted source prefix. Its subsequent writer reply was not fed back into these initial comparisons.
- Existing configured planner: DeepSeek V4 Pro, temperature 0.8, reasoning requested Off, existing local SillyTavern transport. No writer generations.
- Production prompt builder, budget fitter, schema, parser and notebook merger; all experimental state is in memory. Inputs, raw outputs, source/settings hashes and a local driver are outside the repository under `%TEMP%/tf-scope-diagnosis-20260916`.
- Routine/review budgets: 6,000/14,000 input, 4,096/6,144 output. The accounting below is the local estimator, not a claim about provider tokenization.
- Filesystem reconstruction, not an exact browser request capture. Broad arms include the full card and transcript map but not the live Continuity bridge, activated World Info or external summary integrations. Routine character fields follow the browser bootstrap shape.
- Empty-notebook arms are diagnostic ablations, not a recommendation to reset user data. The production fitter reallocates freed space, so those arms change both notebook anchoring and the amount of source evidence retained; they do not isolate those effects individually.
- One sample per operational arm, followed by two samples of the experimental task. This can identify failure mechanisms and a candidate route; it cannot establish sustained narrative quality.

## Reproduced input failure

The saved-notebook routine input uses 5,903 estimated tokens. Its 663-character character description becomes a 300-character prefix, losing the actual town-to-town quest/dungeon scope. The complete persona and generated approach/summary survive. No historical witnesses or opening survive this routine input. Only the newest assistant/user pair remains.

The prompt's system/schema envelope uses approximately 2,837 tokens; retained notebook data another 1,575. Its protected local record is the runner, and its protected **wider** record is the same town's bridge aftermath. The two other records become ID/status lookup tuples.

This demonstrates two distinct defects:

1. A generated local frame can receive stronger effective budget protection than the source's RP scope.
2. Reserving a non-focused notebook record is an attention guarantee, not a guarantee of an independent narrative development.

Simply restoring the complete card to this finished routine payload would bring the estimate to 6,003 tokens. The lost scope is not enormous; the shedding order and coarse prefix cut matter. Nonetheless, preserving the card alone is not sufficient, as the live comparisons below show.

## Operational comparisons

All five existing-contract outputs parsed and merged successfully.

| Input | Estimated input | Result |
| --- | ---: | --- |
| Routine, saved notebook | 5,903 | Rewrites runner, weigh-house and lodging. Repeats unsupported certainty about mundane defenses. No substantial independent new preparation. |
| Routine, empty notebook | 5,878 | Receives the complete card, but recreates a narrow approach. Four updates all declare the same corruption family: runner, response, supply scheme and ambush. Resetting the notebook is not a fix. |
| Broad review, saved notebook | 13,246 | Complete card, opening and 12 chronological periods available. Adds mountain trade pressure caused by the same closure, then labels it independent. Larger context is not a fix by itself. |
| Broad review, empty notebook | 12,531 | Partial improvement: one genuinely wider royal-commission/resource possibility, alongside the investigation and local recovery. The broad approach improves, but this is not yet substantial, varied later-play preparation. |
| Scope-first, empty notebook | 5,625 | Same existing system/schema, full card, opening and latest pair; removes the local historical map/retrieved past scenes. Still generates mill supply trouble, a garrison supply wagon and a weigh-house ledger dispute, all tied to this crossing. Merely reducing local context is not a fix either. |

The source does not simply lack an open-ended premise. The current combined maintenance/selection job can translate explicit breadth instructions into more local consequences even when the original premise is visible and no generated notebook exists.

## Existing verification

On bundled Node 24.19.0:

`node --test tests/world-planner.test.js tests/planner-attention.test.js tests/prompt-budget.test.js`

112 passed, 0 failed. These tests protect engineering behavior, not successful middle/long-term creative planning. The real-input scope loss and semantically local wider witness coexist with those passing tests.

## Dedicated planning-task experiment: partial improvement, not a fix

The two dedicated-task samples used byte-identical JSON input to the scope-first comparison (SHA-256 `507d4bf899fabe40d1b20c5a73fbb5203a7ff32f690585fb6e2a841bbad121bf`), the same output schema, model and temperature. Only the system task changed; its shorter instructions also reduced total input tokens. Both outputs parsed and merged successfully.

- Sample one prepared a seed-seller's seasonal trade and disputed family orchard with motives, relationships and conditional developments independent of the current pursuit. However, its road-crew theft and orphan-register material largely repeated debt, paperwork and investigation patterns. This is not strong variety or demonstrated long-term progression.
- Sample two prepared a festival with optional ordinary participation and a shrine with an aging caretaker, ongoing duties and deteriorating wards. These are plausible independent later experiences. Its third entry, a ferry family, still depended materially on the current bridge closure despite an independence label, and contained inconsistent traffic/economic reasoning.
- Sample two's private approach incorrectly treated Elizabeth and Annabelle as separate people, although the persona identifies them as the same person. Source availability does not by itself guarantee source fidelity. This is an acceptance failure, not harmless creative latitude.

These samples support testing a distinct planning responsibility. They do not establish that a particular instruction caused every improvement, that the material survives routine updates, or that the writer can use it well. Neither sample demonstrates a sustained multi-episode development. A collection of later quest hooks, even causally independent ones, is not sufficient mid-to-long-term planning.

## Recommended next route: bounded implementation prototype

Change the responsibility of the existing broad-review pass, rather than adding another permanent critic or two calls per reply:

- **Mid/long-term preparation:** use source-grounded RP scope and accepted commitments to develop later playable situations and durable developments across episodes. Relationships, character pursuits, travel purposes and changing world conditions need meaningful intermediate states and conditional ways to progress; they must not become a fixed itinerary or prescribed ending. Do not make next-reply selection part of this job. Treat the current episode and its consequences as one episode, not the premise of all subsequent material.
- **Current-play selection:** maintain factual compatibility and select useful material for current play without rewriting the wider RP's scope to match the latest scene. Non-selection must not delete or locally reinterpret later preparation. Update enduring developments when accepted events actually affect them, not merely because another reply happened.

The isolated campaign-pass experiment changes only the system task relative to the scope-first input: same JSON payload, schema, model and sampling. It requests private preparation with empty focus/writer selections. This is not safe production integration by itself: a deployed broad pass must preserve the current writer selection and accepted state rather than clearing them, and must retain relevant historical constraints without flooding the creative task with repetitive local evidence.

The implementation order should be:

1. Protect source-grounded scope and identity before generated local framing in budget fitting. Keep explicit user preferences distinct from inferred interests: playing an arc for many turns does not make it the desired enduring premise. Add regression coverage for this exact 663-to-300-character loss without committing private chat content.
2. Give the existing broad-review pass its own planning contract and merge ownership. Reuse notebook storage initially; preserve current active events and writer selection. Routine updates must not overwrite durable scope or silently remove unselected preparation. Broad review must reconcile accepted changes rather than restart the world or blindly preserve contradicted ideas.
3. Evaluate progress across episodes, not just output breadth: current episode closure, an agency-respecting transition, and later continuation of a prepared relationship/pursuit/world change. Build synthetic fixtures with source identity, an unrelated open-ended setting and a deliberately closed scenario. Keep this implementation uncommitted and undeployed until the sequence checks support it.

No wholesale notebook deletion, genre quotas, compulsory subplot injection, automatic time advancement, extra critic loop or additional planner call on every reply. This is the recommended next experiment, not a claim that the architecture or model has already passed.

## Required acceptance before calling a fix successful

1. New later-play material has substantive middles and conditional futures; different IDs, locations, labels and repercussions are not counted as independent. At least one applicable enduring development must support meaningful progression across episodes, not just a list of future side quests.
2. It survives routine updates and a full-review interval without being absorbed into the current investigation.
3. The present episode can resolve or be left without mandatory pursuit, replacement clues or another hidden mastermind.
4. At a fitting transition, the writer can use later material without inventing player decisions, skipping requested experiences, or treating proposals as established facts.
5. Repeat on an unrelated open-ended RP and a closed scenario. No setting-specific fix or forced adventure template.
6. Preserve source identity, established facts, era and knowledge boundaries. Creative breadth does not excuse contradictions or converting unobserved proposals into canon.

Do not equate a good isolated planning sample with passing these lifecycle and writer checks.

## Verification and delivery boundary

Seven isolated planner calls completed; all seven passed schema/merge validation. Saved chat and settings hashes were unchanged in each experiment report. The compared experimental JSON payload hashes match. No writer was invoked and no experimental notebook was written back to SillyTavern. The only repository addition is this diagnosis; production behavior remains unchanged. The 112 existing test passes are baseline engineering evidence, not acceptance of the proposed fix.
