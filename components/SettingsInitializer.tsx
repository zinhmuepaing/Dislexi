"use client";

import { useEffect } from "react";
import { applyReadingFont, getSettings } from "@/lib/settings";

/** Applies device-local visual preferences once the server HTML has hydrated. */
export function SettingsInitializer() {
  useEffect(() => {
    applyReadingFont(getSettings().readingFont);
  }, []);

  return null;
}
