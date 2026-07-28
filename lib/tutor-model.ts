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
import { parseVisual, type TutorVisual } from "@/lib/tutor-visual";

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
  /**
   * Bite-sized LaTeX for THIS step's math/science operation (KaTeX body, no
   * `$` delimiters) — rendered in one solid card near `region` on the camera
   * feed, one at a time (REWORK 4). Absent on plain-language steps.
   */
  formula?: string;
  /**
   * Generated countable/animated visual for THIS step (backlog §1/§3/§4) —
   * a validated spec the client draws itself, shown in one large centred panel
   * while the step narrates. Unlike `aids`, it is NOT anchored to an OCR line:
   * it is new teaching material, not a mark on the worksheet.
   */
  visual?: TutorVisual;
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

Explain step by step, ONE small idea per step, in simple spoken English suitable for a child. Guide the student to the answer; do not just state it. Never diagnose, never comment on the student's ability or emotions.

Break the reasoning into MANY small steps (aim 3 to 8). Each step must be tiny enough that only ONE thing happens in it — one calculation, one comparison, one substitution. If you would show two formulas, make them two steps.

Respond with STRICT JSON only — no prose, no markdown fences, nothing outside the JSON object.

When the user message includes a WORKSHEET LINES list (index: text), DO NOT estimate coordinates. Anchor every step to a listed line instead:

{"steps":[{"say":"<one short spoken sentence>","anchor":{"line":3,"phrase":"3/4"},"formula":"\\\\frac{3}{4}=\\\\frac{9}{12}","aids":[{"kind":"circle","line":3,"phrase":"3/4"},{"kind":"arrow","line":3,"phrase":"3/4","toLine":5,"toPhrase":"blank"}]}]}

Anchor rules:
- "line": the index from the WORKSHEET LINES list the step talks about.
- "phrase": the EXACT characters copied from that line that the step refers to (a number, a word, a blank). Omit "phrase" to mean the whole line.
- "formula": for a MATH or SCIENCE step, the ONE bite-sized operation happening in THIS step, written as LaTeX (KaTeX syntax, no $ delimiters), e.g. "\\\\frac{3}{4}=\\\\frac{9}{12}" or "F=ma". It is shown on the worksheet, one at a time, while your "say" explains the reasoning aloud. Keep it short — just the operation, not the whole solution. OMIT "formula" on plain-language steps (no math). Never put more than one formula in a step.
- "aids": at most 3 per step, for POINTING only. Do NOT use aids to write text — use "formula" for that.
  - "arrow": points FROM its own anchor TO "toLine"/"toPhrase". PREFER AN ARROW whenever the step connects two things or tells the student where to look or write next — "this number goes in that blank", "compare this with that", "put the answer here". An arrow shows direction; a box only says "somewhere around here". Include at least one arrow on every step that moves the student's attention from one place to another.
  - "circle"/"box": mark a single anchor the step is about, when there is nothing to connect it to.
- "visual": optional. A picture the student can COUNT or WATCH MOVE, drawn for them. See the concrete-first rule below. At most one per step, and never in the same step as "formula".

CONCRETE BEFORE ABSTRACT — this is a rule, not a flourish:
When a step's idea is a quantity being COMBINED or COMPARED (adding, subtracting, area, or Pythagoras), do NOT jump to the symbols. First give a step with a "visual" the student can count, and let your "say" count it aloud with them. Only in a LATER step introduce the "formula" as shorthand for what they just counted.
When a step's truth can be SEEN BY MOVING something — folding a shape onto itself, sliding a cut piece — use the matching "visual" instead of describing the motion in words.
If a fact is neither a quantity nor a motion, use no visual. Do not decorate.

