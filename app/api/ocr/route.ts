/**
 * POST /api/ocr — { imageBase64 } → { blocks: [{ text, confidence, box: [[x,y]x4] }] }
 *
 * Proxies to the OCR adapter (lib/ocr.ts). This route never calls the vendor
 * API directly, so swapping Azure AI Vision back to Huawei Cloud OCR
 * (lib/huawei-ocr.ts, ARCHITECTURE.md §5.1) touches only the adapter.
 */

import { NextRequest, NextResponse } from "next/server";
import { recognizeText } from "@/lib/ocr";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let imageBase64: unknown;
  try {
    ({ imageBase64 } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    return NextResponse.json({ error: "imageBase64 (string) is required" }, { status: 400 });
  }

  try {
    const result = await recognizeText(imageBase64);
    return NextResponse.json(result);
  } catch (err) {
    console.error("/api/ocr failed:", err);
    return NextResponse.json({ error: "OCR failed" }, { status: 502 });
  }
}
