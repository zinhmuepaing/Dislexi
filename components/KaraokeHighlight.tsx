"use client";

/**
 * KaraokeHighlight — word-level highlight sync during verbatim TTS
 * (ARCHITECTURE.md §5.4, §7 rules 5 & 7).
 *
 * OCR blocks are line/phrase-level; word sub-boxes are derived by
 * proportional character-count split of the block's box width (§7 rule 7 —
 * known approximation, acceptable). The Azure Speech SDK's `wordBoundary`
 * event (textOffset/wordLength) selects the active word — that event is the
 * ENTIRE sync mechanism; no timing estimator (§5.4).
 *
 * TODO: wire to microsoft-cognitiveservices-speech-sdk in the exam-prep page:
 *   SpeechConfig.fromAuthorizationToken(token, region) via GET /api/azure-token,
 *   synthesizer.wordBoundary -> setActiveCharRange(e.textOffset, e.wordLength).
 */

export interface OcrBox {
  /** Four corners, clockwise from top-left, pixel coords of the frozen frame. */
  box: [number, number][];
  text: string;
}

interface KaraokeHighlightProps {
  block: OcrBox;
  /** Character range of the word currently being spoken (from wordBoundary). */
  activeCharStart: number;
  activeCharLength: number;
  /** Frozen-frame dimensions, to position as % within the overlay. */
  frameWidth: number;
  frameHeight: number;
}

/** Proportional character-count split: sub-box of the block for [start, start+len). */
export function subBoxFor(
  block: OcrBox,
  charStart: number,
  charLength: number,
): { x: number; y: number; w: number; h: number } {
  const xs = block.box.map(([x]) => x);
  const ys = block.box.map(([, y]) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(...xs) - left;
  const height = Math.max(...ys) - top;

  const total = Math.max(1, block.text.length);
  const startFrac = Math.min(1, charStart / total);
  const lenFrac = Math.min(1 - startFrac, charLength / total);

  return { x: left + width * startFrac, y: top, w: width * lenFrac, h: height };
}

export function KaraokeHighlight({
  block,
  activeCharStart,
  activeCharLength,
  frameWidth,
  frameHeight,
}: KaraokeHighlightProps) {
  if (activeCharLength <= 0 || frameWidth <= 0 || frameHeight <= 0) return null;
  const r = subBoxFor(block, activeCharStart, activeCharLength);
  return (
    <div
      className="absolute rounded-sm bg-yellow-300/50 outline outline-2 outline-yellow-400 transition-all duration-75"
      style={{
        left: `${(r.x / frameWidth) * 100}%`,
        top: `${(r.y / frameHeight) * 100}%`,
        width: `${(r.w / frameWidth) * 100}%`,
        height: `${(r.h / frameHeight) * 100}%`,
      }}
    />
  );
}
