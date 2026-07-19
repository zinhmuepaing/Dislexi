"use client";

/**
 * Home — hybrid iOS look on the paper base. Brand row (app-icon slot +
 * "Dislexi" wordmark), a signature karaoke demo, and three feature cards
 * that grow to fill the screen. Lucide icons, no emojis.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Hand, GraduationCap, SpellCheck2, ChevronRight } from "lucide-react";
import { LottieBadge } from "@/components/LottieBadge";

const KARAOKE_WORDS = "Find the perimeter of the rectangle below.".split(" ");

const FEATURES = [
  {
    href: "/exam-prep",
    title: "Exam-Prep",
    tag: "Point at a line — it’s read out loud, word for word.",
    stamp: { cls: "stamp-det", label: "Reads verbatim" },
    accent: "var(--point)",
    Icon: Hand,
  },
  {
    href: "/tutoring",
    title: "AI Tutoring",
    tag: "Ask anything — the working appears on the paper.",
    stamp: { cls: "stamp-ai", label: "AI explains" },
    accent: "var(--ai)",
    Icon: GraduationCap,
  },
  {
    href: "/autopsy",
    title: "Stuck-Word Autopsy",
    tag: "Sound out a tricky word, then quiz yourself.",
    stamp: { cls: "stamp-det", label: "Zero AI voice" },
    accent: "var(--ok)",
    Icon: SpellCheck2,
  },
];

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

      {/* Feature cards grow to fill the screen. */}
      <nav className="flex min-h-0 flex-1 flex-col gap-2.5" aria-label="Features">
        {FEATURES.map((f, i) => (
          <Link
            key={f.href}
            href={f.href}
            style={{ animationDelay: `${i * 90}ms` }}
            className="card press fadein group relative flex flex-1 flex-col justify-center overflow-hidden p-3.5 pl-5"
          >
            <span className="absolute inset-y-0 left-0 w-2" style={{ background: f.accent }} aria-hidden />
            <div className="flex items-center gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                style={{ background: `color-mix(in srgb, ${f.accent} 14%, white)` }}
                aria-hidden
              >
                <f.Icon size={22} color={f.accent} />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-lg font-extrabold leading-tight">{f.title}</h2>
                <p className="mt-0.5 text-[13px] leading-snug text-[var(--ink-soft)]">{f.tag}</p>
              </div>
              <ChevronRight
                size={20}
                className="ml-auto self-start transition-transform duration-150 group-hover:translate-x-0.5"
                color={f.accent}
                aria-hidden
              />
            </div>
            <span className={`stamp ${f.stamp.cls} mt-2 self-start`}>{f.stamp.label}</span>
          </Link>
        ))}
      </nav>

      <footer className="shrink-0 border-t border-[var(--hairline)] pt-1.5">
        <span className="mono-hint">3 features · 1 phone · 0 extra computers</span>
      </footer>
    </main>
  );
}
