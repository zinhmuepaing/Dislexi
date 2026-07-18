/**
 * Sentence grouping for Exam-Prep reading (research-backed unit choice).
 *
 * Human exam readers read at the QUESTION/SENTENCE level with intonation — a
 * "line" is only where text happens to wrap on the page, so reading line-by-line
 * chops sentences mid-thought and kills prosody (the very comprehension support
 * the accommodation exists to provide). OCR here emits one block per LINE
 * (Huawei granularity), so this module groups consecutive line-blocks into
 * sentences.
 *
 * DETERMINISTIC, NO MODEL (§7 rule 3, §5.4 verbatim): grouping uses only end
 * punctuation and box geometry, and the sentence text is the member lines'
 * OCR text concatenated VERBATIM with single spaces — no rewriting layer.
 */

import type { OcrBox } from "@/components/KaraokeHighlight";

export interface Sentence {
  /** Member line-blocks, in reading order. */
  blocks: OcrBox[];
  /** Their indices into the original scan blocks array (for selection mapping). */
  blockIndices: number[];
  /** Verbatim concatenation of the member lines' text, single-space joined. */
  text: string;
  /** Char span [start, end) of each member block within `text`, index-aligned to `blocks`. */
  ranges: { start: number; end: number }[];
}

interface Rect {
  top: number;
  bottom: number;
  height: number;
}

function rectOf(box: [number, number][]): Rect {
  const ys = box.map(([, y]) => y);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return { top, bottom, height: Math.max(1, bottom - top) };
}

/** A line ending in one of these terminates the sentence. */
const TERMINAL = /[.?!]["')\]]?\s*$/;
/** Vertical gap beyond this fraction of the line height starts a new sentence. */
const GAP_FACTOR = 0.6;

/**
 * True when `next` should begin a NEW sentence rather than continue `cur`.
 * Signals: `cur` ends with terminal punctuation; a paragraph-sized vertical
 * gap; or the flow is not downward (column break / OCR reading-order jump).
 */
function breakBetween(cur: OcrBox, next: OcrBox): boolean {
  if (TERMINAL.test(cur.text)) return true;
  const a = rectOf(cur.box);
  const b = rectOf(next.box);
  if (b.top < a.top) return true; // not flowing downward → treat as new block
  const gap = b.top - a.bottom;
  return gap > GAP_FACTOR * a.height;
}

function makeSentence(members: { block: OcrBox; index: number }[]): Sentence {
  let text = "";
  const ranges: { start: number; end: number }[] = [];
  members.forEach((m, i) => {
    if (i > 0) text += " ";
    const start = text.length;
    text += m.block.text;
    ranges.push({ start, end: text.length });
  });
  return {
    blocks: members.map((m) => m.block),
    blockIndices: members.map((m) => m.index),
    text,
    ranges,
  };
}

/**
 * Group line-blocks (in OCR reading order) into sentences. Blocks that are
 * empty after trimming are dropped (they carry no readable text and break the
 * current group).
 */
export function buildSentences(blocks: OcrBox[]): Sentence[] {
  const sentences: Sentence[] = [];
  let group: { block: OcrBox; index: number }[] = [];

  const flush = () => {
    if (group.length > 0) sentences.push(makeSentence(group));
    group = [];
  };

  blocks.forEach((block, index) => {
    if (block.text.trim() === "") {
      flush();
      return;
    }
    if (group.length === 0) {
      group.push({ block, index });
      return;
    }
    const prev = group[group.length - 1].block;
    if (breakBetween(prev, block)) flush();
    group.push({ block, index });
  });
  flush();

  return sentences;
}

/** blockToSentence[blockIndex] = sentence index (undefined for dropped empties). */
export function blockToSentenceMap(sentences: Sentence[]): number[] {
  const map: number[] = [];
  sentences.forEach((s, si) => s.blockIndices.forEach((bi) => (map[bi] = si)));
  return map;
}

export interface LocalWord {
  /** Index into the sentence's `blocks`/`ranges` — the line currently spoken. */
  memberIndex: number;
  /** Character offset within that line's text. */
  localStart: number;
  /** Character length within that line's text (clamped to the line). */
  localLength: number;
}

/**
 * Map a wordBoundary offset (into the whole sentence text) back to the member
 * line it falls in, plus the local char range within that line — so the karaoke
 * highlight can move from one line's box to the next as the sentence is read.
 * Offsets landing on a joining space snap to the line they trail.
 */
export function localWordAt(
  sentence: Sentence,
  globalStart: number,
  globalLength: number,
): LocalWord | null {
  const { ranges } = sentence;
  if (ranges.length === 0) return null;

  // The member line whose range contains globalStart; on a joining space
  // (globalStart === ranges[i].end), fall to the line that just ended.
  let memberIndex = -1;
  for (let i = 0; i < ranges.length; i++) {
    if (globalStart >= ranges[i].start && globalStart < ranges[i].end) {
      memberIndex = i;
      break;
    }
    if (globalStart >= ranges[i].end) memberIndex = i; // trailing space / gap
  }
  if (memberIndex < 0) return null;

  const r = ranges[memberIndex];
  const localStart = Math.max(0, globalStart - r.start);
  const localEnd = Math.min(r.end, globalStart + globalLength) - r.start;
  const localLength = Math.max(0, localEnd - localStart);
  return { memberIndex, localStart, localLength };
}
