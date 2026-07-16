"use client";

/**
 * Stuck-Word Autopsy + Trace-to-Unlock (ARCHITECTURE.md §8).
 *
 * COMPLIANCE (§7 rules 3–4): NO LLM anywhere in the sound-out path, and
 * phonemes NEVER come from TTS — only the static pre-recorded bank at
 * /public/phonemes/{id}.mp3. TTS is used solely to speak the WHOLE word
 * (first tap, and the blend after the chunk sweep).
 *
 * Flow: capture → tap word (or point) → speak that word only, log
 * 'stuck_word' → second tap → grapheme chunks (lib/graphemes.ts, §7 rule 7
 * proportional split) → sweep chunk-by-chunk playing static phonemes, log
 * 'autopsy_soundout' → blend whole word via TTS → "now trace it" (announced
 * aloud, §7 rule 6) → ~5 fps MediaPipe loop verifies fingertip (landmark 8)
 * inside the word box with net left-to-right motion → chime, log
 * 'trace_complete' with the grapheme pattern.
 */

import { useEffect, useRef, useState } from "react";
import { CameraStage, CameraStageHandle, CapturedFrame } from "@/components/CameraStage";
import { GraphemeSweep } from "@/components/GraphemeSweep";
import { OcrBox, subBoxFor } from "@/components/KaraokeHighlight";
import { chunksFor, chunkPattern, normalizeWord, GraphemeChunkDef } from "@/lib/graphemes";
import {
  detectFingertip,
  detectFingertipVideo,
  endTraceMode,
  nearestBlock,
  traceSatisfied,
  Point,
} from "@/lib/hand-tracker";
import { speak, stopSpeaking, announce } from "@/lib/speech";
import { SessionLogger } from "@/lib/event-queue";

interface WordEntry extends OcrBox {
  key: string;
}

type Phase = "live" | "captured" | "sounding" | "tracing";

const TRACE_SAMPLE_MS = 200; // ~5 fps (§2)
const TRACE_TIMEOUT_MS = 45_000;

function playPhoneme(id: string): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(`/phonemes/${id}.mp3`);
    audio.onended = () => resolve();
    // Missing bank file (dev): keep the sweep moving rather than stalling.
    audio.onerror = () => setTimeout(resolve, 400);
    audio.play().catch(() => setTimeout(resolve, 400));
  });
}

/** Completion chime, synthesized locally — no asset, works offline. */
function playChime(): void {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    [523.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = now + i * 0.15;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  } catch {
    /* audio cue only */
  }
}

