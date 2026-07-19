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
 * WORD scope gets the same treatment (two-pass): once the line is picked,
 * buildWordMarks numbers that line's word units and the model answers "which
 * chip?" again — never "read the word", because the fingertip occludes its
 * target and the model would name a legible neighbor instead.
 *
 * buildLineMarks/buildWordMarks are pure (covered by scripts/logic-tests.mts);
 * drawMarks is canvas/DOM and client-only.
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

/**
 * Chip placement relative to its box: "left" for line marks (left edge of the
 * line), "above" for word marks — the finger approaches from below on the
 * desk rig, so a chip above the word stays visible while the word itself is
 * covered by the fingertip.
 */
export type MarkPlacement = "left" | "above";

/**
 * Center-y for an "above" chip: just above the word (top − r − 4). When the
 * line above is close (`ceiling` = its bottom edge, same space as `top`), the
 * chip drops to the midpoint of the gap so it cannot cover that line's text
 * (chip-over-text both hurts legibility and lets the model associate the chip
 * with the wrong line). Clamped below the frame top. Pure — logic-tested.
 */
export function aboveChipCenterY(top: number, r: number, ceiling?: number): number {
  let cy = top - r - 4;
  if (ceiling !== undefined && cy - r < ceiling) cy = (ceiling + top) / 2;
  return Math.max(r + 2, cy);
}

/**
 * Bottom edge of the nearest text ABOVE line `blockIndex` that horizontally
 * overlaps it — the ceiling its word chips must stay below. Pure.
 */
export function ceilingFor(
  blocks: { box: [number, number][] }[],
  blockIndex: number,
): number | undefined {
  const line = blocks[blockIndex];
  if (!line) return undefined;
  const xs = line.box.map(([x]) => x);
  const ys = line.box.map(([, y]) => y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  let ceiling: number | undefined;
  blocks.forEach((b, i) => {
    if (i === blockIndex) return;
    const bxs = b.box.map(([x]) => x);
    const bys = b.box.map(([, y]) => y);
    const bottom = Math.max(...bys);
    if ((Math.min(...bys) + bottom) / 2 >= top) return; // not above the line
    if (Math.max(...bxs) <= left || Math.min(...bxs) >= right) return; // no overlap
    if (ceiling === undefined || bottom > ceiling) ceiling = bottom;
  });
  return ceiling;
}

/**
 * Composite the numbered chips onto a captured frame. `boxSpace` is the
 * scanned frame's dimensions (the space the OCR boxes live in); the fresh
 * shot is scaled to it, so a camera-resolution change between scan and shot
 * cannot shift the chips. Returns a JPEG data URL.
 */
export async function drawMarks(
  shotBase64: string,
  marks: { n: number; box: [number, number][]; ceiling?: number }[],
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
      // Word chip: smaller, centered above the word; kept out of the line
      // above (ceiling, scaled to shot space) and inside the frame.
      r = Math.min(18, Math.max(9, (bottom - top) * 0.55));
      cx = Math.min(canvas.width - r - 2, Math.max(r + 2, (left + right) / 2));
      cy = aboveChipCenterY(top, r, mark.ceiling === undefined ? undefined : mark.ceiling * sy);
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
