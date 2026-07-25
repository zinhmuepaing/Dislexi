"use client";

/**
 * User settings (REWORK 3 P5) — persisted in localStorage. TTS voice + rate
 * are read by lib/speech.ts at synthesis time; default reading scope is read
 * by Exam-Prep. Camera facing / mirror live under their own keys
 * (components/CameraStage.tsx) and are surfaced here as convenience toggles.
 */

export interface AppSettings {
  voice: string;
  rate: number; // 0.7–1.3, 1 = normal
  scope: "word" | "sentence" | "paragraph";
  readingFont: ReadingFont;
}

export type ReadingFont = "standard" | "opendyslexic";

const KEY = "dislexi.settings";

const DEFAULTS: AppSettings = {
  voice: "en-SG-LunaNeural",
  rate: 1,
  scope: "sentence",
  readingFont: "standard",
};

export const VOICES: { id: string; label: string }[] = [
  { id: "en-SG-LunaNeural", label: "Luna — Singapore" },
  { id: "en-SG-WayneNeural", label: "Wayne — Singapore" },
  { id: "en-GB-SoniaNeural", label: "Sonia — British" },
  { id: "en-US-AriaNeural", label: "Aria — American" },
  { id: "en-AU-NatashaNeural", label: "Natasha — Australian" },
];

export function getSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<AppSettings>;
    const rate = Number(raw.rate);
    return {
      voice: typeof raw.voice === "string" ? raw.voice : DEFAULTS.voice,
      rate: Number.isFinite(rate) ? Math.min(1.3, Math.max(0.7, rate)) : DEFAULTS.rate,
      scope: raw.scope === "word" || raw.scope === "paragraph" ? raw.scope : DEFAULTS.scope,
      readingFont: raw.readingFont === "opendyslexic" ? "opendyslexic" : DEFAULTS.readingFont,
    };
  } catch {
    return DEFAULTS;
  }
}

export function applyReadingFont(readingFont: ReadingFont): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.readingFont = readingFont;
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  applyReadingFont(next.readingFont);
  return next;
}
