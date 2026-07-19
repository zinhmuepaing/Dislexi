"use client";

/**
 * Insights tab (REWORK 3 P4) — the Telegram review flow, in-app: pick a range
 * (7/30 days or a date), get the same AI study-pattern summary the bot
 * sends, see the quiz score, and forward it to the parent on Telegram.
 */

import { useState } from "react";
import { CalendarDays, Send, Loader2, BarChart3 } from "lucide-react";
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
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`review ${res.status}`);
      setReview((await res.json()) as Review);
    } catch (err) {
      console.error(err);
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
      const body = active.startsWith("date") ? { date, send: true } : { days: Number(active), send: true };
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { sent?: boolean };
      setSent(data.sent ? "Sent to the parent on Telegram." : "Couldn’t send — check the Telegram setup.");
    } catch {
      setSent("Couldn’t send — check the connection.");
    } finally {
      setSending(false);
    }
  }

  const q = review?.stats.quiz;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 p-4 pb-24">
      <header className="pt-2">
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Insights</h1>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          Reading-practice patterns and parent reports.
        </p>
      </header>

      {/* Range picker. */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: "7", label: "Last 7 days", body: { days: 7 } },
          { key: "30", label: "Last 30 days", body: { days: 30 } },
        ].map((r) => (
          <button
            key={r.key}
            onClick={() => void load(r.body, r.key)}
            className={`press rounded-full px-3.5 py-2 text-sm font-medium ${
              active === r.key ? "bg-[var(--point)] text-white" : "btn-soft"
            }`}
          >
            {r.label}
          </button>
        ))}
        <div className="flex items-center gap-1 rounded-full border border-[var(--hairline)] bg-[var(--surface)] px-2.5 py-1">
          <CalendarDays size={15} color="var(--ink-soft)" />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-transparent text-sm outline-none"
            aria-label="Pick a date"
          />
          <button
            onClick={() => date && void load({ date }, "date")}
            disabled={!date}
            className="press rounded-full bg-[var(--ink)] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
          >
            Go
          </button>
        </div>
      </div>

      {loading && (
        <div className="card flex items-center justify-center gap-2 p-6 text-sm text-[var(--ink-soft)]">
          <Loader2 size={18} className="animate-spin" /> Reading the patterns…
        </div>
      )}

      {!loading && !review && (
        <div className="card flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <BarChart3 size={30} color="var(--ink-soft)" />
          <p className="text-sm text-[var(--ink-soft)]">Pick a range to see a reading review.</p>
        </div>
      )}

      {!loading && review && (
        <>
          {q && (
            <div className="card flex items-center justify-between p-3">
              <div>
                <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--ink-soft)]">
                  Quiz score
                </p>
                <p className="font-display text-xl font-extrabold">
                  {q.saidCorrect}/{q.saidTotal || q.total}{" "}
                  <span className="text-sm font-normal text-[var(--ink-soft)]">read right</span>
                </p>
              </div>
              <p className="text-right text-[12px] text-[var(--ink-soft)]">
                pointed {q.pointedCorrect}/{q.pointedTotal}
                <br />
                skipped {q.skipped}
              </p>
            </div>
          )}

          <div className="card whitespace-pre-wrap p-4 text-[14px] leading-relaxed">{review.summary}</div>

          <button
            onClick={() => void sendToParent()}
            disabled={sending}
            className="btn-accent press flex items-center justify-center gap-2 py-3 disabled:opacity-50"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Send to parent on Telegram
          </button>
        </>
      )}

      {sent && <p className="text-center text-sm text-[var(--ink-soft)]">{sent}</p>}
    </main>
  );
}
