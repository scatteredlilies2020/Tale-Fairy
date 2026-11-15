# Tale Fairy

Tale Fairy is an AI story director for SillyTavern. It helps your roleplay develop by keeping track of ongoing stories and suggesting possibilities that fit your world, characters, and interests.

It works with original or canon settings, large casts or one-to-one roleplay. Your usual AI writes the replies, and your preset still controls the writing style.

## What it does

- Organizes the bigger picture without turning every scene into a task list.
- Gives the writing AI useful story context, including relationships, ongoing tensions, and hidden motives.
- Keeps worthwhile unfinished stories in view and lets completed stories leave the board.
- Adapts its plans as your roleplay changes, including after time skips.
- Makes room for quiet scenes without pushing constant conflict or escalation.

## Story cards

The **Story Board** shows your current stories as readable cards:

- **Chapter:** the broad period or situation your roleplay is currently in.
- **Arc:** an ongoing storyline within that Chapter.
- **Subplot:** a smaller, substantial storyline within an Arc.

Cards describe what a story is about and how it influences the world. Several stories can coexist without involving the same characters or being forced together.

Effects are **activity biases**: freely generated kinds of play appropriate to your RP. They encourage the writer to create fitting things to do, encounter or experience through NPC and world initiative. They can support work, discovery, shared pursuits and everyday pleasures as well as challenges. TF generates the labels and substance from each RP; there is no preset catalogue.

Each bias has a signed weight from -10 to +10, a brief explanation of how matching opportunities arise and vary, and a scope. Positive weights encourage that kind of play; negative weights discourage it; zero adds no bias. These are qualitative guidance, not calculated probabilities, per-reply quotas or guaranteed events. The World Frame supplies broad activity foundations; cards can support more focused pursuits. Facts, character attitudes and constraints stay in descriptions rather than becoming recurring reaction orders.

A bias describes a reusable family of activities, not an unfinished objective. Individual jobs and experiences can end while the broader source of opportunities continues. New manifestations should vary in substance, participants and consequences. Effects can stay quiet when unsuitable, and current play and author direction take precedence. TF reviews them separately from their cards; older condition effects can be replaced in the next review without deleting history or closing a genuinely ongoing story.

Every new preparation, whether from **Guide now**, an **automatic review**, or **Full rebuild**, must leave all continuing effects weighted and scoped, including offscreen cards and the World Frame. An incomplete conversion rejects the update and preserves the saved preparation. Supported weighted effects survive omission unchanged; only an explicit update replaces or clears them. Cards may have no effects. Historical saved packets remain readable without rewriting history.

### Understanding every weight

The planner and writer prompt explicitly anchors **+1 as slight**, **+3 as noticeable**, **+10 as strongly favoring matching opportunities**, and **0 as no added bias**. Negative values discourage matching opportunities. All integers between -10 and +10 are valid. Intermediate descriptions below are illustrative interpretations, not separately programmed thresholds, probabilities, or event frequencies.

For a bias named **Shared musical exploration**, scoped to club leisure, matching opportunities could include exchanging songs, trying instruments, composing together, or an optional jam session. A positive weight favors opportunities like these, not guaranteed player participation or successful performances. A negative weight discourages introducing that same activity family; it does not create hostility, sabotage, or a ban on music.

| Positive weight | Illustrative encouragement | Negative weight | Illustrative discouragement |
| --- | --- | --- | --- |
| +1 | Slight nudge | -1 | Slight restraint |
| +2 | Mild encouragement | -2 | Mild discouragement |
| +3 | Noticeable encouragement | -3 | Noticeable discouragement |
| +4 | Clear encouragement | -4 | Clear discouragement |
| +5 | Moderate emphasis | -5 | Moderate restraint |
| +6 | Substantial emphasis | -6 | Substantial restraint |
| +7 | Strong emphasis | -7 | Strong restraint |
| +8 | Very strong emphasis | -8 | Very strong restraint |
| +9 | Near-maximum encouragement | -9 | Near-maximum discouragement |
| +10 | Strongest encouragement allowed | -10 | Strongest discouragement allowed |

**0:** no added push either way. Musical opportunities can still arise naturally from the RP. At every weight, scope, current play, author direction, and player agency take precedence. Even +10 is not an every-reply quota, and -10 is not a prohibition.

## Retry storage

Retry snapshots store identical plans once in a shared table. Existing retry caches migrate automatically when the chat opens; each retry restores an independent copy with its original guidance and validation. Live campaign history stays intact. This lossless storage change does not shorten AI prompts or require a generation.

## Future Chapters

Tale Fairy can also prepare possible future Chapters in a separate, private outlook. These can draw from canon or introduce original ideas.

