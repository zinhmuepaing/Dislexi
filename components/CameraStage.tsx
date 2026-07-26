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
import { SwitchCamera, FlipHorizontal2, ImageDown } from "lucide-react";

/** §5.1: compress before upload — target ≤ ~1600px long side, JPEG q≈0.8. */
const MAX_LONG_SIDE = 1600;
const JPEG_QUALITY = 0.8;

const FACING_KEY = "dislexi.cameraFacing";
const MIRROR_KEY = "dislexi.mirrorClip";
const FIXTURE_KEY = "dislexi.testFixture";

/**
 * Local verification only: NEXT_PUBLIC_TEST_IMAGES=1 lets a static worksheet
 * photo stand in for the live camera, so camera-dependent features can be
 * verified without a phone (same opt-in shape as NEXT_PUBLIC_MOCK_STATS).
 *
 * The fixture is drawn to the SAME canvas the camera would fill, so §7 rule 1
 * still holds — OCR, pointing and display keep sharing one coordinate space,
 * and captureFrame()/getCanvas() are untouched. Switching fixtures at runtime
 * is what makes a retry loop testable: a single still image would return the
 * same answer on every attempt.
 */
const TEST_IMAGES = process.env.NEXT_PUBLIC_TEST_IMAGES === "1";

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
  /** Tailwind max-height class for the canvas (viewport-capped, non-fullBleed). */
  maxHeightClass?: string;
  /**
   * Full-bleed: fills the (fixed) parent, canvas object-contain, controls
   * float on top. The overlay layer is measured to the displayed frame rect
   * so %-positioned overlays stay aligned with canvas coords (REWORK 3 P2).
   */
  fullBleed?: boolean;
}

