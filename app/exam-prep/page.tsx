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
 * nearest block (ties → topmost; tap fallback when no hand found) →
 * GET /api/azure-token → Speech SDK reads verbatim, wordBoundary drives
 * KaraokeHighlight → log 'read'/'reread' → … → end session → stats page.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CameraStage, CameraStageHandle, CapturedFrame } from "@/components/CameraStage";
import { KaraokeHighlight, OcrBox } from "@/components/KaraokeHighlight";
import { detectFingertip, nearestBlock } from "@/lib/hand-tracker";
import { speak, stopSpeaking, announce } from "@/lib/speech";
import { SessionLogger } from "@/lib/event-queue";

interface OcrResponse {
  blocks: { text: string; confidence: number; box: [number, number][] }[];
}

// Web Speech API (trigger keyword match only — nothing recorded, §7 rule 8).
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { resultIndex: number; results: { [i: number]: { [j: number]: { transcript: string } }; length: number } }) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

export default function ExamPrepPage() {
  const router = useRouter();
  const stage = useRef<CameraStageHandle>(null);
  const logger = useRef<SessionLogger | null>(null);
  const spokenTexts = useRef<Set<string>>(new Set());
  const busyRef = useRef(false);

  const [frame, setFrame] = useState<CapturedFrame | null>(null);
  const [blocks, setBlocks] = useState<OcrBox[]>([]);
  const [selected, setSelected] = useState<OcrBox | null>(null);
  const [awaitingTap, setAwaitingTap] = useState(false);
  const [activeChar, setActiveChar] = useState<{ start: number; len: number }>({ start: 0, len: 0 });
  const [status, setStatus] = useState("Point at the text and say “read this” — or tap the button.");
  const [listening, setListening] = useState(false);

  async function readThis() {
    if (busyRef.current) return;
    busyRef.current = true;
    setAwaitingTap(false);
    setSelected(null);
    setActiveChar({ start: 0, len: 0 });

    const captured = stage.current?.captureFrame(); // freeze-frame (§7 rule 2)
    if (!captured) {
      busyRef.current = false;
      return;
    }
    setFrame(captured);
    setStatus("Reading the page…");

    try {
      const canvas = stage.current?.getCanvas();
      const [ocrRes, tip] = await Promise.all([
        fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: captured.base64 }),
        }),
        canvas ? detectFingertip(canvas).catch(() => null) : Promise.resolve(null),
      ]);
      if (!ocrRes.ok) throw new Error(`ocr ${ocrRes.status}`);
      const data = (await ocrRes.json()) as OcrResponse;
      const found = data.blocks ?? [];
      setBlocks(found);

      if (found.length === 0) {
        setStatus("No text found — try again.");
        finishInteraction();
        return;
      }

      if (tip) {
        // Normalized fingertip → frozen-frame pixels (same space as OCR boxes).
        const block = nearestBlock(
          { x: tip.x * captured.width, y: tip.y * captured.height },
          found,
        );
        if (block) {
          await speakBlock(block);
          return;
        }
      }
      // No hand found — permanent tap fallback.
      setAwaitingTap(true);
      setStatus("No fingertip found — tap the line you want read.");
      busyRef.current = false;
    } catch (err) {
      console.error(err);
      setStatus("OCR failed — try again.");
      finishInteraction();
    }
  }

  useEffect(() => {
    announce("Session logging started."); // mode entry announced aloud (§7 rule 6)
    SessionLogger.start("exam_prep").then((l) => {
      logger.current = l;
      if (!l.enabled) setStatus((s) => `${s} (logging unavailable)`);
    });

    // Voice trigger: plain keyword match, no LLM, nothing recorded (§7 rule 8).
    const Ctor = (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
      .webkitSpeechRecognition;
    let recognition: SpeechRecognitionLike | null = null;
    let stopped = false;
    if (Ctor) {
      recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-SG";
      recognition.onresult = (event) => {
        // Only scan new results — old ones stay in the list in continuous mode.
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (/read this/i.test(event.results[i][0]?.transcript ?? "")) {
            void readThis();
            break;
          }
        }
      };
      recognition.onstart = () => setListening(true);
      // Safari/iOS STT is inconsistent (§9.5) — the button is the permanent fallback.
      recognition.onerror = () => setListening(false);
      recognition.onend = () => {
        if (!stopped) {
          try {
            recognition!.start(); // keep listening across auto-stops
          } catch {
            setListening(false);
          }
        }
      };
      try {
        recognition.start();
      } catch {
        // start() failed (no permission / unsupported) — button fallback remains.
      }
    }

    return () => {
      stopped = true;
      recognition?.stop();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function speakBlock(block: OcrBox) {
    busyRef.current = true;
    setAwaitingTap(false);
    setSelected(block);
    const reread = spokenTexts.current.has(block.text);
    spokenTexts.current.add(block.text);
    logger.current?.log({ type: reread ? "reread" : "read", word: block.text });
    setStatus(`Reading: “${block.text}”`);

    try {
      // VERBATIM: block.text goes to TTS untouched (§5.4).
      await speak(block.text, {
        onWordBoundary: (start, len) => setActiveChar({ start, len }),
      });
    } catch (err) {
      console.error("TTS failed:", err);
      setStatus("Speech failed — check the connection and try again.");
    }
    finishInteraction();
  }

  function finishInteraction() {
    setActiveChar({ start: 0, len: 0 });
    setSelected(null);
    setFrame(null);
    setBlocks([]);
    stage.current?.unfreeze();
    setStatus("Point at the text and say “read this” — or tap the button.");
    busyRef.current = false;
  }

  async function endSession() {
    stopSpeaking();
    const l = logger.current;
    const sessionId = l?.sessionId;
    await l?.end();
    if (sessionId) {
      router.push(`/stats/${sessionId}`);
    } else {
      setStatus("Session ended (logging was unavailable — no stats).");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">Exam-Prep Mode</h1>
      <CameraStage ref={stage} onError={setStatus}>
        {frame && selected && (
          <KaraokeHighlight
            block={selected}
            activeCharStart={activeChar.start}
            activeCharLength={activeChar.len}
            frameWidth={frame.width}
            frameHeight={frame.height}
          />
        )}
        {frame &&
          awaitingTap &&
          blocks.map((b, i) => {
            const xs = b.box.map(([x]) => x);
            const ys = b.box.map(([, y]) => y);
            const left = Math.min(...xs);
            const top = Math.min(...ys);
            return (
              <button
                key={i}
                onClick={() => void speakBlock(b)}
                className="pointer-events-auto absolute rounded-sm border-2 border-emerald-400/80 bg-emerald-300/20"
                style={{
                  left: `${(left / frame.width) * 100}%`,
                  top: `${(top / frame.height) * 100}%`,
                  width: `${((Math.max(...xs) - left) / frame.width) * 100}%`,
                  height: `${((Math.max(...ys) - top) / frame.height) * 100}%`,
                }}
                aria-label={`Read: ${b.text}`}
              />
            );
          })}
      </CameraStage>
      <button
        onClick={() => void readThis()}
        className="rounded-xl bg-emerald-500 p-4 text-lg font-semibold text-white active:scale-95"
      >
        Read this
      </button>
      <button
        onClick={() => void endSession()}
        className="rounded-xl bg-white/10 p-3 font-semibold active:scale-95"
      >
        End session
      </button>
      <p className="text-sm opacity-70">{status}</p>
      <p className="text-xs opacity-40">
        {listening ? "Listening for “read this”…" : "Voice trigger unavailable — use the button."}
      </p>
    </main>
  );
}
