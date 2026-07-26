/**
 * POST /api/clarify — { imageBase64, question, history?, currentStep? } → { say }
 *
 * Mid-explanation clarification for AI Tutoring: the student interrupted the
 * narration to ask something. This returns ONE short spoken answer so the
 * client can speak it and then RESUME the paused narration — the explanation
 * is never restarted (that was the whole complaint).
 *
 * Adapter only (lib/tutor-model.ts) — the route never calls the vendor.
 */

import { NextRequest, NextResponse } from "next/server";
import { clarifyQuestion, TutorTurn } from "@/lib/tutor-model";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: {
    imageBase64?: unknown;
    question?: unknown;
    history?: unknown;
    currentStep?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { imageBase64, question } = body;
  if (typeof imageBase64 !== "string" || typeof question !== "string" || !question.trim()) {
    return NextResponse.json(
      { error: "imageBase64 and question (strings) are required" },
      { status: 400 },
    );
  }

  try {
    const say = await clarifyQuestion({
      imageBase64,
      question,
      history: Array.isArray(body.history) ? (body.history as TutorTurn[]) : undefined,
      currentStep: typeof body.currentStep === "string" ? body.currentStep : undefined,
    });
    return NextResponse.json({ say });
  } catch (err) {
    console.error("/api/clarify failed:", err);
    return NextResponse.json({ error: "clarify failed" }, { status: 500 });
  }
}