They are possibilities, not a fixed itinerary, and the full private outlook is not sent directly to the writing AI. The regular guide can create a **story connection**: a present basis, an open way for a future prospect to enter play, and optional scoped influences. Connections are reviewed afresh; they do not choose player responses or make future events established history. A prospect becomes current after accepted play or author direction takes it up, as an Arc within the current Chapter or a broader Chapter transition. Unrelated stories need not all finish first. Choose a **soft card-count target (6 by default)** and whether to include canon-based prospects. **Update future plans** develops the outlook; the adjacent **Reroll future plans** replaces Original ideas while preserving useful Canon prospects. Disabling canon keeps saved canon prospects inactive, not deleted. You can also turn future planning off.

Future planning follows the RP or simulation's own premise, scale and rules. Possibilities can branch, converge, coexist or develop independently. Different causes may support a similar event, but preventing it does not require a replacement crisis. Changed roles, defeated actors and completed events can transform or invalidate canon-derived causes. TF can develop a different route only when surviving causes support it; it does not restore events simply to recover canon. Canon and Original prospects share a revisable order with no Canon-first priority; saved Canon cards can wait inactive without occupying every active slot.

## Getting started

1. In SillyTavern, open **Extensions > Install Extension** and paste this repository URL: `https://github.com/scatteredlilies2020/Tale-Fairy`.
2. Reload SillyTavern, open Tale Fairy's settings, and choose the AI connection for planning.
3. Open your chat and select **Guide now**, then check the **Story Board**.

Add author instructions to steer the planning. Use **Guide now / Re-evaluate** to refresh it, or **Full rebuild** to clear generated plans and start fresh while keeping your instructions.

**Recent problems** shows timestamped current-guide and future-outlook errors for this chat. **Clear problem log** dismisses those errors without deleting preparation, changing request reservations, stopping active work, or retrying a paid request. A new failed attempt is recorded again. Saved failures remain dismissed after a reload.

For planning that can finish after you close the browser, see [background planning setup](docs/server-planning.md#installation-and-limits).

## Good to know

- You stay in control of your characters. Plans do not decide their actions or make proposed events part of established history.
- Tale Fairy plans stories. It does not write replies or replace factual memory. It can use Continuity Memory's context when available.
- Planning uses additional AI requests. **Automatic planning** can be turned off while keeping Guide now and manual future updates. Your review interval governs automatic passes, including after failures; model suggestions and scene markers do not shorten it unless you enable early reviews. Browsing cards with `/random`, switching chats or reloading the page makes no new planning calls. Automatic preparation starts after actual user play, or use **Guide now** explicitly. Results depend on the model you choose.
- Input, memory, setup/review response, writer-context and future-card targets are adjustable in settings. They guide concise output and never reject a complete valid response merely for its size. Target changes let an already-paid response finish.
- Private plans can be richer than the writer-facing output. The writer packet defaults to a 2,400-token target including instructions, orientation, effects and framing. This is a soft target: complete valid output is saved and included even when larger, without dropping cards or spending another request solely to shorten it.
- Pending server jobs retry connection failures with delays up to 60 seconds until they finish or you stop them. Completed runs are reused on reconnect; status polling never generates another plan.
- Completed story guidance stays available while planning updates, until a new result replaces it. Current play and your latest direction take precedence. Before the first plan is ready, or after deleting preparation, no generated guidance is sent.
- Planner defaults use Low reasoning, six future Chapters, and a 32,768-token context window. Input, output and reasoning share that window. Set **Planner context window** to your endpoint’s actual capacity; smaller active-connection or profile limits also apply. **Guide now, automatic planning, Full rebuild and future updates** automatically read oversized CM history/RP references in budgeted chunks, consolidate the notes if needed, then generate the plan. Each reading fills the usable input space after reserving answer/thinking room; fitting inputs need no extra reading calls. Original sources stay unchanged, but distilled notes are lossy. Author instructions, exact recent play and saved preparation remain unabridged; if those alone cannot fit with output headroom, planning stops before buying reading calls.
- Chunked reading adds AI requests, independently for current/future planning. Keep the page open during reading: partial notes are not saved or recoverable final plans. Stop, failure or source edits prevent later stages from installing partial preparation. A later manual run starts reading again; automatic failures still respect your review interval.

## SDK-backed SillyTavern forks

The background planner supports both traditional completion streams and AI SDK
streams used by some ST forks. It keeps final answer text separate from reasoning
and requires the SDK completion signal before recovering a finished plan.
Update the extension and its server plugin together, restart SillyTavern, then
reload the browser.

Forks must also preserve extension request controls when translating older
request fields to their SDK format, including output limits, reasoning settings
and selected credentials. Stream support alone does not provide that backend
translation.
