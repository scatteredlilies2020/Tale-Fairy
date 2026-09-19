# Story material — 0.14.33

## Contract

TF prepares mid- and long-term possibilities privately, then selects relevant
substance for the writer. The handoff is `possible_developments`, containing
an optional source plus `when`, `premise`, `developing_conditions` and
`possible_consequences`. It contains no generated application instructions,
objective checklist, whole campaign plan, progress ledger or scene endpoint.

A premise can be a broadly specified encounter, opportunity, competing
interest or process condition. Names, biographies, incidental numbers,
choreography and prescribed responses are unnecessary. Established details
remain available; specificity is justified by causal relevance, not decoration.
The contract applies to relationships, everyday activities, institutions,
exploration and non-human processes, not just adventure stories.

Pacing comes from which material is selected and how accepted play changes
it. TF must not generate instructions about writing style, tone, narration,
tempo, gradual revelation or dramatic emphasis. No mandatory crisis, subplot,
interruption or encounter sequence is introduced. Review counts do not advance
fictional time. Player agency and knowledge boundaries remain unchanged.

There are at most two selected entries per subject, normally one, and zero is
valid. Dormant future branches stay in durable preparation. Relevant present
material can have mid-term reach and conditional consequences without exposing
every planned encounter or guaranteeing an outcome.

Every review reassesses the wider horizon and existing selections, rather than
letting the latest scene redefine the plan. Independent subjects survive long
local conversations. Spent premises and routine follow-ups should not be
replenished just to prolong the same scene. Other relevant material need not
wait for every local loose end, but the planner must not force departure,
declare completion, rotate subjects by quota or interrupt a scene the player
is pursuing. This is a selection rule, not a writer pacing instruction or an
automatic scene detector.

Selection maintenance is automatic inside that same scheduled planner response:
keep applicable material, revise it, or withdraw it. These decisions are private,
not writer instructions or user-facing choices. If a successful current-format
review omits an active selection, TF withholds it instead of carrying it forward.
Its durable subject, witnessed progress and archived material remain available
for the next normal review. Dormant subjects survive omission. There is no
extra model call, forced replacement, manual cleanup or immediate retry loop.

## Compatibility

- Storage retains `direction`, `middle` and `future`; the writer projection uses
  substance-oriented names. Saves, episode IDs and quoted evidence are retained.
- A successful normal review marks `storyMaterialVersion: 1`. Earlier nonempty
  selections require an explicit rewrite or empty selection before this upgrade
  can commit. Omission, invalid output and failed requests cannot partially
  upgrade the plan. Current selections can be kept explicitly without rewriting
  them; omission withholds them automatically as described above.
- The formatter removes old instruction wrappers immediately, but does not
  semantically rewrite stored prose. Old advice inside a text field can remain
  until a successful planner review. No regex attempts to classify or silently
  delete story sentences. Old scene scripts remain private; older plans without
  selected material temporarily expose their durable conditions and stakes.
- Retry packets from 0.14.32 and earlier authenticate against their original
  serialization and saved source. Outgoing packets are rebuilt in the new
  format, without changing archived packets or making an AI call. Tampered
  packets and incompatible source edits remain invalid.
- Explicit author instructions are retained verbatim, including any deliberate
  style preferences. This change concerns generated TF content, not overriding
  the user's instructions. Empty content produces no instruction-only packet.

## Verification

`node --test` covers the planner contract, deterministic travel, relationship,
shop and ecosystem cases; private dormant preparation; evidence-preserving
upgrades and failure atomicity; current and historical reload/retry packets;
author instructions; source edits; omitted-selection withdrawal after departure;
keep/revise/withdraw decisions; automatic host event cadence without corrective
calls; and existing host/runtime safeguards.

These tests verify structure and lifecycle, not live model creativity. The
schema rejects extra style/pacing fields but cannot prove that arbitrary prose
contains no directive. Live RP relevance and the resulting pacing still need
observation with the user's model. No live-model quality claim is made.
