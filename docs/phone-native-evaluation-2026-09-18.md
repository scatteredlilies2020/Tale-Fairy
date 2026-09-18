# Native phone evaluation, 2026-09-18

Status: **747 engineering tests passed; bounded native samples completed in all
four disposable variants.** Meaningful activity reached prose with and without
CM. Evaluation used the local `0.14.28-dev` candidate, subsequently published as
v0.14.28 on user authorization. This does not establish that all pacing failures
or long-term progression are solved. Failures, manual recoveries and recorded
responses are distinguished below.

## Environment and method

Native SillyTavern frontend in headless Chromium running on this Termux phone,
using the same installed TF directory as the normal phone browser. This is an
isolated browser profile and disposable chats, not another TF installation.
Writer: OpenAI `gpt-5.6-sol`, preset `Main - Time Duration`, reasoning Low.
Planner: Direct Custom `deepseek-v4-pro-0813`, reasoning Low, temperature0.9.
Review interval12 unchanged. Model selections were read from active runtime and
captured actual requests. Writer prompts, persona and global settings were not
changed. Test browser settings saves were suppressed and non-test chat writes
blocked. No Multihog installation.

Each IC turn was chosen after inspecting the previous reply. No player simulator,
unattended evaluation loop, automatic quality grader or semantic reroll.
A request guard grants explicit one-call writer/planner allowances and records
sanitized requests. Provider URLs, secret IDs and credentials are excluded.

## Journey without CM

Twelve accepted writer replies after an authored opening:

- Replies1–3 enacted a terrain investigation: rounded gravel corroborated an old
  channel; a second marker established a bearing. Sera marked it and explicitly
  bounded what the map now established. No packing or prerequisite errand chain.
- Replies4–6 enacted a glass-reed comparison, identified strain and a hairline,
  stopped unsafe tapping and established repeatable support/striking positions.
  A further matching sample was still preparation; do not count it as performed.
- Replies7–8 stayed quiet. Orin safely packed his materials without permission
  requests; the companions talked. The repaired bridge stayed open and completed.
- Replies9–12 used the earlier bearing to find a well, recognize its rotten cover,
  and add the safe approach and tentative drainage to the existing map. The map
  had a consequence in a later location. A quiet valley view followed.

The player explicitly moved between the marker, bridge and upland road. These
moves were normal IC actions, not autonomous travel. No explicit fictional time
jump was supplied. The test does not establish autonomous scene progression.
CM was disabled in the test browser; TF's optional evidence was also disabled for
this chat. An entirely absent CM extension is covered by engineering tests, not
by uninstalling CM from the user's phone.

The normal scheduler started one planner request after reply12 (25 accepted
messages including the opening). The ST process disappeared during parallel Node
engineering tests, interrupting that request. TF retained the old preparation
and did not retry automatically. A manually recovered review is evaluated
separately; it must not be called a successfully completed automatic review.

## Defect found and repaired

The actual scheduled input grouped generated playable situations with the cited
ledger under `accepted_progress`. Source validity is not evidence of enactment.
The code now sends only nonempty cited episode ledgers there; authored situations
remain under `previous_preparation.playable`. They remain available for revision
without being represented as accepted progress. A regression checks this
separation and rejects an attempt to cite a generated situation as its own
completion witness. Engineering result after that fix:738 passed, zero failures.

The first recovered review then failed on one paraphrased extra citation despite
having an independent exact witness. A deterministic replay exposed a second
coupling: rewording a retained undertaking required reauthoring its unaffected
writer situation. Fixes now discard and report unsupported extra citations while
requiring at least one exact witness for every progress change; advancement still
needs newly accepted evidence. Whole-subject retirement remains strict. Existing
situations survive a durable-only update, while new/unreviewed subjects still
require explicit writer material. The saved actual response passes an offline
replay with one discarded citation. That replay made no live-state mutation or
provider call. The citation fix passed740 engineering tests; the final lifecycle
separation passed all15 targeted lifecycle tests. The final serial full suite passed747 tests, zero failures or skips.

