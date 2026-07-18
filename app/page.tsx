"use client";

/**
 * Mode selector — walkthrough-themed home (how_it_works_walkthrough.html):
 * notebook paper, ink-outlined cards with offset shadows, IBM Plex +
 * Bricolage type, animated karaoke demo line, and per-feature stamps that
 * tell parents exactly where AI is (and is not) allowed to live.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

const KARAOKE_WORDS = "Find the perimeter of the rectangle below.".split(" ");

const FEATURES = [
  {
    href: "/exam-prep",
    n: "01",
    title: "Exam-Prep Mode",
    tag: "Reads exactly what's written — like a human exam reader",
    hint: "point at a line → hear it verbatim → parents see the patterns",
    stamp: { cls: "stamp-det", label: "No AI in this path" },
  },
  {
    href: "/tutoring",
    n: "02",
    title: "AI Tutoring",
    tag: "Step-by-step explanations that glow on the worksheet",
    hint: "ask by voice or typing → steps narrate + highlight in sync",
    stamp: { cls: "stamp-ai", label: "AI explains here" },
  },
  {
    href: "/autopsy",
    n: "03",
    title: "Stuck-Word Autopsy",
    tag: "A stuck word becomes the best teaching moment of the day",
    hint: "point at a word → sound it out → trace it on paper → chime",
    stamp: { cls: "stamp-det", label: "Recorded phonemes · zero AI" },
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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-2.5 p-4 pb-4">
      <header className="pt-2">
        <p className="eyebrow mb-1.5">Tech4City 2026 · Assistive Reading</p>
        <h1 className="font-display text-2xl font-extrabold leading-[1.12] tracking-tight">
          Homework help that <span className="swipe">reads the rules</span>, then teaches the
          word.
        </h1>
        <p className="mt-1.5 text-[13px] leading-snug text-[var(--ink-soft)]">
          Stand the phone so the camera sees the worksheet, then pick a feature —{" "}
          <b className="text-[var(--ink)]">nothing added, nothing changed</b>.
        </p>
      </header>

      {/* Live karaoke demo — the product's signature interaction. */}
      <div className="card px-3 py-2" aria-hidden>
        <span className="mono-hint mb-1 block uppercase tracking-[0.1em]">
          Live highlight, synced to the voice
        </span>
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

      <nav className="flex flex-col gap-3" aria-label="Features">
        {FEATURES.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="card group p-3 transition-transform duration-150 hover:-translate-x-px hover:-translate-y-px hover:shadow-[6px_6px_0_rgba(34,48,63,0.16)] active:translate-x-px active:translate-y-px active:shadow-[2px_2px_0_rgba(34,48,63,0.12)]"
          >
            <div className="flex items-baseline gap-2.5">
              <span className="mono-hint !text-[var(--pen)]">{f.n}</span>
              <h2 className="font-display text-[17px] font-extrabold">{f.title}</h2>
              <span className="ml-auto text-lg text-[var(--pen)] transition-transform duration-150 group-hover:translate-x-0.5">
                →
              </span>
            </div>
            <p className="mt-0.5 text-[13px] text-[var(--ink-soft)]">{f.tag}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className={`stamp ${f.stamp.cls}`}>{f.stamp.label}</span>
            </div>
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap gap-1.5">
        <span className="chip !py-1 !text-[11px]">📱 phone in a stand</span>
        <span className="chip !py-1 !text-[11px]">📄 worksheet in front</span>
        <span className="chip !py-1 !text-[11px]">👉 point with a finger</span>
      </div>

      <footer className="mt-auto flex flex-wrap justify-between gap-2 border-t-[1.5px] border-[var(--ink)] pt-2">
        <span className="mono-hint">3 features · 1 phone · 0 extra computers</span>
      </footer>
    </main>
  );
}
