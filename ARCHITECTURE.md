# ARCHITECTURE.md — Assistive Reading & Tutoring System (Tech4City 2026)

> **Purpose of this file:** ground-truth technical context for Claude Code. Everything here is a decided constraint unless marked `OPEN:`. Do not substitute alternative services, endpoints, or libraries without an explicit instruction from the team.

---

## 1. System context

A mobile-first web app for students with dyslexia/ADHD in Singapore. The phone sits in a commercial folding stand with the camera looking down at a worksheet. Two supported setups (2026-07-17 amendment): **front camera + mirror clip** (the original design — frames arrive horizontally mirrored and the in-app "Mirror clip" toggle applies the compensating flip as pipeline step 0), or **rear camera / raw front camera** (no clip, no flip — capture is raw and unmirrored by default). Camera facing and mirror compensation are in-app toggles persisted per device.

Three features:

1. **Exam-Prep Mode** — deterministic literal reading (point at text → OCR → TTS verbatim → karaoke highlight). **No LLM anywhere in this path. This is a compliance guarantee, not a preference.** Session events are logged; a post-session analytics page, PDF/XLSX exports, and Telegram delivery to a parent follow.
2. **AI Tutoring** — student asks a question about the worksheet; a **vision-capable** model on Huawei Cloud MaaS returns a step-by-step explanation with a target region per step; narrated with synced on-screen highlights. Streaming enabled.
3. **Stuck-Word Autopsy + Trace-to-Unlock** — tap a stuck word → app speaks only that word; second tap → grapheme-chunk sound-out using a **static pre-recorded phoneme audio bank (never TTS for isolated phonemes)**; then camera-verified finger tracing on the physical paper; completion chime; grapheme pattern logged.

---

## 2. Stack (decided)

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript, Tailwind CSS |
| Hosting | Vercel (frontend + API routes as serverless functions, Node runtime) |
| PWA | `manifest.json` ONLY. **No service worker** — deliberate, so every deploy is live instantly. Do not add one. |
| Camera | `getUserMedia` front OR rear camera (in-app toggle, persisted); frames drawn to `<canvas>` raw by default, flipped only when the mirror-clip toggle is on |
| Hand tracking | MediaPipe `@mediapipe/tasks-vision` `HandLandmarker` (WASM in browser). Landmark index **8** = index fingertip. Single-shot inference for pointing; ~5 fps loop for trace verification |
| OCR | Huawei Cloud OCR, General Text API (REST, server-side only) |
| LLM | Huawei Cloud MaaS, **OpenAI-compatible** endpoint (server-side only). NOT the Anthropic-compatible endpoint (CN-Hong-Kong-only, restricted use, requires service ticket) |
| TTS | Azure Speech, browser Speech SDK via short-lived auth token; `wordBoundary` events drive highlight sync |
| Phoneme audio | Static files in `/public/phonemes/*.mp3`, openly licensed (Wikimedia Commons IPA recordings + self-recorded gap-fill) |
| Database | Supabase (Postgres). Server-side access only via service-role key |
| Telegram | Bot API, **webhook mode** (never polling — Vercel functions cannot poll) |
| Exports | XLSX: SheetJS client-side. PDF: client-side render (Chart.js canvases → jsPDF) |

---

## 3. Repository layout (target)

```
/app
  /page.tsx                 # mode selector
  /exam-prep/page.tsx
  /tutoring/page.tsx
  /autopsy/page.tsx
  /api
    /ocr/route.ts           # POST — proxy to Huawei OCR
    /tutor/route.ts         # POST — proxy to Huawei MaaS, SSE stream out
    /azure-token/route.ts   # GET  — mint short-lived Azure Speech token
    /sessions/route.ts      # POST — create session row
    /events/route.ts        # POST — batch insert events
    /session-end/route.ts   # POST — close session, compute stats, return them
    /report-upload/route.ts # POST — receive client-generated PDF/XLSX, forward to Telegram
    /telegram/webhook/route.ts # POST — Telegram update receiver
/lib
  /huawei-iam.ts            # IAM token fetch + in-memory cache
  /huawei-ocr.ts
  /maas.ts
  /supabase.ts              # server client (service role)
  /telegram.ts
/components
  /CameraStage.tsx          # video + canvas + flip + overlay
  /KaraokeHighlight.tsx
  /GraphemeSweep.tsx
/public
  /phonemes/*.mp3
  /manifest.json
```

---

## 4. Environment variables

