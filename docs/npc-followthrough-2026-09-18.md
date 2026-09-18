# NPC-owned follow-through, 2026-09-18

**Follow-up:** the owner-name binding described below caused false planner failures
and is removed by the [validation fix](planner-owner-validation-fix-2026-09-18.md).
The release observations below are retained as historical evaluation evidence.

Release `0.14.29` follows `fbb36c6` / v0.14.28. The user authorized publication
after the local candidate was implemented and tested. It uses the existing installed extension, not a second
extension or separate runtime mode.

## Diagnosis

The v0.14.28 live RP receipt proved TF supplied the pump-side contact, and the
writer reproduced it. Its supplied situation ended at leaving a note. The reply
then stopped before the NPC read it. The player was elsewhere and could not
react to that NPC-only decision. Successful injection and introduction did not
establish successful play. The user wants to see other characters act over a
few turns, without needing to supervise their every step with Continue.

## Implementation

Every newly authored playable situation now requires a resolution: the owner of
the remaining activity and a concrete endpoint. NPC-owned activity names its NPC
actors and supplies their finite result and immediate consequence or an already
established return/contact. Player-owned endpoints describe an unresolved player
decision; they never authorize the planner to supply its answer. World events
have a physical result without pretending an NPC owns them.

The actual writer packet now carries either `npc_resolution` (named actors and
proposed result), `player_decision`, or `world_result`, beside the existing
applicability condition and situation. This material is produced by the real
schema, validator, storage merge and writer serializer. It is not a private
instruction that disappears before the writer request. A newly authored start
without an endpoint fails the single transaction; no repair call is made.
Known player names cannot be listed as autonomous NPC actors. NPC-owned undertaking
results must name a declared owner in both the actor list and endpoint; a messenger
finishing delivery cannot stand in for that owner. This checks naming, not full
semantic completion. Schema fields for
writing style, paragraph limits or turn quotas are rejected.

Saved v0.14.28 situations remain readable. The next normal or manual review asks
for their resolution, without resetting subject IDs, archives or accepted
progress. Progress-only updates can still close an old episode without being
forced to author a sequel. Existing material is preserved if a request fails.
No generated endpoint becomes accepted progress or a memory fact. The existing
source, stop, branch, lock and finite-episode guards remain in force.

The private planner prompt asks for a bounded NPC activity rather than an entry
hook alone. No generic prose or pacing instruction is added to the writer packet.
The RP writer preset, model, persona and reasoning are unchanged. There is no
per-turn planner call, automatic time jump, or changed review interval.

## Engineering

755 tests passed, zero failures, cancellations or skips, serial Node runner in
51.6 seconds. Eight new regressions cover incomplete handoffs, ownership,
player decisions, world events, persistence/legacy updates, separation from
accepted evidence, and rejection of additional style/turn-quota schema fields.
Existing host tests verify the expanded packet through the real generation path.
After finalizing the release version, all 60 browser/integration checks passed
again; no additional paid generation was run.

## Native evaluation method

One disposable `TF Test 0918 - NPC Follow-through` chat in the phone's actual ST
frontend, with the existing selected writer and planner connections. CM is off
only in the isolated test browser; the global setting is unchanged. An authored
opening establishes that the player waits at a harbor office while two adult
couriers return with a completed delivery tally. An explicitly authored legacy
preparation offers a ferry notice at a pump, ending at the signal, to reproduce
the missing-endpoint shape. Neither fixture is claimed as model output.
The legacy preparation is validated against the actual test chat source before
a normal Guide review. All provider output is retained. The failed first contract
and the subsequent implementation iteration are disclosed below.

The predeclared test bound is three writer replies, individually inspected, with
any Continue inputs disclosed. A complete NPC result matters; merely reproducing
the signal does not pass. No OOC closure command or artificial time jump is used.

