/**
 * POST /api/report-upload — multipart: pdf, xlsx, sessionId → { delivered: true }
 * Receives the client-generated PDF/XLSX reports and forwards them to the
 * configured Telegram chat via sendDocument (ARCHITECTURE.md §5.5).
 */

import { NextRequest, NextResponse } from "next/server";
import { defaultChatId, sendDocument } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart form data required" }, { status: 400 });
  }

  const pdf = form.get("pdf");
  const xlsx = form.get("xlsx");
  const sessionId = form.get("sessionId");

  if (!(pdf instanceof Blob) || !(xlsx instanceof Blob) || typeof sessionId !== "string") {
    return NextResponse.json(
      { error: "pdf (file), xlsx (file) and sessionId (string) are required" },
      { status: 400 },
    );
  }

  try {
    const chatId = defaultChatId();
    const stamp = new Date().toISOString().slice(0, 10);
    await sendDocument(chatId, pdf, `session-report-${stamp}.pdf`, "Session report (PDF)");
    await sendDocument(chatId, xlsx, `session-stats-${stamp}.xlsx`, "Session statistics (XLSX)");
  } catch (err) {
    console.error("/api/report-upload delivery failed:", err);
    // Pass the real reason through (Telegram description / config error) so
    // the client can show something actionable instead of a blind failure.
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Telegram delivery failed", detail }, { status: 502 });
  }

  return NextResponse.json({ delivered: true });
}
