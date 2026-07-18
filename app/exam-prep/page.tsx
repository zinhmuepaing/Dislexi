"use client";

/**
 * Exam-Prep Mode — deterministic literal reading (ARCHITECTURE.md §8).
 *
 * COMPLIANCE GUARANTEE (§7 rule 3, amended 2026-07-18): the flow is OCR →
 * verbatim TTS only. The string sent to TTS is the OCR text VERBATIM — no
 * model may generate, rewrite, or filter it. The LLM appears ONLY as a voice
 * COMMAND interpreter (lib/voice-commands.ts fast-path first, then
 * /api/voice-command) — it decides WHAT deterministic action runs, never
 * WHAT text is spoken.
 *
 * Point-to-read flow: enter → mic starts (endless, silence-chunked; §7 rule
 * 8: transcripts only, no audio kept) → camera ready → AUTO scan (one frame,
 * preview stays live) → POST /api/ocr → continuous pointer loop → dwell on a
 * unit → Speech SDK reads it verbatim with karaoke highlight → log
 * 'read'/'reread' → … → end session → stats page.
 *
 * Reading SCOPE is selectable (chips or voice): word · sentence (default) ·
 * paragraph. All scopes produce Sentence-shaped units (lib/sentences.ts), so
 * reading/karaoke code is identical across scopes.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CameraStage, CameraStageHandle, CapturedFrame } from "@/components/CameraStage";
import { KaraokeHighlight, OcrBox, subBoxFor } from "@/components/KaraokeHighlight";
import { selectWordAt, startFingerLoop, DwellTracker, Point } from "@/lib/hand-tracker";
import { speak, stopSpeaking, announce, primeSpeech } from "@/lib/speech";
import { installAudioUnlock } from "@/lib/audio";
import { SessionLogger } from "@/lib/event-queue";
import {
  buildSentences,
  buildParagraphs,
  Sentence,
  localWordAt,
} from "@/lib/sentences";
import { resolveVoiceCommand, ReadScope } from "@/lib/voice-commands";
import { startVoiceListener, VoiceListener } from "@/lib/stt";

interface OcrResponse {
  blocks: { text: string; confidence: number; box: [number, number][] }[];
}

interface Scan {
  frame: CapturedFrame;
  blocks: OcrBox[];
}

/** A pointable box mapped to the reading unit it belongs to. */
interface Selectable extends OcrBox {
  unit: number;
}

interface UnitSet {
  units: Sentence[];
  selectables: Selectable[];
}

const SCAN_SETTLE_MS = 900; // let autoexposure settle before the auto-scan
const SCOPE_KEY = "dislexi.readScope";
const SCOPES: { id: ReadScope; label: string }[] = [
  { id: "word", label: "Word" },
  { id: "sentence", label: "Sentence" },
  { id: "paragraph", label: "Paragraph" },
];

/** Word units: each word of each line becomes its own Sentence-shaped unit. */
function wordUnits(blocks: OcrBox[]): Sentence[] {
  const units: Sentence[] = [];
  blocks.forEach((block, blockIndex) => {
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block.text))) {
      const r = subBoxFor(block, m.index, m[0].length);
      units.push({
        blocks: [
          {
            text: m[0],
            box: [
              [r.x, r.y],
              [r.x + r.w, r.y],
              [r.x + r.w, r.y + r.h],
              [r.x, r.y + r.h],
            ],
          },
        ],
        blockIndices: [blockIndex],
        text: m[0],
        ranges: [{ start: 0, end: m[0].length }],
      });
    }
  });
  return units;
}

function computeUnits(blocks: OcrBox[], scope: ReadScope): UnitSet {
  if (scope === "word") {
    const units = wordUnits(blocks);
    return {
      units,
      selectables: units.map((u, i) => ({ text: u.text, box: u.blocks[0].box, unit: i })),
    };
  }
  const units = scope === "sentence" ? buildSentences(blocks) : buildParagraphs(blocks);
  const unitOfBlock: number[] = [];
  units.forEach((u, ui) => u.blockIndices.forEach((bi) => (unitOfBlock[bi] = ui)));
  const selectables: Selectable[] = [];
  blocks.forEach((b, bi) => {
    if (unitOfBlock[bi] !== undefined) {
      selectables.push({ text: b.text, box: b.box, unit: unitOfBlock[bi] });
    }
  });
  return { units, selectables };
}

