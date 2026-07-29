"use client";

/**
 * "Start a session" bottom sheet — the one way into the three tools
 * (Exam-Prep · AI Tutoring · Stuck-Word Autopsy).
 *
 * Lives here rather than inside BottomNav because more than one thing opens
 * it: the centre Scan button and the home read-along card. Both must land in
 * exactly the same place, so there is one definition of it and callers only
 * own the open/closed state.
 */

import { useRouter } from "next/navigation";
import { BookOpenText, GraduationCap, SpellCheck2, X } from "lucide-react";

const TOOLS = [
  { href: "/exam-prep", label: "Exam-Prep", desc: "Point and hear it read", Icon: BookOpenText, tone: "coral", iconClass: "paper-icon-coral", color: "var(--coral-deep)" },
  { href: "/tutoring", label: "AI Tutoring", desc: "Working shown on the paper", Icon: GraduationCap, tone: "purple", iconClass: "paper-icon-purple", color: "var(--purple-deep)" },
  { href: "/autopsy", label: "Stuck-Word Autospy", desc: "Sound out and quiz a word", Icon: SpellCheck2, tone: "green", iconClass: "paper-icon-green", color: "var(--green-deep)" },
];

export function ToolSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-[rgba(34,48,63,0.28)]"
      onClick={onClose}
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
          <button onClick={onClose} className="tool-icon-button press p-1.5" aria-label="Close">
            <X size={20} color="var(--ink-soft)" />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {TOOLS.map((t) => (
            <button
              key={t.href}
              onClick={() => {
                onClose();
                router.push(t.href);
              }}
              className={`tool-picker-card tool-picker-${t.tone} press flex items-center gap-3 rounded-xl p-3 pl-4 text-left`}
            >
              <span className={`paper-icon ${t.iconClass} h-11 w-11 shrink-0`}>
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
  );
}
