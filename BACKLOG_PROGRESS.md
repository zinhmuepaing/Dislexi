# BACKLOG_PROGRESS.md

Tracks the `BRAINSTORM_BACKLOG_FOR_CLAUDE_CODE.md` session (started 2026-07-26).
Separate from `PROGRESS.md`, which tracks the original build.

Working agreement: propose per item → wait for team input → implement → verify
against `test_folder/` fixtures.

| Item | Status |
|---|---|
| B0 static-image test path | ✅ done, verified |
| B1 §6 heart words | ❌ **built, tested, rejected, fully reverted** |
| B2 §5 quiz pointing | ✅ done — verified end-to-end; retry path unit-tested only |
| B3 §1 concrete-before-abstract | ✅ implemented — awaiting joint test |
| B4 §4 transformation proofs | ✅ implemented — animation never seen running |
| B5 §3 draggable ratio diagram | ✅ implemented — drag + geometry verified |
| B6 visual pacing rework | ✅ implemented — hold times reasoned, not yet felt |

§2 needed no action (already built; confirmed with the team).

---

## B0 — Static-image test path (done)

### Decided

Fixtures are drawn to the **same canvas** the camera fills, inside
`components/CameraStage.tsx`. That was chosen over stubbing OCR/point responses
because it keeps ARCHITECTURE §7 rule 1 intact — OCR, pointing and display still
share one coordinate space — and leaves `captureFrame()`, the §5.1 downscale and
`getCanvas()` completely untouched. The fixture path exercises the real pipeline,
not a mock of it.

- Flag `NEXT_PUBLIC_TEST_IMAGES=1`, mirroring the existing `NEXT_PUBLIC_MOCK_STATS`
  precedent (`components/PracticeSummary.tsx:30`).
- Fixtures served by `app/api/dev/test-image/route.ts`, which **404s when
  `NODE_ENV=production`**. Images stay out of `public/` so ~800 KB of test data
  never ships or becomes publicly reachable.
- Runtime picker chip, persisted to `localStorage`. Runtime switching is a
  requirement, not a convenience: a single still returns the same `locateWord()`
  answer every time, so §5's retry loop would be untestable without it.
- Front/Rear chip hides while a fixture is active (meaningless there); the Mirror
  chip stays, since step 0 still applies to a fixture.

### Implemented

- `app/api/dev/test-image/route.ts` — list + serve, production-disabled.
- `components/CameraStage.tsx` — `imgRef` source, `paint()` extracted from
  `drawLoop`, fixture discovery/load effects, picker chip. `getUserMedia` is
  skipped entirely when a fixture is active, so the app runs with **no camera
  hardware at all**.

### Verified

Route, directly:
- `GET /api/dev/test-image` → all 6 fixtures listed.
- `GET ?name=Exam-Prep_Autospy (1).jpg` → `200 image/jpeg`, 162 950 bytes —
  byte-exact match for the file on disk.
- `GET ?name=../.env.local` → **404** (names are validated against the real
  directory listing, so traversal has nothing to traverse).

