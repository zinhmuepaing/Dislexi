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
 * WORD scope: full-page LINE pass (buildLineMarks + "which line?") → a
 * deterministic OCCLUSION correction (correctForOcclusion — the fingernail
 * rests a line below the word it means, so the pick is reliably one line low;
 * retarget to a closely-spaced line above) → a ZOOMED word pass
 * (drawWordMarksZoom crops to that line with the finger below, big chips) →
 * "which word?". Classification throughout, never "read the word": the
 * fingertip occludes its target, so the model would name a legible neighbor.
 *
 * buildLineMarks/buildWordMarks/correctForOcclusion are pure (covered by
 * scripts/logic-tests.mts); drawMarks/drawWordMarksZoom are canvas/DOM and
 * client-only.
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

export interface OcclusionOpts {
  /** Retarget up only when the line above is within this × the picked line's height. */
  gapFactor?: number;
  /** Min horizontal overlap with the picked line, as a fraction of the narrower box. */
  minOverlap?: number;
}

/**
 * OCCLUSION CORRECTION for the LINE pass. The child rests the fingernail just
 * BELOW the word they mean, so the line pass reliably lands one line too low.
 * If a text line sits CLOSELY above the picked line (tight spacing ⇒ the tip is
 * hiding it) and overlaps it horizontally, return that line's index; isolated
 * lines with a large gap above (headings) are left alone. Pure; covered by
 * scripts/logic-tests.mts.
 */
export function correctForOcclusion(
  blocks: { text: string; box: [number, number][] }[],
  blockIndex: number,
  opts: OcclusionOpts = {},
): number {
  const gapFactor = opts.gapFactor ?? 1.1;
  const minOverlap = opts.minOverlap ?? 0.3;
  const rct = (box: [number, number][]) => {
    const xs = box.map(([x]) => x);
    const ys = box.map(([, y]) => y);
    return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys), h: Math.max(...ys) - Math.min(...ys) };
  };
  const target = blocks[blockIndex];
  if (!target) return blockIndex;
  const L = rct(target.box);
  let above = -1;
  let aboveBottom = -Infinity;
  for (let i = 0; i < blocks.length; i++) {
    if (i === blockIndex || blocks[i].text.trim() === "") continue;
    const R = rct(blocks[i].box);
    if (R.b >= L.t) continue; // must sit above the picked line
    const overlap = Math.min(L.r, R.r) - Math.max(L.l, R.l);
    if (overlap < minOverlap * Math.min(L.r - L.l, R.r - R.l)) continue; // needs x-overlap
    if (R.b > aboveBottom) { aboveBottom = R.b; above = i; } // closest line above
  }
  return above >= 0 && L.t - aboveBottom < gapFactor * L.h ? above : blockIndex;
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

/**
 * ZOOMED word pass: crop the shot to the target line PLUS the strip below it
 * (so the pointing fingertip — which sits about a line low — is in frame),
 * scale up, and draw one big numbered chip above each word. Cropping + scaling
 * survives the API's downscaling and lets the model judge the fingertip's
 * horizontal alignment; the full-frame word pass could not. `boxSpace` is the
 * scan frame's dims (the space the boxes live in). Returns a JPEG data URL.
 */
export async function drawWordMarksZoom(
  shotBase64: string,
  marks: { n: number; box: [number, number][] }[],
  boxSpace: { width: number; height: number },
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("frame decode failed"));
    el.src = shotBase64.startsWith("data:") ? shotBase64 : `data:image/jpeg;base64,${shotBase64}`;
  });

  const sx = img.naturalWidth / Math.max(1, boxSpace.width);
  const sy = img.naturalHeight / Math.max(1, boxSpace.height);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const m of marks) for (const [x, y] of m.box) { xs.push(x * sx); ys.push(y * sy); }
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const lh = Math.max(1, maxY - minY); // one line → bbox height ≈ line height

  const ox = Math.max(0, minX - lh * 0.5);
  const oy = Math.max(0, minY - lh * 0.9); // headroom for the chips above the words
  const right = Math.min(img.naturalWidth, maxX + lh * 0.5);
  const bottom = Math.min(img.naturalHeight, maxY + lh * 3); // strip below → the finger
  const cw = Math.max(1, right - ox);
  const ch = Math.max(1, bottom - oy);
  const k = Math.max(1, Math.min(4, 1300 / cw));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cw * k);
  canvas.height = Math.round(ch * k);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(img, ox, oy, cw, ch, 0, 0, canvas.width, canvas.height);

  const r = Math.max(16, Math.min(32, lh * k * 0.5));
  for (const m of marks) {
    const bxs = m.box.map(([x]) => x * sx);
    const bys = m.box.map(([, y]) => y * sy);
    const cx = ((Math.min(...bxs) + Math.max(...bxs)) / 2 - ox) * k;
    const cy = Math.max(r + 2, (Math.min(...bys) - oy) * k - r - 8);
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
    ctx.fillText(String(m.n), cx, cy + r * 0.05);
  }

  return canvas.toDataURL("image/jpeg", 0.85);
}
