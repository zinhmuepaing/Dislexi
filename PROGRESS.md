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

- **`/api/sessions` + `/api/session-end` return 500 with live creds** — seen in
  smoke test on every page. Supabase credentials exist, so most likely the DB
  schema (SETUP.md) hasn't been applied to the project yet. UI degrades
  gracefully. Verify schema, then re-test event logging end-to-end.
- Live end-to-end pass with real camera/phone: OCR, TTS karaoke, tutor SSE,
  autopsy sweep, Telegram delivery.
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
