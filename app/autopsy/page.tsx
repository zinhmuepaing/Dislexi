"use client";

/**
 * Stuck-Word Autopsy + Trace-to-Unlock (ARCHITECTURE.md §8).
 *
 * COMPLIANCE (§7 rules 3–4): NO LLM anywhere in the sound-out path, and
 * phonemes NEVER come from TTS — only the static pre-recorded bank at
 * /public/phonemes/{id}.mp3. TTS is used solely to blend the WHOLE word once
 * after the chunk sweep.
 *
 * Flow: tap word (or point) → speak that word only, log 'stuck_word' →
 * second tap → split OCR box into grapheme chunks (§7 rule 7 proportional
 * split) → sweep chunk-by-chunk playing static phonemes → blend whole word
 * via TTS → "now trace it" (announced aloud, §7 rule 6) → ~5 fps MediaPipe
 * loop verifies fingertip (landmark 8) inside word box with net left-to-right
 * motion → chime, log 'trace_complete' with grapheme.
 *
 * TODO(pipeline): word tap-selection from OCR blocks, grapheme chunking from
 * a published phonics scope-and-sequence, static phoneme playback timing,
 * MediaPipe trace verification loop, completion chime.
 */

import { useEffect, useRef, useState } from "react";
import { CameraStage, CameraStageHandle, CapturedFrame } from "@/components/CameraStage";
import { GraphemeSweep, GraphemeChunk } from "@/components/GraphemeSweep";
import { OcrBox } from "@/components/KaraokeHighlight";

export default function AutopsyPage() {
  const stage = useRef<CameraStageHandle>(null);
  const [frame, setFrame] = useState<CapturedFrame | null>(null);
  const [wordBox, setWordBox] = useState<OcrBox | null>(null);
  const [chunks] = useState<GraphemeChunk[]>([]); // e.g. ch–ar–ge, from the phonics sequence
  const [activeChunk] = useState(-1);
  const [status, setStatus] = useState("Tap Capture, then tap the word you're stuck on.");

  useEffect(() => {
    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "autopsy" }),
    }).catch(() => {});
  }, []);

  async function capture() {
    const captured = stage.current?.captureFrame();
    if (!captured) return;
    setFrame(captured);
    setStatus("Running OCR…");
    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: captured.base64 }),
      });
      const data = await res.json();
      setStatus(
        `Found ${data.blocks?.length ?? 0} blocks. ` +
          "TODO: tap a word → speak it once → second tap → grapheme sweep from the static phoneme bank → trace-to-unlock.",
      );
      setWordBox(data.blocks?.[0] ?? null); // placeholder: real flow selects the tapped word
    } catch {
      setStatus("OCR failed — try again.");
      stage.current?.unfreeze();
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">Stuck-Word Autopsy</h1>
      <CameraStage ref={stage} onError={setStatus}>
        {frame && wordBox && (
          <GraphemeSweep
            wordBox={wordBox}
            chunks={chunks}
            activeIndex={activeChunk}
            frameWidth={frame.width}
            frameHeight={frame.height}
          />
        )}
      </CameraStage>
      <button
        onClick={capture}
        className="rounded-xl bg-amber-500 p-4 text-lg font-semibold text-white active:scale-95"
      >
        Capture
      </button>
      <p className="text-sm opacity-70">{status}</p>
    </main>
  );
}
