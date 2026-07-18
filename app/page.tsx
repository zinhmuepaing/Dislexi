"use client";

/**
 * Mode selector — notebook-themed home. The three feature cards grow to fill
 * the viewport (no empty bottom band); minimal copy; the signature karaoke
 * demo and a self-hosted Lottie accent carry the "modern, alive" feel while
 * keeping the paper aesthetic.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { LottieBadge } from "@/components/LottieBadge";

const KARAOKE_WORDS = "Find the perimeter of the rectangle below.".split(" ");

const FEATURES = [
  {
    href: "/exam-prep",
    n: "01",
    title: "Exam-Prep",
    tag: "Point at a line — it’s read out loud, word for word.",
    stamp: { cls: "stamp-det", label: "Reads verbatim" },
    accent: "var(--point)",
    emoji: "👉",
  },
  {
    href: "/tutoring",
    n: "02",
    title: "AI Tutoring",
    tag: "Ask anything — the working appears on the paper.",
    stamp: { cls: "stamp-ai", label: "AI explains" },
    accent: "var(--ai)",
    emoji: "✏️",
  },
  {
    href: "/autopsy",
    n: "03",
    title: "Stuck-Word Autopsy",
    tag: "Sound out a tricky word, then quiz yourself.",
    stamp: { cls: "stamp-det", label: "Zero AI voice" },
    accent: "var(--ok)",
    emoji: "🔤",
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
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col gap-2.5 overflow-hidden p-4">
      <header className="relative shrink-0 pt-1">
        <LottieBadge
          src="/lottie/pointer-bounce.json"
          className="pointer-events-none absolute -top-2 right-0 h-14 w-14"
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
            className="card fadein group relative flex flex-1 flex-col justify-center overflow-hidden p-3.5 pl-5 transition-transform duration-150 hover:-translate-x-px hover:-translate-y-px hover:shadow-[6px_6px_0_rgba(34,48,63,0.16)] active:translate-x-px active:translate-y-px active:shadow-[2px_2px_0_rgba(34,48,63,0.12)]"
          >
            {/* Accent stripe. */}
            <span
              className="absolute inset-y-0 left-0 w-2"
              style={{ background: f.accent }}
              aria-hidden
            />
            <div className="flex items-center gap-2.5">
              <span className="text-2xl" aria-hidden>
                {f.emoji}
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-lg font-extrabold leading-tight">{f.title}</h2>
                <p className="mt-0.5 text-[13px] leading-snug text-[var(--ink-soft)]">{f.tag}</p>
              </div>
              <span
                className="ml-auto self-start text-xl transition-transform duration-150 group-hover:translate-x-0.5"
                style={{ color: f.accent }}
                aria-hidden
              >
                →
              </span>
            </div>
            <span className={`stamp ${f.stamp.cls} mt-2 self-start`}>{f.stamp.label}</span>
          </Link>
        ))}
      </nav>

      <footer className="shrink-0 border-t-[1.5px] border-[var(--ink)] pt-1.5">
        <span className="mono-hint">3 features · 1 phone · 0 extra computers</span>
      </footer>
    </main>
  );
}
