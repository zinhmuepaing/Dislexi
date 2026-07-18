"use client";

/**
 * AI Tutoring (ARCHITECTURE.md §8): question (voice — auto-sent on silence —
 * or text, the permanent §9.5 fallback) → capture+freeze (§7 rule 2) → OCR
 * line map → POST /api/tutor (SSE) → THINKING state (raw model output is
 * NEVER rendered) → narrate each step via Azure TTS with its region + visual
 * aids highlighted on the frozen frame in sync.
 *
 * HIGHLIGHT ACCURACY: the client sends the OCR line map (normalized boxes)
 * with the request; the model anchors steps to line indices + phrases and
 * the server resolves them to rects DETERMINISTICALLY from OCR geometry —
 * the model never emits coordinates. Aids (box/circle/arrow between
 * anchors) render as SVG overlays.
 *
 * Narration plays through the shared WebAudio context (lib/audio.ts): all
 * step buffers are synthesized up front and played back-to-back.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CameraStage, CameraStageHandle, CapturedFrame } from "@/components/CameraStage";
import { speak, stopSpeaking, announce, primeSpeech, speakSteps } from "@/lib/speech";
import { installAudioUnlock } from "@/lib/audio";
import { SessionLogger } from "@/lib/event-queue";
import { startVoiceListener, VoiceListener } from "@/lib/stt";

interface TutorRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TutorAid {
  kind: "box" | "circle" | "arrow";
  region: TutorRegion;
  to?: TutorRegion;
}

interface TutorStep {
  say: string;
  region: TutorRegion;
  aids?: TutorAid[];
}

interface TutorLine {
  i: number;
  text: string;
  box: TutorRegion;
}

interface TutorTurn {
  role: "user" | "assistant";
  content: string;
}

const THINKING_LINES = [
  "reading your worksheet…",
  "thinking through the steps…",
  "matching each step to the page…",
  "almost there…",
];

/** SVG aid overlays (normalized coords → 0-100 viewBox, stretched). */
function AidsOverlay({ region, aids }: { region: TutorRegion | null; aids: TutorAid[] }) {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <marker id="aid-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--pen)" />
        </marker>
      </defs>
      {region && (
        <rect
          x={region.x * 100}
          y={region.y * 100}
          width={region.w * 100}
          height={region.h * 100}
          rx={1}
          fill="rgba(255,211,77,0.35)"
          stroke="var(--hl-strong)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {aids.map((aid, i) => {
        const r = aid.region;
        const cx = (r.x + r.w / 2) * 100;
        const cy = (r.y + r.h / 2) * 100;
        if (aid.kind === "circle") {
          return (
            <ellipse
              key={i}
              cx={cx}
              cy={cy}
              rx={(r.w / 2) * 100 * 1.35 + 1}
              ry={(r.h / 2) * 100 * 1.6 + 1}
              fill="none"
              stroke="var(--pen)"
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        if (aid.kind === "box") {
          return (
            <rect
              key={i}
              x={r.x * 100}
              y={r.y * 100}
              width={r.w * 100}
              height={r.h * 100}
              rx={1}
              fill="none"
              stroke="var(--pen)"
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        const to = aid.to!;
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={(to.x + to.w / 2) * 100}
            y2={(to.y + to.h / 2) * 100}
            stroke="var(--pen)"
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
            markerEnd="url(#aid-arrow)"
          />
        );
      })}
    </svg>
  );
}

export default function TutoringPage() {
  const stage = useRef<CameraStageHandle>(null);
  const logger = useRef<SessionLogger | null>(null);
  const busyRef = useRef(false);
  const narratingRef = useRef(false);
  const frameRef = useRef<CapturedFrame | null>(null);
  const linesRef = useRef<TutorLine[] | null>(null);
  const historyRef = useRef<TutorTurn[]>([]);
  const listenerRef = useRef<VoiceListener | null>(null);

  const [question, setQuestion] = useState("");
  const [frame, setFrame] = useState<CapturedFrame | null>(null);
  const [steps, setSteps] = useState<TutorStep[]>([]);
  const [activeStep, setActiveStep] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [thinkingLine, setThinkingLine] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

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
    }
  }

  /** Spoken question → auto-submit on silence (no Ask button needed). */
  async function handleUtterance(text: string) {
    // Ignore while the model is thinking or the app is talking (the mic
    // hears the narration itself); typing stays available throughout.
    if (busyRef.current || narratingRef.current) return;
    if (text.trim().split(/\s+/).length < 2) return; // noise guard
    setQuestion(text);
    await ask(text);
  }

  useEffect(() => {
    announce("Look at your screen. Ask me about your worksheet."); // §7 rule 6
    installAudioUnlock();
    primeSpeech();
    SessionLogger.start("tutoring").then((l) => (logger.current = l));
    // Endless mic on entry: speak a question, it sends itself on silence.
    const micStart = setTimeout(() => void toggleMic(), 0);
    return () => {
      clearTimeout(micStart);
      listenerRef.current?.stop();
      listenerRef.current = null;
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rotate the friendly thinking lines while waiting on the model.
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setThinkingLine((i) => (i + 1) % THINKING_LINES.length), 2200);
    return () => clearInterval(t);
  }, [busy]);

  /** OCR the frozen frame once → normalized line map (reused by follow-ups). */
  async function ensureLines(captured: CapturedFrame): Promise<TutorLine[]> {
    if (linesRef.current) return linesRef.current;
    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: captured.base64 }),
      });
      if (!res.ok) throw new Error(`ocr ${res.status}`);
      const data = (await res.json()) as {
        blocks?: { text: string; box: [number, number][] }[];
      };
      const lines: TutorLine[] = (data.blocks ?? []).map((b, i) => {
        const xs = b.box.map(([x]) => x);
        const ys = b.box.map(([, y]) => y);
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        return {
          i,
          text: b.text,
          box: {
            x: left / captured.width,
            y: top / captured.height,
            w: (Math.max(...xs) - left) / captured.width,
            h: (Math.max(...ys) - top) / captured.height,
          },
        };
      });
      linesRef.current = lines;
      return lines;
    } catch (err) {
      console.warn("line map unavailable — falling back to model regions:", err);
      linesRef.current = [];
      return [];
    }
  }

  async function ask(text?: string) {
    const q = (text ?? question).trim();
    if (!q || busyRef.current) return;

    // Freeze one frame per interaction (§7 rule 2). Follow-ups reuse the
    // frozen frame so anchors keep referring to the same image.
    const captured = frameRef.current ?? stage.current?.captureFrame() ?? null;
    if (!captured) return;
    stopSpeaking();
    narratingRef.current = false;
    frameRef.current = captured;
    setFrame(captured);
    busyRef.current = true;
    setBusy(true);
    setThinkingLine(0);
    setErrorMsg(null);
    setSteps([]);
    setActiveStep(-1);
    logger.current?.log({ type: "tutor_question", word: q });

    try {
      const lines = await ensureLines(captured);
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: captured.base64,
          question: q,
          history: historyRef.current,
          lines: lines.length > 0 ? lines : undefined,
        }),
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
      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: q },
        { role: "assistant", content: JSON.stringify({ steps: finalSteps }) },
      ];
      setQuestion("");
      if (finalSteps.length === 0) {
        setErrorMsg("I couldn't work that one out — try asking in a different way.");
      } else {
        // Pre-synthesized, gapless narration; highlight + aids per step.
        narratingRef.current = true;
        void speakSteps(
          finalSteps.map((s) => s.say),
          (i) => setActiveStep(i),
        ).finally(() => {
          narratingRef.current = false;
        });
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Sorry, tutoring hit a snag — please ask again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  /** New photo: unfreeze and start a fresh conversation about a new frame. */
  function retake() {
    stopSpeaking();
    narratingRef.current = false;
    stage.current?.unfreeze();
    frameRef.current = null;
    linesRef.current = null;
    historyRef.current = [];
    setFrame(null);
    setSteps([]);
    setActiveStep(-1);
    setErrorMsg(null);
  }

  const active = activeStep >= 0 ? steps[activeStep] : null;

  return (
    // h-dvh + capped camera; the step list scrolls INTERNALLY so the input
    // row and hints never leave the viewport.
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col gap-2.5 p-3">
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Link href="/" className="btn btn-ghost !px-2.5 !py-1 text-sm" aria-label="Back to features">
          ←
        </Link>
        <h1 className="font-display text-lg font-extrabold">AI Tutoring</h1>
        <span className="stamp stamp-ai">AI explains here — never in Exam-Prep</span>
      </header>

      <CameraStage ref={stage}>
        {active && <AidsOverlay region={active.region} aids={active.aids ?? []} />}
      </CameraStage>

      <div className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void ask()}
          placeholder={listening ? "Just speak — or type here…" : "Ask about the worksheet…"}
          className="min-w-0 flex-1 rounded-[10px] border-[1.5px] border-[var(--ink)] bg-white p-3 text-[15px] placeholder:text-[var(--ink-soft)] focus:outline-[3px] focus:outline-[var(--pen)]"
        />
        <button
          onClick={() => void toggleMic()}
          className={`btn btn-ghost !px-3.5 ${listening ? "!bg-[var(--hl)]" : ""}`}
          aria-label={listening ? "Turn microphone off" : "Turn microphone on"}
          aria-pressed={listening}
        >
          {listening ? "🎙" : "🔇"}
        </button>
        <button onClick={() => void ask()} disabled={busy || !question.trim()} className="btn btn-hl !px-4">
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
        <ol className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {steps.map((s, i) => (
            <li key={i} className="fadein">
              <button
                onClick={() => {
                  stopSpeaking();
                  narratingRef.current = true;
                  setActiveStep(i);
                  void speak(s.say)
                    .catch(() => {})
                    .finally(() => {
                      narratingRef.current = false;
                    });
                }}
                className={`card w-full p-3 text-left text-sm transition-transform active:translate-y-px ${
                  i === activeStep ? "!border-[var(--hl-strong)] bg-[rgba(255,211,77,0.18)]" : ""
                }`}
              >
                <span className="mono-hint mr-2 !text-[var(--pen)]">Step {i + 1}</span>
                {s.say}
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="card mt-auto flex flex-col gap-1 p-2.5">
        <p className="mono-hint">
          {listening
            ? "speak your question — it sends itself when you pause"
            : "mic is off — type your question and tap Ask"}
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
