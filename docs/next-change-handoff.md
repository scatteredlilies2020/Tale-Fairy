# Tale Fairy: next-change handoff

**Status: implemented locally in v0.16.1 — see [verification and remaining limitations](future-entries-0.16.1.md).**

The v0.16.2 follow-up preserves complete conditional future packets across turns and failed reviews. See [persistent entries and verification](persistent-entries-0.16.2.md).

The proposal and baseline evidence below are retained as the original handoff.

This file is self-contained and safe to transfer without chat logs, settings, or credentials.

## 1. Intended result

Tale Fairy should prepare the continuing life of an RP, not choreograph its next reply. Its writer guidance should contribute concrete possibilities beyond what the conversation already establishes: changing relationships, pursuits, places, discoveries, and consequences appropriate to that story.

Progression need not mean danger, an interruption, a quest, or ever-increasing stakes. A shared interest can develop as meaningfully as an expedition. A deliberately bounded story may simply finish. These decisions belong inside the planner, not in a growing list of instructions sent to the writer.

**Scope of this proposal:** close the remaining gap between wider planning and the material actually delivered to the writer. Do not replace the whole planner or prescribe a plot for any particular RP.

## 2. Baseline and evidence

- Repository: https://github.com/scatteredlilies2020/Tale-Fairy
- Reviewed baseline: **v0.16.0**, commit **`7ef3d8dbfd8d7778e5f1c2049cd88502eb615dc8`**. Check the other PC's current revision before working; preserve subsequent changes.
- Existing architecture: private `storyLife`, up to three prepared trajectories, up to two selected futures, and host-composed writer guidance. Normal preparation uses two model requests, with a shared ceiling of three including repairs. The writer packet has a 1,000-token envelope.
- The baseline's last recorded full test result was **1,173 passing tests**. That verifies existing contracts, not consistent creative quality.
- Latest live inspection showed a successful new preparation with distinct intermediate and farther possibilities, including a strand outside the current incident. This is real progress and should be preserved.
- **Confirmed defect:** the delivered packet still began with present-scene status and immediate work. Removing direct scene selection did not eliminate recap through an authored opening.
- The new packet was verified in an outgoing provider request, but no corresponding completed reply was saved at inspection. **Its effect on actual story pacing is not yet established.**

## 3. Main change: separate access reasoning from useful future material

### Why the current boundary leaks

The active scene contract already requires `selected_material: []`. However, `composeOutlookMaterial()` copies selected `openings[].circumstance` into the writer's `available_circumstances`. An opening can contain a recap or immediate task while still satisfying the schema, access checks, and future-ID linkage.

Consequently, a structurally valid future packet can still foreground the current incident. Another sentence saying “think long term” does not fix this boundary.

### Proposed behavior

1. **Keep current status, unresolved immediate actions, and detailed access reasoning private.** Retain them for continuity and feasibility checks; do not discard the private scene ledger.
2. **Make the authored opening a genuine entry into the selected future.** It should add a concrete forthcoming encounter, undertaking, or changed circumstance, not repeat what is already happening. Include only the prerequisite needed to make that entry intelligible.
3. **Do not equate eventual access with immediate availability.** A future can remain prepared while the present scene continues. Its entry can depend on a later transition, opportunity, or established contact; it must not teleport people, invent a player commitment, or interrupt the current scene just to surface itself.
4. **Compose from that future-facing surface, not from private access notes or local initiatives.** Prefer the smallest compatible adjustment to the existing contracts. If storage or wire shape changes, version it and preserve old saved plans and regeneration packets.
5. **Keep guidance fictional, not instructional.** No “advance the plot,” “do not stall,” “avoid forcing,” pacing commands, private quality checks, or suggested response choreography in the packet.

This is not a request to remove all grounding. “After the current engagement, a familiar group has an upcoming undertaking” can be a useful bridge. A paragraph listing current positions, unfinished tasks, and immediate risks is not.

## 4. Strengthen progression without scripting the player's future

Audit and improve these behaviors in the same planner-to-writer path:

- **Independent ownership:** NPCs and groups have reasons to pursue, revise, complete, or abandon their own activities. The world does not need the player to initiate or approve every step.
- **Participation versus existence:** distinguish an activity developing independently from a relationship or joint undertaking that genuinely requires the player's participation. Respecting agency must not turn every possible development into a dormant invitation.
- **Substantive horizons:** intermediate and farther possibilities should involve changed relationships, knowledge, capabilities, commitments, or circumstances that enable different play. Adding “later” or repeating the first activity at a bigger scale is insufficient.
- **Premise-level breadth:** once the immediate incident is mentally removed, an open-ended RP should still have worthwhile life where the premise supports it. Incident fallout and professional duties are valid strands, but not automatic substitutes for the whole premise.
- **Stable, responsive preparation:** ordinary scene updates should not regenerate everything. Revise futures when relevant events or demonstrated interests change them; respect refusals, lost access, and closure. A declined opportunity must not return immediately in disguise.

