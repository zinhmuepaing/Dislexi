# PROGRESS.md — Dislexi build session log

## RESUME FROM HERE

All verification gates PASSED on 2026-07-17 (second session — shell recovered):

1. ✅ `npm install` — clean.
2. ✅ MediaPipe assets — `public/models/hand_landmarker.task` (7.8 MB) +
   `public/models/wasm/` copied from `@mediapipe/tasks-vision`.
3. ✅ `npx tsx scripts/logic-tests.mts` — all assertions passed.
4. ✅ `npm run build` — green after one fix: Chart.js config param typed as
   `ChartConfiguration` (was `ConstructorParameters<typeof Chart>[1]`, which
   resolved TData to `unknown`).
5. ✅ `npx eslint .` — 0 errors after fixes (exam-prep effect moved below
   `readThis` + `onstart` callback for setListening; GraphemeSweep offsets
   precomputed; justified purity suppression in autopsy `startTrace`;
   `public/models/**` ignored as vendored). 2 benign warnings remain
   (cancellation-counter refs in effect cleanup — intentional).
6. ✅ Playwright smoke (production `npm run start`, headless): all 5 pages
   render; camera + stats degrade gracefully. NOTE: dev-mode smoke testing is
   impractical — first-hit Turbopack compile of the heavy pages exceeds 3 min.
   Also `with_server.py` on Windows orphans the Next.js child process on stop —
   check port 3000 for orphans after use (`Get-NetTCPConnection -LocalPort 3000`).
7. ✅ Phoneme bank — 36/37 Commons mp3s in `public/phonemes/` + ATTRIBUTIONS.md
   (script gained 429 backoff + 1.5 s pacing; Commons rate-limits bursts).
   Self-record gap-fill still needed: ae, igh, oa, ow, oi, air, ear (diphthongs).
8. ✅ Committed per phase gate.

## NEXT

- ~~Supabase not set up~~ **RESOLVED 2026-07-17**: user created the project and
  applied the schema. Live end-to-end verified locally: POST /api/sessions →
  sessionId, POST /api/events (3 typed events), POST /api/session-end → correct
  aggregate stats, and /stats/[sessionId] renders all 4 charts from the live
  data (verified by screenshot; note Playwright `full_page=True` screenshots
  blank out canvases — use viewport screenshots for chart checks).
  `TELEGRAM_WEBHOOK_SECRET` was generated and written to `.env.local`
  2026-07-17 — make sure Vercel's env vars carry the SAME value.
- **Live API tests 2026-07-17 (local prod server):** `/api/azure-token` ✅
  (southeastasia token), `/api/ocr` ✅ (2-line synthetic worksheet, verbatim,
  conf 0.997, one block per line), `/api/tutor` ✅ (SSE deltas + steps with
  correct normalized regions) — after fixing `lib/tutor-model.ts` to sniff the
  image media type from base64 magic bytes (was: trust data: prefix, default
  jpeg; Anthropic 400s on mismatch). Telegram send deliberately NOT tested
  (would message the real configured chat).
- **Vercel deployed** at https://dislexi.vercel.app (2026-07-17). Verified:
  home 200, `/api/sessions` OK (Supabase env correct on Vercel). **BROKEN:
  `/api/azure-token` 500s with an empty body on Vercel** (works locally) —
  the handler crashes building the Azure URL, so `AZURE_SPEECH_REGION` on
  Vercel almost certainly has stray text (trailing `# …` comment pasted from
  .env.local?). USER ACTION: set it to exactly `southeastasia`, redeploy.
- **Telegram webhook REGISTERED + VERIFIED** against production
  (`scripts/register-telegram-webhook.mts`): setWebhook ok, no-secret POST →
  401, with-secret POST → 200 — Vercel's `TELEGRAM_WEBHOOK_SECRET` matches
  .env.local.
- **Telegram delivery VERIFIED locally 2026-07-17** — after the user /start-ed
  @DislexiBot, `scripts/test-telegram-delivery.mts http://localhost:3000`
  delivered the PDF + XLSX to the chat (id 1864618186 is correct). Bot profile
  (commands, description, about) set via `scripts/setup-telegram-profile.mts`;
  photo + privacy toggle remain owner-only in BotFather (/setuserpic,
  /setprivacy) — cosmetic, not blocking.
