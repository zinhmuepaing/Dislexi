/**
 * Pure-logic tests for the pipeline helpers (no live credentials needed).
 * Run: npx tsx scripts/logic-tests.mts
 */

import assert from "node:assert/strict";
import { subBoxFor, type OcrBox } from "../components/KaraokeHighlight";
import {
  nearestBlock,
  traceSatisfied,
  boxCenter,
  selectWordAt,
  DwellTracker,
} from "../lib/hand-tracker";
import { chunksFor, chunkPattern, normalizeWord } from "../lib/graphemes";
import { computeStats } from "../lib/analytics";
import {
  parseSteps,
  stripMarkdown,
  scanTopLevelObjects,
  parseStepObject,
  stepsFromStream,
} from "../lib/tutor-model";
import { buildSentences, buildParagraphs, blockToSentenceMap, localWordAt } from "../lib/sentences";
import { fastParseCommand } from "../lib/voice-commands";
import { syllablesOf, coachingLines } from "../lib/syllables";
import { similarity, saidWordMatches, bestWordMatch } from "../lib/text-match";
import { buildLineMarks, buildWordMarks } from "../lib/marks";
import { attemptPointing } from "../lib/quiz-point";
import {
  isInteractiveVisual,
  minOnScreenMs,
  parseVisual,
  ratioValue,
  startVisualHold,
  VISUAL_ANIM_DELAY_MS,
  VISUAL_ANIM_MS,
  type FoldTriangleSpec,
  type PlaceValueSpec,
  type RatioTriangleSpec,
  type RearrangeParallelogramSpec,
  type UnitGridSpec,
} from "../lib/tutor-visual";

const box = (l: number, t: number, r: number, b: number): [number, number][] => [
  [l, t],
  [r, t],
  [r, b],
  [l, b],
];

// ── subBoxFor: proportional char-count split (§7 rule 7) ─────────────────────
{
  const blk: OcrBox = { text: "abcd", box: box(0, 0, 100, 20) };
  const r = subBoxFor(blk, 1, 2); // "bc" → x 25..75
  assert.deepEqual(r, { x: 25, y: 0, w: 50, h: 20 });
  const full = subBoxFor(blk, 0, 4);
  assert.deepEqual(full, { x: 0, y: 0, w: 100, h: 20 });
  const clampedLen = subBoxFor(blk, 2, 99); // overrun clamps to block end
  assert.deepEqual(clampedLen, { x: 50, y: 0, w: 50, h: 20 });
}

// ── nearestBlock: Euclidean to center, ties → topmost (§7 rule 5) ────────────
{
  const a: OcrBox = { text: "a", box: box(0, 0, 10, 10) }; // center (5,5)
  const b: OcrBox = { text: "b", box: box(20, 0, 30, 10) }; // center (25,5)
  assert.equal(nearestBlock({ x: 6, y: 5 }, [a, b]), a);
  assert.equal(nearestBlock({ x: 24, y: 5 }, [a, b]), b);
  // Tie: point equidistant from both centers → topmost wins.
  const top: OcrBox = { text: "top", box: box(0, 0, 10, 10) }; // center (5,5)
  const bottom: OcrBox = { text: "bottom", box: box(0, 20, 10, 30) }; // center (5,25)
  assert.equal(nearestBlock({ x: 5, y: 15 }, [bottom, top]), top);
  assert.equal(nearestBlock({ x: 5, y: 15 }, []), null);
  assert.deepEqual(boxCenter(box(0, 0, 10, 20)), { x: 5, y: 10 });
}

// ── selectWordAt: containment first, rect-distance fallback, reject far ──────
{
  // Two stacked lines, 20px tall, 400px wide (line-level OCR shapes).
  const line1: OcrBox = { text: "line one", box: box(50, 100, 450, 120) };
  const line2: OcrBox = { text: "line two", box: box(50, 140, 450, 160) };
  const lines = [line1, line2];

  // Inside a box → that box, even when the other box's CENTER is closer.
  assert.equal(selectWordAt({ x: 60, y: 110 }, lines), line1);
  assert.equal(selectWordAt({ x: 60, y: 150 }, lines), line2);
  // Between the lines, nearer line2's edge → line2.
  assert.equal(selectWordAt({ x: 200, y: 136 }, lines), line2);
  // Occlusion prior: equidistant between the lines → the box ABOVE wins
  // (the finger covers what sits under the tip).
  assert.equal(selectWordAt({ x: 200, y: 130 }, lines), line1);
  // Far below everything (> 3 line heights = 60px from line2) → null.
  assert.equal(selectWordAt({ x: 200, y: 260 }, lines), null);
  assert.equal(selectWordAt({ x: 200, y: 110 }, []), null);
}

