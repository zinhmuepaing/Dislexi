"use client";

/**
 * Client-side session logger (ARCHITECTURE.md §6): creates the session row,
 * queues typed events, flushes to POST /api/events every ~5 s and on end.
 * Only typed events are ever sent — never audio (§7 rule 8).
 *
 * Graceful degradation: if /api/sessions fails (e.g. Supabase not configured
 * yet), the logger stays disabled — the app keeps working, nothing is logged.
 */

export type SessionMode = "exam_prep" | "tutoring" | "autopsy";

export type EventType =
  | "read"
  | "reread"
  | "stuck_word"
  | "autopsy_soundout"
  | "trace_complete"
  | "tutor_question"
  | "quiz_result";

export interface LoggedEvent {
  type: EventType;
  word?: string;
  grapheme?: string;
  question_ref?: string;
  payload?: Record<string, unknown>;
}

const FLUSH_INTERVAL_MS = 5_000;

export class SessionLogger {
  private queue: (LoggedEvent & { ts: string })[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  private constructor(readonly sessionId: string | null) {
    if (sessionId) {
      this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    }
  }

  static async start(mode: SessionMode): Promise<SessionLogger> {
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error(`sessions ${res.status}`);
      const { sessionId } = (await res.json()) as { sessionId?: string };
      return new SessionLogger(sessionId ?? null);
    } catch (err) {
      console.warn("session logging disabled:", err);
      return new SessionLogger(null);
    }
  }

  get enabled(): boolean {
    return this.sessionId !== null;
  }

  log(event: LoggedEvent): void {
    if (!this.sessionId) return;
    this.queue.push({ ...event, ts: new Date().toISOString() });
  }

  private async flush(): Promise<void> {
    if (!this.sessionId || this.queue.length === 0) return;
    const events = this.queue.splice(0);
    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: this.sessionId, events }),
        keepalive: true,
      });
    } catch (err) {
      console.warn("event flush failed, requeueing:", err);
      this.queue.unshift(...events);
    }
  }

  /** Flush remaining events and close the session. Returns stats or null. */
  async end(): Promise<unknown | null> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.sessionId) return null;
    await this.flush();
    try {
      const res = await fetch("/api/session-end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: this.sessionId }),
      });
      if (!res.ok) return null;
      const { stats } = (await res.json()) as { stats: unknown };
      return stats;
    } catch {
      return null;
    }
  }
}
