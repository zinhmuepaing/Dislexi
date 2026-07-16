/**
 * Telegram Bot API helpers (webhook mode — never polling; ARCHITECTURE.md §5.5).
 * Server-side only: TELEGRAM_BOT_TOKEN never reaches client code.
 */

function api(method: string): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured");
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function call<T = unknown>(method: string, body: FormData | object): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(api(method), {
    method: "POST",
    headers: isForm ? undefined : { "Content-Type": "application/json" },
    body: isForm ? body : JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description ?? res.status}`);
  }
  return data.result as T;
}

export function defaultChatId(): string {
  const id = process.env.TELEGRAM_DEFAULT_CHAT_ID;
  if (!id) throw new Error("TELEGRAM_DEFAULT_CHAT_ID not configured");
  return id;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export async function sendMessage(
  chatId: string | number,
  text: string,
  inlineKeyboard?: InlineKeyboardButton[][],
): Promise<void> {
  await call("sendMessage", {
    chat_id: chatId,
    text,
    ...(inlineKeyboard ? { reply_markup: { inline_keyboard: inlineKeyboard } } : {}),
  });
}

/** Send a file (PDF/XLSX report) via multipart sendDocument. */
export async function sendDocument(
  chatId: string | number,
  file: Blob,
  filename: string,
  caption?: string,
): Promise<void> {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", file, filename);
  if (caption) form.append("caption", caption);
  await call("sendDocument", form);
}

/** Acknowledge an inline-keyboard button press (stops the client spinner). */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await call("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}
