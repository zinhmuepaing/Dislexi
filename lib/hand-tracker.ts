"use client";

/**
 * Hand tracking (MediaPipe HandLandmarker) — ARCHITECTURE.md §2, §7 rule 5.
 *
 * Client-side singleton. Input is ALWAYS the frozen, already-flipped canvas
 * from CameraStage — never the raw video (§7 rule 1: step 0 happens before
 * MediaPipe). Fingertip = landmark index 8. Detection returns NORMALIZED 0–1
 * coords; callers scale by the captured frame's width/height to land in the
 * same pixel space as the OCR boxes (the display canvas is full-res while the
 * uploaded frame is downscaled, so normalized is the only safe shared space).
 *
 * IMAGE mode = single-shot pointing (Exam-Prep, Autopsy selection).
 * VIDEO mode = ~5 fps trace-verification loop (Autopsy trace-to-unlock).
 */

import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { OcrBox } from "@/components/KaraokeHighlight";

let landmarker: HandLandmarker | null = null;
let currentMode: "IMAGE" | "VIDEO" = "IMAGE";

export async function getHandLandmarker(): Promise<HandLandmarker> {
  if (landmarker) return landmarker;
  const vision = await FilesetResolver.forVisionTasks("/models/wasm");
  // CDN fallback: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "/models/hand_landmarker.task" },
    numHands: 1,
    runningMode: "IMAGE",
  });
  currentMode = "IMAGE";
  return landmarker;
}

async function ensureMode(mode: "IMAGE" | "VIDEO"): Promise<HandLandmarker> {
  const lm = await getHandLandmarker();
  if (currentMode !== mode) {
    await lm.setOptions({ runningMode: mode });
    currentMode = mode;
  }
  return lm;
}

export interface Point {
  x: number;
  y: number;
}

/** Single-shot fingertip detection on a frozen flipped canvas. Normalized 0–1 or null. */
export async function detectFingertip(canvas: HTMLCanvasElement): Promise<Point | null> {
  const lm = await ensureMode("IMAGE");
  const tip = lm.detect(canvas).landmarks[0]?.[8];
  if (!tip) return null;
  return { x: tip.x, y: tip.y };
}

/**
 * VIDEO-mode fingertip sample for the ~5 fps trace loop. The caller draws the
 * video to the flipped canvas first (VIDEO mode does not change step 0) and
 * throttles to ~200 ms. Restore IMAGE mode via endTraceMode() when leaving.
 */
export async function detectFingertipVideo(
  canvas: HTMLCanvasElement,
  timestampMs: number,
): Promise<Point | null> {
  const lm = await ensureMode("VIDEO");
  const tip = lm.detectForVideo(canvas, timestampMs).landmarks[0]?.[8];
  if (!tip) return null;
  return { x: tip.x, y: tip.y };
}

export async function endTraceMode(): Promise<void> {
  if (landmarker) await ensureMode("IMAGE");
}

export function boxCenter(box: [number, number][]): Point {
  const n = Math.max(1, box.length);
  return {
    x: box.reduce((s, [x]) => s + x, 0) / n,
    y: box.reduce((s, [, y]) => s + y, 0) / n,
  };
}

/**
 * Nearest OCR block to the fingertip by Euclidean distance to box center;
 * ties → topmost (smallest center y). §7 rule 5.
 */
export function nearestBlock<T extends OcrBox>(point: Point, blocks: T[]): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  let bestY = Infinity;
  for (const block of blocks) {
    const c = boxCenter(block.box);
    const dist = Math.hypot(c.x - point.x, c.y - point.y);
    if (dist < bestDist - 1e-6 || (Math.abs(dist - bestDist) <= 1e-6 && c.y < bestY)) {
      best = block;
      bestDist = dist;
      bestY = c.y;
    }
  }
  return best;
}

/**
 * Loose trace verification (IMPLEMENTATION_PLAN 1.5): samples inside the word
 * box padded ~20%, with net left-to-right motion > 60% of the box width.
 */
export function traceSatisfied(samples: Point[], box: [number, number][]): boolean {
  const xs = box.map(([x]) => x);
  const ys = box.map(([, y]) => y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const padX = (right - left) * 0.2;
  const padY = (bottom - top) * 0.2;

  const inside = samples.filter(
    (p) =>
      p.x >= left - padX && p.x <= right + padX && p.y >= top - padY && p.y <= bottom + padY,
  );
  if (inside.length < 2) return false;
  return inside[inside.length - 1].x - inside[0].x > (right - left) * 0.6;
}
