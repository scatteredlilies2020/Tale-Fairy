# Public future entries — 0.16.1

## Change

The prior scene contract returned `selected_material: []`, but host composition still copied `openings[].circumstance` into writer guidance. A valid opening could therefore export present-scene recap or unfinished immediate work.

New scene responses use `tale_fairy_scene_v6` and require `plan.futureEntryVersion: 1`. Each opening separates private `circumstance` and `access` from `futureEntry: { prerequisite, possibility }`. Only the selected entries' essential fictional prerequisites, concrete forthcoming possibilities and durable outlook horizons reach the writer. Private scene grounding, detailed access reasoning and linked local initiatives cannot fill a missing public entry. The new writer selection is validated against its public entries when saved state is loaded, too.

The planner evaluates access at the future entry's own time and circumstances. A later place or contact can remain conditional without being available or known now, committing the player to travel, or interrupting the current scene. NPC-owned work can evolve independently; joint experiences remain conditional on actual participation. Prepared intermediate and farther experiences should enable different play through substantive changes, with worthwhile life beyond the incident where the premise supports it. Routine pauses do not automatically withdraw conditional futures; relevant changes, refusal, rest and bounded closure still can.

## Compatibility and limits

This is an additive saved-plan change. Historical plans without the surface version remain readable, and their exact saved writer packets and archive entries remain unchanged. The next successful preparation writes the new surface; it does not rewrite accepted history. The legacy bounded planner's drafting schema remains unchanged. The common writer field names also remain unchanged.

Normal preparation still has two requests and one shared repair credit, for at most three requests. A missing public entry is invalid output, never a reason to silently copy old private prose. The combined writer packet retains its 1,000-token ceiling and existing repair behavior. Browser imports are invalidated transitively; browser, manifest and detached-plugin release versions agree.

## Verification

The complete `npm test` suite passes: **1,181 tests, zero failures**. New regression coverage exercises the actual preparation/composition path with recap in private opening text, missing entries and bounded repairs, saved-selection integrity, inaccessible/stale routes, historical saved-plan/archive compatibility, and transitive browser cache invalidation. Existing browser lifecycle, retirement, refusal, packet-limit and request-ceiling tests remain passing.

The final synthetic matrix used the configured custom planner (`gpt-6.1-sol`, temperature 0.9, reasoning off). Each case had two initial samples and routine follow-ups, plus a refusal or bounded closure on the first sample. All 25 passes returned valid preparation; every pass used two requests, with zero repairs. No writer packet exceeded the 1,000-token envelope. Frozen inputs were immutable, and the live settings file was unchanged throughout the evaluation.

| Case | Valid passes | Writer tokens, including withdrawal/closure | Pass time |
| --- | ---: | ---: | ---: |
| Fresh journey | 5/5 | 435–680 | 37.6–76.2 s |
| Creative music-club collaboration | 5/5 | 566–648 | 38.8–85.6 s |
| Ordinary relationship life | 5/5 | 340–635 | 33.9–95.0 s |
| Incident-heavy open theatre story | 5/5 | 398–737 | 37.9–91.1 s |
| Deliberately bounded family meal | 5/5 | 0–414 | 21.6–48.1 s |

These are contract acceptance results, not an automatic narrative-quality score. Packet inspection found:

- Journey entries added particular household magic and regional foodways through explicitly conditional later visits, followed by exchanges and changes in how companions remember places. They did not claim travel had occurred.
- Music-club entries added small original musical experiments and independently prepared food. Joint sessions remained voluntary, without professional concerts or competitive goals.
- Relationship entries connected seasonal gardening with learning and seed exchange, alongside Jamie's independent photography, editing and private albums. The player's presence did not gate Jamie's work.
- Theatre futures looked beyond the unresolved costume incident toward composition, different audiences, stagecraft and an optional orchard stay. No costume-search status was copied into the public entries.
- The meal stayed within the evening and could end. Explicit closure cleared writer selection and retired its preparation without inventing a sequel. Its entry prose remained close to the existing conversation; most added substance lay in later ordinary exchange and closure.
- Refused subjects were retired or withdrawn and did not immediately return in disguise. Other independent interests could remain prepared; the writer selection adapted to the stated preference.

Eight of ten routine follow-ups preserved selected horizons byte-for-byte. One incident sample unnecessarily revised Jo's established composing ambition as uncertain; one bounded sample re-authored the same meal trajectory. Neither rerolled the whole shelf, but these are remaining model-stability weaknesses. One music sample's farther sound game added relatively little transformation beyond its earlier phrase-and-response exercise. Preparation is still capable of thin horizons, repeated familiar interests and overly conditional prose; this release does not guarantee creative breadth on every run.

An earlier candidate produced empty writer packets in both journey samples and their routine updates, despite useful private preparation. Those four recorded checks were structurally accepted but failed the intended planner-to-writer result. The conditional-access and ordinary-pause contract was clarified before the final matrix; the earlier results are not counted as successful quality evidence.

## Presets and runtime

Both saved Main presets already contained the revised agency rules, enabled in prompt order. The saved active `Main - Time Duration` prompts still had older opportunity-to-intervene wording. Only those stale Main Instruction and User Agency sentences were updated, with a private settings backup outside the repository. Other prompt text, order, provider/model settings and close-rendering/time-skip rules were preserved.

Browser lifecycle and packet replay are verified by the production-host test harness. Served release files are checked after local installation. A native browser debugging session was unavailable, so the phone's already loaded prompt/runtime text was not inspected. Refresh/restart is still needed to load the installed release and saved active wording. No actual writer reply was generated, so outgoing writer-request inclusion and completed-reply pacing remain separate, unverified evidence levels for this local release.

Deterministic tests enforce field separation, future linkage, access, retirement, repair and compatibility. They cannot prove that arbitrary model-authored public prose is semantically free of recap or consistently interesting. No keyword filter or routine extra model request grades the generated material.

The isolated cross-story evaluation uses synthetic accepted conversations and the production preparation, fitting and serialization path. It saves requests, responses, writer packets, request counts, latency and token measurements outside the repository. It does not generate a story reply, save a live plan, or establish end-to-end pacing improvements.
