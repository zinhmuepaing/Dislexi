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
import { answerCallbackQuery, sendMessage, botUsername } from "@/lib/telegram";
import { summarizeStudyPatterns, classifyGroupRequest } from "@/lib/tutor-model";

export const runtime = "nodejs";
export const maxDuration = 60;

interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

interface TelegramUpdate {
  message?: {
    chat: { id: number; type?: string };
    from?: TelegramUser;
    text?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    from?: TelegramUser;
    message?: { chat: { id: number; type?: string } };
  };
}

/** How to address a user in a reply so they're tagged (item 5). */
function addressee(from?: TelegramUser): string {
  if (from?.username) return `@${from.username}`;
  return from?.first_name?.trim() || "there";
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
      const chat = update.message.chat;
      const isGroup = chat.type === "group" || chat.type === "supergroup";
      if (isGroup) {
        await handleGroupMessage(chat.id, update.message.text, update.message.from);
      } else {
        await handleDirectMessage(chat.id, update.message.text.trim());
      }
    } else if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat.id;
      const isGroup =
        cq.message?.chat.type === "group" || cq.message?.chat.type === "supergroup";
      // In a group, tag whoever tapped the button (item 5).
      const prefix = isGroup ? `${addressee(cq.from)} — ` : "";
      await answerCallbackQuery(cq.id);
      const match = cq.data?.match(/^review:(\d+)$/);
      if (chatId && cq.data === "review:pick") {
        await sendMessage(chatId, `${prefix}Send a date as YYYY-MM-DD (or YYYY-MM for a monthly rollup).`);
      } else if (chatId && match) {
        await handleReview(chatId, Number(match[1]), prefix);
      }
    }
  } catch (err) {
    // Log but still 200 — Telegram retries non-2xx aggressively.
    console.error("/api/telegram/webhook handler failed:", err);
  }

  return NextResponse.json({ ok: true });
}

/** Direct-message (1:1) handling — no mention needed. */
async function handleDirectMessage(chatId: number, text: string): Promise<void> {
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
}

/**
 * Group handling (item 5): humans chat normally; the bot only acts when it is
 * @mentioned (or a command targets it). It classifies the request, replies
 * tagging the asker, and politely declines anything off-topic.
 */
async function handleGroupMessage(
  chatId: number,
  rawText: string,
  from?: TelegramUser,
): Promise<void> {
  const username = (await botUsername()).toLowerCase();
  const lower = rawText.toLowerCase();
  const mentioned = username.length > 0 && lower.includes(`@${username}`);
  const isCommand = rawText.trim().startsWith("/");
  if (!mentioned && !isCommand) return; // normal human conversation — stay silent

  // Strip the @mention and any /command@bot suffix to get the real request.
  const request = rawText
    .replace(new RegExp(`@${username}`, "ig"), "")
    .replace(/\/(\w+)(@\w+)?/g, "$1")
    .trim();
  const tag = addressee(from);

  const dateMatch = request.match(/(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (/^(start|help)\b/i.test(request) || request === "") {
    await sendMessage(chatId, `${tag} — hi! I can review a child's reading practice. Pick a range:`, REVIEW_KEYBOARD);
    return;
  }
  if (/^report\b/i.test(request)) {
    await handleLatestReport(chatId, `${tag} — `);
    return;
  }
  if (dateMatch) {
    const [, y, m, d] = dateMatch;
    const start = new Date(Date.UTC(Number(y), Number(m) - 1, d ? Number(d) : 1));
    const end = d
      ? new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + 1))
      : new Date(Date.UTC(Number(y), Number(m), 1));
    await reviewRange(chatId, start.toISOString(), end.toISOString(), dateMatch[0], `${tag} — `);
    return;
  }

  // Free-text: let the classifier decide (dynamic handling + polite refusal).
  const intent = await classifyGroupRequest(request);
  switch (intent.action) {
    case "review":
      await handleReview(chatId, intent.days, `${tag} — `);
      break;
    case "report":
      await handleLatestReport(chatId, `${tag} — `);
      break;
    case "help":
      await sendMessage(chatId, `${tag} — I review reading practice. Pick a range:`, REVIEW_KEYBOARD);
      break;
    default:
      await sendMessage(
        chatId,
        `${tag} — I can't help with that, but I can show how the child's reading practice is going. Try “@${username} how did they do this week?” or pick a range:`,
        REVIEW_KEYBOARD,
      );
  }
}

async function handleReview(chatId: number, days: number, prefix = ""): Promise<void> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  await reviewRange(chatId, since, new Date().toISOString(), `last ${days} days`, prefix);
}

async function reviewRange(
  chatId: number,
  startIso: string,
  endIso: string,
  label: string,
  prefix = "",
): Promise<void> {
  const { data: events, error } = await supabase()
    .from("events")
    .select("ts, type, word, grapheme, question_ref")
    .gte("ts", startIso)
    .lt("ts", endIso)
    .order("ts", { ascending: true });

  if (error) {
    console.error("review query failed:", error);
    await sendMessage(chatId, `${prefix}Sorry, I couldn't load the data. Try again later.`);
    return;
  }
  if (!events || events.length === 0) {
    await sendMessage(chatId, `${prefix}No practice sessions recorded for ${label}.`);
    return;
  }

  const aggregate = statsToText(computeStats(events as EventRow[]), label);

  try {
    const review = await summarizeStudyPatterns(aggregate);
    await sendMessage(chatId, prefix ? `${prefix}\n${review}` : review);
  } catch (err) {
    // Model unavailable — fall back to the raw aggregates rather than nothing.
    console.error("review summary failed:", err);
    await sendMessage(chatId, `${prefix}${aggregate}`);
  }
}

/** /report — stats text for the most recent session (files are client-generated). */
async function handleLatestReport(chatId: number, prefix = ""): Promise<void> {
  const db = supabase();
  const { data: session, error } = await db
    .from("sessions")
    .select("id, mode, started_at")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !session) {
    if (error) console.error("/report session query failed:", error);
    await sendMessage(chatId, `${prefix}No sessions recorded yet.`);
    return;
  }

  const { data: events, error: eventsError } = await db
    .from("events")
    .select("ts, type, word, grapheme, question_ref")
    .eq("session_id", session.id)
    .order("ts", { ascending: true });

  if (eventsError) {
    console.error("/report events query failed:", eventsError);
    await sendMessage(chatId, `${prefix}Sorry, I couldn't load the data. Try again later.`);
    return;
  }

  await sendMessage(
    chatId,
    `${prefix}${statsToText(
      computeStats((events ?? []) as EventRow[]),
      `latest session — ${session.mode}, ${session.started_at}`,
    )}`,
  );
}
