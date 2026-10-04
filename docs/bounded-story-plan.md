# Bounded working plan

## Active implementation

`extension/index.js` now calls `bounded-story.js`. The former `story-selection.js`
pipeline remains for legacy regression coverage and comparison, not routine host
planning. A valid first response within target uses one background request. Invalid
or oversized output gets at most one correction or best-effort shortening in the same reserved pass, with no new
scheduling mode. Existing source/transaction checks, cancellation, retry
reservation, four-reply maximum material freshness, presets and author controls
are retained. Reply counts schedule reviews; they do not advance fictional time
or determine when an arc ends.

### State and progression

- `rpUnderstanding`: bounded, provisional RP analysis, displayed in the private
  notebook and carried to the next planning pass. It is not witnessed history.
- `direction`: a compact range of experiences fitting this RP's setting,
  characters and player premise, including established departures. It is not
  today's agenda; a change of scene should not erase the wider scope. An already
  scene-bound direction is reframed from the RP basis on the next pass.
- `threads`: relevant long-running interests or relationships, not obligations
  to keep one finite undertaking open.
- `developments`: up to four arcs, side activities or emerging directions. Each
  has a stable id, NPC/world owner, concrete unfinished initiative, a question,
  a possible resolution condition, substantive follow-through and an access route.
  More than one arc can coexist; neither four slots nor an emerging slot is a quota.
- `consequences`: up to four currently relevant, witnessed results. This is not
  another continuity database. Every new/changed result needs an exact accepted
  message/span citation. Unchanged results carry only with source-verified evidence.
- `exits`: removing a previous active development is explicit. `closed` and
  `changed` require accepted-message evidence; `paused` and `dropped` withdraw a
  draft, not claim a fictional resolution. The replacement snapshot is atomic.
- `selected_material`: zero or one integrated writer packet. Only accessible
  retained developments may contribute. It supplies NPC/world action and its
  observable surface, not player decisions, ordered scenes, style or fixed endings.

An attempt to build a bridge can end while a desire to connect communities remains.
A later theatre production need not be bridge fallout. Success, failure, rest and
departure are legitimate; effective actions must not generate endless prerequisites.
These creative expectations are explicit model instructions. Code validates shape,
ownership names, access references, evidence addresses and transitions, and measures sizing targets; it
cannot determine whether a proposed arc is genuinely different or a cited sentence
actually entails the model's interpretation. Renaming a repeated plot is not
semantically prevented by an id check.

### Explicit RP understanding and canon divergence

New responses require `plan.rpUnderstanding` before opportunity planning. It has
eight fields: `basis` (original/franchise/mixed/unclear), `setting` (including era
when known), `canonIntent` (follow/flexible/alternate/unspecified/not-applicable),
`divergence` (none-established/local/major/unclear/not-applicable), `anchors`,
`departures`, `experiences`, and `uncertainty`. Canon intent describes the player's
stated preference; divergence describes established causal impact, not the number
of edits. Both canon fields are not-applicable for original worlds. Familiar names
alone do not assign a franchise. Unknown identity, chronology or preference stays
explicitly uncertain instead of becoming invented canon.

Following canon permits compatible expectations, not fixed player actions or a
guaranteed sequence of events. Local changes alter dependent opportunities while
unaffected anchors remain. Major changes invalidate incompatible prerequisites;
the planner must derive fitting alternatives rather than undo play to restore a
canon timetable. Supplied references, corrections and accepted play override
provisional model knowledge. This adds no automatic web/lorebook research and
does not verify the model's franchise knowledge. Absence of established departures
does not prove complete canon fidelity.

Analysis is part of the same provider response, not an additional analysis call.
It targets 300 serialized tokens **within**, not in addition to, the existing
1,200-token working-plan target. The complete input targets 10,000 tokens;
schema and analysis instructions are counted. `direction`, developments and
selected material must reflect the analysis. Only the selected opportunities go
to the writer; the provisional profile remains private and is not promoted to
accepted consequences. The notebook shows the interpretation and its uncertainty
as text, so it can be inspected and corrected through existing author instructions.

