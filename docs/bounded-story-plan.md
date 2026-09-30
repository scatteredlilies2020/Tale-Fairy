# Bounded working plan

## Active implementation

`extension/index.js` now calls `bounded-story.js`. The former `story-selection.js`
pipeline remains for legacy regression coverage and comparison, not routine host
planning. A successful first response uses one background request. Invalid output
gets at most one automatic correction in the same reserved pass, with no new
scheduling mode. Existing source/transaction checks, cancellation, retry
reservation, four-reply maximum material freshness, presets and author controls
are retained. Reply counts schedule reviews; they do not advance fictional time
or determine when an arc ends.

### State and progression

- `direction` and `threads`: compact larger direction and long-running ambitions
  or relationships. These do not require keeping one finite undertaking open.
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
ownership names, access references, evidence addresses, transitions and budgets; it
cannot determine whether a proposed arc is genuinely different or a cited sentence
actually entails the model's interpretation. Renaming a repeated plot is not
semantically prevented by an id check.

## Token admission

Drafting now targets 800 tokens for the complete plan and 300 for the selected
packet, leaving headroom under the existing admission limits. The requested schema
uses short field allowances, and the planner shares 1,200 prose characters across
the whole plan rather than filling every field independently. Existing wording
still uses the original compatibility bounds when validating saved or returned
state: a valid plan is not rejected merely for exceeding a drafting target.
Oversized or malformed responses still cannot be committed.

Before input admission fails, the bounded planner now uses the existing lossless
span-table encoding. It removes repeated JSON labels while preserving exact text,
speaker identity and citation addresses; validation uses the untouched messages.
No limit increase or clipping is introduced. An invalid output can now trigger
the one bounded correction described below.

### Automatic output correction

The live host uses `storyPassWithRecovery`. Invalid JSON, truncated output, schema,
ownership, citation, lifecycle and token-budget errors get one new response with
specific validation feedback and shorter drafting fields. It uses the same source
and validates the complete replacement. Rejected text is not clipped or partly
committed. Short correction instructions replace verbose drafting advice to make
room for feedback at the original input boundary. Diagnostic text has a bounded
token allowance. Correction input is measured with its actual schema and feedback;
optional external evidence can be omitted whole to fit, while required source and
accepted spans stay intact. If they cannot fit, no correction request is sent.

The session persists request counts under the original reservation, checks Stop,
source/reference/settings/state identity before each send (including after the
asynchronous reservation save), and retains the existing atomic commit guards.
Concurrent clicks join the active pass; reloads do not start it again. A second
invalid response ends the pass with the previous preparation intact. Provider
authentication, rate-limit, connection and timeout failures are not treated as
invalid output and do not spend a corrective request. The UI records recovery
success/failure and refreshes the preview after background work settles.

| Component | Ceiling | Enforcement |
| --- | ---: | --- |
| Total planner input | 8,000 | Complete system/schema/payload estimate; host tokenizer preflight can increase the count, never lower it |
| Working plan | 1,200 | Conservative count of serialized plan; reject overflow |
| Generated selected packet | 600 | Conservative count of serialized selection; reject overflow |
| Optional external evidence | 1,000 | Include whole available records only when total input fits |
| Planner response allowance | 3,000 | Provider output setting, with the existing separate reasoning allowance |
| Entire writer context | 1,000 | Existing framing/author-note admission; withhold whole optional packet if needed |

These are conservative local estimates, not promises of exact provider billing.
User-authored instructions are preserved verbatim and may exceed the aggregate
writer limit; the UI reports that exception. Reasoning expenditure is separate.
Old larger input settings are capped at 8,000; the UI permits 3,000–8,000.

Routine requests contain the working plan, complete enabled source references,
recent accepted spans and optional evidence, not the archive or episode ledger.
The host reduces the recent window when necessary, retaining opening context and
all unreviewed player contributions. Source-compatible reviewed contributions may
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
revision space. Attempt recording precedes input construction, so a local budget
failure displays zero requests rather than a previous successful request.

There is no way to fit arbitrarily large required source text or unreviewed input
losslessly into a fixed ceiling. Such requests fail locally before provider spend,
with an actionable error and saved preparation intact. There is no silent clipping,
larger fallback budget or automatic paid summarization. Archive growth no
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
