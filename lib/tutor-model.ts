/**
 * TEMPORARY: substituting Huawei Cloud MaaS (vision model, OpenAI-compatible
 * endpoint) with Claude Sonnet 4.6 via the Anthropic API until Huawei Cloud
 * access is confirmed.
 *
 * Swap target: lib/maas.ts per ARCHITECTURE.md section 5.3.
 * The /api/tutor output contract must not change when swapped:
 *   SSE stream of {delta} text chunks, then a final frame
 *   { steps: [{ say, region }] } with region normalized 0-1 relative to the
 *   submitted image.
 *
 * `summarizeStudyPatterns` below likewise substitutes for MAAS_TEXT_MODEL
 * (deepseek-v3.1-terminus) used by the Telegram review flow (§5.5).
 *
 * Request/response pattern follows our prior project DeskTutor
 * (github.com/zinhmuepaing/lazy-ai, screen-teacher.js): question text BEFORE
 * the image block, cached system prompt, strict-JSON steps output with
 * tolerant parsing. Regions here are normalized 0-1 (ARCHITECTURE §5.3), not
 * DeskTutor's absolute pixels.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { VoiceIntent } from "@/lib/voice-commands";

const TUTOR_MODEL = "claude-sonnet-4-6"; // vision-capable — a hard requirement for this route regardless of vendor
/** Intent parsing only (amended §7 rule 3) — small + fast; swap target: MAAS text model. */
const COMMAND_MODEL = "claude-haiku-4-5";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }
    _client = new Anthropic();
  }
  return _client;
}

export interface TutorRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Visual aid drawn on the frozen frame while a step narrates. */
export interface TutorAid {
  kind: "box" | "circle" | "arrow" | "write";
  region: TutorRegion;
  /** Arrow target (arrows point region → to). */
  to?: TutorRegion;
  /** For "write": short text drawn on the paper near the anchor (the working). */
  text?: string;
}

export interface TutorStep {
  say: string;
  region: TutorRegion;
  aids?: TutorAid[];
}

/** OCR line map sent by the client: index, verbatim text, NORMALIZED box. */
export interface TutorLine {
  i: number;
  text: string;
  box: TutorRegion;
}

