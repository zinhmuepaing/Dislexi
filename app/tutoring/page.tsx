"use client";

/**
 * AI Tutoring (ARCHITECTURE.md §8): question (voice or text — text input is a
 * permanent fallback, §9.5) → capture+flip, freeze (§7 rules 1–2) →
 * POST /api/tutor (SSE) → stream narration text as it arrives, then narrate
 * each step via Azure Speech with its region highlighted on the frozen frame
 * in sync. Follow-ups append to `history` and reuse the same frozen frame.
 * Regions are normalized 0–1 relative to the submitted image (§5.3).
 */

import { useEffect, useRef, useState } from "react";
import { CameraStage, CameraStageHandle, CapturedFrame } from "@/components/CameraStage";
import { speak, stopSpeaking, announce } from "@/lib/speech";
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

export default function TutoringPage() {
  const stage = useRef<CameraStageHandle>(null);
  const logger = useRef<SessionLogger | null>(null);
  const narrationRun = useRef(0); // bump to cancel an in-flight narration loop
  const [question, setQuestion] = useState("");
  const [frame, setFrame] = useState<CapturedFrame | null>(null);
  const [streamText, setStreamText] = useState("");
  const [steps, setSteps] = useState<TutorStep[]>([]);
  const [activeStep, setActiveStep] = useState(-1);
  const [history, setHistory] = useState<TutorTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [dictating, setDictating] = useState(false);

  useEffect(() => {
    announce("Look at your screen. Ask me about your worksheet."); // §7 rule 6
    SessionLogger.start("tutoring").then((l) => (logger.current = l));
    return () => {
      narrationRun.current++;
      stopSpeaking();
    };
  }, []);

  /** Speak each step in order, advancing the highlight in sync. */
  async function narrate(allSteps: TutorStep[]) {
    const run = ++narrationRun.current;
    for (let i = 0; i < allSteps.length; i++) {
      if (narrationRun.current !== run) return; // superseded
      setActiveStep(i);
      try {
        await speak(allSteps[i].say);
      } catch (err) {
        console.error("narration failed:", err);
        return; // highlights stay tappable as the fallback
      }
    }
  }

  async function ask() {
    if (!question.trim() || busy) return;

    // Freeze one frame per interaction (§7 rule 2). Follow-ups reuse the
    // frozen frame so regions keep referring to the same image.
    const captured = frame ?? stage.current?.captureFrame() ?? null;
    if (!captured) return;
    narrationRun.current++;
    stopSpeaking();
    setFrame(captured);
    setBusy(true);
    setStreamText("");
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
      let fullText = "";

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
          if (msg.delta) {
            fullText += msg.delta;
            setStreamText(fullText);
          }
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
      void narrate(finalSteps);
    } catch (err) {
      console.error(err);
      setStreamText("Sorry, tutoring failed — please try again.");
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

  const region = activeStep >= 0 ? steps[activeStep]?.region : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">AI Tutoring</h1>
      <CameraStage ref={stage}>
        {region && (
          <div
            className="absolute rounded-md bg-sky-400/30 outline outline-2 outline-sky-400 transition-all"
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
          className="flex-1 rounded-xl border border-white/20 bg-white/5 p-3"
        />
        <button
          onClick={dictate}
          disabled={dictating}
          className="rounded-xl bg-white/10 px-4 font-semibold disabled:opacity-50 active:scale-95"
          aria-label="Speak your question"
        >
          {dictating ? "…" : "Mic"}
        </button>
        <button
          onClick={ask}
          disabled={busy}
          className="rounded-xl bg-sky-500 px-5 font-semibold text-white disabled:opacity-50 active:scale-95"
        >
          {busy ? "…" : "Ask"}
        </button>
      </div>

      {steps.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {steps.map((s, i) => (
            <li key={i}>
              <button
                onClick={() => {
                  narrationRun.current++; // manual tap takes over from auto-narration
                  stopSpeaking();
                  setActiveStep(i);
                  void speak(s.say).catch(() => {});
                }}
                className={`w-full rounded-lg p-3 text-left text-sm ${
                  i === activeStep ? "bg-sky-500/20 outline outline-1 outline-sky-400" : "bg-white/5"
                }`}
              >
                {i + 1}. {s.say}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        streamText && <p className="whitespace-pre-wrap text-xs opacity-50">{streamText}</p>
      )}
    </main>
  );
}