// ── DwellTracker: dwell fires once, refractory blocks, rearm re-enables ──────
{
  const d = new DwellTracker(600, 200, 400);
  assert.equal(d.update("w1", 0).fired, null); // just arrived
  assert.equal(d.update("w1", 300).fired, null); // progress ~0.5
  assert.equal(d.update("w1", 650).fired, "w1"); // dwell reached → fires
  assert.equal(d.update("w1", 1300).fired, null); // refractory: no refire
  // Brief dropout within grace keeps the candidate alive.
  const d2 = new DwellTracker(600, 200, 400);
  d2.update("w1", 0);
  assert.equal(d2.update(null, 150).hover, "w1"); // grace bridges the gap
  assert.equal(d2.update("w1", 650).fired, "w1");
  // rearm(): the same word may fire again after another full dwell.
  d2.rearm("w1");
  assert.equal(d2.update("w1", 700).fired, null); // dwell restarts
  // Away for >= releaseMs also rearms.
  const d3 = new DwellTracker(600, 200, 400);
  d3.update("w1", 0);
  d3.update("w1", 650); // fired
  d3.update(null, 900); // away (past grace)
  d3.update(null, 1400); // away >= 400ms → rearmed
  d3.update("w1", 1500);
  assert.equal(d3.update("w1", 2200).fired, "w1"); // fires again
}

// ── traceSatisfied: inside padded box + net left-to-right > 60% width ────────
{
  const wordBox = box(100, 100, 200, 130); // width 100
  const sweep = [
    { x: 105, y: 110 },
    { x: 140, y: 115 },
    { x: 180, y: 112 },
  ];
  assert.equal(traceSatisfied(sweep, wordBox), true);
  // Not enough horizontal travel (< 60 px net).
  assert.equal(
    traceSatisfied(
      [
        { x: 105, y: 110 },
        { x: 150, y: 110 },
      ],
      wordBox,
    ),
    false,
  );
  // Points outside the padded box don't count.
  assert.equal(
    traceSatisfied(
      [
        { x: 0, y: 0 },
        { x: 500, y: 500 },
      ],
      wordBox,
    ),
    false,
  );
  // Right-to-left is rejected (net motion must be left-to-right).
  assert.equal(
    traceSatisfied(
      [
        { x: 190, y: 110 },
        { x: 105, y: 110 },
      ],
      wordBox,
    ),
    false,
  );
  // 20% padding: slightly outside the box still counts.
  assert.equal(
    traceSatisfied(
      [
        { x: 85, y: 110 }, // 15px left of box, inside 20px pad
        { x: 190, y: 110 },
      ],
      wordBox,
    ),
    true,
  );
}

// ── graphemes: curated table + per-letter fallback, never empty for words ────
{
  assert.equal(chunkPattern(chunksFor("charge")), "ch|ar|ge");
  assert.equal(chunkPattern(chunksFor("Charge!")), "ch|ar|ge"); // normalized lookup
  assert.deepEqual(
    chunksFor("ship").map((ch) => ch.phonemeId),
    ["sh", "i", "p"],
  );
  // Unknown word → per-letter fallback.
  assert.equal(chunkPattern(chunksFor("dog")), "d|o|g");
  assert.equal(normalizeWord("“Book,”"), "book");
  assert.deepEqual(chunksFor("123"), []);
}

