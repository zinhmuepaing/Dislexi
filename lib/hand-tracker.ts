"use client";

/**
 * Hand tracking (MediaPipe HandLandmarker) — ARCHITECTURE.md §2, §7 rule 5.
 *
 * Client-side singleton. Input is ALWAYS the display canvas from CameraStage
 * (step 0 — the conditional mirror-clip flip — is already applied there).
 * Fingertip = landmark index 8. Detection returns NORMALIZED 0–1 coords;
 * callers scale by the captured frame's width/height to land in the same
 * pixel space as the OCR boxes.
 *
 * Point-to-read pipeline (2026-07-17 rework — replaces tap selection):
 *   startFingerLoop  → smoothed fingertip samples at ~9 fps (VIDEO mode)
 *   selectWordAt     → containment-first selection with upward fingertip
 *                      bias and a max-distance reject (better precision than
 *                      raw nearest-center on long line boxes)
 *   DwellTracker     → hold-to-trigger with dropout grace + refractory
 *
 * `nearestBlock` (nearest center, ties → topmost) is kept as the simple
 * baseline selector and for the pure-logic tests.
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
    // Looser than the 0.5 defaults: a pointing hand seen from above shows
    // few landmarks; recall matters more than precision here (bad samples
    // are absorbed by smoothing + dwell).
    minHandDetectionConfidence: 0.35,
    minHandPresenceConfidence: 0.35,
    minTrackingConfidence: 0.35,
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

/** Single-shot fingertip detection on a frozen canvas. Normalized 0–1 or null. */
export async function detectFingertip(canvas: HTMLCanvasElement): Promise<Point | null> {
  const lm = await ensureMode("IMAGE");
  const tip = lm.detect(canvas).landmarks[0]?.[8];
  if (!tip) return null;
  return { x: tip.x, y: tip.y };
}

/**
 * VIDEO-mode fingertip sample for continuous loops (pointing + trace).
 * The caller passes the live display canvas and a monotonic timestamp.
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

/**
 * Distance-adaptive EMA over normalized coords (One-Euro-lite): heavy
 * smoothing on jitter, fast follow on real movement.
 */
export class PointSmoother {
  private p: Point | null = null;

  reset(): void {
    this.p = null;
  }

  next(raw: Point): Point {
    if (!this.p) {
      this.p = { ...raw };
      return this.p;
    }
    const dist = Math.hypot(raw.x - this.p.x, raw.y - this.p.y);
    const alpha = Math.min(0.85, Math.max(0.25, dist * 14));
    this.p = {
      x: this.p.x + alpha * (raw.x - this.p.x),
      y: this.p.y + alpha * (raw.y - this.p.y),
    };
    return this.p;
  }
}

/**
 * Continuous fingertip sampling loop (~9 fps). Emits smoothed NORMALIZED
 * points (null when no hand). Returns a stop function. Only one loop should
 * run at a time (detectForVideo timestamps must increase monotonically).
 */
export function startFingerLoop(opts: {
  getCanvas: () => HTMLCanvasElement | null;
  onSample: (tip: Point | null) => void;
  intervalMs?: number;
}): () => void {
  const interval = opts.intervalMs ?? 110;
  const smoother = new PointSmoother();
  let running = true;
  let misses = 0;

  const tick = async () => {
    if (!running) return;
    const started = performance.now();
    const canvas = opts.getCanvas();
    if (canvas && canvas.width > 0) {
      try {
        const raw = await detectFingertipVideo(canvas, performance.now());
        if (!running) return;
        if (raw) {
          misses = 0;
          opts.onSample(smoother.next(raw));
        } else {
          if (++misses >= 4) smoother.reset(); // long dropout: don't glue to stale pos
          opts.onSample(null);
        }
      } catch (err) {
        console.error("fingertip loop failed:", err);
        opts.onSample(null);
      }
    }
    if (running) {
      const elapsed = performance.now() - started;
      setTimeout(() => void tick(), Math.max(30, interval - elapsed));
    }
  };
  void tick();

  return () => {
    running = false;
  };
}

export function boxCenter(box: [number, number][]): Point {
  const n = Math.max(1, box.length);
  return {
    x: box.reduce((s, [x]) => s + x, 0) / n,
    y: box.reduce((s, [, y]) => s + y, 0) / n,
  };
}

