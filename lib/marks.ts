"use client";

/**
 * Set-of-marks pointing (branch: feature/set-of-marks-pointing).
 *
 * Coordinate regression is the vision model's weakest skill (±5–10% error =
 * 2–3 text lines) and it was selecting lines BELOW the finger. Set-of-marks
 * turns pointing into a CLASSIFICATION task: numbered chips are composited
 * onto the frame at each OCR line, and the model answers "which mark?" (plus
 * the word it sees pointed). Pose-invariant by construction — no coordinate
 * frame to mismatch.
 *
 * Compliance unchanged (amended §7 rule 3 #2): the model picks WHERE (a mark
 * number / a word location); the text spoken is always the OCR text VERBATIM.
 *
 * WORD scope (stand rig) skips the full-page line pass: a coarse fingertip
 * from locatePointer (always finds the finger, ±2–3 lines imprecise) narrows
 * to the few words around the tip (wordsNearPoint); buildWordMarks numbers
 * ONLY those and the model answers "which chip?" on a local view. Still
 * classification, never "read the word" — the fingertip occludes its target,
 * so the model would name a legible neighbor instead.
 *
 * buildLineMarks/buildWordMarks/wordsNearPoint are pure (covered by
 * scripts/logic-tests.mts); drawMarks is canvas/DOM and client-only.
 */

import type { OcrBox } from "@/components/KaraokeHighlight";

export interface LineMark {
  /** 1-based chip number shown on the image and returned by the model. */
  n: number;
  /** OCR line text (sent to the model for cross-checking). */
  text: string;
  /** Line box, pixel coords of the SCANNED frame. */
  box: [number, number][];
  /** Index into the scan's blocks array. */
  blockIndex: number;
}

/** Chips get unreadable past this many lines; OCR'd worksheets stay well under. */
const MAX_MARKS = 40;

/** Number the non-empty OCR lines 1..N (cap MAX_MARKS), keeping block indices. */
export function buildLineMarks(blocks: OcrBox[]): LineMark[] {
  const marks: LineMark[] = [];
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const b = blocks[blockIndex];
    if (b.text.trim() === "") continue;
    if (marks.length >= MAX_MARKS) break;
    marks.push({ n: marks.length + 1, text: b.text, box: b.box, blockIndex });
  }
  return marks;
}

export interface WordMark {
  /** 1-based chip number shown on the image and returned by the model. */
  n: number;
  /** OCR word text (sent to the model for cross-checking). */
  text: string;
  /** Word box, pixel coords of the SCANNED frame. */
  box: [number, number][];
  /** Index into the caller's in-line word-unit array. */
  unitIndex: number;
}

/** Number the picked line's non-empty word units 1..K (cap MAX_MARKS). */
export function buildWordMarks(
  words: { text: string; box: [number, number][] }[],
): WordMark[] {
  const marks: WordMark[] = [];
  for (let unitIndex = 0; unitIndex < words.length; unitIndex++) {
    const w = words[unitIndex];
    if (w.text.trim() === "") continue;
    if (marks.length >= MAX_MARKS) break;
    marks.push({ n: marks.length + 1, text: w.text, box: w.box, unitIndex });
  }
  return marks;
}

export interface NearPointOpts {
  /** Vertical half-window in line-heights (default 3 — covers locatePointer's ±2–3 line error). */
  vBandLines?: number;
  /** Horizontal half-window as a fraction of frame width (default 0.14). */
  hBandFrac?: number;
  /** Cap on candidates returned (default 10 — keeps the local classify view legible). */
  max?: number;
}

/**
 * Rank word boxes near a coarse fingertip for the WORD-scope local classify
 * pass (stand rig). `point` and the boxes share one pixel space (§ CLAUDE.md
 * rule 1). Returns indices into `boxes`, nearest first, capped: only words
 * within a vertical band (locatePointer is imprecise vertically) and a
 * horizontal band (the pointed x is reliable) around the tip. Score carries
 * the occlusion prior — the finger covers its target from below, so words
 * at/above the tip rank ahead of those below it. If nothing passes the bands
 * (finger in a margin), falls back to the globally nearest few so the caller
 * still has candidates. Pure; covered by scripts/logic-tests.mts.
 */