// ── tutor visuals: closed vocabulary, clamped, unknown dropped (§1/§3/§4) ────
{
  // Unknown / malformed shapes must DROP to null, so a hallucinated visual
  // degrades to a normal narrated step instead of rendering something broken.
  assert.equal(parseVisual(null), null);
  assert.equal(parseVisual("unitGrid"), null);
  assert.equal(parseVisual({ kind: "spiralGalaxy" }), null);
  assert.equal(parseVisual({ kind: "unitGrid" }), null); // no grids
  assert.equal(parseVisual({ kind: "unitGrid", grids: [] }), null);
  assert.equal(parseVisual({ kind: "placeValue", rows: [{ hundreds: 0, tens: 0, ones: 0 }] }), null);

  // §1 Pythagoras by counting: 3x3 + 4x4 = 5x5.
  const g = parseVisual({
    kind: "unitGrid",
    grids: [{ rows: 3, cols: 3 }, { rows: 4, cols: 4 }, { rows: 5, cols: 5 }],
  }) as UnitGridSpec;
  assert.equal(g.kind, "unitGrid");
  assert.equal(g.grids.length, 3);
  assert.deepEqual(g.grids.map((x) => x.rows * x.cols), [9, 16, 25]);
  assert.equal(9 + 16, 25, "the visual must state a true fact");

  // Bounds: at most 3 grids, each at most 12x12 — an uncountable grid defeats
  // the whole point of a "concrete" visual.
  const big = parseVisual({
    kind: "unitGrid",
    grids: [{ rows: 40, cols: 40 }, { rows: 2, cols: 2 }, { rows: 2, cols: 2 }, { rows: 2, cols: 2 }],
  }) as UnitGridSpec;
  assert.equal(big.grids.length, 3);
  assert.deepEqual(big.grids[0], { rows: 12, cols: 12 });

  // Garbage numerics fall back rather than producing NaN geometry.
  assert.equal(parseVisual({ kind: "unitGrid", grids: [{ rows: "x", cols: 3 }] }), null);

  const pv = parseVisual({
    kind: "placeValue",
    rows: [{ hundreds: 5, tens: 0, ones: 0 }, { hundreds: 8, tens: 0, ones: 0 }],
  }) as PlaceValueSpec;
  assert.equal(pv.rows.length, 2);
  assert.equal(pv.rows[0].hundreds * 100 + pv.rows[1].hundreds * 100, 1300);

  // §4 fold: proportions are carried through (the renderer scales by them).
  const f = parseVisual({ kind: "foldTriangle", base: 10, height: 12 }) as FoldTriangleSpec;
  assert.deepEqual([f.base, f.height], [10, 12]);

  // §4 rearrange: a slant wider than the base would invert the shape mid-slide.
  const rp = parseVisual({
    kind: "rearrangeParallelogram", base: 10, height: 7, slant: 50,
  }) as RearrangeParallelogramSpec;
  assert.ok(rp.slant <= rp.base * 0.8, `slant ${rp.slant} must stay under the base`);

  // §3 ratio triangle: angle clamped away from degenerate, ratio whitelisted.
  const r1 = parseVisual({ kind: "ratioTriangle", angleDeg: 43, ratio: "sin", adjacent: 35 }) as RatioTriangleSpec;
  assert.deepEqual([r1.angleDeg, r1.ratio, r1.adjacent], [43, "sin", 35]);
  const r2 = parseVisual({ kind: "ratioTriangle", angleDeg: 0.4, ratio: "wat" }) as RatioTriangleSpec;
  assert.equal(r2.angleDeg, 10, "sub-10° collapses to an invisible triangle");
  assert.equal(r2.ratio, "sin", "unknown ratio falls back rather than rendering blank");
  const r3 = parseVisual({ kind: "ratioTriangle", angleDeg: 179 }) as RatioTriangleSpec;
  assert.equal(r3.angleDeg, 80);
  assert.equal((parseVisual({ kind: "ratioTriangle", angleDeg: 40, adjacent: -5 }) as RatioTriangleSpec).adjacent, undefined);

  // The ratio readout must be real trigonometry, not a lookup.
  assert.ok(Math.abs(ratioValue("sin", 30) - 0.5) < 1e-9);
  assert.ok(Math.abs(ratioValue("cos", 60) - 0.5) < 1e-9);
  assert.ok(Math.abs(ratioValue("tan", 45) - 1) < 1e-9);

  // End-to-end through the step mapper: a visual survives, junk does not.
  const steps = parseSteps(
    JSON.stringify({
      steps: [
        { say: "Count them.", region: { x: 0, y: 0, w: 1, h: 1 }, visual: { kind: "unitGrid", grids: [{ rows: 3, cols: 3 }] } },
        { say: "Now the rule.", region: { x: 0, y: 0, w: 1, h: 1 }, formula: "a^2+b^2=c^2" },
        { say: "Bad shape.", region: { x: 0, y: 0, w: 1, h: 1 }, visual: { kind: "nope" } },
      ],
    }),
  );
  assert.equal(steps.length, 3);
  assert.equal(steps[0].visual?.kind, "unitGrid");
  assert.equal(steps[1].visual, undefined);
  assert.equal(steps[1].formula, "a^2+b^2=c^2");
  assert.equal(steps[2].visual, undefined, "invalid visual must not reach the client");
  assert.equal(steps[2].say, "Bad shape.", "…but the step itself still narrates");
}

