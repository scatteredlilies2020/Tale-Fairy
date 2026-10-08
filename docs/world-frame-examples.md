# Genre-calibrated world frames

The frame is a short RP brief, not a lore essay, stat block, plot list or instruction to the writer. It identifies what people do and why those activities keep creating contact, choices and opportunities. Difficulties fit the actual genre: practice and competing schedules can sustain light club play without a threat to anyone's life.

Explicit premise and author direction take precedence over a franchise's usual tone. A single disturbing scene does not automatically convert a light RP into horror. Sandbox breadth and intimate premises are both valid; completed cards or a change of viewpoint do not reset the frame.

## Authored examples

These are illustrative targets, not measured model output or mandatory templates. Executable fixtures in `scripts/world-frame-cases.mjs` also cover Frieren travel, early Clone Wars, hero-school life and an original tuning-fork kingdom. All examples fit the unchanged 600-character ceiling.

### Naruto sandbox

This is a sandbox Naruto RP where hidden villages train young shinobi and sell military services through D- to S-rank missions. Assignments offer pay and advancement but carry risks from hostile shinobi and unreliable intelligence. The Five Great Nations compete through diplomacy, espionage and war. Within villages, training, promotion and clan expectations create rivalries, while markets and shared duties bring civilian and shinobi lives together.

### Light K-On club life

This is a lighthearted K-On school-club RP about making music and enjoying time together. Rehearsals, tea breaks, instrument shopping and festival preparations bring members and classmates together. Performances give practice a goal, while homework, distractions and differing musical tastes complicate getting everyone ready. Learning a song, arranging an outing or welcoming a new member offers something to do together.

### Explicit K-On murder-mystery premise

This is a K-On murder-mystery RP within a school music community. Rehearsals, performances and club friendships connect people whose accounts and loyalties may conflict during investigations. Shared schedules, access to rooms and concern for friends create reasons to compare evidence and ask difficult questions. School obligations continue while suspicion complicates familiar relationships; neither guilt nor the outcome of an inquiry is settled.

## Verification

`node --test tests/world-frame.test.js` checks the production prompt, frame limits, writer-packet delivery, retention, explicit genre changes and correction of inherited passive frames. Mock responses test the contract, not model quality.

For an opt-in real-model smoke test, use the configured custom planner provider from a local SillyTavern instance:

```powershell
$env:TF_ST_ROOT = 'C:\path\to\SillyTavern'
$env:TF_EVAL_OUTPUT = Join-Path $env:TEMP ('tf-world-frames-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
node scripts/evaluate-world-frames.mjs --live
```

This makes at most ten planner requests: seven fresh settings, one incidental dark scene, one explicit genre change, and correction of an inherited Naruto frame. Credentials remain in memory; reports contain synthetic inputs and model output. The output directory must be new and outside this repository. No live chat, preset or setting is changed. Reasoning defaults to off; `TF_EVAL_REASONING` optionally selects `low` or `high`. There are no retries or alternate providers.

Inspect the resulting frames **and cards/effects** for genre fit and concrete recurring activities. Automated checks confirm acceptance, validity, length, retention/update behavior and writer-packet inclusion; they cannot establish prose quality or long-run behavior. This test does not exercise the SillyTavern browser or generate RP replies.

### Release smoke: 2026-10-08

The configured `gpt-6.1-sol` provider completed all ten requests with all structural checks passing. Manual inspection found light K-On cards about club enjoyment, a festival set, sharing songs and neighborhood outings; the mystery premise instead supported evidence, access and trust while preserving music and friendship. An incidental newspaper murder mention retained the light frame verbatim and added no investigation card. Explicit genre direction changed the frame with a reason, and the inherited abstract Naruto frame was corrected without resetting preparation. The full automated suite passed 1,380 tests. These are single-run observations, not guarantees about every generation.

## Existing chats

Reload SillyTavern after updating. **Guide now / Re-evaluate** can correct an inherited passive or genre-mismatched frame while retaining useful preparation and archives. A valid frame remains stable. No full rebuild or deletion of chat data is required.
