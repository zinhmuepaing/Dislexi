"use client";

/**
 * DEV-ONLY gallery for the generated tutoring visuals (backlog §1/§3/§4).
 *
 * The validator tests prove a spec is well-formed; they cannot tell whether the
 * resulting picture is any good to look at. §6 was reverted precisely because a
 * fully-passing suite hid a bad result, so these render here with known specs
 * for a human to judge — no model call, no camera, no cost.
 *
 * Gated on NEXT_PUBLIC_TEST_IMAGES, the same local-verification flag as the
 * camera fixtures; blank without it.
 */

import { VisualCard } from "@/components/VisualCard";
import {
  isInteractiveVisual,
  minOnScreenMs,
  parseVisual,
  type TutorVisual,
} from "@/lib/tutor-visual";

const ENABLED = process.env.NEXT_PUBLIC_TEST_IMAGES === "1";

const CASES: { title: string; note: string; raw: unknown }[] = [
  {
    title: "§1 unitGrid — Pythagoras by counting",
    note: "3² + 4² = 5² · 9 + 16 = 25, countable rather than asserted",
    raw: { kind: "unitGrid", grids: [{ rows: 3, cols: 3 }, { rows: 4, cols: 4 }, { rows: 5, cols: 5 }] },
  },
  {
    title: "§1 unitGrid — single area",
    note: "one grid, e.g. area of a 6×4 rectangle",
    raw: { kind: "unitGrid", grids: [{ rows: 4, cols: 6 }] },
  },
  {
    title: "§1 placeValue — 500 + 800",
    note: "hundreds drawn as real 10×10 flats so they stay countable",
    raw: { kind: "placeValue", rows: [{ hundreds: 5, tens: 0, ones: 0 }, { hundreds: 8, tens: 0, ones: 0 }] },
  },
  {
    title: "§1 placeValue — mixed 243 + 125",
    note: "flats + rods + units",
    raw: { kind: "placeValue", rows: [{ hundreds: 2, tens: 4, ones: 3 }, { hundreds: 1, tens: 2, ones: 5 }] },
  },
  {
    title: "§4 foldTriangle — isosceles base angles",
    note: "auto-plays once, then Again. Halves must land exactly on each other",
    raw: { kind: "foldTriangle", base: 10, height: 12 },
  },
  {
    title: "§4 foldTriangle — wide/squat (proportions honoured)",
    note: "must look different from the tall one above",
    raw: { kind: "foldTriangle", base: 16, height: 5 },
  },
  {
    title: "§4 rearrangeParallelogram — base × height",
    note: "cut piece slides right; result must be a clean rectangle",
    raw: { kind: "rearrangeParallelogram", base: 12, height: 7, slant: 3 },
  },
  {
    title: "§3 ratioTriangle — drag the dot",
    note: "43°, sin, adjacent 35 (matches the trig fixture). Ratio updates live",
    raw: { kind: "ratioTriangle", angleDeg: 43, ratio: "sin", adjacent: 35 },
  },
  {
    title: "§3 ratioTriangle — tan, no worksheet length",
    note: "no ≈ readout when the worksheet gives no side",
    raw: { kind: "ratioTriangle", angleDeg: 30, ratio: "tan" },
  },
  {
    title: "REJECTED — unknown kind",
    note: "must render nothing at all (degrades to a plain narrated step)",
    raw: { kind: "spiralGalaxy", rows: 3 },
  },
];

export default function DevVisualsPage() {
  if (!ENABLED) return null;
  return (
    <main className="min-h-dvh bg-[var(--paper)] p-4 pb-24">
      <h1 className="mb-1 text-lg font-bold text-[var(--ink)]">Tutoring visuals — dev gallery</h1>
      <p className="mb-5 text-sm text-[var(--ink-soft)]">
        Each panel is what a student sees mid-step, over the camera feed.
      </p>
      <div className="flex flex-col gap-5">
        {CASES.map((c) => {
          const spec = parseVisual(c.raw) as TutorVisual | null;
          return (
            <section key={c.title} data-case={c.title}>
              <h2 className="text-sm font-semibold text-[var(--ink)]">{c.title}</h2>
              <p className="text-xs text-[var(--ink-soft)]">{c.note}</p>
              <p className="mb-2 font-mono text-[11px] text-[var(--ink-soft)]">
                {spec
                  ? isInteractiveVisual(spec)
                    ? "stays until the student taps Next (auto after 25s)"
                    : `stays on screen ≥ ${(minOnScreenMs(spec) / 1000).toFixed(1)}s`
                  : "—"}
              </p>
              <div className="relative h-[280px] overflow-hidden rounded-xl border-2 border-dashed border-[var(--ink-soft)] bg-[var(--ink)]/5">
                {spec ? (
                  <VisualCard visual={spec} />
                ) : (
                  <p className="flex h-full items-center justify-center text-xs text-[var(--ink-soft)]">
                    parseVisual → null (correctly rejected)
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
