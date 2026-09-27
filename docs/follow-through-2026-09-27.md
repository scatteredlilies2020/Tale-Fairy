# Creative developments that enter play

## Issue and change

The saved Republic City selection proposed a match-history wall, but framed it as an optional conditional opportunity. Successful request injection did not establish that the writer would enact it. The latest real reply was a goodnight on Air Temple Island, so an immediate arena scene would have been inappropriate.

- The planner now chooses definite NPC/world initiative and an observable surface, rather than a menu of maybe-hooks. Only genuine time, place and causal prerequisites stay conditional. Player participation and outcomes stay open.
- Previous selected subject IDs reach the next review, without recycling selected prose or treating preparation as accepted history. The planner is asked to retain useful unplayed developments rather than reroll them; changed relevance, contradiction and user choice can still redirect them.
- The writer packet explicitly requests enactment when the circumstances fit, without waiting for player activation, forced travel, time skips or unrelated interruptions.
- The handoff contract counts against the existing 1,000-token packet ceiling. Empty/author-only packets do not acquire it. Previous bounded and pre-budget cached packets still authenticate, but outgoing payloads are rebuilt under the current contract. Saved archives are not rewritten.
- No extra production model pass, chance gate, forced-event scheduler or preset change was added.

## Verification

`node --test`: **902 passed, 0 failed**. Includes contract/budget, selected-identity carry-forward, old-cache authentication, browser integration and existing lifecycle/agency coverage. `git diff --check` passed.

Live isolated evaluation used a frozen 289-message copy of the current Republic City chat and revision 35 preparation. One `gpt-6-sol` planner call produced revision 36: it retained `arena_common_room`, selected the concession-holder actually putting up rescued programs and diagrams, and left Lumine free not to visit or contribute. Omitted private subjects remained saved.

Two separate synthetic user continuations then tested the configured `gemini-3.8-flash` writer, with its saved preset (temperature 0.9, reasoning auto):

| Probe | Observed result |
| --- | --- |
| Wash up and go to bed | Stayed at 9:28 PM on Air Temple Island; no arena wall or forced morning transition. The writer also supplied ordinary NPC cutaways. |
| Explicitly travel with Korra to the arena next morning | Entered the arena concourse. A concession-holder was actively pinning up a salvaged program and play diagram. Korra exchanged dialogue with him about the disputed match. The player did not have to ask for the wall, agree to contribute, or resolve it. |

The existing isolated writer adapter initially rejected this saved provider before any network request. Added narrow text-only Gemini 3.8 support, reusing the installed SillyTavern Google prompt converter, reasoning mapping and safety defaults. Corrected the evaluation snapshot's previously unsupported/null model label only after verifying that every other frozen preset field still matched saved settings. Each successful writer probe made one request; there was no output cherry-picking or regeneration.

Local artifacts are under `C:\Users\candy\.codex\visualizations\2026\09\27\01a0e2bb-e081-7f70-901a-8b51543a0ddc\tf-follow-through` and its `-night` / `-arena` siblings. Successful writer outputs are `003-writer-raw.txt`; earlier attempts stopped at configuration validation.

## Limits

These probes support the specific follow-through fix, not a guarantee that every future generation will be satisfying. They preserve the saved writing preset and static source but do not reproduce runtime World Info or Continuity injection. The arrival probe explicitly supplies the time/location transition; it does not show that the extension forces one. The writer remains generative rather than a deterministic event engine, and the rest of its prose/style was not graded as fixed. No real chat, preset, settings or secrets were modified.

Refresh the SillyTavern page and run **Guide now** to rebuild the current plan under the updated instructions. A server restart is not required.
