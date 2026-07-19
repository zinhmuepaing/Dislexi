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
import { parseSteps, stripMarkdown } from "../lib/tutor-model";
import { buildSentences, buildParagraphs, blockToSentenceMap, localWordAt } from "../lib/sentences";
import { fastParseCommand } from "../lib/voice-commands";
import { syllablesOf, coachingLines } from "../lib/syllables";
import { similarity, saidWordMatches, bestWordMatch } from "../lib/text-match";
import { buildLineMarks, buildWordMarks } from "../lib/marks";
import {
  matchLines,
  estimateSimilarity,
  applyToPoint,
  applyToBox,
  applyToBlocks,
  alignScanToShot,
  IDENTITY,
  type Similarity2D,
} from "../lib/align";

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
  assert.equal(withWrite[0].aids?.[0].text, "=9/12 long"); // trimmed to 10 chars
  assert.ok(withWrite[0].aids?.[0].region); // resolved from the anchor
  // Unknown line index → falls back to the (clamped) raw region.
  const fallback = parseSteps(
    '{"steps":[{"say":"Hi","anchor":{"line":9},"region":{"x":0.2,"y":0.2,"w":0.1,"h":0.1}}]}',
    lines,
  );
  assert.deepEqual(fallback[0].region, { x: 0.2, y: 0.2, w: 0.1, h: 0.1 });
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

// ── align: matchLines — text pairing with reading-order (LIS) filter ─────────
{
  const scan = [{ text: "The perimeter of a rectangle" }, { text: "is twice the sum" }, { text: "of its sides." }];
  const fresh = [{ text: "The perimeter of a rectangle" }, { text: "of its sides." }];
  // Exact matches pair up; the occluded middle line simply has no pair.
  assert.deepEqual(matchLines(scan, fresh), [
    { scanIndex: 0, freshIndex: 0 },
    { scanIndex: 2, freshIndex: 1 },
  ]);
  // Garbage fresh text below minSim never pairs.
  assert.deepEqual(matchLines([{ text: "hello world" }], [{ text: "zzzzqqq" }]), []);
  assert.deepEqual(matchLines([], []), []);
  // Repeated identical lines resolve in reading order (no cross-pairing).
  const repeated = matchLines(
    [{ text: "Answer: ____" }, { text: "Question 2" }, { text: "Answer: ____" }],
    [{ text: "Answer: ____" }, { text: "Question 2" }, { text: "Answer: ____" }],
  );
  assert.deepEqual(repeated, [
    { scanIndex: 0, freshIndex: 0 },
    { scanIndex: 1, freshIndex: 1 },
    { scanIndex: 2, freshIndex: 2 },
  ]);
  // Crossed pairs (paper cannot reorder its lines) are filtered to a monotonic set.
  const crossed = matchLines(
    [{ text: "aaaa bbbb" }, { text: "cccc dddd" }],
    [{ text: "cccc dddd" }, { text: "aaaa bbbb" }],
  );
  assert.equal(crossed.length, 1);
  // Digits discriminate (lineSimilarity, not the digit-blind quiz matcher):
  // fresh sees only "Question 2" — it must pair with scan's "Question 2".
  assert.deepEqual(
    matchLines([{ text: "Question 1" }, { text: "Question 2" }], [{ text: "Question 2" }]),
    [{ scanIndex: 1, freshIndex: 0 }],
  );
}

