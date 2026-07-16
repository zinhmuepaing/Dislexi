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

const TUTOR_MODEL = "claude-sonnet-4-6"; // vision-capable — a hard requirement for this route regardless of vendor

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

export interface TutorStep {
  say: string;
  region: TutorRegion;
}

export interface TutorTurn {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are a patient, encouraging tutor for a primary-school student in Singapore with dyslexia/ADHD. You are shown a photo of the worksheet lying in front of the student, plus their question about it.

Explain step by step, one small idea at a time, in simple spoken English suitable for a child. Guide the student to the answer; do not just state it. Never diagnose, never comment on the student's ability or emotions.

Respond with STRICT JSON only — no prose, no markdown fences, nothing outside the JSON object:

{"steps":[{"say":"<one short spoken sentence>","region":{"x":0.31,"y":0.42,"w":0.2,"h":0.06}}]}

Rules:
- "say": one short sentence to be read aloud. 2 to 6 steps total.
- "region": the rectangle on the worksheet image the step refers to, NORMALIZED to the image dimensions — x, y, w, h are all fractions between 0 and 1, where (x, y) is the top-left corner.
- Every step must have a region pointing at the exact part of the worksheet it talks about (the question text, a number, a diagram, a blank to fill).
- Follow-up questions continue the same worksheet; keep referring to regions on the same image.`;

/** Tolerant JSON extraction: strips code fences / stray prose, clamps regions to 0-1. */
export function parseSteps(raw: string): TutorStep[] {
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

  const clamp = (n: unknown) => Math.min(1, Math.max(0, Number(n) || 0));
  return rawSteps
    .map((s) => {
      const step = s as { say?: unknown; region?: Record<string, unknown> };
      const r = step.region ?? {};
      return {
        say: String(step.say ?? "").trim(),
        region: { x: clamp(r.x), y: clamp(r.y), w: clamp(r.w), h: clamp(r.h) },
      };
    })
    .filter((s) => s.say.length > 0);
}

export interface TutorRequest {
  imageBase64: string;
  question: string;
  history?: TutorTurn[];
}

/**
 * Streams the model's raw text through `onDelta` as it arrives, then resolves
 * with the parsed steps for the final SSE frame.
 */
export async function runTutor(
  { imageBase64, question, history }: TutorRequest,
  onDelta: (text: string) => void,
): Promise<TutorStep[]> {
  const prefixMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
  const mediaType = (prefixMatch?.[1] ?? "image/jpeg") as
    | "image/jpeg"
    | "image/png"
    | "image/webp"
    | "image/gif";
  const data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  const messages: Anthropic.MessageParam[] = [
    ...(history ?? []).map((t) => ({ role: t.role, content: t.content })),
    {
      role: "user" as const,
      content: [
        // Text BEFORE image — per the DeskTutor reference, the model reads the
        // question first, which improves region accuracy.
        { type: "text" as const, text: question },
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
  return parseSteps(fullText);
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
