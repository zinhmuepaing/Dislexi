/**
 * Scan→shot drift alignment for set-of-marks pointing.
 *
 * The chips are numbered against the CLEAN scan's OCR boxes, but they are
 * composited onto a FRESH shot taken when the child points. Handheld, the
 * paper moves between the two frames, so chips land on the wrong physical
 * lines. The fresh shot's own OCR cannot replace the scan (the pointing hand
 * occludes exactly the target region) — instead it is a REGISTRATION signal:
 * fresh lines are text-matched to scan lines, one rigid motion is estimated
 * by least squares, and ALL scan boxes (occluded ones included) are remapped
 * into shot space.
 *
 * The motion model is a 2-D similarity (rotation + uniform scale +
 * translation): the paper is rigid and the frames are seconds apart. If
 * handheld TILT (perspective) change ever proves significant, the contained
 * upgrade is a 6-param affine fit inside estimateSimilarity — same
 * least-squares machinery, two more unknowns.
 *
 * Pure module (no DOM); covered by scripts/logic-tests.mts.
 */

import type { OcrBox } from "@/components/KaraokeHighlight";
import { lineSimilarity } from "@/lib/text-match";

/** x' = a·x − b·y + tx ; y' = b·x + a·y + ty */
export interface Similarity2D {
  a: number;
  b: number;
  tx: number;
  ty: number;
}

export const IDENTITY: Similarity2D = { a: 1, b: 0, tx: 0, ty: 0 };

/** Lines below this text similarity never pair (rejects hallucinated matches). */
const MIN_LINE_SIM = 0.8;
/** Reject fits that shrink/grow the frame beyond camera-plausible bounds. */
const SCALE_MIN = 0.5;
const SCALE_MAX = 2;
/** Reject fits whose mean residual exceeds this × median matched line height. */
const RESIDUAL_FACTOR = 1.5;

export interface LinePair {
  scanIndex: number;
  freshIndex: number;
}

function centerOf(box: [number, number][]): [number, number] {
  const xs = box.map(([x]) => x);
  const ys = box.map(([, y]) => y);
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
}

function heightOf(box: [number, number][]): number {
  const ys = box.map(([, y]) => y);
  return Math.max(...ys) - Math.min(...ys);
}

/**
 * Longest increasing subsequence (strict, on freshIndex) of pairs already
 * sorted by scanIndex — keeps only matches that respect reading order, so
 * repeated identical lines ("Answer: ____") cannot cross-pair.
 */
function readingOrderFilter(pairs: LinePair[]): LinePair[] {
  if (pairs.length <= 1) return pairs;
  const tailIndex: number[] = []; // index into pairs of the LIS tail per length
  const prev: number[] = new Array(pairs.length).fill(-1);
  for (let i = 0; i < pairs.length; i++) {
    let lo = 0;
    let hi = tailIndex.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pairs[tailIndex[mid]].freshIndex < pairs[i].freshIndex) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? tailIndex[lo - 1] : -1;
    tailIndex[lo] = i;
  }
  const out: LinePair[] = [];
  for (let i = tailIndex[tailIndex.length - 1]; i >= 0; i = prev[i]) out.push(pairs[i]);
  return out.reverse();
}

/**
 * Pair scan lines with fresh lines by text: greedy best-similarity first
 * (each line used once), then reading-order (LIS) filter. Occluded/missing
 * lines simply produce no pair.
 */
export function matchLines(
  scan: { text: string }[],
  fresh: { text: string }[],
  minSim: number = MIN_LINE_SIM,
): LinePair[] {
  const candidates: { scanIndex: number; freshIndex: number; score: number }[] = [];
  scan.forEach((s, scanIndex) => {
    if (s.text.trim() === "") return;
    fresh.forEach((f, freshIndex) => {
      if (f.text.trim() === "") return;
      const score = lineSimilarity(s.text, f.text);
      if (score >= minSim) candidates.push({ scanIndex, freshIndex, score });
    });
  });
  candidates.sort((a, b) => b.score - a.score);
  const scanUsed = new Set<number>();
  const freshUsed = new Set<number>();
  const pairs: LinePair[] = [];
  for (const c of candidates) {
    if (scanUsed.has(c.scanIndex) || freshUsed.has(c.freshIndex)) continue;
    scanUsed.add(c.scanIndex);
    freshUsed.add(c.freshIndex);
    pairs.push({ scanIndex: c.scanIndex, freshIndex: c.freshIndex });
  }
  pairs.sort((a, b) => a.scanIndex - b.scanIndex);
  return readingOrderFilter(pairs);
}

