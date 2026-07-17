"use client";

/**
 * CameraStage — video + canvas + conditional flip + overlay (ARCHITECTURE.md
 * §3, §7; rule 1 amended 2026-07-17 per team instruction).
 *
 * PIPELINE STEP 0 (§7 rule 1, amended): capture is RAW and unmirrored by
 * default for BOTH cameras — the canvas shows exactly what the sensor sees
 * (browsers never mirror getUserMedia frames; only CSS previews do, and we
 * draw the frame ourselves). When the physical mirror clip is attached over
 * the front camera, the "Mirror clip" toggle applies the horizontal flip
 * with ctx.scale(-1, 1) so downstream still sees a correctly-oriented frame.
 * The invariant is unchanged: OCR, MediaPipe, and display all consume THIS
 * canvas, so every coordinate stays in one shared space.
 *
 * Camera toggle: front ("user") ↔ rear ("environment"), persisted per
 * device. Rear camera in a stand needs no mirror clip at all.
 *
 * Freeze-frame (§7 rule 2): OCR/tutoring always run on one captured frame
 * via captureFrame() — never a live stream. `freeze:false` keeps the live
 * preview running for the point-to-read loop while still returning a single
 * frame for OCR.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

/** §5.1: compress before upload — target ≤ ~1600px long side, JPEG q≈0.8. */
const MAX_LONG_SIDE = 1600;
const JPEG_QUALITY = 0.8;

const FACING_KEY = "dislexi.cameraFacing";
const MIRROR_KEY = "dislexi.mirrorClip";

type Facing = "user" | "environment";

function storedFacing(): Facing {
  if (typeof window === "undefined") return "user";
  return localStorage.getItem(FACING_KEY) === "environment" ? "environment" : "user";
}

function storedMirror(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(MIRROR_KEY) === "1"; // default OFF: raw capture
}

export interface CapturedFrame {
  /** base64 JPEG, no data: prefix (the /api/ocr and /api/tutor input format). */
  base64: string;
  width: number;
  height: number;
}

export interface CameraStageHandle {
  /**
   * Capture one frame (step 0 applied) and return it. Freezes the on-screen
   * preview unless `freeze: false` (point-to-read keeps the preview live).
   */
  captureFrame: (opts?: { freeze?: boolean }) => CapturedFrame | null;
  /** Return to the live preview. */
  unfreeze: () => void;
  /**
   * The display canvas (step 0 already applied) — safe MediaPipe input.
   * While frozen it holds the frozen frame; otherwise it keeps refreshing.
   */
  getCanvas: () => HTMLCanvasElement | null;
}

interface CameraStageProps {
  /** Overlays (highlights, regions) drawn on top of the frame. */
  children?: React.ReactNode;
  onError?: (message: string) => void;
  /** Fires whenever a stream becomes ready (initial + after camera switch). */
  onReady?: () => void;
  /** Fires when the camera or mirror setting changes (overlays/scans stale). */
  onSourceChange?: () => void;
}

