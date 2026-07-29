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
import { usePathname } from "next/navigation";
import { Home, BarChart3, Settings, ScanLine, CircleHelp } from "lucide-react";
import { ToolSheet } from "@/components/ToolSheet";

const TOOL_ROUTES = ["/exam-prep", "/tutoring", "/autopsy"];

export function BottomNav() {
  const pathname = usePathname();
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
      <ToolSheet open={sheet} onClose={() => setSheet(false)} />

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
