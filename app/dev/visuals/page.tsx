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
  buildCountingScene,
  isInteractiveVisual,
  minOnScreenMs,
  parseVisual,
  type TutorVisual,
} from "@/lib/tutor-visual";

const ENABLED = process.env.NEXT_PUBLIC_TEST_IMAGES === "1";

/** `before`: grids from EARLIER steps of the same explanation, so the build-up
 *  and the join can be judged the way a student meets them. */
const CASES: { title: string; note: string; raw: unknown; before?: unknown[] }[] = [
  {
    title: "§1 unitGrid — 3 + 4, step 1: count the 3",
    note: "each square fills with a pop; the numeral ticks up with it",
    raw: { kind: "unitGrid", grids: [{ rows: 1, cols: 3 }] },
  },
  {
    title: "§1 unitGrid — 3 + 4, step 2: the 3 STAYS",
    note: "the 3 holds still in its own colour; only the new 4 counts in",
    raw: { kind: "unitGrid", grids: [{ rows: 1, cols: 4 }] },
    before: [{ kind: "unitGrid", grids: [{ rows: 1, cols: 3 }] }],
  },
  {
    title: "§1 unitGrid — 3 + 4, step 3: they JOIN into 7",
    note: "'+' appears, the parts slide together, all 7 are recounted, then the two colours become one",
    raw: { kind: "unitGrid", grids: [{ rows: 1, cols: 7 }] },
    before: [
      { kind: "unitGrid", grids: [{ rows: 1, cols: 3 }] },
      { kind: "unitGrid", grids: [{ rows: 1, cols: 4 }] },
    ],
  },
  {
    title: "§1 unitGrid — Pythagoras by counting",
    note: "3² + 4² = 5² · 9 + 16 = 25. Must NOT animate a join: those squares cannot tile into the 5×5 by sliding",
    raw: { kind: "unitGrid", grids: [{ rows: 3, cols: 3 }, { rows: 4, cols: 4 }, { rows: 5, cols: 5 }] },
  },
  {
    title: "§1 unitGrid — single area",
    note: "one grid, e.g. area of a 6×4 rectangle. 24 squares sweep rather than plod",
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
          const scene = spec
            ? buildCountingScene([...(c.before ?? []).map(parseVisual), spec])
            : null;
          return (
            <section key={c.title} data-case={c.title}>
              <h2 className="text-sm font-semibold text-[var(--ink)]">{c.title}</h2>
              <p className="text-xs text-[var(--ink-soft)]">{c.note}</p>
              <p className="mb-2 font-mono text-[11px] text-[var(--ink-soft)]">
                {spec
                  ? isInteractiveVisual(spec)
                    ? "stays until the student taps Next (auto after 25s)"
                    : `stays on screen ≥ ${(minOnScreenMs(spec, scene?.merge ?? false) / 1000).toFixed(1)}s`
                  : "—"}
              </p>
              <div className="relative h-[280px] overflow-hidden rounded-xl border-2 border-dashed border-[var(--ink-soft)] bg-[var(--ink)]/5">
                {spec ? (
                  <VisualCard visual={spec} scene={scene} />
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
