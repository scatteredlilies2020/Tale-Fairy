# Server planning and Saga hierarchy — v0.19.3

## What starts a review?

- First preparation, **Guide now / Re-evaluate**, or **Full rebuild**.
- Accepted AI play approaching the preparation's horizon: normally 12 replies, adjustable within 4–20; refresh starts one reply before expiry.
- Explicit OOC direction, scene boundaries, the writer's hidden `<!--tf-review-->` signal, or changed planning inputs can warrant an earlier review.
- Routine generation checks whether work is due. It does not buy a new review on every reply or swipe. After terminal failure, new accepted AI play can make another automatic pass eligible.

There is no clock that generates fresh plans while unchanged RP sits idle. Status polling only collects work; it makes no model calls and does not advance fictional time.

## Phone/browser independence

The browser saves an attempt reservation before submitting its planning input. The server immediately accepts the job and owns its provider request and retry timer. Closing the page, pausing ordinary generation or releasing the browser's five-minute wait does not cancel an accepted job. A valid pending review also survives regeneration when its accepted source prefix remains intact.

On reopening, Tale Fairy collects the original result and runs normal validation. It saves only if the chat, accepted source prefix, references, planner settings, saved preparation and latest attempt still match. Appending new accepted messages is allowed; edited/deleted source, changed settings or an explicit stop cannot be bypassed. Obsolete active jobs are cancelled. An unavailable status endpoint does not authorize a duplicate request.

Recovery neither buys a correction call nor extends guidance freshness. The existing plan remains intact if the result is invalid. The browser must reopen to install a completed result into chat metadata.

## Bounded retries, not an idle loop

A pending server job gets at most **three total attempts**, with **15 seconds** before the second and **60 seconds** before the third. Retries are limited to temporary HTTP 408/429/502/503/504, recognized network failures and inactivity timeouts **before any response output**. Each attempt has a **10-minute inactivity timeout**. Authentication/configuration errors, malformed model output, truncation and partial responses do not retry. Repeated submission of the same retained run key returns the same job.

**Tale Fairy Stop** cancels the request or retry wait. SillyTavern's ordinary story-generation Stop is separate. Disabling Tale Fairy prevents recovery; obsolete-source checks prevent a discarded draft from being installed. No timer starts a fresh logical review after bounded retries are exhausted.

## Installation and limits

The updated backend must be loaded as SillyTavern's `plugins/tale-fairy` server plugin, with server plugins enabled. Restart SillyTavern after updating it, then reload desktop/phone pages. Older or unavailable plugins leave the extension browser-bound. The health endpoint reports `campaignJobs: 1` when this capability is loaded.

The SillyTavern process must remain running. Jobs are held in server memory, not a persistent queue: a server restart, shutdown or OS process kill loses them. The server retains its latest 40 terminal jobs globally. This release handles browser closure, not machine shutdown or unlimited result retention. Provider credentials and forwarded authentication headers are never included in public job metadata; request input and guards are visible only to the owning SillyTavern user.

## Story hierarchy

Successful current-format host reviews require **one active root Saga → connected Arcs → optional connected Threads**. Every Arc names the Saga as its parent; every Thread names an Arc. Missing or broken hierarchy rejects the draft without paid repair or invented links. Legacy preparation remains readable until its next successful review. Quiet scenes do not require Arcs or Threads, and the Saga's scale follows the RP's genre rather than imposing epic stakes.

## Verification and deployment

On 2026-10-09, **1,428 automated tests passed**, including server retry/cancellation, partial-output guards, deduplication, actual pagehide handling, regeneration independence, browser transport, recovery source checks and strict hierarchy validation.

Four synthetic saved-provider checks with `gpt-6.1-sol`, reasoning off, each used one request with no retries. All passed. Manual response/packet review confirmed connected hierarchy, incidental hospital filler removed without invented recovery, light club play without manufactured danger, and rehabilitation retained when it was the central story. Writer packets ranged from 1,108 to 1,420 estimated tokens. These small samples are not a model-wide guarantee or a live SillyTavern UI/writer test.

Deployment policy: publish the same verified commit to **main and testing**, then fast-forward the installed checkout. Check for divergence or local edits first; do not force-push or discard work. Backend restart remains an explicit operational step, not a silent interruption of an active RP.