/**
 * Least-squares 2-D similarity from point pairs (centered closed form).
 * 1 pair → translation only; 0 pairs → null; coincident points → translation.
 */
export function estimateSimilarity(
  pairs: { from: [number, number]; to: [number, number] }[],
): Similarity2D | null {
  const n = pairs.length;
  if (n === 0) return null;
  let fx = 0, fy = 0, ux = 0, uy = 0;
  for (const p of pairs) {
    fx += p.from[0];
    fy += p.from[1];
    ux += p.to[0];
    uy += p.to[1];
  }
  fx /= n; fy /= n; ux /= n; uy /= n;
  let num = 0; // Σ(x̃ũ + ỹṽ)
  let cross = 0; // Σ(x̃ṽ − ỹũ)
  let den = 0; // Σ(x̃² + ỹ²)
  for (const p of pairs) {
    const x = p.from[0] - fx;
    const y = p.from[1] - fy;
    const u = p.to[0] - ux;
    const v = p.to[1] - uy;
    num += x * u + y * v;
    cross += x * v - y * u;
    den += x * x + y * y;
  }
  const a = den > 0 ? num / den : 1;
  const b = den > 0 ? cross / den : 0;
  return { a, b, tx: ux - a * fx + b * fy, ty: uy - b * fx - a * fy };
}

export function applyToPoint(t: Similarity2D, p: [number, number]): [number, number] {
  return [t.a * p[0] - t.b * p[1] + t.tx, t.b * p[0] + t.a * p[1] + t.ty];
}

export function applyToBox(t: Similarity2D, box: [number, number][]): [number, number][] {
  return box.map((p) => applyToPoint(t, p));
}

/** Remap line boxes AND nested word boxes; texts untouched; inputs not mutated. */
export function applyToBlocks(t: Similarity2D, blocks: OcrBox[]): OcrBox[] {
  return blocks.map((b) => ({
    ...b,
    box: applyToBox(t, b.box),
    words: b.words?.map((w) => ({ ...w, box: applyToBox(t, w.box) })),
  }));
}

export interface Alignment {
  transform: Similarity2D;
  /** Number of scan↔fresh line pairs the fit used. */
  matched: number;
  /** False → transform is IDENTITY (today's behavior; nothing gets worse). */
  aligned: boolean;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Match scan lines to the fresh shot's lines by text, fit the similarity on
 * matched line-box centers, and sanity-check the fit. Any failure degrades to
 * IDENTITY — never to a wilder guess than the status quo.
 */
export function alignScanToShot(scanBlocks: OcrBox[], freshBlocks: OcrBox[]): Alignment {
  const pairs = matchLines(scanBlocks, freshBlocks);
  if (pairs.length < 2) return { transform: IDENTITY, matched: pairs.length, aligned: false };

  const points = pairs.map((p) => ({
    from: centerOf(scanBlocks[p.scanIndex].box),
    to: centerOf(freshBlocks[p.freshIndex].box),
  }));
  const t = estimateSimilarity(points);
  if (!t) return { transform: IDENTITY, matched: pairs.length, aligned: false };

  const scale = Math.hypot(t.a, t.b);
  if (scale < SCALE_MIN || scale > SCALE_MAX) {
    return { transform: IDENTITY, matched: pairs.length, aligned: false };
  }

  const meanResidual =
    points.reduce((sum, p) => {
      const [x, y] = applyToPoint(t, p.from);
      return sum + Math.hypot(x - p.to[0], y - p.to[1]);
    }, 0) / points.length;
  const lineH = median(pairs.map((p) => heightOf(scanBlocks[p.scanIndex].box)));
  if (lineH > 0 && meanResidual > RESIDUAL_FACTOR * lineH) {
    return { transform: IDENTITY, matched: pairs.length, aligned: false };
  }

  return { transform: t, matched: pairs.length, aligned: true };
}
