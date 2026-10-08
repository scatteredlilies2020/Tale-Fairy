# Arc-focused planning

The world frame defines the RP's lasting premise. Sagas (displayed as **Broad current**) connect related arcs; arcs are sustained storylines; threads are substantial smaller subplots. These scales remain optional. There is no card quota and no requirement to escalate quiet play.

The director now applies a significance test at creation, retention and selection. An unfinished errand or medical condition does not automatically deserve a subplot. Reviews omit filler rather than renaming it, making it dormant or inventing stakes to preserve it. This is a model judgment, not a deterministic topic/title classifier. The same arm-rehabilitation case may be incidental in a diplomatic sandbox and central in a medical drama.

Type and status are separate: a thread is a smaller subplot, not an active/persistent flag. Stale cards with only hypothetical future relevance should leave the working map; dormancy is reserved for substantial future stories, not indefinite storage. Lack of recent attention alone does not make a substantial story stale. The writer can request review with the existing hidden `<!--tf-review-->` signal, but cannot close cards itself. The next planner review decides; regular reviews remain the fallback if the writer omits the signal. Removal need not imply resolution.

An explicit activity time skip covers ordinary work within that activity. Hospital shifts imply routine rounds and care; mere elapsed time does not. Neither establishes a difficult cure, diagnosis, clearance or major player choice. Dropping preparation does not resolve the underlying condition or rewrite chat and archived plans. The writer still decides scene execution under the user's preset; no automatic offscreen-event simulator was added.

## Checks

`tests/arc-focus.test.js` checks the production contract and exercises review serialization, retention, pruning, archive preservation and writer packets with **mocked responses**. These tests do not prove a model makes the intended choices.

For an optional real-model check using the configured custom planner provider:

```powershell
$env:TF_ST_ROOT = 'C:\path\to\SillyTavern'
$env:TF_EVAL_OUTPUT = Join-Path $env:TEMP ('tf-arc-focus-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
node scripts/evaluate-arc-focus.mjs --live
```

This makes at most four requests, with no retries and no writer requests. It reads saved provider configuration locally, sends only synthetic fixtures and writes reports to a new external directory. It never reads or edits chats. Reasoning defaults to off; `TF_EVAL_REASONING` can select a supported helper mode. Each report records provider configuration and a prompt/schema/fixture hash.

Inspect all returned descriptions, effects, scratchpad and writer packets as well as structural checks:

1. **Hospital activity skip:** keep a border saga, negotiation arc and substantial investigation subplot; remove incidental rehabilitation and generic rounds. Do not assert a cure or recreate the filler with a new title.
2. **No time skip:** remove the same filler even while unresolved; a quiet lunch should not erase the substantial stories or demand fresh tension.
3. **Light festival:** retain a music project and unfolding friendship; discard tea/cable errands and a stale dormant duo project without manufacturing danger, a reunion or personal disclosures.
4. **Central rehabilitation:** retain the same-titled medical case when it is deliberately the central story; bare elapsed time must not invent treatment or an outcome.

Existing preparation is reconsidered on the next successful **Guide now / Re-evaluate** or ordinary review after reloading the extension. No full rebuild or direct saved-chat edits are required.

## v0.19.2 verification

On 2026-10-09, all 1,387 automated tests passed. The final four-case saved-provider smoke run used `gpt-6.1-sol`, reasoning off, with no retries. All structural checks passed. Review of the responses confirmed that both hospital-detour cases omitted the medical filler without inventing recovery; the light festival retained its music/friendship stories while dropping errands and the stale dormant duo; the central rehabilitation case remained an arc with diagnosis and career choices unresolved. Saga and substantive thread support were preserved. Writer packets ranged from 1,145 to 1,322 estimated tokens. This is a small synthetic sample, not a guarantee for every model or a live browser/writer test.
