"use client";

/**
 * Home — visual notebook dashboard. The three learning modes remain behind
 * the centre Scan action; Home focuses on a readable seven-day snapshot.
 */

import { useEffect, useState } from "react";
import { CalendarDays, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { LottieBadge } from "@/components/LottieBadge";
import { PracticeSummary } from "@/components/PracticeSummary";

const KARAOKE_WORDS = "Find the perimeter of the rectangle below.".split(" ");

export default function ModeSelector() {
  const [lit, setLit] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setLit((i) => (i + 1) % KARAOKE_WORDS.length), 480);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="home-shell mx-auto min-h-dvh w-full max-w-6xl px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pt-6">
      <header className="mb-4 flex items-center justify-between gap-3">
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

      <section className="paper-card home-readalong relative mb-4 overflow-hidden p-4 sm:p-5">
        <div className="relative z-10 max-w-[78%] sm:max-w-none">
          <div className="mb-2 flex items-center gap-2">
            <span className="paper-icon paper-icon-coral">
              <Sparkles size={16} aria-hidden />
            </span>
            <span className="paper-kicker">Live read-along</span>
          </div>
          <p
            className="font-display text-lg font-bold leading-relaxed sm:text-xl"
            aria-label={KARAOKE_WORDS.join(" ")}
          >
            {KARAOKE_WORDS.map((word, index) => (
              <span key={`${word}-${index}`}>
                <span className={index === lit ? "karaoke-word-active" : "karaoke-word"}>
                  {word}
                </span>{" "}
              </span>
            ))}
          </p>
        </div>
        <LottieBadge
          src="/lottie/pointer-bounce.json"
          className="pointer-events-none absolute -bottom-1 right-1 h-20 w-20 sm:right-4 sm:h-24 sm:w-24"
        />
      </section>

      <PracticeSummary />
    </main>
  );
}
