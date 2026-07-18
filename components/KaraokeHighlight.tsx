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
 * Driven by lib/speech.ts speak() wordBoundary callbacks (see exam-prep page).
 */

export interface OcrWordBox {
  text: string;
  box: [number, number][];
}

export interface OcrBox {
  /** Four corners, clockwise from top-left, pixel coords of the frozen frame. */
  box: [number, number][];
  text: string;
  /** Word-level boxes when the OCR vendor provides them (Azure). */
  words?: OcrWordBox[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectOfPoints(pts: [number, number][]): Rect {
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Char span [start,end) of each word within the line text (in reading order). */
function wordSpans(text: string, words: OcrWordBox[]): { start: number; end: number; box: [number, number][] }[] {
  const spans: { start: number; end: number; box: [number, number][] }[] = [];
  let cursor = 0;
  for (const w of words) {
    const idx = text.indexOf(w.text, cursor);
    if (idx < 0) continue;
    spans.push({ start: idx, end: idx + w.text.length, box: w.box });
    cursor = idx + w.text.length;
  }
  return spans;
}

/**
 * Accurate box for a char range: the UNION of the real word boxes it overlaps
 * when the block carries word-level geometry (Azure), else the proportional
 * char-count split. Real word boxes fix the "highlight drifts one char and
 * trails blank space" error the proportional approximation causes on
 * variable-width fonts (§7 rule 7 was a known approximation).
 */
export function rectForRange(block: OcrBox, charStart: number, charLength: number): Rect {
  if (block.words && block.words.length > 0) {
    const end = charStart + charLength;
    const hit = wordSpans(block.text, block.words).filter((s) => s.start < end && s.end > charStart);
    if (hit.length > 0) {
      const rects = hit.map((s) => rectOfPoints(s.box));
      const left = Math.min(...rects.map((r) => r.x));
      const top = Math.min(...rects.map((r) => r.y));
      const right = Math.max(...rects.map((r) => r.x + r.w));
      const bottom = Math.max(...rects.map((r) => r.y + r.h));
      return { x: left, y: top, w: right - left, h: bottom - top };
    }
  }
  return subBoxFor(block, charStart, charLength);
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
  const r = rectForRange(block, activeCharStart, activeCharLength);
  return (
    <div
      className="absolute rounded-sm bg-[rgba(255,211,77,0.5)] outline outline-2 outline-[var(--hl-strong)] transition-all duration-75"
      style={{
        left: `${(r.x / frameWidth) * 100}%`,
        top: `${(r.y / frameHeight) * 100}%`,
        width: `${(r.w / frameWidth) * 100}%`,
        height: `${(r.h / frameHeight) * 100}%`,
      }}
    />
  );
}
