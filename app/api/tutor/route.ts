/**
 * POST /api/tutor — { imageBase64, question, history?, lines? } → SSE stream
 * (REWORK 4, incremental): one frame PER STEP as it finishes generating, then
 * a done frame:
 *   data: {"step":{"say":...,"region":{x,y,w,h},"formula"?,"aids"?},"index":0}
 *   data: {"step":{...},"index":1}   … (Step 1 shows while later steps stream)
 *   data: {"done":true}
 *   data: [DONE]
 *
 * Proxies to the reasoning adapter (lib/tutor-model.ts). This route never
 * calls the vendor API directly, so swapping Claude back to Huawei Cloud MaaS
 * (lib/maas.ts, ARCHITECTURE.md §5.3) touches only the adapter.
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
        await runTutor(
          {
            imageBase64,
            question,
            history: Array.isArray(history) ? (history as TutorTurn[]) : undefined,
            // OCR line map (adapter sanitizes) — enables anchored regions/aids.
            lines: Array.isArray(lines) ? (lines as TutorLine[]) : undefined,
          },
          // Emit each step the instant it finishes generating.
          (step, index) => send({ step, index }),
        );
        send({ done: true });
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
