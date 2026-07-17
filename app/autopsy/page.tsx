"use client";

/**
 * Stuck-Word Autopsy + Trace-to-Unlock (ARCHITECTURE.md §8).
 *
 * COMPLIANCE (§7 rules 3–4): NO LLM anywhere in the sound-out path, and
 * phonemes NEVER come from TTS — only the static pre-recorded bank at
 * /public/phonemes/{id}.mp3. TTS is used solely to speak the WHOLE word
 * (first selection, and the blend after the chunk sweep).
 *
 * Point-to-select flow (2026-07-17 rework — tap selection removed):
 * enter → camera ready → AUTO scan (one frame; preview stays live) →
 * continuous fingertip loop → dwell on a word → speak that word only, log
 * 'stuck_word' → KEEP pointing at the same word → grapheme chunks
 * (lib/graphemes.ts, §7 rule 7 proportional split) → gapless sweep playing
 * static phonemes (WebAudio-scheduled), log 'autopsy_soundout' → blend whole
 * word via TTS → "now trace it" (announced aloud, §7 rule 6) → ~5 fps
 * MediaPipe loop verifies fingertip (landmark 8) inside the word box with
 * net left-to-right motion → chime, log 'trace_complete' with the pattern →
 * back to pointing (same scan — no re-capture needed).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CameraStage, CameraStageHandle, CapturedFrame } from "@/components/CameraStage";
import { GraphemeSweep } from "@/components/GraphemeSweep";
import { OcrBox, subBoxFor } from "@/components/KaraokeHighlight";
import { chunksFor, chunkPattern, normalizeWord, GraphemeChunkDef } from "@/lib/graphemes";
import {
  detectFingertipVideo,
  endTraceMode,
  selectWordAt,
  startFingerLoop,
  traceSatisfied,
  DwellTracker,
  Point,
} from "@/lib/hand-tracker";
import { speak, stopSpeaking, announce, primeSpeech, synthesizeSpeech } from "@/lib/speech";
import { installAudioUnlock, loadClip, playSequence, playChime } from "@/lib/audio";
import { SessionLogger } from "@/lib/event-queue";

interface WordEntry extends OcrBox {
  key: string;
}

type Phase = "live" | "pointing" | "sounding" | "tracing";

const TRACE_SAMPLE_MS = 200; // ~5 fps (§2)
const TRACE_TIMEOUT_MS = 45_000;
const SCAN_SETTLE_MS = 900;

/** Split a block into word entries with proportional sub-boxes (§7 rule 7).
 * `gen` (capture generation) keeps keys unique across captures, so a stale
 * selection can never match a word from a newer frame. */
function wordsOf(block: OcrBox, blockIndex: number, gen: number): WordEntry[] {
  const words: WordEntry[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block.text))) {
    const r = subBoxFor(block, m.index, m[0].length);
    words.push({
      text: m[0],
      box: [
        [r.x, r.y],
        [r.x + r.w, r.y],
        [r.x + r.w, r.y + r.h],
        [r.x, r.y + r.h],
      ],
      key: `${gen}:${blockIndex}:${m.index}`,
    });
  }
  return words;
}