export const CameraStage = forwardRef<CameraStageHandle, CameraStageProps>(
  function CameraStage(
    { children, onError, onReady, onSourceChange, maxHeightClass = "max-h-[54dvh]", fullBleed = false },
    ref,
  ) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number>(0);
    const frozenRef = useRef(false);
    const mirrorRef = useRef(false);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const [ready, setReady] = useState(false);
    const [facing, setFacing] = useState<Facing>("user");
    const [mirror, setMirror] = useState(false);
    const [fixtures, setFixtures] = useState<string[]>([]);
    const [fixture, setFixture] = useState<string | null>(null);
    // Displayed frame rect (px) inside the object-contain canvas — the overlay
    // layer is sized to this so %-coords track the visible frame in fullBleed.
    const [frameRect, setFrameRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

    useEffect(() => {
      if (!fullBleed) return;
      const compute = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const elW = canvas.clientWidth;
        const elH = canvas.clientHeight;
        const cw = canvas.width || 1;
        const ch = canvas.height || 1;
        if (elW === 0 || elH === 0) return;
        const scale = Math.min(elW / cw, elH / ch); // object-contain
        const w = cw * scale;
        const h = ch * scale;
        setFrameRect({ left: (elW - w) / 2, top: (elH - h) / 2, width: w, height: h });
      };
      const ro = new ResizeObserver(compute);
      if (canvasRef.current) ro.observe(canvasRef.current);
      const id = setInterval(compute, 400); // catch canvas bitmap-size changes
      compute();
      return () => {
        ro.disconnect();
        clearInterval(id);
      };
    }, [fullBleed]);

    // Load persisted prefs after mount (SSR-safe).
    useEffect(() => {
      setFacing(storedFacing());
      const m = storedMirror();
      setMirror(m);
      mirrorRef.current = m;
    }, []);

    // Paint the current source to the canvas — flipped ONLY in mirror-clip mode.
    // The source is the live video, or a still fixture when the dev test path
    // is active; step 0 and the canvas contract are identical either way.
    const paint = useCallback(() => {
      const canvas = canvasRef.current;
      const img = imgRef.current;
      const video = videoRef.current;
      const src: CanvasImageSource | null =
        img ?? (video && video.readyState >= 2 ? video : null);
      const w = img ? img.naturalWidth : (video?.videoWidth ?? 0);
      const h = img ? img.naturalHeight : (video?.videoHeight ?? 0);
      if (!canvas || !src || frozenRef.current || w === 0 || h === 0) return false;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      if (mirrorRef.current) {
        ctx.save();
        ctx.scale(-1, 1); // STEP 0 — mirror-clip compensation
        ctx.drawImage(src, -w, 0, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(src, 0, 0, w, h); // raw
      }
      return true;
    }, []);

    const drawLoop = useCallback(() => {
      paint();
      rafRef.current = requestAnimationFrame(drawLoop);
    }, [paint]);

    // Dev test path: discover fixtures and restore the last selection.
    useEffect(() => {
      if (!TEST_IMAGES) return;
      let cancelled = false;
      (async () => {
        try {
          const res = await fetch("/api/dev/test-image");
          if (!res.ok) return;
          const data = (await res.json()) as { images?: string[] };
          if (cancelled || !data.images?.length) return;
          setFixtures(data.images);
          const saved = localStorage.getItem(FIXTURE_KEY);
          if (saved && data.images.includes(saved)) setFixture(saved);
        } catch {
          /* fixtures unavailable — fall through to the real camera */
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []);

    // Load the selected fixture and drive the same draw loop the camera uses.
    useEffect(() => {
      if (!TEST_IMAGES || !fixture) {
        imgRef.current = null;
        return;
      }
      let cancelled = false;
      setReady(false);
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        imgRef.current = img;
        frozenRef.current = false;
        // Paint SYNCHRONOUSLY before onReady: consumers auto-scan on ready and
        // call captureFrame(), which would otherwise capture — and freeze — a
        // blank canvas the rAF loop hadn't reached yet.
        paint();
        setReady(true);
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(drawLoop);
        onReady?.();
        onSourceChange?.();
      };
      img.onerror = () => {
        if (!cancelled) onError?.(`Test fixture "${fixture}" failed to load.`);
      };
      img.src = `/api/dev/test-image?name=${encodeURIComponent(fixture)}`;
      return () => {
        cancelled = true;
        cancelAnimationFrame(rafRef.current);
        imgRef.current = null;
      };
      // onReady/onError/onSourceChange are stable in practice; see below.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fixture, drawLoop, paint]);

    useEffect(() => {
      // Fixture active → never touch getUserMedia (works with no camera at all).
      if (TEST_IMAGES && fixture) return;
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
    }, [facing, drawLoop, fixture]);

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

    function pickFixture(next: string) {
      const value = next === "__camera__" ? null : next;
      setFixture(value);
      try {
        if (value) localStorage.setItem(FIXTURE_KEY, value);
        else localStorage.removeItem(FIXTURE_KEY);
      } catch {
        /* private mode */
      }
    }

    // Camera toggles — paper chips that float top-right in both modes.
    const controls = (
      <div className="absolute right-2 top-2 z-10 flex flex-wrap justify-end gap-1.5">
        {TEST_IMAGES && fixtures.length > 0 && (
          <label className="tool-chip press pointer-events-auto flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium">
            <ImageDown size={14} />
            <select
              value={fixture ?? "__camera__"}
              onChange={(e) => pickFixture(e.target.value)}
              aria-label="Test fixture instead of live camera"
              className="max-w-[128px] bg-transparent text-[11px] font-medium outline-none"
            >
              <option value="__camera__">Live camera</option>
              {fixtures.map((f) => (
                <option key={f} value={f}>
                  {f.replace(/\.(jpe?g|png|webp)$/i, "")}
                </option>
              ))}
            </select>
          </label>
        )}
        {!fixture && (
          <button
            onClick={toggleFacing}
            className="tool-chip press pointer-events-auto flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium"
            aria-label="Switch between front and rear camera"
          >
            <SwitchCamera size={14} /> {facing === "user" ? "Front" : "Rear"}
          </button>
        )}
        <button
          onClick={toggleMirror}
          className={`tool-chip press pointer-events-auto flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium ${
            mirror ? "bg-[var(--yellow)] text-[var(--ink)]" : "text-[var(--ink-soft)]"
          }`}
          aria-label="Toggle mirror-clip compensation"
          aria-pressed={mirror}
        >
          <FlipHorizontal2 size={14} /> Mirror {mirror ? "on" : "off"}
        </button>
      </div>
    );

    const notReady = !ready && (
      <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
        {fixture ? "Loading test image…" : "Starting camera…"}
      </p>
    );

    if (fullBleed) {
      return (
        <div className="absolute inset-0 overflow-hidden bg-[var(--ink)]">
          <video ref={videoRef} playsInline muted className="hidden" />
          {/* Canvas fills the screen, letterboxed (object-contain). */}
          <canvas ref={canvasRef} className="h-full w-full object-contain" />
          {/* Overlay layer measured to the displayed frame rect → aligned. */}
          <div
            className="pointer-events-none absolute"
            style={frameRect ?? { inset: 0 }}
          >
            {children}
          </div>
          {controls}
          {notReady}
        </div>
      );
    }

    return (
      // Non-fullBleed: viewport-capped, shrink-wrapped so overlays align.
      <div className="flex w-full justify-center">
        <div className="relative min-h-[120px] min-w-[240px] w-fit max-w-full overflow-hidden rounded-xl border-2 border-[var(--ink)] bg-[var(--ink)] shadow-[4px_5px_0_rgba(38,55,70,0.14)]">
          <video ref={videoRef} playsInline muted className="hidden" />
          <canvas ref={canvasRef} className={`block h-auto w-auto max-w-full ${maxHeightClass}`} />
          <div className="pointer-events-none absolute inset-0">{children}</div>
          {controls}
          {notReady}
        </div>
      </div>
    );
  },
);