In-app on `/autopsy`, with the browser **blocking camera access** — the exact
condition this path exists for:
- Picker rendered with all 6 fixtures; selection persisted across reload.
- Canvas became **960×1280** (fixture native size) with real paper-grey pixels.
- `POST /api/ocr` → **25 blocks**, correctly read ("Diploma in Architectural
  Technology &", "Building Services", …).
- "Help me with this word" → both passes of the two-pass pointing flow returned
  200, and the flow completed through to `coachWord` (practice count 1).

`npx eslint .` clean; `npm run build` passes.

### Bug found and fixed during verification

First attempt drew nothing — canvas stayed 300×150 and black. Cause: `onReady`
fires the consumer's auto-scan, which calls `captureFrame()` **before** the rAF
loop had painted, capturing a blank canvas *and* freezing it. Fixed by
extracting `paint()` and calling it synchronously in `img.onload` before
`onReady`. This is a real ordering constraint, not a fixture quirk.

### Open / not covered

- **Pointing accuracy on fixture (1) — raised, and closed by the team.** The
  line pass returned `"non-corro"`, the line under the hand's *bulk*, ~145 px
  below where the fingertip appears to be. Flagged before B2; team confirmed
  pointing is working as intended, so it was not pursued. Caveat worth keeping:
  B2's live run matched the same word the locator itself had chosen, which is
  self-consistent rather than independent proof of accuracy.
- Trace-to-unlock needs a *moving* fingertip (~5 fps MediaPipe) and cannot be
  exercised by a still image. Device-only.
- Real-world lighting/glare and true on-phone latency remain device-only.

### Incidental

`@fontsource/opendyslexic` was declared in `package.json` but missing from
`node_modules` (stale install after a branch merge), 500-ing every route. Fixed
with `npm install` — no code change, same class as the earlier `lucide-react`
issue.

---

## B1 — §6 heart words — REJECTED AND REVERTED (2026-07-26)

> **Outcome: built, passed every automated test, then failed live testing on
> real words and was fully reverted the same day.** This section is kept
> deliberately. The backlog still lists §6 as a confirmed defect with a
> confident fix spec, and the passing test suite made the implementation look
> correct right up until it met a real student word. Anyone re-reading the
> backlog will be tempted to build exactly this again.
>
> **Before re-attempting §6, read this whole section.**

### What the revert restored

`chunksFor()` is back to its pre-§6 behaviour exactly: curated `WORDS` table,
then the `LETTER_PHONEME` per-letter fallback, with no regular/irregular
distinction anywhere. Reverted via `git checkout HEAD --` on all four files, so
no residue: `grep -i heart` across all `.ts`/`.tsx`/`.mts` returns **no matches**.

Confirmed restored by printing actual output — `said → s|a|i|d`, `was → w|a|s`,
`the → t|h|e`, `who → w|h|o`, `one → o|n|e`, `have → h|a|v|e` — every one of them
sounding out letter by letter like any other uncurated word, matching the
original `Awards → A / Wards / Awards` treatment. Curated words still take
priority (`charge → ch|ar|ge`). No chunk carries a heart flag or a null phoneme.
`logic-tests` pass, `eslint` clean, `npm run build` succeeds.

The §6-specific tests were removed with the revert — they asserted behaviour
that no longer exists.

### What was built (for the record)

A `heart` flag on `GraphemeChunkDef`, a `HEART_WORDS` table seeded with the 13
words from the backlog, `hasHeartChunk()`, a heart badge + `--color-point`
colour in `GraphemeSweep`, and a once-per-session spoken cue in `phonemeSweep`.
`phonemeId` was widened to `string | null` for `one`, the one word with no
decodable part.

### Why the automated verification did not catch it

This is the part worth carrying forward. The §6 test suite was genuinely
thorough — it asserted the real regression (`said` not falling through to
per-letter), checked flag placement, verified unchanged regular paths, and even
read `/public/phonemes` so an invented filename would fail the suite. All of it
passed. **None of it could tell whether the result was any good to listen to**,
because every assertion tested the data table against itself. A table can be
internally perfect and still be the wrong thing to play to a student.

The static-image test path (B0) does not help here either: it removes the need
for a *camera*, not the need for *ears*. Sound-out quality is not observable
from a fixture, a DOM query, or a passing assertion.

**Lesson for the remaining items:** for anything whose output is audio or
pedagogy, a green test suite is evidence the code does what I intended, not
evidence the intent was right. Those items need a listening pass on device
before they are called done — the same way this one only revealed itself there.

### Open — capture before any re-attempt

The specific live failure mode was **not recorded here**, because it was not
reported to me in detail. That gap matters: without it, a future session reading
the backlog's confident §6 spec has no way to know what actually went wrong, and
will likely rebuild something very similar.

Worth writing down while it is fresh: which word was tested, what it sounded
like, and whether the problem was the *chunk splits*, the audible heart part,
the spoken cue, the visual marking, or the whole concept of treating these words
differently mid-sweep. Those point at very different fixes — or at leaving §6
alone permanently.

---

## B1 (superseded) — original implementation notes

### Decided

The backlog asked for the irregular part to be "flagged, not chunked into a
phoneme that doesn't actually exist for that spelling." Implemented as a `heart`
flag on the existing `GraphemeChunkDef` rather than a parallel type, so
`chunkPattern()`, `GraphemeSweep`, the sweep scheduler and the logged
`autopsy_soundout` event all keep working untouched.

**One deliberate refinement over the backlog wording.** A heart chunk still
plays its CORRECT sound for that word (`ai` → the `e` clip in *said*); it is the
`heart` flag, the colour, the icon and the spoken cue that mark it as memorised.
Making it silent instead would leave a hole in the middle of the blend and teach
the student nothing about how the word actually sounds. This does not teach a
false correspondence, because nothing ever claims "ai says /e/" — the cue says
the opposite, explicitly.

- `phonemeId` is now `string | null`; null means genuinely no clip. Only `one`
  uses it — /w/ /u/ /n/ from `o-n-e` cannot be chunked without inventing
  correspondences, so it is a single whole-word heart.
- Cue plays **once per word per session**, then a chime. `the` and `was` recur
  constantly; repeating a sentence-long explanation every time becomes noise.
- Colour is the existing `--color-point` (`#ec4d25`), so heart parts read as
  the same "pay attention here" signal already used elsewhere.

### Implemented

`lib/graphemes.ts` (`HEART_WORDS`, `hasHeartChunk`, `chunksFor` ordering),
`components/GraphemeSweep.tsx` (heart colour + `Heart` badge),
`app/autopsy/page.tsx` (null-safe clip loading, `heartCuedRef`, cue).

### Verified

`npx tsx scripts/logic-tests.mts` — all assertions pass, including:
- `said` no longer falls through to `["s","a","i","d"]` (the actual regression).
- `s|ai|d` with the heart flag on `ai` only, sounding the `e` clip.
- Regular paths unchanged: `charge` → `ch|ar|ge`, `dog` → `d|o|g`, both heart-free.
- Punctuation/case normalise in (`"Said,"` → `s|ai|d`).
- **Every one of the 13 seeded words** is flagged, spells back to itself, and
  references only clips that exist among the 41 files in `/public/phonemes` —
  this test reads the directory, so an invented filename fails the suite.

Actual output confirmed by printing the table (not just a green tick), e.g.
`was → w(w) a♥(o) s♥(z)`, `who → wh♥(h) o(oo_long)`, `one → one♥(silent)`.

Visual: heart badge measured in the real overlay — sits 383 px clear of the
overlay's top edge, `overflow: visible`, so it is not clipped. A screenshot was
not obtainable (the Browser pane wasn't compositing), so **badge legibility over
real printed text is still an on-device check.**

### Open (at the time — now moot, code is gone)

- `chunkPattern()` deliberately unchanged, so heart parts were indistinguishable
  in the logged `grapheme` string.
- `the` / `of`: kept per the backlog's seed list, but they have little decodable
  content and may teach more as plain sight words. Flagged as needing a pedagogy
  review — that review effectively happened live, and the answer was no.

---

## B2 — §5 quiz pointing verification (done)

### The defect

`continueAfterSay` fired `speak("Now point at the word …")` and
`checkPointResult()` in the same instant, both unawaited, so the finger check
began while the instruction was still playing — the student was measured before
they had heard what to point at. `checkPointResult` then called `locateWord()`
exactly once and recorded whatever came back. The quiz's verification step was
effectively theatre.

### Implemented

- `continueAfterSay` is now `async` and **awaits** the prompt before any look.
  Both call sites (`runSayStep`'s timeout, `handleUtterance`) are `void`-ed.
- A settle pause, then up to `QUIZ_POINT_ATTEMPTS` (3) looks, with a spoken
  retry cue between them. Same vocabulary as `pointAndAct`'s miss — one phrasing
  for one failure, rather than a second vocabulary for the same event.
- Abort is re-checked around **every** await, so Skip/End stops the run
  immediately instead of after the loop drains (up to ~15 s of vision calls).
- A miss is never silent: the app says "Let's try the next one" and records it.
  The word is deliberately **not** re-revealed — showing it after a failed
  attempt would make waiting a reliable way to be told the answer.

The retry/abort sequencing lives in `lib/quiz-point.ts` (`attemptPointing`),
extracted from the page **specifically so it is testable without a browser,
camera or vision call**. The page holds only the wiring.

### Two real bugs found while verifying (neither in the backlog)

1. **Concurrent runs.** The point stage has a manual "Check where I'm pointing"
   button that also calls `checkPointResult`. Before this change a run was
   near-instant, so overlap was unlikely; with retries a run spans seconds, and
   the automatic run plus a button tap could both reach `recordResult` and
   advance the quiz twice. Fixed with a single-flight guard (`pointRunRef`)
   released in a `finally`, so no path can leave the Check button dead.
2. **Stale status.** "Finding your finger…" was still on screen at the results
   panel. Pre-existing, but newly obvious; now cleared in the same `finally`.

### Verified

**Headless** (`npx tsx scripts/logic-tests.mts`) — ordering, bounds and abort:
prompt always precedes its look; stops on first success; miss→miss→hit succeeds
on the third; all-miss stops exactly at the bound; abort before the first look
records nothing; a thrown look is not counted as a student miss.

**Mutation-tested, because §6 taught that a green suite proves nothing.** Three
deliberate breakages were introduced to confirm the tests actually fail:

| Mutation | Result |
|---|---|
| Revert to a single attempt (the original bug) | **caught** |
| Remove the abort check after a look | **initially PASSED — test was too weak** |
| Count a network failure as a student miss | **caught** |

The second mutation exposed a genuinely weak test: asserting only on
`aborted`/`used` passed even with the bug, because a pre-look check masked it.
The real symptom is a stale "I couldn't see your finger" cue playing for a word
the quiz has already left. The test now asserts on the call trace and catches
it. **Finding that was worth more than the passing suite.**

**In-app**, `/autopsy` with fixture `Exam-Prep_Autospy (1).jpg`, camera and mic
blocked by the browser: practise → End → Start quiz → say step times out →
pointing step. Result panel: `0 of 1 said right!` (correct — mic blocked) and
**`Pointed correctly: 1 · skipped: 0`**. The check ran after the prompt and
matched `non-corro`.

### Open / not verified

- **The retry path never ran live.** The first look succeeded, so retries and
  the spoken cue are covered by unit tests and mutation testing only. Hearing
  two "I couldn't see your finger" cues in a row is exactly the kind of thing
  §6 proved cannot be judged from a passing assertion — **needs a device pass
  where the student deliberately points at nothing.**
- **Latency is a real UX concern.** One word took ~88 s end-to-end in this run
  (slow TTS synthesis plus the 10 s say window plus two vision round trips).
  A *failed* pointing step now adds two more cues and two more look cycles on
  top. `QUIZ_POINT_ATTEMPTS` may need dropping to 2 after a device test.
- The manual Check button still passes `said: false` hardcoded, discarding
  whether the student said the word correctly. Pre-existing, out of §5 scope,
  worth a follow-up.

---

## B3/B4/B5 — §1, §4, §3 generated tutoring visuals (implemented, awaiting joint test)

### Decided (team, 2026-07-26)

- **Model emits a spec, client renders.** A closed vocabulary in
  `lib/tutor-visual.ts`; the model never sends SVG or coordinates. Anything
  outside the vocabulary is dropped by `parseVisual`, so a hallucinated shape
  degrades to a plain narrated step rather than rendering something broken.
- **Large centred panel**, not a small anchored card. A 5×5 grid offset in a
  corner is not countable on a phone, which defeats the point of §1. It covers
  the worksheet for that step deliberately and clears before the next.
- **Numerals allowed as decoration** — the narration always speaks the count
  too, so nothing depends on reading (backlog §0).
- **Animations auto-play once, then an "Again" button.** No looping beside a
  reading task.

### Implemented

- `lib/tutor-visual.ts` — five specs + `parseVisual` validation + `ratioValue`.
  Pure data, no React, fully testable headlessly.
- `components/VisualCard.tsx` — renderers for all five.
- `lib/tutor-model.ts` — `visual` on `TutorStep`, validated in `mapRawStep`;
  system prompt gained the **concrete-before-abstract rule** (count first,
  formula only in a later step) and the exact allowed shapes.
- `app/tutoring/page.tsx` — one card at a time, keyed by step. A visual and a
  formula never show together, and paper-pointing aids are hidden while a
  visual covers the paper (or the student is directed at something unseeable).
- `app/dev/visuals/page.tsx` — dev-only gallery, gated on
  `NEXT_PUBLIC_TEST_IMAGES`, rendering all five with known specs. Built
  **because §6 proved a passing validator says nothing about whether the
  picture is any good**; this lets a human judge them with no model call.

### Verified

Headless (`logic-tests`): unknown kinds → null; grids clamped to 3 × 12×12;
`slant` kept under the base (it would invert the shape mid-slide); angle clamped
to 10–80°; unknown ratio falls back; real trigonometry (`sin 30 = 0.5`,
`cos 60 = 0.5`, `tan 45 = 1`); and end-to-end through `parseSteps` — a valid
visual survives, an invalid one is stripped **while its step still narrates**.

Mutation-tested (all three caught): unknown kinds passing through; grid size
unclamped; slant allowed to exceed the base.

In the dev gallery, measured from the rendered DOM:
- **50 rects for the Pythagoras case = 9 + 16 + 25.** The identity is literally
  countable on screen, which is the whole §1 claim.
- place-value: 13 flats for 500+800; 17 blocks for 243+125.
- Fold: applying the end-state transform to the left half lands it **exactly**
  on the right half (both cases, sub-0.01px), and the tall vs squat specs
  produce genuinely different triangles.
- Unknown kind renders nothing at all.

### Two real bugs found by looking, not by testing

1. **The ratio triangle's picture lied.** Height was capped to fit the box, so a
   43° triangle was *drawn* at ~38°, and dragging could never exceed ~37° of the
   stated 10–80° range. Rebuilt on a fixed hypotenuse swept from the pivot (the
   "unwrapping the unit circle" construction the backlog cites), so the drawn
   angle now equals the labelled angle: measured 43/43, 71/71, 10/10.
2. **Angle/value mismatch.** The label rounded to whole degrees while the ratio
   was computed from the unrounded angle, so "sin 38°" could show 0.61 when
   sin 38° is 0.62. Angles now snap to whole degrees; also steadier to drag.
   (A third, caught by lint: `foldTriangle` ignored its spec proportions, so
   every triangle rendered identically.)

### Open — for the joint test pass

- **The §4 animations have never been seen running.** The Browser pane reports
  `document.hidden = true` and **0 rAF frames per second**, so the fold and
  slide cannot animate here. Their end-state geometry is proven exact, and the
  timestamp-based tick self-corrects if the app is backgrounded mid-step — but
  whether the motion actually *reads* as a fold at 1.5 s is unjudged.
- **No model output has produced a visual yet.** Everything above uses
  hand-written specs. Whether the prompt actually makes the model emit
  `unitGrid` for a Pythagoras question — and does not spray visuals over
  ordinary questions — is untested. The concrete-before-abstract rule is a
  broad prompt change and **needs a regression check on a plain question**, not
  only on the two fixtures.
- Legibility of the panel over a real worksheet, and drag ergonomics with a
  finger rather than a synthetic pointer, are device-only.

---

## B6 — Visual pacing rework (2026-07-26, after first look)

### The problem (reported from testing)

The panel vanished after a few seconds — no time to count, watch the fold, or
drag anything. Root cause was a design error in B3/B4/B5: I gave the visual the
same lifetime as a `FormulaCard`.

```js
setActiveStep(i);       // visual appears
await speak(step.say);  // ~3s of one sentence
i += 1;                 // visual vanishes
```

A formula is a *glance*; a counting grid or a draggable triangle is an
*activity*. The fold alone consumed 1.85s of a ~3s window, leaving nothing to
absorb it, and exploring a draggable diagram was impossible.

### Decided (team)

1. **Hold time depends on the visual type**, not one blanket number.
2. **Sticky until replaced** — a visual stays up while later steps narrate over
   it, so the tutor can spend several steps on one picture. The strict
   one-at-a-time rule was always about FORMULA cards (REWORK 4) and still
   governs them; visuals don't need it, because highlighting, pointing and the
   formula box carry information in parallel.
3. **Interactive visuals get the floor** — narration goes quiet, invites the
   student to drag, and waits for Next.

### Implemented

`lib/tutor-visual.ts` — `isInteractiveVisual`, `minOnScreenMs`,
`startVisualHold`, and shared animation constants so the hold cannot drift from
the animation it covers. Timing lives here, not in the component, so it is
testable and keeps impure clock calls out of render.

`minOnScreenMs` is a **total** on-screen minimum; `startVisualHold` subtracts
the narration time already spent, so a long sentence doesn't stack on top of it.
Measured: 50-square Pythagoras 6.7s · 24-square grid 3.8s · 500+800 3.8s ·
243+125 4.6s · fold/slide 3.9s (covers the 1.85s animation plus absorb) ·
draggable → waits for Next, auto-advancing after 25s so it can never strand.

`app/tutoring/page.tsx` — sticky visual derived as the most recent visual at or
before the active step, **keyed by the step that introduced it**. Keying by
`activeStep` would remount every step, restarting the animation and discarding
the angle the student had dragged to. Explore mode adds a spoken invite, a Next
button, and `releaseContinue()` wired into every narration-cancelling path
(new question, retake, tapping a transcript step) so the wait can't hang.

### Verified

Pacing tests: counting time scales with how much there is to count; the fold
outlasts its own animation; interactive visuals are untimed; every hold stays
within 2.5–9s whatever the model sends; and `startVisualHold` neither adds time
after a long sentence nor skips the top-up after a short one.

Mutation-tested — both caught: removing the hold entirely (a direct
reproduction of the reported bug), and treating the draggable diagram as timed.

`eslint` clean · `logic-tests` pass · `npm run build` succeeds.

### Still open

Same two gaps as B3/B4/B5, unchanged: the animations have never been seen
running (the Browser pane reports 0 rAF frames), and no model-generated visual
has been produced yet. The hold numbers are reasoned, not felt — expect to tune
them on device.
