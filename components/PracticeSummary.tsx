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
      <section
        aria-label="Your practice"
        aria-busy="true"
        className="flex min-h-0 flex-1 flex-col gap-1.5 sm:gap-3"
      >
        <div className="h-4 w-32 shrink-0 animate-pulse rounded bg-[var(--line)]" />
        <div className="grid shrink-0 grid-cols-4 gap-2 sm:gap-3">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="paper-card h-20 animate-pulse bg-[var(--paper-card)] sm:h-32"
              aria-hidden
            />
          ))}
        </div>
        <div className="paper-card min-h-0 flex-1 animate-pulse bg-[var(--paper-card)]" aria-hidden />
      </section>
    );
  }

  if (failed || !stats || stats.totalEvents === 0) {
    return (
      <section aria-label="Your practice" className="flex min-h-0 flex-1 flex-col gap-1.5 sm:gap-3">
        <div className="flex shrink-0 items-center justify-between">
          <h2 className="paper-section-title">Your practice</h2>
          <span className="paper-kicker">Last {DAYS} days</span>
        </div>
        <div className="paper-card flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
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
    // Fills the height it is given rather than running past the fold: the two
    // blocks below the title share the leftover space (2 parts tiles, 3 parts
    // chart), so the same markup fits an iPhone SE and a desktop without
    // anything being dropped. Every `min-h-0` is load-bearing — without it a
    // flex child refuses to shrink below its content and the overflow returns.
    <section aria-label="Your practice" className="flex min-h-0 flex-1 flex-col gap-1.5 sm:gap-3">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div>
          <p className="paper-kicker">Dashboard</p>
          <h2 className="paper-section-title">Your practice</h2>
        </div>
        <Link href="/insights" className="paper-link">
          Full insights <ArrowRight size={14} aria-hidden />
        </Link>
      </div>

      {/* One row rather than 2x2: the second row costs ~100px, which is most of
          what a small phone is short by. Column count follows the tile count, so
          two tiles share the row rather than leaving half of it empty. */}
      <div
        className="grid shrink-0 gap-2 sm:gap-3"
        style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0,1fr))` }}
      >
        {tiles.map((tile) => (
          <article key={tile.label} className={`metric-card metric-${tile.tone}`}>
            <span className="metric-icon" aria-hidden>
              <tile.Icon size={18} strokeWidth={2.1} />
            </span>
            <strong className="font-display mt-1 text-2xl font-extrabold leading-none sm:mt-3 sm:text-3xl">
              {tile.value}
            </strong>
            <span className="paper-kicker mt-0.5 sm:mt-2">{tile.label}</span>
          </article>
        ))}
      </div>

      {/* Chart beside the notes at EVERY width, not just lg. Stacked, the two
          together need ~250px more than a small phone has to give. */}
      {/* Capped: these cards fill the height they are given, but on an unusually
          tall window "all of it" means 176px between chart rows. Past ~480px the
          surplus is better left as breathing room than poured into the gaps. */}
      <div className="grid max-h-[480px] min-h-0 flex-1 grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-2 sm:gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(240px,0.8fr)]">
        <article className="paper-card flex min-h-0 flex-col p-3 sm:p-5">
          <div className="mb-1 flex shrink-0 items-center justify-between gap-2 sm:mb-4">
            <div className="min-w-0">
              <p className="paper-kicker">Word chart</p>
              {/* Must stay on ONE line in the narrow column — wrapping it costs
                  ~19px, which is a whole chart row. */}
              <h3 className="font-display text-[13px] font-extrabold leading-tight sm:text-base">
                Most-requested words
              </h3>
            </div>
            <Puzzle size={18} className="shrink-0 text-[var(--green-deep)] sm:size-5" aria-hidden />
          </div>

          {topWords.length > 0 ? (
            // Spread the rows down the card so they use its height — but only
            // from three up. With one or two recorded words "between" flings
            // them to opposite ends with a void between.
            <div
              className={`flex min-h-0 flex-1 flex-col gap-0.5 sm:gap-3 ${
                topWords.length >= 3 ? "justify-between" : "justify-start"
              }`}
            >
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
            <div className="flex min-h-0 flex-1 items-center justify-center text-center text-sm text-[var(--muted-ink)]">
              No tricky words recorded
            </div>
          )}
        </article>

        <div className="grid min-h-0 grid-rows-2 gap-2 sm:gap-3">
          {/* justify-center, not between: "between" pins the icon to the top and
              the content to the bottom, so on a tall tile all the slack pools
              into one gap down the middle. Centred, it spreads to the edges. */}
          <article className="paper-card paper-note paper-note-yellow flex min-h-0 flex-col justify-center gap-2 p-2.5 sm:gap-3 sm:p-4">
            <div className="flex items-center justify-between gap-1">
              <span className="paper-icon paper-icon-yellow">
                <Target size={18} aria-hidden />
              </span>
              <span className="paper-kicker">{checkpointProgress}%</span>
            </div>
            <div>
              <p className="paper-kicker">Next checkpoint</p>
              <p className="font-display note-value mt-0.5 font-extrabold sm:mt-1">
                {readCount}{" "}
                <span className="note-value-sub font-medium text-[var(--muted-ink)]">
                  / {nextCheckpoint}
                </span>
              </p>
              <div
                className="paper-progress mt-1.5 sm:mt-3"
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

          <article className="paper-card paper-note paper-note-purple flex min-h-0 flex-col justify-center gap-2 p-2.5 sm:gap-3 sm:p-4">
            <span className="paper-icon paper-icon-purple">
              <Gauge size={18} aria-hidden />
            </span>
            <div>
              <p className="paper-kicker">Practice rhythm</p>
              <p className="font-display note-value mt-0.5 font-extrabold sm:mt-1">
                {stats.medianGapSeconds === null ? "—" : `${stats.medianGapSeconds}s`}
              </p>
              <p className="note-caption mt-0.5 text-[var(--muted-ink)] sm:mt-1">
                Typical gap between actions
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
