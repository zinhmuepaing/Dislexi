/**
 * Register the Telegram webhook against a deployment (SETUP.md §3.5–3.6).
 * Run: npx tsx scripts/register-telegram-webhook.mts <https://your-domain>
 *
 * Reads TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET / TELEGRAM_DEFAULT_CHAT_ID
 * from .env.local; never prints them. After setWebhook it verifies the route:
 * a POST without the secret header must 401, and a synthetic /help update with
 * the header must 200 (the bot replies in the configured chat — visible test).
 */

import { readFileSync } from "node:fs";

const base = process.argv[2]?.replace(/\/$/, "");
if (!base?.startsWith("https://")) {
  console.error("usage: npx tsx scripts/register-telegram-webhook.mts https://<domain>");
  process.exit(1);
}

const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/\s+#.*$/, "").trim().replace(/^"(.*)"$/, "$1");
}
const token = env.TELEGRAM_BOT_TOKEN;
const secret = env.TELEGRAM_WEBHOOK_SECRET;
const chatId = env.TELEGRAM_DEFAULT_CHAT_ID;
if (!token || !secret || !chatId) {
  console.error("TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET / TELEGRAM_DEFAULT_CHAT_ID missing in .env.local");
  process.exit(1);
}

const webhookUrl = `${base}/api/telegram/webhook`;

const set = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: webhookUrl, secret_token: secret }),
});
const setJson = (await set.json()) as { ok: boolean; description?: string };
console.log(`setWebhook: ok=${setJson.ok} — ${setJson.description ?? ""}`);

const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
const infoJson = (await info.json()) as {
  result?: { url: string; pending_update_count: number; last_error_message?: string };
};
console.log(
  `getWebhookInfo: url=${infoJson.result?.url} pending=${infoJson.result?.pending_update_count} ` +
    `last_error=${infoJson.result?.last_error_message ?? "none"}`,
);

// Secret validation: no header must be rejected…
const noSecret = await fetch(webhookUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: { chat: { id: 0 }, text: "/help" } }),
});
console.log(`POST without secret header: ${noSecret.status} (expect 401)`);

// …and a correct header must reach the handler (bot replies /help in the chat).
const withSecret = await fetch(webhookUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Telegram-Bot-Api-Secret-Token": secret,
  },
  body: JSON.stringify({ message: { chat: { id: Number(chatId) }, text: "/help" } }),
});
console.log(`POST with secret header: ${withSecret.status} (expect 200 + /help reply in chat)`);

const ok = setJson.ok && noSecret.status === 401 && withSecret.status === 200;
console.log(ok ? "WEBHOOK REGISTERED AND VERIFIED" : "WEBHOOK CHECK FAILED");
process.exit(ok ? 0 : 1);