Working-plan storage remains version 1: old plans and archive checkpoints without
this optional saved field are valid. New outputs must include it. The next normal
pass adds it without resetting revision, ids, preparations or review coverage.
Invalid/missing analysis rejects the response transactionally; valid oversized
analysis gets best-effort shortening using the same single correction allowance.
Schema cache invalidation propagates
through all browser importers, including save/load and review validation.

Offline tests cover authored Naruto RP fixtures with no established departure,
a local mentor change, and a major alliance change despite canon-following intent;
also an original world with a familiar name, mixed/unclear analysis, normal and
corrective host commits, notebook display, persistence, and old review checkpoints.
These establish data flow and structural validation, not live-model canon accuracy
or causal interpretation. Live evaluation should use matched scenarios across
those divergence levels and inspect both analysis and generated opportunities.

### RP-tailored opportunities

The active contract starts from the kinds of experiences this particular RP
supports, with relevant past events shaping plausibility and meaning. It does not
ask for comprehensive recollection, compulsory old-plot revival, or a fixed genre
checklist. Previously unmentioned opportunities may be invented; prior enactment
and player agreement may not be invented as historical facts. Source references,
current corrections and established departures take precedence over genre or
canon assumptions.

An ordinary music-club RP can offer cake during practice, shared music or social
experiences without battles. A travelling RP can offer towns, discoveries and
appropriate interruptions without forcing travel or an interruption each reply.
Battles remain appropriate where the RP supports them, such as a martial-arts
adventure; this is not a universal slice-of-life preset.
The examples demonstrate scale and fit, not hard-coded franchise behavior. Quiet
play remains valid without restricting every future possibility to the current
activity. Invitations are legitimate when they offer something substantive rather
than repeatedly asking permission to start.

The existing development fields also describe non-problem experiences: `question`
can be what to explore; `resolution` can be when an opportunity concludes or passes.
Neither requires an obstacle, victory, reward or player commitment. The same id
must retain its specific meaning, not silently become an unrelated activity.
These are model instructions, not semantic checks that code can guarantee.

Normal and corrective requests share this contract. Offline tests exercise its
delivery and fixture passage through the host commit and writer packet; they do
not establish that a live model invents good opportunities. For live evaluation,
compare several matched runs in a music club, a travelling RP, a martial-arts RP
and a city RP with an established departure from canon. Inspect successive plans
and writer replies for RP fit, meaningful use of the past, broader scope beyond
the current activity, and preserved player choice. A peaceful opportunity can score fully. A forced
battle, fabricated past agreement, automatic travel, or recycled current chore
is a failure, even if JSON and budgets pass. No live-model evaluation was run for
this instruction update.

## Token admission

Drafting now targets 800 tokens for the complete plan and 300 for the selected
packet, leaving headroom under the existing admission limits. The requested schema
uses short field allowances, and the planner shares 1,200 prose characters across
the whole plan rather than filling every field independently. Existing wording
still uses the original compatibility bounds when validating saved or returned
state: a valid plan is not rejected merely for exceeding a drafting target.
Malformed or structurally invalid responses still cannot be committed. Token
targets alone no longer invalidate an otherwise valid response.

Before shedding optional context, the planner uses the existing lossless
span-table encoding. It removes repeated JSON labels while preserving exact text,
speaker identity and citation addresses; validation uses the untouched messages.
Source and surviving spans are not clipped. An invalid or above-target output
can trigger the one correction described below.

### Automatic output correction

The live host uses `storyPassWithRecovery`. Invalid JSON, truncated output, schema,
ownership, citation and lifecycle errors get one new response with
specific validation feedback and shorter drafting fields. It uses the same source
and validates the complete replacement. Rejected text is not clipped or partly
committed. Short correction instructions replace verbose drafting advice to make
room for feedback at the original input boundary. Diagnostic text has a bounded
token allowance. Correction input is measured with its actual schema and feedback;
optional external evidence can be omitted whole to fit, while required source and
unreviewed choices and the latest exchange stay intact. Verified reviewed context
can be omitted whole. If protected input alone cannot fit, it is sent intact with
an over-target notice rather than causing a local token-limit failure.

