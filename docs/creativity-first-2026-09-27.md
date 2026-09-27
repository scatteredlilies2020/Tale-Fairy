# Creativity first — 2026-09-27

## Failure and fix

The saved planner was producing restatements of the scene, not useful invention.
Its access contract required already-available surfaces and prohibited inventing
contact, trips or discoveries; future horizons were omitted when "unsupported".
Together these treated preparation almost like a factual recap.

The active single-pass prompt now makes substantive creative invention the primary
job. It asks for events, NPC agendas, discoveries, relationships and new directions,
including possible answers to mysteries. Existing vague drafts can be revised.
An internal added-value check asks what playable invention remains after removing
known facts. This does not add a model call or a keyword-based creativity validator.

Prompt and schema distinguish evidence for past events from permission to invent
future material. A proposed opportunity can use a plausible bridge through current
people, places, interests or plans before it is offered or accepted. New ideas must
not contradict explicit facts, decide player actions or become witnessed history.
Quiet enjoyment and endings remain valid; invention need not mean conflict.

Browser cache keys were updated for the entry point, active prompt and changed
schema modules. No state migration, chat rewrite, model change or preset edit.

## Checks

- 898 deterministic tests pass, including creative-contract checks, conditional
  invention reaching the writer, and repeated review not promoting a proposal into
  the evidence ledger. These test the contract and plumbing, not artistic quality.
- JavaScript syntax checks and `git diff --check` pass.
- The isolated evaluation harness now matches production's final budget-fitting
  fallback: omit whole optional historical excerpts only at the smallest review
  window, record omissions and reproduce that fitting on offline revalidation.

## Live planner comparison

Frozen 285-message current RP and original saved revision-34 preparation, using
the saved planner configuration (gpt-6-sol, temperature 0.8, low reasoning).
Independent revised trials both started from the original saved state.

| Trial | Selected contribution | Assessment |
| --- | --- | --- |
| Original contract | Prepared guest room, occupied study, sleeping household not confirmed. No future horizon. | Recap; fails added-value test. |
| Revised, first successful trial | Bolin proposes a free neighborhood footwork clinic; the arena manager wants a ticketed promotion. Parents and shopkeepers could offer an alternative venue or supplies. | New NPC purpose, practical tension and a direction beyond the scene. |
| Revised, independent repeat | Bolin wants a neighborhood practice hour; Mako objects to lending gear the team does not own. Families and vendors could supply equipment. | New playable material again, though similar to the first trial; not evidence of broad diversity. |
| Revised, touring-theatre fixture | A proposed address-abbreviation explanation for missing trunks, plus reversible market-stall scenery as an alternative to costume changes. | Invents a possible answer and a creative fallback instead of preserving uncertainty. |
| Revised, quiet-housemates fixture | Jamie proposes repeat photographs of one garden view, building a contact sheet of seasonal changes. | A specific ordinary activity with longer reach, no imposed conflict or player commitment. |

All four successful revised outputs passed the single-call transaction. One earlier
revised request failed with HTTP 502 before returning model output; its failure was
preserved and retried. The original harness also initially failed locally on input
size without a provider call, before the production-parity fix.

The two real-chat variants used the same complete frozen source and budget, but
budget fitting retained different amounts of optional historical material (16
excerpts omitted in the baseline, 17 in the revised prompt). This evaluates the
actual bounded planner, not an identical-token prompt-only experiment.

Judgment: satisfactory improvement over recap-only output for these samples.
Not proof of consistently surprising creativity, long-run quality or improved
writer prose. No writer continuation was generated. Isolated inputs use static
card/persona and extracted history, not live World Info or Continuity injection.
Raw requests, outputs and reports remain in external local evaluation artifacts,
not in the repository or accepted chat.

The installed extension needs a SillyTavern reload and a fresh **Guide now** pass;
installation deliberately does not replace the saved recap or mutate chat metadata.