// ── visual pacing: a visual is an activity, not a glance ────────────────────
{
  const grid = (n: number) => parseVisual({ kind: "unitGrid", grids: [{ rows: n, cols: n }] })!;
  const pyth = parseVisual({
    kind: "unitGrid", grids: [{ rows: 3, cols: 3 }, { rows: 4, cols: 4 }, { rows: 5, cols: 5 }],
  })!;
  const fold = parseVisual({ kind: "foldTriangle", base: 10, height: 12 })!;
  const drag = parseVisual({ kind: "ratioTriangle", angleDeg: 43, ratio: "sin" })!;

  // Only the draggable one hands control to the student.
  assert.equal(isInteractiveVisual(drag), true);
  assert.equal(isInteractiveVisual(fold), false);
  assert.equal(isInteractiveVisual(pyth), false);

  // More to count = more time. This is the whole point of the change.
  assert.ok(minOnScreenMs(grid(6)) > minOnScreenMs(grid(2)),
    "a 36-square grid must outlast a 4-square one");
  assert.ok(minOnScreenMs(pyth) >= 6000, `50 squares needs real time, got ${minOnScreenMs(pyth)}`);

  // The motion must be able to FINISH before anything moves on — the original
  // bug was a ~3s window for a 1.85s animation with no time to absorb it.
  assert.ok(minOnScreenMs(fold) > VISUAL_ANIM_DELAY_MS + VISUAL_ANIM_MS,
    "the fold must outlast its own animation");

  // Interactive visuals are not timed at all.
  assert.equal(minOnScreenMs(drag), 0);

  // Never absurd in either direction, whatever the model sends.
  for (const v of [grid(1), grid(12), pyth, fold]) {
    const ms = minOnScreenMs(v);
    assert.ok(ms >= 2500 && ms <= 9000, `${v.kind} hold ${ms}ms out of range`);
  }

  // startVisualHold subtracts time already spent narrating, so a long sentence
  // does not add its length on top of the hold.
  let clock = 0;
  const hold = startVisualHold(() => clock);
  clock = 99_999; // narration ran far longer than the minimum
  assert.equal(await hold(pyth), 0, "an over-long narration must not add extra wait");

  let clock2 = 0;
  const hold2 = startVisualHold(() => clock2);
  clock2 = 500; // a very short sentence
  const waited = await hold2(fold);
  assert.ok(waited > 0 && waited <= minOnScreenMs(fold),
    `a short sentence must be topped up, waited ${waited}`);
}

// ── quiz pointing: bounded retries, ordering, abort (backlog §5) ─────────────
{
  type W = { text: string };
  const target = (w: W) => w.text === "awards";
  // Records the exact interleaving of prompts and looks.
  const trace: string[] = [];
  const opts = (over: Partial<Parameters<typeof attemptPointing<W>>[0]>) => ({
    attempts: 3,
    locate: async () => null,
    matches: target,
    isActive: () => true,
    beforeAttempt: async (a: number) => void trace.push(`before:${a}`),
    ...over,
  });

  // The prompt/settle ALWAYS precedes its look — the actual §5 bug was these
  // firing simultaneously, measuring the student before they had heard it.
  trace.length = 0;
  await attemptPointing<W>(
    opts({
      locate: async () => {
        trace.push("look");
        return null;
      },
    }),
  );
  assert.deepEqual(trace, ["before:0", "look", "before:1", "look", "before:2", "look"]);

  // Hit on the first look → exactly one look, no retry cue.
  let looks = 0;
  let r = await attemptPointing<W>(
    opts({
      locate: async () => {
        looks++;
        return { text: "awards" };
      },
    }),
  );
  assert.deepEqual([r.pointed, r.looked, r.aborted, r.used], [true, true, false, 1]);
  assert.equal(looks, 1, "must stop as soon as the student is right");

  // Miss, miss, hit → succeeds on the third; retries are real, not decorative.
  looks = 0;
  r = await attemptPointing<W>(
    opts({
      locate: async () => (++looks < 3 ? { text: "other" } : { text: "awards" }),
    }),
  );
  assert.deepEqual([r.pointed, r.used, r.aborted], [true, 3, false]);

  // All misses → bounded at `attempts`, never unbounded, and honestly false.
  looks = 0;
  r = await attemptPointing<W>(
    opts({
      locate: async () => {
        looks++;
        return { text: "other" };
      },
    }),
  );
  assert.deepEqual([r.pointed, r.looked, r.aborted, r.used], [false, true, false, 3]);
  assert.equal(looks, 3, "must not exceed the attempt bound");

  // Abort BEFORE the first look (Skip during the prompt) → nothing looked at,
  // aborted set so the caller records nothing.
  r = await attemptPointing<W>(opts({ isActive: () => false }));
  assert.deepEqual([r.aborted, r.looked, r.used], [true, false, 0]);

  // Abort BETWEEN attempts → stops immediately; the caller must not record.
  // The trace assertion is the load-bearing one: without an abort check AFTER
  // the look, the loop still runs beforeAttempt(1) and the student hears "I
  // couldn't see your finger" for a word the quiz has already moved past.
  // (A pre-look check alone leaves that stale prompt in place, so asserting
  // only on `aborted`/`used` passes even with the bug present.)
  trace.length = 0;
  looks = 0;
  r = await attemptPointing<W>(
    opts({
      locate: async () => {
        looks++;
        trace.push("look");
        return { text: "other" };
      },
      isActive: () => looks < 1, // goes false right after the first look
    }),
  );
  assert.equal(r.aborted, true);
  assert.equal(looks, 1, "aborting mid-run must not keep burning vision calls");
  assert.deepEqual(trace, ["before:0", "look"], "no retry cue may play after an abort");

  // A throwing look is not a student miss: `looked` stays false when EVERY
  // attempt throws, so the caller can record null instead of a false failure.
  r = await attemptPointing<W>(
    opts({
      locate: async () => {
        throw new Error("network");
      },
    }),
  );
  assert.deepEqual([r.pointed, r.looked, r.aborted, r.used], [false, false, false, 3]);

  // …but one good look after a throw still counts as having looked.
  looks = 0;
  r = await attemptPointing<W>(
    opts({
      locate: async () => {
        if (++looks === 1) throw new Error("network");
        return { text: "other" };
      },
    }),
  );
  assert.deepEqual([r.pointed, r.looked], [false, true]);
}