Valid output above the plan/packet/analysis targets receives one best-effort
shortening request. Accept the replacement only when valid and its normalized
target overrun improves. Otherwise retain the valid first result, with notices;
never erase good preparation solely because a tokenizer estimate is high. There
are still at most two provider requests per planning pass. Cancellation and
source/state/save guards apply to either chosen result.

The session persists request counts under the original reservation, checks Stop,
source/reference/settings/state identity before each send (including after the
asynchronous reservation save), and retains the existing atomic commit guards.
Concurrent clicks join the active pass; reloads do not start it again. A second
invalid response ends the pass with the previous preparation intact. Provider
authentication, rate-limit, connection and timeout failures are not treated as
invalid output and do not spend a corrective request. The UI records recovery
success/failure and refreshes the preview after background work settles.

| Component | Target / allowance | Policy |
| --- | ---: | --- |
| Total planner input | 10,000 | Complete system/schema/payload estimate; automatically fit optional context; report irreducible overruns |
| Working plan | 1,200 | Conservative count; one best-effort shortening, not token-based rejection |
| Generated selected packet | 600 | Conservative count; same shortening allowance as the plan |
| Optional external evidence | 1,000 | Include whole available records only when total input fits |
| Planner response allowance | 3,000 | Provider output setting, with the existing separate reasoning allowance |
| Entire writer context | 1,000 | Existing framing/author-note admission; withhold whole optional packet if needed |

These are conservative local estimates, not promises of exact provider billing.
User-authored instructions are preserved verbatim and may exceed the aggregate
writer limit; the UI reports that exception. Reasoning expenditure is separate.
The UI permits targets of 3,000–10,000. The former 8,000 default migrates once
to 10,000; smaller custom targets and later explicit 8,000 choices are preserved.

Routine requests contain the working plan, complete enabled source references,
recent accepted spans and optional evidence, not the archive or episode ledger.
The host reduces optional context when necessary, retaining the latest exchange and
all unreviewed player contributions. Source-compatible reviewed contributions, including the opening, may
leave that window. Source edits invalidate affected checkpoints and consequence
carry. Omission is explicitly not evidence of absence or completion.

### Review checkpoints after rewind or rebuild

If the active preparation is no longer source-compatible, the host checks complete
archived preparations for an earlier exact prefix with the same chat and reference
hash. That prefix may establish prior review coverage, not restore old proposals,
consequences or writer material. Invalid/incomplete checkpoints, changed references
and edits before the checkpoint cannot establish coverage. All subsequent player
contributions remain required and whole; the archive itself is not sent.

Rebuild is now request intent rather than an immediate reset. Only a successful
validated pass archives and replaces the current preparation; preflight, provider
and validation failures preserve it. Recovery also understands older failed resets
whose complete preparation was nested in a rebuild archive, reserving their id
revision space. Attempt recording precedes input construction, so a real local
validation failure displays zero requests rather than a previous successful request.

There is no way to fit arbitrarily large required source text or unreviewed input
losslessly into a fixed ceiling. The active planner therefore uses a soft target:
send irreducible protected input intact, report its size, and respect any actual
provider failure transactionally. There is no silent clipping or automatic paid
summarization. Archive growth no
longer raises normal prompt size; local archive storage itself is not bounded.

## Migration and compatibility

No reset is required. The next successful review receives a whole-record legacy
draft projection within 1,200 tokens. Oversized old drafts remain only in local
storage; the prompt and notebook report their omission. On success, the complete
prior preparation (excluding its already-retained archive) is appended to the
archive. On failure nothing replaces it. Legacy writer packets still authenticate
and use their existing aggregate admission until replaced.

New state contains `workingPlanVersion: 1`, `workingPlan` and source-bound
`planEvidence`. Validated compatibility mirrors serve existing writer/cache paths;
mismatched mirrors are rejected. New development ids use a host revision prefix.
Replaced working plans and transitions are local inspection material, never hidden
memory calls. Continuity Memory and other evidence providers remain optional,
read-only and unable to establish enactment merely through recall.