- **Vercel env still broken for two vars** (local values are proven good, so
  the Vercel copies differ — likely pasted with trailing `# …` comments):
  - `AZURE_SPEECH_KEY` → /api/azure-token 502 "token mint failed" (region fix
    landed: was 500-crash, now clean 502 from Azure auth).
  - `TELEGRAM_BOT_TOKEN` and/or `TELEGRAM_DEFAULT_CHAT_ID` → /api/report-upload
    502 on production while identical local test returns delivered:true.
  USER ACTION: in Vercel re-paste those three values (value only, no comments/
  quotes/whitespace), redeploy, then rerun
  `npx tsx scripts/test-telegram-delivery.mts https://dislexi.vercel.app`.
- Live on-device pass with real camera/phone: TTS karaoke, autopsy sweep,
  Telegram delivery.
- Self-record the 7 diphthong phonemes (CC0) and drop into `public/phonemes/`.

## BLOCKED - NEEDS ACTION

- ~~Tool-environment outage~~ **RESOLVED 2026-07-17**: shell recovered in the
  follow-up session; every queued gate was executed (see RESUME list above).
- ~~`.env.local` missing~~ **RESOLVED 2026-07-17**: `.env.local` now exists with all
  11 vars (Azure Vision + Speech, Anthropic, Supabase, Telegram). Live end-to-end
  tests of the API routes are unblocked — but `/api/sessions` 500s (see NEXT).

## Session log

- 2026-07-17: session start. Scaffold reviewed: all 8 API routes, adapters, components
  exist; pages have TODO(pipeline) markers. Beginning Phase 1 (hand tracking).
- NOTE: shell tool safety classifier intermittently unavailable this session —
  `npm install`, MediaPipe asset downloads, and `npm run build` queued for retry.
- 2026-07-17: code for all six phases written (unverified — build pending on shell):
  - Phase 1: `lib/hand-tracker.ts` (singleton, IMAGE/VIDEO modes, normalized-coord
    fingertip, nearest-block ties→topmost, loose trace check). Assets NOT yet
    downloaded (`public/models/hand_landmarker.task` + `wasm/`) — needs shell.
  - Phase 2: `app/exam-prep/page.tsx` complete — voice trigger (keyword match,
    resultIndex-guarded), fingertip→nearest block with tap fallback, verbatim TTS
    karaoke via new `lib/speech.ts` (token cache, wordBoundary scheduled at each
    event's own audioOffset), `lib/event-queue.ts` (5 s flush, graceful when
    Supabase absent), End session → /stats/[sessionId].
  - Phase 3: `app/tutoring/page.tsx` — sequential step narration with cancel token,
    one-shot dictation, tutor_question events, mode announcement.
  - Phase 4: `app/autopsy/page.tsx` + `lib/graphemes.ts` (Letters and Sounds 2–3
    curated table, per-letter fallback) — tap/point selection, sound-out sweep,
    TTS blend, ~5 fps trace loop with 45 s timeout + skip, WebAudio chime
    (substitutes public/chime.mp3 — no binary asset, works offline).
    Phoneme bank NOT curated: sweep advances after 400 ms on missing files.
  - Phase 5: `app/stats/[sessionId]/page.tsx` — 4 Chart.js charts, XLSX (SheetJS),
    PDF (jsPDF + chart snapshots), Telegram delivery via /api/report-upload.
  - Phase 6: webhook route — "Pick a date" button, YYYY-MM-DD / YYYY-MM message
    parsing via extracted reviewRange(), /help, /report (latest session stats text).
- `CameraStage` gained `getCanvas()` (flipped canvas as MediaPipe input).
- Self-review pass (no compiler available) — fixes applied:
  - `lib/speech.ts`: superseded utterances now settle their promise (stopSpeaking
    resolves; error paths reject first). SDK members verified against Microsoft
    docs: `PropertyId.SpeechServiceResponse_RequestWordBoundary` (=44) and
    `SpeakerAudioDestination.onAudioStart/onAudioEnd/pause/close` all exist.
  - Exam-prep voice trigger scans only from `event.resultIndex` (continuous mode
    accumulates results).
  - Autopsy word keys now include a capture generation (`gen:block:char`) so a
    stale `stuck` selection can't match a word from a newer frame.
- `scripts/logic-tests.mts` (pure-logic assertions) and
  `scripts/fetch-phonemes.mts` (Commons mp3-transcode downloader + attributions
  writer; diphthongs flagged as self-record gap-fill) written, not yet run.
