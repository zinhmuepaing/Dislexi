"use client";

/**
 * FormulaCard (REWORK 4) — renders ONE step's bite-sized LaTeX on the camera
 * feed, in a solid high-contrast card offset from the referenced region so
 * the formula sits on a clean background (never over noisy worksheet text —
 * critical for dyslexic readers). KaTeX is self-hosted (no CDN). Exactly one
 * card shows at a time; keying by step in the parent unmounts it cleanly
 * before the next step's appears.
 */

import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function FormulaCard({ formula, region }: { formula: string; region: Region }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(formula, {
        throwOnError: false,
        displayMode: false,
        output: "html",
      });
    } catch {
      return null;
    }
  }, [formula]);

  if (!html) return null;

  // Sit above the region when there's room, else below; centered on it and
  // clamped so the card stays inside the frame.
  const cx = Math.min(0.82, Math.max(0.18, region.x + region.w / 2));
  const above = region.y > 0.24;

  return (
    <div
      // w-max sizes the card to the formula's one-line width so short
      // equations never wrap. The cap is VIEWPORT-relative (86vw), not
      // parent-relative: KaTeX renders each part as an inline-block that can
      // break between parts, and the camera overlay's box is narrow, so a
      // `%` cap would shrink the card back down and force multi-line breaks
      // (the reported bug). Only formulas wider than 86vw hit the cap + wrap.
      className="fadein pointer-events-none absolute z-10 w-max max-w-[86vw] -translate-x-1/2 rounded-xl border-[1.5px] border-[var(--ink)] bg-[var(--paper)] px-2.5 py-1.5 shadow-[0_6px_18px_-6px_rgba(34,48,63,0.5)]"
      style={{
        left: `${cx * 100}%`,
        top: above ? undefined : `${(region.y + region.h) * 100 + 2}%`,
        bottom: above ? `${(1 - region.y) * 100 + 2}%` : undefined,
      }}
    >
      <div
        className="katex-formula text-[var(--ink)]"
        style={{ fontSize: "clamp(15px, 4.4vw, 22px)" }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