## Verification and quality gate

Deterministic tests cover bounded growth, migration preservation, full-snapshot
validation, witnessed closure, multiple arcs, consequence source invalidation,
unreachable selection, metadata round-trips, output overflow, cancellation and
one-call success and bounded correction behavior. Old pipeline regression tests remain in place.

Before claiming an advantage over the writer alone, run a matched comparison:

1. Use identical source, accepted starting transcript, writing preset, writer
   model, output length and user choices. Keep model/settings recorded. Never use
   the current user's live chat as a write target.
2. Compare four arms: writer only; writer plus the short static autonomy contract;
   the prior TF pipeline at commit `3cf25a6`; and the new bounded planner. A concise
   control matters: if it matches TF, additional planning is not justified.
3. Test several seeds and at least three review cycles per arm. Include a resolved
   local obstruction, a failed attempt with a surviving ambition, overlapping
   activities, refusal/departure, quiet aftermath, an independent new direction,
   and a source correction. Include deliberate one-scene closure with no sequel.
4. Use identical scripted user choices where possible. For adaptive branches,
   define the user policy first and report differences; do not cherry-pick, reroll
   weak outputs, or label unmatched trajectories as controlled evidence.
5. Blind-score actual writer continuations for concrete autonomous action, changed
   situations, payoff, natural resolution, distinct later experiences, continuity,
   repetition and agency. A hook list or a private plan alone is not a success.
   Forced player action, invented consent or reopening a resolved obstacle fails
   regardless of the total score. Quiet enjoyment may score fully.
6. Record all planner and writer calls, failures, actual input/output/reasoning
   usage, latency and total cost per accepted reply. Report every arm and failed
   trial, not only highlights. Prefer the cheaper control unless TF adds repeatable
   benefit without continuity or agency regressions.

No live-model creative comparison was run as part of this implementation. Passing
the engineering suite is not evidence that an AI will consistently advance arcs
well, nor is it a live SillyTavern UI smoke test.

### September 30 budget regression check

Three isolated calls reproduced the latest failed source boundary (404 messages)
from the current Korra chat, using the saved `gpt-6.1-sol`, Low reasoning and 0.9
temperature settings. Every call passed validation on its first response, retained
four developments and one witnessed consequence, and produced a usable writer
packet. Conservative input was 7,454/8,000 tokens; plan counts were 824, 754 and
806/1,200; selected packets were 108, 140 and 113/600. Complete writer contexts
were 328, 360 and 333/1,000. No live chat file was changed. External recall was not
included in this isolated reconstruction. Artifacts are in the local temporary
directory `tf-budget-20260930`. These checks verify budget behavior on this case,
not universal model compliance or narrative quality.

Automatic-correction regressions cover oversize plan/selection, malformed, empty
and truncated responses, schema/evidence/ownership rejection, a valid second
response, two invalid responses, exact input-budget boundaries, source changes,
Stop, disabling, chat switches, joined manual clicks and reload deduplication.
An isolated real-provider correction check injected an oversized first draft;
the correction request failed with a closed provider socket. No live correction
success is claimed for that check; its result is `recovery-result.json` in the
same temporary artifact directory. No live chat was written.

### September 30 rewind/rebuild regression check

The saved chat had an older failed rebuild wrapping a revision-50 preparation
whose 413-message source no longer matched. An archived legacy checkpoint still
matched through message 397. A read-only replay at 409 messages required over
19,000 tokens without checkpoint recovery; with recovery it admitted 7,538/8,000
estimated tokens, preserving every player contribution after that checkpoint.
This was local input admission, not a provider or live UI success. No chat, preset
or provider request was changed or sent for this check.

The full deterministic suite passes 968 tests, including long-chat rewind/edit
recovery, invalid checkpoint rejection, nested old rebuilds, revision preservation,
transactional rebuild failures, exact new-player-text retention and truthful
persisted preflight attempts.