Allowed "visual" values — use these EXACTLY, no other shapes, no coordinates, no SVG:
- {"kind":"unitGrid","grids":[{"rows":3,"cols":3},{"rows":4,"cols":4},{"rows":5,"cols":5}]} — countable squares. Areas, and Pythagoras by counting (9 + 16 = 25). 1 to 3 grids, each at most 12x12.
- {"kind":"placeValue","rows":[{"hundreds":5,"tens":0,"ones":0},{"hundreds":8,"tens":0,"ones":0}]} — blocks for adding/subtracting whole numbers. Up to 3 rows.
- {"kind":"foldTriangle","base":10,"height":12} — folds an isosceles triangle along its axis so the two halves visibly match (proves the base angles are equal).
- {"kind":"rearrangeParallelogram","base":12,"height":7,"slant":3} — cuts the slanted end off a parallelogram and slides it, making a rectangle (proves base x height).
- {"kind":"ratioTriangle","angleDeg":43,"ratio":"sin","adjacent":35} — a right triangle the student DRAGS to change the angle, with the ratio updating live. Use for sin/cos/tan. "adjacent" only if the worksheet gives that length.

Numbers may appear inside a visual, but your "say" must always speak the count or value too — never rely on the student reading it.

Only when NO lines list is provided, fall back to:

{"steps":[{"say":"...","region":{"x":0.31,"y":0.42,"w":0.2,"h":0.06},"formula":"F=ma"}]}

with region NORMALIZED (0-1) to the image. General rules:
- "say": one short sentence to be read aloud.
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
/** Map one raw step object → a resolved TutorStep (null if it has no `say`). */
function mapRawStep(s: unknown, lines?: TutorLine[]): TutorStep | null {
  const step = s as {
    say?: unknown;
    region?: Record<string, unknown>;
    anchor?: { line?: unknown; phrase?: unknown };
    aids?: unknown[];
    formula?: unknown;
  };

  const say = String(step.say ?? "").trim();
  if (!say) return null;

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
        const text = String(aid.text ?? "").trim().slice(0, 16);
        if (!text) continue;
        aids.push({ kind: aid.kind, region: r, text });
      } else {
        aids.push({ kind: aid.kind, region: r });
      }
    }
  }

  const result: TutorStep = { say, region };
  if (aids.length > 0) result.aids = aids;
  const formula = String(step.formula ?? "").trim().slice(0, 120);
  if (formula) result.formula = formula;
  // Anything outside the closed visual vocabulary is silently dropped, so a
  // hallucinated shape degrades to a normal narrated step rather than breaking.
  const visual = parseVisual((step as { visual?: unknown }).visual);
  if (visual) result.visual = visual;
  return result;
}

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
  return rawSteps.map((s) => mapRawStep(s, lines)).filter((s): s is TutorStep => s !== null);
}

/**
 * Scan a partial streamed buffer for COMPLETE top-level `{…}` objects (the
 * step objects inside the prefilled `{"steps": [` array). Brace-matched and
 * string-aware, so nested objects and braces inside strings don't confuse it.
 * Pure — covered by scripts/logic-tests.mts.
 */
