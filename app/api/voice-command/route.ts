/**
 * POST /api/voice-command — { utterance } → { intent, scope? }
 *
 * LLM intent parsing for voice requests the client keyword fast-path could
 * not classify (amended §7 rule 3: intent ONLY — the model never touches the
 * text that gets read aloud). Proxies to the reasoning adapter
 * (lib/tutor-model.ts); routes never call the vendor API directly.
 */

import { NextRequest, NextResponse } from "next/server";
import { parseVoiceCommand } from "@/lib/tutor-model";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  let body: { utterance?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { utterance } = body;
  if (typeof utterance !== "string" || !utterance.trim() || utterance.length > 300) {
    return NextResponse.json(
      { error: "utterance (non-empty string ≤ 300 chars) is required" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await parseVoiceCommand(utterance));
  } catch (err) {
    console.error("/api/voice-command failed:", err);
    // Degrade to "none": the caller simply ignores the utterance.
    return NextResponse.json({ intent: "none" });
  }
}
