# Planner failure from owner-name matching

Release v0.14.30 fixes a regression in v0.14.29 (`b1c8926`). The user reported TF
generation failing.
The saved attempt recorded `failed` but did not preserve its reason, so a single
supervised request captured the actual failure with the existing selected planner
connection, model, temperature and reasoning. Writer generation and persistence
were blocked in the isolated diagnostic browser. No RP reply was generated.

The provider returned HTTP 200, a complete JSON response and `finish_reason: stop`
after 186 seconds. TF then rejected the entire plan with:

> NPC resolution must include the undertaking owner and their result, not only a messenger

The v0.14.29 check required an actor string to appear verbatim in both the broad
undertaking owner's description and the finite result. Descriptive role names,
shorter references and another NPC contributing to the same undertaking failed
that check. It could not reliably distinguish those valid cases from an incomplete
messenger-only introduction. This was a TF validation bug; the captured request
was not a provider rejection. The earlier uncaptured failures cannot be individually
verified from the saved status alone.

The fix removes that string-matching check and its duplicate prompt constraint.
It retains required concrete endpoints, declared NPC/player/world ownership, known
player-name protection, schema checks, exact evidence witnesses, saved progress,
branch/source guards and the single-call policy. A mere opening can still be poor
creative output; name matching is no longer presented as proof of narrative quality.
No writer style rule, model, preset, review interval or reasoning setting changes.

Two neutral regression cases cover shortened role references and another NPC
finishing substantive work under an existing undertaking. The real captured
response passes the fixed planner unchanged in an offline replay, with all four
subjects and a valid saved state. No response repair or additional paid call was
used. All 756 engineering tests passed (zero failures, cancellations or skips).
A replay through the actual phone ST frontend and installed `0.14.30-dev` runtime
reported **Campaign preparation ready**, revision 1, using that same response.
The replay intercepted its one generation request locally: no provider call was
made. CM remained enabled and reported current evidence. Both diagnostic sessions
left the real chat and settings files byte-for-byte unchanged. The accepted replay
plan existed only in the isolated browser; it was not written into the ongoing RP.
Both diagnostic browser instances were closed; the user-started ST server remained
running. This verifies planner acceptance, not new narrative output.

The installed extension and existing development checkout contain this fix.
Refresh ST to load it; older open tabs keep their already-loaded validator. No
model/settings changes or repeated hidden retries are required. The user authorized
publication to all branches, `main` and `testing`, at the
same commit. Release finalization only removes the development version suffix;
the native replay above tested the same behavior. All 60 browser/integration checks
also passed after finalizing the release version.

Private diagnostic evidence remains in the ignored local directory
`cache/tale-fairy-evaluations/2026-09-18-planner-failure/`, not in this repository.
It includes the failed response, capture, offline replay and file-hash checks.
The original diagnostic capture left chat and settings files unchanged.
