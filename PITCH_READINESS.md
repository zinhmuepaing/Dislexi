# PITCH_READINESS.md — Judging Criteria Gap Checklist

> Living checklist against the **official hackathon judging criteria**
> (received 2026-07-20, supersedes our original target weights below).
> Scope: pitching, slide deck, and validation — NOT code. Update the
> checkboxes as items get done; don't let this go stale.

## Official judging criteria (current)

| # | Criterion | Weight |
|---|---|---|
| 1 | Market Readiness — prototype functionality, user validation, scalability | **40%** |
| 2 | Business Viability — revenue model, financial projections, competitive edge, originality | **30%** |
| 3 | Social Impact — relevance to Singapore's societal needs, theme alignment, potential to inspire change | 20% |
| 4 | Pitching Ability — communicating to potential investors | 10% |

## What we originally built toward (for reference)

| Criterion | Weight |
|---|---|
| Social Impact | 30% |
| Feasibility & Technical Soundness | 30% |
| Creativity & Innovation | 20% |
| Storytelling & Pitching Ability | 20% |

**The shift:** Market Readiness (40%) + Business Viability (30%) = **70%** of
the score, and neither was our original focus. The product itself doesn't
need to change — the gap is almost entirely pitch material, deck content,
and external validation evidence we haven't produced yet.

---

## 1. Market Readiness — 40%

### Prototype functionality
- [ ] Live demo run-through rehearsed end-to-end (Exam-Prep → AI Tutoring →
  Autopsy) with no fallback narration needed
- [ ] Backup demo video recorded (phone in stand, good lighting) in case
  live demo/wifi fails on stage
- [ ] One-slide feature summary that maps each feature to a judging-visible
  "wow" moment (point-and-read verbatim, on-paper AI working, syllable quiz)

### User validation — biggest current gap, nothing external exists yet
- [ ] Recruit 3–5 real families / a tuition center / a SPED-adjacent contact
  to run actual sessions before judging (not team-internal testing)
- [ ] Pull real numbers out of the Insights/analytics stack already built
  (re-read rate, quiz scores, pacing) from those sessions — use ACTUAL data,
  not mockups
- [ ] Collect 1–2 short testimonial quotes (parent or student) for the deck
- [ ] If no time for a real pilot: be honest about it in the pitch rather
  than implying validation that didn't happen — judges penalize overclaiming
  harder than an honest "next milestone" slide

### Scalability
- [ ] One slide explicitly stating the vendor-swap architecture: Azure
  OCR/Speech + Anthropic today are *temporary substitutes*, adapters are
  swappable to sponsor/partner infra (e.g., Huawei Cloud MaaS) with zero
  client-side changes — frame this as a scalability strength, not a TODO
- [ ] State hosting model (Vercel serverless) and why it scales horizontally
  without infra changes as user count grows
- [ ] Rough cost-per-session number (see Business Viability) tied to a
  scalability claim — "scalable" needs a number attached, not just the word

---

## 2. Business Viability — 30%

### Revenue model — currently nothing built here
- [ ] Pick ONE primary revenue model and commit to it in the deck (don't
  present multiple options — looks undecided):
  - Freemium B2C: free Exam-Prep, paid AI Tutoring + parent Insights/Telegram
    reports
  - B2B2C: license per-student through tuition centers / SPED-linked schools
- [ ] One slide: pricing tiers + who pays (parent vs. school) + what's free
  vs. paid

### Financial projections — none exist yet
- [ ] Unit economics: cost per session (Sonnet 4.6 vision calls + Azure
  OCR/Speech — pull REAL numbers from our own API usage/billing) vs.
  subscription price → margin per user
- [ ] TAM / SAM / SOM slide using Singapore's student population and
  dyslexia prevalence — **verify the actual cited % before using it**, don't
  invent or misremember a number for the deck
- [ ] Simple 12–24 month projection (users, revenue, cost) — doesn't need to
  be precise, needs to show the team has thought about it

### Competitive edge
- [ ] Explicit slide: "no LLM ever touches exam-reading content — provably,
  by architecture" as the core trust/compliance differentiator vs. reading
  pens and generic AI tutoring apps
- [ ] Name 1–2 actual competitors (reading pens, generic AI tutor apps) and
  state the specific gap Dislexi fills that they don't

### Originality
- [ ] One line articulating what's structurally novel: deterministic
  verbatim reading + AI tutor that draws working ON the paper + phonics
  autopsy with a quiz loop, all from one phone camera setup
- [ ] Mention the set-of-marks vision-pointing fix as a genuine technical
  contribution (identified and fixed a known vision-LLM coordinate-regression
  failure mode) — technical credibility supports "originality"

---

## 3. Social Impact — 20% (down from our original 30%; don't over-invest time here)

- [ ] Keep existing positioning: dyslexia/ADHD support, SEAB human-exam-reader
  precedent extended to home practice
- [ ] One slide citing Singapore-specific relevance (verify actual stats
  before quoting — dyslexia prevalence, MOE/SPED context) — don't reuse an
  unverified number from a prior draft
- [ ] Tie to competition theme explicitly (whatever this year's stated theme
  is) in one sentence on the same slide

---

## 4. Pitching Ability — 10%

- [ ] Structure: **demo first** (most visceral "wow" — point at text, hear it
  read verbatim, then AI tutor draws working on the page), THEN pivot into
  the business case — don't bury revenue/financials at the end where time
  runs out
- [ ] Rehearse a hard time cap; know which slides get cut first if running long
  (cut Social Impact detail before cutting Business Viability — it's worth
  less now)
- [ ] Prep answers for the 2 questions judges will ask given this weighting:
  "what's your unit economics" and "what evidence do you have real users
  want this" — both should point at real slides in the deck, not verbal
  hand-waving

---

## Priority if time is short

Given 70% of the score sits in categories with the least existing material:

1. **Get any real external user data into Insights** (even a handful of
   sessions) — Market Readiness, biggest current gap
2. **Build the revenue + unit-economics slide** — Business Viability,
   currently zero
3. Everything else on this list, in weight order

Do not spend remaining time on code polish for this scoring shift — the app
itself already covers Market Readiness "prototype functionality" well; the
gap is entirely in slides and evidence.
