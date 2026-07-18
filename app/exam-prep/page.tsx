"use client";

/**
 * Exam-Prep Mode — deterministic literal reading (ARCHITECTURE.md §8).
 *
 * COMPLIANCE (§7 rule 3, amended 2026-07-18 + #2 2026-07-19): OCR → verbatim
 * TTS only. The string sent to TTS is the OCR text VERBATIM. The LLM appears
 * only as (a) voice-COMMAND interpreter and (b) VISUAL POINTER — it decides
 * WHICH action / WHERE the finger is, never WHAT text is spoken.
 *
 * Pointing flow (2026-07-19 — replaces MediaPipe, which can't parse the
 * back-of-hand view the mirror-clip camera sees): enter → mic on (endless,
 * silence-chunked; §7 rule 8 transcripts only) → camera ready → AUTO scan
 * (OCR, preview stays live) → say "read this" (or tap Read this) → capture a
 * frame → POST /api/point (vision model returns the fingertip) → map to the
 * nearest OCR word (selectWordAt) → read it verbatim with karaoke highlight →
 * log 'read'/'reread' → … → end session → stats.
 *
 * The MediaPipe implementation is preserved in lib/hand-tracker.ts for revert
 * (selectWordAt is reused; the continuous dwell loop is simply not started).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CameraStage, CameraStageHandle, CapturedFrame } from "@/components/CameraStage";
import { KaraokeHighlight, OcrBox, rectForRange } from "@/components/KaraokeHighlight";
import { selectWordAt, Point } from "@/lib/hand-tracker";
import { speak, stopSpeaking, announce, primeSpeech } from "@/lib/speech";
import { installAudioUnlock } from "@/lib/audio";
import { SessionLogger } from "@/lib/event-queue";
import { buildSentences, buildParagraphs, Sentence, localWordAt } from "@/lib/sentences";
import { resolveVoiceCommand, ReadScope } from "@/lib/voice-commands";
import { startVoiceListener, VoiceListener } from "@/lib/stt";

interface OcrResponse {
  blocks: OcrBox[];
}

interface Scan {
  frame: CapturedFrame;
  blocks: OcrBox[];
}

interface Selectable extends OcrBox {
  unit: number;
}

interface UnitSet {
  units: Sentence[];
  selectables: Selectable[];
}

const SCAN_SETTLE_MS = 900;
const SCOPE_KEY = "dislexi.readScope";
const SCOPES: { id: ReadScope; label: string }[] = [
  { id: "word", label: "Word" },
  { id: "sentence", label: "Sentence" },
  { id: "paragraph", label: "Paragraph" },
];

/** Word units — real OCR word boxes when available (accurate), else split. */
function wordUnits(blocks: OcrBox[]): Sentence[] {
  const units: Sentence[] = [];
  blocks.forEach((block, blockIndex) => {
    if (block.words && block.words.length > 0) {
      for (const w of block.words) {
        units.push({
          blocks: [{ text: w.text, box: w.box }],
          blockIndices: [blockIndex],
          text: w.text,
          ranges: [{ start: 0, end: w.text.length }],
        });
      }
      return;
    }
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block.text))) {
      const r = rectForRange(block, m.index, m[0].length);
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
    if (unitOfBlock[bi] !== undefined) selectables.push({ text: b.text, box: b.box, unit: unitOfBlock[bi] });
  });
  return { units, selectables };
}

