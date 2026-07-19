/**
 * POST /api/review — in-app parity for the Telegram review flow (REWORK 3 P4).
 *
 * Body: { days?: number, date?: "YYYY-MM-DD" | "YYYY-MM", send?: boolean }
 * → { label, summary, stats }  (and, when send=true, delivers the summary to
 *    the configured parent chat on Telegram).
 *
 * Reuses the same server-side aggregation + summariser as the bot, so the
 * app and the bot say the same thing. Never calls the vendor API directly.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { computeStats, statsToText, EventRow, SessionStats } from "@/lib/analytics";
import { summarizeStudyPatterns } from "@/lib/tutor-model";
import { sendMessage, defaultChatId } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

function range(body: { days?: unknown; date?: unknown }): { start: string; end: string; label: string } {
  if (typeof body.date === "string") {
    const m = body.date.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (m) {
      const [, y, mo, d] = m;
      const start = new Date(Date.UTC(Number(y), Number(mo) - 1, d ? Number(d) : 1));
      const end = d
        ? new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d) + 1))
        : new Date(Date.UTC(Number(y), Number(mo), 1));
      return { start: start.toISOString(), end: end.toISOString(), label: body.date };
    }
  }
  const days = Number(body.days);
  const n = Number.isFinite(days) && days > 0 ? Math.min(365, days) : 7;
  return {
    start: new Date(Date.now() - n * 86_400_000).toISOString(),
    end: new Date().toISOString(),
    label: `last ${n} days`,
  };
}

export async function POST(req: NextRequest) {
  let body: { days?: unknown; date?: unknown; send?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { start, end, label } = range(body);

  const { data: events, error } = await supabase()
    .from("events")
    .select("ts, type, word, grapheme, question_ref, payload")
    .gte("ts", start)
    .lt("ts", end)
    .order("ts", { ascending: true });

  if (error) {
    console.error("/api/review query failed:", error);
    return NextResponse.json({ error: "could not load data" }, { status: 502 });
  }

  const stats: SessionStats = computeStats((events ?? []) as EventRow[]);
  if (!events || events.length === 0) {
    return NextResponse.json({ label, summary: `No practice recorded for ${label}.`, stats });
  }

  let summary: string;
  try {
    summary = await summarizeStudyPatterns(statsToText(stats, label));
  } catch (err) {
    console.error("/api/review summary failed:", err);
    summary = statsToText(stats, label); // fall back to raw aggregate
  }

  if (body.send === true) {
    try {
      await sendMessage(defaultChatId(), `Review — ${label}\n\n${summary}`);
    } catch (err) {
      console.error("/api/review send failed:", err);
      return NextResponse.json({ label, summary, stats, sent: false, sendError: true });
    }
    return NextResponse.json({ label, summary, stats, sent: true });
  }

  return NextResponse.json({ label, summary, stats });
}