// ── computeStats: counts, rereads, top words, pacing ─────────────────────────
{
  const t = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();
  const stats = computeStats([
    { ts: t(0), type: "read", word: "cat", grapheme: null, question_ref: null },
    { ts: t(10), type: "reread", word: "cat", grapheme: null, question_ref: "Q2" },
    { ts: t(30), type: "reread", word: "cat", grapheme: null, question_ref: "Q2" },
    { ts: t(40), type: "stuck_word", word: "charge", grapheme: "ch|ar|ge", question_ref: null },
  ]);
  assert.equal(stats.totalEvents, 4);
  assert.deepEqual(stats.countsByType, { read: 1, reread: 2, stuck_word: 1 });
  assert.deepEqual(stats.rereadsByQuestion, { Q2: 2 });
  assert.equal(stats.topWords[0].word, "cat");
  assert.deepEqual(stats.pacingGapsSeconds, [10, 20, 10]);
  assert.equal(stats.medianGapSeconds, 10);
}

// ── text-match: quiz answer verification (deterministic, no model) ───────────
{
  assert.equal(similarity("awards", "Awards"), 1);
  assert.ok(similarity("awards", "award") >= 0.8); // minor STT slip passes
  assert.ok(similarity("cat", "elephant") < 0.3);
  assert.equal(saidWordMatches("Awards", "awards"), true);
  assert.equal(saidWordMatches("um it says awards I think", "awards"), true);
  assert.equal(saidWordMatches("a words", "awards"), true); // STT split — embedded match
  assert.equal(saidWordMatches("banana", "awards"), false);
  assert.equal(saidWordMatches("", "awards"), false);
}

// ── bestWordMatch: set-of-marks word resolution within the marked line ───────
{
  const line = ["Find", "the", "perimeter", "of", "the", "rectangle"];
  assert.deepEqual(bestWordMatch(line, "perimeter"), { index: 2, score: 1 });
  assert.equal(bestWordMatch(line, "perimetre")!.index, 2); // model misread → still matches
  assert.equal(bestWordMatch(line, "zzzzz"), null); // hallucinated word rejected
  assert.equal(bestWordMatch(line, null), null);
  assert.equal(bestWordMatch([], "perimeter"), null);
}

// ── buildLineMarks: numbering skips empties, keeps block indices, caps ───────
{
  const blocks: OcrBox[] = [
    { text: "Question 1.", box: box(0, 0, 100, 20) },
    { text: "   ", box: box(0, 30, 100, 50) }, // empty → no chip
    { text: "What is 2 + 2?", box: box(0, 60, 100, 80) },
  ];
  const marks = buildLineMarks(blocks);
  assert.equal(marks.length, 2);
  assert.deepEqual(marks.map((m) => m.n), [1, 2]); // chips numbered contiguously
  assert.deepEqual(marks.map((m) => m.blockIndex), [0, 2]); // original indices kept
  const many = buildLineMarks(
    Array.from({ length: 60 }, (_, i) => ({ text: `line ${i}`, box: box(0, i * 20, 100, i * 20 + 15) })),
  );
  assert.equal(many.length, 40); // readability cap
}

// ── buildWordMarks: word pass numbering skips empties, keeps unit indices ────
{
  const words = [
    { text: "Find", box: box(0, 0, 40, 20) },
    { text: "", box: box(45, 0, 50, 20) }, // empty → no chip
    { text: "the", box: box(55, 0, 80, 20) },
    { text: "perimeter", box: box(85, 0, 160, 20) },
  ];
  const wordMarks = buildWordMarks(words);
  assert.equal(wordMarks.length, 3);
  assert.deepEqual(wordMarks.map((m) => m.n), [1, 2, 3]); // chips numbered contiguously
  assert.deepEqual(wordMarks.map((m) => m.unitIndex), [0, 2, 3]); // original indices kept
  assert.deepEqual(buildWordMarks([]), []);
}


// ── computeStats: quiz_result aggregation ────────────────────────────────────
{
  const t = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();
  const quizStats = computeStats([
    { ts: t(0), type: "stuck_word", word: "awards", grapheme: null, question_ref: null },
    {
      ts: t(10), type: "quiz_result", word: "awards", grapheme: null, question_ref: null,
      payload: { said: true, pointed: true, skipped: false },
    },
    {
      ts: t(20), type: "quiz_result", word: "battery", grapheme: null, question_ref: null,
      payload: { said: false, pointed: null, skipped: false },
    },
    {
      ts: t(30), type: "quiz_result", word: "charge", grapheme: null, question_ref: null,
      payload: { said: null, pointed: null, skipped: true },
    },
  ]);
  assert.deepEqual(quizStats.quiz, {
    total: 3,
    saidCorrect: 1,
    saidTotal: 2,
    pointedCorrect: 1,
    pointedTotal: 1,
    skipped: 1,
  });
  // No quiz events → quiz stays null (stats page hides the card).
  const noQuiz = computeStats([
    { ts: t(0), type: "read", word: "cat", grapheme: null, question_ref: null },
  ]);
  assert.equal(noQuiz.quiz, null);
}

