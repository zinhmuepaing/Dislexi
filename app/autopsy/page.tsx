"use client";

/**
 * Stuck-Word Autopsy — syllable coaching (REWORK R6, amended §7 rules 3–4).
 *
 * Practice flow: point at a word (dwell) or point + say "I'm stuck on this
 * word" → the app coaches with a FIXED template, spoken twice:
 * "This word is Awards. A, wards, Awards." — the word is verbatim OCR text,
 * syllables are deterministic letter-substrings (lib/syllables.ts — data
 * tables + vowel rules, NO model). TTS speaks words and syllables only;
 * ISOLATED PHONEMES still come exclusively from the static bank, available
 * via the "sound it out" voice command (GraphemeSweep + /public/phonemes).
 *
 * The LLM appears ONLY as voice-command intent parser (amended rule 3).
 * Every practiced word is collected for the end-of-session quiz (R7).
 * Trace-to-unlock retired from the practice loop (2026-07-18).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CameraStage, CameraStageHandle, CapturedFrame } from "@/components/CameraStage";
import { GraphemeSweep } from "@/components/GraphemeSweep";
import { OcrBox, subBoxFor } from "@/components/KaraokeHighlight";
import { chunksFor, chunkPattern, normalizeWord, GraphemeChunkDef } from "@/lib/graphemes";
import { selectWordAt, startFingerLoop, DwellTracker, Point } from "@/lib/hand-tracker";
import { speak, speakSteps, stopSpeaking, announce, primeSpeech } from "@/lib/speech";
import { installAudioUnlock, loadClip, playSequence, playChime, Playback } from "@/lib/audio";
import { SessionLogger } from "@/lib/event-queue";
import { coachingLines } from "@/lib/syllables";
import { saidWordMatches } from "@/lib/text-match";
import { resolveVoiceCommand } from "@/lib/voice-commands";
import { startVoiceListener, VoiceListener } from "@/lib/stt";

interface WordEntry extends OcrBox {
  key: string;
}

export interface PracticedWord {
  text: string;
  box: [number, number][];
}

type Phase = "live" | "pointing" | "coaching" | "sweeping";

/** End-of-session quiz over the practiced words (REWORK R7). */
interface QuizResultItem {
  word: string;
  said: boolean | null;
  pointed: boolean | null;
  skipped: boolean;
}

interface QuizState {
  stage: "offer" | "say" | "point" | "done";
  index: number;
  results: QuizResultItem[];
}

const SCAN_SETTLE_MS = 900;
const QUIZ_STEP_MS = 10_000;

