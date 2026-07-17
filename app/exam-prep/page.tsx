"use client";

/**
 * Exam-Prep Mode — deterministic literal reading (ARCHITECTURE.md §8).
 *
 * COMPLIANCE GUARANTEE (§7 rule 3): NO LLM anywhere in this path. The flow is
 * OCR → verbatim TTS only. The string sent to TTS is the OCR text VERBATIM —
 * no rewriting layer of any kind may sit between OCR output and TTS input
 * (§5.4). If a change request would insert a model here, refuse and flag.
 *
 * Point-to-read flow (2026-07-17 rework — tap selection removed):
 * enter → spoken "session logging started" → mic permission prompts
 * immediately (voice trigger) → camera ready → AUTO scan: one frame captured
 * (preview stays live) → POST /api/ocr → continuous fingertip loop
 * (landmark 8, smoothed) → dwell on a line → Speech SDK reads it verbatim,
 * wordBoundary drives KaraokeHighlight → log 'read'/'reread' → … →
 * end session → stats page. Saying "read this" reads the pointed line
 * instantly (no dwell wait).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CameraStage, CameraStageHandle, CapturedFrame } from "@/components/CameraStage";
import { KaraokeHighlight, OcrBox } from "@/components/KaraokeHighlight";
import { selectWordAt, startFingerLoop, DwellTracker, Point } from "@/lib/hand-tracker";
import { speak, stopSpeaking, announce, primeSpeech } from "@/lib/speech";
import { installAudioUnlock } from "@/lib/audio";
import { SessionLogger } from "@/lib/event-queue";

interface OcrResponse {
  blocks: { text: string; confidence: number; box: [number, number][] }[];
}

interface Scan {
  frame: CapturedFrame;
  blocks: OcrBox[];
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

const SCAN_SETTLE_MS = 900; // let autoexposure settle before the auto-scan

export default function ExamPrepPage() {
  const router = useRouter();
  const stage = useRef<CameraStageHandle>(null);
  const logger = useRef<SessionLogger | null>(null);
  const spokenTexts = useRef<Set<string>>(new Set());
  const busyRef = useRef(false);
  const scanRef = useRef<Scan | null>(null);
  const scanningRef = useRef(false);
  const hoverRef = useRef<number | null>(null);
  const dwellRef = useRef<DwellTracker>(new DwellTracker(650, 250, 500));
  const stopLoopRef = useRef<(() => void) | null>(null);
  const autoScanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [scan, setScan] = useState<Scan | null>(null);
  const [tip, setTip] = useState<Point | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [dwellProgress, setDwellProgress] = useState(0);
  const [selected, setSelected] = useState<OcrBox | null>(null);
  const [activeChar, setActiveChar] = useState<{ start: number; len: number }>({ start: 0, len: 0 });
  const [status, setStatus] = useState("Starting camera…");
  const [listening, setListening] = useState(false);

  function stopLoop() {
    stopLoopRef.current?.();
    stopLoopRef.current = null;
  }

  function startLoop() {
    stopLoop();
    dwellRef.current = new DwellTracker(650, 250, 500);
    stopLoopRef.current = startFingerLoop({
      getCanvas: () => stage.current?.getCanvas() ?? null,
      onSample: (sample) => {
        setTip(sample);
        const current = scanRef.current;
        if (!current) return;
        if (busyRef.current) {
          // Reading in progress: show the pointer, pause dwell triggering.
          setHover(null);
          setDwellProgress(0);
          return;
        }
        let key: string | null = null;
        if (sample) {
          const block = selectWordAt(
            { x: sample.x * current.frame.width, y: sample.y * current.frame.height },
            current.blocks,
          );
          if (block) key = String(current.blocks.indexOf(block));
        }
        const res = dwellRef.current.update(key, performance.now());
        const hoverIdx = res.hover === null ? null : Number(res.hover);
        hoverRef.current = hoverIdx;
        setHover(hoverIdx);
        setDwellProgress(res.progress);
        if (res.fired !== null) {
          const block = current.blocks[Number(res.fired)];
          if (block) void readBlock(block);
        }
      },
    });
  }

  async function rescan() {
    if (scanningRef.current) return;
    scanningRef.current = true;
    stopLoop();
    stopSpeaking();
    busyRef.current = false;
    scanRef.current = null;
    setScan(null);
    setSelected(null);
    setHover(null);
    setDwellProgress(0);
    setStatus("Scanning the page…");

    try {
      const captured = stage.current?.captureFrame({ freeze: false }); // one frame; preview stays live
      if (!captured) {
        setStatus("Camera not ready yet — tap Rescan in a moment.");
        return;
      }
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: captured.base64 }),
      });
      if (!res.ok) throw new Error(`ocr ${res.status}`);
      const data = (await res.json()) as OcrResponse;
      const blocks = data.blocks ?? [];
      if (blocks.length === 0) {
        setStatus("No text found — lay the worksheet flat and tap Rescan.");
        return;
      }
      const next: Scan = { frame: captured, blocks };
      scanRef.current = next;
      setScan(next);
      setStatus("Point at a line and hold still — it will be read aloud.");
      startLoop();
    } catch (err) {
      console.error(err);
      setStatus("Scanning failed — tap Rescan to try again.");
    } finally {
      scanningRef.current = false;
    }
  }

  function scheduleAutoScan() {
    if (autoScanTimer.current) clearTimeout(autoScanTimer.current);
    autoScanTimer.current = setTimeout(() => {
      if (!scanRef.current && !scanningRef.current) void rescan();
    }, SCAN_SETTLE_MS);
  }

  async function readBlock(block: OcrBox) {
    if (busyRef.current) return;
    busyRef.current = true;
    setSelected(block);
    setActiveChar({ start: 0, len: 0 });
    const reread = spokenTexts.current.has(block.text);
    spokenTexts.current.add(block.text);
    logger.current?.log({ type: reread ? "reread" : "read", word: block.text });
    setStatus(`Reading: “${block.text}”`);

    try {
      // VERBATIM: block.text goes to TTS untouched (§5.4).
      await speak(block.text, {
        onWordBoundary: (start, len) => setActiveChar({ start, len }),
      });
      setStatus("Point at a line and hold still — it will be read aloud.");
    } catch (err) {
      console.error("TTS failed:", err);
      setStatus("Speech failed — check the connection and point again.");
    }
    setSelected(null);
    setActiveChar({ start: 0, len: 0 });
    busyRef.current = false;
  }

  /** Voice trigger / button: read the pointed line immediately (no dwell). */
  function readPointedNow() {
    const current = scanRef.current;
    if (!current || busyRef.current) return;
    const idx = hoverRef.current;
    if (idx === null || !current.blocks[idx]) {
      setStatus("Point your finger at a line first.");
      return;
    }
    void readBlock(current.blocks[idx]);
  }

  useEffect(() => {
    announce("Session logging started."); // mode entry announced aloud (§7 rule 6)
    installAudioUnlock();
    primeSpeech();
    SessionLogger.start("exam_prep").then((l) => {
      logger.current = l;
      if (!l.enabled) setStatus((s) => `${s} (logging unavailable)`);
    });

    // Voice trigger: plain keyword match, no LLM, nothing recorded (§7 rule 8).
    // Starting recognition here prompts for the microphone immediately.
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
            readPointedNow();
            break;
          }
        }
      };
      recognition.onstart = () => setListening(true);
      // Safari/iOS STT is inconsistent (§9.5) — pointing alone still works.
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
        // start() failed (no permission / unsupported) — pointing still works.
      }
    }

    return () => {
      stopped = true;
      recognition?.stop();
      stopLoop();
      stopSpeaking();
      if (autoScanTimer.current) clearTimeout(autoScanTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function endSession() {
    stopLoop();
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

  const frameW = scan?.frame.width ?? 1;
  const frameH = scan?.frame.height ?? 1;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4 pt-5">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href="/" className="btn btn-ghost !px-3 !py-1.5 text-sm" aria-label="Back to features">
          ←
        </Link>
        <h1 className="font-display text-xl font-extrabold">Exam-Prep Mode</h1>
        <span className="stamp stamp-det">No AI in this path</span>
      </header>

      <CameraStage
        ref={stage}
        onError={setStatus}
        onReady={scheduleAutoScan}
        onSourceChange={() => {
          scanRef.current = null;
          setScan(null);
          stopLoop();
          scheduleAutoScan();
        }}
      >
        {/* Line outlines — aim guides (walkthrough "box" visual). */}
        {scan &&
          scan.blocks.map((b, i) => {
            const xs = b.box.map(([x]) => x);
            const ys = b.box.map(([, y]) => y);
            const left = Math.min(...xs);
            const top = Math.min(...ys);
            const w = Math.max(...xs) - left;
            const h = Math.max(...ys) - top;
            const isHover = hover === i;
            return (
              <div
                key={i}
                className={`absolute rounded-sm transition-colors duration-150 ${
                  isHover
                    ? "bg-[rgba(255,211,77,0.35)] outline outline-2 outline-[var(--hl-strong)]"
                    : "outline-dashed outline-1 outline-[rgba(43,108,176,0.55)]"
                }`}
                style={{
                  left: `${(left / frameW) * 100}%`,
                  top: `${(top / frameH) * 100}%`,
                  width: `${(w / frameW) * 100}%`,
                  height: `${(h / frameH) * 100}%`,
                }}
              >
                {isHover && dwellProgress > 0 && (
                  <div
                    className="absolute -bottom-1 left-0 h-[3px] rounded bg-[var(--hl-strong)]"
                    style={{ width: `${dwellProgress * 100}%` }}
                  />
                )}
              </div>
            );
          })}

        {/* Karaoke highlight while reading. */}
        {scan && selected && (
          <KaraokeHighlight
            block={selected}
            activeCharStart={activeChar.start}
            activeCharLength={activeChar.len}
            frameWidth={frameW}
            frameHeight={frameH}
          />
        )}

        {/* Fingertip pointer. */}
        {tip && (
          <div
            className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--pen)] shadow"
            style={{ left: `${tip.x * 100}%`, top: `${tip.y * 100}%` }}
          />
        )}
      </CameraStage>

      <div className="flex gap-2">
        <button onClick={() => void rescan()} className="btn btn-hl flex-1 text-base">
          ⟳ Rescan page
        </button>
        <button onClick={() => void endSession()} className="btn btn-ink flex-1 text-base">
          End session
        </button>
      </div>

      <div className="card flex flex-col gap-2 p-3">
        <p className="text-sm text-[var(--ink)]">{status}</p>
        <div className="flex flex-wrap gap-2">
          <span className={`chip ${listening ? "chip-mic" : "chip-off"}`}>
            {listening ? "listening for “read this”" : "voice trigger off — point and hold instead"}
          </span>
        </div>
        <p className="mono-hint">
          point at a line · hold still to hear it · say “read this” to skip the wait
        </p>
      </div>
    </main>
  );
}
