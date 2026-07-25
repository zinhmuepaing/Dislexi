"use client";

/**
 * Insights tab — same review data and Telegram actions, presented as a
 * visual-first notebook dashboard.
 */

import { useState } from "react";
import {
  BarChart3,
  BookOpenText,
  CalendarDays,
  Loader2,
  MessageCircleQuestion,
  Puzzle,
  RotateCcw,
  Send,
  Sparkles,
  Trophy,
} from "lucide-react";
import { MetricTile, PageHeader, PaperIcon } from "@/components/PaperUI";
import type { SessionStats } from "@/lib/analytics";

interface Review {
  label: string;
  summary: string;
  stats: SessionStats;
}

export default function InsightsPage() {
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [active, setActive] = useState<string | null>(null);

  async function load(body: { days?: number; date?: string }, key: string) {
    setLoading(true);
    setActive(key);
    setSent(null);
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`review ${response.status}`);
      setReview((await response.json()) as Review);
    } catch (error) {
      console.error(error);
      setReview(null);
      setSent("Couldn’t load that range — check the connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function sendToParent() {
    if (!active) return;
    setSending(true);
    setSent(null);
    try {
      const body = active.startsWith("date")
        ? { date, send: true }
        : { days: Number(active), send: true };
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { sent?: boolean };
      setSent(
        data.sent
          ? "Sent to the parent on Telegram."
          : "Couldn’t send — check the Telegram setup.",
      );
    } catch {
      setSent("Couldn’t send — check the connection.");
    } finally {
      setSending(false);
    }
  }

  const quiz = review?.stats.quiz;

  return (
    <main className="page-shell max-w-5xl">
      <PageHeader
        eyebrow="Progress notebook"
        title="Insights"
        subtitle="Practice patterns, not assessments."
        icon={BarChart3}
        tone="green"
      />

      <section className="paper-card mb-4 flex flex-wrap items-center gap-2 p-3">
        <span className="paper-kicker mr-1">View</span>
        {[
          { key: "7", label: "7 days", body: { days: 7 } },
          { key: "30", label: "30 days", body: { days: 30 } },
        ].map((range) => (
          <button
            key={range.key}
            onClick={() => void load(range.body, range.key)}
            className={`settings-option press min-h-10 px-3 text-sm font-medium ${
              active === range.key ? "settings-option-selected" : ""
            }`}
            aria-pressed={active === range.key}
          >
            {range.label}
          </button>
        ))}
        <div className="paper-input ml-auto flex items-center gap-2 px-2">
          <CalendarDays size={16} color="var(--muted-ink)" aria-hidden />
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="min-w-0 bg-transparent text-sm outline-none"
            aria-label="Pick a date"
          />
          <button
            onClick={() => date && void load({ date }, "date")}
            disabled={!date}
            className="press rounded-md bg-[var(--ink)] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
          >
            Go
          </button>
        </div>
      </section>

      {loading && (
        <section aria-label="Loading insights" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="paper-card h-32 animate-pulse" aria-hidden />
            ))}
          </div>
          <div className="paper-card mt-3 flex min-h-52 items-center justify-center gap-2">
            <Loader2 size={20} className="animate-spin text-[var(--green-deep)]" aria-hidden />
            <span className="paper-kicker">Drawing your review</span>
          </div>
        </section>
      )}

      {!loading && !review && (
        <section className="paper-card paper-empty" aria-label="No insight range selected">
          <div className="visual-bars mb-4" aria-hidden>
            <span />
            <span />
            <span />
            <span />
          </div>
          <h2 className="font-display text-xl font-extrabold">Choose a page range</h2>
          <p className="mt-1 max-w-xs text-sm text-[var(--muted-ink)]">
            Pick 7 days, 30 days, or one date to draw your practice patterns.
          </p>
        </section>
      )}

      {!loading && review && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricTile
              label="Words read"
              value={review.stats.countsByType.read ?? 0}
              icon={BookOpenText}
              tone="coral"
            />
            <MetricTile
              label="Re-reads"
              value={review.stats.countsByType.reread ?? 0}
              icon={RotateCcw}
              tone="yellow"
            />
            <MetricTile
              label="Tricky words"
              value={review.stats.countsByType.stuck_word ?? 0}
              icon={Puzzle}
              tone="green"
            />
            <MetricTile
              label="Questions"
              value={review.stats.countsByType.tutor_question ?? 0}
              icon={MessageCircleQuestion}
              tone="purple"
            />
          </div>

          <div className={`mt-3 grid gap-3 ${quiz ? "lg:grid-cols-[minmax(0,1.7fr)_minmax(250px,0.8fr)]" : ""}`}>
            <article className="paper-card paper-panel-beige p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <PaperIcon icon={Sparkles} tone="beige" />
                <div>
                  <p className="paper-kicker">{review.label}</p>
                  <h2 className="font-display font-extrabold">Study notes</h2>
                </div>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{review.summary}</div>
            </article>

            {quiz && (
              <article className="paper-card paper-panel-green flex flex-col justify-between p-4">
                <div className="flex items-start justify-between">
                  <PaperIcon icon={Trophy} tone="green" />
                  <span className="stamp stamp-ok">Quiz</span>
                </div>
                <div className="mt-6">
                  <p className="paper-kicker">Read correctly</p>
                  <p className="font-display mt-1 text-3xl font-extrabold">
                    {quiz.saidCorrect}
                    <span className="text-base font-medium text-[var(--muted-ink)]">
                      /{quiz.saidTotal || quiz.total}
                    </span>
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--muted-ink)]">
                    <span>Pointed {quiz.pointedCorrect}/{quiz.pointedTotal}</span>
                    <span>Skipped {quiz.skipped}</span>
                  </div>
                </div>
              </article>
            )}
          </div>

          <button
            onClick={() => void sendToParent()}
            disabled={sending}
            className="btn-accent press mt-3 flex min-h-12 w-full items-center justify-center gap-2 disabled:opacity-50"
          >
            {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
            Send this page to parent
          </button>
        </>
      )}

      {sent && (
        <p className="paper-card paper-panel-yellow mt-3 p-3 text-center text-sm" aria-live="polite">
          {sent}
        </p>
      )}
    </main>
  );
}