function boxRect(box: [number, number][]) {
  const xs = box.map(([x]) => x);
  const ys = box.map(([, y]) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, w: Math.max(...xs) - left, h: Math.max(...ys) - top };
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
  const lastReadRef = useRef<Sentence | null>(null);
  const listenerRef = useRef<VoiceListener | null>(null);
  const autoScanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [scan, setScan] = useState<Scan | null>(null);
  const [scope, setScope] = useState<ReadScope>("sentence");
  const [selectables, setSelectables] = useState<Selectable[]>([]);
  const [located, setLocated] = useState<Point | null>(null);
  const [pickedBox, setPickedBox] = useState<[number, number][] | null>(null);
  const [selected, setSelected] = useState<OcrBox | null>(null);
  const [activeChar, setActiveChar] = useState<{ start: number; len: number }>({ start: 0, len: 0 });
  const [status, setStatus] = useState("Starting camera…");
  const [listening, setListening] = useState(false);
  const [finding, setFinding] = useState(false);

  function rebuildUnits() {
    const current = scanRef.current;
    if (!current) return;
    unitsRef.current = computeUnits(current.blocks, scopeRef.current);
    setSelectables(unitsRef.current.selectables);
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
    if (scanRef.current) setStatus(`Reading by ${next}. Point and say “read this”.`);
  }

  async function rescan() {
    if (scanningRef.current) return;
    scanningRef.current = true;
    stopSpeaking();
    busyRef.current = false;
    scanRef.current = null;
    unitsRef.current = { units: [], selectables: [] };
    setScan(null);
    setSelectables([]);
    setSelected(null);
    setPickedBox(null);
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
      const data = (await res.json()) as OcrResponse;
      const blocks = data.blocks ?? [];
      if (blocks.length === 0) {
        setStatus("No text found — lay the worksheet flat and tap Rescan.");
        return;
      }
      scanRef.current = { frame: captured, blocks };
      setScan(scanRef.current);
      rebuildUnits();
      setStatus(`Reading by ${scopeRef.current}. Point and say “read this”.`);
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

  async function readUnit(unit: Sentence) {
    const gen = ++readGen.current;
    busyRef.current = true;
    lastReadRef.current = unit;
    setPickedBox(unit.blocks[0]?.box ?? null);
    setSelected(unit.blocks[0] ?? null);
    setActiveChar({ start: 0, len: 0 });
    const reread = spokenTexts.current.has(unit.text);
    spokenTexts.current.add(unit.text);
    logger.current?.log({ type: reread ? "reread" : "read", word: unit.text });
    setStatus(`Reading: “${unit.text.length > 80 ? `${unit.text.slice(0, 77)}…` : unit.text}”`);

    try {
      // VERBATIM: unit.text is the member lines' OCR text, untouched (§5.4).
      await speak(unit.text, {
        onWordBoundary: (start, len) => {
          if (readGen.current !== gen) return;
          const w = localWordAt(unit, start, len);
          if (!w) return;
          setSelected(unit.blocks[w.memberIndex]);
          setActiveChar({ start: w.localStart, len: w.localLength });
        },
      });
      if (readGen.current === gen) setStatus(`Reading by ${scopeRef.current}. Point and say “read this”.`);
    } catch (err) {
      console.error("TTS failed:", err);
      if (readGen.current === gen) setStatus("Speech failed — check the connection and try again.");
    }
    if (readGen.current === gen) {
      setSelected(null);
      setPickedBox(null);
      setActiveChar({ start: 0, len: 0 });
      busyRef.current = false;
    }
  }

  /** Capture a frame, locate the fingertip via the vision model, read its word. */
  async function readViaPointer(scopeOverride?: ReadScope) {
    const current = scanRef.current;
    if (!current || finding) return;
    if (busyRef.current) {
      stopSpeaking();
      busyRef.current = false;
    }
    if (scopeOverride && scopeOverride !== scopeRef.current) applyScope(scopeOverride);

    setFinding(true);
    setLocated(null);
    setStatus("Finding your finger…");
    try {
      const shot = stage.current?.captureFrame({ freeze: false });
      if (!shot) {
        setStatus("Camera not ready — try again.");
        return;
      }
      const res = await fetch("/api/point", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: shot.base64 }),
      });
      const data = (await res.json()) as { found?: boolean; x?: number; y?: number };
      if (!data.found || typeof data.x !== "number" || typeof data.y !== "number") {
        setStatus("I couldn’t see your finger — point clearly at a word and try again.");
        return;
      }
      setLocated({ x: data.x, y: data.y });
      const sel = selectWordAt(
        { x: data.x * current.frame.width, y: data.y * current.frame.height },
        unitsRef.current.selectables,
      );
      const unit = sel ? unitsRef.current.units[sel.unit] : null;
      if (!unit) {
        setStatus("You’re pointing at a blank area — point at a word.");
        return;
      }
      await readUnit(unit);
    } catch (err) {
      console.error("pointer read failed:", err);
      setStatus("Something went wrong — try again.");
    } finally {
      setFinding(false);
    }
  }

  async function handleUtterance(text: string) {
    const cmd = await resolveVoiceCommand(text);
    if (finding && cmd.intent !== "stop") return;
    switch (cmd.intent) {
      case "read":
        void readViaPointer(cmd.scope);
        break;
      case "set_scope":
        if (cmd.scope) {
          applyScope(cmd.scope);
          announce(`Reading by ${cmd.scope}.`);
        }
        break;
      case "repeat":
        if (lastReadRef.current) void readUnit(lastReadRef.current);
        break;
      case "stop":
        stopSpeaking();
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
      setStatus("Mic unavailable — use the Read this button.");
    }
  }

  useEffect(() => {
    announce("Session logging started."); // §7 rule 6
    installAudioUnlock();
    primeSpeech();
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
    const micStart = setTimeout(() => void toggleMic(), 0);

    return () => {
      clearTimeout(scopeRestore);
      clearTimeout(micStart);
      listenerRef.current?.stop();
      listenerRef.current = null;
      stopSpeaking();
      if (autoScanTimer.current) clearTimeout(autoScanTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function endSession() {
    listenerRef.current?.stop();
    listenerRef.current = null;
    stopSpeaking();
    const l = logger.current;
    const sessionId = l?.sessionId;
    await l?.end();
    if (sessionId) router.push(`/stats/${sessionId}`);
    else setStatus("Session ended (logging was unavailable — no stats).");
  }

  const frameW = scan?.frame.width ?? 1;
  const frameH = scan?.frame.height ?? 1;

  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col gap-2 overflow-hidden p-3">
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Link href="/" className="btn btn-ghost !px-2.5 !py-1 text-sm" aria-label="Back to features">
          ←
        </Link>
        <h1 className="font-display text-lg font-extrabold">Exam-Prep</h1>
        <span className="stamp stamp-det">Reads verbatim</span>
      </header>

      <CameraStage
        ref={stage}
        onError={setStatus}
        onReady={scheduleAutoScan}
        maxHeightClass="max-h-[56dvh]"
        onSourceChange={() => {
          scanRef.current = null;
          setScan(null);
          setPickedBox(null);
          scheduleAutoScan();
        }}
      >
        {/* Faint word/line guides — accurate boxes; degenerate ones skipped (S4). */}
        {scan &&
          !pickedBox &&
          selectables.map((s, i) => {
            const r = boxRect(s.box);
            if (r.w < 3 || r.h < 3) return null;
            return (
              <div
                key={i}
                className="absolute rounded-sm outline-dashed outline-1 outline-[rgba(236,77,37,0.35)]"
                style={{
                  left: `${(r.left / frameW) * 100}%`,
                  top: `${(r.top / frameH) * 100}%`,
                  width: `${(r.w / frameW) * 100}%`,
                  height: `${(r.h / frameH) * 100}%`,
                }}
              />
            );
          })}

        {/* Picked unit outline (before the karaoke highlight starts). */}
        {scan &&
          pickedBox &&
          (() => {
            const r = boxRect(pickedBox);
            if (r.w < 3 || r.h < 3) return null;
            return (
              <div
                className="absolute rounded-sm outline outline-2 outline-[var(--point)]"
                style={{
                  left: `${(r.left / frameW) * 100}%`,
                  top: `${(r.top / frameH) * 100}%`,
                  width: `${(r.w / frameW) * 100}%`,
                  height: `${(r.h / frameH) * 100}%`,
                }}
              />
            );
          })()}

        {/* Karaoke highlight (yellow) while reading. */}
        {scan && selected && (
          <KaraokeHighlight
            block={selected}
            activeCharStart={activeChar.start}
            activeCharLength={activeChar.len}
            frameWidth={frameW}
            frameHeight={frameH}
          />
        )}

        {/* Located fingertip dot (from the vision model). */}
        {located && (
          <div
            className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--point)] shadow"
            style={{ left: `${located.x * 100}%`, top: `${located.y * 100}%` }}
          />
        )}

        {finding && (
          <div className="absolute inset-x-0 bottom-0 flex justify-center pb-2">
            <span className="chip chip-mic !bg-white/95 !py-1 !text-[11px]">finding your finger…</span>
          </div>
        )}
      </CameraStage>

      {/* Reading scope + mic */}
      <div className="flex flex-wrap items-center gap-1.5">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            onClick={() => applyScope(s.id)}
            className={`chip !py-1 !text-[12px] ${scope === s.id ? "!bg-[var(--hl)] font-semibold" : "!bg-white"}`}
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

      <button
        onClick={() => void readViaPointer()}
        disabled={finding || !scan}
        className="btn btn-hl w-full !py-3 text-base"
      >
        {finding ? "Finding your finger…" : "👉 Read what I’m pointing at"}
      </button>

      <div className="mt-auto flex items-center gap-2">
        <button onClick={() => void rescan()} className="btn btn-ghost flex-1 !py-2 text-sm">
          ⟳ Rescan
        </button>
        <button onClick={() => void endSession()} className="btn btn-ink flex-1 !py-2 text-sm">
          End session
        </button>
      </div>
      <p className="mono-hint text-center leading-snug">{status}</p>
    </main>
  );
}
