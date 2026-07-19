"use client";

/**
 * AI Tutoring (ARCHITECTURE.md §8): question (voice — auto-sent on silence —
 * or text) → capture+freeze (§7 rule 2) → OCR line map → POST /api/tutor
 * (SSE) → THINKING state (raw model output is NEVER rendered) → narrate each
 * step via Azure TTS while its WORKING is drawn on the frozen frame in sync.
 *
 * DeskTutor-style on-paper working (2026-07-19): steps carry anchored aids —
 * circles/boxes/arrows AND "write" labels that print the calculation right on
 * the worksheet (e.g. "=9/12" beside 3/4). The model anchors to OCR
 * line+phrase; the server resolves rects deterministically, so marks land on
 * the exact spot.
 *
 * Text explanations are HIDDEN by default (visual + audio first); a toggle
 * reveals the per-step sentences.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Mic, MicOff, Send, Camera, Eye, EyeOff } from "lucide-react";
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
  kind: "box" | "circle" | "arrow" | "write";
  region: TutorRegion;
  to?: TutorRegion;
  text?: string;
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
  "working through the steps…",
  "writing it on the page…",
  "almost there…",
];

/** Intersection-over-union of two normalized rects. */
function iou(a: TutorRegion, b: TutorRegion): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter <= 0) return 0;
  return inter / (a.w * a.h + b.w * b.h - inter);
}

