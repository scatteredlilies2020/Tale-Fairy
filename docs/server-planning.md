# Server planning and Saga hierarchy — v0.19.3

In v0.19.4, these levels are renamed **Chapter → Arc → Subplot** without changing the hierarchy or server behavior. See [naming and compatibility](chapter-labels.md); the release record below retains its original terminology.

## What starts a review?

- Accepted roleplay replies (including Continue), **Guide now / Re-evaluate**, or **Full rebuild**. Opening a card, `/random`, a displayed first-message greeting, page restoration and settings mounting never start a paid review.
- Accepted AI play approaching the preparation's horizon: normally 12 replies, adjustable within 4–20; refresh starts one reply before expiry.
- Explicit OOC direction, scene boundaries, the writer's hidden `<!--tf-review-->` signal, or changed planning inputs can warrant an earlier review.
- Routine generation checks whether work is due. It does not buy a new review on every reply or swipe. After terminal failure, new accepted AI play can make another automatic pass eligible.

There is no clock that generates fresh plans while unchanged RP sits idle. Status polling only collects work; it makes no model calls and does not advance fictional time.

## Phone/browser independence

The browser saves an attempt reservation before submitting its planning input. The server immediately accepts the job and owns its provider request and retry timer. Closing the page, pausing ordinary generation or releasing the browser's five-minute wait does not cancel an accepted job. A valid pending review also survives regeneration when its accepted source prefix remains intact.

On reopening, Tale Fairy collects the original result and runs normal validation. It saves only if the chat, accepted source prefix, references, planner settings, saved preparation and latest attempt still match. Appending new accepted messages is allowed; edited/deleted source, changed settings or an explicit stop cannot be bypassed. Obsolete active jobs are cancelled. An unavailable status endpoint does not authorize a duplicate request.

Recovery neither buys a correction call nor extends guidance freshness. The existing plan remains intact if the result is invalid. The browser must reopen to install a completed result into chat metadata.

## Bounded retries, not an idle loop

A pending server job gets at most **three total attempts**, with **15 seconds** before the second and **60 seconds** before the third. In v0.20.4, each attempt has a **two-minute inactivity timeout** for meaningful output. Content and reasoning reset this timer; heartbeat/comment traffic alone does not. There is no absolute server response deadline, so a slow response can finish while it is making progress. A timeout discards the unfinished draft and retries even after partial output. Temporary HTTP 408/429/502/503/504 and recognized network failures before response output also retry. Authentication/configuration errors, malformed model output, truncation and other partial-response failures stop. Repeated submission of the same retained run key returns the same job.

The timeout races the upstream operation itself, so an adapter that ignores cancellation cannot hold the job open. Each attempt has isolated state; a late response cannot replace a newer attempt. The browser shows the attempt count, inactivity policy, and retry countdown with the preceding error. The previous saved plan stays available throughout, and retrying a timed-out draft can incur another provider charge.

Browser health and job-status checks also stop after 15 seconds, including a stalled response body. An unavailable status endpoint still does not authorize a duplicate model request; the browser reports the failure and can collect the original job on a later poll.

**Tale Fairy Stop** cancels the request or retry wait. SillyTavern's ordinary story-generation Stop is separate. Disabling Tale Fairy prevents recovery; obsolete-source checks prevent a discarded draft from being installed. No timer starts a fresh logical review after bounded retries are exhausted.

## Installation and limits

The updated backend must be loaded as SillyTavern's `plugins/tale-fairy` server plugin, with server plugins enabled. Restart SillyTavern after updating it, then reload desktop/phone pages. Older or unavailable plugins leave the extension browser-bound. The health endpoint reports `campaignJobs: 1` when this capability is loaded.

The SillyTavern process must remain running. Jobs are held in server memory, not a persistent queue: a server restart, shutdown or OS process kill loses them. The server retains its latest 40 terminal jobs globally. This release handles browser closure, not machine shutdown or unlimited result retention. Provider credentials and forwarded authentication headers are never included in public job metadata; request input and guards are visible only to the owning SillyTavern user.

## Story hierarchy

Successful current-format host reviews require **one active root Saga → connected Arcs → optional connected Threads**. Every Arc names the Saga as its parent; every Thread names an Arc. Missing or broken hierarchy rejects the draft without paid repair or invented links. Legacy preparation remains readable until its next successful review. Quiet scenes do not require Arcs or Threads, and the Saga's scale follows the RP's genre rather than imposing epic stakes.

## Soft writer target and passive browsing — v0.20.4

The writer's 2,400-token target guides concise authoring but never rejects or cuts a complete valid preparation. Instructions, orientation, cards and effects remain whole even above target. Crossing it does not buy an automatic shortening request. Old packet authentication remains available; new outgoing packets use complete content. Actual endpoint context capacity and response validity still apply.

Chat changes, startup and page restoration collect existing work and display saved guidance. They do not migrate by generating, repair a missing plan, or start current/future jobs. The host's `first_message` event and unplayed greetings are excluded; a real Continue reply is still eligible without typed user text. Accepted play and explicit Guide/Rebuild still use normal cadence and reservation deduplication. An existing server job may finish and be recovered without a new model call.

## Verification and deployment

On 2026-10-19, **1,574 automated tests passed** for v0.20.4. Thirty rapid card switches and repeated page restoration produced zero new planner invocations. First-message greetings stayed passive, while Guide, accepted play and Continue remained eligible. Oversized instructions, orientation, effects and cards survived save, reload, regeneration and detached recovery without a size-only provider rewrite. An active stream outlasted its inactivity allowance without cancellation; heartbeat-only stalls still retried. No live story or planner generation was sent for these changes.

On 2026-10-19, **1,568 automated tests passed** for v0.20.3, including stalled fetches that ignore abort, incomplete JSON and event streams, heartbeat traffic reaching the absolute deadline, late-response isolation, retry exhaustion, explicit Stop, and browser status timeouts. Live read-only inspection found no registered jobs and a stopped saved attempt; it did not establish which browser wait had remained visible. No live story or planner generation was sent for this fix.

On 2026-10-09, **1,428 automated tests passed**, including server retry/cancellation, partial-output guards, deduplication, actual pagehide handling, regeneration independence, browser transport, recovery source checks and strict hierarchy validation.

Four synthetic saved-provider checks with `gpt-6.1-sol`, reasoning off, each used one request with no retries. All passed. Manual response/packet review confirmed connected hierarchy, incidental hospital filler removed without invented recovery, light club play without manufactured danger, and rehabilitation retained when it was the central story. Writer packets ranged from 1,108 to 1,420 estimated tokens. These small samples are not a model-wide guarantee or a live SillyTavern UI/writer test.

Deployment policy: publish the same verified commit to **main and testing**, then fast-forward the installed checkout. Check for divergence or local edits first; do not force-push or discard work. Backend restart remains an explicit operational step, not a silent interruption of an active RP.
