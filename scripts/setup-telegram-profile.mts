/**
 * Configure @DislexiBot's public profile via the Bot API: command list, the
 * "what can this bot do?" description, and the short about text. (The profile
 * PHOTO and group-privacy toggle have no Bot API — owner sets those in
 * BotFather: /setuserpic, /setprivacy.)
 * Run: npx tsx scripts/setup-telegram-profile.mts
 */

import { readFileSync } from "node:fs";

const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/\s+#.*$/, "").trim().replace(/^"(.*)"$/, "$1");
}
const token = env.TELEGRAM_BOT_TOKEN;

async function call(method: string, body: object): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; description?: string };
  console.log(`${method}: ok=${json.ok}${json.ok ? "" : ` — ${json.description}`}`);
}

await call("setMyCommands", {
  commands: [
    { command: "start", description: "Show your chat id and the review buttons" },
    { command: "help", description: "List commands and how to ask for reviews" },
    { command: "report", description: "Stats for the most recent reading session" },
  ],
});

// Shown in the empty chat under "What can this bot do?"
await call("setMyDescription", {
  description:
    "I deliver Dislexi reading-session reports (PDF & XLSX) and study-pattern " +
    "reviews to parents.\n\nPress Start, then use /report for the latest session " +
    "or tap the review buttons for a 7-day, 30-day, or custom-date summary.\n\n" +
    "All insights are practice indicators derived from typed session events — " +
    "never audio, photos, or clinical claims.",
});

// The short "about" line on the bot's profile page.
await call("setMyShortDescription", {
  short_description:
    "Reading-session reports & reviews for Dislexi — assistive reading for dyslexic learners.",
});