export interface TutorTurn {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are a patient, encouraging tutor for a primary-school student in Singapore with dyslexia/ADHD. You are shown a photo of the worksheet lying in front of the student, plus their question about it.

Explain step by step, one small idea at a time, in simple spoken English suitable for a child. Guide the student to the answer; do not just state it. Never diagnose, never comment on the student's ability or emotions.

Respond with STRICT JSON only — no prose, no markdown fences, nothing outside the JSON object.

When the user message includes a WORKSHEET LINES list (index: text), DO NOT estimate coordinates. Anchor every step to a listed line instead:

{"steps":[{"say":"<one short spoken sentence>","anchor":{"line":3,"phrase":"3/4"},"aids":[{"kind":"circle","line":3,"phrase":"3/4"},{"kind":"write","line":3,"phrase":"3/4","text":"=9/12"},{"kind":"arrow","line":3,"phrase":"3/4","toLine":5,"toPhrase":"blank"}]}]}

Anchor rules:
- "line": the index from the WORKSHEET LINES list the step talks about.
- "phrase": the EXACT characters copied from that line that the step refers to (a number, a word, a blank). Omit "phrase" to mean the whole line.
- "aids": optional, at most 3 per step. Draw the WORKING directly on the paper like a teacher would:
  - "circle" or "box" marks an anchor (circle the numbers being compared).
  - "write" prints a SHORT text (≤10 chars) on the paper next to its anchor — use it to show the actual working (e.g. text "=9/12", "×3", "12", a carry). This is the most important aid: SHOW the calculation on the page, do not just talk about it.
  - "arrow" points from its anchor to "toLine"/"toPhrase".

Only when NO lines list is provided, fall back to:

{"steps":[{"say":"...","region":{"x":0.31,"y":0.42,"w":0.2,"h":0.06}}]}

with region NORMALIZED (0-1) to the image. General rules:
- "say": one short sentence to be read aloud. 2 to 6 steps total.
- Every step must point at the exact part of the worksheet it talks about.
- Follow-up questions continue the same worksheet; keep anchoring to the same lines/image.`;

const clamp01 = (n: unknown) => Math.min(1, Math.max(0, Number(n) || 0));

/**
 * Resolve a line/phrase anchor to a normalized rect DETERMINISTICALLY: the
 * line's OCR box, narrowed to the phrase's proportional char span (§7 rule 7
 * approximation — same as the karaoke sub-boxes). This is why the anchored
 * mode is accurate: the model never emits coordinates, geometry comes from
 * OCR alone.
 */
function resolveAnchor(
  lineIdx: unknown,
  phrase: unknown,
  lines: TutorLine[],
): TutorRegion | null {
  const ln = lines.find((l) => l.i === Number(lineIdx));
  if (!ln) return null;
  const total = Math.max(1, ln.text.length);
  let start = 0;
  let len = total;
  if (typeof phrase === "string" && phrase.trim()) {
    const idx = ln.text.toLowerCase().indexOf(phrase.trim().toLowerCase());
    if (idx >= 0) {
      start = idx;
      len = phrase.trim().length;
    }
  }
  const startFrac = Math.min(1, start / total);
  const lenFrac = Math.min(1 - startFrac, len / total);
  return {
    x: ln.box.x + ln.box.w * startFrac,
    y: ln.box.y,
    w: ln.box.w * lenFrac,
    h: ln.box.h,
  };
}

/**
 * Tolerant JSON extraction: strips code fences / stray prose. With a line
 * map, anchors (and aids) resolve to OCR-derived rects; without one, raw
 * regions are clamped to 0-1 (legacy mode).
 */
export function parseSteps(raw: string, lines?: TutorLine[]): TutorStep[] {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const rawSteps = (parsed as { steps?: unknown[] })?.steps;
  if (!Array.isArray(rawSteps)) return [];

  return rawSteps
    .map((s) => {
      const step = s as {
        say?: unknown;
        region?: Record<string, unknown>;
        anchor?: { line?: unknown; phrase?: unknown };
        aids?: unknown[];
      };

      let region: TutorRegion | null = null;
      if (lines?.length && step.anchor) {
        region = resolveAnchor(step.anchor.line, step.anchor.phrase, lines);
      }
      if (!region) {
        const r = step.region ?? {};
        region = { x: clamp01(r.x), y: clamp01(r.y), w: clamp01(r.w), h: clamp01(r.h) };
      }

      const aids: TutorAid[] = [];
      if (lines?.length && Array.isArray(step.aids)) {
        for (const a of step.aids.slice(0, 3)) {
          const aid = a as {
            kind?: unknown;
            line?: unknown;
            phrase?: unknown;
            toLine?: unknown;
            toPhrase?: unknown;
            text?: unknown;
          };
          if (aid.kind !== "box" && aid.kind !== "circle" && aid.kind !== "arrow" && aid.kind !== "write")
            continue;
          const r = resolveAnchor(aid.line, aid.phrase, lines);
          if (!r) continue;
          if (aid.kind === "arrow") {
            const to = resolveAnchor(aid.toLine, aid.toPhrase, lines);
            if (!to) continue;
            aids.push({ kind: aid.kind, region: r, to });
          } else if (aid.kind === "write") {
            const text = String(aid.text ?? "").trim().slice(0, 10);
            if (!text) continue;
            aids.push({ kind: aid.kind, region: r, text });
          } else {
            aids.push({ kind: aid.kind, region: r });
          }
        }
      }

      const result: TutorStep = { say: String(step.say ?? "").trim(), region };
      if (aids.length > 0) result.aids = aids;
      return result;
    })
    .filter((s) => s.say.length > 0);
}

export interface TutorRequest {
  imageBase64: string;
  question: string;
  history?: TutorTurn[];
  /** OCR line map (normalized boxes) — enables anchored regions + aids. */
  lines?: TutorLine[];
}

/**
 * Streams the model's raw text through `onDelta` as it arrives, then resolves
 * with the parsed steps for the final SSE frame.
 */
/** Sniff the image media type from base64 magic bytes (API rejects a mismatch). */
function sniffMediaType(data: string): "image/png" | "image/webp" | "image/gif" | "image/jpeg" {
  return data.startsWith("iVBOR")
    ? "image/png"
    : data.startsWith("UklGR")
      ? "image/webp"
      : data.startsWith("R0lGOD")
        ? "image/gif"
        : "image/jpeg";
}

export interface PointerLocation {
  x: number;
  y: number;
}

/**
 * VISUAL POINTING (amended §7 rule 3 #2): find the tip of the student's
 * pointing finger in a captured frame. Returns normalized 0–1 coords (top-
 * left origin) or null when no pointing hand is visible. This replaces
 * MediaPipe, which cannot parse the back-of-hand / fingernail view the
 * mirror-clip camera sees. The model decides WHERE the finger is; the caller
 * maps that to an OCR word and reads that word's text VERBATIM.
 */
export async function locatePointer(imageBase64: string): Promise<PointerLocation | null> {
  const data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const response = await client().messages.create({
    model: TUTOR_MODEL,
    max_tokens: 80,
    system:
      "You see a photo of a worksheet with a child's hand pointing at the text. " +
      "Find the exact TIP of the pointing finger — the end of the extended finger " +
      "(usually the index finger), at or just past the fingernail, i.e. the spot on " +
      "the paper the child means to indicate. This works from any angle, including " +
      "when the camera sees the back of the hand or the fingernail. " +
      'Respond with STRICT JSON only: {"found":true,"x":0.42,"y":0.63} where x and y ' +
      "are fractions between 0 and 1 measured from the TOP-LEFT corner of the image " +
      '(x rightward, y downward). If no pointing hand or finger is visible, respond {"found":false}.',
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: sniffMediaType(data), data },
          },
        ],
      },
    ],
  });

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      found?: boolean;
      x?: unknown;
      y?: unknown;
    };
    if (parsed.found === false) return null;
    const x = Number(parsed.x);
    const y = Number(parsed.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  } catch {
    return null;
  }
}

export interface MarkChoice {
  /** Chip number of the line the finger points at. */
  mark: number;
  /** The exact word being pointed at, as the model reads it off the image. */
  word: string | null;
}

/**
 * SET-OF-MARKS POINTING (branch: feature/set-of-marks-pointing; amended §7
 * rule 3 #2). The frame arrives with numbered chips composited at each OCR
 * line (lib/marks.ts). Classification, not coordinate regression: the model
 * names the marked LINE the finger points at plus the word it sees pointed —
 * the caller resolves both against OCR boxes and speaks OCR text VERBATIM.
 */
export async function locatePointedMark(
  imageBase64: string,
  marks: { n: number; text: string }[],
): Promise<MarkChoice | null> {
  const data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const list = marks
    .slice(0, 60)
    .map((m) => `${Math.trunc(Number(m.n))}: ${String(m.text).slice(0, 120)}`)
    .join("\n");

  const response = await client().messages.create({
    model: TUTOR_MODEL,
    max_tokens: 120,
    system:
      "You see a photo of a worksheet with a child's hand pointing at the text. " +
      "Each text line is covered by a translucent tinted band (colors alternate " +
      "line to line) and carries the SAME number in a circular chip at BOTH ends " +
      "of its band; the numbers with each line's text are listed in the message. " +
      "Decide which numbered LINE the finger is pointing at: find the fingertip, " +
      "then the band it touches, then that band's chip number — never trace " +
      "across the page. The finger often covers its target: the intended line is " +
      "the one the fingertip touches, or the line just beyond the fingernail in " +
      "the pointing direction — when in doubt between two bands, prefer the one " +
      "ABOVE the fingertip. Also read the exact single word being pointed at, " +
      "copied verbatim from the image. Respond with STRICT JSON only: " +
      '{"found":true,"mark":3,"word":"perimeter"} — or {"found":true,"mark":3,"word":null} ' +
      'if the word is unreadable, or {"found":false} if no pointing hand is visible.',
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `MARKED LINES (number: text):\n${list}` },
          {
            type: "image",
            source: { type: "base64", media_type: sniffMediaType(data), data },
          },
        ],
      },
    ],
  });

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      found?: boolean;
      mark?: unknown;
      word?: unknown;
    };
    if (parsed.found === false) return null;
    const mark = Math.trunc(Number(parsed.mark));
    if (!Number.isFinite(mark) || !marks.some((m) => m.n === mark)) return null;
    const word = typeof parsed.word === "string" && parsed.word.trim() ? parsed.word.trim() : null;
    return { mark, word };
  } catch {
    return null;
  }
}

/**
 * SET-OF-MARKS, WORD PASS (two-pass pointing): the frame arrives with small
 * numbered chips composited ABOVE each word of the already-picked line. Pure
 * classification — the model names a chip, never reads text: the fingertip
 * occludes its target word, so asking the model to read it made it name a
 * legible neighbor (usually the first word of the line) instead.
 */
export async function locatePointedWordMark(
  imageBase64: string,
  marks: { n: number; text: string }[],
): Promise<{ mark: number } | null> {
  const data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const list = marks
    .slice(0, 60)
    .map((m) => `${Math.trunc(Number(m.n))}: ${String(m.text).slice(0, 120)}`)
    .join("\n");

  const response = await client().messages.create({
    model: TUTOR_MODEL,
    max_tokens: 80,
    system:
      "You see a photo of a worksheet with a child's hand pointing at a word. " +
      "On ONE text line, each word has a small numbered circular chip directly " +
      "above it; the same numbers with each chip's word are listed in the message. " +
      "Decide which chip's word the fingertip is pointing at. The fingertip " +
      "usually COVERS its target word — pick the chip at or directly above the " +
      "fingertip, never a neighboring chip just because its word is easier to " +
      'read. Respond with STRICT JSON only: {"found":true,"mark":3} — or ' +
      '{"found":false} if no pointing hand is visible.',
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `MARKED WORDS (number: word):\n${list}` },
          {
            type: "image",
            source: { type: "base64", media_type: sniffMediaType(data), data },
          },
        ],
      },
    ],
  });

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      found?: boolean;
      mark?: unknown;
    };
    if (parsed.found === false) return null;
    const mark = Math.trunc(Number(parsed.mark));
    if (!Number.isFinite(mark) || !marks.some((m) => m.n === mark)) return null;
    return { mark };
  } catch {
    return null;
  }
}

export async function runTutor(
  { imageBase64, question, history, lines }: TutorRequest,
  onDelta: (text: string) => void,
): Promise<TutorStep[]> {
  // Sanitize the line map: cap size, force numeric indices/boxes.
  const lineMap: TutorLine[] = (lines ?? [])
    .slice(0, 80)
    .map((l) => ({
      i: Number(l.i),
      text: String(l.text).slice(0, 200),
      box: { x: clamp01(l.box?.x), y: clamp01(l.box?.y), w: clamp01(l.box?.w), h: clamp01(l.box?.h) },
    }))
    .filter((l) => Number.isFinite(l.i) && l.text.trim().length > 0);

  const data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  // The API rejects a media_type that doesn't match the actual bytes.
  const mediaType = sniffMediaType(data);

  const userText =
    lineMap.length > 0
      ? `${question}\n\nWORKSHEET LINES (index: text):\n${lineMap
          .map((l) => `${l.i}: ${l.text}`)
          .join("\n")}`
      : question;

  const messages: Anthropic.MessageParam[] = [
    ...(history ?? []).map((t) => ({ role: t.role, content: t.content })),
    {
      role: "user" as const,
      content: [
        // Text BEFORE image — per the DeskTutor reference, the model reads the
        // question first, which improves region accuracy.
        { type: "text" as const, text: userText },
        {
          type: "image" as const,
          source: { type: "base64" as const, media_type: mediaType, data },
        },
      ],
    },
  ];

  const stream = client().messages.stream({
    model: TUTOR_MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      onDelta(event.delta.text);
    }
  }

  const final = await stream.finalMessage();
  const fullText = final.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return parseSteps(fullText, lineMap.length > 0 ? lineMap : undefined);
}

const VOICE_INTENTS = new Set([
  "read",
  "set_scope",
  "stuck_word",
  "sound_out",
  "repeat",
  "stop",
  "rescan",
  "none",
]);
const VOICE_SCOPES = new Set(["word", "sentence", "paragraph"]);

/**
 * Voice-command INTENT parsing (amended §7 rule 3): the model classifies a
 * child's spoken request — it never sees, generates, or rewrites the text
 * that gets read aloud. Called only when the client keyword fast-path
 * (lib/voice-commands.ts) could not classify the utterance.
 */
export async function parseVoiceCommand(utterance: string): Promise<VoiceIntent> {
  const response = await client().messages.create({
    model: COMMAND_MODEL,
    max_tokens: 60,
    system:
      "Classify a primary-school student's spoken request in a point-and-read app. " +
      "The student points a finger at worksheet text; the app can read what is pointed at, " +
      "change the reading scope, help with a stuck word, sound a word out letter by letter, " +
      "repeat, stop speaking, or rescan the page. " +
      "Utterances contain fillers and varied phrasing. Respond with STRICT JSON only: " +
      '{"intent":"read|set_scope|stuck_word|sound_out|repeat|stop|rescan|none","scope":"word|sentence|paragraph"} ' +
      '— "scope" only when the student names a unit. Unclear or off-topic speech → {"intent":"none"}.',
    messages: [{ role: "user", content: utterance.slice(0, 300) }],
  });

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { intent?: string; scope?: string };
    const intent = VOICE_INTENTS.has(parsed.intent ?? "") ? (parsed.intent as VoiceIntent["intent"]) : "none";
    const scope = VOICE_SCOPES.has(parsed.scope ?? "") ? (parsed.scope as VoiceIntent["scope"]) : undefined;
    return scope ? { intent, scope } : { intent };
  } catch {
    return { intent: "none" };
  }
}

/**
 * Text-only summary for the Telegram review flow (ARCHITECTURE.md §5.5).
 * Swap target: Huawei MaaS MAAS_TEXT_MODEL (deepseek-v3.1-terminus) — text-only
 * is fine here, so DeepSeek works once Huawei access is confirmed.
 */
export async function summarizeStudyPatterns(aggregateText: string): Promise<string> {
  const response = await client().messages.create({
    model: TUTOR_MODEL,
    max_tokens: 1024,
    system:
      "You summarize a child's reading-practice session statistics for a parent, to be sent as a " +
      "Telegram chat message. Output study-pattern insights and practical recommendations ONLY — " +
      "trends in requests, re-reads, pacing, and frequently stuck words/grapheme patterns. " +
      "NEVER make emotional or clinical claims, never diagnose, never speculate about the child's " +
      "feelings or conditions.\n\n" +
      "FORMATTING (Telegram plain text — no Markdown):\n" +
      "- Do NOT use Markdown: no **, no ##, no backticks, no bullet dashes at line start.\n" +
      "- Lead each short section with a relevant emoji and a Title Case label on its own line " +
      "(e.g. '📖 Reading Overview'), then 1–3 short sentences under it.\n" +
      "- Keep it warm, concise, and skimmable — 3 to 5 sections, a blank line between them.\n" +
      "- End with one '💡 Try This' tip.",
    messages: [{ role: "user", content: aggregateText }],
  });

  return stripMarkdown(
    response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim(),
  );
}

/**
 * Safety net for Telegram plain-text messages: strip Markdown syntax the
 * model might still emit so parents never see raw ** or ## (item 4).
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "") // ## headers
    .replace(/\*\*(.+?)\*\*/g, "$1") // **bold**
    .replace(/(^|\s)\*(?!\s)(.+?)(?<!\s)\*/g, "$1$2") // *italic*
    .replace(/(^|\s)_(?!\s)(.+?)(?<!\s)_/g, "$1$2") // _italic_
    .replace(/`([^`]+)`/g, "$1") // `code`
    .replace(/^\s*[-*]\s+/gm, "• ") // list dashes → bullet
    .replace(/^\s*>\s?/gm, "") // blockquotes
    .replace(/\n{3,}/g, "\n\n") // collapse blank runs
    .trim();
}

export type GroupIntent =
  | { action: "review"; days: number }
  | { action: "report" }
  | { action: "help" }
  | { action: "other" };

/**
 * Classify a free-text group request aimed at the bot (item 5): decide
 * whether it's asking for a reading review (and over how many days), the
 * latest report, help, or something off-topic. Text-only; reuses the
 * command model. Falls back to "other" (a polite refusal) on any failure.
 */
export async function classifyGroupRequest(text: string): Promise<GroupIntent> {
  try {
    const response = await client().messages.create({
      model: COMMAND_MODEL,
      max_tokens: 60,
      system:
        "You route a message sent to a reading-practice assistant bot in a group chat. The bot " +
        "reports a child's reading-practice patterns (reads, re-reads, stuck words, pacing) over a " +
        "time window. Classify the user's request. Respond STRICT JSON only:\n" +
        '{"action":"review","days":7} for any ask about how the child did / recent readings / ' +
        "insights over a period (map 'today'→1, 'this week'/'past week'→7, 'this month'→30; default " +
        "7 if unspecified);\n" +
        '{"action":"report"} for the latest/most recent single session;\n' +
        '{"action":"help"} for what the bot can do;\n' +
        '{"action":"other"} for anything unrelated to the child\'s reading practice.',
      messages: [{ role: "user", content: text.slice(0, 300) }],
    });
    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as {
      action?: string;
      days?: unknown;
    };
    if (parsed.action === "review") {
      const days = Number(parsed.days);
      return { action: "review", days: Number.isFinite(days) && days > 0 ? Math.min(365, days) : 7 };
    }
    if (parsed.action === "report") return { action: "report" };
    if (parsed.action === "help") return { action: "help" };
    return { action: "other" };
  } catch {
    return { action: "other" };
  }
}