// ── parseSteps: strict JSON, fences, clamping, junk rejection ────────────────
{
  const clean = parseSteps(
    '{"steps":[{"say":"Look here.","region":{"x":0.1,"y":0.2,"w":0.3,"h":0.05}}]}',
  );
  assert.equal(clean.length, 1);
  assert.equal(clean[0].say, "Look here.");

  const fenced = parseSteps(
    'Sure!\n```json\n{"steps":[{"say":"Hi","region":{"x":2,"y":-1,"w":0.5,"h":0.5}}]}\n```',
  );
  assert.equal(fenced.length, 1);
  assert.deepEqual(fenced[0].region, { x: 1, y: 0, w: 0.5, h: 0.5 }); // clamped 0–1

  assert.deepEqual(parseSteps("no json here"), []);
  assert.deepEqual(parseSteps('{"steps":[{"say":"","region":{}}]}'), []); // empty say dropped

  // Anchored mode: line/phrase anchors resolve to OCR-derived rects (the
  // model never emits coordinates) and aids resolve alongside.
  const lines = [
    { i: 0, text: "Compare 3/4 and 2/3", box: { x: 0.1, y: 0.2, w: 0.5, h: 0.05 } },
    { i: 1, text: "Answer: ____", box: { x: 0.1, y: 0.3, w: 0.3, h: 0.05 } },
  ];
  const anchored = parseSteps(
    JSON.stringify({
      steps: [
        {
          say: "Look at the fractions.",
          anchor: { line: 0, phrase: "3/4" },
          aids: [
            { kind: "circle", line: 0, phrase: "3/4" },
            { kind: "arrow", line: 0, phrase: "3/4", toLine: 1, toPhrase: "____" },
          ],
        },
      ],
    }),
    lines,
  );
  assert.equal(anchored.length, 1);
  // "3/4" starts at char 8 of 19 → x = 0.1 + 0.5·(8/19), w = 0.5·(3/19).
  const r = anchored[0].region;
  assert.ok(Math.abs(r.x - (0.1 + 0.5 * (8 / 19))) < 1e-9);
  assert.ok(Math.abs(r.w - 0.5 * (3 / 19)) < 1e-9);
  assert.equal(r.y, 0.2);
  assert.equal(anchored[0].aids?.length, 2);
  assert.equal(anchored[0].aids?.[1].kind, "arrow");
  assert.ok(anchored[0].aids?.[1].to); // arrow resolved its target

  // "write" aid: draws short working text on the paper at an anchor.
  const withWrite = parseSteps(
    JSON.stringify({
      steps: [
        {
          say: "Convert it.",
          anchor: { line: 0, phrase: "3/4" },
          aids: [{ kind: "write", line: 0, phrase: "3/4", text: "=9/12 long overflow" }],
        },
      ],
    }),
    lines,
  );
  assert.equal(withWrite[0].aids?.[0].kind, "write");
  assert.equal(withWrite[0].aids?.[0].text, "=9/12 long overf"); // trimmed to 16 chars
  assert.ok(withWrite[0].aids?.[0].region); // resolved from the anchor
  // Unknown line index → falls back to the (clamped) raw region.
  const fallback = parseSteps(
    '{"steps":[{"say":"Hi","anchor":{"line":9},"region":{"x":0.2,"y":0.2,"w":0.1,"h":0.1}}]}',
    lines,
  );
  assert.deepEqual(fallback[0].region, { x: 0.2, y: 0.2, w: 0.1, h: 0.1 });

  // formula (LaTeX) parsed onto the step (REWORK 4).
  const withFormula = parseSteps(
    JSON.stringify({ steps: [{ say: "Convert.", anchor: { line: 0 }, formula: "\\frac{3}{4}=\\frac{9}{12}" }] }),
    lines,
  );
  assert.equal(withFormula[0].formula, "\\frac{3}{4}=\\frac{9}{12}");
  // no formula field → undefined, not empty string
  const noFormula = parseSteps(JSON.stringify({ steps: [{ say: "Hi.", anchor: { line: 0 } }] }), lines);
  assert.equal(noFormula[0].formula, undefined);
}

