# Event opportunities: event-only testing baseline

Status: **Independent-development baseline tested in 0.14.24.**
See the [independent-development evaluation](independent-development-0.14.24.md)
for the current goal, uptake checks and limits. The earlier
[campaign-scope attempt](campaign-scope-0.14.24.md) was insufficient; neither that
attempt nor the historical acceptance checks below establish full-campaign quality.
Continued fantasy and touring play now demonstrate event uptake and useful
cross-review continuity. Divergence from exact proposals remains expected: the
writer adapts them to accepted play. This is not a claim that every writer reply
or a full campaign is satisfactory. Live activation/rendering remains unverified.
See the extended acceptance section for current evidence; older sections record
previous revisions and their failures.

The user reopened the goal: materially reduce recycled hooks, setup and routine
logistics in favour of satisfactory creative mid-to-long-term events. The earlier
`plot-points-v1.md` verdict is historical, not proof this goal is complete.

## Contract and integration

The normal planner now uses `event-planning.js`. It makes one model
request per planning pass. Each subject has an NPC/world initiative, one or two
`{event, opens}` opportunities, continuing development, stakes and open player
participation. An event is a possible situation; `opens` is what it could make
possible, not a required outcome, lesson, next action or scheduled scene.

Old essay-shaped plans are reframed once from accepted source and their draft
objectives, without replaying their long prose as the writing template. Existing
IDs must be updated or explicitly retired; successful replacement archives the
old complete records. Overlapping subjects can be consolidated through the
existing evidenced supersession operation. On later reviews, complete structured
opportunities are supplied and useful unplayed subjects survive by omission.

For records marked `event-opportunities-v1`, canonical `premise` now holds a
typed array, with the same one-or-two-pair, 800-character event/opens safety limits as
the model's declared schema. There is no additional hidden legacy text limit.
Event initiative owners allow 320 characters; legacy owners retain their
160-character limit. An early event prototype's JSON-encoded array remains
readable. Other fields retain their existing mapping. The inspector shows
readable event/opens pairs. Invalid metadata is not injected. V1 records retain
their existing reader; they are never silently interpreted as event arrays.

The event-mode writer packet contains only `proposed_events`: event strings.
Follow-on possibilities (`opens`), objectives, stakes, closure state and review
notes stay in planner storage. An event must contain the encounter itself, not
just its setup. This prevents private planning about choices or character lessons
from leaking through the follow-on field.
TF adds no prose, pacing or player-handling instructions. Explicit author notes
remain verbatim under `author_instructions`. No events means no filler injection.
This is deterministic projection of one response, not another AI stage.

The planner now uses short instructions and requests one sentence per text field.
Events follow the current activity and larger objective, with scale tied to
progress and setting. Connected events may form a loose sequence; every subject
does not need an independent subplot. This applies across RP and simulations,
without genre-specific code. Campaign direction follows the RP premise, rather
than extending the latest local problem across the whole story. Current live
checks are recorded separately below; older samples used previous wording.

RP canon takes precedence over franchise canon. Franchise lore fills gaps only
where compatible with the RP's era, rules and characters. The planner proposes
canon-adjacent events without forcing the original plot, importing another
continuity or relying on uncertain lore. This rule stays in planning, not in the
event injection. Tests verify that original settings and franchise divergences
reach the single call unchanged; they do not prove model compliance.

Source-prefix checks, append-lag usability, edited-source invalidation, cross-tab
attempt ownership, Stop, one-shot transport and raw author instructions remain.
No classifier, critic, editor, staging or automatic repair stage was added.

## Development evidence

Artifacts live outside SillyTavern under `/data/data/com.termux/files/usr/tmp/tf-event-fix.PVN2xN`.
The first event-format check accepted touring in one call. Fantasy failed an
over-tight per-field character limit despite fitting the overall record budget;
its original response remains rejected and recorded. Individual event/opens
limits were adjusted to 500 while retaining the 1600 combined cap. The same
revision strengthened independent sources of interest and permitted consolidation
of overlapping draft objectives.

Both `real-diverse/001-planner` and `touring-diverse/001-planner` then passed in
one call each (61.4 and 56.1 seconds), from the same accepted starting histories.
These are explicitly versioned development checks, not hidden retries inside
one production pass. The original saved planner settings are used.

