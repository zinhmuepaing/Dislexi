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
}

export function computeStats(events: EventRow[]): SessionStats {
  const countsByType: Record<string, number> = {};
  const rereadsByQuestion: Record<string, number> = {};
  const wordCounts: Record<string, number> = {};
  const graphemeCounts: Record<string, number> = {};

  for (const e of events) {
    countsByType[e.type] = (countsByType[e.type] ?? 0) + 1;
    if (e.type === "reread" && e.question_ref) {
      rereadsByQuestion[e.question_ref] = (rereadsByQuestion[e.question_ref] ?? 0) + 1;
    }
    if (e.word) wordCounts[e.word] = (wordCounts[e.word] ?? 0) + 1;
    if (e.grapheme) graphemeCounts[e.grapheme] = (graphemeCounts[e.grapheme] ?? 0) + 1;
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
  return lines.join("\n");
}
