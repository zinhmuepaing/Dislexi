/**
 * POST /api/sessions — { mode } → { sessionId }
 * Creates a session row (ARCHITECTURE.md §5.6).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase, SessionMode } from "@/lib/supabase";

export const runtime = "nodejs";

const MODES: SessionMode[] = ["exam_prep", "tutoring", "autopsy"];

export async function POST(req: NextRequest) {
  let mode: unknown;
  try {
    ({ mode } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof mode !== "string" || !MODES.includes(mode as SessionMode)) {
    return NextResponse.json(
      { error: `mode must be one of ${MODES.join(", ")}` },
      { status: 400 },
    );
  }

  const { data, error } = await supabase()
    .from("sessions")
    .insert({ mode })
    .select("id")
    .single();

  if (error) {
    console.error("/api/sessions insert failed:", error);
    return NextResponse.json({ error: "failed to create session" }, { status: 500 });
  }

  return NextResponse.json({ sessionId: data.id });
}