// ── scanTopLevelObjects + parseStepObject: incremental streaming (REWORK 4) ───
{
  // Brace/string-aware: nested objects and braces-in-strings don't split it.
  const buf = '{"say":"a {b}","region":{"x":0}}, {"say":"two"} , {"say":"partial';
  const objs = scanTopLevelObjects(buf);
  assert.equal(objs.length, 2); // the partial third object is NOT emitted yet
  assert.equal(objs[0], '{"say":"a {b}","region":{"x":0}}');
  assert.equal(objs[1], '{"say":"two"}');
  // Growing the buffer completes the third object.
  const objs2 = scanTopLevelObjects(buf + ' three"} ]}');
  assert.equal(objs2.length, 3);
  assert.equal(objs2[2], '{"say":"partial three"}');
  // escaped quote inside a string doesn't end the string early.
  assert.equal(scanTopLevelObjects('{"say":"he said \\"hi\\" {x}"}').length, 1);
  // parseStepObject maps one object → a resolved step.
  const one = parseStepObject('{"say":"Look.","region":{"x":0.1,"y":0.2,"w":0.3,"h":0.05}}');
  assert.equal(one?.say, "Look.");
  assert.equal(parseStepObject("{ not json"), null);
  assert.equal(parseStepObject('{"say":""}'), null); // empty say dropped

  // stepsFromStream: strips the leading {"steps": [ wrapper, emits completed
  // elements as the buffer grows (no assistant prefill — model streams the
  // whole object).
  assert.deepEqual(stepsFromStream(""), []);
  assert.deepEqual(stepsFromStream('{"steps'), []); // opener not seen yet
  assert.deepEqual(stepsFromStream('{"steps": ['), []); // array open, no elements
  const partial = '{"steps": [ {"say":"one"}, {"say":"tw';
  assert.deepEqual(stepsFromStream(partial), ['{"say":"one"}']); // only the complete one
  const grown = partial + 'o [note]"}, {"say":"three"} ]}';
  assert.deepEqual(stepsFromStream(grown), [
    '{"say":"one"}',
    '{"say":"tw' + 'o [note]"}',
    '{"say":"three"}',
  ]);
}

// ── buildSentences: group lines by punctuation + geometry, verbatim join ─────
{
  // A title (no punctuation, then a paragraph gap), a question wrapping two
  // tightly-spaced lines ending "?", and an answer wrapping two lines ending ".".
  const lines: OcrBox[] = [
    { text: "Electrical System Design for Buildings", box: box(50, 0, 450, 20) },
    { text: "What is the typical shape and structure of a", box: box(50, 60, 450, 80) },
    { text: "trunking system?", box: box(50, 82, 250, 102) },
    { text: "It is usually square or rectangular in shape and has one", box: box(50, 104, 450, 124) },
    { text: "removable side for easy access to the cables.", box: box(50, 126, 450, 146) },
  ];
  const sentences = buildSentences(lines);
  assert.equal(sentences.length, 3);
  // Title stands alone (paragraph gap breaks it off despite no punctuation).
  assert.equal(sentences[0].text, "Electrical System Design for Buildings");
  // Wrapped question rejoined VERBATIM with a single space, across two lines.
  assert.equal(sentences[1].text, "What is the typical shape and structure of a trunking system?");
  assert.equal(sentences[1].blocks.length, 2);
  assert.equal(sentences[2].text, "It is usually square or rectangular in shape and has one removable side for easy access to the cables.");

  // blockToSentence map: line index → sentence index.
  assert.deepEqual(blockToSentenceMap(sentences), [0, 1, 1, 2, 2]);

  // localWordAt: offset maps back to the member line + local range.
  const q = sentences[1];
  const first = localWordAt(q, 0, 4)!; // "What" on line 0
  assert.deepEqual(first, { memberIndex: 0, localStart: 0, localLength: 4 });
  const trunkingStart = q.ranges[1].start;
  const second = localWordAt(q, trunkingStart, 8)!; // "trunking" on line 1
  assert.deepEqual(second, { memberIndex: 1, localStart: 0, localLength: 8 });

  // A terminal period followed by a tight next line still breaks the sentence.
  const tight: OcrBox[] = [
    { text: "Stop here.", box: box(0, 0, 100, 20) },
    { text: "New one", box: box(0, 21, 100, 41) },
  ];
  assert.equal(buildSentences(tight).length, 2);

  // Empty blocks are dropped and break the current group.
  const withEmpty: OcrBox[] = [
    { text: "alpha", box: box(0, 0, 100, 20) },
    { text: "   ", box: box(0, 21, 100, 41) },
    { text: "beta", box: box(0, 42, 100, 62) },
  ];
  const grouped = buildSentences(withEmpty);
  assert.equal(grouped.length, 2);
  const emptyMap = blockToSentenceMap(grouped);
  assert.equal(emptyMap[0], 0);
  assert.equal(emptyMap[1], undefined); // dropped empty line maps to nothing
  assert.equal(emptyMap[2], 1);
}

