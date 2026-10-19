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

## Future Chapters

Tale Fairy can also prepare possible future Chapters in a separate, private outlook. These can draw from canon or introduce original ideas.

They are possibilities, not a fixed itinerary, and are not sent directly to the writing AI. Choose a capacity of **6 (default), 10, or 15** and whether to include canon-based prospects. **Update future plans** develops the outlook; the adjacent **Reroll future plans** replaces Original ideas while preserving useful Canon prospects. Disabling canon keeps saved canon prospects inactive, not deleted. You can also turn future planning off.

Future planning follows the RP or simulation's own premise, scale and rules. Possibilities can branch, converge, coexist or develop independently. Different causes may support a similar event, but preventing it does not require a replacement crisis. Canon and Original prospects share a revisable order with no Canon-first priority; saved Canon cards can wait inactive without occupying every active slot.

## Getting started

1. In SillyTavern, open **Extensions > Install Extension** and paste this repository URL: `https://github.com/scatteredlilies2020/Tale-Fairy`.
2. Reload SillyTavern, open Tale Fairy's settings, and choose the AI connection for planning.
3. Open your chat and select **Guide now**, then check the **Story Board**.

Add author instructions to steer the planning. Use **Guide now / Re-evaluate** to refresh it, or **Full rebuild** to clear generated plans and start fresh while keeping your instructions.

For planning that can finish after you close the browser, see [background planning setup](docs/server-planning.md#installation-and-limits).

## Good to know

- You stay in control of your characters. Plans do not decide their actions or make proposed events part of established history.
- Tale Fairy plans stories. It does not write replies or replace factual memory. It can use Continuity Memory's context when available.
- Planning uses additional AI requests. Browsing cards with `/random`, switching chats or reloading the page makes no new planning calls. Automatic preparation starts after actual user play, or use **Guide now** explicitly. Results depend on the model you choose.
- Private plans can be richer than the writer-facing output. The writer packet aims for 2,400 tokens including instructions, orientation, effects and framing. This is a soft target: complete valid output is saved and included even when larger, without dropping cards or spending another request solely to shorten it.
- Completed story guidance stays available while planning updates, until a new result replaces it. Current play and your latest direction take precedence. Before the first plan is ready, or after deleting preparation, no generated guidance is sent.
- Planner defaults use Low reasoning, six future Chapters, and a 32,768-token context window. Input, output and reasoning share that window. Set **Planner context window** to your endpoint’s actual capacity; smaller active-connection or profile limits also apply. Required references stay complete, and a request that cannot fit stops before contacting the provider.
