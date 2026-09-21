# Token safety for story preparation

The single-pass planner and writer handoff share bounded inputs and outputs.
The [RP operating brief](rp-plotting.md) uses the same call and budget. Presets
and model output/reasoning allocations stay unchanged. No AI summarizer,
critic, scanner or retry call is added.

## Planner input

- Fit the actual prompt-only transport: system instructions, schema shorthand,
  escaped source JSON, message framing and a 64-token framing reserve.
- Use a conservative admission estimate with 10% headroom, UTF-8 byte allowance
  for non-ASCII text, and a character floor for long whitespace/data. This is not
  an exact provider tokenizer. Optional evidence also passes this conservative
  shared-budget check; legacy internal allocations retain their older estimate.
- Keep the existing input ceiling. Optional recall and older assistant context
  yield to required sources; required evidence and instructions are not silently
  clipped. Impossible inputs fail locally before a provider request.
- Recheck immediately before sending on direct, profile and active routes. Only
  the active route can use ST's active tokenizer; a different planner model must
  not be measured as though it were the active writer. An unavailable tokenizer
  never disables the conservative guard, and a smaller count cannot lower it.
  Cancellation remains available if the host tokenizer stalls.
- Exposed summaries, host-activated lore and optional memory providers share
  the existing summary budget. Deduplicate exact text and omit whole sources
  that do not fit; do not load whole books or compress sources with another call.

## Writer handoff

- Target under 600 tokens of selected model-authored material. Fit the completed
  TF context to **1,000 conservatively estimated tokens**, including JSON/wrapper
  overhead and saved author instructions.
- Omit whole optional story blocks that do not fit. Never cut a sentence or strip
  a condition from its proposed consequence. An integrated horizon packet is
  atomic; if oversized, all of it stays private for that handoff.
- Stored plans, witnesses and archives remain intact. The notebook and successful
  review status report withheld material. A later ordinary review can replace it;
  omission does not trigger an additional AI request.
- Explicit author instructions remain verbatim. If they alone exceed the limit,
  no generated material is added and a visible warning asks the user to shorten
  the instructions or adjust the host context budget. The cap is therefore not
  an absolute cap on user-authored notes.
- Old swipe snapshots still authenticate against their exact historical bytes;
  outgoing context is rebuilt with the new cap without editing the archive.

## Boundaries and verification

The provider context window must still accommodate input **plus** visible output
and any hidden reasoning allocation. TF cannot guarantee an unknown provider's
tokenizer, advertised limits, or extra host/extension content. These guards bound
TF's contribution; they do not rewrite the writer's history, lore, preset or
response budget. Truncated planner output remains rejected without JSON repair.

Tests exercise multilingual/escaped input, large data and whitespace, exact
budget boundaries, transport preflight, unavailable tokenizers, whole-block
omission, author-note preservation, and cache migration. They are deterministic
engineering checks, not a live-provider or creative-quality evaluation.

See [current local verification](rp-plotting.md#verification). No live-provider
request was made for this update.