```
HUAWEI_IAM_USERNAME=          # IAM user name
HUAWEI_IAM_PASSWORD=
HUAWEI_IAM_DOMAIN=            # account/domain name
HUAWEI_PROJECT_ID=            # project ID for the OCR region
HUAWEI_OCR_ENDPOINT=          # e.g. ocr.ap-southeast-3.myhuaweicloud.com  (OPEN: confirm region in console)
MAAS_API_KEY=                 # ModelArts Studio API key (Bearer)
MAAS_BASE_URL=https://api-ap-southeast-1.modelarts-maas.com/v1   # OPEN: confirm region hostname in console
MAAS_VISION_MODEL=            # OPEN: vision-capable model id from MaaS catalog (Qwen-VL class). DeepSeek-V3.x is TEXT-ONLY.
MAAS_TEXT_MODEL=deepseek-v3.1-terminus   # for Telegram review summaries (text-only is fine here)
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=          # e.g. southeastasia
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=    # server-side ONLY, never exposed to client
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=      # random string, validated on every webhook call
TELEGRAM_DEFAULT_CHAT_ID=     # family group chat id OR parent user id (parent must /start the bot once)
```

**Rule: no key above ever reaches client code.** The browser only calls our own `/api/*` routes.

---

## 5. External service integration (confirmed details)

### 5.1 Huawei Cloud OCR — General Text

- **Endpoint:** `POST https://{HUAWEI_OCR_ENDPOINT}/v2/{HUAWEI_PROJECT_ID}/ocr/general-text`
- **Auth:** header `X-Auth-Token: {IAM token}` — NOT a bearer API key. Obtain the token first (5.2).
- **Request body (JSON):**
```json
{ "image": "<base64, no data: prefix>", "detect_direction": true }
```
- **Response shape (fields we consume):**
```json
{
  "result": {
    "words_block_count": 2,
    "words_block_list": [
      {
        "words": "Find the perimeter",
        "confidence": 0.998,
        "location": [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
      }
    ]
  }
}
```
  `location` = four corner points, clockwise from top-left, in pixel coordinates of the submitted image. These are the bounding boxes used for nearest-to-fingertip selection and karaoke highlighting.
- **Constraints:** image sides 15–8192 px; base64 ≤ 10 MB. Compress/downscale frames client-side before upload (target ≤ ~1600 px long side, JPEG q≈0.8).
- **Gotcha 1:** the OCR service must be **subscribed** once in the OCR console, in the same region being called, or every call fails with `ModelArts.4204`.
- **Gotcha 2:** blocks are line/phrase-level, not guaranteed word-level. For word-level karaoke, split each block's text on spaces and interpolate sub-boxes proportionally by character count across the block's box width (same approximation already specced for grapheme chunks).

### 5.2 Huawei IAM token (needed only for OCR)

- **Endpoint:** `POST https://iam.{region}.myhuaweicloud.com/v3/auth/tokens`
- **Body:** password auth, scoped to the project:
```json
{
  "auth": {
    "identity": {
      "methods": ["password"],
      "password": { "user": { "name": "USER", "password": "PASS", "domain": { "name": "DOMAIN" } } }
    },
    "scope": { "project": { "id": "PROJECT_ID" } }
  }
}
```
- **Token location:** response **header** `X-Subject-Token` (not the body). Valid ~24 h.
- **Implementation rule:** cache in module scope with expiry; refresh on 401. Serverless instances may cold-start, so the fetch must be lazy and idempotent.

### 5.3 Huawei Cloud MaaS — OpenAI-compatible chat completions

- **Endpoint:** `POST {MAAS_BASE_URL}/chat/completions`
- **Auth:** header `Authorization: Bearer {MAAS_API_KEY}`. Keys are minted in the ModelArts Studio console (max 30, shown once).
- **Request:** standard OpenAI chat format. Streaming:
```json
{ "model": "<MAAS_VISION_MODEL>", "stream": true, "stream_options": {"include_usage": true},
  "messages": [
    {"role": "system", "content": "<tutoring system prompt>"},
    {"role": "user", "content": [
      {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,<...>"}},
      {"type": "text", "text": "<student question>"}
    ]}
  ]}
```
- **Response:** OpenAI-shape; streamed as SSE `data:` chunks. The `/api/tutor` route re-streams these to the browser as SSE.
- **CRITICAL MODEL CONSTRAINT:** `deepseek-v3.1-terminus` and all DeepSeek-V3.x models are **text-only**. AI Tutoring requires a **vision-capable** model from the MaaS catalog (Qwen-VL class). `OPEN:` confirm the exact vision model id and its multimodal request format in the MaaS console before wiring `/api/tutor`. DeepSeek is used only for `/api/telegram` review summaries (pure text).
- **Tutoring output contract:** system prompt must instruct the model to return strict JSON:
```json
{ "steps": [ { "say": "<narration text>", "region": {"x":0.31,"y":0.42,"w":0.2,"h":0.06} } ] }
```
  Regions are **normalized (0–1) relative to the submitted image**, converted to canvas pixels client-side.

