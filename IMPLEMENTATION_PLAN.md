# IMPLEMENTATION_PLAN.md — Dislexi Build Plan

Step-by-step plan for everything still TODO in the scaffold. `ARCHITECTURE.md`
is ground truth; section references (§) point there. Work the phases in order —
each phase ends with a verification gate.

---

# REWORK PLAN 2026-07-18 (post team-testing feedback) — ACTIVE

Approved by the team 2026-07-18. Original build plan (below) is complete;
this section tracks the rework. Rule amendments approved via team Q&A:

- **Rule 3 (amended):** an LLM may INTERPRET voice commands (intent parsing
  only) in Exam-Prep/Autopsy. The string sent to TTS in Exam-Prep remains
  **verbatim OCR text — never model-touched**. Keyword fast-path runs before
  any LLM call.
- **Rule 4 (amended):** TTS may speak whole words and multi-letter
  **syllables** (pronounceable units). Isolated phonemes still come ONLY
  from the static bank.

Phases (mark as they land):

- [x] **R0 — Plan + rule amendments in-repo** (this section; ARCHITECTURE.md
  §7 rules 3 & 4; CLAUDE.md mirror).
- [x] **R1 — Responsive shell**: `h-dvh` app shell; camera capped
  (~44dvh); Rescan/End-session and all controls visible WITHOUT scrolling on
  home/exam-prep/tutoring/autopsy at 375×812; stats page keeps scrolling.
- [x] **R2 — Telegram delivery bug**: reproduce stats-page send; fix
  (likely re-wrap `req.formData()` Blob into a fresh typed `File` for the
  outbound undici FormData); surface Telegram `description` to the client;
  verify one real delivery.
- [x] **R3 — Voice engine**: `lib/stt.ts` — Azure Speech SDK continuous
  recognition via `/api/azure-token` (endless until mic toggled off / End
  session; endpointing = silence chunking; NO raw audio stored, §7 rule 8;
  webkitSpeechRecognition fallback). `POST /api/voice-command` →
  `parseVoiceCommand()` in `lib/tutor-model.ts` (claude-haiku-4-5; strict
  JSON `{intent, scope?}`); client keyword fast-path first.
- [x] **R4 — Exam-Prep scopes + tracking**: Word/Sentence(default)/Paragraph
  selector (chips + voice); `buildParagraphs()` added to `lib/sentences.ts`;
  word mode via `subBoxFor` sub-boxes; asymmetric vertical weighting in
  `selectWordAt` (boxes ABOVE the pointer cost less — the finger occludes
  below); "point just under the word" hint; voice: read this
  word/sentence/paragraph, again, stop.
- [x] **R5 — Tutoring highlights + aids + auto-ask**: OCR line map sent with
  the tutor request; model outputs ANCHORS (`{line, phrase}`) never raw
  coords; server resolves anchors → normalized rects via `subBoxFor`;
  optional `aids` (box/circle/arrow between anchors) rendered as SVG
  overlays; STT auto-submits the question on silence (text box stays as
  §9.5 fallback).
- [x] **R6 — Autopsy deterministic coaching**: syllables via `hypher` +
  `hyphenation.en-us`; fixed template "This word is 'Awards'. A — wards —
  Awards." spoken twice (word verbatim from OCR); practice list kept for the
  quiz; phoneme sweep stays behind "sound it out"; trace-to-unlock retired
  from the practice loop.
- [x] **R7 — End-of-session quiz + score**: skippable per-word quiz (say it
  → STT fuzzy match ≥0.8; point at it → containment check, 10 s); score on
  the stats page; DB migration adds `'quiz_result'` to the `events.type`
  check (SETUP.md; apply in Supabase).
- [x] **R8 — Landing + Lottie**: trim copy (KEEP karaoke line + notebook
  theme); `lottie-web` + self-hosted vetted animations in `public/lottie/`
  (+ ATTRIBUTIONS.md); used on hero, quiz success, tutoring thinking.
- [ ] **R9 — CONTINGENCY (only if R6 quality disappoints on-device)**:
  full-LLM coaching behind `AUTOPSY_LLM_COACH=1` — Sonnet coaching text +
  syllables, LLM verification of the child's repeat, optional Sonnet-vision
  pointing check; deterministic fallback on any model error.
