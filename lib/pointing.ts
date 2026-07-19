"use client";

/**
 * Shared set-of-marks pointing pipeline for Exam-Prep and Autopsy.
 *
 * One interaction = ONE shot (§7 rule 2): capture (freezing the preview so
 * highlights render on the exact frame the selection was made on — the caller
 * unfreezes when the interaction ends) → re-OCR the shot and align the scan's
 * boxes to it (lib/align.ts; fixes handheld scan-vs-shot drift, where chips
 * landed on the wrong physical lines) → line-marks pass → optional
 * word-granularity marks pass (the fingertip occludes its target, so the
 * model classifies a chip, never reads the word) → resolved line/word unit.
 *
 * Compliance unchanged (§7 rule 3): the model picks WHERE (chip numbers);
 * the spoken text is always the caller's OCR text verbatim.
 */

import type { OcrBox } from "@/components/KaraokeHighlight";
import type { CameraStageHandle, CapturedFrame } from "@/components/CameraStage";
import { alignScanToShot, applyToBlocks, applyToBox, IDENTITY } from "@/lib/align";
import { buildLineMarks, buildWordMarks, ceilingFor, drawMarks } from "@/lib/marks";
import { bestWordMatch } from "@/lib/text-match";

export interface PointUnit {
  text: string;
  box: [number, number][];
}

export type PointFailure =
  /** Another locate is already in flight — ignore this trigger silently. */
  | "busy"
  /** Camera not ready / no frame available. */
  | "camera"
  /** The model saw no pointing hand on a marked line. */
  | "no_finger"
  /** Line found, but the pointed word could not be resolved. */
  | "no_word";

export type PointResult =
  | {
      ok: true;
      /** Index into the caller's scanBlocks of the picked line. */
      blockIndex: number;
      /** Index into wordUnitsFor(blockIndex)'s array; null when no word pass ran. */
      unitIndex: number | null;
      /** The single shot this interaction used (§7 rule 2). */
      shot: CapturedFrame;
      /** scanBlocks remapped into shot space (only meaningful when aligned). */
      alignedBlocks: OcrBox[];
      /** True → commit alignedBlocks + shot dims as the new scan state. */
      aligned: boolean;
    }
  | { ok: false; reason: PointFailure };

let inFlight = false;

async function ocrBlocks(base64: string): Promise<OcrBox[] | null> {
  try {
    const res = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: base64 }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { blocks?: OcrBox[] };
    return data.blocks ?? null;
  } catch {
    return null;
  }
}

/**
 * Locate the pointed line (and word). Single-flight: a second call while one
 * is running fails fast with "busy". The preview is left FROZEN on success
 * and on no_finger/no_word failures — the caller unfreezes at the end of the
 * interaction (its finally block), so the child sees the frame that was read.
 */
export async function locatePointedUnit(opts: {
  stage: CameraStageHandle | null;
  scanBlocks: OcrBox[];
  scanSize: { width: number; height: number };
  /**
   * Word units (scan space) of a picked line — non-null return triggers the
   * word-granularity second pass. Index order must be stable across calls.
   */
  wordUnitsFor?: (blockIndex: number) => PointUnit[];
  onStatus?: (msg: string) => void;
}): Promise<PointResult> {
  if (inFlight) return { ok: false, reason: "busy" };
  inFlight = true;
  try {
    const shot = opts.stage?.captureFrame({ freeze: true });
    if (!shot) return { ok: false, reason: "camera" };

    // Drift alignment: re-OCR the shot (registration only — the hand occludes
    // the target region, so the scan stays the text authority). Any failure
    // degrades to IDENTITY, i.e. the pre-alignment behavior.
    const freshBlocks = await ocrBlocks(shot.base64);
    const alignment = freshBlocks
      ? alignScanToShot(opts.scanBlocks, freshBlocks)
      : { transform: IDENTITY, matched: 0, aligned: false };
    const alignedBlocks = alignment.aligned
      ? applyToBlocks(alignment.transform, opts.scanBlocks)
      : opts.scanBlocks;
    // Chip/box space: shot pixels when aligned, else the original scan's.
    const boxSpace = alignment.aligned
      ? { width: shot.width, height: shot.height }
      : opts.scanSize;

    const lineMarks = buildLineMarks(alignedBlocks);
    if (lineMarks.length === 0) return { ok: false, reason: "no_finger" };
    const lineImage = await drawMarks(shot.base64, lineMarks, boxSpace);
    const lineRes = await fetch("/api/point", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: lineImage,
        marks: lineMarks.map(({ n, text }) => ({ n, text })),
      }),
    });
    const lineData = (await lineRes.json()) as { found?: boolean; mark?: number; word?: string | null };
    const lineMark = lineData.found ? lineMarks.find((m) => m.n === lineData.mark) : undefined;
    if (!lineMark) return { ok: false, reason: "no_finger" };

    const base = {
      blockIndex: lineMark.blockIndex,
      shot,
      alignedBlocks,
      aligned: alignment.aligned,
    };
    const units = opts.wordUnitsFor?.(lineMark.blockIndex);
    if (!units) return { ok: true, unitIndex: null, ...base };
    if (units.length === 0) return { ok: false, reason: "no_word" };
    if (units.length === 1) return { ok: true, unitIndex: 0, ...base };

    // Word pass: chips above each word of the picked line — classification,
    // not reading (the model would name a legible neighbor of the covered
    // word). The pass-1 word guess survives only as the fallback.
    opts.onStatus?.("Finding the word…");
    try {
      const wordMarks = buildWordMarks(
        units.map((u) => ({
          text: u.text,
          box: alignment.aligned ? applyToBox(alignment.transform, u.box) : u.box,
        })),
      );
      // Keep the chips out of the line above at tight line spacing.
      const ceiling = ceilingFor(alignedBlocks, lineMark.blockIndex);
      const wordImage = await drawMarks(
        shot.base64,
        wordMarks.map((m) => ({ ...m, ceiling })),
        boxSpace,
        "above",
      );
      const wordRes = await fetch("/api/point", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: wordImage,
          marks: wordMarks.map(({ n, text }) => ({ n, text })),
          granularity: "word",
        }),
      });
      const wordData = (await wordRes.json()) as { found?: boolean; mark?: number };
      const wordMark = wordData.found ? wordMarks.find((m) => m.n === wordData.mark) : undefined;
      if (wordMark) return { ok: true, unitIndex: wordMark.unitIndex, ...base };
    } catch (err) {
      console.error("word-mark pass failed:", err);
    }
    const match = bestWordMatch(units.map((u) => u.text), lineData.word ?? null);
    if (match) return { ok: true, unitIndex: match.index, ...base };
    return { ok: false, reason: "no_word" };
  } finally {
    inFlight = false;
  }
}
