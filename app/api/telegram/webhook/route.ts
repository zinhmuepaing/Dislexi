/**
 * POST /api/telegram/webhook — Telegram update receiver (ARCHITECTURE.md §5.5).
 *
 * - Validates the X-Telegram-Bot-Api-Secret-Token header against
 *   TELEGRAM_WEBHOOK_SECRET on every call; rejects otherwise.
 * - /start: replies with the chat id (one-time parent onboarding) + review buttons.
 * - Inline-keyboard callback_query "review:<days>": aggregates events for the
 *   range from Supabase and replies with an LLM-written study-pattern review
 *   (via the reasoning adapter — temporary Claude substitution for
 *   MAAS_TEXT_MODEL; see lib/tutor-model.ts).
 * - Responds 200 fast; work is done inline (calls are short).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { computeStats, statsToText, EventRow } from "@/lib/analytics";
import { answerCallbackQuery, sendMessage } from "@/lib/telegram";
import { summarizeStudyPatterns } from "@/lib/tutor-model";

export const runtime = "nodejs";
export const maxDuration = 60;

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number } };
  };
}

const REVIEW_KEYBOARD = [
  [
    { text: "Last 7 days", callback_data: "review:7" },
    { text: "Last 30 days", callback_data: "review:30" },
    { text: "Pick a date", callback_data: "review:pick" },
  ],
];

const HELP_TEXT = [
  "Commands:",
  "/start — show your chat id and the review buttons",
  "/help — this list",
  "/report — stats for the most recent session",
  "",
  "Reviews: tap a button, or send a date as YYYY-MM-DD (or YYYY-MM for a monthly rollup).",
].join("\n");

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // 200 fast even on junk — don't make Telegram retry
  }

  try {
    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();
      const dateMatch = text.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
      if (text.startsWith("/start")) {
        await sendMessage(
          chatId,
          `Hi! I deliver reading-session reports.\n\nYour chat id is ${chatId} — put it in TELEGRAM_DEFAULT_CHAT_ID.\n\nAsk for a review any time:`,
          REVIEW_KEYBOARD,
        );
      } else if (text.startsWith("/help")) {
        await sendMessage(chatId, HELP_TEXT);
      } else if (text.startsWith("/report")) {
        await handleLatestReport(chatId);
      } else if (dateMatch) {
        const [, y, m, d] = dateMatch;
        const start = new Date(Date.UTC(Number(y), Number(m) - 1, d ? Number(d) : 1));
        const end = d
          ? new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + 1))
          : new Date(Date.UTC(Number(y), Number(m), 1));
        await reviewRange(chatId, start.toISOString(), end.toISOString(), text);
      } else {
        await sendMessage(chatId, "Pick a review range:", REVIEW_KEYBOARD);
      }
    } else if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat.id;
      await answerCallbackQuery(cq.id);
      const match = cq.data?.match(/^review:(\d+)$/);
      if (chatId && cq.data === "review:pick") {
        await sendMessage(chatId, "Send a date as YYYY-MM-DD (or YYYY-MM for a monthly rollup).");
      } else if (chatId && match) {
        await handleReview(chatId, Number(match[1]));
      }
    }
  } catch (err) {
    // Log but still 200 — Telegram retries non-2xx aggressively.
    console.error("/api/telegram/webhook handler failed:", err);
  }

  return NextResponse.json({ ok: true });
}

async function handleReview(chatId: number, days: number): Promise<void> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  await reviewRange(chatId, since, new Date().toISOString(), `last ${days} days`);
}

async function reviewRange(
  chatId: number,
  startIso: string,
  endIso: string,
  label: string,
): Promise<void> {
  const { data: events, error } = await supabase()
    .from("events")
    .select("ts, type, word, grapheme, question_ref")
    .gte("ts", startIso)
    .lt("ts", endIso)
    .order("ts", { ascending: true });

  if (error) {
    console.error("review query failed:", error);
    await sendMessage(chatId, "Sorry, I couldn't load the data. Try again later.");
    return;
  }
  if (!events || events.length === 0) {
    await sendMessage(chatId, `No practice sessions recorded for ${label}.`);
    return;
  }

  const aggregate = statsToText(computeStats(events as EventRow[]), label);

  try {
    const review = await summarizeStudyPatterns(aggregate);
    await sendMessage(chatId, review);
  } catch (err) {
    // Model unavailable — fall back to the raw aggregates rather than nothing.
    console.error("review summary failed:", err);
    await sendMessage(chatId, aggregate);
  }
}

/** /report — stats text for the most recent session (files are client-generated). */
async function handleLatestReport(chatId: number): Promise<void> {
  const db = supabase();
  const { data: session, error } = await db
    .from("sessions")
    .select("id, mode, started_at")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !session) {
    if (error) console.error("/report session query failed:", error);
    await sendMessage(chatId, "No sessions recorded yet.");
    return;
  }

  const { data: events, error: eventsError } = await db
    .from("events")
    .select("ts, type, word, grapheme, question_ref")
    .eq("session_id", session.id)
    .order("ts", { ascending: true });

  if (eventsError) {
    console.error("/report events query failed:", eventsError);
    await sendMessage(chatId, "Sorry, I couldn't load the data. Try again later.");
    return;
  }

  await sendMessage(
    chatId,
    statsToText(
      computeStats((events ?? []) as EventRow[]),
      `latest session — ${session.mode}, ${session.started_at}`,
    ),
  );
}
