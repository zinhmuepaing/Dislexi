/**
 * Event-log aggregates (ARCHITECTURE.md §5.6): counts by type, re-read
 * clustering by question_ref, top words, pacing = gaps between consecutive
 * timestamps. Used by /api/session-end (per-session stats) and the Telegram
 * webhook (date-range reviews). Derived purely from events and timing —
 * indicators, never emotional or clinical claims.
 */

export interface EventRow {
  ts: string;
  type: string;
  word: string | null;
  grapheme: string | null;
  question_ref: string | null;
  /** jsonb payload — quiz_result carries {said, pointed, skipped}. */
  payload?: Record<string, unknown> | null;
}

/** End-of-session quiz score (null when no quiz was taken). */
export interface QuizStats {
  total: number;
  saidCorrect: number;
  saidTotal: number;
  pointedCorrect: number;
  pointedTotal: number;
  skipped: number;
}

export interface SessionStats {
  totalEvents: number;
  countsByType: Record<string, number>;
  rereadsByQuestion: Record<string, number>;
  topWords: { word: string; count: number }[];
  topGraphemes: { grapheme: string; count: number }[];
  /** Seconds between consecutive events — the pacing timeline. */
  pacingGapsSeconds: number[];
  medianGapSeconds: number | null;
  firstEventAt: string | null;
  lastEventAt: string | null;
  quiz: QuizStats | null;
}

export function computeStats(events: EventRow[]): SessionStats {
  const countsByType: Record<string, number> = {};
  const rereadsByQuestion: Record<string, number> = {};
  const wordCounts: Record<string, number> = {};
  const graphemeCounts: Record<string, number> = {};

  let quiz: QuizStats | null = null;

  for (const e of events) {
    countsByType[e.type] = (countsByType[e.type] ?? 0) + 1;
    if (e.type === "reread" && e.question_ref) {
      rereadsByQuestion[e.question_ref] = (rereadsByQuestion[e.question_ref] ?? 0) + 1;
    }
    if (e.word) wordCounts[e.word] = (wordCounts[e.word] ?? 0) + 1;
    if (e.grapheme) graphemeCounts[e.grapheme] = (graphemeCounts[e.grapheme] ?? 0) + 1;
    if (e.type === "quiz_result") {
      quiz ??= { total: 0, saidCorrect: 0, saidTotal: 0, pointedCorrect: 0, pointedTotal: 0, skipped: 0 };
      quiz.total++;
      const p = (e.payload ?? {}) as { said?: unknown; pointed?: unknown; skipped?: unknown };
      if (p.skipped === true) {
        quiz.skipped++;
      } else {
        if (typeof p.said === "boolean") {
          quiz.saidTotal++;
          if (p.said) quiz.saidCorrect++;
        }
        if (typeof p.pointed === "boolean") {
          quiz.pointedTotal++;
          if (p.pointed) quiz.pointedCorrect++;
        }
      }
    }
  }

  const top = (counts: Record<string, number>, n: number) =>
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);

  const times = events
    .map((e) => new Date(e.ts).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);

  const pacingGapsSeconds: number[] = [];
  for (let i = 1; i < times.length; i++) {
    pacingGapsSeconds.push(Math.round((times[i] - times[i - 1]) / 100) / 10);
  }
  const sortedGaps = [...pacingGapsSeconds].sort((a, b) => a - b);
  const medianGapSeconds =
    sortedGaps.length > 0 ? sortedGaps[Math.floor(sortedGaps.length / 2)] : null;

  return {
    totalEvents: events.length,
    countsByType,
    rereadsByQuestion,
    topWords: top(wordCounts, 10).map(([word, count]) => ({ word, count })),
    topGraphemes: top(graphemeCounts, 10).map(([grapheme, count]) => ({ grapheme, count })),
    pacingGapsSeconds,
    medianGapSeconds,
    firstEventAt: times.length ? new Date(times[0]).toISOString() : null,
    lastEventAt: times.length ? new Date(times[times.length - 1]).toISOString() : null,
    quiz,
  };
}

/** Plain-text rendering of stats, fed to the review model / sent as fallback text. */
export function statsToText(stats: SessionStats, label: string): string {
  const lines = [
    `Session statistics (${label}):`,
    `- total events: ${stats.totalEvents}`,
    `- counts by type: ${JSON.stringify(stats.countsByType)}`,
    `- re-reads by question: ${JSON.stringify(stats.rereadsByQuestion)}`,
    `- most-requested words: ${stats.topWords.map((w) => `${w.word} (${w.count})`).join(", ") || "none"}`,
    `- struggled grapheme patterns: ${stats.topGraphemes.map((g) => `${g.grapheme} (${g.count})`).join(", ") || "none"}`,
    `- median gap between interactions: ${stats.medianGapSeconds ?? "n/a"}s`,
    `- span: ${stats.firstEventAt ?? "n/a"} to ${stats.lastEventAt ?? "n/a"}`,
  ];
  if (stats.quiz) {
    lines.push(
      `- quiz: ${stats.quiz.total} words — said ${stats.quiz.saidCorrect}/${stats.quiz.saidTotal}, ` +
        `pointed ${stats.quiz.pointedCorrect}/${stats.quiz.pointedTotal}, skipped ${stats.quiz.skipped}`,
    );
  }
  return lines.join("\n");
}
