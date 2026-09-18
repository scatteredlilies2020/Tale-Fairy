# Phone lifecycle candidate, 2026-09-18

This implementation is published as **v0.14.28**, based on `2fe6e77` / v0.14.27.
The native phone evaluation used the same implementation labelled `0.14.28-dev`
before publication was authorized. Publication changes the version identifiers
and release documentation; it does not turn the bounded evaluation into proof
of sustained automatic progression. Results and limitations are reported in
[the native evaluation](phone-native-evaluation-2026-09-18.md).

## Diagnosis and implemented change

The installed v0.14.27 planner preserved durable subjects but flattened their
writer output to proposed event strings. Retirement required message indices,
while introductions, participation, partial performance and finite completion
had no code-enforced identity. The published evaluation notes already showed
that retaining future ideas could coexist with many replies of invitations,
packing and preparation. The multi-horizon scripts are isolated experiments,
not the running planner. Neither more slots nor a new scope reset fixes this.

The candidate retains the existing single background planning transaction,
scheduling, source checks, same-page lock, stop policy, saved author notes,
archives and nonblocking writer generation. It adds three separate outputs and
merge responsibilities within that one call:

- Accepted witnesses: exact quotes tied to supplied accepted message indices,
  speaker and source-prefix identity. Formatting-only whitespace and straight/curly
  quotation-mark differences are accepted by storing the original source span. Episode progress is a **model
  interpretation of those witnesses**, not an independently authoritative fact.
- Durable preparation: existing subject IDs, aims, development, stakes and
  participation survive. A current-material update can omit and preserve all
  these fields. Unselected subjects survive omission.
- Writer material: `realization.playable` contains an applicability condition
  and a concrete situation. Only those two fields reach the writer for reviewed
  subjects; witnesses, statuses, private futures and provider memory do not.

Finite episodes have stable IDs and introduced / participating / partial /
completed / declined / transformed states. These are descriptions, not a
mandatory ladder. Closed episodes are filtered from the packet even if the
model echoes them. They cannot regress or restart under the same ID. New
experiences can build on their results under the same broader subject. Closing
one episode never automatically retires its subject. Whole-subject retirement
needs explicit scope and exact supplied witnesses; retired subject IDs cannot
be silently recreated. Semantic scope still requires correct model judgment.

New output need not author both legacy plot points and writer situations.
Existing storage stays readable. The next successful review prepares writer
material for retained pre-upgrade subjects without deleting their preparation.
Old designs and progress remain archived. A failed or stopped call changes
nothing. Edits invalidate progress whose source prefix changed; invalid old
interpretations are excluded from the new planner input. No generated proposal
is written into CM or other memory. There is no hidden-world simulation.

The creative task permits ordinary NPC work to reach results in prose without
requiring the player to supervise it, while keeping future outcomes conditional
until played. It does not prescribe player actions, feelings, consent or
knowledge, and it does not advance fictional time on a review interval.
Those semantic requirements are not all enforceable by JSON validation.

## Phone paths and state

- ST: `/data/data/com.termux/files/home/SillyTavern`, HTTP `127.0.0.1:8000`.
- Development: `/data/data/com.termux/files/home/Tale-Fairy` (initially older
  `aa7378e`; clean, safely fetched and fast-forwarded to `2fe6e77`).
- Installed: ST `public/scripts/extensions/third-party/Tale-Fairy`, initially
  clean on `testing` at `2fe6e77`.
- Server plugin: ST `plugins/tale-fairy` is a symlink to the installed
  extension's `plugin` directory. Only its version label changes in this work;
  its transport is unchanged. The server was restarted during native-test recovery.
- CM: installed sibling `Continuity-Memory`, clean at `852a325`. Fetched
  without merging or changing its implementation or worlds.
- TF origin/main and origin/testing both still pointed to `2fe6e77` after fetch.
- Pre-existing ST edits to its main scripts, start script and other local files
  were preserved. The ongoing RP chats and settings were not edited.

