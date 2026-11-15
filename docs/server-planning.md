# Server planning and Saga hierarchy — v0.19.3

In v0.19.4, these levels are renamed **Chapter → Arc → Subplot** without changing the hierarchy or server behavior. See [naming and compatibility](chapter-labels.md); the release record below retains its original terminology.

## What starts a review?

- Accepted roleplay replies (including Continue), **Guide now / Re-evaluate**, or **Full rebuild**. Opening a card, `/random`, a displayed first-message greeting, page restoration and settings mounting never start a paid review.
- Accepted AI play at the configured interval: normally 12 replies for current planning and 40 for futures. Both are adjustable. Model review suggestions never shorten the chosen interval.
- Early review signals are opt-in and wait at least four replies (or the shorter configured interval). Repeated scene separators, writer markers and variable updates cannot create per-reply planning.
- Routine generation checks whether work is due. It does not buy a new review on every reply or swipe. Terminal failures reserve the same full interval; a new reply alone does not buy another pass. Guide and manual future updates remain immediate.

There is no clock that generates fresh plans while unchanged RP sits idle. Status polling only collects work; it makes no model calls and does not advance fictional time.

## Phone/browser independence

The browser saves an attempt reservation before submitting its planning input. The server immediately accepts the job and owns its provider request and retry timer. Closing the page, pausing ordinary generation or releasing the browser's five-minute wait does not cancel an accepted job. A valid pending review also survives regeneration when its accepted source prefix remains intact.

On reopening, Tale Fairy collects the original result and runs normal validation. It saves only if the chat, accepted source prefix, references, planner settings, saved preparation and latest attempt still match. Appending new accepted messages is allowed; edited/deleted source, changed settings or an explicit stop cannot be bypassed. Obsolete active jobs are cancelled. An unavailable status endpoint does not authorize a duplicate request.

Recovery neither buys a correction call nor extends guidance freshness. The existing plan remains intact if the result is invalid. The browser must reopen to install a completed result into chat metadata.

## Bounded retries, not an idle loop

A pending server job retries temporary connection failures until it succeeds or is explicitly stopped: 15 seconds before its first retry, then at most one attempt per 60 seconds. It keeps the same run key and source reservation throughout; these are attempts to finish pending work, not fresh reviews. Each attempt has a two-minute inactivity timeout for meaningful output. Content and reasoning reset it; heartbeats do not. Active generation has no absolute deadline. Connection loss can retry an unfinished draft, including partial output. Authentication/configuration errors, malformed output and truncation stop. Repeated submission of a retained run key returns the existing job, including its completed response, without another model request.

The timeout races the upstream operation itself, so an adapter that ignores cancellation cannot hold the job open. Each attempt has isolated state; a late response cannot replace a newer attempt. The browser shows the attempt count, inactivity policy, and retry countdown with the preceding error. The previous saved plan stays available throughout, and retrying a timed-out draft can incur another provider charge.

Browser health and job-status checks also stop after 15 seconds, including a stalled response body. An unavailable status endpoint still does not authorize a duplicate model request; the browser reports the failure and can collect the original job on a later poll.

**Tale Fairy Stop** cancels the request or retry wait. SillyTavern's ordinary story-generation Stop is separate. Disabling Tale Fairy prevents recovery; obsolete-source checks prevent a discarded draft from being installed. Retry timers belong only to an already accepted pending job. They never start a new logical review or regenerate a completed result.

## Installation and limits

The updated backend must be loaded as SillyTavern's `plugins/tale-fairy` server plugin, with server plugins enabled. Restart SillyTavern after updating it, then reload desktop/phone pages. Older or unavailable plugins leave the extension browser-bound. The health endpoint reports `campaignJobs: 1` when this capability is loaded.

The SillyTavern process must remain running. Planner jobs are held in server memory, not a persistent queue: a server restart, shutdown or OS process kill loses them. The server retains its latest 40 terminal planner jobs globally. This release handles browser closure, not machine shutdown or unlimited result retention. Provider credentials and forwarded authentication headers are never included in public job metadata; request input and guards are visible only to the owning SillyTavern user.

## Finite bulk retry-storage migration — v0.20.17

The health capability `storageMigration: 1` enables one automatic server-owned conversion of the authenticated user's single/group chat storage, including legacy group metadata. `POST /storage-migration` starts or joins it; `GET /storage-migration` only reads aggregate progress. Neither route accepts user-supplied filesystem paths or sends provider requests. Multiple tabs share one run; closing a page does not stop server work.

After conversion, a fresh inventory/read verifies **zero remaining stale caches and zero file issues** before writing `tale-fairy/storage-migrations/shared-plans-v1/status.json` beneath that user's data directory. A complete receipt prevents further automatic sweeps, including after a server restart. Client polling stops on completion, errors or a finite wait limit. A maximum of three passes prevents concurrent edits from causing an endless loop; uncertain files produce a terminal `attention` result, never false completion. Interrupted, nonterminal receipts resume on the next page load. Explicit **Check all chat storage** (`POST` with `retry: true`) rechecks imported old chats or retries fixed issues.

