"use client";

/**
 * Bottom tab bar — Home · Insights · Scan · Guide · Settings.
 *
 * Glass bar fixed to the safe-area bottom. The center Scan button is a raised
 * accent circle that opens a bottom-sheet tool picker (Exam-Prep · AI
 * Tutoring · Stuck-Word Autopsy). The bar hides itself inside a tool so the
 * camera screens stay full-bleed.
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  BarChart3,
  Settings,
  ScanLine,
  BookOpenText,
  GraduationCap,
  SpellCheck2,
  CircleHelp,
  X,
} from "lucide-react";

const TOOL_ROUTES = ["/exam-prep", "/tutoring", "/autopsy"];

const TOOLS = [
  { href: "/exam-prep", label: "Exam-Prep", desc: "Point and hear it read", Icon: BookOpenText, tone: "coral", iconClass: "paper-icon-coral", color: "var(--coral-deep)" },
  { href: "/tutoring", label: "AI Tutoring", desc: "Working shown on the paper", Icon: GraduationCap, tone: "purple", iconClass: "paper-icon-purple", color: "var(--purple-deep)" },
  { href: "/autopsy", label: "Stuck-Word Autopsy", desc: "Sound out and quiz a word", Icon: SpellCheck2, tone: "green", iconClass: "paper-icon-green", color: "var(--green-deep)" },
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
        className={`nav-tab press flex flex-1 flex-col items-center gap-0.5 py-1 ${
          active ? "nav-tab-active" : ""
        }`}
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
          role="presentation"
        >
          <div
            className="sheet-up tool-sheet w-full rounded-t-[22px] p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tool-picker-title"
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[var(--ink)] opacity-20" />
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="paper-kicker">Choose a tool</p>
                <h2 id="tool-picker-title" className="font-display text-lg font-extrabold">Start a session</h2>
              </div>
              <button onClick={() => setSheet(false)} className="tool-icon-button press p-1.5" aria-label="Close">
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
                  className={`tool-picker-card tool-picker-${t.tone} press flex items-center gap-3 rounded-xl p-3 pl-4 text-left`}
                >
                  <span
                    className={`paper-icon ${t.iconClass} h-11 w-11 shrink-0`}
                  >
                    <t.Icon size={22} color={t.color} />
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

      <nav className="notebook-nav fixed inset-x-0 bottom-0 z-30 flex items-end justify-around px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5">
        {tab("/", "Home", Home)}
        {tab("/insights", "Insights", BarChart3)}
        <button
          onClick={() => setSheet(true)}
          className="press -mt-6 flex flex-1 flex-col items-center gap-0.5 py-1"
          aria-label="Start a session"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-[18px] border-2 border-[var(--ink)] bg-[var(--point)] shadow-[4px_5px_0_rgba(38,55,70,0.2)]">
            <ScanLine size={26} color="#fff" strokeWidth={2.2} />
          </span>
          <span className="text-[10px] font-medium text-[var(--point)]">Scan</span>
        </button>
        {tab("/guide", "Guide", CircleHelp)}
        {tab("/settings", "Settings", Settings)}
      </nav>
    </>
  );
}