export default function AutopsyPage() {
  const router = useRouter();
  const stage = useRef<CameraStageHandle>(null);
  const logger = useRef<SessionLogger | null>(null);
  const traceRun = useRef(0);
  const captureGen = useRef(0);
  const busyRef = useRef(false);
  const scanningRef = useRef(false);
  const phaseRef = useRef<Phase>("live");
  const wordsRef = useRef<WordEntry[]>([]);
  const frameRef = useRef<CapturedFrame | null>(null);
  const stuckRef = useRef<WordEntry | null>(null);
  const dwellRef = useRef<DwellTracker>(new DwellTracker(700, 250, 500));
  const stopLoopRef = useRef<(() => void) | null>(null);
  const autoScanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase] = useState<Phase>("live");
  const [frame, setFrame] = useState<CapturedFrame | null>(null);
  const [words, setWords] = useState<WordEntry[]>([]);
  const [tip, setTip] = useState<Point | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [dwellProgress, setDwellProgress] = useState(0);
  const [stuck, setStuck] = useState<WordEntry | null>(null);
  const [chunks, setChunks] = useState<GraphemeChunkDef[]>([]);
  const [activeChunk, setActiveChunk] = useState(-1);
  const [status, setStatus] = useState("Starting camera…");

  function setPhaseBoth(p: Phase) {
    phaseRef.current = p;
    setPhase(p);
  }

  function setStuckBoth(w: WordEntry | null) {
    stuckRef.current = w;
    setStuck(w);
  }

  function stopLoop() {
    stopLoopRef.current?.();
    stopLoopRef.current = null;
  }

  function startLoop() {
    stopLoop();
    dwellRef.current = new DwellTracker(700, 250, 500);
    stopLoopRef.current = startFingerLoop({
      getCanvas: () => stage.current?.getCanvas() ?? null,
      onSample: (sample) => {
        setTip(sample);
        const dims = frameRef.current;
        if (!dims || phaseRef.current !== "pointing") return;
        if (busyRef.current) {
          setHoverKey(null);
          setDwellProgress(0);
          return;
        }
        let key: string | null = null;
        if (sample) {
          const word = selectWordAt(
            { x: sample.x * dims.width, y: sample.y * dims.height },
            wordsRef.current,
          );
          if (word) key = word.key;
        }
        const res = dwellRef.current.update(key, performance.now());
        setHoverKey(res.hover);
        setDwellProgress(res.progress);
        if (res.fired !== null) {
          const word = wordsRef.current.find((w) => w.key === res.fired);
          if (word) void handleWordFired(word);
        }
      },
    });
  }

  useEffect(() => {
    announce("Look at your screen. Point at the word you are stuck on."); // §7 rule 6
    installAudioUnlock();
    primeSpeech();
    SessionLogger.start("autopsy").then((l) => (logger.current = l));
    return () => {
      traceRun.current++;
      stopLoop();
      stopSpeaking();
      void endTraceMode();
      if (autoScanTimer.current) clearTimeout(autoScanTimer.current);
    };
  }, []);

  function scheduleAutoScan() {
    if (autoScanTimer.current) clearTimeout(autoScanTimer.current);
    autoScanTimer.current = setTimeout(() => {
      if (!frameRef.current && !scanningRef.current) void rescan();
    }, SCAN_SETTLE_MS);
  }

  async function rescan() {
    if (scanningRef.current) return;
    scanningRef.current = true;
    traceRun.current++; // cancel any trace in progress
    stopLoop();
    stopSpeaking();
    busyRef.current = false;
    frameRef.current = null;
    wordsRef.current = [];
    setFrame(null);
    setWords([]);
    setStuckBoth(null);
    setChunks([]);
    setActiveChunk(-1);
    setHoverKey(null);
    setDwellProgress(0);
    setPhaseBoth("live");
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
      const data = (await res.json()) as { blocks?: OcrBox[] };
      const gen = ++captureGen.current;
      const allWords = (data.blocks ?? []).flatMap((b, i) => wordsOf(b, i, gen));
      if (allWords.length === 0) {
        setStatus("No text found — lay the worksheet flat and tap Rescan.");
        return;
      }
      frameRef.current = captured;
      wordsRef.current = allWords;
      setFrame(captured);
      setWords(allWords);
      setPhaseBoth("pointing");
      setStatus("Point at the word you're stuck on and hold still.");
      startLoop();
    } catch (err) {
      console.error(err);
      setStatus("Scanning failed — tap Rescan to try again.");
    } finally {
      scanningRef.current = false;
    }
  }

  async function handleWordFired(word: WordEntry) {
    if (busyRef.current || phaseRef.current !== "pointing") return;
    if (stuckRef.current?.key !== word.key) {
      // First dwell: speak that word only (verbatim), log stuck_word.
      busyRef.current = true;
      setStuckBoth(word);
      setChunks([]);
      setActiveChunk(-1);
      logger.current?.log({ type: "stuck_word", word: normalizeWord(word.text) });
      setStatus(`“${word.text}” — keep pointing at it to sound it out.`);
      try {
        await speak(word.text);
      } catch (err) {
        console.error("TTS failed:", err);
      }
      busyRef.current = false;
      // Keep-pointing escalation: the same word may fire again immediately.
      dwellRef.current.rearm(word.key);
      return;
    }
    await soundOut(word);
  }

  async function soundOut(word: WordEntry) {
    setPhaseBoth("sounding");
    busyRef.current = true;
    stopLoop(); // pointing pauses; the trace loop takes over afterwards
    setHoverKey(null);
    setDwellProgress(0);

    const wordChunks = chunksFor(word.text);
    const pattern = chunkPattern(wordChunks);
    setChunks(wordChunks);
    logger.current?.log({
      type: "autopsy_soundout",
      word: normalizeWord(word.text),
      grapheme: pattern,
    });
    setStatus("Listen and watch each part light up…");

    // Static phoneme bank ONLY (§7 rule 4). All clips are decoded up front
    // and scheduled back-to-back on the WebAudio clock — no loading gaps.
    // The TTS blend is synthesized in parallel so it follows seamlessly.
    const blendJob = synthesizeSpeech(word.text).catch(() => null);
    const buffers = await Promise.all(
      wordChunks.map((ch) => loadClip(`/phonemes/${ch.phonemeId}.mp3`)),
    );
    const seq = playSequence(buffers, {
      gapMs: 60,
      missingMs: 300,
      onClipStart: (i) => setActiveChunk(i),
    });
    await seq.done;
    setActiveChunk(-1);

    // Blend: the whole word once via TTS (allowed — it's a whole word).
    await blendJob; // ensure the buffer is ready → gapless transition
    try {
      await speak(word.text);
    } catch (err) {
      console.error("TTS blend failed:", err);
    }

    busyRef.current = false;
    await startTrace(word, pattern);
  }

  async function startTrace(word: WordEntry, pattern: string) {
    setPhaseBoth("tracing");
    announce("Now trace it on your paper."); // §7 rule 6
    setStatus("Trace the word on your paper with your finger, left to right…");

    const run = ++traceRun.current;
    // startTrace only runs from the user-initiated sound-out flow, never render.
    // eslint-disable-next-line react-hooks/purity
    const started = performance.now();
    const samples: Point[] = [];
    const dims = frameRef.current!;

    const finish = async (ok: boolean) => {
      traceRun.current++;
      if (ok) {
        playChime();
        logger.current?.log({
          type: "trace_complete",
          word: normalizeWord(word.text),
          grapheme: pattern,
        });
        announce("Well done!");
        setStatus("Traced! Point at another word when you're ready.");
      } else {
        setStatus("Let's stop there — point at a word to try again.");
      }
      resumePointing();
    };

    const tick = async () => {
      if (traceRun.current !== run) return;
      if (performance.now() - started > TRACE_TIMEOUT_MS) {
        await finish(false);
        return;
      }
      const canvas = stage.current?.getCanvas();
      if (canvas) {
        try {
          const sample = await detectFingertipVideo(canvas, performance.now());
          if (sample) {
            samples.push({ x: sample.x * dims.width, y: sample.y * dims.height });
            if (traceSatisfied(samples, word.box)) {
              await finish(true);
              return;
            }
          }
        } catch (err) {
          console.error("trace detection failed:", err);
        }
      }
      if (traceRun.current === run) setTimeout(() => void tick(), TRACE_SAMPLE_MS);
    };
    void tick();
  }

  /** Back to pointing on the SAME scan — no re-capture needed. */
  function resumePointing() {
    setStuckBoth(null);
    setChunks([]);
    setActiveChunk(-1);
    if (frameRef.current && wordsRef.current.length > 0) {
      setPhaseBoth("pointing");
      startLoop();
    } else {
      setPhaseBoth("live");
    }
  }

  function skipTrace() {
    traceRun.current++;
    setStatus("Skipped tracing. Point at another word when you're ready.");
    resumePointing();
  }

  async function endSession() {
    traceRun.current++;
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

  const frameW = frame?.width ?? 1;
  const frameH = frame?.height ?? 1;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4 pt-5">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href="/" className="btn btn-ghost !px-3 !py-1.5 text-sm" aria-label="Back to features">
          ←
        </Link>
        <h1 className="font-display text-xl font-extrabold">Stuck-Word Autopsy</h1>
        <span className="stamp stamp-det">Recorded phonemes · zero AI</span>
      </header>

      <CameraStage
        ref={stage}
        onError={setStatus}
        onReady={scheduleAutoScan}
        onSourceChange={() => {
          traceRun.current++;
          stopLoop();
          frameRef.current = null;
          wordsRef.current = [];
          setFrame(null);
          setWords([]);
          setStuckBoth(null);
          setChunks([]);
          setPhaseBoth("live");
          scheduleAutoScan();
        }}
      >
        {/* Word outlines — aim guides (visual only; selection is by pointing). */}
        {frame &&
          (phase === "pointing" || phase === "sounding" || phase === "tracing") &&
          words.map((w) => {
            const xs = w.box.map(([x]) => x);
            const ys = w.box.map(([, y]) => y);
            const left = Math.min(...xs);
            const top = Math.min(...ys);
            const isStuck = stuck?.key === w.key;
            const isHover = hoverKey === w.key && phase === "pointing";
            return (
              <div
                key={w.key}
                className={`absolute rounded-sm transition-colors duration-150 ${
                  isStuck
                    ? "bg-[rgba(255,211,77,0.4)] outline outline-2 outline-[var(--hl-strong)]"
                    : isHover
                      ? "bg-[rgba(255,211,77,0.25)] outline outline-2 outline-[var(--hl-strong)]"
                      : "outline-dashed outline-1 outline-[rgba(43,108,176,0.4)]"
                }`}
                style={{
                  left: `${(left / frameW) * 100}%`,
                  top: `${(top / frameH) * 100}%`,
                  width: `${((Math.max(...xs) - left) / frameW) * 100}%`,
                  height: `${((Math.max(...ys) - top) / frameH) * 100}%`,
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

        {frame && stuck && chunks.length > 0 && (
          <GraphemeSweep
            wordBox={stuck}
            chunks={chunks}
            activeIndex={activeChunk}
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
        {phase === "tracing" ? (
          <button onClick={skipTrace} className="btn btn-ghost flex-1 text-base">
            Skip tracing
          </button>
        ) : (
          <button
            onClick={() => void rescan()}
            disabled={phase === "sounding"}
            className="btn btn-hl flex-1 text-base"
          >
            ⟳ Rescan page
          </button>
        )}
        <button onClick={() => void endSession()} className="btn btn-ink flex-1 text-base">
          End session
        </button>
      </div>

      <div className="card flex flex-col gap-2 p-3">
        <p className="text-sm text-[var(--ink)]">{status}</p>
        <p className="mono-hint">
          point at a word · hold to hear it · keep pointing to sound it out · then trace it on paper
        </p>
      </div>
    </main>
  );
}
