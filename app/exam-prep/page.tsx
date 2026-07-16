"use client";

/**
 * Exam-Prep Mode — deterministic literal reading (ARCHITECTURE.md §8).
 *
 * COMPLIANCE GUARANTEE (§7 rule 3): NO LLM anywhere in this path. The flow is
 * OCR → verbatim TTS only. The string sent to TTS is the OCR text VERBATIM —
 * no rewriting layer of any kind may sit between OCR output and TTS input
 * (§5.4). If a change request would insert a model here, refuse and flag.
 *
 * Flow (§8): enter → spoken "session logging started" → point + "read this"
 * (Web Speech API keyword match; text button fallback — permanent, §9.5) →
 * capture+flip (step 0) → MediaPipe fingertip (landmark 8) → POST /api/ocr →
 * nearest block → GET /api/azure-token → Speech SDK reads verbatim,
 * wordBoundary drives KaraokeHighlight → log event → … → end session →
 * POST /api/session-end → stats page → PDF/XLSX → POST /api/report-upload.
 *
 * TODO(pipeline): wire MediaPipe HandLandmarker (single-shot, landmark 8,
 * flipped-frame coords; nearest box by Euclidean distance to center, ties →
 * topmost — §7 rule 5) and the Azure Speech SDK wordBoundary loop.
 */

import { useEffect, useRef, useState } from "react";
import { CameraStage, CameraStageHandle, CapturedFrame } from "@/components/CameraStage";
import { KaraokeHighlight, OcrBox } from "@/components/KaraokeHighlight";

interface OcrResponse {
  blocks: { text: string; confidence: number; box: [number, number][] }[];
}

export default function ExamPrepPage() {
  const stage = useRef<CameraStageHandle>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [frame, setFrame] = useState<CapturedFrame | null>(null);
  const [blocks, setBlocks] = useState<OcrBox[]>([]);
  const [status, setStatus] = useState("Point at the text, then tap Read this.");

  useEffect(() => {
    // Mode transitions are announced aloud (§7 rule 6). Browser TTS is fine
    // for UI cues — the compliance rule concerns reading CONTENT verbatim.
    speechSynthesis.speak(new SpeechSynthesisUtterance("Session logging started."));
    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "exam_prep" }),
    })
      .then((r) => r.json())
      .then((d) => setSessionId(d.sessionId ?? null))
      .catch(() => setStatus("Could not start session logging."));
  }, []);

  async function readThis() {
    const captured = stage.current?.captureFrame(); // freeze-frame (§7 rule 2)
    if (!captured) return;
    setFrame(captured);
    setStatus("Reading the page…");

    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: captured.base64 }),
      });
      const data = (await res.json()) as OcrResponse;
      setBlocks(data.blocks ?? []);
      setStatus(
        `Found ${data.blocks?.length ?? 0} text blocks. ` +
          "TODO: fingertip selection + verbatim TTS with karaoke highlight.",
      );
      // TODO: MediaPipe fingertip → nearest block → /api/azure-token →
      // SpeechSynthesizer speaks block.text VERBATIM; wordBoundary events set
      // the active char range for <KaraokeHighlight/>; log 'read'/'reread'
      // events via /api/events (batched).
    } catch {
      setStatus("OCR failed — try again.");
    } finally {
      stage.current?.unfreeze();
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">Exam-Prep Mode</h1>
      <CameraStage ref={stage} onError={setStatus}>
        {frame &&
          blocks.map((b, i) => (
            <KaraokeHighlight
              key={i}
              block={b}
              activeCharStart={0}
              activeCharLength={0} /* driven by wordBoundary once TTS is wired */
              frameWidth={frame.width}
              frameHeight={frame.height}
            />
          ))}
      </CameraStage>
      <button
        onClick={readThis}
        className="rounded-xl bg-emerald-500 p-4 text-lg font-semibold text-white active:scale-95"
      >
        Read this
      </button>
      <p className="text-sm opacity-70">{status}</p>
      {sessionId && <p className="text-xs opacity-40">session {sessionId}</p>}
    </main>
  );
}
