"use client";

/**
 * GraphemeSweep — chunk-by-chunk sound-out highlight for the Stuck-Word
 * Autopsy (ARCHITECTURE.md §8 Autopsy flow, §7 rules 3, 4, 7).
 *
 * The word's OCR box is split proportionally by grapheme character counts
 * (§7 rule 7). The active chunk is highlighted while its phoneme plays from
 * the STATIC audio bank at /public/phonemes/{id}.mp3 — NEVER TTS for isolated
 * phonemes (§7 rule 4: neural TTS hallucinates a schwa on isolated plosives,
 * which is pedagogically harmful). No LLM anywhere in this path (§7 rule 3).
 *
 * The autopsy page drives `activeIndex`, playing each chunk's static phoneme
 * clip, then blends the whole word via TTS and runs the trace-to-unlock loop.
 */

import { subBoxFor, OcrBox } from "./KaraokeHighlight";

export interface GraphemeChunk {
  /** The grapheme text, e.g. "ch", "ar", "ge". */
  text: string;
  /** Static bank file id → /public/phonemes/{phonemeId}.mp3 */
  phonemeId: string;
}

interface GraphemeSweepProps {
  wordBox: OcrBox;
  chunks: GraphemeChunk[];
  /** Index of the chunk currently sounding out; -1 for none. */
  activeIndex: number;
  frameWidth: number;
  frameHeight: number;
}

export function GraphemeSweep({
  wordBox,
  chunks,
  activeIndex,
  frameWidth,
  frameHeight,
}: GraphemeSweepProps) {
  if (frameWidth <= 0 || frameHeight <= 0) return null;

  const starts: number[] = [];
  let charStart = 0;
  for (const chunk of chunks) {
    starts.push(charStart);
    charStart += chunk.text.length;
  }

  return (
    <>
      {chunks.map((chunk, i) => {
        const r = subBoxFor(wordBox, starts[i], chunk.text.length);
        const active = i === activeIndex;
        return (
          <div
            key={i}
            className={`absolute rounded-sm transition-all duration-150 ${
              active
                ? "bg-sky-400/60 outline outline-2 outline-sky-500"
                : "bg-sky-200/20"
            }`}
            style={{
              left: `${(r.x / frameWidth) * 100}%`,
              top: `${(r.y / frameHeight) * 100}%`,
              width: `${(r.w / frameWidth) * 100}%`,
              height: `${(r.h / frameHeight) * 100}%`,
            }}
          />
        );
      })}
    </>
  );
}