The saved active writer route is OpenAI `gpt-5.6-sol`, selected connection
`STURDY - OPENAI`, preset `Main - Time Duration`, reasoning Low. TF selects its
Direct Custom route, `deepseek-v4-pro-0813`, reasoning Low; review interval 12.
Inactive Custom/OpenRouter model fields were not used to identify the writer.
These selections were subsequently verified in the actual native ST frontend
runtime and captured provider requests/responses; see the native evaluation report. No model, persona, preset,
reasoning setting or connection was changed.

## Optional evidence contract

`extension/evidence-providers.js` exports `registerEvidenceProvider` and
`evidencePrefix`. The public contract is an explicit, synchronous, cached,
read-only adapter. It has no extraction, generation, subscription or write API.
Do not register an adapter whose `read` starts work. There is no prompt scraping.

```js
import { registerEvidenceProvider, evidencePrefix } from
  '/scripts/extensions/third-party/Tale-Fairy/extension/evidence-providers.js';

const unregister = registerEvidenceProvider({
  id: 'my-summary', version: 1,
  read: ({ chatId, owner }) => cachedSnapshotFor(chatId, owner),
});
// Snapshot shape (provider-owned, cloned by TF):
// { chatId, owner, status: 'current' | 'context' | 'stale', revision,
//   provenance: 'Source description', summary: '...',
//   records: [{ id, text, sourceRange, canonicalStatus, ...provenance }],
//   coverage: { messageCount, sourcePrefix: evidencePrefix(coveredMessages) } }
```

`owner` is `character:<id>` or `group:<id>`. The exact chat/branch ID and owner
must match. Coverage uses the entire claimed prefix, not a recent tail. Edits,
swipes and deletion invalidate that proof; append-only play can retain older
historical evidence. A malformed proof is rejected. A summary without proof is
explicitly `lower-confidence-context`, never verified current state. Unknown
or stale identities are omitted. Providers receive frozen identity only, not
credentials, mutable context or settings. Up to eight registered adapters and
64 complete records per source are considered. All sources share the existing
optional evidence budget; oversized text is omitted whole. Conflicts stay
separately attributed, with accepted play taking precedence in the contract.

**Genuinely implemented external integration: Continuity Memory public bridge
v1/v2.** Its existing source and freshness checks remain in its adapter. The
actual installed v2 bridge and `buildPlanningEvidence` were imported for a
read-only in-memory contract smoke test. Generic summary fixtures exercise the
registry and actual host input, but no second named memory product is claimed
supported. Registration must be repeated when the browser reloads.

Private `external_evidence` replaces the CM-specific block on the active path.
CM retains ownership of its normal writer injection; TF does not duplicate it.
The legacy planner's compatibility routines remain intact. CM publication
notifications still obey existing scheduling and attempt guards.

## Multihog reference

Inspected repository at `48b15e7`: https://github.com/MultihogAurelius/SillyTavern-MultihogDnDFramework

`world-progression-prompt.js` describes regional direction without local asset
operations. `map-evolution.js` and `map-evolution-lib.js` apply concrete changes,
track materialized / already_realized_by_play / considered reports, and retain
open / transformed / resolved threads. Actual elapsed fictional time is
separate from manual and scheduled triggers. Its map state distinguishes
objective assets from revealed player knowledge. `src/state/chat-persistence.js`
retains chat-scoped current state alongside history, report applications and
other persistence records; its active-chat checks and tombstone protections
matter independently of its D&D rules.

Borrowed principles: separate durable subject from finite realization, retain
closed identities, revise from accepted changes, and do not confuse scheduling
with fictional time or objective invention with player knowledge. TF does
**not** borrow Multihog's authority to simulate unseen canonical world changes.
Its license is GPL-3.0 (TF is AGPL-3.0-only). No source code or prompt was copied;
the reference clone lives outside the live extension tree, under Termux tmp.
Multihog was not installed.

## Activate and test on the phone

1. Refresh the SillyTavern browser page after installation. The extension
   manager should show `0.14.28`. Browser runtime identity is also available
   as `globalThis.taleFairyRuntime.version` if a console is available.
2. Search characters for `TF Test 0918`. Four disposable cards and their default
   chats were imported through ST and subsequently played in the native frontend:
   Journey / Workshop, each with Standalone / CM variants. Their opening is an
   authored fixture, explicitly not a model result. CM variants contain a copied
   accepted prefix, then fresh continuation; the Workshop CM continuation includes
   an explicitly supplied next-morning jump. See the native report.
