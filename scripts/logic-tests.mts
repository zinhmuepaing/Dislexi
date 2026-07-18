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
import { parseSteps } from "../lib/tutor-model";
import { buildSentences, blockToSentenceMap, localWordAt } from "../lib/sentences";

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

console.log("logic-tests: all assertions passed");
