"use client";

/**
 * Home — visual notebook dashboard. The three learning modes remain behind
 * the centre Scan action; Home focuses on a readable seven-day snapshot.
 */

import { useEffect, useState } from "react";
import { CalendarDays, ChevronRight, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { LottieBadge } from "@/components/LottieBadge";
import { PracticeSummary } from "@/components/PracticeSummary";
import { ToolSheet } from "@/components/ToolSheet";

const KARAOKE_WORDS = "Find the perimeter of the rectangle below.".split(" ");

/** Tap sweep: the idle read-along stops teasing one word at a time and races
 *  to the end of the sentence. Plays once and stops — no looping motion beside
 *  text. The sheet starts rising over the tail of it so the tap feels instant;
 *  the last strokes finish behind the scrim, still visible. */
const SWEEP_STAGGER_MS = 42;
const SHEET_DELAY_MS = 200;

export default function ModeSelector() {
  const [lit, setLit] = useState(0);
  const [sweeping, setSweeping] = useState(false);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    if (sweeping) return; // the sweep has the floor; don't cycle underneath it
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setLit((i) => (i + 1) % KARAOKE_WORDS.length), 480);
    return () => clearInterval(t);
  }, [sweeping]);

  useEffect(() => {
    if (!sweeping) return;
    const t = setTimeout(() => setSheet(true), SHEET_DELAY_MS);
    return () => clearTimeout(t);
  }, [sweeping]);

  // Closing puts the card back to its idle read-along, so it can be tapped again.
  const closeSheet = () => {
    setSheet(false);
    setSweeping(false);
  };

  return (
    // One screenful: the dashboard fills the viewport instead of running off
    // the bottom of it, so nothing needs scrolling to be seen. `overflow-y-auto`
    // rather than `hidden` is deliberate — if a student has browser text scaling
    // turned up, the content must still be reachable rather than clipped away.
    <main className="home-shell mx-auto flex h-dvh w-full max-w-6xl flex-col gap-2 overflow-y-auto px-4 pb-[calc(78px+env(safe-area-inset-bottom))] pt-2 sm:gap-3 sm:px-6 sm:pt-3 lg:px-8 lg:pt-5">
      <header className="flex shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark />
          <div className="min-w-0">
            <h1 className="font-display truncate text-xl font-extrabold tracking-tight sm:text-2xl">
              Dislexi
            </h1>
            <p className="paper-kicker">Learning notebook</p>
          </div>
        </div>
        <div className="paper-chip shrink-0">
          <CalendarDays size={15} aria-hidden />
          <span>Last 7 days</span>
        </div>
      </header>

      {/* The demo sentence is the invitation: tapping it opens the same tool
          picker as the Scan button, so the thing being demonstrated is also the
          way to start doing it. Content is all phrasing so the <button> stays
          valid HTML. */}
      <button
        type="button"
        onClick={() => setSweeping(true)}
        // Distinct from the Scan button's "Start a session": two controls that
        // open the same sheet must still be tellable apart by ear.
        aria-label="Live read-along demo — start a session"
        className="paper-card home-readalong press relative block w-full shrink-0 overflow-hidden p-2.5 text-left sm:p-5"
      >
        <span className="relative z-10 block max-w-[78%] sm:max-w-none">
          <span className="mb-1 flex items-center gap-2 sm:mb-2">
            <span className="paper-icon paper-icon-coral">
              <Sparkles size={16} aria-hidden />
            </span>
            <span className="paper-kicker">Live read-along</span>
          </span>
          <span
            // leading-normal (1.5), not relaxed: the type SIZE is untouched, and
            // 1.5 is still within dyslexia-friendly line-spacing guidance.
            className="font-display block text-lg font-bold leading-normal sm:text-xl sm:leading-relaxed"
            aria-hidden
          >
            {KARAOKE_WORDS.map((word, index) => (
              <span key={`${word}-${index}`}>
                <span
                  className={
                    sweeping
                      ? "karaoke-word karaoke-swipe"
                      : index === lit
                        ? "karaoke-word-active"
                        : "karaoke-word"
                  }
                  style={
                    sweeping
                      ? ({ "--mark-delay": `${index * SWEEP_STAGGER_MS}ms` } as React.CSSProperties)
                      : undefined
                  }
                >
                  {word}
                </span>{" "}
              </span>
            ))}
          </span>
        </span>
        <ChevronRight
          size={20}
          aria-hidden
          className="absolute right-3 top-3 z-10"
          color="var(--ink-soft)"
        />
        <LottieBadge
          as="span"
          src="/lottie/pointer-bounce.json"
          className="pointer-events-none absolute -bottom-1 right-1 h-20 w-20 sm:right-4 sm:h-24 sm:w-24"
        />
      </button>

      <PracticeSummary />
      <ToolSheet open={sheet} onClose={closeSheet} />
    </main>
  );
}