These are selection and preparation principles, **not quotas**. Do not mandate a social subplot, a specific number of branches, a particular hobby, perpetual travel, or an interruption in every story. NPC autonomy also does not authorize marking proposed events as already completed in accepted history.

## 5. Presets: verify on the other PC, do not blindly rewrite

At the latest check, **Main - Time Duration** was active with the revised Main Instruction and User Agency prompts enabled. **Main - Single Beat** also retained the saved changes. All edited rules used `{{user}}`, not a character name.

Verify both saved presets **and the active loaded prompt text** on the other PC. Repository synchronization alone does not prove that its SillyTavern preset data is current. Refresh stale tabs and check again; do not overwrite newer user edits or unrelated provider/model settings.

The intended rules are:

> Pause only when continuing requires an unsupplied response, choice, or deliberate action from {{user}}, or resolves a contestable outcome involving them.

> NPCs may initiate, act, respond to each other, and finish appropriate actions without waiting for {{user}} to direct them. A look, pause, answer, or hypothetical opportunity to intervene is not a mandatory turn ending.

These are review references, not a complete replacement preset. Preserve protection for actual player decisions and contestable outcomes.

**Separate pacing question:** existing close-rendering and no-major-time-skip rules may still affect scene speed. Test their effect on a completed reply before changing them further. Do not silently loosen player agency or blame Tale Fairy for every slow response.

## 6. Implementation map

Paths below are relative to the repository root for portability.

| Area | Start here |
| --- | --- |
| Wider/local contracts and two-stage handoff | `extension/story-preparation.js` |
| Openings and private working-plan validation | `extension/working-plan.js` |
| Future access, selection, and packet composition | `extension/story-outlook.js` |
| Writer-facing field contracts and serialization | `extension/selected-material.js`, `extension/campaign-planner.js` |
| Packet limits | `extension/story-budget.js` |
| Preview versus actual request/reply verification | `extension/index.js`, `extension/generation-context.js` |
| Relevant regression suites | `tests/story-preparation.test.js`, `tests/story-selection.test.js`, `tests/story-breadth.test.js`, `tests/story-progression.test.js`, `tests/undertaking-lifecycle.test.js`, `tests/bounded-story.test.js` |
| Isolated production-path evaluation | `scripts/evaluate-story-life.mjs` |
| Baseline rationale and limitations | `docs/story-life-0.16.0.md` |

Read these before choosing schema changes. Prefer one coherent contract/composition fix over another stack of prompt exceptions, keyword filters, or RP-specific special cases. Do not add a routine extra model call merely to grade the existing calls.

## 7. Acceptance checks

### Automated regression coverage

- A recap cannot reach the new writer surface merely by being placed in an opening; exercise the actual host composition path, not just prompt wording.
- A legitimate future entry retains its essential access prerequisite without exposing private reasoning or becoming an immediate directive.
- Inaccessible or retired futures cannot leak through stale IDs or old routes. Proposed material remains distinct from accepted events.
- Routine updates preserve valid futures; relevant changes revise them; refusals and bounded closure work.
- Combined packet limits, the two-request normal path, shared three-request ceiling, repair behavior, and saved-plan/regeneration compatibility remain intact.
- Run the complete `npm test` suite, not only new tests.

Use deterministic tests for enforceable contracts. They cannot prove that arbitrary prose is interesting or semantically free of recap; inspect model-generated packets too. Do not substitute a keyword ban for that evaluation.

### Cross-story quality evaluation

Use synthetic or authorized isolated freezes covering a fresh journey, creative collaboration, ordinary relationship life, an incident-heavy open story, and a deliberately bounded encounter. Include more than one sample and a follow-up update, not one favorable generation.

For each actual writer packet, record:

1. What does it add beyond the existing conversation?
2. Is there a plausible entry into future play rather than a next-action recap?
3. Are intermediate and farther developments substantively different and causally connected?
4. What can NPCs pursue independently, and what truly requires player participation?
5. Does the range fit this premise without imposing unrelated variety?
6. Does it respect refusal, closure, and uncertainty without freezing the world?

Record failures, request counts, latency, and packet size. Keep private inputs and evaluation artifacts outside the repository. The isolated harness does not generate a story reply; do not present its success as end-to-end pacing proof. Any live writer test must be separately authorized and must not overwrite the user's conversation.

## 8. Delivery and boundaries

After review and authorization to implement:

1. Inspect current code and user changes; reproduce the composition leak with a generic fixture.
2. Implement the coherent boundary/progression fix and regression coverage.
3. Run cross-story evaluations and report remaining weaknesses honestly.
4. Verify the other PC's saved and active preset rules separately.
5. If publishing is authorized, synchronize the intended main/testing branches and update the installed ST extension through Git. Make manual code edits only in the main repository, not the installed extension checkout.
6. Verify the loaded browser runtime after refresh. Report **prepared**, **included in an outgoing request**, and **confirmed against a returned reply** as different evidence levels.

**Historical handoff:** the original handoff commit was documentation only. The v0.16.1 implementation and its checks are recorded separately above; no actual story reply has been generated to prove pacing.
