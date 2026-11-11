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

Effects are freely generated influences suited to your RP. Each new effect has a keyword or short name, a signed weight from -10 to +10, a brief meaning and causal basis, and a scope. Positive weights favor the named influence, negative weights discourage it, and zero adds no bias. A small weight is a gentle tendency; a large weight is a strong tendency. These are qualitative guidance, not calculated probabilities or guaranteed events.

The World Frame can carry broad thematic influences. Chapters, Arcs and Subplots can carry more local ones. The writer creates varied expressions from current play, including ordinary or quiet scenes. Strong effects do not need to appear in every reply. TF reviews effects separately from their cards: a completed incident can remove an influence without ending its wider story, and repeated reactions do not establish fresh reasons to repeat them.

The writer is encouraged to initiate fitting activities, encounters and opportunities. Current play and author direction take precedence over saved guidance. Older cards remain readable; a new review can replace their prose effects with weighted influences.

## Future Chapters

Tale Fairy can also prepare possible future Chapters in a separate, private outlook. These can draw from canon or introduce original ideas.

They are possibilities, not a fixed itinerary, and the full private outlook is not sent directly to the writing AI. The regular guide can create a **story connection**: a present basis, an open way for a future prospect to enter play, and optional scoped influences. Connections are reviewed afresh; they do not choose player responses or make future events established history. A prospect becomes current after accepted play or author direction takes it up, as an Arc within the current Chapter or a broader Chapter transition. Unrelated stories need not all finish first. Choose a **soft card-count target (6 by default)** and whether to include canon-based prospects. **Update future plans** develops the outlook; the adjacent **Reroll future plans** replaces Original ideas while preserving useful Canon prospects. Disabling canon keeps saved canon prospects inactive, not deleted. You can also turn future planning off.

Future planning follows the RP or simulation's own premise, scale and rules. Possibilities can branch, converge, coexist or develop independently. Different causes may support a similar event, but preventing it does not require a replacement crisis. Changed roles, defeated actors and completed events can transform or invalidate canon-derived causes. TF can develop a different route only when surviving causes support it; it does not restore events simply to recover canon. Canon and Original prospects share a revisable order with no Canon-first priority; saved Canon cards can wait inactive without occupying every active slot.

## Getting started

1. In SillyTavern, open **Extensions > Install Extension** and paste this repository URL: `https://github.com/scatteredlilies2020/Tale-Fairy`.
2. Reload SillyTavern, open Tale Fairy's settings, and choose the AI connection for planning.
3. Open your chat and select **Guide now**, then check the **Story Board**.

Add author instructions to steer the planning. Use **Guide now / Re-evaluate** to refresh it, or **Full rebuild** to clear generated plans and start fresh while keeping your instructions.

For planning that can finish after you close the browser, see [background planning setup](docs/server-planning.md#installation-and-limits).

## Good to know

- You stay in control of your characters. Plans do not decide their actions or make proposed events part of established history.
- Tale Fairy plans stories. It does not write replies or replace factual memory. It can use Continuity Memory's context when available.
- Planning uses additional AI requests. **Automatic planning** can be turned off while keeping Guide now and manual future updates. Your review interval governs automatic passes, including after failures; model suggestions and scene markers do not shorten it unless you enable early reviews. Browsing cards with `/random`, switching chats or reloading the page makes no new planning calls. Automatic preparation starts after actual user play, or use **Guide now** explicitly. Results depend on the model you choose.
- Input, memory, setup/review response, writer-context and future-card targets are adjustable in settings. They guide concise output and never reject a complete valid response merely for its size. Target changes let an already-paid response finish.
- Private plans can be richer than the writer-facing output. The writer packet defaults to a 2,400-token target including instructions, orientation, effects and framing. This is a soft target: complete valid output is saved and included even when larger, without dropping cards or spending another request solely to shorten it.
- Pending server jobs retry connection failures with delays up to 60 seconds until they finish or you stop them. Completed runs are reused on reconnect; status polling never generates another plan.
- Completed story guidance stays available while planning updates, until a new result replaces it. Current play and your latest direction take precedence. Before the first plan is ready, or after deleting preparation, no generated guidance is sent.
- Planner defaults use Low reasoning, six future Chapters, and a 32,768-token context window. Input, output and reasoning share that window. Set **Planner context window** to your endpoint’s actual capacity; smaller active-connection or profile limits also apply. Required references stay complete, and a request that cannot fit stops before contacting the provider.

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
