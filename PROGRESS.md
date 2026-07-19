# PROGRESS.md — Dislexi build session log

## RESUME FROM HERE (2026-07-19, tenth session — pointing drift fix + autopsy parity)

On **branch `claude/hand-tracking-logic-analysis-43niyb`** (kept separate from
`main` per user instruction — do NOT merge). Task: fix/improve the pointing
("hand-tracking") logic for Exam-Prep and Autopsy. Five defects found by code
analysis, all fixed; user confirmed the approach choices (re-OCR + remap,
freeze-during-read, button-only quiz check, minimal doc amendment).

**Delivered:**
- **Drift fix (the eighth-session ⚠ open bug)** — `lib/align.ts` (pure,
  logic-tested): the fresh pointing shot is re-OCR'd as a REGISTRATION signal
  (the hand occludes the target, so fresh blocks can't replace the scan);
  fresh↔scan lines are text-matched (`lineSimilarity`, digit-aware — new in
  `lib/text-match.ts`; "Question 1" ≠ "Question 2") with an LIS reading-order
  filter, a least-squares 2-D similarity (rotate+scale+translate) is fit on
  matched line centers, and ALL scan boxes (occluded words included) are
  remapped into shot space. Guard rails (≥2 matches, scale ∈ [0.5,2], mean
  residual < 1.5× median line height) degrade to IDENTITY = old behavior.
  Cost: one extra OCR round-trip (~1 s) per point.
- **Shared pipeline `lib/pointing.ts`** — single-flight, ONE shot per
  interaction with the preview FROZEN on it (§7 rule 2; unfrozen when the
  interaction ends, so highlights sit exactly on the displayed text — fixes
  the floating-highlight symptom in the user's video), align → line chips →
  word chips → typed failure reasons. Pages commit the aligned blocks + shot
  as the new scan on success.
- **Autopsy parity** — `locateWord` now runs the two-pass word marks (it
  still used the model-READ word, the diagnosed occlusion failure; autopsy is
  always word-granularity, so it was the worst affected).
- **Quiz point-check fixed** — it captured the frame the instant the "Now
  point at…" prompt STARTED (child had no time to point), the Check button
  hard-coded said=false, and both triggers could double-record. Now: `said`
  stored on QuizState, button-driven check, single-flight, stage+index
  revalidated after the await.
- **Exam-prep re-entrancy** — `finding` state guard (stale closure) →
  `findingRef`; rescan unfreezes + waits two rAFs so it can't OCR a stale
  frozen frame. Dead `located` pointer-dot code removed from both pages.
- **Word chips** — `aboveChipCenterY`/`ceilingFor` in `lib/marks.ts` clamp
  above-word chips into the inter-line gap (ninth-session legibility check).
- Docs: rule 5 parenthetical amendment in ARCHITECTURE.md + CLAUDE.md
  (set-of-marks is the live path; MediaPipe = revert path, untouched).

Gates green per commit: `npx tsx scripts/logic-tests.mts` · `npx eslint .` ·
`npm run build`.

**NEXT (on-device, can't be done here):**
- Handheld drift retest: scan, shift/rotate the paper ~1 cm, "read this" —
  expect the RIGHT line/word (was: chip lands one line off). Word scope and
  autopsy coach both.
- Freeze UX: preview should freeze on the shot during read/coach with the
  highlight ON the text, then return live. If kids find the freeze confusing,
  revert = pass `freeze:false` in `lib/pointing.ts` + drop `unfreeze()` calls
  (decoupled from the drift fix).
- Latency: point now costs +~1 s (re-OCR). If it drags, the escape hatch is
  skipping re-OCR when the last alignment is < ~5 s old (timestamp check in
  `lib/pointing.ts`).
- Quiz: verify one result per word, Check waits for the child, chime on
  correct point.
- Chip legibility on real print at tight line spacing (gap-midpoint chips).

## RESUME FROM HERE (2026-07-20, ninth session — word-granularity set-of-marks)

Still on **branch `feature/set-of-marks-pointing`**. User confirmed the
sentence/paragraph (line-level) mis-selection is FIXED on device; the
remaining bug was WORD scope reading the wrong word — usually the FIRST word
of the pointed line.

**Root cause (confirmed by code reading, matches user's symptom):** word
scope relied on `locatePointedMark`'s free-text `word` field — the model
READING the pointed word off the image. But the fingertip OCCLUDES its
target, so the model names a legible neighbor (line-initial word: fully
visible, often capitalized, first in reading order); `bestWordMatch` then
matches that wrong word with high similarity, so no error surfaces. Same
generation-vs-classification failure set-of-marks fixed at line level, one
granularity down.

**Fix delivered — two-pass set-of-marks (word scope only):**
- Pass 1 unchanged (line chips → `{found, mark, word}`); the `word` field is
  now DEMOTED to fallback-only.
- Pass 2 (new): chips composited ABOVE each word of the picked line (finger
  approaches from below on the desk rig, so above-word chips stay visible
  while the word itself is covered) → `POST /api/point` with
  `granularity:"word"` → model answers `{found, mark}` ONLY — pure
  classification, no word reading. Falls back to `bestWordMatch` on the
  pass-1 word if the pass fails. Single-word lines skip pass 2.
- Changes: `buildWordMarks` + `placement: "left" | "above"` in `lib/marks.ts`;
  `locatePointedWordMark` in `lib/tutor-model.ts` (occlusion prior in prompt:
  pick the chip AT the fingertip, never the most legible neighbor);
  `/api/point` accepts `granularity`; exam-prep `resolveUnit` is now async
  and runs the word pass. Logic tests added for `buildWordMarks`.
- Compliance unchanged (§7 rule 3): model picks a chip NUMBER; spoken text is
  OCR verbatim. Coordinate revert path untouched.
- Cost: word scope now takes a second vision round-trip (~1–2 s extra);
  sentence/paragraph unaffected.

Gates green: `npx tsx scripts/logic-tests.mts` ✅ · `npx eslint .` ✅ ·
`npm run build` ✅ · prod-server smoke: /exam-prep renders, only expected
camera-permission errors in a devices-less browser ✅.

**NEXT:** on-device test of word scope (point mid-line, expect the pointed
word not the first word); check pass-2 chip legibility on real print (chips
sit above words — verify they don't collide with the line above at typical
worksheet line spacing); /api/point latency with two calls. Older open items
below (eighth session ⚠ drift bug: user says line-level is fixed on device —
treat that section as resolved unless handheld drift reappears).

## RESUME FROM HERE (2026-07-19, eighth session — set-of-marks pointing branch)

On **branch `feature/set-of-marks-pointing`** (pushed to origin, one commit
`422b2a6` on top of `main`/`bffc4dd` REWORK 3). `main` untouched. PR not
opened yet:
https://github.com/zinhmuepaing/Dislexi/pull/new/feature/set-of-marks-pointing
After any pull: run `npm install` (team added hypher/lucide/lottie deps;
missing modules break logic-tests and dev with confusing errors). Gates all
green at commit time: `npx tsx scripts/logic-tests.mts`, `npx eslint .`,
`npm run build`.

**What the session delivered — set-of-marks pointing** (fixes `/api/point`
coordinate regression selecting lines ~2 below the finger; vision LLMs have
±5–10% coordinate error = 2–3 text lines):
- `lib/marks.ts` — `buildLineMarks` (pure: number non-empty OCR lines 1..N,
  cap 40) + `drawMarks` (canvas: composite numbered chips at each line's left
  edge onto the captured frame, scaled scan-space→shot-space).
- `locatePointedMark` in `lib/tutor-model.ts` — model gets chipped image +
  "n: text" list, returns STRICT JSON `{found, mark, word}`; classification
  not regression; prompt encodes the occlusion prior (prefer line ABOVE the
  fingertip when in doubt).
- `/api/point`: `{imageBase64, marks?}` — marks present → marked mode
  `{found, mark, word}`; absent → legacy coordinate mode (kept as revert path).
- `bestWordMatch` in `lib/text-match.ts` (pure, ≥0.45 similarity) — resolves
  the model's word answer against OCR words WITHIN the marked line.
- Exam-prep `readViaPointer`/`resolveUnit` + autopsy `locateWord` rewired;
  `WordEntry` gained `blockIndex`; autopsy keeps `blocksRef`. Logic tests
  added for buildLineMarks + bestWordMatch. Spoken text still OCR-verbatim
  everywhere (compliance unchanged).

**⚠ OPEN BUG — set-of-marks still mis-selects on device.** User's test video
(`Downloads/video_2026-07-19_17-14-48.mp4`, phone, rear camera, handheld)
still reads the wrong line; frame analysis showed the overlay highlight
sitting ABOVE its text on the live view. Leading hypothesis (unverified):
`drawMarks` composites chips at SCANNED-frame coordinates onto the FRESH
shot; handheld, the paper shifts between scan and "read this" → chips land on
the wrong physical lines → the model correctly names the chip nearest the
finger, but that chip no longer sits on the line it was numbered for.
Candidate fixes to evaluate:
1. Cheapest: detect scan-vs-shot drift (frame-difference or OCR anchor
   re-check) → auto-rescan before pointing when stale.
2. Re-OCR the fresh shot on every "read this" and mark THAT (~1s extra, but
   chips always correct; cache-friendly).
3. Product answer: the stand fixes the geometry — but demo videos keep being
   handheld, so software robustness still matters.
Also check while in there: whether OCR captured the header lines (unmarked
regions can't be selected), and `/api/point` latency.

**Also done this session (context):**
- Sentence grouping `lib/sentences.ts` (buildSentences + localWordAt) built
  here, later extended by the team into the Word/Sentence/Paragraph scope
  system — now core. Exam-prep dwell 650→300 ms is MOOT (team removed the
  dwell loop; pointing is on-demand).
- **Phoneme bank**: 43/43 files, 0 gap-fill, ATTRIBUTIONS.md regenerated, all
  open-licensed (air/ow = Lingua Libre isolated diphthongs; ae/igh/oa/oi/ear
  = human recordings of pure-diphthong words). **ae.mp3 must be
  listen-verified**: needs strong form /eɪ/, not /ə/. User listen-check found
  the 24 CONSONANT files are IPA demos in vowel contexts ("ba…aba…ab") —
  pedagogically unusable for blending (the same "buh" problem rule 4 bans TTS
  for); Commons has NO isolated consonant set (searched thoroughly). No
  longer demo-blocking (syllable coaching R6 is the primary Autopsy path) —
  only degrades the optional phoneme sweep. User handling re-recording
  separately.
- **Licensing hard line**: user twice offered ripped YouTube audio ("44
  Phonemes", Farmer Loves Phonics) — refused (Standard YouTube License, no
  CC). Do NOT use that audio, even "for demo". Legit routes: written
  permission from the creator, or self-record.
- Intent-doc review flags: per-letter grapheme fallback teaches wrong phonics
  for uncurated words; no drift-test for the LLM parent-report language;
  Telegram PDF never checked to embed only charts (never the worksheet
  photo). User deferred flags — don't re-raise unprompted. Intent doc is now
  stale on rules 3/4 — user explicitly said no need to update it.

**Other open items:** on-device validation of the whole P0–P6 redesign +
/api/point accuracy; consonant phoneme re-recording (user); listen-verify the
7 diphthong mp3s (esp. ae.mp3); Telegram PDF image-leakage check.

**User context:** records demo videos handheld with the rear camera — expect
the stale-scan failure mode in every video until fixed. Prefers short direct
answers; asks "what's your take" before wanting code; wants branches for
risky work.

## RESUME FROM HERE (2026-07-19, seventh session — REWORK 3 P0–P6 COMPLETE)

Premium hybrid-iOS redesign (bottom nav + glass + edge-to-edge) is done and
committed; build + eslint + logic-tests green each phase.

- **P0** Inter + Bricolage + Plex Mono, lucide-react; glass/press/accent
  tokens over the kept paper base.
- **P1** BottomNav — glass 4-tab (Home · Insights · Scan center sheet ·
  Settings); hides inside tools. (⚠ layout imports BottomNav which imports
  lucide-react → if `node_modules` is out of sync, DEV 404s every route;
  fix = `npm install`. Not a code bug; fine on Vercel.)
- **P2** CameraStage `fullBleed` mode: full-screen object-contain canvas +
  MEASURED overlay rect (ResizeObserver) so highlights stay aligned;
  exam-prep/tutoring/autopsy have floating glass control panels. Fixes the
  item-1 camera size/truncation.
- **P3** all emojis → Lucide; Home has the app-icon slot + "Dislexi" wordmark.
- **P4** Insights tab = in-app Telegram review parity: `POST /api/review`
  (reuses computeStats + summarizeStudyPatterns), range picker (7/30/date),
  AI summary, quiz-score card, send-to-parent. Verified live (230 events).
- **P5** Settings: voice (5) + speed slider wired into lib/speech via
  lib/settings (SSML rate, karaoke offset preserved) + default scope.
- **P6** focus-visible, spring press, glass, sheet animations,
  reduced-motion.

**NEXT / open:**
- On-device pass for the whole redesign (camera full-bleed alignment with a
  real frame; voice-speed feel; glass legibility in sunlight).
- FUTURE (documented in IMPLEMENTATION_PLAN.md): Full iOS makeover (drop paper
  base) + dark mode; R9 full-LLM autopsy coaching.
- Production = push to origin/main (user's call). Reminder: quiz needs the
  SETUP.md `quiz_result` Supabase migration (already applied by user).

## RESUME FROM HERE (2026-07-19, sixth session — Telegram + redesign P0/P1)

Done + committed this session (build + eslint + logic-tests green each):
- **Item 1 (truncation)**: tutoring "write" labels centered over the word,
  clamped in-frame, wrap instead of clipping ("sin y…" fixed). Camera width
  folds into the redesign's edge-to-edge (P2).
- **Item 4 (Telegram summary)**: `summarizeStudyPatterns` emits emoji-led,
  no-markdown sections + `stripMarkdown()` net. Verified live.
- **Item 5 (group chat)**: webhook handles groups — @mention/command gate
  (privacy mode ON is correct → NO BotFather action), `classifyGroupRequest`
  routes free-text (review/report/help/refuse), every reply tags the asker.
  `botUsername()` via getMe / `TELEGRAM_BOT_USERNAME`. Verified live.
- **REWORK 3 P0/P1 (premium hybrid iOS, team-approved)**: Inter+Bricolage+
  Plex Mono, lucide-react; globals.css glass/press/accent tokens over the
  KEPT paper base; `BottomNav` — glass 4-tab bar (Home · Insights · Scan
  center sheet · Settings), hides inside tools. Insights/Settings are
  placeholder shells.

**NEXT — REWORK 3 remaining (plan: IMPLEMENTATION_PLAN.md top section):**
- P2 edge-to-edge camera + floating glass controls (also finishes item 1
  camera-width). ⚠ keep overlay coord alignment when switching to object-cover.
- P3 replace all emojis with Lucide icons across pages.
- P4 Insights tab full parity (date-range reviews + AI summary via new
  /api/review, quiz scores, send-to-parent; absorb the stats page).
- P5 Settings tab (TTS voice/rate → lib/speech, default scope, camera
  defaults; localStorage).
- P6 micro-interactions + glass polish.
- Future (documented): Full iOS makeover (drop paper base) + dark mode.

## RESUME FROM HERE (2026-07-19, fifth session — REWORK 2 S0–S8 complete)

Second on-device test round. All S-phases landed; build + eslint (0/0) +
logic-tests green each phase.

- **CRITICAL tracking fix (S1)**: root cause = MediaPipe can't parse the
  back-of-hand/fingernail view the mirror-clip camera sees. Replaced with
  **vision-LLM pointing**: `locatePointer()` (adapter) + `POST /api/point` →
  normalized fingertip; Exam-Prep/Autopsy trigger on voice "read this" /
  "I'm stuck" or the button → capture → /api/point → nearest OCR word →
  read/coach. `lib/hand-tracker.ts` kept intact for revert (`selectWordAt`
  reused; the dwell loop is just not started). Rule 3 amendment #2 recorded.
  `/api/point` verified: {found:false} on a hand-less frame, ~1.7s.
- **S2 accuracy**: Azure word-level boxes exposed (`lib/ocr.ts` `words[]`);
  selection + karaoke use real word boxes via `rectForRange()` → fixes the
  "highlight drifts one char + trailing blank" bug.
- **S3/S4**: `--point #ec4d25` overlay colour; degenerate (<3px) overlay
  boxes skipped (kills the stray thin line); tutoring aid coincident with the
  step region suppressed (IoU) so oval+rect never overlap.
- **S5**: camera enlarged (50–56dvh); controls pushed to the bottom.
- **S6**: landing redesigned — "Tech4City 2026" removed, copy cut, feature
  cards grow to fill the screen; notebook theme + karaoke + Lottie kept.
- **S7 (DeskTutor)**: new `write` aid — the model prints the working on the
  paper ("×3 =9/12", "=8/12", …), HTML labels so text isn't stretched;
  per-step text hidden by default with a "show text" toggle. Live E2E
  confirmed circles + write labels.
- **S8**: autopsy quiz "point at it" uses /api/point (button "Check where I'm
  pointing"); stale highlight cleared between words.

**Needs on-device validation**: /api/point pointing accuracy + latency with a
real hand/worksheet (the whole tracking premise); tune the locatePointer
prompt if it misreads pose; confirm word-box highlights on real print;
tutoring on-paper label placement legibility. R9 (full-LLM autopsy coaching)
still only-if-needed. Production = push to origin/main (user's call).

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
