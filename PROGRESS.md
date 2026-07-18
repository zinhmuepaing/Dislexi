# PROGRESS.md — Dislexi build session log

## RESUME FROM HERE (2026-07-18, fourth session — REWORK R0–R8 complete)

All nine phases of the approved rework plan (IMPLEMENTATION_PLAN.md top
section) landed, one commit per phase (R0…R8). Gates green on every phase:
build + eslint (0 errors, 0 warnings) + logic tests. Highlights:

- **R1 responsive**: h-dvh shells + camera capped at 42dvh — all controls
  visible without scrolling at 375×812 (browser-verified on all pages).
- **R2 Telegram fix (root-caused)**: chart PNGs at phone DPR 3 pushed report
  uploads past Vercel's 4.5 MB body limit → 413. Now JPEG charts at DPR 2 +
  size guard + real error passthrough. 5.2 MB probe against production
  reproduced the 413; patched route delivers.
- **R3 voice engine**: lib/stt.ts (Azure continuous STT, endless mic,
  transcripts only — rule 8), lib/voice-commands.ts fast-path,
  /api/voice-command (claude-haiku-4-5, intent ONLY — amended rule 3).
- **R4 Exam-Prep**: Word/Sentence/Paragraph scopes (buildParagraphs in
  lib/sentences.ts), asymmetric above-cheap/below-expensive selection
  (nail-occlusion fix), voice commands wired; TTS stays verbatim OCR.
- **R5 tutoring accuracy**: OCR line map → model returns {line, phrase}
  ANCHORS (never coordinates) → server resolves rects deterministically;
  box/circle/arrow aids as SVG; spoken questions auto-send on silence.
  Live E2E on a synthetic worksheet: anchors + aids resolved precisely.
- **R6 autopsy**: deterministic syllable coaching ("This word is Awards.
  A, wards, Awards." ×2) via hypher patterns + vowel-group fallback
  (lib/syllables.ts); phoneme sweep behind "sound it out"; trace retired.
- **R7 quiz**: end-of-session say-it (lib/text-match.ts fuzzy) + point-at-it
  quiz, quiz_result events, score card on stats.
  ⚠ **USER ACTION: run the SETUP.md `events_type_check` MIGRATION in
  Supabase (adds 'quiz_result') — quiz events are rejected until then.**
- **R8**: LottieBadge (lazy lottie_light) + two ORIGINAL CC0 animations in
  public/lottie/ (pointer-bounce hero, star-pop quiz); theme untouched.

**Needs on-device validation**: dwell timings (300 ms exam-prep / 700 ms
autopsy), pointer extension + asymmetric weights with the real camera; Azure
STT endpointing pace; syllable quality on real worksheet words (fallback to
R9 full-LLM coaching only if it disappoints); real stats-page Telegram send
from the phone. Production deploy = push to origin/main (user's call).

## RESUME FROM HERE (2026-07-17, third session — interaction & UI rework)

Repo/remote gap checked: local `main` == `origin/main`; production
(dislexi.vercel.app) was verified same day (see below). This session reworked
the interaction model and UI per team instruction (goal directive):

1. **Camera**: front/rear toggle + "Mirror clip" toggle in `CameraStage`
   (persisted in localStorage). Capture is now RAW/unmirrored by default for
   both cameras; the flip runs only when the mirror-clip toggle is ON.
   ARCHITECTURE.md §7 rule 1 amended accordingly. 720p ideal constraints.
2. **Point-to-read (tap removed)**: Exam-Prep and Autopsy auto-scan when the
   camera is ready (one frame, preview stays live), then run a continuous
   ~9 fps fingertip loop — smoothed (adaptive EMA), containment-first
   selection with upward fingertip bias + max-distance reject, dwell-to-
   trigger with dropout grace and per-word refractory (§7 rule 5 amended).
   Autopsy escalates by KEEP-pointing at the spoken word → gapless sound-out
   → trace (unchanged) → resumes pointing on the same scan.
3. **Audio engine**: new `lib/audio.ts` (shared AudioContext unlocked on
   first gesture; decoded-clip cache; gapless `playSequence`; chime).
   `lib/speech.ts` rewritten to synthesize Azure TTS to buffers (null
   AudioConfig) and play via WebAudio — THIS FIXES THE SILENT AI-TUTORING
   NARRATION (autoplay policy blocked the SDK's own player after long SSE
   waits). Word-boundary karaoke preserved; `speakSteps` pre-synthesizes all
   steps for smooth narration; voice = en-SG-LunaNeural; synth LRU cache.
4. **Tutoring UI**: raw SSE deltas/JSON are no longer rendered — friendly
   animated "thinking" card until steps arrive; step cards replayable;
   retake/new-photo button; mic permission primed on entry.
5. **UI overhaul**: full walkthrough theme (paper/ink/yellow, Bricolage +
   IBM Plex via next/font, notebook-ruled background, card/btn/stamp/chip
   system in globals.css, light-only). Home page redesigned (animated
   karaoke hero, feature cards with det/ai stamps). Stats page restyled +
   chart colors on palette. No purple gradients (purple = AI stamp only).

Gates: `npx tsx scripts/logic-tests.mts` ✅ · `npm run build` ✅ ·
`npx eslint .` ✅ (1 intentional cancellation-counter warning, precedent) ·
prod-server smoke via browser: home/exam-prep/tutoring/autopsy render, camera
+ mic prompt immediately on entry, graceful degradation without devices ✅.

**Needs on-device validation** (can't be done here): dwell timings (0.65/0.7 s)
and upward-bias factor on the real phone; TTS voice choice; mirror-clip
default-OFF matches the team's current physical setup (toggle if not);
rear-camera image quality for OCR.

## RESUME FROM HERE (2026-07-17, second session)

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
- **Production integration status (2026-07-17, after user's env fixes):**
  - ✅ Supabase: /api/sessions, /api/events, /api/session-end
  - ✅ Azure Speech: /api/azure-token (region + key fixed on Vercel)
  - ✅ Telegram: webhook verified (401/200 probes), delivery
    `{delivered:true}` from production — PDF + XLSX arrived in chat;
    bot profile (commands/description/about) set via
    `scripts/setup-telegram-profile.mts`
  - ✅ Azure Vision: /api/ocr (verbatim, conf 0.997, one block per line)
  - ✅ Anthropic: /api/tutor (SSE deltas + steps, correct regions)
  **ALL PRODUCTION INTEGRATIONS VERIFIED 2026-07-17.** Root cause of every
  earlier failure: env values pasted into Vercel with trailing `# …` comments
  from .env.local. Remaining work is non-code: on-device pass with the real
  phone/stand/worksheet, 7 diphthong recordings, optional bot photo
  (/setuserpic in BotFather).
- npm warn `uuid@9.0.1 deprecated` in Vercel build logs is a transitive dep of
  microsoft-cognitiveservices-speech-sdk — install-time noise only, no action.
- Live on-device pass with real camera/phone: TTS karaoke, autopsy sweep,
  Telegram delivery.
- ~~Self-record the 7 diphthong phonemes~~ **RESOLVED 2026-07-17**: all 7
  sourced from Commons after all (43/43, 0 gap-fill). air/ow = isolated
  Lingua Libre diphthong recordings; ae/igh/oa/oi/ear = human recordings of
  pure-diphthong words (UK "a"/"I"/"oh"/"oi"/"ear"). All open-licensed
  (see ATTRIBUTIONS.md). **LISTEN-VERIFY each on device** — especially
  ae.mp3: the "a" recording must be the strong form /eɪ/, not weak /ə/.

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
