"use client";

/**
 * CameraStage — video + canvas + flip + overlay (ARCHITECTURE.md §3, §7).
 *
 * PIPELINE STEP 0 (§7 rule 1): the mirror clip over the front camera mirrors
 * every frame. Every frame drawn here is flipped with ctx.scale(-1, 1) BEFORE
 * anything downstream (OCR upload, MediaPipe, display) sees it. The axis is
 * hardcoded (horizontal) after the week-one physical test. Nothing downstream
 * ever sees an unflipped frame; all coordinates are in flipped-frame space.
 *
 * Freeze-frame (§7 rule 2): capture is one frame per interaction via
 * captureFrame() — OCR/tutoring never run on a live stream. Overlays render
 * on the frozen frame through `children`.
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

export interface CapturedFrame {
  /** base64 JPEG, no data: prefix (the /api/ocr and /api/tutor input format). */
  base64: string;
  width: number;
  height: number;
}

export interface CameraStageHandle {
  /** Capture + flip one frame (step 0 applied), freeze it on screen, return it. */
  captureFrame: () => CapturedFrame | null;
  /** Return to the live (flipped) preview. */
  unfreeze: () => void;
}

interface CameraStageProps {
  /** Overlays (highlights, regions) drawn on top of the frozen frame. */
  children?: React.ReactNode;
  onError?: (message: string) => void;
}

export const CameraStage = forwardRef<CameraStageHandle, CameraStageProps>(
  function CameraStage({ children, onError }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number>(0);
    const frozenRef = useRef(false);
    const [ready, setReady] = useState(false);

    // Draw the live video to the canvas, flipped (step 0), until frozen.
    const drawLoop = useCallback(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && !frozenRef.current && video.readyState >= 2) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.save();
        ctx.scale(-1, 1); // STEP 0 — hardcoded horizontal flip
        ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      rafRef.current = requestAnimationFrame(drawLoop);
    }, []);

    useEffect(() => {
      let stream: MediaStream | null = null;
      (async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" }, // front camera — mirror clip redirects it to the worksheet
            audio: false,
          });
          const video = videoRef.current;
          if (video) {
            video.srcObject = stream;
            await video.play();
            setReady(true);
            rafRef.current = requestAnimationFrame(drawLoop);
          }
        } catch (err) {
          console.error("camera init failed:", err);
          onError?.("Camera access failed. Please allow camera permission.");
        }
      })();
      return () => {
        cancelAnimationFrame(rafRef.current);
        stream?.getTracks().forEach((t) => t.stop());
      };
    }, [drawLoop, onError]);

    useImperativeHandle(ref, () => ({
      captureFrame: () => {
        const canvas = canvasRef.current;
        if (!canvas || canvas.width === 0) return null;
        frozenRef.current = true; // freeze: the last flipped frame stays on screen

        // Downscale for upload (§5.1 constraints) — coordinates returned by
        // OCR are in THIS downscaled flipped frame's pixel space.
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
    }));

    return (
      <div className="relative w-full overflow-hidden rounded-xl bg-black">
        {/* Hidden raw (mirrored) video — never shown or processed directly. */}
        <video ref={videoRef} playsInline muted className="hidden" />
        {/* The flipped frame everything sees. */}
        <canvas ref={canvasRef} className="w-full" />
        {/* Overlay layer (highlights, tutor regions) in flipped-frame space. */}
        <div className="pointer-events-none absolute inset-0">{children}</div>
        {!ready && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
            Starting camera…
          </p>
        )}
      </div>
    );
  },
);
