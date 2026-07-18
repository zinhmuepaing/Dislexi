# CLAUDE.md — Dislexi

> **Session state / blockers / next steps: see `PROGRESS.md`.**

Assistive Reading & Tutoring System for students with dyslexia/ADHD (Tech4City
2026). Mobile-first Next.js web app; the phone sits in a stand with a mirror
clip over the front camera, looking down at a worksheet on the desk.

## Document hierarchy

1. **`ARCHITECTURE.md` — ground truth.** System design, service contracts,
   env vars, DB schema, API contracts, and the 8 non-negotiable pipeline
   rules. Nothing below overrides it. Read it before changing anything.
2. `IMPLEMENTATION_PLAN.md` — phased build order and what's still TODO.
3. `SETUP.md` — Supabase / Vercel / Telegram service setup steps.
4. `.env.local.example` — every env var, documented. Secrets live in
   `.env.local` (gitignored).

## Non-negotiable rules (ARCHITECTURE.md §7 — compliance, not preference)

1. **Step 0 — orientation** (amended 2026-07-17): capture is RAW/unmirrored
   by default for both cameras; the in-app "Mirror clip" toggle applies
   `ctx.scale(-1, 1)` when the physical clip is attached. OCR, MediaPipe and
   display all consume the same canvas (`components/CameraStage.tsx`), so
   coordinates always share one space.
2. **Freeze-frame per interaction.** One frame per request; never OCR/tutor a
   live stream.
3. **NO LLM in the read-aloud content path** (amended 2026-07-18): the string
   sent to TTS in Exam-Prep is OCR text VERBATIM — no model may generate,
   rewrite or filter it. An LLM MAY parse voice COMMANDS (intent only;
   keyword fast-path first). A model touching read-aloud text → refuse and flag.
4. **Isolated phonemes never come from TTS** (amended 2026-07-18): static
   bank in `public/phonemes/` only (TTS hallucinates a schwa on isolated
   plosives). TTS MAY speak whole words and multi-letter syllables.
5. **Fingertip = MediaPipe landmark 8** in canvas coords; selection (amended
   2026-07-17, tap-to-read removed) = pointed spot (tip extended along the
   finger's 7→8 direction, smoothed), containment-first then clamped rect
   distance (y-weighted), ties → topmost, triggered by ~0.7 s dwell. The
   displayed dot and the selecting point must be the same point
   (`detectPointerVideo`/`selectWordAt`/`DwellTracker` in `lib/hand-tracker.ts`).
6. **Mode transitions announced aloud** (ADHD split-attention mitigation).
7. **Grapheme sub-boxes** = proportional char-count split of the word's box
   (`subBoxFor` in `components/KaraokeHighlight.tsx`).
8. **No raw audio retention, ever.** Mic is for trigger phrases and questions
   only; only typed events reach Supabase.

Also: **no service worker** — `manifest.json` only, so every deploy is live
instantly. **No secret ever reaches client code**; the browser only calls our
own `/api/*` routes. The string sent to TTS in Exam-Prep is the OCR text
**verbatim** — no rewriting layer between OCR output and TTS input.

## Temporary vendor substitutions (isolated behind adapters)

Huawei Cloud access is pending. Two adapters run substitutes; **routes import
adapters only** — never call Azure/Anthropic directly from a route.

| Adapter | Currently | Swap target (later) |
|---|---|---|
| `lib/ocr.ts` | Azure AI Vision, Image Analysis 4.0 "Read" (sync, F0 tier) | `lib/huawei-ocr.ts` per ARCHITECTURE.md §5.1 |
| `lib/tutor-model.ts` | Claude Sonnet 4.6 (`claude-sonnet-4-6`, Anthropic API) | `lib/maas.ts` per ARCHITECTURE.md §5.3; Telegram reviews → `MAAS_TEXT_MODEL` |

Contracts must not change when swapped. `lib/ocr.ts` deliberately emits one
block per **line** (matching Huawei granularity) so client behavior is
identical across vendors.

## API contracts (ARCHITECTURE.md §6)

| Route | In → Out |
|---|---|
| `POST /api/ocr` | `{imageBase64}` → `{blocks:[{text,confidence,box:[[x,y]×4]}]}` |
| `POST /api/tutor` | `{imageBase64,question,history?}` → SSE `{delta}`… then `{steps:[{say,region}]}` (region 0–1) |
| `GET /api/azure-token` | → `{token,region}` (short-lived Speech token) |
| `POST /api/sessions` | `{mode}` → `{sessionId}` |
| `POST /api/events` | `{sessionId,events[]}` → `{ok:true}` (batched ~5 s) |
| `POST /api/session-end` | `{sessionId}` → `{stats}` |
| `POST /api/report-upload` | multipart pdf,xlsx,sessionId → `{delivered:true}` |
| `POST /api/telegram/webhook` | Telegram update → 200 (validates secret header) |

## Layout

```
app/            pages (mode selector, exam-prep, tutoring, autopsy) + api/ routes
lib/            adapters + server-only helpers (ocr, tutor-model, supabase,
                telegram, analytics) — secrets are read ONLY here and in app/api/
components/     CameraStage (flip + freeze-frame), KaraokeHighlight, GraphemeSweep
public/         manifest.json, phonemes/ (static bank), models/ (MediaPipe assets)
.claude/skills/ project skills shared with the team (karpathy-guidelines, etc.)
```

## Commands

- `npm run dev` — local dev (needs `.env.local`)
- `npm run build` — must pass before any commit that touches code
- `npx eslint .` — lint

## Conventions

- TypeScript strict, App Router, Tailwind. API routes: Node runtime
  (`export const runtime = "nodejs"`).
- Follow the **karpathy-guidelines** skill: surface assumptions before coding;
  minimum code that solves the problem; touch only what you must; define
  success criteria and verify.
- Client pages are `"use client"`; keep heavy work (MediaPipe, Speech SDK) in
  client-side libs, all vendor/API secrets in server-side libs.
- Event types are constrained by the DB check: `read, reread, stuck_word,
  autopsy_soundout, trace_complete, tutor_question`.
- Analytics are indicators, never emotional or clinical claims — this applies
  to the Telegram review prompt too.
