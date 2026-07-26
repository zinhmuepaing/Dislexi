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
import { ChevronLeft, ChevronRight, Mic, MicOff, Send, Camera, Eye, EyeOff } from "lucide-react";
import { CameraStage, CameraStageHandle, CapturedFrame } from "@/components/CameraStage";
import { FormulaCard } from "@/components/FormulaCard";
import { VisualCard } from "@/components/VisualCard";
import {
  EXPLORE_MAX_MS,
  isInteractiveVisual,
  startVisualHold,
  type TutorVisual,
} from "@/lib/tutor-visual";
import { speak, stopSpeaking, announce, primeSpeech, synthesizeSpeech } from "@/lib/speech";
import { installAudioUnlock } from "@/lib/audio";
import { SessionLogger } from "@/lib/event-queue";
import { startVoiceListener, VoiceListener } from "@/lib/stt";
import { isAffirmative } from "@/lib/voice-commands";

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
  formula?: string;
  /** Generated countable/animated visual (backlog §1/§3/§4); already validated
   *  server-side by parseVisual, so the client can render it as-is. */
  visual?: TutorVisual;
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
            className="fadein absolute w-fit max-w-[80%] -translate-x-1/2 whitespace-nowrap rounded bg-[var(--paper)] px-1.5 py-0.5 text-center font-display text-[3vw] font-extrabold leading-tight text-[var(--point)] shadow-sm sm:text-[14px]"
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
  // Streaming: steps arrive incrementally; the narration loop reads the latest.
  const stepsRef = useRef<TutorStep[]>([]);
  const streamDoneRef = useRef(false);
  const narrationRun = useRef(0);

  const [question, setQuestion] = useState("");
  const [frame, setFrame] = useState<CapturedFrame | null>(null);
  const [steps, setSteps] = useState<TutorStep[]>([]);
  const [activeStep, setActiveStep] = useState(-1);
  const activeStepRef = useRef(-1);
  /** True while a draggable visual has the floor and narration is waiting. */
  const [awaitingContinue, setAwaitingContinue] = useState(false);
  const continueRef = useRef<(() => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [thinkingLine, setThinkingLine] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [showText, setShowText] = useState(false); // text hidden by default (S7)
  /** Step index whose visual the student dismissed with the X. */
  const [dismissedVisual, setDismissedVisual] = useState<number | null>(null);
  /** Narration reached the end — overlays are cleared so the paper is visible. */
  const [narrationDone, setNarrationDone] = useState(false);
  /** Mid-explanation clarification: "asking" while answering, "answered" while
   *  waiting for the student to confirm before the explanation resumes. */
  const [clarifyState, setClarifyState] = useState<"idle" | "asking" | "answered">("idle");
  const clarifyStateRef = useRef<"idle" | "asking" | "answered">("idle");
  const [clarifyText, setClarifyText] = useState<string | null>(null);
  /** Held while narration is paused for a clarification; released to resume. */
  const pauseRef = useRef<{ promise: Promise<void>; release: () => void } | null>(null);
  /** Set when a question cut a step short, so that step is re-spoken on resume. */
  const interruptedRef = useRef(false);

  function setClarify(state: "idle" | "asking" | "answered") {
    clarifyStateRef.current = state;
    setClarifyState(state);
  }

  /** Release any pending explore wait — used by Next, and by anything that
   *  cancels or pauses narration (new question, clarification, retake, tapping
   *  a transcript step). Declared here because clarify() below uses it. */
  function releaseContinue() {
    continueRef.current?.();
    continueRef.current = null;
  }

  /** Block the narration loop at its next checkpoint. */
  function pauseNarration() {
    if (pauseRef.current) return;
    let release!: () => void;
    const promise = new Promise<void>((r) => (release = r));
    pauseRef.current = { promise, release };
  }

  /** Let the narration loop continue (also used to unblock on cancel/unmount,
   *  otherwise the loop would await a promise that never settles). */
  function resumeNarration() {
    const held = pauseRef.current;
    pauseRef.current = null;
    held?.release();
  }

  /** Narration checkpoint: waits out any pause. False → this run is superseded. */
  async function waitIfPaused(run: number): Promise<boolean> {
    while (pauseRef.current && narrationRun.current === run) {
      await pauseRef.current.promise;
    }
    return narrationRun.current === run;
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
    }
  }

  async function handleUtterance(text: string) {
    const words = text.trim().split(/\s+/);

    // Waiting for "shall I carry on?" — a yes resumes, anything else is
    // treated as another question (follow-ups keep working until they're ready).
    if (clarifyStateRef.current === "answered") {
      if (isAffirmative(text)) {
        continueExplanation();
        return;
      }
      if (words.length < 2) return;
      await clarify(text);
      return;
    }
    if (clarifyStateRef.current === "asking") return; // already fetching an answer
    if (words.length < 2) return;

    // Mid-explanation question → pause and answer it, never restart (item 4).
    if (narratingRef.current && stepsRef.current.length > 0) {
      await clarify(text);
      return;
    }
    if (busyRef.current) return; // still thinking — nothing to interrupt yet
    setQuestion(text);
    await ask(text);
  }

  /**
   * Answer a question asked DURING an explanation, then offer to carry on.
   * The narration loop is paused at its checkpoint rather than cancelled, so
   * resuming picks up the same step instead of starting over.
   */
  async function clarify(text: string) {
    const captured = frameRef.current;
    if (!captured) return;
    const run = narrationRun.current;

    pauseNarration();
    interruptedRef.current = true; // re-say the interrupted step on resume
    stopSpeaking(); // go quiet immediately — the student is talking
    releaseContinue(); // don't leave an explore wait hanging behind the pause
    setClarify("asking");
    setClarifyText(null);
    logger.current?.log({ type: "tutor_question", word: text });

    try {
      const res = await fetch("/api/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: captured.base64,
          question: text,
          history: historyRef.current,
          currentStep: stepsRef.current[Math.max(0, activeStepRef.current)]?.say,
        }),
      });
      if (!res.ok) throw new Error(`clarify ${res.status}`);
      const { say } = (await res.json()) as { say?: string };
      const answer = (say ?? "").trim();
      if (!answer) throw new Error("empty clarification");
      if (narrationRun.current !== run) return; // superseded meanwhile

      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: text },
        { role: "assistant", content: answer },
      ];
      setClarifyText(answer);
      setClarify("answered");
      try {
        await speak(answer);
        if (narrationRun.current !== run || clarifyStateRef.current !== "answered") return;
        await speak("Shall I carry on?");
      } catch {
        /* the Continue button is on screen regardless */
      }
    } catch (err) {
      console.error("clarify failed:", err);
      if (narrationRun.current !== run) return;
      setClarifyText("I didn't catch that one — I'll carry on, ask me again any time.");
      setClarify("answered");
    }
  }

  /**
   * Typed question. Mid-explanation it clarifies (same as speaking); otherwise
   * it starts a fresh explanation.
   */
  async function submitQuestion() {
    const q = question.trim();
    if (!q) return;
    if (clarifyStateRef.current === "asking") return;
    if (
      clarifyStateRef.current === "answered" ||
      (narratingRef.current && stepsRef.current.length > 0)
    ) {
      setQuestion("");
      await clarify(q);
      return;
    }
    await ask(q);
  }

  /** Student confirmed — drop the clarification and resume the explanation. */
  function continueExplanation() {
    setClarify("idle");
    setClarifyText(null);
    stopSpeaking();
    resumeNarration();
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
      // Leaving mid-response must go silent immediately. stopSpeaking() alone
      // only kills the CURRENT utterance — the narration loop would wake up,
      // advance, and start speaking the next step after unmount. Bump the run
      // id (every await in the loop checks it) and release any explore wait.
      narrationRun.current += 1;
      narratingRef.current = false;
      releaseContinue();
      resumeNarration(); // a paused loop would otherwise await forever
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    activeStepRef.current = activeStep; // clarify() reads this outside render
  }, [activeStep]);

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

  /**
   * Narrate steps as they stream in: wait for step i, synth+play its audio
   * (prefetching i+1 for near-gapless playback), reveal its formula/marks at
   * audio start, advance. Cancelled by bumping narrationRun.
   */
  /** Resolves when the student taps Next, or after EXPLORE_MAX_MS so an
   *  unattended session never stalls forever. */
  function waitForContinue(): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        continueRef.current = null;
        setAwaitingContinue(false);
        resolve();
      };
      const timer = setTimeout(finish, EXPLORE_MAX_MS);
      continueRef.current = finish;
      setAwaitingContinue(true);
    });
  }

  async function runNarration(run: number) {
    narratingRef.current = true;
    let i = 0;
    while (narrationRun.current === run) {
      while (i >= stepsRef.current.length && !streamDoneRef.current) {
        await new Promise((r) => setTimeout(r, 50));
        if (narrationRun.current !== run) return;
      }
      if (i >= stepsRef.current.length) break; // stream done, no more steps
      // Checkpoint: a mid-explanation question holds us here until answered.
      if (!(await waitIfPaused(run))) return;
      const step = stepsRef.current[i];
      const ready = synthesizeSpeech(step.say).catch(() => null); // this step's audio
      const next = stepsRef.current[i + 1];
      if (next) void synthesizeSpeech(next.say).catch(() => {}); // prefetch next
      await ready;
      if (narrationRun.current !== run) return;
      const hold = startVisualHold(); // clock starts as the visual is revealed
      setActiveStep(i); // reveal formula + marks in sync with audio start
      try {
        await speak(step.say); // cache hit → plays immediately
      } catch {
        /* keep advancing on TTS failure */
      }
      if (narrationRun.current !== run) return;

      // A question cut this step short. Don't advance — once the student is
      // ready, say THIS step again (they missed the end of it) and carry on.
      if (interruptedRef.current) {
        interruptedRef.current = false;
        continue;
      }

      // A visual is an activity, not a glance: give it the time its kind needs
      // before moving on. Only the step that INTRODUCES a visual holds —
      // later steps narrate over it normally (it stays up, see stickyVisual).
      if (step.visual) {
        if (isInteractiveVisual(step.visual)) {
          // The student's turn. Go quiet and invite them rather than talking
          // over someone who is meant to be experimenting.
          try {
            await speak("Your turn. Drag the dot and watch the number change.");
          } catch {
            /* the button is on screen regardless */
          }
          if (narrationRun.current !== run) return;
          await waitForContinue();
        } else {
          await hold(step.visual);
        }
        if (narrationRun.current !== run) return;
      }
      i += 1;
    }
    if (narrationRun.current === run) {
      narratingRef.current = false;
      setNarrationDone(true); // explanation over → clear any overlay
    }
  }

  async function ask(text?: string) {
    const q = (text ?? question).trim();
    if (!q || busyRef.current) return;

    const captured = frameRef.current ?? stage.current?.captureFrame() ?? null;
    if (!captured) return;
    stopSpeaking();
    const run = ++narrationRun.current; // cancel any prior narration
    releaseContinue();
    resumeNarration(); // release a clarification pause from the previous run
    interruptedRef.current = false;
    setClarify("idle");
    setClarifyText(null);
    stepsRef.current = [];
    streamDoneRef.current = false;
    frameRef.current = captured;
    setFrame(captured);
    busyRef.current = true;
    setBusy(true);
    setThinkingLine(0);
    setErrorMsg(null);
    setSteps([]);
    setActiveStep(-1);
    setDismissedVisual(null);
    setNarrationDone(false);
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

      // Steps stream in one at a time; start narrating as soon as the first
      // arrives (busy/thinking clears on the first step).
      void runNarration(run);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
            step?: TutorStep;
            index?: number;
            done?: boolean;
            error?: string;
          };
          if (msg.error) throw new Error(msg.error);
          if (msg.step) {
            if (narrationRun.current !== run) continue; // superseded
            stepsRef.current = [...stepsRef.current, msg.step];
            setSteps(stepsRef.current);
            if (busyRef.current) {
              busyRef.current = false;
              setBusy(false); // first step in → drop the thinking state
            }
          }
          if (msg.done) streamDoneRef.current = true;
        }
      }
      streamDoneRef.current = true;

      if (narrationRun.current === run) {
        setQuestion("");
        if (stepsRef.current.length === 0) {
          setErrorMsg("I couldn't work that one out — try asking in a different way.");
        } else {
          historyRef.current = [
            ...historyRef.current,
            { role: "user", content: q },
            { role: "assistant", content: JSON.stringify({ steps: stepsRef.current }) },
          ];
        }
      }
    } catch (err) {
      console.error(err);
      streamDoneRef.current = true;
      if (narrationRun.current === run) setErrorMsg("Sorry, tutoring hit a snag — please ask again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function retake() {
    stopSpeaking();
    narrationRun.current += 1; // cancel narration
    releaseContinue();
    resumeNarration();
    interruptedRef.current = false;
    setClarify("idle");
    setClarifyText(null);
    narratingRef.current = false;
    stepsRef.current = [];
    streamDoneRef.current = false;
    stage.current?.unfreeze();
    frameRef.current = null;
    linesRef.current = null;
    historyRef.current = [];
    setFrame(null);
    setSteps([]);
    setActiveStep(-1);
    setErrorMsg(null);
    setDismissedVisual(null);
    setNarrationDone(false);
  }

  const active = activeStep >= 0 ? steps[activeStep] : null;

  /**
   * Sticky visual: the most recent visual at or before the active step, so it
   * stays up while later steps narrate over it and only changes when a step
   * supplies a different one. Keyed by the index that INTRODUCED it — keying by
   * activeStep would remount on every step, restarting the animation and
   * throwing away the angle the student had dragged to.
   */
  const stickyVisual = (() => {
    for (let k = activeStep; k >= 0; k--) {
      const v = steps[k]?.visual;
      if (v) return { visual: v, key: k };
    }
    return null;
  })();

  // An overlay must never outlive its explanation: it goes when the student
  // closes it, and when narration finishes (`narrationDone`) so the worksheet
  // is never left buried under a picture. A NEW visual re-appears on its own
  // because dismissal is keyed by the step that introduced it.
  const visual =
    stickyVisual && stickyVisual.key !== dismissedVisual && !narrationDone ? stickyVisual : null;

  // Manual tap on a step in the transcript — takes over from auto-narration.
  const playStep = (i: number) => {
    narrationRun.current += 1; // stop the streaming narration loop
    releaseContinue(); // never leave the explore wait (and its button) hanging
    // Clear any clarification pause too — a stale one would block the NEXT run
    // at its first checkpoint.
    resumeNarration();
    interruptedRef.current = false;
    setClarify("idle");
    setClarifyText(null);
    stopSpeaking();
    narratingRef.current = true;
    setActiveStep(i);
    // Replaying a step brings its picture back, even after the run ended or
    // the student closed it.
    setNarrationDone(false);
    setDismissedVisual(null);
    void speak(steps[i].say)
      .catch(() => {})
      .finally(() => {
        narratingRef.current = false;
      });
  };

  return (
    <main className="fixed inset-0 bg-[var(--ink)]">
      <CameraStage ref={stage} fullBleed>
        {/* Aids point at the paper; hide them while a visual covers it, or the
            student is directed at something they cannot see. */}
        {active && !visual && (
          <AidsOverlay region={active.region} aids={active.aids ?? []} />
        )}
        {/* The visual persists across later steps (keyed by the step that
            introduced it, so it does not remount and lose its state). The
            one-at-a-time rule still governs FORMULA cards — those are a glance
            and must not stack — but a visual may be narrated over for several
            steps while highlighting and pointing carry the rest. */}
        {visual && (
          <VisualCard
            key={`v${visual.key}`}
            visual={visual.visual}
            avoid={active?.region ?? null}
            onClose={() => setDismissedVisual(visual.key)}
          />
        )}
        {!visual && active?.formula && (
          <FormulaCard key={activeStep} formula={active.formula} region={active.region} />
        )}
        {/* Explore mode: the tutor has gone quiet and handed over. The button
            is the way back, so it sits clear of the panel and is unmissable. */}
        {awaitingContinue && clarifyState === "idle" && (
          <button
            onClick={releaseContinue}
            className="btn-accent press pointer-events-auto absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 px-5 py-2.5 text-sm font-semibold"
          >
            Next <ChevronRight size={17} />
          </button>
        )}

        {/* Clarification: the explanation is PAUSED, not restarted. The student
            can ask again, and taps Continue when they're ready to carry on. */}
        {clarifyState !== "idle" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 flex justify-center px-3">
            <div className="tool-sheet pointer-events-auto fadein w-full max-w-md rounded-[16px] px-4 py-3">
              <p className="paper-kicker mb-1">
                {clarifyState === "asking" ? "answering your question…" : "your question"}
              </p>
              {clarifyText && <p className="text-sm text-[var(--ink)]">{clarifyText}</p>}
              {clarifyState === "answered" && (
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    onClick={continueExplanation}
                    className="btn-accent press flex items-center gap-1.5 px-4 py-2 text-sm font-semibold"
                  >
                    Continue <ChevronRight size={16} />
                  </button>
                  <span className="mono-hint text-[11px]">or just ask another question</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CameraStage>

      {/* Top-left: back + title. */}
      <div className="absolute left-2 top-2 z-10 flex items-center gap-2">
        <Link
          href="/"
          className="tool-icon-button press flex h-9 w-9 items-center justify-center"
          aria-label="Back to home"
        >
          <ChevronLeft size={20} color="var(--ink)" />
        </Link>
        <span className="tool-badge px-3 py-1.5 text-sm font-semibold">
          AI Tutoring
        </span>
        {frame && (
          <button
            onClick={retake}
            className="tool-icon-button press flex h-9 w-9 items-center justify-center"
            aria-label="New photo"
          >
            <Camera size={18} color="var(--ink)" />
          </button>
        )}
      </div>

      {/* Thinking indicator floats over the camera. */}
      {busy && (
        <div className="absolute inset-x-0 top-16 z-10 flex justify-center">
          <div className="tool-status gap-2 px-4 py-2" role="status" aria-live="polite">
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
        <div className="tool-sheet mx-auto flex max-h-[54dvh] max-w-md flex-col gap-2 rounded-t-[22px] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto h-1 w-9 shrink-0 rounded-full bg-[var(--ink)] opacity-20" aria-hidden />
          {errorMsg && !busy && (
            <div className="fadein rounded-[10px] border-[1.5px] border-[var(--coral-deep)] bg-[color-mix(in_srgb,var(--coral)_12%,var(--paper-card))] p-2.5 text-sm">
              {errorMsg}
            </div>
          )}

          {steps.length > 0 && !busy && (
            <div className="flex min-h-0 flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="paper-kicker">
                  step {activeStep >= 0 ? activeStep + 1 : 1} of {steps.length} · watch the paper
                </span>
                <button
                  onClick={() => setShowText((v) => !v)}
                  className="tool-chip press flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium"
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
                        className={`settings-option w-full p-2.5 text-left text-sm ${
                          i === activeStep
                            ? "settings-option-selected border-[var(--yellow-deep)] bg-[color-mix(in_srgb,var(--yellow)_18%,var(--paper-card))]"
                            : ""
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
                      className={`press h-8 w-8 rounded-[8px] border-[1.5px] border-[var(--ink)] text-xs font-semibold shadow-[2px_2px_0_rgba(38,55,70,0.12)] ${
                        i === activeStep
                          ? "border-[var(--point)] bg-[var(--point)] text-white"
                          : "bg-[var(--paper-card)] text-[var(--ink)]"
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
              onKeyDown={(e) => e.key === "Enter" && void submitQuestion()}
              placeholder={
                clarifyState !== "idle"
                  ? "Ask a follow-up…"
                  : listening
                    ? "Just speak — or type here…"
                    : "Ask about the worksheet…"
              }
              className="paper-input min-w-0 flex-1 px-3.5 py-2.5 text-[15px] placeholder:text-[var(--ink-soft)]"
            />
            <button
              onClick={() => void toggleMic()}
              className={`tool-icon-button press flex h-11 w-11 items-center justify-center ${
                listening ? "bg-[var(--green-deep)] text-white" : "text-[var(--ink-soft)]"
              }`}
              aria-label={listening ? "Turn microphone off" : "Turn microphone on"}
              aria-pressed={listening}
            >
              {listening ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            <button
              onClick={() => void submitQuestion()}
              disabled={busy || !question.trim() || clarifyState === "asking"}
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
