"use client";

/**
 * Settings tab (REWORK 3 P5) — reading voice + speed (wired into lib/speech
 * via lib/settings), default reading scope. Persisted in localStorage.
 */

import { useEffect, useState } from "react";
import { Volume2, Play } from "lucide-react";
import { getSettings, setSettings, VOICES, AppSettings } from "@/lib/settings";
import { speak, stopSpeaking, primeSpeech } from "@/lib/speech";
import { installAudioUnlock } from "@/lib/audio";

const SCOPES: { id: AppSettings["scope"]; label: string }[] = [
  { id: "word", label: "Word" },
  { id: "sentence", label: "Sentence" },
  { id: "paragraph", label: "Paragraph" },
];

export default function SettingsPage() {
  const [s, setS] = useState<AppSettings | null>(null);

  useEffect(() => {
    installAudioUnlock();
    primeSpeech();
    // Deferred (post-hydration) so the localStorage read doesn't run as a
    // synchronous setState in the effect body.
    const t = setTimeout(() => setS(getSettings()), 0);
    return () => clearTimeout(t);
  }, []);

  function update(patch: Partial<AppSettings>) {
    const next = setSettings(patch);
    setS(next);
  }

  function testVoice() {
    stopSpeaking();
    void speak("Find the perimeter of the rectangle below.").catch(() => {});
  }

  if (!s) return <main className="mx-auto w-full max-w-md p-4" />;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 p-4 pb-24">
      <header className="pt-2">
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">Tune the reading voice and defaults.</p>
      </header>

      {/* Voice. */}
      <section className="card p-4">
        <div className="mb-2 flex items-center gap-2">
          <Volume2 size={18} color="var(--point)" />
          <h2 className="font-semibold">Reading voice</h2>
        </div>
        <div className="flex flex-col gap-1.5">
          {VOICES.map((v) => (
            <button
              key={v.id}
              onClick={() => update({ voice: v.id })}
              className={`press flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm ${
                s.voice === v.id
                  ? "border-[var(--point)] bg-[color-mix(in_srgb,var(--point)_10%,white)] font-semibold"
                  : "border-[var(--hairline)] bg-[var(--surface)]"
              }`}
            >
              {v.label}
              {s.voice === v.id && <span className="text-[var(--point)]">selected</span>}
            </button>
          ))}
        </div>
      </section>

      {/* Speed. */}
      <section className="card p-4">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-semibold">Speaking speed</h2>
          <span className="text-sm font-semibold text-[var(--point)]">{s.rate.toFixed(2)}×</span>
        </div>
        <input
          type="range"
          min={0.7}
          max={1.3}
          step={0.05}
          value={s.rate}
          onChange={(e) => update({ rate: Number(e.target.value) })}
          className="w-full accent-[var(--point)]"
          aria-label="Speaking speed"
        />
        <div className="flex justify-between text-[11px] text-[var(--ink-soft)]">
          <span>Slower</span>
          <span>Normal</span>
          <span>Faster</span>
        </div>
        <button
          onClick={testVoice}
          className="btn-soft press mt-3 flex w-full items-center justify-center gap-1.5 py-2.5 text-sm"
        >
          <Play size={16} /> Test voice
        </button>
      </section>

      {/* Default reading scope. */}
      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Default reading scope</h2>
        <p className="mb-2 text-[13px] text-[var(--ink-soft)]">
          How much Exam-Prep reads when you point.
        </p>
        <div className="flex gap-2">
          {SCOPES.map((sc) => (
            <button
              key={sc.id}
              onClick={() => update({ scope: sc.id })}
              className={`press flex-1 rounded-xl border py-2.5 text-sm font-medium ${
                s.scope === sc.id
                  ? "border-[var(--point)] bg-[var(--point)] text-white"
                  : "border-[var(--hairline)] bg-[var(--surface)]"
              }`}
            >
              {sc.label}
            </button>
          ))}
        </div>
      </section>

      <p className="text-center text-[12px] text-[var(--ink-soft)]">
        Camera (front/rear) and the mirror clip are set inside each tool.
      </p>
    </main>
  );
}
