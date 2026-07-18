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
  kind: "box" | "circle" | "arrow";
  region: TutorRegion;
  /** Arrow target (arrows point region → to). */
  to?: TutorRegion;
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

{"steps":[{"say":"<one short spoken sentence>","anchor":{"line":3,"phrase":"3/4"},"aids":[{"kind":"circle","line":3,"phrase":"3/4"},{"kind":"arrow","line":3,"phrase":"3/4","toLine":5,"toPhrase":"9/12"}]}]}

Anchor rules:
- "line": the index from the WORKSHEET LINES list the step talks about.
- "phrase": the EXACT characters copied from that line that the step refers to (a number, a word, a blank). Omit "phrase" to mean the whole line.
- "aids": optional, at most 2 per step — "box" or "circle" marks an anchor; "arrow" points from the aid's anchor to "toLine"/"toPhrase". Use aids when they genuinely help (circle the numbers being compared, arrow from a value to where it goes).

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
        for (const a of step.aids.slice(0, 2)) {
          const aid = a as {
            kind?: unknown;
            line?: unknown;
            phrase?: unknown;
            toLine?: unknown;
            toPhrase?: unknown;
          };
          if (aid.kind !== "box" && aid.kind !== "circle" && aid.kind !== "arrow") continue;
          const r = resolveAnchor(aid.line, aid.phrase, lines);
          if (!r) continue;
          if (aid.kind === "arrow") {
            const to = resolveAnchor(aid.toLine, aid.toPhrase, lines);
            if (!to) continue;
            aids.push({ kind: aid.kind, region: r, to });
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
      "You summarize a child's reading-practice session statistics for a parent. " +
      "Output study-pattern insights and practical recommendations ONLY — trends in requests, " +
      "re-reads, pacing, and frequently stuck words/grapheme patterns. " +
      "NEVER make emotional or clinical claims, never diagnose, never speculate about the child's " +
      "feelings or conditions. Plain text, short paragraphs, parent-friendly language.",
    messages: [{ role: "user", content: aggregateText }],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
