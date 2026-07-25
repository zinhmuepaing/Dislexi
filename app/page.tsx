"use client";

/**
 * Home — hybrid iOS look on the paper base. Brand row (app-icon slot +
 * "Dislexi" wordmark), a signature karaoke demo, and a 7-day practice summary.
 * The three modes are reached from the Scan button in the bottom nav, so the
 * home page shows progress rather than duplicating those entry points.
 */

import { useEffect, useState } from "react";
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
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col gap-2.5 overflow-hidden p-4 pb-24">
      {/* Brand row — app-icon slot (added later) + wordmark. */}
      <div className="flex shrink-0 items-center gap-2 pt-1">
        <div
          className="h-9 w-9 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-2)]"
          aria-hidden
        />
        <span className="font-display text-xl font-extrabold tracking-tight">Dislexi</span>
      </div>

      <header className="relative shrink-0">
        <LottieBadge
          src="/lottie/pointer-bounce.json"
          className="pointer-events-none absolute -top-1 right-0 h-14 w-14"
        />
        <h1 className="font-display max-w-[15ch] text-[26px] font-extrabold leading-[1.1] tracking-tight">
          Homework that <span className="swipe">reads itself</span>.
        </h1>
      </header>

      {/* Signature karaoke demo. */}
      <div className="card shrink-0 px-3 py-2" aria-hidden>
        <span className="mono-hint mb-0.5 block uppercase tracking-[0.1em]">live · synced to the voice</span>
        <p className="text-[15px] font-medium leading-relaxed">
          {KARAOKE_WORDS.map((w, i) => (
            <span key={i}>
              <span
                className={`rounded-[3px] px-[3px] py-px transition-colors duration-150 ${
                  i === lit ? "bg-[var(--hl)]" : ""
                }`}
              >
                {w}
              </span>{" "}
            </span>
          ))}
        </p>
      </div>

      {/* Practice summary fills the screen in place of the mode buttons. */}
      <PracticeSummary />

      <footer className="shrink-0 border-t border-[var(--hairline)] pt-1.5">
        <span className="mono-hint">3 features · 1 phone · 0 extra computers</span>
      </footer>
    </main>
  );
}
