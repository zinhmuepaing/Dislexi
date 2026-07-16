/**
 * Pure-logic tests for the pipeline helpers (no live credentials needed).
 * Run: npx tsx scripts/logic-tests.mts
 */

import assert from "node:assert/strict";
import { subBoxFor, type OcrBox } from "../components/KaraokeHighlight";
import { nearestBlock, traceSatisfied, boxCenter } from "../lib/hand-tracker";
import { chunksFor, chunkPattern, normalizeWord } from "../lib/graphemes";
import { computeStats } from "../lib/analytics";
import { parseSteps } from "../lib/tutor-model";

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

console.log("logic-tests: all assertions passed");
