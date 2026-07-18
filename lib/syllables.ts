/**
 * Deterministic syllable splitting for the Autopsy coaching flow
 * (REWORK R6 — amended §7 rules 3 & 4).
 *
 * Syllables come from Knuth–Liang hyphenation patterns (hypher +
 * hyphenation.en-us) — a data table, NO model. The spoken chunks are always
 * letter-substrings of the OCR word, and TTS speaks syllables (pronounceable
 * units), never isolated phonemes (those stay in the static bank).
 *
 * Hyphenation points are conservative approximations of syllable breaks —
 * exactly the auditable trade-off the team chose over model-generated splits.
 */

import Hypher from "hypher";
import english from "hyphenation.en-us";

// TeX hyphenation suppresses breaks near word edges (leftmin 2 / rightmin 3
// — typographic taste, not phonics). Coaching wants single-letter onsets
// ("a-wards"), so relax to 1/2 and then sanity-merge: a chunk with no vowel
// is not a syllable and folds into its neighbour ("elephan-t" → "elephant").
const hypher = new Hypher({ ...(english as object), leftmin: 1, rightmin: 2 });

function mergeVowelless(parts: string[]): string[] {
  const hasVowel = (s: string) => /[aeiouyAEIOUY]/.test(s);
  const out: string[] = [];
  for (const part of parts) {
    if (out.length > 0 && !hasVowel(part)) {
      out[out.length - 1] += part; // fold consonant-only tail into the left
    } else if (out.length > 0 && !hasVowel(out[out.length - 1])) {
      out[out.length - 1] += part; // vowel-less head folds into the right
    } else {
      out.push(part);
    }
  }
  return out;
}

/** Strip to the pronounceable core (letters + apostrophes), keep case. */
function coreOf(word: string): string {
  return word.replace(/[^a-zA-Z']/g, "");
}

const isVowel = (ch: string, index: number) => /[aeiou]/i.test(ch) || (index > 0 && /y/i.test(ch));

/**
 * Fallback splitter for words the patterns leave whole ("awards"): classic
 * vowel-group syllabification — one syllable per vowel group, silent final
 * "e" folded (except C+"le"), single consonant opens the next syllable
 * (V-CV), doubled consonants split (VC-CV).
 */
function vowelSplit(core: string): string[] {
  const groups: { start: number; end: number }[] = [];
  for (let i = 0; i < core.length; i++) {
    if (isVowel(core[i], i)) {
      const last = groups[groups.length - 1];
      if (last && last.end === i) last.end = i + 1;
      else groups.push({ start: i, end: i + 1 });
    }
  }
  // Silent final e ("charge"): drop its group unless the word ends in C+"le".
  const lower = core.toLowerCase();
  const last = groups[groups.length - 1];
  if (
    groups.length > 1 &&
    last.end === core.length &&
    lower.slice(last.start) === "e" &&
    !(lower.endsWith("le") && !isVowel(core[core.length - 3] ?? "x", 1))
  ) {
    groups.pop();
  }
  if (groups.length <= 1) return [core];

  const cuts: number[] = [];
  for (let k = 0; k < groups.length - 1; k++) {
    const runStart = groups[k].end;
    const runEnd = groups[k + 1].start;
    cuts.push(runEnd - runStart <= 1 ? runStart : runEnd - 1);
  }
  const parts: string[] = [];
  let prev = 0;
  for (const cut of cuts) {
    parts.push(core.slice(prev, cut));
    prev = cut;
  }
  parts.push(core.slice(prev));
  return parts.filter((p) => p.length > 0);
}

/** Syllable chunks of a word as written; [word] when no split point exists. */
export function syllablesOf(word: string): string[] {
  const core = coreOf(word);
  if (!core) return [];
  try {
    const parts = mergeVowelless(hypher.hyphenate(core));
    if (parts.length > 1) return parts;
    return vowelSplit(core);
  } catch {
    return vowelSplit(core);
  }
}

/**
 * One spoken coaching round (fixed template — auditable pedagogy):
 * "This word is Awards. A, wards, Awards." / repeat round without the intro.
 * Commas produce natural TTS pauses between syllables.
 */
export function coachingLines(word: string): string[] {
  const core = coreOf(word);
  const sylls = syllablesOf(word);
  if (!core || sylls.length === 0) return [];
  const sweep = `${sylls.join(", ")}, ${core}.`;
  return [`This word is ${core}. ${sweep}`, sweep];
}