- FUTURE (documented only): optional Three.js 3D hero element on the
  landing page.

Cross-cutting: every phase gates on `npm run build` + `npx eslint .` +
`npx tsx scripts/logic-tests.mts`; reuse `lib/audio.ts`, `lib/speech.ts`,
`lib/sentences.ts`, `subBoxFor`, `selectWordAt`/`DwellTracker`; secrets stay
in `lib/` + `app/api/`; no service worker; all assets self-hosted; new deps
limited to `hypher`, `hyphenation.en-us`, `lottie-web`.

---

## Phase 0 — Prerequisites (status)

| Item | Status |
|---|---|
| Next.js scaffold, all 8 API routes, adapters (`lib/ocr.ts`, `lib/tutor-model.ts`) | ✅ done |
| Azure Vision / Azure Speech / Anthropic keys in `.env.local` | ✅ configured |
| Supabase project + schema | ⏸ deferred — `SETUP.md` §1–2; `/api/sessions`, `/api/events`, `/api/session-end` and Telegram reviews stay untestable until then |
| Telegram bot + webhook | ⏸ deferred — `SETUP.md` §3; Phase 6 |

---

## Phase 1 — Hand tracking foundation (MediaPipe Hand Landmarker)

Based on the official web_js guide
(<https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js>).
`@mediapipe/tasks-vision` is already in `package.json`.

**1.1 Self-host the model + WASM assets** (no-service-worker PWA must not
depend on a CDN mid-demo; CDN stays as documented fallback):

```bash
mkdir -p public/models/wasm
# model
curl -L -o public/models/hand_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task
# wasm runtime: copy from the installed package
cp node_modules/@mediapipe/tasks-vision/wasm/* public/models/wasm/
```

**1.2 Create `lib/hand-tracker.ts`** (client-side singleton):

```ts
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

let landmarker: HandLandmarker | null = null;

export async function getHandLandmarker(): Promise<HandLandmarker> {
  if (landmarker) return landmarker;
  const vision = await FilesetResolver.forVisionTasks("/models/wasm");
  // CDN fallback: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "/models/hand_landmarker.task" },
    numHands: 1,
    runningMode: "IMAGE", // single-shot pointing is the default mode
  });
  return landmarker;
}
```

**1.3 Single-shot fingertip detection** (pointing — Exam-Prep & Autopsy):

- Input is the **frozen, already-flipped canvas** from `CameraStage` — never
  the raw video (§7 rule 1: step 0 happens before MediaPipe).
- `const result = landmarker.detect(canvas);`
- Fingertip = `result.landmarks[0]?.[8]` — **landmark index 8 = index
  fingertip** (§7 rule 5). Coordinates are **normalized 0–1**; convert:
  `px = lm.x * frame.width`, `py = lm.y * frame.height` (flipped-frame pixels,
  same space as the OCR boxes).

**1.4 Nearest-block selection helper** (in `lib/hand-tracker.ts`):

- Reuse `OcrBox` from `components/KaraokeHighlight.tsx`.
- For each block: center = mean of the 4 box corners; pick the minimum
  Euclidean distance to the fingertip; **ties → topmost** (smallest center y).