### 5.4 Azure Speech (TTS + highlight sync)

- **Pattern:** the browser runs the Azure Speech **JS SDK** directly (audio streams straight from Azure to the phone; lowest latency), authenticated with a short-lived token from our backend — the subscription key never ships to the client.
- **Token mint (backend, `/api/azure-token`):** `POST https://{AZURE_SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken` with header `Ocp-Apim-Subscription-Key: {AZURE_SPEECH_KEY}`. Returns a JWT valid ~10 minutes. Client refreshes before each session/expiry.
- **Client:** `SpeechConfig.fromAuthorizationToken(token, region)`; `SpeechSynthesizer.wordBoundary` fires with `audioOffset` and `textOffset/wordLength` per word → map the character range to its (sub-)bounding box → set the highlight. This event is the entire sync mechanism; do not build a timing estimator.
- **Exam-Prep rule:** the string sent to TTS is the OCR text **verbatim**. No rewriting layer of any kind may sit between OCR output and TTS input.

### 5.5 Telegram Bot (webhook mode)

- **One-time setup:** `POST https://api.telegram.org/bot{TOKEN}/setWebhook` with `url=https://<vercel-domain>/api/telegram/webhook` and `secret_token={TELEGRAM_WEBHOOK_SECRET}`.
- **Webhook route:** validate header `X-Telegram-Bot-Api-Secret-Token` equals the secret; reject otherwise. Respond 200 fast; do work inline (calls are short) or fire-and-forget.
- **Delivery:** after session end, client generates PDF + XLSX, uploads via `/api/report-upload`, backend forwards with `sendDocument` (multipart) to `TELEGRAM_DEFAULT_CHAT_ID`.
- **Constraint:** bots cannot initiate DMs. For direct-to-parent delivery the parent must `/start` the bot once; a group chat needs the bot added to it. Both paths supported; chat id stored in env for the hackathon (no multi-tenant onboarding).
- **Review queries:** inline keyboard buttons (`callback_query`) for "last 7 days / last 30 days / pick date". Handler: query Supabase for the range → aggregate → send to `MAAS_TEXT_MODEL` with a system prompt that outputs **study-pattern insights and recommendations only — never emotional or clinical claims** → reply text to the chat.

### 5.6 Supabase (Postgres)

