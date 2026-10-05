# Planner prompt concision

The active writer packet contains conditional story material and verbatim author
notes. Historical instruction contracts remain solely for authenticating saved
swipes; current writer requests are rebuilt without those contracts.

The horizon and scene prompts now use direct field instructions, one evidence
rule and one language rule. They request specific people, places and actions,
and omit stock phrases, vague promises and repetition. Response-shape and repair
boilerplate is shorter too.

The horizon prompt fell from 652 to 462 words; the scene prompt from 752 to 554.
Together that is a 28% reduction. Estimated empty request envelopes, including
schemas and framing, fell from 5,652 to 4,618 tokens (18%). Estimates use the
existing local counter, not a provider tokenizer.

Player control, independent NPC/world action, conditional access, source and
memory boundaries, persistent unfinished work, verified lifecycle transitions,
quiet play and explicit bounded-story intent remain covered. The next/later
schema descriptions are now distinct; their shared base objects previously made
both fields inherit the farther-experience wording. Machine fields, enums and
constraints are unchanged.

All 1,221 tests pass. Browser imports and the manifest use concise-prompts=1
through the full dependency chain. Prompt edits change no stored chat, saved
preparation, user instructions or provider settings. Generated prose quality
was not evaluated with live model calls.
