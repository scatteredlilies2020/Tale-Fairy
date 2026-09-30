# Token safety for story preparation

The planner uses soft input/output targets; the writer handoff fits optional material.
The [RP operating brief](rp-plotting.md) uses the same call and budget. Presets
and model output/reasoning allocations stay unchanged. No AI summarizer,
critic or scanner is added. Output validation or best-effort shortening can use
one correction request, never an unbounded retry loop.

## Planner input

- Fit the actual prompt-only transport: system instructions, schema shorthand,
  escaped source JSON, message framing and a 64-token framing reserve.
- Use a conservative admission estimate with 10% headroom, UTF-8 byte allowance
  for non-ASCII text, and a character floor for long whitespace/data. This is not
  an exact provider tokenizer. Optional evidence also passes this conservative
  shared-budget check; legacy internal allocations retain their older estimate.
- Target 10,000 input tokens by default (previously 8,000). Optional recall and
  older assistant context yield to required sources. Source, saved plan, new
  player contributions and the latest exchange are never clipped for size.
  If these alone exceed the target, send them intact and report the overrun;
  a token estimate is not a local request failure. Provider limits still apply.
- Before shrinking the conversation or shedding historical excerpts, try
  lossless request compaction. The progress ledger uses shared subject, source
  and witness tables, with common provenance fields stated once. Every episode,
  status, exact quote and source field remains reconstructible. If needed,
  accepted-message spans use `[span, text]` rows with their columns stated once.
  Span numbers, text, speakers and evidence validation inputs stay unchanged.
  Neither encoding rewrites saved preparation, canon or chat text. Each candidate
  is measured against the full envelope and used only if it saves tokens.
- Shed whole reviewed messages, oldest first, including the opening when an
  exact source-prefix checkpoint proves it was reviewed. Preserve the latest
  user and assistant messages even during a manual replan. Without verified
  coverage, no player contributions qualify as optional. Label omissions;
  they prove neither absence nor resolution. The growing history/episode
  ledger remains local, not another mandatory request block.
- Recheck immediately before sending on direct, profile and active routes. Only
  the active route can use ST's active tokenizer; a different planner model must
  not be measured as though it were the active writer. An unavailable tokenizer
  never disables the conservative guard, and a smaller count cannot lower it.
  Cancellation remains available if the host tokenizer stalls.
  If the active tokenizer finds an overrun, try the same lossless compaction
  against its count, followed by whole optional-context fitting. Already
  compacted inputs are not encoded twice. Validate new citations against the
  actual sent prompt, not an earlier, larger candidate. Input fitting needs
  no generation or provider retry. Legacy strict budget helpers remain available;
  all three active planner transports explicitly use the soft-target policy.
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
tokenizer, advertised limits, or extra host/extension content. These controls fit
TF's contribution; they do not rewrite the writer's history, lore, preset or
response budget. Truncated planner output is never partly committed; one complete
replacement response may be requested.

Tests exercise lossless ledger/span reconstruction, growing progress ledgers,
distinct same-message witnesses, unknown fields, tokenizer-driven compaction,
multilingual/escaped input, large data and whitespace, exact
budget boundaries, transport preflight, unavailable tokenizers, whole-block
omission, author-note preservation, and cache migration. They are deterministic
engineering checks, not a live-provider or creative-quality evaluation.

See [current local verification](rp-plotting.md#verification). No live-provider
request was made for this update.