/** SVG shapes + HTML text labels drawn on the frozen frame for a step. */
function AidsOverlay({ region, aids }: { region: TutorRegion | null; aids: TutorAid[] }) {
  // Drop a shape aid that sits on the same spot as the step's yellow region
  // (S3: the oval and the rectangle must not mark the exact same place).
  const shapeAids = aids.filter(
    (a) => a.kind === "arrow" || a.kind === "write" || !region || iou(a.region, region) < 0.55,
  );
  const writes = shapeAids.filter((a) => a.kind === "write");

  return (
    <>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <defs>
          <marker id="aid-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--point)" />
          </marker>
        </defs>
        {region && (
          <rect
            x={region.x * 100}
            y={region.y * 100}
            width={region.w * 100}
            height={region.h * 100}
            rx={1}
            fill="rgba(255,211,77,0.32)"
            stroke="var(--hl-strong)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {shapeAids.map((aid, i) => {
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
                stroke="var(--point)"
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
                stroke="var(--point)"
                strokeWidth={2.5}
                vectorEffect="non-scaling-stroke"
              />
            );
          }
          if (aid.kind === "arrow" && aid.to) {
            return (
              <line
                key={i}
                x1={cx}
                y1={cy}
                x2={(aid.to.x + aid.to.w / 2) * 100}
                y2={(aid.to.y + aid.to.h / 2) * 100}
                stroke="var(--point)"
                strokeWidth={2.5}
                vectorEffect="non-scaling-stroke"
                markerEnd="url(#aid-arrow)"
              />
            );
          }
          return null;
        })}
      </svg>
      {/* "write" labels as HTML so text isn't stretched by the SVG scaling.
          Centered over the word and clamped inside the frame so the working
          never gets truncated at an edge (item 1). */}
      {writes.map((aid, i) => {
        const cx = Math.min(0.9, Math.max(0.1, aid.region.x + aid.region.w / 2));
        const above = aid.region.y > 0.12; // room above? place above, else below
        return (
          <span
            key={`w${i}`}
            className="fadein absolute max-w-[38%] -translate-x-1/2 rounded bg-white/90 px-1 text-center font-display text-[2.9vw] font-extrabold leading-tight text-[var(--point)] shadow-sm sm:text-[13px]"
            style={{
              left: `${cx * 100}%`,
              top: above ? undefined : `${(aid.region.y + aid.region.h) * 100 + 1}%`,
              bottom: above ? `${(1 - aid.region.y) * 100 + 1}%` : undefined,
            }}
          >
            {aid.text}
          </span>
        );
      })}
    </>
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
  const [showText, setShowText] = useState(false); // text hidden by default (S7)

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

  async function handleUtterance(text: string) {
    if (busyRef.current || narratingRef.current) return;
    if (text.trim().split(/\s+/).length < 2) return;
    setQuestion(text);
    await ask(text);
  }

  useEffect(() => {
    announce("Look at your screen. Ask me about your worksheet."); // §7 rule 6
    installAudioUnlock();
    primeSpeech();
    SessionLogger.start("tutoring").then((l) => (logger.current = l));
    const micStart = setTimeout(() => void toggleMic(), 0);
    return () => {
      clearTimeout(micStart);
      listenerRef.current?.stop();
      listenerRef.current = null;
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setThinkingLine((i) => (i + 1) % THINKING_LINES.length), 2200);
    return () => clearInterval(t);
  }, [busy]);

  async function ensureLines(captured: CapturedFrame): Promise<TutorLine[]> {
    if (linesRef.current) return linesRef.current;
    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: captured.base64 }),
      });
      if (!res.ok) throw new Error(`ocr ${res.status}`);
      const data = (await res.json()) as { blocks?: { text: string; box: [number, number][] }[] };
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
          const msg = JSON.parse(payload) as { delta?: string; steps?: TutorStep[]; error?: string };
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

  const playStep = (i: number) => {
    stopSpeaking();
    narratingRef.current = true;
    setActiveStep(i);
    void speak(steps[i].say)
      .catch(() => {})
      .finally(() => {
        narratingRef.current = false;
      });
  };

  return (
    <main className="fixed inset-0 bg-[var(--ink)]">
      <CameraStage ref={stage} fullBleed>
        {active && <AidsOverlay region={active.region} aids={active.aids ?? []} />}
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
          AI Tutoring
        </span>
        {frame && (
          <button
            onClick={retake}
            className="press glass flex h-9 w-9 items-center justify-center rounded-full"
            aria-label="New photo"
          >
            <Camera size={18} color="var(--ink)" />
          </button>
        )}
      </div>

      {/* Thinking indicator floats over the camera. */}
      {busy && (
        <div className="absolute inset-x-0 top-16 z-10 flex justify-center">
          <div className="glass flex items-center gap-2 rounded-full px-4 py-2" role="status" aria-live="polite">
            <span className="flex gap-1.5" aria-hidden>
              <span className="think-dot" />
              <span className="think-dot" />
              <span className="think-dot" />
            </span>
            <span className="text-[12.5px] font-medium text-[var(--ink)]">{THINKING_LINES[thinkingLine]}</span>
          </div>
        </div>
      )}

      {/* Bottom floating glass panel. */}
      <div className="absolute inset-x-0 bottom-0 z-10">
        <div className="glass mx-auto flex max-h-[54dvh] max-w-md flex-col gap-2 rounded-t-3xl px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          {errorMsg && !busy && (
            <div className="fadein rounded-xl border border-[var(--margin)] bg-[var(--surface)] p-2.5 text-sm">
              {errorMsg}
            </div>
          )}

          {steps.length > 0 && !busy && (
            <div className="flex min-h-0 flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-[var(--ink-soft)]">
                  step {activeStep >= 0 ? activeStep + 1 : 1} of {steps.length} · watch the paper
                </span>
                <button
                  onClick={() => setShowText((v) => !v)}
                  className="press flex items-center gap-1 rounded-full border border-[var(--hairline)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium"
                  aria-pressed={showText}
                >
                  {showText ? <EyeOff size={13} /> : <Eye size={13} />}
                  {showText ? "hide text" : "show text"}
                </button>
              </div>

              {showText ? (
                <ol className="flex max-h-[26dvh] flex-col gap-1.5 overflow-y-auto">
                  {steps.map((s, i) => (
                    <li key={i} className="fadein">
                      <button
                        onClick={() => playStep(i)}
                        className={`w-full rounded-xl border p-2.5 text-left text-sm ${
                          i === activeStep
                            ? "border-[var(--hl-strong)] bg-[rgba(255,211,77,0.18)]"
                            : "border-[var(--hairline)] bg-[var(--surface)]"
                        }`}
                      >
                        <span className="mr-2 text-[12px] font-semibold text-[var(--point)]">Step {i + 1}</span>
                        {s.say}
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  {steps.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => playStep(i)}
                      className={`press h-8 w-8 rounded-full border-[1.5px] text-xs font-semibold ${
                        i === activeStep
                          ? "border-[var(--point)] bg-[var(--point)] text-white"
                          : "border-[var(--hairline)] bg-[var(--surface)] text-[var(--ink)]"
                      }`}
                      aria-label={`Step ${i + 1}`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Ask row. */}
          <div className="flex items-center gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void ask()}
              placeholder={listening ? "Just speak — or type here…" : "Ask about the worksheet…"}
              className="min-w-0 flex-1 rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] px-3.5 py-2.5 text-[15px] placeholder:text-[var(--ink-soft)] focus:outline-2 focus:outline-[var(--point)]"
            />
            <button
              onClick={() => void toggleMic()}
              className={`press flex h-11 w-11 items-center justify-center rounded-full ${
                listening ? "bg-[var(--ok)] text-white" : "bg-[var(--surface)] text-[var(--ink-soft)] border border-[var(--hairline)]"
              }`}
              aria-label={listening ? "Turn microphone off" : "Turn microphone on"}
              aria-pressed={listening}
            >
              {listening ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            <button
              onClick={() => void ask()}
              disabled={busy || !question.trim()}
              className="btn-accent press flex h-11 w-11 items-center justify-center disabled:opacity-40"
              aria-label="Ask"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
