# SETUP.md — Service Setup Guide

> Scope: this guide covers **Supabase**, **connecting Supabase to Vercel**, and the
> **Telegram bot + webhook**. (Vercel project creation, Azure resources, and the
> Anthropic API key are already done — see `.env.local.example` for where those
> values go.)

---

## 1. Supabase — database project, keys, and schema

Supabase hosts our Postgres database. The browser never talks to it; only our
`/api/*` routes do, using the **service-role key**.

### 1.1 Create the project

1. Go to <https://supabase.com> → **Start your project** → sign in with GitHub.
2. Click **New project**.
3. Pick your organization, then fill in:
   - **Name**: `dislexi` (anything works)
   - **Database password**: click **Generate a password** and save it somewhere
     safe (you won't need it day-to-day, but you need it for direct DB access).
   - **Region**: **Southeast Asia (Singapore)** — keep data close to users.
4. Click **Create new project** and wait ~2 minutes for provisioning.

### 1.2 Get the connection URL and service-role key

1. In the project dashboard, open **Settings** (gear icon) → **API**.
2. Copy two values:
   - **Project URL** (looks like `https://abcdefghijkl.supabase.co`)
     → this is `SUPABASE_URL`.
   - Under **Project API keys**, reveal and copy **`service_role`** (labelled
     "secret") → this is `SUPABASE_SERVICE_ROLE_KEY`.

> ⚠️ **Use the `service_role` key, not the `anon` key.** The service-role key
> bypasses row-level security and must **never** appear in client code or be
> committed to git. In this project it is only ever read inside `lib/supabase.ts`,
> which runs on the server.

### 1.3 Run the SQL schema (ARCHITECTURE.md §5.6)

1. In the left sidebar, open **SQL Editor** → **New query**.
2. Paste the following exactly, then click **Run**:

```sql
create table sessions (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('exam_prep','tutoring','autopsy')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table events (
  id bigint generated always as identity primary key,
  session_id uuid not null references sessions(id),
  ts timestamptz not null default now(),
  type text not null check (type in
    ('read','reread','stuck_word','autopsy_soundout','trace_complete','tutor_question','quiz_result')),
  word text,            -- word or phrase read / stuck on
  grapheme text,        -- failing pattern, e.g. 'ar' (autopsy events)
  question_ref text,    -- e.g. 'Q2' when inferable
  payload jsonb default '{}'::jsonb
);
create index on events (session_id, ts);
create index on events (type, ts);
```

3. You should see **Success. No rows returned.**
4. Verify: open **Table Editor** in the sidebar — you should see `sessions` and
   `events` tables.

### MIGRATION (existing projects created before 2026-07-18)

The end-of-session quiz logs `quiz_result` events. If your `events` table was
created with the old check constraint, run this once in the SQL Editor:

```sql
alter table events drop constraint events_type_check;
alter table events add constraint events_type_check check (type in
  ('read','reread','stuck_word','autopsy_soundout','trace_complete','tutor_question','quiz_result'));
```

---

## 2. Connecting Supabase to Vercel

### Should you use the Vercel Marketplace Supabase integration?

**No — set the two env vars manually.** The Marketplace integration is designed
for apps that use the Supabase SDK in the browser: it injects a family of
variables (`NEXT_PUBLIC_SUPABASE_URL`, anon keys, etc.) and can create/link
resources for you. Our architecture is server-side only (ARCHITECTURE.md §5.6):
we need exactly **two** variables, neither of which may be exposed to the
client. Manual setup is simpler, and there's no risk of accidentally shipping a
`NEXT_PUBLIC_*` variable to the browser.

### 2.1 Add the env vars in Vercel

1. Open your Vercel project → **Settings** → **Environment Variables**.
2. Add each variable below. For **Environments**, tick **Production**,
   **Preview**, and **Development** (all three):

   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | the Project URL from step 1.2 |
   | `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key from step 1.2 |

3. Click **Save**. Vercel applies env vars at build time — **redeploy** after
   adding them (Deployments → ⋯ on the latest deployment → Redeploy).

### 2.2 Local development

Put the same two values in `.env.local` at the repo root (copy
`.env.local.example` and fill it in). `.env.local` is gitignored — never commit
it.

---

## 3. Telegram bot — BotFather, token, and webhook

The bot delivers session reports (PDF/XLSX) to a parent and answers review
queries. It runs in **webhook mode** — Telegram POSTs updates to our deployed
`/api/telegram/webhook` route. (Polling doesn't work on Vercel serverless.)

### 3.1 Create the bot with BotFather

1. In Telegram, search for **@BotFather** (verified, blue check) and open a chat.
2. Send `/newbot`.
3. It asks for a **display name** — e.g. `Dislexi Reports`.
4. It asks for a **username** — must end in `bot`, e.g. `dislexi_reports_bot`.
5. BotFather replies with the **HTTP API token**, e.g.
   `7123456789:AAE...xyz` → this is `TELEGRAM_BOT_TOKEN`.

> Treat the token like a password. Anyone with it controls your bot.

### 3.2 Generate the webhook secret

The secret lets our route verify that incoming POSTs really come from Telegram.
Generate a random string (any of these work):

```powershell
# PowerShell
-join ((48..57)+(97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
```

```bash
# Git Bash / macOS / Linux
openssl rand -hex 24
```

Save the output → this is `TELEGRAM_WEBHOOK_SECRET`.

### 3.3 Get the destination chat id

Telegram bots **cannot start a conversation** — the parent must contact the bot
first (ARCHITECTURE.md §5.5). Two options:

**Option A — direct to the parent (DM):**

1. The parent searches for your bot's username in Telegram and taps **Start**
   (this sends `/start` — the one-time onboarding step).
2. In a terminal, fetch pending updates:

   ```bash
   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates"
   ```

3. In the JSON response find `"message" → "chat" → "id"` — a number like
   `123456789` → this is `TELEGRAM_DEFAULT_CHAT_ID`.
   (Our webhook also replies with the chat id when someone sends `/start`,
   once the app is deployed.)

**Option B — family group chat:**

1. Create the group, then add the bot as a member (search its username when
   adding participants).
2. Send any message in the group, then call `getUpdates` as above. Group chat
   ids are **negative** numbers like `-1001234567890` — use the whole thing,
   minus sign included.

> If `getUpdates` returns an empty result after you already set a webhook,
> that's expected — webhook mode disables `getUpdates`. Get the chat id
> **before** registering the webhook, or temporarily delete the webhook with
> `deleteWebhook`.

### 3.4 Add the Telegram env vars

Add these three to Vercel (same as §2.1) and to `.env.local`:

| Key | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | from BotFather (step 3.1) |
| `TELEGRAM_WEBHOOK_SECRET` | random string (step 3.2) |
| `TELEGRAM_DEFAULT_CHAT_ID` | chat id (step 3.3) |

Redeploy so the webhook route can see them.

### 3.5 Register the webhook (setWebhook)

Once the app is **deployed** (Telegram requires a public HTTPS URL — you can't
point it at localhost), run:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://<your-vercel-domain>/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

- Replace `<your-vercel-domain>` with the production domain, e.g.
  `dislexi.vercel.app`.
- `secret_token` makes Telegram send the header
  `X-Telegram-Bot-Api-Secret-Token: <your secret>` on **every** webhook call.
  Our route (`app/api/telegram/webhook/route.ts`) rejects any request where
  that header doesn't match `TELEGRAM_WEBHOOK_SECRET` — this is the validation
  required by ARCHITECTURE.md §5.5.

Expected reply:

```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

### 3.6 Verify

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

Check that:

- `url` is your `/api/telegram/webhook` URL,
- `pending_update_count` is 0 (or draining),
- there is no `last_error_message`. A `401` here means the secret in Vercel's
  env vars doesn't match the one you registered.

Then send `/start` to the bot — it should reply (with the chat id). Reports and
review buttons flow through this same webhook from here on.