The first fresh planner request failed on the selected route with HTTP502 /
response-body aborted after roughly three minutes. No model output was available
to validate; revision1 and its authored legacy preparation were retained. One
explicit supervised transport recovery succeeded, but its proposed endpoint only
completed the messenger Mara's delivery, leaving Lena and Ivo unresolved. That is
a semantic failure, not narrative success. No writer call used this proposal.
The ownership binding check and its regression were then implemented. One fresh
evaluation resets only the disposable future preparation to the same legacy
fixture; accepted opening, models and settings stay the same. This is a disclosed
code iteration, not a hidden retry.

During the test-page reload the CDP startup guard did not persist. The page briefly
opened the ongoing chat and changed its TF attempt marker and global runtime
diagnostics. Comparison with the pre-test backup confirmed identical story
messages and preparation; those metadata changes were restored. No unacknowledged
server job remained. A foreground planner request before navigation cancelled it
cannot be excluded because that brief unguarded interval was not captured. No
writer generation was requested there. The guard was reinstalled before continuing
the disposable evaluation. The remaining global settings change is only the new
test card's tag-map entry. This isolation failure is retained in the local evidence.

## Observed native result

The revised planner request succeeded in 109 seconds. Its packet included Lena
and Ivo reading the notice, carrying it back, and reporting the correction and
warning. The first actual writer reply (47 seconds) enacted the entire encounter:
Mara delivered the notice, Lena read it, Ivo discussed it, the couriers returned
to the harbor office, and Lena reported the warning alongside the completed tally.
The player was not assigned an action, feeling, consent or new knowledge.

One literal **Continue** input produced one writer reply. No second continuation
was needed for this activity. No time jump or scene-transition command was
supplied. This is a pass for the bounded NPC encounter, not a broad pacing claim.
The paid sample stopped there. Later landing repair remains proposed and untested.

Actual selected models were planner `deepseek-v4-pro-0813` (Direct Custom) and
writer `gpt-5.6-sol` (OpenAI), both reasoning low. Writer preset remained
`Main - Time Duration`; planner temperature remained 0.9 and review interval 12.
The captured writer request contained exactly one TF packet, no private review
IDs or ledger, and no CM block. The prompt/persona hashes and configuration match
the pre-generation capture. No additional planner or memory call occurred during
that writer turn. Episode ledgers remained empty until a later evidence review;
the proposed outcome was not recorded as a fact just because it was generated.

Evidence is retained locally under SillyTavern's ignored cache directory:
`cache/tale-fairy-evaluations/2026-09-18-npc-followthrough/`. It includes the failed
planner response, revised response, captured writer request and prose, suite log,
isolation incident and restoration checks. No ongoing-RP transcript is committed.

## Activation and interactive check

The actual installed extension and existing development checkout contain the same
release changes. Start SillyTavern when ready and refresh the phone page to load
`0.14.29`; this is
the same extension, not a second installation. Use **Guide now** once to review an
older saved preparation now, or allow its normal scheduled review. The interval
still schedules planning; it does not delay already prepared NPC activity.

The disposable character **TF Test 0918 - NPC Follow-through** contains the
observed result. A natural follow-up is: “Thanks. Which landing should we use
until that plank is repaired?” It gives the player something to respond to after
the NPCs finish their own activity. It does not request a time jump or closure.
No new writer rule, style preset, camera instruction or reply quota was added.
Publication targets both repository branches, `main` and `testing`, at the same
commit. The user requested shutdown of agent-started SillyTavern processes; the
server and isolated test browser were stopped and remain off during publication.
The native sample above ran the identical behavior as `0.14.29-dev`; the final
release change only removes the development suffix and updates this report.

## Limits

This native increment tested standalone TF only. Existing CM/provider engineering
regressions passed, but CM was not rerun live for this increment. There is no
paired old-version writer run controlling for generation randomness.

This affects TF-authored situations. It cannot guarantee a fixed number of writer
replies without imposing a pacing rule. Actor identity and the meaning of an
endpoint remain model judgments beyond the exact known-name checks. A player
alias omitted from the supplied identity list cannot be mechanically recognized.
It does not provide a hidden simulation or make proposed events canonical.
