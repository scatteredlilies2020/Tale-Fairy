# Bounded working plan

## Active implementation

`extension/index.js` now calls `bounded-story.js`. The former `story-selection.js`
pipeline remains for legacy regression coverage and comparison, not routine host
planning. There is still one background request, no critic/repair call, and no
new scheduling mode. Existing source/transaction checks, cancellation, retry
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
leave that window. Source edits invalidate the accepted prefix and consequence
carry. Omission is explicitly not evidence of absence or completion.

There is no way to fit arbitrarily large required source text or unreviewed input
losslessly into a fixed ceiling. Such requests fail locally before provider spend,
with an actionable error and saved preparation intact. There is no silent clipping,
larger fallback budget, automatic paid summarization or retry. Archive growth no
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
one-call host behavior. Old pipeline regression tests remain in place.

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
