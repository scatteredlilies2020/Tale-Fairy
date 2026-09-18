# Continuity Memory integration: 0.14.27

## Fixed path

The contract-15 planner returned before the legacy `optionalContinuityContext`
path. Its source contained the card, selected world books, accepted chat and
locally built historical evidence, but not CM's public recall snapshot.

`readCampaignSnapshot` now reads the public bridge into an immutable private
input. `ownedInput` adds `continuity_memory` only when optional recall fits.
No CM checkout changes, extraction requests or writes are required.

## Safety and budgets

- Respect the existing Continuity toggle. No bridge or a throwing bridge leaves
  planning operational without memory; unversioned extension prompts are not a
  fallback because they cannot establish freshness.
- Accept bridge v1/v2 only with explicit current same-chat identity. V2 coverage
  must be valid; processed coverage may intentionally lag the newest chat turns.
- Capture a current publication synchronously. CM marks ordinary appended play
  stale, so reuse that observed snapshot only if every message in its original
  source prefix is unchanged, with the same chat/character or group identity and
  publication revision. This proof is session-local, not persisted. An unseen
  stale snapshot after reload is omitted until CM publishes current recall.
  The observed prefix also catches older edits outside CM's recent-tail hash.
- Exclude pending replacement generations. Edits, deletions, changed swipes,
  mismatched chats and unexplained stale snapshots do not inherit cached recall.
- Preserve the full CM prompt when it fits, including its Chronicle. Otherwise
  omit it whole and try complete structured records in CM's priority order.
  Record IDs, source ranges, status and temporal information stay attached.
  Report omissions in the private block; never cut a trailing condition to fit.
- `summaryContextTokens` (default 4,000, clamped to 12,000) and the total input
  estimate both apply. Memory consumes spare budget only: complete protected
  author references, player contributions and retained plans still take priority.
  A very full input may consequently omit all CM recall. Returned input
  diagnostics distinguish included, unavailable, disabled and budget omission.
  The board shows availability for the next pass, not a false claim that all
  available recall fit the last request.
- A same-source CM correction while a request is in flight rejects a result
  that used the superseded recall. Appending accepted turns retains the existing
  paid-request policy rather than constantly cancelling work. This is not a
  general semantic reconciliation of late corrections after further appends.
- CM publication callbacks now use campaign scheduling instead of legacy
  notebook reconciliation. They do not bypass interval or persisted-attempt
  guards, retry failed calls, or trigger an extra pass just for a newer revision.
  Newly available recall is used at the next due/manual pass.
- Memory is historical evidence, not instructions, player consent or a future
  task list. Current source and explicit corrections outrank conflicting recall.
  Memory IDs cannot substitute for supplied accepted-message citations when
  retiring preparation. These semantic boundaries are model instructions;
  citation membership and writer packet field selection remain code-enforced.

## Scope and remaining work

Writer-facing TF output remains events plus explicit author instructions. CM
continues to own its normal writer injection and factual memory. TF never sends
proposals back into CM as if they happened.

The tests exercise the public bridge contract, host prompt construction,
publication scheduling, branch isolation, whole-record budgets and stale-result
rejection. They do not prove native SillyTavern load ordering or narrative quality.
An additional read-only smoke check imported the sibling Continuity Memory
checkout's actual `createContinuityContextBridge` and `buildPlanningEvidence`:
its v2 output reached `ownedInput`, with provenance retained, appended-source
reuse working, and an old-prefix edit rejected even outside CM's tail signature.
No model call, stored-world write or live-chat change was used for that check.

This is not a new offscreen simulation or horizon-planning architecture. The
separate issue documented in `mid-long-term-approach.md` remains: preserving
future subjects is not the same as delivering their substantive middle and
later experiences during ordinary play.