export function wordsNearPoint(
  boxes: [number, number][][],
  point: { x: number; y: number },
  frame: { width: number; height: number },
  opts: NearPointOpts = {},
): number[] {
  if (boxes.length === 0) return [];
  const vBandLines = opts.vBandLines ?? 3;
  const hBandFrac = opts.hBandFrac ?? 0.14;
  const max = opts.max ?? 10;

  const rects = boxes.map((box) => {
    const xs = box.map(([x]) => x);
    const ys = box.map(([, y]) => y);
    const t = Math.min(...ys);
    const b = Math.max(...ys);
    return { l: Math.min(...xs), r: Math.max(...xs), t, b, h: b - t };
  });

  const heights = rects.map((rc) => rc.h).filter((h) => h > 0).sort((a, b) => a - b);
  const lineHeight = heights.length ? heights[Math.floor(heights.length / 2)] : frame.height * 0.03;
  const vBand = vBandLines * lineHeight;
  const hBand = hBandFrac * frame.width;

  const scored = rects.map((rc, i) => {
    const dx = Math.max(rc.l - point.x, point.x - rc.r, 0);
    const dy = Math.max(rc.t - point.y, point.y - rc.b, 0);
    const belowBias = rc.t > point.y ? lineHeight : 0; // occlusion: prefer at/above the tip
    return { i, dx, dy, score: dx * dx + (dy + belowBias) * (dy + belowBias) };
  });

  const gated = scored.filter((s) => s.dx <= hBand && s.dy <= vBand);
  const pool = gated.length ? gated : scored;
  pool.sort((a, b) => a.score - b.score);
  return pool.slice(0, max).map((s) => s.i);
}

/**
 * Chip placement relative to its box: "left" for line marks (left edge of the
 * line), "above" for word marks — the finger approaches from below on the
 * desk rig, so a chip above the word stays visible while the word itself is
 * covered by the fingertip.
 */
export type MarkPlacement = "left" | "above";

/**
 * Composite the numbered chips onto a captured frame. `boxSpace` is the
 * scanned frame's dimensions (the space the OCR boxes live in); the fresh
 * shot is scaled to it, so a camera-resolution change between scan and shot
 * cannot shift the chips. Returns a JPEG data URL.
 */
export async function drawMarks(
  shotBase64: string,
  marks: { n: number; box: [number, number][] }[],
  boxSpace: { width: number; height: number },
  placement: MarkPlacement = "left",
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("frame decode failed"));
    el.src = shotBase64.startsWith("data:") ? shotBase64 : `data:image/jpeg;base64,${shotBase64}`;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(img, 0, 0);

  const sx = canvas.width / Math.max(1, boxSpace.width);
  const sy = canvas.height / Math.max(1, boxSpace.height);

  for (const mark of marks) {
    const ys = mark.box.map(([, y]) => y);
    const xs = mark.box.map(([x]) => x);
    const top = Math.min(...ys) * sy;
    const bottom = Math.max(...ys) * sy;
    const left = Math.min(...xs) * sx;
    const right = Math.max(...xs) * sx;
    let cx: number;
    let cy: number;
    let r: number;
    if (placement === "above") {
      // Word chip: smaller, centered above the word; clamped inside the frame.
      r = Math.min(18, Math.max(9, (bottom - top) * 0.55));
      cx = Math.min(canvas.width - r - 2, Math.max(r + 2, (left + right) / 2));
      cy = Math.max(r + 2, top - r - 4);
    } else {
      // Line chip sits just left of the line; clamped inside the frame.
      r = Math.min(26, Math.max(12, (bottom - top) * 0.75));
      cy = (top + bottom) / 2;
      cx = Math.max(r + 2, left - r - 6);
    }

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.16);
    ctx.strokeStyle = "#ec4d25";
    ctx.stroke();
    ctx.fillStyle = "#22303f";
    ctx.font = `bold ${Math.round(r * 1.1)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(mark.n), cx, cy + r * 0.05);
  }

  return canvas.toDataURL("image/jpeg", 0.85);
}
