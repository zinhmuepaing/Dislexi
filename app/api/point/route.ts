/**
 * POST /api/point — visual pointing (amended §7 rule 3 #2). Two modes:
 *
 * SET-OF-MARKS (preferred; branch feature/set-of-marks-pointing):
 *   { imageBase64, marks: [{n, text}] } → { found: true, mark, word } | { found: false }
 *   The frame arrives with numbered chips composited at each OCR line
 *   (lib/marks.ts); the model CLASSIFIES which marked line the finger points
 *   at (+ the word it sees) instead of regressing coordinates — which was
 *   systematically selecting lines below the finger.
 *
 *   With { granularity: "word" } the chips sit above each word of one already-
 *   picked line and the model answers { found: true, mark } only — pure
 *   classification, no word reading (the fingertip occludes its target).
 *
 * COORDINATE (legacy/revert path):
 *   { imageBase64 } → { found: true, x, y } | { found: false }
 *
 * The route never calls the vendor directly (adapter only); the caller
 * resolves against OCR boxes and speaks OCR text VERBATIM.
 */

import { NextRequest, NextResponse } from "next/server";
import { locatePointer, locatePointedMark, locatePointedWordMark } from "@/lib/tutor-model";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(req: NextRequest) {
  let body: { imageBase64?: unknown; marks?: unknown; granularity?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.imageBase64 !== "string" || !body.imageBase64) {
    return NextResponse.json({ error: "imageBase64 (string) is required" }, { status: 400 });
  }

  const marks = Array.isArray(body.marks)
    ? body.marks
        .filter(
          (m): m is { n: number; text: string } =>
            typeof m === "object" && m !== null &&
            Number.isFinite(Number((m as { n?: unknown }).n)) &&
            typeof (m as { text?: unknown }).text === "string",
        )
        .map((m) => ({ n: Math.trunc(Number(m.n)), text: m.text }))
    : [];

  try {
    if (marks.length > 0) {
      const choice =
        body.granularity === "word"
          ? await locatePointedWordMark(body.imageBase64, marks)
          : await locatePointedMark(body.imageBase64, marks);
      return NextResponse.json(choice ? { found: true, ...choice } : { found: false });
    }
    const point = await locatePointer(body.imageBase64);
    return NextResponse.json(point ? { found: true, ...point } : { found: false });
  } catch (err) {
    console.error("/api/point failed:", err);
    return NextResponse.json({ found: false });
  }
}
