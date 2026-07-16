# Dislexi — Assistive Reading & Tutoring System

Mobile-first web app for students with dyslexia/ADHD (Tech4City 2026). The
phone sits in a folding stand with a mirror clip over the front camera, looking
down at a worksheet. Three features: **Exam-Prep** (deterministic literal
reading — no LLM in that path, ever), **AI Tutoring** (vision model explains
step by step with on-screen highlights), and **Stuck-Word Autopsy** (phonics
sound-out from a static phoneme bank + camera-verified finger tracing).

- **`ARCHITECTURE.md`** — ground truth for system design, contracts, and the
  8 non-negotiable client pipeline rules. Read it before changing anything.
- **`SETUP.md`** — step-by-step Supabase, Vercel env vars, and Telegram bot
  setup.
- **`.env.local.example`** — every environment variable, documented.

## Temporary vendor substitutions

Huawei Cloud OCR and MaaS are not yet accessible, so two adapters currently
run on substitutes. Routes only import the adapters — swapping back touches
one file each:

| Adapter | Currently | Swap target (when Huawei access lands) |
|---|---|---|
| `lib/ocr.ts` | Azure AI Vision, Image Analysis 4.0 "Read" (sync, F0 tier) | `lib/huawei-ocr.ts` per ARCHITECTURE.md §5.1 |
| `lib/tutor-model.ts` | Claude Sonnet 4.6 via Anthropic API | `lib/maas.ts` per ARCHITECTURE.md §5.3 (+ `MAAS_TEXT_MODEL` for Telegram reviews) |

The response contracts (`/api/ocr`, `/api/tutor` SSE) do not change when
swapped.

## Develop

```bash
cp .env.local.example .env.local   # fill in keys
npm install
npm run dev
```

`npm run build` must pass before deploying (Vercel runs it on push).