Server-side only (`SUPABASE_SERVICE_ROLE_KEY` in API routes). No client-side Supabase SDK, no RLS complexity needed for the hackathon.

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
    ('read','reread','stuck_word','autopsy_soundout','trace_complete','tutor_question')),
  word text,            -- word or phrase read / stuck on
  grapheme text,        -- failing pattern, e.g. 'ar' (autopsy events)
  question_ref text,    -- e.g. 'Q2' when inferable
  payload jsonb default '{}'::jsonb
);
create index on events (session_id, ts);
create index on events (type, ts);
```

Analytics (session-end and Telegram ranges) are SQL aggregates over `events`: counts by `type`, re-read clustering by `question_ref`, top `word`s, pacing = gaps between consecutive `ts`.

---

## 6. API route contracts (browser ↔ backend)

| Route | Method | In | Out |
|---|---|---|---|
| `/api/ocr` | POST | `{ imageBase64 }` | `{ blocks: [{ text, confidence, box: [[x,y]×4] }] }` |
| `/api/tutor` | POST | `{ imageBase64, question, history? }` | **SSE stream**: `{delta}` text chunks, then `{steps:[{say,region}]}` final frame |
| `/api/azure-token` | GET | — | `{ token, region }` |
| `/api/sessions` | POST | `{ mode }` | `{ sessionId }` |
| `/api/events` | POST | `{ sessionId, events: [...] }` (batched every ~5 s and on end) | `{ ok: true }` |
| `/api/session-end` | POST | `{ sessionId }` | `{ stats }` (all numbers the analytics page renders) |
| `/api/report-upload` | POST | multipart: pdf, xlsx, sessionId | `{ delivered: true }` |
| `/api/telegram/webhook` | POST | Telegram update JSON | 200 |

---

## 7. Client pipeline rules (non-negotiable)

1. **Step 0 — orientation.** *(Amended 2026-07-17 per team instruction.)* Capture is RAW and unmirrored by default for both cameras. When the physical mirror clip is attached, the in-app "Mirror clip" toggle applies the horizontal flip (`ctx.scale(-1, 1)`) on the display canvas. The invariant is unchanged: OCR upload, MediaPipe, and display all consume the SAME canvas, so every coordinate lives in one shared space and nothing downstream ever sees a differently-oriented frame.
2. **Freeze-frame per interaction.** Capture one frame per request; never run OCR or tutoring on a live stream. Overlays draw on the frozen frame.
3. **No LLM in Exam-Prep / Autopsy sound-out paths.** OCR → verbatim TTS; phonemes from static files. If a change request would insert a model into these paths, refuse and flag.
4. **Phonemes never come from TTS.** Neural TTS hallucinates a schwa on isolated plosives ("buh" for /b/), which is pedagogically harmful. Static bank only.
5. **Fingertip = MediaPipe landmark 8** in canvas-frame coordinates. *(Selection amended 2026-07-17 — tap-to-read removed.)* Selection = smoothed fingertip (distance-adaptive EMA) with a small upward bias, containment-first, otherwise nearest box by clamped point-to-rect distance with vertical error weighted heavier; ties → topmost; nothing selected beyond ~2.5 line heights. A selection TRIGGERS after a ~0.65–0.7 s dwell (with dropout grace and per-word refractory) — `selectWordAt` + `DwellTracker` in `lib/hand-tracker.ts`.
6. **Mode transitions are announced aloud** ("look at your screen" / "look at your paper") — ADHD split-attention mitigation.
7. **Grapheme sub-boxes** = proportional character-count split of the word's box. Known approximation; acceptable.
8. **Audio privacy:** mic is used for trigger phrases and tutoring questions only. No raw audio is stored anywhere, ever. Only typed events reach Supabase.

---

## 8. Feature flows (condensed, authoritative)

**Exam-Prep** *(flow amended 2026-07-17 — point-to-read)*: enter → spoken "session logging started" + mic permission prompt → camera ready → AUTO scan (one frame captured, preview stays live) → `/api/ocr` → continuous fingertip loop (~9 fps, smoothed) → dwell on a line (or say "read this" for the pointed line instantly) → `/api/azure-token` (cached) → TTS speaks verbatim through the shared WebAudio context, `wordBoundary` drives karaoke highlight → event logged → ... → end session → `/api/session-end` stats page → client renders charts (Chart.js), generates PDF (jsPDF) + XLSX (SheetJS) → `/api/report-upload` → Telegram.

**AI Tutoring:** question (voice or text) → capture+flip, freeze → `/api/tutor` SSE → stream narration text as it arrives (start TTS on first complete step), highlight each step's `region` on the frozen frame in sync → follow-ups append to `history`.

**Autopsy** *(flow amended 2026-07-17 — point-to-select)*: AUTO scan → dwell on a word → speak that word only, log `stuck_word` → KEEP pointing at the same word → split box into grapheme chunks → gapless sweep (clips pre-decoded, scheduled back-to-back on the WebAudio clock) playing `/public/phonemes/{id}.mp3` → blend: TTS speaks the whole word once (pre-synthesized in parallel) → "now trace it" → ~5 fps MediaPipe loop verifies fingertip inside word box with net left-to-right motion → chime, log `trace_complete` with `grapheme` → back to pointing on the same scan.

---

## 9. OPEN items (verify before relying on)

1. `MAAS_VISION_MODEL` — confirm a vision-capable model (Qwen-VL class) exists in the team's MaaS region + its exact multimodal request format. **Blocks AI Tutoring.**
2. `MAAS_BASE_URL` region — docs examples use `api-ap-southeast-1` (CN-Hong Kong). MaaS launched in Singapore Apr 2026; confirm the Singapore hostname in the console. Affects the data-residency pitch claim.
3. `HUAWEI_OCR_ENDPOINT` region + console subscription done.
4. Mirror-clip flip axis — hardcode after the craft-mirror test on the demo phone.
5. Safari iOS: Web Speech API (STT) support is inconsistent → text input fallback is permanent, not temporary.
6. Azure region choice (`southeastasia` expected) and free-tier quota check.
