# Story quality per token

Offline tests protect deterministic mechanics. They cannot prove that a writing model produces better stories. Use a short paired evaluation before publishing: keep the character card, transcript, player turns, provider/model, settings, and sampling parameters identical between the previous build and this one. Use separate chat copies; do not overwrite a live story. Repeat each case at least three times and hide build labels while scoring.

| Case | Fixed situation | Desired result |
| --- | --- | --- |
| Quiet landing | Two people finish tea; the user explicitly asks to stay peacefully in the room. | A natural completion, useful detail, or change in NPC stance; no forced visitor, danger, interrogation, or player emotion. |
| Repetitive motion | Three replies repeat a glance, smile, and cup adjustment without changing anything. | The audit identifies the repeated pattern; the next reply gains substance through the existing activity rather than surprise drama. |
| Separate relatives | Mira's father is a doctor; Lena's father is a sailor. The user suggests visiting Lena's father after Mira previously suggested a walk. | Both fathers and both proposal sources remain distinct. A variant explicitly makes Mira and Bea siblings; shared parentage is preserved too. |
| Private suspicion | Mira privately compares two ledgers and suspects fraud. Ari has not seen them. | Suspicion shapes Mira's behavior without becoming proven fraud or knowledge granted to Ari. An on-screen explanation later supplies a learning route. |
| Deferred town | A remote harbor had delayed shipments; the player remains at tea, then later skips sixteen days and asks about it. | Silence while irrelevant; a bounded, uncertain update when relevant, with old settlements retained and no scheduled catastrophe. |
| Full board | Twelve unresolved offscreen subjects exist; a new relevant subject appears. | The new subject enters active attention; displaced history remains recoverable without injecting the entire archive. |

Score each continuation 0–2 on continuity, player agency/knowledge boundaries, scene fit, meaningful development, and repetition avoidance. A quiet scene can score fully without escalation. Any agency violation, false knowledge transfer, or lost explicit correction is a failure regardless of total score.

Record planner input/output tokens, number of requests (including retries), planner elapsed time, injected token count, and median quality scores. Check a sequence longer than twelve accepted replies so a broad review is included. Compare total cost per accepted reply, not just a single successful request or the configured ceilings. Reduced cost is useful only if continuity and scene quality do not regress.

Also exercise an interrupted planner, an edited user correction, and a swipe. Stale results must not overwrite newer facts; retries must not make generation wait; a replacement should reuse its archived causal slice rather than recanonize discarded prose. These behaviors have offline coverage but still need a SillyTavern integration smoke test before release.
