# Independent story development — 0.14.24

Goal opened 2026-09-18: a satisfactory independent story-development extension,
one AI request per planning pass, concise RP-dependent material, no writing-style
instructions or imposed player outcomes.

Verdict: satisfactory bounded baseline for independent contributions and review
continuity, not a guarantee of enjoyable prose or a complete campaign.

## Approach

The current scene is already the writer's job. Tale Fairy looks for worthwhile
undertakings it would otherwise miss. The planner uses a counterfactual: if the
current problem disappeared, what would still be worth doing in this RP?

It develops those undertakings before naming actors or generating contributions.
A contribution can be an offer, collaboration, outside initiative or world change,
not merely an interruption. The interesting activity and any future condition
must be in the injected text, not hidden in private follow-up notes. A new outside
actor may have work underway; established characters must not be relocated or
given invented intervening actions to support a proposal. Explicitly closed
one-scene RPs produce no extra subjects.

The wire/storage names `plot_points`, `event` and `proposed_events` remain for
compatibility. They carry concrete developing situations, not a prescribed
next-scene script. Private objectives, stakes, participation and future speculation
still do not reach the writer. No extra mode or button is introduced.

`independent-developments-v1` marks this planning scope. Existing older event
plans, including the unreleased campaign-wide attempt, are reframed once from
accepted source without their old drafts or topic IDs anchoring the response.
Their complete records are archived only after successful replacement. Failure
leaves the old plan intact. Normal later reviews preserve useful unplayed work.
An accepted opening starts an undertaking rather than completing it; moving it
into the current episode is not grounds for retirement. The counterfactual is
for choosing new subjects, not discarding the undertakings the player chose.
Established longer aims bound new possibilities; nearing a culmination should
narrow detours, not force an ending.

## Evaluation record

External artifacts: `/data/data/com.termux/files/usr/tmp/tf-independent.bvMRVX`.
Criteria were recorded before generation. This is development iteration, not a
statistical success-rate study. Isolated writing uses the previously approved
DeepSeek substitute and frozen presets, not the live OpenAI writer. Runtime
World Info and Continuity are not reproduced. Live RP and settings stay untouched.

The initial revision generated more independent material, but was not accepted:
it invented intervening actions for established NPCs and added minor projects to
a deliberately closed dinner. Subsequent instructions address those failures.
The closed-scene retest returns no developments.

### Actual uptake

- Touring: after an explicit several-day travel transition, the proposed roadworks
  became a working site with a crew, a surveyor and an available stop along the
  journey. This was independent of the drum repair. Continued conversation was
  slow and sometimes repeated an already answered question; that is not counted
  as fast progress or solved writing behavior.
- Touring, six-week transition: a separate fork reached the already-established
  Beckshaw fair. The proposed permanent theatre appeared, and the player could
  bring their established carpentry skill into a concrete stage-design discussion.
  Neither the journey nor the offer to help was assigned by the injection: those
  were explicit evaluation-player choices responding to accepted prose.
- Town simulation: the injected island trader requested rudders; the player
  examined the sketches, accepted the commission and island fitting, then took
  the sketches to Mira. Terms were settled and design work began. This created a
  working undertaking and a later destination beyond the original invoice issue.
  The boats are not finished; their eventual performance is untested.

The touring transition comparison had identical prompts after removing TF and
normalizing whitespace. Its control offered a wharf and alternative routes—also
reasonable exploration. The TF run supplied the planned roadworks; this pair does
not prove universal improvement. The town control gave a waterfront walk and
familiar errands, whereas TF introduced the distinct commission. Single stochastic
pairs do not establish a success rate or prove the control could never create
similar material later.

These time jumps test whether prepared developments remain usable in later
phases. They are not six weeks of continuously simulated play. The first touring
reply still concentrated on local music, which was not treated as a failure to
force immediate uptake of distant material.

### Review continuity

Touring's later review retained all three original subjects. It advanced road
construction to usable access, developed the theatre's later bookings and added
concrete arrangements for the musicians' gathering. No replay of the drum repair.

The first town review incorrectly retired the commission merely because it had
entered current play. This was a quality failure despite valid JSON. The revised
review rule explicitly forbids that reasoning. A new isolated review of the same
accepted prefix and original preparation retained the commission under its old
ID, advanced the island fitting and possible later orders, and preserved the
unplayed gathering and hull trial. The failed-quality review remains recorded;
it was not silently replaced.

### Limits and verification

The current historical RP produced independent proposals, but its writer request
returned HTTP 400 with no generated reply. One explicit diagnostic retry of the
unchanged request established provider content rejection. Further retries stopped;
the prompt was not changed to evade the filter. Uptake for that new plan remains
unverified on the user's live writer.

The complete development run made 10 planner requests and 13 writer requests;
11 writer replies completed and two were rejected as described above. Every
planning pass used exactly one request; no runtime critic, repair, reroll or extra
planning stage was added. Iterations are separate recorded development revisions,
not a batch from which only attractive outputs were reported. The final long-term
aim/culmination reminder was added after those model runs and has offline contract
coverage, not a separate finale-model test.

688 offline tests cover integration, privacy, one-call execution, failure safety,
archive preservation, scope upgrades and continued review. Model behavior is not
semantically guaranteed by those tests. Private text can still be wordy; the
writer can still introduce needless hesitation or suspicion. No preset or prose
instruction was changed to conceal those limitations. Franchise compatibility
remains a source-priority rule, not a new factual lore-verification service.

Live chat and settings hashes stayed unchanged. Test transcripts remain outside
the repository. Reload to use the ordinary planner path; no separate control is
needed. Publication is separate from the isolated evaluation; no live RP data is included.