export function scanTopLevelObjects(s: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        objects.push(s.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return objects;
}

/** Parse one complete step-object JSON string → TutorStep (null on failure). */
export function parseStepObject(objJson: string, lines?: TutorLine[]): TutorStep | null {
  try {
    return mapRawStep(JSON.parse(objJson), lines);
  } catch {
    return null;
  }
}

/**
 * From a partial streamed `{"steps": [ {…}, {…}, {partial…` buffer, return the
 * COMPLETE step-object JSON strings so far: locate the steps array opener and
 * scan its elements (brace/string-aware). Pure — covered by logic tests.
 * (Assistant prefill isn't used — claude-sonnet-4-6 rejects it — so the buffer
 * still carries the leading `{"steps": [`.)
 */
export function stepsFromStream(buffer: string): string[] {
  const key = buffer.indexOf('"steps"');
  if (key < 0) return [];
  const bracket = buffer.indexOf("[", key);
  if (bracket < 0) return [];
  return scanTopLevelObjects(buffer.slice(bracket + 1));
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
      "Each text line has a numbered circular marker at its left edge; the same " +
      "numbers with each line's text are listed in the message. Decide which " +
      "MARKED LINE the finger is pointing at. The finger often covers its target: " +
      "the intended line is the one the fingertip touches, or the line just beyond " +
      "the fingernail in the pointing direction — when in doubt between two lines, " +
      "prefer the one ABOVE the fingertip. Also read the exact single word being " +
      "pointed at, copied verbatim from the image. Respond with STRICT JSON only: " +
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
    if (process.env.POINT_DEBUG) console.log("[line raw]", raw);
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
      "You see a photo of a worksheet with a child's hand pointing UP at ONE word " +
      "on a single line of text. Each word on that line has a small numbered " +
      "circular chip above it; the numbers and their words are listed in the " +
      "message. The finger approaches from BELOW and stops just under the word it " +
      "means, so the target is the word DIRECTLY ABOVE the fingertip — the word " +
      "VERTICALLY ALIGNED with the tip of the fingernail. Note the fingernail's " +
      "horizontal position, travel straight UP from it, and pick the chip of the " +
      "word you land on. Judge by that horizontal alignment only — never pick a " +
      "word because it is easier to read. Respond with STRICT JSON only: " +
      '{"found":true,"mark":3} — or {"found":false} if no pointing hand is visible.',
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
    if (process.env.POINT_DEBUG) console.log("[word raw]", raw);
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

/**
 * Streams the tutor response and emits each step VIA `onStep` the moment its
 * JSON object completes (REWORK 4) — so the client can show/narrate Step 1
 * while later steps are still generating. Resolves with all emitted steps.
 * (Assistant prefill is NOT used: claude-sonnet-4-6 rejects it; the strict-JSON
 * system prompt makes the model open with `{"steps": [` on its own, and
 * `stepsFromStream` parses the array elements incrementally.)
 */
export async function runTutor(
  { imageBase64, question, history, lines }: TutorRequest,
  onStep: (step: TutorStep, index: number) => void,
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
  const usableLines = lineMap.length > 0 ? lineMap : undefined;

  const data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
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
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages,
  });

  // `body` accumulates the model's output. We re-scan the steps array for
  // complete step objects on each delta and emit the newly-finished ones.
  let body = "";
  let emitted = 0;
  const all: TutorStep[] = [];
  const flush = () => {
    const objs = stepsFromStream(body);
    while (emitted < objs.length) {
      const step = parseStepObject(objs[emitted], usableLines);
      emitted += 1;
      if (step) {
        all.push(step);
        onStep(step, all.length - 1);
      }
    }
  };

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      body += event.delta.text;
      flush();
    }
  }

  // Fallback if deltas never fired (non-streaming path): rebuild from final.
  if (body === "") {
    const final = await stream.finalMessage();
    body = final.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    flush();
  }

  return all;
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

/**
 * Mid-explanation clarification (conversation-aware tutoring): the student
 * interrupted at `stepIndex` to ask something. Answer JUST that, briefly, so
 * the narration can resume where it paused — the explanation is NOT restarted,
 * so this must not re-teach the whole problem.
 */