The follow-up commit regression exposed a missing host boundary check: planning
recovered revision 51 from an archived revision 50, but the host still required
revision 1 from the reset active state. Planning and the host commit now share
the exact next-revision calculation. Fingerprint, source and competing-save
guards remain in force; arbitrary revision jumps and replays remain rejected.
The long-chat regression now runs through host commit, completed-attempt recording
and writer-packet availability instead of stopping at input admission. Commit
rejections are displayed as unsaved results, not unnecessary planning passes.
The extended suite passes 970 tests; no live provider request was made for this fix.

### October 1 soft-target regression check

The repeated overflow was not fixed by ledger compaction alone: the host still
included the first two messages after verifying their review checkpoint, while
RP-analysis instructions increased the full request overhead. Those reviewed
messages can now yield to source, the saved plan and the latest exchange. Default
ingestion targets 10,000 tokens, up from 8,000; token-only overruns no longer
prevent dispatch or invalidate otherwise valid preparation.

A read-only reconstruction of the saved 413-message chat (revision 52, verified
review through 411 messages) fitted the complete envelope to an estimated
7,719/8,000 tokens with the latest exchange, or 9,018/10,000 with an additional
exchange. Source and fresh user/assistant evidence stayed intact, including the
latest status block. These are conservative local counts, not measured provider
usage. No live chat, preset or provider request was changed or sent.

Synthetic regressions preserve this long-opening/source/plan/latest-exchange
shape without committing private RP content. Coverage includes active-tokenizer
refitting, actual-sent citation checks, input-target migration, valid-output
retention when shortening fails, and cancellation/source guards before commit.
The full deterministic suite passes 1,015 tests. Live-provider behavior and
creative quality were not evaluated by this check.

## Private progression (0.14.40)

The current bounded planner stores up to three private `workingPlan.trajectories` independently of the complete replacement local plan. Each records an NPC/world owner, basis, continuing interest, an intermediate change with a causal condition, and a distinct farther-reaching change with its condition. These are preparation, not a schedule or accepted history. The mechanism is setting-independent; it does not require a particular faction, genre, conflict, or a trajectory for a bounded vignette.

Each normal response includes `progression: { upsert, retire }`. Omitted trajectories survive unchanged in code; retirement requires an explicit id and reason. Local `trajectoryIds` links are validated against the merged state. A trajectory may remain off-scene without any local link. The same planning call interprets relevant events and revises dependencies; the runtime does not advance them on message counts or automatically declare their conditions fulfilled. Existing witness checks still govern accepted consequences.

The writer serializer is unchanged: only selected accessible story material reaches it. Private stages, conditions, links, goals and planner rationale stay out. The inspector displays private progression separately. Older saved plans remain valid and acquire it on the next normal planning pass, without a destructive migration. The 1,200-token target includes retained progression; exceeding a soft target never silently deletes it.

Deterministic regressions cover quiet scene replacement, reload, context fitting, explicit updates/retirement, ownership, links, discovery access, atomic rejection/recovery, merged capacity, historical compatibility and the writer boundary. These checks guarantee lifecycle and structural behavior, not that a model invents worthwhile long-range possibilities. Semantic breadth and causal quality still require inspecting actual model output.

Isolated checks on 2026-10-04 used the configured gpt-6-sol provider at temperature 0.8, low reasoning, with synthetic sources and the active bounded contract. Touring produced composition and changing-repertoire trajectories; a quiet follow-up retained both unchanged; a preference against public debut revised the composition trajectory while retaining the other. A closed family evening produced no trajectories. A wetland case produced hydrology and population-distribution trajectories. These are small qualitative checks, not a general quality guarantee or a test of the installed ST chat. Several drafts remained above the 1,200-token soft target after the single correction allowance (roughly 1,260–1,490 tokens); valid preparation was retained. One changed consequence needed a witness correction. The opt-in `scripts/evaluate-story-progression.mjs --live` runner uses `TF_ST_ROOT` for the read-only provider configuration and `TF_CASE=touring|closed|ecosystem`; artifacts go to a fresh temporary directory, never the live chat.