/** Split a block into word entries with proportional sub-boxes (§7 rule 7).
 * `gen` (capture generation) keeps keys unique across captures, so a stale
 * `stuck` selection can never match a word from a newer frame. */
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
  const stage = useRef<CameraStageHandle>(null);
  const logger = useRef<SessionLogger | null>(null);
  const traceRun = useRef(0);
  const captureGen = useRef(0);

  const [phase, setPhase] = useState<Phase>("live");
  const [frame, setFrame] = useState<CapturedFrame | null>(null);
  const [words, setWords] = useState<WordEntry[]>([]);
  const [stuck, setStuck] = useState<WordEntry | null>(null);
  const [chunks, setChunks] = useState<GraphemeChunkDef[]>([]);
  const [activeChunk, setActiveChunk] = useState(-1);
  const [status, setStatus] = useState("Tap Capture, then tap the word you're stuck on.");

  useEffect(() => {
    announce("Look at your screen. Tap the word you are stuck on."); // §7 rule 6
    SessionLogger.start("autopsy").then((l) => (logger.current = l));
    return () => {
      traceRun.current++;
      stopSpeaking();
      void endTraceMode();
    };
  }, []);

  async function capture() {
    traceRun.current++; // cancel any trace in progress
    const captured = stage.current?.captureFrame(); // freeze-frame (§7 rule 2)
    if (!captured) return;
    setFrame(captured);
    setWords([]);
    setStuck(null);
    setChunks([]);
    setActiveChunk(-1);
    setStatus("Running OCR…");

    try {
      const canvas = stage.current?.getCanvas();
      const [res, tip] = await Promise.all([
        fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: captured.base64 }),
        }),
        canvas ? detectFingertip(canvas).catch(() => null) : Promise.resolve<Point | null>(null),
      ]);
      if (!res.ok) throw new Error(`ocr ${res.status}`);
      const data = (await res.json()) as { blocks?: OcrBox[] };
      const gen = ++captureGen.current;
      const allWords = (data.blocks ?? []).flatMap((b, i) => wordsOf(b, i, gen));
      setWords(allWords);
      setPhase("captured");

      if (allWords.length === 0) {
        setStatus("No text found — try again.");
        reset();
        return;
      }
      setStatus("Tap the word you're stuck on.");

      // Pointing works too (§7 rule 5): fingertip → nearest word = first tap.
      if (tip) {
        const pointed = nearestBlock(
          { x: tip.x * captured.width, y: tip.y * captured.height },
          allWords,
        );
        if (pointed) await onWordTap(pointed);
      }
    } catch (err) {
      console.error(err);
      setStatus("OCR failed — try again.");
      reset();
    }
  }

  async function onWordTap(word: WordEntry) {
    if (phase === "sounding" || phase === "tracing") return;
    if (stuck?.key !== word.key) {
      // First tap: speak that word only (verbatim), log stuck_word.
      setStuck(word);
      setChunks([]);
      setActiveChunk(-1);
      logger.current?.log({ type: "stuck_word", word: normalizeWord(word.text) });
      setStatus(`“${word.text}” — tap it again to sound it out.`);
      try {
        await speak(word.text);
      } catch (err) {
        console.error("TTS failed:", err);
      }
      return;
    }
    await soundOut(word);
  }

  async function soundOut(word: WordEntry) {
    setPhase("sounding");
    const wordChunks = chunksFor(word.text);
    const pattern = chunkPattern(wordChunks);
    setChunks(wordChunks);
    logger.current?.log({
      type: "autopsy_soundout",
      word: normalizeWord(word.text),
      grapheme: pattern,
    });
    setStatus("Listen and watch each part light up…");

    // Static phoneme bank ONLY (§7 rule 4) — sweep advances on each clip's end.
    for (let i = 0; i < wordChunks.length; i++) {
      setActiveChunk(i);
      await playPhoneme(wordChunks[i].phonemeId);
    }
    setActiveChunk(-1);

    // Blend: the whole word once via TTS (allowed — it's a whole word).
    try {
      await speak(word.text);
    } catch (err) {
      console.error("TTS blend failed:", err);
    }

    await startTrace(word, pattern);
  }

  async function startTrace(word: WordEntry, pattern: string) {
    setPhase("tracing");
    announce("Now trace it on your paper."); // §7 rule 6
    setStatus("Trace the word on your paper with your finger…");
    stage.current?.unfreeze(); // live flipped frames for the ~5 fps loop

    const run = ++traceRun.current;
    // startTrace only runs from the user-initiated sound-out flow, never render.
    // eslint-disable-next-line react-hooks/purity
    const started = performance.now();
    const samples: Point[] = [];
    const frameDims = frame!;

    const finish = async (ok: boolean) => {
      traceRun.current++;
      await endTraceMode();
      if (ok) {
        playChime();
        logger.current?.log({
          type: "trace_complete",
          word: normalizeWord(word.text),
          grapheme: pattern,
        });
        announce("Well done!");
        setStatus("Traced! Capture again for another word.");
      } else {
        setStatus("Let's stop there — capture again to retry.");
      }
      reset();
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
          const tip = await detectFingertipVideo(canvas, performance.now());
          if (tip) {
            samples.push({ x: tip.x * frameDims.width, y: tip.y * frameDims.height });
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

  function reset() {
    setPhase("live");
    setFrame(null);
    setWords([]);
    setStuck(null);
    setChunks([]);
    setActiveChunk(-1);
    stage.current?.unfreeze();
  }

  function skipTrace() {
    traceRun.current++;
    void endTraceMode();
    setStatus("Skipped tracing. Capture again for another word.");
    reset();
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">Stuck-Word Autopsy</h1>
      <CameraStage ref={stage} onError={setStatus}>
        {frame && stuck && chunks.length > 0 && (
          <GraphemeSweep
            wordBox={stuck}
            chunks={chunks}
            activeIndex={activeChunk}
            frameWidth={frame.width}
            frameHeight={frame.height}
          />
        )}
        {frame &&
          phase === "captured" &&
          words.map((w) => {
            const xs = w.box.map(([x]) => x);
            const ys = w.box.map(([, y]) => y);
            const left = Math.min(...xs);
            const top = Math.min(...ys);
            const isStuck = stuck?.key === w.key;
            return (
              <button
                key={w.key}
                onClick={() => void onWordTap(w)}
                className={`pointer-events-auto absolute rounded-sm border ${
                  isStuck
                    ? "border-amber-400 bg-amber-300/40"
                    : "border-amber-400/50 bg-amber-300/10"
                }`}
                style={{
                  left: `${(left / frame.width) * 100}%`,
                  top: `${(top / frame.height) * 100}%`,
                  width: `${((Math.max(...xs) - left) / frame.width) * 100}%`,
                  height: `${((Math.max(...ys) - top) / frame.height) * 100}%`,
                }}
                aria-label={isStuck ? `Sound out: ${w.text}` : `Stuck on: ${w.text}`}
              />
            );
          })}
      </CameraStage>
      {phase === "tracing" ? (
        <button
          onClick={skipTrace}
          className="rounded-xl bg-white/10 p-4 text-lg font-semibold active:scale-95"
        >
          Skip tracing
        </button>
      ) : (
        <button
          onClick={() => void capture()}
          disabled={phase === "sounding"}
          className="rounded-xl bg-amber-500 p-4 text-lg font-semibold text-white disabled:opacity-50 active:scale-95"
        >
          Capture
        </button>
      )}
      <p className="text-sm opacity-70">{status}</p>
    </main>
  );
}
