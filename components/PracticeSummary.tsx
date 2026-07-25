"use client";

/**
 * Home-page practice summary — a responsive visual snapshot for the last
 * seven days. It keeps the existing data path but presents it as pastel paper
 * tiles, an HTML bar chart, and compact progress notes.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  Gauge,
  MessageCircleQuestion,
  Puzzle,
  RotateCcw,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { SessionStats } from "@/lib/analytics";

const DAYS = 7;

/**
 * Local UI development only: set NEXT_PUBLIC_MOCK_STATS=1 in .env.local to
 * render the populated layout without Supabase. Production remains real-data
 * only unless the flag is deliberately set there.
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

const TILE_DEFS = [
  { key: "read", label: "Words read", Icon: BookOpenText, tone: "coral" },
  { key: "reread", label: "Re-reads", Icon: RotateCcw, tone: "yellow" },
  { key: "stuck_word", label: "Tricky words", Icon: Puzzle, tone: "green" },
  {
    key: "tutor_question",
    label: "Questions",
    Icon: MessageCircleQuestion,
    tone: "purple",
  },
] as const;

interface Tile {
  label: string;
  value: number;
  Icon: LucideIcon;
  tone: "coral" | "yellow" | "green" | "purple";
}

export function PracticeSummary() {
  const [stats, setStats] = useState<SessionStats | null>(MOCK_STATS ? SAMPLE_STATS : null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (MOCK_STATS) return;
    let cancelled = false;
    fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: DAYS, statsOnly: true }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`review ${response.status}`);
        const { stats: loadedStats } = (await response.json()) as { stats: SessionStats };
        if (!cancelled) setStats(loadedStats);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const topWords = stats?.topWords.slice(0, 5) ?? [];

  if (!stats && !failed) {
    return (
      <section aria-label="Your practice" aria-busy="true">
        <div className="mb-2 h-4 w-32 animate-pulse rounded bg-[var(--line)]" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="paper-card h-32 animate-pulse bg-[var(--paper-card)]"
              aria-hidden
            />
          ))}
        </div>
      </section>
    );
  }

  if (failed || !stats || stats.totalEvents === 0) {
    return (
      <section aria-label="Your practice">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="paper-section-title">Your practice</h2>
          <span className="paper-kicker">Last {DAYS} days</span>
        </div>
        <div className="paper-card flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="paper-illustration">
            <BookOpenText size={42} aria-hidden />
          </span>
          <div>
            <p className="font-display text-lg font-extrabold">A fresh page</p>
            <p className="mt-1 max-w-xs text-sm text-[var(--muted-ink)]">
              Start from Scan. Your practice will take shape here.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const tiles: Tile[] = TILE_DEFS.map((definition) => ({
    label: definition.label,
    value: stats.countsByType[definition.key] ?? 0,
    Icon: definition.Icon,
    tone: definition.tone,
  })).filter((tile) => tile.value > 0);

  if (tiles.length === 0) {
    tiles.push({
      label: "Practice events",
      value: stats.totalEvents,
      Icon: BookOpenText,
      tone: "coral",
    });
  }

  const readCount = stats.countsByType.read ?? 0;
  const nextCheckpoint = Math.max(50, Math.ceil((readCount + 1) / 50) * 50);
  const checkpointProgress = Math.min(100, Math.round((readCount / nextCheckpoint) * 100));
  const maxWordCount = Math.max(...topWords.map((word) => word.count), 1);

  return (
    <section aria-label="Your practice">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="paper-kicker">Dashboard</p>
          <h2 className="paper-section-title">Your practice</h2>
        </div>
        <Link href="/insights" className="paper-link">
          Full insights <ArrowRight size={14} aria-hidden />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <article key={tile.label} className={`metric-card metric-${tile.tone}`}>
            <span className="metric-icon" aria-hidden>
              <tile.Icon size={18} strokeWidth={2.1} />
            </span>
            <strong className="font-display mt-3 text-3xl font-extrabold leading-none">
              {tile.value}
            </strong>
            <span className="paper-kicker mt-2">{tile.label}</span>
          </article>
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(240px,0.8fr)]">
        <article className="paper-card p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="paper-kicker">Word chart</p>
              <h3 className="font-display text-base font-extrabold">Most-requested words</h3>
            </div>
            <Puzzle size={20} className="text-[var(--green-deep)]" aria-hidden />
          </div>

          {topWords.length > 0 ? (
            <div className="space-y-3">
              {topWords.map((word) => (
                <div key={word.word} className="word-chart-row">
                  <span className="word-chart-label text-sm font-medium" title={word.word}>
                    {word.word}
                  </span>
                  <div className="word-chart-track" aria-hidden>
                    <span
                      style={{
                        width: `${Math.max(10, (word.count / maxWordCount) * 100)}%`,
                      }}
                    />
                  </div>
                  <strong className="font-mono text-xs">{word.count}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-36 items-center justify-center text-sm text-[var(--muted-ink)]">
              No tricky words recorded
            </div>
          )}
        </article>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <article className="paper-card paper-note paper-note-yellow flex flex-col justify-between p-4">
            <div className="flex items-center justify-between">
              <span className="paper-icon paper-icon-yellow">
                <Target size={18} aria-hidden />
              </span>
              <span className="paper-kicker">{checkpointProgress}%</span>
            </div>
            <div className="mt-5">
              <p className="paper-kicker">Next checkpoint</p>
              <p className="font-display mt-1 text-xl font-extrabold">
                {readCount}{" "}
                <span className="text-sm font-medium text-[var(--muted-ink)]">
                  / {nextCheckpoint}
                </span>
              </p>
              <div
                className="paper-progress mt-3"
                role="progressbar"
                aria-label="Progress to next reading checkpoint"
                aria-valuemin={0}
                aria-valuemax={nextCheckpoint}
                aria-valuenow={readCount}
              >
                <span style={{ width: `${checkpointProgress}%` }} />
              </div>
            </div>
          </article>

          <article className="paper-card paper-note paper-note-purple flex flex-col justify-between p-4">
            <span className="paper-icon paper-icon-purple">
              <Gauge size={18} aria-hidden />
            </span>
            <div className="mt-5">
              <p className="paper-kicker">Practice rhythm</p>
              <p className="font-display mt-1 text-xl font-extrabold">
                {stats.medianGapSeconds === null ? "—" : `${stats.medianGapSeconds}s`}
              </p>
              <p className="mt-1 text-xs text-[var(--muted-ink)]">
                Typical gap between actions
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