The fantasy plan includes seasonal grazing/expedition pressures, reputation and
portrait opportunities, and a household charm trade facing claims and licensing.
The touring plan separates private musical work from the wider performance trade,
including another travelling family proposing shared roads and bills. Some local
details remain; the criterion is whether they support worthwhile developing play,
not whether every sentence is novel or every objective completes immediately.

RP continuations use the approved DeepSeek substitute writer, the saved writer
preset and unchanged live settings. They are isolated branches, never live chat
edits. Live World Info/Continuity retrieval and rendered-browser behaviour are
not reproduced by the harness. Final narrative assessment is pending.

Each branch then made five writer continuations without refreshing its event
preparation. Fantasy realized the courier-sheet opportunity, a comic supper
exchange and a choice not to correct the story, followed by examining the old
report. Touring established the flooded ford but remained overly granular around
lodging. Mid-check writer-packet changes are recorded in the saved protocol files:
the later packet removes stale scene/campaign framing and delegates NPC-owned
arrangements; the subsequent material-only packet also omits the review commentary
and repeated participation menus. These are not identical-packet A/B controls.

The ordinary source-79 touring review succeeded in one call (37.6 seconds),
retaining broader opportunities and adding relevant material for the waiting day.
The source-428 fantasy review failed in transport after 101.7 seconds; no new
preparation was installed and no automatic retry was made. The last valid plan
remains usable across accepted appends. Further fantasy play completed the copies,
advanced through the night, and began the player's chosen north-road journey.
Touring's waiting-day continuation still lingered on rhythm, glances and private
insight rather than an actual shared performance.

Three isolated writer-preset diagnostics (unchanged control, a loosened CURRENT/
HELD line, and removal of the required Psyche template line) did not establish a
clear cure. No live preset was changed, and those diagnostic outputs are not
production-equivalent success evidence. Stronger connected NPC follow-through
instructions alone also did not turn the next touring continuation into a shared
event. This is why subsequent planning explicitly asks for externally observable
interactions, not private realizations or tentative gestures.

`real-playable/001-planner` and `touring-playable/001-planner` each made one live
request (37.5 and 29.6 seconds). Their raw outputs exposed two storage mismatches:
the hidden 1600-character aggregate cap and a too-short initiative-owner bound.
The typed-storage fix accepts both unchanged responses in separately recorded
`002-validation` runs with **zero AI calls**; original failures remain recorded.
Maximum-boundary tests verify that everything allowed by the event schema fits
canonical storage and round-trips, without trimming or inventing output content.

The earlier 369-message source preflight preserves 186 whole messages, including
all 184 player contributions, at 15,824 estimated input tokens with static source
and production historical extraction, within the saved 16,000 budget. No budget
setting or player text changed. Live world-book additions can still cause an
honest pre-request budget failure; source is not silently cut to avoid it.

At that revision, the code suite passed 673 tests, including event-only injection,
RP source preservation and host integration. Later revisions are recorded below.
The `003`, `004` and `006` playable writer runs use the unchanged frozen preset:
fantasy meets the shepherd, hears his account and chooses to continue; touring
advances the waiting day, discusses Jo's discovery, and enters the ford. The ford
then develops into an actual complication: a damaged trunk opens and a valued
mask falls into the current. This is substantive event uptake, not just a promise
of future play, but fantasy still spends extra replies on warnings and route
choices. These bounded samples do not establish that all pacing weaknesses are
gone or that all subjects will be taken up.

The user changed the live writer route during checks (the frozen prompt text
remained identical). Both `005-writer` attempts stopped before a model request,
with zero calls, because the saved-writer diagnostic guarded that route. Substitute
tests now prepare prompts independently of the live writer credentials, retaining
the approved DeepSeek model and frozen preset. The direct saved-writer diagnostic
still enforces its connection guard. No live setting was changed by these scripts;
settings hashes therefore differ across the externally changed snapshots and must
not be described as globally unchanged.

## Focused review fix

The first post-event review rewrote all four fantasy subjects and pulled the
independent charm trade back into the plateau mystery. Touring's first review
also included an unused `id_note: null` annotation; only undeclared empty strings
and null annotations are now ignored deterministically. Required fields and
nonempty extras remain strict. Its unchanged raw response passed offline with
zero further calls, with the original failure preserved.

The host now explicitly supplies the accepted review boundary and the indices
being reviewed for the first time. Older evidence and complete retained designs
remain available. The instruction is to change affected subjects, retain useful
unplayed opportunities, and avoid dragging independent interests into the local
mystery. An edited or otherwise incompatible source resets the boundary to zero.
Host tests exercise both append and edit cases. A separate source rule asks for
conditional branches when a player's pending action has no accepted outcome.

