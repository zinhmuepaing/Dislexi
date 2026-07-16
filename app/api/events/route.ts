/**
 * POST /api/events — { sessionId, events: [...] } → { ok: true }
 * Batch-inserts session events (client batches every ~5s and on session end).
 * Only typed events reach Supabase — never raw audio (ARCHITECTURE.md §7 rule 8).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase, SessionEvent } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { sessionId?: unknown; events?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { sessionId, events } = body;
  if (typeof sessionId !== "string" || !Array.isArray(events) || events.length === 0) {
    return NextResponse.json(
      { error: "sessionId (string) and non-empty events (array) are required" },
      { status: 400 },
    );
  }

  const rows = (events as SessionEvent[]).map((e) => ({
    session_id: sessionId,
    type: e.type,
    word: e.word ?? null,
    grapheme: e.grapheme ?? null,
    question_ref: e.question_ref ?? null,
    payload: e.payload ?? {},
    ...(e.ts ? { ts: e.ts } : {}),
  }));

  const { error } = await supabase().from("events").insert(rows);
  if (error) {
    console.error("/api/events insert failed:", error);
    return NextResponse.json({ error: "failed to insert events" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
