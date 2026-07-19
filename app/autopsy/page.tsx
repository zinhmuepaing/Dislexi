"use client";

/**
 * Stuck-Word Autopsy — syllable coaching (REWORK R6, amended §7 rules 3–4).
 *
 * Coaching: point at a word + say "I'm stuck" (or tap the button) → the app
 * says "This word is Awards. A, wards, Awards." (word verbatim from OCR,
 * syllables deterministic from lib/syllables.ts — NO model in spoken
 * content). "sound it out" plays the static phoneme bank sweep (§7 rule 4).
 * Practiced words feed the end-of-session quiz (R7).
 *
 * Pointing uses the vision model (2026-07-19, /api/point) — robust to the
 * back-of-hand view the mirror-clip camera sees, unlike MediaPipe. The model
 * locates the finger; the OCR word there is what we coach/quiz. lib/
 * hand-tracker.ts is kept for revert (selectWordAt is reused).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CameraStage, CameraStageHandle, CapturedFrame } from "@/components/CameraStage";
import { GraphemeSweep } from "@/components/GraphemeSweep";
import { OcrBox, subBoxFor } from "@/components/KaraokeHighlight";
import { chunksFor, chunkPattern, normalizeWord, GraphemeChunkDef } from "@/lib/graphemes";
import { selectWordAt, Point } from "@/lib/hand-tracker";
import { speak, speakSteps, stopSpeaking, announce, primeSpeech } from "@/lib/speech";
import { installAudioUnlock, loadClip, playSequence, playChime, Playback } from "@/lib/audio";
import { SessionLogger } from "@/lib/event-queue";
import { coachingLines } from "@/lib/syllables";
import { saidWordMatches } from "@/lib/text-match";
import { resolveVoiceCommand } from "@/lib/voice-commands";
import { startVoiceListener, VoiceListener } from "@/lib/stt";
import { LottieBadge } from "@/components/LottieBadge";
import { ChevronLeft, Mic, MicOff, RotateCw, Square, Hand, Volume2, BookOpen } from "lucide-react";

interface WordEntry extends OcrBox {
  key: string;
}

export interface PracticedWord {
  text: string;
  box: [number, number][];
}

type Phase = "live" | "ready" | "coaching" | "sweeping";

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
const QUIZ_SAY_MS = 10_000;

/** Split a block into word entries — real OCR word boxes when available. */
function wordsOf(block: OcrBox, blockIndex: number, gen: number): WordEntry[] {
  const words: WordEntry[] = [];
  if (block.words && block.words.length > 0) {
    block.words.forEach((w, i) => words.push({ text: w.text, box: w.box, key: `${gen}:${blockIndex}:w${i}` }));
    return words;
  }
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

function boxRect(box: [number, number][]) {
  const xs = box.map(([x]) => x);
  const ys = box.map(([, y]) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, w: Math.max(...xs) - left, h: Math.max(...ys) - top };
}

export default function AutopsyPage() {
  const router = useRouter();
  const stage = useRef<CameraStageHandle>(null);
  const logger = useRef<SessionLogger | null>(null);
  const captureGen = useRef(0);
  const busyRef = useRef(false);
  const scanningRef = useRef(false);
  const findingRef = useRef(false);
  const wordsRef = useRef<WordEntry[]>([]);
  const frameRef = useRef<CapturedFrame | null>(null);
  const lastWordRef = useRef<WordEntry | null>(null);
  const practiceRef = useRef<PracticedWord[]>([]);
  const sweepRef = useRef<Playback | null>(null);
  const listenerRef = useRef<VoiceListener | null>(null);
  const autoScanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quizRef = useRef<QuizState | null>(null);
  const answerWindowRef = useRef<{ target: string } | null>(null);
  const quizTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase] = useState<Phase>("live");
  const [frame, setFrame] = useState<CapturedFrame | null>(null);
  const [words, setWords] = useState<WordEntry[]>([]);
  const [located, setLocated] = useState<Point | null>(null);
  const [finding, setFinding] = useState(false);
  const [stuck, setStuck] = useState<WordEntry | null>(null);
  const [chunks, setChunks] = useState<GraphemeChunkDef[]>([]);
  const [activeChunk, setActiveChunk] = useState(-1);
  const [practicedCount, setPracticedCount] = useState(0);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("Starting camera…");
  const [quiz, setQuiz] = useState<QuizState | null>(null);

  function setQuizBoth(q: QuizState | null) {
    quizRef.current = q;
    setQuiz(q);
  }

  function clearQuizTimers() {
    if (quizTimer.current) clearTimeout(quizTimer.current);
    quizTimer.current = null;
    answerWindowRef.current = null;
  }

  function stopAllAudio() {
    stopSpeaking();
    sweepRef.current?.stop();
    sweepRef.current = null;
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
    stopAllAudio();
    busyRef.current = false;
    frameRef.current = null;
    wordsRef.current = [];
    setFrame(null);
    setWords([]);
    setStuck(null);
    setChunks([]);
    setActiveChunk(-1);
    setLocated(null);
    setPhase("live");
    setStatus("Scanning the page…");

    try {
      const captured = stage.current?.captureFrame({ freeze: false });
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
      setPhase("ready");
      setStatus("Point at the word you're stuck on, then tap the button (or say “I'm stuck”).");
    } catch (err) {
      console.error(err);
      setStatus("Scanning failed — tap Rescan to try again.");
    } finally {
      scanningRef.current = false;
    }
  }

  /** Capture → locate finger (vision) → the OCR word there. */
  async function locateWord(): Promise<WordEntry | null> {
    const dims = frameRef.current;
    if (!dims) return null;
    const shot = stage.current?.captureFrame({ freeze: false });
    if (!shot) return null;
    const res = await fetch("/api/point", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: shot.base64 }),
    });
    const data = (await res.json()) as { found?: boolean; x?: number; y?: number };
    if (!data.found || typeof data.x !== "number" || typeof data.y !== "number") return null;
    setLocated({ x: data.x, y: data.y });
    return selectWordAt({ x: data.x * dims.width, y: data.y * dims.height }, wordsRef.current);
  }

  /** Trigger: find the pointed word, then coach (default) or sweep. */
  async function pointAndAct(mode: "coach" | "sweep") {
    if (findingRef.current || busyRef.current) return;
    findingRef.current = true;
    setFinding(true);
    setLocated(null);
    setStatus("Finding your finger…");
    try {
      const word = await locateWord();
      if (!word) {
        setStatus("I couldn’t see your finger on a word — point clearly and try again.");
        return;
      }
      if (mode === "sweep") await phonemeSweep(word);
      else await coachWord(word);
    } catch (err) {
      console.error("point failed:", err);
      setStatus("Something went wrong — try again.");
    } finally {
      findingRef.current = false;
      setFinding(false);
    }
  }

  async function coachWord(word: WordEntry) {
    busyRef.current = true;
    setPhase("coaching");
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
      if (lines.length > 0) await speakSteps(lines, undefined, 500);
      else await speak(word.text);
    } catch (err) {
      console.error("coaching TTS failed:", err);
    }
    busyRef.current = false;
    setStuck(null); // clear the highlight so it doesn't linger (S8)
    setPhase("ready");
    setStatus("Point at another word — or say “sound it out” for letter sounds.");
  }

  async function phonemeSweep(word: WordEntry) {
    busyRef.current = true;
    setPhase("sweeping");
    setStuck(word);
    const wordChunks = chunksFor(word.text);
    const pattern = chunkPattern(wordChunks);
    setChunks(wordChunks);
    logger.current?.log({ type: "autopsy_soundout", word: normalizeWord(word.text), grapheme: pattern });
    setStatus("Listen and watch each part light up…");

    try {
      const buffers = await Promise.all(wordChunks.map((ch) => loadClip(`/phonemes/${ch.phonemeId}.mp3`)));
      const seq = playSequence(buffers, { gapMs: 60, missingMs: 300, onClipStart: (i) => setActiveChunk(i) });
      sweepRef.current = seq;
      await seq.done;
      setActiveChunk(-1);
      await speak(word.text);
    } catch (err) {
      console.error("phoneme sweep failed:", err);
    }
    sweepRef.current = null;
    setChunks([]);
    setStuck(null);
    busyRef.current = false;
    setPhase("ready");
    setStatus("Point at another word — or say “sound it out” for letter sounds.");
  }

  async function handleUtterance(text: string) {
    // Quiz "say" window: the utterance IS the answer.
    if (answerWindowRef.current && quizRef.current?.stage === "say") {
      const { target } = answerWindowRef.current;
      clearQuizTimers();
      const ok = saidWordMatches(text, target);
      if (ok) playChime();
      continueAfterSay(ok);
      return;
    }
    if (quizRef.current) return;

    const cmd = await resolveVoiceCommand(text);
    if ((findingRef.current || busyRef.current) && cmd.intent !== "stop") return;
    switch (cmd.intent) {
      case "stuck_word":
      case "read":
        void pointAndAct("coach");
        break;
      case "sound_out":
        if (lastWordRef.current) void phonemeSweep(lastWordRef.current);
        else void pointAndAct("sweep");
        break;
      case "repeat":
        if (lastWordRef.current) void coachWord(lastWordRef.current);
        break;
      case "stop":
        stopAllAudio();
        busyRef.current = false;
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
      setStatus("Mic unavailable — use the buttons.");
    }
  }

  /* ── End-of-session quiz (R7) ─────────────────────────────────────────── */

  function scanEntryFor(word: PracticedWord): WordEntry | null {
    const n = normalizeWord(word.text);
    return wordsRef.current.find((w) => normalizeWord(w.text) === n) ?? null;
  }

  async function runSayStep(index: number, results: QuizResultItem[]) {
    const item = practiceRef.current[index];
    if (!item) return finishQuiz(results);
    setStuck(scanEntryFor(item)); // glow the target word for the "say it" step
    setQuizBoth({ stage: "say", index, results });
    try {
      await speak("What is this word?");
    } catch {
      /* prompt shown on screen */
    }
    if (quizRef.current?.stage !== "say") return;
    answerWindowRef.current = { target: item.text };
    quizTimer.current = setTimeout(() => {
      answerWindowRef.current = null;
      continueAfterSay(false);
    }, QUIZ_SAY_MS);
  }

  function continueAfterSay(said: boolean) {
    const q = quizRef.current;
    if (!q) return;
    setStuck(null); // stop revealing the word before the pointing step
    setQuizBoth({ stage: "point", index: q.index, results: q.results });
    void speak(`Now point at the word ${practiceRef.current[q.index]?.text}.`).catch(() => {});
    void checkPointResult(said);
  }

  /** Capture → locate finger → did the child point at the target word? */
  async function checkPointResult(said: boolean) {
    const q = quizRef.current;
    if (!q) return;
    const item = practiceRef.current[q.index];
    const target = scanEntryFor(item);
    if (!target) {
      recordResult(q.index, q.results, { word: item.text, said, pointed: null, skipped: false });
      return;
    }
    setFinding(true);
    setStatus("Finding your finger…");
    let pointed = false;
    try {
      const word = await locateWord();
      pointed = !!word && normalizeWord(word.text) === normalizeWord(item.text);
    } catch (err) {
      console.error("quiz point failed:", err);
    }
    setFinding(false);
    if (quizRef.current?.stage !== "point") return;
    if (pointed) playChime();
    recordResult(q.index, q.results, { word: item.text, said, pointed, skipped: false });
  }

  function recordResult(index: number, results: QuizResultItem[], item: QuizResultItem) {
    const next = [...results, item];
    if (index + 1 < practiceRef.current.length) void runSayStep(index + 1, next);
    else finishQuiz(next);
  }

  function skipQuizWord() {
    const q = quizRef.current;
    if (!q) return;
    clearQuizTimers();
    setStuck(null);
    const item = practiceRef.current[q.index];
    recordResult(q.index, q.results, { word: item?.text ?? "", said: null, pointed: null, skipped: true });
  }

  function finishQuiz(results: QuizResultItem[]) {
    clearQuizTimers();
    setStuck(null);
    setQuizBoth({ stage: "done", index: practiceRef.current.length, results });
    const said = results.filter((r) => r.said === true).length;
    const total = results.filter((r) => !r.skipped).length;
    announce(total > 0 ? `You got ${said} of ${total} words. Well done!` : "Quiz finished.");
  }

  async function endSession(withQuizResults?: QuizResultItem[]) {
    if (!withQuizResults && practiceRef.current.length > 0 && quizRef.current === null) {
      stopAllAudio();
      setStuck(null);
      setQuizBoth({ stage: "offer", index: 0, results: [] });
      return;
    }
    clearQuizTimers();
    setQuizBoth(null);
    listenerRef.current?.stop();
    listenerRef.current = null;
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
    if (sessionId) router.push(`/stats/${sessionId}`);
    else setStatus("Session ended (logging was unavailable — no stats).");
  }

  const frameW = frame?.width ?? 1;
  const frameH = frame?.height ?? 1;

  return (
    <main className="fixed inset-0 bg-[var(--ink)]">
      <CameraStage
        ref={stage}
        fullBleed
        onError={setStatus}
        onReady={scheduleAutoScan}
        onSourceChange={() => {
          stopAllAudio();
          frameRef.current = null;
          wordsRef.current = [];
          setFrame(null);
          setWords([]);
          setStuck(null);
          setChunks([]);
          setPhase("live");
          scheduleAutoScan();
        }}
      >
        {/* Faint word guides (accurate boxes; degenerate skipped). */}
        {frame &&
          phase !== "live" &&
          !stuck &&
          words.map((w) => {
            const r = boxRect(w.box);
            if (r.w < 3 || r.h < 3) return null;
            return (
              <div
                key={w.key}
                className="absolute rounded-sm outline-dashed outline-1 outline-[rgba(236,77,37,0.3)]"
                style={{
                  left: `${(r.left / frameW) * 100}%`,
                  top: `${(r.top / frameH) * 100}%`,
                  width: `${(r.w / frameW) * 100}%`,
                  height: `${(r.h / frameH) * 100}%`,
                }}
              />
            );
          })}

        {/* The word being coached / quizzed (yellow). */}
        {frame &&
          stuck &&
          chunks.length === 0 &&
          (() => {
            const r = boxRect(stuck.box);
            if (r.w < 3 || r.h < 3) return null;
            return (
              <div
                className="absolute rounded-sm bg-[rgba(255,211,77,0.4)] outline outline-2 outline-[var(--hl-strong)]"
                style={{
                  left: `${(r.left / frameW) * 100}%`,
                  top: `${(r.top / frameH) * 100}%`,
                  width: `${(r.w / frameW) * 100}%`,
                  height: `${(r.h / frameH) * 100}%`,
                }}
              />
            );
          })()}

        {frame && stuck && chunks.length > 0 && (
          <GraphemeSweep
            wordBox={stuck}
            chunks={chunks}
            activeIndex={activeChunk}
            frameWidth={frameW}
            frameHeight={frameH}
          />
        )}

        {/* Located fingertip dot. */}
        {located && (
          <div
            className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--point)] shadow"
            style={{ left: `${located.x * 100}%`, top: `${located.y * 100}%` }}
          />
        )}

        {finding && (
          <div className="absolute inset-x-0 top-16 flex justify-center">
            <span className="glass rounded-full px-3 py-1 text-[12px] font-medium text-[var(--ink)]">
              finding your finger…
            </span>
          </div>
        )}
      </CameraStage>

      {/* Top-left: back + title. */}
      <div className="absolute left-2 top-2 z-10 flex items-center gap-2">
        <Link
          href="/"
          className="press glass flex h-9 w-9 items-center justify-center rounded-full"
          aria-label="Back to home"
        >
          <ChevronLeft size={20} color="var(--ink)" />
        </Link>
        <span className="glass rounded-full px-3 py-1.5 text-sm font-semibold text-[var(--ink)]">
          Autopsy
        </span>
        <span className="glass flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-medium text-[var(--ink)]">
          <BookOpen size={13} /> {practicedCount}
        </span>
      </div>

      {/* Bottom floating glass control panel. */}
      <div className="absolute inset-x-0 bottom-0 z-10">
        <div className="glass mx-auto max-w-md rounded-t-3xl px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          <div className="flex gap-2">
            <button
              onClick={() => void pointAndAct("coach")}
              disabled={finding || phase === "live" || phase === "coaching" || phase === "sweeping"}
              className="btn-accent press flex flex-[2] items-center justify-center gap-2 py-3.5 text-base disabled:opacity-50"
            >
              <Hand size={20} />
              {finding ? "Finding…" : "Help me with this word"}
            </button>
            <button
              onClick={() => void pointAndAct("sweep")}
              disabled={finding || phase === "live" || phase === "coaching" || phase === "sweeping"}
              className="btn-soft press flex flex-1 items-center justify-center gap-1.5 py-3.5 text-sm disabled:opacity-50"
            >
              <Volume2 size={18} /> Sound out
            </button>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => void toggleMic()}
              className={`press flex items-center gap-1 rounded-full px-3 py-2 text-[12px] font-medium ${
                listening ? "bg-[var(--ok)] text-white" : "bg-[var(--surface)] text-[var(--ink-soft)] border border-[var(--hairline)]"
              }`}
              aria-pressed={listening}
            >
              {listening ? <Mic size={14} /> : <MicOff size={14} />}
              {listening ? "on" : "off"}
            </button>
            <button
              onClick={() => void rescan()}
              className="btn-soft press flex flex-1 items-center justify-center gap-1.5 py-2 text-sm"
            >
              <RotateCw size={16} /> Rescan
            </button>
            <button
              onClick={() => void endSession()}
              className="press flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[var(--ink)] py-2 text-sm font-semibold text-white"
            >
              <Square size={14} /> End
            </button>
          </div>
          <p className="mt-1.5 text-center text-[12px] leading-snug text-[var(--ink-soft)]">{status}</p>
        </div>
      </div>

      {/* End-of-session quiz dialog (R7). */}
      {quiz && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-[rgba(34,48,63,0.35)] p-4 pb-8">
          <div className="card fadein w-full max-w-md p-4">
            {quiz.stage === "offer" && (
              <>
                <h2 className="font-display text-lg font-extrabold">Quiz time? 🌟</h2>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Test the {practiceRef.current.length}{" "}
                  {practiceRef.current.length === 1 ? "word" : "words"} you practiced? You can skip
                  any word.
                </p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => void runSayStep(0, [])} className="btn btn-hl flex-1 !py-2.5">
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
                  <span className="mono-hint !text-[var(--point)]">
                    Word {quiz.index + 1} of {practiceRef.current.length}
                  </span>
                  <span className={`stamp ${quiz.stage === "say" ? "stamp-det" : "stamp-ok"}`}>
                    {quiz.stage === "say" ? "Say it" : "Point at it"}
                  </span>
                </div>
                <p className="mt-2 text-sm">
                  {quiz.stage === "say"
                    ? "Read the glowing word out loud."
                    : `Point at “${practiceRef.current[quiz.index]?.text}” on the paper, then tap Check.`}
                </p>
                {quiz.stage === "point" && (
                  <button
                    onClick={() => void checkPointResult(false)}
                    disabled={finding}
                    className="btn btn-hl mt-3 w-full !py-2.5"
                  >
                    {finding ? "Checking…" : "✓ Check where I'm pointing"}
                  </button>
                )}
                <button onClick={skipQuizWord} className="btn btn-ghost mt-2 w-full !py-2">
                  Skip this word
                </button>
              </>
            )}

            {quiz.stage === "done" && (
              <>
                <LottieBadge src="/lottie/star-pop.json" className="mx-auto h-20 w-20" />
                <h2 className="font-display text-center text-lg font-extrabold">
                  {quiz.results.filter((r) => r.said === true).length} of{" "}
                  {quiz.results.filter((r) => !r.skipped).length} said right! 🎉
                </h2>
                <p className="mt-1 text-center text-sm text-[var(--ink-soft)]">
                  Pointed correctly: {quiz.results.filter((r) => r.pointed === true).length} · skipped:{" "}
                  {quiz.results.filter((r) => r.skipped).length}
                </p>
                <button onClick={() => void endSession(quiz.results)} className="btn btn-hl mt-3 w-full !py-2.5">
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
