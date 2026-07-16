"use client";

/**
 * AI Tutoring (ARCHITECTURE.md §8): question (voice or text — text input is a
 * permanent fallback, §9.5) → capture+flip, freeze (§7 rules 1–2) →
 * POST /api/tutor (SSE) → stream narration text as it arrives, then highlight
 * each step's region on the frozen frame in sync. Follow-ups append to
 * `history`. Regions are normalized 0–1 relative to the submitted image and
 * converted to canvas pixels here (§5.3).
 *
 * TODO(pipeline): narrate each step via Azure Speech (start TTS on first
 * complete step), advance highlights in sync, voice input via Web Speech API.
 */

import { useRef, useState } from "react";
import { CameraStage, CameraStageHandle, CapturedFrame } from "@/components/CameraStage";

interface TutorStep {
  say: string;
  region: { x: number; y: number; w: number; h: number };
}

interface TutorTurn {
  role: "user" | "assistant";
  content: string;
}

export default function TutoringPage() {
  const stage = useRef<CameraStageHandle>(null);
  const [question, setQuestion] = useState("");
  const [frame, setFrame] = useState<CapturedFrame | null>(null);
  const [streamText, setStreamText] = useState("");
  const [steps, setSteps] = useState<TutorStep[]>([]);
  const [activeStep, setActiveStep] = useState(-1);
  const [history, setHistory] = useState<TutorTurn[]>([]);
  const [busy, setBusy] = useState(false);

  async function ask() {
    if (!question.trim() || busy) return;

    // Freeze one frame per interaction (§7 rule 2). Follow-ups reuse the
    // frozen frame so regions keep referring to the same image.
    const captured = frame ?? stage.current?.captureFrame() ?? null;
    if (!captured) return;
    setFrame(captured);
    setBusy(true);
    setStreamText("");
    setSteps([]);
    setActiveStep(-1);

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
      setActiveStep(finalSteps.length > 0 ? 0 : -1);
      setHistory((h) => [
        ...h,
        { role: "user", content: question },
        { role: "assistant", content: JSON.stringify({ steps: finalSteps }) },
      ]);
      setQuestion("");
      // TODO: narrate steps[i].say via Azure Speech, advancing setActiveStep(i)
      // in sync; log a 'tutor_question' event via /api/events.
    } catch (err) {
      console.error(err);
      setStreamText("Sorry, tutoring failed — please try again.");
    } finally {
      setBusy(false);
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
                onClick={() => setActiveStep(i)}
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