The converter validates every retry round trip and the same authenticated packet set, changes only retry-cache JSON values, preserves other metadata and message bytes, creates and reads back an exact gzip backup, rechecks source bytes immediately before atomic replacement, and verifies the written file. It never follows linked storage paths or deletes backups. The backend's synchronous replace critical section does not yield to ST chat saves. Recoverable originals and detailed local results stay under the migration directory; public status exposes only counts and sizes. A local administrator can use `node scripts/migrate-chat-storage.js --user-root <absolute-user-data-directory>` (add `--recheck` only for an intentional new sweep).

## Story hierarchy

Successful current-format host reviews require **one active root Saga → connected Arcs → optional connected Threads**. Every Arc names the Saga as its parent; every Thread names an Arc. Missing or broken hierarchy rejects the draft without paid repair or invented links. Legacy preparation remains readable until its next successful review. Quiet scenes do not require Arcs or Threads, and the Saga's scale follows the RP's genre rather than imposing epic stakes.

## Soft writer target and passive browsing — v0.20.4

The writer's 2,400-token target guides concise authoring but never rejects or cuts a complete valid preparation. Instructions, orientation, cards and effects remain whole even above target. Crossing it does not buy an automatic shortening request. Old packet authentication remains available; new outgoing packets use complete content. Actual endpoint context capacity and response validity still apply.

Chat changes, startup and page restoration collect existing work and display saved guidance. They do not migrate by generating, repair a missing plan, or start current/future jobs. The host's `first_message` event and unplayed greetings are excluded; a real Continue reply is still eligible without typed user text. Accepted play and explicit Guide/Rebuild still use normal cadence and reservation deduplication. An existing server job may finish and be recovered without a new model call.

## Adjustable resource policy — v0.20.5

Automatic planning can be disabled independently of writer guidance. Current and future reviews follow their configured accepted-reply intervals after both success and failure. Early signals are off by default and rate-limited when enabled. Repeated host notifications, changing references, model-selected short horizons, and failed responses cannot bypass the interval. Metadata edit notifications and generation-end callbacks do not start current-planner jobs.

Settings expose total input, optional memory, setup/review response, writer-context and per-future-card response targets, plus an arbitrary positive future-card count. There is no hidden 10,000-token input clamp or fixed 6/10/15 count menu. Prose lengths and generated card counts are advisory; complete valid responses are retained above them. Changing a size target does not cancel or invalidate paid work. Endpoint input/output context capacity, types, identities, hierarchy and source guards remain real constraints. Provider output headroom comes from remaining context rather than the soft response target.

The live diagnostic at inspection still reported v0.20.3; reload pages to load this release. Backend retry/watchdog updates additionally require restarting SillyTavern. No user conversations or provider settings are rewritten.

## Verification and deployment

On 2026-10-19, **1,587 automated tests passed** for v0.20.6. A pending job recovered after seven simulated connection failures; repeated submission of its completed run key made no additional provider requests. Interrupted partial transport output retried, while invalid completed responses stayed terminal. No live provider generation was sent.

On 2026-10-19, **1,586 automated tests passed** for v0.20.5. Forty accepted replies with repeated host notifications, changing references, model-shortened review suggestions, reloads and provider failures produced four current-planner attempts at a 12-reply interval. Future failures stayed reserved until their configured interval. Manual-only mode blocked automatic current and future calls while retaining explicit actions. Tests also covered settings round trips, custom input/writer/response/card targets, complete long prose and above-target card counts, retained paid work after target changes, and response headroom bounded by actual context capacity. No live provider generation was sent.

On 2026-10-19, **1,574 automated tests passed** for v0.20.4. Thirty rapid card switches and repeated page restoration produced zero new planner invocations. First-message greetings stayed passive, while Guide, accepted play and Continue remained eligible. Oversized instructions, orientation, effects and cards survived save, reload, regeneration and detached recovery without a size-only provider rewrite. An active stream outlasted its inactivity allowance without cancellation; heartbeat-only stalls still retried. No live story or planner generation was sent for these changes.

On 2026-10-19, **1,568 automated tests passed** for v0.20.3, including stalled fetches that ignore abort, incomplete JSON and event streams, heartbeat traffic reaching the absolute deadline, late-response isolation, retry exhaustion, explicit Stop, and browser status timeouts. Live read-only inspection found no registered jobs and a stopped saved attempt; it did not establish which browser wait had remained visible. No live story or planner generation was sent for this fix.

On 2026-10-09, **1,428 automated tests passed**, including server retry/cancellation, partial-output guards, deduplication, actual pagehide handling, regeneration independence, browser transport, recovery source checks and strict hierarchy validation.

Four synthetic saved-provider checks with `gpt-6.1-sol`, reasoning off, each used one request with no retries. All passed. Manual response/packet review confirmed connected hierarchy, incidental hospital filler removed without invented recovery, light club play without manufactured danger, and rehabilitation retained when it was the central story. Writer packets ranged from 1,108 to 1,420 estimated tokens. These small samples are not a model-wide guarantee or a live SillyTavern UI/writer test.

Deployment policy: publish the same verified commit to **main and testing**, then fast-forward the installed checkout. Check for divergence or local edits first; do not force-push or discard work. Backend restart remains an explicit operational step, not a silent interruption of an active RP.