export default function ExamPrepPage() {
  const router = useRouter();
  const stage = useRef<CameraStageHandle>(null);
  const logger = useRef<SessionLogger | null>(null);
  const spokenTexts = useRef<Set<string>>(new Set());
  const busyRef = useRef(false);
  const readGen = useRef(0);
  const scanRef = useRef<Scan | null>(null);
  const unitsRef = useRef<UnitSet>({ units: [], selectables: [] });
  const scopeRef = useRef<ReadScope>("sentence");
  const scanningRef = useRef(false);
  const hoverRef = useRef<number | null>(null);
  const lastTipRef = useRef<Point | null>(null);
  const lastReadRef = useRef<Sentence | null>(null);
  const dwellRef = useRef<DwellTracker>(new DwellTracker(300, 250, 500));
  const stopLoopRef = useRef<(() => void) | null>(null);
  const listenerRef = useRef<VoiceListener | null>(null);
  const autoScanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [scan, setScan] = useState<Scan | null>(null);
  const [scope, setScope] = useState<ReadScope>("sentence");
  const [selectables, setSelectables] = useState<Selectable[]>([]);
  const [tip, setTip] = useState<Point | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [dwellProgress, setDwellProgress] = useState(0);
  const [selected, setSelected] = useState<OcrBox | null>(null);
  const [activeChar, setActiveChar] = useState<{ start: number; len: number }>({ start: 0, len: 0 });
  const [status, setStatus] = useState("Starting camera…");
  const [listening, setListening] = useState(false);

  function stopLoop() {
    stopLoopRef.current?.();
    stopLoopRef.current = null;
  }

  function rebuildUnits() {
    const current = scanRef.current;
    if (!current) return;
    const set = computeUnits(current.blocks, scopeRef.current);
    unitsRef.current = set;
    setSelectables(set.selectables);
    dwellRef.current = new DwellTracker(300, 250, 500);
    hoverRef.current = null;
    setHover(null);
    setDwellProgress(0);
  }

  function applyScope(next: ReadScope) {
    scopeRef.current = next;
    setScope(next);
    try {
      localStorage.setItem(SCOPE_KEY, next);
    } catch {
      /* private mode */
    }
    rebuildUnits();
    if (scanRef.current) {
      setStatus(`Reading by ${next} — point and hold still.`);
    }
  }

  function startLoop() {
    stopLoop();
    dwellRef.current = new DwellTracker(300, 250, 500);
    stopLoopRef.current = startFingerLoop({
      getCanvas: () => stage.current?.getCanvas() ?? null,
      onSample: (sample) => {
        setTip(sample);
        lastTipRef.current = sample;
        const current = scanRef.current;
        if (!current) return;
        if (busyRef.current) {
          setHover(null);
          setDwellProgress(0);
          return;
        }
        let key: string | null = null;
        if (sample) {
          const sel = selectWordAt(
            { x: sample.x * current.frame.width, y: sample.y * current.frame.height },
            unitsRef.current.selectables,
          );
          if (sel) key = String(sel.unit);
        }
        const res = dwellRef.current.update(key, performance.now());
        const hoverIdx = res.hover === null ? null : Number(res.hover);
        hoverRef.current = hoverIdx;
        setHover(hoverIdx);
        setDwellProgress(res.progress);
        if (res.fired !== null) {
          const unit = unitsRef.current.units[Number(res.fired)];
          if (unit) void readUnit(unit);
        }
      },
    });
  }

  async function rescan() {
    if (scanningRef.current) return;
    scanningRef.current = true;
    stopLoop();
    stopSpeaking();
    busyRef.current = false;
    scanRef.current = null;
    unitsRef.current = { units: [], selectables: [] };
    setScan(null);
    setSelectables([]);
    setSelected(null);
    setHover(null);
    setDwellProgress(0);
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
      const data = (await res.json()) as OcrResponse;
      const blocks = data.blocks ?? [];
      if (blocks.length === 0) {
        setStatus("No text found — lay the worksheet flat and tap Rescan.");
        return;
      }
      scanRef.current = { frame: captured, blocks };
      setScan(scanRef.current);
      rebuildUnits();
      setStatus(`Reading by ${scopeRef.current} — point and hold still.`);
      startLoop();
    } catch (err) {
      console.error(err);
      setStatus("Scanning failed — tap Rescan to try again.");
    } finally {
      scanningRef.current = false;
    }
  }

  function scheduleAutoScan() {
    if (autoScanTimer.current) clearTimeout(autoScanTimer.current);
    autoScanTimer.current = setTimeout(() => {
      if (!scanRef.current && !scanningRef.current) void rescan();
    }, SCAN_SETTLE_MS);
  }

  async function readUnit(unit: Sentence, force = false) {
    if (busyRef.current && !force) return;
    if (force) stopSpeaking();
    const gen = ++readGen.current;
    busyRef.current = true;
    lastReadRef.current = unit;
    setSelected(unit.blocks[0] ?? null);
    setActiveChar({ start: 0, len: 0 });
    const reread = spokenTexts.current.has(unit.text);
    spokenTexts.current.add(unit.text);
    logger.current?.log({ type: reread ? "reread" : "read", word: unit.text });
    setStatus(`Reading: “${unit.text.length > 80 ? `${unit.text.slice(0, 77)}…` : unit.text}”`);

    try {
      // VERBATIM: unit.text is the member lines' OCR text concatenated
      // untouched — no rewriting layer between OCR and TTS (§5.4, rule 3).
      await speak(unit.text, {
        onWordBoundary: (start, len) => {
          if (readGen.current !== gen) return;
          const w = localWordAt(unit, start, len);
          if (!w) return;
          setSelected(unit.blocks[w.memberIndex]);
          setActiveChar({ start: w.localStart, len: w.localLength });
        },
      });
      if (readGen.current === gen) {
        setStatus(`Reading by ${scopeRef.current} — point and hold still.`);
      }
    } catch (err) {
      console.error("TTS failed:", err);
      if (readGen.current === gen) setStatus("Speech failed — check the connection and point again.");
    }
    if (readGen.current === gen) {
      setSelected(null);
      setActiveChar({ start: 0, len: 0 });
      busyRef.current = false;
    }
  }

  /** Read whatever the finger points at RIGHT NOW (voice command / no dwell). */
  function readPointed(scopeOverride?: ReadScope) {
    const current = scanRef.current;
    if (!current) return;
    if (scopeOverride && scopeOverride !== scopeRef.current) applyScope(scopeOverride);
    const tipNow = lastTipRef.current;
    if (!tipNow) {
      setStatus("Point your finger at the page first.");
      return;
    }
    const sel = selectWordAt(
      { x: tipNow.x * current.frame.width, y: tipNow.y * current.frame.height },
      unitsRef.current.selectables,
    );
    const unit = sel ? unitsRef.current.units[sel.unit] : null;
    if (!unit) {
      setStatus("Point at the text and try again.");
      return;
    }
    void readUnit(unit, true);
  }

  /** Voice command dispatch (intent only — amended rule 3). */
  async function handleUtterance(text: string) {
    const cmd = await resolveVoiceCommand(text);
    // While TTS is playing, the mic hears the app's own voice — only an
    // explicit "stop" gets through, everything else is ignored.
    if (busyRef.current && cmd.intent !== "stop") return;
    switch (cmd.intent) {
      case "read":
        readPointed(cmd.scope);
        break;
      case "set_scope":
        if (cmd.scope) {
          applyScope(cmd.scope);
          announce(`Reading by ${cmd.scope}.`);
        }
        break;
      case "repeat": {
        const last = lastReadRef.current;
        if (last) void readUnit(last, true);
        break;
      }
      case "stop":
        stopSpeaking();
        break;
      case "rescan":
        void rescan();
        break;
      default:
        break; // none / stuck_word: not an exam-prep action
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

  useEffect(() => {
    announce("Session logging started."); // mode entry announced aloud (§7 rule 6)
    installAudioUnlock();
    primeSpeech();
    // Restore the persisted scope AFTER hydration (deferred: no sync setState
    // in the effect body, and the server-rendered default stays consistent).
    const scopeRestore = setTimeout(() => {
      try {
        const stored = localStorage.getItem(SCOPE_KEY) as ReadScope | null;
        if (stored === "word" || stored === "paragraph") {
          scopeRef.current = stored;
          setScope(stored);
        }
      } catch {
        /* private mode */
      }
    }, 0);
    SessionLogger.start("exam_prep").then((l) => {
      logger.current = l;
      if (!l.enabled) setStatus((s) => `${s} (logging unavailable)`);
    });
    // Endless mic starts on entry (prompts for permission immediately);
    // the chip toggles it off/on. Transcripts only — no audio kept (rule 8).
    const micStart = setTimeout(() => void toggleMic(), 0);

    return () => {
      clearTimeout(scopeRestore);
      clearTimeout(micStart);
      listenerRef.current?.stop();
      listenerRef.current = null;
      stopLoop();
      stopSpeaking();
      if (autoScanTimer.current) clearTimeout(autoScanTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function endSession() {
    listenerRef.current?.stop();
    listenerRef.current = null;
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

  const frameW = scan?.frame.width ?? 1;
  const frameH = scan?.frame.height ?? 1;
  // Last selectable of the hovered unit carries the dwell progress bar.
  const lastOfHover =
    hover === null
      ? -1
      : selectables.reduce((acc, s, i) => (s.unit === hover ? i : acc), -1);

  return (
    // h-dvh + capped camera: every control fits the phone viewport, no scroll.
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col gap-2.5 overflow-y-auto p-3">
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Link href="/" className="btn btn-ghost !px-2.5 !py-1 text-sm" aria-label="Back to features">
          ←
        </Link>
        <h1 className="font-display text-lg font-extrabold">Exam-Prep Mode</h1>
        <span className="stamp stamp-det">Reads verbatim — no AI voice</span>
      </header>

      <CameraStage
        ref={stage}
        onError={setStatus}
        onReady={scheduleAutoScan}
        onSourceChange={() => {
          scanRef.current = null;
          setScan(null);
          setSelectables([]);
          stopLoop();
          scheduleAutoScan();
        }}
      >
        {/* Pointable outlines; hover lights every box of the pointed unit. */}
        {scan &&
          selectables.map((s, i) => {
            const xs = s.box.map(([x]) => x);
            const ys = s.box.map(([, y]) => y);
            const left = Math.min(...xs);
            const top = Math.min(...ys);
            const w = Math.max(...xs) - left;
            const h = Math.max(...ys) - top;
            const isHover = hover !== null && s.unit === hover;
            return (
              <div
                key={i}
                className={`absolute rounded-sm transition-colors duration-150 ${
                  isHover
                    ? "bg-[rgba(255,211,77,0.35)] outline outline-2 outline-[var(--hl-strong)]"
                    : "outline-dashed outline-1 outline-[rgba(43,108,176,0.55)]"
                }`}
                style={{
                  left: `${(left / frameW) * 100}%`,
                  top: `${(top / frameH) * 100}%`,
                  width: `${(w / frameW) * 100}%`,
                  height: `${(h / frameH) * 100}%`,
                }}
              >
                {i === lastOfHover && dwellProgress > 0 && (
                  <div
                    className="absolute -bottom-1 left-0 h-[3px] rounded bg-[var(--hl-strong)]"
                    style={{ width: `${dwellProgress * 100}%` }}
                  />
                )}
              </div>
            );
          })}

        {/* Karaoke highlight while reading. */}
        {scan && selected && (
          <KaraokeHighlight
            block={selected}
            activeCharStart={activeChar.start}
            activeCharLength={activeChar.len}
            frameWidth={frameW}
            frameHeight={frameH}
          />
        )}

        {/* Pointed-spot dot (the exact point that selects). */}
        {tip && (
          <div
            className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--pen)] shadow"
            style={{ left: `${tip.x * 100}%`, top: `${tip.y * 100}%` }}
          />
        )}
      </CameraStage>

      {/* Reading scope + mic */}
      <div className="flex flex-wrap items-center gap-1.5">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            onClick={() => applyScope(s.id)}
            className={`chip !py-1 !text-[12px] ${
              scope === s.id ? "!bg-[var(--hl)] font-semibold" : "!bg-white"
            }`}
            aria-pressed={scope === s.id}
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={() => void toggleMic()}
          className={`chip ml-auto !py-1 !text-[12px] ${listening ? "chip-mic" : "chip-off"}`}
          aria-pressed={listening}
        >
          {listening ? "mic on" : "mic off"}
        </button>
      </div>

      <div className="flex gap-2">
        <button onClick={() => void rescan()} className="btn btn-hl flex-1 !py-2.5 text-base">
          ⟳ Rescan page
        </button>
        <button onClick={() => void endSession()} className="btn btn-ink flex-1 !py-2.5 text-base">
          End session
        </button>
      </div>

      <div className="card flex min-h-0 flex-col gap-1 overflow-y-auto p-2.5">
        <p className="text-sm leading-snug text-[var(--ink)]">{status}</p>
        <p className="mono-hint">
          point just under the {scope} · hold still to hear it · or say “read this {scope}”
        </p>
      </div>
    </main>
  );
}
