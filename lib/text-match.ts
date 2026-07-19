/**
 * Deterministic fuzzy matching for the end-of-session quiz (REWORK R7):
 * the child's spoken answer (STT transcript) is compared to the target word
 * with normalized Levenshtein similarity — no model in the verification.
 * Pure module; covered by scripts/logic-tests.mts.
 */

const normalizeAlpha = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

/** 0–1 similarity of the alphabetic cores of two strings. */
export function similarity(a: string, b: string): number {
  const na = normalizeAlpha(a);
  const nb = normalizeAlpha(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  return 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);
}

/**
 * Best candidate for a word the vision model read off the page (set-of-marks
 * pointing): highest-similarity candidate at ≥ 0.45, else null. The model and
 * the OCR saw the same print, so real matches score near 1; the threshold only
 * rejects hallucinated words. Deterministic — the model picks WHERE, the OCR
 * text is what gets spoken.
 */
export function bestWordMatch(
  candidates: string[],
  said: string | null | undefined,
): { index: number; score: number } | null {
  if (!said || candidates.length === 0) return null;
  let index = -1;
  let score = 0;
  candidates.forEach((c, i) => {
    const s = similarity(c, said);
    if (s > score) {
      score = s;
      index = i;
    }
  });
  return index >= 0 && score >= 0.45 ? { index, score } : null;
}

/**
 * Did the utterance say the word? Accepts the whole utterance, any single
 * token, or an embedded match ("it says awards I think" → true) at ≥ 0.75
 * similarity — tolerant of STT quirks, strict enough to fail wrong words.
 */
export function saidWordMatches(utterance: string, word: string): boolean {
  const target = normalizeAlpha(word);
  if (!target) return false;
  if (normalizeAlpha(utterance).includes(target)) return true;
  if (similarity(utterance, word) >= 0.75) return true;
  return utterance.split(/\s+/).some((token) => similarity(token, word) >= 0.75);
}