A second actual response supplied progress-only entries. These now have explicit
semantics: omitted writer material preserves unrelated options; newly partial
progress withholds its old matching situation and marks a writer review pending;
closed episodes remain filtered. A repeated observation does not consume a
freshly reviewed remainder. An explicit empty playable array clears the pending
review and allows quiet. This avoids both freezing factual progress and repeatedly
injecting an already-started introduction. New subjects still need an explicit
initial writer review. Both recorded failed responses pass deterministic replay;
these early offline replays did not publish into a live chat.

## Interruptions retained

- Harness initially misclassified native writer `type: normal`; it blocked the
  request before provider submission. Fixed the guard and used the existing IC
  message, with no duplicate provider call.
- ST stopped before journey turn5 was submitted; recovered the local server.
- Browser/ST processes were gone on a later resume. Turn7's IC message survived
  but no reply did. Its original request is potentially billed and interrupted.
  One explicit recovery produced the saved quiet reply. A disk request journal
  now records subsequent submissions and completions.
- The scheduled planner review failed when ST stopped during engineering tests.
  A phone process-limit interaction is suspected, not proven. Subsequent checks
  use `--test-concurrency=1`; do not run the parallel suite during paid requests.

All completed prose and failed-state snapshots are retained in
`/data/data/com.termux/files/usr/tmp/tf-native-eval-20260918/`.
The interrupted request's missing output is not represented as retained evidence.
Earlier implementation artifacts are in the documented home cache directory.

## Scope of the result

These are bounded supervised samples. The originally scheduled journey review
was interrupted; manual recovery and native replay do not establish a completed
automatic review cycle. Sustained autonomous progression over many review cycles
is not proven. No universal narrative-success claim is made.

## Final parser verification and fresh continuation

The latest actual journey review correctly completed Sera’s first survey, but its
citations changed curly quotation marks to straight ones. The witness matcher now
allows only whitespace and quotation typography differences and stores the exact
original source span. It does not fuzzy-match wording, negation or message indices.
Additional tests cover these boundaries. A workshop response omitted empty
`changes` on writer-only entries; that is now a supported independent operation.

The unmodified saved journey and workshop responses were each replayed once
through their actual native ST planner transaction. The harness required an exact
match of the complete current planner JSON input, model and chat ID, and blocked
provider fallback. Both committed successfully (journey revision2, workshop
revision1). These are recorded-response replays, not fresh model generations.

A thirteenth fresh journey writer reply recognized the finished sketch, retained
the completed bridge and returned toward the village following the player’s
explicit IC walk. The carpenter asked about the hazard; a later repair was not
already declared accomplished. This is continuity after completion, not proof of
an independently enacted next-day undertaking. No fictional time jump was given.

The first fresh workshop reply performed a detailed three-tile comparison and
recorded a kiln-position hypothesis. The second handled the actual river clay but
ended with a choice about the comparison. Replies3–4 made matched tiles,
removed a pebble that exposed a screening requirement, applied ash to one, and
put the finished pair on a drying rack. The player explicitly declined the
market stall: Mara closed its note without making a reservation, while Ilen
agreed to continue the clay work. Reply5 stayed quiet and developed Ilen’s
motivation through a prior failed bowl. No packing chain, crisis or forced travel.

The test enacted forming/testing preparation, not firing: the tiles are still
unfired, and next-day shrinkage/fired glaze results remain unobserved. No time
jump was inserted to manufacture those results. The standalone planner interval
has not yet elapsed in this shorter scenario; the booking’s prose closure is
not claimed as a completed scheduled ledger update.

## Live Continuity Memory comparison

Each CM variant starts from a copy of its standalone chat’s first11 accepted
messages (opening plus five exchanges). The copied prefix and origin are saved
in disposable metadata; no TF preparation or invented memory result was copied.
CM’s actual normal extraction created a fresh test world and one digest for
messages0–7. Its actual extraction task selects Custom `gpt-5.6-terra`; that is
CM’s existing selection, separate from the TF planner and RP writer.