export async function clarifyQuestion(opts: {
  imageBase64: string;
  question: string;
  history?: TutorTurn[];
  /** The sentence the tutor was saying when the student cut in. */
  currentStep?: string;
}): Promise<string> {
  const data = opts.imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const context = opts.currentStep
    ? `You were part-way through explaining, and had just said: "${opts.currentStep}"\n\n`
    : "";

  const response = await client().messages.create({
    model: TUTOR_MODEL,
    max_tokens: 300,
    system:
      "You are the same patient tutor helping a primary-school student in Singapore with " +
      "dyslexia/ADHD, working through the worksheet in the photo. The student has INTERRUPTED " +
      "your step-by-step explanation to ask something, and you will carry on from exactly where " +
      "you paused as soon as you have answered.\n\n" +
      "Answer ONLY what they just asked — do not restart the explanation, do not summarize what " +
      "you already covered, and do not race ahead to later steps. One or two short spoken " +
      "sentences, simple words, no lists, no markdown, no LaTeX. If they are asking about a word " +
      "or symbol on the page, say what it means in plain language. Never comment on their ability " +
      "or emotions. Reply with the spoken answer as PLAIN TEXT only — no JSON, no quotes.",
    messages: [
      ...(opts.history ?? []).map((t) => ({ role: t.role, content: t.content })),
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: `${context}The student asks: ${opts.question}` },
          {
            type: "image" as const,
            source: { type: "base64" as const, media_type: sniffMediaType(data), data },
          },
        ],
      },
    ],
  });

  return stripMarkdown(
    response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim(),
  );
}

export type GroupIntent =
  | { action: "review"; days: number }
  | { action: "report" }
  | { action: "help" }
  /** Any other on-topic request answered freely from the child's data
   *  ("what should they practise?", "how do I help him with this word?").
   *  `word` is set when the message is about ONE specific word, so the caller
   *  can supply a DETERMINISTIC syllable split instead of letting the model
   *  invent one (it produced "non + corr + osive" for noncorrosive). */
  | { action: "ask"; days: number; word?: string }
  | { action: "other" };

/**
 * Answer a free-form question about the child's practice, GROUNDED in the
 * event aggregates (Telegram group, custom prompts). The stats text is the
 * only evidence available to the model — anything not derivable from it must
 * be declined rather than invented, so a parent never gets a confident answer
 * built on nothing. Same indicators-not-diagnosis rule as the review path.
 */
