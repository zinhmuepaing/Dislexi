/**
 * Diagnose TELEGRAM_DEFAULT_CHAT_ID: prints the bot's username and whether
 * Telegram recognizes the configured chat. No secrets are printed.
 * Run: npx tsx scripts/diag-telegram-chat.mts
 */

import { readFileSync } from "node:fs";

const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/\s+#.*$/, "").trim().replace(/^"(.*)"$/, "$1");
}
const token = env.TELEGRAM_BOT_TOKEN;
const chatId = env.TELEGRAM_DEFAULT_CHAT_ID;

const me = await fetch(`https://api.telegram.org/bot${token}/getMe`);
const meJson = (await me.json()) as { ok: boolean; result?: { username: string } };
console.log(`bot: @${meJson.result?.username ?? "?"} (token ${meJson.ok ? "VALID" : "INVALID"})`);

console.log(`configured chat id: ${chatId.length} chars, numeric=${/^-?\d+$/.test(chatId)}`);
const chat = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ chat_id: /^-?\d+$/.test(chatId) ? Number(chatId) : chatId }),
});
const chatJson = (await chat.json()) as {
  ok: boolean;
  description?: string;
  result?: { type: string };
};
console.log(
  chatJson.ok
    ? `getChat: OK — type=${chatJson.result?.type}`
    : `getChat: FAILED — ${chatJson.description}`,
);
