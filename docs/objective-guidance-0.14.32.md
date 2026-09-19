# Objective guidance — 0.14.32

The writer handoff now prioritizes mid- and long-term development rather than
preparing encounters through their resolution. This replaces the resolution
endpoint requirement introduced in 0.14.29, not the witnessed-progress ledger.

## Contract

- `direction`: what could develop and why it matters.
- `middle`: substantive possibilities across scenes, not ordered tasks.
- `future`: conditional longer-term reach, not a promised ending.
- `when`: applicability or an unresolved prerequisite, not a scheduled entrance.

The writer also receives the NPC/world objective and campaign direction.
There are normally one, at most two, guidance entries per subject. Empty remains
valid. New responses cannot use `situation` or `resolution` in these entries.
The prompt rejects choreography, predetermined decisions and generic advice
without motives or consequences. Field validation cannot judge all semantics;
a model can still put overly concrete prose in a guidance field.

## Existing preparation

Subject and episode IDs, source proofs, witnessed progress, archives and author
instructions remain intact. No reset, added call or frequency change is needed.
Legacy scripts remain readable in storage but are not sent to the writer. Until
a successful normal review, their existing durable objectives, development,
stakes and participation supply a transitional packet. These inherited fields
are not semantically rewritten by the formatter; an old overly concrete
objective can therefore need the next review too.

Planner input identifies legacy episode IDs needing review without replaying
their scripts as templates. A successful review must replace or close remaining
legacy entries. Failure retains the prior preparation atomically. Closed
episodes cannot restart, and completing one does not retire its wider subject.

Saved retry packets are authenticated against their original source and exact
old serialization, then reformatted at injection time. Saved packets are not
rewritten; tampered packets and edited story sources remain ineligible.

## Verification

- `node --test`: 764 passed, zero failed.
- Syntax checks passed for the changed host and planner modules; diff checks
  passed.
- Host tests exercise reload, normal generation, swipe and regeneration with
  legacy packets, without new planning calls or metadata changes.
- A read-only formatter replay of the current saved RP (91 messages, preparation
  revision 4) produced four guidance entries; legacy scene/resolution fields were
  absent and the chat file was unchanged. This is not a live writer test.
- One synthetic planner request returned HTTP 502 before producing a plan. No
  retry was made; live model compliance remains unverified.

This change does not prove sustained prose quality or eliminate review lag.