`real-delta` and `touring-delta` are explicitly versioned development branches
from the earlier plans, not silent retries of the previous production pass.
Fantasy emitted updates to two subjects, retaining the independent reputation
and charm-trade designs unchanged. Touring updated three affected subjects and
retained the wider-performance trade. Both made one model call (65.2 and 60.5
seconds). Fantasy's otherwise complete response exceeded the old 500-character
field cap by 27–33 characters; an 800-character safety cap now accommodates that
ordinary variation without trimming content. The response passed unchanged in a
zero-call offline validation. The schema still asks for 1–2 concise sentences,
and oversized/truncated responses still fail without a repair call.

Narrative limitations remain: later touring replies stretched the mask recovery
without resolving it, and fantasy added another warning/tally before advancing
through the day's journey. These are not evidence of satisfactory follow-through
in every scene. The goal is not marked complete on the strength of code tests or
better planning notes alone. The evaluated source save still had planner contract
14 at that deployment; that revision required a browser reload and the
“Try single-pass plot planning” action. This opt-in requirement was subsequently
removed in 0.14.23. No isolated output is written into live RP.

## Event-only revision: September 18

Current artifacts: `/data/data/com.termux/files/usr/tmp/tf-event-only-eval.ij4aeY`.
The initial live checks found forced player choices and character lessons in
`opens`, even after global writer instructions were removed. The writer now gets
only event strings. Private planning remains stored losslessly. Tests explicitly
verify that forced choices and lessons in `opens` do not reach the writer.

The planner anchors campaign direction in the RP premise and prepares beyond
the current episode. It excludes invented restrictions that negate established
abilities. Reviews now receive the saved campaign and episode alongside retained
subjects; these were previously missing from the event review input.

The explicitly versioned `fantasy-v3/001-planner` and `touring-v3/001-planner`
checks each succeeded in one call (34.7 and 37.9 seconds). Fantasy's four event
proposals cover the local counter, a demon scout, an unusual spell encounter and
consequences for freed captives. Touring covers a ford repair, a competing venue,
conflicting tune versions, a future musicians' gathering and a drum-repair bargain.
These are not guaranteed scenes or endings. Unlike the earlier fantasy revision,
the plan does not make every subject part of the local trafficking network.

Each branch continues through ordinary player replies with the same approved
substitute writer and frozen preset. All guidance is verified in outgoing
requests; no live chat or writer settings are changed. Touring's third run
realizes the proposed stone-repair crew and blocked crossing. Fantasy's third
run reaches the town but has not yet realized the abandoned counter. This is
bounded uptake evidence, not proof of consistent pacing or full-campaign quality.

The fourth touring run completes the crossing, damages the drum, performs the
ballad-seller's disputed version in the inn, and introduces the gathering handbill
and occupied market pitch. No fresh plan was needed between these continuations.
The fourth fantasy run instead invents an occupied doorway and suspicion: it
does not realize the proposed abandoned counter. That divergence is preserved as
a limitation, not relabeled as successful uptake. The extension supplies events;
it does not enforce them or alter the writer's pacing.

The current suite passes **674 tests**. The planner instruction is 376 words
(formerly 607); event injections have no TF-authored style or agency boilerplate.

Both fifth-run reviews succeeded in one request each (62.5 and 62.4 seconds),
within the unchanged 16,000 input budget. They kept the same four subject IDs.
Fantasy adapted the counter to accepted play while preserving the spell, scout
and witness threads. Touring removed the completed crossing from proposed events,
advanced the market and tune material, and preserved the later harper and
drum-repair offers. Both models returned all four subjects, so this is preservation
of useful direction and opportunities, not evidence of minimal-delta output.
Follow-on fields still contain occasional forced-choice language; deterministic
event-only projection keeps that language out of the writer packet. Event text
itself remains model-generated and cannot be guaranteed compliant in every run.

One cold-start check from a longer 432-message fantasy prefix failed before any
request because protected source did not fit the saved input budget. Its report
is retained; no source was silently removed and no budget setting was increased.
Versioned checks use the original 369-message source and keep earlier failures.

## Extended acceptance check

