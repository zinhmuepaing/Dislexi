/**
 * Voice-command types + deterministic keyword fast-path (amended §7 rule 3).
 *
 * The fast-path runs BEFORE any LLM call: obvious phrasings resolve locally
 * (free, instant, offline-safe). Only utterances it cannot classify go to
 * POST /api/voice-command (LLM intent parsing — intent ONLY; the text that
 * gets read aloud is never model-touched).
 *
 * Pure module (no browser/server APIs) so the logic tests cover it.
 */

export type ReadScope = "word" | "sentence" | "paragraph";

export interface VoiceIntent {
  intent: "read" | "set_scope" | "stuck_word" | "repeat" | "stop" | "rescan" | "none";
  scope?: ReadScope;
}

const SCOPE_WORDS: [RegExp, ReadScope][] = [
  [/\bwords?\b/, "word"],
  [/\b(sentences?|lines?|questions?)\b/, "sentence"],
  [/\b(paragraphs?|passages?|whole thing|all of it)\b/, "paragraph"],
];

function scopeIn(utterance: string): ReadScope | undefined {
  for (const [re, scope] of SCOPE_WORDS) {
    if (re.test(utterance)) return scope;
  }
  return undefined;
}

/**
 * Deterministic classification of the common phrasings; null → caller may
 * fall through to the LLM. Matching is intentionally loose on fillers
 * (anywhere-in-utterance), strict on the verbs.
 */
export function fastParseCommand(raw: string): VoiceIntent | null {
  const u = raw.toLowerCase().trim();
  if (!u) return null;

  // Stuck word (autopsy): "I'm stuck on this word", "what is this word".
  if (/\bstuck\b/.test(u) || /\bwhat('s| is) (this|that) word\b/.test(u)) {
    return { intent: "stuck_word" };
  }

  // Stop / quiet.
  if (/\b(stop|pause|be quiet|quiet please|shush)\b/.test(u)) {
    return { intent: "stop" };
  }

  // Rescan — checked before repeat: "scan again" contains "again".
  if (/\b(rescan|scan (it |the page )?again|new page|next page)\b/.test(u)) {
    return { intent: "rescan" };
  }

  // Repeat.
  if (/\b(again|repeat|one more time|once more)\b/.test(u)) {
    return { intent: "repeat" };
  }

  // Read commands, optionally scope-qualified: "read this word/sentence/…".
  if (/\bread\b/.test(u)) {
    return { intent: "read", scope: scopeIn(u) };
  }

  // Bare scope switch: "word mode", "switch to sentences".
  const scope = scopeIn(u);
  if (scope && /\b(mode|switch|change|use)\b/.test(u)) {
    return { intent: "set_scope", scope };
  }

  return null;
}

/**
 * Client-side resolution: keyword fast-path first; otherwise the LLM intent
 * route (which itself degrades to {intent:"none"} on any failure).
 */
export async function resolveVoiceCommand(utterance: string): Promise<VoiceIntent> {
  const fast = fastParseCommand(utterance);
  if (fast) return fast;
  try {
    const res = await fetch("/api/voice-command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ utterance }),
    });
    if (!res.ok) return { intent: "none" };
    return (await res.json()) as VoiceIntent;
  } catch {
    return { intent: "none" };
  }
}