// ── align: estimateSimilarity — least-squares translate/scale/rotate ─────────
{
  const near = (x: number, y: number, eps = 1e-6) => assert.ok(Math.abs(x - y) < eps, `${x} !≈ ${y}`);
  // Pure translation by (12, −30).
  const t1 = estimateSimilarity([
    { from: [0, 0], to: [12, -30] },
    { from: [100, 0], to: [112, -30] },
    { from: [0, 50], to: [12, 20] },
  ])!;
  near(t1.a, 1); near(t1.b, 0); near(t1.tx, 12); near(t1.ty, -30);
  // Scale 1.1 + translation.
  const t2 = estimateSimilarity([
    { from: [0, 0], to: [5, 7] },
    { from: [100, 0], to: [115, 7] },
    { from: [0, 100], to: [5, 117] },
  ])!;
  near(t2.a, 1.1); near(t2.b, 0); near(t2.tx, 5); near(t2.ty, 7);
  // 15° rotation about the origin.
  const cos = Math.cos(Math.PI / 12);
  const sin = Math.sin(Math.PI / 12);
  const rot = ([x, y]: [number, number]): [number, number] => [cos * x - sin * y, sin * x + cos * y];
  const t3 = estimateSimilarity(
    ([[0, 0], [200, 0], [0, 100], [200, 100]] as [number, number][]).map((p) => ({ from: p, to: rot(p) })),
  )!;
  near(t3.a, cos); near(t3.b, sin); near(t3.tx, 0); near(t3.ty, 0);
  // One pair → translation only; zero pairs → null.
  const t4 = estimateSimilarity([{ from: [10, 20], to: [13, 26] }])!;
  assert.deepEqual(t4, { a: 1, b: 0, tx: 3, ty: 6 });
  assert.equal(estimateSimilarity([]), null);
}

// ── align: alignScanToShot — drift repro: occluded line remaps correctly ─────
{
  const scan: OcrBox[] = Array.from({ length: 5 }, (_, i) => ({
    text: `worksheet line number ${i} with words`,
    box: box(50, 100 + i * 40, 450, 120 + i * 40),
  }));
  // Ground-truth paper motion: small rotation + shift (handheld drift).
  const truth: Similarity2D = { a: Math.cos(0.04), b: Math.sin(0.04), tx: 18, ty: -25 };
  // Fresh OCR sees 4 of the 5 lines (index 2 occluded by the pointing hand).
  const fresh: OcrBox[] = [0, 1, 3, 4].map((i) => ({
    text: scan[i].text,
    box: applyToBox(truth, scan[i].box),
  }));
  const { transform, matched, aligned } = alignScanToShot(scan, fresh);
  assert.equal(aligned, true);
  assert.equal(matched, 4);
  // The OCCLUDED line's box lands within 1px of where the paper really moved it.
  const remapped = applyToBox(transform, scan[2].box);
  const expected = applyToBox(truth, scan[2].box);
  remapped.forEach(([x, y], i) => {
    assert.ok(Math.hypot(x - expected[i][0], y - expected[i][1]) < 1, "occluded box off by ≥1px");
  });
  // Unrelated fresh text (< 2 matches) → IDENTITY fallback.
  const junk = alignScanToShot(scan, [
    { text: "zzz", box: box(0, 0, 10, 10) },
    { text: "qqq", box: box(0, 20, 10, 30) },
  ]);
  assert.deepEqual(junk.transform, IDENTITY);
  assert.equal(junk.aligned, false);
  // Absurd scale (10×) → rejected → IDENTITY.
  const huge = alignScanToShot(
    scan,
    scan.map((b) => ({ text: b.text, box: b.box.map(([x, y]) => [x * 10, y * 10] as [number, number]) })),
  );
  assert.deepEqual(huge.transform, IDENTITY);
  assert.equal(huge.aligned, false);
}

// ── align: applyToBlocks — nested word boxes remap; inputs untouched ─────────
{
  const t: Similarity2D = { a: 1, b: 0, tx: 10, ty: 5 };
  const blocks: OcrBox[] = [
    {
      text: "two words",
      box: box(0, 0, 100, 20),
      words: [
        { text: "two", box: box(0, 0, 40, 20) },
        { text: "words", box: box(50, 0, 100, 20) },
      ],
    },
  ];
  const out = applyToBlocks(t, blocks);
  assert.deepEqual(out[0].box, box(10, 5, 110, 25));
  assert.deepEqual(out[0].words![0].box, box(10, 5, 50, 25));
  assert.equal(out[0].text, "two words");
  assert.equal(out[0].words![1].text, "words");
  // No mutation of the input.
  assert.deepEqual(blocks[0].box, box(0, 0, 100, 20));
  assert.deepEqual(blocks[0].words![0].box, box(0, 0, 40, 20));
  assert.deepEqual(applyToPoint(t, [1, 2]), [11, 7]);
}

console.log("logic-tests: all assertions passed");