3. For the Standalone variants, disable CM using its normal Enabled control
   while testing, then restore it afterward. These chats already exclude TF's
   optional evidence via `chat_metadata.taleFairyEvidence = 'off'`. That local
   exclusion alone does **not** disable CM's own injection or auto-extraction;
   do not call it a no-CM run while CM is still running.
4. For the CM variants, keep CM enabled. The two prepared CM variants already have fresh, chat-specific test worlds
   and real digests; use those bindings, never an ongoing RP's world. For any new
   test chat, create a fresh world and process only its accepted conversation. TF's evidence line must
   actually report available CM evidence before calling it a CM-fed sample.
   An enabled but empty/unavailable bridge is fallback behavior, not a positive
   integration observation. TF itself does not initiate CM extraction or writes.
5. The standalone variants already have saved preparation. Use **Guide now**
   only if TF shows no preparation or if deliberately testing a manual review.
   Keep the existing writer preset, selected connections, persona and reasoning.
   Continue ordinary IC play. Leave automatic review cadence unchanged. A manual
   re-evaluation later should be recorded as manual, not autonomous progression.

Suggested IC sequence; adapt the action to what is actually present:

Journey:

- “I crouch beside the marker and compare its channels with Sera's sketch.
  What do you make of the difference?”
- Follow the discovery actually offered: “I examine that part more closely.
  How could we test your idea here?”
- Perform only your own chosen contribution to that test, then respond to its
  result. Check that the prose gives an observable discovery rather than
  another invitation, errands, or an unrequested departure.

Workshop:

- “I set the three tiles beside each other. Show me where the glaze behaved
  differently.”
- “I try your comparison on this piece. What changes when we use the thinner
  layer?” (Only if the previous reply makes that action available.)
- “I'm not taking a market stall, but I'd like to keep working on this with
  you.” Check whether the booking closes while the craft develops instead of
  repeatedly being introduced.

Let actual results guide later IC choices. Do not count stored preparation,
recaps or prewritten fixtures as enacted middles. Later arrangements, discoveries
or collaborations should use those results and leave some observable consequence.
No explicit time jump or scene transition is part of this sequence. If one is
added, record it; it cannot prove autonomous progression.

## Verification and limits

Baseline: 717 engineering tests passed. Final candidate: **747 passed, zero failed, zero skipped**
(`node --test --test-concurrency=1`, 99.5 seconds). JavaScript syntax and `git diff --check` also passed. The candidate adds lifecycle, provider
and host regressions, including generic same-source corrections, source edits,
closed episode filtering, separate current-material updates, saved-state
round trips, retirement witnesses and single-request failure behavior. Existing
coverage includes CM off/unavailable/stale, swipes, regeneration, reloads,
chat changes, stop, source guards, no duplicate publications, no retries and
no private-memory writer leakage. Tests using stubbed model responses test
engineering behavior, not narrative quality.

Actual ST observations and retained failures are reported in
[the native evaluation](phone-native-evaluation-2026-09-18.md). The actual installed
candidate has been used for supervised paid planner/writer requests in disposable
chats on this phone. Recorded planner responses were also replayed, unchanged,
through the native transaction to test parser repairs without further paid calls;
those replays are explicitly distinguished from fresh model results. No unattended
paid evaluation loop was launched.

Remaining risks: semantic misclassification despite a valid quote; regenerated
IDs disguising repeated content; writer adherence to the existing preset;
stale creative material between scheduled reviews; growth of the compact
progress ledger in very long play; model output size/reliability under the new
contract. Input overflow and invalid output preserve the previous state and
report failure rather than retry or silently truncate. Same-source memory
corrections are guarded; semantic correction after further appends retains the
existing v0.14.27 limitation. No claim of automatic fictional time progression.

Logs, the real-CM contract smoke result, fixture manifest and unsuccessful test
runs are retained outside the repository at
`/data/data/com.termux/files/home/.cache/tf-20260918-review/` and
`/data/data/com.termux/files/usr/tmp/tf-20260918-*.log`.
They contain synthetic fixtures and test failures, not credentials. Earlier
published narrative failures remain in the committed evaluation documents.
