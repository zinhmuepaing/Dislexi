# Brainstorm Backlog — Harder Explanations, Standing Rules, Bug Fixes

> For Claude Code. Read `ARCHITECTURE.md` first if not already loaded in this session — everything below extends that spec, it doesn't replace any of its 8 non-negotiable pipeline rules.

## 0. Standing rule (applies to every item below, and to any future visual work)

**No visual in this app may require reading a word to be understood.** Color, highlighting/pointing on the worksheet, and audio narration carry the meaning. Text may appear, but only as optional decoration, never as the only way to know what something is. Any item below that mentions a text label means: replace it with highlight + point + audio, the same mechanism `app/tutoring` already uses for step narration.

## Suggested priority order

1. §5 (Autopsy pointing bug) — confirmed defect, breaks the quiz's actual purpose
2. §6 (heart words) — confirmed defect, actively mis-teaches common irregular words
3. §1–§4 — AI Tutoring enhancement backlog, roughly in the order listed

---

## 1. Concrete-before-abstract math visuals (AI Tutoring)

**Idea:** for questions that involve combining or comparing quantities (arithmetic, area), don't narrate the abstract steps alone, generate a countable visual first: place-value blocks for addition/subtraction, unit-square grids for area and Pythagoras (e.g. a 3×3, 4×4, and 5×5 grid of squares to show 9 + 16 = 25 by counting, before ever showing the formula).

**Why:** this is the Concrete-Pictorial-Abstract (CPA) approach, standard in Singapore's own MOE math pedagogy and documented to extend cleanly to geometry, not just early arithmetic. A student should be able to count the proof, not just be told it.

**No-reading note:** any captions under a grid ("3×3 = 9") get replaced with highlight-and-audio: highlight the grid, speak the count, no required label.

**Build note:** this changes what AI Tutoring is expected to generate for any question involving combining/comparing quantities, not just an occasional flourish. Worth an explicit rule in its system prompt: detect this question type, generate the countable visual, narrate over it, only introduce the formula afterward as a shorthand for what was just shown.

## 2. Persistent step trail (AI Tutoring) — status: already built, no action needed right now

`app/tutoring/page.tsx` already keeps every step in state (`steps`), never clears them, and lets the student replay any step via `playStep(i)`. There's a `showText` toggle (default `false`, marked deliberate in-code as `// text hidden by default (S7)`) switching between numbered pills only and a full scrollable list of every step's text.

**Confirmed with the team:** hiding text by default was a deliberate decision. Not a bug, not a gap. No fix needed.

**Banked idea, not a task, revisit only if the S7 reasoning is ever reconsidered:** default to showing just the current step's text plus the immediately previous one, inline, no tap required, full list still available behind the existing toggle for anyone who wants to scroll further back. If pursued later, it must stay strictly optional supporting text, audio narration still carries the explanation, never a reading requirement.

## 3. Draggable ratio diagram (AI Tutoring)

**Idea:** for ratio-based concepts (sin, cos, tan, or any relationship where a quantity changes continuously with another), generate an interactive diagram the student can drag, not a static image. E.g. a right triangle with a fixed hypotenuse where dragging the angle updates the two leg lengths and the resulting sin/cos values live.

**Why:** this is a real, tested teaching method, informally called "unwrapping the unit circle" in the literature, specifically designed to fix the confusion between a symbolic ratio and its value at a specific angle. Dynamic, draggable versions have outperformed even physical manipulatives for this particular kind of concept in comparative studies.

**No-reading note:** side labels ("opposite", "adjacent", "hypotenuse") get replaced with highlight + point + audio when a side is introduced or referenced, not text the student has to read.

**Build note:** this is the most technically expensive of the AI Tutoring ideas, an actual interactive component, not a static image or a highlight on a frozen frame. Prototype last, after §1 is working.

## 4. Animated transformation proofs (AI Tutoring)

**Idea:** for geometry questions where the justification is a spatial transformation, fold, rotate, slide, or rearrange, animate that motion instead of stating the rule in words. Examples: fold an isosceles triangle along its axis of symmetry so the two halves visibly match, proving the base angles are equal; cut a triangular piece off a parallelogram and slide it to the other end to show it becomes a rectangle, proving the area formula; a dissection-based alternate proof of Pythagoras, cut a square into pieces and watch them rearrange to fill another square.

**Why:** this is a real, named tradition in mathematics, "proofs without words" and dissection/rearrangement proofs, not an invented technique. AI Tutoring already draws the line of symmetry for isosceles-triangle questions and explains verbally, the actual fold/overlay animation is the missing piece, confirmed by the team as not yet built.

**Scope test before using this idea on a given problem:** can the truth of the fact actually be seen by watching something move or overlay onto itself? If yes, animate it. If the "why" is a quantity combining, use §1 instead. If it's a ratio changing, use §3 instead. Don't force this onto a fact that isn't actually provable by a physical motion, that would be decoration, not evidence.