**1.5 Trace-verification loop** (Autopsy, ~5 fps — §2 "reduced-frame-rate
loose verification"):

- `await landmarker.setOptions({ runningMode: "VIDEO" })`, then in a
  `requestAnimationFrame` loop throttled to ~200 ms per sample and guarded by
  `video.currentTime !== lastVideoTime` (per the docs), call
  `landmarker.detectForVideo(flippedCanvas, performance.now())`.
  ⚠ Draw the video to the flipped canvas first — VIDEO mode does not change
  the step-0 rule.
- Track fingertip samples; verify **loosely**: (a) point inside the word box
  (with ~20 % padding), (b) net left-to-right motion (last x − first x > ~60 %
  of box width). `detect*` is synchronous and blocks the UI thread — at 5 fps
  this is acceptable; move to a Web Worker only if the demo phone stutters.
- Restore `runningMode: "IMAGE"` when leaving trace mode.

**Verify:** dev page or console harness — point at a printed sheet, log the
fingertip pixel coords and chosen block; trace a word and confirm the
left-to-right check fires. `npm run build` passes.

---

## Phase 2 — Exam-Prep completion (`app/exam-prep/page.tsx`)

No LLM anywhere in this path (§7 rule 3). Existing pieces: capture+flip+freeze
(`CameraStage`), `/api/ocr`, `/api/azure-token`, `/api/sessions`, `/api/events`,
`KaraokeHighlight` + `subBoxFor`.

1. **Trigger**: keep the "Read this" button (permanent fallback, §9.5); add
   Web Speech API keyword match (`webkitSpeechRecognition`, continuous,
   match /read this/i — plain keyword match, no LLM). Mic is used for trigger
   detection only; nothing recorded (§7 rule 8).
2. **Fingertip → block**: after OCR, run Phase-1 `detect()` on the frozen
   frame; select the nearest block (1.4). Fall back to tap-selection if no
   hand is found.
3. **TTS verbatim + karaoke**:
   - `GET /api/azure-token` (cache client-side ~8 min).
   - `SpeechConfig.fromAuthorizationToken(token, region)` from
     `microsoft-cognitiveservices-speech-sdk`; create `SpeechSynthesizer`.
   - Speak the selected block's text **verbatim** — no rewriting layer (§5.4).
   - `synthesizer.wordBoundary = (s, e) => setActive(e.textOffset, e.wordLength)`
     drives `KaraokeHighlight` — the event IS the sync mechanism; no timing
     estimator.
4. **Event logging**: queue `{type:'read'|'reread', word, question_ref?}` —
   `reread` when the same block text is requested again this session. Flush the
   queue to `/api/events` every ~5 s and on session end (§6).
5. **Session end** → Phase 5 stats page.

**Verify:** point → "read this" → correct phrase spoken verbatim with word
highlight tracking; events visible in Supabase (once configured).

---

## Phase 3 — AI Tutoring completion (`app/tutoring/page.tsx`)

SSE streaming, frozen-frame region highlight, and follow-up history already
work.

1. **Narration sync**: after the final `{steps}` frame, iterate steps — speak
   `steps[i].say` via the Azure Speech synthesizer (reuse Phase-2 token/config
   helper), set `activeStep = i` when its utterance starts, advance on
   `synthesisCompleted`. Start TTS on the first complete step (§8).
2. **Voice input**: Web Speech API dictation into the question box; text input
   stays permanently (§9.5 Safari/iOS).
3. **Events**: log `{type:'tutor_question', word: question}` via the shared
   event queue; create the session on page entry (already scaffolded pattern in
   autopsy page).
4. Announce mode entry aloud ("Look at your screen…", §7 rule 6).

**Verify:** ask about a worksheet — steps narrate one at a time with the
matching region highlighted on the frozen frame; follow-up keeps the frame.

---

## Phase 4 — Autopsy completion (`app/autopsy/page.tsx`)

No LLM, phonemes never from TTS (§7 rules 3–4).

1. **Word selection**: tap (or Phase-1 point) → nearest block → split block
   text on spaces → proportional sub-boxes via `subBoxFor` → tapped word.
   First tap: speak that word only (Azure TTS, verbatim), log `stuck_word`.
2. **Grapheme chunking**: `lib/graphemes.ts` — a data table mapping words to
   grapheme chunks (e.g. `charge → ch|ar|ge`) anchored to a published phonics
   scope-and-sequence (never invent pedagogy). For the demo, a curated list of
   target words is sufficient; unknown words fall back to per-letter chunks.
3. **Phoneme bank**: curate ~44 files into `public/phonemes/{id}.mp3` from
   CC-licensed Wikimedia Commons IPA recordings; record every source + license
   in `public/phonemes/ATTRIBUTIONS.md`; self-record gap-fill only.
4. **Sound-out sweep**: second tap → `GraphemeSweep` advances `activeIndex` on
   each phoneme's `Audio.ended`; then blend the whole word once via TTS.
5. **Trace-to-unlock**: announce "now trace it" aloud (§7 rule 6) → Phase-1
   trace loop (1.5) → on success play a chime (`public/chime.mp3`), log
   `trace_complete` with the `grapheme` pattern.

**Verify:** full autopsy on a printed word: tap → word spoken; tap → chunked
sweep with static phonemes; trace on paper → chime; events logged.

---

## Phase 5 — Analytics page + reports

1. `app/stats/[sessionId]/page.tsx`: fetch `POST /api/session-end` → render
   Chart.js canvases (requests/re-reads bar, re-read clusters by question,
   top words, pacing timeline from `pacingGapsSeconds` — slowdown = fatigue
   signal). Label everything "struggle & engagement indicators" — no
   emotional/clinical claims.
2. **Exports (client-side)**: XLSX via SheetJS (`XLSX.utils.json_to_sheet` per
   stats table); PDF via jsPDF + `canvas.toDataURL()` of the Chart.js canvases.
3. **Delivery**: POST both files as multipart to `/api/report-upload`
   (route exists) → Telegram.
4. Exam-Prep "End session" navigates here.

**Verify:** end a session → charts render; both files download locally; with
Telegram configured, `{delivered:true}` and files arrive in the chat.

---

## Phase 6 — Telegram bot commands (FUTURE — after Supabase + bot setup)

Prereqs: `SETUP.md` §1–2 (Supabase) and §3 (BotFather token, secret,
`setWebhook`, chat id). The webhook route
(`app/api/telegram/webhook/route.ts`) already validates the
`X-Telegram-Bot-Api-Secret-Token` header and implements `/start` and the
7/30-day review buttons; `lib/telegram.ts` has `sendMessage`, `sendDocument`,
`answerCallbackQuery`.

**Step 1 — verify the existing `/start`:** deploy → send `/start` to the bot →
expect a reply containing the chat id and the review keyboard. Curl test:

```bash
curl -X POST https://<domain>/api/telegram/webhook \
  -H "X-Telegram-Bot-Api-Secret-Token: $SECRET" -H "Content-Type: application/json" \
  -d '{"message":{"chat":{"id":123},"text":"/start"}}'   # expect 200 + bot reply
```

**Step 2 — verify review buttons (implemented):** tap "Last 7 days" → bot
answers the callback, aggregates events since `now-7d`
(`computeStats`/`statsToText` in `lib/analytics.ts`), replies with the
`summarizeStudyPatterns` narrative (falls back to raw aggregates on model
error). Same via curl with `{"callback_query":{"id":"1","data":"review:7",...}}`.

**Step 3 — add "Pick a date" (new):**
1. Add `{text:"Pick a date", callback_data:"review:pick"}` to
   `REVIEW_KEYBOARD` in the webhook route.
2. On `review:pick`: reply "Send a date as YYYY-MM-DD (or YYYY-MM for a
   monthly rollup)".