/** Split a block into word entries with proportional sub-boxes (§7 rule 7). */
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
  const captureGen = useRef(0);
  const busyRef = useRef(false);
  const scanningRef = useRef(false);
  const phaseRef = useRef<Phase>("live");
  const wordsRef = useRef<WordEntry[]>([]);
  const frameRef = useRef<CapturedFrame | null>(null);
  const lastTipRef = useRef<Point | null>(null);
  const lastWordRef = useRef<WordEntry | null>(null);
  const practiceRef = useRef<PracticedWord[]>([]);
  const sweepRef = useRef<Playback | null>(null);
  const dwellRef = useRef<DwellTracker>(new DwellTracker(700, 250, 500));
  const stopLoopRef = useRef<(() => void) | null>(null);
  const listenerRef = useRef<VoiceListener | null>(null);
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
  const [practicedCount, setPracticedCount] = useState(0);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("Starting camera…");
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const quizRef = useRef<QuizState | null>(null);
  const [quizHighlight, setQuizHighlight] = useState<[number, number][] | null>(null);
  const answerWindowRef = useRef<{ target: string } | null>(null);
  const quizTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointPoll = useRef<ReturnType<typeof setInterval> | null>(null);

  function setQuizBoth(q: QuizState | null) {
    quizRef.current = q;
    setQuiz(q);
  }

  function clearQuizTimers() {
    if (quizTimer.current) clearTimeout(quizTimer.current);
    quizTimer.current = null;
    if (pointPoll.current) clearInterval(pointPoll.current);
    pointPoll.current = null;
    answerWindowRef.current = null;
  }

  function setPhaseBoth(p: Phase) {
    phaseRef.current = p;
    setPhase(p);
  }

  function stopLoop() {
    stopLoopRef.current?.();
    stopLoopRef.current = null;
  }

  function stopAllAudio() {
    stopSpeaking();
    sweepRef.current?.stop();
    sweepRef.current = null;
  }

  function startLoop() {
    stopLoop();
    dwellRef.current = new DwellTracker(700, 250, 500);
    stopLoopRef.current = startFingerLoop({
      getCanvas: () => stage.current?.getCanvas() ?? null,
      onSample: (sample) => {
        setTip(sample);
        lastTipRef.current = sample;
        const dims = frameRef.current;
        if (!dims || phaseRef.current !== "pointing") return;
        if (quizRef.current) {
          // Quiz mode: the loop only feeds lastTipRef (the point-check poll
          // reads it) — no dwell coaching mid-quiz.
          setHoverKey(null);
          setDwellProgress(0);
          return;
        }
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
          if (word) void coachWord(word);
        }
      },
    });
  }

  useEffect(() => {
    announce("Look at your screen. Point at the word you are stuck on."); // §7 rule 6
    installAudioUnlock();
    primeSpeech();
    SessionLogger.start("autopsy").then((l) => (logger.current = l));
    const micStart = setTimeout(() => void toggleMic(), 0);
    return () => {
      clearTimeout(micStart);
      listenerRef.current?.stop();
      listenerRef.current = null;
      stopLoop();
      stopAllAudio();
      clearQuizTimers();
      if (autoScanTimer.current) clearTimeout(autoScanTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    stopLoop();
    stopAllAudio();
    busyRef.current = false;
    frameRef.current = null;
    wordsRef.current = [];
    setFrame(null);
    setWords([]);
    setStuck(null);
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
      setStatus("Point just under the word you're stuck on and hold still.");
      startLoop();
    } catch (err) {
      console.error(err);
      setStatus("Scanning failed — tap Rescan to try again.");
    } finally {
      scanningRef.current = false;
    }
  }

  /**
   * Coach a word: fixed template, spoken twice (amended rule 4 — TTS speaks
   * the verbatim word + deterministic syllables, never isolated phonemes).
   */
  async function coachWord(word: WordEntry) {
    if (busyRef.current || phaseRef.current === "coaching") return;
    busyRef.current = true;
    setPhaseBoth("coaching");
    setStuck(word);
    lastWordRef.current = word;
    setChunks([]);
    setActiveChunk(-1);

    const normalized = normalizeWord(word.text);
    logger.current?.log({ type: "stuck_word", word: normalized });
    if (normalized && !practiceRef.current.some((p) => normalizeWord(p.text) === normalized)) {
      practiceRef.current.push({ text: word.text, box: word.box });
      setPracticedCount(practiceRef.current.length);
    }
    setStatus(`“${word.text}” — listen…`);

    try {
      const lines = coachingLines(word.text);
      if (lines.length > 0) {
        await speakSteps(lines, undefined, 500); // two rounds, natural pause
      } else {
        await speak(word.text); // numbers/symbols: just say it
      }
    } catch (err) {
      console.error("coaching TTS failed:", err);
    }
    busyRef.current = false;
    setPhaseBoth("pointing");
    setStatus("Point at another word — or say “sound it out” for letter sounds.");
  }

  /** Static-bank phoneme sweep (§7 rule 4 path) — voice command "sound it out". */
  async function phonemeSweep(word: WordEntry) {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhaseBoth("sweeping");
    setStuck(word);

    const wordChunks = chunksFor(word.text);
    const pattern = chunkPattern(wordChunks);
    setChunks(wordChunks);
    logger.current?.log({
      type: "autopsy_soundout",
      word: normalizeWord(word.text),
      grapheme: pattern,
    });
    setStatus("Listen and watch each part light up…");

    try {
      const buffers = await Promise.all(
        wordChunks.map((ch) => loadClip(`/phonemes/${ch.phonemeId}.mp3`)),
      );
      const seq = playSequence(buffers, {
        gapMs: 60,
        missingMs: 300,
        onClipStart: (i) => setActiveChunk(i),
      });
      sweepRef.current = seq;
      await seq.done;
      setActiveChunk(-1);
      await speak(word.text); // blend: the whole word once (allowed)
    } catch (err) {
      console.error("phoneme sweep failed:", err);
    }
    sweepRef.current = null;
    setChunks([]);
    busyRef.current = false;
    setPhaseBoth("pointing");
    setStatus("Point at another word — or say “sound it out” for letter sounds.");
  }

  /** The word under the finger right now (voice-triggered, no dwell wait). */
  function pointedWord(): WordEntry | null {
    const dims = frameRef.current;
    const tipNow = lastTipRef.current;
    if (!dims || !tipNow) return null;
    return selectWordAt(
      { x: tipNow.x * dims.width, y: tipNow.y * dims.height },
      wordsRef.current,
    );
  }

  async function handleUtterance(text: string) {
    // Quiz "say" window: the utterance IS the answer, not a command.
    if (answerWindowRef.current && quizRef.current?.stage === "say" && !busyRef.current) {
      const { target } = answerWindowRef.current;
      clearQuizTimers();
      const ok = saidWordMatches(text, target);
      if (ok) playChime();
      continueAfterSay(ok);
      return;
    }
    if (quizRef.current) return; // no command dispatch mid-quiz

    const cmd = await resolveVoiceCommand(text);
    // While the app is talking, the mic hears its own voice — only "stop"
    // gets through.
    if (busyRef.current && cmd.intent !== "stop") return;
    switch (cmd.intent) {
      case "stuck_word":
      case "read": {
        const word = pointedWord() ?? lastWordRef.current;
        if (word) void coachWord(word);
        else setStatus("Point your finger at the word first.");
        break;
      }
      case "sound_out": {
        const word = pointedWord() ?? lastWordRef.current;
        if (word) void phonemeSweep(word);
        else setStatus("Point at a word first, then say “sound it out”.");
        break;
      }
      case "repeat": {
        const word = lastWordRef.current;
        if (word) void coachWord(word);
        break;
      }
      case "stop":
        stopAllAudio();
        break;
      case "rescan":
        void rescan();
        break;
      default:
        break;
    }
  }

  async function toggleMic() {
    if (listenerRef.current) {
      listenerRef.current.stop();
      listenerRef.current = null;
      setListening(false);
      return;
    }
    try {
      listenerRef.current = await startVoiceListener({
        onUtterance: (t) => void handleUtterance(t),
        onState: setListening,
      });
    } catch {
      setListening(false);
      setStatus("Mic unavailable — pointing still works.");
    }
  }

  /* ── End-of-session quiz (R7): say it (STT fuzzy) + point at it ────────── */

  /** The current-scan word entry matching a practiced word (page may have rescanned). */
  function scanEntryFor(word: PracticedWord): WordEntry | null {
    const n = normalizeWord(word.text);
    return wordsRef.current.find((w) => normalizeWord(w.text) === n) ?? null;
  }

  async function runSayStep(index: number, results: QuizResultItem[]) {
    const item = practiceRef.current[index];
    if (!item) {
      finishQuiz(results);
      return;
    }
    setQuizBoth({ stage: "say", index, results });
    setQuizHighlight(scanEntryFor(item)?.box ?? item.box);
    busyRef.current = true;
    try {
      await speak("What is this word?");
    } catch {
      /* the on-screen prompt still shows */
    }
    busyRef.current = false;
    if (quizRef.current?.stage !== "say") return; // skipped meanwhile
    answerWindowRef.current = { target: item.text };
    quizTimer.current = setTimeout(() => {
      answerWindowRef.current = null;
      continueAfterSay(false); // no (matching) answer in time
    }, QUIZ_STEP_MS);
  }

  function continueAfterSay(said: boolean) {
    const q = quizRef.current;
    if (!q) return;
    void runPointStep(q.index, q.results, said);
  }

  async function runPointStep(index: number, results: QuizResultItem[], said: boolean) {
    const item = practiceRef.current[index];
    if (!item) {
      finishQuiz(results);
      return;
    }
    clearQuizTimers();
    setQuizHighlight(null); // don't reveal where it is
    const target = scanEntryFor(item);
    if (!target) {
      // Word not on the current scan (page changed) — pointing part skipped.
      recordResult(index, results, { word: item.text, said, pointed: null, skipped: false });
      return;
    }
    setQuizBoth({ stage: "point", index, results });
    busyRef.current = true;
    try {
      await speak(`Now point at the word ${item.text}.`);
    } catch {
      /* the on-screen prompt still shows */
    }
    busyRef.current = false;
    if (quizRef.current?.stage !== "point") return; // skipped meanwhile

    const deadline = performance.now() + QUIZ_STEP_MS;
    pointPoll.current = setInterval(() => {
      if (quizRef.current?.stage !== "point") {
        clearQuizTimers();
        return;
      }
      if (performance.now() > deadline) {
        clearQuizTimers();
        recordResult(index, results, { word: item.text, said, pointed: false, skipped: false });
        return;
      }
      const dims = frameRef.current;
      const tipNow = lastTipRef.current;
      if (!dims || !tipNow) return;
      const sel = selectWordAt(
        { x: tipNow.x * dims.width, y: tipNow.y * dims.height },
        wordsRef.current,
      );
      if (sel && normalizeWord(sel.text) === normalizeWord(item.text)) {
        clearQuizTimers();
        playChime();
        recordResult(index, results, { word: item.text, said, pointed: true, skipped: false });
      }
    }, 150);
  }

  function recordResult(index: number, results: QuizResultItem[], item: QuizResultItem) {
    const next = [...results, item];
    if (index + 1 < practiceRef.current.length) {
      void runSayStep(index + 1, next);
    } else {
      finishQuiz(next);
    }
  }

  function skipQuizWord() {
    const q = quizRef.current;
    if (!q) return;
    clearQuizTimers();
    const item = practiceRef.current[q.index];
    recordResult(q.index, q.results, {
      word: item?.text ?? "",
      said: null,
      pointed: null,
      skipped: true,
    });
  }

  function finishQuiz(results: QuizResultItem[]) {
    clearQuizTimers();
    setQuizHighlight(null);
    setQuizBoth({ stage: "done", index: practiceRef.current.length, results });
    const said = results.filter((r) => r.said === true).length;
    const total = results.filter((r) => !r.skipped).length;
    announce(total > 0 ? `You got ${said} of ${total} words. Well done!` : "Quiz finished.");
  }

  async function endSession(withQuizResults?: QuizResultItem[]) {
    // Offer the quiz first when there are practiced words (skippable).
    if (!withQuizResults && practiceRef.current.length > 0 && quizRef.current === null) {
      stopAllAudio();
      setQuizBoth({ stage: "offer", index: 0, results: [] });
      return;
    }
    clearQuizTimers();
    setQuizBoth(null);
    listenerRef.current?.stop();
    listenerRef.current = null;
    stopLoop();
    stopAllAudio();
    const l = logger.current;
    for (const r of withQuizResults ?? []) {
      if (!r.word) continue;
      l?.log({
        type: "quiz_result",
        word: normalizeWord(r.word),
        payload: { said: r.said, pointed: r.pointed, skipped: r.skipped },
      });
    }
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
    // h-dvh + capped camera: every control fits the phone viewport, no scroll.
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col gap-2.5 overflow-y-auto p-3">
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Link href="/" className="btn btn-ghost !px-2.5 !py-1 text-sm" aria-label="Back to features">
          ←
        </Link>
        <h1 className="font-display text-lg font-extrabold">Stuck-Word Autopsy</h1>
        <span className="stamp stamp-det">Syllables by rule · zero AI voice</span>
      </header>

      <CameraStage
        ref={stage}
        onError={setStatus}
        onReady={scheduleAutoScan}
        onSourceChange={() => {
          stopLoop();
          stopAllAudio();
          frameRef.current = null;
          wordsRef.current = [];
          setFrame(null);
          setWords([]);
          setStuck(null);
          setChunks([]);
          setPhaseBoth("live");
          scheduleAutoScan();
        }}
      >
        {/* Word outlines — aim guides (selection is by pointing). */}
        {frame &&
          phase !== "live" &&
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

        {/* Quiz target highlight (say step). */}
        {quizHighlight &&
          (() => {
            const xs = quizHighlight.map(([x]) => x);
            const ys = quizHighlight.map(([, y]) => y);
            const left = Math.min(...xs);
            const top = Math.min(...ys);
            return (
              <div
                className="absolute animate-pulse rounded-sm bg-[rgba(255,211,77,0.45)] outline outline-2 outline-[var(--hl-strong)]"
                style={{
                  left: `${(left / frameW) * 100}%`,
                  top: `${(top / frameH) * 100}%`,
                  width: `${((Math.max(...xs) - left) / frameW) * 100}%`,
                  height: `${((Math.max(...ys) - top) / frameH) * 100}%`,
                }}
              />
            );
          })()}

        {/* Pointed-spot dot. */}
        {tip && (
          <div
            className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--pen)] shadow"
            style={{ left: `${tip.x * 100}%`, top: `${tip.y * 100}%` }}
          />
        )}
      </CameraStage>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="chip !py-1 !text-[11px]">📚 practiced: {practicedCount}</span>
        <button
          onClick={() => void toggleMic()}
          className={`chip ml-auto !py-1 !text-[12px] ${listening ? "chip-mic" : "chip-off"}`}
          aria-pressed={listening}
        >
          {listening ? "mic on" : "mic off"}
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => void rescan()}
          disabled={phase === "coaching" || phase === "sweeping"}
          className="btn btn-hl flex-1 !py-2.5 text-base"
        >
          ⟳ Rescan page
        </button>
        <button onClick={() => void endSession()} className="btn btn-ink flex-1 !py-2.5 text-base">
          End session
        </button>
      </div>

      <div className="card flex min-h-0 flex-col gap-1 overflow-y-auto p-2.5">
        <p className="text-sm leading-snug text-[var(--ink)]">{status}</p>
        <p className="mono-hint">
          point just under a word · hold still · say “I&apos;m stuck” or “sound it out”
        </p>
      </div>

      {/* End-of-session quiz dialog (R7). */}
      {quiz && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-[rgba(34,48,63,0.35)] p-4 pb-8">
          <div className="card fadein w-full max-w-md p-4">
            {quiz.stage === "offer" && (
              <>
                <h2 className="font-display text-lg font-extrabold">Quiz time? 🌟</h2>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Want to test the {practiceRef.current.length}{" "}
                  {practiceRef.current.length === 1 ? "word" : "words"} you practiced? You can
                  skip any word.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => void runSayStep(0, [])}
                    className="btn btn-hl flex-1 !py-2.5"
                  >
                    ▶ Start quiz
                  </button>
                  <button onClick={() => void endSession([])} className="btn btn-ghost flex-1 !py-2.5">
                    Skip to results
                  </button>
                </div>
                {!listening && (
                  <p className="mono-hint mt-2">tip: turn the mic on so I can hear your answers</p>
                )}
              </>
            )}

            {(quiz.stage === "say" || quiz.stage === "point") && (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="mono-hint !text-[var(--pen)]">
                    Word {quiz.index + 1} of {practiceRef.current.length}
                  </span>
                  <span className={`stamp ${quiz.stage === "say" ? "stamp-det" : "stamp-ok"}`}>
                    {quiz.stage === "say" ? "Say it" : "Point at it"}
                  </span>
                </div>
                <p className="mt-2 text-sm">
                  {quiz.stage === "say"
                    ? "Read the glowing word out loud."
                    : `Find and point at the word “${practiceRef.current[quiz.index]?.text}” on the paper.`}
                </p>
                <button onClick={skipQuizWord} className="btn btn-ghost mt-3 w-full !py-2">
                  Skip this word
                </button>
              </>
            )}

            {quiz.stage === "done" && (
              <>
                <h2 className="font-display text-lg font-extrabold">
                  {quiz.results.filter((r) => r.said === true).length} of{" "}
                  {quiz.results.filter((r) => !r.skipped).length} said right! 🎉
                </h2>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Pointed correctly: {quiz.results.filter((r) => r.pointed === true).length} ·
                  skipped: {quiz.results.filter((r) => r.skipped).length}
                </p>
                <button
                  onClick={() => void endSession(quiz.results)}
                  className="btn btn-hl mt-3 w-full !py-2.5"
                >
                  See the full results
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
