"use client";

/**
 * Device-local reading preferences. Business behavior is unchanged: speech
 * reads voice/rate at synthesis time and Exam-Prep reads the default scope.
 */

import { useEffect, useState } from "react";
import {
  Check,
  Gauge,
  Play,
  ScanLine,
  Settings2,
  Type,
  Volume2,
} from "lucide-react";
import { PageHeader, PaperIcon } from "@/components/PaperUI";
import { getSettings, setSettings, VOICES, type AppSettings } from "@/lib/settings";
import { speak, stopSpeaking, primeSpeech } from "@/lib/speech";
import { installAudioUnlock } from "@/lib/audio";

const SCOPES: { id: AppSettings["scope"]; label: string }[] = [
  { id: "word", label: "Word" },
  { id: "sentence", label: "Sentence" },
  { id: "paragraph", label: "Paragraph" },
];

const FONT_OPTIONS: {
  id: AppSettings["readingFont"];
  label: string;
  previewClass: string;
}[] = [
  { id: "standard", label: "Standard", previewClass: "font-preview-standard" },
  {
    id: "opendyslexic",
    label: "OpenDyslexic",
    previewClass: "font-preview-opendyslexic",
  },
];

export default function SettingsPage() {
  const [settings, setLocalSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    installAudioUnlock();
    primeSpeech();
    const timer = setTimeout(() => setLocalSettings(getSettings()), 0);
    return () => clearTimeout(timer);
  }, []);

  function update(patch: Partial<AppSettings>) {
    setLocalSettings(setSettings(patch));
  }

  function testVoice() {
    stopSpeaking();
    void speak("Find the perimeter of the rectangle below.").catch(() => {});
  }

  if (!settings) {
    return (
      <main className="page-shell max-w-4xl" aria-busy="true">
        <div className="mb-4 h-16 animate-pulse rounded-xl bg-[var(--line)]" />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="paper-card h-48 animate-pulse" />
          <div className="paper-card h-48 animate-pulse" />
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell max-w-4xl">
      <PageHeader
        eyebrow="Your reading setup"
        title="Settings"
        subtitle="Choose what feels clearest and most comfortable."
        icon={Settings2}
        tone="purple"
      />

      <div className="grid gap-3 md:grid-cols-2">
        <section className="paper-card paper-panel-coral p-4 md:col-span-2 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <PaperIcon icon={Type} tone="coral" />
            <div>
              <p className="paper-kicker">Accessibility</p>
              <h2 className="font-display font-extrabold">Reading font</h2>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {FONT_OPTIONS.map((font) => {
              const selected = settings.readingFont === font.id;
              return (
                <button
                  key={font.id}
                  type="button"
                  onClick={() => update({ readingFont: font.id })}
                  aria-pressed={selected}
                  className={`settings-option press relative min-h-32 p-4 text-left ${
                    selected ? "settings-option-selected" : ""
                  }`}
                >
                  {selected && (
                    <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-[var(--ink)] bg-[var(--point)] text-white">
                      <Check size={14} strokeWidth={2.8} aria-hidden />
                    </span>
                  )}
                  <span className={`block text-3xl font-bold ${font.previewClass}`} aria-hidden>
                    Aa
                  </span>
                  <span className="mt-3 block text-sm font-semibold">{font.label}</span>
                  <span
                    className={`mt-1 block truncate text-xs text-[var(--muted-ink)] ${font.previewClass}`}
                  >
                    Find the perimeter
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="paper-card p-4 md:col-span-2 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <PaperIcon icon={Volume2} tone="green" />
            <div>
              <p className="paper-kicker">Sound</p>
              <h2 className="font-display font-extrabold">Reading voice</h2>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {VOICES.map((voice) => {
              const selected = settings.voice === voice.id;
              return (
                <button
                  key={voice.id}
                  onClick={() => update({ voice: voice.id })}
                  className={`settings-option press flex min-h-11 items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                    selected ? "settings-option-selected font-semibold" : ""
                  }`}
                  aria-pressed={selected}
                >
                  <span>{voice.label}</span>
                  {selected && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--green-deep)] text-white">
                      <Check size={12} strokeWidth={2.8} aria-hidden />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="paper-card paper-panel-yellow flex flex-col p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <PaperIcon icon={Gauge} tone="yellow" />
            <div>
              <p className="paper-kicker">Pace</p>
              <h2 className="font-display font-extrabold">Speaking speed</h2>
            </div>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-xs text-[var(--muted-ink)]">Slower</span>
            <strong className="font-display text-2xl text-[var(--coral-deep)]">
              {settings.rate.toFixed(2)}×
            </strong>
            <span className="text-xs text-[var(--muted-ink)]">Faster</span>
          </div>
          <input
            type="range"
            min={0.7}
            max={1.3}
            step={0.05}
            value={settings.rate}
            onChange={(event) => update({ rate: Number(event.target.value) })}
            className="mt-3 w-full accent-[var(--point)]"
            aria-label="Speaking speed"
          />
          <button
            onClick={testVoice}
            className="btn-soft press mt-auto flex min-h-11 w-full items-center justify-center gap-2 text-sm"
          >
            <Play size={16} aria-hidden /> Test voice
          </button>
        </section>

        <section className="paper-card paper-panel-purple flex flex-col p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <PaperIcon icon={ScanLine} tone="purple" />
            <div>
              <p className="paper-kicker">Exam-Prep</p>
              <h2 className="font-display font-extrabold">Reading scope</h2>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {SCOPES.map((scope) => {
              const selected = settings.scope === scope.id;
              return (
                <button
                  key={scope.id}
                  onClick={() => update({ scope: scope.id })}
                  className={`settings-option press min-h-12 px-2 text-sm font-medium ${
                    selected
                      ? "settings-scope-selected"
                      : ""
                  }`}
                  aria-pressed={selected}
                >
                  {scope.label}
                </button>
              );
            })}
          </div>
          <p className="mt-auto pt-4 text-xs text-[var(--muted-ink)]">
            Sets how much text is read after pointing.
          </p>
        </section>
      </div>

      <aside className="paper-card paper-panel-beige mt-3 flex items-center gap-3 p-4">
        <PaperIcon icon={ScanLine} tone="beige" />
        <div>
          <p className="font-semibold">Camera controls stay with each tool</p>
          <p className="mt-0.5 text-xs text-[var(--muted-ink)]">
            Front, rear and mirror-clip choices are beside the live camera.
          </p>
        </div>
      </aside>
    </main>
  );
}
