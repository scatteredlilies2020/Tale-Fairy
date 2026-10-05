# Planner request recovery

The previous shared three-request ceiling could reject a valid scene correction
after a memory refresh. The observed attempt sent horizon, horizon, scene: a
memory update discarded the first horizon, then the rebuilt scene needed a
correction. Its fourth request was blocked locally as “Planner request limit
reached.” The provider never received that correction.

The session now records requests without enforcing an aggregate count. Each
stage owns one invalid-output correction; correcting the horizon does not use
the scene's correction. A substantive memory update can rebuild both stages
once, even after earlier requests or corrections. All rebuilt stages keep their
own corrections. Normal valid preparation still takes two requests.

The whole pass remains atomic. Stop, timeout, transcript/reference/settings
changes, newer runs and saved-plan changes prevent stale requests or commits.
Repeated invalid output reports its validation failure, and a provider failure
reports its actual error. A second memory change does not start another rebuild.
Previous source-valid preparation stays available when a review fails.

Tracking shows the actual request count, memory refresh and correction outcome.
The manifest and changed browser imports carry a new request-policy query so a
reload loads the fix. No live chat or provider settings are rewritten.

This supersedes the shared request-ceiling descriptions in the earlier workshop,
bridge, lifecycle, future-entry and autonomous-life release notes.