Artifacts: `/data/data/com.termux/files/usr/tmp/tf-satisfactory.WB8SSG`.
Criteria were recorded before generation in `assessment.md`: meaningful uptake
over several turns, useful future retention, no repeated completed setup, RP scope,
event-only injection and one request per planning pass. No model/preset change,
live RP edit, automatic repair, or concealed reroll was used.

Fantasy continued from the prior reviewed state rather than receiving a fresh
plan. Its first continuation realized the proposed weighted door cord, hatch and
counterman's escape. The matched no-TF control, with the same source, player reply,
model and preset, continued questioning at the door instead. This is one sampled
comparison, not statistical proof. The next reply developed the recovered ledger
into old-town shipment records. The subsequent one-call review updated only the
counter subject and retained all three other subjects exactly, including the
independent spell encounter.

Touring continued the ballad dispute and reached the drum-maker's proposed offer:
seven pence for repair, or five with a public demonstration. The player supplied
ordinary questions, not the bargain. Its next review exposed a failure: completed
dialogue and the repair quote were repeated as proposed events. The review rule
now explicitly moves enacted events into private development and reserves event
for unplayed material. `touring-review-v2` tests this change from the same accepted
prefix and pre-review state; the failed earlier review is preserved.

A separate closed family-dinner case respected its one-evening scope but padded
four subjects with gestures and props assigned goals. The planner now says four
is a ceiling, allows one or none for bounded scenes, and groups encounter steps.
The versioned `closed-v2` check produced one NPC-owned dinner encounter without
an outside crisis or sequel. Private follow-on planning now asks for later NPC/
world action, not forced player dilemmas.

The suite now includes a multi-review regression: replacing a consumed event
preserves an omitted later opportunity and does not re-inject the archived event.
The planner remains below the earlier 607-word instruction.

The versioned review removed the completed seller explanation, bill explanation
and repair quote from injections while retaining the harper and next-town bill.
Its private development still overstated an unplayed Cassmere performance as
completed. The final rule therefore explicitly says only accepted messages prove
enactment or commitments; previous preparation, including development, is not
evidence. This is a semantic instruction, not a deterministic factual guarantee.

The next writer continuation accepted Sef's NPC-owned choice of the full-price
repair without a public-performance obligation, and realized the maker listening
to the town band. It did not replay the bargain or force Sef into the discounted
performance. The original writer preset remained unchanged. Final review of that
accepted decision is recorded in `touring-review-v2/003-planner`.

That final review succeeded in one call and preserved the paid seven-pence repair
with no public-performance obligation. Its next drum event is a different NPC
handling the instrument on Thursday, not a replay of the offer or a demand that
Sef accept it. The six-week Beckshaw direction and future travelling guest remain.
This meets the practical acceptance bar: injections affect ongoing play, choices
change subsequent planning, and later interests survive local developments.

**675 tests pass.** All six planning runs in this extended check made exactly one
request each; there were seven separate writer requests including the no-TF
control. Failures remain in the record. The two versioned checks changed code,
not player text. Final planner instruction: 429 words.

Limits: this is a bounded test using the approved substitute writer, not a full
campaign or a guarantee of canon accuracy. Model-generated private prose can
still overstate circumstances, and reviews can replace unplayed details while
preserving their broader subject. Neither private prose nor a proposed event is
accepted canon. The implementation does not enforce writer uptake or modify the
writer's pacing/style; live rendered activation remains unverified.

## Deployment

The updated files are installed in the local Tale Fairy extension. Existing
writer settings and live chat contents were not edited. The previous extension
is recoverable from `/data/data/com.termux/files/usr/tmp/tf-before-event-opportunities.DLIQz0/Tale-Fairy`.
Version 0.14.23 removes the separate activation button. The live host loads the
single-pass planner for both new and existing chats, including startup, generation
events, normal Guide now / Re-evaluate, author instructions and Full rebuild.
The compatibility state reader remains for archives and diagnostic tools, not as
a selectable live planner. Automatic migration preserves the old notebook and
notes, and is persisted before the first planning request. Failed first passes
leave the backup intact and do not restore legacy writer guidance.

Reload the browser to load the new versioned entry, state module and settings
template. No separate mode selection or additional server-plugin restart is
required. Disabled or chatless startup does not write migration metadata or send
a request. Host tests cover default startup, normal controls, failed migration,
reload suppression and notebook preservation; visual browser rendering has not
been checked in this environment. The 0.14.23 suite passes **683 tests**, including
Stop/chat-switch races during migration and fresh/reset-chat defaults.