// ── buildParagraphs: sentences merge while gaps stay small (verbatim join) ───
{
  const lines: OcrBox[] = [
    { text: "Electrical System Design for Buildings", box: box(50, 0, 450, 20) },
    { text: "What is the typical shape and structure of a", box: box(50, 60, 450, 80) },
    { text: "trunking system?", box: box(50, 82, 250, 102) },
    { text: "It is usually square or rectangular in shape and has one", box: box(50, 104, 450, 124) },
    { text: "removable side for easy access to the cables.", box: box(50, 126, 450, 146) },
  ];
  const paragraphs = buildParagraphs(lines);
  // Title split from the body by the 40px gap (> 1.1 × 20px line height);
  // question + answer sentences merge (tight 2px gaps).
  assert.equal(paragraphs.length, 2);
  assert.equal(paragraphs[0].text, "Electrical System Design for Buildings");
  assert.equal(
    paragraphs[1].text,
    "What is the typical shape and structure of a trunking system? It is usually square or rectangular in shape and has one removable side for easy access to the cables.",
  );
  assert.deepEqual(paragraphs[1].blockIndices, [1, 2, 3, 4]);
  // Ranges stay index-aligned to blocks so karaoke can hop lines.
  assert.equal(paragraphs[1].ranges.length, 4);
}

// ── fastParseCommand: keyword fast-path before any LLM (amended rule 3) ──────
{
  assert.deepEqual(fastParseCommand("read this"), { intent: "read", scope: undefined });
  assert.deepEqual(fastParseCommand("please READ that bit"), { intent: "read", scope: undefined });
  assert.deepEqual(fastParseCommand("read this word"), { intent: "read", scope: "word" });
  assert.deepEqual(fastParseCommand("can you read the sentence"), { intent: "read", scope: "sentence" });
  assert.deepEqual(fastParseCommand("read the whole paragraph"), { intent: "read", scope: "paragraph" });
  assert.deepEqual(fastParseCommand("switch to word mode"), { intent: "set_scope", scope: "word" });
  assert.deepEqual(fastParseCommand("again"), { intent: "repeat" });
  assert.deepEqual(fastParseCommand("one more time please"), { intent: "repeat" });
  assert.deepEqual(fastParseCommand("stop"), { intent: "stop" });
  assert.deepEqual(fastParseCommand("scan again"), { intent: "rescan" });
  assert.deepEqual(fastParseCommand("I'm stuck on this word"), { intent: "stuck_word" });
  assert.deepEqual(fastParseCommand("what is this word"), { intent: "stuck_word" });
  assert.deepEqual(fastParseCommand("can you sound it out"), { intent: "sound_out" });
  // Not classifiable → null → the caller may consult the LLM.
  assert.equal(fastParseCommand("um so like the thing over there"), null);
  assert.equal(fastParseCommand(""), null);
}

// ── syllables: deterministic splits (patterns + vowel-group fallback) ────────
{
  assert.deepEqual(syllablesOf("awards"), ["a", "wards"]);
  assert.deepEqual(syllablesOf("Awards!"), ["A", "wards"]); // case + punctuation kept sane
  assert.deepEqual(syllablesOf("rectangle"), ["rec", "tan", "gle"]);
  assert.deepEqual(syllablesOf("battery"), ["bat", "tery"]);
  assert.deepEqual(syllablesOf("beautiful"), ["beau", "ti", "ful"]);
  assert.deepEqual(syllablesOf("together"), ["to", "geth", "er"]);
  assert.deepEqual(syllablesOf("charge"), ["charge"]); // silent e — one syllable
  assert.deepEqual(syllablesOf("cat"), ["cat"]);
  assert.deepEqual(syllablesOf("123"), []); // nothing pronounceable
  // Coaching template: intro round + repeat round, word verbatim.
  assert.deepEqual(coachingLines("Awards"), [
    "This word is Awards. A, wards, Awards.",
    "A, wards, Awards.",
  ]);
  assert.deepEqual(coachingLines("cat"), ["This word is cat. cat, cat.", "cat, cat."]);
}

// ── stripMarkdown: Telegram summaries never show raw markdown (item 4) ───────
{
  assert.equal(stripMarkdown("## Session Summary"), "Session Summary");
  assert.equal(stripMarkdown("**Overview**"), "Overview");
  assert.equal(stripMarkdown("He read *well* today"), "He read well today");
  assert.equal(stripMarkdown("- first\n- second"), "• first\n• second");
  assert.equal(stripMarkdown("use `code` here"), "use code here");
  // A realistic messy blob → no **, ##, or backticks survive.
  const cleaned = stripMarkdown("## Summary\n\n**Overview**\n\n230 events with `89` reads.");
  assert.ok(!/[*#`]/.test(cleaned));
  assert.ok(cleaned.includes("Overview") && cleaned.includes("230 events"));
}

console.log("logic-tests: all assertions passed");
