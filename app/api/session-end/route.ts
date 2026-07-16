/**
 * POST /api/session-end — { sessionId } → { stats }
 * Closes the session (sets ended_at) and returns the aggregate stats the
 * analytics page renders (ARCHITECTURE.md §5.6, §8 Exam-Prep flow).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { computeStats, EventRow } from "@/lib/analytics";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let sessionId: unknown;
  try {
    ({ sessionId } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof sessionId !== "string") {
    return NextResponse.json({ error: "sessionId (string) is required" }, { status: 400 });
  }

  const db = supabase();

  const { error: updateError } = await db
    .from("sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (updateError) {
    console.error("/api/session-end update failed:", updateError);
    return NextResponse.json({ error: "failed to close session" }, { status: 500 });
  }

  const { data: events, error: eventsError } = await db
    .from("events")
    .select("ts, type, word, grapheme, question_ref")
    .eq("session_id", sessionId)
    .order("ts", { ascending: true });
  if (eventsError) {
    console.error("/api/session-end events query failed:", eventsError);
    return NextResponse.json({ error: "failed to load events" }, { status: 500 });
  }

  return NextResponse.json({ stats: computeStats((events ?? []) as EventRow[]) });
}
