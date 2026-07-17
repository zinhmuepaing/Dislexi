"use client";

/**
 * AI Tutoring (ARCHITECTURE.md §8): question (voice or text — text input is a
 * permanent fallback, §9.5) → capture+freeze (§7 rule 2) → POST /api/tutor
 * (SSE) → THINKING state (raw model output is NEVER rendered — the stream is
 * consumed silently until the final steps frame arrives) → narrate each step
 * via Azure TTS with its region highlighted on the frozen frame in sync.
 * Follow-ups append to `history` and reuse the same frozen frame. Regions are
 * normalized 0–1 relative to the submitted image (§5.3).
 *
 * Narration plays through the shared WebAudio context (lib/audio.ts): all
 * step buffers are synthesized up front and played back-to-back, so audio
 * starts reliably even after a long SSE wait (autoplay-policy fix) and the
 * step-to-step transitions are smooth.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CameraStage, CameraStageHandle, CapturedFrame } from "@/components/CameraStage";
import { speak, stopSpeaking, announce, primeSpeech, speakSteps } from "@/lib/speech";
import { installAudioUnlock } from "@/lib/audio";
import { SessionLogger } from "@/lib/event-queue";

interface TutorStep {
  say: string;
  region: { x: number; y: number; w: number; h: number };
}

interface TutorTurn {
  role: "user" | "assistant";
  content: string;
}

interface DictationCtor {
  new (): {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start: () => void;
    stop: () => void;
    onresult: ((event: { resultIndex: number; results: { [i: number]: { [j: number]: { transcript: string }; isFinal: boolean }; length: number } }) => void) | null;
    onend: (() => void) | null;
    onerror: (() => void) | null;
  };
}

const THINKING_LINES = [
  "reading your worksheet…",
  "thinking through the steps…",
  "matching each step to the page…",
  "almost there…",
];

export default function TutoringPage() {
  const stage = useRef<CameraStageHandle>(null);
  const logger = useRef<SessionLogger | null>(null);
  const [question, setQuestion] = useState("");
  const [frame, setFrame] = useState<CapturedFrame | null>(null);
  const [steps, setSteps] = useState<TutorStep[]>([]);
  const [activeStep, setActiveStep] = useState(-1);
  const [history, setHistory] = useState<TutorTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [thinkingLine, setThinkingLine] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dictating, setDictating] = useState(false);

  useEffect(() => {
    announce("Look at your screen. Ask me about your worksheet."); // §7 rule 6
    installAudioUnlock();
    primeSpeech();
    SessionLogger.start("tutoring").then((l) => (logger.current = l));
    // Prompt for the microphone immediately on entry (§7 rule 8: questions
    // only, nothing recorded) so dictation later starts without a modal.
    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((s) => s.getTracks().forEach((t) => t.stop()))
      .catch(() => {
        /* text input is the permanent fallback (§9.5) */
      });
    return () => {
      stopSpeaking();
    };
  }, []);

  // Rotate the friendly thinking lines while waiting on the model
  // (reset to line 0 happens in ask(), not here — avoids a cascading render).
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setThinkingLine((i) => (i + 1) % THINKING_LINES.length), 2200);
    return () => clearInterval(t);
  }, [busy]);

  async function ask() {
    if (!question.trim() || busy) return;

    // Freeze one frame per interaction (§7 rule 2). Follow-ups reuse the
    // frozen frame so regions keep referring to the same image.
    const captured = frame ?? stage.current?.captureFrame() ?? null;
    if (!captured) return;
    stopSpeaking();
    setFrame(captured);
    setThinkingLine(0);
    setBusy(true);
    setErrorMsg(null);
    setSteps([]);
    setActiveStep(-1);
    logger.current?.log({ type: "tutor_question", word: question });

    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: captured.base64, question, history }),
      });
      if (!res.ok || !res.body) throw new Error(`tutor ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalSteps: TutorStep[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const f of frames) {
          const payload = f.replace(/^data: /, "").trim();
          if (!payload || payload === "[DONE]") continue;
          const msg = JSON.parse(payload) as {
            delta?: string;
            steps?: TutorStep[];
            error?: string;
          };
          // NOTE: msg.delta (raw model output) is deliberately NOT rendered —
          // the UI shows the friendly thinking state until steps arrive.
          if (msg.steps) finalSteps = msg.steps;
          if (msg.error) throw new Error(msg.error);
        }
      }

      setSteps(finalSteps);
      setHistory((h) => [
        ...h,
        { role: "user", content: question },
        { role: "assistant", content: JSON.stringify({ steps: finalSteps }) },
      ]);
      setQuestion("");
      if (finalSteps.length === 0) {
        setErrorMsg("I couldn't work that one out — try asking in a different way.");
      } else {
        // Pre-synthesized, gapless narration; highlight advances per step.
        void speakSteps(
          finalSteps.map((s) => s.say),
          (i) => setActiveStep(i),
        );
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Sorry, tutoring hit a snag — please ask again.");
    } finally {
      setBusy(false);
    }
  }

  /** One-shot dictation into the question box (§9.5: text input stays). */
  function dictate() {
    const Ctor = (window as unknown as { webkitSpeechRecognition?: DictationCtor })
      .webkitSpeechRecognition;
    if (!Ctor || dictating) return;
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-SG";
    rec.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0]?.transcript ?? "";
      setQuestion(text);
    };
    rec.onend = () => setDictating(false);
    rec.onerror = () => setDictating(false);
    try {
      rec.start();
      setDictating(true);
    } catch {
      setDictating(false);
    }
  }

  /** New photo: unfreeze and start a fresh conversation about a new frame. */
  function retake() {
    stopSpeaking();
    stage.current?.unfreeze();
    setFrame(null);
    setSteps([]);
    setActiveStep(-1);
    setHistory([]);
    setErrorMsg(null);
  }

  const region = activeStep >= 0 ? steps[activeStep]?.region : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4 pt-5">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href="/" className="btn btn-ghost !px-3 !py-1.5 text-sm" aria-label="Back to features">
          ←
        </Link>
        <h1 className="font-display text-xl font-extrabold">AI Tutoring</h1>
        <span className="stamp stamp-ai">AI explains here — never in Exam-Prep</span>
      </header>

      <CameraStage ref={stage}>
        {region && (
          <div
            className="absolute rounded-md bg-[rgba(255,211,77,0.35)] outline outline-2 outline-[var(--hl-strong)] transition-all"
            style={{
              left: `${region.x * 100}%`,
              top: `${region.y * 100}%`,
              width: `${region.w * 100}%`,
              height: `${region.h * 100}%`,
            }}
          />
        )}
      </CameraStage>

      <div className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Ask about the worksheet…"
          className="min-w-0 flex-1 rounded-[10px] border-[1.5px] border-[var(--ink)] bg-white p-3 text-[15px] placeholder:text-[var(--ink-soft)] focus:outline-[3px] focus:outline-[var(--pen)]"
        />
        <button
          onClick={dictate}
          disabled={dictating}
          className="btn btn-ghost !px-4"
          aria-label="Speak your question"
        >
          {dictating ? "…" : "🎙"}
        </button>
        <button onClick={ask} disabled={busy || !question.trim()} className="btn btn-hl !px-5">
          Ask
        </button>
      </div>

      {busy && (
        <div className="card fadein flex items-center gap-3 p-4" role="status" aria-live="polite">
          <span className="flex gap-1.5" aria-hidden>
            <span className="think-dot" />
            <span className="think-dot" />
            <span className="think-dot" />
          </span>
          <span className="mono-hint !text-[12.5px]">{THINKING_LINES[thinkingLine]}</span>
        </div>
      )}

      {errorMsg && !busy && (
        <div className="card fadein border-[var(--margin)] p-4 text-sm">{errorMsg}</div>
      )}

      {steps.length > 0 && !busy && (
        <ol className="flex flex-col gap-2">
          {steps.map((s, i) => (
            <li key={i} className="fadein">
              <button
                onClick={() => {
                  stopSpeaking();
                  setActiveStep(i);
                  void speak(s.say).catch(() => {});
                }}
                className={`card w-full p-3 text-left text-sm transition-transform active:translate-y-px ${
                  i === activeStep
                    ? "!border-[var(--hl-strong)] bg-[rgba(255,211,77,0.18)]"
                    : ""
                }`}
              >
                <span className="mono-hint mr-2 !text-[var(--pen)]">Step {i + 1}</span>
                {s.say}
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="card flex flex-col gap-1 p-3">
        <p className="mono-hint">
          ask by voice or typing · each step glows on the worksheet while it&apos;s explained
        </p>
        {frame && (
          <button onClick={retake} className="mono-hint self-start underline">
            📷 new photo / new question
          </button>
        )}
      </div>
    </main>
  );
}