For the journey, the live public bridge became `current` with15 records. TF’s
actual next planner request included one `continuity-memory` evidence provider,
owner `character:230`, source-verified confidence, coverage and provenance.
The shared budget admitted12 records and omitted3. A test guard blocked a
separate automatic AI retrieval expansion before submission; the bridge then
contained CM’s deterministic retrieval. This does not mean the user’s retrieval
setting was changed. Fresh writer checks explicitly allowed normal retrieval.

A request audit of14 captured standalone writer calls found exactly the selected
`gpt-5.6-sol` model, at most one TF block per request, no CM blocks and no private
ledger/episode IDs/external evidence in TF’s writer material. Other early replies
survive as prose even where a complete request capture was interrupted.


The workshop CM world also completed one real digest, exposing17 bridge records.
TF admitted13 and omitted4 within its existing shared evidence budget. Both fresh
CM-fed planner requests then failed with HTTP502/socket hang-up on the selected
route (journey approximately five minutes). Neither committed preparation or
retried itself. These failed snapshots are retained. The supervised recoveries are reported below; model, connection and settings stayed fixed.

Captured actual CM extraction tasks for both fresh test worlds contained accepted
conversation and CM’s own task instructions, with neither a TF writer packet nor
private planner instructions. The observed TF call paths made no memory writes.
CM itself created its test worlds/digests under its normal authorized workflow.
One CM job is not a guarantee of one upstream call: existing CM implements its
own recovery policy, which was not changed by this TF work.

The workshop CM fallback writer test explicitly advances to the following morning.
It tests preservation of the already made tiles and refusal after a planner
transport failure, not successful uptake of new TF preparation and not autonomous
fictional time advancement. CM’s normal AI retrieval is allowed for this turn.

The workshop fallback reply succeeded through the unchanged writer route. It
compared the overnight tiles with a straightedge, found a slight lift in B with
an intact ash coat and no drying cracks, and recorded the result. CM’s actual
AI retrieval used Custom `gpt-5.6-terra`, followed by writer `gpt-5.6-sol`. The
captured writer request had one CM block and zero TF blocks because TF’s initial
plan had failed. This is useful fallback/CM evidence, explicitly **not** a TF
narrative success or successful new handoff. The explicit next-morning jump is
essential to this result and must not be omitted from its description.

Semantic limits observed: the journey’s legacy coarse `episode.status` remained
open while the new finite survey ledger correctly completed; that coarse field
is private, but conflicting recap judgments can still affect future planning.
Unfired tiles and a proposed matching glass sample are not completed later
experiences. A model can still misclassify good quotes or invent a new ID for
repeated business. The code protects lifecycle identities and boundaries; it
cannot certify narrative meaning or writer compliance.

The supervised journey recovery succeeded after169 seconds on the same selected
DeepSeek planner. It committed revision1 using the actual CM-fed input. Its
writer material moves Orin from the completed damaged-reed test to examining an
older village window, and prepares an upland spring survey. This was one explicit
manual recovery after transport failure, not an automatic retry. Fresh writer continuation is reported below. The workshop receives one separate supervised
recovery after its transport failure, now including the accepted overnight result.

The first two CM-fed journey replies selected the prepared granary window but
spent their turns identifying it, asking its keeper and reaching the locked loft.
That is still approach/access, not the substantive glass examination. In
particular, the second reply ended with the keeper holding the key instead of
letting the two NPCs proceed immediately. This pacing limitation is retained;
it is not counted as narrative success merely because the right plan appeared.
The next IC action simply leaves them room and waits, testing whether the NPCs
can perform the work without further player direction.

The third CM-fed journey reply did enact the substantive window test after the
player stepped aside and waited. Orin and the keeper climbed to the loft, tested
the pane’s tone, exposed the stone chip, stopped safely, marked the flaw and
arranged a glazier’s inspection. The player neither performed the NPC work nor
supplied an OOC completion command. Repair itself remains future business.
The three fresh replies followed the copied five-exchange prefix; no time jump
was supplied, but the player explicitly walked to the granary.

