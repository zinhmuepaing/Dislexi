"use client";

/**
 * Bottom tab bar (REWORK 3 P1) — Home · Insights · Scan · Settings.
 *
 * Glass bar fixed to the safe-area bottom. The center Scan button is a raised
 * accent circle that opens a bottom-sheet tool picker (Exam-Prep · AI
 * Tutoring · Stuck-Word Autopsy). The bar hides itself inside a tool so the
 * camera screens stay full-bleed.
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, BarChart3, Settings, ScanLine, BookOpenText, GraduationCap, SpellCheck2, X } from "lucide-react";

const TOOL_ROUTES = ["/exam-prep", "/tutoring", "/autopsy"];

const TOOLS = [
  { href: "/exam-prep", label: "Exam-Prep", desc: "Point and hear it read", Icon: BookOpenText, accent: "var(--point)" },
  { href: "/tutoring", label: "AI Tutoring", desc: "Working shown on the paper", Icon: GraduationCap, accent: "var(--ai)" },
  { href: "/autopsy", label: "Stuck-Word Autopsy", desc: "Sound out & quiz a word", Icon: SpellCheck2, accent: "var(--ok)" },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [sheet, setSheet] = useState(false);

  // Full-bleed tool screens carry their own chrome — no tab bar.
  if (TOOL_ROUTES.some((r) => pathname.startsWith(r))) return null;

  const tab = (href: string, label: string, Icon: typeof Home) => {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link
        href={href}
        className="press flex flex-1 flex-col items-center gap-0.5 py-1"
        aria-current={active ? "page" : undefined}
      >
        <Icon size={22} strokeWidth={active ? 2.4 : 1.9} color={active ? "var(--point)" : "var(--ink-soft)"} />
        <span
          className="text-[10px] font-medium"
          style={{ color: active ? "var(--point)" : "var(--ink-soft)" }}
        >
          {label}
        </span>
      </Link>
    );
  };

  return (
    <>
      {sheet && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-[rgba(34,48,63,0.28)]"
          onClick={() => setSheet(false)}
        >
          <div
            className="sheet-up glass w-full rounded-t-3xl p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[var(--hairline)]" />
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-lg font-extrabold">Start a session</h2>
              <button onClick={() => setSheet(false)} className="press rounded-full p-1" aria-label="Close">
                <X size={20} color="var(--ink-soft)" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {TOOLS.map((t) => (
                <button
                  key={t.href}
                  onClick={() => {
                    setSheet(false);
                    router.push(t.href);
                  }}
                  className="press flex items-center gap-3 rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-3 text-left"
                >
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `color-mix(in srgb, ${t.accent} 14%, white)` }}
                  >
                    <t.Icon size={22} color={t.accent} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold leading-tight">{t.label}</span>
                    <span className="block text-[13px] text-[var(--ink-soft)]">{t.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="glass fixed inset-x-0 bottom-0 z-30 flex items-end justify-around px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5">
        {tab("/", "Home", Home)}
        {tab("/insights", "Insights", BarChart3)}
        <button
          onClick={() => setSheet(true)}
          className="press -mt-6 flex flex-1 flex-col items-center"
          aria-label="Start a session"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--point)] shadow-[0_8px_20px_-6px_rgba(236,77,37,0.7)]">
            <ScanLine size={26} color="#fff" strokeWidth={2.2} />
          </span>
        </button>
        {tab("/settings", "Settings", Settings)}
      </nav>
    </>
  );
}