/**
 * Baseline selector: nearest OCR block by Euclidean distance to box center;
 * ties → topmost (smallest center y).
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

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function rectOf(box: [number, number][]): Rect {
  const xs = box.map(([x]) => x);
  const ys = box.map(([, y]) => y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

/**
 * Precision selector for point-to-read (pixel space, same as OCR boxes).
 *
 * Improvements over nearest-center (which misfires on long line boxes and
 * finger occlusion):
 *  - upward bias: the fingertip covers the word it touches, so the intended
 *    target sits slightly ABOVE the detected tip (~0.45 line heights);
 *  - containment first: a box the (biased) point falls inside always wins;
 *  - otherwise clamped point-to-rect distance with vertical error weighted
 *    heavier (lines are wide, so x-distance is a weak signal);
 *  - reject when nothing is within ~2.5 line heights (pointing at margin).
 * Ties → topmost, as before (§7 rule 5).
 */
export function selectWordAt<T extends OcrBox>(point: Point, blocks: T[]): T | null {
  if (blocks.length === 0) return null;
  const rects = blocks.map((b) => rectOf(b.box));
  const heights = rects.map((r) => r.bottom - r.top).sort((a, b) => a - b);
  const medianH = Math.max(1, heights[Math.floor(heights.length / 2)]);

  const p = { x: point.x, y: point.y - 0.45 * medianH };
  const yWeight = 1.8;

  // Pass 1 — containment (small pad so edges aren't knife-thin targets).
  const padX = 0.35 * medianH;
  const padY = 0.3 * medianH;
  let best: T | null = null;
  let bestDist = Infinity;
  let bestY = Infinity;
  rects.forEach((r, i) => {
    if (p.x >= r.left - padX && p.x <= r.right + padX && p.y >= r.top - padY && p.y <= r.bottom + padY) {
      const c = boxCenter(blocks[i].box);
      const dist = Math.hypot(c.x - p.x, (c.y - p.y) * yWeight);
      if (dist < bestDist - 1e-6 || (Math.abs(dist - bestDist) <= 1e-6 && c.y < bestY)) {
        best = blocks[i];
        bestDist = dist;
        bestY = c.y;
      }
    }
  });
  if (best) return best;

  // Pass 2 — nearest by clamped point-to-rect distance, vertical weighted.
  bestDist = Infinity;
  bestY = Infinity;
  rects.forEach((r, i) => {
    const dx = Math.max(r.left - p.x, 0, p.x - r.right);
    const dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
    const dist = Math.hypot(dx, dy * yWeight);
    const cy = (r.top + r.bottom) / 2;
    if (dist < bestDist - 1e-6 || (Math.abs(dist - bestDist) <= 1e-6 && cy < bestY)) {
      best = blocks[i];
      bestDist = dist;
      bestY = cy;
    }
  });
  return bestDist <= 2.5 * medianH ? best : null;
}

/**
 * Hold-to-trigger: a word fires after the fingertip stays on it for
 * `dwellMs`. Brief detection dropouts (`graceMs`) don't reset progress; a
 * fired word won't re-fire until the finger has been off it for `releaseMs`
 * (or `rearm()` is called — autopsy uses that for the keep-pointing
 * escalation to sound-out).
 */
export class DwellTracker {
  private candidate: string | null = null;
  private candidateSince = 0;
  private lastSeen = 0;
  private firedKey: string | null = null;
  private firedAwaySince: number | null = null;

  constructor(
    private dwellMs = 650,
    private graceMs = 250,
    private releaseMs = 450,
  ) {}

  reset(): void {
    this.candidate = null;
    this.firedKey = null;
    this.firedAwaySince = null;
  }

  /** Allow the given key (or any, when omitted) to fire again immediately. */
  rearm(key?: string): void {
    if (key === undefined || this.firedKey === key) {
      this.firedKey = null;
      this.firedAwaySince = null;
      this.candidateSince = performance.now();
    }
  }

  update(
    observed: string | null,
    now: number,
  ): { hover: string | null; progress: number; fired: string | null } {
    let key = observed;
    // Dropout grace: keep the candidate alive through short detection gaps.
    if (key === null && this.candidate !== null && now - this.lastSeen < this.graceMs) {
      key = this.candidate;
    }
    if (key !== this.candidate) {
      this.candidate = key;
      this.candidateSince = now;
    }
    if (observed !== null) this.lastSeen = now;

    // Refractory release: fired word rearms after time away from it.
    if (this.firedKey !== null) {
      if (key === this.firedKey) {
        this.firedAwaySince = null;
      } else {
        if (this.firedAwaySince === null) this.firedAwaySince = now;
        if (now - this.firedAwaySince >= this.releaseMs) {
          this.firedKey = null;
          this.firedAwaySince = null;
        }
      }
    }

    if (key === null || key === this.firedKey) {
      return { hover: key, progress: 0, fired: null };
    }
    const progress = Math.min(1, (now - this.candidateSince) / this.dwellMs);
    if (progress >= 1) {
      this.firedKey = key;
      this.firedAwaySince = null;
      this.candidateSince = now;
      return { hover: key, progress: 1, fired: key };
    }
    return { hover: key, progress, fired: null };
  }
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
