"use client";

/**
 * Settings tab (REWORK 3) — placeholder shell; TTS voice/rate, default scope,
 * and camera defaults land in P5.
 */

import { Settings as SettingsIcon } from "lucide-react";

export default function SettingsPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 p-4 pb-24">
      <header className="pt-2">
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">Voice, reading, and camera.</p>
      </header>
      <div className="card flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <SettingsIcon size={32} color="var(--ink-soft)" />
        <p className="text-sm text-[var(--ink-soft)]">Customization is coming here.</p>
      </div>
    </main>
  );
}
