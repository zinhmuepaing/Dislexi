"use client";

/**
 * Insights tab (REWORK 3) — placeholder shell; full parity (date-range
 * reviews + AI summary + scores + send-to-parent) lands in P4.
 */

import { BarChart3 } from "lucide-react";

export default function InsightsPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 p-4 pb-24">
      <header className="pt-2">
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Insights</h1>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          Reviews, scores, and parent reports.
        </p>
      </header>
      <div className="card flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <BarChart3 size={32} color="var(--ink-soft)" />
        <p className="text-sm text-[var(--ink-soft)]">Session reviews are coming here.</p>
      </div>
    </main>
  );
}