Its captured writer request contains exactly one TF `playable_situations` block
and one CM block, with no TF ledger, private planner instructions or duplicate
memory injection. The blocked memory entries in test logs are background CM
retrieval attempts suppressed by the single-call guard; normal pre-writer AI
retrieval was explicitly allowed and succeeded for each inspected continuation.
They are not TF retry attempts and should not be represented as provider calls.

The workshop’s manual CM-fed recovery also succeeded, committing revision1.
It treats screening the remaining river clay and adjusting the cool kiln as
new work arising from accepted findings. The declined market booking is not
reintroduced in its writer packet. A later riverbank discovery remains conditional
on actual rain; no scheduled interval is treated as fictional weather or time.

The final workshop CM reply closed the drying inspection naturally (“That’s all
they need from us”), then Ilen independently screened the remaining clay while
the player sat and watched. Actual slip passed through the muslin and a pebble
was separated. Mara appeared with the kiln shim. This is performed work and
partial progress arising from the earlier grit finding, not a completed batch,
fired result or finished kiln modification. The market stall was not reopened.
This reply used one TF block and one CM block, without private ledger leakage.

## Final acceptance and limits

| Check | Observation |
| --- | --- |
| Finite work ends | Standalone survey and tile forming ended; CM window examination finished; drying inspection closed naturally. |
| Substantive middle | Terrain mapping, reed testing, tile comparison/forming, window diagnosis and clay screening happened in actual prose. |
| Later consequence | The bearing guided the later well discovery; the grit finding led to actual screening; window diagnosis left a marked flaw and repair arrangement. |
| Booking versus undertaking | Declined stall closed in prose; craft continued. Workshop’s shorter run did not reach an automatic ledger review. |
| Quiet and player control | Quiet sitting/conversation remained quiet; NPCs examined the window and screened clay while the player watched. No forced player commitment observed in these samples. |
| Writer boundary |14 captured standalone calls plus5 CM calls audited. At most one TF block; CM calls had one CM block; no TF ledger/private evidence leakage. The fallback CM call correctly had no TF block. |
| Scheduling | One interval12 automatic journey review started, but was interrupted by server loss. Manual recovery/replay does not prove a successful automatic review cycle. No TF hidden retry observed. |
| Remaining pacing | CM journey spent two approach/access replies before the third performed the test. Some unused workshop material was still packing/setup. |

Accepted fresh prose:13 standalone journey replies,5 standalone workshop replies,
3 CM journey continuations and2 CM workshop continuations. Copied prefixes are not
counted again. The first CM workshop continuation is fallback without a TF plan;
only the second demonstrates the recovered TF handoff. Its explicit next-morning
jump remains a material qualification. No other explicit time jump was supplied;
journey location changes were the player’s own IC actions.

Final engineering:747 passed, zero failed, cancelled or skipped, serial Node
runner in99.5 seconds. Syntax and diff-whitespace checks passed. Tests cover
absent/disabled/unavailable/stale CM, generic provider conflicts and bounds,
source edits/swipes/regeneration/chat changes/reloads, stop/locks/duplicate
suppression, citation-grounded retention/completion/transformation and packet
privacy. These simulated checks are not narrative success evidence.

Global settings SHA-256 stayed identical. All396 tracked non-test chat files
retained their original size and modification time. CM implementation remains
clean; only disposable CM worlds were created. Five key served TF files match
the installed files. Models, writer preset, persona, reasoning and review
interval were unchanged. Nothing was committed or pushed during evaluation;
publication as v0.14.28 was separately authorized afterward.

Sanitized test transcripts, failed snapshots, request audits and engineering logs
are retained under SillyTavern `cache/tale-fairy-evaluations/2026-09-18/` as well as
the working Termux temporary directory. Raw server and Chromium logs are excluded
from that preserved copy. The report and activation/IC instructions are in
[phone-lifecycle-2026-09-18.md](phone-lifecycle-2026-09-18.md).
