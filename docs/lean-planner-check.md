# Lean planner check — 0.14.5

Checked on 2026-09-14 against the configured DeepSeek-compatible proxy. These were isolated planner requests; no generated result was saved into the chat or memory.

The routine pass now targets 6,000 input tokens and 900–1,400 output tokens, with a 4,096 output ceiling and optional thinking disabled. All connection types use the compact response shape for routine passes. Broader reviews retain their 14,000 input default and configured reasoning. Native schema transports otherwise exceeded the smaller routine budget on the current long conversation.

Local estimates (not provider billing counts):

| Measurement | Earlier diagnostics | First lean diagnostic |
| --- | ---: | ---: |
| Input | About 9,600–9,700 tokens | About 5,900 tokens |
| Visible output | 4,410–5,262 tokens | 2,699 tokens |
| Hidden reasoning | 27,488–32,243 characters | 0 characters |
| Elapsed | 100–119 seconds | 43 seconds |

The first lean result passed deterministic validation and applied in memory without deleting the unchanged offscreen history. The planner omitted that unchanged optional board. Supplied malformed boards still fail validation. Following this first probe, routine preparation prose targets were shortened further.

A follow-up probe of those tighter targets failed with `UND_ERR_BODY_TIMEOUT` after roughly five minutes without generated text. End-to-end latency is therefore still variable; the first successful run is not a guarantee that the provider can keep up. The proxy did not return token usage counters.

Writer preparation is bounded to 1,000 estimated tokens by selecting complete records, including their constraints and knowledge boundaries. Omitted records remain saved. On the inspected saved board, rebuilding that block reduced the estimated whole guidance from 2,383 to about 1,802 tokens; that is a local reconstruction, not a newly dispatched story request.

Validation covers direct/profile/active request controls, compact response constraints, retention of omitted offscreen/motive records, whole-record writer selection, context fitting, retry caching, and nonblocking generation. The full suite contains 354 tests.
