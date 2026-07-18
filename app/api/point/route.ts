/**
 * POST /api/point — { imageBase64 } → { found: true, x, y } | { found: false }
 *
 * Visual pointing (amended §7 rule 3 #2): a vision model locates the tip of
 * the student's pointing finger (normalized 0–1, top-left origin). Replaces
 * MediaPipe for selection — robust to the back-of-hand / fingernail view the
 * mirror-clip camera sees. The route never calls the vendor directly
 * (adapter only); the caller maps the point to an OCR word read VERBATIM.
 */

import { NextRequest, NextResponse } from "next/server";
import { locatePointer } from "@/lib/tutor-model";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(req: NextRequest) {
  let body: { imageBase64?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.imageBase64 !== "string" || !body.imageBase64) {
    return NextResponse.json({ error: "imageBase64 (string) is required" }, { status: 400 });
  }

  try {
    const point = await locatePointer(body.imageBase64);
    return NextResponse.json(point ? { found: true, ...point } : { found: false });
  } catch (err) {
    console.error("/api/point failed:", err);
    return NextResponse.json({ found: false });
  }
}