export const CameraStage = forwardRef<CameraStageHandle, CameraStageProps>(
  function CameraStage({ children, onError, onReady, onSourceChange }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number>(0);
    const frozenRef = useRef(false);
    const mirrorRef = useRef(false);
    const [ready, setReady] = useState(false);
    const [facing, setFacing] = useState<Facing>("user");
    const [mirror, setMirror] = useState(false);

    // Load persisted prefs after mount (SSR-safe).
    useEffect(() => {
      setFacing(storedFacing());
      const m = storedMirror();
      setMirror(m);
      mirrorRef.current = m;
    }, []);

    // Draw the live video to the canvas — flipped ONLY in mirror-clip mode.
    const drawLoop = useCallback(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && !frozenRef.current && video.readyState >= 2) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d")!;
        if (mirrorRef.current) {
          ctx.save();
          ctx.scale(-1, 1); // STEP 0 — mirror-clip compensation
          ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
          ctx.restore();
        } else {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height); // raw
        }
      }
      rafRef.current = requestAnimationFrame(drawLoop);
    }, []);

    useEffect(() => {
      let cancelled = false;
      let stream: MediaStream | null = null;
      setReady(false);
      (async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facing },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          const video = videoRef.current;
          if (video) {
            video.srcObject = stream;
            await video.play();
            if (cancelled) return;
            setReady(true);
            cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(drawLoop);
            onReady?.();
          }
        } catch (err) {
          console.error("camera init failed:", err);
          if (!cancelled) onError?.("Camera access failed. Please allow camera permission.");
        }
      })();
      return () => {
        cancelled = true;
        cancelAnimationFrame(rafRef.current);
        stream?.getTracks().forEach((t) => t.stop());
      };
      // onReady/onError are stable callbacks in practice; re-running on their
      // identity would restart the camera every render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [facing, drawLoop]);

    function toggleFacing() {
      const next: Facing = facing === "user" ? "environment" : "user";
      setFacing(next);
      try {
        localStorage.setItem(FACING_KEY, next);
      } catch {
        /* private mode */
      }
      frozenRef.current = false;
      onSourceChange?.();
    }

    function toggleMirror() {
      const next = !mirror;
      setMirror(next);
      mirrorRef.current = next;
      try {
        localStorage.setItem(MIRROR_KEY, next ? "1" : "0");
      } catch {
        /* private mode */
      }
      frozenRef.current = false;
      onSourceChange?.();
    }

    useImperativeHandle(ref, () => ({
      captureFrame: (opts) => {
        const canvas = canvasRef.current;
        if (!canvas || canvas.width === 0) return null;
        if (opts?.freeze !== false) frozenRef.current = true;

        // Downscale for upload (§5.1 constraints) — coordinates returned by
        // OCR are in THIS downscaled frame's pixel space.
        const scale = Math.min(1, MAX_LONG_SIDE / Math.max(canvas.width, canvas.height));
        const out = document.createElement("canvas");
        out.width = Math.round(canvas.width * scale);
        out.height = Math.round(canvas.height * scale);
        out.getContext("2d")!.drawImage(canvas, 0, 0, out.width, out.height);

        const dataUrl = out.toDataURL("image/jpeg", JPEG_QUALITY);
        return {
          base64: dataUrl.replace(/^data:image\/jpeg;base64,/, ""),
          width: out.width,
          height: out.height,
        };
      },
      unfreeze: () => {
        frozenRef.current = false;
      },
      getCanvas: () => canvasRef.current,
    }));

    return (
      <div className="relative w-full overflow-hidden rounded-xl border-[1.5px] border-[var(--ink)] bg-[var(--ink)]">
        {/* Hidden raw video — never shown or processed directly. */}
        <video ref={videoRef} playsInline muted className="hidden" />
        {/* The canvas everything sees (step 0 applied when mirror is on). */}
        <canvas ref={canvasRef} className="w-full" />
        {/* Overlay layer (highlights, regions) in canvas-frame space. */}
        <div className="pointer-events-none absolute inset-0">{children}</div>

        {/* Camera controls */}
        <div className="absolute right-2 top-2 flex gap-1.5">
          <button
            onClick={toggleFacing}
            className="pointer-events-auto rounded-full border-[1.5px] border-[var(--ink)] bg-white/95 px-2.5 py-1 font-mono text-[10px] font-medium text-[var(--ink)] shadow-[2px_2px_0_rgba(34,48,63,0.2)] active:translate-x-px active:translate-y-px active:shadow-none"
            aria-label="Switch between front and rear camera"
          >
            ⟲ {facing === "user" ? "Front" : "Rear"} cam
          </button>
          <button
            onClick={toggleMirror}
            className={`pointer-events-auto rounded-full border-[1.5px] border-[var(--ink)] px-2.5 py-1 font-mono text-[10px] font-medium shadow-[2px_2px_0_rgba(34,48,63,0.2)] active:translate-x-px active:translate-y-px active:shadow-none ${
              mirror ? "bg-[var(--hl)] text-[var(--ink)]" : "bg-white/95 text-[var(--ink-soft)]"
            }`}
            aria-label="Toggle mirror-clip compensation"
            aria-pressed={mirror}
          >
            Mirror clip {mirror ? "ON" : "OFF"}
          </button>
        </div>

        {!ready && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            Starting camera…
          </p>
        )}
      </div>
    );
  },
);
