"use client";

/**
 * Home-page practice summary — a compact, cross-session snapshot for the last
 * 7 days that replaces the (redundant) mode buttons. Headline stat tiles plus
 * one "most-requested words" mini chart, with a link to the full insights view.
 *
 * Data comes from POST /api/review with { statsOnly: true } — the same
 * server-side aggregation as the Telegram review, but WITHOUT the LLM summary
 * or Telegram push (fast + free to run on every home load). Everything shown
 * is a struggle & engagement INDICATOR derived from typed events only.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Chart from "chart.js/auto";
import { BookOpenText, RotateCcw, Puzzle, MessageCircleQuestion, type LucideIcon } from "lucide-react";
import type { SessionStats } from "@/lib/analytics";

const DAYS = 7;

/**
 * Local UI development only: set NEXT_PUBLIC_MOCK_STATS=1 in .env.local to skip
 * the /api/review fetch and render sample data, so the populated layout is
 * visible without Supabase configured. Defaults off — never affects production
 * unless the flag is explicitly set there.
 */
const MOCK_STATS = process.env.NEXT_PUBLIC_MOCK_STATS === "1";
const SAMPLE_STATS: SessionStats = {
  totalEvents: 151,
  countsByType: { read: 128, reread: 14, stuck_word: 6, tutor_question: 3 },
  rereadsByQuestion: { "line-2": 5, "line-5": 9 },
  topWords: [
    { word: "rectangle", count: 9 },
    { word: "perimeter", count: 7 },
    { word: "calculate", count: 5 },
    { word: "triangle", count: 4 },
    { word: "measure", count: 3 },
  ],
  topGraphemes: [],
  pacingGapsSeconds: [],
  medianGapSeconds: 4.2,
  firstEventAt: null,
  lastEventAt: null,
  quiz: null,
};

/** Event types worth surfacing as headline tiles, in display order. */
const TILE_DEFS = [
  { key: "read", label: "Words read", Icon: BookOpenText, accent: "var(--point)" },
  { key: "reread", label: "Re-reads", Icon: RotateCcw, accent: "var(--hl-strong)" },
  { key: "stuck_word", label: "Tricky words", Icon: Puzzle, accent: "var(--ok)" },
  { key: "tutor_question", label: "Questions", Icon: MessageCircleQuestion, accent: "var(--ai)" },
] as const;

interface Tile {
  label: string;
  value: number;
  Icon: LucideIcon;
  accent: string;
}

export function PracticeSummary() {
  const [stats, setStats] = useState<SessionStats | null>(MOCK_STATS ? SAMPLE_STATS : null);
  const [failed, setFailed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  // Fetch the 7-day aggregate once on mount.
  useEffect(() => {
    if (MOCK_STATS) return; // sample data already seeded into initial state
    let cancelled = false;
    fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: DAYS, statsOnly: true }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`review ${r.status}`);
        const { stats } = (await r.json()) as { stats: SessionStats };
        if (!cancelled) setStats(stats);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Draw the "most-requested words" mini chart once stats arrive.
  const topWords = stats?.topWords.slice(0, 5) ?? [];
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || topWords.length === 0) return;
    chartRef.current = new Chart(canvas, {
      type: "bar",
      data: {
        labels: topWords.map((w) => w.word),
        datasets: [
          {
            label: "requests",
            data: topWords.map((w) => w.count),
            backgroundColor: "#2f9e63", // --ok, matches the stats-page words chart
            borderRadius: 4,
            maxBarThickness: 18,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        devicePixelRatio: 2,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false, grid: { display: false }, beginAtZero: true },
          y: { grid: { display: false }, ticks: { font: { size: 11 } } },
        },
      },
    });
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // topWords is derived from stats; redraw whenever the underlying data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats]);

  // Loading skeleton (no data yet, no error).
  if (!stats && !failed) {
    return (
      <section className="flex min-h-0 flex-1 flex-col gap-2.5" aria-label="Your practice">
        <span className="mono-hint uppercase tracking-[0.1em]">your practice</span>
        <div className="card flex-1 animate-pulse" aria-hidden />
      </section>
    );
  }

  // Empty state — no practice recorded, or the aggregate couldn't be loaded.
  if (failed || !stats || stats.totalEvents === 0) {
    return (
      <section className="flex min-h-0 flex-1 flex-col gap-2.5" aria-label="Your practice">
        <span className="mono-hint uppercase tracking-[0.1em]">your practice · last {DAYS} days</span>
        <div className="card flex flex-1 flex-col items-center justify-center gap-1 p-5 text-center">
          <p className="font-display text-base font-extrabold">No practice yet this week</p>
          <p className="text-[13px] leading-snug text-[var(--ink-soft)]">
            Tap <span className="font-semibold text-[var(--ink)]">Scan</span> below to read a
            worksheet — your progress shows up here.
          </p>
        </div>
      </section>
    );
  }

  // Tiles: only event types that actually happened; fall back to a total.
  const tiles: Tile[] = TILE_DEFS.map((d) => ({
    label: d.label,
    value: stats.countsByType[d.key] ?? 0,
    Icon: d.Icon,
    accent: d.accent,
  })).filter((t) => t.value > 0);
  if (tiles.length === 0) {
    tiles.push({
      label: "Practice events",
      value: stats.totalEvents,
      Icon: BookOpenText,
      accent: "var(--point)",
    });
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto" aria-label="Your practice">
      <span className="mono-hint uppercase tracking-[0.1em]">your practice · last {DAYS} days</span>

      <div className="grid grid-cols-2 gap-2.5">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="card relative flex flex-col gap-1 overflow-hidden py-2.5 pl-4 pr-3"
            style={{ background: `color-mix(in srgb, ${t.accent} 9%, var(--card))` }}
          >
            <span
              className="absolute inset-y-0 left-0 w-1.5"
              style={{ background: t.accent }}
              aria-hidden
            />
            <span
              className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{ background: `color-mix(in srgb, ${t.accent} 18%, white)` }}
              aria-hidden
            >
              <t.Icon size={17} color={t.accent} />
            </span>
            <div className="font-display mt-0.5 text-2xl font-extrabold leading-none">{t.value}</div>
            <div className="mono-hint">{t.label}</div>
          </div>
        ))}
      </div>

      {topWords.length > 0 && (
        <div className="card flex min-h-0 flex-1 flex-col px-3 py-2.5">
          <span className="mono-hint mb-1 block uppercase tracking-[0.1em]">most-requested words</span>
          <div className="min-h-[96px] flex-1">
            <canvas ref={canvasRef} />
          </div>
        </div>
      )}

      <Link
        href="/insights"
        className="press mono-hint self-end text-[var(--point)] hover:underline"
      >
        View full insights →
      </Link>
    </section>
  );
}
