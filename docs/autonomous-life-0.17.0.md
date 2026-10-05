# Autonomous continuing life (0.17.0)

## Intent

Prepare a life that keeps offering fitting experiences without requiring the player to direct the plot. Arcs can start, develop and finish; ordinary episodes and familiar routines can coexist with them. Ending an episode does not end an open RP. Only explicit user intent makes the overall story bounded; the planner must not infer boredom or manufacture a finale.

New beginnings need no causal or topical connection to today's conversation. A workshop counterfactual asks what would belong in this RP if the current topic disappeared. Ideas derive from references, character interests and independent lives, not a hardcoded antagonist, travel, performance, or quest template. Recurrence with small changes is valid; escalation and novelty are not requirements. User refusals still matter.

## Production mechanism

The existing two-stage transaction remains: a wider workshop prepares up to three trajectories; a scene selector renews accessible openings without rewriting that horizon. A trajectory now labels its relationship to present play as `independent`, `continuation`, or `recurrence`. Labels are descriptive, not quotas or proof of creative independence. An optional throughline can organize an arc without making all activities serve it.

The selector additionally reviews **one pending NPC/world initiative**. The host, not a provider-authored writer packet, projects its public `prerequisite` and `action` into `next_world_initiative` alongside selected future entries. This gives the writer concrete activity to introduce, rather than only distant possibilities. It does not add pacing commands, player actions, hidden motives or planning evidence. An initiative can stand alone without selected mid/long-term outlook: ordinary life needs no larger plot.

Lifecycle:

- `keep`: retain the same unintroduced action and renew its opening.
- `replace`: revise its conditions/action or choose another move. Changed subjects need new revision-prefixed IDs.
- `withdraw`: remove an unsuitable or refused move; this is not an event.
- `introduced`: acknowledge the previous action entering actual play, with exact newly accepted message spans, and optionally select a new move. Introduction does not finish its trajectory or arc.

Host checks require a retained substantive trajectory, a public accessible opening, matching NPC/world owner, and no player-owned action. Only introduction can supply event evidence. Witnesses must exist in the actual transport prompt, including after input compaction, and resolve against accepted messages. A bounded private receipt distinguishes introduction from withdrawal. Retired IDs cannot immediately restart; normal revision prefixes prevent historical ID reuse. This is not an expanding world-history database.

Semantic safeguards still require model judgment: the host cannot prove that prose is genuinely independent, that cited text actually describes the intended encounter, or that an action hides no player decision. Exact-span validation prevents invented/unsupplied citations, not every possible misinterpretation.

## Compatibility and cost

No third planning agent, extra routine request, reply-count schedule, manual approval, or manual revision step. A normal review remains two calls with one shared repair credit (three maximum); failed reviews commit nothing. Writer material retains the 1,000-token envelope. The background review and source-valid packet persistence remain in place. Until a successful review acknowledges introduction, the last packet can remain present; newer conversation and authored conditions must prevent replay.

Old saves remain readable without initiative or connection fields. New workshop upserts require the connection label; new scene responses require the initiative review. Historical writer serialization stays unchanged when no initiative exists. Source/reference invalidation, accepted-prefix regeneration and legacy packet lifetimes remain unchanged. Version and transitive module cache keys are updated for browser reloads.

The development panel distinguishes a selected proposal from the latest acknowledged introduction/withdrawal. Its receipt and selection reasoning never enter the writer payload.

## Verification and limitations

Deterministic tests cover selected action projection, save/load, initiative-only ordinary episodes, pending retention, witnessed introduction, repeated activities, withdrawal, private-data exclusion, invalid owners/routes/IDs, shared repair limits, atomic failures, and evidence removed by transport compaction. A mocked writer-in-the-loop test verifies that generated prose reaches the next planner input and changes the selected handoff. Existing browser tests cover automatic background review and source/swipe lifecycles.

These prove mechanisms, **not satisfying autonomous storytelling**. No live model evaluation was run for this change. The optional harness below records actual prose for inspection; passing a schema or producing a future-looking plan is not a creative-quality result.

Verified locally on 2026-10-05 with Node 24.19.0: **1,214/1,214 tests passed**, including transitive cache invalidation and browser packet persistence with the new initiative. All 25 changed/new JavaScript modules passed syntax checks, `git diff --check` passed, and the isolated harness dry-run completed without provider calls. The untouched backup baseline passed 1,188 tests under the same runtime. The default Node 18 environment has pre-existing browser/crypto test failures, so it was not used to judge this change.

## Optional isolated writer-loop comparison

Use a modern Node runtime (verified here with Node 24). From the repository directory, dry-run without reading credentials or sending provider calls:

```powershell
$env:TF_EVAL_OUTPUT = Join-Path $env:TEMP 'tale-fairy-life-eval'
$env:TF_TURNS = '6'
node scripts/evaluate-autonomous-life.mjs
```

For an explicitly chosen live run, set `TF_ST_ROOT` to the local SillyTavern installation and add `--live`. It uses the existing read-only custom-provider adapter and configured credential; never paste a key into commands. `TF_CASE` optionally selects `journey` or `music`. Output must be outside both the repository and SillyTavern directories. Artifacts include synthetic conversation and provider/model metadata; keep them private if necessary.

Each case compares writer-only and Tale-Fairy-assisted continuations. Actual generated replies feed back into subsequent planning. Synthetic user turns observe without inventing plots; each assisted turn reviews with at most three planner calls. The maximum is five provider calls per turn per case across both arms (60 for two cases at six turns). Live runs spend provider usage. Truncated writer prose is rejected rather than accepted as history.

This harness uses the configured planner model as a **substitute writer** with a fixed minimal preset, not the user's actual SillyTavern writing preset or live chat. References are static and user behavior is passive; neither an automatic quality score nor a reproduction of real user play. Inspect both arms for observable independent activity, repeated offers/staging, player-agency violations, coherent conditions, actual recurring experiences, and episode completion followed by continuing life. Longer runs with the real writer/preset are still needed before claiming reliable arc quality.
