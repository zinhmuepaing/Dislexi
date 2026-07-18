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
import { buildSentences, blockToSentenceMap, localWordAt, Sentence } from "@/lib/sentences";

interface OcrResponse {
  blocks: { text: string; confidence: number; box: [number, number][] }[];
}

interface Scan {
  frame: CapturedFrame;
  blocks: OcrBox[];
  /** Line-blocks grouped into sentences — the unit that gets read aloud. */
  sentences: Sentence[];
  /** blockSentence[blockIndex] = sentence index the line belongs to. */
  blockSentence: number[];
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
  const dwellRef = useRef<DwellTracker>(new DwellTracker(300, 250, 500));
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
    dwellRef.current = new DwellTracker(300, 250, 500);
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
        // Point at a line, but dwell on (and read) the whole SENTENCE it
        // belongs to — the key is the sentence index, so tracking across a
        // wrapped line never resets the dwell clock.
        let key: string | null = null;
        if (sample) {
          const block = selectWordAt(
            { x: sample.x * current.frame.width, y: sample.y * current.frame.height },
            current.blocks,
          );
          if (block) {
            const si = current.blockSentence[current.blocks.indexOf(block)];
            if (si !== undefined) key = String(si);
          }
        }
        const res = dwellRef.current.update(key, performance.now());
        const hoverIdx = res.hover === null ? null : Number(res.hover);
        hoverRef.current = hoverIdx;
        setHover(hoverIdx);
        setDwellProgress(res.progress);
        if (res.fired !== null) {
          const sentence = current.sentences[Number(res.fired)];
          if (sentence) void readSentence(sentence);
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
      const sentences = buildSentences(blocks);
      const next: Scan = {
        frame: captured,
        blocks,
        sentences,
        blockSentence: blockToSentenceMap(sentences),
      };
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

  async function readSentence(sentence: Sentence) {
    if (busyRef.current) return;
    busyRef.current = true;
    setSelected(sentence.blocks[0] ?? null);
    setActiveChar({ start: 0, len: 0 });
    const reread = spokenTexts.current.has(sentence.text);
    spokenTexts.current.add(sentence.text);
    logger.current?.log({ type: reread ? "reread" : "read", word: sentence.text });
    setStatus(`Reading: “${sentence.text}”`);

    try {
      // VERBATIM: the sentence text is the member lines' OCR text concatenated
      // untouched — no rewriting layer between OCR and TTS (§5.4). The word
      // boundary offset is mapped back to the line it falls in so the highlight
      // hops from one line's box to the next as the sentence is read.
      await speak(sentence.text, {
        onWordBoundary: (start, len) => {
          const w = localWordAt(sentence, start, len);
          if (!w) return;
          setSelected(sentence.blocks[w.memberIndex]);
          setActiveChar({ start: w.localStart, len: w.localLength });
        },
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

  /** Voice trigger / button: read the pointed sentence immediately (no dwell). */
  function readPointedNow() {
    const current = scanRef.current;
    if (!current || busyRef.current) return;
    const idx = hoverRef.current;
    if (idx === null || !current.sentences[idx]) {
      setStatus("Point your finger at a line first.");
      return;
    }
    void readSentence(current.sentences[idx]);
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
    // h-dvh + capped camera: every control fits the phone viewport, no scroll.
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col gap-2.5 overflow-y-auto p-3">
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Link href="/" className="btn btn-ghost !px-2.5 !py-1 text-sm" aria-label="Back to features">
          ←
        </Link>
        <h1 className="font-display text-lg font-extrabold">Exam-Prep Mode</h1>
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
        {/* Line outlines — aim guides (walkthrough "box" visual). Hover lights
            every line of the pointed SENTENCE; the dwell bar sits under its
            last line. */}
        {scan &&
          scan.blocks.map((b, i) => {
            const xs = b.box.map(([x]) => x);
            const ys = b.box.map(([, y]) => y);
            const left = Math.min(...xs);
            const top = Math.min(...ys);
            const w = Math.max(...xs) - left;
            const h = Math.max(...ys) - top;
            const isHover = hover !== null && scan.blockSentence[i] === hover;
            const sentence = hover !== null ? scan.sentences[hover] : undefined;
            const isLastOfHover =
              isHover && sentence !== undefined && sentence.blockIndices[sentence.blockIndices.length - 1] === i;
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
                {isLastOfHover && dwellProgress > 0 && (
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
        <button onClick={() => void rescan()} className="btn btn-hl flex-1 !py-2.5 text-base">
          ⟳ Rescan page
        </button>
        <button onClick={() => void endSession()} className="btn btn-ink flex-1 !py-2.5 text-base">
          End session
        </button>
      </div>

      <div className="card flex min-h-0 flex-col gap-1.5 overflow-y-auto p-2.5">
        <p className="text-sm leading-snug text-[var(--ink)]">{status}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`chip !py-1 !text-[11px] ${listening ? "chip-mic" : "chip-off"}`}>
            {listening ? "listening for “read this”" : "voice trigger off"}
          </span>
          <span className="mono-hint">point at a line · hold still to hear it</span>
        </div>
      </div>
    </main>
  );
}
