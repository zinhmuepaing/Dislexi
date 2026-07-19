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
 * buildLineMarks is pure (covered by scripts/logic-tests.mts); drawMarks is
 * canvas/DOM and client-only.
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

/**
 * Composite the numbered chips onto a captured frame. `boxSpace` is the
 * scanned frame's dimensions (the space the OCR boxes live in); the fresh
 * shot is scaled to it, so a camera-resolution change between scan and shot
 * cannot shift the chips. Returns a JPEG data URL.
 */
export async function drawMarks(
  shotBase64: string,
  marks: LineMark[],
  boxSpace: { width: number; height: number },
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
    const cy = (top + bottom) / 2;
    const r = Math.min(26, Math.max(12, (bottom - top) * 0.75));
    // Chip sits just left of the line; clamped inside the frame.
    const cx = Math.max(r + 2, left - r - 6);

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
