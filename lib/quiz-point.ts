/**
 * Bounded, abortable pointing attempts for the Autopsy end-of-session quiz
 * (backlog §5).
 *
 * Extracted from app/autopsy/page.tsx purely so this sequencing is testable
 * without a browser, a camera, or a vision-model call. The behaviour that
 * matters here is easy to get subtly wrong and expensive to notice live:
 *   - the prompt must finish BEFORE the first look (the old code fired both at
 *     once, measuring the student before they had heard what to point at),
 *   - a miss must be retried a small, bounded number of times — never once,
 *     never unbounded (each look is two vision round trips),
 *   - the caller may abort between any two steps (Skip / End / rescan), and an
 *     aborted run must record NOTHING, or the quiz double-advances.
 *
 * No model, no network, no React in here — just the order of operations.
 */

export interface PointAttemptOptions<T> {
  /** Total looks, including the first. Bounded by design. */
  attempts: number;
  /** One look at the paper. Resolves null when nothing was found. */
  locate: () => Promise<T | null>;
  /** Did this find hit the target word? */
  matches: (found: T) => boolean;
  /** False once this word's turn is over — checked around every await. */
  isActive: () => boolean;
  /**
   * Runs before each look. `attempt` is 0-based: 0 is the settle pause after
   * the prompt, later values are the retry cue plus its pause.
   */
  beforeAttempt: (attempt: number) => Promise<void>;
}

export interface PointAttemptResult {
  /** The student pointed at the target on some attempt. */
  pointed: boolean;
  /** At least one look completed without throwing. */
  looked: boolean;
  /** The run was cut short — the caller must not record a result. */
  aborted: boolean;
  /** Looks actually performed (for logging / tuning). */
  used: number;
}

export async function attemptPointing<T>(
  o: PointAttemptOptions<T>,
): Promise<PointAttemptResult> {
  let pointed = false;
  let looked = false;
  let used = 0;

  for (let attempt = 0; attempt < o.attempts && !pointed; attempt++) {
    await o.beforeAttempt(attempt);
    if (!o.isActive()) return { pointed, looked, aborted: true, used };

    try {
      const found = await o.locate();
      looked = true;
      used += 1;
      pointed = found !== null && o.matches(found);
    } catch {
      // A failed look is not a student miss; try again if attempts remain.
      used += 1;
    }
    if (!o.isActive()) return { pointed, looked, aborted: true, used };
  }

  return { pointed, looked, aborted: false, used };
}
