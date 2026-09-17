# Single-pass plot points and objectives

Historical V1 record. The user's reopened narrative-quality goal and the current
event-opportunity candidate are documented in [event-opportunities.md](event-opportunities.md).

Current user brief (2026-09-18): creative, satisfactory mid-to-long-term plot
material, not perfection or predetermined character development and endings.

## What changed

Campaign mode now requests `tale_fairy_plot_points_v1`. Each subject contains:

- an NPC/world initiative and objective;
- concrete potential plot points;
- connections that let the material develop across events;
- stakes, without prescribing a resolution;
- open player participation.

The writer receives those same labels and decides how to use the material in
the ongoing RP. There is no next-reply script, mandatory payoff, or extra model
stage. The old canonical storage keys remain readable for compatibility, but
new-format writer injection does not expose an `outcomes` or `resolution` field.

Old preparations are not silently relabeled. Their subjects must be rewritten
or explicitly retired in one successful conversion pass; prior complete records
are archived. Later reviews can retain unchanged plot material by omission.
Invalid output retains the previous preparation without a repair call.

Existing source guards, protected player contributions, speaker-label factoring,
one-call transport, cadence, Stop handling, and direct author instructions remain.
The inspector displays stakes and participation. Campaign mode is still opt-in.

## Focused verification

All 661 tests pass. Initial live evaluation is recorded externally in `real-plot-points`
and `touring-plot-points`, continuing their accepted histories. Each conversion
uses one TF call and the saved planner settings/input budget. Isolated writing
uses the user-approved `deepseek-v4.1-flash` substitute; the original writer
preset is retained and live settings are not changed.

The practical test is whether the material offers creative, usable plots and
objectives and can contribute to enjoyable events. Minor rough edges do not
require more tuning, and not every plot must activate in a short check.

## Practical verdict

Satisfactory for this bounded brief, not proof of consistent long-term quality.
The fantasy plan supplies ongoing research, reputation trouble and a faulty
ward-paper trade. Its writer continuation develops Himmel's interest in the
courier selling the party's reputation while Elizabeth remains by the fire as
requested. The touring plan supplies contested versions of music, changing
performance conditions and optional collaborations. Its continuation coherently
handles departure; it does not yet demonstrate the new musical complications.
Earlier sustained continuations support the retained cadence/injection design,
but are not sustained tests of this newly revised prompt.

Both new preparations used exactly one TF request (81.5 and 62.1 seconds).
The fantasy response initially failed on an extra empty-string annotation.
Typed parsing now ignores only such empty extras, and offline validation accepted
the unchanged response with zero further AI calls. Required or nonempty invalid
data still fails. Each subsequent writer check made one ordinary writer request,
not another planning stage.

Remaining weaknesses include some local logistics/repetition and fantasy hooks
that still lean on the existing research network. These are improvement areas,
not reasons to reinstate predetermined resolutions or keep rerolling for polish.
The checks used an approved substitute writer, not the unavailable saved Kimi
route. Host integration is tested without a rendered browser.

## Follow-up: repetition and logistical scaffolding

The planner now distinguishes an ongoing objective from repetitive preparation:
thin retained subjects should be rewritten under the same ID with substantive
new possibilities, while useful unplayed material stays intact. Development
must offer distinct changes to options, relationships, resources or practically
useful knowledge, not just restate a hook or postpone the interesting activity.
Routine arrangements remain connective context unless they contain a worthwhile
conflict or opportunity. Diversity is assessed across retained and new subjects;
new names, locations or branches of one old mystery do not count as variety.
Quiet plots remain valid, with no novelty quota or requirement for escalation.

Writer guidance also discourages repeatedly promising an already-started activity
or adding routine prerequisites, without prescribing immediate uptake, skipping
player choices, or rushing logistics the player enjoys. Prompt text and schema are now part
of the attempt signature so a changed instruction set is not treated as the same
previous attempt. There is still no extra AI stage or semantic repair loop.

The follow-up artifacts are `real-plot-substance` and `touring-plot-substance`
under the external evaluation directory. Three explicitly versioned development
checks per branch were made, not one production pass with hidden retries:
the first failed field-length limits, the second failed retained-capacity or
required-field validation, and the final version passed both in one request each
(51.4 seconds fantasy, 40.4 seconds touring). Original failures remain recorded;
no rejected response was truncated, repaired or injected. A zero-call preflight
preceded these checks. Concise field descriptions, a task reminder after the
source/schema, and explicit retained IDs/free slots address the observed failures.

Semantic assessment is mixed: there are usable consequences around practical
applications of research, circulating reputation, defective household protection,
musical authorship and competing performances. However, the final plans still
contain recycled setup, local arrangements and occasional overprescriptive
phrasing. This is not evidence that those tendencies have been eliminated.

The single approved-substitute writer continuation (`005-writer`, 24.5 seconds)
accepts the player's readiness and departs, reaching the mill fork without another
readiness question. It remains mostly travel description; it does not establish
larger plot uptake. No further planner call was made for that continuation.

A final wording compaction preserves the requirements while avoiding an initial
long-chat budget regression. The 369-message source preflight retains 186 whole
messages including all 184 player contributions, with resolved static source and
production historical extraction: 15,757 estimated input tokens versus 16,132
before compaction, under the saved 16,000 limit. This excludes separately fetched
live World Info/Continuity. The compact wording passes deterministic tests but
has not received another paid live generation; the live samples above record the
longer wording. No player messages were shortened and no budget setting changed.

## Activation

Restart SillyTavern to load the updated server plugin, then reload the browser.
In the desired chat, open Tale Fairy and choose **Try single-pass plot planning**.
This switches that chat to the new planner and preserves its old notebook.
Other chats and live writer settings are unchanged. Test conversations and
preparations are not imported into live RP.