3. In the message handler, before the fallback reply, match
   `/^\d{4}-\d{2}(-\d{2})?$/`; compute `[start, end)` for that day/month;
   query events with `.gte("ts", start).lt("ts", end)`; reuse the
   `handleReview` aggregate → summarize → reply path (extract a
   `reviewRange(chatId, start, end, label)` helper from `handleReview`).
4. Test: send `2026-07-16` → narrative for that day; garbage input → keyboard.

**Step 4 — add `/help` (new):** in the message handler, reply with the command
list (`/start`, `/help`, review buttons, date format). Keep it before the
default keyboard reply.

**Step 5 — add `/report` (new, optional):** reply with `statsToText` of the
most recent session (`sessions` ordered by `started_at desc` limit 1, join its
events). Note: report *files* are client-generated; the bot re-sends stats
text, not regenerated PDFs.

**Step 6 — register commands with BotFather** (`/setcommands`): `start`,
`help`, `report` — makes them autocomplete in the Telegram UI.

Rules for all bot replies: study-pattern insights and recommendations only —
never emotional or clinical claims (§5.5); respond 200 fast, work inline.

---

## Cross-cutting verification (every phase)

- `npm run build` green before each commit.
- No `process.env` reads outside `lib/` + `app/api/` (secrets never
  client-side).
- The 8 §7 rules hold — especially: no LLM in Exam-Prep/Autopsy, phonemes only
  from the static bank, every frame flipped before processing.
- Real-device pass on the demo phone (Safari iOS quirks: Web Speech STT is
  inconsistent → text fallbacks are permanent).