export async function answerGroupQuestion(
  question: string,
  aggregateText: string,
  /** Deterministic syllable split for the word the question is about, from
   *  lib/syllables.ts. Supplied as FACT so the model never invents one. */
  wordBreakdown?: { word: string; syllables: string[] },
): Promise<string> {
  const facts = wordBreakdown
    ? `\n\nVERIFIED WORD BREAKDOWN (use EXACTLY this, do not alter it):\n` +
      `${wordBreakdown.word} = ${wordBreakdown.syllables.join(" · ")}`
    : "";

  const response = await client().messages.create({
    model: TUTOR_MODEL,
    max_tokens: 900,
    system:
      "You are a reading-practice assistant answering a parent's or teacher's question in a " +
      "Telegram group. You support a child who practises reading with an assistive app for " +
      "dyslexia/ADHD. The ONLY evidence you have is the session-statistics block in the message " +
      "(counts of words read and re-read, stuck words, grapheme patterns, pacing, quiz results).\n\n" +
      "RULES:\n" +
      "- Answer the question directly, using the statistics as evidence. Quote specific words or " +
      "numbers from the data when they support a point.\n" +
      "- If the question asks for practice ideas or next steps, base them on the actual stuck " +
      "words and grapheme patterns in the data — concrete, doable at home in a few minutes.\n" +
      "- If the data cannot answer the question, say plainly what is not tracked and offer the " +
      "closest thing you CAN report. Never invent numbers, sessions, or observations.\n" +
      "- Report study patterns only: NEVER make emotional or clinical claims, never diagnose, " +
      "never speculate about the child's feelings, ability, or conditions.\n\n" +
      "WORDS AND SPELLING — this app teaches reading, so a wrong breakdown does real harm:\n" +
      "- NEVER invent a syllable split, a phoneme breakdown, or a pronunciation. Only use a " +
      "VERIFIED WORD BREAKDOWN if one is given to you below, copied exactly as written.\n" +
      "- If you are asked to break down a word and no verified breakdown is supplied, say you " +
      "cannot split that one reliably and point them to Stuck-Word Autopsy in the app, which " +
      "sounds words out from a checked phonics table. Do not guess.\n" +
      "- Do NOT explain why a word is spelled as it is, and do not call words compounds or root " +
      "forms. The words come from scanned worksheets and may carry OCR artifacts (a lost hyphen " +
      "or space can join two words), so their spelling is not evidence of anything.\n\n" +
      "LENGTH AND TONE — this is a chat reply on a phone, not a report:\n" +
      "- BE SHORT. Aim for 50-90 words. Never exceed 130. There is no exception to this.\n" +
      "- Answer in the FIRST sentence. No preamble ('Good question', 'Let me explain'), no " +
      "restating the question back, no closing summary or sign-off.\n" +
      "- Most answers are one short paragraph with NO sections at all. Use sections only if you " +
      "genuinely have two or three separate points, and then at most three, each one emoji + a " +
      "Title Case label on its own line followed by ONE sentence.\n" +
      "- State a limitation of the data in a single clause, only when it changes the answer. " +
      "Never give it its own section, and never explain how the logging works.\n" +
      "- Cut every sentence the reader cannot act on.\n\n" +
      "FORMATTING (Telegram plain text — no Markdown):\n" +
      "- No **, no ##, no backticks, no bullet dashes at line start.",
    messages: [{ role: "user", content: `QUESTION: ${question}\n\n${aggregateText}${facts}` }],
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
        '{"action":"review","days":7} for a GENERAL "how did they do" summary over a period ' +
        "(map 'today'→1, 'this week'/'past week'→7, 'this month'→30; default 7 if unspecified);\n" +
        '{"action":"report"} ONLY when they explicitly ask for the latest/most recent SESSION ' +
        '(e.g. "show me the last session", "latest session stats") — this returns a raw numbers ' +
        "dump, so never use it for a question that deserves a written answer;\n" +
        '{"action":"help"} for what the bot can do;\n' +
        '{"action":"ask","days":7,"word":"<word>"} for ANY other message about this child, ' +
        "their reading, their difficulties, or HOW TO HELP THEM. This is the default for anything " +
        "on-topic. It covers: practice and exercise suggestions; insights or analysis; which words " +
        "or letter patterns they struggle with; whether they are improving; what to do next; how " +
        "to help with a particular word; explaining a word's parts or how to sound it out; " +
        "requests to explain, expand on, or go deeper on something already said. Use the same day " +
        'mapping (default 7). Include "word" ONLY when the message is about one specific word — ' +
        "copy that word as plain letters with no hyphens or spaces (so \"non-cor-ro-sive\" → " +
        '"noncorrosive"); omit "word" otherwise.\n' +
        '{"action":"other"} ONLY when the message has nothing to do with this child or their ' +
        "reading — jokes, weather, sport, general chit-chat, unrelated topics. If the message " +
        "mentions the child, a word they read, or asks for help/teaching of any kind, it is " +
        "\"ask\", NOT \"other\". When unsure, choose \"ask\".",
      messages: [{ role: "user", content: text.slice(0, 300) }],
    });
    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as {
      action?: string;
      days?: unknown;
      word?: unknown;
    };
    const days = Number(parsed.days);
    const window = Number.isFinite(days) && days > 0 ? Math.min(365, days) : 7;
    // A word is only useful if it is a plain alphabetic token — the caller
    // feeds it to syllablesOf(), which operates on letters.
    const word =
      typeof parsed.word === "string" && /^[a-zA-Z]{2,}$/.test(parsed.word.replace(/[^a-zA-Z]/g, ""))
        ? parsed.word.replace(/[^a-zA-Z]/g, "").toLowerCase()
        : undefined;
    if (parsed.action === "review") return { action: "review", days: window };
    if (parsed.action === "ask") return { action: "ask", days: window, word };
    if (parsed.action === "report") return { action: "report" };
    if (parsed.action === "help") return { action: "help" };
    return { action: "other" };
  } catch {
    return { action: "other" };
  }
}
