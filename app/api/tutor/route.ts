/**
 * POST /api/tutor — { imageBase64, question, history? } → SSE stream:
 *   data: {"delta":"<text chunk>"}     (repeated as tokens arrive)
 *   data: {"steps":[{"say":...,"region":{x,y,w,h}}]}   (final frame, regions 0-1)
 *   data: [DONE]
 *
 * Proxies to the reasoning adapter (lib/tutor-model.ts). This route never
 * calls the vendor API directly, so swapping Claude back to Huawei Cloud MaaS
 * (lib/maas.ts, ARCHITECTURE.md §5.3) touches only the adapter. The SSE
 * contract above is fixed either way.
 */

import { NextRequest } from "next/server";
import { runTutor, TutorTurn, TutorLine } from "@/lib/tutor-model";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { imageBase64?: unknown; question?: unknown; history?: unknown; lines?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400 });
  }

  const { imageBase64, question, history, lines } = body;
  if (typeof imageBase64 !== "string" || typeof question !== "string" || !question.trim()) {
    return new Response(
      JSON.stringify({ error: "imageBase64 and question (strings) are required" }),
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

      try {
        const steps = await runTutor(
          {
            imageBase64,
            question,
            history: Array.isArray(history) ? (history as TutorTurn[]) : undefined,
            // OCR line map (adapter sanitizes) — enables anchored regions/aids.
            lines: Array.isArray(lines) ? (lines as TutorLine[]) : undefined,
          },
          (delta) => send({ delta }),
        );
        send({ steps });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        console.error("/api/tutor failed:", err);
        send({ error: "tutoring failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
