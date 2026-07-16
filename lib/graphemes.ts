/**
 * Grapheme chunking for the Stuck-Word Autopsy (IMPLEMENTATION_PLAN Phase 4.2).
 *
 * Data table only — NO model anywhere in this path (§7 rule 3). Chunks are
 * anchored to the grapheme–phoneme correspondences of the published UK
 * "Letters and Sounds" phonics scope-and-sequence (Phases 2–3); we never
 * invent pedagogy. Curated demo words below; unknown words fall back to
 * per-letter chunks.
 *
 * `phonemeId` names a file in the static bank /public/phonemes/{id}.mp3
 * (§7 rule 4: phonemes NEVER come from TTS).
 */

export interface GraphemeChunkDef {
  /** Grapheme as written, e.g. "ch", "ar", "ge". */
  text: string;
  /** Static bank file id → /public/phonemes/{id}.mp3 */
  phonemeId: string;
}

const c = (text: string, phonemeId: string): GraphemeChunkDef => ({ text, phonemeId });

/** Curated demo words (Letters and Sounds Phases 2–3 GPCs). */
const WORDS: Record<string, GraphemeChunkDef[]> = {
  charge: [c("ch", "ch"), c("ar", "ar"), c("ge", "j")],
  chip: [c("ch", "ch"), c("i", "i"), c("p", "p")],
  chair: [c("ch", "ch"), c("air", "air")],
  ship: [c("sh", "sh"), c("i", "i"), c("p", "p")],
  shop: [c("sh", "sh"), c("o", "o"), c("p", "p")],
  fish: [c("f", "f"), c("i", "i"), c("sh", "sh")],
  thin: [c("th", "th"), c("i", "i"), c("n", "n")],
  that: [c("th", "th_voiced"), c("a", "a"), c("t", "t")],
  ring: [c("r", "r"), c("i", "i"), c("ng", "ng")],
  rain: [c("r", "r"), c("ai", "ae"), c("n", "n")],
  wait: [c("w", "w"), c("ai", "ae"), c("t", "t")],
  see: [c("s", "s"), c("ee", "ee")],
  feet: [c("f", "f"), c("ee", "ee"), c("t", "t")],
  night: [c("n", "n"), c("igh", "igh"), c("t", "t")],
  light: [c("l", "l"), c("igh", "igh"), c("t", "t")],
  boat: [c("b", "b"), c("oa", "oa"), c("t", "t")],
  road: [c("r", "r"), c("oa", "oa"), c("d", "d")],
  moon: [c("m", "m"), c("oo", "oo_long"), c("n", "n")],
  book: [c("b", "b"), c("oo", "oo_short"), c("k", "k")],
  farm: [c("f", "f"), c("ar", "ar"), c("m", "m")],
  dark: [c("d", "d"), c("ar", "ar"), c("k", "k")],
  fork: [c("f", "f"), c("or", "or"), c("k", "k")],
  corn: [c("c", "k"), c("or", "or"), c("n", "n")],
  hurt: [c("h", "h"), c("ur", "ur"), c("t", "t")],
  turn: [c("t", "t"), c("ur", "ur"), c("n", "n")],
  cow: [c("c", "k"), c("ow", "ow")],
  down: [c("d", "d"), c("ow", "ow"), c("n", "n")],
  coin: [c("c", "k"), c("oi", "oi"), c("n", "n")],
  boil: [c("b", "b"), c("oi", "oi"), c("l", "l")],
  dear: [c("d", "d"), c("ear", "ear")],
  duck: [c("d", "d"), c("u", "u"), c("ck", "k")],
  bell: [c("b", "b"), c("e", "e"), c("ll", "l")],
};

/**
 * Per-letter fallback for words outside the curated list. Single-letter GPCs
 * from Letters and Sounds Phase 2–3; letters whose sound is context-dependent
 * map to their most common value (known approximation).
 */
const LETTER_PHONEME: Record<string, string> = {
  a: "a", b: "b", c: "k", d: "d", e: "e", f: "f", g: "g", h: "h", i: "i",
  j: "j", k: "k", l: "l", m: "m", n: "n", o: "o", p: "p", q: "k", r: "r",
  s: "s", t: "t", u: "u", v: "v", w: "w", x: "k", y: "y", z: "z",
};

/** Strip punctuation/case for lookup; the autopsy operates on bare words. */
export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z]/g, "");
}

export function chunksFor(word: string): GraphemeChunkDef[] {
  const normalized = normalizeWord(word);
  const curated = WORDS[normalized];
  if (curated) return curated;
  return [...normalized]
    .filter((ch) => LETTER_PHONEME[ch])
    .map((ch) => c(ch, LETTER_PHONEME[ch]));
}

/** "ch|ar|ge" — the pattern string logged with autopsy events. */
export function chunkPattern(chunks: GraphemeChunkDef[]): string {
  return chunks.map((ch) => ch.text).join("|");
}