**Build note:** works cleanly on a clean, simplified redraw of the shape, not necessarily the exact hand-drawn lines in the worksheet photo. Budget a small "tidy the shape" step before animating it.

---

## 5. BUG — Autopsy quiz pointing verification never actually waits or checks

**Location:** `app/autopsy/page.tsx`, functions `continueAfterSay` (~line 451) and `checkPointResult` (~line 461).

**Root cause 1 — no wait for the prompt:**
```js
void speak(`Now point at the word ${...}.`).catch(() => {});
void checkPointResult(said);
```
Both calls are fire-and-forget, fired in the same instant. `checkPointResult` starts running while the "now point at the word" audio is still playing, not after it finishes. There is no pause for the student to actually move their hand into position.

**Root cause 2 — no gating on the result:**
```js
const word = await locateWord();
pointed = !!word && normalizeWord(word.text) === normalizeWord(item.text);
...
recordResult(q.index, q.results, { word: item.text, said, pointed, skipped: false });
```
`locateWord()` is called exactly once. Whether `pointed` comes back `true` or `false`, `recordResult` fires immediately after and advances to the next word. No retry, no second attempt.

**Important implementation detail:** `locateWord()` (defined ~line 241) is not a cheap local check, it's a real network round trip: capture a frame, mark candidate lines, POST to `/api/point` (vision-model call), then a second zoomed pass to disambiguate the exact word. A fix must account for this real latency, a tight polling loop is the wrong shape here; a small number of spaced, deliberate attempts is the right one.

**Existing correct pattern to match, don't invent a new one:** `pointAndAct` (~line 290), the live coaching flow, already handles a miss correctly: it stops and tells the student "I couldn't see your finger on a word, point clearly and try again." The quiz is the one place that silently swallows a miss and continues. Bring the quiz's behavior in line with this existing pattern.

**Fix spec:**
1. `await` the `speak()` call before starting the finger-check, don't fire both at once.
2. After the prompt finishes, pause briefly for the student to get their finger in place.
3. Call `locateWord()`. On a miss, speak a short retry prompt ("try pointing again"), pause, and try again, bounded to a small number of attempts (e.g. 2–3 total), not an unbounded loop.
4. Only after those genuine attempts: chime and record success, or honestly record a miss (never silently) and move to the next word.

---

## 6. BUG / GAP — Autopsy mis-sounds irregular "heart words"

**Location:** `lib/graphemes.ts`, the `WORDS` curated table, the `LETTER_PHONEME` fallback, and `chunksFor()`.

**The problem, confirmed in code:** every word in the curated `WORDS` table is genuinely regular (`charge`, `chip`, `ship`, `rain`, `boat`...), that part is fine. But any stuck word **not** in that table falls through to `LETTER_PHONEME`, a naive per-letter sound map. This silently mis-teaches every common irregular word a student is likely to actually get stuck on: `said` becomes s + a + i + d (four separate letter sounds) instead of its real pronunciation "sed". The same failure hits `was`, `the`, `of`, `have`, `some`, `come`, `one`, `there`, `where`, `who`, among the highest-frequency words in English, meaning this failure mode triggers constantly, not rarely.

**Why this needs a genuinely different fix, not just more curated entries:** literacy instruction distinguishes decodable words from heart words (also called "red words" in Orton-Gillingham), a heart word has one irregular part that must be memorized, while the rest of the word is still normal and sounds out fine. The correct method is: sound out the regular letters as usual, then explicitly flag the one irregular part as "remember this by heart" instead of forcing a wrong phonetic sound onto it. Adding `said` to the existing `WORDS` table with a fully custom chunk set would still treat it like a regular word, three normal blending sounds, which misrepresents it. This needs a separate data path.

**No-reading note:** the irregular part is marked with a heart icon and a color change, plus an audio cue explaining why it's different ("this part is special, remember it"), never a text label the student has to read to understand what's happening.

**Fix spec:**
1. Add a new table, e.g. `HEART_WORDS: Record<string, HeartWordChunkDef[]>`, alongside the existing `WORDS` table in `lib/graphemes.ts`.
2. Each entry marks which letters are the regular, decodable part (sound out normally, same phoneme-bank mechanism as today) and which single part is irregular (flagged, not chunked into a phoneme that doesn't actually exist for that spelling).
3. `chunksFor()` checks `HEART_WORDS` before falling through to the per-letter fallback.
4. Seed the table with the highest-frequency heart words first: `said`, `was`, `the`, `of`, `have`, `some`, `come`, `one`, `there`, `where`, `who`, `does`, `want`.
5. UI: the irregular chunk renders with a heart icon and a distinct color (already prototyped, matches the standing no-reading rule in §0) instead of a phoneme-bank sound.
